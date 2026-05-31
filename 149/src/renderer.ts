import createREGL from 'regl';
import { SPHSimulation } from './sph';

export interface CameraState {
  rotation: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export class Renderer {
  private regl: any;
  private canvas: HTMLCanvasElement;
  private simulation: SPHSimulation;

  private positionBuffer: any;
  private colorBuffer: any;

  private drawParticles: any;
  private drawBackground: any;

  public camera: CameraState = {
    rotation: 0,
    scale: 1.0,
    offsetX: 0,
    offsetY: 0
  };

  private projectionMatrix: Float32Array = new Float32Array(16);

  constructor(canvas: HTMLCanvasElement, simulation: SPHSimulation) {
    this.canvas = canvas;
    this.simulation = simulation;

    this.regl = createREGL({
      canvas,
      attributes: {
        alpha: false,
        antialias: true,
        preserveDrawingBuffer: true
      },
      profile: false
    });

    this.resize();
    this.initBuffers();
    this.initShaders();
    this.updateProjection();
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
  }

  private initBuffers(): void {
    const count = this.simulation.getParticleCount();

    this.positionBuffer = this.regl.buffer({
      usage: 'dynamic',
      type: 'float',
      length: count * 2 * 4
    });

    this.colorBuffer = this.regl.buffer({
      usage: 'dynamic',
      type: 'float',
      length: count * 3 * 4
    });
  }

  private initShaders(): void {
    this.drawBackground = this.regl({
      frag: `
        precision highp float;
        void main() {
          gl_FragColor = vec4(0.02, 0.02, 0.08, 1.0);
        }
      `,
      vert: `
        attribute vec2 position;
        void main() {
          gl_Position = vec4(position, 0.0, 1.0);
        }
      `,
      attributes: {
        position: this.regl.buffer([
          [-1, -1], [1, -1], [-1, 1],
          [-1, 1], [1, -1], [1, 1]
        ])
      },
      count: 6,
      depth: { enable: false }
    });

    this.drawParticles = this.regl({
      frag: `
        precision highp float;
        varying vec3 vColor;
        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;
          float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      vert: `
        precision highp float;
        attribute vec2 position;
        attribute vec3 color;
        uniform mat4 projection;
        uniform float pointSize;
        varying vec3 vColor;
        void main() {
          vec4 pos = projection * vec4(position, 0.0, 1.0);
          gl_Position = pos;
          gl_PointSize = pointSize * pos.w;
          vColor = color;
        }
      `,
      attributes: {
        position: {
          buffer: this.positionBuffer,
          size: 2,
          type: 'float'
        },
        color: {
          buffer: this.colorBuffer,
          size: 3,
          type: 'float'
        }
      },
      uniforms: {
        projection: () => this.projectionMatrix,
        pointSize: this.regl.prop('pointSize')
      },
      primitive: 'points',
      count: this.simulation.getParticleCount(),
      depth: { enable: false },
      blend: {
        enable: true,
        func: {
          src: 'src alpha',
          dst: 'one'
        }
      }
    });
  }

  private updateProjection(): void {
    const { rotation, scale, offsetX, offsetY } = this.camera;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    this.projectionMatrix.set([
      scale * cos, scale * sin, 0, 0,
      -scale * sin, scale * cos, 0, 0,
      0, 0, 1, 0,
      offsetX, offsetY, 0, 1
    ]);
  }

  public updateBuffers(): void {
    this.positionBuffer.subdata(this.simulation.positions);
    this.colorBuffer.subdata(this.simulation.colors);
  }

  public render(pointSize: number = 3.0): void {
    this.regl.poll();

    this.updateProjection();
    this.updateBuffers();

    this.regl.clear({
      color: [0.02, 0.02, 0.08, 1],
      depth: 1
    });

    this.drawBackground();
    this.drawParticles({ pointSize });
  }

  public setCamera(rotation: number, scale: number, offsetX: number, offsetY: number): void {
    this.camera.rotation = rotation;
    this.camera.scale = scale;
    this.camera.offsetX = offsetX;
    this.camera.offsetY = offsetY;
  }

  public getCamera(): CameraState {
    return { ...this.camera };
  }

  public destroy(): void {
    this.regl.destroy();
  }

  public getAspectRatio(): number {
    return this.canvas.width / this.canvas.height;
  }
}
