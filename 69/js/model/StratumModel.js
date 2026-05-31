import { stratumData } from '../data/geologyData.js';
import { ModelConfig } from '../config/SceneConfig.js';
import { TextureMapper } from '../texture/TextureMapper.js';

export class StratumModel {
    constructor(scene) {
        this.scene = scene;
        this.textureMapper = new TextureMapper();
        this.stratumMeshes = [];
        this.edgeMeshes = [];
        this.sectionPlanes = {
            x: null,
            z: null
        };
        this.sectionMode = 'none';
        
        this.width = ModelConfig.stratum.width;
        this.depth = ModelConfig.stratum.depth;
    }

    build() {
        this.createSectionPlanes();
        
        stratumData.forEach((stratum, index) => {
            const stratumGroup = this.createStratumMesh(stratum, index);
            this.stratumMeshes.push(stratumGroup);
            this.scene.add(stratumGroup);
        });

        this.createGroundSurface();
    }

    createSectionPlanes() {
        this.sectionPlanes.x = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
        this.sectionPlanes.z = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    }

    createStratumMesh(stratum, index) {
        const group = new THREE.Group();
        group.name = stratum.id;
        group.userData = { type: 'stratum', stratumData: stratum };

        const height = stratum.thickness;
        const yCenter = stratum.topDepth - height / 2;

        const geometry = new THREE.BoxGeometry(this.width, height, this.depth, 1, 1, 1);
        const material = this.textureMapper.createStratumMaterial(stratum, true);
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = yCenter;
        mesh.userData = { type: 'stratum', stratumData: stratum };
        mesh.castShadow = index <= 2;
        mesh.receiveShadow = true;
        mesh.frustumCulled = true;
        group.add(mesh);

        if (index <= 3) {
            const edges = new THREE.EdgesGeometry(geometry);
            const edgeMaterial = this.textureMapper.createEdgeMaterial(
                ModelConfig.stratum.edgeColor,
                ModelConfig.stratum.edgeOpacity
            );
            const edgeLine = new THREE.LineSegments(edges, edgeMaterial);
            edgeLine.position.y = yCenter;
            group.add(edgeLine);
            this.edgeMeshes.push(edgeLine);
        }

        if (index === 0) {
            this.addTopSurfaceDetail(group, stratum);
        }

        return group;
    }

    addTopSurfaceDetail(group, stratum) {
        const terrainGeometry = new THREE.PlaneGeometry(this.width, this.depth, 20, 20);
        const positions = terrainGeometry.attributes.position;
        
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const z = positions.getY(i);
            const noise = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 0.5;
            positions.setZ(i, noise);
        }
        
        terrainGeometry.computeVertexNormals();
        
        const terrainMaterial = new THREE.MeshStandardMaterial({
            color: stratum.color,
            roughness: 0.9,
            metalness: 0.05,
            side: THREE.DoubleSide
        });
        
        const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
        terrain.rotation.x = -Math.PI / 2;
        terrain.position.y = 0.2;
        terrain.receiveShadow = true;
        group.add(terrain);
    }

    createGroundSurface() {
        const gridGeometry = new THREE.PlaneGeometry(this.width + 10, this.depth + 10, 1, 1);
        const gridMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d5a2d,
            roughness: 0.9,
            transparent: true,
            opacity: 0.6
        });
        
        const grid = new THREE.Mesh(gridGeometry, gridMaterial);
        grid.rotation.x = -Math.PI / 2;
        grid.position.y = 0.5;
        grid.receiveShadow = true;
        this.scene.add(grid);
    }

    setSectionMode(mode) {
        this.sectionMode = mode;
        
        this.stratumMeshes.forEach(group => {
            group.traverse(child => {
                if (child.isMesh && child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => {
                            this.applySectionPlanesToMaterial(mat, mode);
                        });
                    } else {
                        this.applySectionPlanesToMaterial(child.material, mode);
                    }
                }
            });
        });
    }

    applySectionPlanesToMaterial(material, mode) {
        material.clippingPlanes = [];
        
        switch (mode) {
            case 'x':
                material.clippingPlanes = [this.sectionPlanes.x];
                break;
            case 'z':
                material.clippingPlanes = [this.sectionPlanes.z];
                break;
            case 'both':
                material.clippingPlanes = [this.sectionPlanes.x, this.sectionPlanes.z];
                break;
            default:
                material.clippingPlanes = [];
        }
        
        material.clipShadows = mode !== 'none';
        material.needsUpdate = true;
    }

    setSectionPlanePosition(axis, position) {
        if (axis === 'x') {
            this.sectionPlanes.x.constant = -position;
        } else if (axis === 'z') {
            this.sectionPlanes.z.constant = -position;
        }
    }

    getStratumAtPosition(x, z) {
        const halfWidth = this.width / 2;
        const halfDepth = this.depth / 2;
        
        if (x < -halfWidth || x > halfWidth || z < -halfDepth || z > halfDepth) {
            return null;
        }
        
        return stratumData;
    }

    getStratumMeshes() {
        return this.stratumMeshes;
    }

    getAllMeshes() {
        const meshes = [];
        this.stratumMeshes.forEach(group => {
            group.traverse(child => {
                if (child.isMesh) {
                    meshes.push(child);
                }
            });
        });
        return meshes;
    }

    highlightStratum(stratumId) {
        this.stratumMeshes.forEach(group => {
            group.traverse(child => {
                if (child.isMesh && child.material) {
                    if (group.name === stratumId) {
                        child.material.emissive = new THREE.Color(0x333300);
                        child.material.emissiveIntensity = 0.3;
                    } else {
                        child.material.emissive = new THREE.Color(0x000000);
                        child.material.emissiveIntensity = 0;
                    }
                }
            });
        });
    }

    clearHighlight() {
        this.stratumMeshes.forEach(group => {
            group.traverse(child => {
                if (child.isMesh && child.material) {
                    child.material.emissive = new THREE.Color(0x000000);
                    child.material.emissiveIntensity = 0;
                }
            });
        });
    }

    setStratumOpacity(stratumId, opacity) {
        const group = this.stratumMeshes.find(g => g.name === stratumId);
        if (group) {
            group.traverse(child => {
                if (child.isMesh && child.material) {
                    child.material.opacity = opacity;
                    child.material.transparent = opacity < 1;
                    child.material.needsUpdate = true;
                }
            });
        }
    }

    setAllOpacity(opacity) {
        this.stratumMeshes.forEach(group => {
            group.traverse(child => {
                if (child.isMesh && child.material) {
                    child.material.opacity = opacity;
                    child.material.transparent = opacity < 1;
                    child.material.needsUpdate = true;
                }
            });
        });
    }

    toggleWireframe(show) {
        this.stratumMeshes.forEach(group => {
            group.traverse(child => {
                if (child.isMesh && child.material) {
                    child.material.wireframe = show;
                    child.material.needsUpdate = true;
                }
            });
        });
    }

    getBounds() {
        return {
            minX: -this.width / 2,
            maxX: this.width / 2,
            minZ: -this.depth / 2,
            maxZ: this.depth / 2,
            minY: stratumData[stratumData.length - 1].bottomDepth,
            maxY: 0
        };
    }

    dispose() {
        this.stratumMeshes.forEach(group => {
            group.traverse(child => {
                if (child.geometry) {
                    child.geometry.dispose();
                }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            this.scene.remove(group);
        });
        
        this.stratumMeshes = [];
        this.edgeMeshes = [];
        this.textureMapper.dispose();
    }
}
