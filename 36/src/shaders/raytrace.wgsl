struct Uniforms {
  cameraPos: vec3f,
  pad0: f32,
  cameraDir: vec3f,
  pad1: f32,
  cameraRight: vec3f,
  pad2: f32,
  cameraUp: vec3f,
  pad3: f32,
  invViewProj: mat4x4f,
  resolution: vec2f,
  frameCount: f32,
  voxelSize: vec3f,
  maxBounces: f32,
  shadowSteps: f32,
  aoStrength: f32,
  aoRadius: f32,
  exposure: f32,
  gamma: f32,
  tonemapStrength: f32,
  sunDirection: vec3f,
  sunIntensity: f32,
  sunColor: vec3f,
  pad4: f32,
  ambientColor: vec3f,
  bakeEnabled: f32,
  indirectStrength: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var voxelTexture: texture_3d<u32>;
@group(0) @binding(2) var paletteTexture: texture_1d<f32>;
@group(0) @binding(3) var<storage, read> svoNodes: array<u32>;
@group(0) @binding(4) var outputTexture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var irradianceTexture: texture_3d<f32>;
@group(0) @binding(6) var radiosityTexture: texture_3d<f32>;

fn getVoxel(x: i32, y: i32, z: i32) -> u32 {
  let size = vec3i(uniforms.voxelSize);
  if (x < 0 || y < 0 || z < 0 || x >= size.x || y >= size.y || z >= size.z) {
    return 0u;
  }
  return textureLoad(voxelTexture, vec3i(x, y, z), 0).x;
}

fn getPaletteColor(index: u32) -> vec3f {
  let color = textureLoad(paletteTexture, i32(index), 0);
  return color.rgb;
}

struct Ray {
  origin: vec3f,
  direction: vec3f,
  tMax: f32,
};

struct HitResult {
  hit: bool,
  position: vec3f,
  normal: vec3f,
  color: vec3f,
  distance: f32,
};

fn intersectVoxelsDDA(ray: Ray) -> HitResult {
  var result: HitResult;
  result.hit = false;
  result.distance = 1e30f;

  let size = uniforms.voxelSize;
  let boxMin = vec3f(0.0f, 0.0f, 0.0f);
  let boxMax = size;
  let EPS = 1e-4f;

  var tMin = (boxMin - ray.origin) / ray.direction;
  var tMaxBox = (boxMax - ray.origin) / ray.direction;
  
  let t1 = min(tMin, tMaxBox);
  let t2 = max(tMin, tMaxBox);
  tMin = max(max(t1.x, t1.y), t1.z);
  tMaxBox = min(min(t2.x, t2.y), t2.z);

  if (tMaxBox < 0.0f || tMin > tMaxBox || tMin > ray.tMax) {
    return result;
  }

  var t = max(tMin, 0.0f) + EPS;
  let startPos = ray.origin + ray.direction * t;
  
  var mapPos = vec3i(floor(startPos));
  mapPos = clamp(mapPos, vec3i(0), vec3i(size) - vec3i(1));
  
  let step = vec3i(sign(ray.direction));
  let tDelta = abs(1.0f / ray.direction);
  
  let voxelBoundary = vec3f(mapPos) + select(vec3f(1.0f), vec3f(0.0f), step > vec3i(0));
  var tMaxDist = (voxelBoundary - startPos) / ray.direction;
  
  tMaxDist = select(
    tMaxDist,
    vec3f(1e30f),
    abs(ray.direction) < vec3f(1e-20f)
  );

  let maxSteps = i32(size.x + size.y + size.z);
  var normal = vec3f(0.0f);
  var hitT = t;

  for (var i = 0; i < maxSteps; i++) {
    let voxel = getVoxel(mapPos.x, mapPos.y, mapPos.z);
    if (voxel > 0u) {
      result.hit = true;
      result.distance = hitT;
      result.position = ray.origin + ray.direction * hitT;
      result.normal = normal;
      result.color = getPaletteColor(voxel);
      return result;
    }

    if (tMaxDist.x < tMaxDist.y) {
      if (tMaxDist.x < tMaxDist.z) {
        normal = vec3f(-f32(step.x), 0.0f, 0.0f);
        hitT = tMaxDist.x;
        mapPos.x += step.x;
        tMaxDist.x += tDelta.x;
      } else {
        normal = vec3f(0.0f, 0.0f, -f32(step.z));
        hitT = tMaxDist.z;
        mapPos.z += step.z;
        tMaxDist.z += tDelta.z;
      }
    } else {
      if (tMaxDist.y < tMaxDist.z) {
        normal = vec3f(0.0f, -f32(step.y), 0.0f);
        hitT = tMaxDist.y;
        mapPos.y += step.y;
        tMaxDist.y += tDelta.y;
      } else {
        normal = vec3f(0.0f, 0.0f, -f32(step.z));
        hitT = tMaxDist.z;
        mapPos.z += step.z;
        tMaxDist.z += tDelta.z;
      }
    }

    t = min(tMaxDist.x, min(tMaxDist.y, tMaxDist.z));

    if (t > tMaxBox || t > ray.tMax) {
      break;
    }

    if (any(mapPos < vec3i(0)) || any(mapPos >= vec3i(size))) {
      break;
    }
  }

  return result;
}

fn calculateShadow(origin: vec3f, normal: vec3f) -> f32 {
  let sunDir = normalize(uniforms.sunDirection);
  let bias = select(1e-3f, -1e-3f, dot(sunDir, normal) < 0.0f);
  let shadowRay: Ray = Ray(
    origin + normal * bias,
    sunDir,
    100.0f
  );

  let hit = intersectVoxelsDDA(shadowRay);
  return select(1.0f, 0.0f, hit.hit);
}

fn calculateAO(pos: vec3f, normal: vec3f) -> f32 {
  let radius = uniforms.aoRadius;
  let strength = uniforms.aoStrength;
  var ao = 0.0f;
  let samples = 8;

  let offsets = array<vec3f, 8>(
    vec3f(1.0f, 1.0f, 1.0f),
    vec3f(-1.0f, 1.0f, 1.0f),
    vec3f(1.0f, -1.0f, 1.0f),
    vec3f(-1.0f, -1.0f, 1.0f),
    vec3f(1.0f, 1.0f, -1.0f),
    vec3f(-1.0f, 1.0f, -1.0f),
    vec3f(1.0f, -1.0f, -1.0f),
    vec3f(-1.0f, -1.0f, -1.0f)
  );

  for (var i = 0; i < samples; i++) {
    let offset = normalize(offsets[i]) * radius;
    let samplePos = pos + offset;
    let dir = samplePos - pos;
    let len = length(dir);
    
    let aoRay: Ray = Ray(
      pos + normal * 1e-3f,
      normalize(dir),
      len
    );
    
    let hit = intersectVoxelsDDA(aoRay);
    if (hit.hit) {
      ao += 1.0f - hit.distance / len;
    }
  }

  return 1.0f - (ao / f32(samples)) * strength;
}

fn getSkyColor(dir: vec3f) -> vec3f {
  let sunDir = normalize(uniforms.sunDirection);
  let sunDot = max(dot(dir, sunDir), 0.0f);
  
  let skyGrad = mix(
    vec3f(0.4f, 0.6f, 1.0f),
    vec3f(0.8f, 0.9f, 1.0f),
    pow(max(dir.y, 0.0f), 0.5f)
  );
  
  let sunDisc = smoothstep(0.998f, 0.9995f, sunDot) * 3.0f;
  let sunGlow = pow(sunDot, 8.0f) * 0.5f;
  
  return skyGrad + vec3f(sunDisc) * uniforms.sunColor + sunGlow * uniforms.sunColor;
}

fn tonemapACES(color: vec3f) -> vec3f {
  let a = 2.51f;
  let b = 0.03f;
  let c = 2.43f;
  let d = 0.59f;
  let e = 0.14f;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3f(0.0f), vec3f(1.0f));
}

