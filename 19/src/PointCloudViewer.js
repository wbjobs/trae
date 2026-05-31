import * as THREE from 'three';
import { vertexShader, fragmentShader } from './shaders.js';
import { GPUClusterer } from './gpuClusterer.js';

export class PointCloudViewer {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        
        this.pointCloud = null;
        this.totalPoints = 0;
        this.clusterCount = 0;
        this.lodLevel = 0;
        
        this.clusterer = new GPUClusterer(renderer);
        this.clusterResults = null;
        
        this.hoveredClusterId = -1;
        this.colorScheme = 'original';
        this.pointSize = 1.5;
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.api = null;
        this.filename = null;
        
        this._setupEventListeners();
    }
    
    _setupEventListeners() {
        const canvas = this.renderer.domElement;
        
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            this._checkHover();
        });
    }
    
    _checkHover() {
        if (!this.pointCloud || !this.clusterResults) {
            return;
        }
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const mesh = this.pointCloud;
        const geometry = mesh.geometry;
        const positions = geometry.attributes.position;
        const clusterIds = geometry.attributes.clusterId;
        
        if (!clusterIds) {
            return;
        }
        
        const matrix = new THREE.Matrix4().multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );
        matrix.multiply(mesh.matrixWorld);
        
        let closestCluster = -1;
        let closestDist = Infinity;
        const threshold = 0.05;
        
        const step = Math.max(1, positions.count / 5000);
        
        for (let i = 0; i < positions.count; i += step) {
            const idx = Math.floor(i);
            
            const point = new THREE.Vector3(
                positions.getX(idx),
                positions.getY(idx),
                positions.getZ(idx)
            );
            
            point.applyMatrix4(mesh.matrixWorld);
            
            const projected = point.clone();
            projected.applyMatrix4(this.camera.projectionMatrix);
            projected.applyMatrix4(this.camera.matrixWorldInverse);
            projected.project(this.camera);
            
            const dx = projected.x - this.mouse.x;
            const dy = projected.y - this.mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < threshold && dist < closestDist) {
                closestDist = dist;
                closestCluster = clusterIds.getX(idx);
            }
        }
        
        this.hoveredClusterId = closestCluster;
        
        if (this.pointCloud && this.pointCloud.material) {
            this.pointCloud.material.uniforms.uHoveredClusterId.value = closestCluster;
        }
    }
    
    async loadFromAPI(api, filename) {
        this.api = api;
        this.filename = filename;
        
        const sampleData = await api.getSamplePoints(filename, 500000);
        await this.loadFromData(sampleData);
    }
    
    async loadFromData(data) {
        this._clear();
        
        const positions = new Float32Array(data.points.flat());
        const colors = data.colors ? 
            new Float32Array(data.colors.flat()) : 
            new Float32Array(data.points.length * 3).fill(0.7);
        
        const features = data.features ? 
            new Float32Array(data.features.flat()) : 
            new Float32Array(data.points.length).fill(0.5);
        
        this.totalPoints = data.count;
        this.lodLevel = 1;
        
        this._createPointCloud(positions, colors, features);
    }
    
    _createPointCloud(positions, colors, features) {
        const geometry = new THREE.BufferGeometry();
        const pointCount = positions.length / 3;
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('originalColor', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('featureValue', new THREE.BufferAttribute(features, 1));
        geometry.setAttribute('clusterId', new THREE.BufferAttribute(
            new Float32Array(pointCount).fill(0), 1
        ));
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                pointSize: { value: this.pointSize },
                uTime: { value: 0 },
                uHoveredClusterId: { value: -1.0 },
                uColorScheme: { value: 3 },
                uModelMatrix: { value: new THREE.Matrix4() }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        this.pointCloud = new THREE.Points(geometry, material);
        this.scene.add(this.pointCloud);
        
        this._fitCameraToPoints(positions);
    }
    
    _fitCameraToPoints(positions) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.computeBoundingBox();
        
        const box = geometry.boundingBox;
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        
        box.getCenter(center);
        box.getSize(size);
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 2;
        
        this.camera.position.set(center.x, center.y, center.z + cameraZ);
        this.camera.lookAt(center);
        
        if (this.pointCloud) {
            this.pointCloud.position.sub(center);
        }
    }
    
    async runClustering(options = {}) {
        if (!this.pointCloud) {
            throw new Error('请先加载点云');
        }
        
        const { algorithm = 'kmeans', k = 5 } = options;
        const positions = this.pointCloud.geometry.attributes.position.array;
        
        console.log(`开始${algorithm}聚类，K=${k}`);
        console.time('clustering');
        
        let result;
        
        if (algorithm === 'kmeans') {
            result = await this.clusterer.kmeans(positions, k, 20);
        } else {
            result = await this._dbscanScreening(positions);
        }
        
        console.timeEnd('clustering');
        
        this.clusterResults = result;
        this.clusterCount = result.k;
        
        const clusterIds = new Float32Array(result.labels);
        this.pointCloud.geometry.setAttribute(
            'clusterId',
            new THREE.BufferAttribute(clusterIds, 1)
        );
        
        const features = new Float32Array(result.labels.length);
        const minLabel = Math.min(...result.labels);
        const maxLabel = Math.max(...result.labels);
        const range = maxLabel - minLabel || 1;
        
        for (let i = 0; i < result.labels.length; i++) {
            features[i] = (result.labels[i] - minLabel) / range;
        }
        
        this.pointCloud.geometry.setAttribute(
            'featureValue',
            new THREE.BufferAttribute(features, 1)
        );
        
        this.pointCloud.geometry.attributes.clusterId.needsUpdate = true;
        this.pointCloud.geometry.attributes.featureValue.needsUpdate = true;
        
        this.setColorScheme('cluster');
    }
    
    async _dbscanScreening(positions) {
        const labels = new Int32Array(positions.length / 3);
        let clusterId = 0;
        const visited = new Set();
        
        const sampleRate = 0.1;
        const sampleCount = Math.floor(positions.length / 3 * sampleRate);
        const sampleIndices = [];
        
        for (let i = 0; i < sampleCount; i++) {
            sampleIndices.push(Math.floor(Math.random() * (positions.length / 3)));
        }
        
        const eps = this._estimateEps(positions, sampleIndices);
        const minPts = 10;
        
        for (const i of sampleIndices) {
            if (visited.has(i)) continue;
            
            visited.add(i);
            
            const neighbors = this._findNeighbors(positions, i, eps, sampleIndices);
            
            if (neighbors.length >= minPts) {
                this._expandCluster(
                    positions, i, neighbors, clusterId, labels, visited, eps, minPts, sampleIndices
                );
                clusterId++;
            }
        }
        
        const fullLabels = new Int32Array(positions.length / 3);
        const pos3 = new Float32Array(positions);
        
        for (let i = 0; i < fullLabels.length; i++) {
            if (i < sampleIndices.length) {
                fullLabels[i] = labels[sampleIndices.indexOf(i)];
            } else {
                const px = pos3[i * 3];
                const py = pos3[i * 3 + 1];
                const pz = pos3[i * 3 + 2];
                
                let minDist = Infinity;
                let nearestCluster = -1;
                
                for (const s of sampleIndices) {
                    const sx = pos3[s * 3];
                    const sy = pos3[s * 3 + 1];
                    const sz = pos3[s * 3 + 2];
                    
                    const dx = px - sx;
                    const dy = py - sy;
                    const dz = pz - sz;
                    const dist = dx * dx + dy * dy + dz * dz;
                    
                    if (dist < minDist) {
                        minDist = dist;
                        nearestCluster = labels[sampleIndices.indexOf(s)];
                    }
                }
                
                fullLabels[i] = nearestCluster;
            }
        }
        
        return {
            labels: Array.from(fullLabels),
            k: clusterId,
            centroids: []
        };
    }
    
    _estimateEps(positions, sampleIndices) {
        const pos3 = new Float32Array(positions);
        const distances = [];
        
        for (const i of sampleIndices) {
            const px = pos3[i * 3];
            const py = pos3[i * 3 + 1];
            const pz = pos3[i * 3 + 2];
            
            let minDist = Infinity;
            for (const j of sampleIndices) {
                if (i === j) continue;
                
                const dx = px - pos3[j * 3];
                const dy = py - pos3[j * 3 + 1];
                const dz = pz - pos3[j * 3 + 2];
                const dist = dx * dx + dy * dy + dz * dz;
                
                if (dist < minDist) minDist = dist;
            }
            distances.push(Math.sqrt(minDist));
        }
        
        distances.sort((a, b) => a - b);
        const percentile = distances[Math.floor(distances.length * 0.9)];
        return percentile * 2;
    }
    
    _findNeighbors(positions, idx, eps, sampleIndices) {
        const pos3 = new Float32Array(positions);
        const px = pos3[idx * 3];
        const py = pos3[idx * 3 + 1];
        const pz = pos3[idx * 3 + 2];
        const epsSq = eps * eps;
        
        const neighbors = [];
        for (const s of sampleIndices) {
            const dx = px - pos3[s * 3];
            const dy = py - pos3[s * 3 + 1];
            const dz = pz - pos3[s * 3 + 2];
            const distSq = dx * dx + dy * dy + dz * dz;
            
            if (distSq <= epsSq) {
                neighbors.push(s);
            }
        }
        
        return neighbors;
    }
    
    _expandCluster(positions, idx, neighbors, clusterId, labels, visited, eps, minPts, sampleIndices) {
        const queue = [...neighbors];
        
        while (queue.length > 0) {
            const current = queue.shift();
            
            if (!visited.has(current)) {
                visited.add(current);
                
                const currentNeighbors = this._findNeighbors(positions, current, eps, sampleIndices);
                
                if (currentNeighbors.length >= minPts) {
                    for (const n of currentNeighbors) {
                        if (!visited.has(n)) {
                            queue.push(n);
                        }
                    }
                }
            }
            
            labels[current] = clusterId;
        }
    }
    
    setPointSize(size) {
        this.pointSize = size;
        if (this.pointCloud && this.pointCloud.material) {
            this.pointCloud.material.uniforms.pointSize.value = size;
        }
    }
    
    setColorScheme(scheme) {
        this.colorScheme = scheme;
        if (!this.pointCloud || !this.pointCloud.material) return;
        
        let schemeValue;
        switch (scheme) {
            case 'heatmap': schemeValue = 0; break;
            case 'height': schemeValue = 1; break;
            case 'cluster': schemeValue = 2; break;
            default: schemeValue = 3;
        }
        
        this.pointCloud.material.uniforms.uColorScheme.value = schemeValue;
        
        if (scheme === 'height' && this.pointCloud) {
            const positions = this.pointCloud.geometry.attributes.position.array;
            const features = new Float32Array(positions.length / 3);
            
            let minY = Infinity, maxY = -Infinity;
            for (let i = 0; i < positions.length; i += 3) {
                const y = positions[i + 1];
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
            
            const range = maxY - minY || 1;
            for (let i = 0; i < features.length; i++) {
                features[i] = (positions[i * 3 + 1] - minY) / range;
            }
            
            this.pointCloud.geometry.setAttribute(
                'featureValue',
                new THREE.BufferAttribute(features, 1)
            );
            this.pointCloud.geometry.attributes.featureValue.needsUpdate = true;
        }
    }
    
    update() {
        if (this.pointCloud && this.pointCloud.material) {
            this.pointCloud.material.uniforms.uTime.value += 0.01;
        }
    }
    
    _clear() {
        if (this.pointCloud) {
            this.scene.remove(this.pointCloud);
            this.pointCloud.geometry.dispose();
            this.pointCloud.material.dispose();
            this.pointCloud = null;
        }
        
        this.clusterResults = null;
        this.clusterCount = 0;
        this.totalPoints = 0;
    }
    
    dispose() {
        this._clear();
        this.clusterer.dispose();
    }
}
