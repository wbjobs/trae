<template>
  <div class="app-container">
    <div class="header">
      <h1>实时屏幕录制工具</h1>
      <p>Vue3 + WebCodecs (AV1) + WebTransport (场景自适应编码)</p>
    </div>

    <div class="control-panel">
      <div class="control-group">
        <label>帧率:</label>
        <select v-model="config.fps" :disabled="isRecording">
          <option :value="30">30 FPS</option>
          <option :value="60">60 FPS</option>
        </select>
      </div>

      <div class="control-group">
        <label>目标码率:</label>
        <select v-model="config.bitrate" :disabled="isRecording">
          <option :value="2000000">2 Mbps</option>
          <option :value="5000000">5 Mbps</option>
          <option :value="10000000">10 Mbps</option>
          <option :value="20000000">20 Mbps</option>
        </select>
      </div>

      <div class="control-group">
        <label>场景模式:</label>
        <select v-model="config.sceneMode" :disabled="isRecording">
          <option value="auto">自动检测</option>
          <option value="document">文档模式</option>
          <option value="static">静态模式</option>
          <option value="presentation">演示模式</option>
          <option value="mixed">混合模式</option>
          <option value="video">视频模式</option>
          <option value="game">游戏模式</option>
        </select>
      </div>

      <div class="control-group">
        <label>服务器:</label>
        <input v-model="config.serverUrl" :disabled="isRecording" placeholder="https://localhost:4433" />
      </div>

      <button 
        v-if="!isRecording" 
        class="btn btn-primary" 
        @click="startRecording"
        :disabled="!isEncoderSupported"
      >
        开始录制
      </button>
      
      <button 
        v-if="isRecording" 
        class="btn btn-danger" 
        @click="stopRecording"
      >
        停止录制
      </button>

      <button 
        v-if="isConnected" 
        class="btn btn-success" 
        @click="toggleConnection"
      >
        断开连接
      </button>
      
      <button 
        v-else 
        class="btn btn-success" 
        @click="toggleConnection"
        :disabled="!isRecording"
      >
        连接服务器
      </button>
    </div>

    <div class="main-content">
      <div class="preview-section">
        <h2>预览</h2>
        
        <div class="preview-tabs">
          <button 
            class="preview-tab" 
            :class="{ active: previewMode === 'original' }"
            @click="previewMode = 'original'"
          >
            原始画面
          </button>
          <button 
            class="preview-tab" 
            :class="{ active: previewMode === 'encoded' }"
            @click="previewMode = 'encoded'"
          >
            编码后画面
          </button>
          <button 
            class="preview-tab" 
            :class="{ active: previewMode === 'compare' }"
            @click="previewMode = 'compare'"
          >
            对比视图
          </button>
        </div>

        <div class="video-container" v-if="previewMode === 'original'">
          <video ref="originalVideo" autoplay muted playsinline></video>
        </div>

        <div class="video-container" v-if="previewMode === 'encoded'">
          <canvas ref="encodedCanvas"></canvas>
        </div>

        <div class="video-container" v-if="previewMode === 'compare'" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px;">
          <div style="position: relative;">
            <span style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); padding: 4px 8px; border-radius: 4px; font-size: 12px; z-index: 10;">原始</span>
            <video ref="originalVideoCompare" autoplay muted playsinline style="width: 100%; height: 100%;"></video>
          </div>
          <div style="position: relative;">
            <span style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); padding: 4px 8px; border-radius: 4px; font-size: 12px; z-index: 10;">编码后</span>
            <canvas ref="encodedCanvasCompare" style="width: 100%; height: 100%;"></canvas>
          </div>
        </div>

        <div class="status-bar">
          <div class="status-item">
            <span class="status-indicator" :class="{ active: isRecording }"></span>
            <span>录制: {{ isRecording ? '进行中' : '未开始' }}</span>
          </div>
          <div class="status-item">
            <span class="status-indicator" :class="{ active: isConnected, error: connectionError }"></span>
            <span>连接: {{ connectionStatus }}</span>
          </div>
          <div class="status-item">
            <span>已录制: {{ formattedTime }}</span>
          </div>
          <div class="status-item">
            <span>帧数: {{ frameCount }}</span>
          </div>
        </div>

        <div class="scene-status" v-if="isRecording">
          <div class="status-item">
            <span class="scene-icon">{{ sceneIcon }}</span>
            <span>场景: {{ sceneLabel }}</span>
          </div>
          <div class="status-item">
            <span>置信度: {{ (sceneConfidence * 100).toFixed(0) }}%</span>
          </div>
          <div class="status-item">
            <span>GOP: {{ currentGopSize }}</span>
          </div>
          <div class="status-item">
            <span>码率模式: {{ bitrateModeLabel }}</span>
          </div>
        </div>

        <div class="adaptive-status" v-if="isRecording && isConnected">
          <div class="status-item" v-if="currentBitrate !== config.bitrate">
            <span class="status-indicator active"></span>
            <span>自适应码率: {{ formatBitrate(currentBitrate) }}</span>
          </div>
          <div class="status-item" v-if="droppedFrames > 0">
            <span class="status-indicator" style="background: #f39c12;"></span>
            <span>丢弃帧: {{ droppedFrames }}</span>
          </div>
          <div class="status-item" v-if="skippedFrames > 0">
            <span class="status-indicator" style="background: #e94560;"></span>
            <span>跳过帧: {{ skippedFrames }}</span>
          </div>
        </div>

        <div class="log-panel" v-if="logs.length > 0">
          <div 
            v-for="(log, index) in logs" 
            :key="index" 
            class="log-entry" 
            :class="log.type"
          >
            <span class="log-time">{{ log.time }}</span>
            {{ log.message }}
          </div>
        </div>
      </div>

      <div class="metrics-panel">
        <h2>性能指标</h2>
        
        <div class="metric-card">
          <div class="metric-label">压缩比</div>
          <div class="metric-value">
            {{ compressionRatio }} 
            <span class="metric-unit">: 1</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-label">PSNR (峰值信噪比)</div>
          <div class="metric-value">
            {{ psnr !== null ? psnr : '--' }} 
            <span class="metric-unit">dB</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-label">当前码率</div>
          <div class="metric-value">
            {{ formatBitrate(currentBitrate) }}
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-label">发送码率</div>
          <div class="metric-value">
            {{ formatBitrate(sendBitrate) }}
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-label">队列状态</div>
          <div class="metric-value" :class="{ warning: queueSize > 30, danger: queueSize > 60 }">
            {{ queueSize }} / {{ maxQueueSize }}
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-label">原始数据量</div>
          <div class="metric-value">
            {{ formatBytes(originalSize) }}
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-label">编码后数据量</div>
          <div class="metric-value">
            {{ formatBytes(encodedSize) }}
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-label">丢弃/跳过帧</div>
          <div class="metric-value">
            <span :style="{ color: droppedFrames > 0 ? '#f39c12' : '' }">{{ droppedFrames }}</span>
            /
            <span :style="{ color: skippedFrames > 0 ? '#e94560' : '' }">{{ skippedFrames }}</span>
          </div>
        </div>

        <div class="metric-card scene-analysis-card">
          <div class="metric-label">场景分析</div>
          <div class="scene-metrics">
            <div class="scene-metric-row">
              <span class="scene-metric-label">运动强度:</span>
              <div class="scene-metric-bar">
                <div class="scene-metric-fill" :style="{ width: (sceneStats.motionLevel * 100) + '%', background: getMotionColor(sceneStats.motionLevel) }"></div>
              </div>
              <span class="scene-metric-value">{{ (sceneStats.motionLevel * 100).toFixed(1) }}%</span>
            </div>
            <div class="scene-metric-row">
              <span class="scene-metric-label">空间复杂度:</span>
              <div class="scene-metric-bar">
                <div class="scene-metric-fill" :style="{ width: (sceneStats.spatialComplexity * 100) + '%' }"></div>
              </div>
              <span class="scene-metric-value">{{ (sceneStats.spatialComplexity * 100).toFixed(1) }}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted, nextTick } from 'vue'
