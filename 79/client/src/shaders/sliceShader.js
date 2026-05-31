import * as THREE from 'three';

const vertexShader = `
    varying vec3 vWorldPosition;
    varying vec2 vUv;
    
    void main() {
        vUv = uv;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fragmentShader = `
    uniform vec3 uOrigin;
    uniform vec3 uSpacing;
    uniform vec3 uDimensions;
    uniform sampler2D uColorTexture;
    uniform float uSlicePosition;
    uniform int uSliceAxis;
    uniform vec3 uBoundsMin;
    uniform vec3 uBoundsMax;
    
    varying vec3 vWorldPosition;
    varying vec2 vUv;
    
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
    
    void main() {
        vec3 pos = vWorldPosition;
        
        if (pos.x < uBoundsMin.x || pos.x > uBoundsMax.x ||
            pos.y < uBoundsMin.y || pos.y > uBoundsMax.y ||
            pos.z < uBoundsMin.z || pos.z > uBoundsMax.z) {
            discard;
        }
        
        float layerId = getLayerValue(pos);
        vec3 baseColor = getLayerColor(layerId);
        
        float noiseVal = fbm(pos * 0.1);
        baseColor = mix(baseColor, baseColor * (0.85 + 0.3 * noiseVal), 0.4);
        
        vec2 center = vec2(0.5, 0.5);
        float dist = length(vUv - center);
        float edge = smoothstep(0.4, 0.5, dist);
        baseColor = mix(baseColor, baseColor * 0.7, edge * 0.3);
        
        gl_FragColor = vec4(baseColor, 1.0);
    }
`;

export function createSliceShader(options) {
    const { modelData, sliceAxis } = options;
    const { origin, spacing, dimensions, bounds, layers } = modelData;
    
    const boundsMin = new THREE.Vector3(bounds[0], bounds[2], bounds[4]);
    const boundsMax = new THREE.Vector3(bounds[1], bounds[3], bounds[5]);
    
    const colors = new Uint8Array(256 * 3);
    for (let i = 0; i < layers.length && i < 256; i++) {
        colors[i * 3] = Math.floor(layers[i].color[0] * 255);
        colors[i * 3 + 1] = Math.floor(layers[i].color[1] * 255);
        colors[i * 3 + 2] = Math.floor(layers[i].color[2] * 255);
    }
    
    const colorTexture = new THREE.DataTexture(colors, 256, 1, THREE.RGBFormat);
    colorTexture.needsUpdate = true;
    colorTexture.magFilter = THREE.NearestFilter;
    colorTexture.minFilter = THREE.NearestFilter;
    
    let axisIndex = 0;
    if (sliceAxis === 'y') axisIndex = 1;
    if (sliceAxis === 'z') axisIndex = 2;
    
    return new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
            uOrigin: { value: new THREE.Vector3(...origin) },
            uSpacing: { value: new THREE.Vector3(...spacing) },
            uDimensions: { value: new THREE.Vector3(...dimensions) },
            uColorTexture: { value: colorTexture },
            uSlicePosition: { value: 0.5 },
            uSliceAxis: { value: axisIndex },
            uBoundsMin: { value: boundsMin },
            uBoundsMax: { value: boundsMax }
        },
        side: THREE.DoubleSide
    });
}
