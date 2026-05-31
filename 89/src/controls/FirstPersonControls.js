import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

class FirstPersonControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.enabled = false;
    this.moveSpeed = 50;
    this.lookSpeed = 0.002;

    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.moveUp = false;
    this.moveDown = false;

    this.canJump = false;
    this.jumpVelocity = 0;
    this.gravity = 10;
    this.jumpHeight = 10;

    this.mouseX = 0;
    this.mouseY = 0;
    this.targetRotation = new THREE.Vector2();
    this.currentRotation = new THREE.Vector2();

    this.cameraRotation = new THREE.Euler(0, 0, 0, 'YXZ');

    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();

    this.heightLimit = { min: 1, max: 200 };
    this.boundary = {
      min: new THREE.Vector3(-500, 0, -500),
      max: new THREE.Vector3(500, 500, 500),
    };

    this.init();
  }

  init() {
    this._onKeyDown = (e) => this.onKeyDown(e);
    this._onKeyUp = (e) => this.onKeyUp(e);
    this._onMouseMove = (e) => this.onMouseMove(e);
    
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    this.domElement.addEventListener('mousemove', this._onMouseMove);
  }

  onKeyDown(event) {
    if (!this.enabled) return;

    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.moveLeft = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = true;
        break;
      case 'Space':
        if (this.canJump) {
          this.jumpVelocity = Math.sqrt(2 * this.gravity * this.jumpHeight);
          this.canJump = false;
        }
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.moveUp = true;
        break;
      case 'ControlLeft':
      case 'ControlRight':
        this.moveDown = true;
        break;
    }
  }

  onKeyUp(event) {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.moveLeft = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.moveUp = false;
        break;
      case 'ControlLeft':
      case 'ControlRight':
        this.moveDown = false;
        break;
    }
  }

  onMouseMove(event) {
    if (!this.enabled) return;
    if (document.pointerLockElement !== this.domElement) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    this.targetRotation.y -= movementX * this.lookSpeed;
    this.targetRotation.x -= movementY * this.lookSpeed;

    this.targetRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.targetRotation.x));
  }

  update(delta) {
    if (!this.enabled) return;

    this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * 0.1;
    this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * 0.1;

    if (!this._euler) {
      this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
      this._moveVector = new THREE.Vector3();
      this._forward = new THREE.Vector3();
      this._right = new THREE.Vector3();
      this._movement = new THREE.Vector3();
    }

    this._euler.set(this.currentRotation.x, this.currentRotation.y, 0);
    this.camera.quaternion.setFromEuler(this._euler);

    this.velocity.x -= this.velocity.x * 10 * delta;
    this.velocity.z -= this.velocity.z * 10 * delta;

    if (this.moveUp) {
      this.velocity.y = this.moveSpeed * 0.5;
    } else if (this.moveDown) {
      this.velocity.y = -this.moveSpeed * 0.5;
    } else {
      this.velocity.y -= this.gravity * delta;
    }

    this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
    this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
    this.direction.normalize();

    if (this.moveForward || this.moveBackward) {
      this.velocity.z -= this.direction.z * this.moveSpeed * delta * 10;
    }
    if (this.moveLeft || this.moveRight) {
      this.velocity.x -= this.direction.x * this.moveSpeed * delta * 10;
    }

    this._moveVector.copy(this.velocity).multiplyScalar(delta);

    this._forward.set(0, 0, -1);
    this._forward.applyQuaternion(this.camera.quaternion);
    this._forward.y = 0;
    if (this._forward.lengthSq() > 0.0001) {
      this._forward.normalize();
    }

    this._right.set(1, 0, 0);
    this._right.applyQuaternion(this.camera.quaternion);
    this._right.y = 0;
    if (this._right.lengthSq() > 0.0001) {
      this._right.normalize();
    }

    this._movement.set(0, 0, 0);
    this._movement.addScaledVector(this._forward, -this._moveVector.z);
    this._movement.addScaledVector(this._right, -this._moveVector.x);
    this._movement.y = this._moveVector.y;

    this.camera.position.add(this._movement);

    this.clampPosition();

    if (this.camera.position.y < this.heightLimit.min) {
      this.velocity.y = 0;
      this.camera.position.y = this.heightLimit.min;
      this.canJump = true;
    }
  }

  clampPosition() {
    const pos = this.camera.position;
    pos.x = Math.max(this.boundary.min.x, Math.min(this.boundary.max.x, pos.x));
    pos.y = Math.max(this.boundary.min.y, Math.min(this.boundary.max.y, pos.y));
    pos.z = Math.max(this.boundary.min.z, Math.min(this.boundary.max.z, pos.z));
  }

  setPosition(x, y, z) {
    if (x instanceof THREE.Vector3) {
      this.camera.position.copy(x);
    } else {
      this.camera.position.set(x, y, z);
    }
    this.velocity.set(0, 0, 0);
  }

  setRotation(yaw, pitch = 0) {
    this.targetRotation.set(pitch, yaw);
    this.currentRotation.set(pitch, yaw);
  }

  setBoundary(min, max) {
    this.boundary.min.copy(min);
    this.boundary.max.copy(max);
  }

  enable() {
    this.enabled = true;
    this.domElement.requestPointerLock();
  }

  disable() {
    this.enabled = false;
    document.exitPointerLock();
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.moveUp = false;
    this.moveDown = false;
  }

  toggle() {
    if (this.enabled) {
      this.disable();
    } else {
      this.enable();
    }
    return this.enabled;
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    this.domElement.removeEventListener('mousemove', this._onMouseMove);
  }
}

export default FirstPersonControls;
