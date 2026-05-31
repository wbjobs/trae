import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

class SectionClipping {
  constructor(scene, renderer, camera) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;

    this.planes = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), 0),
    ];

    this.planeEnabled = [false, false, false, false, false, false];
    this.planePositions = [0, 0, 0, 0, 0, 0];
    this.planeHelpers = [];
    this.planeHelperGroup = new THREE.Group();
    this.planeHelperGroup.name = 'ClippingPlaneHelpers';
    this.scene.add(this.planeHelperGroup);

    this.isEnabled = false;
    this.isDragging = false;
    this.dragPlaneIndex = -1;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.planeLabels = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
    this.planeColors = [
      0xff4444, 0xff8844, 0x44ff44, 0x44ff88, 0x4444ff, 0x4488ff
    ];

    this.initHelpers();
    this.initControls();
  }

  initHelpers() {
    const size = 200;

    for (let i = 0; i < 6; i++) {
      const helper = new THREE.PlaneHelper(
        this.planes[i],
        size,
        this.planeColors[i]
      );
      helper.visible = false;
      helper.userData.planeIndex = i;
      this.planeHelpers.push(helper);
      this.planeHelperGroup.add(helper);
    }
  }

  initControls() {
    this._onMouseDown = (e) => this.onMouseDown(e);
    this._onMouseMove = (e) => this.onMouseMove(e);
    this._onMouseUp = (e) => this.onMouseUp(e);
    this._onWheel = (e) => this.onWheel(e);

    this.renderer.domElement.addEventListener('mousedown', this._onMouseDown);
    this.renderer.domElement.addEventListener('mousemove', this._onMouseMove);
    this.renderer.domElement.addEventListener('mouseup', this._onMouseUp);
    this.renderer.domElement.addEventListener('wheel', this._onWheel, { passive: false });
  }

  onMouseDown(event) {
    if (!this.isEnabled) return;
    if (event.button !== 0) return;

    this.updateMousePosition(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObjects(this.planeHelpers, true);

    if (intersects.length > 0) {
      const obj = intersects[0].object;
      let planeHelper = obj;
      while (planeHelper && !('planeIndex' in planeHelper.userData)) {
        planeHelper = planeHelper.parent;
      }

      if (planeHelper && 'planeIndex' in planeHelper.userData) {
        this.isDragging = true;
        this.dragPlaneIndex = planeHelper.userData.planeIndex;
        event.stopPropagation();
        event.preventDefault();
      }
    }
  }

  onMouseMove(event) {
    if (!this.isEnabled || !this.isDragging || this.dragPlaneIndex < 0) return;

    this.updateMousePosition(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const plane = this.planes[this.dragPlaneIndex];
    const normal = plane.normal.clone();
    const dragPlane = new THREE.Plane(
      normal,
      -normal.dot(this.camera.position)
    );

    const intersectPoint = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(dragPlane, intersectPoint);

    if (intersectPoint) {
      const axis = this.dragPlaneIndex;
      let newPosition;

      if (axis === 0 || axis === 1) {
        newPosition = intersectPoint.x;
      } else if (axis === 2 || axis === 3) {
        newPosition = intersectPoint.y;
      } else {
        newPosition = intersectPoint.z;
      }

      if (axis % 2 === 1) {
        newPosition = -newPosition;
      }

      this.setPlanePosition(this.dragPlaneIndex, newPosition);
    }

    event.stopPropagation();
    event.preventDefault();
  }

  onMouseUp(event) {
    this.isDragging = false;
    this.dragPlaneIndex = -1;
  }

  onWheel(event) {
    if (!this.isEnabled) return;
    if (event.ctrlKey || event.metaKey) return;

    this.updateMousePosition(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObjects(this.planeHelpers, true);

    if (intersects.length > 0) {
      const obj = intersects[0].object;
      let planeHelper = obj;
      while (planeHelper && !('planeIndex' in planeHelper.userData)) {
        planeHelper = planeHelper.parent;
      }

      if (planeHelper && 'planeIndex' in planeHelper.userData) {
        const index = planeHelper.userData.planeIndex;
        const delta = event.deltaY > 0 ? 0.5 : -0.5;
        this.setPlanePosition(index, this.planePositions[index] + delta);
        event.stopPropagation();
        event.preventDefault();
      }
    }
  }

  updateMousePosition(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  enablePlane(index, enabled = true) {
    if (index < 0 || index >= 6) return;

    this.planeEnabled[index] = enabled;
    this.planeHelpers[index].visible = enabled;
    this.updateClippingPlanes();
  }

  disablePlane(index) {
    this.enablePlane(index, false);
  }

  setPlanePosition(index, position) {
    if (index < 0 || index >= 6) return;

    this.planePositions[index] = position;
    const plane = this.planes[index];

    if (index % 2 === 0) {
      plane.constant = -position;
    } else {
      plane.constant = position;
    }

    this.updateHelperPosition(index);
  }

  updateHelperPosition(index) {
    const helper = this.planeHelpers[index];
    const position = this.planePositions[index];

    const normal = this.planes[index].normal.clone();
    const planeCenter = normal.multiplyScalar(
      index % 2 === 0 ? position : -position
    );

    helper.position.copy(planeCenter);
    helper.lookAt(planeCenter.clone().add(this.planes[index].normal));
  }

  updateClippingPlanes() {
    const enabledPlanes = this.planes.filter((_, i) => this.planeEnabled[i]);
    this.renderer.localClippingEnabled = enabledPlanes.length > 0;
    this.scene.traverse((object) => {
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(mat => {
          mat.clippingPlanes = enabledPlanes;
          mat.clipShadows = true;
          mat.needsUpdate = true;
        });
      }
    });
  }

  setBoxClipping(min, max) {
    this.setPlanePosition(0, max.x);
    this.setPlanePosition(1, -min.x);
    this.setPlanePosition(2, max.y);
    this.setPlanePosition(3, -min.y);
    this.setPlanePosition(4, max.z);
    this.setPlanePosition(5, -min.z);

    for (let i = 0; i < 6; i++) {
      this.enablePlane(i, true);
    }
  }

  reset() {
    for (let i = 0; i < 6; i++) {
      this.planePositions[i] = 0;
      this.planeEnabled[i] = false;
      this.planeHelpers[i].visible = false;
      this.planes[i].constant = 0;
    }
    this.updateClippingPlanes();
  }

  enableAll() {
    for (let i = 0; i < 6; i++) {
      this.enablePlane(i, true);
    }
  }

  disableAll() {
    for (let i = 0; i < 6; i++) {
      this.disablePlane(i);
    }
  }

  setEnabled(enabled) {
    this.isEnabled = enabled;
    this.planeHelperGroup.visible = enabled;
    if (!enabled) {
      this.isDragging = false;
      this.dragPlaneIndex = -1;
    }
  }

  getPlaneInfo(index) {
    return {
      label: this.planeLabels[index],
      enabled: this.planeEnabled[index],
      position: this.planePositions[index],
      color: this.planeColors[index],
    };
  }

  dispose() {
    this.renderer.domElement.removeEventListener('mousedown', this._onMouseDown);
    this.renderer.domElement.removeEventListener('mousemove', this._onMouseMove);
    this.renderer.domElement.removeEventListener('mouseup', this._onMouseUp);
    this.renderer.domElement.removeEventListener('wheel', this._onWheel);

    this.planeHelpers.forEach(helper => {
      helper.geometry.dispose();
      helper.material.dispose();
    });

    this.scene.remove(this.planeHelperGroup);
    this.renderer.localClippingEnabled = false;
  }
}

export default SectionClipping;