fn random(seed: vec2f) -> f32 {
  return fract(sin(dot(seed, vec2f(12.9898f, 78.233f))) * 43758.5453f);
}

fn randomOnHemisphere(normal: vec3f, seed: vec2f) -> vec3f {
  var u1 = random(seed);
  var u2 = random(seed + vec2f(1.0f, 2.0f));
  
  let r = sqrt(1.0f - u1 * u1);
  let phi = 2.0f * 3.14159265359f * u2;
  
  var tangent = normalize(abs(normal.y) < 0.999f ? vec3f(0.0f, 1.0f, 0.0f) : vec3f(1.0f, 0.0f, 0.0f));
  let bitangent = cross(normal, tangent);
  tangent = cross(bitangent, normal);
  
  return normalize(
    tangent * (cos(phi) * r) +
    bitangent * (sin(phi) * r) +
    normal * u1
  );
}

fn sampleLightMap(pos: vec3f) -> vec3f {
  let size = vec3f(uniforms.voxelSize);
  let uv = pos / size;
  
  let irradiance = textureLoad(irradianceTexture, vec3i(pos), 0).rgb;
  let radiosity = textureLoad(radiosityTexture, vec3i(pos), 0).rgb;
  
  return mix(irradiance, radiosity, 0.5f);
}

