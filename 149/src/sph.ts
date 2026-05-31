export interface SPHConfig {
  particleCount: number;
  smoothingRadius: number;
  restDensity: number;
  gasConstant: number;
  viscosity: number;
  gravity: number;
  dt: number;
  boundaryDamping: number;
  maxSpeed: number;
  worldSize: { width: number; height: number };
}

const DEFAULT_CONFIG: SPHConfig = {
  particleCount: 50000,
  smoothingRadius: 0.025,
  restDensity: 1000,
  gasConstant: 2000,
  viscosity: 250,
  gravity: -9.8,
  dt: 0.0008,
  boundaryDamping: -0.5,
  maxSpeed: 2.0,
  worldSize: { width: 1.0, height: 1.0 }
};

export class SPHSimulation {
  private config: SPHConfig;

  public positions: Float32Array;
  public velocities: Float32Array;
  public densities: Float32Array;
  public pressures: Float32Array;
  public accelerations: Float32Array;

  public colors: Float32Array;

  private gridCellSize: number;
  private gridCols: number;
  private gridRows: number;
  private grid: Int32Array;
  private next: Int32Array;
  private nextEmitIndex: number = 0;

  constructor(config: Partial<SPHConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.config.particleCount = Math.min(this.config.particleCount, 50000);

    const count = this.config.particleCount;
    this.positions = new Float32Array(count * 2);
    this.velocities = new Float32Array(count * 2);
    this.densities = new Float32Array(count);
    this.pressures = new Float32Array(count);
    this.accelerations = new Float32Array(count * 2);
    this.colors = new Float32Array(count * 3);

    this.gridCellSize = this.config.smoothingRadius;
    this.gridCols = Math.ceil(this.config.worldSize.width / this.gridCellSize) + 1;
    this.gridRows = Math.ceil(this.config.worldSize.height / this.gridCellSize) + 1;
    this.grid = new Int32Array(this.gridCols * this.gridRows);
    this.next = new Int32Array(count);

    this.initializeParticles();
  }

  private initializeParticles(): void {
    const count = this.config.particleCount;
    const { width, height } = this.config.worldSize;
    const margin = 0.1;

    const cols = Math.ceil(Math.sqrt(count * (width / height)));
    const rows = Math.ceil(count / cols);
    const spacingX = (width - 2 * margin) / cols;
    const spacingY = (height - 2 * margin) / rows;

    let idx = 0;
    for (let j = 0; j < rows && idx < count; j++) {
      for (let i = 0; i < cols && idx < count; i++) {
        this.positions[idx * 2] = margin + i * spacingX + (Math.random() - 0.5) * spacingX * 0.5;
        this.positions[idx * 2 + 1] = margin + j * spacingY + (Math.random() - 0.5) * spacingY * 0.5;
        this.velocities[idx * 2] = 0;
        this.velocities[idx * 2 + 1] = 0;
        idx++;
      }
    }
  }

  private buildGrid(): void {
    const count = this.config.particleCount;
    const { width, height } = this.config.worldSize;
    const h = this.config.smoothingRadius;
    this.grid.fill(-1);

    for (let i = 0; i < count; i++) {
      let x = this.positions[i * 2];
      let y = this.positions[i * 2 + 1];

      if (x < 0 || x > width || y < 0 || y > height) {
        x = Math.max(h, Math.min(width - h, x));
        y = Math.max(h, Math.min(height - h, y));
        this.positions[i * 2] = x;
        this.positions[i * 2 + 1] = y;
        this.velocities[i * 2] = -this.velocities[i * 2] * 0.1;
        this.velocities[i * 2 + 1] = -this.velocities[i * 2 + 1] * 0.1;
      }

      const col = Math.floor(x / this.gridCellSize);
      const row = Math.floor(y / this.gridCellSize);

      if (col >= 0 && col < this.gridCols && row >= 0 && row < this.gridRows) {
        const gridIdx = row * this.gridCols + col;
        this.next[i] = this.grid[gridIdx];
        this.grid[gridIdx] = i;
      } else {
        this.next[i] = -1;
      }
    }
  }