import { ScreenCapture } from './utils/screenCapture.js'
import { AV1Encoder } from './utils/av1Encoder.js'
import { WebTransportClient } from './utils/webtransportClient.js'
import { FrameDecoder } from './utils/frameDecoder.js'
import { AdaptiveBitrateController } from './utils/adaptiveBitrate.js'
import { ContentAnalyzer, ContentType } from './utils/contentAnalyzer.js'
import { SceneAdaptiveConfig, EncodingPreset } from './utils/sceneAdaptiveConfig.js'
import { calculatePSNR, formatBytes, formatBitrate } from './utils/metrics.js'

const isRecording = ref(false)
const isConnected = ref(false)
const connectionError = ref(false)
const connectionStatus = ref('未连接')
const previewMode = ref('original')
const frameCount = ref(0)
const sentFrames = ref(0)
const queueSize = ref(0)
const originalSize = ref(0)
const encodedSize = ref(0)
const compressionRatio = ref(0)
const psnr = ref(null)
const logs = ref([])
const isEncoderSupported = ref('VideoEncoder' in window)
const currentBitrate = ref(5_000_000)
const sendBitrate = ref(0)
const droppedFrames = ref(0)
const skippedFrames = ref(0)
const maxQueueSize = ref(100)

const currentContentType = ref(ContentType.UNKNOWN)
const sceneConfidence = ref(0)
const sceneStats = ref({
  motionLevel: 0,
  spatialComplexity: 0,
  temporalVariance: 0,
  edgeDensity: 0,
  histogramSpread: 0
})

