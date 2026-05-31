import * as THREE from 'three'

export interface LightingSettings {
  timeOfDay: number
  fogDensity: number
  exposure: number
}

export class LightingSystem {
  public group: THREE.Group
  private scene: THREE.Scene
  
  private sunLight: THREE.DirectionalLight
  private ambientLight: THREE.AmbientLight
  private hemisphereLight: THREE.HemisphereLight
  
  private sunMesh: THREE.Mesh
  private sunGlow: THREE.Mesh
  
  private currentTime: number = 12
  private targetTime: number = 12
  
  private fogColor: THREE.Color = new THREE.Color(0x87ceeb)
  private skyColor: THREE.Color = new THREE.Color(0x87ceeb)
  private sunColor: THREE.Color = new THREE.Color(0xffffff)
  private ambientColor: THREE.Color = new THREE.Color(0x404040)

  constructor(scene: THREE.Scene, _renderer?: THREE.WebGLRenderer) {
    this.scene = scene
    this.group = new THREE.Group()
    this.group.name = 'LightingSystem'
    
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1)
    this.sunLight.castShadow = true
    this.sunLight.shadow.mapSize.width = 2048
    this.sunLight.shadow.mapSize.height = 2048
    this.sunLight.shadow.camera.near = 0.5
    this.sunLight.shadow.camera.far = 500
    this.sunLight.shadow.camera.left = -100
    this.sunLight.shadow.camera.right = 100
    this.sunLight.shadow.camera.top = 100
    this.sunLight.shadow.camera.bottom = -100
    this.sunLight.shadow.bias = -0.0005
    this.group.add(this.sunLight)
    
    this.ambientLight = new THREE.AmbientLight(0x404040, 0.3)
    this.group.add(this.ambientLight)
    
