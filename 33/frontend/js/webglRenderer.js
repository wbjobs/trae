export class WebGLRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        this.programs = {};
        this.currentProgram = null;
        this.texture = null;
        this.framebuffer = null;
        this.quadBuffer = null;
        
        if (!this.gl) {
            throw new Error('WebGL not supported');
        }
        
        this._init();
    }

    _init() {
        const gl = this.gl;
        
        const quadVertices = new Float32Array([
            -1, -1,  0, 1,
             1, -1,  1, 1,
            -1,  1,  0, 0,
             1,  1,  1, 0
        ]);
        
        this.quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
        
        this._createDefaultProgram();
        this._createSketchProgram();
        this._createOilProgram();
        this._createPixelateProgram();
        this._createGrayscaleProgram();
        this._createSepiaProgram();
        this._createBlurProgram();
        this._createSharpenProgram();
        this._createEdgeProgram();
        this._createVintageProgram();
        this._createCartoonProgram();
        this._createStyleTransferProgram();
    }

    _createShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }

    _createProgram(vertexSource, fragmentSource) {
        const gl = this.gl;
        const vertexShader = this._createShader(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this._createShader(gl.FRAGMENT_SHADER, fragmentSource);
        
        if (!vertexShader || !fragmentShader) return null;
        
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(program));
            return null;
        }
        
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        
        return program;
    }

    _getVertexSource() {
        return `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 v_texCoord;
            
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
            }
        `;
    }

    _createDefaultProgram() {
        const fragmentSource = `
            precision mediump float;
            varying vec2 v_texCoord;
            uniform sampler2D u_image;
            
            void main() {
                gl_FragColor = texture2D(u_image, v_texCoord);
            }
        `;
        this.programs.default = this._createProgram(this._getVertexSource(), fragmentSource);
    }

    _createSketchProgram() {
        const fragmentSource = `
            precision mediump float;
            varying vec2 v_texCoord;
            uniform sampler2D u_image;
            uniform float u_intensity;
            uniform float u_threshold;
            uniform bool u_invert;
            
            void main() {
                vec2 texelSize = 1.0 / vec2(textureSize(u_image, 0));
                
                float gx = 0.0;
                float gy = 0.0;
                
                for (int dy = -1; dy <= 1; dy++) {
                    for (int dx = -1; dx <= 1; dx++) {
                        vec2 offset = vec2(float(dx), float(dy)) * texelSize;
                        vec4 color = texture2D(u_image, v_texCoord + offset);
                        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                        
                        float sx = float(dx);
                        float sy = float(dy);
                        
                        if (dx == -1 && dy == -1) { sx = -1.0; sy = -1.0; }
                        if (dx == 0 && dy == -1) { sx = -2.0; sy = 0.0; }
                        if (dx == 1 && dy == -1) { sx = -1.0; sy = 1.0; }
                        if (dx == -1 && dy == 0) { sx = 0.0; sy = -2.0; }
                        if (dx == 0 && dy == 0) { sx = 0.0; sy = 0.0; }
                        if (dx == 1 && dy == 0) { sx = 0.0; sy = 2.0; }
                        if (dx == -1 && dy == 1) { sx = 1.0; sy = -1.0; }
                        if (dx == 0 && dy == 1) { sx = 2.0; sy = 0.0; }
                        if (dx == 1 && dy == 1) { sx = 1.0; sy = 1.0; }
                        
                        gx += gray * sx;
                        gy += gray * sy;
                    }
                }
                
                float magnitude = sqrt(gx * gx + gy * gy) * u_intensity;
                float edge = step(u_threshold, magnitude);
                
                vec3 color = u_invert ? vec3(1.0 - edge) : vec3(edge);
                gl_FragColor = vec4(color, 1.0);
            }
        `;
        this.programs.sketch = this._createProgram(this._getVertexSource(), fragmentSource);
    }

    _createOilProgram() {
        const fragmentSource = `
            precision mediump float;
            varying vec2 v_texCoord;
            uniform sampler2D u_image;
            uniform float u_radius;
            uniform float u_levels;
            
            void main() {
                vec2 texelSize = 1.0 / vec2(textureSize(u_image, 0));
                int radius = int(u_radius);
                
                vec3 sumColor = vec3(0.0);
                float sumWeight = 0.0;
                
                for (int dy = -10; dy <= 10; dy++) {
                    for (int dx = -10; dx <= 10; dx++) {
                        if (abs(dx) <= radius && abs(dy) <= radius) {
                            vec2 offset = vec2(float(dx), float(dy)) * texelSize;
                            vec3 color = texture2D(u_image, v_texCoord + offset).rgb;
                            float intensity = dot(color, vec3(0.299, 0.587, 0.114));
                            float bin = floor(intensity * u_levels) / u_levels;
                            float weight = 1.0 - abs(bin - intensity);
                            
                            sumColor += color * weight;
                            sumWeight += weight;
                        }
                    }
                }
                
                vec3 oilColor = sumColor / max(sumWeight, 1.0);
                gl_FragColor = vec4(oilColor, 1.0);
            }
        `;
        this.programs.oil = this._createProgram(this._getVertexSource(), fragmentSource);
    }

    _createPixelateProgram() {
        const fragmentSource = `
            precision mediump float;
            varying vec2 v_texCoord;
            uniform sampler2D u_image;
            uniform float u_blockSize;
            
            void main() {
                vec2 resolution = vec2(textureSize(u_image, 0));
                vec2 block = u_blockSize / resolution;
                vec2 pixelatedCoord = floor(v_texCoord / block) * block;
                gl_FragColor = texture2D(u_image, pixelatedCoord);
            }
        `;
        this.programs.pixelate = this._createProgram(this._getVertexSource(), fragmentSource);
    }

    _createGrayscaleProgram() {
        const fragmentSource = `
            precision mediump float;
            varying vec2 v_texCoord;
            uniform sampler2D u_image;
            
            void main() {
                vec4 color = texture2D(u_image, v_texCoord);
                float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                gl_FragColor = vec4(vec3(gray), color.a);
            }
        `;
        this.programs.grayscale = this._createProgram(this._getVertexSource(), fragmentSource);
    }

    _createSepiaProgram() {
        const fragmentSource = `
            precision mediump float;
            varying vec2 v_texCoord;
            uniform sampler2D u_image;
            
            void main() {
                vec4 color = texture2D(u_image, v_texCoord);
                float r = color.r * 0.393 + color.g * 0.769 + color.b * 0.189;
                float g = color.r * 0.349 + color.g * 0.686 + color.b * 0.168;
                float b = color.r * 0.272 + color.g * 0.534 + color.b * 0.131;
                gl_FragColor = vec4(min(vec3(r, g, b), 1.0), color.a);
            }
        `;
        this.programs.sepia = this._createProgram(this._getVertexSource(), fragmentSource);
    }

    _createBlurProgram() {
        const fragmentSource = `
            precision mediump float;
            varying vec2 v_texCoord;
            uniform sampler2D u_image;
            uniform float u_radius;
            
            void main() {
                vec2 texelSize = 1.0 / vec2(textureSize(u_image, 0));
                int radius = int(u_radius);
                
                vec4 sum = vec4(0.0);
                float totalWeight = 0.0;
                
                for (int dy = -10; dy <= 10; dy++) {
                    for (int dx = -10; dx <= 10; dx++) {
                        if (abs(dx) <= radius && abs(dy) <= radius) {
                            float dist = sqrt(float(dx * dx + dy * dy));
                            float weight = exp(-dist / (u_radius * 0.5));
                            
                            vec2 offset = vec2(float(dx), float(dy)) * texelSize;
                            sum += texture2D(u_image, v_texCoord + offset) * weight;
                            totalWeight += weight;
                        }
                    }
                }
                
                gl_FragColor = sum / totalWeight;
            }
        `;
        this.programs.blur = this._createProgram(this._getVertexSource(), fragmentSource);
    }

    _createSharpenProgram() {
        const fragmentSource = `
            precision mediump float;
            varying vec2 v_texCoord;
            uniform sampler2D u_image;
            uniform float u_amount;
            
            void main() {
                vec2 texelSize = 1.0 / vec2(textureSize(u_image, 0));
                
                mat3 kernel = mat3(
                     0.0, -1.0,  0.0,
                    -1.0,  5.0, -1.0,
                     0.0, -1.0,  0.0
                );
                
                vec3 sum = vec3(0.0);
                
                for (int dy = -1; dy <= 1; dy++) {
                    for (int dx = -1; dx <= 1; dx++) {
                        vec2 offset = vec2(float(dx), float(dy)) * texelSize;
                        vec3 color = texture2D(u_image, v_texCoord + offset).rgb;
                        sum += color * kernel[dy + 1][dx + 1];
                    }
                }
                
                vec3 original = texture2D(u_image, v_texCoord).rgb;
                vec3 sharpened = mix(original, sum, u_amount);
                gl_FragColor = vec4(clamp(sharpened, 0.0, 1.0), 1.0);
            }
        `;
        this.programs.sharpen = this._createProgram(this._getVertexSource(), fragmentSource);
    }

    _createEdgeProgram() {
        const fragmentSource = `
            precision mediump float;
            varying vec2 v_texCoord;
            uniform sampler2D u_image;
            uniform float u_threshold;
            
            void main() {
                vec2 texelSize = 1.0 / vec2(textureSize(u_image, 0));
                
                float gx = 0.0;
                float gy = 0.0;
                
                for (int dy = -1; dy <= 1; dy++) {
                    for (int dx = -1; dx <= 1; dx++) {
                        vec2 offset = vec2(float(dx), float(dy)) * texelSize;
                        vec4 color = texture2D(u_image, v_texCoord + offset);
                        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                        
                        float sx = float(dx);
                        float sy = float(dy);
                        
                        if (dx == -1 && dy == -1) { sx = -1.0; sy = -1.0; }
                        if (dx == 0 && dy == -1) { sx = -2.0; sy = 0.0; }
                        if (dx == 1 && dy == -1) { sx = -1.0; sy = 1.0; }
                        if (dx == -1 && dy == 0) { sx = 0.0; sy = -2.0; }
                        if (dx == 1 && dy == 0) { sx = 0.0; sy = 2.0; }
                        if (dx == -1 && dy == 1) { sx = 1.0; sy = -1.0; }
                        if (dx == 0 && dy == 1) { sx = 2.0; sy = 0.0; }
                        if (dx == 1 && dy == 1) { sx = 1.0; sy = 1.0; }
                        
                        gx += gray * sx;
                        gy += gray * sy;
                    }
                }
                
                float magnitude = sqrt(gx * gx + gy * gy);
                float edge = step(u_threshold / 255.0, magnitude);
                gl_FragColor = vec4(vec3(edge), 1.0);
            }
        `;
        this.programs.edge = this._createProgram(this._getVertexSource(), fragmentSource);
    }

    _createVintageProgram() {
        const fragmentSource = `
            precision mediump float;
            varying vec2 v_texCoord;
            uniform sampler2D u_image;
            
            void main() {
                vec4 color = texture2D(u_image, v_texCoord);
                
                vec3 vintage = color.rgb;
                vintage.r = vintage.r * 0.9 + 0.15;
                vintage.g = vintage.g * 0.7 + 0.08;
                vintage.b = vintage.b * 0.5;
                
                vec2 center = vec2(0.5, 0.5);
                float dist = distance(v_texCoord, center);
                float vignette = 1.0 - smoothstep(0.5, 0.8, dist);
                
                vintage *= vignette;
                
                gl_FragColor = vec4(clamp(vintage, 0.0, 1.0), color.a);
            }
        `;
        this.programs.vintage = this._createProgram(this._getVertexSource(), fragmentSource);
    }

    _createCartoonProgram() {
        const fragmentSource = `
            precision mediump float;
            varying vec2 v_texCoord;
            uniform sampler2D u_image;
            uniform float u_threshold;
            uniform float u_levels;
            
            void main() {
                vec4 color = texture2D(u_image, v_texCoord);
                
                vec3 quantized = floor(color.rgb * u_levels) / u_levels;
                
                vec2 texelSize = 1.0 / vec2(textureSize(u_image, 0));
                float gx = 0.0;
                float gy = 0.0;
                
                for (int dy = -1; dy <= 1; dy++) {
                    for (int dx = -1; dx <= 1; dx++) {
                        vec2 offset = vec2(float(dx), float(dy)) * texelSize;
                        vec4 sampleColor = texture2D(u_image, v_texCoord + offset);
                        float gray = dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));
                        
                        float sx = float(dx);
                        float sy = float(dy);
                        
                        if (dx == -1 && dy == -1) { sx = -1.0; sy = -1.0; }
                        if (dx == 0 && dy == -1) { sx = -2.0; sy = 0.0; }
                        if (dx == 1 && dy == -1) { sx = -1.0; sy = 1.0; }
                        if (dx == -1 && dy == 0) { sx = 0.0; sy = -2.0; }
                        if (dx == 1 && dy == 0) { sx = 0.0; sy = 2.0; }
                        if (dx == -1 && dy == 1) { sx = 1.0; sy = -1.0; }
                        if (dx == 0 && dy == 1) { sx = 2.0; sy = 0.0; }
                        if (dx == 1 && dy == 1) { sx = 1.0; sy = 1.0; }
                        
                        gx += gray * sx;
                        gy += gray * sy;
                    }
                }
                
                float magnitude = sqrt(gx * gx + gy * gy);
                float edge = step(u_threshold / 255.0, magnitude);
                
                vec3 cartoonColor = mix(quantized, quantized * 0.5, edge);
                gl_FragColor = vec4(cartoonColor, color.a);
            }
        `;
        this.programs.cartoon = this._createProgram(this._getVertexSource(), fragmentSource);
    }

    _createStyleTransferProgram() {
        const fragmentSource = `
            precision mediump float;
            varying vec2 v_texCoord;
            uniform sampler2D u_image;
            uniform sampler2D u_style;
            uniform float u_blend;
            
            void main() {
                vec4 original = texture2D(u_image, v_texCoord);
                vec4 style = texture2D(u_style, v_texCoord);
                gl_FragColor = mix(original, style, u_blend);
            }
        `;
        this.programs.styleTransfer = this._createProgram(this._getVertexSource(), fragmentSource);
    }

    setFilter(filterType, params = {}) {
        this.currentProgram = this.programs[filterType] || this.programs.default;
        this.currentFilter = filterType;
        this.currentParams = params;
    }

    loadImage(imageElement) {
        const gl = this.gl;
        
        if (this.texture) {
            gl.deleteTexture(this.texture);
        }
        
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageElement);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        
        this.canvas.width = imageElement.width;
        this.canvas.height = imageElement.height;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    }

    loadImageData(imageData) {
        const gl = this.gl;
        
        if (this.texture) {
            gl.deleteTexture(this.texture);
        }
        
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, imageData.width, imageData.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageData.data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        
        this.canvas.width = imageData.width;
        this.canvas.height = imageData.height;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    }

    render() {
        const gl = this.gl;
        const program = this.currentProgram || this.programs.default;
        
        gl.useProgram(program);
        
        const positionLocation = gl.getAttribLocation(program, 'a_position');
        const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
        
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 16, 8);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
        
        this._setUniforms(program, this.currentParams);
        
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    _setUniforms(program, params) {
        const gl = this.gl;
        
        switch (this.currentFilter) {
            case 'sketch':
                gl.uniform1f(gl.getUniformLocation(program, 'u_intensity'), params.intensity || 1.0);
                gl.uniform1f(gl.getUniformLocation(program, 'u_threshold'), (params.edgeThreshold || 30) / 255);
                gl.uniform1i(gl.getUniformLocation(program, 'u_invert'), params.invert !== false ? 1 : 0);
                break;
            case 'oil':
                gl.uniform1f(gl.getUniformLocation(program, 'u_radius'), params.radius || 4.0);
                gl.uniform1f(gl.getUniformLocation(program, 'u_levels'), params.levels || 20.0);
                break;
            case 'pixelate':
                gl.uniform1f(gl.getUniformLocation(program, 'u_blockSize'), params.blockSize || 8.0);
                break;
            case 'blur':
                gl.uniform1f(gl.getUniformLocation(program, 'u_radius'), params.radius || 3.0);
                break;
            case 'sharpen':
                gl.uniform1f(gl.getUniformLocation(program, 'u_amount'), params.amount || 1.0);
                break;
            case 'edge':
                gl.uniform1f(gl.getUniformLocation(program, 'u_threshold'), params.threshold || 50.0);
                break;
            case 'cartoon':
                gl.uniform1f(gl.getUniformLocation(program, 'u_threshold'), params.threshold || 15.0);
                gl.uniform1f(gl.getUniformLocation(program, 'u_levels'), params.levels || 8.0);
                break;
        }
    }

    getImageData() {
        const gl = this.gl;
        return gl.readPixels(0, 0, gl.canvas.width, gl.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE);
    }

    toDataURL(type = 'image/png', quality = 0.9) {
        return this.canvas.toDataURL(type, quality);
    }

    toBlob(callback, type = 'image/png', quality = 0.9) {
        this.canvas.toBlob(callback, type, quality);
    }

    destroy() {
        const gl = this.gl;
        
        if (this.texture) {
            gl.deleteTexture(this.texture);
        }
        
        if (this.quadBuffer) {
            gl.deleteBuffer(this.quadBuffer);
        }
        
        Object.values(this.programs).forEach(program => {
            if (program) {
                gl.deleteProgram(program);
            }
        });
        
        this.programs = {};
        this.texture = null;
        this.quadBuffer = null;
    }
}
