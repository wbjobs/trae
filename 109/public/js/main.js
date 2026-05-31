import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const CLOTH_SIZE = 80;
const CLOTH_WIDTH = 10;
const CLOTH_HEIGHT = 10;
const PARTICLE_COUNT = CLOTH_SIZE * CLOTH_SIZE;

class ClothSimulation {
    constructor() {
        this.canvas = document.getElementById('canvas-webgpu');
        this.overlayCanvas = document.getElementById('canvas-overlay');
        
        this.gpuSimulator = null;
        this.useGPU = false;
        
        this.camera = null;
        this.controls = null;
        
        this.particles = [];
        this.constraints = [];
        this.stressValues = new Float32Array(PARTICLE_COUNT);
        this.pinnedIndices = new Set();
        
        this.params = {
            stiffness: 0.6,
            damping: 0.5,
            mass: 1.0,
            gravity: -9.8,
            windStrength: 0.5
        };
        
        this.showStress = true;
        this.showSphere = true;
        this.simulationRunning = true;
        
        this.mouseDown = false;
        this.draggingParticle = -1;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.clock = new THREE.Clock();
        this.fps = 60;
        this.frameCount = 0;
        this.fpsTime = 0;
        
        this.windPulse = null;
        this.gravityVector = new THREE.Vector3(0, this.params.gravity, 0);
        
        this.tmpVec1 = new THREE.Vector3();
        this.tmpVec2 = new THREE.Vector3();
        
        this.init();
    }
    
    async init() {
        try {
            await this.initGPU();
            this.useGPU = true;
            document.getElementById('gpu-badge').textContent = 'GPU 加速';
            document.getElementById('render-mode').textContent = '渲染模式: WebGPU Compute';
        } catch (error) {
            console.warn('WebGPU 初始化失败，使用 CPU 模拟:', error.message);
            this.useGPU = false;
            document.getElementById('gpu-badge').textContent = 'CPU 模式';
            document.getElementById('render-mode').textContent = '渲染模式: CPU 模拟';
            document.getElementById('error-overlay').style.display = 'none';
        }
        
        this.initCamera();
        this.initControls();
        this.initEventListeners();
        
        if (!this.useGPU) {
            this.initCPUCloth();
        }
        
        this.loadPresets();
        
        document.getElementById('loading-overlay').classList.add('hidden');
        
        this.animate();
    }
    
    async initGPU() {
        if (!navigator.gpu) {
            throw new Error('当前浏览器不支持 WebGPU');
        }
        
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error('无法获取 GPU 适配器');
        }
        
        this.gpuSimulator = new WebGPUClothSimulator();
        await this.gpuSimulator.init();
        
