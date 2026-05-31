import * as THREE from 'three'

export interface PlayerPhysics {
  position: THREE.Vector3
  velocity: THREE.Vector3
  isGrounded: boolean
  isJumping: boolean
}

export interface ControlsSettings {
  moveSpeed: number
  sprintMultiplier: number
  jumpForce: number
  gravity: number
  mouseSensitivity: number
  lookSmoothness: number
  playerHeight: number
  playerRadius: number
}

export class FirstPersonControls {
  private camera: THREE.PerspectiveCamera
  private domElement: HTMLElement
  private getTerrainHeight: (x: number, z: number) => number
  
  public settings: ControlsSettings = {
    moveSpeed: 10,
    sprintMultiplier: 2,
    jumpForce: 12,
    gravity: -25,
    mouseSensitivity: 0.002,
    lookSmoothness: 1,
    playerHeight: 1.8,
    playerRadius: 0.5
  }
  
  private keys: Set<string> = new Set()
  private isPointerLocked: boolean = false
  
  private yaw: number = 0
  private pitch: number = 0
  private targetYaw: number = 0
  private targetPitch: number = 0
  
  private physics: PlayerPhysics = {
    position: new THREE.Vector3(0, 50, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    isGrounded: false,
    isJumping: false
  }
  
  private moveDirection: THREE.Vector3 = new THREE.Vector3()
  private euler: THREE.Euler = new THREE.Euler(0, 0, 0, 'YXZ')
  private quaternion: THREE.Quaternion = new THREE.Quaternion()

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    getTerrainHeight: (x: number, z: number) => number
  ) {
    this.camera = camera
    this.domElement = domElement
    this.getTerrainHeight = getTerrainHeight
    
    this.bindEvents()
    this.initializePosition()
  }

