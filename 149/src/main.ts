import { SPHSimulation } from './sph';
import { Renderer } from './renderer';
import { Interaction } from './interaction';
import { UIManager } from './ui';
import { SPHGPUSimulation } from './webgpu/sph-gpu';

const PARTICLE_COUNT = 50000;

interface SimulationBackend {
  update(): void;
  render?(): void;
  setCamera(rotation: number, scale: number, offsetX: number, offsetY: number): void;
  getCamera(): { rotation: number; scale: number; offsetX: number; offsetY: number };
  addParticles(x: number, y: number, count: number): void;
  reset(): void;
  getParticleCount(): number;
  updateColors?(): void;
}

class CPUBackend implements SimulationBackend {
  private simulation: SPHSimulation;
  private renderer: Renderer;

  constructor(canvas: HTMLCanvasElement) {
    this.simulation = new SPHSimulation({
      particleCount: PARTICLE_COUNT,
      smoothingRadius: 0.025,
      restDensity: 1000,
      gasConstant: 2000,
      viscosity: 250,
      gravity: -9.8,
      dt: 0.0008,
      boundaryDamping: -0.5,
      maxSpeed: 2.0,
      worldSize: { width: 1.0, height: 1.0 }
    });

    this.renderer = new Renderer(canvas, this.simulation);
  }

  update(): void {
    this.simulation.update();
  }

  render(): void {
    this.renderer.render(2.5);
  }

  setCamera(rotation: number, scale: number, offsetX: number, offsetY: number): void {
    this.renderer.setCamera(rotation, scale, offsetX, offsetY);
  }

  getCamera() {
    return this.renderer.getCamera();
  }

  addParticles(x: number, y: number, count: number): void {
    this.simulation.addParticles(x, y, count);
  }

  reset(): void {
    this.simulation.reset();
  }

  getParticleCount(): number {
    return this.simulation.getParticleCount();
  }

  updateColors(): void {
    this.simulation.updateColors();
  }
}

class GPUBackend implements SimulationBackend {
  private simulation: SPHGPUSimulation;

  constructor(simulation: SPHGPUSimulation) {
    this.simulation = simulation;
  }

  update(): void {
    this.simulation.update();
  }

  render(): void {
    this.simulation.render();
  }

  setCamera(rotation: number, scale: number, offsetX: number, offsetY: number): void {
    this.simulation.setCamera(rotation, scale, offsetX, offsetY);
  }

  getCamera() {
    return this.simulation.getCamera();
  }

  addParticles(x: number, y: number, count: number): void {
    this.simulation.addParticles(x, y, count);
  }

  reset(): void {
    this.simulation.reset();
  }

  getParticleCount(): number {
    return this.simulation.getParticleCount();
  }
}

class App {
  private backend: SimulationBackend;
  private ui: UIManager;
  private running = true;
  private useGPU: boolean;

  constructor(backend: SimulationBackend, useGPU: boolean) {
    this.backend = backend;
    this.useGPU = useGPU;
    this.ui = new UIManager();

    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    new Interaction(canvas, {
      addParticles: (x, y, count) => this.backend.addParticles(x, y, count),
      setCamera: (r, s, ox, oy) => this.backend.setCamera(r, s, ox, oy),
      getCamera: () => this.backend.getCamera(),
      reset: () => this.backend.reset()
    });

    this.updateModeIndicator();
    this.animate();
  }

  private updateModeIndicator(): void {
    const indicator = document.getElementById('mode');
    if (indicator) {
      indicator.textContent = this.useGPU ? 'WebGPU (GPU)' : 'WebGL (CPU)';
      indicator.style.color = this.useGPU ? '#7fff7f' : '#ffcc00';
    }
  }

  private animate(): void {
    if (!this.running) return;

    requestAnimationFrame(() => this.animate());

    const stepsPerFrame = this.useGPU ? 3 : 3;
    for (let i = 0; i < stepsPerFrame; i++) {
      this.backend.update();
    }

    if (this.backend.updateColors) {
      this.backend.updateColors();
    }

    if (this.backend.render) {
      this.backend.render();
    }

    this.ui.update(this.backend.getParticleCount());
  }

  public stop(): void {
    this.running = false;
  }
}

async function init(): Promise<void> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  const gpuSimulation = new SPHGPUSimulation(canvas, {
    particleCount: PARTICLE_COUNT,
    smoothingRadius: 0.025,
    restDensity: 1000,
    gasConstant: 2000,
    viscosity: 250,
    gravity: -9.8,
    dt: 0.0008,
    boundaryDamping: 0.5,
    maxSpeed: 2.0,
    worldSize: { width: 1.0, height: 1.0 }
  });

  const gpuSuccess = await gpuSimulation.init();

  if (gpuSuccess) {
    console.log('Using WebGPU backend');
    gpuSimulation.resize();
    new App(new GPUBackend(gpuSimulation), true);
  } else {
    console.log('Falling back to CPU/WebGL backend');
    new App(new CPUBackend(canvas), false);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  init();
});

window.addEventListener('resize', () => {
});
