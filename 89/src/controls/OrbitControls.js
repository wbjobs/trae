import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

class OrbitControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.target = new THREE.Vector3();

    this.enabled = true;
    this.enableDamping = true;
    this.dampingFactor = 0.05;

    this.enableZoom = true;
    this.zoomSpeed = 1.0;

    this.enableRotate = true;
    this.rotateSpeed = 1.0;

    this.enablePan = true;
    this.panSpeed = 1.0;

    this.minDistance = 5;
    this.maxDistance = 500;

    this.minPolarAngle = 0.1;
    this.maxPolarAngle = Math.PI - 0.1;

    this._spherical = new THREE.Spherical();
    this._sphericalDelta = new THREE.Spherical();
    this._sphericalDump = new THREE.Spherical();
    this._scale = 1;
    this._panOffset = new THREE.Vector3();

    this._rotateStart = new THREE.Vector2();
    this._rotateEnd = new THREE.Vector2();
    this._rotateDelta = new THREE.Vector2();

    this._panStart = new THREE.Vector2();
    this._panEnd = new THREE.Vector2();
    this._panDelta = new THREE.Vector2();

    this._zoomStart = new THREE.Vector2();
    this._zoomEnd = new THREE.Vector2();
    this._zoomDelta = new THREE.Vector2();

    this._offset = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._quatInverse = new THREE.Quaternion();
    this._tempVec = new THREE.Vector3();

    this.STATE = {
      NONE: -1,
      ROTATE: 0,
      PAN: 1,
      ZOOM: 2,
    };

    this.state = this.STATE.NONE;

    this._bindEvents();
    this._updateQuaternion();
  }

  _updateQuaternion() {
    this._quat.setFromUnitVectors(this.camera.up, new THREE.Vector3(0, 1, 0));
    this._quatInverse.copy(this._quat).invert();
  }

  _bindEvents() {
    this._onContextMenu = (e) => e.preventDefault();
    this._onMouseDown = (e) => this.onMouseDown(e);
    this._onMouseMove = (e) => this.onMouseMove(e);
    this._onMouseUp = (e) => this.onMouseUp(e);
    this._onMouseWheel = (e) => this.onMouseWheel(e);
    this._onTouchStart = (e) => this.onTouchStart(e);
    this._onTouchMove = (e) => this.onTouchMove(e);
    this._onTouchEnd = (e) => this.onTouchEnd(e);

    this.domElement.addEventListener('contextmenu', this._onContextMenu);
    this.domElement.addEventListener('mousedown', this._onMouseDown);
    this.domElement.addEventListener('wheel', this._onMouseWheel, { passive: false });
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    this.domElement.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.domElement.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.domElement.addEventListener('touchend', this._onTouchEnd);
  }

  onMouseDown(event) {
    if (!this.enabled) return;

    switch (event.button) {
      case 0:
        this.state = this.STATE.ROTATE;
        this._rotateStart.set(event.clientX, event.clientY);
        break;
      case 1:
        this.state = this.STATE.ZOOM;
        this._zoomStart.set(event.clientX, event.clientY);
        break;
      case 2:
        this.state = this.STATE.PAN;
        this._panStart.set(event.clientX, event.clientY);
        break;
    }
  }

  onMouseMove(event) {
    if (!this.enabled) return;

    switch (this.state) {
      case this.STATE.ROTATE:
        this._rotateEnd.set(event.clientX, event.clientY);
        this._rotateDelta.subVectors(this._rotateEnd, this._rotateStart);
        
        const element = this.domElement;
        this.rotateLeft(2 * Math.PI * this._rotateDelta.x / element.clientHeight * this.rotateSpeed);
        this.rotateUp(2 * Math.PI * this._rotateDelta.y / element.clientHeight * this.rotateSpeed);
        
        this._rotateStart.copy(this._rotateEnd);
        break;

      case this.STATE.PAN:
        this._panEnd.set(event.clientX, event.clientY);
        this._panDelta.subVectors(this._panEnd, this._panStart);
        this.pan(this._panDelta.x * this.panSpeed, this._panDelta.y * this.panSpeed);
        this._panStart.copy(this._panEnd);
        break;

      case this.STATE.ZOOM:
        this._zoomEnd.set(event.clientX, event.clientY);
        this._zoomDelta.subVectors(this._zoomEnd, this._zoomStart);
        if (this._zoomDelta.y > 0) {
          this._scale /= Math.pow(0.95, this.zoomSpeed);
        } else if (this._zoomDelta.y < 0) {
          this._scale *= Math.pow(0.95, this.zoomSpeed);
        }
        this._zoomStart.copy(this._zoomEnd);
        break;
    }
  }

  onMouseUp() {
    this.state = this.STATE.NONE;
  }

  onMouseWheel(event) {
    if (!this.enabled || !this.enableZoom) return;
    event.preventDefault();

    if (event.deltaY < 0) {
      this._scale *= Math.pow(0.95, this.zoomSpeed);
    } else {
      this._scale /= Math.pow(0.95, this.zoomSpeed);
    }
  }

  onTouchStart(event) {
    if (!this.enabled) return;
    event.preventDefault();

    const touch = event.touches[0];
    this._rotateStart.set(touch.clientX, touch.clientY);
    this.state = this.STATE.ROTATE;
  }

  onTouchMove(event) {
    if (!this.enabled) return;
    event.preventDefault();

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      this._rotateEnd.set(touch.clientX, touch.clientY);
      this._rotateDelta.subVectors(this._rotateEnd, this._rotateStart);
      
      const element = this.domElement;
      this.rotateLeft(2 * Math.PI * this._rotateDelta.x / element.clientHeight * this.rotateSpeed);
      this.rotateUp(2 * Math.PI * this._rotateDelta.y / element.clientHeight * this.rotateSpeed);
      
      this._rotateStart.copy(this._rotateEnd);
    }
  }

  onTouchEnd() {
    this.state = this.STATE.NONE;
  }

  rotateLeft(angle) {
    this._sphericalDelta.theta -= angle;
  }

  rotateUp(angle) {
    this._sphericalDelta.phi -= angle;
  }

  pan(deltaX, deltaY) {
    const te = this.camera.matrix.elements;

    this._tempVec.set(te[0], te[1], te[2]).multiplyScalar(-deltaX * 0.1);
    this._panOffset.add(this._tempVec);

    this._tempVec.set(te[4], te[5], te[6]).multiplyScalar(deltaY * 0.1);
    this._panOffset.add(this._tempVec);
  }

  update() {
    this._offset.copy(this.camera.position).sub(this.target);
    this._offset.applyQuaternion(this._quat);

    this._spherical.setFromVector3(this._offset);

    this._spherical.theta += this._sphericalDelta.theta;
    this._spherical.phi += this._sphericalDelta.phi;

    this._spherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this._spherical.phi));

    this._spherical.radius *= this._scale;
    this._spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this._spherical.radius));

    this.target.add(this._panOffset);

    this._offset.setFromSpherical(this._spherical);
    this._offset.applyQuaternion(this._quatInverse);

    this.camera.position.copy(this.target).add(this._offset);
    this.camera.lookAt(this.target);

    if (this.enableDamping) {
      this._sphericalDelta.theta *= (1 - this.dampingFactor);
      this._sphericalDelta.phi *= (1 - this.dampingFactor);
      this._panOffset.multiplyScalar(1 - this.dampingFactor);
    } else {
      this._sphericalDelta.set(0, 0, 0);
      this._panOffset.set(0, 0, 0);
    }

    this._scale = 1;
  }

  setTarget(x, y, z) {
    if (x instanceof THREE.Vector3) {
      this.target.copy(x);
    } else {
      this.target.set(x, y, z);
    }
    this._updateQuaternion();
  }

  reset() {
    this.target.set(0, 0, 0);
    this._sphericalDelta.set(0, 0, 0);
    this._panOffset.set(0, 0, 0);
    this._scale = 1;
    this._updateQuaternion();
    this.update();
  }

  dispose() {
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
    this.domElement.removeEventListener('mousedown', this._onMouseDown);
    this.domElement.removeEventListener('wheel', this._onMouseWheel);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.domElement.removeEventListener('touchstart', this._onTouchStart);
    this.domElement.removeEventListener('touchmove', this._onTouchMove);
    this.domElement.removeEventListener('touchend', this._onTouchEnd);
  }
}

export default OrbitControls;
