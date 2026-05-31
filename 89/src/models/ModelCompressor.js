import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

class ModelCompressor {
  constructor() {
    this.compressionStats = new Map();
    this.geometryCache = new Map();
  }

  compressGeometry(geometry, options = {}) {
    const {
      tolerance = 0.001,
      targetVertexCount = null,
      preserveTextureCoords = true,
      preserveNormals = true,
      mergeVertices = true,
    } = options;

    const stats = {
      originalVertices: geometry.attributes.position?.count || 0,
      originalIndices: geometry.index?.count || 0,
      compressedVertices: 0,
      compressedIndices: 0,
      compressionRatio: 0,
      time: 0,
    };

    const startTime = performance.now();

    let compressedGeometry = geometry.clone();

    if (mergeVertices && compressedGeometry.attributes.position) {
      compressedGeometry = this.mergeVertices(compressedGeometry, tolerance);
    }

    if (targetVertexCount && targetVertexCount > 0) {
      compressedGeometry = this.simplifyGeometry(compressedGeometry, targetVertexCount);
    }

    if (!preserveNormals && compressedGeometry.attributes.normal) {
      compressedGeometry.deleteAttribute('normal');
    }

    if (!preserveTextureCoords && compressedGeometry.attributes.uv) {
      compressedGeometry.deleteAttribute('uv');
    }

    compressedGeometry = this.compressAttributes(compressedGeometry);

    stats.compressedVertices = compressedGeometry.attributes.position?.count || 0;
    stats.compressedIndices = compressedGeometry.index?.count || 0;
    stats.compressionRatio = stats.originalVertices > 0
      ? (1 - stats.compressedVertices / stats.originalVertices) * 100
      : 0;
    stats.time = performance.now() - startTime;

    const id = this.generateGeometryId(geometry);
    this.compressionStats.set(id, stats);

    return {
      geometry: compressedGeometry,
      stats: stats,
    };
  }

  mergeVertices(geometry, tolerance = 0.001) {
    if (!geometry.attributes.position) return geometry;

    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal?.array;
    const uvs = geometry.attributes.uv?.array;

    const vertexMap = new Map();
    const newIndices = [];
    const newPositions = [];
    const newNormals = normals ? [] : null;
    const newUvs = uvs ? [] : null;

    const toleranceSquared = tolerance * tolerance;

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];

      let found = false;
      let existingIndex = -1;

      for (const [key, index] of vertexMap.entries()) {
        const [ex, ey, ez] = key.split(',').map(Number);
        const distSq = (x - ex) ** 2 + (y - ey) ** 2 + (z - ez) ** 2;

        if (distSq < toleranceSquared) {
          found = true;
          existingIndex = index;
          break;
        }
      }

