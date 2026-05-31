class FaceDetector {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.backendReady = false;
        this.worker = null;
        this.workerReady = false;
        this.pendingCallback = null;
        this.useWebWorker = true;
        this.mosaicOffsetX = 0;
        this.mosaicOffsetY = 0;
    }

    async init() {
        try {
            if (this.useWebWorker && window.Worker) {
                this.initWorker();
            }
            
            console.log('正在设置WebAssembly后端...');
            await tf.setBackend('wasm');
            
            tf.setWasmPath('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.14.0/dist/');
            
            await tf.ready();
            this.backendReady = true;
            console.log('WebAssembly后端已就绪');
            console.log('当前后端:', tf.getBackend());
            
            console.log('正在加载人脸检测模型...');
            this.model = await blazeface.load();
            this.isModelLoaded = true;
            console.log('人脸检测模型加载完成');
            
            return true;
        } catch (error) {
            console.error('初始化人脸检测器失败:', error);
            console.log('尝试使用WebGL后端...');
            try {
                await tf.setBackend('webgl');
                await tf.ready();
                this.backendReady = true;
                console.log('WebGL后端已就绪');
                
                this.model = await blazeface.load();
                this.isModelLoaded = true;
                console.log('人脸检测模型加载完成 (WebGL)');
                return true;
            } catch (webglError) {
                console.error('WebGL后端也失败了:', webglError);
                throw new Error('无法初始化任何TensorFlow后端');
            }
        }
    }

    initWorker() {
        try {
            this.worker = new Worker('js/face-processor.worker.js');
            
            this.worker.onmessage = (e) => {
                const { type, imageData } = e.data;
                
                if (type === 'pixelate-complete' && this.pendingCallback) {
                    this.pendingCallback(imageData);
                    this.pendingCallback = null;
                } else if (type === 'mosaic-complete' && this.pendingCallback) {
                    this.pendingCallback(imageData);
                    this.pendingCallback = null;
                }
            };
            
            this.worker.onerror = (error) => {
                console.error('WebWorker错误:', error);
                this.workerReady = false;
            };
            
            this.workerReady = true;
            console.log('WebWorker已初始化');
        } catch (error) {
            console.error('初始化WebWorker失败，将使用主线程处理:', error);
            this.useWebWorker = false;
        }
    }

    async detectFaces(videoElement) {
        if (!this.isModelLoaded || !this.model) {
            return [];
        }

        try {
            const predictions = await this.model.estimateFaces(videoElement, false);
            return predictions.map(pred => ({
                topLeft: pred.topLeft,
                bottomRight: pred.bottomRight,
                confidence: pred.probability ? pred.probability[0] : 0.9,
                landmarks: pred.landmarks || []
            }));
        } catch (error) {
            console.error('人脸检测失败:', error);
            return [];
        }
    }

    pixelateFaceMainThread(ctx, face, pixelationLevel = 15) {
        const [x1, y1] = face.topLeft;
        const [x2, y2] = face.bottomRight;
        
        const width = x2 - x1;
        const height = y2 - y1;
        
        const paddingX = width * 0.15;
        const paddingY = height * 0.2;
        
        const px1 = Math.max(0, x1 - paddingX);
        const py1 = Math.max(0, y1 - paddingY);
        const px2 = Math.min(ctx.canvas.width, x2 + paddingX);
        const py2 = Math.min(ctx.canvas.height, y2 + paddingY);
        
        const pWidth = px2 - px1;
        const pHeight = py2 - py1;
        
        if (pWidth <= 0 || pHeight <= 0) return;
        
        const blockSize = Math.max(2, Math.floor(pWidth / pixelationLevel));
        
        const smallWidth = Math.max(1, Math.floor(pWidth / blockSize));
        const smallHeight = Math.max(1, Math.floor(pHeight / blockSize));
        
        ctx.imageSmoothingEnabled = false;
        
        ctx.drawImage(
            ctx.canvas,
            px1, py1, pWidth, pHeight,
            px1, py1, smallWidth, smallHeight
        );
        
        ctx.drawImage(
            ctx.canvas,
            px1, py1, smallWidth, smallHeight,
            px1, py1, pWidth, pHeight
        );
        
        ctx.imageSmoothingEnabled = true;
    }

    async processFrameWithWorker(video, canvas, options = {}) {
        const ctx = canvas.getContext('2d');
        const {
            pixelationLevel = 15,
            confidenceThreshold = 0.7,
            enableBlur = true
        } = options;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        if (!enableBlur) {
            return [];
        }

        const faces = await this.detectFaces(video);
        const validFaces = faces.filter(face => face.confidence >= confidenceThreshold);
        
        if (validFaces.length === 0) {
            return [];
        }

        if (this.workerReady && this.worker) {
            return new Promise((resolve) => {
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                
                this.pendingCallback = (processedImageData) => {
                    ctx.putImageData(processedImageData, 0, 0);
                    resolve(validFaces);
                };
                
                this.worker.postMessage({
                    type: 'pixelate',
                    imageData: imageData,
                    faces: validFaces,
                    pixelationLevel: pixelationLevel,
                    canvasWidth: canvas.width,
                    canvasHeight: canvas.height
                }, [imageData.data.buffer]);
            });
        } else {
            for (const face of validFaces) {
                this.pixelateFaceMainThread(ctx, face, pixelationLevel);
            }
            return validFaces;
        }
    }

    async applyFullMosaic(video, canvas, blockSize = 20) {
        const ctx = canvas.getContext('2d');
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        this.mosaicOffsetX = (this.mosaicOffsetX + 3) % blockSize;
        this.mosaicOffsetY = (this.mosaicOffsetY + 2) % blockSize;
        
        if (this.workerReady && this.worker) {
            return new Promise((resolve) => {
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                
                this.pendingCallback = (processedImageData) => {
                    ctx.putImageData(processedImageData, 0, 0);
                    resolve();
                };
                
                this.worker.postMessage({
                    type: 'mosaic',
                    imageData: imageData,
                    blockSize: blockSize,
                    offsetX: this.mosaicOffsetX,
                    offsetY: this.mosaicOffsetY
                }, [imageData.data.buffer]);
            });
        } else {
            this.applyFullMosaicMainThread(ctx, canvas.width, canvas.height, blockSize);
        }
    }

    applyFullMosaicMainThread(ctx, width, height, blockSize) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        for (let y = 0; y < height; y += blockSize) {
            for (let x = 0; x < width; x += blockSize) {
                const blockEndX = Math.min(x + blockSize, width);
                const blockEndY = Math.min(y + blockSize, height);
                
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
                
                const variation = ((this.mosaicOffsetX + this.mosaicOffsetY) % 20) - 10;
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
        
        ctx.putImageData(imageData, 0, 0);
    }

    async processFrame(video, canvas, options = {}) {
        return this.processFrameWithWorker(video, canvas, options);
    }

    destroy() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}