  private bindEvents(): void {
    this.domElement.addEventListener('click', this.onClick.bind(this))
    document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this))
    document.addEventListener('mousemove', this.onMouseMove.bind(this))
    document.addEventListener('keydown', this.onKeyDown.bind(this))
    document.addEventListener('keyup', this.onKeyUp.bind(this))
  }

  private unbindEvents(): void {
    this.domElement.removeEventListener('click', this.onClick.bind(this))
    document.removeEventListener('pointerlockchange', this.onPointerLockChange.bind(this))
    document.removeEventListener('mousemove', this.onMouseMove.bind(this))
    document.removeEventListener('keydown', this.onKeyDown.bind(this))
    document.removeEventListener('keyup', this.onKeyUp.bind(this))
  }

  private onClick(): void {
    if (!this.isPointerLocked) {
      this.domElement.requestPointerLock()
    }
  }

  private onPointerLockChange(): void {
    this.isPointerLocked = document.pointerLockElement === this.domElement
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.isPointerLocked) return
    
    this.targetYaw -= event.movementX * this.settings.mouseSensitivity
    this.targetPitch -= event.movementY * this.settings.mouseSensitivity
    
    this.targetPitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.targetPitch))
  }

  private onKeyDown(event: KeyboardEvent): void {
    this.keys.add(event.code)
    
    if (event.code === 'Space' && this.physics.isGrounded) {
      this.physics.velocity.y = this.settings.jumpForce
      this.physics.isGrounded = false
      this.physics.isJumping = true
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.keys.delete(event.code)
  }

  private initializePosition(): void {
    const startHeight = this.getTerrainHeight(0, 0) + this.settings.playerHeight + 5
    this.physics.position.set(0, startHeight, 0)
    this.camera.position.copy(this.physics.position)
  }

  public update(deltaTime: number): void {
    this.updateRotation(deltaTime)
    this.updateMovement(deltaTime)
    this.updatePhysics(deltaTime)
    this.updateCamera()
  }

  private updateRotation(deltaTime: number): void {
    const smoothFactor = this.settings.lookSmoothness * deltaTime * 10
    
    this.yaw = THREE.MathUtils.lerp(this.yaw, this.targetYaw, smoothFactor)
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.targetPitch, smoothFactor)
    
    this.euler.set(this.pitch, this.yaw, 0)
    this.quaternion.setFromEuler(this.euler)
  }

  private updateMovement(deltaTime: number): void {
    const isSprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
    const speed = this.settings.moveSpeed * (isSprinting ? this.settings.sprintMultiplier : 1)
    
    this.moveDirection.set(0, 0, 0)
    
    if (this.keys.has('KeyW')) this.moveDirection.z -= 1
    if (this.keys.has('KeyS')) this.moveDirection.z += 1
    if (this.keys.has('KeyA')) this.moveDirection.x -= 1
    if (this.keys.has('KeyD')) this.moveDirection.x += 1
    
    if (this.moveDirection.length() > 0) {
      this.moveDirection.normalize()
      
      const forwardVector = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion)
      forwardVector.y = 0
      forwardVector.normalize()
      
      const rightVector = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion)
      rightVector.y = 0
      rightVector.normalize()
      
      const moveVector = new THREE.Vector3()
      moveVector.addScaledVector(forwardVector, -this.moveDirection.z)
      moveVector.addScaledVector(rightVector, this.moveDirection.x)
      moveVector.normalize()
      
      this.physics.velocity.x = moveVector.x * speed
      this.physics.velocity.z = moveVector.z * speed
    } else {
      this.physics.velocity.x = THREE.MathUtils.lerp(this.physics.velocity.x, 0, deltaTime * 10)
      this.physics.velocity.z = THREE.MathUtils.lerp(this.physics.velocity.z, 0, deltaTime * 10)
    }
  }

  private updatePhysics(deltaTime: number): void {
    this.physics.velocity.y += this.settings.gravity * deltaTime
    
    if (this.physics.velocity.y < -50) {
      this.physics.velocity.y = -50
    }
    
    const newPosition = this.physics.position.clone()
    newPosition.addScaledVector(this.physics.velocity, deltaTime)
    
    this.checkTerrainCollision(newPosition, deltaTime)
    
    this.physics.position.copy(newPosition)
  }

  private checkTerrainCollision(newPosition: THREE.Vector3, deltaTime: number): void {
    const terrainHeight = this.getTerrainHeight(newPosition.x, newPosition.z)
    const feetHeight = terrainHeight
    
    if (newPosition.y <= feetHeight + this.settings.playerHeight) {
      newPosition.y = feetHeight + this.settings.playerHeight
      
      if (this.physics.velocity.y < 0) {
        this.physics.velocity.y = 0
        this.physics.isGrounded = true
        this.physics.isJumping = false
      }
    } else {
      if (this.physics.velocity.y < -2) {
        this.physics.isGrounded = false
      }
    }
    
    this.checkSteepSlope(newPosition, deltaTime)
  }

  private checkSteepSlope(newPosition: THREE.Vector3, _deltaTime: number): void {
    const checkPoints = [
      { x: newPosition.x, z: newPosition.z },
      { x: newPosition.x + this.settings.playerRadius, z: newPosition.z },
      { x: newPosition.x - this.settings.playerRadius, z: newPosition.z },
      { x: newPosition.x, z: newPosition.z + this.settings.playerRadius },
      { x: newPosition.x, z: newPosition.z - this.settings.playerRadius }
    ]
    
    let maxHeight = -Infinity
    for (const point of checkPoints) {
      const h = this.getTerrainHeight(point.x, point.z)
      if (h > maxHeight) maxHeight = h
    }
    
    if (newPosition.y < maxHeight + this.settings.playerHeight * 0.5) {
      const correction = maxHeight + this.settings.playerHeight * 0.5 - newPosition.y
      if (correction > 0 && correction < 5) {
        newPosition.y += correction
      }
    }
  }

  private updateCamera(): void {
    this.camera.position.copy(this.physics.position)
    this.camera.quaternion.copy(this.quaternion)
  }

  public getPosition(): THREE.Vector3 {
    return this.physics.position.clone()
  }

  public getVelocity(): THREE.Vector3 {
    return this.physics.velocity.clone()
  }

  public isGrounded(): boolean {
    return this.physics.isGrounded
  }

  public setPosition(position: THREE.Vector3): void {
    this.physics.position.copy(position)
  }

  public setRotation(yaw: number, pitch: number): void {
    this.yaw = yaw
    this.pitch = pitch
    this.targetYaw = yaw
    this.targetPitch = pitch
  }

  public getYaw(): number {
    return this.yaw
  }

  public getPitch(): number {
    return this.pitch
  }

  public dispose(): void {
    this.unbindEvents()
  }
}
