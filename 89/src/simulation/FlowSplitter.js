import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

class FlowSplitter {
  constructor(scene, pipelineModel) {
    this.scene = scene;
    this.pipelineModel = pipelineModel;
    this.splitters = [];
    this.flowData = new Map();
    this.group = new THREE.Group();
    this.group.name = 'FlowSplitters';
    this.scene.add(this.group);
    this.isEnabled = true;
    this.flowMaterialCache = new Map();
  }

  createSplitter(jointId, options = {}) {
    const joint = this.pipelineModel.joints.find(j => j.userData.id === jointId);
    if (!joint) {
      console.warn(`FlowSplitter: 未找到接头 ${jointId}`);
      return null;
    }

    const connectedPipes = this.findConnectedPipes(joint);
    if (connectedPipes.length < 3) {
      console.warn(`FlowSplitter: 接头 ${jointId} 连接的管道不足3根，无法创建分流器`);
      return null;
    }

    const splitterGroup = new THREE.Group();
    splitterGroup.position.copy(joint.position);

    const baseGeometry = new THREE.CylinderGeometry(4, 5, 2, 32);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      metalness: 0.8,
      roughness: 0.3,
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.castShadow = true;
    splitterGroup.add(base);

    const displayGeometry = new THREE.CylinderGeometry(3.5, 3.5, 1.5, 32);
    const displayMaterial = new THREE.MeshBasicMaterial({
      color: 0x1a1a2e,
      transparent: true,
      opacity: 0.9,
    });
    const display = new THREE.Mesh(displayGeometry, displayMaterial);
    display.position.y = 1.75;
    splitterGroup.add(display);

    const flowIndicators = [];
    for (let i = 0; i < connectedPipes.length; i++) {
      const angle = (i / connectedPipes.length) * Math.PI * 2;
      const indicator = this.createFlowIndicator(angle, connectedPipes[i]);
      splitterGroup.add(indicator.group);
      flowIndicators.push(indicator);
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 128;

    const texture = new THREE.CanvasTexture(canvas);
    const labelMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const label = new THREE.Sprite(labelMaterial);
    label.position.y = 5;
    label.scale.set(15, 7.5, 1);
    splitterGroup.add(label);

    splitterGroup.userData = {
      type: 'flowSplitter',
      id: `splitter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      jointId: jointId,
      joint: joint,
      connectedPipes: connectedPipes,
      flowIndicators: flowIndicators,
      label: label,
      texture: texture,
      canvas: canvas,
      context: context,
      totalInflow: 0,
      totalOutflow: 0,
      splitRatios: new Array(connectedPipes.length).fill(1 / connectedPipes.length),
    };

    this.group.add(splitterGroup);
    this.splitters.push(splitterGroup);

    this.updateSplitterDisplay(splitterGroup);

    return splitterGroup;
  }

  createFlowIndicator(angle, pipe) {
    const group = new THREE.Group();
    group.position.x = Math.cos(angle) * 3;
    group.position.z = Math.sin(angle) * 3;
    group.position.y = 0.5;
    group.rotation.y = -angle;

    const pipeDirection = new THREE.Vector3()
      .subVectors(pipe.userData.end, pipe.userData.start)
      .normalize();

    const arrowGeometry = new THREE.ConeGeometry(0.6, 1.5, 8);
    const arrowMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.8,
    });
    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
    arrow.rotation.x = Math.PI / 2;
    arrow.position.z = 1;
    group.add(arrow);

    const barGeometry = new THREE.BoxGeometry(0.8, 0.3, 2);
    const barMaterial = new THREE.MeshBasicMaterial({
      color: 0x333333,
      transparent: true,
      opacity: 0.5,
    });
    const bar = new THREE.Mesh(barGeometry, barMaterial);
    bar.position.z = 1;
    group.add(bar);

    const fillGeometry = new THREE.BoxGeometry(0.7, 0.25, 1.9);
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.8,
    });
    const fill = new THREE.Mesh(fillGeometry, fillMaterial);
    fill.position.z = 0.05;
    fill.scale.x = 0.5;
    group.add(fill);

    return {
      group: group,
      arrow: arrow,
      bar: bar,
      fill: fill,
      fillMaterial: fillMaterial,
      arrowMaterial: arrowMaterial,
      pipe: pipe,
      flowRate: 0,
      flowDirection: 0,
    };
  }

  findConnectedPipes(joint) {
    const connected = [];
    const jointPos = joint.position;

    this.pipelineModel.pipes.forEach(pipe => {
      const startDist = jointPos.distanceTo(pipe.userData.start);
      const endDist = jointPos.distanceTo(pipe.userData.end);

      if (startDist < 0.5 || endDist < 0.5) {
        connected.push(pipe);
      }
    });

    return connected;
  }

  setSplitRatios(splitterId, ratios) {
    const splitter = this.splitters.find(s => s.userData.id === splitterId);
    if (!splitter) return;

    const sum = ratios.reduce((a, b) => a + b, 0);
    const normalizedRatios = ratios.map(r => r / sum);

    splitter.userData.splitRatios = normalizedRatios;
    this.updateSplitterDisplay(splitter);
  }

  calculateFlowSplit(splitter, inflowRate) {
    const { splitRatios, connectedPipes } = splitter.userData;

    const outflows = splitRatios.map(ratio => inflowRate * ratio);

    outflows.forEach((flow, index) => {
      if (connectedPipes[index]) {
        connectedPipes[index].userData.flowRate = flow;
      }
    });

    splitter.userData.totalInflow = inflowRate;
    splitter.userData.totalOutflow = inflowRate;

    return outflows;
  }

  updateSplitterDisplay(splitter) {
    const { flowIndicators, splitRatios, totalInflow, canvas, context, texture } = splitter.userData;

    flowIndicators.forEach((indicator, index) => {
      const ratio = splitRatios[index] || 0;
      const flow = totalInflow * ratio;

      indicator.flowRate = flow;
      indicator.fill.scale.x = Math.min(ratio, 1);

      const intensity = Math.min(ratio * 2, 1);
      const hue = 0.3 - intensity * 0.3;
      indicator.fillMaterial.color.setHSL(hue, 1, 0.5);
      indicator.arrowMaterial.color.setHSL(hue, 1, 0.5);

      indicator.fillMaterial.opacity = 0.5 + intensity * 0.3;
      indicator.arrowMaterial.opacity = 0.5 + intensity * 0.3;

      if (flow > 0.1) {
        indicator.arrow.position.z = 1 + Math.sin(Date.now() * 0.003) * 0.3;
      }
    });

    context.clearRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = 'rgba(0, 20, 40, 0.9)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = '#00d4ff';
    context.lineWidth = 2;
    context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

    context.font = 'bold 16px Arial';
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.fillText(`流量分配器`, canvas.width / 2, 25);

    context.font = '12px Arial';
    context.fillStyle = '#00ff88';
    context.fillText(`总流量: ${totalInflow.toFixed(2)} m³/s`, canvas.width / 2, 48);

    splitRatios.forEach((ratio, i) => {
      const y = 65 + i * 18;
      context.fillStyle = '#aaaaaa';
      context.textAlign = 'left';
      context.fillText(`出口${i + 1}:`, 20, y);
      context.fillStyle = this.getRatioColor(ratio);
      context.textAlign = 'right';
      context.fillText(`${(ratio * 100).toFixed(1)}%`, canvas.width - 20, y);
    });

    texture.needsUpdate = true;
  }

  getRatioColor(ratio) {
    if (ratio > 0.5) return '#ff4444';
    if (ratio > 0.3) return '#ffaa00';
    return '#00ff88';
  }

  simulateSplitter(splitter, inletFlow, timeStep) {
    const outflows = this.calculateFlowSplit(splitter, inletFlow);

    splitter.userData.flowIndicators.forEach((indicator, index) => {
      const pipe = indicator.pipe;
      if (pipe) {
        const pressureChange = outflows[index] * 0.1 * timeStep;
        pipe.userData.pressure = Math.max(0.1, pipe.userData.pressure + pressureChange);
      }
    });

    this.updateSplitterDisplay(splitter);

    return outflows;
  }

  update(delta, elapsed) {
    if (!this.isEnabled) return;

    this.splitters.forEach(splitter => {
      const { flowIndicators, splitRatios } = splitter.userData;

      flowIndicators.forEach((indicator, index) => {
        const ratio = splitRatios[index] || 0;
        if (ratio > 0.05 && indicator.arrow) {
          indicator.arrow.position.z = 1 + Math.sin(elapsed * 3 + index) * 0.3;
        }
      });

      this.updateSplitterDisplay(splitter);
    });
  }

  setEnabled(enabled) {
    this.isEnabled = enabled;
    this.group.visible = enabled;
  }

  getSplitterById(id) {
    return this.splitters.find(s => s.userData.id === id);
  }

  getSplittersByJointId(jointId) {
    return this.splitters.filter(s => s.userData.jointId === jointId);
  }

  dispose() {
    this.splitters.forEach(splitter => {
      splitter.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      if (splitter.userData.texture) {
        splitter.userData.texture.dispose();
      }
    });

    this.flowMaterialCache.forEach(mat => mat.dispose());
    this.flowMaterialCache.clear();

    this.scene.remove(this.group);
    this.splitters = [];
  }
}

export default FlowSplitter;
