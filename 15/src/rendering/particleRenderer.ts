import { GPUDeviceManager } from '../gpu/device'
import { GPUBufferManager } from '../fluid/gpuBufferManager'
import { HeatConfig } from '../fluid/config'
import renderShaderCode from '../shaders/particleRender.wgsl?raw'

export class ParticleRenderer {
  private gpu: GPUDeviceManager
  private bufferManager: GPUBufferManager
  
  private renderPipeline!: GPURenderPipeline
  private cameraUniformBuffer!: GPUBuffer
  private renderUniformBuffer!: GPUBuffer
  private cameraBindGroup!: GPUBindGroup
  private positionBindGroup!: GPUBindGroup
  private temperatureBindGroup!: GPUBindGroup
  
  private cameraMatrix = new Float32Array(16 * 4 + 4)
  private useTemperatureColoring: boolean = true
  
  constructor(bufferManager: GPUBufferManager) {
    this.gpu = GPUDeviceManager.getInstance()
    this.bufferManager = bufferManager
  }
  
  public init(): void {
    const device = this.gpu.device
    
    this.cameraUniformBuffer = device.createBuffer({
      size: 16 * 4 + 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })
    
    this.renderUniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })
    
    const cameraBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }
      ]
    })
    
    const positionBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }
      ]
    })
    
    const temperatureBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }
      ]
    })
    
    this.cameraBindGroup = device.createBindGroup({
      layout: cameraBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.cameraUniformBuffer } }
      ]
    })
    
    this.positionBindGroup = device.createBindGroup({
      layout: positionBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.bufferManager.positionBuffer } }
      ]
    })
    
    this.temperatureBindGroup = device.createBindGroup({
      layout: temperatureBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.bufferManager.temperatureBuffer } },
        { binding: 1, resource: { buffer: this.renderUniformBuffer } }
      ]
    })
    
    const renderShaderModule = device.createShaderModule({
      code: renderShaderCode
    })
    
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [cameraBindGroupLayout, positionBindGroupLayout, temperatureBindGroupLayout]
    })
    
    this.renderPipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: renderShaderModule,
        entryPoint: 'vs_main'
      },
      fragment: {
        module: renderShaderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.gpu.canvasFormat,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add'
              },
              alpha: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add'
              }
            }
          }
        ]
      },
      primitive: {
        topology: 'triangle-strip'
      }
    })
    
    this.updateRenderUniforms()
  }
  
  private updateRenderUniforms(): void {
    const data = new Float32Array([
      HeatConfig.sinkTemp,
      HeatConfig.referenceTemp,
      HeatConfig.sourceTemp,
      this.useTemperatureColoring ? 1.0 : 0.0
    ])
    this.gpu.queue().writeBuffer(this.renderUniformBuffer, 0, data as unknown as BufferSource)
  }
  
  public setTemperatureColoring(enabled: boolean): void {
    this.useTemperatureColoring = enabled
    this.updateRenderUniforms()
  }
  
  private updateCamera(): void {
    const aspect = window.innerWidth / window.innerHeight
    const fov = 60 * Math.PI / 180
    const near = 0.1
    const far = 100
    
    const f = 1 / Math.tan(fov / 2)
    const nf = 1 / (near - far)
    
    const projMatrix = new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ])
    
    const cameraDist = 4.0
    const angle = Date.now() * 0.0001
    const camX = Math.sin(angle) * cameraDist
    const camZ = Math.cos(angle) * cameraDist
    const camY = 1.0
    
    const viewMatrix = this.lookAt(
      [camX, camY, camZ],
      [0, 0, 0],
      [0, 1, 0]
    )
    
    const viewProj = this.multiplyMatrices(projMatrix, viewMatrix)
    
    for (let i = 0; i < 16; i++) {
      this.cameraMatrix[i] = viewProj[i]
    }
    this.cameraMatrix[16] = camX
    this.cameraMatrix[17] = camY
    this.cameraMatrix[18] = camZ
    this.cameraMatrix[19] = 0
    
    this.gpu.queue().writeBuffer(this.cameraUniformBuffer, 0, this.cameraMatrix)
  }
  
  private lookAt(eye: number[], target: number[], up: number[]): Float32Array {
    const zAxis = this.normalize([
      eye[0] - target[0],
      eye[1] - target[1],
      eye[2] - target[2]
    ])
    const xAxis = this.normalize(this.cross(up, zAxis))
    const yAxis = this.cross(zAxis, xAxis)
    
    return new Float32Array([
      xAxis[0], yAxis[0], zAxis[0], 0,
      xAxis[1], yAxis[1], zAxis[1], 0,
      xAxis[2], yAxis[2], zAxis[2], 0,
      -this.dot(xAxis, eye), -this.dot(yAxis, eye), -this.dot(zAxis, eye), 1
    ])
  }
  
  private normalize(v: number[]): number[] {
    const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2])
    return [v[0]/len, v[1]/len, v[2]/len]
  }
  
  private cross(a: number[], b: number[]): number[] {
    return [
      a[1]*b[2] - a[2]*b[1],
      a[2]*b[0] - a[0]*b[2],
      a[0]*b[1] - a[1]*b[0]
    ]
  }
  
  private dot(a: number[], b: number[]): number {
    return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]
  }
  
  private multiplyMatrices(a: Float32Array, b: Float32Array): Float32Array {
    const result = new Float32Array(16)
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        result[i * 4 + j] = 
          a[i * 4 + 0] * b[0 * 4 + j] +
          a[i * 4 + 1] * b[1 * 4 + j] +
          a[i * 4 + 2] * b[2 * 4 + j] +
          a[i * 4 + 3] * b[3 * 4 + j]
      }
    }
    return result
  }
  
  public render(particleCount: number): void {
    const device = this.gpu.device
    this.updateCamera()
    
    const commandEncoder = device.createCommandEncoder()
    const texture = this.gpu.getCurrentTexture()
    const textureView = texture.createView()
    
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.04, g: 0.04, b: 0.06, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    })
    
    renderPass.setPipeline(this.renderPipeline)
    renderPass.setBindGroup(0, this.cameraBindGroup)
    renderPass.setBindGroup(1, this.positionBindGroup)
    renderPass.setBindGroup(2, this.temperatureBindGroup)
    renderPass.draw(4, particleCount)
    renderPass.end()
    
    device.queue.submit([commandEncoder.finish()])
  }
  
  public destroy(): void {
    this.cameraUniformBuffer.destroy()
    this.renderUniformBuffer.destroy()
  }
}
