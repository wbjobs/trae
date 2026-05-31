self.onmessage = async (e) => {
    const { type, frame, index, processor } = e.data;

    if (type === 'process') {
        try {
            const result = await processFrame(frame, processor);
            self.postMessage({
                type: 'processComplete',
                index,
                result
            });
        } catch (error) {
            self.postMessage({
                type: 'error',
                index,
                error: error.message
            });
        }
    }
};

async function processFrame(frame, processor) {
    const imageData = await loadImage(frame.blob);
    
    let processedData = imageData;
    
    switch (processor.type) {
        case 'sketch':
            processedData = applySketchFilter(imageData, processor.params);
            break;
        case 'oil':
            processedData = applyOilFilter(imageData, processor.params);
            break;
        case 'pixelate':
            processedData = applyPixelateFilter(imageData, processor.params);
            break;
        case 'grayscale':
            processedData = applyGrayscaleFilter(imageData);
            break;
        case 'sepia':
            processedData = applySepiaFilter(imageData);
            break;
        case 'blur':
            processedData = applyBlurFilter(imageData, processor.params);
            break;
        case 'sharpen':
            processedData = applySharpenFilter(imageData, processor.params);
            break;
        case 'edge':
            processedData = applyEdgeDetection(imageData, processor.params);
            break;
        case 'vintage':
            processedData = applyVintageFilter(imageData);
            break;
        case 'cartoon':
            processedData = applyCartoonFilter(imageData, processor.params);
            break;
        default:
            break;
    }
    
    return {
        imageData: processedData,
        width: imageData.width,
        height: imageData.height,
        timestamp: frame.timestamp,
        index: frame.index
    };
}

async function loadImage(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        
        const timeout = setTimeout(() => {
            URL.revokeObjectURL(url);
            reject(new Error('Image load timeout'));
        }, 10000);
        
        img.onload = () => {
            clearTimeout(timeout);
            URL.revokeObjectURL(url);
            
            if (img.width < 10 || img.height < 10) {
                reject(new Error('Invalid image dimensions'));
                return;
            }
            
            const canvas = new OffscreenCanvas(img.width, img.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            const imageData = ctx.getImageData(0, 0, img.width, img.height);
            const validation = validateImageData(imageData);
            
            if (!validation.valid) {
                reject(new Error(`Corrupted frame detected: ${validation.error}`));
                return;
            }
            
            resolve(imageData);
        };
        
        img.onerror = () => {
            clearTimeout(timeout);
            URL.revokeObjectURL(url);
            reject(new Error('Image decode error'));
        };
        
        img.src = url;
    });
}

function validateImageData(imageData) {
    const data = imageData.data;
    const totalPixels = imageData.width * imageData.height;
    
    let greenPixels = 0;
    let zeroPixels = 0;
    const sampleStep = Math.max(1, Math.floor(totalPixels / 5000));
    
    for (let i = 0; i < data.length; i += 4 * sampleStep) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        if (r === 0 && g === 0 && b === 0) {
            zeroPixels++;
        }
        
        if (g > 200 && r < 50 && b < 50) {
            greenPixels++;
        }
    }
    
    const sampledPixels = Math.ceil(totalPixels / sampleStep);
    const greenRatio = greenPixels / sampledPixels;
    const zeroRatio = zeroPixels / sampledPixels;
    
    if (greenRatio > 0.15) {
        return { valid: false, error: 'Green mosaic artifacts detected' };
    }
    
    if (zeroRatio > 0.4) {
        return { valid: false, error: 'Excessive black pixels' };
    }
    
    return { valid: true };
}

function applySketchFilter(imageData, params = {}) {
    const { intensity = 1, edgeThreshold = 30, invert = true } = params;
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    const grayData = new Uint8ClampedArray(data.length);
    
    for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        grayData[i] = gray;
        grayData[i + 1] = gray;
        grayData[i + 2] = gray;
        grayData[i + 3] = 255;
    }
    
    const outputData = new Uint8ClampedArray(data.length);
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            
            const gx = 
                -grayData[((y - 1) * width + (x - 1)) * 4] +
                -2 * grayData[((y - 1) * width + x) * 4] +
                -grayData[((y - 1) * width + (x + 1)) * 4] +
                grayData[((y + 1) * width + (x - 1)) * 4] +
                2 * grayData[((y + 1) * width + x) * 4] +
                grayData[((y + 1) * width + (x + 1)) * 4];
            
            const gy = 
                -grayData[((y - 1) * width + (x - 1)) * 4] +
                -2 * grayData[(y * width + (x - 1)) * 4] +
                -grayData[((y + 1) * width + (x - 1)) * 4] +
                grayData[((y - 1) * width + (x + 1)) * 4] +
                2 * grayData[(y * width + (x + 1)) * 4] +
                grayData[((y + 1) * width + (x + 1)) * 4];
            
            const magnitude = Math.sqrt(gx * gx + gy * gy) * intensity;
            
            let value = magnitude > edgeThreshold ? 0 : 255;
            
            if (invert) {
                value = 255 - value;
            }
            
            outputData[idx] = value;
            outputData[idx + 1] = value;
            outputData[idx + 2] = value;
            outputData[idx + 3] = 255;
        }
    }
    
    return new ImageData(outputData, width, height);
}

