class WebSocketClient {
    constructor(url = 'ws://localhost:8765') {
        this.url = url;
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        this.onMessageCallback = null;
        this.onStatusChangeCallback = null;
        this.onReconnectSuccessCallback = null;
        this.onReconnectFailedCallback = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.audioStream = null;
        this.audioContext = null;
        this.lastVideoTimestamp = 0;
        this.estimatedLatency = 0;
        this.isManualDisconnect = false;
        this.reconnectTimer = null;
    }

    setOnMessageCallback(callback) {
        this.onMessageCallback = callback;
    }

    setOnStatusChangeCallback(callback) {
        this.onStatusChangeCallback = callback;
    }

    setOnReconnectSuccessCallback(callback) {
        this.onReconnectSuccessCallback = callback;
    }

    setOnReconnectFailedCallback(callback) {
        this.onReconnectFailedCallback = callback;
    }

    connect(isReconnect = false) {
        return new Promise((resolve, reject) => {
            try {
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
                
                if (!isReconnect) {
                    console.log('正在连接WebSocket:', this.url);
                    this.notifyStatusChange('connecting');
                } else {
                    console.log(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
                    this.notifyStatusChange('reconnecting');
                }
                
                this.ws = new WebSocket(this.url);
                
                this.ws.onopen = () => {
                    console.log('WebSocket连接已建立');
                    this.isConnected = true;
                    
                    if (isReconnect && this.onReconnectSuccessCallback) {
                        console.log('重连成功，恢复音频流');
                        this.onReconnectSuccessCallback();
                    }
                    
                    this.reconnectAttempts = 0;
                    this.notifyStatusChange('connected');
                    resolve();
                };
                
                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                    } catch (e) {
                        console.error('解析WebSocket消息失败:', e);
                    }
                };
                
                this.ws.onerror = (error) => {
                    console.error('WebSocket错误:', error);
                    this.notifyStatusChange('error');
                };
                
                this.ws.onclose = (event) => {
                    console.log('WebSocket连接已关闭:', event.code, event.reason);
                    this.isConnected = false;
                    this.notifyStatusChange('disconnected');
                    
                    if (this.isManualDisconnect) {
                        console.log('用户主动断开，不进行重连');
                        return;
                    }
                    
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        console.log(`将在 ${this.reconnectDelay / 1000} 秒后尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                        
                        this.reconnectTimer = setTimeout(() => {
                            this.connect(true).catch(reconnectError => {
                                console.error('重连失败:', reconnectError);
                            });
                        }, this.reconnectDelay);
                    } else {
                        console.error('达到最大重连次数，重连失败');
                        this.notifyStatusChange('reconnect_failed');
                        
                        if (this.onReconnectFailedCallback) {
                            this.onReconnectFailedCallback();
                        }
                        
                        if (!isReconnect) {
                            reject(new Error('达到最大重连次数'));
                        }
                    }
                };
            } catch (error) {
                console.error('创建WebSocket失败:', error);
                reject(error);
            }
        });
    }

    handleMessage(data) {
        switch (data.type) {
            case 'transcript':
                const latency = this.calculateLatency(data.timestamp);
                if (this.onMessageCallback) {
                    this.onMessageCallback(data.text, latency, data.is_final);
                }
                break;
            case 'ping':
                this.send({ type: 'pong', timestamp: data.timestamp });
                break;
            case 'pong':
                this.measureLatency(data.timestamp);
                break;
            case 'error':
                console.error('服务端错误:', data.message);
                break;
            default:
                console.log('收到未知类型消息:', data);
        }
    }

    calculateLatency(serverTimestamp) {
        const now = Date.now();
        const oneWayLatency = (now - this.lastVideoTimestamp) / 2;
        return Math.round(oneWayLatency + this.estimatedLatency);
    }

    measureLatency(pingTimestamp) {
        const now = Date.now();
        this.estimatedLatency = (now - pingTimestamp) / 2;
    }

    send(data) {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    async startAudioStreaming() {
        try {
            this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            const source = this.audioContext.createMediaStreamSource(this.audioStream);
            const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
            
            source.connect(processor);
            processor.connect(this.audioContext.destination);
            
            processor.onaudioprocess = (e) => {
                if (!this.isRecording) return;
                
                const inputData = e.inputBuffer.getChannelData(0);
                const audioData = this.float32ToInt16(inputData);
                
                this.sendAudioChunk(audioData);
            };
            
            this.isRecording = true;
            console.log('音频流已启动');
            
        } catch (error) {
            console.error('启动音频流失败:', error);
            throw error;
        }
    }

    float32ToInt16(float32Array) {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            let s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16Array.buffer;
    }

    sendAudioChunk(audioData) {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            this.lastVideoTimestamp = Date.now();
            this.send({
                type: 'audio',
                data: Array.from(new Uint8Array(audioData)),
                timestamp: this.lastVideoTimestamp,
                sampleRate: this.audioContext ? this.audioContext.sampleRate : 44100
            });
        }
    }

    async startRecording() {
        try {
            await this.startAudioStreaming();
            return true;
        } catch (error) {
            console.error('开始录音失败:', error);
            return false;
        }
    }

    stopRecording() {
        this.isRecording = false;
        
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        console.log('录音已停止');
    }

    notifyStatusChange(status) {
        if (this.onStatusChangeCallback) {
            this.onStatusChangeCallback(status);
        }
    }

    disconnect() {
        this.isManualDisconnect = true;
        this.stopRecording();
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        this.isConnected = false;
        this.reconnectAttempts = 0;
        console.log('WebSocket已断开连接');
    }
}

window.WebSocketClient = WebSocketClient;
