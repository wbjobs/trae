import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

class FlowSimulator {
  constructor(scene) {
    this.scene = scene;
    this.pipes = [];
    this.flowArrows = [];
    this.flowLines = [];
    this.group = new THREE.Group();
    this.group.name = 'FlowSimulation';
    this.scene.add(this.group);
    this.isEnabled = true;
    this.flowSpeed = 1.0;
  }

  addPipe(pipe) {
    const arrow = this.createFlowArrow(pipe);
    const line = this.createFlowLine(pipe);

    const pipeData = {
      pipe: pipe,
      arrow: arrow,
      line: line,
      flowRate: pipe.userData.flowRate || 1.0,
      progress: Math.random(),
    };

    this.pipes.push(pipeData);
    return pipeData;
  }

  createFlowArrow(pipe) {
    const start = pipe.userData.start;
    const end = pipe.userData.end;
    const direction = new THREE.Vector3().subVectors(end, start).normalize();

    const arrowLength = 3;
    const arrowHelper = new THREE.ArrowHelper(
      direction,
      start.clone(),
      arrowLength,
      0x00ff88,
      1.5,
      1
    );

    arrowHelper.userData = {
      type: 'flowArrow',
      pipeId: pipe.userData.id,
      start: start.clone(),
      end: end.clone(),
      length: pipe.userData.length,
    };

    this.group.add(arrowHelper);
    this.flowArrows.push(arrowHelper);

    return arrowHelper;
  }

  createFlowLine(pipe) {
    const start = pipe.userData.start;
    const end = pipe.userData.end;
    const points = [];
    const segments = 20;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = new THREE.Vector3().lerpVectors(start, end, t);
      points.push(point);
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
      color: 0x00ff88,
      dashSize: 1,
      gapSize: 0.5,
      transparent: true,
      opacity: 0.6,
    });

    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();

    line.userData = {
      type: 'flowLine',
      pipeId: pipe.userData.id,
    };

    this.group.add(line);
    this.flowLines.push(line);

    return line;
  }

  update(delta, elapsed) {
    if (!this.isEnabled || this.pipes.length === 0) return;

    if (!this._tempVec) {
      this._tempVec = new THREE.Vector3();
      this._color = new THREE.Color();
    }

    const clampedDelta = Math.min(delta, 0.05);

    this.pipes.forEach(pipeData => {
      const { pipe, arrow, line, flowRate } = pipeData;

      if (!pipe || !pipe.userData) return;

      pipeData.progress += clampedDelta * flowRate * this.flowSpeed * 0.3;
      if (pipeData.progress >= 1) {
        pipeData.progress = pipeData.progress - Math.floor(pipeData.progress);
      }
      if (pipeData.progress < 0) pipeData.progress = 0;

      const start = pipe.userData.start;
      const end = pipe.userData.end;
      if (!start || !end) return;

      this._tempVec.lerpVectors(start, end, pipeData.progress);

      if (arrow) {
        arrow.position.copy(this._tempVec);
      }

      if (line && line.material) {
        line.material.dashSize = 1 + Math.sin(elapsed * 3 * flowRate) * 0.5;
        line.material.opacity = 0.4 + Math.sin(elapsed * 2) * 0.2;
      }

      const intensity = flowRate * this.flowSpeed;
      this.setFlowColor(this._color, intensity);

      if (arrow) {
        arrow.setColor(this._color);
      }
      if (line && line.material) {
        line.material.color.copy(this._color);
      }
    });
  }

  setFlowColor(color, intensity) {
    if (intensity < 0.3) {
      color.setHex(0x0066ff);
    } else if (intensity < 0.7) {
      color.setHex(0x00ff88);
    } else if (intensity < 1.2) {
      color.setHex(0xffff00);
    } else {
      color.setHex(0xff4400);
    }
  }

  setPipeFlowRate(pipeId, flowRate) {
    const pipeData = this.pipes.find(p => p.pipe.userData.id === pipeId);
    if (pipeData) {
      pipeData.flowRate = Math.max(0, flowRate);
      pipeData.pipe.userData.flowRate = pipeData.flowRate;
    }
  }

  setFlowSpeed(speed) {
    this.flowSpeed = Math.max(0, speed);
  }

  setArrowsVisible(visible) {
    this.flowArrows.forEach(arrow => {
      arrow.visible = visible;
    });
  }

  setLinesVisible(visible) {
    this.flowLines.forEach(line => {
      line.visible = visible;
    });
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  toggle() {
    this.isEnabled = !this.isEnabled;
    return this.isEnabled;
  }

  clearAll() {
    this.flowArrows.forEach(arrow => {
      this.group.remove(arrow);
    });

    this.flowLines.forEach(line => {
      if (line.geometry) line.geometry.dispose();
      if (line.material) line.material.dispose();
      this.group.remove(line);
    });

    this.flowArrows = [];
    this.flowLines = [];
    this.pipes = [];
  }

  dispose() {
    this.clearAll();
    this.scene.remove(this.group);
  }
}

export default FlowSimulator;
