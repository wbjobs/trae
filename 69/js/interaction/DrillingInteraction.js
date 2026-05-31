import { stratumData, getStratumAtDepth } from '../data/geologyData.js';
import { ModelConfig, InteractionConfig } from '../config/SceneConfig.js';

export class DrillingInteraction {
    constructor(scene, camera, stratumModel) {
        this.scene = scene;
        this.camera = camera;
        this.stratumModel = stratumModel;
        
        this.isDrillMode = false;
        this.isDrilling = false;
        this.drillHoles = [];
        this.currentDrill = null;
        this.drillResults = [];
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.5);
        this.intersectPoint = new THREE.Vector3();
        
        this.drillSpeed = InteractionConfig.drillSpeed;
        this.drillRadius = ModelConfig.drill.radius;
        
        this.onDrillComplete = null;
    }

    enableDrillMode() {
        this.isDrillMode = true;
        document.body.style.cursor = 'crosshair';
    }

    disableDrillMode() {
        this.isDrillMode = false;
        document.body.style.cursor = 'default';
    }

    toggleDrillMode() {
        if (this.isDrillMode) {
            this.disableDrillMode();
        } else {
            this.enableDrillMode();
        }
        return this.isDrillMode;
    }

    handleClick(event, container) {
        if (!this.isDrillMode || this.isDrilling) return false;
        
        const rect = container.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const intersected = this.raycaster.ray.intersectPlane(this.groundPlane, this.intersectPoint);
        
        if (intersected) {
            const bounds = this.stratumModel.getBounds();
            const clampedX = Math.max(bounds.minX + 2, Math.min(bounds.maxX - 2, this.intersectPoint.x));
            const clampedZ = Math.max(bounds.minZ + 2, Math.min(bounds.maxZ - 2, this.intersectPoint.z));
            
            if (Math.abs(this.intersectPoint.x - clampedX) < 5 && Math.abs(this.intersectPoint.z - clampedZ) < 5) {
                this.startDrilling(clampedX, clampedZ);
                return true;
            }
        }
        
        return false;
    }

    startDrilling(x, z) {
        this.isDrilling = true;
        
        const drillGroup = new THREE.Group();
        drillGroup.position.set(x, 0.5, z);
        
        const drillGeometry = new THREE.CylinderGeometry(this.drillRadius, this.drillRadius, 0.1, 16);
        const drillMaterial = new THREE.MeshStandardMaterial({
            color: ModelConfig.drill.color,
            transparent: true,
            opacity: ModelConfig.drill.opacity,
            emissive: 0xff0000,
            emissiveIntensity: 0.5
        });
        
        const drillMesh = new THREE.Mesh(drillGeometry, drillMaterial);
        drillMesh.position.y = 0;
        drillGroup.add(drillMesh);
        
        const tipGeometry = new THREE.ConeGeometry(this.drillRadius * 1.2, 2, 16);
        const tipMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            metalness: 0.8,
            roughness: 0.2
        });
        const tipMesh = new THREE.Mesh(tipGeometry, tipMaterial);
        tipMesh.position.y = -1;
        drillGroup.add(tipMesh);
        
        this.scene.add(drillGroup);
        
        this.currentDrill = {
            group: drillGroup,
            mesh: drillMesh,
            tip: tipMesh,
            x: x,
            z: z,
            currentDepth: 0,
            targetDepth: Math.abs(stratumData[stratumData.length - 1].bottomDepth) + 0.5,
            penetratedStrata: []
        };
        
        this.drillHoles.push(this.currentDrill);
    }

    update(deltaTime) {
        if (!this.isDrilling || !this.currentDrill) return;
        
        const drillProgress = this.drillSpeed * deltaTime;
        this.currentDrill.currentDepth += drillProgress;
        
        if (this.currentDrill.currentDepth >= this.currentDrill.targetDepth) {
            this.currentDrill.currentDepth = this.currentDrill.targetDepth;
            this.completeDrilling();
            return;
        }
        
        const drillHeight = this.currentDrill.currentDepth;
        this.currentDrill.mesh.geometry.dispose();
        this.currentDrill.mesh.geometry = new THREE.CylinderGeometry(
            this.drillRadius, 
            this.drillRadius, 
            drillHeight, 
            16
        );
        this.currentDrill.mesh.position.y = -drillHeight / 2;
        this.currentDrill.tip.position.y = -drillHeight - 1;
        
        const worldDepth = 0.5 - this.currentDrill.currentDepth;
        this.checkStratumPenetration(worldDepth);
        
        this.currentDrill.group.rotation.y += 0.1;
    }

    checkStratumPenetration(depth) {
        const currentStratum = getStratumAtDepth(depth);
        
        if (currentStratum) {
            const existing = this.currentDrill.penetratedStrata.find(
                s => s.id === currentStratum.id
            );
            
            if (!existing) {
                this.currentDrill.penetratedStrata.push({
                    ...currentStratum,
                    penetratedAt: depth
                });
                
                this.createStratumMarker(currentStratum, depth);
            }
        }
    }

    createStratumMarker(stratum, depth) {
        const markerGeometry = new THREE.RingGeometry(
            this.drillRadius + 0.3, 
            this.drillRadius + 0.8, 
            32
        );
        const markerMaterial = new THREE.MeshBasicMaterial({
            color: stratum.color,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.rotation.x = -Math.PI / 2;
        marker.position.y = depth;
        this.currentDrill.group.add(marker);
    }

    completeDrilling() {
        this.isDrilling = false;
        
        const result = {
            id: `drill_${Date.now()}`,
            x: this.currentDrill.x,
            z: this.currentDrill.z,
            totalDepth: this.currentDrill.currentDepth,
            strata: this.currentDrill.penetratedStrata.map(s => ({
                name: s.name,
                nameEn: s.nameEn,
                color: s.color,
                thickness: s.thickness,
                topDepth: s.topDepth,
                bottomDepth: s.bottomDepth,
                description: s.description,
                properties: s.properties
            })),
            timestamp: new Date().toLocaleString()
        };
        
        this.drillResults.push(result);
        
        this.currentDrill.mesh.material.emissiveIntensity = 0;
        this.currentDrill.tip.material.color.setHex(0x666666);
        
        if (this.onDrillComplete) {
            this.onDrillComplete(result);
        }
        
        this.currentDrill = null;
    }

    clearAllDrillHoles() {
        this.drillHoles.forEach(drill => {
            this.scene.remove(drill.group);
            drill.group.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        });
        
        this.drillHoles = [];
        this.drillResults = [];
        this.currentDrill = null;
        this.isDrilling = false;
    }

    getDrillResults() {
        return this.drillResults;
    }

    isInDrillMode() {
        return this.isDrillMode;
    }

    isCurrentlyDrilling() {
        return this.isDrilling;
    }

    getAllDrillMeshes() {
        const meshes = [];
        this.drillHoles.forEach(drill => {
            drill.group.traverse(child => {
                if (child.isMesh) {
                    meshes.push(child);
                }
            });
        });
        return meshes;
    }

    dispose() {
        this.clearAllDrillHoles();
        this.disableDrillMode();
    }
}