const blazeface = (function() {
    const BLAZEFACE_MODEL_URL = 'https://tfhub.dev/tensorflow/tfjs-model/blazeface/1/default/1';
    
    class BlazeFaceModel {
        constructor(model, width, height, maxFaces) {
            this.model = model;
            this.width = width;
            this.height = height;
            this.maxFaces = maxFaces;
            this.anchors = this.generateAnchors();
        }

        generateAnchors() {
            const layers = [
                [16, 16, 0.2, 0.3],
                [8, 8, 0.35, 0.45],
                [4, 4, 0.55, 0.65],
                [2, 2, 0.7, 0.8],
                [1, 1, 0.85, 0.95]
            ];
            
            const anchors = [];
            for (const [stride, numAnchors, minScale, maxScale] of layers) {
                for (let y = 0; y < this.height / stride; y++) {
                    for (let x = 0; x < this.width / stride; x++) {
                        for (let a = 0; a < numAnchors; a++) {
                            const scale = minScale + (maxScale - minScale) * a / Math.max(1, numAnchors - 1);
                            anchors.push({
                                x: (x + 0.5) * stride / this.width,
                                y: (y + 0.5) * stride / this.height,
                                w: scale,
                                h: scale
                            });
                        }
                    }
                }
            }
            return anchors;
        }

        async estimateFaces(input, returnTensors = false) {
            const img = tf.browser.fromPixels(input);
            const resized = tf.image.resizeBilinear(img, [this.height, this.width]);
            const normalized = resized.toFloat().div(127.5).sub(1);
            const batched = normalized.expandDims(0);
            
            const predictions = this.model.predict(batched);
            
            const rawBoxes = predictions[0].squeeze();
            const rawScores = predictions[1].squeeze();
            
            const boxes = [];
            const scores = [];
            
            const boxData = rawBoxes.arraySync();
            const scoreData = rawScores.arraySync();
            
            const inputWidth = input.width || input.videoWidth || 640;
            const inputHeight = input.height || input.videoHeight || 480;
            
            for (let i = 0; i < this.anchors.length; i++) {
                const anchor = this.anchors[i];
                const box = boxData[i];
                const score = Math.max(...scoreData[i]);
                
                const sx = box[0] / 128;
                const sy = box[1] / 128;
                const sw = box[2] / 128;
                const sh = box[3] / 128;
                
                const cx = anchor.x + sx;
                const cy = anchor.y + sy;
                const w = anchor.w * Math.exp(sw);
                const h = anchor.h * Math.exp(sh);
                
                const x1 = (cx - w / 2) * inputWidth;
                const y1 = (cy - h / 2) * inputHeight;
                const x2 = (cx + w / 2) * inputWidth;
                const y2 = (cy + h / 2) * inputHeight;
                
                boxes.push([x1, y1, x2, y2]);
                scores.push(score);
            }
            
            const nmsIndices = tf.image.nonMaxSuppression(
                tf.tensor2d(boxes),
                tf.tensor1d(scores),
                this.maxFaces,
                0.3,
                0.75
            ).arraySync();
            
            const faces = nmsIndices.map(i => ({
                topLeft: [boxes[i][0], boxes[i][1]],
                bottomRight: [boxes[i][2], boxes[i][3]],
                probability: [scores[i]],
                landmarks: this.extractLandmarks(boxData[i], this.anchors[i], inputWidth, inputHeight)
            }));
            
            if (!returnTensors) {
                img.dispose();
                resized.dispose();
                normalized.dispose();
                batched.dispose();
                rawBoxes.dispose();
                rawScores.dispose();
            }
            
            return faces;
        }

        extractLandmarks(box, anchor, imgWidth, imgHeight) {
            const landmarks = [];
            for (let i = 4; i < box.length; i += 2) {
                const lx = (anchor.x + box[i] / 128) * imgWidth;
                const ly = (anchor.y + box[i + 1] / 128) * imgHeight;
                landmarks.push([lx, ly]);
            }
            return landmarks;
        }
    }

    return {
        async load() {
            const model = await tf.loadGraphModel(BLAZEFACE_MODEL_URL, { fromTFHub: true });
            return new BlazeFaceModel(model, 128, 128, 10);
        }
    };
})();

window.FaceDetector = FaceDetector;
