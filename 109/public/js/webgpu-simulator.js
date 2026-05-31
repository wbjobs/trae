const CLOTH_SIZE = 80;
const CLOTH_WIDTH = 10;
const CLOTH_HEIGHT = 10;
const PARTICLE_COUNT = CLOTH_SIZE * CLOTH_SIZE;
const STRUCTURAL_EDGE_COUNT = (CLOTH_SIZE - 1) * CLOTH_SIZE * 2;
const SHEAR_EDGE_COUNT = (CLOTH_SIZE - 1) * (CLOTH_SIZE - 1) * 2;
const EDGE_COUNT = STRUCTURAL_EDGE_COUNT + SHEAR_EDGE_COUNT;
const FACE_COUNT = (CLOTH_SIZE - 1) * (CLOTH_SIZE - 1) * 2;
const INDEX_COUNT = FACE_COUNT * 3;

const MAX_STRETCH_RATIO = 1.5;
const STRESS_READ_INTERVAL = 3;
const SUB_STEPS = 2;
const CONSTRAINT_ITERATIONS = 2;

const WGSL_SHADERS = {
    integrate: /* wgsl */ `
struct Particle {
    position: vec3<f32>,
    pinned: u32,
    velocity: vec3<f32>,
    stress: f32,
};

@group(0) @binding(0) var<storage, read> particlesIn: array<Particle>;
@group(0) @binding(1) var<storage, read_write> particlesOut: array<Particle>;
@group(0) @binding(2) var<uniform> params: vec4<f32>;

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if idx >= arrayLength(&particlesIn) {
        return;
    }

    var p = particlesIn[idx];

    if p.pinned == 1u {
        p.velocity = vec3<f32>(0.0);
        particlesOut[idx] = p;
        return;
    }

    let gravity = vec3<f32>(0.0, params[0].w, 0.0);
    let wind = vec3<f32>(params[0].x, params[0].y, params[0].z);
    let dt = params[2].x;
    let damping = params[0].y;

    var force = gravity + wind * 0.1;

    p.velocity += force * dt;
    p.velocity *= (1.0 - damping * dt);

    let maxSpeed = 15.0;
    let speed = length(p.velocity);
    if speed > maxSpeed {
        p.velocity = normalize(p.velocity) * maxSpeed;
    }

    p.position += p.velocity * dt;

    particlesOut[idx] = p;
}
`,

    solveConstraints: /* wgsl */ `
struct Particle {
    position: vec3<f32>,
    pinned: u32,
    velocity: vec3<f32>,
    stress: f32,
};

struct Edge {
    a: i32,
    b: i32,
    restLength: f32,
    type: f32,
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read> edges: array<Edge>;
@group(0) @binding(2) var<uniform> params: vec4<f32>;

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if idx >= arrayLength(&edges) {
        return;
    }

    let edge = edges[idx];
    var pa = particles[edge.a];
    var pb = particles[edge.b];

    let diff = pb.position - pa.position;
    let dist = length(diff);

    if dist < 0.0001 || dist > edge.restLength * ${MAX_STRETCH_RATIO} {
        return;
    }

    let dir = diff / dist;
    let stretch = dist - edge.restLength;

    let stiffness = params[0].x;
    let correction = dir * stretch * stiffness * 0.5;

    if pa.pinned == 0u && pb.pinned == 0u {
        pa.position += correction;
        pb.position -= correction;
    } else if pa.pinned == 0u {
        pa.position += correction * 2.0;
    } else if pb.pinned == 0u {
        pb.position -= correction * 2.0;
    }

    let relVel = pb.velocity - pa.velocity;
    let velAlongNormal = dot(relVel, dir);

    if velAlongNormal > 0.0 {
        let dampingForce = dir * (-velAlongNormal * 0.5);
        if pa.pinned == 0u {
            pa.velocity -= dampingForce;
        }
        if pb.pinned == 0u {
            pb.velocity += dampingForce;
        }
    }

    particles[edge.a] = pa;
    particles[edge.b] = pb;
}
`,

    collision: /* wgsl */ `
struct Particle {
    position: vec3<f32>,
    pinned: u32,
    velocity: vec3<f32>,
    stress: f32,
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: vec4<f32>;

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if idx >= arrayLength(&particles) {
        return;
    }

    var p = particles[idx];

    if p.pinned == 1u {
        return;
    }

    let spherePos = vec3<f32>(params[2].y, params[2].z, params[2].w);
    let sphereRadius = params[3].x;

    let diff = p.position - spherePos;
    let dist = length(diff);

    if dist < sphereRadius + 0.05 {
        let normal = normalize(diff);
        let pushDist = sphereRadius + 0.05 - dist;

        p.position += normal * pushDist;

        let velDotNormal = dot(p.velocity, normal);
        if velDotNormal < 0.0 {
            p.velocity += normal * (-velDotNormal * 1.2);
        }
    }

    let mouseActive = params[4].x;
    let mouseIdx = i32(params[4].y);
    let mousePos = vec3<f32>(params[3].y, params[3].z, params[3].w);

    if mouseActive > 0.5 && i32(idx) == mouseIdx {
        p.position = mousePos;
        p.velocity = vec3<f32>(0.0);
    }

    particles[idx] = p;
}
`,

    stress: /* wgsl */ `
struct Particle {
    position: vec3<f32>,
    pinned: u32,
    velocity: vec3<f32>,
    stress: f32,
};

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> stressOutput: array<f32>;
@group(0) @binding(2) var<uniform> params: vec4<f32>;

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if idx >= arrayLength(&particles) {
        return;
    }

    let size = ${CLOTH_SIZE};
    let row = idx / size;
    let col = idx % size;

    var totalStress = 0.0;
    var count = 0;

    let restH = ${CLOTH_WIDTH} / f32(size - 1);
    let restV = ${CLOTH_HEIGHT} / f32(size - 1);

    if col > 0 {
        let dist = distance(particles[idx].position, particles[idx - 1].position);
        totalStress += abs(dist - restH) / restH;
        count++;
    }

    if col < size - 1 {
        let dist = distance(particles[idx].position, particles[idx + 1].position);
        totalStress += abs(dist - restH) / restH;
        count++;
    }

    if row > 0 {
        let dist = distance(particles[idx].position, particles[idx - size].position);
        totalStress += abs(dist - restV) / restV;
        count++;
    }

    if row < size - 1 {
        let dist = distance(particles[idx].position, particles[idx + size].position);
        totalStress += abs(dist - restV) / restV;
        count++;
    }

    if count > 0 {
        stressOutput[idx] = totalStress / f32(count);
    } else {
        stressOutput[idx] = 0.0;
    }
}
`,

    render: /* wgsl */ `
struct Uniforms {
    viewProj: mat4x4<f32>,
    cameraPos: vec3<f32>,
    showStress: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VSOut {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>,
};

@vertex
fn vs_main(@location(0) position: vec3<f32>,
           @location(1) velocity: vec3<f32>,
           @location(2) stress: f32,
           @location(3) pinned: u32) -> VSOut {
    var out: VSOut;

    out.position = uniforms.viewProj * vec4<f32>(position, 1.0);

    var t = clamp(stress * 4.0, 0.0, 1.0);
    var r = min(1.0, t * 2.0);
    var g = min(1.0, 1.0 - abs(t - 0.5) * 2.0);
    var b = min(1.0, (1.0 - t) * 2.0);

    if uniforms.showStress < 0.5 {
        r = 0.4;
        g = 0.6;
        b = 0.9;
    }

    var normal = normalize(velocity);
    var lightDir = normalize(vec3<f32>(1.0, 2.0, 1.0));
    var diffuse = max(dot(normal, lightDir), 0.0);
    var ambient = 0.3;

    out.color = vec3<f32>(r, g, b) * (ambient + diffuse * 0.7);

    return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    return vec4<f32>(in.color, 0.95);
}
`,

    sphere: /* wgsl */ `
struct Uniforms {
    viewProj: mat4x4<f32>,
    spherePos: vec3<f32>,
    sphereRadius: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VSOut {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) worldPos: vec3<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VSOut {
    var positions = array<vec3<f32>, 36>(
        vec3<f32>(-1, -1, -1), vec3<f32>( 1, -1, -1), vec3<f32>( 1,  1, -1),
        vec3<f32>(-1, -1, -1), vec3<f32>( 1,  1, -1), vec3<f32>(-1,  1, -1),
        vec3<f32>(-1, -1,  1), vec3<f32>( 1,  1,  1), vec3<f32>( 1, -1,  1),
        vec3<f32>(-1, -1,  1), vec3<f32>(-1,  1,  1), vec3<f32>( 1,  1,  1),
        vec3<f32>(-1,  1, -1), vec3<f32>( 1,  1, -1), vec3<f32>( 1,  1,  1),
        vec3<f32>(-1,  1, -1), vec3<f32>( 1,  1,  1), vec3<f32>(-1,  1,  1),
        vec3<f32>(-1, -1, -1), vec3<f32>( 1, -1,  1), vec3<f32>( 1, -1, -1),
        vec3<f32>(-1, -1, -1), vec3<f32>(-1, -1,  1), vec3<f32>( 1, -1,  1),
        vec3<f32>( 1, -1, -1), vec3<f32>( 1, -1,  1), vec3<f32>( 1,  1, -1),
        vec3<f32>( 1, -1,  1), vec3<f32>( 1,  1,  1), vec3<f32>( 1,  1, -1),
        vec3<f32>(-1, -1, -1), vec3<f32>(-1,  1, -1), vec3<f32>(-1, -1,  1),
        vec3<f32>(-1, -1,  1), vec3<f32>(-1,  1, -1), vec3<f32>(-1,  1,  1)
    );

    var cubePos = positions[vertexIndex];
    var sphereDir = normalize(cubePos);

    var worldPos = uniforms.spherePos + sphereDir * uniforms.sphereRadius;

    var out: VSOut;
    out.position = uniforms.viewProj * vec4<f32>(worldPos, 1.0);
    out.normal = sphereDir;
    out.worldPos = worldPos;

    return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    var normal = normalize(in.normal);
    var lightDir = normalize(vec3<f32>(1.0, 2.0, 1.0));
    var diffuse = max(dot(normal, lightDir), 0.0);
    var ambient = 0.3;

    var baseColor = vec3<f32>(0.27, 0.53, 1.0);
    var color = baseColor * (ambient + diffuse * 0.7);

    return vec4<f32>(color, 0.9);
}
`
};