function applyOilFilter(imageData, params = {}) {
    const { radius = 4, levels = 20 } = params;
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const outputData = new Uint8ClampedArray(data.length);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const rBins = new Array(levels).fill(0);
            const gBins = new Array(levels).fill(0);
            const bBins = new Array(levels).fill(0);
            const countBins = new Array(levels).fill(0);
            
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const idx = (ny * width + nx) * 4;
                        const intensity = Math.floor(
                            (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]) / 255 * (levels - 1));
                        
                        rBins[intensity] += data[idx];
                        gBins[intensity] += data[idx + 1];
                        bBins[intensity] += data[idx + 2];
                        countBins[intensity]++;
                    }
                }
            }
            
            const maxCount = Math.max(...countBins);
            const maxIndex = countBins.indexOf(maxCount);
            
            const outIdx = (y * width + x) * 4;
            outputData[outIdx] = Math.round(rBins[maxIndex] / Math.max(countBins[maxIndex], 1));
            outputData[outIdx + 1] = Math.round(gBins[maxIndex] / Math.max(countBins[maxIndex], 1));
            outputData[outIdx + 2] = Math.round(bBins[maxIndex] / Math.max(countBins[maxIndex], 1));
            outputData[outIdx + 3] = 255;
        }
    }
    
    return new ImageData(outputData, width, height);
}

function applyPixelateFilter(imageData, params = {}) {
    const { blockSize = 8 } = params;
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const outputData = new Uint8ClampedArray(data.length);
    
    for (let y = 0; y < height; y += blockSize) {
        for (let x = 0; x < width; x += blockSize) {
            let r = 0, g = 0, b = 0, count = 0;
            
            for (let dy = 0; dy < blockSize; dy++) {
                for (let dx = 0; dx < blockSize; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    
                    if (nx < width && ny < height) {
                        const idx = (ny * width + nx) * 4;
                        r += data[idx];
                        g += data[idx + 1];
                        b += data[idx + 2];
                        count++;
                    }
                }
            }
            
            r = Math.round(r / count);
            g = Math.round(g / count);
            b = Math.round(b / count);
            
            for (let dy = 0; dy < blockSize; dy++) {
                for (let dx = 0; dx < blockSize; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    
                    if (nx < width && ny < height) {
                        const idx = (ny * width + nx) * 4;
                        outputData[idx] = r;
                        outputData[idx + 1] = g;
                        outputData[idx + 2] = b;
                        outputData[idx + 3] = 255;
                    }
                }
            }
        }
    }
    
    return new ImageData(outputData, width, height);
}

function applyGrayscaleFilter(imageData) {
    const data = imageData.data;
    const outputData = new Uint8ClampedArray(data.length);
    
    for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        outputData[i] = gray;
        outputData[i + 1] = gray;
        outputData[i + 2] = gray;
        outputData[i + 3] = 255;
    }
    
    return new ImageData(outputData, imageData.width, imageData.height);
}

function applySepiaFilter(imageData) {
    const data = imageData.data;
    const outputData = new Uint8ClampedArray(data.length);
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        outputData[i] = Math.min(255, (r * 0.393 + g * 0.769 + b * 0.189));
        outputData[i + 1] = Math.min(255, (r * 0.349 + g * 0.686 + b * 0.168));
        outputData[i + 2] = Math.min(255, (r * 0.272 + g * 0.534 + b * 0.131));
        outputData[i + 3] = 255;
    }
    
    return new ImageData(outputData, imageData.width, imageData.height);
}

function applyBlurFilter(imageData, params = {}) {
    const { radius = 3 } = params;
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const outputData = new Uint8ClampedArray(data.length);
    
    const kernelSize = radius * 2 + 1;
    const kernel = [];
    const sigma = radius / 3;
    let kernelSum = 0;
    
    for (let y = -radius; y <= radius; y++) {
        for (let x = -radius; x <= radius; x++) {
            const value = Math.exp(-(x * x + y * y) / (2 * Math.PI * sigma * sigma));
            kernel.push(value);
            kernelSum += value;
        }
    }
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let r = 0, g = 0, b = 0;
            let ki = 0;
            
            for (let ky = -radius; ky <= radius; ky++) {
                for (let kx = -radius; kx <= radius; kx++) {
                    const nx = x + kx;
                    const ny = y + ky;
                    
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const idx = (ny * width + nx) * 4;
                        const k = kernel[ki] / kernelSum;
                        r += data[idx] * k;
                        g += data[idx + 1] * k;
                        b += data[idx + 2] * k;
                    }
                    ki++;
                }
            }
            
            const outIdx = (y * width + x) * 4;
            outputData[outIdx] = r;
            outputData[outIdx + 1] = g;
            outputData[outIdx + 2] = b;
            outputData[outIdx + 3] = 255;
        }
    }
    
    return new ImageData(outputData, width, height);
}

