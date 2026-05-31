struct BakeUniforms {
  voxelSize: vec3f,
  pad0: f32,
  sunDirection: vec3f,
  sunIntensity: f32,
  sunColor: vec3f,
  pad1: f32,
  ambientColor: vec3f,
  bakeQuality: f32,
  bakeBounces: f32,
  indirectStrength: f32,
  pad2: vec2f,
};

@group(0) @binding(0) var<uniform> uniforms: BakeUniforms;
@group(0) @binding(1) var voxelTexture: texture_3d<u32>;
@group(0) @binding(2) var paletteTexture: texture_1d<f32>;
@group(0) @binding(3) var irradianceTexture: texture_storage_3d<rgba16float, write>;
@group(0) @binding(4) var radiosityTexture: texture_storage_3d<rgba16float, write>;
@group(0) @binding(5) var<storage, read_write> workingBuffer: array<f32>;

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

fn isExposed(x: i32, y: i32, z: i32) -> bool {
  return getVoxel(x + 1, y, z) == 0u ||
         getVoxel(x - 1, y, z) == 0u ||
         getVoxel(x, y + 1, z) == 0u ||
         getVoxel(x, y - 1, z) == 0u ||
         getVoxel(x, y, z + 1) == 0u ||
         getVoxel(x, y, z - 1) == 0u;
}

fn calculateNormal(x: i32, y: i32, z: i32) -> vec3f {
  var normal = vec3f(0.0f, 0.0f, 0.0f);
  
  if (getVoxel(x + 1, y, z) == 0u) { normal.x += 1.0f; }
  if (getVoxel(x - 1, y, z) == 0u) { normal.x -= 1.0f; }
  if (getVoxel(x, y + 1, z) == 0u) { normal.y += 1.0f; }
  if (getVoxel(x, y - 1, z) == 0u) { normal.y -= 1.0f; }
  if (getVoxel(x, y, z + 1) == 0u) { normal.z += 1.0f; }
  if (getVoxel(x, y, z - 1) == 0u) { normal.z -= 1.0f; }
  
  let len = length(normal);
  return select(normal / len, vec3f(0.0f), len < 0.001f);
}

fn traceShadowRay(origin: vec3f, dir: vec3f, maxDist: f32) -> bool {
  var t = 0.0f;
  let EPS = 1e-3f;
  let startPos = origin + dir * EPS;
  
  var mapPos = vec3i(floor(startPos));
  let size = vec3i(uniforms.voxelSize);
  
  if (any(mapPos < vec3i(0)) || any(mapPos >= size)) {
    return false;
  }
  
  let step = vec3i(sign(dir));
  let tDelta = abs(1.0f / dir);
  
  let boundary = vec3f(mapPos) + select(vec3f(1.0f), vec3f(0.0f), step > vec3i(0));
  var tMaxDist = (boundary - startPos) / dir;
  
  tMaxDist = select(
    tMaxDist,
    vec3f(1e30f),
    abs(dir) < vec3f(1e-20f)
  );

  let maxSteps = 512;
  for (var i = 0; i < maxSteps; i++) {
    let voxel = getVoxel(mapPos.x, mapPos.y, mapPos.z);
    if (voxel > 0u) {
      return true;
    }

    if (tMaxDist.x < tMaxDist.y) {
      if (tMaxDist.x < tMaxDist.z) {
        mapPos.x += step.x;
        t = tMaxDist.x;
        tMaxDist.x += tDelta.x;
      } else {
        mapPos.z += step.z;
        t = tMaxDist.z;
        tMaxDist.z += tDelta.z;
      }
    } else {
      if (tMaxDist.y < tMaxDist.z) {
        mapPos.y += step.y;
        t = tMaxDist.y;
        tMaxDist.y += tDelta.y;
      } else {
        mapPos.z += step.z;
        t = tMaxDist.z;
        tMaxDist.z += tDelta.z;
      }
    }

    if (t > maxDist) {
      return false;
    }

    if (any(mapPos < vec3i(0)) || any(mapPos >= size)) {
      return false;
    }
  }

  return false;
}

fn calculateDirectLighting(pos: vec3f, normal: vec3f) -> vec3f {
  let sunDir = normalize(uniforms.sunDirection);
  let ndotl = max(dot(normal, sunDir), 0.0f);
  
  var direct = vec3f(0.0f);
  
  if (ndotl > 0.0f) {
    let inShadow = traceShadowRay(pos, sunDir, 100.0f);
    if (!inShadow) {
      direct = uniforms.sunColor * uniforms.sunIntensity * ndotl;
    }
  }
  
  direct += uniforms.ambientColor;
  
  return direct;
}

