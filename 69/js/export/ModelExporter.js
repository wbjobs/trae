import { ExportConfig } from '../config/FeatureConfig.js';

export class ModelExporter {
    constructor() {
        this.supportedFormats = ExportConfig.formats;
        this.defaultFormat = ExportConfig.defaultFormat;
    }

    exportStratumModel(stratumModel, options = {}) {
        const format = options.format || this.defaultFormat;
        const includeTextures = options.includeTextures !== false;
        const lightweight = options.lightweight || false;
        
        const exportData = {
            metadata: {
                version: '1.0',
                format: format,
                exportedAt: new Date().toISOString(),
                type: 'geology_stratum_model'
            },
            model: this.extractModelData(stratumModel, lightweight)
        };
        
        switch (format) {
            case 'json':
                return this.exportJSON(exportData, options);
            case 'obj':
                return this.exportOBJ(stratumModel, options);
            case 'glb':
                return this.exportGLB(stratumModel, options);
            default:
                return this.exportJSON(exportData, options);
        }
    }

    extractModelData(stratumModel, lightweight) {
        const meshes = stratumModel.getAllMeshes();
        const data = {
            bounds: stratumModel.getBounds(),
            strata: []
        };
        
        stratumModel.stratumMeshes.forEach(group => {
            if (!group.userData || !group.userData.stratumData) return;
            
            const stratumData = group.userData.stratumData;
            const stratumExport = {
                id: stratumData.id,
                name: stratumData.name,
                nameEn: stratumData.nameEn,
                color: stratumData.color,
                topDepth: stratumData.topDepth,
                bottomDepth: stratumData.bottomDepth,
                thickness: stratumData.thickness,
                description: stratumData.description,
                properties: stratumData.properties
            };
            
            if (!lightweight) {
                group.traverse(child => {
                    if (child.isMesh && child.geometry) {
                        stratumExport.geometry = this.extractGeometryData(child.geometry);
                        if (child.material) {
                            stratumExport.material = this.extractMaterialData(child.material);
                        }
                    }
                });
            }
            
            data.strata.push(stratumExport);
        });
        
        return data;
    }

    extractGeometryData(geometry) {
        const data = {
            type: geometry.type,
            parameters: {}
        };
        
        if (geometry.parameters) {
            data.parameters = { ...geometry.parameters };
        }
        
        if (geometry.attributes) {
            data.vertexCount = geometry.attributes.position?.count || 0;
        }
        
        if (geometry.boundingBox) {
            data.boundingBox = {
                min: geometry.boundingBox.min.toArray(),
                max: geometry.boundingBox.max.toArray()
            };
        }
        
        return data;
    }

    extractMaterialData(material) {
        const data = {
            type: material.type,
            color: material.color ? material.color.getHex() : 0xffffff,
            opacity: material.opacity,
            transparent: material.transparent
        };
        
        if (material.map) {
            data.hasTexture = true;
        }
        
        if (material.roughness !== undefined) {
            data.roughness = material.roughness;
        }
        if (material.metalness !== undefined) {
            data.metalness = material.metalness;
        }
        
        return data;
    }

    exportJSON(data, options) {
        const jsonString = JSON.stringify(data, null, options.pretty ? 2 : 0);
        
        if (options.download) {
            this.downloadFile(jsonString, 'geology_model.json', 'application/json');
        }
        
        return jsonString;
    }

    exportOBJ(stratumModel, options) {
        let objContent = '# Geology Stratum Model OBJ Export\n';
        objContent += `# Generated: ${new Date().toISOString()}\n\n`;
        
        let vertexOffset = 1;
        let objectIndex = 1;
        
        stratumModel.stratumMeshes.forEach(group => {
            if (!group.userData || !group.userData.stratumData) return;
            
            const stratumData = group.userData.stratumData;
            objContent += `g ${stratumData.nameEn.replace(/\s+/g, '_')}\n`;
            objContent += `o stratum_${objectIndex}\n\n`;
            
            group.traverse(child => {
                if (child.isMesh && child.geometry) {
                    const vertices = this.extractVertices(child);
                    const faces = this.extractFaces(child, vertexOffset);
                    
                    vertices.forEach(v => {
                        objContent += `v ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}\n`;
                    });
                    objContent += '\n';
                    
                    faces.forEach(f => {
                        objContent += `f ${f.a} ${f.b} ${f.c}\n`;
                    });
                    objContent += '\n';
                    
                    vertexOffset += vertices.length;
                }
            });
            
            objectIndex++;
        });
        
        if (options.download) {
            this.downloadFile(objContent, 'geology_model.obj', 'text/plain');
        }
        
        return objContent;
    }

    extractVertices(mesh) {
        const vertices = [];
        const geometry = mesh.geometry;
        const positionAttribute = geometry.attributes.position;
        
        if (!positionAttribute) return vertices;
        
        const matrix = mesh.matrixWorld;
        
        for (let i = 0; i < positionAttribute.count; i++) {
            const vertex = new THREE.Vector3(
                positionAttribute.getX(i),
                positionAttribute.getY(i),
                positionAttribute.getZ(i)
            );
            vertex.applyMatrix4(matrix);
            vertices.push(vertex);
        }
        
        return vertices;
    }

