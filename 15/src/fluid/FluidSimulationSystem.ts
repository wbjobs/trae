import { World, ISystem, EntityId } from '../ecs'
import { Position, Velocity, FluidParticle, PredictedPosition, 
         Density, Pressure, PressureForce, ViscosityForce, 
         CorrectionVelocity, DensityError, Temperature } from './components'
import { FluidConfig, Vec3, HeatConfig } from './config'
import { GPUBufferManager } from './gpuBufferManager'
import { ComputePipelineSystem, HeatSourceData } from './computeSystem'
import { ParticleRenderer } from '../rendering/particleRenderer'

export class FluidSimulationSystem implements ISystem {
  private world: World
  private bufferManager: GPUBufferManager
  private computeSystem: ComputePipelineSystem
  private renderer: ParticleRenderer
  
  private positionsArray: Float32Array
  private velocitiesArray: Float32Array
  private temperaturesArray: Float32Array
  
  private particleCount: number = 0
  private statsElement: HTMLElement | null
  private heatSources: HeatSourceData[] = []
  
  private adaptiveRefinementInterval: number = 30
  private frameCount: number = 0
  
  private temperatureHistory: { avg: number, max: number, min: number }[] = []
  
  constructor(world: World) {
    this.world = world
    this.bufferManager = new GPUBufferManager()
    this.computeSystem = new ComputePipelineSystem(this.bufferManager)
    this.renderer = new ParticleRenderer(this.bufferManager)
    this.statsElement = document.getElementById('stats')
    
    const maxParticles = FluidConfig.maxParticles
    this.positionsArray = new Float32Array(maxParticles * 4)
    this.velocitiesArray = new Float32Array(maxParticles * 4)
    this.temperaturesArray = new Float32Array(maxParticles)
  }
  
  public init(): void {
    this.bufferManager.init()
    this.computeSystem.init()
    this.renderer.init()
    
    this.spawnInitialParticles()
    this.setupDefaultHeatSources()
    this.updateHeatSourcesInPipeline()
  }
  
  private setupDefaultHeatSources(): void {
    this.heatSources = [
      {
        x: 0.3,
        y: 0.0,
        z: 0.0,
        temperature: HeatConfig.sourceTemp,
        radius: 0.2,
        active: true
      },
      {
        x: -0.3,
        y: 0.0,
        z: 0.0,
        temperature: HeatConfig.sinkTemp,
        radius: 0.2,
        active: true
      }
    ]
  }
  
  private spawnInitialParticles(): void {
    const spacing = FluidConfig.smoothingRadius * 0.6
    const countX = 16
    const countY = 15
    const countZ = 16
    
    for (let x = 0; x < countX; x++) {
      for (let y = 0; y < countY; y++) {
        for (let z = 0; z < countZ; z++) {
          const posX = (x - countX / 2) * spacing
          const posY = 0.3 + y * spacing
          const posZ = (z - countZ / 2) * spacing
          
          const initialTemp = this.calculateInitialTemperature([posX, posY, posZ])
          this.createFluidParticle([posX, posY, posZ], [0, 0, 0], initialTemp)
        }
      }
    }
  }
  
  private calculateInitialTemperature(position: Vec3): number {
    const distToSource = Math.sqrt(
      Math.pow(position[0] - 0.3, 2) +
      Math.pow(position[1] - 0.0, 2) +
      Math.pow(position[2] - 0.0, 2)
    )
    
    const distToSink = Math.sqrt(
      Math.pow(position[0] + 0.3, 2) +
      Math.pow(position[1] - 0.0, 2) +
      Math.pow(position[2] - 0.0, 2)
    )
    
    let temp = HeatConfig.referenceTemp
    
    if (distToSource < 0.2) {
      temp = HeatConfig.referenceTemp + (HeatConfig.sourceTemp - HeatConfig.referenceTemp) * 
             (1.0 - distToSource / 0.2)
    }
    
    if (distToSink < 0.2) {
      temp = HeatConfig.referenceTemp - (HeatConfig.referenceTemp - HeatConfig.sinkTemp) * 
             (1.0 - distToSink / 0.2)
    }
    
    return temp
  }
  
