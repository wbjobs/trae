import { PathConfig } from '../config/FeatureConfig.js';

export class ExplorationPath {
    constructor(scene, camera, container) {
        this.scene = scene;
        this.camera = camera;
        this.container = container;
        
        this.pathGroup = null;
        this.points = [];
        this.lineMesh = null;
        this.pointMeshes = [];
        
        this.isDrawing = false;
        this.isVisible = false;
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.5);
        this.intersectPoint = new THREE.Vector3();
        
        this.hoverMarker = null;
        
        this.onPathComplete = null;
        this.onPointAdded = null;
    }

    build() {
        this.pathGroup = new THREE.Group();
        this.pathGroup.name = 'explorationPath';
        this.scene.add(this.pathGroup);
        this.hide();
        
        this.createHoverMarker();
    }

    createHoverMarker() {
        const geometry = new THREE.RingGeometry(0.5, 0.8, 16);
        const material = new THREE.MeshBasicMaterial({
            color: PathConfig.pointColor,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        
        this.hoverMarker = new THREE.Mesh(geometry, material);
        this.hoverMarker.rotation.x = -Math.PI / 2;
        this.hoverMarker.visible = false;
        this.pathGroup.add(this.hoverMarker);
    }

    startDrawing() {
        this.isDrawing = true;
        this.show();
        this.clear();
        document.body.style.cursor = 'crosshair';
    }

    stopDrawing() {
        this.isDrawing = false;
        document.body.style.cursor = 'default';
        
        if (this.points.length >= 2 && this.onPathComplete) {
            this.onPathComplete(this.getPathData());
        }
    }

    toggleDrawing() {
        if (this.isDrawing) {
            this.stopDrawing();
        } else {
            this.startDrawing();
        }
        return this.isDrawing;
    }

    handleMouseMove(event) {
        if (!this.isDrawing) return;
        
        const intersects = this.getIntersection(event);
        if (intersects && this.hoverMarker) {
            const snappedPoint = this.snapToGrid(intersects);
            this.hoverMarker.position.set(snappedPoint.x, 0.6, snappedPoint.z);
            this.hoverMarker.visible = true;
            this.hoverMarker.rotation.z += 0.02;
        } else if (this.hoverMarker) {
            this.hoverMarker.visible = false;
        }
    }

    handleClick(event) {
        if (!this.isDrawing) return false;
        
        const intersects = this.getIntersection(event);
        if (intersects) {
            const snappedPoint = this.snapToGrid(intersects);
            this.addPoint(snappedPoint.x, snappedPoint.z);
            return true;
        }
        return false;
    }

    getIntersection(event) {
        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const intersected = this.raycaster.ray.intersectPlane(this.groundPlane, this.intersectPoint);
        return intersected ? this.intersectPoint.clone() : null;
    }

    snapToGrid(point) {
        if (!PathConfig.snapToGrid) return point;
        
        const gridSize = PathConfig.gridSize;
        return {
            x: Math.round(point.x / gridSize) * gridSize,
            z: Math.round(point.z / gridSize) * gridSize
        };
    }

    addPoint(x, z) {
        if (this.points.length >= PathConfig.maxPoints) return;
        
        const pointData = { x, z, y: 0.5 };
        this.points.push(pointData);
        
        this.createPointMesh(pointData);
        this.updateLine();
        
        if (this.onPointAdded) {
            this.onPointAdded(pointData, this.points.length);
        }
    }

    createPointMesh(pointData, isActive = false) {
        const group = new THREE.Group();
        group.position.set(pointData.x, pointData.y, pointData.z);
        
        const geometry = new THREE.SphereGeometry(PathConfig.pointSize, 16, 16);
        const material = new THREE.MeshStandardMaterial({
            color: isActive ? PathConfig.activePointColor : PathConfig.pointColor,
            emissive: isActive ? PathConfig.activePointColor : PathConfig.pointColor,
            emissiveIntensity: 0.5,
            metalness: 0.3,
            roughness: 0.5
        });
        
        const sphere = new THREE.Mesh(geometry, material);
        group.add(sphere);
        
        const ringGeometry = new THREE.RingGeometry(
            PathConfig.pointSize + 0.3, 
            PathConfig.pointSize + 0.5, 
            16
        );
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: isActive ? PathConfig.activePointColor : PathConfig.pointColor,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.05;
        group.add(ring);
        
        const label = this.createPointLabel(this.points.length);
        label.position.y = PathConfig.pointSize + 1;
        group.add(label);
        
        group.userData = { pointData, index: this.points.length - 1 };
        this.pointMeshes.push(group);
        this.pathGroup.add(group);
        
        return group;
    }

    createPointLabel(index) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 64;
        canvas.height = 32;
        
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.roundRect(0, 0, canvas.width, canvas.height, 4);
        context.fill();
        
        context.font = 'bold 16px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#ffffff';
        context.fillText(`P${index + 1}`, canvas.width / 2, canvas.height / 2);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });
        
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(2, 1, 1);
        
        return sprite;
    }

    updateLine() {
        if (this.points.length < 2) {
            if (this.lineMesh) {
                this.pathGroup.remove(this.lineMesh);
                this.lineMesh.geometry.dispose();
                this.lineMesh.material.dispose();
                this.lineMesh = null;
            }
            return;
        }
        
        const positions = [];
        this.points.forEach(point => {
            positions.push(point.x, point.y, point.z);
        });
        
        if (!this.lineMesh) {
            const geometry = new THREE.BufferGeometry();
            const material = new THREE.LineBasicMaterial({
                color: PathConfig.lineColor,
                linewidth: PathConfig.lineWidth,
                transparent: true,
                opacity: 0.8
            });
            
            this.lineMesh = new THREE.Line(geometry, material);
            this.pathGroup.add(this.lineMesh);
        }
        
        this.lineMesh.geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        );
        this.lineMesh.geometry.computeBoundingSphere();
    }

    clear() {
        this.points = [];
        
        this.pointMeshes.forEach(mesh => {
            this.pathGroup.remove(mesh);
            mesh.traverse(child => {
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
        this.pointMeshes = [];
        
        if (this.lineMesh) {
            this.pathGroup.remove(this.lineMesh);
            this.lineMesh.geometry.dispose();
            this.lineMesh.material.dispose();
            this.lineMesh = null;
        }
    }

    undo() {
        if (this.points.length === 0) return;
        
        this.points.pop();
        
        const lastMesh = this.pointMeshes.pop();
        if (lastMesh) {
            this.pathGroup.remove(lastMesh);
            lastMesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
        
        this.updateLine();
    }

    show() {
        this.isVisible = true;
        if (this.pathGroup) {
            this.pathGroup.visible = true;
        }
    }

    hide() {
        this.isVisible = false;
        if (this.pathGroup) {
            this.pathGroup.visible = false;
        }
        if (this.hoverMarker) {
            this.hoverMarker.visible = false;
        }
        if (this.isDrawing) {
            this.stopDrawing();
        }
    }

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
        return this.isVisible;
    }

    getPathData() {
        const totalDistance = this.calculateTotalDistance();
        const segments = [];
        
        for (let i = 1; i < this.points.length; i++) {
            const p1 = this.points[i - 1];
            const p2 = this.points[i];
            const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            segments.push({
                from: i,
                to: i + 1,
                distance: Math.sqrt(dx * dx + dz * dz),
                startPoint: p1,
                endPoint: p2
            });
        }
        
        return {
            points: this.points.map((p, i) => ({ ...p, index: i + 1 })),
            segments,
            totalDistance,
            pointCount: this.points.length
        };
    }

    calculateTotalDistance() {
        let distance = 0;
        for (let i = 1; i < this.points.length; i++) {
            const p1 = this.points[i - 1];
            const p2 = this.points[i];
            const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            distance += Math.sqrt(dx * dx + dz * dz);
        }
        return distance;
    }

    loadPath(pathData) {
        this.clear();
        this.show();
        
        pathData.points.forEach(point => {
            this.addPoint(point.x, point.z);
        });
    }

    exportPath() {
        return JSON.stringify(this.getPathData(), null, 2);
    }

    update(deltaTime) {
        if (!this.pathGroup || !this.pathGroup.visible) return;
        
        this.pointMeshes.forEach((mesh, index) => {
            const time = Date.now() * 0.002 + index * 0.5;
            const bob = Math.sin(time) * 0.1;
            mesh.position.y = 0.5 + bob;
        });
    }

    isInDrawingMode() {
        return this.isDrawing;
    }

    getAllMeshes() {
        const meshes = [];
        if (this.pathGroup) {
            this.pathGroup.traverse(child => {
                if (child.isMesh || child.isSprite || child.isLine) {
                    meshes.push(child);
                }
            });
        }
        return meshes;
    }

    dispose() {
        this.clear();
        
        if (this.hoverMarker) {
            this.hoverMarker.geometry.dispose();
            this.hoverMarker.material.dispose();
        }
        
        if (this.pathGroup) {
            this.scene.remove(this.pathGroup);
        }
        
        this.pathGroup = null;
        this.lineMesh = null;
        this.hoverMarker = null;
        this.pointMeshes = [];
        this.points = [];
    }
}
