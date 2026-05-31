/// <reference types="vite/client" />

declare module '*.wgsl?raw' {
  const content: string;
  export default content;
}

interface Navigator {
  gpu?: {
    requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
    getPreferredCanvasFormat(): GPUTextureFormat;
  };
}

interface GPUAdapter {
  requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
}

interface GPUDevice {
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
  createSampler(descriptor?: GPUSamplerDescriptor): GPUSampler;
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
  createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout;
  createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline;
  createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder;
  queue: GPUQueue;
}

interface GPUQueue {
  writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: BufferSource | ArrayBuffer, dataOffset?: number, size?: number): void;
  writeTexture(texture: GPUImageCopyTexture, data: BufferSource, dataLayout: GPUImageDataLayout, size: GPUExtent3D): void;
  submit(commandBuffers: GPUCommandBuffer[]): void;
}

interface GPUCommandEncoder {
  beginComputePass(descriptor?: GPUComputePassDescriptor): GPUComputePassEncoder;
  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder;
  copyTextureToBuffer(source: GPUImageCopyTexture, destination: GPUImageCopyBuffer, copySize: GPUExtent3D): void;
  finish(descriptor?: GPUCommandBufferDescriptor): GPUCommandBuffer;
}

interface GPUComputePassEncoder {
  setPipeline(pipeline: GPUComputePipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup, dynamicOffsets?: number[]): void;
  dispatchWorkgroups(workgroupCountX: number, workgroupCountY?: number, workgroupCountZ?: number): void;
  end(): void;
}

interface GPURenderPassEncoder {
  setPipeline(pipeline: GPURenderPipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup, dynamicOffsets?: number[]): void;
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void;
  end(): void;
}

interface GPUBuffer {
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  mapAsync(mode: number, offset?: number, size?: number): Promise<void>;
  unmap(): void;
  destroy(): void;
}

interface GPUTexture {
  createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView;
  destroy(): void;
}

interface GPUTextureView {}
interface GPUBindGroup {}
interface GPUBindGroupLayout {}
interface GPUComputePipeline {
  getBindGroupLayout(index: number): GPUBindGroupLayout;
}
interface GPURenderPipeline {
  getBindGroupLayout(index: number): GPUBindGroupLayout;
}
interface GPUShaderModule {}
interface GPUCommandBuffer {}
interface GPUSampler {}
interface GPUCanvasContext {
  configure(descriptor: GPUCanvasConfiguration): void;
  getCurrentTexture(): GPUTexture;
}

interface GPUCanvasConfiguration {
  device: GPUDevice;
  format: GPUTextureFormat;
  alphaMode?: 'opaque' | 'premultiplied';
  usage?: number;
  viewFormats?: GPUTextureFormat[];
  colorSpace?: 'srgb' | 'display-p3';
  toneMapping?: 'standard' | 'extended';
}

interface HTMLCanvasElement {
  getContext(contextId: 'webgpu'): GPUCanvasContext | null;
}

interface GPUBufferDescriptor {
  size: number;
  usage: number;
  mappedAtCreation?: boolean;
}

interface GPUTextureDescriptor {
  size: GPUExtent3D;
  format: GPUTextureFormat;
  usage: number;
  dimension?: '1d' | '2d' | '3d';
}

interface GPUSamplerDescriptor {
  magFilter?: 'nearest' | 'linear';
  minFilter?: 'nearest' | 'linear';
  addressModeU?: 'clamp-to-edge' | 'repeat' | 'mirror-repeat';
  addressModeV?: 'clamp-to-edge' | 'repeat' | 'mirror-repeat';
  addressModeW?: 'clamp-to-edge' | 'repeat' | 'mirror-repeat';
}

interface GPUBindGroupDescriptor {
  layout: GPUBindGroupLayout;
  entries: GPUBindGroupEntry[];
}

interface GPUBindGroupEntry {
  binding: number;
  resource: GPUBindingResource;
}

type GPUBindingResource = GPUSamplerBinding | GPUTextureView | GPUBufferBinding;

interface GPUSamplerBinding {
  sampler: GPUSampler;
}

interface GPUBufferBinding {
  buffer: GPUBuffer;
  offset?: number;
  size?: number;
}

interface GPUComputePipelineDescriptor {
  layout?: 'auto' | GPUBindGroupLayout[];
  compute: GPUProgrammableStage;
}

interface GPURenderPipelineDescriptor {
  layout?: 'auto' | GPUBindGroupLayout[];
  vertex: GPUVertexState;
  fragment: GPUFragmentState;
  primitive?: GPUPrimitiveState;
}

interface GPUProgrammableStage {
  module: GPUShaderModule;
  entryPoint: string;
}

interface GPUVertexState extends GPUProgrammableStage {}

interface GPUFragmentState extends GPUProgrammableStage {
  targets: (GPUColorTargetState | null)[];
}

interface GPUColorTargetState {
  format: GPUTextureFormat;
}

interface GPUPrimitiveState {
  topology?: GPUPrimitiveTopology;
}

type GPUPrimitiveTopology = 'point-list' | 'line-list' | 'line-strip' | 'triangle-list' | 'triangle-strip';

interface GPUShaderModuleDescriptor {
  code: string;
}

interface GPUCommandEncoderDescriptor {}

interface GPUComputePassDescriptor {}

interface GPURenderPassDescriptor {
  colorAttachments: GPURenderPassColorAttachment[];
}

