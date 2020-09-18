import React, { Component } from 'react'
import { Rules } from './rules'

import * as twgl from 'twgl.js'

import renderStateVertexShader from './gl/renderStateVertexShader.glsl'
import renderStateFragmentShader from './gl/renderStateFragmentShader.glsl'

import mat3, { Mat3 } from './math/mat3'
import { MouseController } from './mouse'
import BrushSet from './brushSet'
import StateManager from './stateManager'

const { sign, exp, random } = Math

interface CanvasProps {
  width: number, height: number,
  rules?: Rules,
  config: {
    width: number,
    height: number
  },
  running?: boolean
}

export default class Canvas extends Component<CanvasProps> {
  private canvas: React.RefObject<HTMLCanvasElement> = React.createRef()
  private gl: WebGLRenderingContext

  private renderStateProgramInfo: twgl.ProgramInfo

  private vm: Mat3 // view matrix
  private mc: MouseController
  private zoom: boolean = false
  private brushes: BrushSet
  private stateManager: StateManager

  private preparePrograms() {
    this.renderStateProgramInfo = twgl.createProgramInfo(this.gl, [renderStateVertexShader, renderStateFragmentShader])

    const bufferInfo = twgl.createBufferInfoFromArrays(this.gl, {
      a_position: { numComponents: 2, data: [-1, -1, 1, -1, 1, 1, -1, 1] },
      a_texCoords: { numComponents: 2, data: [0, 0, 1, 0, 1, 1, 0, 1] }
    })

    twgl.setBuffersAndAttributes(this.gl, this.renderStateProgramInfo, bufferInfo)

    this.componentDidUpdate()
  }

  componentDidUpdate(oldProps?: Readonly<CanvasProps>) {
    this.vm.setAspectRatio(this.stateManager.size.height / this.props.height * this.props.width / this.stateManager.size.width)

    if (this.props.config.width !== oldProps?.config?.width || this.props.config.height !== oldProps?.config?.height) {
      this.stateManager.resize(this.props.config)
      this.brushes.resize(this.stateManager.size)
    }

    this.stateManager.rules = this.props.rules

    if (!((this.props.running ?? true) || this.mc.draw || this.mc.drag)) this.draw()
  }

  screenToTexture({ x, y }): [number, number] {
    ({ x, y } = this.vm.inverse.vmul({ x, y }))
    return [(x + 1) / 2, (y + 1) / 2]
  }

  private applyBrush() {
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.stateManager.currentState, 0)

    const brushCenter = this.screenToTexture(this.mc.position)
    this.brushes.applyBrush(this.stateManager.previousState, brushCenter)
    this.stateManager.swapStates()
  }

  private draw() {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.props.width, this.props.height);

    this.gl.useProgram(this.renderStateProgramInfo.program)
    twgl.setUniforms(this.renderStateProgramInfo, {
      u_currentState: this.stateManager.currentState,
      u_viewMatrix: this.vm
    })
    this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, 4)
  }

  componentDidMount() {
    this.gl = twgl.getContext(this.canvas.current, {
      alpha: true, antialias: false,
      depth: false, stencil: false,
      desynchronized: false
    })
    const initialCellWidth = 4

    this.stateManager = new StateManager(this.gl, this.props.config)
    this.brushes = new BrushSet(this.gl)
    this.vm = mat3.scale(initialCellWidth * this.stateManager.size.width / this.props.width)

    this.preparePrograms()
    this.brushes.brushSize = 10 / this.stateManager.size.width

    const zoomIntensity = 0.2
    this.mc = new MouseController(this.canvas.current, {
      left: _ => this.brushes.hue = random(),
      drag: e => this.vm.translate(e.normalized_movement),
      zoom: e => {
        this.vm.zoomInto(exp(sign(-e.deltaY) * zoomIntensity), e.normalized)
        this.zoom = true
      }
    })

    const animationLoop = () => {
      if (this.mc.draw || (this.props.running ?? true)) 
        this.stateManager.bindBuffer()
      if (this.props.running ?? true) this.stateManager.step()
      if (this.mc.draw) this.applyBrush()
      if ((this.props.running ?? true) || this.mc.draw || this.mc.drag) this.draw()
      else if (this.zoom) {
        this.draw()
        this.zoom = false
      }

      requestAnimationFrame(animationLoop)
    }
    requestAnimationFrame(animationLoop)
  }

  render() {
    return <canvas
      ref={this.canvas}
      width={this.props.width}
      height={this.props.height}
    />
  }
}