import { mat4, vec3 } from 'gl-matrix';

interface ParticleData {
    position: [number, number, number];
    color: [number, number, number];
    velocity: [number, number, number];
}

interface ParticleConfig {
    distribution: string;
    colorTheme: string;
    count: number;
    particles: ParticleData[];
}

const GRID_TOTAL = 20 * 20 * 20;

class ParticleSystem {
    private canvas: HTMLCanvasElement;
    private device!: GPUDevice;
    private context!: GPUCanvasContext;
    private format!: GPUTextureFormat;
    private depthTexture!: GPUTexture;

    private particleBuffer!: GPUBuffer;
    private uniformBuffer!: GPUBuffer;
    private cameraUniformBuffer!: GPUBuffer;
    
    private gridCountsBuffer!: GPUBuffer;
    private gridStartsBuffer!: GPUBuffer;
    private particleGridIndicesBuffer!: GPUBuffer;
    private sortedIndicesBuffer!: GPUBuffer;
    private gridTempCountsBuffer!: GPUBuffer;

    private gridCountPipeline!: GPUComputePipeline;
    private prefixSumPipeline!: GPUComputePipeline;
    private scatterPipeline!: GPUComputePipeline;
    private interactPipeline!: GPUComputePipeline;
    private clearGridPipeline!: GPUComputePipeline;
    private renderPipeline!: GPURenderPipeline;

    private gridCountBindGroup!: GPUBindGroup;
    private prefixSumBindGroup!: GPUBindGroup;
    private scatterBindGroup!: GPUBindGroup;
    private interactBindGroup!: GPUBindGroup;
    private clearGridBindGroup!: GPUBindGroup;
    private renderBindGroup!: GPUBindGroup;

    private particleCount: number = 100000;
    private particleStride: number = 9 * 4;

    private camera = {
        distance: 15,
        rotationX: 0.5,
        rotationY: 0,
        targetRotationX: 0.5,
        targetRotationY: 0,
        targetDistance: 15,
    };

    private isDragging = false;
    private lastMouseX = 0;
    private lastMouseY = 0;

    private time = 0;
    private lastTime = performance.now();

