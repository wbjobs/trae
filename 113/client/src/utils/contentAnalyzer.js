export const ContentType = {
  STATIC: 'static',
  DYNAMIC: 'dynamic',
  MIXED: 'mixed',
  DOCUMENT: 'document',
  PRESENTATION: 'presentation',
  VIDEO: 'video',
  GAME: 'game',
  UNKNOWN: 'unknown'
}

export class ContentAnalyzer {
  constructor(options = {}) {
    this.frameHistory = []
    this.maxHistorySize = options.maxHistorySize || 30
    this.lastFrame = null
    this.lastAnalysisTime = 0
    this.analysisInterval = options.analysisInterval || 500
    this.currentType = ContentType.UNKNOWN
    this.confidence = 0
    
    this.motionThresholds = {
      static: 0.001,
      low: 0.01,
      medium: 0.05,
      high: 0.15
    }
    
    this.spatialComplexity = {
      simple: 0.05,
      moderate: 0.15,
      complex: 0.3
    }
    
    this.stats = {
      motionLevel: 0,
      spatialComplexity: 0,
      temporalVariance: 0,
      edgeDensity: 0,
      histogramSpread: 0
    }
  }

  analyzeFrame(imageData) {
    const now = Date.now()
    const frameInfo = {
      data: imageData,
      timestamp: now,
      width: imageData.width,
      height: imageData.height
    }

    this.frameHistory.push(frameInfo)
    if (this.frameHistory.length > this.maxHistorySize) {
      this.frameHistory.shift()
    }

    if (now - this.lastAnalysisTime < this.analysisInterval) {
      return { type: this.currentType, confidence: this.confidence, stats: this.stats }
    }

    this.lastAnalysisTime = now

    this.stats.motionLevel = this._calculateMotionLevel(frameInfo)
    this.stats.spatialComplexity = this._calculateSpatialComplexity(frameInfo)
    this.stats.temporalVariance = this._calculateTemporalVariance()
    this.stats.edgeDensity = this._calculateEdgeDensity(frameInfo)
    this.stats.histogramSpread = this._calculateHistogramSpread(frameInfo)

    const result = this._classifyContent()
    this.currentType = result.type
    this.confidence = result.confidence

    this.lastFrame = frameInfo

    return { type: this.currentType, confidence: this.confidence, stats: { ...this.stats } }
  }

  _calculateMotionLevel(currentFrame) {
    if (!this.lastFrame) return 0

    const currentData = currentFrame.data.data
    const lastData = this.lastFrame.data.data
    const length = currentData.length
    
    let changedPixels = 0
    const sampleStep = 4

    for (let i = 0; i < length; i += sampleStep * 4) {
      const diff = Math.abs(currentData[i] - lastData[i])
        + Math.abs(currentData[i + 1] - lastData[i + 1])
        + Math.abs(currentData[i + 2] - lastData[i + 2])
      
      if (diff > 30) {
        changedPixels++
      }
    }

    return changedPixels / (length / (sampleStep * 4))
  }

  _calculateSpatialComplexity(frameInfo) {
    const data = frameInfo.data.data
    const width = frameInfo.width
    const height = frameInfo.height
    
    let edgeCount = 0
    const totalPixels = width * height

    for (let y = 1; y < height - 1; y += 2) {
      for (let x = 1; x < width - 1; x += 2) {
        const idx = (y * width + x) * 4
        
        const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
        
        const rightIdx = idx + 4
        const bottomIdx = ((y + 1) * width + x) * 4
        
        const rightGray = 0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2]
        const bottomGray = 0.299 * data[bottomIdx] + 0.587 * data[bottomIdx + 1] + 0.114 * data[bottomIdx + 2]
        
        const gx = rightGray - gray
        const gy = bottomGray - gray
        const gradient = Math.sqrt(gx * gx + gy * gy)
        
        if (gradient > 30) {
          edgeCount++
        }
      }
    }

