import { OptimizationConfig } from '../config/FeatureConfig.js';

export class RenderOptimizer {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        
        this.enabled = OptimizationConfig.enabled;
        this.lodLevels = OptimizationConfig.lodLevels;
        this.targetFPS = OptimizationConfig.targetFPS;
        
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.currentFPS = 60;
        this.averageFPS = 60;
        
        this.currentLOD = 0;
        this.currentPixelRatio = Math.min(window.devicePixelRatio, 2);
        
        this.managedObjects = [];
        this.frustum = new THREE.Frustum();
        this.projScreenMatrix = new THREE.Matrix4();
        
        this.stats = {
            drawCalls: 0,
            triangles: 0,
            fps: 60,
            qualityLevel: 'high'
        };
        
        this.onQualityChange = null;
    }

    registerObject(object, options = {}) {
        const obj = {
            object,
            originalOpacity: options.opacity !== undefined ? options.opacity : 1,
            originalVisible: object.visible,
            distanceThreshold: options.distanceThreshold || 100,
            lodEnabled: options.lodEnabled !== false
        };
        this.managedObjects.push(obj);
        return obj;
    }

    unregisterObject(object) {
        const index = this.managedObjects.findIndex(o => o.object === object);
        if (index !== -1) {
            this.managedObjects.splice(index, 1);
        }
    }

    registerStratumModel(stratumModel) {
        const meshes = stratumModel.getAllMeshes();
        meshes.forEach(mesh => {
            this.registerObject(mesh, {
                opacity: mesh.material.opacity || 0.9,
                distanceThreshold: 150
            });
        });
    }

    update(deltaTime) {
        if (!this.enabled) return;
        
        this.updateFPS();
        this.updateLOD();
        this.updateFrustumCulling();
        
        if (OptimizationConfig.autoAdjustQuality) {
            this.adjustQuality();
        }
    }

    updateFPS() {
        this.frameCount++;
        const now = performance.now();
        
        if (now - this.lastTime >= 1000) {
            this.currentFPS = Math.round(this.frameCount * 1000 / (now - this.lastTime));
            this.averageFPS = this.averageFPS * 0.9 + this.currentFPS * 0.1;
            this.frameCount = 0;
            this.lastTime = now;
            
            this.stats.fps = this.currentFPS;
        }
    }

    updateLOD() {
        const cameraPosition = this.camera.position;
        
        this.managedObjects.forEach(obj => {
            if (!obj.lodEnabled || !obj.object.parent) return;
            
            const objectPosition = new THREE.Vector3();
            obj.object.getWorldPosition(objectPosition);
            
            const distance = cameraPosition.distanceTo(objectPosition);
            
            let targetOpacity = obj.originalOpacity;
            let visible = true;
            
            for (let i = this.lodLevels.length - 1; i >= 0; i--) {
                const level = this.lodLevels[i];
                if (distance > level.distance) {
                    targetOpacity = obj.originalOpacity * level.opacity;
                    if (level.opacity < 0.1) {
                        visible = false;
                    }
                    break;
                }
            }
            
            if (obj.object.material) {
                if (obj.object.material.opacity !== undefined) {
                    obj.object.material.opacity = THREE.MathUtils.lerp(
                        obj.object.material.opacity,
                        targetOpacity,
                        0.1
                    );
                    obj.object.material.transparent = obj.object.material.opacity < 1;
                }
            }
            
            if (visible !== obj.object.visible) {
                obj.object.visible = visible;
            }
        });
    }

    updateFrustumCulling() {
        if (!OptimizationConfig.frustumCulling) return;
        
        this.camera.updateMatrixWorld();
        this.projScreenMatrix.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );
        this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
        
        this.managedObjects.forEach(obj => {
            if (!obj.object.parent || !obj.object.isMesh) return;
            
            if (obj.object.geometry && !obj.object.geometry.boundingSphere) {
                obj.object.geometry.computeBoundingSphere();
            }
            
            if (obj.object.geometry && obj.object.geometry.boundingSphere) {
                const sphere = obj.object.geometry.boundingSphere.clone();
                sphere.applyMatrix4(obj.object.matrixWorld);
                
                const inFrustum = this.frustum.intersectsSphere(sphere);
                obj.object.visible = inFrustum || obj.distanceThreshold < 50;
            }
        });
    }

    adjustQuality() {
        const fps = this.averageFPS;
        
        if (fps < this.targetFPS * 0.8) {
            this.decreaseQuality();
        } else if (fps > this.targetFPS * 1.1) {
            this.increaseQuality();
        }
    }

    decreaseQuality() {
        if (this.currentPixelRatio > OptimizationConfig.minPixelRatio) {
            this.currentPixelRatio = Math.max(
                OptimizationConfig.minPixelRatio,
                this.currentPixelRatio - 0.2
            );
            this.renderer.setPixelRatio(this.currentPixelRatio);
            this.notifyQualityChange();
        }
    }

    increaseQuality() {
        const maxRatio = Math.min(window.devicePixelRatio, OptimizationConfig.maxPixelRatio);
        if (this.currentPixelRatio < maxRatio) {
            this.currentPixelRatio = Math.min(
                maxRatio,
                this.currentPixelRatio + 0.1
            );
            this.renderer.setPixelRatio(this.currentPixelRatio);
            this.notifyQualityChange();
        }
    }

    notifyQualityChange() {
        let qualityLevel = 'high';
        if (this.currentPixelRatio < 1.0) qualityLevel = 'lowest';
        else if (this.currentPixelRatio < 1.5) qualityLevel = 'low';
        else if (this.currentPixelRatio < 1.8) qualityLevel = 'medium';
        
        this.stats.qualityLevel = qualityLevel;
        
        if (this.onQualityChange) {
            this.onQualityChange(this.stats);
        }
    }

    getStats() {
        return {
            ...this.stats,
            pixelRatio: this.currentPixelRatio,
            managedObjects: this.managedObjects.length
        };
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.resetQuality();
        }
    }

    resetQuality() {
        this.currentPixelRatio = Math.min(window.devicePixelRatio, OptimizationConfig.maxPixelRatio);
        this.renderer.setPixelRatio(this.currentPixelRatio);
        
        this.managedObjects.forEach(obj => {
            if (obj.object.material && obj.object.material.opacity !== undefined) {
                obj.object.material.opacity = obj.originalOpacity;
                obj.object.material.transparent = obj.originalOpacity < 1;
            }
            obj.object.visible = obj.originalVisible;
        });
    }

    optimizeGeometry(geometry) {
        geometry.computeVertexNormals();
        
        const attributes = geometry.attributes;
        for (const name in attributes) {
            const attribute = attributes[name];
            if (attribute.count > 1000) {
                if (attribute.usage !== THREE.DynamicDrawUsage) {
                    attribute.setUsage(THREE.StaticDrawUsage);
                }
            }
        }
        
        if (geometry.index) {
            geometry.index.setUsage(THREE.StaticDrawUsage);
        }
        
        return geometry;
    }

    createOptimizedMaterial(originalMaterial) {
        const optimized = originalMaterial.clone();
        optimized.precision = 'mediump';
        
        if (optimized.map) {
            optimized.map.anisotropy = Math.min(optimized.map.anisotropy || 8, 8);
        }
        
        return optimized;
    }

    dispose() {
        this.managedObjects = [];
    }
}