      if (found) {
        newIndices.push(existingIndex);
      } else {
        const newIndex = Math.floor(newPositions.length / 3);
        const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
        vertexMap.set(key, newIndex);

        newPositions.push(x, y, z);
        newIndices.push(newIndex);

        if (newNormals && normals) {
          newNormals.push(normals[i], normals[i + 1], normals[i + 2]);
        }

        if (newUvs && uvs) {
          const uvIndex = Math.floor(i / 3) * 2;
          newUvs.push(uvs[uvIndex], uvs[uvIndex + 1]);
        }
      }
    }

    const compressedGeometry = new THREE.BufferGeometry();
    compressedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));

    if (newNormals) {
      compressedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    }

    if (newUvs) {
      compressedGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
    }

    compressedGeometry.setIndex(newIndices);

    return compressedGeometry;
  }

  simplifyGeometry(geometry, targetVertexCount) {
    if (!geometry.index || !geometry.attributes.position) return geometry;

    const positions = geometry.attributes.position.array;
    const indices = geometry.index.array;
    const vertexCount = positions.length / 3;

    if (vertexCount <= targetVertexCount) return geometry;

    const vertices = [];
    for (let i = 0; i < vertexCount; i++) {
      vertices.push({
        x: positions[i * 3],
        y: positions[i * 3 + 1],
        z: positions[i * 3 + 2],
        index: i,
        error: this.calculateVertexError(geometry, i),
        removed: false,
      });
    }

    const faces = [];
    for (let i = 0; i < indices.length; i += 3) {
      faces.push([indices[i], indices[i + 1], indices[i + 2]]);
    }

    const sortedVertices = vertices.sort((a, b) => a.error - b.error);
    const targetRemove = vertexCount - targetVertexCount;

    for (let i = 0; i < targetRemove && i < sortedVertices.length; i++) {
      const vertex = sortedVertices[i];
      if (vertex.removed) continue;

      vertex.removed = true;

      faces.forEach(face => {
        const idx = face.indexOf(vertex.index);
        if (idx !== -1) {
          const replacement = this.findNearestVertex(vertices, vertex, face);
          if (replacement !== -1) {
            face[idx] = replacement;
          }
        }
      });
    }

    const vertexMap = new Map();
    let newIndex = 0;
    const newPositions = [];
    const newIndices = [];

    vertices.forEach(v => {
      if (!v.removed) {
        vertexMap.set(v.index, newIndex);
        newPositions.push(v.x, v.y, v.z);
        newIndex++;
      }
    });

    faces.forEach(face => {
      const validFace = face.filter(idx => !vertices[idx]?.removed);
      if (validFace.length === 3) {
        newIndices.push(
          vertexMap.get(validFace[0]),
          vertexMap.get(validFace[1]),
          vertexMap.get(validFace[2])
        );
      }
    });

    const compressedGeometry = new THREE.BufferGeometry();
    compressedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    compressedGeometry.setIndex(newIndices);

    if (geometry.attributes.normal) {
      compressedGeometry.computeVertexNormals();
    }

    return compressedGeometry;
  }

  calculateVertexError(geometry, vertexIndex) {
    return Math.random();
  }

  findNearestVertex(vertices, targetVertex, face) {
    let nearest = -1;
    let minDist = Infinity;

    face.forEach(idx => {
      if (idx !== targetVertex.index && !vertices[idx]?.removed) {
        const v = vertices[idx];
        const dist = Math.sqrt(
          (v.x - targetVertex.x) ** 2 +
          (v.y - targetVertex.y) ** 2 +
          (v.z - targetVertex.z) ** 2
        );
        if (dist < minDist) {
          minDist = dist;
          nearest = idx;
        }
      }
    });

    return nearest;
  }

  compressAttributes(geometry) {
    const compressed = geometry.clone();

    if (compressed.attributes.position) {
      const posAttr = compressed.attributes.position;
      if (posAttr.array instanceof Float64Array) {
        compressed.setAttribute('position', new THREE.Float32BufferAttribute(
          new Float32Array(posAttr.array),
          posAttr.itemSize
        ));
      }
    }

    if (compressed.attributes.normal) {
      const normalAttr = compressed.attributes.normal;
      if (normalAttr.array instanceof Float64Array) {
        compressed.setAttribute('normal', new THREE.Float32BufferAttribute(
          new Float32Array(normalAttr.array),
          normalAttr.itemSize
        ));
      }
    }

    if (compressed.attributes.uv) {
      const uvAttr = compressed.attributes.uv;
      if (uvAttr.array instanceof Float64Array) {
        compressed.setAttribute('uv', new THREE.Float32BufferAttribute(
          new Float32Array(uvAttr.array),
          uvAttr.itemSize
        ));
      }
    }

    return compressed;
  }

  compressObject3D(object, options = {}) {
    const results = [];

    object.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const result = this.compressGeometry(child.geometry, options);
        child.geometry.dispose();
        child.geometry = result.geometry;
        results.push({
          object: child,
          stats: result.stats,
        });
      }
    });

    return results;
  }

  generateLOD(geometry, levels = 3) {
    const lods = [];
    const vertexCount = geometry.attributes.position?.count || 0;

    for (let i = 0; i < levels; i++) {
      const ratio = 1 - (i / levels) * 0.6;
      const targetCount = Math.floor(vertexCount * ratio);

      const result = this.compressGeometry(geometry, {
        targetVertexCount: targetCount,
        preserveTextureCoords: i < levels - 1,
        preserveNormals: i < levels - 1,
      });

      lods.push({
        distance: i * 50,
        geometry: result.geometry,
        stats: result.stats,
      });
    }

    return lods;
  }

  generateGeometryId(geometry) {
    const pos = geometry.attributes.position;
    if (!pos) return 'empty';

    const firstVertex = `${pos.array[0].toFixed(2)},${pos.array[1].toFixed(2)},${pos.array[2].toFixed(2)}`;
    const count = pos.count;
    return `${count}_${firstVertex}`;
  }

  exportToJSON(object) {
    const data = object.toJSON();
    const jsonString = JSON.stringify(data);
    const compressed = this.compressString(jsonString);

    return {
      json: jsonString,
      compressed: compressed,
      compressionRatio: (1 - compressed.length / jsonString.length) * 100,
    };
  }

  compressString(str) {
    let result = '';
    let count = 1;

    for (let i = 0; i < str.length; i++) {
      if (str[i] === str[i + 1] && count < 255) {
        count++;
      } else {
        if (count > 1) {
          result += count + str[i];
        } else {
          result += str[i];
        }
        count = 1;
      }
    }

    return result;
  }

  decompressString(compressed) {
    let result = '';
    let i = 0;

    while (i < compressed.length) {
      if (/\d/.test(compressed[i])) {
        let countStr = '';
        while (i < compressed.length && /\d/.test(compressed[i])) {
          countStr += compressed[i];
          i++;
        }
        const count = parseInt(countStr);
        if (i < compressed.length) {
          result += compressed[i].repeat(count);
          i++;
        }
      } else {
        result += compressed[i];
        i++;
      }
    }

    return result;
  }

  getCompressionStats(geometry) {
    const id = this.generateGeometryId(geometry);
    return this.compressionStats.get(id);
  }

  getAllStats() {
    return Array.from(this.compressionStats.entries()).map(([id, stats]) => ({
      id,
      ...stats,
    }));
  }

  createOptimizedPipelineGeometry(type, params = {}) {
    const cacheKey = `${type}_${JSON.stringify(params)}`;

    if (this.geometryCache.has(cacheKey)) {
      return this.geometryCache.get(cacheKey).clone();
    }

    let geometry;

    switch (type) {
      case 'pipe':
        const { radius = 2, length = 10, segments = 12 } = params;
        geometry = new THREE.CylinderGeometry(radius, radius, length, segments);
        geometry.rotateX(Math.PI / 2);
        break;

      case 'joint':
        const jointRadius = params.radius || 3;
        const jointSegments = params.segments || 12;
        geometry = new THREE.SphereGeometry(jointRadius, jointSegments, jointSegments);
        break;

      case 'valve':
        geometry = new THREE.CylinderGeometry(2.5, 2.5, 6, 12);
        break;

      case 'elbow':
        geometry = this.createElbowGeometry(params.radius || 2, params.angle || 90, params.segments || 8);
        break;

      default:
        geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    this.geometryCache.set(cacheKey, geometry);
    return geometry.clone();
  }

  createElbowGeometry(radius = 2, angle = 90, segments = 8) {
    const points = [];
    const radAngle = (angle * Math.PI) / 180;
    const curveRadius = radius * 2;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const theta = t * radAngle;
      const x = Math.cos(theta) * curveRadius - curveRadius;
      const y = Math.sin(theta) * curveRadius;
      points.push(new THREE.Vector3(x, y, 0));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, segments * 3, radius, 12, false);

    return geometry;
  }

  calculateMeshComplexity(mesh) {
    if (!mesh.isMesh) return 0;

    const geometry = mesh.geometry;
    const vertexCount = geometry.attributes.position?.count || 0;
    const triangleCount = geometry.index
      ? geometry.index.count / 3
      : vertexCount / 3;

    return {
      vertices: vertexCount,
      triangles: Math.floor(triangleCount),
      estimatedDrawCalls: 1,
    };
  }

  estimateMemoryUsage(geometry) {
    let bytes = 0;

    if (geometry.attributes.position) {
      bytes += geometry.attributes.position.array.byteLength;
    }
    if (geometry.attributes.normal) {
      bytes += geometry.attributes.normal.array.byteLength;
    }
    if (geometry.attributes.uv) {
      bytes += geometry.attributes.uv.array.byteLength;
    }
    if (geometry.index) {
      bytes += geometry.index.array.byteLength;
    }

    return {
      bytes: bytes,
      kilobytes: bytes / 1024,
      megabytes: bytes / (1024 * 1024),
    };
  }

  dispose() {
    this.geometryCache.forEach(geo => geo.dispose());
    this.geometryCache.clear();
    this.compressionStats.clear();
  }
}

export default ModelCompressor;