const originalVideo = ref(null)
const originalVideoCompare = ref(null)
const encodedCanvas = ref(null)
const encodedCanvasCompare = ref(null)

const config = ref({
  fps: 60,
  bitrate: 5000000,
  serverUrl: 'https://localhost:4433',
  codec: 'av01.0.08M.08',
  sceneMode: 'auto'
})

let screenCapture = null
let encoder = null
let transport = null
let decoder = null
let lastOriginalFrame = null
let startTime = null
let timerInterval = null
let bitrateController = null
let contentAnalyzer = null
let sceneAdaptiveConfig = null
let sceneAnalysisInterval = null
const recordingTime = ref(0)
let bitrateUpdateInterval = null

const sceneLabel = computed(() => {
  const preset = EncodingPreset[currentContentType.value]
  return preset?.name || '未知'
})

const sceneIcon = computed(() => {
  switch (currentContentType.value) {
    case ContentType.DOCUMENT: return '📄'
    case ContentType.STATIC: return '📋'
    case ContentType.PRESENTATION: return '📊'
    case ContentType.MIXED: return '🔀'
    case ContentType.VIDEO: return '🎬'
    case ContentType.GAME: return '🎮'
    case ContentType.DYNAMIC: return '⚡'
    default: return '❓'
  }
})

const currentGopSize = computed(() => {
  return sceneAdaptiveConfig?.getGopSize() || 30
})

const bitrateModeLabel = computed(() => {
  const mode = sceneAdaptiveConfig?.getBitrateMode() || 'vbr'
  switch (mode) {
    case 'cbr': return '固定码率'
    case 'vbr': return '可变码率'
    case 'cqvbr': return '约束可变码率'
    default: return '可变码率'
  }
})

const formattedTime = computed(() => {
  const seconds = Math.floor(recordingTime.value)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
})

function getMotionColor(level) {
  if (level < 0.01) return '#0f9b58'
  if (level < 0.05) return '#667eea'
  if (level < 0.15) return '#f39c12'
  return '#e94560'
}

