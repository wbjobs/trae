import { GPUDeviceManager } from '../gpu/device'
import { FluidConfig, SimConfig } from './config'

export class GPUBufferManager {
  private gpu: GPUDeviceManager
  
  public positionBuffer!: GPUBuffer
  public velocityBuffer!: GPUBuffer
  public predictedPosBuffer!: GPUBuffer
  public densityBuffer!: GPUBuffer
  public pressureBuffer!: GPUBuffer
  public pressureForceBuffer!: GPUBuffer
  public viscosityForceBuffer!: GPUBuffer
  public correctionVelBuffer!: GPUBuffer
  public densityErrorBuffer!: GPUBuffer
  public neighborIndexBuffer!: GPUBuffer
  public neighborCountBuffer!: GPUBuffer
  public uniformBuffer!: GPUBuffer
  public particleCountBuffer!: GPUBuffer
  
  public gridCellIndexBuffer!: GPUBuffer
  public gridCellPrefixSumBuffer!: GPUBuffer
  public sortedIndexBuffer!: GPUBuffer
  public sortedPositionBuffer!: GPUBuffer
  public sortedVelocityBuffer!: GPUBuffer
  public sortedPredictedPosBuffer!: GPUBuffer
  public sortedDensityBuffer!: GPUBuffer
  public sortedPressureBuffer!: GPUBuffer
  public gridCellStartBuffer!: GPUBuffer
  public gridCellEndBuffer!: GPUBuffer
  
  public temperatureBuffer!: GPUBuffer
  public temperaturePrevBuffer!: GPUBuffer
  public temperatureGradientBuffer!: GPUBuffer
  public heatSourceBuffer!: GPUBuffer
  public temperatureHistoryBuffer!: GPUBuffer
  
  public sortedTemperatureBuffer!: GPUBuffer
  
  public stagingBuffer!: GPUBuffer
  
  constructor() {
    this.gpu = GPUDeviceManager.getInstance()
  }
  
