struct CameraUniform {
  viewProj: mat4x4f,
  cameraPos: vec3f,
  pad: f32
}

struct RenderUniform {
  minTemp: f32,
  refTemp: f32,
  maxTemp: f32,
  useTempColoring: f32
}

@group(0) @binding(0) var<uniform> camera: CameraUniform;
@group(1) @binding(0) var<storage, read> positions: array<vec4f>;
@group(2) @binding(0) var<storage, read> temperatures: array<f32>;
@group(2) @binding(1) var<uniform> renderUniforms: RenderUniform;

fn tempToColor(temperature: f32) -> vec3f {
  let minT = renderUniforms.minTemp;
  let refT = renderUniforms.refTemp;
  let maxT = renderUniforms.maxTemp;
  
  if (temperature <= minT) {
    return vec3f(0.0, 0.2, 1.0);
  } else if (temperature >= maxT) {
    return vec3f(1.0, 0.2, 0.0);
  }
  
  if (temperature <= refT) {
    let t = (temperature - minT) / (refT - minT);
    return vec3f(
      0.0 + 0.2 * t,
      0.2 + 0.4 * t,
      1.0 - 0.4 * t
    );
  } else {
    let t = (temperature - refT) / (maxT - refT);
    return vec3f(
      0.2 + 0.8 * t,
      0.6 - 0.4 * t,
      0.6 - 0.6 * t
    );
  }
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32,
           @builtin(instance_index) instanceIndex: u32) -> @builtin(position) vec4f {
  let pos = positions[instanceIndex];
  
  var localPos: vec2f;
  switch (vertexIndex) {
    case 0: { localPos = vec2f(-1.0, -1.0); }
    case 1: { localPos = vec2f(1.0, -1.0); }
    case 2: { localPos = vec2f(1.0, 1.0); }
    case 3: { localPos = vec2f(-1.0, 1.0); }
    default: { localPos = vec2f(0.0); }
  }
  
  let particleRadius = 0.015;
  let screenPos = camera.viewProj * vec4f(pos.xyz, 1.0);
  let offset = vec4f(localPos * particleRadius, 0.0, 0.0);
  
  return screenPos + offset;
}

@fragment
fn fs_main(@builtin(instance_index) instanceIndex: u32) -> @location(0) vec4f {
  if (renderUniforms.useTempColoring > 0.5) {
    let temperature = temperatures[instanceIndex];
    let color = tempToColor(temperature);
    return vec4f(color, 0.85);
  } else {
    return vec4f(0.2, 0.6, 1.0, 0.85);
  }
}
