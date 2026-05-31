import { VoxelData, Vector3 } from '../types';

export class VoxLoader {
  private static readonly MAGIC = 'VOX ';
  private static readonly VERSION = 150;

  static async loadFromFile(file: File): Promise<VoxelData> {
    const buffer = await file.arrayBuffer();
    return this.parse(buffer);
  }

  static async loadFromUrl(url: string): Promise<VoxelData> {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return this.parse(buffer);
  }

  static parse(buffer: ArrayBuffer): VoxelData {
    const dataView = new DataView(buffer);
    const textDecoder = new TextDecoder('ascii');

    const magic = textDecoder.decode(new Uint8Array(buffer, 0, 4));
    if (magic !== this.MAGIC) {
      throw new Error('Invalid VOX file: incorrect magic number');
    }

    const version = dataView.getInt32(4, true);
    if (version !== this.VERSION) {
      console.warn(`Unexpected VOX version: ${version}, expected ${this.VERSION}`);
    }

    let offset = 8;
    let size: Vector3 = { x: 0, y: 0, z: 0 };
    let voxels: { x: number; y: number; z: number; i: number }[] = [];
    let palette: number[] = [];

    while (offset < buffer.byteLength) {
      const chunkId = textDecoder.decode(new Uint8Array(buffer, offset, 4));
      offset += 4;

      const chunkSize = dataView.getInt32(offset, true);
      offset += 4;

      const childrenSize = dataView.getInt32(offset, true);
      offset += 4;

      const chunkStart = offset;

      switch (chunkId) {
        case 'SIZE':
          size = {
            x: dataView.getInt32(offset, true),
            y: dataView.getInt32(offset + 4, true),
            z: dataView.getInt32(offset + 8, true)
          };
          offset += 12;
          break;

        case 'XYZI':
          const numVoxels = dataView.getInt32(offset, true);
          offset += 4;
          voxels = [];
          for (let i = 0; i < numVoxels; i++) {
            voxels.push({
              x: dataView.getUint8(offset),
              y: dataView.getUint8(offset + 1),
              z: dataView.getUint8(offset + 2),
              i: dataView.getUint8(offset + 3)
            });
            offset += 4;
          }
          break;

        case 'RGBA':
          palette = [0, 0, 0, 0];
          for (let i = 0; i < 255; i++) {
            palette.push(
              dataView.getUint8(offset) / 255,
              dataView.getUint8(offset + 1) / 255,
              dataView.getUint8(offset + 2) / 255,
              dataView.getUint8(offset + 3) / 255
            );
            offset += 4;
          }
          break;

        default:
          offset = chunkStart + chunkSize;
          break;
      }

      offset = chunkStart + chunkSize;
      offset += childrenSize;
    }

    if (palette.length === 0) {
      palette = this.getDefaultPalette();
    }

    const maxDim = Math.max(size.x, size.y, size.z);
    const paddedSize = Math.min(256, Math.pow(2, Math.ceil(Math.log2(maxDim))));

    const voxelArray = new Uint8Array(paddedSize * paddedSize * paddedSize);
    const paletteArray = new Float32Array(palette);

    let voxelCount = 0;
    for (const voxel of voxels) {
      const x = Math.min(voxel.x, paddedSize - 1);
      const y = Math.min(voxel.y, paddedSize - 1);
      const z = Math.min(voxel.z, paddedSize - 1);
      const index = z * paddedSize * paddedSize + y * paddedSize + x;
      if (voxel.i > 0 && voxel.i < 256) {
        voxelArray[index] = voxel.i;
        voxelCount++;
      }
    }

    return {
      size: { x: paddedSize, y: paddedSize, z: paddedSize },
      voxels: voxelArray,
      palette: paletteArray,
      paletteCount: 256,
      voxelCount
    };
  }

  private static getDefaultPalette(): number[] {
    const palette: number[] = [0, 0, 0, 0];

    for (let i = 0; i < 255; i++) {
      const hue = i / 255 * 360;
      const saturation = 0.7;
      const value = 0.9;

      const c = value * saturation;
      const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
      const m = value - c;

      let r, g, b;
      if (hue < 60) { r = c; g = x; b = 0; }
      else if (hue < 120) { r = x; g = c; b = 0; }
      else if (hue < 180) { r = 0; g = c; b = x; }
      else if (hue < 240) { r = 0; g = x; b = c; }
      else if (hue < 300) { r = x; g = 0; b = c; }
      else { r = c; g = 0; b = x; }

      palette.push(r + m, g + m, b + m, 1.0);
    }

    return palette;
  }

  static createDemoScene(): VoxelData {
    const size = 64;
    const voxelArray = new Uint8Array(size * size * size);
    const palette = this.getDefaultPalette();
    const paletteArray = new Float32Array(palette);

    let voxelCount = 0;

    const floor = (x: number, z: number) => {
      return Math.floor(Math.sin(x * 0.2) * Math.cos(z * 0.2) * 3 + 10);
    };

    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        const height = floor(x, z);
        for (let y = 0; y < height; y++) {
          const index = z * size * size + y * size + x;
          voxelArray[index] = 1 + Math.floor(Math.random() * 50);
          voxelCount++;
        }
      }
    }

    const sphere = (cx: number, cy: number, cz: number, r: number, colorIdx: number) => {
      for (let x = cx - r; x <= cx + r; x++) {
        for (let y = cy - r; y <= cy + r; y++) {
          for (let z = cz - r; z <= cz + r; z++) {
            if (x < 0 || x >= size || y < 0 || y >= size || z < 0 || z >= size) continue;
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2);
            if (dist <= r) {
              const index = z * size * size + y * size + x;
              voxelArray[index] = colorIdx;
              voxelCount++;
            }
          }
        }
      }
    };

    sphere(20, 18, 20, 6, 100);
    sphere(45, 22, 40, 8, 150);
    sphere(32, 30, 32, 5, 200);

    for (let x = 25; x < 40; x++) {
      for (let z = 25; z < 40; z++) {
        const height = floor(x, z);
        const index = z * size * size + height * size + x;
        voxelArray[index] = 220;
        voxelCount++;
      }
    }

    return {
      size: { x: size, y: size, z: size },
      voxels: voxelArray,
      palette: paletteArray,
      paletteCount: 256,
      voxelCount
    };
  }
}