  public createFluidParticle(position: Vec3, velocity: Vec3, temperature: number = HeatConfig.referenceTemp): EntityId | null {
    if (this.particleCount >= FluidConfig.maxParticles) {
      return null
    }
    
    const entity = this.world.createEntity()
    this.world.addComponent(entity, FluidParticle)
    this.world.addComponent(entity, Position, new Position(position[0], position[1], position[2]))
    this.world.addComponent(entity, Velocity, new Velocity(velocity[0], velocity[1], velocity[2]))
    this.world.addComponent(entity, PredictedPosition)
    this.world.addComponent(entity, Density)
    this.world.addComponent(entity, Pressure)
    this.world.addComponent(entity, PressureForce)
    this.world.addComponent(entity, ViscosityForce)
    this.world.addComponent(entity, CorrectionVelocity)
    this.world.addComponent(entity, DensityError)
    
    const tempComponent = new Temperature()
    tempComponent.value = temperature
    tempComponent.previousValue = temperature
    this.world.addComponent(entity, Temperature, tempComponent)
    
    this.particleCount++
    this.updateStats()
    
    return entity
  }
  
  public addParticlesAtPosition(position: Vec3, count: number = 10): void {
    for (let i = 0; i < count; i++) {
      const offset: Vec3 = [
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.1
      ]
      const pos: Vec3 = [
        position[0] + offset[0],
        position[1] + offset[1],
        position[2] + offset[2]
      ]
      this.createFluidParticle(pos, [0, 0, 0])
    }
  }
  
  public addHeatSource(x: number, y: number, z: number, temperature: number, radius: number = 0.15): void {
    this.heatSources.push({
      x, y, z,
      temperature,
      radius,
      active: true
    })
    this.updateHeatSourcesInPipeline()
  }
  
  public clearHeatSources(): void {
    this.heatSources = []
    this.updateHeatSourcesInPipeline()
  }
  
  private updateHeatSourcesInPipeline(): void {
    if (this.heatSources.length > 0) {
      this.computeSystem.uploadHeatSources(this.heatSources)
    }
  }
  
  public getParticleCount(): number {
    return this.particleCount
  }
  
  private updateStats(): void {
    if (this.statsElement) {
      this.statsElement.textContent = `粒子数: ${this.particleCount}`
    }
  }
  
  private syncComponentsToBuffers(): void {
    const fluidEntities = this.world.query(FluidParticle, Position, Velocity, Temperature)
    
    for (let i = 0; i < fluidEntities.length && i < FluidConfig.maxParticles; i++) {
      const entity = fluidEntities[i]
      const pos = this.world.getComponent(entity, Position)!
      const vel = this.world.getComponent(entity, Velocity)!
      const temp = this.world.getComponent(entity, Temperature)!
      
      this.positionsArray[i * 4] = pos.x
      this.positionsArray[i * 4 + 1] = pos.y
      this.positionsArray[i * 4 + 2] = pos.z
      this.positionsArray[i * 4 + 3] = 0
      
      this.velocitiesArray[i * 4] = vel.x
      this.velocitiesArray[i * 4 + 1] = vel.y
      this.velocitiesArray[i * 4 + 2] = vel.z
      this.velocitiesArray[i * 4 + 3] = 0
      
      this.temperaturesArray[i] = temp.value
    }
    
    this.bufferManager.uploadPositions(this.positionsArray.subarray(0, fluidEntities.length * 4))
    this.bufferManager.uploadVelocities(this.velocitiesArray.subarray(0, fluidEntities.length * 4))
    this.bufferManager.uploadTemperatures(this.temperaturesArray.subarray(0, fluidEntities.length))
    this.bufferManager.uploadParticleCount(fluidEntities.length)
  }
  
