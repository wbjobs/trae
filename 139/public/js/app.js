const DEFAULT_MATERIAL_PARAMS = {
    baseColor: [0.8, 0.8, 0.8],
    metallic: 0.0,
    roughness: 0.5,
    normalScale: 1.0
};

const ENV_PRESETS = {
    studio: {
        color: [0.15, 0.15, 0.2, 1.0],
        intensity: 30000,
        sunColor: [1.0, 0.98, 0.95],
        iblIntensity: 30000,
        skyColor: [0.7, 0.7, 0.75],
        groundColor: [0.2, 0.2, 0.22],
        equatorColor: [0.45, 0.45, 0.48]
    },
    outdoor: {
        color: [0.4, 0.6, 0.8, 1.0],
        intensity: 100000,
        sunColor: [1.0, 1.0, 0.95],
        iblIntensity: 50000,
        skyColor: [0.5, 0.7, 0.95],
        groundColor: [0.3, 0.35, 0.25],
        equatorColor: [0.6, 0.7, 0.8]
    },
    sunset: {
        color: [0.8, 0.4, 0.2, 1.0],
        intensity: 50000,
        sunColor: [1.0, 0.6, 0.2],
        iblIntensity: 40000,
        skyColor: [0.9, 0.5, 0.2],
        groundColor: [0.2, 0.1, 0.08],
        equatorColor: [0.8, 0.45, 0.25]
    }
};

