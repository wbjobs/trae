import { VoxelData, RenderParams, CameraState, Vector3, BakeParams } from '../types';
import raytraceShader from '../shaders/raytrace.wgsl?raw';
import postprocessShader from '../shaders/postprocess.wgsl?raw';
import bakeShader from '../shaders/bake.wgsl?raw';

export class WebGPURenderer {
  private canvas: HTMLCanvasElement | null = null;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private presentationFormat: GPUTextureFormat = 'rgba8unorm';

  private uniformBuffer: GPUBuffer | null = null;
  private uniformBindGroup: GPUBindGroup | null = null;
  private computePipeline: GPUComputePipeline | null = null;

  private renderPipeline: GPURenderPipeline | null = null;
  private renderBindGroup: GPUBindGroup | null = null;
  private sampler: GPUSampler | null = null;

  private voxelTexture: GPUTexture | null = null;
  private paletteTexture: GPUTexture | null = null;
  private svoBuffer: GPUBuffer | null = null;
  private outputTexture: GPUTexture | null = null;

  private voxelData: VoxelData | null = null;
  private renderWidth = 0;
  private renderHeight = 0;
  private frameCount = 0;

  private uniformData: Float32Array = new Float32Array(128);

  private bakePipeline: GPUComputePipeline | null = null;
  private bakeUniformBuffer: GPUBuffer | null = null;
  private bakeBindGroup: GPUBindGroup | null = null;
  private irradianceTexture: GPUTexture | null = null;
  private radiosityTexture: GPUTexture | null = null;
  private bakeWorkingBuffer: GPUBuffer | null = null;
  private bakeParams: BakeParams = {
    enabled: false,
    quality: 1,
    bounces: 1,
    indirectStrength: 1.0,
    updateInterval: 30,
  };
  private lastBakeFrame = 0;
  private bakeUniformData: Float32Array = new Float32Array(16);

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;

    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser');
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('No GPU adapter found');
    }

    this.device = await adapter.requestDevice();
    this.context = canvas.getContext('webgpu')!;
    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.presentationFormat,
      alphaMode: 'premultiplied',
    });

    this.createSampler();
    this.createComputePipeline();
    this.createRenderPipeline();
    this.createBakePipeline();
    this.createBakeUniformBuffer();

    this.resize(canvas.width, canvas.height);
  }

  private createSampler(): void {
    if (!this.device) return;
    
    this.sampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
  }

  private createComputePipeline(): void {
    if (!this.device) return;

    const module = this.device.createShaderModule({
      code: raytraceShader,
    });

    this.computePipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module,
        entryPoint: 'main',
      },
    });
  }

  private createRenderPipeline(): void {
    if (!this.device) return;

    const module = this.device.createShaderModule({
      code: postprocessShader,
    });

    this.renderPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs_main',
      },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [{ format: this.presentationFormat }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });
  }

  private createBakePipeline(): void {
    if (!this.device) return;

    const module = this.device.createShaderModule({
      code: bakeShader,
    });

    this.bakePipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module,
        entryPoint: 'main',
      },
    });
  }

  private createBakeUniformBuffer(): void {
    if (!this.device) return;

    this.bakeUniformBuffer = this.device.createBuffer({
      size: this.bakeUniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private createLightMapTextures(size: { x: number; y: number; z: number }): void {
    if (!this.device) return;

    if (this.irradianceTexture) {
      this.irradianceTexture.destroy();
    }
    if (this.radiosityTexture) {
      this.radiosityTexture.destroy();
    }
    if (this.bakeWorkingBuffer) {
      this.bakeWorkingBuffer.destroy();
    }

    this.irradianceTexture = this.device.createTexture({
      dimension: '3d',
      size: [size.x, size.y, size.z],
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.radiosityTexture = this.device.createTexture({
      dimension: '3d',
      size: [size.x, size.y, size.z],
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.bakeWorkingBuffer = this.device.createBuffer({
      size: size.x * size.y * size.z * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
  }

  private updateBakeBindGroup(): void {
    if (!this.device || !this.bakePipeline || !this.bakeUniformBuffer ||
        !this.voxelTexture || !this.paletteTexture ||
        !this.irradianceTexture || !this.radiosityTexture || !this.bakeWorkingBuffer) {
      return;
    }

    this.bakeBindGroup = this.device.createBindGroup({
      layout: this.bakePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.bakeUniformBuffer } },
        { binding: 1, resource: this.voxelTexture.createView() },
        { binding: 2, resource: this.paletteTexture.createView() },
        { binding: 3, resource: this.irradianceTexture.createView() },
        { binding: 4, resource: this.radiosityTexture.createView() },
        { binding: 5, resource: { buffer: this.bakeWorkingBuffer } },
      ],
    });
  }

  updateBakeUniforms(params: RenderParams): void {
    if (!this.device || !this.bakeUniformBuffer || !this.voxelData) return;

    let offset = 0;

    this.bakeUniformData[offset++] = this.voxelData.size.x;
    this.bakeUniformData[offset++] = this.voxelData.size.y;
    this.bakeUniformData[offset++] = this.voxelData.size.z;
    offset++;

    const sunLen = Math.sqrt(
      params.sunDirection.x ** 2 + params.sunDirection.y ** 2 + params.sunDirection.z ** 2
    );
    this.bakeUniformData[offset++] = params.sunDirection.x / sunLen;
    this.bakeUniformData[offset++] = params.sunDirection.y / sunLen;
    this.bakeUniformData[offset++] = params.sunDirection.z / sunLen;
    this.bakeUniformData[offset++] = params.sunIntensity;

    this.bakeUniformData[offset++] = params.sunColor.x;
    this.bakeUniformData[offset++] = params.sunColor.y;
    this.bakeUniformData[offset++] = params.sunColor.z;
    offset++;

    this.bakeUniformData[offset++] = params.ambientColor.x;
    this.bakeUniformData[offset++] = params.ambientColor.y;
    this.bakeUniformData[offset++] = params.ambientColor.z;
    this.bakeUniformData[offset++] = this.bakeParams.quality;
    this.bakeUniformData[offset++] = this.bakeParams.bounces;
    this.bakeUniformData[offset++] = this.bakeParams.indirectStrength;

    this.device.queue.writeBuffer(this.bakeUniformBuffer, 0, this.bakeUniformData);
  }

  bakeLighting(params: RenderParams): void {
    if (!this.device || !this.bakePipeline || !this.bakeBindGroup || !this.voxelData) {
      return;
    }

    this.updateBakeUniforms(params);

    const commandEncoder = this.device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.bakePipeline);
    computePass.setBindGroup(0, this.bakeBindGroup);
    
    const groupsX = Math.ceil(this.voxelData.size.x / 4);
    const groupsY = Math.ceil(this.voxelData.size.y / 4);
    const groupsZ = Math.ceil(this.voxelData.size.z / 4);
    computePass.dispatchWorkgroups(groupsX, groupsY, groupsZ);
    computePass.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  setBakeParams(params: Partial<BakeParams>): void {
    this.bakeParams = { ...this.bakeParams, ...params };
  }

  getBakeParams(): BakeParams {
    return { ...this.bakeParams };
  }

  shouldBake(): boolean {
    if (!this.bakeParams.enabled) return false;
    if (this.frameCount - this.lastBakeFrame < this.bakeParams.updateInterval) return false;
    return true;
  }

  markBakeComplete(): void {
    this.lastBakeFrame = this.frameCount;
  }

  setVoxelData(data: VoxelData): void {
    this.voxelData = data;
    this.uploadVoxelData(data);
  }

  private uploadVoxelData(data: VoxelData): void {
    if (!this.device) return;

    if (this.voxelTexture) {
      this.voxelTexture.destroy();
    }

    this.voxelTexture = this.device.createTexture({
      dimension: '3d',
      size: [data.size.x, data.size.y, data.size.z],
      format: 'r8uint',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    this.device.queue.writeTexture(
      { texture: this.voxelTexture },
      data.voxels as BufferSource,
      { bytesPerRow: data.size.x, rowsPerImage: data.size.y },
      [data.size.x, data.size.y, data.size.z]
    );

    if (this.paletteTexture) {
      this.paletteTexture.destroy();
    }

    this.paletteTexture = this.device.createTexture({
      dimension: '1d',
      size: [256],
      format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    this.device.queue.writeTexture(
      { texture: this.paletteTexture },
      data.palette.slice(0, 256 * 4) as BufferSource,
      { bytesPerRow: 256 * 16, rowsPerImage: 1 },
      [256, 1]
    );

    this.createLightMapTextures(data.size);
    this.updateBindGroup();
    this.updateBakeBindGroup();
  }

  setSVONodes(nodes: Uint32Array): void {
    if (!this.device) return;

    if (this.svoBuffer) {
      this.svoBuffer.destroy();
    }

    this.svoBuffer = this.device.createBuffer({
      size: nodes.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    new Uint32Array(this.svoBuffer.getMappedRange()).set(nodes);
    this.svoBuffer.unmap();

    this.updateBindGroup();
  }

  resize(width: number, height: number): void {
    if (!this.device || !this.canvas) return;

    this.canvas.width = width;
    this.canvas.height = height;

    this.renderWidth = width;
    this.renderHeight = height;

    if (this.outputTexture) {
      this.outputTexture.destroy();
    }

    this.outputTexture = this.device.createTexture({
      size: [this.renderWidth, this.renderHeight],
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.createUniformBuffer();
    this.updateBindGroup();
    this.updateRenderBindGroup();
  }

  private createUniformBuffer(): void {
    if (!this.device) return;

    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
    }

    this.uniformBuffer = this.device.createBuffer({
      size: this.uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private updateBindGroup(): void {
    if (!this.device || !this.uniformBuffer || !this.voxelTexture || 
        !this.paletteTexture || !this.outputTexture) {
      return;
    }

    const entries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: this.uniformBuffer } },
      { binding: 1, resource: this.voxelTexture.createView() },
      { binding: 2, resource: this.paletteTexture.createView() },
      { binding: 4, resource: this.outputTexture.createView() },
    ];

    if (this.svoBuffer) {
      entries.push({
        binding: 3,
        resource: { buffer: this.svoBuffer },
      });
    } else {
      const dummyBuffer = this.device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.STORAGE,
      });
      entries.push({
        binding: 3,
        resource: { buffer: dummyBuffer },
      });
    }

    if (this.irradianceTexture && this.radiosityTexture) {
      entries.push({
        binding: 5,
        resource: this.irradianceTexture.createView(),
      });
      entries.push({
        binding: 6,
        resource: this.radiosityTexture.createView(),
      });
    } else {
      const dummyTex = this.device.createTexture({
        dimension: '3d',
        size: [1, 1, 1],
        format: 'rgba16float',
        usage: GPUTextureUsage.TEXTURE_BINDING,
      });
      entries.push({
        binding: 5,
        resource: dummyTex.createView(),
      });
      entries.push({
        binding: 6,
        resource: dummyTex.createView(),
      });
    }

    this.uniformBindGroup = this.device.createBindGroup({
      layout: this.computePipeline!.getBindGroupLayout(0),
      entries,
    });
  }

  private updateRenderBindGroup(): void {
    if (!this.device || !this.outputTexture || !this.sampler || !this.renderPipeline) return;

    this.renderBindGroup = this.device.createBindGroup({
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.outputTexture.createView() },
        { binding: 1, resource: this.sampler },
      ],
    });
  }

  updateUniforms(
    camera: CameraState,
    params: RenderParams,
    cameraMatrices: { dir: Vector3; right: Vector3; up: Vector3 }
  ): void {
    if (!this.device || !this.voxelData) return;

    let offset = 0;

    this.uniformData[offset++] = camera.position.x;
    this.uniformData[offset++] = camera.position.y;
    this.uniformData[offset++] = camera.position.z;
    offset++;

    this.uniformData[offset++] = cameraMatrices.dir.x;
    this.uniformData[offset++] = cameraMatrices.dir.y;
    this.uniformData[offset++] = cameraMatrices.dir.z;
    offset++;

    this.uniformData[offset++] = cameraMatrices.right.x;
    this.uniformData[offset++] = cameraMatrices.right.y;
    this.uniformData[offset++] = cameraMatrices.right.z;
    offset++;

    this.uniformData[offset++] = cameraMatrices.up.x;
    this.uniformData[offset++] = cameraMatrices.up.y;
    this.uniformData[offset++] = cameraMatrices.up.z;
    offset++;

    offset += 16;

    this.uniformData[offset++] = this.renderWidth;
    this.uniformData[offset++] = this.renderHeight;
    this.uniformData[offset++] = this.frameCount;
    offset++;

    this.uniformData[offset++] = this.voxelData.size.x;
    this.uniformData[offset++] = this.voxelData.size.y;
    this.uniformData[offset++] = this.voxelData.size.z;
    offset++;

    this.uniformData[offset++] = params.maxBounces;
    this.uniformData[offset++] = params.shadowSteps;
    this.uniformData[offset++] = params.aoStrength;
    this.uniformData[offset++] = params.aoRadius;
    this.uniformData[offset++] = params.exposure;
    this.uniformData[offset++] = params.gamma;
    this.uniformData[offset++] = params.tonemapStrength;
    offset++;

    const sunLen = Math.sqrt(
      params.sunDirection.x ** 2 + params.sunDirection.y ** 2 + params.sunDirection.z ** 2
    );
    this.uniformData[offset++] = params.sunDirection.x / sunLen;
    this.uniformData[offset++] = params.sunDirection.y / sunLen;
    this.uniformData[offset++] = params.sunDirection.z / sunLen;
    this.uniformData[offset++] = params.sunIntensity;

    this.uniformData[offset++] = params.sunColor.x;
    this.uniformData[offset++] = params.sunColor.y;
    this.uniformData[offset++] = params.sunColor.z;
    offset++;

    this.uniformData[offset++] = params.ambientColor.x;
    this.uniformData[offset++] = params.ambientColor.y;
    this.uniformData[offset++] = params.ambientColor.z;
    this.uniformData[offset++] = this.bakeParams.enabled ? 1.0 : 0.0;
    this.uniformData[offset++] = this.bakeParams.indirectStrength;

    this.device.queue.writeBuffer(this.uniformBuffer!, 0, this.uniformData as BufferSource);
    this.frameCount++;
  }

  render(): void {
    if (!this.device || !this.context || !this.computePipeline || !this.renderPipeline ||
        !this.uniformBindGroup || !this.renderBindGroup) {
      return;
    }

    const commandEncoder = this.device.createCommandEncoder();

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.uniformBindGroup);
    
    const workgroupsX = Math.ceil(this.renderWidth / 8);
    const workgroupsY = Math.ceil(this.renderHeight / 8);
    computePass.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
    computePass.end();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, this.renderBindGroup);
    renderPass.draw(6, 1, 0, 0);
    renderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  async exportHDR(width: number, height: number): Promise<ArrayBuffer> {
    if (!this.device || !this.outputTexture) {
      throw new Error('Renderer not initialized');
    }

    const readbackBuffer = this.device.createBuffer({
      size: width * height * 8,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const commandEncoder = this.device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
      { texture: this.outputTexture },
      { buffer: readbackBuffer, bytesPerRow: width * 8, rowsPerImage: height },
      [width, height, 1]
    );
    this.device.queue.submit([commandEncoder.finish()]);

    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(readbackBuffer.getMappedRange());
    
    const hdrData = this.convertToHDR(data, width, height);
    
    readbackBuffer.unmap();
    readbackBuffer.destroy();

    return hdrData;
  }

  private convertToHDR(rgbaFloat: Float32Array, width: number, height: number): ArrayBuffer {
    const hdrHeader = new TextEncoder().encode(
      `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`
    );

    const pixelCount = width * height;
    const rgbeData = new Uint8Array(pixelCount * 4);

    for (let i = 0; i < pixelCount; i++) {
      const r = Math.max(0, rgbaFloat[i * 4]);
      const g = Math.max(0, rgbaFloat[i * 4 + 1]);
      const b = Math.max(0, rgbaFloat[i * 4 + 2]);

      const maxVal = Math.max(r, g, b);
      
      if (maxVal < 1e-32) {
        rgbeData[i * 4] = 0;
        rgbeData[i * 4 + 1] = 0;
        rgbeData[i * 4 + 2] = 0;
        rgbeData[i * 4 + 3] = 0;
      } else {
        const exp = Math.ceil(Math.log2(maxVal));
        const scale = Math.pow(2, -exp) * 256;
        rgbeData[i * 4] = Math.min(255, Math.floor(r * scale));
        rgbeData[i * 4 + 1] = Math.min(255, Math.floor(g * scale));
        rgbeData[i * 4 + 2] = Math.min(255, Math.floor(b * scale));
        rgbeData[i * 4 + 3] = exp + 128;
      }
    }

    const result = new Uint8Array(hdrHeader.length + rgbeData.length);
    result.set(hdrHeader, 0);
    result.set(rgbeData, hdrHeader.length);

    return result.buffer;
  }

  getDevice(): GPUDevice | null {
    return this.device;
  }

  getOutputTexture(): GPUTexture | null {
    return this.outputTexture;
  }

  destroy(): void {
    if (this.voxelTexture) this.voxelTexture.destroy();
    if (this.paletteTexture) this.paletteTexture.destroy();
    if (this.outputTexture) this.outputTexture.destroy();
    if (this.uniformBuffer) this.uniformBuffer.destroy();
    if (this.svoBuffer) this.svoBuffer.destroy();
  }
}