    extractFaces(mesh, vertexOffset) {
        const faces = [];
        const geometry = mesh.geometry;
        
        if (geometry.index) {
            const indices = geometry.index.array;
            for (let i = 0; i < indices.length; i += 3) {
                faces.push({
                    a: indices[i] + vertexOffset,
                    b: indices[i + 1] + vertexOffset,
                    c: indices[i + 2] + vertexOffset
                });
            }
        } else {
            const positionCount = geometry.attributes.position?.count || 0;
            for (let i = 0; i < positionCount; i += 3) {
                faces.push({
                    a: i + vertexOffset,
                    b: i + 1 + vertexOffset,
                    c: i + 2 + vertexOffset
                });
            }
        }
        
        return faces;
    }

    exportGLB(stratumModel, options) {
        const jsonData = this.exportStratumModel(stratumModel, {
            ...options,
            format: 'json',
            download: false
        });
        
        const glbData = {
            ...JSON.parse(jsonData),
            binary: null
        };
        
        const glbString = JSON.stringify(glbData, null, options.pretty ? 2 : 0);
        
        if (options.download) {
            this.downloadFile(glbString, 'geology_model.glb', 'application/octet-stream');
        }
        
        return glbString;
    }

    exportDrillData(drillingInteraction, options = {}) {
        const results = drillingInteraction.getDrillResults();
        
        const data = {
            metadata: {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                type: 'drilling_data'
            },
            drillHoles: results
        };
        
        const format = options.format || 'json';
        
        if (format === 'json') {
            const jsonString = JSON.stringify(data, null, options.pretty ? 2 : 0);
            if (options.download) {
                this.downloadFile(jsonString, 'drilling_data.json', 'application/json');
            }
            return jsonString;
        }
        
        if (format === 'csv') {
            const csv = this.drillDataToCSV(results);
            if (options.download) {
                this.downloadFile(csv, 'drilling_data.csv', 'text/csv');
            }
            return csv;
        }
        
        return data;
    }

    drillDataToCSV(results) {
        let csv = '钻孔ID,X坐标,Z坐标,总深度(m),钻进时间\n';
        
        results.forEach(drill => {
            csv += `${drill.id},${drill.x.toFixed(2)},${drill.z.toFixed(2)},${drill.totalDepth.toFixed(2)},"${drill.timestamp}"\n`;
        });
        
        csv += '\n地层详情:\n';
        csv += '钻孔ID,地层名称,英文名称,层顶深度(m),层底深度(m),厚度(m)\n';
        
        results.forEach(drill => {
            drill.strata.forEach(stratum => {
                csv += `${drill.id},"${stratum.name}","${stratum.nameEn}",${stratum.topDepth},${stratum.bottomDepth},${stratum.thickness}\n`;
            });
        });
        
        return csv;
    }

    exportPathData(explorationPath, options = {}) {
        const pathData = explorationPath.getPathData();
        
        const data = {
            metadata: {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                type: 'exploration_path'
            },
            ...pathData
        };
        
        const format = options.format || 'json';
        
        if (format === 'json') {
            const jsonString = JSON.stringify(data, null, options.pretty ? 2 : 0);
            if (options.download) {
                this.downloadFile(jsonString, 'exploration_path.json', 'application/json');
            }
            return jsonString;
        }
        
        if (format === 'csv') {
            const csv = this.pathDataToCSV(pathData);
            if (options.download) {
                this.downloadFile(csv, 'exploration_path.csv', 'text/csv');
            }
            return csv;
        }
        
        return data;
    }

    pathDataToCSV(pathData) {
        let csv = '点号,X坐标,Y坐标,Z坐标\n';
        
        pathData.points.forEach(point => {
            csv += `${point.index},${point.x.toFixed(2)},${point.y.toFixed(2)},${point.z.toFixed(2)}\n`;
        });
        
        csv += '\n路段详情:\n';
        csv += '路段,起点,终点,距离(m)\n';
        
        pathData.segments.forEach(seg => {
            csv += `${seg.from}-${seg.to},${seg.from},${seg.to},${seg.distance.toFixed(2)}\n`;
        });
        
        csv += `\n总距离,${pathData.totalDistance.toFixed(2)}m\n`;
        
        return csv;
    }

    exportAll(stratumModel, drillingInteraction, explorationPath, options = {}) {
        const data = {
            metadata: {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                type: 'geology_project'
            },
            stratumModel: this.extractModelData(stratumModel, options.lightweight),
            drillData: drillingInteraction ? drillingInteraction.getDrillResults() : [],
            explorationPath: explorationPath ? explorationPath.getPathData() : null
        };
        
        const jsonString = JSON.stringify(data, null, options.pretty ? 2 : 0);
        
        if (options.download) {
            this.downloadFile(jsonString, 'geology_project.json', 'application/json');
        }
        
        return jsonString;
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
    }

    getSupportedFormats() {
        return this.supportedFormats;
    }

    validateFormat(format) {
        return this.supportedFormats.includes(format);
    }
}
