import * as THREE from 'three'
import { SimplexNoise } from '../utils/Noise'

export interface TerrainConfig {
  size: number
  resolution: number
  maxHeight: number
  roughness: number
  octaves: number
  seed: number
}

export interface WeatherInfluence {
  rain: number
  snow: number
  snowAccumulation: number
}

export interface HeightMapData {
  heights: Float32Array
  normals: Float32Array
}

export class TerrainChunk {
  public mesh: THREE.Mesh
  private config: TerrainConfig
  private noise: SimplexNoise
  private lodLevel: number
  private position: THREE.Vector2
  private heightMap: HeightMapData
  private materialUniforms: {
    uMaxHeight: { value: number }
    uRainIntensity: { value: number }
    uSnowCoverage: { value: number }
    uSnowAccumulation: { value: number }
    uTime: { value: number }
  }

  constructor(
    config: TerrainConfig,
    noise: SimplexNoise,
    position: THREE.Vector2,
    lodLevel: number = 0
  ) {
    this.config = config
    this.noise = noise
    this.position = position
    this.lodLevel = lodLevel
    this.materialUniforms = {
      uMaxHeight: { value: this.config.maxHeight },
      uRainIntensity: { value: 0 },
      uSnowCoverage: { value: 0 },
      uSnowAccumulation: { value: 0 },
      uTime: { value: 0 }
    }
    this.heightMap = this.generateHeightMap()
    this.mesh = this.createMesh()
  }

  private generateHeightMap(): HeightMapData {
    const resolution = this.getLODResolution()
    const size = this.config.size
    const step = size / resolution
    const vertexCount = (resolution + 1) * (resolution + 1)
    
    const heights = new Float32Array(vertexCount)
    const normals = new Float32Array(vertexCount * 3)

    for (let z = 0; z <= resolution; z++) {
      for (let x = 0; x <= resolution; x++) {
        const idx = z * (resolution + 1) + x
        const worldX = this.position.x + x * step
        const worldZ = this.position.y + z * step
        
        const noiseValue = this.noise.fbm(
          worldX * this.config.roughness * 0.01,
          worldZ * this.config.roughness * 0.01,
          this.config.octaves
        )
        
        heights[idx] = (noiseValue + 1) * 0.5 * this.config.maxHeight
      }
    }

    for (let z = 0; z <= resolution; z++) {
      for (let x = 0; x <= resolution; x++) {
        const idx = z * (resolution + 1) + x
        const height = heights[idx]

        let hL = height
        let hR = height
        let hU = height
        let hD = height

        if (x > 0) hL = heights[z * (resolution + 1) + (x - 1)]
        if (x < resolution) hR = heights[z * (resolution + 1) + (x + 1)]
        if (z > 0) hU = heights[(z - 1) * (resolution + 1) + x]
        if (z < resolution) hD = heights[(z + 1) * (resolution + 1) + x]

        const nx = hL - hR
        const ny = 2 * step
        const nz = hD - hU
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
        
        const normalIdx = idx * 3
        normals[normalIdx] = nx / len
        normals[normalIdx + 1] = ny / len
        normals[normalIdx + 2] = nz / len
      }
    }

    return { heights, normals }
  }

  private getLODResolution(): number {
    const baseResolution = this.config.resolution
    const lodFactors = [1, 0.5, 0.25, 0.125, 0.0625]
    return Math.max(4, Math.floor(baseResolution * (lodFactors[this.lodLevel] || 0.0625)))
  }

  private createMesh(): THREE.Mesh {
    const resolution = this.getLODResolution()
    const geometry = new THREE.PlaneGeometry(
      this.config.size,
      this.config.size,
      resolution,
      resolution
    )

    geometry.rotateX(-Math.PI / 2)

    const positions = geometry.attributes.position as THREE.BufferAttribute
    const heights = this.heightMap.heights
    const step = this.config.size / resolution

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i)
      const z = positions.getZ(i)
      
      const localX = Math.round((x + this.config.size / 2) / step)
      const localZ = Math.round((z + this.config.size / 2) / step)
      const clampedX = Math.max(0, Math.min(resolution, localX))
      const clampedZ = Math.max(0, Math.min(resolution, localZ))
      
