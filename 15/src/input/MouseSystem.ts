import { World, ISystem } from '../ecs'
import { FluidSimulationSystem } from '../fluid/FluidSimulationSystem'
import { Vec3 } from '../fluid/config'

export class MouseSystem implements ISystem {
  private fluidSystem: FluidSimulationSystem
  private canvas: HTMLCanvasElement
  
  private isLeftDragging: boolean = false
  private isRightDragging: boolean = false
  private mouseX: number = 0
  private mouseY: number = 0
  private lastSpawnTime: number = 0
  
  constructor(_world: World, fluidSystem: FluidSimulationSystem, canvas: HTMLCanvasElement) {
    this.fluidSystem = fluidSystem
    this.canvas = canvas
  }
  
  public init(): void {
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this))
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this))
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this))
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }
  
  private onMouseDown(e: MouseEvent): void {
    this.updateMousePosition(e)
    if (e.button === 0) {
      this.isLeftDragging = true
    } else if (e.button === 2) {
      this.isRightDragging = true
    }
  }
  
  private onMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      this.isLeftDragging = false
    } else if (e.button === 2) {
      this.isRightDragging = false
    }
  }
  
  private onMouseMove(e: MouseEvent): void {
    this.updateMousePosition(e)
  }
  
  private updateMousePosition(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect()
    this.mouseX = (e.clientX - rect.left) / rect.width
    this.mouseY = (e.clientY - rect.top) / rect.height
  }
  
  private screenToWorld(screenX: number, screenY: number): Vec3 {
    const worldX = (screenX - 0.5) * 4.0
    const worldY = (0.5 - screenY) * 4.0
    return [worldX, worldY, 0]
  }
  
  public update(_dt: number): void {
    const now = performance.now()
    
    if (this.isLeftDragging && now - this.lastSpawnTime > 50) {
      const worldPos = this.screenToWorld(this.mouseX, this.mouseY)
      this.fluidSystem.addParticlesAtPosition(worldPos, 5)
      this.lastSpawnTime = now
    }
    
    if (this.isRightDragging && now - this.lastSpawnTime > 100) {
      this.lastSpawnTime = now
    }
  }
  
  public destroy(): void {
    // Event listeners cleanup not strictly necessary as canvas will be cleaned up
  }
}
