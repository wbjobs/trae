import * as THREE from 'three'

export type WeatherType = 'sunny' | 'cloudy' | 'rainy' | 'snowy'

export interface WeatherSettings {
  type: WeatherType
  transitionSpeed: number
  particleCount: number
}

export class WeatherSystem {
  public group: THREE.Group
  private scene: THREE.Scene
  private currentWeather: WeatherType = 'sunny'
  private targetWeather: WeatherType = 'sunny'
  private transitionProgress: number = 1
  private transitionSpeed: number = 0.5
  
  private rainParticles: THREE.Points | null = null
  private snowParticles: THREE.Points | null = null
  private cloudLayer: THREE.Mesh | null = null
  
  private rainPositions: Float32Array
  private rainVelocities: Float32Array
  private snowPositions: Float32Array
  private snowVelocities: Float32Array
  private snowRotations: Float32Array
  
  private rainIntensity: number = 0
  private snowIntensity: number = 0
  private cloudOpacity: number = 0
  
  private maxRainParticles: number = 1500
  private maxSnowParticles: number = 1000
  private particleRadius: number = 60
  private particleHeight: number = 50

  constructor(scene: THREE.Scene, _camera?: THREE.Camera) {
    this.scene = scene
    this.group = new THREE.Group()
    this.group.name = 'WeatherSystem'
    
    this.rainPositions = new Float32Array(this.maxRainParticles * 3)
    this.rainVelocities = new Float32Array(this.maxRainParticles)
    this.snowPositions = new Float32Array(this.maxSnowParticles * 3)
    this.snowVelocities = new Float32Array(this.maxSnowParticles * 3)
    this.snowRotations = new Float32Array(this.maxSnowParticles * 2)
    
    this.initializeParticles()
    this.initializeClouds()
    
    this.scene.add(this.group)
  }

