self.onmessage = function(e) {
    const { type, imageData, faces, pixelationLevel, canvasWidth, canvasHeight } = e.data;
    
    switch (type) {
        case 'pixelate':
            const result = processPixelation(imageData, faces, pixelationLevel, canvasWidth, canvasHeight);
            self.postMessage({
                type: 'pixelate-complete',
                imageData: result
            }, [result.data.buffer]);
            break;
            
        case 'mosaic':
            const mosaicResult = generateMosaic(imageData, e.data.blockSize, e.data.offsetX, e.data.offsetY);
            self.postMessage({
                type: 'mosaic-complete',
                imageData: mosaicResult
            }, [mosaicResult.data.buffer]);
            break;
    }
};

function processPixelation(imageData, faces, pixelationLevel, canvasWidth, canvasHeight) {
    const data = new Uint8ClampedArray(imageData.data);
    
    for (const face of faces) {
        const [x1, y1] = face.topLeft;
        const [x2, y2] = face.bottomRight;
        
        const width = x2 - x1;
        const height = y2 - y1;
        
        const paddingX = width * 0.15;
        const paddingY = height * 0.2;
        
        const px1 = Math.max(0, Math.floor(x1 - paddingX));
        const py1 = Math.max(0, Math.floor(y1 - paddingY));
        const px2 = Math.min(canvasWidth, Math.floor(x2 + paddingX));
        const py2 = Math.min(canvasHeight, Math.floor(y2 + paddingY));
        
        const pWidth = px2 - px1;
        const pHeight = py2 - py1;
        
        if (pWidth <= 0 || pHeight <= 0) continue;
        
        const blockSize = Math.max(2, Math.floor(pWidth / pixelationLevel));
        
        for (let by = py1; by < py2; by += blockSize) {
            for (let bx = px1; bx < px2; bx += blockSize) {
                const blockEndX = Math.min(bx + blockSize, px2);
                const blockEndY = Math.min(by + blockSize, py2);
                
                let r = 0, g = 0, b = 0, count = 0;
                
                for (let y = by; y < blockEndY; y++) {
                    for (let x = bx; x < blockEndX; x++) {
                        const idx = (y * canvasWidth + x) * 4;
                        r += data[idx];
                        g += data[idx + 1];
                        b += data[idx + 2];
                        count++;
                    }
                }
                
                r = Math.round(r / count);
                g = Math.round(g / count);
                b = Math.round(b / count);
                
                for (let y = by; y < blockEndY; y++) {
                    for (let x = bx; x < blockEndX; x++) {
                        const idx = (y * canvasWidth + x) * 4;
                        data[idx] = r;
                        data[idx + 1] = g;
                        data[idx + 2] = b;
                    }
                }
            }
        }
    }
    
    return new ImageData(data, canvasWidth, canvasHeight);
}

function generateMosaic(imageData, blockSize, offsetX, offsetY) {
    const width = imageData.width;
    const height = imageData.height;
    const data = new Uint8ClampedArray(imageData.data);
    
    for (let y = 0; y < height; y += blockSize) {
        for (let x = 0; x < width; x += blockSize) {
            const blockEndX = Math.min(x + blockSize, width);
            const blockEndY = Math.min(y + blockSize, height);
            
            const noiseX = (x + offsetX) % blockSize;
            const noiseY = (y + offsetY) % blockSize;
            
            let r = 0, g = 0, b = 0, count = 0;
            
            for (let py = y; py < blockEndY; py++) {
                for (let px = x; px < blockEndX; px++) {
                    const idx = (py * width + px) * 4;
                    r += data[idx];
                    g += data[idx + 1];
                    b += data[idx + 2];
                    count++;
                }
            }
            
            r = Math.round(r / count);
            g = Math.round(g / count);
            b = Math.round(b / count);
            
            const variation = ((noiseX + noiseY) % 20) - 10;
            r = Math.max(0, Math.min(255, r + variation));
            g = Math.max(0, Math.min(255, g + variation));
            b = Math.max(0, Math.min(255, b + variation));
            
            for (let py = y; py < blockEndY; py++) {
                for (let px = x; px < blockEndX; px++) {
                    const idx = (py * width + px) * 4;
                    data[idx] = r;
                    data[idx + 1] = g;
                    data[idx + 2] = b;
                }
            }
        }
    }
    
    return new ImageData(data, width, height);
}