class WebGPUClothSimulator {
    constructor() {
        this.device = null;
        this.canvas = null;
        this.context = null;
        this.format = null;

        this.particleBufferA = null;
        this.particleBufferB = null;
        this.edgeBufferStructuralA = null;
        this.edgeBufferStructuralB = null;
        this.edgeBufferShearA = null;
        this.edgeBufferShearB = null;
        this.indexBuffer = null;
        this.stressBuffer = null;
        this.uniformBuffer = null;
        this.stressReadBuffer = null;
        this.renderUniformBuffer = null;

        this.integratePipeline = null;
        this.solvePipeline = null;
        this.collisionPipeline = null;
        this.stressPipeline = null;
        this.renderPipeline = null;
        this.sphereRenderPipeline = null;

        this.structuralEdgeCountA = 0;
        this.structuralEdgeCountB = 0;
        this.shearEdgeCountA = 0;
        this.shearEdgeCountB = 0;

        this.bindGroups = {};
        this.depthTexture = null;

        this.params = {
            stiffness: 0.6,
            damping: 0.5,
            mass: 1.0,
            gravity: -9.8,
            windStrength: 0.5,
        };

        this.showStress = 1.0;
        this.mouseActive = 0;
        this.mouseParticleIndex = -1;
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseZ = 0;

        this.cameraData = {
            viewProj: new Float32Array(16),
            cameraPos: new Float32Array(3),
        };

        this.stressReadCounter = 0;
        this.pendingStressRead = false;
    }

