struct Particle {
    position: vec3f,
    velocity: vec3f,
    color: vec3f,
}

struct CameraUniforms {
    viewProj: mat4x4f,
    cameraPos: vec3f,
    pointSize: f32,
}

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> cameraUniforms: CameraUniforms;

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
    @location(1) uv: vec2f,
}

@vertex
fn vs_main(
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
    var out: VertexOutput;
    
    let particle = particles[instanceIndex];
    
    let corners = array<vec2f, 6>(
        vec2f(-1.0, -1.0),
        vec2f(1.0, -1.0),
        vec2f(1.0, 1.0),
        vec2f(-1.0, -1.0),
        vec2f(1.0, 1.0),
        vec2f(-1.0, 1.0)
    );
    
    let corner = corners[vertexIndex];
    
    let worldPos = vec4f(particle.position, 1.0);
    let clipPos = cameraUniforms.viewProj * worldPos;
    
    let viewDepth = clipPos.w;
    let size = cameraUniforms.pointSize / max(viewDepth, 0.1);
    
    out.position = clipPos + vec4f(corner * size * clipPos.w, 0.0, 0.0);
    out.color = particle.color;
    out.uv = corner;
    
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    let dist = length(in.uv);
    
    let alpha = smoothstep(1.0, 0.6, dist);
    let glow = exp(-dist * 2.5) * 0.4 + 0.6;
    
    return vec4f(in.color * glow * alpha, alpha);
}
