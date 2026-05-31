import { FaultConfig } from '../config/FeatureConfig.js';
import { stratumData } from '../data/geologyData.js';

export class FaultSimulation {
    constructor(scene, camera, stratumModel) {
        this.scene = scene;
        this.camera = camera;
        this.stratumModel = stratumModel;
        
        this.faultGroup = null;
        this.faultPlane = null;
        this.faultParticles = [];
        this.displacedMeshes = [];
        
        this.isAnimating = false;
        this.animationProgress = 0;
        this.animationSpeed = FaultConfig.animation.speed;
        
        this.faultData = { ...FaultConfig.defaultFault };
        this.onAnimationComplete = null;
    }

    build() {
        this.faultGroup = new THREE.Group();
        this.faultGroup.name = 'faultGroup';
        
        this.createFaultPlane();
        this.createFaultParticles();
        this.createDisplacementVisualization();
        
        this.scene.add(this.faultGroup);
        this.hide();
    }

    createFaultPlane() {
        const { startPoint, endPoint, depth, width, dip, strike } = this.faultData;
        
        const dx = endPoint.x - startPoint.x;
        const dz = endPoint.z - startPoint.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        const height = depth.max - depth.min;
        
        const geometry = new THREE.PlaneGeometry(length, Math.abs(height), 20, 20);
        const positions = geometry.attributes.position;
        
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            
            const noise = Math.sin(x * 0.1) * Math.cos(y * 0.1) * 0.5;
            positions.setZ(i, noise);
        }
        
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshStandardMaterial({
            color: this.faultData.color,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            roughness: 0.8,
            metalness: 0.2
        });
        
        this.faultPlane = new THREE.Mesh(geometry, material);
        
        const centerX = (startPoint.x + endPoint.x) / 2;
        const centerZ = (startPoint.z + endPoint.z) / 2;
        
        this.faultPlane.position.set(centerX, (depth.min + depth.max) / 2, centerZ);
        
        const angleRad = Math.atan2(dz, dx);
        this.faultPlane.rotation.y = -angleRad;
        this.faultPlane.rotation.x = (dip - 90) * Math.PI / 180;
        
