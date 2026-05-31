// ============================================================================
// WebGPU Particle System with Collision Detection and Gravity
// Uses Spatial Hashing Grid for O(n) neighborhood queries
// ============================================================================

// Constants
const GRID_SIZE: f32 = 1.0;
const GRID_COUNT: u32 = 20u;
const GRID_TOTAL: u32 = GRID_COUNT * GRID_COUNT * GRID_COUNT;
const WORLD_MIN: f32 = -10.0;
const WORLD_MAX: f32 = 10.0;

// ============================================================================
// Data Structures
// ============================================================================

struct Particle {
    position: vec3f,
    velocity: vec3f,
    color: vec3f,
}

struct Uniforms {
    deltaTime: f32,
    time: f32,
    rotationSpeed: f32,
    noiseStrength: f32,
    gravityStrength: f32,
    collisionStrength: f32,
    particleRadius: f32,
    padding: f32,
}

// ============================================================================
// Hash Functions (for noise - kept from original)
// ============================================================================

fn hash3(p: vec3f) -> vec3f {
    p = fract(p * vec3f(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
}

fn noise3(p: vec3f) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    
    let n000 = hash3(i + vec3f(0.0, 0.0, 0.0));
    let n100 = hash3(i + vec3f(1.0, 0.0, 0.0));
    let n010 = hash3(i + vec3f(0.0, 1.0, 0.0));
    let n110 = hash3(i + vec3f(1.0, 1.0, 0.0));
    let n001 = hash3(i + vec3f(0.0, 0.0, 1.0));
    let n101 = hash3(i + vec3f(1.0, 0.0, 1.0));
    let n011 = hash3(i + vec3f(0.0, 1.0, 1.0));
    let n111 = hash3(i + vec3f(1.0, 1.0, 1.0));
    
    let nx00 = mix(n000.x, n100.x, u.x);
    let nx10 = mix(n010.x, n110.x, u.x);
    let nx01 = mix(n001.x, n101.x, u.x);
    let nx11 = mix(n011.x, n111.x, u.x);
    
    let nxy0 = mix(nx00, nx10, u.y);
    let nxy1 = mix(nx01, nx11, u.y);
    
    return mix(nxy0, nxy1, u.z) * 2.0 - 1.0;
}

fn fbm(p: vec3f) -> f32 {
    var value = 0.0;
    var amplitude = 0.5;
    var frequency = 1.0;
    var offset = 0.0;
    
    for (var i = 0; i < 4; i++) {
        value += amplitude * noise3(p * frequency + offset);
        amplitude *= 0.5;
        frequency *= 2.0;
        offset += 100.0;
    }
    
    return value;
}

// ============================================================================
// Grid Helper Functions
// ============================================================================

fn worldToGrid(pos: vec3f) -> vec3u {
    let normalized = (pos - WORLD_MIN) / (WORLD_MAX - WORLD_MIN);
    let grid = vec3u(
        u32(clamp(normalized.x, 0.0, 0.999) * f32(GRID_COUNT)),
        u32(clamp(normalized.y, 0.0, 0.999) * f32(GRID_COUNT)),
        u32(clamp(normalized.z, 0.0, 0.999) * f32(GRID_COUNT))
    );
    return grid;
}

fn gridToIndex(gx: u32, gy: u32, gz: u32) -> u32 {
    return gx + gy * GRID_COUNT + gz * GRID_COUNT * GRID_COUNT;
}

fn posToGridIndex(pos: vec3f) -> u32 {
    let grid = worldToGrid(pos);
    return gridToIndex(grid.x, grid.y, grid.z);
}

// ============================================================================
// Pass 1: Grid Counting
// ============================================================================

@group(0) @binding(0) var<storage, read> particlesIn: array<Particle>;
@group(0) @binding(1) var<storage, read_write> gridCounts: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> particleGridIndices: array<u32>;

@compute @workgroup_size(256)
fn grid_count(@builtin(global_invocation_id) global_id: vec3u) {
    let index = global_id.x;
    if (index >= arrayLength(&particlesIn)) {
        return;
    }
    
    let particle = particlesIn[index];
    let gridIdx = posToGridIndex(particle.position);
    
    particleGridIndices[index] = gridIdx;
    atomicAdd(&gridCounts[gridIdx], 1u);
}

// ============================================================================
// Pass 2: Prefix Sum (inclusive scan)
// ============================================================================

@group(0) @binding(0) var<storage, read> gridCountsIn: array<u32>;
@group(0) @binding(1) var<storage, read_write> gridStarts: array<u32>;

@compute @workgroup_size(1)
fn prefix_sum(@builtin(global_invocation_id) global_id: vec3u) {
    var sum: u32 = 0u;
    for (var i: u32 = 0u; i < GRID_TOTAL + 1u; i++) {
        gridStarts[i] = sum;
        if (i < GRID_TOTAL) {
            sum += gridCountsIn[i];
        }
    }
}

// ============================================================================
// Pass 3: Scatter - Sort particle indices by grid
// ============================================================================

@group(0) @binding(0) var<storage, read> particlesIn: array<Particle>;
@group(0) @binding(1) var<storage, read> particleGridIndicesIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> gridStartsIn: array<u32>;
@group(0) @binding(3) var<storage, read_write> sortedParticleIndices: array<u32>;
@group(0) @binding(4) var<storage, read_write> gridTempCounts: array<atomic<u32>>;

@compute @workgroup_size(256)
fn scatter(@builtin(global_invocation_id) global_id: vec3u) {
    let index = global_id.x;
    if (index >= arrayLength(&particlesIn)) {
        return;
    }
    
    let gridIdx = particleGridIndicesIn[index];
    let offset = atomicAdd(&gridTempCounts[gridIdx], 1u);
    let sortedPos = gridStartsIn[gridIdx] + offset;
    sortedParticleIndices[sortedPos] = index;
}

// ============================================================================
// Pass 4: Particle Interaction and Update
// ============================================================================

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;
@group(0) @binding(2) var<storage, read> sortedIndices: array<u32>;
@group(0) @binding(3) var<storage, read> gridStartsRead: array<u32>;

@compute @workgroup_size(256)
fn interact(@builtin(global_invocation_id) global_id: vec3u) {
    let index = global_id.x;
    if (index >= arrayLength(&particles)) {
        return;
    }
    
    var particle = particles[index];
    let pos = particle.position;
    
    // Get this particle's grid cell
    let grid = worldToGrid(pos);
    var interactionForce = vec3f(0.0);
    
    // Check 27 neighboring cells
    for (var dz: i32 = -1; dz <= 1; dz++) {
        for (var dy: i32 = -1; dy <= 1; dy++) {
            for (var dx: i32 = -1; dx <= 1; dx++) {
                let nx = i32(grid.x) + dx;
                let ny = i32(grid.y) + dy;
                let nz = i32(grid.z) + dz;
                
                // Skip out of bounds
                if (nx < 0 || nx >= i32(GRID_COUNT) || 
                    ny < 0 || ny >= i32(GRID_COUNT) || 
                    nz < 0 || nz >= i32(GRID_COUNT)) {
                    continue;
                }
                
                let neighborGridIdx = gridToIndex(u32(nx), u32(ny), u32(nz));
                let startIdx = gridStartsRead[neighborGridIdx];
                let endIdx = gridStartsRead[neighborGridIdx + 1u];
                
                // Iterate over particles in this cell
                for (var j: u32 = startIdx; j < endIdx; j++) {
                    let otherIdx = sortedIndices[j];
                    if (otherIdx == index) { continue; }
                    
                    let otherPos = particles[otherIdx].position;
                    let diff = pos - otherPos;
                    let dist = length(diff);
                    
                    // Gravity (attraction)
                    if (uniforms.gravityStrength > 0.0 && dist > 0.01) {
                        let gravityForce = uniforms.gravityStrength / (dist * dist + 0.1);
                        interactionForce -= normalize(diff) * gravityForce * 0.001;
                    }
                    
                    // Collision (repulsion)
                    let minDist = uniforms.particleRadius * 2.0;
                    if (dist < minDist && dist > 0.001) {
                        let overlap = (minDist - dist) / minDist;
                        let repulsion = normalize(diff) * overlap * uniforms.collisionStrength;
                        interactionForce += repulsion;
                    }
                }
            }
        }
    }
    
    // Apply original forces (noise, rotation, spring)
    let time = uniforms.time;
    let noisePos = pos * 0.5 + vec3f(time * 0.1, time * 0.15, time * 0.05);
    let noiseX = fbm(noisePos);
    let noiseY = fbm(noisePos + vec3f(100.0, 200.0, 300.0));
    let noiseZ = fbm(noisePos + vec3f(400.0, 500.0, 600.0));
    let noiseForce = vec3f(noiseX, noiseY, noiseZ) * uniforms.noiseStrength;
    
    let centerOffset = pos;
    let dist = length(centerOffset);
    let rotationAxis = normalize(vec3f(0.0, 1.0, 0.0));
    let rotationForce = cross(rotationAxis, centerOffset) * uniforms.rotationSpeed / max(dist, 0.1);
    let springForce = -centerOffset * 0.01;
    
    // Combine all forces
    let totalForce = noiseForce + rotationForce + springForce + interactionForce;
    
    // Update velocity
    particle.velocity += totalForce * uniforms.deltaTime;
    particle.velocity *= 0.99;
    
    let maxSpeed = 5.0;
    let speed = length(particle.velocity);
    if (speed > maxSpeed) {
        particle.velocity = normalize(particle.velocity) * maxSpeed;
    }
    
    // Update position
    particle.position += particle.velocity * uniforms.deltaTime;
    
    // Boundary constraint
    let maxDist = 10.0;
    let currentDist = length(particle.position);
    if (currentDist > maxDist) {
        particle.position = normalize(particle.position) * maxDist;
        particle.velocity *= -0.5;
    }
    
    particles[index] = particle;
}

// ============================================================================
// Pass 5: Clear grid counts (reset for next frame)
// ============================================================================

@group(0) @binding(0) var<storage, read_write> gridCountsClear: array<atomic<u32>>;
@group(0) @binding(1) var<storage, read_write> gridTempCountsClear: array<atomic<u32>>;

@compute @workgroup_size(256)
fn clear_grid(@builtin(global_invocation_id) global_id: vec3u) {
    let index = global_id.x;
    if (index >= GRID_TOTAL) {
        return;
    }
    
    atomicStore(&gridCountsClear[index], 0u);
    atomicStore(&gridTempCountsClear[index], 0u);
}
