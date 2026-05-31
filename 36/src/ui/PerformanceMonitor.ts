export class PerformanceMonitor {
  private fpsElement: HTMLElement | null = null;
  private frameTimeElement: HTMLElement | null = null;
  private voxelCountElement: HTMLElement | null = null;

  private frameTimes: number[] = [];
  private maxFrames = 60;
  private lastFrameTime = performance.now();

  constructor() {
    this.fpsElement = document.getElementById('fpsValue');
    this.frameTimeElement = document.getElementById('frameTime');
    this.voxelCountElement = document.getElementById('voxelCount');
  }

  update(): void {
    const now = performance.now();
    const delta = now - this.lastFrameTime;
    this.lastFrameTime = now;

    this.frameTimes.push(delta);
    if (this.frameTimes.length > this.maxFrames) {
      this.frameTimes.shift();
    }

    const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const fps = 1000 / avgFrameTime;

    if (this.fpsElement) {
      this.fpsElement.textContent = fps.toFixed(0);
    }
    if (this.frameTimeElement) {
      this.frameTimeElement.textContent = `${avgFrameTime.toFixed(1)} ms`;
    }
  }

  setVoxelCount(count: number): void {
    if (this.voxelCountElement) {
      if (count >= 1000000) {
        this.voxelCountElement.textContent = `${(count / 1000000).toFixed(1)}M`;
      } else if (count >= 1000) {
        this.voxelCountElement.textContent = `${(count / 1000).toFixed(0)}K`;
      } else {
        this.voxelCountElement.textContent = count.toString();
      }
    }
  }

  reset(): void {
    this.frameTimes = [];
    this.lastFrameTime = performance.now();
  }
}
