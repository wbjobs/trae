import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

class PressureVisualizer {
  constructor(scene, renderer, camera) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.pressureLabels = [];
    this.pressureIndicators = [];
    this.group = new THREE.Group();
    this.group.name = 'PressureVisualization';
    this.scene.add(this.group);
    this.showLabels = true;
    this.showIndicators = true;
  }

  createPressureLabel(position, value, options = {}) {
    const {
      unit = 'MPa',
      decimals = 2,
      color = 0xffffff,
      backgroundColor = 'rgba(0, 20, 40, 0.85)',
      fontSize = 14,
      offsetY = 5,
      minScale = 6,
      maxScale = 18,
    } = options;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 180;
    canvas.height = 60;

    this.drawLabel(context, value, unit, decimals, color, backgroundColor, fontSize);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.position.y += offsetY;
    sprite.scale.set(12, 4, 1);

    sprite.userData = {
      type: 'pressureLabel',
      value: value,
      unit: unit,
      decimals: decimals,
      color: color,
      backgroundColor: backgroundColor,
      fontSize: fontSize,
      texture: texture,
      canvas: canvas,
      context: context,
      basePosition: position.clone(),
      offsetY: offsetY,
      minScale: minScale,
      maxScale: maxScale,
      baseScale: 12,
    };

    this.pressureLabels.push(sprite);
    this.group.add(sprite);

    return sprite;
  }

  drawLabel(context, value, unit, decimals, color, backgroundColor, fontSize) {
    const width = context.canvas.width;
    const height = context.canvas.height;

    context.clearRect(0, 0, width, height);

    context.fillStyle = backgroundColor;
    this.roundRect(context, 5, 5, width - 10, height - 10, 8);
    context.fill();

    context.strokeStyle = this.getPressureColor(value);
    context.lineWidth = 2;
    this.roundRect(context, 5, 5, width - 10, height - 10, 8);
    context.stroke();

    context.font = `bold ${fontSize}px Arial`;
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    const displayValue = value.toFixed(decimals);
    context.fillText(`压力: ${displayValue} ${unit}`, width / 2, height / 2);
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

  getPressureColor(pressure) {
    if (pressure < 1.0) return '#00ff00';
    if (pressure < 2.5) return '#ffff00';
    if (pressure < 4.0) return '#ff8800';
    return '#ff0000';
  }

  updatePressureLabel(sprite, newValue) {
    if (!sprite.userData || sprite.userData.type !== 'pressureLabel') return;

    sprite.userData.value = newValue;
    const { value, unit, decimals, color, backgroundColor, fontSize, texture, context } = sprite.userData;

    this.drawLabel(context, value, unit, decimals, color, backgroundColor, fontSize);
    texture.needsUpdate = true;
  }

  createPressureIndicator(position, options = {}) {
    const {
      radius = 1.5,
      height = 0.5,
      initialValue = 0,
      maxValue = 5,
    } = options;

    const group = new THREE.Group();

    const baseGeometry = new THREE.CylinderGeometry(radius, radius, height, 32);
    const baseMaterial = new THREE.MeshBasicMaterial({
      color: 0x333333,
      transparent: true,
      opacity: 0.8,
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = height / 2;
    group.add(base);

    const ringGeometry = new THREE.TorusGeometry(radius * 0.8, 0.2, 8, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.9,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = height / 2;
    group.add(ring);

    const fillGeometry = new THREE.CylinderGeometry(radius * 0.7, radius * 0.7, height * 0.8, 32);
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: this.getPressureColor(initialValue),
      transparent: true,
      opacity: 0.8,
    });
    const fill = new THREE.Mesh(fillGeometry, fillMaterial);
    fill.position.y = height / 2;
    const fillScale = Math.min(initialValue / maxValue, 1);
    fill.scale.x = fillScale;
    fill.scale.z = fillScale;
    group.add(fill);

    group.position.copy(position);
    group.userData = {
      type: 'pressureIndicator',
      value: initialValue,
      maxValue: maxValue,
      ring: ring,
      fill: fill,
      fillMaterial: fillMaterial,
    };

    this.pressureIndicators.push(group);
    this.group.add(group);

    return group;
  }

  updatePressureIndicator(indicator, newValue) {
    if (!indicator.userData || indicator.userData.type !== 'pressureIndicator') return;

    indicator.userData.value = Math.min(newValue, indicator.userData.maxValue);
    const { value, maxValue, fill, fillMaterial } = indicator.userData;

    const fillScale = Math.min(value / maxValue, 1);
    fill.scale.x = fillScale;
    fill.scale.z = fillScale;

    fillMaterial.color.setStyle(this.getPressureColor(value));
  }

  addPipePressureData(pipe, options = {}) {
    let midPoint;
    if (pipe.userData.start && pipe.userData.end) {
      midPoint = pipe.userData.start.clone().add(pipe.userData.end).multiplyScalar(0.5);
    } else {
      midPoint = pipe.position.clone();
    }
    
    const pressure = pipe.userData.pressure || 0;

    const label = this.createPressureLabel(midPoint, pressure, options);
    label.userData.pipeId = pipe.userData.id;

    const indicator = this.createPressureIndicator(midPoint, {
      initialValue: pressure,
      ...options,
    });
    indicator.userData.pipeId = pipe.userData.id;
    indicator.userData.basePosition = midPoint.clone();

    return { label, indicator };
  }

  updatePressureForPipe(pipeId, newPressure) {
    this.pressureLabels.forEach(label => {
      if (label.userData.pipeId === pipeId) {
        this.updatePressureLabel(label, newPressure);
      }
    });

    this.pressureIndicators.forEach(indicator => {
      if (indicator.userData.pipeId === pipeId) {
        this.updatePressureIndicator(indicator, newPressure);
      }
    });
  }

  update(delta, elapsed) {
    if (this.camera) {
      const cameraPos = this.camera.position;

      this.pressureLabels.forEach(label => {
        if (!label.userData.basePosition) return;

        const distance = label.position.distanceTo(cameraPos);
        const userData = label.userData;
        
        const scaleFactor = Math.max(
          userData.minScale / userData.baseScale,
          Math.min(
            userData.maxScale / userData.baseScale,
            distance / 50
          )
        );

        label.scale.x = userData.baseScale * scaleFactor;
        label.scale.y = userData.baseScale * scaleFactor / 3;

        if (distance > 200) {
          label.visible = false;
        } else {
          label.visible = this.showLabels;
        }
      });
    }

    this.pressureIndicators.forEach(indicator => {
      if (indicator.userData.ring) {
        indicator.userData.ring.rotation.z += delta * 0.5;
      }
    });
  }

  setLabelsVisible(visible) {
    this.showLabels = visible;
    this.pressureLabels.forEach(label => {
      label.visible = visible;
    });
  }

  setIndicatorsVisible(visible) {
    this.showIndicators = visible;
    this.pressureIndicators.forEach(indicator => {
      indicator.visible = visible;
    });
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  clearAll() {
    this.pressureLabels.forEach(label => {
      if (label.userData.texture) label.userData.texture.dispose();
      if (label.userData.material) label.userData.material.dispose();
      this.group.remove(label);
    });

    this.pressureIndicators.forEach(indicator => {
      indicator.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.group.remove(indicator);
    });

    this.pressureLabels = [];
    this.pressureIndicators = [];
  }

  dispose() {
    this.clearAll();
    this.scene.remove(this.group);
  }
}

export default PressureVisualizer;
