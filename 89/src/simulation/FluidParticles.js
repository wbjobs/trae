import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

class FluidParticles {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.particles = [];
    this.particleMeshes = [];
    this.paths = [];
    this.isPlaying = true;
    this.speed = 1.0;

    this.particleCount = options.particleCount || 200;
    this.particleSize = options.particleSize || 0.8;
    this.particleColor = options.particleColor || 0x00ffff;

    this.group = new THREE.Group();
    this.group.name = 'FluidParticles';
    this.scene.add(this.group);

    this.createParticles();
  }

  createParticles() {
    const geometry = new THREE.SphereGeometry(this.particleSize, 6, 6);
    const material = new THREE.MeshBasicMaterial({
      color: this.particleColor,
      transparent: true,
      opacity: 0.8,
    });

    for (let i = 0; i < this.particleCount; i++) {
      const particleMaterial = material.clone();
      const particle = new THREE.Mesh(geometry, particleMaterial);
      particle.visible = false;
      particle.frustumCulled = true;
      this.group.add(particle);
      this.particleMeshes.push(particle);
      this.particles.push({
        mesh: particle,
        material: particleMaterial,
        pathIndex: -1,
        progress: Math.random(),
        speed: 0.3 + Math.random() * 0.4,
        baseProgress: 0,
        active: false,
      });
    }
  }

  addPath(points, options = {}) {
    if (!points || points.length < 2) {
      console.warn('FluidParticles: 路径点数量不足，跳过创建');
      return null;
    }

    const curvePoints = points.map(p => p.clone());
    const curve = new THREE.CatmullRomCurve3(curvePoints);
    curve.closed = options.closed || false;
    curve.curveType = 'catmullrom';
    curve.tension = 0.5;

    const pathData = {
      curve: curve,
      points: curvePoints,
      color: options.color || this.particleColor,
      flowRate: options.flowRate || 1.0,
      visible: true,
      particleCount: 0,
    };

    this.paths.push(pathData);
    this.distributeParticles();

    return pathData;
  }

  clearPaths() {
    this.paths = [];
    this.particles.forEach(p => {
      p.active = false;
      p.pathIndex = -1;
      p.mesh.visible = false;
    });
  }

  distributeParticles() {
    if (this.paths.length === 0) return;

    this.particles.forEach(p => {
      p.active = false;
      p.pathIndex = -1;
      p.mesh.visible = false;
    });

    this.paths.forEach(p => p.particleCount = 0);

    const particlesPerPath = Math.floor(this.particleCount / this.paths.length);
    let particleIndex = 0;

    this.paths.forEach((path, pathIdx) => {
      const count = pathIdx === this.paths.length - 1
        ? this.particleCount - particleIndex
        : particlesPerPath;

      path.particleCount = count;

      for (let i = 0; i < count; i++) {
        if (particleIndex < this.particles.length) {
          const particle = this.particles[particleIndex];
          particle.pathIndex = pathIdx;
          particle.progress = i / count;
          particle.baseProgress = particle.progress;
          particle.speed = 0.15 + Math.random() * 0.3;
          particle.active = true;
          particle.mesh.visible = true;
          particle.material.color.setHex(path.color);
          particleIndex++;
        }
      }
    });
  }

  update(delta) {
    if (!this.isPlaying || this.paths.length === 0) return;

    const clampedDelta = Math.min(delta, 0.05);

    this.particles.forEach(particle => {
      if (!particle.active || particle.pathIndex < 0) return;

      const path = this.paths[particle.pathIndex];
      if (!path || !path.visible || !path.curve) return;

      const flowFactor = Math.max(0, Math.min(path.flowRate, 3));
      particle.progress += clampedDelta * particle.speed * this.speed * flowFactor;

      if (particle.progress >= 1) {
        if (path.curve.closed) {
          particle.progress = particle.progress - Math.floor(particle.progress);
        } else {
          particle.progress = particle.progress - 1 + Math.random() * 0.1;
          if (particle.progress < 0) particle.progress = 0;
        }
      }

      if (particle.progress < 0) {
        particle.progress = 0;
      }

      try {
        const position = path.curve.getPointAt(particle.progress);
        if (position && position.isVector3) {
          particle.mesh.position.copy(position);

          const scale = 0.5 + Math.sin(particle.progress * Math.PI * 2) * 0.3;
          particle.mesh.scale.setScalar(Math.max(0.2, scale));
          particle.material.opacity = 0.4 + Math.sin(particle.progress * Math.PI * 2) * 0.3;
        }
      } catch (e) {
        console.warn('FluidParticles: 获取路径点失败', e);
        particle.active = false;
        particle.mesh.visible = false;
      }
    });
  }

  setSpeed(speed) {
    this.speed = Math.max(0, speed);
  }

  setParticleColor(color) {
    this.particleColor = color;
    this.particleMeshes.forEach(mesh => {
      mesh.material.color.setHex(color);
    });
  }

  setPathFlowRate(pathIndex, flowRate) {
    if (this.paths[pathIndex]) {
      this.paths[pathIndex].flowRate = Math.max(0, flowRate);
    }
  }

  togglePlay() {
    this.isPlaying = !this.isPlaying;
    return this.isPlaying;
  }

  play() {
    this.isPlaying = true;
  }

  pause() {
    this.isPlaying = false;
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  dispose() {
    this.particleMeshes.forEach(mesh => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    this.scene.remove(this.group);
  }
}

export default FluidParticles;
