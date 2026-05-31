import { FFmpegDecoder } from './ffmpegDecoder.js';
import { FrameBufferPool } from './frameBufferPool.js';
import { WebGLRenderer } from './webglRenderer.js';
import { VideoEncoder } from './videoEncoder.js';
import { FrameInterpolator, FrameTimeManager } from './frameInterpolator.js';

class VideoFilterApp {
    constructor() {
        this.decoder = null;
        this.framePool = new FrameBufferPool(200);
        this.renderer = null;
        this.encoder = null;
        this.videoFile = null;
        this.videoInfo = null;
        this.currentFrameIndex = 0;
        this.isPlaying = false;
        this.playbackInterval = null;
        this.filterType = 'none';
        this.filterParams = {};
        this.processedFrames = [];
        this.interpolator = null;
        this.timeManager = new FrameTimeManager();
        this.interpolatedFrames = [];
        this.isInterpolating = false;
        this.useInterpolatedFrames = false;
        
        this.initElements();
        this.initEventListeners();
        this.initRenderer();
    }

    initElements() {
        this.uploadArea = document.getElementById('uploadArea');
        this.videoInput = document.getElementById('videoInput');
        this.videoInfo = document.getElementById('videoInfo');
        this.videoResolution = document.getElementById('videoResolution');
        this.videoFps = document.getElementById('videoFps');
        this.videoDuration = document.getElementById('videoDuration');
        this.videoFrames = document.getElementById('videoFrames');
        
        this.filterSelect = document.getElementById('filterSelect');
        this.filterParamsDiv = document.getElementById('filterParams');
        this.styleTransferSection = document.getElementById('styleTransferSection');
        this.styleSelect = document.getElementById('styleSelect');
        this.apiUrl = document.getElementById('apiUrl');
        this.maxFramesInput = document.getElementById('maxFrames');
        this.workerCountInput = document.getElementById('workerCount');
        
        this.extractFramesBtn = document.getElementById('extractFramesBtn');
        this.processBtn = document.getElementById('processBtn');
        this.encodeBtn = document.getElementById('encodeBtn');
        
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        
        this.originalCanvas = document.getElementById('originalCanvas');
        this.processedCanvas = document.getElementById('processedCanvas');
        this.prevFrameBtn = document.getElementById('prevFrameBtn');
        this.nextFrameBtn = document.getElementById('nextFrameBtn');
        this.frameCounter = document.getElementById('frameCounter');
        this.playBtn = document.getElementById('playBtn');
        this.frameSlider = document.getElementById('frameSlider');
        
        this.framesGrid = document.getElementById('framesGrid');
        
        this.frameQualityInfo = document.getElementById('frameQualityInfo');
        this.decodeMode = document.getElementById('decodeMode');
        this.corruptedFramesSpan = document.getElementById('corruptedFrames');
        this.repairedFramesSpan = document.getElementById('repairedFrames');
        this.repairFramesBtn = document.getElementById('repairFramesBtn');
        
        this.sourceFpsInput = document.getElementById('sourceFps');
        this.targetFpsInput = document.getElementById('targetFps');
        this.interpolateBtn = document.getElementById('interpolateBtn');
        this.interpolationInfo = document.getElementById('interpolationInfo');
        this.interpolationFactor = document.getElementById('interpolationFactor');
        this.interpolatedFramesSpan = document.getElementById('interpolatedFrames');
        this.interpolationStatus = document.getElementById('interpolationStatus');
        
        this.repairedCount = 0;
    }