function createMinimalGLB() {
    const json = {
        asset: { version: "2.0", generator: "PBR Previewer" },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        meshes: [{
            primitives: [{
                attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
                indices: 3,
                material: 0
            }]
        }],
        materials: [{
            name: "Default",
            pbrMetallicRoughness: {
                baseColorFactor: [0.8, 0.8, 0.8, 1.0],
                metallicFactor: 0.0,
                roughnessFactor: 0.5
            }
        }],
        buffers: [{ byteLength: 192 }],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
            { buffer: 0, byteOffset: 36, byteLength: 36, target: 34962 },
            { buffer: 0, byteOffset: 72, byteLength: 24, target: 34962 },
            { buffer: 0, byteOffset: 96, byteLength: 6, target: 34963 }
        ],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-1, -1, 0], max: [1, 1, 0] },
            { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
            { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" },
            { bufferView: 3, componentType: 5123, count: 3, type: "SCALAR" }
        ]
    };

    const jsonStr = JSON.stringify(json);
    const jsonBytes = new TextEncoder().encode(jsonStr);
    const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
    const jsonChunkLength = jsonBytes.length + jsonPadding;

    const binaryData = new Uint8Array(192);
    const positions = new Float32Array(binaryData.buffer, 0, 9);
    positions.set([-1, -1, 0, 1, -1, 0, 0, 1, 0]);
    const normals = new Float32Array(binaryData.buffer, 36, 9);
    normals.set([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const uvs = new Float32Array(binaryData.buffer, 72, 6);
    uvs.set([0, 0, 1, 0, 0.5, 1]);
    const indices = new Uint16Array(binaryData.buffer, 96, 3);
    indices.set([0, 1, 2]);
    const binPadding = (4 - (binaryData.length % 4)) % 4;
    const binChunkLength = binaryData.length + binPadding;

    const totalLength = 12 + 8 + jsonChunkLength + 8 + binChunkLength;
    const glb = new ArrayBuffer(totalLength);
    const view = new DataView(glb);
    const bytes = new Uint8Array(glb);

    view.setUint32(0, 0x46546C67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, totalLength, true);

    view.setUint32(12, jsonChunkLength, true);
    view.setUint32(16, 0x4E4F534A, true);
    bytes.set(jsonBytes, 20);
    for (let i = 0; i < jsonPadding; i++) {
        bytes[20 + jsonBytes.length + i] = 0x20;
    }

    const binOffset = 20 + jsonChunkLength;
    view.setUint32(binOffset, binChunkLength, true);
    view.setUint32(binOffset + 4, 0x004E4942, true);
    bytes.set(binaryData, binOffset + 8);

    return new Uint8Array(glb);
}

class PBRPreviewer {
    constructor() {
        this.canvas = document.getElementById('filament-canvas');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.loadingText = document.getElementById('loading-text');
        this.engine = null;
        this.scene = null;
        this.view = null;
        this.renderer = null;
        this.swapChain = null;
        this.camera = null;
        this.cameraEntity = null;
        this.assetLoader = null;
        this.currentAsset = null;
        this.materialInstance = null;
        this.ibl = null;
        this.reflectionsTex = null;
        this.skybox = null;
        this.sunLight = null;
        this.autoRotate = true;
        this.isRotating = true;
        this.rotationAngle = 0;
        this.normalTexture = null;
        this.baseColorTexture = null;
        this.metallicRoughnessTexture = null;
        this.nodeEditor = null;
        this.currentPrimitive = 'sphere';
        this.currentEnv = 'studio';
        this.materialParams = { ...DEFAULT_MATERIAL_PARAMS };
        this._theta = 0;
        this._phi = Math.PI / 2;
        this._distance = 4;
        this._currentRenderable = null;
    }

    async init() {
        try {
            this.loadingText.textContent = 'Initializing Filament Engine...';
            await new Promise(resolve => Filament.init([], resolve));

            this.loadingText.textContent = 'Creating engine...';
            this.engine = Filament.Engine.create(this.canvas);
            this.scene = this.engine.createScene();
            this.renderer = this.engine.createRenderer();
            this.view = this.engine.createView();
            this.swapChain = this.engine.createSwapChain();

            this.renderer.setClearOptions({
                clearColor: [0.1, 0.12, 0.15, 1.0],
                clear: true,
                discard: true
            });
            this.view.setScene(this.scene);

            this.loadingText.textContent = 'Setting up camera...';
            this.setupCamera();

            this.loadingText.textContent = 'Creating lighting...';
            this.setupLighting();

            this.loadingText.textContent = 'Setting up environment...';
            this.loadEnvironment(this.currentEnv);

            this.loadingText.textContent = 'Creating model...';
            this.assetLoader = this.engine.createAssetLoader();
            console.log('AssetLoader created');
            this.loadPrimitive(this.currentPrimitive);

            this.hideLoading();
            this.setupEventListeners();
            this.nodeEditor = new NodeEditor(this);
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    if (this.nodeEditor && this.nodeEditor.selectedNode) {
                        const tag = e.target.tagName;
                        if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
                            this.nodeEditor.removeNode(this.nodeEditor.selectedNode);
                        }
                    }
                }
            });
            this.renderLoop();
        } catch (error) {
            console.error('Initialization error:', error);
            console.error('Error type:', typeof error);
            if (error) {
                console.error('Error constructor:', error.constructor?.name);
                console.error('Error keys:', Object.keys(error));
                console.error('Error stack:', error.stack);
            }
            const errorMessage = error?.message || error?.toString?.() || 'Unknown error';
            this.loadingText.textContent = 'Error: ' + errorMessage;
        }
    }

    setupCamera() {
        this.cameraEntity = Filament.EntityManager.get().create();
        this.camera = this.engine.createCamera(this.cameraEntity);
        this.view.setCamera(this.camera);

        this.camera.setProjectionFov(45, this.canvas.width / this.canvas.height, 0.1, 100, Filament.Camera$Fov.VERTICAL);
        this.camera.lookAt([0, 0, 4], [0, 0, 0], [0, 1, 0]);
        this.scene.addEntity(this.cameraEntity);
    }

    setupLighting() {
        this.sunLight = Filament.EntityManager.get().create();
        Filament.LightManager.Builder(Filament.LightManager$Type.SUN)
            .direction([0.5, -1.0, 0.5])
            .castShadows(true)
            .intensity(100000)
            .color([1.0, 0.98, 0.95])
            .sunAngularRadius(1.9)
            .sunHaloSize(0.05)
            .sunHaloFalloff(80)
            .build(this.engine, this.sunLight);
        this.scene.addEntity(this.sunLight);

        const fillLight = Filament.EntityManager.get().create();
        Filament.LightManager.Builder(Filament.LightManager$Type.DIRECTIONAL)
            .direction([-0.5, 0.5, -0.5])
            .intensity(30000)
            .color([0.8, 0.85, 1.0])
            .build(this.engine, fillLight);
        this.scene.addEntity(fillLight);
    }

    loadEnvironment(envName) {
        this.currentEnv = envName;
        const preset = ENV_PRESETS[envName] || ENV_PRESETS.studio;

        if (this.skybox) {
            this.engine.destroySkybox(this.skybox);
            this.skybox = null;
        }

        this.skybox = Filament.Skybox.Builder()
            .color(preset.color)
            .showSun(true)
            .build(this.engine);
        this.scene.setSkybox(this.skybox);

        if (this.ibl) {
            this.engine.destroyIndirectLight(this.ibl);
            this.ibl = null;
        }

        if (this.reflectionsTex) {
            this.engine.destroyTexture(this.reflectionsTex);
            this.reflectionsTex = null;
        }

        this.reflectionsTex = this.createEnvironmentCubemap(128, preset);
        this.reflectionsTex.generateMipmaps(this.engine);
        this.ibl = this.createIndirectLight(this.reflectionsTex, preset);
        this.scene.setIndirectLight(this.ibl);

        const lightManager = this.engine.getLightManager();
        const sunInstance = lightManager.getInstance(this.sunLight);
        lightManager.setIntensity(sunInstance, preset.intensity);
        lightManager.setColor(sunInstance, [preset.sunColor[0], preset.sunColor[1], preset.sunColor[2]]);
    }

    createEnvironmentCubemap(size, preset) {
        const faceSize = size * size * 4;
        const totalSize = faceSize * 6;
        const pixelData = new Uint8Array(totalSize);

        for (let face = 0; face < 6; face++) {
            const faceOffset = face * faceSize;

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const u = (x / (size - 1)) * 2 - 1;
                    const v = (y / (size - 1)) * 2 - 1;

                    let dir;
                    switch (face) {
                        case 0: dir = [1, -v, -u]; break;
                        case 1: dir = [-1, -v, u]; break;
                        case 2: dir = [u, 1, v]; break;
                        case 3: dir = [u, -1, -v]; break;
                        case 4: dir = [u, -v, 1]; break;
                        case 5: dir = [-u, -v, -1]; break;
                    }

                    const len = Math.sqrt(dir[0]*dir[0] + dir[1]*dir[1] + dir[2]*dir[2]);
                    dir = [dir[0]/len, dir[1]/len, dir[2]/len];

                    let color;
                    const upDot = dir[1];

                    if (upDot > 0) {
                        const t = upDot;
                        color = [
                            preset.equatorColor[0] * (1 - t) + preset.skyColor[0] * t,
                            preset.equatorColor[1] * (1 - t) + preset.skyColor[1] * t,
                            preset.equatorColor[2] * (1 - t) + preset.skyColor[2] * t
                        ];
                    } else {
                        const t = -upDot;
                        color = [
                            preset.equatorColor[0] * (1 - t) + preset.groundColor[0] * t,
                            preset.equatorColor[1] * (1 - t) + preset.groundColor[1] * t,
                            preset.equatorColor[2] * (1 - t) + preset.groundColor[2] * t
                        ];
                    }

                    const idx = faceOffset + (y * size + x) * 4;
                    pixelData[idx] = Math.min(255, Math.max(0, Math.round(color[0] * 255)));
                    pixelData[idx + 1] = Math.min(255, Math.max(0, Math.round(color[1] * 255)));
                    pixelData[idx + 2] = Math.min(255, Math.max(0, Math.round(color[2] * 255)));
                    pixelData[idx + 3] = 255;
                }
            }
        }

        const texture = Filament.Texture.Builder()
            .width(size)
            .height(size)
            .levels(Math.log2(size) + 1)
            .sampler(Filament.Texture$Sampler.SAMPLER_CUBEMAP)
            .format(Filament.Texture$InternalFormat.RGBA8)
            .build(this.engine);

        const pbd = Filament.PixelBuffer(pixelData, Filament.PixelDataFormat.RGBA, Filament.PixelDataType.UBYTE);
        texture.setImageCube(this.engine, 0, pbd);

        return texture;
    }

    createIndirectLight(reflectionsTex, preset) {
        const shBands = 3;
        const shCoefs = new Float32Array(shBands * shBands * 3);

        const skyCol = preset.skyColor;
        const groundCol = preset.groundColor;
        const eqCol = preset.equatorColor;

        shCoefs[0] = (skyCol[0] + groundCol[0] + eqCol[0]) / 3.0;
        shCoefs[1] = (skyCol[1] + groundCol[1] + eqCol[1]) / 3.0;
        shCoefs[2] = (skyCol[2] + groundCol[2] + eqCol[2]) / 3.0;

        shCoefs[3] = (eqCol[0] - groundCol[0]) * 0.5;
        shCoefs[4] = (eqCol[1] - groundCol[1]) * 0.5;
        shCoefs[5] = (eqCol[2] - groundCol[2]) * 0.5;

        shCoefs[6] = (skyCol[0] - groundCol[0]) * 0.5;
        shCoefs[7] = (skyCol[1] - groundCol[1]) * 0.5;
        shCoefs[8] = (skyCol[2] - groundCol[2]) * 0.5;

        shCoefs[9] = (eqCol[0] - skyCol[0]) * 0.25;
        shCoefs[10] = (eqCol[1] - skyCol[1]) * 0.25;
        shCoefs[11] = (eqCol[2] - skyCol[2]) * 0.25;

        return Filament.IndirectLight.Builder()
            .reflections(reflectionsTex)
            .irradianceSh(shBands, shCoefs)
            .intensity(preset.iblIntensity)
            .build(this.engine);
    }

    loadPrimitive(name) {
        this.currentPrimitive = name;
        console.log('Loading primitive:', name);

        if (this.currentAsset) {
            const entities = this.currentAsset.getEntities();
            for (const entity of entities) {
                this.scene.removeEntity(entity);
            }
            this.assetLoader.destroyAsset(this.currentAsset);
            this.currentAsset = null;
        }

        console.log('Creating GLB...');
        const glbData = this.createPrimitiveGLB(name);
        console.log('GLB created, size:', glbData.length);

        console.log('Creating asset...');
        try {
            this.currentAsset = this.assetLoader.createAsset(glbData);
            console.log('Asset created:', this.currentAsset);
        } catch (e) {
            console.error('Error creating asset:', e);
            console.error('Error type:', typeof e);
            console.error('Error constructor:', e.constructor.name);
            console.error('Error keys:', Object.keys(e));
            throw new Error('Failed to create asset: ' + (e.message || e.toString() || 'Unknown error'));
        }

        console.log('Loading resources...');
        this.currentAsset.loadResources(() => {
            console.log('Resources loaded');
            try {
                const entities = this.currentAsset.getEntities();
                console.log('Entities:', entities.length);
                for (const entity of entities) {
                    this.scene.addEntity(entity);
                }

                const renderableEntities = this.currentAsset.getRenderableEntities();
                console.log('Renderable entities:', renderableEntities.length);
                if (renderableEntities.length > 0) {
                    this._currentRenderable = renderableEntities[0];
                    const rm = this.engine.getRenderableManager();
                    const inst = rm.getInstance(this._currentRenderable);
                    this.materialInstance = rm.getMaterialInstanceAt(inst, 0);
                    console.log('Material instance:', this.materialInstance);
                    this.updateMaterialParams();
                }
            } catch (e) {
                console.error('Error after loadResources:', e);
            }
        });
    }

    createSimpleTriangleGLB() {
        const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]);
        const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
        const uvs = new Float32Array([0, 0, 1, 0, 0.5, 1]);
        const indices = new Uint16Array([0, 1, 2]);

        const posByteLength = positions.byteLength;
        const normByteLength = normals.byteLength;
        const uvByteLength = uvs.byteLength;
        const idxByteLength = indices.byteLength;

        const posOffset = 0;
        const normOffset = posByteLength;
        const uvOffset = normOffset + normByteLength;
        const idxOffset = uvOffset + uvByteLength;
        const totalByteLength = idxOffset + idxByteLength;

        const binaryData = new Uint8Array(totalByteLength);
        binaryData.set(new Uint8Array(positions.buffer), posOffset);
        binaryData.set(new Uint8Array(normals.buffer), normOffset);
        binaryData.set(new Uint8Array(uvs.buffer), uvOffset);
        binaryData.set(new Uint8Array(indices.buffer), idxOffset);

        const json = {
            asset: { version: "2.0", generator: "PBR Previewer" },
            scene: 0,
            scenes: [{ nodes: [0] }],
            nodes: [{ mesh: 0 }],
            meshes: [{
                primitives: [{
                    attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
                    indices: 3,
                    material: 0
                }]
            }],
            materials: [{
                name: "Default",
                pbrMetallicRoughness: {
                    baseColorFactor: [0.8, 0.8, 0.8, 1.0],
                    metallicFactor: 0.0,
                    roughnessFactor: 0.5
                }
            }],
            buffers: [{ byteLength: totalByteLength }],
            bufferViews: [
                { buffer: 0, byteOffset: posOffset, byteLength: posByteLength, target: 34962 },
                { buffer: 0, byteOffset: normOffset, byteLength: normByteLength, target: 34962 },
                { buffer: 0, byteOffset: uvOffset, byteLength: uvByteLength, target: 34962 },
                { buffer: 0, byteOffset: idxOffset, byteLength: idxByteLength, target: 34963 }
            ],
            accessors: [
                { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-1, -1, 0], max: [1, 1, 0] },
                { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
                { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" },
                { bufferView: 3, componentType: 5123, count: 3, type: "SCALAR" }
            ]
        };

        const jsonStr = JSON.stringify(json);
        const jsonBytes = new TextEncoder().encode(jsonStr);
        const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
        const jsonChunkLength = jsonBytes.length + jsonPadding;

        const binPadding = (4 - (binaryData.length % 4)) % 4;
        const binChunkLength = binaryData.length + binPadding;

        const totalLength = 12 + 8 + jsonChunkLength + 8 + binChunkLength;
        const glb = new ArrayBuffer(totalLength);
        const view = new DataView(glb);
        const bytes = new Uint8Array(glb);

        view.setUint32(0, 0x46546C67, true);
        view.setUint32(4, 2, true);
        view.setUint32(8, totalLength, true);

        view.setUint32(12, jsonChunkLength, true);
        view.setUint32(16, 0x4E4F534A, true);
        bytes.set(jsonBytes, 20);
        for (let i = 0; i < jsonPadding; i++) {
            bytes[20 + jsonBytes.length + i] = 0x20;
        }

        const binOffset = 20 + jsonChunkLength;
        view.setUint32(binOffset, binChunkLength, true);
        view.setUint32(binOffset + 4, 0x004E4942, true);
        bytes.set(binaryData, binOffset + 8);
        for (let i = 0; i < binPadding; i++) {
            bytes[binOffset + 8 + binaryData.length + i] = 0;
        }

        return new Uint8Array(glb);
    }

    createPrimitiveGLB(name) {
        let positions, normals, uvs, indices;

        switch (name) {
            case 'cube':
                const cube = this.createCubeData();
                positions = cube.positions;
                normals = cube.normals;
                uvs = cube.uvs;
                indices = cube.indices;
                break;
            case 'cylinder':
                const cyl = this.createCylinderData();
                positions = cyl.positions;
                normals = cyl.normals;
                uvs = cyl.uvs;
                indices = cyl.indices;
                break;
            case 'torus':
                const torus = this.createTorusData();
                positions = torus.positions;
                normals = torus.normals;
                uvs = torus.uvs;
                indices = torus.indices;
                break;
            case 'plane':
                const plane = this.createPlaneData();
                positions = plane.positions;
                normals = plane.normals;
                uvs = plane.uvs;
                indices = plane.indices;
                break;
            case 'sphere':
            default:
                const sphere = this.createSphereData();
                positions = sphere.positions;
                normals = sphere.normals;
                uvs = sphere.uvs;
                indices = sphere.indices;
                break;
        }

        return this.buildGLB(positions, normals, uvs, indices);
    }

    createSphereData() {
        const segments = 64;
        const rings = 32;
        const positions = [];
        const normals = [];
        const uvs = [];
        const indices = [];

        for (let y = 0; y <= rings; y++) {
            const v = y / rings;
            const phi = v * Math.PI;
            for (let x = 0; x <= segments; x++) {
                const u = x / segments;
                const theta = u * 2 * Math.PI;
                const px = Math.sin(phi) * Math.cos(theta);
                const py = Math.cos(phi);
                const pz = Math.sin(phi) * Math.sin(theta);
                positions.push(px, py, pz);
                normals.push(px, py, pz);
                uvs.push(u, 1.0 - v);
            }
        }

        for (let y = 0; y < rings; y++) {
            for (let x = 0; x < segments; x++) {
                const a = y * (segments + 1) + x;
                const b = a + segments + 1;
                indices.push(a, b, a + 1);
                indices.push(b, b + 1, a + 1);
            }
        }

        return { positions, normals, uvs, indices };
    }

    createCubeData() {
        const positions = [];
        const normals = [];
        const uvs = [];
        const indices = [];

        const faces = [
            { normal: [0, 0, 1], verts: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
            { normal: [0, 0, -1], verts: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
            { normal: [1, 0, 0], verts: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
            { normal: [-1, 0, 0], verts: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
            { normal: [0, 1, 0], verts: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
            { normal: [0, -1, 0], verts: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] }
        ];

        let offset = 0;
        for (const face of faces) {
            for (let i = 0; i < 4; i++) {
                const v = face.verts[i];
                positions.push(v[0] * 0.8, v[1] * 0.8, v[2] * 0.8);
                normals.push(...face.normal);
                uvs.push(i % 2, i < 2 ? 1 : 0);
            }
            indices.push(offset, offset + 1, offset + 2);
            indices.push(offset, offset + 2, offset + 3);
            offset += 4;
        }

        return { positions, normals, uvs, indices };
    }

    createCylinderData() {
        const segments = 64;
        const radius = 0.7;
        const height = 1.8;
        const positions = [];
        const normals = [];
        const uvs = [];
        const indices = [];

        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * 2 * Math.PI;
            const x = radius * Math.cos(theta);
            const z = radius * Math.sin(theta);
            positions.push(x, height / 2, z);
            normals.push(Math.cos(theta), 0, Math.sin(theta));
            uvs.push(i / segments, 1.0);
            positions.push(x, -height / 2, z);
            normals.push(Math.cos(theta), 0, Math.sin(theta));
            uvs.push(i / segments, 0.0);
        }

        for (let i = 0; i < segments; i++) {
            const a = i * 2;
            indices.push(a, a + 1, a + 2);
            indices.push(a + 1, a + 3, a + 2);
        }

        const topIdx = positions.length / 3;
        positions.push(0, height / 2, 0);
        normals.push(0, 1, 0);
        uvs.push(0.5, 0.5);
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * 2 * Math.PI;
            positions.push(radius * Math.cos(theta), height / 2, radius * Math.sin(theta));
            normals.push(0, 1, 0);
            uvs.push(0.5 + 0.5 * Math.cos(theta), 0.5 + 0.5 * Math.sin(theta));
        }
        for (let i = 0; i < segments; i++) {
            indices.push(topIdx, topIdx + 1 + i, topIdx + 2 + i);
        }

        const botIdx = positions.length / 3;
        positions.push(0, -height / 2, 0);
        normals.push(0, -1, 0);
        uvs.push(0.5, 0.5);
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * 2 * Math.PI;
            positions.push(radius * Math.cos(theta), -height / 2, radius * Math.sin(theta));
            normals.push(0, -1, 0);
            uvs.push(0.5 + 0.5 * Math.cos(theta), 0.5 + 0.5 * Math.sin(theta));
        }
        for (let i = 0; i < segments; i++) {
            indices.push(botIdx, botIdx + 2 + i, botIdx + 1 + i);
        }

        return { positions, normals, uvs, indices };
    }

    createTorusData() {
        const majorSegments = 64;
        const minorSegments = 32;
        const majorRadius = 0.7;
        const minorRadius = 0.3;
        const positions = [];
        const normals = [];
        const uvs = [];
        const indices = [];

        for (let i = 0; i <= majorSegments; i++) {
            const u = (i / majorSegments) * 2 * Math.PI;
            const cu = Math.cos(u);
            const su = Math.sin(u);
            for (let j = 0; j <= minorSegments; j++) {
                const v = (j / minorSegments) * 2 * Math.PI;
                const cv = Math.cos(v);
                const sv = Math.sin(v);
                const x = (majorRadius + minorRadius * cv) * cu;
                const y = minorRadius * sv;
                const z = (majorRadius + minorRadius * cv) * su;
                positions.push(x, y, z);
                normals.push(cv * cu, sv, cv * su);
                uvs.push(i / majorSegments, j / minorSegments);
            }
        }

        for (let i = 0; i < majorSegments; i++) {
            for (let j = 0; j < minorSegments; j++) {
                const a = i * (minorSegments + 1) + j;
                const b = a + minorSegments + 1;
                indices.push(a, b, a + 1);
                indices.push(b, b + 1, a + 1);
            }
        }

        return { positions, normals, uvs, indices };
    }

    createPlaneData() {
        const positions = [-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1];
        const normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
        const uvs = [0, 0, 1, 0, 1, 1, 0, 1];
        const indices = [0, 2, 1, 0, 3, 2];
        return { positions, normals, uvs, indices };
    }

    buildGLB(positions, normals, uvs, indices) {
        const posArray = new Float32Array(positions);
        const normArray = new Float32Array(normals);
        const uvArray = new Float32Array(uvs);
        const idxArray = new Uint16Array(indices);

        const posByteLength = posArray.byteLength;
        const normByteLength = normArray.byteLength;
        const uvByteLength = uvArray.byteLength;
        const idxByteLength = idxArray.byteLength;

        const posOffset = 0;
        const normOffset = posByteLength;
        const uvOffset = normOffset + normByteLength;
        const idxOffset = uvOffset + uvByteLength;
        const totalByteLength = idxOffset + idxByteLength;

        const binaryData = new Uint8Array(totalByteLength);
        binaryData.set(new Uint8Array(posArray.buffer), posOffset);
        binaryData.set(new Uint8Array(normArray.buffer), normOffset);
        binaryData.set(new Uint8Array(uvArray.buffer), uvOffset);
        binaryData.set(new Uint8Array(idxArray.buffer), idxOffset);

        const posMin = this.computeMin(positions, 3);
        const posMax = this.computeMax(positions, 3);

        const json = {
            asset: { version: "2.0", generator: "PBR Previewer" },
            scene: 0,
            scenes: [{ nodes: [0] }],
            nodes: [{ mesh: 0 }],
            meshes: [{
                primitives: [{
                    attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
                    indices: 3,
                    material: 0
                }]
            }],
            materials: [{
                name: "Default",
                pbrMetallicRoughness: {
                    baseColorFactor: [0.8, 0.8, 0.8, 1.0],
                    metallicFactor: 0.0,
                    roughnessFactor: 0.5
                }
            }],
            buffers: [{ byteLength: totalByteLength }],
            bufferViews: [
                { buffer: 0, byteOffset: posOffset, byteLength: posByteLength, target: 34962 },
                { buffer: 0, byteOffset: normOffset, byteLength: normByteLength, target: 34962 },
                { buffer: 0, byteOffset: uvOffset, byteLength: uvByteLength, target: 34962 },
                { buffer: 0, byteOffset: idxOffset, byteLength: idxByteLength, target: 34963 }
            ],
            accessors: [
                { bufferView: 0, componentType: 5126, count: positions.length / 3, type: "VEC3", min: posMin, max: posMax },
                { bufferView: 1, componentType: 5126, count: normals.length / 3, type: "VEC3" },
                { bufferView: 2, componentType: 5126, count: uvs.length / 2, type: "VEC2" },
                { bufferView: 3, componentType: 5123, count: indices.length, type: "SCALAR" }
            ]
        };

        const jsonStr = JSON.stringify(json);
        const jsonBytes = new TextEncoder().encode(jsonStr);
        const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
        const jsonChunkLength = jsonBytes.length + jsonPadding;

        const binPadding = (4 - (binaryData.length % 4)) % 4;
        const binChunkLength = binaryData.length + binPadding;

        const totalLength = 12 + 8 + jsonChunkLength + 8 + binChunkLength;
        const glb = new ArrayBuffer(totalLength);
        const view = new DataView(glb);
        const bytes = new Uint8Array(glb);

        view.setUint32(0, 0x46546C67, true);
        view.setUint32(4, 2, true);
        view.setUint32(8, totalLength, true);

        view.setUint32(12, jsonChunkLength, true);
        view.setUint32(16, 0x4E4F534A, true);
        bytes.set(jsonBytes, 20);
        for (let i = 0; i < jsonPadding; i++) {
            bytes[20 + jsonBytes.length + i] = 0x20;
        }

        const binOffset = 20 + jsonChunkLength;
        view.setUint32(binOffset, binChunkLength, true);
        view.setUint32(binOffset + 4, 0x004E4942, true);
        bytes.set(binaryData, binOffset + 8);
        for (let i = 0; i < binPadding; i++) {
            bytes[binOffset + 8 + binaryData.length + i] = 0;
        }

        return new Uint8Array(glb);
    }

    computeMin(arr, stride) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        for (let i = 0; i < arr.length; i += stride) {
            minX = Math.min(minX, arr[i]);
            minY = Math.min(minY, arr[i + 1]);
            minZ = Math.min(minZ, arr[i + 2]);
        }
        return [minX, minY, minZ];
    }

    computeMax(arr, stride) {
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < arr.length; i += stride) {
            maxX = Math.max(maxX, arr[i]);
            maxY = Math.max(maxY, arr[i + 1]);
            maxZ = Math.max(maxZ, arr[i + 2]);
        }
        return [maxX, maxY, maxZ];
    }

    updateMaterialParams() {
        if (!this.materialInstance) return;

        const mi = this.materialInstance;
        try {
            mi.setFloat3('baseColorFactor', this.materialParams.baseColor[0], this.materialParams.baseColor[1], this.materialParams.baseColor[2]);
        } catch(e) {}
        try {
            mi.setFloat('metallicFactor', this.materialParams.metallic);
        } catch(e) {}
        try {
            mi.setFloat('roughnessFactor', this.materialParams.roughness);
        } catch(e) {}
    }

    async loadGLTFFromBuffer(buffer) {
        if (this.currentAsset) {
            const entities = this.currentAsset.getEntities();
            for (const entity of entities) {
                this.scene.removeEntity(entity);
            }
            this.assetLoader.destroyAsset(this.currentAsset);
            this.currentAsset = null;
        }

        this.currentAsset = this.assetLoader.createAsset(new Uint8Array(buffer));
        
        await new Promise((resolve) => {
            this.currentAsset.loadResources(() => {
                const entities = this.currentAsset.getEntities();
                for (const entity of entities) {
                    this.scene.addEntity(entity);
                }

                const renderableEntities = this.currentAsset.getRenderableEntities();
                if (renderableEntities.length > 0) {
                    this._currentRenderable = renderableEntities[0];
                    const rm = this.engine.getRenderableManager();
                    const inst = rm.getInstance(this._currentRenderable);
                    this.materialInstance = rm.getMaterialInstanceAt(inst, 0);
                    this.updateMaterialParams();
                }
                resolve();
            });
        });
    }

    setupEventListeners() {
        document.getElementById('base-color').addEventListener('input', (e) => {
            const hex = e.target.value;
            const r = parseInt(hex.substr(1, 2), 16) / 255;
            const g = parseInt(hex.substr(3, 2), 16) / 255;
            const b = parseInt(hex.substr(5, 2), 16) / 255;
            this.materialParams.baseColor = [r, g, b];
            this.updateMaterialParams();
        });

        document.getElementById('metallic').addEventListener('input', (e) => {
            this.materialParams.metallic = parseFloat(e.target.value);
            document.getElementById('metallic-value').textContent = parseFloat(e.target.value).toFixed(2);
            this.updateMaterialParams();
        });

        document.getElementById('roughness').addEventListener('input', (e) => {
            this.materialParams.roughness = parseFloat(e.target.value);
            document.getElementById('roughness-value').textContent = parseFloat(e.target.value).toFixed(2);
            this.updateMaterialParams();
        });

        document.getElementById('normal-scale').addEventListener('input', (e) => {
            this.materialParams.normalScale = parseFloat(e.target.value);
            document.getElementById('normal-scale-value').textContent = parseFloat(e.target.value).toFixed(2);
        });

        document.getElementById('model-select').addEventListener('change', (e) => {
            this.loadPrimitive(e.target.value);
        });

        document.getElementById('env-select').addEventListener('change', (e) => {
            this.loadEnvironment(e.target.value);
        });

        document.getElementById('auto-rotate').addEventListener('change', (e) => {
            this.autoRotate = e.target.checked;
        });

        document.getElementById('reset-camera').addEventListener('click', () => {
            this._theta = 0;
            this._phi = Math.PI / 2;
            this._distance = 4;
            this.updateCameraOrbit();
        });

        document.getElementById('reset-model').addEventListener('click', () => {
            this.loadPrimitive(this.currentPrimitive);
        });

        document.getElementById('gltf-upload').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const buffer = await file.arrayBuffer();
            await this.loadGLTFFromBuffer(buffer);
        });

        document.getElementById('normal-map-upload').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            this.loadTexture(file, 'normal');
        });

        document.getElementById('clear-normal-map').addEventListener('click', () => {
            this.clearTexture('normal');
        });

        document.getElementById('basecolor-map-upload').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            this.loadTexture(file, 'basecolor');
        });

        document.getElementById('clear-basecolor-map').addEventListener('click', () => {
            this.clearTexture('basecolor');
        });

        document.getElementById('mr-map-upload').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            this.loadTexture(file, 'metallicRoughness');
        });

        document.getElementById('clear-mr-map').addEventListener('click', () => {
            this.clearTexture('metallicRoughness');
        });

        document.getElementById('save-preset').addEventListener('click', () => {
            this.savePreset();
        });

        this.setupOrbitControls();
        this.loadPresets();
    }

    async loadTexture(file, type) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const imageData = ctx.getImageData(0, 0, img.width, img.height);
                    const pixelBuffer = new Uint8Array(imageData.data);

                    const texture = new Filament.Texture.Builder()
                        .width(img.width)
                        .height(img.height)
                        .levels(1)
                        .sampler(Filament.Texture$Sampler.SAMPLER_2D)
                        .format(type === 'basecolor' ? Filament.Texture$InternalFormat.SRGB8_A8 : Filament.Texture$InternalFormat.RGBA8)
                        .build(this.engine);

                    texture.setImage(this.engine, 0, pixelBuffer, img.width, img.height);

                    if (type === 'normal') {
                        if (this.normalTexture) this.normalTexture.destroy();
                        this.normalTexture = texture;
                        if (this.materialInstance) {
                            this.materialInstance.setTexture('normalTexture', texture);
                        }
                        this.showTexturePreview('normal-map-preview', e.target.result);
                    } else if (type === 'basecolor') {
                        if (this.baseColorTexture) this.baseColorTexture.destroy();
                        this.baseColorTexture = texture;
                        if (this.materialInstance) {
                            this.materialInstance.setTexture('baseColorTexture', texture);
                        }
                        this.showTexturePreview('basecolor-map-preview', e.target.result);
                    } else if (type === 'metallicRoughness') {
                        if (this.metallicRoughnessTexture) this.metallicRoughnessTexture.destroy();
                        this.metallicRoughnessTexture = texture;
                        if (this.materialInstance) {
                            this.materialInstance.setTexture('metallicRoughnessTexture', texture);
                        }
                        this.showTexturePreview('mr-map-preview', e.target.result);
                    }
                } catch (err) {
                    console.error('Texture loading error:', err);
                    alert('Failed to load texture: ' + err.message);
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    clearTexture(type) {
        if (type === 'normal') {
            if (this.normalTexture) {
                this.normalTexture.destroy();
                this.normalTexture = null;
            }
            this.hideTexturePreview('normal-map-preview');
        } else if (type === 'basecolor') {
            if (this.baseColorTexture) {
                this.baseColorTexture.destroy();
                this.baseColorTexture = null;
            }
            this.hideTexturePreview('basecolor-map-preview');
        } else if (type === 'metallicRoughness') {
            if (this.metallicRoughnessTexture) {
                this.metallicRoughnessTexture.destroy();
                this.metallicRoughnessTexture = null;
            }
            this.hideTexturePreview('mr-map-preview');
        }
    }

    showTexturePreview(elementId, dataUrl) {
        const preview = document.getElementById(elementId);
        preview.style.backgroundImage = `url(${dataUrl})`;
        preview.classList.remove('hidden');
    }

    hideTexturePreview(elementId) {
        const preview = document.getElementById(elementId);
        preview.style.backgroundImage = '';
        preview.classList.add('hidden');
    }

    setupOrbitControls() {
        let isDragging = false;
        let lastX = 0;
        let lastY = 0;

        const onMouseDown = (e) => {
            isDragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            this.isRotating = false;
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            this._theta -= dx * 0.005;
            this._phi = Math.max(0.1, Math.min(Math.PI - 0.1, this._phi - dy * 0.005));
            this.updateCameraOrbit();
        };

        const onMouseUp = () => {
            isDragging = false;
            setTimeout(() => { this.isRotating = this.autoRotate; }, 300);
        };

        const onWheel = (e) => {
            e.preventDefault();
            this._distance = Math.max(1.5, Math.min(20, this._distance + e.deltaY * 0.005));
            this.updateCameraOrbit();
        };

        this.canvas.addEventListener('mousedown', onMouseDown);
        this.canvas.addEventListener('mousemove', onMouseMove);
        this.canvas.addEventListener('mouseup', onMouseUp);
        this.canvas.addEventListener('mouseleave', onMouseUp);
        this.canvas.addEventListener('wheel', onWheel, { passive: false });

        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                isDragging = true;
                lastX = e.touches[0].clientX;
                lastY = e.touches[0].clientY;
                this.isRotating = false;
            }
        });

        this.canvas.addEventListener('touchmove', (e) => {
            if (!isDragging || e.touches.length !== 1) return;
            const dx = e.touches[0].clientX - lastX;
            const dy = e.touches[0].clientY - lastY;
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
            this._theta -= dx * 0.005;
            this._phi = Math.max(0.1, Math.min(Math.PI - 0.1, this._phi - dy * 0.005));
            this.updateCameraOrbit();
        });

        this.canvas.addEventListener('touchend', () => {
            isDragging = false;
            setTimeout(() => { this.isRotating = this.autoRotate; }, 300);
        });
    }

    updateCameraOrbit() {
        const x = this._distance * Math.sin(this._phi) * Math.sin(this._theta);
        const y = this._distance * Math.cos(this._phi);
        const z = this._distance * Math.sin(this._phi) * Math.cos(this._theta);
        this.camera.lookAt([x, y, z], [0, 0, 0], [0, 1, 0]);
    }

    showLoading() {
        this.loadingOverlay.classList.remove('hidden');
    }

    hideLoading() {
        this.loadingOverlay.classList.add('hidden');
    }

    async savePreset() {
        const nameInput = document.getElementById('preset-name');
        const name = nameInput.value.trim();
        if (!name) {
            alert('Please enter a preset name');
            return;
        }

        const preset = {
            name,
            params: { ...this.materialParams },
            model: this.currentPrimitive,
            env: this.currentEnv
        };

        try {
            const response = await fetch('/api/presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(preset)
            });
            await response.json();
            nameInput.value = '';
            this.loadPresets();
        } catch (e) {
            console.error('Save preset error:', e);
            alert('Failed to save preset');
        }
    }

    async loadPresets() {
        try {
            const response = await fetch('/api/presets');
            const presets = await response.json();
            this.renderPresets(presets);
        } catch (e) {
            console.error('Load presets error:', e);
            this.renderPresets([]);
        }
    }

    renderPresets(presets) {
        const list = document.getElementById('preset-list');

        if (presets.length === 0) {
            list.innerHTML = '<div class="preset-empty">No presets saved</div>';
            return;
        }

        list.innerHTML = presets.map(p => `
            <div class="preset-item" data-id="${p.id}">
                <span class="preset-name">${p.name}</span>
                <div class="preset-actions">
                    <button class="apply-btn" data-id="${p.id}">Apply</button>
                    <button class="delete-btn" data-id="${p.id}">Delete</button>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.apply-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.applyPreset(presets.find(p => p.id === btn.dataset.id));
            });
        });

        list.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deletePreset(btn.dataset.id);
            });
        });
    }

    async applyPreset(preset) {
        if (!preset) return;

        Object.assign(this.materialParams, preset.params);
        this.updateMaterialParams();

        document.getElementById('base-color').value = this.rgbToHex(
            this.materialParams.baseColor[0],
            this.materialParams.baseColor[1],
            this.materialParams.baseColor[2]
        );
        document.getElementById('metallic').value = this.materialParams.metallic;
        document.getElementById('metallic-value').textContent = this.materialParams.metallic.toFixed(2);
        document.getElementById('roughness').value = this.materialParams.roughness;
        document.getElementById('roughness-value').textContent = this.materialParams.roughness.toFixed(2);
        document.getElementById('normal-scale').value = this.materialParams.normalScale;
        document.getElementById('normal-scale-value').textContent = this.materialParams.normalScale.toFixed(2);

        if (preset.model && preset.model !== this.currentPrimitive) {
            document.getElementById('model-select').value = preset.model;
            this.loadPrimitive(preset.model);
        }

        if (preset.env && preset.env !== this.currentEnv) {
            document.getElementById('env-select').value = preset.env;
            this.loadEnvironment(preset.env);
        }
    }

    async deletePreset(id) {
        if (!confirm('Delete this preset?')) return;

        try {
            await fetch(`/api/presets/${id}`, { method: 'DELETE' });
            this.loadPresets();
        } catch (e) {
            console.error('Delete preset error:', e);
            alert('Failed to delete preset');
        }
    }

    rgbToHex(r, g, b) {
        const toHex = (n) => Math.round(n * 255).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    renderLoop() {
        const render = () => {
            if (this.autoRotate && this.isRotating && this._currentRenderable) {
                this.rotationAngle += 0.005;
                try {
                    const tm = this.engine.getTransformManager();
                    const inst = tm.getInstance(this._currentRenderable);
                    if (inst) {
                        const mat = new Float32Array([
                            Math.cos(this.rotationAngle), 0, -Math.sin(this.rotationAngle), 0,
                            0, 1, 0, 0,
                            Math.sin(this.rotationAngle), 0, Math.cos(this.rotationAngle), 0,
                            0, 0, 0, 1
                        ]);
                        tm.setTransform(inst, mat);
                    }
                } catch (e) {
                }
            }

            try {
                this.renderer.render(this.swapChain, this.view);
            } catch (e) {
                console.error('Render error:', e);
            }
            requestAnimationFrame(render);
        };
        render();
    }
}

const NODE_TYPES = {
    noise: {
        name: 'Noise',
        icon: '~',
        inputs: [],
        outputs: [{ id: 'out', label: 'Value' }],
        params: [
            { id: 'scale', label: 'Scale', type: 'range', min: 1, max: 16, default: 4 },
            { id: 'octaves', label: 'Octaves', type: 'range', min: 1, max: 8, default: 3 },
            { id: 'seed', label: 'Seed', type: 'number', default: 1 }
        ]
    },
    voronoi: {
        name: 'Voronoi',
        icon: 'V',
        inputs: [],
        outputs: [{ id: 'out', label: 'Value' }],
        params: [
            { id: 'scale', label: 'Scale', type: 'range', min: 1, max: 20, default: 5 },
            { id: 'seed', label: 'Seed', type: 'number', default: 1 }
        ]
    },
    gradient: {
        name: 'Gradient',
        icon: 'G',
        inputs: [],
        outputs: [{ id: 'out', label: 'Value' }],
        params: [
            { id: 'direction', label: 'Direction', type: 'select', options: ['Horizontal', 'Vertical', 'Radial'], default: 'Horizontal' },
            { id: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 4, default: 1 }
        ]
    },
    add: {
        name: 'Add',
        icon: '+',
        inputs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
        outputs: [{ id: 'out', label: 'Result' }],
        params: []
    },
    multiply: {
        name: 'Multiply',
        icon: 'x',
        inputs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
        outputs: [{ id: 'out', label: 'Result' }],
        params: []
    },
    mix: {
        name: 'Mix',
        icon: 'M',
        inputs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'mask', label: 'Mask' }],
        outputs: [{ id: 'out', label: 'Result' }],
        params: []
    },
    remap: {
        name: 'Remap',
        icon: 'R',
        inputs: [{ id: 'input', label: 'Input' }],
        outputs: [{ id: 'out', label: 'Output' }],
        params: [
            { id: 'inMin', label: 'In Min', type: 'number', default: 0 },
            { id: 'inMax', label: 'In Max', type: 'number', default: 1 },
            { id: 'outMin', label: 'Out Min', type: 'number', default: 0 },
            { id: 'outMax', label: 'Out Max', type: 'number', default: 1 }
        ]
    },
    clamp: {
        name: 'Clamp',
        icon: 'C',
        inputs: [{ id: 'input', label: 'Input' }],
        outputs: [{ id: 'out', label: 'Output' }],
        params: [
            { id: 'min', label: 'Min', type: 'number', default: 0 },
            { id: 'max', label: 'Max', type: 'number', default: 1 }
        ]
    },
    texture: {
        name: 'Texture',
        icon: 'T',
        inputs: [],
        outputs: [{ id: 'out', label: 'Value' }],
        params: [
            { id: 'image', label: 'Image', type: 'file', default: null }
        ]
    },
    color: {
        name: 'Color',
        icon: '#',
        inputs: [],
        outputs: [{ id: 'out', label: 'Value' }],
        params: [
            { id: 'color', label: 'Color', type: 'color', default: '#cccccc' }
        ]
    },
    output: {
        name: 'Output',
        icon: 'O',
        inputs: [
            { id: 'baseColor', label: 'Base Color' },
            { id: 'metallic', label: 'Metallic' },
            { id: 'roughness', label: 'Roughness' },
            { id: 'normal', label: 'Normal' }
        ],
        outputs: [],
        params: []
    }
};

const EVAL_SIZE = 128;

class NodeEditor {
    constructor(pbrPreviewer) {
        this.pbrPreviewer = pbrPreviewer;
        this.nodes = new Map();
        this.connections = [];
        this.selectedNode = null;
        this.draggingNode = null;
        this.dragOffset = { x: 0, y: 0 };
        this.connectingFrom = null;
        this.tempWire = null;
        this.nodeIdCounter = 0;
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.width = EVAL_SIZE;
        this.offscreenCanvas.height = EVAL_SIZE;
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');

        this.panel = document.getElementById('node-editor-panel');
        this.canvas = document.getElementById('node-canvas');
        this.svg = document.getElementById('node-wires');
        this.body = this.panel.querySelector('.node-editor-body');
        this.ctx = this.canvas.getContext('2d');

        this.setupEventListeners();
        this.resizeCanvas();
    }

    setupEventListeners() {
        document.getElementById('toggle-node-editor').addEventListener('click', () => {
            this.panel.classList.toggle('hidden');
            if (!this.panel.classList.contains('hidden')) {
                this.resizeCanvas();
                this.render();
            }
        });

        document.getElementById('close-node-editor').addEventListener('click', () => {
            this.panel.classList.add('hidden');
        });

        document.querySelectorAll('.node-tool-btn[data-node]').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.node;
                const rect = this.body.getBoundingClientRect();
                this.createNode(type, rect.width / 2 - 80, rect.height / 2 - 40);
            });
        });

        document.getElementById('btn-evaluate-graph').addEventListener('click', () => {
            this.evaluateGraph();
        });

        document.getElementById('btn-clear-graph').addEventListener('click', () => {
            this.clearGraph();
        });

        window.addEventListener('resize', () => this.resizeCanvas());

        this.body.addEventListener('mousedown', (e) => {
            if (e.target === this.canvas || e.target === this.body) {
                this.selectedNode = null;
                this.render();
            }
        });

        this.body.addEventListener('mousemove', (e) => {
            if (this.draggingNode) {
                const rect = this.body.getBoundingClientRect();
                this.draggingNode.x = e.clientX - rect.left - this.dragOffset.x;
                this.draggingNode.y = e.clientY - rect.top - this.dragOffset.y;
                this.updateNodePosition(this.draggingNode);
                this.renderWires();
            }
            if (this.connectingFrom && this.tempWire) {
                const rect = this.body.getBoundingClientRect();
                this.tempWire.x2 = e.clientX - rect.left;
                this.tempWire.y2 = e.clientY - rect.top;
                this.renderWires();
            }
        });

        this.body.addEventListener('mouseup', (e) => {
            if (this.draggingNode) {
                this.draggingNode = null;
            }
            if (this.connectingFrom) {
                this.connectingFrom = null;
                this.tempWire = null;
                this.renderWires();
            }
        });
    }

    resizeCanvas() {
        const rect = this.body.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    createNode(type, x, y) {
        const config = NODE_TYPES[type];
        if (!config) return;

        const id = 'node_' + (++this.nodeIdCounter);
        const node = {
            id,
            type,
            x,
            y,
            params: {},
            element: null
        };

        for (const p of config.params) {
            node.params[p.id] = p.default;
        }

        this.nodes.set(id, node);
        this.createNodeElement(node);
        this.selectedNode = node;
        this.render();
        return node;
    }

    createNodeElement(node) {
        const config = NODE_TYPES[node.type];
        const el = document.createElement('div');
        el.className = 'graph-node selected';
        el.dataset.id = node.id;
        el.dataset.type = node.type;
        el.style.left = node.x + 'px';
        el.style.top = node.y + 'px';

        let html = `<div class="graph-node-header"><span class="node-icon">${config.icon}</span>${config.name}</div>`;
        html += '<div class="graph-node-body">';

        for (const p of config.params) {
            html += '<div class="node-param">';
            html += `<label>${p.label}</label>`;
            if (p.type === 'range') {
                html += `<input type="range" data-param="${p.id}" min="${p.min}" max="${p.max}" step="0.1" value="${node.params[p.id]}">`;
            } else if (p.type === 'number') {
                html += `<input type="number" data-param="${p.id}" value="${node.params[p.id]}" step="0.1">`;
            } else if (p.type === 'color') {
                html += `<input type="color" data-param="${p.id}" value="${node.params[p.id]}">`;
            } else if (p.type === 'file') {
                html += `<input type="file" data-param="${p.id}" accept="image/*">`;
            } else if (p.type === 'select') {
                html += `<select data-param="${p.id}">`;
                for (const opt of p.options) {
                    html += `<option value="${opt}" ${opt === node.params[p.id] ? 'selected' : ''}>${opt}</option>`;
                }
                html += '</select>';
            }
            html += '</div>';
        }

        html += '</div>';

        el.innerHTML = html;

        for (let i = 0; i < config.inputs.length; i++) {
            const port = document.createElement('div');
            port.className = 'node-port input';
            port.dataset.portId = config.inputs[i].id;
            port.dataset.portType = 'input';
            port.dataset.nodeId = node.id;
            port.style.top = (30 + i * 20) + 'px';
            el.appendChild(port);

            const label = document.createElement('div');
            label.className = 'node-port-label input';
            label.textContent = config.inputs[i].label;
            label.style.top = (30 + i * 20 - 6) + 'px';
            el.appendChild(label);
        }

        for (let i = 0; i < config.outputs.length; i++) {
            const port = document.createElement('div');
            port.className = 'node-port output';
            port.dataset.portId = config.outputs[i].id;
            port.dataset.portType = 'output';
            port.dataset.nodeId = node.id;
            port.style.top = (30 + i * 20) + 'px';
            el.appendChild(port);

            const label = document.createElement('div');
            label.className = 'node-port-label output';
            label.textContent = config.outputs[i].label;
            label.style.top = (30 + i * 20 - 6) + 'px';
            el.appendChild(label);
        }

        this.body.appendChild(el);
        node.element = el;

        el.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('node-port')) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
            this.draggingNode = node;
            this.selectedNode = node;
            const rect = el.getBoundingClientRect();
            const bodyRect = this.body.getBoundingClientRect();
            this.dragOffset.x = e.clientX - rect.left;
            this.dragOffset.y = e.clientY - rect.top;
            this.render();
            e.stopPropagation();
        });

        el.querySelectorAll('.node-port').forEach(port => {
            port.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                const portType = port.dataset.portType;
                const nodeId = port.dataset.nodeId;
                const portId = port.dataset.portId;

                if (portType === 'output') {
                    this.connectingFrom = { nodeId, portId, type: 'output' };
                    const portRect = port.getBoundingClientRect();
                    const bodyRect = this.body.getBoundingClientRect();
                    this.tempWire = {
                        x1: portRect.left - bodyRect.left + 6,
                        y1: portRect.top - bodyRect.top + 6,
                        x2: portRect.left - bodyRect.left + 6,
                        y2: portRect.top - bodyRect.top + 6
                    };
                } else if (portType === 'input') {
                    const existingConn = this.connections.find(c =>
                        c.toNode === nodeId && c.toPort === portId
                    );
                    if (existingConn) {
                        this.removeConnection(existingConn);
                    }
                }
            });

            port.addEventListener('mouseup', (e) => {
                e.stopPropagation();
                if (this.connectingFrom && port.dataset.portType === 'input') {
                    const fromNodeId = this.connectingFrom.nodeId;
                    const fromPortId = this.connectingFrom.portId;
                    const toNodeId = port.dataset.nodeId;
                    const toPortId = port.dataset.portId;

                    if (fromNodeId !== toNodeId) {
                        const existing = this.connections.find(c =>
                            c.toNode === toNodeId && c.toPort === toPortId
                        );
                        if (existing) this.removeConnection(existing);

                        this.connections.push({
                            fromNode: fromNodeId,
                            fromPort: fromPortId,
                            toNode: toNodeId,
                            toPort: toPortId
                        });
                    }
                }
                this.connectingFrom = null;
                this.tempWire = null;
                this.renderWires();
            });
        });

        el.querySelectorAll('[data-param]').forEach(input => {
            input.addEventListener('input', (e) => {
                const paramId = input.dataset.param;
                let value;
                if (input.type === 'checkbox') {
                    value = input.checked;
                } else if (input.type === 'file') {
                    value = input.files[0] || null;
                    if (value) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                            node.params[paramId + '_dataUrl'] = ev.target.result;
                        };
                        reader.readAsDataURL(value);
                    }
                } else {
                    value = input.value;
                    if (input.type === 'number' || input.type === 'range') {
                        value = parseFloat(value);
                    }
                }
                node.params[paramId] = value;
            });
        });
    }

    updateNodePosition(node) {
        if (node.element) {
            node.element.style.left = node.x + 'px';
            node.element.style.top = node.y + 'px';
        }
    }

    removeConnection(conn) {
        const idx = this.connections.indexOf(conn);
        if (idx !== -1) {
            this.connections.splice(idx, 1);
            this.renderWires();
        }
    }

    removeNode(node) {
        if (node.element) {
            node.element.remove();
        }
        this.nodes.delete(node.id);
        this.connections = this.connections.filter(c =>
            c.fromNode !== node.id && c.toNode !== node.id
        );
        if (this.selectedNode === node) {
            this.selectedNode = null;
        }
        this.renderWires();
    }

    clearGraph() {
        for (const [id, node] of this.nodes) {
            if (node.element) node.element.remove();
        }
        this.nodes.clear();
        this.connections = [];
        this.selectedNode = null;
        this.renderWires();
    }

    render() {
        for (const [id, node] of this.nodes) {
            if (node.element) {
                node.element.classList.toggle('selected', node === this.selectedNode);
            }
        }
        this.renderWires();
    }

    renderWires() {
        this.svg.innerHTML = '';

        for (const conn of this.connections) {
            const fromNode = this.nodes.get(conn.fromNode);
            const toNode = this.nodes.get(conn.toNode);
            if (!fromNode || !toNode || !fromNode.element || !toNode.element) continue;

            const fromPort = fromNode.element.querySelector(`.node-port.output[data-port-id="${conn.fromPort}"]`);
            const toPort = toNode.element.querySelector(`.node-port.input[data-port-id="${conn.toPort}"]`);
            if (!fromPort || !toPort) continue;

            const bodyRect = this.body.getBoundingClientRect();
            const fromRect = fromPort.getBoundingClientRect();
            const toRect = toPort.getBoundingClientRect();

            const x1 = fromRect.left - bodyRect.left + 6;
            const y1 = fromRect.top - bodyRect.top + 6;
            const x2 = toRect.left - bodyRect.left + 6;
            const y2 = toRect.top - bodyRect.top + 6;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const dx = Math.abs(x2 - x1) * 0.5;
            const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
            path.setAttribute('d', d);
            path.setAttribute('class', 'wire-path');
            path.addEventListener('click', () => {
                this.removeConnection(conn);
            });
            this.svg.appendChild(path);
        }

        if (this.tempWire) {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const dx = Math.abs(this.tempWire.x2 - this.tempWire.x1) * 0.5;
            const d = `M ${this.tempWire.x1} ${this.tempWire.y1} C ${this.tempWire.x1 + dx} ${this.tempWire.y1}, ${this.tempWire.x2 - dx} ${this.tempWire.y2}, ${this.tempWire.x2} ${this.tempWire.y2}`;
            path.setAttribute('d', d);
            path.setAttribute('class', 'wire-path temp');
            this.svg.appendChild(path);
        }
    }

    evaluateGraph() {
        const outputNodes = [];
        for (const [id, node] of this.nodes) {
            if (node.type === 'output') {
                outputNodes.push(node);
            }
        }

        if (outputNodes.length === 0) {
            alert('Please add at least one Output node');
            return;
        }

        const evaluated = new Map();

        for (const outputNode of outputNodes) {
            const baseColorConn = this.findConnection(outputNode.id, 'baseColor');
            const metallicConn = this.findConnection(outputNode.id, 'metallic');
            const roughnessConn = this.findConnection(outputNode.id, 'roughness');
            const normalConn = this.findConnection(outputNode.id, 'normal');

            if (baseColorConn) {
                const data = this.evaluateNode(this.nodes.get(baseColorConn.fromNode), evaluated);
                if (data) {
                    this.applyTextureToMaterial(data, 'basecolor');
                }
            }
            if (metallicConn) {
                const data = this.evaluateNode(this.nodes.get(metallicConn.fromNode), evaluated);
                if (data) {
                    this.applyTextureToMaterial(data, 'metallicRoughness');
                }
            }
            if (roughnessConn) {
                const data = this.evaluateNode(this.nodes.get(roughnessConn.fromNode), evaluated);
                if (data) {
                    this.applyTextureToMaterial(data, 'roughness');
                }
            }
            if (normalConn) {
                const data = this.evaluateNode(this.nodes.get(normalConn.fromNode), evaluated);
                if (data) {
                    this.applyTextureToMaterial(data, 'normal');
                }
            }
        }

        this.render();
    }

    findConnection(toNodeId, toPortId) {
        return this.connections.find(c => c.toNode === toNodeId && c.toPort === toPortId);
    }

    evaluateNode(node, evaluated) {
        if (!node) return null;
        if (evaluated.has(node.id)) return evaluated.get(node.id);

        const config = NODE_TYPES[node.type];
        const inputData = {};

        for (const input of config.inputs) {
            const conn = this.findConnection(node.id, input.id);
            if (conn) {
                const upstreamNode = this.nodes.get(conn.fromNode);
                inputData[input.id] = this.evaluateNode(upstreamNode, evaluated);
            }
        }

        const result = this.generateNodeTexture(node, inputData);
        evaluated.set(node.id, result);
        return result;
    }

    generateNodeTexture(node, inputData) {
        const ctx = this.offscreenCtx;
        const w = EVAL_SIZE;
        const h = EVAL_SIZE;
        ctx.clearRect(0, 0, w, h);

        const imageData = ctx.createImageData(w, h);
        const data = imageData.data;
        const p = node.params;

        switch (node.type) {
            case 'noise': {
                const scale = p.scale || 4;
                const octaves = p.octaves || 3;
                const seed = p.seed || 1;
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        let value = 0;
                        let amplitude = 1;
                        let frequency = scale / w;
                        let maxValue = 0;
                        for (let o = 0; o < octaves; o++) {
                            value += this.perlinNoise(x * frequency + seed, y * frequency + seed) * amplitude;
                            maxValue += amplitude;
                            amplitude *= 0.5;
                            frequency *= 2;
                        }
                        value = (value / maxValue + 1) * 0.5;
                        const idx = (y * w + x) * 4;
                        data[idx] = data[idx + 1] = data[idx + 2] = Math.round(value * 255);
                        data[idx + 3] = 255;
                    }
                }
                break;
            }
            case 'voronoi': {
                const scale = p.scale || 5;
                const seed = p.seed || 1;
                const cellW = w / scale;
                const cellH = h / scale;
                const featurePoints = [];
                for (let cy = 0; cy < scale + 2; cy++) {
                    for (let cx = 0; cx < scale + 2; cx++) {
                        const r = this.hash2D(cx + seed, cy + seed);
                        featurePoints.push({
                            x: (cx + r) * cellW,
                            y: (cy + this.hash2D(cx + seed + 100, cy + seed)) * cellH
                        });
                    }
                }
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        let minDist = Infinity;
                        for (const fp of featurePoints) {
                            const dx = x - fp.x;
                            const dy = y - fp.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            if (dist < minDist) minDist = dist;
                        }
                        const value = Math.min(1, minDist / (cellW * 0.5));
                        const idx = (y * w + x) * 4;
                        data[idx] = data[idx + 1] = data[idx + 2] = Math.round((1 - value) * 255);
                        data[idx + 3] = 255;
                    }
                }
                break;
            }
            case 'gradient': {
                const direction = p.direction || 'Horizontal';
                const scale = p.scale || 1;
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        let value;
                        if (direction === 'Horizontal') {
                            value = (x / w) * scale;
                        } else if (direction === 'Vertical') {
                            value = (y / h) * scale;
                        } else {
                            const dx = (x - w / 2) / (w / 2);
                            const dy = (y - h / 2) / (h / 2);
                            value = Math.sqrt(dx * dx + dy * dy) * scale;
                        }
                        value = Math.max(0, Math.min(1, value));
                        const idx = (y * w + x) * 4;
                        data[idx] = data[idx + 1] = data[idx + 2] = Math.round(value * 255);
                        data[idx + 3] = 255;
                    }
                }
                break;
            }
            case 'add': {
                const a = inputData['a'];
                const b = inputData['b'];
                if (!a || !b) return this.fillGray(0);
                for (let i = 0; i < a.length; i += 4) {
                    data[i] = Math.min(255, a[i] + b[i]);
                    data[i + 1] = Math.min(255, a[i + 1] + b[i + 1]);
                    data[i + 2] = Math.min(255, a[i + 2] + b[i + 2]);
                    data[i + 3] = 255;
                }
                break;
            }
            case 'multiply': {
                const a = inputData['a'];
                const b = inputData['b'];
                if (!a || !b) return this.fillGray(0);
                for (let i = 0; i < a.length; i += 4) {
                    data[i] = Math.round(a[i] * b[i] / 255);
                    data[i + 1] = Math.round(a[i + 1] * b[i + 1] / 255);
                    data[i + 2] = Math.round(a[i + 2] * b[i + 2] / 255);
                    data[i + 3] = 255;
                }
                break;
            }
            case 'mix': {
                const a = inputData['a'];
                const b = inputData['b'];
                const mask = inputData['mask'];
                if (!a || !b) return this.fillGray(0);
                for (let i = 0; i < a.length; i += 4) {
                    const m = mask ? mask[i] / 255 : 0.5;
                    data[i] = Math.round(a[i] * (1 - m) + b[i] * m);
                    data[i + 1] = Math.round(a[i + 1] * (1 - m) + b[i + 1] * m);
                    data[i + 2] = Math.round(a[i + 2] * (1 - m) + b[i + 2] * m);
                    data[i + 3] = 255;
                }
                break;
            }
            case 'remap': {
                const input = inputData['input'];
                if (!input) return this.fillGray(0);
                const inMin = p.inMin || 0;
                const inMax = p.inMax || 1;
                const outMin = p.outMin || 0;
                const outMax = p.outMax || 1;
                for (let i = 0; i < input.length; i += 4) {
                    const v = input[i] / 255;
                    const remapped = ((v - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
                    const clamped = Math.max(0, Math.min(1, remapped));
                    data[i] = data[i + 1] = data[i + 2] = Math.round(clamped * 255);
                    data[i + 3] = 255;
                }
                break;
            }
            case 'clamp': {
                const input = inputData['input'];
                if (!input) return this.fillGray(0);
                const min = p.min || 0;
                const max = p.max || 1;
                for (let i = 0; i < input.length; i += 4) {
                    const v = Math.max(min, Math.min(max, input[i] / 255));
                    data[i] = data[i + 1] = data[i + 2] = Math.round(v * 255);
                    data[i + 3] = 255;
                }
                break;
            }
            case 'color': {
                const hex = p.color || '#cccccc';
                const r = parseInt(hex.substr(1, 2), 16);
                const g = parseInt(hex.substr(3, 2), 16);
                const b = parseInt(hex.substr(5, 2), 16);
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = r;
                    data[i + 1] = g;
                    data[i + 2] = b;
                    data[i + 3] = 255;
                }
                break;
            }
            case 'texture': {
                if (p.image_dataUrl) {
                    return { dataUrl: p.image_dataUrl };
                }
                return this.fillGray(128);
            }
            default:
                return this.fillGray(128);
        }

        ctx.putImageData(imageData, 0, 0);
        const dataUrl = this.offscreenCanvas.toDataURL('image/png');
        return { data: imageData.data, dataUrl };
    }

    fillGray(value) {
        const ctx = this.offscreenCtx;
        ctx.clearRect(0, 0, EVAL_SIZE, EVAL_SIZE);
        ctx.fillStyle = `rgb(${value},${value},${value})`;
        ctx.fillRect(0, 0, EVAL_SIZE, EVAL_SIZE);
        const imageData = ctx.getImageData(0, 0, EVAL_SIZE, EVAL_SIZE);
        const dataUrl = this.offscreenCanvas.toDataURL('image/png');
        return { data: imageData.data, dataUrl };
    }

    perlinNoise(x, y) {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const xf = x - xi;
        const yf = y - yi;

        const u = this.fade(xf);
        const v = this.fade(yf);

        const aa = this.hash2D(xi, yi);
        const ab = this.hash2D(xi, yi + 1);
        const ba = this.hash2D(xi + 1, yi);
        const bb = this.hash2D(xi + 1, yi + 1);

        const x1 = this.lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u);
        const x2 = this.lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u);

        return this.lerp(x1, x2, v);
    }

    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(a, b, t) { return a + t * (b - a); }

    hash2D(x, y) {
        let h = x * 374761393 + y * 668265263;
        h = (h ^ (h >> 13)) * 1274126177;
        return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
    }

    grad(hash, x, y) {
        const h = Math.floor(hash * 4);
        switch (h % 4) {
            case 0: return x + y;
            case 1: return -x + y;
            case 2: return x - y;
            case 3: return -x - y;
        }
        return 0;
    }

    applyTextureToMaterial(result, type) {
        if (!result || !result.dataUrl) return;

        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, img.width, img.height);
                const pixelBuffer = new Uint8Array(imageData.data);

                const texture = new Filament.Texture.Builder()
                    .width(img.width)
                    .height(img.height)
                    .levels(1)
                    .sampler(Filament.Texture$Sampler.SAMPLER_2D)
                    .format(type === 'basecolor' ? Filament.Texture$InternalFormat.SRGB8_A8 : Filament.Texture$InternalFormat.RGBA8)
                    .build(this.pbrPreviewer.engine);

                texture.setImage(this.pbrPreviewer.engine, 0, pixelBuffer);

                const previewer = this.pbrPreviewer;
                if (type === 'basecolor') {
                    if (previewer.baseColorTexture) previewer.baseColorTexture.destroy();
                    previewer.baseColorTexture = texture;
                    if (previewer.materialInstance) {
                        previewer.materialInstance.setTexture('baseColorTexture', texture);
                    }
                } else if (type === 'normal') {
                    if (previewer.normalTexture) previewer.normalTexture.destroy();
                    previewer.normalTexture = texture;
                    if (previewer.materialInstance) {
                        previewer.materialInstance.setTexture('normalTexture', texture);
                    }
                } else if (type === 'metallicRoughness' || type === 'roughness') {
                    if (previewer.metallicRoughnessTexture) previewer.metallicRoughnessTexture.destroy();
                    previewer.metallicRoughnessTexture = texture;
                    if (previewer.materialInstance) {
                        previewer.materialInstance.setTexture('metallicRoughnessTexture', texture);
                    }
                }
            } catch (err) {
                console.error('Failed to apply node texture:', err);
            }
        };
        img.src = result.dataUrl;
    }
}

window.NodeEditor = NodeEditor;