function addLog(message, type = 'info') {
  const time = new Date().toLocaleTimeString()
  logs.value.unshift({ time, message, type })
  if (logs.value.length > 50) {
    logs.value.pop()
  }
}

async function startRecording() {
  try {
    addLog('开始初始化屏幕捕获...', 'info')

    screenCapture = new ScreenCapture({
      fps: config.value.fps,
      onFrame: handleFrame
    })

    const resolution = await screenCapture.start()
    
    addLog(`屏幕捕获成功: ${resolution.width}x${resolution.height} @ ${config.value.fps}fps`, 'success')

    if (originalVideo.value) {
      originalVideo.value.srcObject = screenCapture.stream
    }
    
    await nextTick()
    if (originalVideoCompare.value) {
      originalVideoCompare.value.srcObject = screenCapture.stream
    }

    addLog('初始化 AV1 编码器...', 'info')
    encoder = new AV1Encoder({
      codec: config.value.codec,
      width: resolution.width,
      height: resolution.height,
      bitrate: config.value.bitrate,
      framerate: config.value.fps,
      onEncodedFrame: handleEncodedFrame
    })

    await encoder.init()
    addLog('AV1 编码器初始化成功', 'success')

    currentBitrate.value = config.value.bitrate

    contentAnalyzer = new ContentAnalyzer({
      maxHistorySize: 30,
      analysisInterval: 500
    })

    sceneAdaptiveConfig = new SceneAdaptiveConfig({
      baseBitrate: config.value.bitrate,
      onConfigChange: async (preset, contentType) => {
        addLog(`场景切换: ${EncodingPreset[contentType]?.name} (GOP: ${preset.gopSize})`, 'info')
        if (encoder) {
          await encoder.updateEncodingPreset(preset)
        }
      }
    })

    if (config.value.sceneMode !== 'auto') {
      const preset = EncodingPreset[config.value.sceneMode]
      if (preset) {
        sceneAdaptiveConfig.updateContentType(config.value.sceneMode, 1.0)
        currentContentType.value = config.value.sceneMode
        sceneConfidence.value = 1.0
        addLog(`手动选择场景: ${preset.name}`, 'info')
      }
    }

    bitrateController = new AdaptiveBitrateController({
      targetBitrate: config.value.bitrate,
      minBitrate: 1_000_000,
      maxBitrate: config.value.bitrate * 2,
      queueThresholdLow: 5,
      queueThresholdHigh: 30,
      queueThresholdCritical: 60,
      onBitrateChange: async (newBitrate, stats) => {
        if (encoder && Math.abs(newBitrate - currentBitrate.value) / currentBitrate.value > 0.1) {
          currentBitrate.value = newBitrate
          await encoder.updateBitrate(newBitrate)
        }
      }
    })

    decoder = new FrameDecoder({
      canvas: encodedCanvas.value,
      onFrameDecoded: handleDecodedFrame
    })
    await decoder.init(resolution.width, resolution.height)

    const decoderCompare = new FrameDecoder({
      canvas: encodedCanvasCompare.value
    })
    await decoderCompare.init(resolution.width, resolution.height)
    decoder.compareDecoder = decoderCompare

    isRecording.value = true
    startTime = Date.now()
    recordingTime.value = 0
    droppedFrames.value = 0
    skippedFrames.value = 0
    currentContentType.value = ContentType.UNKNOWN
    sceneConfidence.value = 0

    timerInterval = setInterval(() => {
      recordingTime.value = (Date.now() - startTime) / 1000
    }, 100)

    bitrateUpdateInterval = setInterval(updateAdaptiveBitrate, 200)
    
    if (config.value.sceneMode === 'auto') {
      sceneAnalysisInterval = setInterval(analyzeSceneContent, 500)
    }

    addLog('录制已开始', 'success')

  } catch (error) {
    addLog(`启动失败: ${error.message}`, 'error')
    console.error(error)
    await stopRecording()
  }
}

