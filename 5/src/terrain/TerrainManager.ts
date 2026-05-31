import * as THREE from 'three'
import { TerrainChunk, TerrainConfig, WeatherInfluence } from './TerrainChunk'
import { SimplexNoise } from '../utils/Noise'

export class TerrainManager {
  public chunks: Map<string, TerrainChunk> = new Map()
  public group: THREE.Group
  private config: TerrainConfig
  private noise: SimplexNoise
  private viewDistance: number
  private chunkSize: number
  private lastChunkUpdate: number = 0
  private chunkUpdateInterval: number = 200
  private snowAccumulation: number = 0
  private elapsedTime: number = 0

  constructor(config: TerrainConfig, viewDistance: number = 3) {
    this.config = config
    this.noise = new SimplexNoise(config.seed)
    this.chunkSize = config.size
    this.viewDistance = Math.min(viewDistance, 5)
    this.group = new THREE.Group()
    this.group.name = 'Terrain'
  }

  public generateChunks(centerX: number = 0, centerZ: number = 0): void {
    for (const [, chunk] of this.chunks) {
      this.group.remove(chunk.mesh)
      chunk.dispose()
    }
    this.chunks.clear()

    const centerChunkX = Math.floor(centerX / this.chunkSize) * this.chunkSize
    const centerChunkZ = Math.floor(centerZ / this.chunkSize) * this.chunkSize

    for (let z = -this.viewDistance; z <= this.viewDistance; z++) {
      for (let x = -this.viewDistance; x <= this.viewDistance; x++) {
        const chunkX = centerChunkX + x * this.chunkSize
        const chunkZ = centerChunkZ + z * this.chunkSize
        const key = this.getChunkKey(chunkX, chunkZ)
        
        const dist = Math.max(Math.abs(x), Math.abs(z))
        const lodLevel = this.getLODLevel(dist)
        
        const chunk = new TerrainChunk(
          this.config,
          this.noise,
          new THREE.Vector2(chunkX, chunkZ),
          lodLevel
        )
        
        this.chunks.set(key, chunk)
        this.group.add(chunk.mesh)
      }
    }
  }

  public updateChunks(cameraPosition: THREE.Vector3, force: boolean = false): void {
    const now = performance.now()
    if (!force && now - this.lastChunkUpdate < this.chunkUpdateInterval) {
      return
    }
    this.lastChunkUpdate = now

    const centerChunkX = Math.floor(cameraPosition.x / this.chunkSize) * this.chunkSize
    const centerChunkZ = Math.floor(cameraPosition.z / this.chunkSize) * this.chunkSize

    const neededChunks: Set<string> = new Set()
    
    for (let z = -this.viewDistance; z <= this.viewDistance; z++) {
      for (let x = -this.viewDistance; x <= this.viewDistance; x++) {
        const chunkX = centerChunkX + x * this.chunkSize
        const chunkZ = centerChunkZ + z * this.chunkSize
        const key = this.getChunkKey(chunkX, chunkZ)
        neededChunks.add(key)

        if (!this.chunks.has(key)) {
          const dist = Math.max(Math.abs(x), Math.abs(z))
          const lodLevel = this.getLODLevel(dist)
          
          const chunk = new TerrainChunk(
            this.config,
            this.noise,
            new THREE.Vector2(chunkX, chunkZ),
            lodLevel
          )
          this.chunks.set(key, chunk)
          this.group.add(chunk.mesh)
        }
      }
    }

    for (const [key, chunk] of this.chunks) {
      if (!neededChunks.has(key)) {
        this.group.remove(chunk.mesh)
        chunk.dispose()
        this.chunks.delete(key)
      } else {
        if (chunk.updateLOD(cameraPosition)) {
          chunk.regenerate()
        }
      }
    }
  }

  public updateWeather(influence: { rain: number; snow: number }): void {
    const weatherInfluence: WeatherInfluence = {
      rain: influence.rain,
      snow: influence.snow,
      snowAccumulation: this.snowAccumulation
    }

    if (influence.snow > 0.5) {
      this.snowAccumulation = Math.min(1, this.snowAccumulation + 0.001)
    } else if (influence.rain > 0.3 && this.snowAccumulation > 0) {
      this.snowAccumulation = Math.max(0, this.snowAccumulation - 0.0005)
    }

    for (const chunk of this.chunks.values()) {
      chunk.updateWeatherInfluence(weatherInfluence)
    }
  }

  public updateTime(deltaTime: number): void {
    this.elapsedTime += deltaTime
    for (const chunk of this.chunks.values()) {
      chunk.updateTime(this.elapsedTime)
    }
  }

  public getHeightAt(worldX: number, worldZ: number): number {
    const chunkX = Math.floor(worldX / this.chunkSize) * this.chunkSize
    const chunkZ = Math.floor(worldZ / this.chunkSize) * this.chunkSize
    const key = this.getChunkKey(chunkX, chunkZ)
    
    const chunk = this.chunks.get(key)
    if (chunk) {
      return chunk.getHeightAt(worldX, worldZ)
    }
    
    let minHeight = Infinity
    for (const c of this.chunks.values()) {
      const h = c.getHeightAt(worldX, worldZ)
      if (h !== -Infinity && h < minHeight) {
        minHeight = h
      }
    }
    
    return minHeight === Infinity ? 0 : minHeight
  }

  public regenerate(config?: Partial<TerrainConfig>): void {
    if (config) {
      this.config = { ...this.config, ...config }
    }
    
    if (config?.seed !== undefined) {
      this.noise = new SimplexNoise(config.seed)
    }

    const positions: { x: number; z: number }[] = []
    for (const [, chunk] of this.chunks) {
      positions.push({ x: chunk.mesh.position.x, z: chunk.mesh.position.z })
    }

    for (const [, chunk] of this.chunks) {
      this.group.remove(chunk.mesh)
      chunk.dispose()
    }
    this.chunks.clear()

    for (const pos of positions) {
      const chunkX = pos.x - this.chunkSize / 2
      const chunkZ = pos.z - this.chunkSize / 2
      const key = this.getChunkKey(chunkX, chunkZ)
      
      const chunk = new TerrainChunk(
        this.config,
        this.noise,
        new THREE.Vector2(chunkX, chunkZ)
      )
      
      this.chunks.set(key, chunk)
      this.group.add(chunk.mesh)
    }
  }

  private getChunkKey(x: number, z: number): string {
    return `${x},${z}`
  }

  private getLODLevel(dist: number): number {
    if (dist <= 1) return 0
    if (dist <= 2) return 1
    if (dist <= 3) return 2
    if (dist <= 4) return 3
    return 4
  }

  public setViewDistance(distance: number): void {
    this.viewDistance = Math.min(Math.max(1, distance), 6)
  }

  public getSnowAccumulation(): number {
    return this.snowAccumulation
  }

  public dispose(): void {
    for (const [, chunk] of this.chunks) {
      chunk.dispose()
    }
    this.chunks.clear()
  }
}
