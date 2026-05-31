import { ContentType } from './contentAnalyzer.js'

export const EncodingPreset = {
  [ContentType.DOCUMENT]: {
    name: '文档模式',
    description: '静态文档、代码等低复杂度内容',
    gopSize: 120,
    keyFrameInterval: 120,
    bitrateMode: 'cbr',
    baseBitrateMultiplier: 0.4,
    minBitrateMultiplier: 0.2,
    maxBitrateMultiplier: 0.6,
    quality: 'high',
    latencyMode: 'realtime',
    quantization: {
      minQP: 20,
      maxQP: 35
    },
    parameters: {
      tuneContent: 'screen',
      screenContent: true,
      frameDenoising: false
    }
  },
  [ContentType.STATIC]: {
    name: '静态模式',
    description: 'PPT、网页等基本静止内容',
    gopSize: 60,
    keyFrameInterval: 60,
    bitrateMode: 'cbr',
    baseBitrateMultiplier: 0.6,
    minBitrateMultiplier: 0.3,
    maxBitrateMultiplier: 0.8,
    quality: 'high',
    latencyMode: 'realtime',
    quantization: {
      minQP: 22,
      maxQP: 38
    },
    parameters: {
      tuneContent: 'screen',
      screenContent: true,
      frameDenoising: false
    }
  },
  [ContentType.PRESENTATION]: {
    name: '演示模式',
    description: 'PPT演示、演讲等',
    gopSize: 45,
    keyFrameInterval: 45,
    bitrateMode: 'cbr',
    baseBitrateMultiplier: 0.7,
    minBitrateMultiplier: 0.4,
    maxBitrateMultiplier: 1.0,
    quality: 'medium',
    latencyMode: 'realtime',
    quantization: {
      minQP: 24,
      maxQP: 40
    },
    parameters: {
      tuneContent: 'screen',
      screenContent: true,
      frameDenoising: false
    }
  },
  [ContentType.MIXED]: {
    name: '混合模式',
    description: '文档+视频混合内容',
    gopSize: 30,
    keyFrameInterval: 30,
    bitrateMode: 'vbr',
    baseBitrateMultiplier: 1.0,
    minBitrateMultiplier: 0.5,
    maxBitrateMultiplier: 1.5,
    quality: 'medium',
    latencyMode: 'realtime',
    quantization: {
      minQP: 24,
      maxQP: 42
    },
    parameters: {
      tuneContent: 'default',
      screenContent: false,
      frameDenoising: false
    }
  },
  [ContentType.VIDEO]: {
    name: '视频模式',
    description: '连续播放的视频内容',
    gopSize: 30,
    keyFrameInterval: 30,
    bitrateMode: 'vbr',
    baseBitrateMultiplier: 1.2,
    minBitrateMultiplier: 0.8,
    maxBitrateMultiplier: 2.0,
    quality: 'high',
    latencyMode: 'realtime',
    quantization: {
      minQP: 20,
      maxQP: 40
    },
    parameters: {
      tuneContent: 'film',
      screenContent: false,
      frameDenoising: true
    }
  },
  [ContentType.GAME]: {
    name: '游戏模式',
    description: '高速运动的游戏画面',
    gopSize: 15,
    keyFrameInterval: 15,
    bitrateMode: 'cqvbr',
    baseBitrateMultiplier: 1.5,
    minBitrateMultiplier: 1.0,
    maxBitrateMultiplier: 2.5,
    quality: 'performance',
    latencyMode: 'realtime',
    quantization: {
      minQP: 18,
      maxQP: 38
    },
    parameters: {
      tuneContent: 'fastdecode',
      screenContent: false,
      frameDenoising: false
    }
  },
  [ContentType.DYNAMIC]: {
    name: '动态模式',
    description: '高动态画面、快速运动',
    gopSize: 15,
    keyFrameInterval: 15,
    bitrateMode: 'vbr',
    baseBitrateMultiplier: 1.3,
    minBitrateMultiplier: 0.8,
    maxBitrateMultiplier: 2.0,
    quality: 'performance',
    latencyMode: 'realtime',
    quantization: {
      minQP: 20,
      maxQP: 40
    },
    parameters: {
      tuneContent: 'default',
      screenContent: false,
      frameDenoising: false
    }
  },
  [ContentType.UNKNOWN]: {
    name: '通用模式',
    description: '自动检测中...',
    gopSize: 30,
    keyFrameInterval: 30,
    bitrateMode: 'vbr',
    baseBitrateMultiplier: 1.0,
    minBitrateMultiplier: 0.5,
    maxBitrateMultiplier: 1.5,
    quality: 'medium',
    latencyMode: 'realtime',
    quantization: {
      minQP: 22,
      maxQP: 40
    },
    parameters: {
      tuneContent: 'default',
      screenContent: false,
      frameDenoising: false
    }
  }
}

