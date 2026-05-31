class App {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('output-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.loadingOverlay = document.getElementById('loading-overlay');
        
        this.faceDetector = new FaceDetector();
        this.subtitleRenderer = new SubtitleRenderer();
        this.wsClient = new WebSocketClient('ws://localhost:8765');
        this.fakeSubtitleGenerator = new FakeSubtitleGenerator();
        
        this.isRunning = false;
        this.isPrivacyMode = false;
        this.animationFrameId = null;
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.fps = 0;
        
        this.options = {
            pixelationLevel: 15,
            confidenceThreshold: 0.7,
            enableBlur: true,
            enableSubtitle: true,
            subtitleSize: 28,
            mosaicBlockSize: 25
        };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupWebSocketCallbacks();
        this.loadFaceModel();
    }

    setupEventListeners() {
        document.getElementById('start-btn').addEventListener('click', () => this.start());
        document.getElementById('stop-btn').addEventListener('click', () => this.stop());
        
        document.getElementById('pixelation-level').addEventListener('input', (e) => {
            this.options.pixelationLevel = parseInt(e.target.value);
            document.getElementById('pixelation-value').textContent = e.target.value;
        });
        
        document.getElementById('confidence-threshold').addEventListener('input', (e) => {
            this.options.confidenceThreshold = parseFloat(e.target.value);
            document.getElementById('confidence-value').textContent = parseFloat(e.target.value).toFixed(2);
        });
        
        document.getElementById('subtitle-size').addEventListener('input', (e) => {
            this.options.subtitleSize = parseInt(e.target.value);
            this.subtitleRenderer.setFontSize(this.options.subtitleSize);
            document.getElementById('subtitle-size-value').textContent = e.target.value + 'px';
        });
        
        document.getElementById('enable-blur').addEventListener('change', (e) => {
            this.options.enableBlur = e.target.checked;
        });
        
        document.getElementById('enable-subtitle').addEventListener('change', (e) => {
            this.options.enableSubtitle = e.target.checked;
            this.subtitleRenderer.setEnable(e.target.checked);
        });
        
        document.getElementById('enable-privacy').addEventListener('change', (e) => {
            this.togglePrivacyMode(e.target.checked);
        });
    }

    setupWebSocketCallbacks() {
        this.wsClient.setOnMessageCallback((text, latency, isFinal) => {
            this.subtitleRenderer.addSubtitle(text, Date.now(), latency);
            this.addSubtitleToLog(text, latency, isFinal);
        });
        
        this.wsClient.setOnStatusChangeCallback((status) => {
            this.updateWSStatus(status);
            
            if (status === 'reconnecting') {
                this.showReconnectingBanner();
                this.hideNoSubtitleBanner();
            } else if (status === 'connected') {
                this.hideReconnectingBanner();
                this.hideNoSubtitleBanner();
            }
        });
        
        this.wsClient.setOnReconnectSuccessCallback(async () => {
            console.log('重连成功，恢复音频流');
            this.hideReconnectingBanner();
            this.hideNoSubtitleBanner();
            
            if (this.isRunning) {
                try {
                    await this.wsClient.startRecording();
                    console.log('音频流已恢复');
                } catch (error) {
                    console.error('恢复音频流失败:', error);
                }
            }
        });
        
        this.wsClient.setOnReconnectFailedCallback(() => {
            console.log('重连失败，进入无字幕模式');
            this.hideReconnectingBanner();
            this.showNoSubtitleBanner();
            this.subtitleRenderer.clear();
        });
    }

    async loadFaceModel() {
        try {
            await this.faceDetector.init();
            this.updateFaceDetectStatus('ready');
            this.hideLoading();
        } catch (error) {
            console.error('加载人脸模型失败:', error);
            this.updateFaceDetectStatus('error');
            this.hideLoading();
            alert('人脸检测模型加载失败，请刷新页面重试');
        }
    }

    async start() {
        if (this.isRunning) return;
        
        try {
            await this.startCamera();
            await this.wsClient.connect();
            await this.wsClient.startRecording();
            
            this.isRunning = true;
            this.updateUIState(true);
            this.processFrame();
            
        } catch (error) {
            console.error('启动系统失败:', error);
            alert('启动失败: ' + error.message);
            this.stop();
        }
    }

    async startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                },
                audio: false
            });
            
            this.video.srcObject = stream;
            
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    resolve();
                };
            });
            
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            
            this.updateCameraStatus('connected');
            console.log('摄像头已启动');
            
        } catch (error) {
            console.error('启动摄像头失败:', error);
            throw new Error('无法访问摄像头，请确保已授权');
        }
    }

    async processFrame() {
        if (!this.isRunning) return;
        
        const now = performance.now();
        this.frameCount++;
        
        if (now - this.lastFrameTime >= 1000) {
            this.fps = Math.round(this.frameCount * 1000 / (now - this.lastFrameTime));
            this.frameCount = 0;
            this.lastFrameTime = now;
            this.updateFPS();
        }
        
        try {
            if (this.isPrivacyMode) {
                await this.faceDetector.applyFullMosaic(
                    this.video, 
                    this.canvas, 
                    this.options.mosaicBlockSize
                );
                this.updateFaceCount(0);
            } else {
                const faces = await this.faceDetector.processFrame(this.video, this.canvas, {
                    pixelationLevel: this.options.pixelationLevel,
                    confidenceThreshold: this.options.confidenceThreshold,
                    enableBlur: this.options.enableBlur
                });
                
                this.updateFaceCount(faces.length);
            }
            
            this.subtitleRenderer.render(this.ctx, this.canvas.width, this.canvas.height);
            
            this.updateSubtitleLatency();
            
        } catch (error) {
            console.error('处理帧失败:', error);
        }
        
        this.animationFrameId = requestAnimationFrame(() => this.processFrame());
    }

    stop() {
        this.isRunning = false;
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
        }
        
        this.wsClient.disconnect();
        this.fakeSubtitleGenerator.stop();
        this.subtitleRenderer.clear();
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.hideReconnectingBanner();
        this.hideNoSubtitleBanner();
        this.hidePrivacyBanner();
        
        this.isPrivacyMode = false;
        document.getElementById('enable-privacy').checked = false;
        
        this.updateUIState(false);
        this.updateCameraStatus('disconnected');
        this.updateWSStatus('disconnected');
        
        console.log('系统已停止');
    }

    async togglePrivacyMode(enable) {
        if (enable === this.isPrivacyMode) return;
        
        this.isPrivacyMode = enable;
        
        if (enable) {
            console.log('启用隐私模式');
            this.showPrivacyBanner();
            
            this.wsClient.stopRecording();
            this.wsClient.disconnect();
            
            this.fakeSubtitleGenerator.start((text) => {
                this.subtitleRenderer.addSubtitle(text, Date.now(), 0);
                this.addSubtitleToLog(text, 0, true);
            }, 2500);
            
        } else {
            console.log('禁用隐私模式');
            this.hidePrivacyBanner();
            
            this.fakeSubtitleGenerator.stop();
            this.subtitleRenderer.clear();
            
            if (this.isRunning) {
                try {
                    await this.wsClient.connect();
                    await this.wsClient.startRecording();
                } catch (error) {
                    console.error('重新连接WebSocket失败:', error);
                }
            }
        }
    }

    updateUIState(isRunning) {
        document.getElementById('start-btn').disabled = isRunning;
        document.getElementById('stop-btn').disabled = !isRunning;
    }

    updateCameraStatus(status) {
        const statusEl = document.getElementById('camera-status');
        const indicator = statusEl.querySelector('.indicator');
        const text = statusEl.querySelector('span:last-child');
        
        switch (status) {
            case 'connected':
                indicator.classList.add('active');
                indicator.classList.remove('connecting');
                text.textContent = '摄像头: 已连接';
                break;
            case 'disconnected':
                indicator.classList.remove('active', 'connecting');
                text.textContent = '摄像头: 未连接';
                break;
        }
    }

    updateFaceDetectStatus(status) {
        const statusEl = document.getElementById('face-detect-status');
        const indicator = statusEl.querySelector('.indicator');
        const text = statusEl.querySelector('span:last-child');
        
        switch (status) {
            case 'ready':
                indicator.classList.add('active');
                indicator.classList.remove('connecting');
                text.textContent = '人脸检测: 就绪';
                break;
            case 'error':
                indicator.classList.remove('active');
                indicator.classList.add('connecting');
                text.textContent = '人脸检测: 错误';
                break;
            default:
                indicator.classList.add('connecting');
                text.textContent = '人脸检测: 加载中...';
        }
    }

    updateWSStatus(status) {
        const statusEl = document.getElementById('ws-status');
        const indicator = statusEl.querySelector('.indicator');
        const text = statusEl.querySelector('span:last-child');
        
        switch (status) {
            case 'connected':
                indicator.classList.add('active');
                indicator.classList.remove('connecting');
                text.textContent = 'WebSocket: 已连接';
                break;
            case 'connecting':
                indicator.classList.add('connecting');
                indicator.classList.remove('active');
                text.textContent = 'WebSocket: 连接中...';
                break;
            case 'reconnecting':
                indicator.classList.add('connecting');
                indicator.classList.remove('active');
                text.textContent = 'WebSocket: 重连中...';
                break;
            case 'reconnect_failed':
                indicator.classList.remove('active', 'connecting');
                text.textContent = 'WebSocket: 已断开(无字幕)';
                break;
            case 'error':
                indicator.classList.remove('active');
                indicator.classList.add('connecting');
                text.textContent = 'WebSocket: 错误';
                break;
            default:
                indicator.classList.remove('active', 'connecting');
                text.textContent = 'WebSocket: 未连接';
        }
    }

    updateFaceCount(count) {
        document.getElementById('face-count').textContent = count;
    }

    updateFPS() {
        document.getElementById('fps').textContent = this.fps;
    }

    updateSubtitleLatency() {
        const latency = this.subtitleRenderer.getLatestLatency();
        document.getElementById('subtitle-latency').textContent = latency;
    }

    addSubtitleToLog(text, latency, isFinal) {
        const logEl = document.getElementById('subtitle-log');
        const entry = document.createElement('div');
        entry.className = 'subtitle-entry';
        
        const time = new Date().toLocaleTimeString();
        const finalMarker = isFinal ? ' [定稿]' : ' [识别中]';
        
        entry.innerHTML = `<span class="subtitle-timestamp">${time}</span>${text}${finalMarker}`;
        logEl.appendChild(entry);
        
        logEl.scrollTop = logEl.scrollHeight;
    }

    hideLoading() {
        this.loadingOverlay.classList.add('hidden');
    }

    showLoading() {
        this.loadingOverlay.classList.remove('hidden');
    }

    showNoSubtitleBanner() {
        const banner = document.getElementById('no-subtitle-banner');
        if (banner) {
            banner.classList.remove('hidden');
        }
    }

    hideNoSubtitleBanner() {
        const banner = document.getElementById('no-subtitle-banner');
        if (banner) {
            banner.classList.add('hidden');
        }
    }

    showReconnectingBanner() {
        const banner = document.getElementById('reconnecting-banner');
        if (banner) {
            banner.classList.remove('hidden');
        }
    }

    hideReconnectingBanner() {
        const banner = document.getElementById('reconnecting-banner');
        if (banner) {
            banner.classList.add('hidden');
        }
    }

    showPrivacyBanner() {
        const banner = document.getElementById('privacy-banner');
        if (banner) {
            banner.classList.remove('hidden');
        }
    }

    hidePrivacyBanner() {
        const banner = document.getElementById('privacy-banner');
        if (banner) {
            banner.classList.add('hidden');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