fn traceRay(ray: Ray) -> vec3f {
  var color = vec3f(0.0f);
  var throughput = vec3f(1.0f);
  var currentRay = ray;
  let useBake = uniforms.bakeEnabled > 0.5f;

  for (var bounce = 0; bounce < i32(uniforms.maxBounces) + 1; bounce++) {
    let hit = intersectVoxelsDDA(currentRay);
    
    if (!hit.hit) {
      color += throughput * getSkyColor(currentRay.direction) * 0.5f;
      break;
    }

    var totalLight = vec3f(0.0f);
    
    if (useBake && bounce == 0) {
      let voxelPos = floor(hit.position);
      let bakedLight = sampleLightMap(voxelPos);
      totalLight = bakedLight;
    } else {
      let shadow = calculateShadow(hit.position, hit.normal);
      let ao = calculateAO(hit.position, hit.normal);
      
      let sunDir = normalize(uniforms.sunDirection);
      let ndotl = max(dot(hit.normal, sunDir), 0.0f);
      let sunLight = ndotl * uniforms.sunIntensity * uniforms.sunColor * shadow;
      
      let ambient = uniforms.ambientColor * ao;
      totalLight = sunLight + ambient;
    }
    
    color += throughput * hit.color * totalLight;
    throughput *= hit.color * 0.7f;

    if (max(throughput.x, max(throughput.y, throughput.z)) < 0.01f) {
      break;
    }

    let seed = vec2f(
      f32(hit.position.x * 100.0f + bounce * 17.0f),
      f32(hit.position.z * 100.0f + bounce * 31.0f)
    );
    let newDir = randomOnHemisphere(hit.normal, seed);
    
    currentRay = Ray(
      hit.position + hit.normal * 0.01f,
      newDir,
      100.0f
    );
  }

  return color;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
  let resolution = vec2u(uniforms.resolution);
  let fragCoord = vec2f(global_id.xy) + 0.5f;
  
  if (any(global_id.xy >= resolution)) {
    return;
  }

  let uv = (fragCoord / vec2f(resolution)) * 2.0f - 1.0f;
  
  let fov = 45.0f * 3.14159265359f / 180.0f;
  let aspect = uniforms.resolution.x / uniforms.resolution.y;
  let scale = tan(fov * 0.5f);
  
  var rayDir = normalize(
    uniforms.cameraDir +
    uniforms.cameraRight * uv.x * scale * aspect +
    uniforms.cameraUp * uv.y * scale
  );

  let ray: Ray = Ray(
    uniforms.cameraPos,
    rayDir,
    500.0f
  );

  var color = traceRay(ray);
  
  color *= uniforms.exposure;
  color = mix(color, tonemapACES(color), uniforms.tonemapStrength);
  color = pow(color, vec3f(1.0f / uniforms.gamma));

  textureStore(outputTexture, vec2i(global_id.xy), vec4f(color, 1.0f));
}