  private getNeighborParticles(x: number, y: number, radius: number): number[] {
    const neighbors: number[] = [];
    const h = this.gridCellSize;
    const minCol = Math.max(0, Math.floor((x - radius) / h));
    const maxCol = Math.min(this.gridCols - 1, Math.floor((x + radius) / h));
    const minRow = Math.max(0, Math.floor((y - radius) / h));
    const maxRow = Math.min(this.gridRows - 1, Math.floor((y + radius) / h));

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        let p = this.grid[row * this.gridCols + col];
        while (p !== -1) {
          const dx = this.positions[p * 2] - x;
          const dy = this.positions[p * 2 + 1] - y;
          if (dx * dx + dy * dy < radius * radius) {
            neighbors.push(p);
          }
          p = this.next[p];
        }
      }
    }
    return neighbors;
  }

  private poly6Kernel(r2: number, h: number): number {
    if (r2 >= h * h) return 0;
    const diff = h * h - r2;
    return 315.0 / (64.0 * Math.PI * Math.pow(h, 9)) * diff * diff * diff;
  }

  private spikyGradient(r: number, h: number): number {
    if (r >= h || r < 1e-8) return 0;
    const diff = h - r;
    return -45.0 / (Math.PI * Math.pow(h, 6)) * diff * diff;
  }

  private viscosityLaplacian(r: number, h: number): number {
    if (r >= h) return 0;
    return 45.0 / (Math.PI * Math.pow(h, 6)) * (h - r);
  }

  public computeDensityPressure(): void {
    const { particleCount, smoothingRadius, restDensity, gasConstant } = this.config;
    const h = smoothingRadius;

    for (let i = 0; i < particleCount; i++) {
      let density = 0;
      const xi = this.positions[i * 2];
      const yi = this.positions[i * 2 + 1];

      const neighbors = this.getNeighborParticles(xi, yi, h);
      for (const j of neighbors) {
        const dx = xi - this.positions[j * 2];
        const dy = yi - this.positions[j * 2 + 1];
        const r2 = dx * dx + dy * dy;
        density += this.poly6Kernel(r2, h);
      }

      this.densities[i] = Math.max(density, restDensity * 0.5);
      this.pressures[i] = gasConstant * (this.densities[i] - restDensity);
    }
  }

  public computeAccelerations(): void {
    const { particleCount, smoothingRadius, viscosity, gravity } = this.config;
    const h = smoothingRadius;

    for (let i = 0; i < particleCount; i++) {
      let pressureForceX = 0;
      let pressureForceY = 0;
      let viscosityForceX = 0;
      let viscosityForceY = 0;

      const xi = this.positions[i * 2];
      const yi = this.positions[i * 2 + 1];
      const pi = this.pressures[i];
      const di = this.densities[i];
      const vix = this.velocities[i * 2];
      const viy = this.velocities[i * 2 + 1];

      const neighbors = this.getNeighborParticles(xi, yi, h);
      for (const j of neighbors) {
        if (j === i) continue;

        const dx = xi - this.positions[j * 2];
        const dy = yi - this.positions[j * 2 + 1];
        const r = Math.sqrt(dx * dx + dy * dy);

        if (r < 1e-8 || r >= h) continue;

        const dj = this.densities[j];
        const pj = this.pressures[j];

        const pressureGrad = this.spikyGradient(r, h);
        const pressureTerm = -(pi + pj) / (2 * dj) * pressureGrad;
        pressureForceX += pressureTerm * dx / r;
        pressureForceY += pressureTerm * dy / r;

        const viscLap = this.viscosityLaplacian(r, h);
        viscosityForceX += viscosity * (this.velocities[j * 2] - vix) / dj * viscLap;
        viscosityForceY += viscosity * (this.velocities[j * 2 + 1] - viy) / dj * viscLap;
      }

      this.accelerations[i * 2] = (pressureForceX + viscosityForceX) / di;
      this.accelerations[i * 2 + 1] = (pressureForceY + viscosityForceY) / di + gravity;
    }
  }

  public integrate(): void {
    const { particleCount, dt, boundaryDamping, worldSize, maxSpeed } = this.config;
    const h = this.config.smoothingRadius * 0.5;
    const minBound = h;
    const maxBoundX = worldSize.width - h;
    const maxBoundY = worldSize.height - h;
    const maxSpeedSq = maxSpeed * maxSpeed;

    const maxSubStep = h * 0.5;
    const numSubSteps = Math.max(1, Math.ceil((maxSpeed * dt) / maxSubStep));
    const subDt = dt / numSubSteps;

    for (let step = 0; step < numSubSteps; step++) {
      for (let i = 0; i < particleCount; i++) {
        let vx = this.velocities[i * 2];
        let vy = this.velocities[i * 2 + 1];

        if (step === 0) {
          vx += this.accelerations[i * 2] * dt;
          vy += this.accelerations[i * 2 + 1] * dt;
        }

        const speedSq = vx * vx + vy * vy;
        if (speedSq > maxSpeedSq) {
          const invSpeed = maxSpeed / Math.sqrt(speedSq);
          vx *= invSpeed;
          vy *= invSpeed;
        }

        let px = this.positions[i * 2] + vx * subDt;
        let py = this.positions[i * 2 + 1] + vy * subDt;

        if (px < minBound) {
          px = minBound;
          vx = Math.abs(vx) * Math.abs(boundaryDamping);
        } else if (px > maxBoundX) {
          px = maxBoundX;
          vx = -Math.abs(vx) * Math.abs(boundaryDamping);
        }

        if (py < minBound) {
          py = minBound;
          vy = Math.abs(vy) * Math.abs(boundaryDamping);
        } else if (py > maxBoundY) {
          py = maxBoundY;
          vy = -Math.abs(vy) * Math.abs(boundaryDamping);
        }

        this.velocities[i * 2] = vx;
        this.velocities[i * 2 + 1] = vy;
        this.positions[i * 2] = px;
        this.positions[i * 2 + 1] = py;
      }
    }
  }

  public update(): void {
    this.buildGrid();
    this.computeDensityPressure();
    this.computeAccelerations();
    this.integrate();
  }

  public addParticles(x: number, y: number, count: number): void {
    const totalCount = this.config.particleCount;

    for (let k = 0; k < count; k++) {
      const i = this.nextEmitIndex;
      this.nextEmitIndex = (this.nextEmitIndex + 1) % totalCount;

      this.positions[i * 2] = x + (Math.random() - 0.5) * 0.03;
      this.positions[i * 2 + 1] = y + (Math.random() - 0.5) * 0.03;
      this.velocities[i * 2] = (Math.random() - 0.5) * 0.5;
      this.velocities[i * 2 + 1] = (Math.random() - 0.5) * 0.5;
    }
  }

  public reset(): void {
    this.nextEmitIndex = 0;
    this.initializeParticles();
  }

  public getParticleCount(): number {
    return this.config.particleCount;
  }

  public updateColors(): void {
    const count = this.config.particleCount;
    for (let i = 0; i < count; i++) {
      const vx = this.velocities[i * 2];
      const vy = this.velocities[i * 2 + 1];
      const speed = Math.sqrt(vx * vx + vy * vy);
      const t = Math.min(speed / 5, 1);

      this.colors[i * 3] = 0.1 + t * 0.9;
      this.colors[i * 3 + 1] = 0.3 + (1 - t) * 0.3;
      this.colors[i * 3 + 2] = 0.8 + (1 - t) * 0.2;
    }
  }
}
