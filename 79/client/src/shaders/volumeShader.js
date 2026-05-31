import * as THREE from 'three';

const vertexShader = `
    varying vec3 vWorldPosition;
    varying vec3 vLocalPosition;
    varying vec3 vNormal;
    
    void main() {
        vLocalPosition = position;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fragmentShader = `
    uniform vec3 uOrigin;
    uniform vec3 uSpacing;
    uniform vec3 uDimensions;
    uniform sampler2D uColorTexture;
    uniform int uRenderMode;
    uniform vec3 uSliceMode;
    uniform float uSlicePosition;
    uniform vec3 uBoundsMin;
    uniform vec3 uBoundsMax;
    
    varying vec3 vWorldPosition;
    varying vec3 vLocalPosition;
    varying vec3 vNormal;
    
    float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    
    float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        
        return mix(mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
                       mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                       mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }
    
    float fbm(vec3 p) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        
        for (int i = 0; i < 3; i++) {
            value += amplitude * noise(p * frequency);
            amplitude *= 0.5;
            frequency *= 2.0;
        }
        
        return value;
    }
    
    float getLayerValue(vec3 pos) {
        vec3 local = pos - uOrigin;
        
        float worldZ = local.z;
        float worldX = local.x;
        float worldY = local.y;
        
        float noise1 = sin(worldX * 0.1) * cos(worldY * 0.1) * 5.0;
        float noise2 = sin(worldX * 0.05 + worldY * 0.05) * 8.0;
        float adjustedZ = worldZ + noise1 + noise2;
        
        float layer = 0.0;
        if (adjustedZ < 10.0) layer = 0.0;
        else if (adjustedZ < 25.0) layer = 1.0;
        else if (adjustedZ < 40.0) layer = 2.0;
        else if (adjustedZ < 55.0) layer = 3.0;
        else if (adjustedZ < 70.0) layer = 7.0;
        else if (adjustedZ < 85.0) layer = 4.0;
        else layer = 5.0;
        
        return layer;
    }
    
    vec3 getLayerColor(float layerId) {
        float u = (layerId + 0.5) / 256.0;
        return texture2D(uColorTexture, vec2(u, 0.5)).rgb;
    }
    
    bool isInSlice(vec3 pos) {
        if (uSliceMode.x > 0.5) {
            float sliceX = uBoundsMin.x + (uBoundsMax.x - uBoundsMin.x) * uSlicePosition;
            if (pos.x > sliceX) return false;
        }
        if (uSliceMode.y > 0.5) {
            float sliceY = uBoundsMin.y + (uBoundsMax.y - uBoundsMin.y) * uSlicePosition;
            if (pos.y > sliceY) return false;
        }
        if (uSliceMode.z > 0.5) {
            float sliceZ = uBoundsMin.z + (uBoundsMax.z - uBoundsMin.z) * uSlicePosition;
            if (pos.z > sliceZ) return false;
        }
        return true;
    }
    
    void main() {
        if (!isInSlice(vWorldPosition)) {
            discard;
        }
        
        float layerId = getLayerValue(vWorldPosition);
        vec3 baseColor = getLayerColor(layerId);
        
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
        float diff = max(dot(vNormal, lightDir), 0.0);
        vec3 ambient = 0.3 * baseColor;
        vec3 diffuse = 0.7 * diff * baseColor;
        
        vec3 noiseOffset = vec3(
            fbm(vWorldPosition * 0.05),
            fbm(vWorldPosition * 0.05 + vec3(100.0)),
            fbm(vWorldPosition * 0.05 + vec3(200.0))
        );
        baseColor = mix(baseColor, baseColor * (0.9 + 0.2 * noiseOffset.x), 0.3);
        
        vec3 finalColor = ambient + diffuse;
        
        if (uRenderMode == 0) {
            float alpha = 0.95;
            
            vec3 viewDir = normalize(cameraPosition - vWorldPosition);
            float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.0);
            alpha = mix(alpha, 1.0, fresnel * 0.5);
            
            gl_FragColor = vec4(finalColor, alpha);
        } else {
            gl_FragColor = vec4(finalColor, 1.0);
        }
    }
`;

export function createVolumeShader(options) {
    const { dimensions, spacing, origin, colorTexture, bounds } = options;
    
    const boundsMin = new THREE.Vector3(bounds[0], bounds[2], bounds[4]);
    const boundsMax = new THREE.Vector3(bounds[1], bounds[3], bounds[5]);
    
    return new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
            uOrigin: { value: new THREE.Vector3(...origin) },
            uSpacing: { value: new THREE.Vector3(...spacing) },
            uDimensions: { value: new THREE.Vector3(...dimensions) },
            uColorTexture: { value: colorTexture },
            uRenderMode: { value: 0 },
            uSliceMode: { value: new THREE.Vector3(0, 0, 0) },
            uSlicePosition: { value: 0 },
            uBoundsMin: { value: boundsMin },
            uBoundsMax: { value: boundsMax }
        },
        transparent: true,
        side: THREE.DoubleSide
    });
}
