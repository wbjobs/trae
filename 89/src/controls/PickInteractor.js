import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

class PickInteractor {
  constructor(camera, domElement, targetObjects = []) {
    this.camera = camera;
    this.domElement = domElement;
    this.targetObjects = targetObjects;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.hoveredObject = null;
    this.selectedObject = null;
    this.hoverColor = 0x00ffff;
    this.selectColor = 0xffd700;

    this.onHoverCallbacks = [];
    this.onSelectCallbacks = [];
    this.onUnselectCallbacks = [];

    this.enabled = true;
    this.originalMaterials = new Map();

    this.selectionMarker = this.createSelectionMarker();

    this.init();
  }

  createSelectionMarker() {
    const geometry = new THREE.RingGeometry(2.5, 3, 32);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    const marker = new THREE.Mesh(geometry, material);
    marker.rotation.x = -Math.PI / 2;
    marker.visible = false;
    return marker;
  }

  init() {
    this._onMouseMove = (e) => this.onMouseMove(e);
    this._onClick = (e) => this.onClick(e);
    this._onDoubleClick = (e) => this.onDoubleClick(e);
    
    this.domElement.addEventListener('mousemove', this._onMouseMove);
    this.domElement.addEventListener('click', this._onClick);
    this.domElement.addEventListener('dblclick', this._onDoubleClick);
  }

  onMouseMove(event) {
    if (!this.enabled) return;

    this.updateMousePosition(event);
    this.checkIntersection();
  }

  onClick(event) {
    if (!this.enabled) return;

    this.updateMousePosition(event);
    const intersects = this.getIntersects();

    if (intersects.length > 0) {
      this.selectObject(intersects[0].object);
    } else {
      this.unselectObject();
    }
  }

  onDoubleClick(event) {
    if (!this.enabled) return;

    this.updateMousePosition(event);
    const intersects = this.getIntersects();

    if (intersects.length > 0) {
      const object = intersects[0].object;
      this.onDoubleClickCallbacks?.forEach(cb => cb(object));
    }
  }

  updateMousePosition(event) {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  getIntersects() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    return this.raycaster.intersectObjects(this.targetObjects, true);
  }

  checkIntersection() {
    const intersects = this.getIntersects();

    if (intersects.length > 0) {
      const object = this.findParentWithUserData(intersects[0].object);
      if (object !== this.hoveredObject) {
        this.clearHover();
        this.hoveredObject = object;
        this.applyHoverEffect(object);
        this.onHoverCallbacks.forEach(cb => cb(object, intersects[0]));
        this.domElement.style.cursor = 'pointer';
      }
    } else {
      if (this.hoveredObject) {
        this.clearHover();
        this.domElement.style.cursor = 'default';
      }
    }
  }

  findParentWithUserData(object) {
    let current = object;
    while (current) {
      if (current.userData && current.userData.type) {
        return current;
      }
      current = current.parent;
    }
    return object;
  }

  applyHoverEffect(object) {
    if (object === this.selectedObject) return;

    const material = this.getObjectMaterial(object);
    if (material) {
      if (!this.originalMaterials.has(object)) {
        this.originalMaterials.set(object, {
          color: material.color.clone(),
          emissive: material.emissive ? material.emissive.clone() : null,
          emissiveIntensity: material.emissiveIntensity || 0,
        });
      }

      if (material.emissive) {
        material.emissive.setHex(this.hoverColor);
        material.emissiveIntensity = 0.5;
      } else {
        material.color.setHex(this.hoverColor);
      }
    }
  }

  clearHover() {
    if (this.hoveredObject && this.hoveredObject !== this.selectedObject) {
      const original = this.originalMaterials.get(this.hoveredObject);
      if (original) {
        const material = this.getObjectMaterial(this.hoveredObject);
        if (material) {
          if (original.emissive && material.emissive) {
            material.emissive.copy(original.emissive);
            material.emissiveIntensity = original.emissiveIntensity;
          } else {
            material.color.copy(original.color);
          }
        }
        this.originalMaterials.delete(this.hoveredObject);
      }
    }
    this.hoveredObject = null;
  }

