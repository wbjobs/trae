import { dataPoints } from '../data/geologyData.js';
import { ModelConfig } from '../config/SceneConfig.js';

export class DataPoints {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        
        this.points = [];
        this.labels = [];
        this.selectedPoint = null;
        this.hoveredPoint = null;
        
        this.sphereRadius = ModelConfig.dataPoint.sphereRadius;
        this.coneHeight = ModelConfig.dataPoint.coneHeight;
        this.labelOffset = ModelConfig.dataPoint.labelOffset;
        
        this.onPointClick = null;
        this.onPointHover = null;
    }

    build() {
        dataPoints.forEach(pointData => {
            const pointGroup = this.createDataPoint(pointData);
            this.points.push(pointGroup);
            this.scene.add(pointGroup);
        });
    }

    createDataPoint(pointData) {
        const group = new THREE.Group();
        group.name = pointData.id;
        group.userData = { type: 'dataPoint', pointData: pointData };
        
        const position = pointData.position;
        group.position.set(position.x, position.y, position.z);
        
        const typeConfig = this.getTypeConfig(pointData.type);
        
        const hitboxGeometry = new THREE.SphereGeometry(this.sphereRadius * 2.5, 8, 8);
        const hitboxMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthTest: false
        });
        const hitbox = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
        hitbox.userData = { type: 'dataPoint', pointData: pointData, isClickable: true };
        hitbox.position.y = this.sphereRadius + this.coneHeight / 2;
        group.add(hitbox);
        
        const sphereGeometry = new THREE.SphereGeometry(this.sphereRadius, 16, 16);
        const sphereMaterial = new THREE.MeshStandardMaterial({
            color: typeConfig.color,
            emissive: typeConfig.emissive,
            emissiveIntensity: 0.3,
            metalness: 0.3,
            roughness: 0.5
        });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.userData = { type: 'dataPoint', pointData: pointData };
        group.add(sphere);
        
        const coneGeometry = new THREE.ConeGeometry(this.sphereRadius * 0.8, this.coneHeight, 8);
        const coneMaterial = new THREE.MeshStandardMaterial({
            color: typeConfig.color,
            emissive: typeConfig.emissive,
            emissiveIntensity: 0.2
        });
        const cone = new THREE.Mesh(coneGeometry, coneMaterial);
        cone.position.y = this.sphereRadius + this.coneHeight / 2;
        cone.userData = { type: 'dataPoint', pointData: pointData };
        group.add(cone);
        
        const ringGeometry = new THREE.RingGeometry(this.sphereRadius + 0.5, this.sphereRadius + 1, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: typeConfig.color,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -this.sphereRadius - 0.1;
        group.add(ring);
        
        const label = this.createLabel(pointData.name, typeConfig.color);
        label.position.y = this.sphereRadius + this.coneHeight + this.labelOffset;
        group.add(label);
        this.labels.push({ label, group });
        
        return group;
    }

    getTypeConfig(type) {
        const configs = {
            borehole: { color: 0x4488ff, emissive: 0x2244aa },
            monitoring: { color: 0x44ff44, emissive: 0x22aa22 },
            sampling: { color: 0xffaa44, emissive: 0xaa6622 },
            geological: { color: 0xff4488, emissive: 0xaa2244 }
        };
        return configs[type] || { color: 0xffffff, emissive: 0x888888 };
    }

    createLabel(text, color) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.roundRect(0, 0, canvas.width, canvas.height, 8);
        context.fill();
        
        context.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
        context.lineWidth = 2;
        context.roundRect(0, 0, canvas.width, canvas.height, 8);
        context.stroke();
        
        context.font = 'bold 24px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#ffffff';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });
        
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(8, 2, 1);
        sprite.userData = { type: 'label', originalScale: sprite.scale.clone() };
        
        return sprite;
    }

    update(camera) {
        this.labels.forEach(({ label, group }) => {
            label.lookAt(camera.position);
            
            const distance = group.position.distanceTo(camera.position);
            const scale = Math.max(0.5, Math.min(2, distance / 30));
            label.scale.set(label.userData.originalScale.x * scale, 
                           label.userData.originalScale.y * scale, 
                           1);
        });
        
        this.points.forEach(group => {
            group.rotation.y += 0.005;
        });
    }

    handleClick(intersects) {
        for (const intersect of intersects) {
            if (intersect.object.userData && intersect.object.userData.type === 'dataPoint') {
                this.selectPoint(intersect.object.userData.pointData);
                return true;
            }
            if (intersect.object.parent && intersect.object.parent.userData && intersect.object.parent.userData.type === 'dataPoint') {
                this.selectPoint(intersect.object.parent.userData.pointData);
                return true;
            }
        }
        return false;
    }

    handleHover(intersects) {
        let hovered = null;
        
        for (const intersect of intersects) {
            if (intersect.object.userData && intersect.object.userData.type === 'dataPoint') {
                hovered = intersect.object.userData.pointData;
                break;
            }
            if (intersect.object.parent && intersect.object.parent.userData && intersect.object.parent.userData.type === 'dataPoint') {
                hovered = intersect.object.parent.userData.pointData;
                break;
            }
        }
        
        if (hovered !== this.hoveredPoint) {
            if (this.hoveredPoint) {
                this.setPointHighlight(this.hoveredPoint.id, false);
            }
            
            if (hovered) {
                this.setPointHighlight(hovered.id, true);
                document.body.style.cursor = 'pointer';
            } else {
                document.body.style.cursor = 'default';
            }
            
            this.hoveredPoint = hovered;
            
            if (this.onPointHover) {
                this.onPointHover(hovered);
            }
        }
        
        return hovered !== null;
    }

    selectPoint(pointData) {
        if (this.selectedPoint) {
            this.setPointHighlight(this.selectedPoint.id, false);
        }
        
        this.selectedPoint = pointData;
        this.setPointHighlight(pointData.id, true);
        
        if (this.onPointClick) {
            this.onPointClick(pointData);
        }
    }

    setPointHighlight(pointId, highlighted) {
        const group = this.points.find(g => g.name === pointId);
        if (group) {
            group.traverse(child => {
                if (child.isMesh && child.material && !child.userData.isClickable) {
                    if (highlighted) {
                        if (child.material.emissiveIntensity !== undefined) {
                            child.material.emissiveIntensity = 0.8;
                        }
                        child.scale.setScalar(1.2);
                    } else {
                        if (child.material.emissiveIntensity !== undefined) {
                            child.material.emissiveIntensity = child.material.emissive ? 0.3 : 0.2;
                        }
                        child.scale.setScalar(1);
                    }
                }
            });
        }
    }

    clearSelection() {
        if (this.selectedPoint) {
            this.setPointHighlight(this.selectedPoint.id, false);
            this.selectedPoint = null;
        }
    }

    getSelectedPoint() {
        return this.selectedPoint;
    }

    getAllPointMeshes() {
        const meshes = [];
        this.points.forEach(group => {
            group.traverse(child => {
                if (child.isMesh || child.isSprite) {
                    meshes.push(child);
                }
            });
        });
        return meshes;
    }

    getClickableMeshes() {
        const meshes = [];
        this.points.forEach(group => {
            group.traverse(child => {
                if (child.userData && child.userData.isClickable) {
                    meshes.push(child);
                }
            });
        });
        return meshes;
    }

    filterByType(type) {
        this.points.forEach(group => {
            const pointData = group.userData.pointData;
            group.visible = type === 'all' || pointData.type === type;
        });
    }

    showAll() {
        this.points.forEach(group => {
            group.visible = true;
        });
    }

    dispose() {
        this.points.forEach(group => {
            this.scene.remove(group);
            group.traverse(child => {
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
        });
        
        this.points = [];
        this.labels = [];
        this.selectedPoint = null;
        this.hoveredPoint = null;
    }
}
