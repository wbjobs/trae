struct Uniforms {
  smoothingRadius: f32,
  particleMass: f32,
  restDensity: f32,
  viscosityCoeff: f32,
  gravity: f32,
  timeStep: f32,
  stiffness: f32,
  boundaryDamping: f32,
  boundaryMinX: f32,
  boundaryMinY: f32,
  boundaryMinZ: f32,
  boundaryMaxX: f32,
  boundaryMaxY: f32,
  boundaryMaxZ: f32,
  gridCellSize: f32,
  gridSize: u32,
  thermalConductivity: f32,
  specificHeat: f32,
  tempGradientThreshold: f32,
  currentHistoryIndex: u32,
  _pad0: u32,
  _pad1: u32
}

struct HeatSource {
  position: vec4f,
  temperature: f32,
  radius: f32,
  active: u32,
  _pad: u32
}

struct HeatUniforms {
  heatSourceCount: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32
}

struct ParticleCount {
  count: u32
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<uniform> particleCount: ParticleCount;
@group(0) @binding(2) var<storage, read_write> positions: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> velocities: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> predictedPositions: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> densities: array<f32>;
@group(0) @binding(6) var<storage, read_write> pressures: array<f32>;
@group(0) @binding(7) var<storage, read_write> pressureForces: array<vec4f>;
@group(0) @binding(8) var<storage, read_write> viscosityForces: array<vec4f>;
@group(0) @binding(9) var<storage, read_write> correctionVelocities: array<vec4f>;
@group(0) @binding(10) var<storage, read_write> densityErrors: array<f32>;

@group(1) @binding(0) var<storage, read_write> gridCellIndices: array<vec2u>;
@group(1) @binding(1) var<storage, read_write> gridCellPrefixSum: array<u32>;
@group(1) @binding(2) var<storage, read_write> sortedIndices: array<u32>;
@group(1) @binding(3) var<storage, read_write> sortedPositions: array<vec4f>;
@group(1) @binding(4) var<storage, read_write> sortedVelocities: array<vec4f>;
@group(1) @binding(5) var<storage, read_write> sortedPredictedPositions: array<vec4f>;
@group(1) @binding(6) var<storage, read_write> sortedDensities: array<f32>;
@group(1) @binding(7) var<storage, read_write> sortedPressures: array<f32>;
@group(1) @binding(8) var<storage, read_write> gridCellStart: array<u32>;
@group(1) @binding(9) var<storage, read_write> gridCellEnd: array<u32>;
@group(1) @binding(10) var<storage, read_write> sortedTemperatures: array<f32>;

@group(2) @binding(0) var<storage, read_write> temperatures: array<f32>;
@group(2) @binding(1) var<storage, read_write> temperaturesPrev: array<f32>;
@group(2) @binding(2) var<storage, read_write> temperatureGradients: array<f32>;
@group(2) @binding(3) var<storage, read_write> heatSources: array<HeatSource>;
@group(2) @binding(4) var<storage, read_write> temperatureHistory: array<f32>;
@group(2) @binding(5) var<uniform> heatUniforms: HeatUniforms;

const MAX_NEIGHBORS = 128;
const WORKGROUP_SIZE = 256;

fn poly6Kernel(r: f32, h: f32) -> f32 {
  if (r >= h) { return 0.0; }
  let r_h = r / h;
  let factor = 315.0 / (64.0 * 3.14159265359 * pow(h, 9.0));
  return factor * pow(h * h - r * r, 3.0);
}

fn spikyKernelGradient(rVec: vec3f, r: f32, h: f32) -> vec3f {
  if (r >= h || r < 0.00001) { return vec3f(0.0); }
  let factor = -45.0 / (3.14159265359 * pow(h, 6.0));
  return factor * rVec / r * pow(h - r, 2.0);
}

fn viscosityKernelLaplacian(r: f32, h: f32) -> f32 {
  if (r >= h) { return 0.0; }
  let factor = 45.0 / (3.14159265359 * pow(h, 6.0));
  return factor * (h - r);
}

fn getGridCell(pos: vec3f) -> vec3i {
  let cellSize = uniforms.gridCellSize;
  let cellX = i32(floor((pos.x - uniforms.boundaryMinX) / cellSize));
  let cellY = i32(floor((pos.y - uniforms.boundaryMinY) / cellSize));
  let cellZ = i32(floor((pos.z - uniforms.boundaryMinZ) / cellSize));
  let maxCell = i32(uniforms.gridSize - 1u);
  return vec3i(clamp(cellX, 0, maxCell), clamp(cellY, 0, maxCell), clamp(cellZ, 0, maxCell));
}

fn getCellIndex(cell: vec3i) -> u32 {
  let gs = i32(uniforms.gridSize);
  let cx = clamp(cell.x, 0, gs - 1);
  let cy = clamp(cell.y, 0, gs - 1);
  let cz = clamp(cell.z, 0, gs - 1);
  return u32(cx + cy * gs + cz * gs * gs);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn predictPosition(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= particleCount.count) { return; }
  
  let pos = vec3f(positions[i]);
  let vel = vec3f(velocities[i]);
  
  let gravity = vec3f(0.0, -uniforms.gravity, 0.0);
  let predictedVel = vel + gravity * uniforms.timeStep;
  let predictedPos = pos + predictedVel * uniforms.timeStep;
  
  predictedPositions[i] = vec4f(predictedPos, 0.0);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn computeGridCellIndices(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= particleCount.count) { return; }
  
  let pos = vec3f(predictedPositions[i]);
  let cell = getGridCell(pos);
  let cellIndex = getCellIndex(cell);
  
  gridCellIndices[i] = vec2u(cellIndex, i);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn initGridCellCounters(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  let totalCells = uniforms.gridSize * uniforms.gridSize * uniforms.gridSize;
  if (i >= totalCells) { return; }
  
  gridCellPrefixSum[i] = 0u;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn countParticlesInCells(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= particleCount.count) { return; }
  
  let cellIndex = gridCellIndices[i].x;
  atomicAdd(&gridCellPrefixSum[cellIndex], 1u);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn computeGridCellStartEnd(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  let totalCells = uniforms.gridSize * uniforms.gridSize * uniforms.gridSize;
  if (i >= totalCells) { return; }
  
  if (i == 0u) {
    gridCellStart[i] = 0u;
    gridCellEnd[i] = gridCellPrefixSum[i];
  } else {
    var start: u32 = 0u;
    for (var j: u32 = 0u; j < i; j++) {
      start += gridCellPrefixSum[j];
    }
    gridCellStart[i] = start;
    gridCellEnd[i] = start + gridCellPrefixSum[i];
  }
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn sortParticlesByCell(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= particleCount.count) { return; }
  
  let cellIndex = gridCellIndices[i].x;
  let originalIndex = gridCellIndices[i].y;
  
  let baseStart = gridCellStart[cellIndex];
  
  var countBefore: u32 = 0u;
  for (var j: u32 = 0u; j < i; j++) {
    if (gridCellIndices[j].x == cellIndex) {
      countBefore++;
    }
  }
  
  let sortedIdx = baseStart + countBefore;
  sortedIndices[sortedIdx] = originalIndex;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn computeDensity(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= particleCount.count) { return; }
  
  let posI = vec3f(predictedPositions[i]);
  let h = uniforms.smoothingRadius;
  let cellI = getGridCell(posI);
  let gs = i32(uniforms.gridSize);
  
  var density = uniforms.particleMass * poly6Kernel(0.0, h);
  
  for (var dz: i32 = -1; dz <= 1; dz++) {
    for (var dy: i32 = -1; dy <= 1; dy++) {
      for (var dx: i32 = -1; dx <= 1; dx++) {
        let cellJ = cellI + vec3i(dx, dy, dz);
        if (cellJ.x < 0 || cellJ.x >= gs || cellJ.y < 0 || cellJ.y >= gs || cellJ.z < 0 || cellJ.z >= gs) {
          continue;
        }
        
        let cellIdx = getCellIndex(cellJ);
        let start = gridCellStart[cellIdx];
        let end = gridCellEnd[cellIdx];
        
        for (var j: u32 = start; j < end; j++) {
          let sortedIdx = sortedIndices[j];
          if (sortedIdx == i) { continue; }
          
          let posJ = vec3f(predictedPositions[sortedIdx]);
          let diff = posJ - posI;
          let dist = length(diff);
          
          density += uniforms.particleMass * poly6Kernel(dist, h);
        }
      }
    }
  }
  
  densities[i] = density;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn computePressure(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= particleCount.count) { return; }
  
  let density = densities[i];
  let pressure = uniforms.stiffness * (density - uniforms.restDensity);
  pressures[i] = max(pressure, 0.0);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn computePressureForce(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= particleCount.count) { return; }
  
  let posI = vec3f(predictedPositions[i]);
  let pressureI = pressures[i];
  let densityI = max(densities[i], 0.0001);
  let h = uniforms.smoothingRadius;
  let cellI = getGridCell(posI);
  let gs = i32(uniforms.gridSize);
  
  var force = vec3f(0.0);
  
  for (var dz: i32 = -1; dz <= 1; dz++) {
    for (var dy: i32 = -1; dy <= 1; dy++) {
      for (var dx: i32 = -1; dx <= 1; dx++) {
        let cellJ = cellI + vec3i(dx, dy, dz);
        if (cellJ.x < 0 || cellJ.x >= gs || cellJ.y < 0 || cellJ.y >= gs || cellJ.z < 0 || cellJ.z >= gs) {
          continue;
        }
        
        let cellIdx = getCellIndex(cellJ);
        let start = gridCellStart[cellIdx];
        let end = gridCellEnd[cellIdx];
        
        for (var j: u32 = start; j < end; j++) {
          let sortedIdx = sortedIndices[j];
          if (sortedIdx == i) { continue; }
          
          let posJ = vec3f(predictedPositions[sortedIdx]);
          let pressureJ = pressures[sortedIdx];
          let densityJ = max(densities[sortedIdx], 0.0001);
          
          let diff = posJ - posI;
          let r = length(diff);
          
          if (r > 0.0 && r < h) {
            let grad = spikyKernelGradient(diff, r, h);
            let pressureTerm = (pressureI / (densityI * densityI) + pressureJ / (densityJ * densityJ));
            force += -uniforms.particleMass * pressureTerm * grad;
          }
        }
      }
    }
  }
  
  pressureForces[i] = vec4f(force, 0.0);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn computeViscosityForce(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= particleCount.count) { return; }
  
  let velI = vec3f(velocities[i]);
  let posI = vec3f(positions[i]);
  let densityI = max(densities[i], 0.0001);
  let h = uniforms.smoothingRadius;
  let cellI = getGridCell(posI);
  let gs = i32(uniforms.gridSize);
  
  var force = vec3f(0.0);
  
  for (var dz: i32 = -1; dz <= 1; dz++) {
    for (var dy: i32 = -1; dy <= 1; dy++) {
      for (var dx: i32 = -1; dx <= 1; dx++) {
        let cellJ = cellI + vec3i(dx, dy, dz);
        if (cellJ.x < 0 || cellJ.x >= gs || cellJ.y < 0 || cellJ.y >= gs || cellJ.z < 0 || cellJ.z >= gs) {
          continue;
        }
        
        let cellIdx = getCellIndex(cellJ);
        let start = gridCellStart[cellIdx];
        let end = gridCellEnd[cellIdx];
        
        for (var j: u32 = start; j < end; j++) {
          let sortedIdx = sortedIndices[j];
          if (sortedIdx == i) { continue; }
          
          let velJ = vec3f(velocities[sortedIdx]);
          let posJ = vec3f(positions[sortedIdx]);
          let densityJ = max(densities[sortedIdx], 0.0001);
          
          let diff = posJ - posI;
          let r = length(diff);
          
          if (r > 0.0 && r < h) {
            let laplace = viscosityKernelLaplacian(r, h);
            force += uniforms.viscosityCoeff * uniforms.particleMass * 
                     (velJ - velI) / densityJ * laplace;
          }
        }
      }
    }
  }
  
  viscosityForces[i] = vec4f(force, 0.0);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn computeCorrectionVelocity(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= particleCount.count) { return; }
  
  let densityError = (densities[i] - uniforms.restDensity) / uniforms.restDensity;
  densityErrors[i] = densityError;
  
  let posI = vec3f(predictedPositions[i]);
  let pressureI = pressures[i];
  let densityI = max(densities[i], 0.0001);
  let h = uniforms.smoothingRadius;
  let cellI = getGridCell(posI);
  let gs = i32(uniforms.gridSize);
  
  var force = vec3f(0.0);
  
  for (var dz: i32 = -1; dz <= 1; dz++) {
    for (var dy: i32 = -1; dy <= 1; dy++) {
      for (var dx: i32 = -1; dx <= 1; dx++) {
        let cellJ = cellI + vec3i(dx, dy, dz);
        if (cellJ.x < 0 || cellJ.x >= gs || cellJ.y < 0 || cellJ.y >= gs || cellJ.z < 0 || cellJ.z >= gs) {
          continue;
        }
        
        let cellIdx = getCellIndex(cellJ);
        let start = gridCellStart[cellIdx];
        let end = gridCellEnd[cellIdx];
        
        for (var j: u32 = start; j < end; j++) {
          let sortedIdx = sortedIndices[j];
          if (sortedIdx == i) { continue; }
          
          let posJ = vec3f(predictedPositions[sortedIdx]);
          let pressureJ = pressures[sortedIdx];
          let densityJ = max(densities[sortedIdx], 0.0001);
          
          let diff = posJ - posI;
          let r = length(diff);
          
          if (r > 0.0 && r < h) {
            let grad = spikyKernelGradient(diff, r, h);
            let pressureTerm = (pressureI / (densityI * densityI) + pressureJ / (densityJ * densityJ));
            force += -uniforms.particleMass * pressureTerm * grad;
          }
        }
      }
    }
  }
  
  let dt = uniforms.timeStep;
  let corrVel = force * dt;
  correctionVelocities[i] = vec4f(corrVel, 0.0);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn integrateAndEnforceBoundary(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= particleCount.count) { return; }
  
  let pos = vec3f(positions[i]);
  let vel = vec3f(velocities[i]);
  let pForce = vec3f(pressureForces[i]);
  let vForce = vec3f(viscosityForces[i]);
  let corrVel = vec3f(correctionVelocities[i]);
  
  let density = max(densities[i], 0.0001);
  let dt = uniforms.timeStep;
  
  let gravity = vec3f(0.0, -uniforms.gravity, 0.0);
  let totalForce = gravity + pForce / density + vForce / density;
  
  var newVel = vel + totalForce * dt + corrVel;
  var newPos = pos + newVel * dt;
  
  let minBound = vec3f(uniforms.boundaryMinX, uniforms.boundaryMinY, uniforms.boundaryMinZ);
  let maxBound = vec3f(uniforms.boundaryMaxX, uniforms.boundaryMaxY, uniforms.boundaryMaxZ);
  let damping = uniforms.boundaryDamping;
  
  if (newPos.x < minBound.x) {
    newPos.x = minBound.x;
    newVel.x = -newVel.x * damping;
  }
  if (newPos.x > maxBound.x) {
    newPos.x = maxBound.x;
    newVel.x = -newVel.x * damping;
  }
  if (newPos.y < minBound.y) {
    newPos.y = minBound.y;
    newVel.y = -newVel.y * damping;
  }
  if (newPos.y > maxBound.y) {
    newPos.y = maxBound.y;
    newVel.y = -newVel.y * damping;
  }
  if (newPos.z < minBound.z) {
    newPos.z = minBound.z;
    newVel.z = -newVel.z * damping;
  }
  if (newPos.z > maxBound.z) {
    newPos.z = maxBound.z;
    newVel.z = -newVel.z * damping;
  }
  
  positions[i] = vec4f(newPos, 0.0);
  velocities[i] = vec4f(newVel, 0.0);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn resetCorrectionVelocities(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= particleCount.count) { return; }
  correctionVelocities[i] = vec4f(0.0);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn savePreviousTemperatures(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= particleCount.count) { return; }
  temperaturesPrev[i] = temperatures[i];
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn applyHeatSources(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= particleCount.count) { return; }
  
  let pos = vec3f(positions[i]);
  var temp = temperatures[i];
  
  for (var s: u32 = 0u; s < heatUniforms.heatSourceCount; s++) {
    let source = heatSources[s];
    if (source.active == 0u) { continue; }
    
    let sourcePos = vec3f(source.position);
    let diff = pos - sourcePos;
    let dist = length(diff);
    
    if (dist < source.radius) {
      let factor = 1.0 - (dist / source.radius);
      temp = temp + (source.temperature - temp) * factor * 0.1;
    }
  }
  
  temperatures[i] = temp;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn computeHeatConductionImplicit(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= particleCount.count) { return; }
  
  let posI = vec3f(positions[i]);
  let h = uniforms.smoothingRadius;
  let cellI = getGridCell(posI);
  let gs = i32(uniforms.gridSize);
  let alpha = uniforms.thermalConductivity / (uniforms.restDensity * uniforms.specificHeat);
  let dt = uniforms.timeStep;
  let mass = uniforms.particleMass;
  
  var T0 = temperaturesPrev[i];
  var selfCoeff = 1.0;
  var neighborSum = 0.0;
  
  for (var dz: i32 = -1; dz <= 1; dz++) {
    for (var dy: i32 = -1; dy <= 1; dy++) {
      for (var dx: i32 = -1; dx <= 1; dx++) {
        let cellJ = cellI + vec3i(dx, dy, dz);
        if (cellJ.x < 0 || cellJ.x >= gs || cellJ.y < 0 || cellJ.y >= gs || cellJ.z < 0 || cellJ.z >= gs) {
          continue;
        }
        
        let cellIdx = getCellIndex(cellJ);
        let start = gridCellStart[cellIdx];
        let end = gridCellEnd[cellIdx];
        
        for (var j: u32 = start; j < end; j++) {
          let sortedIdx = sortedIndices[j];
          if (sortedIdx == i) { continue; }
          
          let posJ = vec3f(positions[sortedIdx]);
          let diff = posJ - posI;
          let r = length(diff);
          
          if (r > 0.0 && r < h) {
            let invR = 1.0 / r;
            let gradFactor = (h - r) / (h * h);
            let coeff = alpha * dt * mass * gradFactor * gradFactor;
            
            selfCoeff += coeff;
            neighborSum += coeff * temperaturesPrev[sortedIdx];
          }
        }
      }
    }
  }
  
  temperatures[i] = (T0 + neighborSum) / selfCoeff;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn computeTemperatureGradient(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= particleCount.count) { return; }
  
  let posI = vec3f(positions[i]);
  let h = uniforms.smoothingRadius;
  let cellI = getGridCell(posI);
  let gs = i32(uniforms.gridSize);
  let tempI = temperatures[i];
  
  var maxDiff = 0.0;
  
  for (var dz: i32 = -1; dz <= 1; dz++) {
    for (var dy: i32 = -1; dy <= 1; dy++) {
      for (var dx: i32 = -1; dx <= 1; dx++) {
        let cellJ = cellI + vec3i(dx, dy, dz);
        if (cellJ.x < 0 || cellJ.x >= gs || cellJ.y < 0 || cellJ.y >= gs || cellJ.z < 0 || cellJ.z >= gs) {
          continue;
        }
        
        let cellIdx = getCellIndex(cellJ);
        let start = gridCellStart[cellIdx];
        let end = gridCellEnd[cellIdx];
        
        for (var j: u32 = start; j < end; j++) {
          let sortedIdx = sortedIndices[j];
          if (sortedIdx == i) { continue; }
          
          let posJ = vec3f(positions[sortedIdx]);
          let r = length(posJ - posI);
          
          if (r > 0.0 && r < h) {
            let tempJ = temperatures[sortedIdx];
            let diff = abs(tempI - tempJ);
            maxDiff = max(maxDiff, diff);
          }
        }
      }
    }
  }
  
  temperatureGradients[i] = maxDiff;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn recordTemperatureHistory(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= particleCount.count) { return; }
  if (i != 0u) { return; }
  
  var avgTemp = 0.0;
  var maxTemp = 0.0;
  var minTemp = 10000.0;
  
  let sampleCount = min(particleCount.count, 256u);
  for (var s: u32 = 0u; s < sampleCount; s++) {
    let idx = (s * 13u) % particleCount.count;
    let t = temperatures[idx];
    avgTemp += t;
    maxTemp = max(maxTemp, t);
    minTemp = min(minTemp, t);
  }
  avgTemp = avgTemp / f32(sampleCount);
  
  let historyIndex = uniforms.currentHistoryIndex * 4u;
  temperatureHistory[historyIndex] = avgTemp;
  temperatureHistory[historyIndex + 1u] = maxTemp;
  temperatureHistory[historyIndex + 2u] = minTemp;
  temperatureHistory[historyIndex + 3u] = f32(particleCount.count);
}
