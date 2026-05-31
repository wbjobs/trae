export class VideoEncoder {
    constructor(options = {}) {
        this.fps = options.fps || 30;
        this.width = options.width || 1280;
        this.height = options.height || 720;
        this.codec = options.codec || 'webm';
        this.quality = options.quality || 0.8;
        this.mediaRecorder = null;
        this.stream = null;
        this.chunks = [];
        this.isRecording = false;
        this.canvas = null;
        this.ctx = null;
    }

    init(width, height, fps = 30) {
        this.width = width;
        this.height = height;
        this.fps = fps;
        
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d');
        
        this.stream = this.canvas.captureStream(fps);
        
        const mimeTypes = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm'
        ];
        
        let selectedMimeType = '';
        for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                selectedMimeType = type;
                break;
            }
        }
        
        if (!selectedMimeType) {
            throw new Error('No supported video codec found');
        }
        
        this.mediaRecorder = new MediaRecorder(this.stream, {
            mimeType: selectedMimeType,
            videoBitsPerSecond: Math.floor(2500000 * this.quality)
        });
        
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.chunks.push(e.data);
            }
        };
        
        this.mediaRecorder.onstop = () => {
            if (this.onStop) {
                const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType });
                this.onStop(blob);
            }
        };
    }

    start() {
        if (this.isRecording) return;
        if (!this.mediaRecorder) {
            throw new Error('Encoder not initialized');
        }
        
        this.chunks = [];
        this.isRecording = true;
        this.mediaRecorder.start();
    }

    addFrame(imageData) {
        if (!this.isRecording || !this.ctx) return;
        
        if (imageData instanceof ImageData) {
            this.ctx.putImageData(imageData, 0, 0);
        } else if (imageData instanceof HTMLCanvasElement) {
            this.ctx.drawImage(imageData, 0, 0);
        } else if (imageData instanceof HTMLImageElement) {
            this.ctx.drawImage(imageData, 0, 0, this.width, this.height);
        } else if (typeof imageData === 'string') {
            const img = new Image();
            img.src = imageData;
            this.ctx.drawImage(img, 0, 0, this.width, this.height);
        }
    }

    addFrameFromCanvas(canvas) {
        if (!this.isRecording || !this.ctx) return;
        this.ctx.drawImage(canvas, 0, 0);
    }

    stop() {
        if (!this.isRecording) return;
        
        this.isRecording = false;
        return new Promise((resolve) => {
            this.onStop = (blob) => {
                resolve(blob);
            };
            this.mediaRecorder.stop();
        });
    }

    async encodeFrames(frames, onProgress = null) {
        if (frames.length === 0) {
            throw new Error('No frames to encode');
        }
        
        const firstFrame = frames[0];
        let width = this.width;
        let height = this.height;
        
        if (firstFrame.imageData) {
            width = firstFrame.imageData.width;
            height = firstFrame.imageData.height;
        } else if (firstFrame.canvas) {
            width = firstFrame.canvas.width;
            height = firstFrame.canvas.height;
        }
        
        this.init(width, height, this.fps);
        this.start();
        
        const frameInterval = 1000 / this.fps;
        let lastTime = 0;
        
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            
            if (frame.imageData) {
                this.addFrame(frame.imageData);
            } else if (frame.canvas) {
                this.addFrameFromCanvas(frame.canvas);
            } else if (frame.dataUrl) {
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = frame.dataUrl;
                });
                this.addFrame(img);
            }
            
            if (onProgress) {
                onProgress(i + 1, frames.length);
            }
            
            await this._delay(frameInterval);
        }
        
        return this.stop();
    }

    async download(blob, filename = 'output.webm') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    destroy() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        this.chunks = [];
        this.isRecording = false;
        this.mediaRecorder = null;
        this.stream = null;
        this.canvas = null;
        this.ctx = null;
    }
}

export class FFmpegVideoEncoder {
    constructor() {
        this.ffmpeg = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        
        const { createFFmpeg, fetchFile } = FFmpeg;
        this.ffmpeg = createFFmpeg({
            log: true,
            corePath: 'https://unpkg.com/@ffmpeg/core@0.10.0/dist/ffmpeg-core.js'
        });
        
        await this.ffmpeg.load();
        this.initialized = true;
    }

    async encodeFrames(frames, fps = 30, outputFormat = 'mp4') {
        if (!this.initialized) {
            await this.init();
        }
        
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            const fileName = `frame_${String(i).padStart(6, '0')}.jpg`;
            
            if (frame.blob) {
                await this.ffmpeg.FS('writeFile', fileName, await fetchFile(frame.blob));
            } else if (frame.dataUrl) {
                const response = await fetch(frame.dataUrl);
                const blob = await response.blob();
                await this.ffmpeg.FS('writeFile', fileName, await fetchFile(blob));
            }
        }
        
        const outputFileName = `output.${outputFormat}`;
        
        await this.ffmpeg.run(
            '-framerate', fps.toString(),
            '-i', 'frame_%06d.jpg',
            '-c:v', outputFormat === 'mp4' ? 'libx264' : 'libvpx-vp9',
            '-pix_fmt', outputFormat === 'mp4' ? 'yuv420p' : 'yuv420p',
            '-crf', '23',
            outputFileName
        );
        
        const data = await this.ffmpeg.FS('readFile', outputFileName);
        
        for (let i = 0; i < frames.length; i++) {
            try {
                await this.ffmpeg.FS('unlink', `frame_${String(i).padStart(6, '0')}.jpg`);
            } catch (e) {}
        }
        await this.ffmpeg.FS('unlink', outputFileName);
        
        const mimeType = outputFormat === 'mp4' ? 'video/mp4' : 'video/webm';
        return new Blob([data.buffer], { type: mimeType });
    }

    destroy() {
        if (this.ffmpeg) {
            this.ffmpeg = null;
        }
        this.initialized = false;
    }
}