export class SceneAdaptiveConfig {
  constructor(options = {}) {
    this.baseBitrate = options.baseBitrate || 5_000_000
    this.currentContentType = ContentType.UNKNOWN
    this.currentPreset = EncodingPreset[ContentType.UNKNOWN]
    this.onConfigChange = options.onConfigChange || null
    this.lastConfigChangeTime = 0
    this.minChangeInterval = 2000
    this.changeHistory = []
  }

  updateContentType(contentType, confidence = 0) {
    const now = Date.now()

    if (contentType === this.currentContentType) {
      return { changed: false, preset: this.currentPreset }
    }

    if (now - this.lastConfigChangeTime < this.minChangeInterval) {
      return { changed: false, preset: this.currentPreset, throttled: true }
    }

    if (confidence < 0.6 && this.currentContentType !== ContentType.UNKNOWN) {
      return { changed: false, preset: this.currentPreset, lowConfidence: true }
    }

    const preset = EncodingPreset[contentType] || EncodingPreset[ContentType.UNKNOWN]
    
    this.changeHistory.push({
      from: this.currentContentType,
      to: contentType,
      confidence: confidence,
      time: now
    })

    if (this.changeHistory.length > 50) {
      this.changeHistory.shift()
    }

    this.currentContentType = contentType
    this.currentPreset = preset
    this.lastConfigChangeTime = now

    if (this.onConfigChange) {
      this.onConfigChange(preset, contentType)
    }

    return { changed: true, preset }
  }

  getCurrentConfig() {
    return {
      contentType: this.currentContentType,
      preset: this.currentPreset,
      bitrate: this.getTargetBitrate(),
      minBitrate: this.getMinBitrate(),
      maxBitrate: this.getMaxBitrate(),
      gopSize: this.currentPreset.gopSize,
      keyFrameInterval: this.currentPreset.keyFrameInterval,
      bitrateMode: this.currentPreset.bitrateMode
    }
  }

  getTargetBitrate() {
    return Math.floor(this.baseBitrate * this.currentPreset.baseBitrateMultiplier)
  }

  getMinBitrate() {
    return Math.floor(this.baseBitrate * this.currentPreset.minBitrateMultiplier)
  }

  getMaxBitrate() {
    return Math.floor(this.baseBitrate * this.currentPreset.maxBitrateMultiplier)
  }

  getGopSize() {
    return this.currentPreset.gopSize
  }

  getKeyFrameInterval() {
    return this.currentPreset.keyFrameInterval
  }

  getBitrateMode() {
    return this.currentPreset.bitrateMode
  }

  updateBaseBitrate(baseBitrate) {
    this.baseBitrate = baseBitrate
  }

  getChangeHistory() {
    return [...this.changeHistory]
  }

  reset() {
    this.currentContentType = ContentType.UNKNOWN
    this.currentPreset = EncodingPreset[ContentType.UNKNOWN]
    this.lastConfigChangeTime = 0
    this.changeHistory = []
  }
}
