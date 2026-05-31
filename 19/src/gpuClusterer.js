import * as THREE from 'three';
import { gpuClusterVertexShader, gpuClusterFragmentShader } from './shaders.js';

export class GPUClusterer {
    constructor(renderer) {
        this.renderer = renderer;
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }
    
    async kmeans(positions, k, maxIterations = 20) {
        const pointCount = positions.length / 3;
        const positionsArray = new Float32Array(positions);
        
        let centroids = this._initializeCentroids(positionsArray, k);
        
        for (let iter = 0; iter < maxIterations; iter++) {
            const labels = this._assignClusters(positionsArray, centroids, k);
            const newCentroids = this._updateCentroids(positionsArray, labels, k);
            
            const maxShift = this._calculateMaxShift(centroids, newCentroids);
            
            centroids = newCentroids;
            
            if (maxShift < 0.001) {
                console.log(`Converged after ${iter + 1} iterations`);
                break;
            }
        }
        
        const labels = this._assignClusters(positionsArray, centroids, k);
        
        return {
            labels: Array.from(labels),
            centroids: centroids.map(c => [c.x, c.y, c.z]),
            k
        };
    }
    
    _initializeCentroids(positions, k) {
        const pointCount = positions.length / 3;
        const centroids = [];
        
        const firstIdx = Math.floor(Math.random() * pointCount);
        centroids.push(new THREE.Vector3(
            positions[firstIdx * 3],
            positions[firstIdx * 3 + 1],
            positions[firstIdx * 3 + 2]
        ));
        
        const distances = new Float32Array(pointCount);
        
        for (let i = 1; i < k; i++) {
            let totalDist = 0;
            
            for (let j = 0; j < pointCount; j++) {
                const px = positions[j * 3];
                const py = positions[j * 3 + 1];
                const pz = positions[j * 3 + 2];
                
                let minDist = Infinity;
                for (const centroid of centroids) {
                    const dx = px - centroid.x;
                    const dy = py - centroid.y;
                    const dz = pz - centroid.z;
                    minDist = Math.min(minDist, dx * dx + dy * dy + dz * dz);
                }
                
                distances[j] = minDist;
                totalDist += minDist;
            }
            
            let target = Math.random() * totalDist;
            let selectedIdx = 0;
            
            for (let j = 0; j < pointCount; j++) {
                target -= distances[j];
                if (target <= 0) {
                    selectedIdx = j;
                    break;
                }
            }
            
            centroids.push(new THREE.Vector3(
                positions[selectedIdx * 3],
                positions[selectedIdx * 3 + 1],
                positions[selectedIdx * 3 + 2]
            ));
        }
        
        return centroids;
    }
    
    _assignClusters(positions, centroids, k) {
        const pointCount = positions.length / 3;
        const labels = new Int32Array(pointCount);
        
        for (let i = 0; i < pointCount; i++) {
            const px = positions[i * 3];
            const py = positions[i * 3 + 1];
            const pz = positions[i * 3 + 2];
            
            let minDist = Infinity;
            let closestCluster = 0;
            
            for (let j = 0; j < centroids.length; j++) {
                const dx = px - centroids[j].x;
                const dy = py - centroids[j].y;
                const dz = pz - centroids[j].z;
                const dist = dx * dx + dy * dy + dz * dz;
                
                if (dist < minDist) {
                    minDist = dist;
                    closestCluster = j;
                }
            }
            
            labels[i] = closestCluster;
        }
        
        return labels;
    }
    
    _updateCentroids(positions, labels, k) {
        const pointCount = positions.length / 3;
        const newCentroids = [];
        const counts = new Int32Array(k);
        const sums = new Array(k).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));
        
        for (let i = 0; i < pointCount; i++) {
            const cluster = labels[i];
            sums[cluster].x += positions[i * 3];
            sums[cluster].y += positions[i * 3 + 1];
            sums[cluster].z += positions[i * 3 + 2];
            counts[cluster]++;
        }
        
        for (let i = 0; i < k; i++) {
            if (counts[i] > 0) {
                newCentroids.push(new THREE.Vector3(
                    sums[i].x / counts[i],
                    sums[i].y / counts[i],
                    sums[i].z / counts[i]
                ));
            } else {
                const idx = Math.floor(Math.random() * pointCount);
                newCentroids.push(new THREE.Vector3(
                    positions[idx * 3],
                    positions[idx * 3 + 1],
                    positions[idx * 3 + 2]
                ));
            }
        }
        
        return newCentroids;
    }
    
    _calculateMaxShift(oldCentroids, newCentroids) {
        let maxShift = 0;
        
        for (let i = 0; i < oldCentroids.length; i++) {
            const shift = oldCentroids[i].distanceTo(newCentroids[i]);
            maxShift = Math.max(maxShift, shift);
        }
        
        return maxShift;
    }
    
    dispose() {
    }
}
