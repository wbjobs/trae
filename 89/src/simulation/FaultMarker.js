import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

class FaultMarker {
  constructor(scene, camera = null) {
    this.scene = scene;
    this.camera = camera;
    this.faultMarkers = [];
    this.warningMarkers = [];
    this.group = new THREE.Group();
    this.group.name = 'FaultMarkers';
    this.scene.add(this.group);
    this.pulseSpeed = 2.0;
    this.maxMarkers = 50;
  }

  createFaultMarker(position, options = {}) {
    const {
      type = 'fault',
      title = '故障',
      description = '',
      severity = 'high',
      id = null,
      componentId = null,
    } = options;

    const markerGroup = new THREE.Group();

    const baseGeometry = new THREE.ConeGeometry(1.5, 4, 6);
    const baseColor = severity === 'high' ? 0xff0000 : severity === 'medium' ? 0xff8800 : 0xffff00;
    const baseMaterial = new THREE.MeshBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: 0.8,
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.rotation.x = Math.PI;
    base.position.y = 2;
    markerGroup.add(base);

    const ringGeometry = new THREE.TorusGeometry(2, 0.2, 8, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: 0.6,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.5;
    markerGroup.add(ring);

    const pulseGeometry = new THREE.RingGeometry(0.5, 3, 32);
    const pulseMaterial = new THREE.MeshBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
    pulse.rotation.x = -Math.PI / 2;
    pulse.position.y = 0.1;
    markerGroup.add(pulse);

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 200;
    canvas.height = 80;

    this.drawMarkerLabel(context, title, description, baseColor);

    const texture = new THREE.CanvasTexture(canvas);
    const labelMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const label = new THREE.Sprite(labelMaterial);
    label.position.y = 6;
    label.scale.set(15, 6, 1);
    markerGroup.add(label);

    markerGroup.position.copy(position);

    markerGroup.userData = {
      type: type,
      id: id || `marker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      componentId: componentId,
      title: title,
      description: description,
      severity: severity,
      baseColor: baseColor,
      base: base,
      ring: ring,
      pulse: pulse,
      pulseMaterial: pulseMaterial,
      label: label,
      texture: texture,
      canvas: canvas,
      context: context,
      pulseScale: 1,
      pulseDirection: 1,
      createdAt: Date.now(),
    };

    this.group.add(markerGroup);

    if (type === 'fault') {
      this.faultMarkers.push(markerGroup);
    } else {
      this.warningMarkers.push(markerGroup);
    }

    const totalMarkers = this.faultMarkers.length + this.warningMarkers.length;
    if (totalMarkers > this.maxMarkers) {
      console.warn(`FaultMarker: 标记数量超过限制 (${this.maxMarkers})，清理旧标记`);
      this.cleanupOldMarkers();
    }

    return markerGroup;
  }

  cleanupOldMarkers() {
    const now = Date.now();
    const maxAge = 60000;
    
    [...this.faultMarkers, ...this.warningMarkers].forEach(marker => {
      if (now - marker.userData.createdAt > maxAge) {
        this.removeMarker(marker);
      }
    });
  }

  drawMarkerLabel(context, title, description, color) {
    const width = context.canvas.width;
    const height = context.canvas.height;

    context.clearRect(0, 0, width, height);

    context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.roundRect(context, 5, 5, width - 10, height - 10, 6);
    context.fill();

    context.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
    context.lineWidth = 2;
    this.roundRect(context, 5, 5, width - 10, height - 10, 6);
    context.stroke();

    context.font = 'bold 14px Arial';
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.fillText(title, width / 2, 28);

    if (description) {
      context.font = '12px Arial';
      context.fillStyle = '#aaaaaa';
      context.fillText(description, width / 2, 50);
    }
  }

  roundRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
  }

  addFaultAtComponent(component, options = {}) {
    const position = component.position.clone();
    return this.createFaultMarker(position, {
      ...options,
      componentId: component.userData.id,
    });
  }

  addWarningAtComponent(component, options = {}) {
    return this.addFaultAtComponent(component, {
      ...options,
      type: 'warning',
      severity: 'medium',
    });
  }

  removeMarker(marker) {
    const index = this.faultMarkers.indexOf(marker);
    if (index > -1) {
      this.faultMarkers.splice(index, 1);
    } else {
      const warnIndex = this.warningMarkers.indexOf(marker);
      if (warnIndex > -1) {
        this.warningMarkers.splice(warnIndex, 1);
      }
    }

    this.disposeMarker(marker);
  }

  removeMarkerById(id) {
    const marker = this.getMarkerById(id);
    if (marker) {
      this.removeMarker(marker);
    }
  }

  removeMarkersByComponentId(componentId) {
    const toRemove = [...this.faultMarkers, ...this.warningMarkers].filter(
      m => m.userData.componentId === componentId
    );
    toRemove.forEach(m => this.removeMarker(m));
  }

  getMarkerById(id) {
    return [...this.faultMarkers, ...this.warningMarkers].find(m => m.userData.id === id);
  }

  getMarkersByComponentId(componentId) {
    return [...this.faultMarkers, ...this.warningMarkers].filter(
      m => m.userData.componentId === componentId
    );
  }

  update(delta, elapsed) {
    const allMarkers = [...this.faultMarkers, ...this.warningMarkers];
    const cameraPos = this.camera ? this.camera.position : null;

    allMarkers.forEach(marker => {
      if (!marker.parent) return;

      if (cameraPos && marker.userData.label) {
        const distance = marker.position.distanceTo(cameraPos);
        if (distance > 150) {
          marker.userData.label.visible = false;
        } else {
          marker.userData.label.visible = true;
          const scale = Math.max(0.5, Math.min(2, distance / 50));
          marker.userData.label.scale.set(15 * scale, 6 * scale, 1);
        }
      }

      const { pulse, pulseMaterial, base, ring } = marker.userData;

      marker.userData.pulseScale += delta * this.pulseSpeed * marker.userData.pulseDirection;
      if (marker.userData.pulseScale >= 2) {
        marker.userData.pulseDirection = -1;
      } else if (marker.userData.pulseScale <= 1) {
        marker.userData.pulseDirection = 1;
      }

      if (pulse) {
        pulse.scale.setScalar(marker.userData.pulseScale);
        pulseMaterial.opacity = 0.4 * (1 - (marker.userData.pulseScale - 1) / 2);
      }

      if (ring) {
        ring.rotation.z += delta * 0.5;
      }

      if (base) {
        base.position.y = 2 + Math.sin(elapsed * 3) * 0.3;
      }
    });
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  setFaultsVisible(visible) {
    this.faultMarkers.forEach(marker => {
      marker.visible = visible;
    });
  }

  setWarningsVisible(visible) {
    this.warningMarkers.forEach(marker => {
      marker.visible = visible;
    });
  }

  clearAll() {
    const allMarkers = [...this.faultMarkers, ...this.warningMarkers];
    allMarkers.forEach(marker => this.disposeMarker(marker));

    this.faultMarkers = [];
    this.warningMarkers = [];
  }

  disposeMarker(marker) {
    marker.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });

    if (marker.userData.texture) {
      marker.userData.texture.dispose();
    }

    this.group.remove(marker);
  }

  dispose() {
    this.clearAll();
    this.scene.remove(this.group);
  }
}

export default FaultMarker;
