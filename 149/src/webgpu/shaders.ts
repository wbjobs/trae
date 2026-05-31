export interface SPHGPUConfig {
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

export const DEFAULT_GPU_CONFIG: SPHGPUConfig = {
  particleCount: 50000,
  smoothingRadius: 0.025,
  restDensity: 1000,
  gasConstant: 2000,
  viscosity: 250,
  gravity: -9.8,
  dt: 0.0008,
  boundaryDamping: 0.5,
  maxSpeed: 2.0,
  worldSize: { width: 1.0, height: 1.0 }
};

export const WGSL_SHADERS = {
  common: `
struct Particle {
  position: vec2f,
  velocity: vec2f,
  force: vec2f,
  density: f32,
  pressure: f32,
};

struct Config {
  particleCount: u32,
  gridCols: u32,
  gridRows: u32,
  gridCellSize: f32,
  smoothingRadius: f32,
  restDensity: f32,
  gasConstant: f32,
  viscosity: f32,
  gravity: f32,
  dt: f32,
  boundaryDamping: f32,
  maxSpeed: f32,
  worldWidth: f32,
  worldHeight: f32,
  hSquared: f32,
  numSubSteps: u32,
  poly6Normalizer: f32,
  spikyNormalizer: f32,
  viscNormalizer: f32,
  padding: f32,
};

const POLY6_COEFF: f32 = 315.0 / (64.0 * 3.141592653589793);
const SPIKY_GRAD_COEFF: f32 = -45.0 / (3.141592653589793);
const VISC_LAP_COEFF: f32 = 45.0 / (3.141592653589793);

fn poly6Kernel(r2: f32, h2: f32) -> f32 {
  if (r2 >= h2) { return 0.0; }
  let diff = h2 - r2;
  return config.poly6Normalizer * diff * diff * diff;
}

fn spikyGradient(r: f32, h: f32) -> f32 {
  if (r >= h || r < 1e-6) { return 0.0; }
  let diff = h - r;
  return config.spikyNormalizer * diff * diff;
}

fn viscosityLaplacian(r: f32, h: f32) -> f32 {
  if (r >= h) { return 0.0; }
  return config.viscNormalizer * (h - r);
}

fn gridIndex(col: u32, row: u32, cols: u32) -> u32 {
  return row * cols + col;
}

fn worldToGrid(pos: vec2f, cellSize: f32) -> vec2u {
  return vec2u(
    u32(clamp(pos.x / cellSize, 0.0, 1e6)),
    u32(clamp(pos.y / cellSize, 0.0, 1e6))
  );
}
`,

  gridBuild: `
@group(0) @binding(0) var<storage, read> positions: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> gridCellCounts: array<atomic<u32>>;
@group(0) @binding(2) var<uniform> config: Config;

@compute @workgroup_size(256)
fn gridCount(@builtin(global_invocation_id) global_id: vec3u) {
  let idx = global_id.x;
  if (idx >= config.particleCount) { return; }
  
  let pos = positions[idx];
  let col = u32(clamp(pos.x / config.gridCellSize, 0.0, f32(config.gridCols - 1)));
  let row = u32(clamp(pos.y / config.gridCellSize, 0.0, f32(config.gridRows - 1)));
  let cellIdx = gridIndex(col, row, config.gridCols);
  
  atomicAdd(&gridCellCounts[cellIdx], 1u);
}
`,

  gridPrefixSum: `
@group(0) @binding(0) var<storage, read_write> gridCellCounts: array<u32>;
@group(0) @binding(1) var<storage, read_write> gridCellOffsets: array<u32>;
@group(0) @binding(2) var<uniform> config: Config;

@compute @workgroup_size(1)
fn gridPrefixSum(@builtin(global_invocation_id) global_id: vec3u) {
  let totalCells = config.gridCols * config.gridRows;
  var prefix: u32 = 0u;
  
  for (var i: u32 = 0u; i < totalCells; i++) {
    gridCellOffsets[i] = prefix;
    prefix += gridCellCounts[i];
  }
}
`,

  gridFill: `
@group(0) @binding(0) var<storage, read> positions: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> gridCellCounts: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read> gridCellOffsets: array<u32>;
@group(0) @binding(3) var<storage, read_write> gridParticleIndices: array<u32>;
@group(0) @binding(4) var<uniform> config: Config;

@compute @workgroup_size(256)
fn gridFill(@builtin(global_invocation_id) global_id: vec3u) {
  let idx = global_id.x;
  if (idx >= config.particleCount) { return; }
  
  let pos = positions[idx];
  let col = u32(clamp(pos.x / config.gridCellSize, 0.0, f32(config.gridCols - 1)));
  let row = u32(clamp(pos.y / config.gridCellSize, 0.0, f32(config.gridRows - 1)));
  let cellIdx = gridIndex(col, row, config.gridCols);
  
  let offset = gridCellOffsets[cellIdx];
  let localIdx = atomicAdd(&gridCellCounts[cellIdx], 1u);
  gridParticleIndices[offset + localIdx] = idx;
}
`,

  densityPressure: `
@group(0) @binding(0) var<storage, read> positions: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> densities: array<f32>;
@group(0) @binding(2) var<storage, read_write> pressures: array<f32>;
@group(0) @binding(3) var<storage, read> gridCellOffsets: array<u32>;
@group(0) @binding(4) var<storage, read> gridParticleCount: array<u32>;
@group(0) @binding(5) var<storage, read> gridParticleIndices: array<u32>;
@group(0) @binding(6) var<uniform> config: Config;

@compute @workgroup_size(256)
fn computeDensityPressure(@builtin(global_invocation_id) global_id: vec3u) {
  let idx = global_id.x;
  if (idx >= config.particleCount) { return; }
  
  let pos = positions[idx];
  let cellSize = config.gridCellSize;
  let col = u32(clamp(pos.x / cellSize, 0.0, f32(config.gridCols - 1)));
  let row = u32(clamp(pos.y / cellSize, 0.0, f32(config.gridRows - 1)));
  
  var density: f32 = 0.0;
  
  let minCol = max(0u, col - 1u);
  let maxCol = min(config.gridCols - 1u, col + 1u);
  let minRow = max(0u, row - 1u);
  let maxRow = min(config.gridRows - 1u, row + 1u);
  let h2 = config.hSquared;
  
  for (var r: u32 = minRow; r <= maxRow; r++) {
    for (var c: u32 = minCol; c <= maxCol; c++) {
      let cellIdx = gridIndex(c, r, config.gridCols);
      let offset = gridCellOffsets[cellIdx];
      let count = gridParticleCount[cellIdx];
      
      for (var k: u32 = 0u; k < count; k++) {
        let j = gridParticleIndices[offset + k];
        let diff = pos - positions[j];
        let r2 = dot(diff, diff);
        density += poly6Kernel(r2, h2);
      }
    }
  }
  
  densities[idx] = max(density, config.restDensity * 0.5);
  pressures[idx] = config.gasConstant * (densities[idx] - config.restDensity);
}
`,

  forceCompute: `
@group(0) @binding(0) var<storage, read> positions: array<vec2f>;
@group(0) @binding(1) var<storage, read> velocities: array<vec2f>;
@group(0) @binding(2) var<storage, read> densities: array<f32>;
@group(0) @binding(3) var<storage, read> pressures: array<f32>;
@group(0) @binding(4) var<storage, read_write> forces: array<vec2f>;
@group(0) @binding(5) var<storage, read> gridCellOffsets: array<u32>;
@group(0) @binding(6) var<storage, read> gridParticleCount: array<u32>;
@group(0) @binding(7) var<storage, read> gridParticleIndices: array<u32>;
@group(0) @binding(8) var<uniform> config: Config;

@compute @workgroup_size(256)
fn computeForce(@builtin(global_invocation_id) global_id: vec3u) {
  let idx = global_id.x;
  if (idx >= config.particleCount) { return; }
  
  let pos = positions[idx];
  let vel = velocities[idx];
  let pressure_i = pressures[idx];
  let density_i = densities[idx];
  let h = config.smoothingRadius;
  let cellSize = config.gridCellSize;
  let col = u32(clamp(pos.x / cellSize, 0.0, f32(config.gridCols - 1)));
  let row = u32(clamp(pos.y / cellSize, 0.0, f32(config.gridRows - 1)));
  
  var pressureForce = vec2f(0.0);
  var viscosityForce = vec2f(0.0);
  
  let minCol = max(0u, col - 1u);
  let maxCol = min(config.gridCols - 1u, col + 1u);
  let minRow = max(0u, row - 1u);
  let maxRow = min(config.gridRows - 1u, row + 1u);
  let h2 = config.hSquared;
  
  for (var r: u32 = minRow; r <= maxRow; r++) {
    for (var c: u32 = minCol; c <= maxCol; c++) {
      let cellIdx = gridIndex(c, r, config.gridCols);
      let offset = gridCellOffsets[cellIdx];
      let count = gridParticleCount[cellIdx];
      
      for (var k: u32 = 0u; k < count; k++) {
        let j = gridParticleIndices[offset + k];
        
        let diff = pos - positions[j];
        let r2 = dot(diff, diff);
        
        if (r2 >= h2 || r2 < 1e-12) { continue; }
        let r = sqrt(r2);
        let invR = 1.0 / r;
        
        let density_j = densities[j];
        let pressure_j = pressures[j];
        
        let pressureGrad = spikyGradient(r, h);
        let pressureTerm = -(pressure_i + pressure_j) / (2.0 * density_j) * pressureGrad;
        pressureForce += pressureTerm * diff * invR;
        
        let viscLap = viscosityLaplacian(r, h);
        viscosityForce += config.viscosity * (velocities[j] - vel) / density_j * viscLap;
      }
    }
  }
  
  forces[idx] = (pressureForce + viscosityForce) / density_i + vec2f(0.0, config.gravity);
}
`,

  integrate: `
@group(0) @binding(0) var<storage, read_write> positions: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> velocities: array<vec2f>;
@group(0) @binding(2) var<storage, read> forces: array<vec2f>;
@group(0) @binding(3) var<uniform> config: Config;

@compute @workgroup_size(256)
fn integrate(@builtin(global_invocation_id) global_id: vec3u) {
  let idx = global_id.x;
  if (idx >= config.particleCount) { return; }
  
  var vel = velocities[idx];
  var pos = positions[idx];
  let force = forces[idx];
  let dt = config.dt;
  let maxSpeed = config.maxSpeed;
  let damping = config.boundaryDamping;
  let h = config.smoothingRadius * 0.5;
  let minBound = h;
  let maxBoundX = config.worldWidth - h;
  let maxBoundY = config.worldHeight - h;

  vel += force * dt;
  
  let speedSq = dot(vel, vel);
  if (speedSq > maxSpeed * maxSpeed) {
    vel = normalize(vel) * maxSpeed;
  }

  let numSubSteps = max(1u, config.numSubSteps);
  let subDt = dt / f32(numSubSteps);

  for (var step: u32 = 0u; step < numSubSteps; step++) {
    pos += vel * subDt;
    
    if (pos.x < minBound) {
      pos.x = minBound;
      vel.x = abs(vel.x) * damping;
    } else if (pos.x > maxBoundX) {
      pos.x = maxBoundX;
      vel.x = -abs(vel.x) * damping;
    }
    
    if (pos.y < minBound) {
      pos.y = minBound;
      vel.y = abs(vel.y) * damping;
    } else if (pos.y > maxBoundY) {
      pos.y = maxBoundY;
      vel.y = -abs(vel.y) * damping;
    }
  }
  
  positions[idx] = pos;
  velocities[idx] = vel;
}
`,

  renderVert: `
struct Camera {
  rotation: f32,
  scale: f32,
  offsetX: f32,
  offsetY: f32,
  pointSize: f32,
  padding: vec3f,
};

@group(0) @binding(0) var<storage, read> positions: array<vec2f>;
@group(0) @binding(1) var<storage, read> velocities: array<vec2f>;
@group(0) @binding(2) var<uniform> camera: Camera;

struct VSOutput {
  @builtin(position) position: vec4f,
  @builtin(pointsize) pointSize: f32,
  @location(0) color: vec3f,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VSOutput {
  var output: VSOutput;
  
  let pos = positions[vertexIndex];
  let vel = velocities[vertexIndex];
  
  let centered = pos - vec2f(0.5);
  let cos = cos(camera.rotation);
  let sin = sin(camera.rotation);
  let rotated = vec2f(
    centered.x * cos - centered.y * sin,
    centered.x * sin + centered.y * cos
  );
  let transformed = rotated * camera.scale + vec2f(camera.offsetX, camera.offsetY);
  
  let speed = length(vel);
  let t = min(speed / 5.0, 1.0);
  let color = vec3f(0.1 + t * 0.9, 0.3 + (1.0 - t) * 0.3, 0.8 + (1.0 - t) * 0.2);
  
  output.position = vec4f(transformed, 0.0, 1.0);
  output.pointSize = camera.pointSize;
  output.color = color;
  
  return output;
}
`,

  renderFrag: `
@fragment
fn fs_main(@location(0) color: vec3f) -> @location(0) vec4f {
  return vec4f(color, 1.0);
}
`,

  clearGridCounts: `
@group(0) @binding(0) var<storage, read_write> gridCellCounts: array<atomic<u32>>;
@group(0) @binding(1) var<uniform> config: Config;

@compute @workgroup_size(256)
fn clearGridCounts(@builtin(global_invocation_id) global_id: vec3u) {
  let idx = global_id.x;
  let totalCells = config.gridCols * config.gridRows;
  if (idx >= totalCells) { return; }
  
  atomicStore(&gridCellCounts[idx], 0u);
}
`
};
