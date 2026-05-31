export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface VoxelData {
  size: Vector3;
  voxels: Uint8Array;
  palette: Float32Array;
  paletteCount: number;
  voxelCount: number;
}

export interface RenderParams {
  maxBounces: number;
  shadowSteps: number;
  aoStrength: number;
  aoRadius: number;
  exposure: number;
  resolutionScale: number;
  sunDirection: Vector3;
  sunColor: Vector3;
  sunIntensity: number;
  ambientColor: Vector3;
  gamma: number;
  tonemapStrength: number;
}

export interface CameraState {
  position: Vector3;
  target: Vector3;
  up: Vector3;
  fov: number;
  near: number;
  far: number;
}

export interface Uniforms {
  cameraPos: Float32Array;
  cameraDir: Float32Array;
  cameraRight: Float32Array;
  cameraUp: Float32Array;
  invViewProj: Float32Array;
  resolution: Float32Array;
  frameCount: number;
  voxelSize: Float32Array;
  renderParams: Float32Array;
  sunDirection: Float32Array;
  sunColor: Float32Array;
  ambientColor: Float32Array;
}

export interface SVONode {
  children: number;
  mask: number;
  color: number;
}

export interface SVOData {
  nodes: Uint32Array;
  depth: number;
  rootNode: number;
}

export interface LightMapData {
  size: Vector3;
  irradiance: Float32Array;
  radiosity: Float32Array;
}

export interface BakeParams {
  enabled: boolean;
  quality: number;
  bounces: number;
  indirectStrength: number;
  updateInterval: number;
}