  private initializeParticles(): void {
    for (let i = 0; i < this.maxRainParticles; i++) {
      const angle = Math.random() * Math.PI * 2
      const radius = Math.random() * this.particleRadius
      this.rainPositions[i * 3] = Math.cos(angle) * radius
      this.rainPositions[i * 3 + 1] = Math.random() * this.particleHeight
      this.rainPositions[i * 3 + 2] = Math.sin(angle) * radius
      this.rainVelocities[i] = -15 - Math.random() * 10
    }
    
    for (let i = 0; i < this.maxSnowParticles; i++) {
      const angle = Math.random() * Math.PI * 2
      const radius = Math.random() * this.particleRadius
      this.snowPositions[i * 3] = Math.cos(angle) * radius
      this.snowPositions[i * 3 + 1] = Math.random() * this.particleHeight
      this.snowPositions[i * 3 + 2] = Math.sin(angle) * radius
      this.snowVelocities[i * 3] = (Math.random() - 0.5) * 2
      this.snowVelocities[i * 3 + 1] = -2 - Math.random() * 3
      this.snowVelocities[i * 3 + 2] = (Math.random() - 0.5) * 2
      this.snowRotations[i * 2] = Math.random() * Math.PI * 2
      this.snowRotations[i * 2 + 1] = (Math.random() - 0.5) * 2
    }
    
    const rainGeometry = new THREE.BufferGeometry()
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3))
    
    const rainMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uOpacity: { value: 0 }
      },
      vertexShader: `
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 1.5 * (200.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float dist = length(uv);
          if (dist > 0.3) discard;
          
          float alpha = uOpacity * (1.0 - dist * 3.33);
          gl_FragColor = vec4(0.7, 0.8, 0.95, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    
    this.rainParticles = new THREE.Points(rainGeometry, rainMaterial)
    this.rainParticles.name = 'RainParticles'
    this.rainParticles.frustumCulled = false
    this.group.add(this.rainParticles)
    
    const snowGeometry = new THREE.BufferGeometry()
    snowGeometry.setAttribute('position', new THREE.BufferAttribute(this.snowPositions, 3))
    
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.6)')
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 32, 32)
    
    const snowTexture = new THREE.CanvasTexture(canvas)
    
    const snowMaterial = new THREE.PointsMaterial({
      size: 1.2,
      map: snowTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    })
    
    this.snowParticles = new THREE.Points(snowGeometry, snowMaterial)
    this.snowParticles.name = 'SnowParticles'
    this.snowParticles.frustumCulled = false
    this.group.add(this.snowParticles)
  }

  private initializeClouds(): void {
    const geometry = new THREE.PlaneGeometry(300, 300, 8, 8)
    geometry.rotateX(-Math.PI / 2)
    
    const positions = geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i)
      const y = positions.getY(i)
      const z = positions.getZ(i)
      positions.setY(i, y + Math.sin(x * 0.08) * Math.cos(z * 0.08) * 3)
    }
    
    const material = new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    })
    
    this.cloudLayer = new THREE.Mesh(geometry, material)
    this.cloudLayer.position.y = 50
    this.cloudLayer.name = 'CloudLayer'
    this.cloudLayer.frustumCulled = false
    this.group.add(this.cloudLayer)
  }

  public setWeather(weather: WeatherType): void {
    if (weather !== this.targetWeather) {
      this.targetWeather = weather
      this.transitionProgress = 0
    }
  }

  public getCurrentWeather(): WeatherType {
    return this.currentWeather
  }

  public update(deltaTime: number, cameraPosition: THREE.Vector3, getTerrainHeight: (x: number, z: number) => number): void {
    if (this.transitionProgress < 1) {
      this.transitionProgress = Math.min(1, this.transitionProgress + deltaTime * this.transitionSpeed)
      
      if (this.transitionProgress >= 1) {
        this.currentWeather = this.targetWeather
      }
    }
    
    const targetRainIntensity = this.targetWeather === 'rainy' ? 1 : 0
    const targetSnowIntensity = this.targetWeather === 'snowy' ? 1 : 0
    const targetCloudOpacity = (this.targetWeather === 'cloudy' || this.targetWeather === 'rainy') ? 0.5 : 
                              (this.targetWeather === 'snowy' ? 0.35 : 0)
    
    this.rainIntensity = THREE.MathUtils.lerp(this.rainIntensity, targetRainIntensity, deltaTime * 2)
    this.snowIntensity = THREE.MathUtils.lerp(this.snowIntensity, targetSnowIntensity, deltaTime * 2)
    this.cloudOpacity = THREE.MathUtils.lerp(this.cloudOpacity, targetCloudOpacity, deltaTime * 2)
    
    if (this.rainIntensity > 0.01) {
      this.updateRain(deltaTime, cameraPosition, getTerrainHeight)
    }
    if (this.snowIntensity > 0.01) {
      this.updateSnow(deltaTime, cameraPosition, getTerrainHeight)
    }
    this.updateClouds(deltaTime, cameraPosition)
  }

  private updateRain(deltaTime: number, cameraPosition: THREE.Vector3, getTerrainHeight: (x: number, z: number) => number): void {
    if (!this.rainParticles) return
    
    const activeCount = Math.floor(this.maxRainParticles * this.rainIntensity)
    const positions = this.rainParticles.geometry.attributes.position as THREE.BufferAttribute
    
    for (let i = 0; i < this.maxRainParticles; i++) {
      if (i >= activeCount) {
        positions.setY(i, -50)
        continue
      }
      
      let px = this.rainPositions[i * 3]
      let py = this.rainPositions[i * 3 + 1]
      let pz = this.rainPositions[i * 3 + 2]
      
      py += this.rainVelocities[i] * deltaTime
      
      const worldX = cameraPosition.x + px
      const worldZ = cameraPosition.z + pz
      const terrainHeight = getTerrainHeight(worldX, worldZ)
      
      if (py < terrainHeight - cameraPosition.y + 0.5 || Math.abs(px) > this.particleRadius || Math.abs(pz) > this.particleRadius) {
        const angle = Math.random() * Math.PI * 2
        const radius = Math.random() * this.particleRadius
        px = Math.cos(angle) * radius
        pz = Math.sin(angle) * radius
        py = this.particleHeight + Math.random() * 10
        this.rainVelocities[i] = -15 - Math.random() * 10
      }
      
      this.rainPositions[i * 3] = px
      this.rainPositions[i * 3 + 1] = py
      this.rainPositions[i * 3 + 2] = pz
      
      positions.setXYZ(i, px, py, pz)
    }
    
    positions.needsUpdate = true
    
    if (this.rainParticles.material instanceof THREE.ShaderMaterial) {
      this.rainParticles.material.uniforms.uOpacity.value = this.rainIntensity * 0.6
    }
    
    this.rainParticles.position.x = cameraPosition.x
    this.rainParticles.position.z = cameraPosition.z
  }

  private updateSnow(deltaTime: number, cameraPosition: THREE.Vector3, getTerrainHeight: (x: number, z: number) => number): void {
    if (!this.snowParticles) return
    
    const activeCount = Math.floor(this.maxSnowParticles * this.snowIntensity)
    const positions = this.snowParticles.geometry.attributes.position as THREE.BufferAttribute
    
    for (let i = 0; i < this.maxSnowParticles; i++) {
      if (i >= activeCount) {
        positions.setY(i, -50)
        continue
      }
      
      let px = this.snowPositions[i * 3]
      let py = this.snowPositions[i * 3 + 1]
      let pz = this.snowPositions[i * 3 + 2]
      
      this.snowRotations[i * 2] += this.snowRotations[i * 2 + 1] * deltaTime
      
      const vx = Math.sin(this.snowRotations[i * 2]) * 0.4
      const vz = Math.cos(this.snowRotations[i * 2]) * 0.4
      
      px += vx * deltaTime
      py += this.snowVelocities[i * 3 + 1] * deltaTime
      pz += vz * deltaTime
      
      const worldX = cameraPosition.x + px
      const worldZ = cameraPosition.z + pz
      const terrainHeight = getTerrainHeight(worldX, worldZ)
      
      if (py < terrainHeight - cameraPosition.y + 0.5 || Math.abs(px) > this.particleRadius || Math.abs(pz) > this.particleRadius) {
        const angle = Math.random() * Math.PI * 2
        const radius = Math.random() * this.particleRadius
        px = Math.cos(angle) * radius
        pz = Math.sin(angle) * radius
        py = this.particleHeight + Math.random() * 10
        this.snowVelocities[i * 3 + 1] = -2 - Math.random() * 3
        this.snowRotations[i * 2] = Math.random() * Math.PI * 2
      }
      
      this.snowPositions[i * 3] = px
      this.snowPositions[i * 3 + 1] = py
      this.snowPositions[i * 3 + 2] = pz
      
      positions.setXYZ(i, px, py, pz)
    }
    
    positions.needsUpdate = true
    
    if (this.snowParticles.material instanceof THREE.PointsMaterial) {
      this.snowParticles.material.opacity = this.snowIntensity * 0.8
    }
    
    this.snowParticles.position.x = cameraPosition.x
    this.snowParticles.position.z = cameraPosition.z
  }

  private updateClouds(deltaTime: number, cameraPosition: THREE.Vector3): void {
    if (!this.cloudLayer) return
    
    this.cloudLayer.position.x = cameraPosition.x
    this.cloudLayer.position.z = cameraPosition.z
    
    if (this.cloudLayer.material instanceof THREE.MeshBasicMaterial) {
      this.cloudLayer.material.opacity = this.cloudOpacity
      
      if (this.targetWeather === 'rainy') {
        this.cloudLayer.material.color.setHex(0x555555)
      } else if (this.targetWeather === 'snowy') {
        this.cloudLayer.material.color.setHex(0xaabbcc)
      } else {
        this.cloudLayer.material.color.setHex(0xcccccc)
      }
    }
    
    this.cloudLayer.rotation.y += deltaTime * 0.005
  }

  public getWeatherIntensities(): { rain: number; snow: number; clouds: number } {
    return {
      rain: this.rainIntensity,
      snow: this.snowIntensity,
      clouds: this.cloudOpacity
    }
  }

  public dispose(): void {
    if (this.rainParticles) {
      this.rainParticles.geometry.dispose()
      if (this.rainParticles.material instanceof THREE.Material) {
        this.rainParticles.material.dispose()
      }
    }
    
    if (this.snowParticles) {
      this.snowParticles.geometry.dispose()
      if (this.snowParticles.material instanceof THREE.Material) {
        this.snowParticles.material.dispose()
      }
    }
    
    if (this.cloudLayer) {
      this.cloudLayer.geometry.dispose()
      if (this.cloudLayer.material instanceof THREE.Material) {
        this.cloudLayer.material.dispose()
      }
    }
    
    if (this.group.parent) {
      this.group.parent.remove(this.group)
    }
  }
}