fn calculateIndirectLighting(pos: vec3f, normal: vec3f, quality: i32) -> vec3f {
  var indirect = vec3f(0.0f);
  let samples = quality;
  
  let directions = array<vec3f, 6>(
    vec3f(1.0f, 0.0f, 0.0f),
    vec3f(-1.0f, 0.0f, 0.0f),
    vec3f(0.0f, 1.0f, 0.0f),
    vec3f(0.0f, -1.0f, 0.0f),
    vec3f(0.0f, 0.0f, 1.0f),
    vec3f(0.0f, 0.0f, -1.0f)
  );

  for (var i = 0; i < 6; i++) {
    let dir = directions[i];
    if (dot(dir, normal) <= 0.0f) {
      continue;
    }

    var hitFound = false;
    var hitColor = vec3f(0.0f);
    var hitDist = 0.0f;

    var t = 0.0f;
    let EPS = 1e-3f;
    let startPos = pos + dir * EPS;
    
    var mapPos = vec3i(floor(startPos));
    let size = vec3i(uniforms.voxelSize);
    
    let step = vec3i(sign(dir));
    let tDelta = abs(1.0f / dir);
    
    let boundary = vec3f(mapPos) + select(vec3f(1.0f), vec3f(0.0f), step > vec3i(0));
    var tMaxDist = (boundary - startPos) / dir;
    
    tMaxDist = select(
      tMaxDist,
      vec3f(1e30f),
      abs(dir) < vec3f(1e-20f)
    );

    let maxSteps = 256;
    for (var j = 0; j < maxSteps; j++) {
      let voxel = getVoxel(mapPos.x, mapPos.y, mapPos.z);
      if (voxel > 0u) {
        hitFound = true;
        hitColor = getPaletteColor(voxel);
        hitDist = t;
        break;
      }

      if (tMaxDist.x < tMaxDist.y) {
        if (tMaxDist.x < tMaxDist.z) {
          mapPos.x += step.x;
          t = tMaxDist.x;
          tMaxDist.x += tDelta.x;
        } else {
          mapPos.z += step.z;
          t = tMaxDist.z;
          tMaxDist.z += tDelta.z;
        }
      } else {
        if (tMaxDist.y < tMaxDist.z) {
          mapPos.y += step.y;
          t = tMaxDist.y;
          tMaxDist.y += tDelta.y;
        } else {
          mapPos.z += step.z;
          t = tMaxDist.z;
          tMaxDist.z += tDelta.z;
        }
      }

      if (t > 50.0f) {
        break;
      }

      if (any(mapPos < vec3i(0)) || any(mapPos >= size)) {
        break;
      }
    }

    if (hitFound) {
      let attenuation = 1.0f / (1.0f + hitDist * 0.1f + hitDist * hitDist * 0.01f);
      indirect += hitColor * attenuation * dot(dir, normal);
    } else {
      let skyColor = mix(vec3f(0.4f, 0.6f, 1.0f), vec3f(0.8f, 0.9f, 1.0f), max(dir.y, 0.0f));
      indirect += skyColor * 0.3f * dot(dir, normal);
    }
  }

  return indirect / 6.0f;
}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
  let size = vec3u(uniforms.voxelSize);
  
  if (any(global_id >= size)) {
    return;
  }

  let x = i32(global_id.x);
  let y = i32(global_id.y);
  let z = i32(global_id.z);

  let voxel = getVoxel(x, y, z);
  
  if (voxel == 0u) {
    textureStore(irradianceTexture, vec3i(global_id), vec4f(0.0f, 0.0f, 0.0f, 0.0f));
    textureStore(radiosityTexture, vec3i(global_id), vec4f(0.0f, 0.0f, 0.0f, 0.0f));
    return;
  }

  if (!isExposed(x, y, z)) {
    let color = getPaletteColor(voxel);
    textureStore(irradianceTexture, vec3i(global_id), vec4f(uniforms.ambientColor, 1.0f));
    textureStore(radiosityTexture, vec3i(global_id), vec4f(color * uniforms.ambientColor, 1.0f));
    return;
  }

  let pos = vec3f(f32(x) + 0.5f, f32(y) + 0.5f, f32(z) + 0.5f);
  let normal = calculateNormal(x, y, z);
  let albedo = getPaletteColor(voxel);

  let direct = calculateDirectLighting(pos, normal);
  let quality = i32(uniforms.bakeQuality);
  var indirect = calculateIndirectLighting(pos, normal, quality);
  indirect *= uniforms.indirectStrength;

  let totalIrradiance = direct + indirect;
  let radiosity = albedo * totalIrradiance;

  textureStore(irradianceTexture, vec3i(global_id), vec4f(totalIrradiance, 1.0f));
  textureStore(radiosityTexture, vec3i(global_id), vec4f(radiosity, 1.0f));
}