    initEventListeners() {
        this.uploadArea.addEventListener('click', () => this.videoInput.click());
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });
        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('dragover');
        });
        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleVideoFile(files[0]);
            }
        });
        
        this.videoInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleVideoFile(e.target.files[0]);
            }
        });
        
        this.filterSelect.addEventListener('change', (e) => {
            this.filterType = e.target.value;
            this.updateFilterParams();
            this.applyFilterToCurrentFrame();
        });
        
        this.extractFramesBtn.addEventListener('click', () => this.extractFrames());
        this.processBtn.addEventListener('click', () => this.processFrames());
        this.encodeBtn.addEventListener('click', () => this.encodeVideo());
        
        this.prevFrameBtn.addEventListener('click', () => this.prevFrame());
        this.nextFrameBtn.addEventListener('click', () => this.nextFrame());
        this.playBtn.addEventListener('click', () => this.togglePlayback());
        this.frameSlider.addEventListener('input', (e) => {
            this.currentFrameIndex = parseInt(e.target.value);
            
            if (this.useInterpolatedFrames && this.interpolatedFrames.length > 0) {
                this.showInterpolatedFrame(this.currentFrameIndex);
            } else {
                this.showFrame(this.currentFrameIndex);
            }
        });
        
        this.repairFramesBtn.addEventListener('click', () => this.repairCorruptedFrames());
        
        this.sourceFpsInput.addEventListener('change', () => this.updateInterpolationInfo());
        this.targetFpsInput.addEventListener('change', () => this.updateInterpolationInfo());
        this.interpolateBtn.addEventListener('click', () => this.startInterpolation());
    }

    async initRenderer() {
        try {
            this.renderer = new WebGLRenderer(this.processedCanvas);
            console.log('WebGL renderer initialized');
        } catch (e) {
            console.error('Failed to initialize WebGL renderer:', e);
            alert('WebGL not supported in your browser');
        }
    }

    async handleVideoFile(file) {
        this.videoFile = file;
        this.showProgress(0, '正在初始化 FFmpeg WASM...');
        
        try {
            this.decoder = new FFmpegDecoder();
            this.decoder.onProgress = (p) => {
                this.showProgress(p.ratio * 100, `正在加载 FFmpeg... ${Math.round(p.ratio * 100)}%`);
            };
            
            await this.decoder.init();
            
            this.showProgress(0, '正在分析视频文件...');
            const info = await this.decoder.loadVideo(file);
            this.videoInfo = info;
            
            this.displayVideoInfo(info);
            
            this.extractFramesBtn.disabled = false;
            this.showProgress(100, '视频加载完成，可提取帧进行处理');
            
        } catch (error) {
            console.error('Error loading video:', error);
            this.showProgress(0, '加载失败: ' + error.message);
            alert('视频加载失败: ' + error.message);
        }
    }

    displayVideoInfo(info) {
        this.videoResolution.textContent = `${info.width} × ${info.height}`;
        this.videoFps.textContent = info.fps.toFixed(2) + ' FPS';
        this.videoDuration.textContent = this.formatDuration(info.duration);
        this.videoFrames.textContent = info.frameCount.toLocaleString();
        this.videoInfo.style.display = 'block';
    }

    updateFrameQualityInfo() {
        const corruptedCount = this.decoder?.corruptedFrames?.size || 0;
        
        this.frameQualityInfo.style.display = 'block';
        this.decodeMode.textContent = this.decoder?.useSoftwareDecoding ? 'libx265 软解码' : '自动解码';
        this.decodeMode.style.color = this.decoder?.useSoftwareDecoding ? '#10b981' : '#f59e0b';
        
        this.corruptedFramesSpan.textContent = corruptedCount;
        this.corruptedFramesSpan.style.color = corruptedCount > 0 ? '#ef4444' : '#10b981';
        
        this.repairedFramesSpan.textContent = this.repairedCount;
        this.repairedFramesSpan.style.color = this.repairedCount > 0 ? '#10b981' : '#9ca3af';
        
        this.repairFramesBtn.style.display = corruptedCount > 0 ? 'inline-block' : 'none';
    }

    async extractFrames() {
        if (!this.decoder) return;
        
        const maxFrames = parseInt(this.maxFramesInput.value) || 50;
        this.showProgress(0, `正在提取帧 (最多 ${maxFrames} 帧)...`);
        
        try {
            this.framePool.reset();
            this.processedFrames = [];
            
            this.decoder.onFrame = (current, total, frame) => {
                this.framePool.addFrame(frame);
                const progress = (current / total) * 100;
                this.showProgress(progress, `正在提取帧: ${current}/${total}`);
            };
            
            const frames = await this.decoder.extractFrames('frames', 1, maxFrames);
            
            this.repairedCount = frames.filter(f => f.retried).length;
            
            this.showFrame(0);
            this.updateFrameControls();
            this.updateFramesGrid();
            this.updateFrameQualityInfo();
            
            this.processBtn.disabled = false;
            
            this.updateInterpolationInfo();
            
            const corruptedCount = this.decoder.corruptedFrames.size;
            if (corruptedCount > 0) {
                this.showProgress(100, `提取完成: ${frames.length} 帧 (${corruptedCount} 帧损坏, ${this.repairedCount} 帧已自动修复)`);
            } else {
                this.showProgress(100, `成功提取 ${frames.length} 帧 (全部正常)`);
            }
            
        } catch (error) {
            console.error('Error extracting frames:', error);
            this.showProgress(0, '提取帧失败: ' + error.message);
        }
    }

    async repairCorruptedFrames() {
        if (!this.decoder || this.decoder.corruptedFrames.size === 0) return;
        
        const corruptedCount = this.decoder.corruptedFrames.size;
        this.showProgress(0, `正在修复 ${corruptedCount} 个损坏帧...`);
        
        try {
            const frames = this.framePool.getAllFrames();
            const maxFrames = parseInt(this.maxFramesInput.value) || 50;
            const frameStep = Math.max(1, Math.floor(this.videoInfo.frameCount / maxFrames));
            
            const repairedFrames = await this.decoder.repairCorruptedFrames(frames, frameStep);
            
            for (let i = 0; i < repairedFrames.length; i++) {
                if (repairedFrames[i].retried && !repairedFrames[i].corrupted) {
                    this.framePool.pool[i] = repairedFrames[i];
                    this.repairedCount++;
                }
            }
            
            this.updateFramesGrid();
            this.updateFrameQualityInfo();
            
            const remainingCorrupted = this.decoder.corruptedFrames.size;
            if (remainingCorrupted === 0) {
                this.showProgress(100, `修复完成: 所有损坏帧已修复`);
            } else {
                this.showProgress(100, `修复完成: 仍有 ${remainingCorrupted} 帧无法修复`);
            }
            
        } catch (error) {
            console.error('Error repairing frames:', error);
            this.showProgress(0, '修复失败: ' + error.message);
        }
    }

    async updateInterpolationInfo() {
        const sourceFps = parseFloat(this.sourceFpsInput.value) || 24;
        const targetFps = parseFloat(this.targetFpsInput.value) || 60;
        const frameCount = this.framePool.size();
        
        if (frameCount < 2) {
            this.interpolationInfo.style.display = 'none';
            this.interpolateBtn.disabled = true;
            return;
        }
        
        const factor = targetFps / sourceFps;
        const totalFrames = Math.floor(frameCount * factor);
        const newFrames = totalFrames - frameCount;
        
        this.interpolationInfo.style.display = 'block';
        this.interpolationFactor.textContent = factor.toFixed(1) + 'x';
        this.interpolatedFramesSpan.textContent = newFrames;
        this.interpolateBtn.disabled = false;
        
        try {
            const apiUrl = this.apiUrl?.value || 'http://localhost:8000';
            const response = await fetch(`${apiUrl}/interpolate/info?source_fps=${sourceFps}&target_fps=${targetFps}`);
            const info = await response.json();
            
            if (info.uses_rife_model) {
                this.interpolationStatus.textContent = '使用 RIFE 真实模型';
            } else {
                this.interpolationStatus.textContent = '使用简化光流算法';
            }
        } catch (e) {
            this.interpolationStatus.textContent = '使用本地光流插帧';
        }
    }

    async startInterpolation() {
        const frames = this.framePool.getAllFrames();
        if (frames.length < 2) {
            alert('至少需要 2 帧才能进行补帧');
            return;
        }
        
        const sourceFps = parseFloat(this.sourceFpsInput.value) || 24;
        const targetFps = parseFloat(this.targetFpsInput.value) || 60;
        
        this.isInterpolating = true;
        this.interpolateBtn.disabled = true;
        this.interpolateBtn.textContent = '补帧中...';
        
        try {
            const apiUrl = this.apiUrl?.value || 'http://localhost:8000';
            this.interpolator = new FrameInterpolator(apiUrl);
            
            this.interpolator.onProgress = (progress, processed, total) => {
                const percent = progress * 100;
                this.showProgress(percent, `AI 补帧中: ${Math.round(percent)}% (${processed}/${total})`);
            };
            
            this.showProgress(0, '正在准备帧数据...');
            
            const sourceFrames = frames.map(f => ({
                index: f.index,
                timestamp: f.timestamp,
                blob: f.blob,
                url: f.url
            }));
            
            this.timeManager.clear();
            this.timeManager.addFrames(sourceFrames);
            this.timeManager.setSourceFps(sourceFps);
            this.timeManager.setTargetFps(targetFps);
            
            this.interpolatedFrames = await this.interpolator.interpolateSequence(
                sourceFrames,
                sourceFps,
                targetFps
            );
            
            this.timeManager.clear();
            this.timeManager.addFrames(this.interpolatedFrames);
            this.timeManager.syncTimestamps();
            
            this.useInterpolatedFrames = true;
            this.currentFrameIndex = 0;
            
            this.updateFrameControlsForInterpolation();
            this.updateFramesGridWithInterpolation();
            
            this.showProgress(100, `补帧完成: ${frames.length} 帧 → ${this.interpolatedFrames.length} 帧`);
            
        } catch (error) {
            console.error('Interpolation error:', error);
            this.showProgress(0, '补帧失败: ' + error.message);
        } finally {
            this.isInterpolating = false;
            this.interpolateBtn.disabled = false;
            this.interpolateBtn.textContent = '启动 AI 补帧';
        }
    }

    updateFrameControlsForInterpolation() {
        const totalFrames = this.interpolatedFrames.length;
        
        this.prevFrameBtn.disabled = totalFrames === 0;
        this.nextFrameBtn.disabled = totalFrames === 0;
        this.playBtn.disabled = totalFrames === 0;
        this.frameSlider.disabled = totalFrames === 0;
        this.frameSlider.max = Math.max(0, totalFrames - 1);
        this.frameSlider.value = 0;
        
        this.updateFrameCounterForInterpolation();
        this.showInterpolatedFrame(0);
    }

    updateFrameCounterForInterpolation() {
        const totalFrames = this.interpolatedFrames.length;
        const originalFrames = this.interpolatedFrames.filter(f => !f.is_interpolated).length;
        const newFrames = totalFrames - originalFrames;
        
        this.frameCounter.textContent = `${this.currentFrameIndex + 1} / ${totalFrames} (${newFrames} 插帧)`;
    }

    showInterpolatedFrame(index) {
        if (index < 0 || index >= this.interpolatedFrames.length) return;
        
        const frame = this.interpolatedFrames[index];
        if (!frame) return;
        
        const originalCtx = this.originalCanvas.getContext('2d');
        const img = new Image();
        
        img.onload = () => {
            this.originalCanvas.width = img.width;
            this.originalCanvas.height = img.height;
            originalCtx.drawImage(img, 0, 0);
            
            if (frame.is_interpolated) {
                this.renderer.loadImage(img);
                this.renderer.setFilter('none');
                this.renderer.render();
            } else {
                this.applyFilterToCurrentFrame();
            }
        };
        img.src = frame.url;
        
        this.updateFrameCounterForInterpolation();
    }

    updateFramesGridWithInterpolation() {
        this.framesGrid.innerHTML = '';
        
        this.interpolatedFrames.forEach((frame, index) => {
            const thumbnail = document.createElement('div');
            thumbnail.className = 'frame-thumbnail';
            thumbnail.dataset.index = index;
            
            if (frame.is_interpolated) {
                thumbnail.style.position = 'relative';
                
                const badge = document.createElement('div');
                badge.style.cssText = 'position:absolute;top:4px;right:4px;background:#f59e0b;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;z-index:10;';
                badge.textContent = 'AI';
                thumbnail.appendChild(badge);
            }
            
            const img = document.createElement('img');
            img.src = frame.url;
            
            thumbnail.appendChild(img);
            thumbnail.addEventListener('click', () => {
                this.currentFrameIndex = index;
                this.frameSlider.value = index;
                this.showInterpolatedFrame(index);
            });
            
            this.framesGrid.appendChild(thumbnail);
        });
    }

    async processFrames() {
        const filterType = this.filterSelect.value;
        if (filterType === 'none') {
            alert('请先选择一个滤镜');
            return;
        }
        
        const totalFrames = this.framePool.size();
        if (totalFrames === 0) {
            alert('没有可处理的帧，请先提取帧');
            return;
        }
        
        this.processedFrames = [];
        
        if (filterType === 'style_transfer') {
            await this.processWithStyleTransfer();
        } else {
            await this.processWithWebGL(filterType);
        }
        
        this.encodeBtn.disabled = false;
    }

    async processWithWebGL(filterType) {
        const totalFrames = this.framePool.size();
        const workerCount = parseInt(this.workerCountInput.value) || 4;
        
        this.showProgress(0, `正在应用 ${filterType} 滤镜...`);
        
        try {
            const originalCtx = this.originalCanvas.getContext('2d');
            
            for (let i = 0; i < totalFrames; i++) {
                const frame = this.framePool.getFrame(i);
                if (!frame) continue;
                
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = frame.url;
                });
                
                this.originalCanvas.width = img.width;
                this.originalCanvas.height = img.height;
                originalCtx.drawImage(img, 0, 0);
                
                this.renderer.loadImage(img);
                this.renderer.setFilter(filterType, this.filterParams);
                this.renderer.render();
                
                const processedBlob = await new Promise(resolve => {
                    this.processedCanvas.toBlob(resolve, 'image/jpeg', 0.9);
                });
                
                this.processedFrames.push({
                    index: i,
                    blob: processedBlob,
                    url: URL.createObjectURL(processedBlob),
                    timestamp: frame.timestamp
                });
                
                frame.processed = true;
                frame.processedUrl = URL.createObjectURL(processedBlob);
                
                const progress = ((i + 1) / totalFrames) * 100;
                this.showProgress(progress, `处理帧 ${i + 1}/${totalFrames}`);
            }
            
            this.showProgress(100, '滤镜处理完成');
            this.showFrame(this.currentFrameIndex);
            
        } catch (error) {
            console.error('Error processing frames:', error);
            this.showProgress(0, '处理失败: ' + error.message);
        }
    }

    async processWithStyleTransfer() {
        const apiUrl = this.apiUrl.value || 'http://localhost:8000';
        const style = this.styleSelect.value;
        const totalFrames = this.framePool.size();
        
        this.showProgress(0, '正在准备风格迁移请求...');
        
        try {
            const framesData = [];
            for (let i = 0; i < Math.min(totalFrames, 10); i++) {
                const frame = this.framePool.getFrame(i);
                if (!frame) continue;
                
                const response = await fetch(frame.url);
                const blob = await response.blob();
                const base64 = await this.blobToBase64(blob);
                
                framesData.push({
                    frame_index: i,
                    image_base64: base64.split(',')[1]
                });
            }
            
            this.showProgress(10, '正在发送到 AI 风格迁移服务...');
            
            const response = await fetch(`${apiUrl}/stylize/batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    frames: framesData,
                    style: style
                })
            });
            
            const result = await response.json();
            const taskId = result.task_id;
            
            this.showProgress(30, '正在处理风格迁移...');
            
            let taskComplete = false;
            let attempts = 0;
            
            while (!taskComplete && attempts < 60) {
                await new Promise(r => setTimeout(r, 1000));
                
                const statusResponse = await fetch(`${apiUrl}/tasks/${taskId}`);
                const status = await statusResponse.json();
                
                this.showProgress(30 + status.progress * 60, 
                    `风格迁移进度: ${Math.round(status.progress * 100)}% (${status.processed_frames}/${status.total_frames})`);
                
                if (status.status === 'completed') {
                    taskComplete = true;
                    
                    for (const resultFrame of status.results) {
                        if (resultFrame.image_base64) {
                            const base64Data = 'data:image/jpeg;base64,' + resultFrame.image_base64;
                            const blob = await this.base64ToBlob(base64Data);
                            
                            this.processedFrames.push({
                                index: resultFrame.frame_index,
                                blob: blob,
                                url: URL.createObjectURL(blob)
                            });
                            
                            const originalFrame = this.framePool.getFrame(resultFrame.frame_index);
                            if (originalFrame) {
                                originalFrame.processed = true;
                                originalFrame.processedUrl = URL.createObjectURL(blob);
                            }
                        }
                    }
                }
                
                attempts++;
            }
            
            if (taskComplete) {
                this.showProgress(100, '风格迁移完成');
                this.showFrame(this.currentFrameIndex);
            } else {
                this.showProgress(0, '风格迁移超时');
            }
            
        } catch (error) {
            console.error('Error in style transfer:', error);
            this.showProgress(0, '风格迁移失败: ' + error.message);
        }
    }

    async encodeVideo() {
        let framesToEncode = [];
        let fps;
        let encodeType = '';
        
        if (this.useInterpolatedFrames && this.interpolatedFrames.length > 0) {
            framesToEncode = this.interpolatedFrames;
            fps = parseFloat(this.targetFpsInput.value) || 60;
            encodeType = 'interpolated';
        } else if (this.processedFrames.length > 0) {
            framesToEncode = [...this.processedFrames].sort((a, b) => a.index - b.index);
            fps = this.videoInfo?.fps || 30;
            encodeType = 'filtered';
        } else {
            alert('没有可编码的帧');
            return;
        }
        
        this.showProgress(0, '正在编码视频...');
        
        try {
            this.encoder = new VideoEncoder({ fps });
            
            const firstFrame = framesToEncode[0];
            
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = firstFrame.url;
            });
            
            this.encoder.init(img.width, img.height, fps);
            this.encoder.start();
            
            const frameInterval = 1000 / fps;
            
            for (let i = 0; i < framesToEncode.length; i++) {
                const frame = framesToEncode[i];
                
                const frameImg = new Image();
                await new Promise((resolve, reject) => {
                    frameImg.onload = resolve;
                    frameImg.onerror = reject;
                    frameImg.src = frame.url;
                });
                
                this.encoder.addFrame(frameImg);
                
                const progress = ((i + 1) / framesToEncode.length) * 100;
                this.showProgress(progress, `编码帧 ${i + 1}/${framesToEncode.length}`);
                
                await new Promise(r => setTimeout(r, frameInterval));
            }
            
            const blob = await this.encoder.stop();
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            let fileName;
            
            if (encodeType === 'interpolated') {
                const sourceFps = parseFloat(this.sourceFpsInput.value) || 24;
                fileName = `${sourceFps}fps_to_${fps}fps_${timestamp}.webm`;
            } else {
                fileName = `filtered_${this.filterType}_${timestamp}.webm`;
            }
            
            this.encoder.download(blob, fileName);
            
            this.showProgress(100, `视频已保存: ${fileName}`);
            
        } catch (error) {
            console.error('Error encoding video:', error);
            this.showProgress(0, '编码失败: ' + error.message);
        }
    }

    showFrame(index) {
        const frame = this.framePool.getFrame(index);
        if (!frame) return;
        
        const originalCtx = this.originalCanvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
            this.originalCanvas.width = img.width;
            this.originalCanvas.height = img.height;
            originalCtx.drawImage(img, 0, 0);
            
            if (frame.processed && frame.processedUrl) {
                const processedImg = new Image();
                processedImg.onload = () => {
                    this.renderer.loadImage(processedImg);
                    this.renderer.setFilter('none');
                    this.renderer.render();
                };
                processedImg.src = frame.processedUrl;
            } else {
                this.applyFilterToCurrentFrame();
            }
        };
        img.src = frame.url;
        
        this.updateFrameCounter();
        this.updateActiveThumbnail(index);
    }

    applyFilterToCurrentFrame() {
        const frame = this.framePool.getFrame(this.currentFrameIndex);
        if (!frame) return;
        
        const img = new Image();
        img.onload = () => {
            this.renderer.loadImage(img);
            this.renderer.setFilter(this.filterType, this.filterParams);
            this.renderer.render();
        };
        img.src = frame.url;
    }

    prevFrame() {
        if (this.currentFrameIndex > 0) {
            this.currentFrameIndex--;
            this.frameSlider.value = this.currentFrameIndex;
            
            if (this.useInterpolatedFrames && this.interpolatedFrames.length > 0) {
                this.showInterpolatedFrame(this.currentFrameIndex);
            } else {
                this.showFrame(this.currentFrameIndex);
            }
        }
    }

    nextFrame() {
        const maxIndex = this.useInterpolatedFrames ? 
            this.interpolatedFrames.length - 1 : 
            this.framePool.size() - 1;
            
        if (this.currentFrameIndex < maxIndex) {
            this.currentFrameIndex++;
            this.frameSlider.value = this.currentFrameIndex;
            
            if (this.useInterpolatedFrames && this.interpolatedFrames.length > 0) {
                this.showInterpolatedFrame(this.currentFrameIndex);
            } else {
                this.showFrame(this.currentFrameIndex);
            }
        }
    }

    togglePlayback() {
        if (this.isPlaying) {
            this.stopPlayback();
        } else {
            this.startPlayback();
        }
    }

    startPlayback() {
        const hasFrames = this.useInterpolatedFrames ? 
            this.interpolatedFrames.length > 0 : 
            this.framePool.size() > 0;
            
        if (!hasFrames) return;
        
        this.isPlaying = true;
        this.playBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
            暂停
        `;
        
        let fps;
        if (this.useInterpolatedFrames) {
            fps = parseFloat(this.targetFpsInput.value) || 60;
        } else {
            fps = this.videoInfo?.fps || 30;
        }
        
        const interval = 1000 / fps;
        const maxIndex = this.useInterpolatedFrames ? 
            this.interpolatedFrames.length - 1 : 
            this.framePool.size() - 1;
        
        this.playbackInterval = setInterval(() => {
            if (this.currentFrameIndex < maxIndex) {
                this.nextFrame();
            } else {
                this.currentFrameIndex = 0;
                this.frameSlider.value = 0;
                
                if (this.useInterpolatedFrames) {
                    this.showInterpolatedFrame(0);
                } else {
                    this.showFrame(0);
                }
            }
        }, interval);
    }

    stopPlayback() {
        this.isPlaying = false;
        this.playBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            播放
        `;
        
        if (this.playbackInterval) {
            clearInterval(this.playbackInterval);
            this.playbackInterval = null;
        }
    }

    updateFrameControls() {
        const totalFrames = this.framePool.size();
        
        this.prevFrameBtn.disabled = totalFrames === 0;
        this.nextFrameBtn.disabled = totalFrames === 0;
        this.playBtn.disabled = totalFrames === 0;
        this.frameSlider.disabled = totalFrames === 0;
        this.frameSlider.max = Math.max(0, totalFrames - 1);
        
        this.updateFrameCounter();
    }

    updateFrameCounter() {
        const totalFrames = this.framePool.size();
        this.frameCounter.textContent = `${this.currentFrameIndex + 1} / ${totalFrames}`;
    }

    updateFramesGrid() {
        this.framesGrid.innerHTML = '';
        
        const frames = this.framePool.getAllFrames();
        frames.forEach((frame, index) => {
            const thumbnail = document.createElement('div');
            thumbnail.className = 'frame-thumbnail';
            thumbnail.dataset.index = index;
            
            if (frame.corrupted) {
                thumbnail.style.borderColor = '#ef4444';
                thumbnail.style.position = 'relative';
                
                const badge = document.createElement('div');
                badge.style.cssText = 'position:absolute;top:4px;right:4px;background:#ef4444;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;';
                badge.textContent = '损坏';
                thumbnail.appendChild(badge);
            } else if (frame.retried) {
                thumbnail.style.borderColor = '#f59e0b';
                thumbnail.style.position = 'relative';
                
                const badge = document.createElement('div');
                badge.style.cssText = 'position:absolute;top:4px;right:4px;background:#f59e0b;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;';
                badge.textContent = '已修复';
                thumbnail.appendChild(badge);
            }
            
            const img = document.createElement('img');
            img.src = frame.url;
            
            thumbnail.appendChild(img);
            thumbnail.addEventListener('click', () => {
                this.currentFrameIndex = index;
                this.frameSlider.value = index;
                this.showFrame(index);
            });
            
            this.framesGrid.appendChild(thumbnail);
        });
    }

    updateActiveThumbnail(index) {
        document.querySelectorAll('.frame-thumbnail').forEach(thumb => {
            thumb.classList.remove('active');
            if (parseInt(thumb.dataset.index) === index) {
                thumb.classList.add('active');
            }
        });
    }

    updateFilterParams() {
        this.filterParamsDiv.innerHTML = '';
        this.filterParams = {};
        
        const filterType = this.filterSelect.value;
        this.styleTransferSection.style.display = filterType === 'style_transfer' ? 'block' : 'none';
        
        const paramConfigs = {
            sketch: [
                { name: 'intensity', label: '强度', min: 0.1, max: 3, step: 0.1, default: 1 },
                { name: 'edgeThreshold', label: '边缘阈值', min: 0, max: 100, step: 1, default: 30 }
            ],
            oil: [
                { name: 'radius', label: '半径', min: 1, max: 10, step: 1, default: 4 },
                { name: 'levels', label: '色阶', min: 5, max: 50, step: 1, default: 20 }
            ],
            pixelate: [
                { name: 'blockSize', label: '块大小', min: 2, max: 50, step: 1, default: 8 }
            ],
            blur: [
                { name: 'radius', label: '模糊半径', min: 1, max: 10, step: 1, default: 3 }
            ],
            sharpen: [
                { name: 'amount', label: '锐化程度', min: 0.1, max: 3, step: 0.1, default: 1 }
            ],
            edge: [
                { name: 'threshold', label: '阈值', min: 0, max: 255, step: 1, default: 50 }
            ],
            cartoon: [
                { name: 'threshold', label: '边缘阈值', min: 0, max: 50, step: 1, default: 15 },
                { name: 'levels', label: '色彩等级', min: 2, max: 16, step: 1, default: 8 }
            ]
        };
        
        const config = paramConfigs[filterType];
        if (!config) return;
        
        config.forEach(param => {
            this.filterParams[param.name] = param.default;
            
            const group = document.createElement('div');
            group.className = 'param-group';
            
            const label = document.createElement('label');
            label.innerHTML = `<span>${param.label}</span><span class="param-value" id="value-${param.name}">${param.default}</span>`;
            
            const input = document.createElement('input');
            input.type = 'range';
            input.min = param.min;
            input.max = param.max;
            input.step = param.step;
            input.value = param.default;
            
            input.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                this.filterParams[param.name] = value;
                document.getElementById(`value-${param.name}`).textContent = value;
                this.applyFilterToCurrentFrame();
            });
            
            group.appendChild(label);
            group.appendChild(input);
            this.filterParamsDiv.appendChild(group);
        });
    }

    showProgress(percent, text) {
        this.progressFill.style.width = percent + '%';
        this.progressText.textContent = text;
    }

    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async base64ToBlob(base64) {
        const response = await fetch(base64);
        return await response.blob();
    }

    destroy() {
        this.stopPlayback();
        if (this.decoder) {
            this.decoder.destroy();
        }
        if (this.renderer) {
            this.renderer.destroy();
        }
        if (this.encoder) {
            this.encoder.destroy();
        }
        this.framePool.clear();
    }
}

const app = new VideoFilterApp();
window.addEventListener('beforeunload', () => {
    app.destroy();
});
