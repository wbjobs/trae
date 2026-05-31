import { VoxelData, SVOData } from '../types';

export class SVOGIBuilder {
  private static readonly MAX_NODES = 1024 * 1024 * 4;

  static build(voxelData: VoxelData): SVOData {
    const size = voxelData.size.x;
    const depth = Math.log2(size);
    
    const nodes: number[] = [];
    const nodeData: { children: number; mask: number; color: number }[] = [];
    
    this.addNode(nodes, nodeData, 0, 0);
    
    this.buildRecursive(
      voxelData.voxels,
      size,
      0, 0, 0,
      size,
      0,
      nodes,
      nodeData
    );
    
    const nodeBuffer = new Uint32Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      nodeBuffer[i] = nodes[i];
    }
    
    return {
      nodes: nodeBuffer,
      depth,
      rootNode: 0
    };
  }

  private static buildRecursive(
    voxels: Uint8Array,
    gridSize: number,
    x: number, y: number, z: number,
    size: number,
    nodeIndex: number,
    nodes: number[],
    nodeData: { children: number; mask: number; color: number }[]
  ): { hasVoxels: boolean; avgColor: number } {
    if (size === 1) {
      const idx = z * gridSize * gridSize + y * gridSize + x;
      const voxel = voxels[idx];
      if (voxel > 0) {
        nodeData[nodeIndex].mask = 0;
        nodeData[nodeIndex].children = 0;
        nodeData[nodeIndex].color = voxel;
        nodes[nodeIndex * 2] = 0;
        nodes[nodeIndex * 2 + 1] = voxel;
        return { hasVoxels: true, avgColor: voxel };
      }
      return { hasVoxels: false, avgColor: 0 };
    }

    const halfSize = size / 2;
    let mask = 0;
    let childColors: number[] = [];

    for (let i = 0; i < 8; i++) {
      const ox = (i & 1) * halfSize;
      const oy = ((i >> 1) & 1) * halfSize;
      const oz = ((i >> 2) & 1) * halfSize;

      const childNodeIndex = nodeData.length;
      this.addNode(nodes, nodeData, 0, 0);

      const result = this.buildRecursive(
        voxels,
        gridSize,
        x + ox, y + oy, z + oz,
        halfSize,
        childNodeIndex,
        nodes,
        nodeData
      );

      if (result.hasVoxels) {
        mask |= (1 << i);
        childColors.push(result.avgColor);
      }
    }

    if (mask === 0) {
      const removeIndex = nodeData.length - 8;
      nodeData.splice(removeIndex, 8);
      nodes.splice(removeIndex * 2, 16);
      return { hasVoxels: false, avgColor: 0 };
    }

    const avgColor = childColors.length > 0
      ? childColors.reduce((a, b) => a + b, 0) / childColors.length
      : 0;

    const childrenOffset = nodeIndex + 1;
    
    nodeData[nodeIndex].mask = mask;
    nodeData[nodeIndex].children = childrenOffset;
    nodeData[nodeIndex].color = Math.floor(avgColor);
    
    nodes[nodeIndex * 2] = (childrenOffset << 8) | mask;
    nodes[nodeIndex * 2 + 1] = Math.floor(avgColor);

    return { hasVoxels: true, avgColor: Math.floor(avgColor) };
  }

  private static addNode(
    nodes: number[],
    nodeData: { children: number; mask: number; color: number }[],
    children: number,
    color: number
  ): number {
    const index = nodeData.length;
    nodeData.push({ children, mask: 0, color });
    nodes.push(children, color);
    return index;
  }

  static buildFlat(voxelData: VoxelData): SVOData {
    const size = voxelData.size.x;
    const depth = Math.log2(size);
    
    const totalNodes = this.calculateTotalNodes(size);
    const nodes = new Uint32Array(totalNodes * 2);
    
    let nodeCounter = 0;
    
    const build = (x: number, y: number, z: number, s: number, nodeIdx: number): number => {
      if (s === 1) {
        const idx = z * size * size + y * size + x;
        const voxel = voxelData.voxels[idx];
        nodes[nodeIdx * 2] = 0;
        nodes[nodeIdx * 2 + 1] = voxel;
        return voxel > 0 ? 1 : 0;
      }
      
      const half = s / 2;
      let mask = 0;
      let colorSum = 0;
      let count = 0;
      
      const childStart = nodeCounter + 1;
      
      for (let i = 0; i < 8; i++) {
        const ox = (i & 1) * half;
        const oy = ((i >> 1) & 1) * half;
        const oz = ((i >> 2) & 1) * half;
        
        const childNode = ++nodeCounter;
        const hasVoxel = build(x + ox, y + oy, z + oz, half, childNode);
        
        if (hasVoxel > 0) {
          mask |= (1 << i);
          colorSum += nodes[childNode * 2 + 1];
          count++;
        }
      }
      
      const avgColor = count > 0 ? Math.floor(colorSum / count) : 0;
      nodes[nodeIdx * 2] = mask > 0 ? (childStart << 8) | mask : 0;
      nodes[nodeIdx * 2 + 1] = avgColor;
      
      return mask > 0 ? 1 : 0;
    };
    
    build(0, 0, 0, size, 0);
    
    return {
      nodes: nodes.slice(0, (nodeCounter + 1) * 2),
      depth,
      rootNode: 0
    };
  }

  private static calculateTotalNodes(size: number): number {
    let total = 0;
    let s = size;
    while (s >= 1) {
      total += s * s * s;
      s = s / 2;
    }
    return Math.min(total, this.MAX_NODES);
  }

  static buildBrickPool(voxelData: VoxelData, brickSize: number = 8): {
    bricks: Uint8Array;
    brickIndices: Uint32Array;
    gridSize: number;
  } {
    const size = voxelData.size.x;
    const gridSize = size / brickSize;
    
    const brickMap = new Map<string, number>();
    const brickIndices = new Uint32Array(gridSize * gridSize * gridSize);
    const bricksList: Uint8Array[] = [];
    
    for (let bx = 0; bx < gridSize; bx++) {
      for (let by = 0; by < gridSize; by++) {
        for (let bz = 0; bz < gridSize; bz++) {
          const brick = new Uint8Array(brickSize * brickSize * brickSize);
          let isEmpty = true;
          const keyParts: string[] = [];
          
          for (let ix = 0; ix < brickSize; ix++) {
            for (let iy = 0; iy < brickSize; iy++) {
              for (let iz = 0; iz < brickSize; iz++) {
                const x = bx * brickSize + ix;
                const y = by * brickSize + iy;
                const z = bz * brickSize + iz;
                const idx = z * size * size + y * size + x;
                const voxel = voxelData.voxels[idx];
                brick[iz * brickSize * brickSize + iy * brickSize + ix] = voxel;
                if (voxel > 0) {
                  isEmpty = false;
                  keyParts.push(`${ix},${iy},${iz}:${voxel}`);
                }
              }
            }
          }
          
          if (isEmpty) {
            brickIndices[bz * gridSize * gridSize + by * gridSize + bx] = 0xFFFFFFFF;
          } else {
            const key = keyParts.join('|');
            let brickIndex = brickMap.get(key);
            if (brickIndex === undefined) {
              brickIndex = bricksList.length;
              brickMap.set(key, brickIndex);
              bricksList.push(brick);
            }
            brickIndices[bz * gridSize * gridSize + by * gridSize + bx] = brickIndex;
          }
        }
      }
    }
    
    const bricks = new Uint8Array(bricksList.length * brickSize * brickSize * brickSize);
    for (let i = 0; i < bricksList.length; i++) {
      bricks.set(bricksList[i], i * brickSize * brickSize * brickSize);
    }
    
    return {
      bricks,
      brickIndices,
      gridSize
    };
  }
}
