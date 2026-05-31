import { SPHGPUConfig, DEFAULT_GPU_CONFIG, WGSL_SHADERS } from './shaders';

const WORKGROUP_SIZE = 256;

interface GPUBuffers {
  positions: GPUBuffer;
  velocities: GPUBuffer;
  forces: GPUBuffer;
  densities: GPUBuffer;
  pressures: GPUBuffer;
  gridCellCounts: GPUBuffer;
  gridCellCountsCopy: GPUBuffer;
  gridCellOffsets: GPUBuffer;
  gridParticleIndices: GPUBuffer;
  config: GPUBuffer;
  camera: GPUBuffer;
}

interface ComputePipelines {
  clearGridCounts: GPUComputePipeline;
  gridCount: GPUComputePipeline;
  gridPrefixSum: GPUComputePipeline;
  gridFill: GPUComputePipeline;
  densityPressure: GPUComputePipeline;
  forceCompute: GPUComputePipeline;
  integrate: GPUComputePipeline;
}

interface BindGroups {
  clearGridCounts: GPUBindGroup;
  gridCount: GPUBindGroup;
  gridPrefixSum: GPUBindGroup;
  gridFill: GPUBindGroup;
  densityPressure: GPUBindGroup;
  forceCompute: GPUBindGroup;
  integrate: GPUBindGroup;
  render: GPUBindGroup;
}

export class SPHGPUSimulation {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private canvas: HTMLCanvasElement;
  private config: SPHGPUConfig;
  private format: GPUTextureFormat = 'bgra8unorm';

  private buffers: GPUBuffers | null = null;
  private computePipelines: ComputePipelines | null = null;
  private bindGroups: BindGroups | null = null;
  private renderPipeline: GPURenderPipeline | null = null;

  private gridCols: number = 0;
  private gridRows: number = 0;
  private gridCellSize: number = 0;
  private totalGridCells: number = 0;

  private cameraState = {
    rotation: 0,
    scale: 1.0,
    offsetX: 0,
    offsetY: 0,
    pointSize: 2.5
  };

  private nextEmitIndex: number = 0;
  private positionsData: Float32Array;
  private velocitiesData: Float32Array;

  constructor(canvas: HTMLCanvasElement, config: Partial<SPHGPUConfig> = {}) {
    this.canvas = canvas;
    this.config = { ...DEFAULT_GPU_CONFIG, ...config };
    this.config.particleCount = Math.min(this.config.particleCount, 50000);

    this.gridCellSize = this.config.smoothingRadius;
    this.gridCols = Math.ceil(this.config.worldSize.width / this.gridCellSize) + 1;
    this.gridRows = Math.ceil(this.config.worldSize.height / this.gridCellSize) + 1;
    this.totalGridCells = this.gridCols * this.gridRows;

    this.positionsData = new Float32Array(this.config.particleCount * 2);
    this.velocitiesData = new Float32Array(this.config.particleCount * 2);

    this.initializeParticles();
  }

  async init(): Promise<boolean> {
    try {
      this.device = await this.initDevice();
      if (!this.device) return false;

      this.initContext();
      this.createBuffers();
      this.uploadInitialData();
      this.createComputePipelines();
      this.createRenderPipeline();
      this.createBindGroups();

      return true;
    } catch (e) {
      console.error('WebGPU initialization failed:', e);
      return false;
    }
  }

  private async initDevice(): Promise<GPUDevice | null> {
    if (!navigator.gpu) {
      console.warn('WebGPU is not supported in this browser');
      return null;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      console.warn('No GPU adapter found');
      return null;
    }

    const device = await adapter.requestDevice();
    return device;
  }

