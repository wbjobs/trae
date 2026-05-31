import * as THREE from 'three'
import { TerrainManager } from './terrain/TerrainManager'
import { TerrainConfig } from './terrain/TerrainChunk'
import { WeatherSystem, WeatherType } from './weather/WeatherSystem'
import { LightingSystem } from './lighting/LightingSystem'
import { FirstPersonControls } from './controls/FirstPersonControls'
import { InputHandler } from './controls/InputHandler'
import { TimeSystem } from './time/TimeSystem'

class Game {
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private clock: THREE.Clock
  
  private terrainManager: TerrainManager
  private weatherSystem: WeatherSystem
  private lightingSystem: LightingSystem
  private controls: FirstPersonControls
  private inputHandler: InputHandler
  private timeSystem: TimeSystem
  
  private terrainConfig: TerrainConfig = {
    size: 100,
    resolution: 64,
    maxHeight: 30,
    roughness: 4,
    octaves: 5,
    seed: Math.random() * 10000
  }

  constructor() {
    this.scene = new THREE.Scene()
    this.clock = new THREE.Clock()
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    this.camera.position.set(0, 50, 0)
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false
    })
    this.timeSystem = new TimeSystem()
    
    this.setupRenderer()
    this.setupFog()
    
    this.terrainManager = new TerrainManager(this.terrainConfig, 3)
    this.terrainManager.generateChunks()
    this.scene.add(this.terrainManager.group)
    
    this.weatherSystem = new WeatherSystem(this.scene)
    this.lightingSystem = new LightingSystem(this.scene)
    
    this.controls = new FirstPersonControls(
      this.camera,
      this.renderer.domElement,
      (x: number, z: number) => this.terrainManager.getHeightAt(x, z)
    )
    
    this.inputHandler = new InputHandler()
    this.setupInputCallbacks()
    
    this.setupWindowEvents()
    this.animate()
  }

  private setupRenderer(): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = false
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setClearColor(0x87ceeb)
    
    const app = document.getElementById('app')
    if (app) {
      app.appendChild(this.renderer.domElement)
    }
  }

  private setupFog(): void {
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.02)
  }

  private setupInputCallbacks(): void {
    this.inputHandler.onWeatherChange((weather: WeatherType) => {
      this.weatherSystem.setWeather(weather)
    })
    
    this.inputHandler.onTimeChange((time: number) => {
      this.timeSystem.setTimeOfDay(time)
      this.lightingSystem.setTimeOfDay(time)
    })
    
    this.inputHandler.onTimeSpeedChange((speed: number) => {
      this.timeSystem.setTimeSpeed(speed)
    })
    
    this.inputHandler.onTimeTogglePause(() => {
      this.timeSystem.togglePause()
    })
    
    this.inputHandler.onTerrainHeightChange((height: number) => {
      this.terrainConfig.maxHeight = height
    })
    
    this.inputHandler.onTerrainRoughnessChange((roughness: number) => {
      this.terrainConfig.roughness = roughness
    })
    
    this.inputHandler.onFogDensityChange((density: number) => {
      this.lightingSystem.setFogDensity(density)
    })
    
    this.inputHandler.onRegenerateTerrain(() => {
      this.terrainConfig.seed = Math.random() * 10000
      this.terrainManager.regenerate(this.terrainConfig)
    })
  }

  private setupWindowEvents(): void {
    window.addEventListener('resize', this.onWindowResize.bind(this))
    window.addEventListener('keydown', this.onKeyDown.bind(this))
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Escape') {
      document.exitPointerLock()
    }
  }

  private updateClockDisplay(): void {
    const clockDisplay = document.getElementById('clock-display') as HTMLSpanElement
    if (clockDisplay) {
      clockDisplay.textContent = this.timeSystem.getTimeString()
    }
  }

  private animate(): void {
    requestAnimationFrame(this.animate.bind(this))
    
    const rawDeltaTime = Math.min(this.clock.getDelta(), 0.1)
    const timeSpeed = this.timeSystem.getTimeSpeed()
    const scaledDeltaTime = this.timeSystem.isPaused() ? rawDeltaTime : rawDeltaTime * Math.max(1, timeSpeed)
    
    this.controls.update(scaledDeltaTime)
    
    this.timeSystem.update(rawDeltaTime)
    
    if (timeSpeed > 0 && !this.timeSystem.isPaused()) {
      const currentTime = this.timeSystem.getTimeOfDay()
      this.lightingSystem.setTimeOfDay(currentTime)
      this.inputHandler.setTimeOfDay(currentTime)
    }
    
    const cameraPosition = this.camera.position
    this.terrainManager.updateChunks(cameraPosition)
    this.terrainManager.updateTime(rawDeltaTime)
    
    const weatherIntensities = this.weatherSystem.getWeatherIntensities()
    this.lightingSystem.update(rawDeltaTime, cameraPosition, weatherIntensities)
    
    this.weatherSystem.update(
      scaledDeltaTime,
      cameraPosition,
      (x: number, z: number) => this.terrainManager.getHeightAt(x, z)
    )
    
    this.terrainManager.updateWeather({
      rain: weatherIntensities.rain,
      snow: weatherIntensities.snow
    })
    
    this.updateClockDisplay()
    
    this.renderer.render(this.scene, this.camera)
  }

  public dispose(): void {
    this.controls.dispose()
    this.terrainManager.dispose()
    this.weatherSystem.dispose()
    this.lightingSystem.dispose()
    this.renderer.dispose()
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game()
  
  window.addEventListener('beforeunload', () => {
    game.dispose()
  })
})