async function stopRecording() {
  addLog('停止录制...', 'info')
  
  isRecording.value = false

  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }

  if (bitrateUpdateInterval) {
    clearInterval(bitrateUpdateInterval)
    bitrateUpdateInterval = null
  }

  if (sceneAnalysisInterval) {
    clearInterval(sceneAnalysisInterval)
    sceneAnalysisInterval = null
  }

  if (transport && isConnected.value) {
    transport.sendEnd()
    await transport.close()
    isConnected.value = false
    connectionStatus.value = '未连接'
  }

  if (encoder) {
    const stats = encoder.getStats()
    skippedFrames.value = stats.skippedFrames
    addLog(`编码统计: ${stats.frameCount} 帧, 压缩比 ${stats.compressionRatio}:1, 跳过 ${stats.skippedFrames} 帧`, 'info')
    await encoder.stop()
    encoder = null
  }

  if (decoder) {
    if (decoder.compareDecoder) {
      decoder.compareDecoder.close()
    }
    decoder.close()
    decoder = null
  }

  if (screenCapture) {
    screenCapture.stop()
    screenCapture = null
  }

  bitrateController = null
  contentAnalyzer = null
  sceneAdaptiveConfig = null

  addLog('录制已停止', 'success')
}

function handleFrame(imageData, canvas) {
  lastOriginalFrame = imageData
  frameCount.value++
  originalSize.value += imageData.data.length

  if (contentAnalyzer && config.value.sceneMode === 'auto') {
    contentAnalyzer.analyzeFrame(imageData)
  }

  if (encoder && isRecording.value) {
    const shouldSkip = bitrateController?.shouldSkipFrame(frameCount.value, false)
    
    if (shouldSkip) {
      encoder.skippedFrames++
      return
    }

    const timestamp = (frameCount.value - 1) * (1000000 / config.value.fps)
    encoder.encodeFrame(imageData, timestamp, false)
  }
}

function handleEncodedFrame(frameInfo) {
  encodedSize.value += frameInfo.size
  compressionRatio.value = encoder.getCompressionRatio()

  if (decoder) {
    decoder.decodeFrame(frameInfo.data, frameInfo.timestamp, frameInfo.isKeyFrame)
    if (decoder.compareDecoder) {
      decoder.compareDecoder.decodeFrame(frameInfo.data, frameInfo.timestamp, frameInfo.isKeyFrame)
    }
  }

  if (lastOriginalFrame && frameInfo.isKeyFrame) {
    const psnrValue = calculatePSNR(lastOriginalFrame.data, lastOriginalFrame.data)
    if (psnrValue !== null && psnrValue !== Infinity) {
      psnr.value = psnrValue
    }
  }

  if (transport && isConnected.value) {
    const shouldDrop = bitrateController?.shouldDropFrame(frameInfo.frameCount, frameInfo.isKeyFrame)
    
    if (shouldDrop) {
      droppedFrames.value++
      return
    }

    const sent = transport.sendData(frameInfo.data, {
      type: 'frame',
      isKeyFrame: frameInfo.isKeyFrame,
      frameIndex: frameInfo.frameCount
    })
    
    if (!sent) {
      droppedFrames.value++
    }
  }
}

function handleDecodedFrame(frame, count) {
}

function analyzeSceneContent() {
  if (!contentAnalyzer || !sceneAdaptiveConfig) return

  const result = contentAnalyzer.getCurrentType()
  const stats = contentAnalyzer.getStats()
  sceneStats.value = stats

  if (result !== ContentType.UNKNOWN) {
    const confidence = contentAnalyzer.confidence
    const updateResult = sceneAdaptiveConfig.updateContentType(result, confidence)
    
    if (updateResult.changed) {
      currentContentType.value = result
      sceneConfidence.value = confidence
      currentBitrate.value = sceneAdaptiveConfig.getTargetBitrate()
    }
  }
}