    this.hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x3d5c3d, 0.4)
    this.group.add(this.hemisphereLight)
    
    const sunGeometry = new THREE.SphereGeometry(5, 32, 32)
    const sunMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xfff4c2,
      transparent: true,
      opacity: 1
    })
    this.sunMesh = new THREE.Mesh(sunGeometry, sunMaterial)
    this.group.add(this.sunMesh)
    
    const glowGeometry = new THREE.SphereGeometry(15, 32, 32)
    const glowMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xfff4c2,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide
    })
    this.sunGlow = new THREE.Mesh(glowGeometry, glowMaterial)
    this.group.add(this.sunGlow)
    
    this.scene.add(this.group)
    this.setTimeOfDay(12)
  }

  public setTimeOfDay(time: number): void {
    this.targetTime = time
  }

  public getTimeOfDay(): number {
    return this.currentTime
  }

  public setFogDensity(density: number): void {
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = density
    } else {
      this.scene.fog = new THREE.FogExp2(this.fogColor, density)
    }
  }

  public update(deltaTime: number, cameraPosition: THREE.Vector3, weatherIntensities: { rain: number; snow: number; clouds: number }): void {
    const timeDiff = this.targetTime - this.currentTime
    if (Math.abs(timeDiff) > 0.01) {
      this.currentTime += timeDiff * Math.min(1, deltaTime * 0.5)
    }
    
    this.updateSunPosition(cameraPosition)
    this.updateLightingColors(weatherIntensities)
    this.updateFog(weatherIntensities)
    this.updateSkyColor(weatherIntensities)
  }

  private updateSunPosition(cameraPosition: THREE.Vector3): void {
    const normalizedTime = (this.currentTime - 6) / 12
    const angle = normalizedTime * Math.PI
    
    const sunDistance = 200
    const sunX = Math.cos(angle) * sunDistance
    const sunY = Math.sin(angle) * sunDistance
    
    this.sunLight.position.set(
      cameraPosition.x + sunX,
      Math.max(sunY, -50),
      cameraPosition.z - 50
    )
    
    this.sunLight.target.position.set(cameraPosition.x, 0, cameraPosition.z)
    this.sunLight.target.updateMatrixWorld()
    
    this.sunMesh.position.copy(this.sunLight.position)
    this.sunGlow.position.copy(this.sunLight.position)
    
    const sunIntensity = Math.max(0, Math.sin(angle))
    this.sunLight.intensity = sunIntensity * 1.5
    
    if (this.sunMesh.material instanceof THREE.MeshBasicMaterial) {
      this.sunMesh.material.opacity = Math.max(0, sunIntensity - 0.1) * 2
    }
    if (this.sunGlow.material instanceof THREE.MeshBasicMaterial) {
      this.sunGlow.material.opacity = Math.max(0, sunIntensity - 0.1) * 0.5
    }
  }

  private updateLightingColors(weatherIntensities: { rain: number; snow: number; clouds: number }): void {
    const time = this.currentTime
    const weatherFactor = 1 - (weatherIntensities.rain + weatherIntensities.snow) * 0.3 - weatherIntensities.clouds * 0.2
    
    let sunriseColor = new THREE.Color(0xff8c42)
    let noonColor = new THREE.Color(0xfff4c2)
    let sunsetColor = new THREE.Color(0xff6b35)
    let nightColor = new THREE.Color(0x1a1a2e)
    
    if (time < 6) {
      this.sunColor.copy(nightColor)
      this.ambientColor.setHex(0x101015)
    } else if (time < 8) {
      const t = (time - 6) / 2
      this.sunColor.lerpColors(nightColor, sunriseColor, t)
      this.ambientColor.lerpColors(new THREE.Color(0x101015), new THREE.Color(0x403020), t)
    } else if (time < 10) {
      const t = (time - 8) / 2
      this.sunColor.lerpColors(sunriseColor, noonColor, t)
      this.ambientColor.lerpColors(new THREE.Color(0x403020), new THREE.Color(0x606060), t)
    } else if (time < 14) {
      this.sunColor.copy(noonColor)
      this.ambientColor.setHex(0x606060)
    } else if (time < 16) {
      const t = (time - 14) / 2
      this.sunColor.lerpColors(noonColor, sunsetColor, t)
      this.ambientColor.lerpColors(new THREE.Color(0x606060), new THREE.Color(0x403020), t)
    } else if (time < 18) {
      const t = (time - 16) / 2
      this.sunColor.lerpColors(sunsetColor, nightColor, t)
      this.ambientColor.lerpColors(new THREE.Color(0x403020), new THREE.Color(0x101015), t)
    } else {
      this.sunColor.copy(nightColor)
      this.ambientColor.setHex(0x101015)
    }
    
    const weatherGray = new THREE.Color(0x888888)
    this.sunColor.lerp(weatherGray, (1 - weatherFactor) * 0.5)
    
    this.sunLight.color.copy(this.sunColor)
    this.ambientLight.color.copy(this.ambientColor)
    
    if (this.sunMesh.material instanceof THREE.MeshBasicMaterial) {
      this.sunMesh.material.color.copy(this.sunColor)
    }
    if (this.sunGlow.material instanceof THREE.MeshBasicMaterial) {
      this.sunGlow.material.color.copy(this.sunColor)
    }
  }

  private updateFog(weatherIntensities: { rain: number; snow: number; clouds: number }): void {
    const time = this.currentTime
    
    let baseFogColor: THREE.Color
    if (time < 6 || time > 18) {
      baseFogColor = new THREE.Color(0x0a0a15)
    } else if (time < 8 || time > 16) {
      baseFogColor = new THREE.Color(0x6b5c4a)
    } else {
      baseFogColor = new THREE.Color(0x87ceeb)
    }
    
    const rainFogColor = new THREE.Color(0x4a5568)
    const snowFogColor = new THREE.Color(0xe0e5eb)
    const cloudFogColor = new THREE.Color(0x8899aa)
    
    this.fogColor.copy(baseFogColor)
    
    if (weatherIntensities.rain > 0) {
      this.fogColor.lerp(rainFogColor, weatherIntensities.rain * 0.8)
    }
    if (weatherIntensities.snow > 0) {
      this.fogColor.lerp(snowFogColor, weatherIntensities.snow * 0.9)
    }
    if (weatherIntensities.clouds > 0) {
      this.fogColor.lerp(cloudFogColor, weatherIntensities.clouds * 0.5)
    }
    
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.fogColor)
    }
  }

  private updateSkyColor(weatherIntensities: { rain: number; snow: number; clouds: number }): void {
    const time = this.currentTime
    
    let baseSkyColor: THREE.Color
    if (time < 6 || time > 20) {
      baseSkyColor = new THREE.Color(0x0a0a15)
    } else if (time < 7 || time > 19) {
      baseSkyColor = new THREE.Color(0x4a3f5c)
    } else if (time < 8 || time > 18) {
      baseSkyColor = new THREE.Color(0xff8c42)
    } else {
      baseSkyColor = new THREE.Color(0x87ceeb)
    }
    
    const overcastColor = new THREE.Color(0x6b7280)
    const rainColor = new THREE.Color(0x374151)
    const snowColor = new THREE.Color(0xd1d5db)
    
    this.skyColor.copy(baseSkyColor)
    
    const totalWeatherEffect = weatherIntensities.clouds * 0.5 + 
                                weatherIntensities.rain * 0.7 + 
                                weatherIntensities.snow * 0.8
    
    if (weatherIntensities.rain > 0) {
      this.skyColor.lerp(rainColor, weatherIntensities.rain * 0.9)
    } else if (weatherIntensities.snow > 0) {
      this.skyColor.lerp(snowColor, weatherIntensities.snow * 0.7)
    } else if (weatherIntensities.clouds > 0) {
      this.skyColor.lerp(overcastColor, weatherIntensities.clouds * 0.6)
    }
    
    this.scene.background = this.skyColor
    
    this.hemisphereLight.color.copy(this.skyColor)
    this.hemisphereLight.groundColor.setHex(0x2d4a2d)
    this.hemisphereLight.intensity = 0.3 + (1 - totalWeatherEffect * 0.5) * 0.3
  }

  public getSunDirection(): THREE.Vector3 {
    return new THREE.Vector3().subVectors(
      this.sunLight.target.position,
      this.sunLight.position
    ).normalize()
  }

  public dispose(): void {
    this.sunLight.dispose()
    this.ambientLight.dispose()
    this.hemisphereLight.dispose()
    
    this.sunMesh.geometry.dispose()
    if (this.sunMesh.material instanceof THREE.Material) {
      this.sunMesh.material.dispose()
    }
    
    this.sunGlow.geometry.dispose()
    if (this.sunGlow.material instanceof THREE.Material) {
      this.sunGlow.material.dispose()
    }
    
    if (this.group.parent) {
      this.group.parent.remove(this.group)
    }
  }
}
