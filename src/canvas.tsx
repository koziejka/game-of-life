import React, { Component } from 'react'
import { Rule, createRuleTexture, defaultRules } from './rules'

import * as twgl from 'twgl.js'

import nextStateVertexShader from './gl/nextStateVertexShader.glsl'
import nextStateFragmentShader from './gl/nextStateFragmentShader.glsl'

import renderStateVertexShader from './gl/renderStateVertexShader.glsl'
import renderStateFragmentShader from './gl/renderStateFragmentShader.glsl'

import brushFragmentShader from './gl/brushFragmentShader.glsl'
import brushVertexShader from './gl/brushVertexShader.glsl'

import mat3, { Mat3 } from './math/mat3'
import { MouseController } from './mouse'

const { sign, exp, max, random } = Math

interface CanvasProps {
  width: number, height: number,
  rules?: [Rule, Rule, Rule, Rule, Rule, Rule, Rule, Rule, Rule],
  config: {
    width: number,
    height: number
  }
}

export default class Canvas extends Component<CanvasProps> {
  private canvas: React.RefObject<HTMLCanvasElement> = React.createRef()
  private gl: WebGLRenderingContext

  private nextStateProgramInfo: twgl.ProgramInfo
  private brushProgramInfo: twgl.ProgramInfo
  private renderStateProgramInfo: twgl.ProgramInfo

  private vm: Mat3 // view matrix

  constructor(props: Readonly<CanvasProps>) {
    super(props)
    this.canvas = React.createRef()
  }

  private preparePrograms() {
    this.renderStateProgramInfo = twgl.createProgramInfo(this.gl, [renderStateVertexShader, renderStateFragmentShader])
    this.nextStateProgramInfo = twgl.createProgramInfo(this.gl, [nextStateVertexShader, nextStateFragmentShader])
    this.brushProgramInfo = twgl.createProgramInfo(this.gl, [brushVertexShader, brushFragmentShader])
  }

  componentDidUpdate() {
    const rulesTexture = createRuleTexture(this.gl, this.props.rules ?? defaultRules)
    this.vm.setAspectRatio(this.props.config.height / this.canvas.current.height * this.canvas.current.width / this.props.config.width)

    this.gl.useProgram(this.nextStateProgramInfo.program)
    twgl.setUniforms(this.nextStateProgramInfo, {
      u_rules: rulesTexture,
      u_size: [this.props.config.width, this.props.config.height]
    })
    this.gl.useProgram(this.brushProgramInfo.program)
    twgl.setUniforms(this.brushProgramInfo, {
      u_rules: rulesTexture,
      u_size: [this.props.config.width, this.props.config.height]
    })
  }

  componentDidMount() {
    const canvas = this.canvas.current
    const gl = this.gl = canvas.getContext('webgl')
    let hue = random()

    this.preparePrograms()

    const initialCellWidth = 4
    const initialScale = initialCellWidth * this.props.config.width / canvas.width
    let brushSize = 10 / this.props.config.width

    const bufferInfo = twgl.createBufferInfoFromArrays(gl, {
      a_position: { numComponents: 2, data: [-1, -1, 1, -1, 1, 1, -1, 1] },
      a_texCoords: { numComponents: 2, data: [0, 0, 1, 0, 1, 1, 0, 1] }
    })

    const createState = () => twgl.createTexture(gl, {
      width: this.props.config.width, height: this.props.config.height,
      mag: gl.NEAREST, min: gl.NEAREST,
      wrap: gl.REPEAT
    })

    let currentState = createState()
    let previousState = createState()

    gl.useProgram(this.renderStateProgramInfo.program)
    twgl.setBuffersAndAttributes(gl, this.renderStateProgramInfo, bufferInfo)

    this.vm = mat3.scale(initialScale)
    this.componentDidUpdate()

    const fbi = twgl.createFramebufferInfo(gl, [], this.props.config.width, this.props.config.height) // todo: must resize fb on config change
    const step = () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbi.framebuffer)
      gl.viewport(0, 0, this.props.config.width, this.props.config.height)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, currentState, 0)

      if (mc.draw) {
        gl.useProgram(this.brushProgramInfo.program)
        twgl.setUniforms(this.brushProgramInfo, {
          u_radius: brushSize,
          u_center: screenToTexture(mc.position),
          u_previousState: previousState,
          u_hue: hue
        })
      } else {
        gl.useProgram(this.nextStateProgramInfo.program)
        twgl.setUniforms(this.nextStateProgramInfo, { u_previousState: previousState })
      }
      twgl.drawBufferInfo(gl, bufferInfo, gl.TRIANGLE_FAN)
    }

    const draw = () => {
      step()
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(this.renderStateProgramInfo.program)
      twgl.setUniforms(this.renderStateProgramInfo, {
        u_currentState: currentState,
        u_viewMatrix: this.vm
      })
      twgl.drawBufferInfo(gl, bufferInfo, gl.TRIANGLE_FAN);

      [currentState, previousState] = [previousState, currentState]
      requestAnimationFrame(draw)
    }

    const screenToTexture = ({ x, y }) => {
      ({ x, y } = this.vm.inverse.vmul({ x, y }))
      return [(x + 1) / 2, (y + 1) / 2]
    }

    const zoomIntensity = 0.2
    const mc = new MouseController(canvas, {
      drag: e => this.vm.translate(e.normalized_movement),
      zoom: e => this.vm.zoomInto(exp(sign(-e.deltaY) * zoomIntensity), e.normalized)
    })
    window.addEventListener('mousedown', e => hue = random())

    requestAnimationFrame(draw)
  }

  render() {
    return <canvas
      ref={this.canvas}
      width={this.props.width}
      height={this.props.height}
    />
  }
}