    private rotationSpeed = 2.0;
    private noiseStrength = 3.0;
    private gravityStrength = 5.0;
    private collisionStrength = 2.0;
    private particleRadius = 0.15;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    async init() {
        const entry = navigator.gpu;
        if (!entry) {
            throw new Error('WebGPU not supported');
        }

        const adapter = await entry.requestAdapter();
        if (!adapter) {
            throw new Error('No GPU adapter found');
        }

        this.device = await adapter.requestDevice();
        this.context = this.canvas.getContext('webgpu')!;
        this.format = navigator.gpu.getPreferredCanvasFormat();

        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied',
        });

        this.setupEventListeners();
        await this.loadShaders();
        await this.fetchParticleConfig();
    }

    private setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            const deltaX = e.clientX - this.lastMouseX;
            const deltaY = e.clientY - this.lastMouseY;

            this.camera.targetRotationY += deltaX * 0.01;
            this.camera.targetRotationX += deltaY * 0.01;
            this.camera.targetRotationX = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.camera.targetRotationX));

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.camera.targetDistance += e.deltaY * 0.01;
            this.camera.targetDistance = Math.max(5, Math.min(50, this.camera.targetDistance));
        }, { passive: false });

        window.addEventListener('resize', () => {
            this.resize();
        });
    }

    private async loadShaders() {
        const [computeCode, renderCode] = await Promise.all([
            fetch('shaders/compute.wgsl').then(r => r.text()),
            fetch('shaders/render.wgsl').then(r => r.text()),
        ]);

        const computeModule = this.device.createShaderModule({ code: computeCode });
        const renderModule = this.device.createShaderModule({ code: renderCode });

        this.gridCountPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: computeModule, entryPoint: 'grid_count' },
        });

        this.prefixSumPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: computeModule, entryPoint: 'prefix_sum' },
        });

        this.scatterPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: computeModule, entryPoint: 'scatter' },
        });

        this.interactPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: computeModule, entryPoint: 'interact' },
        });

        this.clearGridPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: computeModule, entryPoint: 'clear_grid' },
        });

        this.renderPipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: renderModule,
                entryPoint: 'vs_main',
            },
            fragment: {
                module: renderModule,
                entryPoint: 'fs_main',
                targets: [{
                    format: this.format,
                    blend: {
                        color: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one',
                            operation: 'add',
                        },
                        alpha: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one',
                            operation: 'add',
                        },
                    },
                }],
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'none',
            },
            depthStencil: {
                depthWriteEnabled: false,
                depthCompare: 'less-equal',
                format: 'depth24plus',
            },
        });
    }

    private async fetchParticleConfig() {
        try {
            const response = await fetch('http://localhost:8080/api/config');
            const config: ParticleConfig = await response.json();
            this.particleCount = config.count;
            this.createBuffers(config);
        } catch (e) {
            console.warn('Failed to fetch config from backend, using fallback');
            this.createFallbackParticles();
        }
    }

    private createBuffers(config: ParticleConfig) {
        const particleData = new Float32Array(this.particleCount * 9);

        for (let i = 0; i < this.particleCount; i++) {
            const p = config.particles[i];
            const offset = i * 9;
            particleData[offset] = p.position[0];
            particleData[offset + 1] = p.position[1];
            particleData[offset + 2] = p.position[2];
            particleData[offset + 3] = p.velocity[0];
            particleData[offset + 4] = p.velocity[1];
            particleData[offset + 5] = p.velocity[2];
            particleData[offset + 6] = p.color[0];
            particleData[offset + 7] = p.color[1];
            particleData[offset + 8] = p.color[2];
        }

        this.particleBuffer = this.device.createBuffer({
            size: particleData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });

        new Float32Array(this.particleBuffer.getMappedRange()).set(particleData);
        this.particleBuffer.unmap();

        this.uniformBuffer = this.device.createBuffer({
            size: 8 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.cameraUniformBuffer = this.device.createBuffer({
            size: (16 + 4) * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.createGridBuffers();
        this.createBindGroups();
    }

    private createGridBuffers() {
        this.gridCountsBuffer = this.device.createBuffer({
            size: GRID_TOTAL * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.gridStartsBuffer = this.device.createBuffer({
            size: (GRID_TOTAL + 1) * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.particleGridIndicesBuffer = this.device.createBuffer({
            size: this.particleCount * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.sortedIndicesBuffer = this.device.createBuffer({
            size: this.particleCount * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.gridTempCountsBuffer = this.device.createBuffer({
            size: GRID_TOTAL * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
    }

    private createFallbackParticles() {
        const particleData = new Float32Array(this.particleCount * 9);

        for (let i = 0; i < this.particleCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 5 * Math.cbrt(Math.random());

            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            const hue = i / this.particleCount;
            const color = this.hsvToRgb(hue, 1, 1);

            const angle = Math.atan2(z, x);
            const speed = 0.3;

            const offset = i * 9;
            particleData[offset] = x;
            particleData[offset + 1] = y;
            particleData[offset + 2] = z;
            particleData[offset + 3] = -Math.sin(angle) * speed;
            particleData[offset + 4] = (Math.random() - 0.5) * 0.1;
            particleData[offset + 5] = Math.cos(angle) * speed;
            particleData[offset + 6] = color[0];
            particleData[offset + 7] = color[1];
            particleData[offset + 8] = color[2];
        }

        this.particleBuffer = this.device.createBuffer({
            size: particleData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });

        new Float32Array(this.particleBuffer.getMappedRange()).set(particleData);
        this.particleBuffer.unmap();

        this.uniformBuffer = this.device.createBuffer({
            size: 8 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.cameraUniformBuffer = this.device.createBuffer({
            size: (16 + 4) * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.createGridBuffers();
        this.createBindGroups();
    }

    private hsvToRgb(h: number, s: number, v: number): [number, number, number] {
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);

        switch (i % 6) {
            case 0: return [v, t, p];
            case 1: return [q, v, p];
            case 2: return [p, v, t];
            case 3: return [p, q, v];
            case 4: return [t, p, v];
            default: return [v, p, q];
        }
    }

    private createBindGroups() {
        this.gridCountBindGroup = this.device.createBindGroup({
            layout: this.gridCountPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBuffer } },
                { binding: 1, resource: { buffer: this.gridCountsBuffer } },
                { binding: 2, resource: { buffer: this.particleGridIndicesBuffer } },
            ],
        });

        this.prefixSumBindGroup = this.device.createBindGroup({
            layout: this.prefixSumPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.gridCountsBuffer } },
                { binding: 1, resource: { buffer: this.gridStartsBuffer } },
            ],
        });

        this.scatterBindGroup = this.device.createBindGroup({
            layout: this.scatterPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBuffer } },
                { binding: 1, resource: { buffer: this.particleGridIndicesBuffer } },
                { binding: 2, resource: { buffer: this.gridStartsBuffer } },
                { binding: 3, resource: { buffer: this.sortedIndicesBuffer } },
                { binding: 4, resource: { buffer: this.gridTempCountsBuffer } },
            ],
        });

        this.interactBindGroup = this.device.createBindGroup({
            layout: this.interactPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBuffer } },
                { binding: 1, resource: { buffer: this.uniformBuffer } },
                { binding: 2, resource: { buffer: this.sortedIndicesBuffer } },
                { binding: 3, resource: { buffer: this.gridStartsBuffer } },
            ],
        });

        this.clearGridBindGroup = this.device.createBindGroup({
            layout: this.clearGridPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.gridCountsBuffer } },
                { binding: 1, resource: { buffer: this.gridTempCountsBuffer } },
            ],
        });

        this.renderBindGroup = this.device.createBindGroup({
            layout: this.renderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBuffer } },
                { binding: 1, resource: { buffer: this.cameraUniformBuffer } },
            ],
        });
    }

    private updateCamera() {
        this.camera.rotationX += (this.camera.targetRotationX - this.camera.rotationX) * 0.1;
        this.camera.rotationY += (this.camera.targetRotationY - this.camera.rotationY) * 0.1;
        this.camera.distance += (this.camera.targetDistance - this.camera.distance) * 0.1;

        const cameraX = this.camera.distance * Math.sin(this.camera.rotationY) * Math.cos(this.camera.rotationX);
        const cameraY = this.camera.distance * Math.sin(this.camera.rotationX);
        const cameraZ = this.camera.distance * Math.cos(this.camera.rotationY) * Math.cos(this.camera.rotationX);

        const viewMatrix = mat4.lookAt(
            mat4.create(),
            vec3.fromValues(cameraX, cameraY, cameraZ),
            vec3.fromValues(0, 0, 0),
            vec3.fromValues(0, 1, 0)
        );

        const projMatrix = mat4.perspective(
            mat4.create(),
            Math.PI / 4,
            this.canvas.width / this.canvas.height,
            1.0,
            100
        );

        const viewProj = mat4.multiply(mat4.create(), projMatrix, viewMatrix);
        const cameraData = new Float32Array(20);
        cameraData.set(viewProj, 0);
        cameraData[16] = cameraX;
        cameraData[17] = cameraY;
        cameraData[18] = cameraZ;
        cameraData[19] = 0.02;

        this.device.queue.writeBuffer(this.cameraUniformBuffer, 0, cameraData);
    }

    private updateUniforms(deltaTime: number) {
        this.time += deltaTime;
        const uniformData = new Float32Array(8);
        uniformData[0] = deltaTime;
        uniformData[1] = this.time;
        uniformData[2] = this.rotationSpeed;
        uniformData[3] = this.noiseStrength;
        uniformData[4] = this.gravityStrength;
        uniformData[5] = this.collisionStrength;
        uniformData[6] = this.particleRadius;

        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
    }

    private render() {
        const commandEncoder = this.device.createCommandEncoder();

        const computePass = commandEncoder.beginComputePass();

        computePass.setPipeline(this.clearGridPipeline);
        computePass.setBindGroup(0, this.clearGridBindGroup);
        computePass.dispatchWorkgroups(Math.ceil(GRID_TOTAL / 256));

        computePass.setPipeline(this.gridCountPipeline);
        computePass.setBindGroup(0, this.gridCountBindGroup);
        computePass.dispatchWorkgroups(Math.ceil(this.particleCount / 256));

        computePass.setPipeline(this.prefixSumPipeline);
        computePass.setBindGroup(0, this.prefixSumBindGroup);
        computePass.dispatchWorkgroups(1);

        computePass.setPipeline(this.scatterPipeline);
        computePass.setBindGroup(0, this.scatterBindGroup);
        computePass.dispatchWorkgroups(Math.ceil(this.particleCount / 256));

        computePass.setPipeline(this.interactPipeline);
        computePass.setBindGroup(0, this.interactBindGroup);
        computePass.dispatchWorkgroups(Math.ceil(this.particleCount / 256));

        computePass.end();

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: 0.02, g: 0.02, b: 0.05, a: 1 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        });

        renderPass.setPipeline(this.renderPipeline);
        renderPass.setBindGroup(0, this.renderBindGroup);
        renderPass.draw(6, this.particleCount);
        renderPass.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }

    private animate() {
        const now = performance.now();
        const deltaTime = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;

        this.updateCamera();
        this.updateUniforms(deltaTime);
        this.render();

        requestAnimationFrame(() => this.animate());
    }

    start() {
        this.resize();
        this.animate();
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';

        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied',
        });

        if (this.depthTexture) {
            this.depthTexture.destroy();
        }
        this.depthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }

    setRotationSpeed(speed: number) {
        this.rotationSpeed = speed;
    }

    setNoiseStrength(strength: number) {
        this.noiseStrength = strength;
    }

    setGravityStrength(strength: number) {
        this.gravityStrength = strength;
    }

    setCollisionStrength(strength: number) {
        this.collisionStrength = strength;
    }

    setParticleRadius(radius: number) {
        this.particleRadius = radius;
    }

    async regenerateParticles(distribution: string, colorTheme: string, count: number) {
        try {
            const response = await fetch('http://localhost:8080/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ distribution, colorTheme, count }),
            });
            const config: ParticleConfig = await response.json();
            this.particleCount = config.count;
            this.createBuffers(config);
        } catch (e) {
            console.error('Failed to regenerate particles:', e);
        }
    }
}