function applySharpenFilter(imageData, params = {}) {
    const { amount = 1 } = params;
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const outputData = new Uint8ClampedArray(data.length);
    
    const kernel = [
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0
    ];
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let r = 0, g = 0, b = 0;
            
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const idx = ((y + ky) * width + (x + kx)) * 4;
                    const k = kernel[(ky + 1) * 3 + (kx + 1)];
                    r += data[idx] * k;
                    g += data[idx + 1] * k;
                    b += data[idx + 2] * k;
                }
            }
            
            const outIdx = (y * width + x) * 4;
            outputData[outIdx] = Math.min(255, Math.max(0, r * amount + data[outIdx] * (1 - amount)));
            outputData[outIdx + 1] = Math.min(255, Math.max(0, g * amount + data[outIdx + 1] * (1 - amount)));
            outputData[outIdx + 2] = Math.min(255, Math.max(0, b * amount + data[outIdx + 2] * (1 - amount)));
            outputData[outIdx + 3] = 255;
        }
    }
    
    return new ImageData(outputData, width, height);
}

function applyEdgeDetection(imageData, params = {}) {
    const { threshold = 50 } = params;
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const outputData = new Uint8ClampedArray(data.length);
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            
            const gx = 
                -data[((y - 1) * width + (x - 1)) * 4] * 0.299 +
                -2 * data[((y - 1) * width + x) * 4] * 0.299 +
                -data[((y - 1) * width + (x + 1)) * 4] * 0.299 +
                data[((y + 1) * width + (x - 1)) * 4] * 0.299 +
                2 * data[((y + 1) * width + x) * 4] * 0.299 +
                data[((y + 1) * width + (x + 1)) * 4] * 0.299;
            
            const gy = 
                -data[((y - 1) * width + (x - 1)) * 4] * 0.299 +
                -2 * data[(y * width + (x - 1)) * 4] * 0.299 +
                -data[((y + 1) * width + (x - 1)) * 4] * 0.299 +
                data[((y - 1) * width + (x + 1)) * 4] * 0.299 +
                2 * data[(y * width + (x + 1)) * 4] * 0.299 +
                data[((y + 1) * width + (x + 1)) * 4] * 0.299;
            
            const magnitude = Math.sqrt(gx * gx + gy * gy);
            const value = magnitude > threshold ? 255 : 0;
            
            outputData[idx] = value;
            outputData[idx + 1] = value;
            outputData[idx + 2] = value;
            outputData[idx + 3] = 255;
        }
    }
    
    return new ImageData(outputData, width, height);
}

function applyVintageFilter(imageData) {
    const data = imageData.data;
    const outputData = new Uint8ClampedArray(data.length);
    
    for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];
        
        r = r * 0.9 + 40;
        g = g * 0.7 + 20;
        b = b * 0.5;
        
        outputData[i] = Math.min(255, r);
        outputData[i + 1] = Math.min(255, g);
        outputData[i + 2] = Math.min(255, b);
        outputData[i + 3] = 255;
    }
    
    return new ImageData(outputData, imageData.width, imageData.height);
}

function applyCartoonFilter(imageData, params = {}) {
    const { threshold = 15 } = params;
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const outputData = new Uint8ClampedArray(data.length);
    
    const levels = 8;
    const step = 256 / levels;
    
    for (let i = 0; i < data.length; i += 4) {
        let r = Math.floor(data[i] / step) * step;
        let g = Math.floor(data[i + 1] / step) * step;
        let b = Math.floor(data[i + 2] / step) * step;
        
        outputData[i] = r;
        outputData[i + 1] = g;
        outputData[i + 2] = b;
        outputData[i + 3] = 255;
    }
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            
            const gx = 
                -outputData[((y - 1) * width + (x - 1)) * 4] * 0.299 +
                -2 * outputData[((y - 1) * width + x) * 4] * 0.299 +
                -outputData[((y - 1) * width + (x + 1)) * 4] * 0.299 +
                outputData[((y + 1) * width + (x - 1)) * 4] * 0.299 +
                2 * outputData[((y + 1) * width + x) * 4] * 0.299 +
                outputData[((y + 1) * width + (x + 1)) * 4] * 0.299;
            
            const gy = 
                -outputData[((y - 1) * width + (x - 1)) * 4] * 0.299 +
                -2 * outputData[(y * width + (x - 1)) * 4] * 0.299 +
                -outputData[((y + 1) * width + (x - 1)) * 4] * 0.299 +
                outputData[((y - 1) * width + (x + 1)) * 4] * 0.299 +
                2 * outputData[(y * width + (x + 1)) * 4] * 0.299 +
                outputData[((y + 1) * width + (x + 1)) * 4] * 0.299;
            
            const magnitude = Math.sqrt(gx * gx + gy * gy);
            
            if (magnitude > threshold) {
                outputData[idx] *= 0.5;
                outputData[idx + 1] *= 0.5;
                outputData[idx + 2] *= 0.5;
            }
        }
    }
    
    return new ImageData(outputData, width, height);
}