  private initContext(): void {
    if (!this.device) return;

    const context = this.canvas.getContext('webgpu') as GPUCanvasContext;
    if (!context) {
      throw new Error('Failed to get WebGPU context');
    }

    this.format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied'
    });

    this.context = context;
  }

  private createBuffer(size: number, usage: number): GPUBuffer {
    return this.device!.createBuffer({ size, usage });
  }

  private createBuffers(): void {
    if (!this.device) return;

    const count = this.config.particleCount;
    const floatSize = 4;
    const vec2Size = 2 * floatSize;

    this.buffers = {
      positions: this.createBuffer(count * vec2Size,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX),
      velocities: this.createBuffer(count * vec2Size,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
      forces: this.createBuffer(count * vec2Size,
        GPUBufferUsage.STORAGE),
      densities: this.createBuffer(count * floatSize,
        GPUBufferUsage.STORAGE),
      pressures: this.createBuffer(count * floatSize,
        GPUBufferUsage.STORAGE),
      gridCellCounts: this.createBuffer(this.totalGridCells * floatSize,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC),
      gridCellCountsCopy: this.createBuffer(this.totalGridCells * floatSize,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
      gridCellOffsets: this.createBuffer(this.totalGridCells * floatSize,
        GPUBufferUsage.STORAGE),
      gridParticleIndices: this.createBuffer(count * floatSize,
        GPUBufferUsage.STORAGE),
      config: this.createBuffer(20 * floatSize,
        GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST),
      camera: this.createBuffer(8 * floatSize,
        GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)
    };
  }

  private uploadInitialData(): void {
    if (!this.device || !this.buffers) return;

    this.device.queue.writeBuffer(this.buffers.positions, 0, this.positionsData as any);
    this.device.queue.writeBuffer(this.buffers.velocities, 0, this.velocitiesData as any);

    this.uploadConfig();
    this.uploadCamera();
  }

  private uploadConfig(): void {
    if (!this.device || !this.buffers) return;

    const maxSubStep = this.config.smoothingRadius * 0.25;
    const numSubSteps = Math.max(1, Math.ceil((this.config.maxSpeed * this.config.dt) / maxSubStep));

    const h = this.config.smoothingRadius;
    const POLY6_COEFF = 315.0 / (64.0 * Math.PI);
    const SPIKY_GRAD_COEFF = -45.0 / Math.PI;
    const VISC_LAP_COEFF = 45.0 / Math.PI;

    const configData = new Float32Array([
      this.config.particleCount,
      this.gridCols,
      this.gridRows,
      this.gridCellSize,
      this.config.smoothingRadius,
      this.config.restDensity,
      this.config.gasConstant,
      this.config.viscosity,
      this.config.gravity,
      this.config.dt,
      this.config.boundaryDamping,
      this.config.maxSpeed,
      this.config.worldSize.width,
      this.config.worldSize.height,
      h * h,
      numSubSteps,
      POLY6_COEFF / Math.pow(h, 9),
      SPIKY_GRAD_COEFF / Math.pow(h, 6),
      VISC_LAP_COEFF / Math.pow(h, 6),
      0
    ]);

    this.device.queue.writeBuffer(this.buffers.config, 0, configData);
  }

  private uploadCamera(): void {
    if (!this.device || !this.buffers) return;

    const cameraData = new Float32Array([
      this.cameraState.rotation,
      this.cameraState.scale,
      this.cameraState.offsetX,
      this.cameraState.offsetY,
      this.cameraState.pointSize,
      0, 0, 0
    ]);

    this.device.queue.writeBuffer(this.buffers.camera, 0, cameraData);
  }

  private createComputePipelines(): void {
    if (!this.device) return;

    const common = WGSL_SHADERS.common;

    this.computePipelines = {
      clearGridCounts: this.createComputePipeline(
        common + WGSL_SHADERS.clearGridCounts, 'clearGridCounts'
      ),
      gridCount: this.createComputePipeline(
        common + WGSL_SHADERS.gridBuild, 'gridCount'
      ),
      gridPrefixSum: this.createComputePipeline(
        common + WGSL_SHADERS.gridPrefixSum, 'gridPrefixSum'
      ),
      gridFill: this.createComputePipeline(
        common + WGSL_SHADERS.gridFill, 'gridFill'
      ),
      densityPressure: this.createComputePipeline(
        common + WGSL_SHADERS.densityPressure, 'computeDensityPressure'
      ),
      forceCompute: this.createComputePipeline(
        common + WGSL_SHADERS.forceCompute, 'computeForce'
      ),
      integrate: this.createComputePipeline(
        common + WGSL_SHADERS.integrate, 'integrate'
      )
    };
  }

  private createComputePipeline(code: string, entryPoint: string): GPUComputePipeline {
    const module = this.device!.createShaderModule({ code });

    return this.device!.createComputePipeline({
      layout: 'auto',
      compute: { module, entryPoint }
    });
  }

  private createRenderPipeline(): void {
    if (!this.device) return;

    const shaderModule = this.device.createShaderModule({
      code: WGSL_SHADERS.renderVert + WGSL_SHADERS.renderFrag
    });

    this.renderPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main'
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{
          format: this.format as GPUTextureFormat,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one',
              operation: 'add'
            },
            alpha: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add'
            }
          }
        }]
      },
      primitive: {
        topology: 'point-list'
      }
    });
  }

  private createBindGroups(): void {
    if (!this.device || !this.buffers || !this.computePipelines || !this.renderPipeline) return;

    const b = this.buffers;

    this.bindGroups = {
      clearGridCounts: this.device.createBindGroup({
        layout: this.computePipelines.clearGridCounts.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: b.gridCellCounts } },
          { binding: 1, resource: { buffer: b.config } }
        ]
      }),

      gridCount: this.device.createBindGroup({
        layout: this.computePipelines.gridCount.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: b.positions } },
          { binding: 1, resource: { buffer: b.gridCellCounts } },
          { binding: 2, resource: { buffer: b.config } }
        ]
      }),

      gridPrefixSum: this.device.createBindGroup({
        layout: this.computePipelines.gridPrefixSum.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: b.gridCellCountsCopy } },
          { binding: 1, resource: { buffer: b.gridCellOffsets } },
          { binding: 2, resource: { buffer: b.config } }
        ]
      }),

      gridFill: this.device.createBindGroup({
        layout: this.computePipelines.gridFill.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: b.positions } },
          { binding: 1, resource: { buffer: b.gridCellCounts } },
          { binding: 2, resource: { buffer: b.gridCellOffsets } },
          { binding: 3, resource: { buffer: b.gridParticleIndices } },
          { binding: 4, resource: { buffer: b.config } }
        ]
      }),

      densityPressure: this.device.createBindGroup({
        layout: this.computePipelines.densityPressure.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: b.positions } },
          { binding: 1, resource: { buffer: b.densities } },
          { binding: 2, resource: { buffer: b.pressures } },
          { binding: 3, resource: { buffer: b.gridCellOffsets } },
          { binding: 4, resource: { buffer: b.gridCellCountsCopy } },
          { binding: 5, resource: { buffer: b.gridParticleIndices } },
          { binding: 6, resource: { buffer: b.config } }
        ]
      }),

      forceCompute: this.device.createBindGroup({
        layout: this.computePipelines.forceCompute.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: b.positions } },
          { binding: 1, resource: { buffer: b.velocities } },
          { binding: 2, resource: { buffer: b.densities } },
          { binding: 3, resource: { buffer: b.pressures } },
          { binding: 4, resource: { buffer: b.forces } },
          { binding: 5, resource: { buffer: b.gridCellOffsets } },
          { binding: 6, resource: { buffer: b.gridCellCountsCopy } },
          { binding: 7, resource: { buffer: b.gridParticleIndices } },
          { binding: 8, resource: { buffer: b.config } }
        ]
      }),

      integrate: this.device.createBindGroup({
        layout: this.computePipelines.integrate.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: b.positions } },
          { binding: 1, resource: { buffer: b.velocities } },
          { binding: 2, resource: { buffer: b.forces } },
          { binding: 3, resource: { buffer: b.config } }
        ]
      }),

      render: this.device.createBindGroup({
        layout: this.renderPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: b.positions } },
          { binding: 1, resource: { buffer: b.velocities } },
          { binding: 2, resource: { buffer: b.camera } }
        ]
      })
    };
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
        this.positionsData[idx * 2] = margin + i * spacingX + (Math.random() - 0.5) * spacingX * 0.5;
        this.positionsData[idx * 2 + 1] = margin + j * spacingY + (Math.random() - 0.5) * spacingY * 0.5;
        this.velocitiesData[idx * 2] = 0;
        this.velocitiesData[idx * 2 + 1] = 0;
        idx++;
      }
    }
  }

  update(): void {
    if (!this.device || !this.buffers || !this.computePipelines || !this.bindGroups) return;

    const encoder = this.device.createCommandEncoder();

    const dispatchCount = Math.ceil(this.config.particleCount / WORKGROUP_SIZE);
    const gridDispatchCount = Math.ceil(this.totalGridCells / WORKGROUP_SIZE);

    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.computePipelines.clearGridCounts);
      pass.setBindGroup(0, this.bindGroups.clearGridCounts);
      pass.dispatchWorkgroups(gridDispatchCount);
      pass.end();
    }

    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.computePipelines.gridCount);
      pass.setBindGroup(0, this.bindGroups.gridCount);
      pass.dispatchWorkgroups(dispatchCount);
      pass.end();
    }

    encoder.copyBufferToBuffer(
      this.buffers.gridCellCounts, 0,
      this.buffers.gridCellCountsCopy, 0,
      this.totalGridCells * 4
    );

    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.computePipelines.gridPrefixSum);
      pass.setBindGroup(0, this.bindGroups.gridPrefixSum);
      pass.dispatchWorkgroups(1);
      pass.end();
    }

    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.computePipelines.clearGridCounts);
      pass.setBindGroup(0, this.bindGroups.clearGridCounts);
      pass.dispatchWorkgroups(gridDispatchCount);
      pass.end();
    }

    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.computePipelines.gridFill);
      pass.setBindGroup(0, this.bindGroups.gridFill);
      pass.dispatchWorkgroups(dispatchCount);
      pass.end();
    }

    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.computePipelines.densityPressure);
      pass.setBindGroup(0, this.bindGroups.densityPressure);
      pass.dispatchWorkgroups(dispatchCount);
      pass.end();
    }

    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.computePipelines.forceCompute);
      pass.setBindGroup(0, this.bindGroups.forceCompute);
      pass.dispatchWorkgroups(dispatchCount);
      pass.end();
    }

    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.computePipelines.integrate);
      pass.setBindGroup(0, this.bindGroups.integrate);
      pass.dispatchWorkgroups(dispatchCount);
      pass.end();
    }

    this.device.queue.submit([encoder.finish()]);
  }

  render(): void {
    if (!this.device || !this.context || !this.renderPipeline || !this.bindGroups) return;

    const encoder = this.device.createCommandEncoder();
    const view = this.context.getCurrentTexture().createView();

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view,
        clearValue: { r: 0.02, g: 0.02, b: 0.08, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    pass.setPipeline(this.renderPipeline);
    pass.setBindGroup(0, this.bindGroups.render);
    pass.draw(this.config.particleCount);
    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  setCamera(rotation: number, scale: number, offsetX: number, offsetY: number): void {
    this.cameraState.rotation = rotation;
    this.cameraState.scale = scale;
    this.cameraState.offsetX = offsetX;
    this.cameraState.offsetY = offsetY;
    this.uploadCamera();
  }

  getCamera() {
    return { ...this.cameraState };
  }

  addParticles(x: number, y: number, count: number): void {
    if (!this.device || !this.buffers) return;

    const totalCount = this.config.particleCount;

    for (let k = 0; k < count; k++) {
      const i = this.nextEmitIndex;
      this.nextEmitIndex = (this.nextEmitIndex + 1) % totalCount;

      this.positionsData[i * 2] = x + (Math.random() - 0.5) * 0.03;
      this.positionsData[i * 2 + 1] = y + (Math.random() - 0.5) * 0.03;
      this.velocitiesData[i * 2] = (Math.random() - 0.5) * 0.5;
      this.velocitiesData[i * 2 + 1] = (Math.random() - 0.5) * 0.5;
    }

    this.device.queue.writeBuffer(this.buffers.positions, 0, this.positionsData as any);
    this.device.queue.writeBuffer(this.buffers.velocities, 0, this.velocitiesData as any);
  }

  reset(): void {
    if (!this.device || !this.buffers) return;

    this.nextEmitIndex = 0;
    this.initializeParticles();

    this.device.queue.writeBuffer(this.buffers.positions, 0, this.positionsData as any);
    this.device.queue.writeBuffer(this.buffers.velocities, 0, this.velocitiesData as any);
  }

  getParticleCount(): number {
    return this.config.particleCount;
  }

  isInitialized(): boolean {
    return this.device !== null;
  }

  resize(): void {
    if (!this.device || !this.context) return;

    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';

    this.context.configure({
      device: this.device,
      format: this.format as GPUTextureFormat,
      alphaMode: 'premultiplied'
    });
  }
}
