import { GPUDeviceManager } from '../gpu/device'
import { GPUBufferManager } from './gpuBufferManager'
import { FluidConfig, SimConfig, HeatConfig } from './config'
import computeShaderCode from '../shaders/fluidCompute.wgsl?raw'

export interface HeatSourceData {
  x: number
  y: number
  z: number
  temperature: number
  radius: number
  active: boolean
}

export class ComputePipelineSystem {
  private gpu: GPUDeviceManager
  private bufferManager: GPUBufferManager
  
  private computeShaderModule!: GPUShaderModule
  
  private bindGroupLayout0!: GPUBindGroupLayout
  private bindGroupLayout1!: GPUBindGroupLayout
  private bindGroupLayout2!: GPUBindGroupLayout
  private bindGroup0!: GPUBindGroup
  private bindGroup1!: GPUBindGroup
  private bindGroup2!: GPUBindGroup
  
  private predictPipeline!: GPUComputePipeline
  private computeGridCellPipeline!: GPUComputePipeline
  private initGridCellCountersPipeline!: GPUComputePipeline
  private countParticlesInCellsPipeline!: GPUComputePipeline
  private computeGridCellStartEndPipeline!: GPUComputePipeline
  private sortParticlesPipeline!: GPUComputePipeline
  private densityPipeline!: GPUComputePipeline
  private pressurePipeline!: GPUComputePipeline
  private pressureForcePipeline!: GPUComputePipeline
  private viscosityForcePipeline!: GPUComputePipeline
  private correctionVelPipeline!: GPUComputePipeline
  private integratePipeline!: GPUComputePipeline
  private resetCorrPipeline!: GPUComputePipeline
  
  private saveTempPipeline!: GPUComputePipeline
  private applyHeatSourcesPipeline!: GPUComputePipeline
  private heatConductionPipeline!: GPUComputePipeline
  private tempGradientPipeline!: GPUComputePipeline
  private recordHistoryPipeline!: GPUComputePipeline
  
  private heatUniformsBuffer!: GPUBuffer
  private currentHistoryIndex = 0
  
  constructor(bufferManager: GPUBufferManager) {
    this.gpu = GPUDeviceManager.getInstance()
    this.bufferManager = bufferManager
  }
  