interface GPURenderPassColorAttachment {
  view: GPUTextureView;
  clearValue?: GPUColor;
  loadOp: 'load' | 'clear';
  storeOp: 'store' | 'discard';
}

interface GPUColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface GPUCommandBufferDescriptor {}

interface GPUTextureViewDescriptor {}

interface GPUImageCopyTexture {
  texture: GPUTexture;
  mipLevel?: number;
  origin?: GPUOrigin3D;
  aspect?: 'all' | 'stencil-only' | 'depth-only';
}

interface GPUImageCopyBuffer {
  buffer: GPUBuffer;
  offset?: number;
  bytesPerRow: number;
  rowsPerImage?: number;
}

interface GPUImageDataLayout {
  offset?: number;
  bytesPerRow: number;
  rowsPerImage?: number;
}

type GPUExtent3D = number[] | { width: number; height: number; depthOrArrayLayers?: number };
type GPUOrigin3D = number[] | { x: number; y: number; z: number };

type GPUTextureFormat = 
  | 'r8uint'
  | 'r8sint'
  | 'r8unorm'
  | 'r8snorm'
  | 'r16uint'
  | 'r16sint'
  | 'r16unorm'
  | 'r16snorm'
  | 'r16float'
  | 'r32uint'
  | 'r32sint'
  | 'r32float'
  | 'rg8uint'
  | 'rg8sint'
  | 'rg8unorm'
  | 'rg8snorm'
  | 'rg16uint'
  | 'rg16sint'
  | 'rg16unorm'
  | 'rg16snorm'
  | 'rg16float'
  | 'rg32uint'
  | 'rg32sint'
  | 'rg32float'
  | 'rgba8uint'
  | 'rgba8sint'
  | 'rgba8unorm'
  | 'rgba8snorm'
  | 'rgba16uint'
  | 'rgba16sint'
  | 'rgba16unorm'
  | 'rgba16snorm'
  | 'rgba16float'
  | 'rgba32uint'
  | 'rgba32sint'
  | 'rgba32float'
  | 'bgra8unorm'
  | 'depth16unorm'
  | 'depth24plus'
  | 'depth24plus-stencil8'
  | 'depth32float'
  | 'depth32float-stencil8'
  | 'stencil8'
  | 'bc1-rgba-unorm'
  | 'bc1-rgba-unorm-srgb'
  | 'bc2-rgba-unorm'
  | 'bc2-rgba-unorm-srgb'
  | 'bc3-rgba-unorm'
  | 'bc3-rgba-unorm-srgb'
  | 'bc4-r-unorm'
  | 'bc4-r-snorm'
  | 'bc5-rg-unorm'
  | 'bc5-rg-snorm'
  | 'bc6h-rgb-ufloat'
  | 'bc6h-rgb-float'
  | 'bc7-rgba-unorm'
  | 'bc7-rgba-unorm-srgb'
  | 'etc2-rgb8unorm'
  | 'etc2-rgb8unorm-srgb'
  | 'etc2-rgb8a1unorm'
  | 'etc2-rgb8a1unorm-srgb'
  | 'etc2-rgba8unorm'
  | 'etc2-rgba8unorm-srgb'
  | 'eac-r11unorm'
  | 'eac-r11snorm'
  | 'eac-rg11unorm'
  | 'eac-rg11snorm'
  | 'astc-4x4-unorm'
  | 'astc-4x4-unorm-srgb'
  | 'astc-5x4-unorm'
  | 'astc-5x4-unorm-srgb'
  | 'astc-5x5-unorm'
  | 'astc-5x5-unorm-srgb'
  | 'astc-6x5-unorm'
  | 'astc-6x5-unorm-srgb'
  | 'astc-6x6-unorm'
  | 'astc-6x6-unorm-srgb'
  | 'astc-8x5-unorm'
  | 'astc-8x5-unorm-srgb'
  | 'astc-8x6-unorm'
  | 'astc-8x6-unorm-srgb'
  | 'astc-8x8-unorm'
  | 'astc-8x8-unorm-srgb'
  | 'astc-10x5-unorm'
  | 'astc-10x5-unorm-srgb'
  | 'astc-10x6-unorm'
  | 'astc-10x6-unorm-srgb'
  | 'astc-10x8-unorm'
  | 'astc-10x8-unorm-srgb'
  | 'astc-10x10-unorm'
  | 'astc-10x10-unorm-srgb'
  | 'astc-12x10-unorm'
  | 'astc-12x10-unorm-srgb'
  | 'astc-12x12-unorm'
  | 'astc-12x12-unorm-srgb';

interface GPURequestAdapterOptions {}
interface GPUDeviceDescriptor {}
interface GPUBindGroupLayoutDescriptor {}

declare const GPUTextureUsage: {
  COPY_SRC: number;
  COPY_DST: number;
  TEXTURE_BINDING: number;
  STORAGE_BINDING: number;
  RENDER_ATTACHMENT: number;
};

declare const GPUBufferUsage: {
  MAP_READ: number;
  MAP_WRITE: number;
  COPY_SRC: number;
  COPY_DST: number;
  INDEX: number;
  VERTEX: number;
  UNIFORM: number;
  STORAGE: number;
  INDIRECT: number;
  QUERY_RESOLVE: number;
};

declare const GPUMapMode: {
  READ: number;
  WRITE: number;
};