      const idx = clampedZ * (resolution + 1) + clampedX
      positions.setY(i, heights[idx] || 0)
    }

    positions.needsUpdate = true
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()

    const material = this.createTerrainMaterial()
    const mesh = new THREE.Mesh(geometry, material)

    mesh.position.set(
      this.position.x + this.config.size / 2,
      0,
      this.position.y + this.config.size / 2
    )

    mesh.castShadow = false
    mesh.receiveShadow = true
    mesh.frustumCulled = true

    return mesh
  }

  private createTerrainMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: this.materialUniforms,
      vertexShader: `
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        
        void main() {
          vPosition = position;
          vNormal = normalize(normalMatrix * normal);
          vUv = uv;
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uMaxHeight;
        uniform float uRainIntensity;
        uniform float uSnowCoverage;
        uniform float uSnowAccumulation;
        uniform float uTime;
        
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        
        float hash2(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        
        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          
          float a = hash2(i);
          float b = hash2(i + vec2(1.0, 0.0));
          float c = hash2(i + vec2(0.0, 1.0));
          float d = hash2(i + vec2(1.0, 1.0));
          
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        
        float fbm(vec2 p, int octaves) {
          float value = 0.0;
          float amp = 0.5;
          float freq = 1.0;
          
          for (int i = 0; i < 6; i++) {
            if (i >= octaves) break;
            value += amp * noise2(p * freq);
            amp *= 0.5;
            freq *= 2.0;
          }
          return value;
        }
        
        vec3 getGrassColor(vec2 uv) {
          float detail = fbm(uv * 30.0, 4);
          vec3 baseColor = vec3(0.35, 0.55, 0.25);
          vec3 darkColor = vec3(0.25, 0.42, 0.18);
          vec3 lightColor = vec3(0.42, 0.65, 0.32);
          return mix(mix(baseColor, darkColor, detail * 0.5), lightColor, detail * 0.3);
        }
        
        vec3 getDirtColor(vec2 uv) {
          float detail = fbm(uv * 25.0, 3);
          vec3 baseColor = vec3(0.45, 0.32, 0.22);
          vec3 darkColor = vec3(0.35, 0.25, 0.17);
          vec3 lightColor = vec3(0.55, 0.40, 0.28);
          return mix(baseColor, mix(darkColor, lightColor, detail), 0.4);
        }
        
        vec3 getRockColor(vec2 uv) {
          float detail = fbm(uv * 40.0, 4);
          float cracks = smoothstep(0.35, 0.45, detail);
          vec3 baseColor = vec3(0.45, 0.45, 0.48);
          vec3 darkColor = vec3(0.30, 0.30, 0.32);
          return mix(baseColor, darkColor, cracks * 0.6);
        }
        
        vec3 getSnowColor(vec2 uv) {
          float detail = fbm(uv * 15.0, 3);
          vec3 baseColor = vec3(0.95, 0.95, 0.97);
          vec3 blueTint = vec3(0.88, 0.92, 0.98);
          return mix(baseColor, blueTint, detail * 0.3);
        }
        
        vec3 getWetGrassColor(vec2 uv) {
          vec3 dry = getGrassColor(uv);
          vec3 wet = dry * 0.75;
          return wet;
        }
        
        vec3 getWetDirtColor(vec2 uv) {
          vec3 dry = getDirtColor(uv);
          vec3 wet = dry * 0.65;
          return wet;
        }
        
        vec3 getWetRockColor(vec2 uv) {
          vec3 dry = getRockColor(uv);
          vec3 wet = dry * 0.8;
          return wet;
        }
        
        void main() {
          float heightFactor = vPosition.y / uMaxHeight;
          float slope = 1.0 - dot(vNormal, vec3(0.0, 1.0, 0.0));
          
          float grassWeight = 0.0;
          float dirtWeight = 0.0;
          float rockWeight = 0.0;
          float snowWeight = 0.0;
          
          if (heightFactor < 0.3) {
            grassWeight = 1.0 - smoothstep(0.1, 0.3, heightFactor);
            dirtWeight = smoothstep(0.1, 0.3, heightFactor);
          } else if (heightFactor < 0.6) {
            grassWeight = 1.0 - smoothstep(0.3, 0.6, heightFactor);
            dirtWeight = smoothstep(0.3, 0.6, heightFactor);
            rockWeight = smoothstep(0.45, 0.6, heightFactor) * slope;
          } else if (heightFactor < 0.8) {
            dirtWeight = 1.0 - smoothstep(0.6, 0.8, heightFactor);
            rockWeight = smoothstep(0.6, 0.8, heightFactor) + slope * 0.5;
            snowWeight = smoothstep(0.7, 0.8, heightFactor);
          } else {
            rockWeight = 1.0 - smoothstep(0.8, 0.95, heightFactor);
            snowWeight = smoothstep(0.8, 0.95, heightFactor);
          }
          
          grassWeight *= (1.0 - slope * 0.8);
          dirtWeight += slope * 0.3;
          
          float total = grassWeight + dirtWeight + rockWeight + snowWeight;
          if (total > 0.0) {
            grassWeight /= total;
            dirtWeight /= total;
            rockWeight /= total;
            snowWeight /= total;
          }
          
          vec2 detailUV = vWorldPos.xz * 0.05;
          
          vec3 grassColor = uRainIntensity > 0.01 
            ? mix(getGrassColor(detailUV), getWetGrassColor(detailUV), uRainIntensity * 0.6)
            : getGrassColor(detailUV);
          vec3 dirtColor = uRainIntensity > 0.01 
            ? mix(getDirtColor(detailUV), getWetDirtColor(detailUV), uRainIntensity * 0.7)
            : getDirtColor(detailUV);
          vec3 rockColor = uRainIntensity > 0.01 
            ? mix(getRockColor(detailUV), getWetRockColor(detailUV), uRainIntensity * 0.5)
            : getRockColor(detailUV);
          
          vec3 baseColor = 
            grassWeight * grassColor +
            dirtWeight * dirtColor +
            rockWeight * rockColor +
            snowWeight * getSnowColor(detailUV);
          
          float weatherSnowFactor = uSnowCoverage * (1.0 - slope * 0.7);
          weatherSnowFactor *= (1.0 - uSnowAccumulation * 0.3);
          
          if (uSnowCoverage > 0.01) {
            vec2 snowUV = vWorldPos.xz * 0.03 + vec2(uTime * 0.002);
            float snowNoise = fbm(snowUV, 3);
            float snowThreshold = 1.0 - uSnowCoverage;
            float snowMask = smoothstep(snowThreshold - 0.2, snowThreshold + 0.2, snowNoise);
            snowMask *= (1.0 - slope * 0.8);
            snowMask *= smoothstep(0.0, 0.1, heightFactor + 0.2);
            
            vec3 snowColor = getSnowColor(vWorldPos.xz * 0.02);
            float wetSnowFactor = uRainIntensity * 0.3;
            snowColor = mix(snowColor, snowColor * 0.85, wetSnowFactor);
            
            baseColor = mix(baseColor, snowColor, snowMask * 0.85);
          }
          
          float wetSpecular = 0.0;
          if (uRainIntensity > 0.01) {
            float wetFactor = uRainIntensity * (1.0 - snowWeight) * (grassWeight + dirtWeight + rockWeight) * 0.5;
            wetSpecular = wetFactor;
            
            vec3 waterColor = vec3(0.5, 0.6, 0.7);
            baseColor = mix(baseColor, waterColor, wetFactor * 0.25);
          }
          
          vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
          float diffuse = max(dot(vNormal, lightDir), 0.0);
          float ambient = 0.3;
          
          vec3 viewDir = normalize(vec3(0.0, 1.0, 0.0));
          vec3 halfDir = normalize(lightDir + viewDir);
          float spec = pow(max(dot(vNormal, halfDir), 0.0), 32.0);
          float specular = spec * wetSpecular * 0.5;
          
          baseColor *= (ambient + diffuse * 0.7);
          baseColor += vec3(0.8, 0.85, 0.9) * specular;
          
          gl_FragColor = vec4(baseColor, 1.0);
        }
      `
    })
  }

  public updateWeatherInfluence(influence: WeatherInfluence): void {
    this.materialUniforms.uRainIntensity.value = influence.rain
    this.materialUniforms.uSnowCoverage.value = influence.snow
    this.materialUniforms.uSnowAccumulation.value = influence.snowAccumulation
  }

  public updateTime(time: number): void {
    this.materialUniforms.uTime.value = time
  }

  public getHeightAt(worldX: number, worldZ: number): number {
    const localX = worldX - this.position.x
    const localZ = worldZ - this.position.y
    
    if (localX < 0 || localX > this.config.size || localZ < 0 || localZ > this.config.size) {
      return -Infinity
    }

    const resolution = this.getLODResolution()
    const step = this.config.size / resolution
    
    const x0 = Math.floor(localX / step)
    const z0 = Math.floor(localZ / step)
    const x1 = Math.min(x0 + 1, resolution)
    const z1 = Math.min(z0 + 1, resolution)
    
    const fx = (localX - x0 * step) / step
    const fz = (localZ - z0 * step) / step
    
    const h00 = this.heightMap.heights[z0 * (resolution + 1) + x0] || 0
    const h10 = this.heightMap.heights[z0 * (resolution + 1) + x1] || 0
    const h01 = this.heightMap.heights[z1 * (resolution + 1) + x0] || 0
    const h11 = this.heightMap.heights[z1 * (resolution + 1) + x1] || 0
    
    const h0 = h00 * (1 - fx) + h10 * fx
    const h1 = h01 * (1 - fx) + h11 * fx
    
    return h0 * (1 - fz) + h1 * fz
  }

  public updateLOD(cameraPosition: THREE.Vector3): boolean {
    const chunkCenter = new THREE.Vector3(
      this.position.x + this.config.size / 2,
      0,
      this.position.y + this.config.size / 2
    )
    
    const distance = cameraPosition.distanceTo(chunkCenter)
    let newLOD = 0
    
    if (distance > this.config.size * 8) {
      newLOD = 4
    } else if (distance > this.config.size * 5) {
      newLOD = 3
    } else if (distance > this.config.size * 3) {
      newLOD = 2
    } else if (distance > this.config.size * 1.5) {
      newLOD = 1
    }
    
    if (newLOD !== this.lodLevel) {
      this.lodLevel = newLOD
      return true
    }
    return false
  }

  public regenerate(): void {
    const oldGeometry = this.mesh.geometry
    const oldMaterial = this.mesh.material
    
    this.heightMap = this.generateHeightMap()
    const newMesh = this.createMesh()
    
    if (this.mesh.parent) {
      this.mesh.parent.add(newMesh)
      this.mesh.parent.remove(this.mesh)
    }
    
    oldGeometry.dispose()
    if (oldMaterial instanceof THREE.Material) {
      oldMaterial.dispose()
    }
    
    this.mesh = newMesh
  }

  public dispose(): void {
    this.mesh.geometry.dispose()
    if (this.mesh.material instanceof THREE.Material) {
      this.mesh.material.dispose()
    }
  }
}