    async init() {
        this.canvas = document.getElementById('canvas-webgpu');
        if (!this.canvas) {
            throw new Error('WebGPU canvas not found');
        }

        if (!navigator.gpu) {
            throw new Error('WebGPU not supported');
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error('Failed to get GPU adapter');
        }

        this.device = await adapter.requestDevice();
        this.context = this.canvas.getContext('webgpu');
        this.format = navigator.gpu.getPreferredCanvasFormat();

        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied',
        });

        this.resize();

        this.createBuffers();
        this.createPipelines();
        this.initParticles();
        this.initEdges();
        this.initIndices();
    }

    resize() {
        const size = Math.min(window.innerWidth, window.innerHeight);
        this.canvas.width = size;
        this.canvas.height = size;

        if (this.depthTexture) {
            this.depthTexture.destroy();
        }

        this.depthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
    }

    createBuffers() {
        const particleStride = 32;

        this.particleBufferA = this.device.createBuffer({
            size: PARTICLE_COUNT * particleStride,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX
        });

        this.particleBufferB = this.device.createBuffer({
            size: PARTICLE_COUNT * particleStride,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX
        });

        const maxEdgeBytes = Math.max(STRUCTURAL_EDGE_COUNT, SHEAR_EDGE_COUNT) * 16;
        this.edgeBufferStructuralA = this.device.createBuffer({
            size: maxEdgeBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.edgeBufferStructuralB = this.device.createBuffer({
            size: maxEdgeBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.edgeBufferShearA = this.device.createBuffer({
            size: maxEdgeBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.edgeBufferShearB = this.device.createBuffer({
            size: maxEdgeBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.indexBuffer = this.device.createBuffer({
            size: INDEX_COUNT * 4,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
        });

        this.stressBuffer = this.device.createBuffer({
            size: PARTICLE_COUNT * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        this.uniformBuffer = this.device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.stressReadBuffer = this.device.createBuffer({
            size: PARTICLE_COUNT * 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        this.renderUniformBuffer = this.device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }

    createPipelines() {
        const integrateModule = this.device.createShaderModule({ code: WGSL_SHADERS.integrate });
        this.integratePipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: integrateModule, entryPoint: 'main' }
        });

        const solveModule = this.device.createShaderModule({ code: WGSL_SHADERS.solveConstraints });
        this.solvePipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: solveModule, entryPoint: 'main' }
        });

        const collisionModule = this.device.createShaderModule({ code: WGSL_SHADERS.collision });
        this.collisionPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: collisionModule, entryPoint: 'main' }
        });

        const stressModule = this.device.createShaderModule({ code: WGSL_SHADERS.stress });
        this.stressPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: stressModule, entryPoint: 'main' }
        });

        const renderModule = this.device.createShaderModule({ code: WGSL_SHADERS.render });
        this.renderPipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: renderModule,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 32,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x3' },
                        { shaderLocation: 1, offset: 12, format: 'float32x3' },
                        { shaderLocation: 2, offset: 24, format: 'float32' },
                        { shaderLocation: 3, offset: 28, format: 'uint32' }
                    ]
                }]
            },
            fragment: {
                module: renderModule,
                entryPoint: 'fs_main',
                targets: [{ format: this.format }]
            },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
            depthStencil: {
                format: 'depth24plus',
                depthWriteEnabled: true,
                depthCompare: 'less'
            }
        });

        const sphereModule = this.device.createShaderModule({ code: WGSL_SHADERS.sphere });
        this.sphereRenderPipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: sphereModule, entryPoint: 'vs_main', buffers: [] },
            fragment: {
                module: sphereModule,
                entryPoint: 'fs_main',
                targets: [{ format: this.format }]
            },
            primitive: { topology: 'triangle-list', cullMode: 'back' },
            depthStencil: {
                format: 'depth24plus',
                depthWriteEnabled: true,
                depthCompare: 'less'
            }
        });

        this.createBindGroups();
    }

    createBindGroups() {
        this.bindGroups.integrate = this.device.createBindGroup({
            layout: this.integratePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBufferA } },
                { binding: 1, resource: { buffer: this.particleBufferB } },
                { binding: 2, resource: { buffer: this.uniformBuffer } }
            ]
        });

        this.bindGroups.solveStructuralA_A = this.device.createBindGroup({
            layout: this.solvePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBufferA } },
                { binding: 1, resource: { buffer: this.edgeBufferStructuralA } },
                { binding: 2, resource: { buffer: this.uniformBuffer } }
            ]
        });

        this.bindGroups.solveStructuralB_A = this.device.createBindGroup({
            layout: this.solvePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBufferA } },
                { binding: 1, resource: { buffer: this.edgeBufferStructuralB } },
                { binding: 2, resource: { buffer: this.uniformBuffer } }
            ]
        });

        this.bindGroups.solveShearA_A = this.device.createBindGroup({
            layout: this.solvePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBufferA } },
                { binding: 1, resource: { buffer: this.edgeBufferShearA } },
                { binding: 2, resource: { buffer: this.uniformBuffer } }
            ]
        });

        this.bindGroups.solveShearB_A = this.device.createBindGroup({
            layout: this.solvePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBufferA } },
                { binding: 1, resource: { buffer: this.edgeBufferShearB } },
                { binding: 2, resource: { buffer: this.uniformBuffer } }
            ]
        });

        this.bindGroups.solveStructuralA_B = this.device.createBindGroup({
            layout: this.solvePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBufferB } },
                { binding: 1, resource: { buffer: this.edgeBufferStructuralA } },
                { binding: 2, resource: { buffer: this.uniformBuffer } }
            ]
        });

        this.bindGroups.solveStructuralB_B = this.device.createBindGroup({
            layout: this.solvePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBufferB } },
                { binding: 1, resource: { buffer: this.edgeBufferStructuralB } },
                { binding: 2, resource: { buffer: this.uniformBuffer } }
            ]
        });

        this.bindGroups.solveShearA_B = this.device.createBindGroup({
            layout: this.solvePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBufferB } },
                { binding: 1, resource: { buffer: this.edgeBufferShearA } },
                { binding: 2, resource: { buffer: this.uniformBuffer } }
            ]
        });

        this.bindGroups.solveShearB_B = this.device.createBindGroup({
            layout: this.solvePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBufferB } },
                { binding: 1, resource: { buffer: this.edgeBufferShearB } },
                { binding: 2, resource: { buffer: this.uniformBuffer } }
            ]
        });

        this.bindGroups.collision_A = this.device.createBindGroup({
            layout: this.collisionPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBufferA } },
                { binding: 1, resource: { buffer: this.uniformBuffer } }
            ]
        });

        this.bindGroups.collision_B = this.device.createBindGroup({
            layout: this.collisionPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBufferB } },
                { binding: 1, resource: { buffer: this.uniformBuffer } }
            ]
        });

        this.bindGroups.stress = this.device.createBindGroup({
            layout: this.stressPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBufferA } },
                { binding: 1, resource: { buffer: this.stressBuffer } },
                { binding: 2, resource: { buffer: this.uniformBuffer } }
            ]
        });

        this.bindGroups.stress_B = this.device.createBindGroup({
            layout: this.stressPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBufferB } },
                { binding: 1, resource: { buffer: this.stressBuffer } },
                { binding: 2, resource: { buffer: this.uniformBuffer } }
            ]
        });

        this.bindGroups.render = this.device.createBindGroup({
            layout: this.renderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.renderUniformBuffer } }
            ]
        });

        this.bindGroups.sphere = this.device.createBindGroup({
            layout: this.sphereRenderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.renderUniformBuffer } }
            ]
        });
    }

    initParticles() {
        const particleData = new Float32Array(PARTICLE_COUNT * 8);

        for (let j = 0; j < CLOTH_SIZE; j++) {
            for (let i = 0; i < CLOTH_SIZE; i++) {
                const idx = j * CLOTH_SIZE + i;
                const base = idx * 8;

                const x = (i / (CLOTH_SIZE - 1) - 0.5) * CLOTH_WIDTH;
                const y = 5;
                const z = (j / (CLOTH_SIZE - 1) - 0.5) * CLOTH_HEIGHT;

                particleData[base + 0] = x;
                particleData[base + 1] = y;
                particleData[base + 2] = z;
                particleData[base + 3] = 0;

                particleData[base + 4] = 0;
                particleData[base + 5] = 0;
                particleData[base + 6] = 0;
                particleData[base + 7] = 0;
            }
        }

        const corners = [0, CLOTH_SIZE - 1, CLOTH_SIZE * (CLOTH_SIZE - 1), CLOTH_SIZE * CLOTH_SIZE - 1];
        for (const c of corners) {
            particleData[c * 8 + 3] = 1;
        }

        this.device.queue.writeBuffer(this.particleBufferA, 0, particleData);
        this.device.queue.writeBuffer(this.particleBufferB, 0, particleData);
    }

    initEdges() {
        const restH = CLOTH_WIDTH / (CLOTH_SIZE - 1);
        const restV = CLOTH_HEIGHT / (CLOTH_SIZE - 1);
        const restD = Math.sqrt(2) * restH;

        const structuralA = [];
        const structuralB = [];
        const shearA = [];
        const shearB = [];

        for (let j = 0; j < CLOTH_SIZE; j++) {
            for (let i = 0; i < CLOTH_SIZE; i++) {
                const idx = j * CLOTH_SIZE + i;

                if (i < CLOTH_SIZE - 1) {
                    const edge = [idx, idx + 1, restH, 0];
                    if ((i + j) % 2 === 0) {
                        structuralA.push(edge);
                    } else {
                        structuralB.push(edge);
                    }
                }

                if (j < CLOTH_SIZE - 1) {
                    const edge = [idx, idx + CLOTH_SIZE, restV, 0];
                    if ((i + j) % 2 === 0) {
                        structuralA.push(edge);
                    } else {
                        structuralB.push(edge);
                    }
                }

                if (i < CLOTH_SIZE - 1 && j < CLOTH_SIZE - 1) {
                    const edge1 = [idx, idx + CLOTH_SIZE + 1, restD, 1];
                    const edge2 = [idx + 1, idx + CLOTH_SIZE, restD, 1];

                    if ((i + 2 * j) % 2 === 0) {
                        shearA.push(edge1);
                        shearA.push(edge2);
                    } else {
                        shearB.push(edge1);
                        shearB.push(edge2);
                    }
                }
            }
        }

        this.structuralEdgeCountA = structuralA.length;
        this.structuralEdgeCountB = structuralB.length;
        this.shearEdgeCountA = shearA.length;
        this.shearEdgeCountB = shearB.length;

        const toFloat32 = (arr) => {
            const f32 = new Float32Array(arr.length * 4);
            for (let k = 0; k < arr.length; k++) {
                f32[k * 4 + 0] = arr[k][0];
                f32[k * 4 + 1] = arr[k][1];
                f32[k * 4 + 2] = arr[k][2];
                f32[k * 4 + 3] = arr[k][3];
            }
            return f32;
        };

        this.device.queue.writeBuffer(this.edgeBufferStructuralA, 0, toFloat32(structuralA));
        this.device.queue.writeBuffer(this.edgeBufferStructuralB, 0, toFloat32(structuralB));
        this.device.queue.writeBuffer(this.edgeBufferShearA, 0, toFloat32(shearA));
        this.device.queue.writeBuffer(this.edgeBufferShearB, 0, toFloat32(shearB));
    }

    initIndices() {
        const indexData = new Uint32Array(INDEX_COUNT);
        let idx = 0;

        for (let j = 0; j < CLOTH_SIZE - 1; j++) {
            for (let i = 0; i < CLOTH_SIZE - 1; i++) {
                const a = j * CLOTH_SIZE + i;
                const b = j * CLOTH_SIZE + i + 1;
                const c = (j + 1) * CLOTH_SIZE + i;
                const d = (j + 1) * CLOTH_SIZE + i + 1;

                indexData[idx++] = a;
                indexData[idx++] = b;
                indexData[idx++] = c;

                indexData[idx++] = b;
                indexData[idx++] = d;
                indexData[idx++] = c;
            }
        }

        this.device.queue.writeBuffer(this.indexBuffer, 0, indexData);
    }

    updateUniforms(dt, time, windX, windY, windZ) {
        const uniformData = new Float32Array(64);

        uniformData[0] = windX;
        uniformData[1] = this.params.damping;
        uniformData[2] = windZ;
        uniformData[3] = this.params.gravity;

        uniformData[8] = dt;

        uniformData[9] = 0;
        uniformData[10] = -1;
        uniformData[11] = 0;
        uniformData[12] = 2;

        uniformData[13] = this.mouseX;
        uniformData[14] = this.mouseY;
        uniformData[15] = this.mouseZ;

        uniformData[16] = this.mouseActive;
        uniformData[17] = this.mouseParticleIndex;

        uniformData[20] = this.params.stiffness;

        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
    }

    updateCamera(viewMatrix, projMatrix, cameraPos) {
        const viewProj = new Float32Array(16);

        const a = projMatrix;
        const b = viewMatrix;

        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) {
                    sum += a[i * 4 + k] * b[k * 4 + j];
                }
                viewProj[i * 4 + j] = sum;
            }
        }

        const renderData = new Float32Array(64);

        for (let i = 0; i < 16; i++) {
            renderData[i] = viewProj[i];
        }

        renderData[16] = cameraPos[0];
        renderData[17] = cameraPos[1];
        renderData[18] = cameraPos[2];

        renderData[19] = this.showStress;

        renderData[20] = 0;
        renderData[21] = -1;
        renderData[22] = 0;
        renderData[23] = 2;

        this.device.queue.writeBuffer(this.renderUniformBuffer, 0, renderData);
    }

    setParams(params) {
        this.params.stiffness = params.stiffness;
        this.params.damping = params.damping;
        this.params.mass = params.mass;
        this.params.gravity = params.gravity;
        this.params.windStrength = params.windStrength;
    }

    setMouseParticle(index) {
        this.mouseParticleIndex = index;
        this.mouseActive = index >= 0 ? 1 : 0;
    }

    setMousePosition(x, y, z) {
        this.mouseX = x;
        this.mouseY = y;
        this.mouseZ = z;
    }

    setShowStress(show) {
        this.showStress = show ? 1.0 : 0.0;
    }

    simulate(dt, time) {
        const windStrength = this.params.windStrength;
        const windX = Math.sin(time * 0.5) * windStrength;
        const windY = Math.sin(time * 0.3) * windStrength * 0.2;
        const windZ = Math.cos(time * 0.7) * windStrength;

        const subSteps = SUB_STEPS;
        const subDt = dt / subSteps;

        this.updateUniforms(subDt, time, windX, windY, windZ);

        const encoder = this.device.createCommandEncoder();

        for (let step = 0; step < subSteps; step++) {
            const integratePass = encoder.beginComputePass();
            integratePass.setPipeline(this.integratePipeline);
            integratePass.setBindGroup(0, this.bindGroups.integrate);
            integratePass.dispatchWorkgroups(Math.ceil(PARTICLE_COUNT / 128));
            integratePass.end();

            for (let iter = 0; iter < CONSTRAINT_ITERATIONS; iter++) {
                const solve1 = encoder.beginComputePass();
                solve1.setPipeline(this.solvePipeline);
                solve1.setBindGroup(0, this.bindGroups.solveStructuralA_B);
                solve1.dispatchWorkgroups(Math.ceil(this.structuralEdgeCountA / 128));
                solve1.end();

                const solve2 = encoder.beginComputePass();
                solve2.setPipeline(this.solvePipeline);
                solve2.setBindGroup(0, this.bindGroups.solveStructuralB_B);
                solve2.dispatchWorkgroups(Math.ceil(this.structuralEdgeCountB / 128));
                solve2.end();

                const solve3 = encoder.beginComputePass();
                solve3.setPipeline(this.solvePipeline);
                solve3.setBindGroup(0, this.bindGroups.solveShearA_B);
                solve3.dispatchWorkgroups(Math.ceil(this.shearEdgeCountA / 128));
                solve3.end();

                const solve4 = encoder.beginComputePass();
                solve4.setPipeline(this.solvePipeline);
                solve4.setBindGroup(0, this.bindGroups.solveShearB_B);
                solve4.dispatchWorkgroups(Math.ceil(this.shearEdgeCountB / 128));
                solve4.end();
            }

            const collisionPass = encoder.beginComputePass();
            collisionPass.setPipeline(this.collisionPipeline);
            collisionPass.setBindGroup(0, this.bindGroups.collision_B);
            collisionPass.dispatchWorkgroups(Math.ceil(PARTICLE_COUNT / 128));
            collisionPass.end();

            encoder.copyBufferToBuffer(
                this.particleBufferB, 0,
                this.particleBufferA, 0,
                PARTICLE_COUNT * 32
            );
        }

        const stressPass = encoder.beginComputePass();
        stressPass.setPipeline(this.stressPipeline);
        stressPass.setBindGroup(0, this.bindGroups.stress);
        stressPass.dispatchWorkgroups(Math.ceil(PARTICLE_COUNT / 128));
        stressPass.end();

        this.stressReadCounter++;
        if (this.stressReadCounter >= STRESS_READ_INTERVAL && !this.pendingStressRead) {
            this.stressReadCounter = 0;
            encoder.copyBufferToBuffer(
                this.stressBuffer, 0,
                this.stressReadBuffer, 0,
                PARTICLE_COUNT * 4
            );
            this.pendingStressRead = true;
        }

        this.device.queue.submit([encoder.finish()]);
    }

    async readStress() {
        if (!this.pendingStressRead) {
            return null;
        }

        this.pendingStressRead = false;

        await this.stressReadBuffer.mapAsync(GPUMapMode.READ);
        const data = new Float32Array(this.stressReadBuffer.getMappedRange());
        const stress = new Float32Array(data);
        this.stressReadBuffer.unmap();

        let maxStress = 0;
        for (let i = 0; i < stress.length; i++) {
            if (stress[i] > maxStress) maxStress = stress[i];
        }

        return { stress, maxStress };
    }

    render() {
        const encoder = this.device.createCommandEncoder();

        const renderPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: 0.1, g: 0.1, b: 0.18, a: 1 },
                loadOp: 'clear',
                storeOp: 'store'
            }],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),
                depthClearValue: 1,
                depthLoadOp: 'clear',
                depthStoreOp: 'store'
            }
        });

        renderPass.setPipeline(this.sphereRenderPipeline);
        renderPass.setBindGroup(0, this.bindGroups.sphere);
        renderPass.draw(36);

        renderPass.setPipeline(this.renderPipeline);
        renderPass.setBindGroup(0, this.bindGroups.render);
        renderPass.setVertexBuffer(0, this.particleBufferA);
        renderPass.setIndexBuffer(this.indexBuffer, 'uint32');
        renderPass.drawIndexed(INDEX_COUNT);

        renderPass.end();

        this.device.queue.submit([encoder.finish()]);
    }

    resetCloth() {
        this.initParticles();
    }

    getParticleCount() {
        return PARTICLE_COUNT;
    }

    getEdgeCount() {
        return EDGE_COUNT;
    }
}