  public init(): void {
    const device = this.gpu.device
    const maxParticles = FluidConfig.maxParticles
    const gridSize = SimConfig.bucketCount
    const vec4Size = 4 * 4
    const floatSize = 4
    const uintSize = 4
    
    this.positionBuffer = device.createBuffer({
      size: maxParticles * vec4Size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX
    })
    
    this.velocityBuffer = device.createBuffer({
      size: maxParticles * vec4Size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.predictedPosBuffer = device.createBuffer({
      size: maxParticles * vec4Size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.densityBuffer = device.createBuffer({
      size: maxParticles * floatSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.pressureBuffer = device.createBuffer({
      size: maxParticles * floatSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.pressureForceBuffer = device.createBuffer({
      size: maxParticles * vec4Size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.viscosityForceBuffer = device.createBuffer({
      size: maxParticles * vec4Size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.correctionVelBuffer = device.createBuffer({
      size: maxParticles * vec4Size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.densityErrorBuffer = device.createBuffer({
      size: maxParticles * floatSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.neighborIndexBuffer = device.createBuffer({
      size: maxParticles * 128 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.neighborCountBuffer = device.createBuffer({
      size: maxParticles * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.uniformBuffer = device.createBuffer({
      size: 32 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })
    
    this.particleCountBuffer = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })
    
    this.gridCellIndexBuffer = device.createBuffer({
      size: maxParticles * uintSize * 2,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.gridCellPrefixSumBuffer = device.createBuffer({
      size: gridSize * gridSize * gridSize * uintSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.sortedIndexBuffer = device.createBuffer({
      size: maxParticles * uintSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.sortedPositionBuffer = device.createBuffer({
      size: maxParticles * vec4Size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.sortedVelocityBuffer = device.createBuffer({
      size: maxParticles * vec4Size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.sortedPredictedPosBuffer = device.createBuffer({
      size: maxParticles * vec4Size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.sortedDensityBuffer = device.createBuffer({
      size: maxParticles * floatSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.sortedPressureBuffer = device.createBuffer({
      size: maxParticles * floatSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.gridCellStartBuffer = device.createBuffer({
      size: gridSize * gridSize * gridSize * uintSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.gridCellEndBuffer = device.createBuffer({
      size: gridSize * gridSize * gridSize * uintSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.temperatureBuffer = device.createBuffer({
      size: maxParticles * floatSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.temperaturePrevBuffer = device.createBuffer({
      size: maxParticles * floatSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.temperatureGradientBuffer = device.createBuffer({
      size: maxParticles * floatSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.heatSourceBuffer = device.createBuffer({
      size: 64 * (vec4Size + floatSize),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.temperatureHistoryBuffer = device.createBuffer({
      size: 1024 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
    })
    
    this.sortedTemperatureBuffer = device.createBuffer({
      size: maxParticles * floatSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    
    this.stagingBuffer = device.createBuffer({
      size: maxParticles * vec4Size,
      usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC
    })
  }
  
  public uploadUniforms(data: Float32Array): void {
    this.gpu.queue().writeBuffer(this.uniformBuffer, 0, data as unknown as BufferSource)
  }
  
  public uploadParticleCount(count: number): void {
    const data = new Uint32Array([count])
    this.gpu.queue().writeBuffer(this.particleCountBuffer, 0, data as unknown as BufferSource)
  }
  
  public uploadPositions(positions: Float32Array): void {
    this.gpu.queue().writeBuffer(this.positionBuffer, 0, positions as unknown as BufferSource)
  }
  
  public uploadVelocities(velocities: Float32Array): void {
    this.gpu.queue().writeBuffer(this.velocityBuffer, 0, velocities as unknown as BufferSource)
  }
  
  public uploadTemperatures(temperatures: Float32Array): void {
    this.gpu.queue().writeBuffer(this.temperatureBuffer, 0, temperatures as unknown as BufferSource)
    this.gpu.queue().writeBuffer(this.temperaturePrevBuffer, 0, temperatures as unknown as BufferSource)
  }
  
  public uploadHeatSources(data: Float32Array): void {
    this.gpu.queue().writeBuffer(this.heatSourceBuffer, 0, data as unknown as BufferSource)
  }
  
  public async readTemperatureHistory(): Promise<Float32Array> {
    const device = this.gpu.device
    const size = 1024 * 4
    const readBuffer = device.createBuffer({
      size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    })
    
    const commandEncoder = device.createCommandEncoder()
    commandEncoder.copyBufferToBuffer(
      this.temperatureHistoryBuffer, 0,
      readBuffer, 0,
      size
    )
    device.queue.submit([commandEncoder.finish()])
    
    await readBuffer.mapAsync(GPUMapMode.READ)
    const data = new Float32Array(readBuffer.getMappedRange())
    const result = new Float32Array(data)
    readBuffer.unmap()
    readBuffer.destroy()
    return result
  }
  
  public destroy(): void {
    this.positionBuffer.destroy()
    this.velocityBuffer.destroy()
    this.predictedPosBuffer.destroy()
    this.densityBuffer.destroy()
    this.pressureBuffer.destroy()
    this.pressureForceBuffer.destroy()
    this.viscosityForceBuffer.destroy()
    this.correctionVelBuffer.destroy()
    this.densityErrorBuffer.destroy()
    this.neighborIndexBuffer.destroy()
    this.neighborCountBuffer.destroy()
    this.uniformBuffer.destroy()
    this.particleCountBuffer.destroy()
    
    this.gridCellIndexBuffer.destroy()
    this.gridCellPrefixSumBuffer.destroy()
    this.sortedIndexBuffer.destroy()
    this.sortedPositionBuffer.destroy()
    this.sortedVelocityBuffer.destroy()
    this.sortedPredictedPosBuffer.destroy()
    this.sortedDensityBuffer.destroy()
    this.sortedPressureBuffer.destroy()
    this.gridCellStartBuffer.destroy()
    this.gridCellEndBuffer.destroy()
    
    this.temperatureBuffer.destroy()
    this.temperaturePrevBuffer.destroy()
    this.temperatureGradientBuffer.destroy()
    this.heatSourceBuffer.destroy()
    this.temperatureHistoryBuffer.destroy()
    this.sortedTemperatureBuffer.destroy()
    
    this.stagingBuffer.destroy()
  }
}
