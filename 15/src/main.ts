import { World } from './ecs'
import { GPUDeviceManager } from './gpu/device'
import { FluidSimulationSystem } from './fluid/FluidSimulationSystem'
import { MouseSystem } from './input/MouseSystem'

class Game {
  private world: World
  private canvas: HTMLCanvasElement
  private gpu: GPUDeviceManager
  private fluidSystem!: FluidSimulationSystem
  private mouseSystem!: MouseSystem
  private lastTime: number = 0
  private running: boolean = false
  
  constructor() {
    this.world = new World()
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement
    this.gpu = GPUDeviceManager.getInstance()
  }
  
  public async init(): Promise<void> {
    this.resizeCanvas()
    window.addEventListener('resize', () => this.resizeCanvas())
    
    await this.gpu.init(this.canvas)
    
    this.fluidSystem = new FluidSimulationSystem(this.world)
    this.mouseSystem = new MouseSystem(this.world, this.fluidSystem, this.canvas)
    
    this.world.addSystem(this.mouseSystem)
    this.world.addSystem(this.fluidSystem)
    
    this.world.init()
    
    console.log('PCISPH Fluid Simulator initialized')
  }
  
  private resizeCanvas(): void {
    this.canvas.width = window.innerWidth
    this.canvas.height = window.innerHeight
  }
  
  public start(): void {
    this.running = true
    this.lastTime = performance.now()
    requestAnimationFrame(this.gameLoop.bind(this))
  }
  
  private gameLoop(currentTime: number): void {
    if (!this.running) return
    
    const dt = (currentTime - this.lastTime) / 1000
    this.lastTime = currentTime
    
    this.world.update(dt)
    
    requestAnimationFrame(this.gameLoop.bind(this))
  }
  
  public stop(): void {
    this.running = false
    this.world.destroy()
  }
}

async function main() {
  const game = new Game()
  
  try {
    await game.init()
    game.start()
  } catch (error) {
    console.error('Failed to initialize:', error)
    alert('WebGPU 不支持或初始化失败，请确保使用支持 WebGPU 的浏览器（如 Chrome 113+）')
  }
}

main()
