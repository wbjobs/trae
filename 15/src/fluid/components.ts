import { IComponent } from '../ecs'
import { Vec3 } from './config'

export class Position implements IComponent {
  public x: number = 0
  public y: number = 0
  public z: number = 0
  
  constructor(x = 0, y = 0, z = 0) {
    this.x = x
    this.y = y
    this.z = z
  }
  
  public set(v: Vec3): void {
    this.x = v[0]
    this.y = v[1]
    this.z = v[2]
  }
  
  public toArray(): Vec3 {
    return [this.x, this.y, this.z]
  }
}

export class Velocity implements IComponent {
  public x: number = 0
  public y: number = 0
  public z: number = 0
  
  constructor(x = 0, y = 0, z = 0) {
    this.x = x
    this.y = y
    this.z = z
  }
}

export class PredictedPosition implements IComponent {
  public x: number = 0
  public y: number = 0
  public z: number = 0
}

export class Density implements IComponent {
  public value: number = 0
}

export class Pressure implements IComponent {
  public value: number = 0
}

export class PressureForce implements IComponent {
  public x: number = 0
  public y: number = 0
  public z: number = 0
}

export class ViscosityForce implements IComponent {
  public x: number = 0
  public y: number = 0
  public z: number = 0
}

export class CorrectionVelocity implements IComponent {
  public x: number = 0
  public y: number = 0
  public z: number = 0
}

export class DensityError implements IComponent {
  public value: number = 0
}

export class FluidParticle implements IComponent {}

export class BoundaryObject implements IComponent {
  public position: Position = new Position()
  public radius: number = 0.1
  
  constructor(radius = 0.1) {
    this.radius = radius
  }
}

export class Temperature implements IComponent {
  public value: number = 293.15
  public previousValue: number = 293.15
  public gradient: number = 0
}

export class HeatSource implements IComponent {
  public temperature: number = 373.15
  public radius: number = 0.1
  
  constructor(temp = 373.15, radius = 0.1) {
    this.temperature = temp
    this.radius = radius
  }
}

export class TemperatureSensor implements IComponent {
  public history: number[] = []
  public maxHistory: number = 1024
}