  public init(): void {
    const device = this.gpu.device
    
    this.computeShaderModule = device.createShaderModule({
      code: computeShaderCode
    })
    
    this.heatUniformsBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })
    
    this.createBindGroupLayouts()
    this.createBindGroups()
    this.createPipelines()
  }
  
  private createBindGroupLayouts(): void {
    const device = this.gpu.device
    
    this.bindGroupLayout0 = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 10, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ]
    })
    
    this.bindGroupLayout1 = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 10, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ]
    })
    
    this.bindGroupLayout2 = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ]
    })
  }
  
  private createBindGroups(): void {
    const device = this.gpu.device
    
    this.bindGroup0 = device.createBindGroup({
      layout: this.bindGroupLayout0,
      entries: [
        { binding: 0, resource: { buffer: this.bufferManager.uniformBuffer } },
        { binding: 1, resource: { buffer: this.bufferManager.particleCountBuffer } },
        { binding: 2, resource: { buffer: this.bufferManager.positionBuffer } },
        { binding: 3, resource: { buffer: this.bufferManager.velocityBuffer } },
        { binding: 4, resource: { buffer: this.bufferManager.predictedPosBuffer } },
        { binding: 5, resource: { buffer: this.bufferManager.densityBuffer } },
        { binding: 6, resource: { buffer: this.bufferManager.pressureBuffer } },
        { binding: 7, resource: { buffer: this.bufferManager.pressureForceBuffer } },
        { binding: 8, resource: { buffer: this.bufferManager.viscosityForceBuffer } },
        { binding: 9, resource: { buffer: this.bufferManager.correctionVelBuffer } },
        { binding: 10, resource: { buffer: this.bufferManager.densityErrorBuffer } },
      ]
    })
    
    this.bindGroup1 = device.createBindGroup({
      layout: this.bindGroupLayout1,
      entries: [
        { binding: 0, resource: { buffer: this.bufferManager.gridCellIndexBuffer } },
        { binding: 1, resource: { buffer: this.bufferManager.gridCellPrefixSumBuffer } },
        { binding: 2, resource: { buffer: this.bufferManager.sortedIndexBuffer } },
        { binding: 3, resource: { buffer: this.bufferManager.sortedPositionBuffer } },
        { binding: 4, resource: { buffer: this.bufferManager.sortedVelocityBuffer } },
        { binding: 5, resource: { buffer: this.bufferManager.sortedPredictedPosBuffer } },
        { binding: 6, resource: { buffer: this.bufferManager.sortedDensityBuffer } },
        { binding: 7, resource: { buffer: this.bufferManager.sortedPressureBuffer } },
        { binding: 8, resource: { buffer: this.bufferManager.gridCellStartBuffer } },
        { binding: 9, resource: { buffer: this.bufferManager.gridCellEndBuffer } },
        { binding: 10, resource: { buffer: this.bufferManager.sortedTemperatureBuffer } },
      ]
    })
    
    this.bindGroup2 = device.createBindGroup({
      layout: this.bindGroupLayout2,
      entries: [
        { binding: 0, resource: { buffer: this.bufferManager.temperatureBuffer } },
        { binding: 1, resource: { buffer: this.bufferManager.temperaturePrevBuffer } },
        { binding: 2, resource: { buffer: this.bufferManager.temperatureGradientBuffer } },
        { binding: 3, resource: { buffer: this.bufferManager.heatSourceBuffer } },
        { binding: 4, resource: { buffer: this.bufferManager.temperatureHistoryBuffer } },
        { binding: 5, resource: { buffer: this.heatUniformsBuffer } },
      ]
    })
  }
  
  private createPipelines(): void {
    const device = this.gpu.device
    
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout0, this.bindGroupLayout1, this.bindGroupLayout2]
    })
    
    const createPipeline = (entryPoint: string) => {
      return device.createComputePipeline({
        layout: pipelineLayout,
        compute: {
          module: this.computeShaderModule,
          entryPoint
        }
      })
    }
    
    this.predictPipeline = createPipeline('predictPosition')
    this.computeGridCellPipeline = createPipeline('computeGridCellIndices')
    this.initGridCellCountersPipeline = createPipeline('initGridCellCounters')
    this.countParticlesInCellsPipeline = createPipeline('countParticlesInCells')
    this.computeGridCellStartEndPipeline = createPipeline('computeGridCellStartEnd')
    this.sortParticlesPipeline = createPipeline('sortParticlesByCell')
    this.densityPipeline = createPipeline('computeDensity')
    this.pressurePipeline = createPipeline('computePressure')
    this.pressureForcePipeline = createPipeline('computePressureForce')
    this.viscosityForcePipeline = createPipeline('computeViscosityForce')
    this.correctionVelPipeline = createPipeline('computeCorrectionVelocity')
    this.integratePipeline = createPipeline('integrateAndEnforceBoundary')
    this.resetCorrPipeline = createPipeline('resetCorrectionVelocities')
    
    this.saveTempPipeline = createPipeline('savePreviousTemperatures')
    this.applyHeatSourcesPipeline = createPipeline('applyHeatSources')
    this.heatConductionPipeline = createPipeline('computeHeatConductionImplicit')
    this.tempGradientPipeline = createPipeline('computeTemperatureGradient')
    this.recordHistoryPipeline = createPipeline('recordTemperatureHistory')
  }
  
  public updateUniforms(dt: number, historyIndex?: number): void {
    const gridSize = SimConfig.bucketCount
    const uniforms = new Float32Array(32)
    uniforms[0] = FluidConfig.smoothingRadius
    uniforms[1] = FluidConfig.particleMass
    uniforms[2] = FluidConfig.restDensity
    uniforms[3] = FluidConfig.viscosityCoeff
    uniforms[4] = FluidConfig.gravity
    uniforms[5] = dt
    uniforms[6] = FluidConfig.stiffness
    uniforms[7] = FluidConfig.boundaryDamping
    uniforms[8] = SimConfig.boundaryMin[0]
    uniforms[9] = SimConfig.boundaryMin[1]
    uniforms[10] = SimConfig.boundaryMin[2]
    uniforms[11] = SimConfig.boundaryMax[0]
    uniforms[12] = SimConfig.boundaryMax[1]
    uniforms[13] = SimConfig.boundaryMax[2]
    uniforms[14] = SimConfig.gridSize
    uniforms[18] = HeatConfig.thermalConductivity
    uniforms[19] = HeatConfig.specificHeat
    uniforms[20] = HeatConfig.tempGradientThreshold
    
    const uniformsUint = new Uint32Array(uniforms.buffer)
    uniformsUint[16] = gridSize
    uniformsUint[17] = historyIndex ?? this.currentHistoryIndex
    
    this.bufferManager.uploadUniforms(uniforms)
  }
  
  public uploadHeatSources(sources: HeatSourceData[]): void {
    const data = new Float32Array(sources.length * 8)
    const dataUint = new Uint32Array(data.buffer)
    
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i]
      const base = i * 8
      data[base] = src.x
      data[base + 1] = src.y
      data[base + 2] = src.z
      data[base + 3] = 0.0
      data[base + 4] = src.temperature
      data[base + 5] = src.radius
      dataUint[base + 6] = src.active ? 1 : 0
    }
    
    this.bufferManager.uploadHeatSources(data)
    
    const heatUniformsData = new Uint32Array([sources.length, 0, 0, 0])
    this.gpu.queue().writeBuffer(this.heatUniformsBuffer, 0, heatUniformsData as unknown as BufferSource)
  }
  
  public getTemperatureGradientBuffer(): GPUBuffer {
    return this.bufferManager.temperatureGradientBuffer
  }
  
  public getTemperatureBuffer(): GPUBuffer {
    return this.bufferManager.temperatureBuffer
  }
  
  public getTemperatureHistoryBuffer(): GPUBuffer {
    return this.bufferManager.temperatureHistoryBuffer
  }
  
  public incrementHistoryIndex(): number {
    this.currentHistoryIndex = (this.currentHistoryIndex + 1) % HeatConfig.maxHistorySamples
    return this.currentHistoryIndex
  }
  
  public step(particleCount: number): void {
    const device = this.gpu.device
    const passEncoder = device.createCommandEncoder()
    
    const workgroupCount = Math.ceil(particleCount / 256)
    const gridCellCount = SimConfig.bucketCount * SimConfig.bucketCount * SimConfig.bucketCount
    const gridWorkgroupCount = Math.ceil(gridCellCount / 256)
    
    this.dispatchCompute(passEncoder, this.predictPipeline, workgroupCount)
    this.dispatchCompute(passEncoder, this.computeGridCellPipeline, workgroupCount)
    this.dispatchCompute(passEncoder, this.initGridCellCountersPipeline, gridWorkgroupCount)
    this.dispatchCompute(passEncoder, this.countParticlesInCellsPipeline, workgroupCount)
    this.dispatchCompute(passEncoder, this.computeGridCellStartEndPipeline, gridWorkgroupCount)
    this.dispatchCompute(passEncoder, this.sortParticlesPipeline, workgroupCount)
    this.dispatchCompute(passEncoder, this.densityPipeline, workgroupCount)
    
    for (let i = 0; i < FluidConfig.maxCorrections; i++) {
      this.dispatchCompute(passEncoder, this.pressurePipeline, workgroupCount)
      this.dispatchCompute(passEncoder, this.pressureForcePipeline, workgroupCount)
      this.dispatchCompute(passEncoder, this.correctionVelPipeline, workgroupCount)
    }
    
    this.dispatchCompute(passEncoder, this.viscosityForcePipeline, workgroupCount)
    this.dispatchCompute(passEncoder, this.integratePipeline, workgroupCount)
    this.dispatchCompute(passEncoder, this.resetCorrPipeline, workgroupCount)
    
    this.dispatchCompute(passEncoder, this.saveTempPipeline, workgroupCount)
    this.dispatchCompute(passEncoder, this.applyHeatSourcesPipeline, workgroupCount)
    this.dispatchCompute(passEncoder, this.heatConductionPipeline, workgroupCount)
    this.dispatchCompute(passEncoder, this.tempGradientPipeline, workgroupCount)
    this.dispatchCompute(passEncoder, this.recordHistoryPipeline, workgroupCount)
    
    device.queue.submit([passEncoder.finish()])
  }
  
  private dispatchCompute(
    passEncoder: GPUCommandEncoder,
    pipeline: GPUComputePipeline,
    workgroupCount: number
  ): void {
    const pass = passEncoder.beginComputePass()
    pass.setPipeline(pipeline)
    pass.setBindGroup(0, this.bindGroup0)
    pass.setBindGroup(1, this.bindGroup1)
    pass.setBindGroup(2, this.bindGroup2)
    pass.dispatchWorkgroups(workgroupCount)
    pass.end()
  }
  
  public destroy(): void {
    if (this.heatUniformsBuffer) {
      this.heatUniformsBuffer.destroy()
    }
  }
}
