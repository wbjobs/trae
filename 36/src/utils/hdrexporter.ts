export class HDRExporter {
  static download(data: ArrayBuffer, filename: string): void {
    const blob = new Blob([data], { type: 'application/vnd.radiance' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  }

  static convertFloatToRGBE(data: Float32Array, width: number, height: number): Uint8Array {
    const pixelCount = width * height;
    const rgbe = new Uint8Array(pixelCount * 4);

    for (let i = 0; i < pixelCount; i++) {
      const r = Math.max(0, data[i * 4]);
      const g = Math.max(0, data[i * 4 + 1]);
      const b = Math.max(0, data[i * 4 + 2]);

      const maxVal = Math.max(r, g, b);

      if (maxVal < 1e-32) {
        rgbe[i * 4] = 0;
        rgbe[i * 4 + 1] = 0;
        rgbe[i * 4 + 2] = 0;
        rgbe[i * 4 + 3] = 0;
      } else {
        let exp = Math.ceil(Math.log2(maxVal));
        const scale = Math.pow(2, -exp) * 256;
        
        rgbe[i * 4] = Math.min(255, Math.floor(r * scale));
        rgbe[i * 4 + 1] = Math.min(255, Math.floor(g * scale));
        rgbe[i * 4 + 2] = Math.min(255, Math.floor(b * scale));
        rgbe[i * 4 + 3] = exp + 128;
      }
    }

    return rgbe;
  }

  static createHDRBuffer(rgbe: Uint8Array, width: number, height: number): ArrayBuffer {
    const header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`;
    const headerBytes = new TextEncoder().encode(header);
    
    const result = new Uint8Array(headerBytes.length + rgbe.length);
    result.set(headerBytes, 0);
    result.set(rgbe, headerBytes.length);
    
    return result.buffer;
  }

  static async readPixelsFromCanvas(canvas: HTMLCanvasElement): Promise<Float32Array> {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Cannot get 2D context');
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const floatData = new Float32Array(canvas.width * canvas.height * 4);

    for (let i = 0; i < imageData.data.length; i++) {
      floatData[i] = imageData.data[i] / 255;
    }

    return floatData;
  }
}