function updateAdaptiveBitrate() {
  if (!bitrateController || !transport) return

  const transportStats = transport.getStats()
  queueSize.value = transportStats.queueSize
  sendBitrate.value = transport.getCurrentSendBitrate()

  const encoderStats = encoder?.getStats()
  const estimatedBitrate = encoderStats ? (encoderStats.totalOutputSize * 8) / Math.max(recordingTime.value, 1) : 0

  const targetBitrate = sceneAdaptiveConfig?.getTargetBitrate() || config.value.bitrate
  bitrateController.targetBitrate = targetBitrate

  bitrateController.update(
    queueSize.value,
    sendBitrate.value,
    estimatedBitrate
  )

  const controllerStats = bitrateController.getStats()
  if (controllerStats.shouldSkipFrames) {
    skippedFrames.value = encoder?.skippedFrames || 0
  }
}

async function toggleConnection() {
  if (isConnected.value) {
    if (transport) {
      transport.sendEnd()
      await transport.close()
    }
    isConnected.value = false
    connectionStatus.value = '未连接'
    addLog('已断开服务器连接', 'info')
  } else {
    try {
      addLog('连接服务器...', 'info')
      connectionStatus.value = '连接中...'

      transport = new WebTransportClient({
        url: config.value.serverUrl,
        maxQueueSize: maxQueueSize.value,
        onStatusChange: (status) => {
          if (status.status === 'connected') {
            isConnected.value = true
            connectionStatus.value = '已连接'
            connectionError.value = false
            addLog('服务器连接成功', 'success')
            
            if (encoder) {
              transport.sendInit({
                codec: config.value.codec,
                width: screenCapture?.getResolution().width || 1920,
                height: screenCapture?.getResolution().height || 1080,
                fps: config.value.fps,
                bitrate: currentBitrate.value
              })
            }
          } else if (status.status === 'error') {
            connectionError.value = true
            connectionStatus.value = '连接错误'
            addLog(`连接错误: ${status.error?.message || '未知错误'}`, 'error')
          }
        },
        onQueueStatusChange: (status) => {
          queueSize.value = status.queueSize
          sendBitrate.value = status.currentBitrate
        }
      })

      await transport.connect()
    } catch (error) {
      connectionError.value = true
      connectionStatus.value = '连接失败'
      addLog(`连接失败: ${error.message}`, 'error')
    }
  }
}

onUnmounted(() => {
  if (isRecording.value) {
    stopRecording()
  }
})
</script>

<style scoped>
.warning {
  color: #f39c12 !important;
}

.danger {
  color: #e94560 !important;
}

.adaptive-status {
  display: flex;
  gap: 20px;
  padding: 12px 20px;
  background: #0f3460;
  border-radius: 8px;
  margin-top: 15px;
  font-size: 13px;
  flex-wrap: wrap;
}

.scene-status {
  display: flex;
  gap: 20px;
  padding: 12px 20px;
  background: linear-gradient(135deg, #1a472a 0%, #0f3460 100%);
  border-radius: 8px;
  margin-top: 15px;
  font-size: 13px;
  flex-wrap: wrap;
}

.scene-status .status-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.scene-icon {
  font-size: 16px;
}

.scene-analysis-card {
  background: linear-gradient(135deg, #0f3460 0%, #1a472a 100%) !important;
}

.scene-metrics {
  margin-top: 10px;
}

.scene-metric-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.scene-metric-label {
  font-size: 12px;
  color: #a0a0a0;
  min-width: 70px;
}

.scene-metric-bar {
  flex: 1;
  height: 8px;
  background: #1a1a2e;
  border-radius: 4px;
  overflow: hidden;
}

.scene-metric-fill {
  height: 100%;
  background: #667eea;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.scene-metric-value {
  font-size: 12px;
  color: #667eea;
  min-width: 50px;
  text-align: right;
}
</style>
