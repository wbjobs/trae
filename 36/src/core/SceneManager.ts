import * as THREE from 'three';
import { Vector3, CameraState, RenderParams } from '../types';

export class SceneManager {
  private camera: THREE.PerspectiveCamera;
  private cameraState: CameraState;
  private renderParams: RenderParams;
  
  private isDragging = false;
  private isRightDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private spherical = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 100 };
  private target = new THREE.Vector3(32, 20, 32);
  
  private keys: Set<string> = new Set();
  private moveSpeed = 0.5;

  private onCameraChange: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.camera = new THREE.PerspectiveCamera(
      45,
      canvas.width / canvas.height,
      0.1,
      1000
    );

    this.cameraState = {
      position: { x: 0, y: 0, z: 0 },
      target: { x: 32, y: 20, z: 32 },
      up: { x: 0, y: 1, z: 0 },
      fov: 45,
      near: 0.1,
      far: 1000,
    };

    this.renderParams = {
      maxBounces: 2,
      shadowSteps: 128,
      aoStrength: 0.5,
      aoRadius: 3,
      exposure: 1,
      resolutionScale: 1,
      sunDirection: { x: 0.5, y: 0.8, z: 0.3 },
      sunColor: { x: 1, y: 0.95, z: 0.85 },
      sunIntensity: 3,
      ambientColor: { x: 0.15, y: 0.18, z: 0.25 },
      gamma: 2.2,
      tonemapStrength: 1,
    };

    this.setupEventListeners(canvas);
    this.updateCameraPosition();
  }

  private setupEventListeners(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    canvas.addEventListener('mouseleave', this.onMouseUp.bind(this));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', this.onWheel.bind(this));
    
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button === 0) {
      this.isDragging = true;
    } else if (e.button === 2) {
      this.isRightDragging = true;
    }
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isDragging && !this.isRightDragging) return;

    const deltaX = e.clientX - this.lastMouseX;
    const deltaY = e.clientY - this.lastMouseY;

    if (this.isDragging) {
      this.spherical.theta -= deltaX * 0.01;
      this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi - deltaY * 0.01));
    }

    if (this.isRightDragging) {
      const right = this.getCameraRight();
      const up = this.getCameraUp();
      
      this.target.addScaledVector(right, -deltaX * 0.1);
      this.target.addScaledVector(up, deltaY * 0.1);
    }

    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this.updateCameraPosition();
    this.notifyCameraChange();
  }

  private onMouseUp(): void {
    this.isDragging = false;
    this.isRightDragging = false;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const zoomSpeed = 0.001;
    this.spherical.radius = Math.max(10, Math.min(300, this.spherical.radius * (1 + e.deltaY * zoomSpeed)));
    this.updateCameraPosition();
    this.notifyCameraChange();
  }

  private onKeyDown(e: KeyboardEvent): void {
    this.keys.add(e.key.toLowerCase());
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.key.toLowerCase());
  }

  update(deltaTime: number): void {
    const forward = this.getCameraForward();
    const right = this.getCameraRight();
    const speed = this.moveSpeed * this.spherical.radius * 0.1 * deltaTime * 60;

    if (this.keys.has('w')) {
      this.target.addScaledVector(forward, speed);
    }
    if (this.keys.has('s')) {
      this.target.addScaledVector(forward, -speed);
    }
    if (this.keys.has('a')) {
      this.target.addScaledVector(right, -speed);
    }
    if (this.keys.has('d')) {
      this.target.addScaledVector(right, speed);
    }
    if (this.keys.has(' ')) {
      this.target.y += speed;
    }
    if (this.keys.has('shift')) {
      this.target.y -= speed;
    }

    if (this.keys.size > 0) {
      this.updateCameraPosition();
      this.notifyCameraChange();
    }
  }

  private updateCameraPosition(): void {
    const x = this.spherical.radius * Math.sin(this.spherical.phi) * Math.cos(this.spherical.theta);
    const y = this.spherical.radius * Math.cos(this.spherical.phi);
    const z = this.spherical.radius * Math.sin(this.spherical.phi) * Math.sin(this.spherical.theta);

    this.camera.position.set(
      this.target.x + x,
      this.target.y + y,
      this.target.z + z
    );
    this.camera.lookAt(this.target);

    this.cameraState.position = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
    };
    this.cameraState.target = {
      x: this.target.x,
      y: this.target.y,
      z: this.target.z,
    };
  }

  private getCameraForward(): THREE.Vector3 {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    return forward;
  }

  private getCameraRight(): THREE.Vector3 {
    const right = new THREE.Vector3();
    right.crossVectors(this.getCameraForward(), new THREE.Vector3(0, 1, 0));
    return right.normalize();
  }

  private getCameraUp(): THREE.Vector3 {
    return new THREE.Vector3(0, 1, 0);
  }

  getCameraState(): CameraState {
    return { ...this.cameraState };
  }

  getCameraMatrices(): { dir: Vector3; right: Vector3; up: Vector3 } {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    
    const right = new THREE.Vector3();
    right.crossVectors(dir, new THREE.Vector3(0, 1, 0));
    right.normalize();
    
    const up = new THREE.Vector3();
    up.crossVectors(right, dir);
    up.normalize();

    return {
      dir: { x: dir.x, y: dir.y, z: dir.z },
      right: { x: right.x, y: right.y, z: right.z },
      up: { x: up.x, y: up.y, z: up.z },
    };
  }

  getRenderParams(): RenderParams {
    return { ...this.renderParams };
  }

  setRenderParams(params: Partial<RenderParams>): void {
    this.renderParams = { ...this.renderParams, ...params };
  }

  setOnCameraChange(callback: () => void): void {
    this.onCameraChange = callback;
  }

  private notifyCameraChange(): void {
    if (this.onCameraChange) {
      this.onCameraChange();
    }
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setTarget(target: Vector3): void {
    this.target.set(target.x, target.y, target.z);
    this.updateCameraPosition();
    this.notifyCameraChange();
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }
}