  private async performAdaptiveRefinement(): Promise<void> {
    const gradientBuffer = this.computeSystem.getTemperatureGradientBuffer()
    const tempBuffer = this.computeSystem.getTemperatureBuffer()
    const positionBuffer = this.bufferManager.positionBuffer
    
    const device = this.bufferManager['gpu'].device
    const size = this.particleCount * 4
    
    const gradientReadBuffer = device.createBuffer({
      size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    })
    const positionReadBuffer = device.createBuffer({
      size: this.particleCount * 16,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    })
    const tempReadBuffer = device.createBuffer({
      size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    })
    
    const encoder = device.createCommandEncoder()
    encoder.copyBufferToBuffer(gradientBuffer, 0, gradientReadBuffer, 0, size)
    encoder.copyBufferToBuffer(positionBuffer, 0, positionReadBuffer, 0, this.particleCount * 16)
    encoder.copyBufferToBuffer(tempBuffer, 0, tempReadBuffer, 0, size)
    device.queue.submit([encoder.finish()])
    
    await gradientReadBuffer.mapAsync(GPUMapMode.READ)
    await positionReadBuffer.mapAsync(GPUMapMode.READ)
    await tempReadBuffer.mapAsync(GPUMapMode.READ)
    
    const gradients = new Float32Array(gradientReadBuffer.getMappedRange())
    const positions = new Float32Array(positionReadBuffer.getMappedRange())
    const temps = new Float32Array(tempReadBuffer.getMappedRange())
    
    const particlesToRefine: { pos: Vec3, temp: number }[] = []
    
    for (let i = 0; i < this.particleCount; i++) {
      if (gradients[i] > HeatConfig.tempGradientThreshold && this.particleCount < FluidConfig.maxParticles) {
        particlesToRefine.push({
          pos: [positions[i * 4], positions[i * 4 + 1], positions[i * 4 + 2]],
          temp: temps[i]
        })
      }
    }
    
    gradientReadBuffer.unmap()
    positionReadBuffer.unmap()
    tempReadBuffer.unmap()
    gradientReadBuffer.destroy()
    positionReadBuffer.destroy()
    tempReadBuffer.destroy()
    
    for (const p of particlesToRefine) {
      if (this.particleCount >= FluidConfig.maxParticles) break
      
      const jitter = FluidConfig.smoothingRadius * 0.3
      for (let d = 0; d < 6; d++) {
        if (this.particleCount >= FluidConfig.maxParticles) break
        
        const theta = Math.random() * Math.PI * 2
        const phi = Math.random() * Math.PI
        const r = jitter * Math.random()
        
        const offset: Vec3 = [
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta),
          r * Math.cos(phi)
        ]
        
        const newPos: Vec3 = [p.pos[0] + offset[0], p.pos[1] + offset[1], p.pos[2] + offset[2]]
        this.createFluidParticle(newPos, [0, 0, 0], p.temp)
      }
    }
  }
  
  public update(dt: number): void {
    const dtClamped = Math.min(dt, 0.02)
    
    this.syncComponentsToBuffers()
    this.computeSystem.updateUniforms(dtClamped, this.frameCount % HeatConfig.maxHistorySamples)
    this.computeSystem.step(this.particleCount)
    this.renderer.render(this.particleCount)
    
    this.frameCount++
    
    if (this.frameCount % this.adaptiveRefinementInterval === 0) {
      this.performAdaptiveRefinement()
    }
    
    if (this.frameCount % 10 === 0) {
      this.recordTemperatureStats()
    }
  }
  
  private async recordTemperatureStats(): Promise<void> {
    try {
      const history = await this.bufferManager.readTemperatureHistory()
      const idx = (this.frameCount % HeatConfig.maxHistorySamples) * 4
      
      if (history[idx] > 0) {
        this.temperatureHistory.push({
          avg: history[idx],
          max: history[idx + 1],
          min: history[idx + 2]
        })
        
        if (this.temperatureHistory.length > HeatConfig.maxHistorySamples) {
          this.temperatureHistory.shift()
        }
      }
    } catch (e) {
    }
  }
  
  public getTemperatureHistory(): { avg: number, max: number, min: number }[] {
    return [...this.temperatureHistory]
  }
  
  public printTemperatureReport(): void {
    if (this.temperatureHistory.length === 0) {
      console.log('暂无温度数据')
      return
    }
    
    const latest = this.temperatureHistory[this.temperatureHistory.length - 1]
    console.log(`温度报告 (采样数: ${this.temperatureHistory.length})`)
    console.log(`  当前平均温度: ${latest.avg.toFixed(2)} K (${(latest.avg - 273.15).toFixed(1)} °C)`)
    console.log(`  当前最高温度: ${latest.max.toFixed(2)} K (${(latest.max - 273.15).toFixed(1)} °C)`)
    console.log(`  当前最低温度: ${latest.min.toFixed(2)} K (${(latest.min - 273.15).toFixed(1)} °C)`)
    console.log(`  当前粒子数: ${this.particleCount}`)
  }
  
  public destroy(): void {
    this.renderer.destroy()
    this.computeSystem.destroy()
    this.bufferManager.destroy()
  }
}
