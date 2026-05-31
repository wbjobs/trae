export class FFmpegDecoder {
    constructor() {
        this.ffmpeg = null;
        this.initialized = false;
        this.videoFile = null;
        this.frameCount = 0;
        this.fps = 30;
        this.duration = 0;
        this.width = 0;
        this.height = 0;
        this.onProgress = null;
        this.onFrame = null;
        this.onComplete = null;
        this.maxRetries = 3;
        this.corruptedFrames = new Set();
        this.useSoftwareDecoding = true;
    }

    async init() {
        if (this.initialized) return;
        
        const { createFFmpeg, fetchFile } = FFmpeg;
        this.ffmpeg = createFFmpeg({
            log: true,
            corePath: 'https://unpkg.com/@ffmpeg/core@0.10.0/dist/ffmpeg-core.js',
            progress: (p) => {
                if (this.onProgress) this.onProgress(p);
            }
        });

        try {
            await this.ffmpeg.load();
            this.initialized = true;
            console.log('FFmpeg WASM initialized');
        } catch (error) {
            console.error('Failed to initialize FFmpeg:', error);
            throw error;
        }
    }

    async loadVideo(file) {
        if (!this.initialized) await this.init();
        
        this.videoFile = file;
        const fileName = 'input_video.mp4';
        
        await this.ffmpeg.FS('writeFile', fileName, await fetchFile(file));
        
        await this.analyzeVideo(fileName);
        
        return {
            frameCount: this.frameCount,
            fps: this.fps,
            duration: this.duration,
            width: this.width,
            height: this.height
        };
    }

    async analyzeVideo(fileName) {
        try {
            await this.ffmpeg.run(
                '-i', fileName,
                '-vcodec', 'libx264',
                '-preset', 'ultrafast',
                '-f', 'null',
                '-'
            );
        } catch (e) {
        }

        const log = this.ffmpeg.FS('readFile', '/tmp/ffmpeg.log', { encoding: 'utf8' }).catch(() => '');
        
        const durationMatch = log.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
        if (durationMatch) {
            const hours = parseInt(durationMatch[1]);
            const minutes = parseInt(durationMatch[2]);
            const seconds = parseFloat(durationMatch[3]);
            this.duration = hours * 3600 + minutes * 60 + seconds;
        }

        const resolutionMatch = log.match(/(\d{2,4})x(\d{2,4})/);
        if (resolutionMatch) {
            this.width = parseInt(resolutionMatch[1]);
            this.height = parseInt(resolutionMatch[2]);
        }

        const fpsMatch = log.match(/(\d+\.?\d*) fps/);
        if (fpsMatch) {
            this.fps = parseFloat(fpsMatch[1]);
        }

        if (this.duration > 0 && this.fps > 0) {
            this.frameCount = Math.floor(this.duration * this.fps);
        }
    }

    async extractFrames(outputDir = 'frames', frameStep = 1, maxFrames = 100) {
        if (!this.initialized || !this.videoFile) {
            throw new Error('FFmpeg not initialized or no video loaded');
        }

        const frames = [];
        const totalFramesToExtract = Math.min(this.frameCount, maxFrames);
        const actualStep = frameStep || Math.max(1, Math.floor(this.frameCount / maxFrames));
        this.corruptedFrames.clear();
        
        try {
            await this.ffmpeg.FS('mkdir', outputDir);
        } catch (e) {
        }

        await this.ffmpeg.run(
            '-hwaccel', 'none',
            '-c:v', 'hevc',
            '-i', 'input_video.mp4',
            '-threads', '4',
            '-vf', `select='not(mod(n,${actualStep}))'`,
            '-vsync', 'vfr',
            '-q:v', '2',
            '-pix_fmt', 'yuvj420p',
            `${outputDir}/frame_%06d.jpg`
        );

        const files = await this.ffmpeg.FS('readdir', outputDir);
        const frameFiles = files.filter(f => f.endsWith('.jpg')).sort();

        for (let i = 0; i < frameFiles.length && i < totalFramesToExtract; i++) {
            const data = await this.ffmpeg.FS('readFile', `${outputDir}/${frameFiles[i]}`);
            const blob = new Blob([data.buffer], { type: 'image/jpeg' });
            
            const validation = await this.validateFrame(blob);
            
            if (!validation.valid) {
                console.warn(`Frame ${i} corrupted, attempting retry...`);
                const retriedFrame = await this.retryDecodeFrame(i, actualStep, outputDir);
                if (retriedFrame) {
                    frames.push(retriedFrame);
                } else {
                    this.corruptedFrames.add(i);
                    frames.push({
                        index: i,
                        timestamp: (i * actualStep) / this.fps,
                        blob: blob,
                        url: URL.createObjectURL(blob),
                        corrupted: true,
                        error: validation.error
                    });
                }
            } else {
                frames.push({
                    index: i,
                    timestamp: (i * actualStep) / this.fps,
                    blob: blob,
                    url: URL.createObjectURL(blob),
                    corrupted: false,
                    psnr: validation.psnr || null
                });
            }

            if (this.onFrame) {
                this.onFrame(frames.length, frameFiles.length, frames[frames.length - 1]);
            }
        }

        await this.cleanupFrames(outputDir);
        
        if (this.corruptedFrames.size > 0) {
            console.warn(`${this.corruptedFrames.size} frames were corrupted after all retries`);
        }
        
        return frames;
    }

    async extractFrameAtTimestamp(timestamp) {
        if (!this.initialized || !this.videoFile) {
            throw new Error('FFmpeg not initialized or no video loaded');
        }

        const outputFile = `frame_${Date.now()}.jpg`;
        
        await this.ffmpeg.run(
            '-ss', timestamp.toString(),
            '-i', 'input_video.mp4',
            '-vframes', '1',
            '-q:v', '2',
            outputFile
        );

        const data = await this.ffmpeg.FS('readFile', outputFile);
        const blob = new Blob([data.buffer], { type: 'image/jpeg' });
        
        await this.ffmpeg.FS('unlink', outputFile);

        return {
            timestamp,
            blob,
            url: URL.createObjectURL(blob)
        };
    }

    async cleanupFrames(outputDir) {
        try {
            const files = await this.ffmpeg.FS('readdir', outputDir);
            for (const file of files) {
                if (file.endsWith('.jpg')) {
                    await this.ffmpeg.FS('unlink', `${outputDir}/${file}`);
                }
            }
            await this.ffmpeg.FS('rmdir', outputDir);
        } catch (e) {
            console.warn('Cleanup warning:', e);
        }
    }

    async validateFrame(blob) {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(blob);
            
            const timeout = setTimeout(() => {
                URL.revokeObjectURL(url);
                resolve({ valid: false, error: 'Load timeout' });
            }, 5000);
            
            img.onload = () => {
                clearTimeout(timeout);
                URL.revokeObjectURL(url);
                
                if (img.width < 10 || img.height < 10) {
                    resolve({ valid: false, error: 'Invalid dimensions' });
                    return;
                }
                
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                
                try {
                    const imageData = ctx.getImageData(0, 0, img.width, img.height);
                    const quality = this.analyzeImageQuality(imageData);
                    
                    if (quality.greenArtifactRatio > 0.1) {
                        resolve({ valid: false, error: 'Green artifacts detected', ...quality });
                        return;
                    }
                    
                    if (quality.zeroPixelRatio > 0.3) {
                        resolve({ valid: false, error: 'Too many zero pixels', ...quality });
                        return;
                    }
                    
                    resolve({ valid: true, ...quality });
                } catch (e) {
                    resolve({ valid: true, psnr: null });
                }
            };
            
            img.onerror = () => {
                clearTimeout(timeout);
                URL.revokeObjectURL(url);
                resolve({ valid: false, error: 'Image decode error' });
            };
            
            img.src = url;
        });
    }

    analyzeImageQuality(imageData) {
        const data = imageData.data;
        const totalPixels = imageData.width * imageData.height;
        
        let greenPixels = 0;
        let zeroPixels = 0;
        let totalBrightness = 0;
        let colorVarianceSum = 0;
        
        const sampleStep = Math.max(1, Math.floor(totalPixels / 10000));
        
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
            
            const avg = (r + g + b) / 3;
            totalBrightness += avg;
            
            const variance = Math.pow(r - avg, 2) + Math.pow(g - avg, 2) + Math.pow(b - avg, 2);
            colorVarianceSum += variance / 3;
        }
        
        const sampledPixels = Math.ceil(totalPixels / sampleStep);
        
        return {
            greenArtifactRatio: greenPixels / sampledPixels,
            zeroPixelRatio: zeroPixels / sampledPixels,
            avgBrightness: totalBrightness / sampledPixels,
            colorVariance: colorVarianceSum / sampledPixels,
            psnr: this.estimatePSNR(imageData)
        };
    }

    estimatePSNR(imageData) {
        const data = imageData.data;
        let mse = 0;
        const sampleStep = 10;
        
        for (let i = 0; i < data.length; i += 4 * sampleStep) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            mse += Math.pow(gray - 128, 2);
        }
        
        mse = mse / (data.length / (4 * sampleStep));
        
        if (mse === 0) return 50;
        return 10 * Math.log10((255 * 255) / mse);
    }

    async retryDecodeFrame(frameIndex, frameStep, outputDir) {
        const timestamp = (frameIndex * frameStep) / this.fps;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`Retry attempt ${attempt} for frame ${frameIndex} at ${timestamp}s`);
                
                const tempFile = `retry_${Date.now()}_${frameIndex}.jpg`;
                
                await this.ffmpeg.run(
                    '-hwaccel', 'none',
                    '-c:v', 'hevc',
                    '-ss', Math.max(0, timestamp - 0.5).toString(),
                    '-i', 'input_video.mp4',
                    '-vframes', '1',
                    '-q:v', '2',
                    '-pix_fmt', 'yuvj420p',
                    tempFile
                );
                
                const data = await this.ffmpeg.FS('readFile', tempFile);
                const blob = new Blob([data.buffer], { type: 'image/jpeg' });
                
                await this.ffmpeg.FS('unlink', tempFile);
                
                const validation = await this.validateFrame(blob);
                if (validation.valid) {
                    console.log(`Frame ${frameIndex} recovered on attempt ${attempt}`);
                    return {
                        index: frameIndex,
                        timestamp: timestamp,
                        blob: blob,
                        url: URL.createObjectURL(blob),
                        corrupted: false,
                        retried: true,
                        retryCount: attempt,
                        psnr: validation.psnr
                    };
                }
                
                await new Promise(r => setTimeout(r, 100 * attempt));
                
            } catch (e) {
                console.error(`Retry ${attempt} failed for frame ${frameIndex}:`, e);
            }
        }
        
        console.error(`All retries failed for frame ${frameIndex}`);
        return null;
    }

    async repairCorruptedFrames(frames, frameStep) {
        const corruptedIndices = frames
            .map((f, i) => f.corrupted ? i : -1)
            .filter(i => i !== -1);
        
        console.log(`Attempting to repair ${corruptedIndices.length} corrupted frames...`);
        
        for (const idx of corruptedIndices) {
            const repaired = await this.retryDecodeFrame(idx, frameStep, 'repair');
            if (repaired) {
                frames[idx] = repaired;
                this.corruptedFrames.delete(idx);
            }
        }
        
        return frames;
    }

    async getVideoInfo() {
        return {
            frameCount: this.frameCount,
            fps: this.fps,
            duration: this.duration,
            width: this.width,
            height: this.height,
            corruptedFrames: this.corruptedFrames.size,
            usesSoftwareDecoding: this.useSoftwareDecoding
        };
    }

    destroy() {
        if (this.ffmpeg) {
            try {
                this.ffmpeg.FS('unlink', 'input_video.mp4');
            } catch (e) {}
            this.ffmpeg = null;
        }
        this.initialized = false;
        this.videoFile = null;
    }
}