  selectObject(object) {
    this.unselectObject();

    this.selectedObject = object;

    const material = this.getObjectMaterial(object);
    if (material) {
      if (!this.originalMaterials.has(object)) {
        this.originalMaterials.set(object, {
          color: material.color.clone(),
          emissive: material.emissive ? material.emissive.clone() : null,
          emissiveIntensity: material.emissiveIntensity || 0,
        });
      }

      if (material.emissive) {
        material.emissive.setHex(this.selectColor);
        material.emissiveIntensity = 0.8;
      } else {
        material.color.setHex(this.selectColor);
      }
    }

    this.updateSelectionMarker(object);

    this.onSelectCallbacks.forEach(cb => cb(object));
  }

  unselectObject() {
    if (this.selectedObject) {
      const original = this.originalMaterials.get(this.selectedObject);
      if (original) {
        const material = this.getObjectMaterial(this.selectedObject);
        if (material) {
          if (original.emissive && material.emissive) {
            material.emissive.copy(original.emissive);
            material.emissiveIntensity = original.emissiveIntensity;
          } else {
            material.color.copy(original.color);
          }
        }
        this.originalMaterials.delete(this.selectedObject);
      }

      this.selectionMarker.visible = false;

      this.onUnselectCallbacks.forEach(cb => cb(this.selectedObject));
      this.selectedObject = null;
    }
  }

  updateSelectionMarker(object) {
    if (!object.parent) return;

    object.parent.add(this.selectionMarker);
    this.selectionMarker.position.copy(object.position);
    this.selectionMarker.position.y += 0.1;
    this.selectionMarker.visible = true;

    const bbox = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxSize = Math.max(size.x, size.z);
    this.selectionMarker.scale.setScalar(maxSize / 3 + 0.5);
  }

  getObjectMaterial(object) {
    if (object.material) {
      return Array.isArray(object.material) ? object.material[0] : object.material;
    }
    if (object.children && object.children.length > 0) {
      return this.getObjectMaterial(object.children[0]);
    }
    return null;
  }

  setTargetObjects(objects) {
    this.targetObjects = objects;
  }

  addTargetObject(object) {
    if (!this.targetObjects.includes(object)) {
      this.targetObjects.push(object);
    }
  }

  removeTargetObject(object) {
    const index = this.targetObjects.indexOf(object);
    if (index > -1) {
      this.targetObjects.splice(index, 1);
    }
  }

  onHover(callback) {
    this.onHoverCallbacks.push(callback);
  }

  onSelect(callback) {
    this.onSelectCallbacks.push(callback);
  }

  onUnselect(callback) {
    this.onUnselectCallbacks.push(callback);
  }

  onDoubleClick(callback) {
    if (!this.onDoubleClickCallbacks) {
      this.onDoubleClickCallbacks = [];
    }
    this.onDoubleClickCallbacks.push(callback);
  }

  update(delta, elapsed) {
    if (this.selectionMarker.visible) {
      this.selectionMarker.rotation.z += delta * 0.5;
      if (this._baseScale === undefined) {
        this._baseScale = this.selectionMarker.scale.x;
      }
      const pulse = 1 + Math.sin(elapsed * 3) * 0.1;
      this.selectionMarker.scale.setScalar(this._baseScale * pulse);
    }
  }

  dispose() {
    this.domElement.removeEventListener('mousemove', this._onMouseMove);
    this.domElement.removeEventListener('click', this._onClick);
    this.domElement.removeEventListener('dblclick', this._onDoubleClick);

    if (this.selectionMarker.parent) {
      this.selectionMarker.parent.remove(this.selectionMarker);
    }
    this.selectionMarker.geometry.dispose();
    this.selectionMarker.material.dispose();
    
    this.originalMaterials.clear();
    this.onHoverCallbacks = [];
    this.onSelectCallbacks = [];
    this.onUnselectCallbacks = [];
    if (this.onDoubleClickCallbacks) {
      this.onDoubleClickCallbacks = [];
    }
  }
}

export default PickInteractor;