        const edges = new THREE.EdgesGeometry(geometry);
        const edgeMaterial = new THREE.LineBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.6
        });
        const edgeLines = new THREE.LineSegments(edges, edgeMaterial);
        this.faultPlane.add(edgeLines);
        
        this.faultGroup.add(this.faultPlane);
    }

    createFaultParticles() {
        const particleCount = FaultConfig.animation.particleCount;
        const { startPoint, endPoint, depth } = this.faultData;
        
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        const velocities = [];
        
        const color = new THREE.Color(this.faultData.color);
        
        for (let i = 0; i < particleCount; i++) {
            const t = Math.random();
            const x = startPoint.x + (endPoint.x - startPoint.x) * t;
            const z = startPoint.z + (endPoint.z - startPoint.z) * t;
            const y = depth.min + (depth.max - depth.min) * Math.random();
            
            positions[i * 3] = x + (Math.random() - 0.5) * 5;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z + (Math.random() - 0.5) * 5;
            
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
            
            sizes[i] = Math.random() * 0.5 + 0.2;
            
            velocities.push({
                x: (Math.random() - 0.5) * 0.5,
                y: Math.random() * 0.3,
                z: (Math.random() - 0.5) * 0.5
            });
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        const material = new THREE.PointsMaterial({
            size: 0.5,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true
        });
        
        const particles = new THREE.Points(geometry, material);
        particles.userData = { velocities: velocities, originalPositions: positions.slice() };
        
        this.faultParticles.push(particles);
        this.faultGroup.add(particles);
    }

    createDisplacementVisualization() {
        const { startPoint, endPoint, depth, displacement } = this.faultData;
        
        const arrowCount = 8;
        for (let i = 0; i < arrowCount; i++) {
            const t = (i + 0.5) / arrowCount;
            const x = startPoint.x + (endPoint.x - startPoint.x) * t;
            const z = startPoint.z + (endPoint.z - startPoint.z) * t;
            const y = depth.min + (depth.max - depth.min) * t;
            
            const arrowDir = new THREE.Vector3(0, 1, 0);
            const arrowOrigin = new THREE.Vector3(x, y, z);
            const arrowLength = displacement * 0.5;
            const arrowColor = 0xffff00;
            
            const arrowHelper = new THREE.ArrowHelper(
                arrowDir,
                arrowOrigin,
                arrowLength,
                arrowColor,
                1,
                0.5
            );
            
            arrowHelper.userData = { baseY: y };
            this.faultGroup.add(arrowHelper);
            this.displacedMeshes.push(arrowHelper);
        }
        
        this.createDisplacementGrid();
    }

    createDisplacementGrid() {
        const { startPoint, endPoint, depth, displacement } = this.faultData;
        
        const gridSize = 10;
        const gridGeometry = new THREE.BufferGeometry();
        const gridPositions = [];
        
        const dx = endPoint.x - startPoint.x;
        const dz = endPoint.z - startPoint.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        
        for (let i = 0; i <= gridSize; i++) {
            const t = i / gridSize;
            const x = startPoint.x + dx * t;
            const z = startPoint.z + dz * t;
            
            gridPositions.push(x, depth.min, z);
            gridPositions.push(x, depth.min + displacement, z);
        }
        
        gridGeometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(gridPositions, 3)
        );
        
        const gridMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.5
        });
        
        const gridLines = new THREE.LineSegments(gridGeometry, gridMaterial);
        this.faultGroup.add(gridLines);
        this.displacedMeshes.push(gridLines);
    }

    show() {
        if (this.faultGroup) {
            this.faultGroup.visible = true;
        }
    }

    hide() {
        if (this.faultGroup) {
            this.faultGroup.visible = false;
        }
    }

    toggle() {
        if (this.faultGroup) {
            this.faultGroup.visible = !this.faultGroup.visible;
            return this.faultGroup.visible;
        }
        return false;
    }

    startAnimation() {
        if (this.isAnimating) return;
        
        this.isAnimating = true;
        this.animationProgress = 0;
        this.show();
    }

    stopAnimation() {
        this.isAnimating = false;
    }

    resetAnimation() {
        this.animationProgress = 0;
        this.isAnimating = false;
        
        if (this.faultPlane) {
            this.faultPlane.material.opacity = 0.4;
        }
        
        this.faultParticles.forEach(particles => {
            const positions = particles.geometry.attributes.position.array;
            const original = particles.userData.originalPositions;
            for (let i = 0; i < positions.length; i++) {
                positions[i] = original[i];
            }
            particles.geometry.attributes.position.needsUpdate = true;
        });
    }

    update(deltaTime) {
        if (!this.faultGroup || !this.faultGroup.visible) return;
        
        if (this.isAnimating) {
            this.animationProgress += deltaTime * this.animationSpeed;
            
            if (this.animationProgress >= 1) {
                this.animationProgress = 1;
                this.isAnimating = false;
                if (this.onAnimationComplete) {
                    this.onAnimationComplete();
                }
            }
            
            this.updateAnimationState();
        }
        
        this.updateParticles(deltaTime);
        this.updatePulseEffect(deltaTime);
    }

    updateAnimationState() {
        const progress = this.animationProgress;
        const easedProgress = this.easeInOutCubic(progress);
        
        if (this.faultPlane) {
            this.faultPlane.material.opacity = 0.3 + easedProgress * 0.5;
        }
        
        this.displacedMeshes.forEach((mesh, index) => {
            if (mesh.userData && mesh.userData.baseY !== undefined) {
                const baseY = mesh.userData.baseY;
                mesh.position.y = baseY + easedProgress * this.faultData.displacement * 0.5;
            }
        });
    }

    updateParticles(deltaTime) {
        this.faultParticles.forEach(particles => {
            const positions = particles.geometry.attributes.position.array;
            const velocities = particles.userData.velocities;
            const count = positions.length / 3;
            
            for (let i = 0; i < count; i++) {
                const idx = i * 3;
                const vel = velocities[i];
                
                positions[idx] += vel.x * deltaTime;
                positions[idx + 1] += vel.y * deltaTime;
                positions[idx + 2] += vel.z * deltaTime;
                
                if (positions[idx + 1] > this.faultData.depth.min) {
                    positions[idx + 1] = this.faultData.depth.max;
                }
            }
            
            particles.geometry.attributes.position.needsUpdate = true;
        });
    }

    updatePulseEffect(deltaTime) {
        if (!this.faultPlane) return;
        
        const time = Date.now() * 0.001;
        const pulse = Math.sin(time * 2) * 0.5 + 0.5;
        const intensity = FaultConfig.animation.pulseIntensity;
        
        this.faultPlane.material.emissive = new THREE.Color(this.faultData.color);
        this.faultPlane.material.emissiveIntensity = pulse * intensity;
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    getFaultInfo() {
        return {
            ...this.faultData,
            isVisible: this.faultGroup ? this.faultGroup.visible : false,
            isAnimating: this.isAnimating,
            animationProgress: this.animationProgress
        };
    }

    setFaultData(data) {
        this.faultData = { ...this.faultData, ...data };
        this.rebuild();
    }

    rebuild() {
        if (this.faultGroup) {
            this.scene.remove(this.faultGroup);
        }
        this.faultParticles = [];
        this.displacedMeshes = [];
        this.build();
    }

    dispose() {
        if (this.faultGroup) {
            this.scene.remove(this.faultGroup);
            this.faultGroup.traverse(child => {
                if (child.geometry) {
                    child.geometry.dispose();
                }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
        this.faultGroup = null;
        this.faultPlane = null;
        this.faultParticles = [];
        this.displacedMeshes = [];
    }
}