async function main() {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const loading = document.getElementById('loading')!;
    const controls = document.getElementById('controls')!;

    try {
        const system = new ParticleSystem(canvas);
        await system.init();
        system.start();

        loading.style.display = 'none';
        controls.style.display = 'flex';

        const rotationSlider = document.getElementById('rotationSpeed') as HTMLInputElement;
        const noiseSlider = document.getElementById('noiseStrength') as HTMLInputElement;
        const gravitySlider = document.getElementById('gravityStrength') as HTMLInputElement;
        const collisionSlider = document.getElementById('collisionStrength') as HTMLInputElement;
        const radiusSlider = document.getElementById('particleRadius') as HTMLInputElement;
        const distributionSelect = document.getElementById('distribution') as HTMLSelectElement;
        const colorThemeSelect = document.getElementById('colorTheme') as HTMLSelectElement;
        const countInput = document.getElementById('count') as HTMLInputElement;
        const regenerateBtn = document.getElementById('regenerate') as HTMLButtonElement;

        rotationSlider.addEventListener('input', (e) => {
            system.setRotationSpeed(parseFloat((e.target as HTMLInputElement).value));
        });

        noiseSlider.addEventListener('input', (e) => {
            system.setNoiseStrength(parseFloat((e.target as HTMLInputElement).value));
        });

        gravitySlider.addEventListener('input', (e) => {
            system.setGravityStrength(parseFloat((e.target as HTMLInputElement).value));
        });

        collisionSlider.addEventListener('input', (e) => {
            system.setCollisionStrength(parseFloat((e.target as HTMLInputElement).value));
        });

        radiusSlider.addEventListener('input', (e) => {
            system.setParticleRadius(parseFloat((e.target as HTMLInputElement).value));
        });

        regenerateBtn.addEventListener('click', () => {
            const count = parseInt(countInput.value);
            if (count >= 1000 && count <= 200000) {
                system.regenerateParticles(
                    distributionSelect.value,
                    colorThemeSelect.value,
                    count
                );
            }
        });

        try {
            const [distRes, themeRes] = await Promise.all([
                fetch('http://localhost:8080/api/distributions'),
                fetch('http://localhost:8080/api/themes'),
            ]);
            const distData = await distRes.json();
            const themeData = await themeRes.json();

            distributionSelect.innerHTML = distData.distributions
                .map((d: string) => `<option value="${d}">${d.charAt(0).toUpperCase() + d.slice(1)}</option>`)
                .join('');

            colorThemeSelect.innerHTML = themeData.themes
                .map((t: string) => `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`)
                .join('');
        } catch (e) {
            console.warn('Failed to fetch options from backend');
        }

    } catch (e) {
        loading.innerHTML = 'Error: ' + (e as Error).message + '<br>Please use a WebGPU-enabled browser (Chrome 113+)';
    }
}

main();
