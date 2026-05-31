export class UIManager {
  private fpsElement: HTMLElement;
  private countElement: HTMLElement;

  private frameCount = 0;
  private lastTime = performance.now();
  private fps = 0;

  constructor() {
    this.fpsElement = document.getElementById('fps')!;
    this.countElement = document.getElementById('count')!;
  }

  public update(particleCount: number): void {
    this.frameCount++;
    const now = performance.now();
    const delta = now - this.lastTime;

    if (delta >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / delta);
      this.frameCount = 0;
      this.lastTime = now;

      this.fpsElement.textContent = this.fps.toString();
      this.countElement.textContent = particleCount.toLocaleString();
    }
  }

  public getFPS(): number {
    return this.fps;
  }
}
