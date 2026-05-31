export const vertexShader = `
    attribute float clusterId;
    attribute float featureValue;
    attribute vec3 originalColor;
    
    uniform float pointSize;
    uniform float uTime;
    uniform vec3 uHoveredClusterCenter;
    uniform float uHoveredClusterId;
    uniform int uColorScheme;
    uniform mat4 uModelMatrix;
    
    varying vec3 vColor;
    varying float vAlpha;
    varying float vClusterId;
    varying float vFeatureValue;
    varying vec3 vPosition;
    
    vec3 heatmapColor(float value) {
        float t = clamp(value, 0.0, 1.0);
        
        vec3 c0 = vec3(0.192, 0.212, 0.584);
        vec3 c1 = vec3(0.271, 0.459, 0.706);
        vec3 c2 = vec3(0.455, 0.678, 0.820);
        vec3 c3 = vec3(0.671, 0.851, 0.914);
        vec3 c4 = vec3(0.878, 0.953, 0.973);
        vec3 c5 = vec3(1.000, 1.000, 0.749);
        vec3 c6 = vec3(0.996, 0.878, 0.565);
        vec3 c7 = vec3(0.992, 0.682, 0.380);
        vec3 c8 = vec3(0.957, 0.427, 0.263);
        vec3 c9 = vec3(0.843, 0.188, 0.153);
        vec3 c10 = vec3(0.647, 0.000, 0.149);
        
        if (t < 0.1) return mix(c0, c1, t * 10.0);
        else if (t < 0.2) return mix(c1, c2, (t - 0.1) * 10.0);
        else if (t < 0.3) return mix(c2, c3, (t - 0.2) * 10.0);
        else if (t < 0.4) return mix(c3, c4, (t - 0.3) * 10.0);
        else if (t < 0.5) return mix(c4, c5, (t - 0.4) * 10.0);
        else if (t < 0.6) return mix(c5, c6, (t - 0.5) * 10.0);
        else if (t < 0.7) return mix(c6, c7, (t - 0.6) * 10.0);
        else if (t < 0.8) return mix(c7, c8, (t - 0.7) * 10.0);
        else if (t < 0.9) return mix(c8, c9, (t - 0.8) * 10.0);
        else return mix(c9, c10, (t - 0.9) * 10.0);
    }
    
    vec3 heightColor(float height) {
        float t = clamp(height, 0.0, 1.0);
        vec3 blue = vec3(0.0, 0.0, 1.0);
        vec3 cyan = vec3(0.0, 1.0, 1.0);
        vec3 green = vec3(0.0, 1.0, 0.0);
        vec3 yellow = vec3(1.0, 1.0, 0.0);
        vec3 red = vec3(1.0, 0.0, 0.0);
        
        if (t < 0.25) return mix(blue, cyan, t * 4.0);
        else if (t < 0.5) return mix(cyan, green, (t - 0.25) * 4.0);
        else if (t < 0.75) return mix(green, yellow, (t - 0.5) * 4.0);
        else return mix(yellow, red, (t - 0.75) * 4.0);
    }
    
    vec3 clusterColor(float id) {
        float h = mod(id * 0.618033988749895, 1.0);
        float s = 0.7;
        float v = 0.9;
        
        int i = int(floor(h * 6.0));
        float f = h * 6.0 - float(i);
        float p = v * (1.0 - s);
        float q = v * (1.0 - s * f);
        float t = v * (1.0 - s * (1.0 - f));
        
        vec3 color;
        if (i == 0) color = vec3(v, t, p);
        else if (i == 1) color = vec3(q, v, p);
        else if (i == 2) color = vec3(p, v, t);
        else if (i == 3) color = vec3(p, q, v);
        else if (i == 4) color = vec3(t, p, v);
        else color = vec3(v, p, q);
        
        return color;
    }
    
    void main() {
        vec4 worldPos = uModelMatrix * vec4(position, 1.0);
        vPosition = worldPos.xyz;
        
        vec3 color;
        if (uColorScheme == 0) {
            color = heatmapColor(featureValue);
        } else if (uColorScheme == 1) {
            color = heightColor(featureValue);
        } else if (uColorScheme == 2) {
            color = clusterColor(clusterId);
        } else {
            color = originalColor;
        }
        
        bool isHovered = clusterId == uHoveredClusterId && uHoveredClusterId >= 0.0;
        
        if (uHoveredClusterId >= 0.0 && !isHovered) {
            color *= 0.3;
            vAlpha = 0.3;
        } else if (isHovered) {
            color = vec3(1.0, 0.2, 0.2);
            vAlpha = 0.6;
        } else {
            vAlpha = 1.0;
        }
        
        vColor = color;
        vClusterId = clusterId;
        vFeatureValue = featureValue;
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        
        float size = pointSize * (300.0 / -mvPosition.z);
        gl_PointSize = max(1.0, size);
    }
`;

export const fragmentShader = `
    varying vec3 vColor;
    varying float vAlpha;
    varying vec3 vPosition;
    
    void main() {
        vec2 coord = gl_PointCoord - vec2(0.5);
        float dist = length(coord);
        
        if (dist > 0.5) {
            discard;
        }
        
        float alpha = smoothstep(0.5, 0.3, dist) * vAlpha;
        
        gl_FragColor = vec4(vColor, alpha);
    }
`;

export const gpuClusterVertexShader = `
    attribute vec3 position;
    attribute vec3 color;
    
    uniform sampler2D centroidsTexture;
    uniform int numCentroids;
    uniform int textureWidth;
    
    varying vec3 vPosition;
    varying float vClusterId;
    varying float vMinDistance;
    
    vec3 getCentroid(int index) {
        int x = index % textureWidth;
        int y = index / textureWidth;
        vec2 uv = (vec2(float(x), float(y)) + 0.5) / vec2(float(textureWidth), float(textureWidth));
        return texture2D(centroidsTexture, uv).xyz;
    }
    
    void main() {
        vPosition = position;
        
        float minDist = 1000000.0;
        float clusterId = 0.0;
        
        for (int i = 0; i < 20; i++) {
            if (i >= numCentroids) break;
            
            vec3 centroid = getCentroid(i);
            float dist = distance(position, centroid);
            
            if (dist < minDist) {
                minDist = dist;
                clusterId = float(i);
            }
        }
        
        vClusterId = clusterId;
        vMinDistance = minDist;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

export const gpuClusterFragmentShader = `
    precision highp float;
    
    varying vec3 vPosition;
    varying float vClusterId;
    varying float vMinDistance;
    
    void main() {
        gl_FragColor = vec4(vClusterId, vMinDistance, vPosition.x, vPosition.y);
    }
`;
