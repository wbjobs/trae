export const BitrateMode = {
  CBR: 'cbr',
  VBR: 'vbr',
  CQVBR: 'cqvbr'
}

export class AV1Encoder {
  constructor(options = {}) {
    this.encoder = null
    this.isEncoding = false
    this.frameCount = 0
    this.totalInputSize = 0
    this.totalOutputSize = 0
    this.options = {
      codec: 'av01.0.08M.08',
      width: 1920,
      height: 1080,
      bitrate: 5_000_000,
      framerate: 60,
      ...options
    }
    this.currentBitrate = this.options.bitrate
    this.onEncodedFrame = options.onEncodedFrame || null
    this.keyFrameInterval = options.keyFrameInterval || 60
    this.skippedFrames = 0
    this.droppedFrames = 0
    this.lastBitrateChangeTime = 0
    this.minBitrateChangeInterval = 500
    this.lastKeyFrameIndex = 0
    this.bitrateMode = options.bitrateMode || BitrateMode.VBR
    this.forceKeyFrameNext = false
    this.sceneChangeThreshold = options.sceneChangeThreshold || 0.3
    this.lastFrameComplexity = 0
    this.currentPreset = null
  }

  async init() {
    if (!('VideoEncoder' in window)) {
      throw new Error('当前浏览器不支持 WebCodecs API')
    }

    const config = this._buildConfig(this.options.bitrate)

    const supported = await VideoEncoder.isConfigSupported(config)
    if (!supported.supported) {
      throw new Error('AV1 编码配置不支持，请尝试其他编码器')
    }

    this.encoder = new VideoEncoder({
      output: (chunk, metadata) => {
        this._handleOutput(chunk, metadata)
      },
      error: (error) => {
        console.error('编码错误:', error)
      }
    })

    this.encoder.configure(config)
    this.isEncoding = true
  }

  _buildConfig(bitrate, bitrateMode = this.bitrateMode) {
    const config = {
      codec: this.options.codec,
      width: this.options.width,
      height: this.options.height,
      bitrate: bitrate,
      framerate: this.options.framerate,
      hardwareAcceleration: 'prefer-hardware',
      latencyMode: 'realtime'
    }

    if (bitrateMode === BitrateMode.VBR) {
      config.bitrateMode = 'variable'
    } else if (bitrateMode === BitrateMode.CBR) {
      config.bitrateMode = 'constant'
    }

    return config
  }

  async updateBitrate(newBitrate) {
    if (!this.isEncoding || !this.encoder) return

    newBitrate = Math.max(100_000, Math.min(newBitrate, 100_000_000))

    const now = Date.now()
    if (now - this.lastBitrateChangeTime < this.minBitrateChangeInterval) {
      return
    }

    if (Math.abs(newBitrate - this.currentBitrate) / this.currentBitrate < 0.05) {
      return
    }

    try {
      await this.encoder.flush()

      const config = this._buildConfig(newBitrate)

      this.encoder.configure(config)
      this.currentBitrate = newBitrate
      this.lastBitrateChangeTime = now
    } catch (error) {
      console.error('更新码率失败:', error)
    }
  }

  async updateEncodingPreset(preset) {
    if (!this.isEncoding || !this.encoder) return

    const now = Date.now()
    if (now - this.lastBitrateChangeTime < this.minBitrateChangeInterval) {
      return
    }

    this.currentPreset = preset
    this.keyFrameInterval = preset.keyFrameInterval
    this.bitrateMode = preset.bitrateMode

    const newBitrate = Math.floor(this.options.bitrate * preset.baseBitrateMultiplier)
    
    if (Math.abs(newBitrate - this.currentBitrate) / this.currentBitrate > 0.1) {
      try {
        await this.encoder.flush()
        
        const config = this._buildConfig(newBitrate, preset.bitrateMode)
        this.encoder.configure(config)
        this.currentBitrate = newBitrate
        this.forceKeyFrameNext = true
        this.lastBitrateChangeTime = now
      } catch (error) {
        console.error('更新编码预设失败:', error)
      }
    }
  }

  encodeFrame(imageData, timestamp, shouldSkip = false) {
    if (!this.isEncoding || !this.encoder) return

    if (shouldSkip) {
      this.skippedFrames++
      return
    }

    const videoFrame = new VideoFrame(imageData, {
      timestamp: timestamp,
      codedWidth: this.options.width,
      codedHeight: this.options.height
    })

    let isKeyFrame = false

    if (this.forceKeyFrameNext) {
      isKeyFrame = true
      this.forceKeyFrameNext = false
      this.lastKeyFrameIndex = this.frameCount
    } else if (this.frameCount - this.lastKeyFrameIndex >= this.keyFrameInterval) {
      isKeyFrame = true
      this.lastKeyFrameIndex = this.frameCount
    }

    const inputSize = imageData.data.length
    this.totalInputSize += inputSize

    this.encoder.encode(videoFrame, { keyFrame: isKeyFrame })
    
    videoFrame.close()
    this.frameCount++
  }

  requestKeyFrame() {
    this.forceKeyFrameNext = true
  }

  _handleOutput(chunk, metadata) {
    const chunkData = new Uint8Array(chunk.byteLength)
    chunk.copyTo(chunkData)

    const outputSize = chunkData.length
    this.totalOutputSize += outputSize

    const frameInfo = {
      data: chunkData,
      timestamp: chunk.timestamp,
      duration: chunk.duration,
      isKeyFrame: chunk.type === 'key',
      size: outputSize,
      frameCount: this.frameCount,
      metadata: metadata
    }

    if (this.onEncodedFrame) {
      this.onEncodedFrame(frameInfo)
    }
  }

  getCompressionRatio() {
    if (this.totalInputSize === 0) return 0
    return (this.totalInputSize / this.totalOutputSize).toFixed(2)
  }

  getStats() {
    return {
      frameCount: this.frameCount,
      totalInputSize: this.totalInputSize,
      totalOutputSize: this.totalOutputSize,
      compressionRatio: this.getCompressionRatio(),
      bitrate: this.currentBitrate,
      bitrateMode: this.bitrateMode,
      keyFrameInterval: this.keyFrameInterval,
      skippedFrames: this.skippedFrames,
      droppedFrames: this.droppedFrames
    }
  }

  async flush() {
    if (this.encoder) {
      await this.encoder.flush()
    }
  }

  async stop() {
    this.isEncoding = false
    
    if (this.encoder) {
      await this.flush()
      this.encoder.close()
      this.encoder = null
    }
  }
}
