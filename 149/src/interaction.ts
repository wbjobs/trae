export interface InteractionHandlers {
  addParticles: (x: number, y: number, count: number) => void;
  setCamera: (rotation: number, scale: number, offsetX: number, offsetY: number) => void;
  getCamera: () => { rotation: number; scale: number; offsetX: number; offsetY: number };
  reset: () => void;
}

export class Interaction {
  private canvas: HTMLCanvasElement;
  private handlers: InteractionHandlers;

  private isLeftDragging = false;
  private isRightDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  private emitTimer = 0;

  constructor(canvas: HTMLCanvasElement, handlers: InteractionHandlers) {
    this.canvas = canvas;
    this.handlers = handlers;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.onMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', this.onKeyDown.bind(this));
  }

  private onMouseDown(e: MouseEvent): void {
    e.preventDefault();

    if (e.button === 0) {
      this.isLeftDragging = true;
      this.emitParticles(e.clientX, e.clientY);
    } else if (e.button === 2) {
      this.isRightDragging = true;
    }

    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.isLeftDragging) {
      this.emitTimer++;
      if (this.emitTimer % 3 === 0) {
        this.emitParticles(e.clientX, e.clientY);
      }
    }

    if (this.isRightDragging) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;

      const camera = this.handlers.getCamera();
      const newRotation = camera.rotation + dx * 0.005;
      this.handlers.setCamera(
        newRotation,
        camera.scale,
        camera.offsetX + dy * 0.001,
        camera.offsetY
      );
    }

    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  private onMouseUp(_e: MouseEvent): void {
    this.isLeftDragging = false;
    this.isRightDragging = false;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();

    const camera = this.handlers.getCamera();
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.3, Math.min(5.0, camera.scale * scaleFactor));

    this.handlers.setCamera(
      camera.rotation,
      newScale,
      camera.offsetX,
      camera.offsetY
    );
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      e.preventDefault();
      this.handlers.reset();
      this.handlers.setCamera(0, 1.0, 0, 0);
    }
  }

  private emitParticles(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = 1.0 - (clientY - rect.top) / rect.height;

    const camera = this.handlers.getCamera();
    const cos = Math.cos(-camera.rotation);
    const sin = Math.sin(-camera.rotation);
    const worldX = (x - 0.5) / camera.scale * cos - (y - 0.5) / camera.scale * sin + 0.5;
    const worldY = (x - 0.5) / camera.scale * sin + (y - 0.5) / camera.scale * cos + 0.5;

    this.handlers.addParticles(worldX, worldY, 50);
  }
}