        document.getElementById('particle-count').textContent = this.gpuSimulator.getParticleCount();
        document.getElementById('constraint-count').textContent = this.gpuSimulator.getEdgeCount();
    }
    
    initCamera() {
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 8, 18);
        this.camera.lookAt(0, 2, 0);
    }
    
    initControls() {
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 40;
        this.controls.maxPolarAngle = Math.PI * 0.85;
        this.controls.mouseButtons = {
            LEFT: null,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE
        };
    }
    
    initCPUCloth() {
        class Particle {
            constructor(x, y, z, mass = 1) {
                this.position = new THREE.Vector3(x, y, z);
                this.previousPosition = new THREE.Vector3(x, y, z);
                this.velocity = new THREE.Vector3(0, 0, 0);
                this.acceleration = new THREE.Vector3(0, 0, 0);
                this.mass = mass;
                this.invMass = 1 / mass;
                this.pinned = false;
                this.stress = 0;
            }
            
            applyForce(force) {
                this.acceleration.add(force.clone().multiplyScalar(this.invMass));
            }
            
            integrate(dt, damping) {
                if (this.pinned) {
                    this.velocity.set(0, 0, 0);
                    this.acceleration.set(0, 0, 0);
                    return;
                }
                
                this.velocity.add(this.acceleration.clone().multiplyScalar(dt));
                this.velocity.multiplyScalar(1 - damping * dt);
                
                const maxSpeed = 15;
                if (this.velocity.length() > maxSpeed) {
                    this.velocity.normalize().multiplyScalar(maxSpeed);
                }
                
                this.position.add(this.velocity.clone().multiplyScalar(dt));
                this.acceleration.set(0, 0, 0);
            }
        }
        
        class SpringConstraint {
            constructor(p1, p2, stiffness = 0.5, damping = 0.3) {
                this.p1 = p1;
                this.p2 = p2;
                this.stiffness = stiffness;
                this.damping = damping;
                
                const distance = p1.position.distanceTo(p2.position);
                this.restLength = distance;
                this.maxLength = distance * 1.5;
                this.currentStress = 0;
            }
            
            satisfy() {
                const diff = new THREE.Vector3().subVectors(this.p2.position, this.p1.position);
                const currentLength = diff.length();
                
                if (currentLength < 0.0001) return;
                
                const direction = diff.normalize();
                const stretch = currentLength - this.restLength;
                this.currentStress = Math.abs(stretch) / this.restLength;
                
                let correctionStretch = stretch;
                if (currentLength > this.maxLength) {
                    correctionStretch = this.maxLength - this.restLength;
                }
                
                if (Math.abs(correctionStretch) < 0.0001) return;
                
                const correction = direction.multiplyScalar(correctionStretch * this.stiffness * 0.5);
                
                if (!this.p1.pinned && !this.p2.pinned) {
                    this.p1.position.add(correction);
                    this.p2.position.sub(correction);
                } else if (!this.p1.pinned) {
                    this.p1.position.add(correction.multiplyScalar(2));
                } else if (!this.p2.pinned) {
                    this.p2.position.sub(correction.multiplyScalar(2));
                }
                
                const relVelocity = new THREE.Vector3().subVectors(this.p2.velocity, this.p1.velocity);
                const velAlongNormal = relVelocity.dot(direction);
                
                if (velAlongNormal > 0) return;
                
                const dampingForce = direction.multiplyScalar(-velAlongNormal * this.damping * 0.5);
                
                if (!this.p1.pinned) {
                    this.p1.velocity.sub(dampingForce);
                }
                if (!this.p2.pinned) {
                    this.p2.velocity.add(dampingForce);
                }
            }
        }
        
        this.Particle = Particle;
        this.SpringConstraint = SpringConstraint;
        
        this.createCPUParticles();
        this.createCPUConstraints();
        this.pinCorners();
        
        document.getElementById('particle-count').textContent = PARTICLE_COUNT;
        document.getElementById('constraint-count').textContent = this.constraints.length;
    }
    
    createCPUParticles() {
        for (let j = 0; j < CLOTH_SIZE; j++) {
            for (let i = 0; i < CLOTH_SIZE; i++) {
                const index = j * CLOTH_SIZE + i;
                const x = (i / (CLOTH_SIZE - 1) - 0.5) * CLOTH_WIDTH;
                const y = 5;
                const z = (j / (CLOTH_SIZE - 1) - 0.5) * CLOTH_HEIGHT;
                
                this.particles[index] = new this.Particle(x, y, z, this.params.mass);
            }
        }
    }
    
    createCPUConstraints() {
        const stiffness = this.params.stiffness;
        const damping = this.params.damping;
        
        for (let j = 0; j < CLOTH_SIZE; j++) {
            for (let i = 0; i < CLOTH_SIZE; i++) {
                const index = j * CLOTH_SIZE + i;
                const p1 = this.particles[index];
                
                if (i < CLOTH_SIZE - 1) {
                    this.constraints.push(new this.SpringConstraint(p1, this.particles[index + 1], stiffness, damping));
                }
                
                if (j < CLOTH_SIZE - 1) {
                    this.constraints.push(new this.SpringConstraint(p1, this.particles[index + CLOTH_SIZE], stiffness, damping));
                }
                
                if (i < CLOTH_SIZE - 1 && j < CLOTH_SIZE - 1) {
                    this.constraints.push(new this.SpringConstraint(p1, this.particles[index + CLOTH_SIZE + 1], stiffness * 0.5, damping * 0.7));
                    this.constraints.push(new this.SpringConstraint(this.particles[index + 1], this.particles[index + CLOTH_SIZE], stiffness * 0.5, damping * 0.7));
                }
            }
        }
    }
    
    pinCorners() {
        const cornerIndices = [
            0,
            CLOTH_SIZE - 1,
            CLOTH_SIZE * (CLOTH_SIZE - 1),
            CLOTH_SIZE * CLOTH_SIZE - 1
        ];
        
        for (const idx of cornerIndices) {
            this.particles[idx].pinned = true;
            this.pinnedIndices.add(idx);
        }
    }
    
    initEventListeners() {
        window.addEventListener('resize', () => this.onWindowResize());
        
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        
        this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e));
        
        this.initUIControls();
    }
    
    initUIControls() {
        const presetSelect = document.getElementById('preset-select');
        const presetDesc = document.getElementById('preset-desc');
        
        const stiffnessSlider = document.getElementById('stiffness');
        const dampingSlider = document.getElementById('damping');
        const massSlider = document.getElementById('mass');
        const gravitySlider = document.getElementById('gravity');
        const windSlider = document.getElementById('wind');
        
        const stiffnessValue = document.getElementById('stiffness-value');
        const dampingValue = document.getElementById('damping-value');
        const massValue = document.getElementById('mass-value');
        const gravityValue = document.getElementById('gravity-value');
        const windValue = document.getElementById('wind-value');
        
        const showStressCheckbox = document.getElementById('show-stress');
        const showSphereCheckbox = document.getElementById('show-sphere');
        
        const resetBtn = document.getElementById('reset-btn');
        const windPulseBtn = document.getElementById('wind-pulse-btn');
        const toggleBtn = document.getElementById('toggle-simulation');
        
        presetSelect.addEventListener('change', async () => {
            await this.applyPreset(presetSelect.value);
        });
        
        stiffnessSlider.addEventListener('input', () => {
            this.params.stiffness = parseFloat(stiffnessSlider.value);
            stiffnessValue.textContent = this.params.stiffness.toFixed(2);
            this.updateParams();
        });
        
        dampingSlider.addEventListener('input', () => {
            this.params.damping = parseFloat(dampingSlider.value);
            dampingValue.textContent = this.params.damping.toFixed(2);
            this.updateParams();
        });
        
        massSlider.addEventListener('input', () => {
            this.params.mass = parseFloat(massSlider.value);
            massValue.textContent = this.params.mass.toFixed(2);
            this.updateParams();
        });
        
        gravitySlider.addEventListener('input', () => {
            this.params.gravity = parseFloat(gravitySlider.value);
            gravityValue.textContent = this.params.gravity.toFixed(2);
            this.gravityVector.set(0, this.params.gravity, 0);
            this.updateParams();
        });
        
        windSlider.addEventListener('input', () => {
            this.params.windStrength = parseFloat(windSlider.value);
            windValue.textContent = this.params.windStrength.toFixed(2);
            this.updateParams();
        });
        
        showStressCheckbox.addEventListener('change', () => {
            this.showStress = showStressCheckbox.checked;
            if (this.useGPU && this.gpuSimulator) {
                this.gpuSimulator.setShowStress(this.showStress);
            }
        });
        
        showSphereCheckbox.addEventListener('change', () => {
            this.showSphere = showSphereCheckbox.checked;
        });
        
        resetBtn.addEventListener('click', () => {
            this.resetCloth();
        });
        
        windPulseBtn.addEventListener('click', () => {
            this.windPulse = {
                strength: 3,
                duration: 0.5,
                startTime: this.clock.getElapsedTime()
            };
        });
        
        toggleBtn.addEventListener('click', () => {
            this.simulationRunning = !this.simulationRunning;
            toggleBtn.textContent = this.simulationRunning ? '暂停' : '继续';
        });
    }
    
    updateParams() {
        if (this.useGPU && this.gpuSimulator) {
            this.gpuSimulator.setParams(this.params);
        }
        
        if (!this.useGPU) {
            for (const particle of this.particles) {
                particle.mass = this.params.mass;
                particle.invMass = 1 / this.params.mass;
            }
        }
        
        const presetSelect = document.getElementById('preset-select');
        if (presetSelect.value !== 'custom') {
            presetSelect.value = 'custom';
            document.getElementById('preset-desc').textContent = '用户自定义参数';
        }
    }
    
    async loadPresets() {
        try {
            const response = await fetch('/api/presets');
            const data = await response.json();
            if (data.currentPreset) {
                document.getElementById('preset-select').value = data.currentPreset;
                await this.applyPreset(data.currentPreset, false);
            }
        } catch (error) {
            console.log('使用默认预设');
        }
    }
    
    async applyPreset(presetId, updateServer = true) {
        try {
            if (updateServer) {
                await fetch(`/api/presets/${presetId}/apply`, { method: 'POST' });
            }
            
            const response = await fetch(`/api/presets/${presetId}`);
            const preset = await response.json();
            
            this.params.stiffness = preset.stiffness;
            this.params.damping = preset.damping;
            this.params.mass = preset.mass;
            this.params.gravity = preset.gravity;
            this.params.windStrength = preset.windStrength;
            
            document.getElementById('stiffness').value = this.params.stiffness;
            document.getElementById('stiffness-value').textContent = this.params.stiffness.toFixed(2);
            
            document.getElementById('damping').value = this.params.damping;
            document.getElementById('damping-value').textContent = this.params.damping.toFixed(2);
            
            document.getElementById('mass').value = this.params.mass;
            document.getElementById('mass-value').textContent = this.params.mass.toFixed(2);
            
            document.getElementById('gravity').value = this.params.gravity;
            document.getElementById('gravity-value').textContent = this.params.gravity.toFixed(2);
            
            document.getElementById('wind').value = this.params.windStrength;
            document.getElementById('wind-value').textContent = this.params.windStrength.toFixed(2);
            
            document.getElementById('preset-desc').textContent = preset.description;
            
            this.updateParams();
            
        } catch (error) {
            console.error('应用预设失败:', error);
        }
    }
    
    resetCloth() {
        if (this.useGPU && this.gpuSimulator) {
            this.gpuSimulator.resetCloth();
        } else {
            for (let j = 0; j < CLOTH_SIZE; j++) {
                for (let i = 0; i < CLOTH_SIZE; i++) {
                    const index = j * CLOTH_SIZE + i;
                    const x = (i / (CLOTH_SIZE - 1) - 0.5) * CLOTH_WIDTH;
                    const y = 5;
                    const z = (j / (CLOTH_SIZE - 1) - 0.5) * CLOTH_HEIGHT;
                    
                    const particle = this.particles[index];
                    particle.position.set(x, y, z);
                    particle.velocity.set(0, 0, 0);
                    particle.acceleration.set(0, 0, 0);
                    
                    if (this.pinnedIndices.has(index)) {
                        particle.pinned = true;
                    }
                }
            }
            this.stressValues.fill(0);
        }
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        
        if (this.useGPU && this.gpuSimulator) {
            this.gpuSimulator.resize();
        }
    }
    
    getMousePosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
    
    onMouseDown(e) {
        if (e.button !== 0) return;
        
        this.getMousePosition(e);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const planeZ = 0;
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -planeZ);
        const intersectPoint = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(plane, intersectPoint);
        
        if (intersectPoint) {
            let closestIndex = -1;
            let closestDist = Infinity;
            
            const searchRadius = 1.0;
            
            for (let idx = 0; idx < PARTICLE_COUNT; idx++) {
                let px, py, pz;
                
                if (this.useGPU && this.gpuSimulator) {
                    continue;
                } else {
                    const p = this.particles[idx];
                    px = p.position.x;
                    py = p.position.y;
                    pz = p.position.z;
                }
                
                const dx = px - intersectPoint.x;
                const dy = py - intersectPoint.y;
                const dz = pz - intersectPoint.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                
                if (dist < closestDist && dist < searchRadius) {
                    closestDist = dist;
                    closestIndex = idx;
                }
            }
            
            if (closestIndex >= 0) {
                this.draggingParticle = closestIndex;
                this.mouseDown = true;
                this.controls.enabled = false;
                
                if (this.useGPU && this.gpuSimulator) {
                    this.gpuSimulator.setMouseParticle(closestIndex);
                } else if (!this.pinnedIndices.has(closestIndex)) {
                    this.particles[closestIndex].pinned = true;
                }
            }
        }
    }
    
    onMouseMove(e) {
        if (!this.mouseDown || this.draggingParticle < 0) return;
        
        this.getMousePosition(e);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const planeNormal = new THREE.Vector3(0, 0, 1);
        let planePoint;
        
        if (this.useGPU && this.gpuSimulator) {
            planePoint = new THREE.Vector3(0, 0, 0);
        } else {
            planePoint = this.particles[this.draggingParticle].position.clone();
        }
        
        const plane = new THREE.Plane();
        plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);
        
        const intersectPoint = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(plane, intersectPoint);
        
        if (intersectPoint) {
            if (this.useGPU && this.gpuSimulator) {
                this.gpuSimulator.setMousePosition(intersectPoint.x, intersectPoint.y, intersectPoint.z);
            } else {
                const particle = this.particles[this.draggingParticle];
                particle.position.copy(intersectPoint);
                particle.velocity.set(0, 0, 0);
            }
        }
    }
    
    onMouseUp(e) {
        if (!this.useGPU && this.draggingParticle >= 0 && !this.pinnedIndices.has(this.draggingParticle)) {
            this.particles[this.draggingParticle].pinned = false;
        }
        
        if (this.useGPU && this.gpuSimulator) {
            this.gpuSimulator.setMouseParticle(-1);
        }
        
        this.mouseDown = false;
        this.draggingParticle = -1;
        this.controls.enabled = true;
    }
    
    onTouchStart(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.onMouseDown({ clientX: touch.clientX, clientY: touch.clientY, button: 0 });
        }
    }
    
    onTouchMove(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }
    
    onTouchEnd(e) {
        this.onMouseUp({});
    }
    
    applyGravityCPU() {
        const gravity = this.gravityVector;
        for (const particle of this.particles) {
            if (!particle.pinned) {
                particle.applyForce(this.tmpVec1.copy(gravity).multiplyScalar(particle.mass));
            }
        }
    }
    
    applyWindCPU(time) {
        let windStrength = this.params.windStrength;
        
        if (this.windPulse) {
            const elapsed = time - this.windPulse.startTime;
            if (elapsed < this.windPulse.duration) {
                const pulseFactor = Math.sin(elapsed / this.windPulse.duration * Math.PI);
                windStrength += this.windPulse.strength * pulseFactor;
            } else {
                this.windPulse = null;
            }
        }
        
        const windX = Math.sin(time * 0.5) * windStrength;
        const windY = Math.sin(time * 0.3) * windStrength * 0.2;
        const windZ = Math.cos(time * 0.7) * windStrength;
        
        const windForce = this.tmpVec1.set(windX, windY, windZ);
        
        for (let j = 0; j < CLOTH_SIZE; j++) {
            for (let i = 0; i < CLOTH_SIZE; i++) {
                const index = j * CLOTH_SIZE + i;
                const particle = this.particles[index];
                
                if (!particle.pinned) {
                    const turbulence = this.tmpVec2.set(
                        Math.sin(time * 2 + i * 0.1 + j * 0.1) * 0.1,
                        Math.cos(time * 1.5 + i * 0.05 + j * 0.15) * 0.05,
                        Math.sin(time * 1.8 + i * 0.12 + j * 0.08) * 0.1
                    );
                    
                    const force = windForce.clone().add(turbulence).multiplyScalar(particle.mass * 0.1);
                    particle.applyForce(force);
                }
            }
        }
    }
    
    handleSphereCollisionCPU() {
        const spherePos = new THREE.Vector3(0, -1, 0);
        const radius = 2.05;
        
        for (const particle of this.particles) {
            if (particle.pinned) continue;
            
            const diff = this.tmpVec1.subVectors(particle.position, spherePos);
            const distance = diff.length();
            
            if (distance < radius) {
                const normal = diff.normalize();
                const pushDistance = radius - distance;
                
                particle.position.add(normal.multiplyScalar(pushDistance));
                
                const velocityDotNormal = particle.velocity.dot(normal);
                if (velocityDotNormal < 0) {
                    particle.velocity.add(normal.multiplyScalar(-velocityDotNormal * 1.2));
                }
            }
        }
    }
    
    solveConstraintsCPU() {
        const iterations = 3;
        
        for (let iter = 0; iter < iterations; iter++) {
            for (const constraint of this.constraints) {
                constraint.satisfy();
            }
        }
    }
    
    simulateCPU(dt, time) {
        const subSteps = 3;
        const subDt = dt / subSteps;
        
        for (let step = 0; step < subSteps; step++) {
            this.applyGravityCPU();
            this.applyWindCPU(time);
            
            this.solveConstraintsCPU();
            
            for (const particle of this.particles) {
                particle.integrate(subDt, this.params.damping);
            }
            
            this.handleSphereCollisionCPU();
        }
    }
    
    calculateStressCPU() {
        let maxStress = 0;
        const particleStress = this.stressValues;
        const particleConstraintCount = new Int32Array(PARTICLE_COUNT);
        
        particleStress.fill(0);
        
        for (const constraint of this.constraints) {
            const stress = constraint.currentStress;
            
            const idx1 = this.particles.indexOf(constraint.p1);
            const idx2 = this.particles.indexOf(constraint.p2);
            
            if (idx1 >= 0) {
                particleStress[idx1] += stress;
                particleConstraintCount[idx1]++;
            }
            if (idx2 >= 0) {
                particleStress[idx2] += stress;
                particleConstraintCount[idx2]++;
            }
        }
        
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            if (particleConstraintCount[i] > 0) {
                particleStress[i] /= particleConstraintCount[i];
                if (particleStress[i] > maxStress) {
                    maxStress = particleStress[i];
                }
            }
        }
        
        return maxStress;
    }
    
    updateCameraData() {
        if (!this.useGPU || !this.gpuSimulator) return;
        
        const viewMatrix = new Float32Array(16);
        const projMatrix = new Float32Array(16);
        
        this.camera.matrixWorldInverse.toArray(viewMatrix);
        this.camera.projectionMatrix.toArray(projMatrix);
        
        const cameraPos = new Float32Array([
            this.camera.position.x,
            this.camera.position.y,
            this.camera.position.z
        ]);
        
        this.gpuSimulator.updateCamera(viewMatrix, projMatrix, cameraPos);
    }
    
    updateFPS(delta) {
        this.frameCount++;
        this.fpsTime += delta;
        
        if (this.fpsTime >= 0.5) {
            this.fps = Math.round(this.frameCount / this.fpsTime);
            document.getElementById('fps').textContent = this.fps;
            this.frameCount = 0;
            this.fpsTime = 0;
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const delta = this.clock.getDelta();
        const time = this.clock.getElapsedTime();
        
        this.controls.update();
        this.updateCameraData();
        
        if (this.simulationRunning) {
            if (this.useGPU && this.gpuSimulator) {
                this.gpuSimulator.simulate(delta, time);
                this.gpuSimulator.render();
                
                this.gpuSimulator.readStress().then((result) => {
                    if (result) {
                        document.getElementById('max-stress').textContent = result.maxStress.toFixed(4);
                    }
                });
            } else {
                this.simulateCPU(delta, time);
                
                const maxStress = this.calculateStressCPU();
                document.getElementById('max-stress').textContent = maxStress.toFixed(4);
                
                this.renderCPU();
            }
        }
        
        this.updateFPS(delta);
    }
    
    renderCPU() {
        const ctx = this.overlayCanvas.getContext('2d');
        const width = this.overlayCanvas.width = window.innerWidth;
        const height = this.overlayCanvas.height = window.innerHeight;
        
        ctx.clearRect(0, 0, width, height);
        
        const projScreenMatrix = new THREE.Matrix4();
        projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        
        const positions = [];
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const p = this.particles[i];
            const v = new THREE.Vector3(p.position.x, p.position.y, p.position.z);
            v.applyMatrix4(projScreenMatrix);
            
            if (v.z > 1 || v.z < -1) {
                positions.push(null);
                continue;
            }
            
            const x = (v.x * 0.5 + 0.5) * width;
            const y = (-v.y * 0.5 + 0.5) * height;
            positions.push({ x, y, z: v.z });
        }
        
        ctx.strokeStyle = 'rgba(100, 150, 255, 0.3)';
        ctx.lineWidth = 1;
        
        for (let j = 0; j < CLOTH_SIZE; j++) {
            for (let i = 0; i < CLOTH_SIZE - 1; i++) {
                const idx1 = j * CLOTH_SIZE + i;
                const idx2 = j * CLOTH_SIZE + i + 1;
                
                if (!positions[idx1] || !positions[idx2]) continue;
                
                ctx.beginPath();
                ctx.moveTo(positions[idx1].x, positions[idx1].y);
                ctx.lineTo(positions[idx2].x, positions[idx2].y);
                ctx.stroke();
            }
        }
        
        for (let j = 0; j < CLOTH_SIZE - 1; j++) {
            for (let i = 0; i < CLOTH_SIZE; i++) {
                const idx1 = j * CLOTH_SIZE + i;
                const idx2 = (j + 1) * CLOTH_SIZE + i;
                
                if (!positions[idx1] || !positions[idx2]) continue;
                
                ctx.beginPath();
                ctx.moveTo(positions[idx1].x, positions[idx1].y);
                ctx.lineTo(positions[idx2].x, positions[idx2].y);
                ctx.stroke();
            }
        }
        
        if (this.showSphere) {
            const spherePos = new THREE.Vector3(0, -1, 0);
            const v = new THREE.Vector3(spherePos.x, spherePos.y, spherePos.z);
            v.applyMatrix4(projScreenMatrix);
            
            if (v.z < 1 && v.z > -1) {
                const x = (v.x * 0.5 + 0.5) * width;
                const y = (-v.y * 0.5 + 0.5) * height;
                
                const radius = 2 * width / (18 * Math.abs(v.z + 2));
                
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(68, 136, 255, 0.3)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(68, 136, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new ClothSimulation();
});