    return edgeCount / (totalPixels / 4)
  }

  _calculateTemporalVariance() {
    if (this.frameHistory.length < 5) return 0

    const recentFrames = this.frameHistory.slice(-10)
    const motionValues = []

    for (let i = 1; i < recentFrames.length; i++) {
      const current = recentFrames[i].data.data
      const previous = recentFrames[i - 1].data.data
      const length = current.length

      let diff = 0
      for (let j = 0; j < length; j += 16) {
        diff += Math.abs(current[j] - previous[j])
      }
      motionValues.push(diff / (length / 16))
    }

    if (motionValues.length === 0) return 0

    const mean = motionValues.reduce((a, b) => a + b, 0) / motionValues.length
    const variance = motionValues.reduce((a, b) => a + (b - mean) ** 2, 0) / motionValues.length

    return Math.sqrt(variance) / (mean + 0.001)
  }

  _calculateEdgeDensity(frameInfo) {
    const data = frameInfo.data.data
    const width = frameInfo.width
    const height = frameInfo.height
    
    let horizontalEdges = 0
    let verticalEdges = 0

    for (let y = 1; y < height - 1; y += 4) {
      for (let x = 1; x < width - 1; x += 4) {
        const idx = (y * width + x) * 4
        const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
        
        const leftGray = 0.299 * data[idx - 4] + 0.587 * data[idx - 3] + 0.114 * data[idx - 2]
        const rightGray = 0.299 * data[idx + 4] + 0.587 * data[idx + 5] + 0.114 * data[idx + 6]
        
        if (Math.abs(rightGray - leftGray) > 50) {
          verticalEdges++
        }
      }
    }

    return (horizontalEdges + verticalEdges) / (width * height / 16)
  }

  _calculateHistogramSpread(frameInfo) {
    const data = frameInfo.data.data
    const histogram = new Array(256).fill(0)
    
    for (let i = 0; i < data.length; i += 16) {
      const gray = Math.floor(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
      histogram[gray]++
    }

    const totalSamples = data.length / 16
    const spread = histogram.filter(h => h > totalSamples * 0.01).length

    return spread / 256
  }

  _classifyContent() {
    const { motionLevel, spatialComplexity, temporalVariance, histogramSpread } = this.stats

    if (motionLevel < this.motionThresholds.static) {
      if (histogramSpread < 0.3 && spatialComplexity < this.spatialComplexity.simple) {
        return { type: ContentType.DOCUMENT, confidence: 0.9 }
      } else if (spatialComplexity < this.spatialComplexity.moderate) {
        return { type: ContentType.STATIC, confidence: 0.85 }
      } else {
        return { type: ContentType.PRESENTATION, confidence: 0.75 }
      }
    }

    if (motionLevel > this.motionThresholds.high) {
      if (temporalVariance < 0.5 && spatialComplexity > this.spatialComplexity.moderate) {
        return { type: ContentType.VIDEO, confidence: 0.85 }
      } else if (spatialComplexity > this.spatialComplexity.complex) {
        return { type: ContentType.GAME, confidence: 0.9 }
      } else {
        return { type: ContentType.DYNAMIC, confidence: 0.8 }
      }
    }

    if (motionLevel > this.motionThresholds.medium) {
      if (spatialComplexity > this.spatialComplexity.moderate) {
        return { type: ContentType.MIXED, confidence: 0.7 }
      } else {
        return { type: ContentType.DYNAMIC, confidence: 0.65 }
      }
    }

    if (motionLevel > this.motionThresholds.low) {
      return { type: ContentType.MIXED, confidence: 0.6 }
    }

    return { type: ContentType.STATIC, confidence: 0.7 }
  }

  getCurrentType() {
    return this.currentType
  }

  getStats() {
    return { ...this.stats }
  }

  reset() {
    this.frameHistory = []
    this.lastFrame = null
    this.currentType = ContentType.UNKNOWN
    this.confidence = 0
    this.stats = {
      motionLevel: 0,
      spatialComplexity: 0,
      temporalVariance: 0,
      edgeDensity: 0,
      histogramSpread: 0
    }
  }
}
