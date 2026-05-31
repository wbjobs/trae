export class AdaptiveBitrateController {
  constructor(options = {}) {
    this.targetBitrate = options.targetBitrate || 5_000_000
    this.minBitrate = options.minBitrate || 1_000_000
    this.maxBitrate = options.maxBitrate || 50_000_000
    this.currentBitrate = this.targetBitrate
    this.queueThresholdLow = options.queueThresholdLow || 5
    this.queueThresholdHigh = options.queueThresholdHigh || 30
    this.queueThresholdCritical = options.queueThresholdCritical || 60
    this.adjustmentInterval = options.adjustmentInterval || 500
    this.lastAdjustmentTime = 0
    this.onBitrateChange = options.onBitrateChange || null
    this.shouldDropFrames = false
    this.shouldSkipFrames = false
    this.stats = {
      currentBitrate: this.currentBitrate,
      shouldDropFrames: this.shouldDropFrames,
      shouldSkipFrames: this.shouldSkipFrames,
      dropRatio: 0,
      skipRatio: 0
    }
  }

  update(queueSize, actualSendBitrate, estimatedBitrate) {
    const now = Date.now()
    
    if (now - this.lastAdjustmentTime < this.adjustmentInterval) {
      return this.stats
    }

    this.lastAdjustmentTime = now

    if (queueSize > this.queueThresholdCritical) {
      this._handleCritical(queueSize)
    } else if (queueSize > this.queueThresholdHigh) {
      this._handleHigh(queueSize, actualSendBitrate)
    } else if (queueSize < this.queueThresholdLow) {
      this._handleLow(queueSize, estimatedBitrate)
    } else {
      this._handleNormal(queueSize, actualSendBitrate, estimatedBitrate)
    }

    this.stats = {
      currentBitrate: this.currentBitrate,
      shouldDropFrames: this.shouldDropFrames,
      shouldSkipFrames: this.shouldSkipFrames,
      dropRatio: this.shouldDropFrames ? Math.min((queueSize - this.queueThresholdHigh) / this.queueThresholdHigh, 0.5) : 0,
      skipRatio: this.shouldSkipFrames ? Math.min((queueSize - this.queueThresholdCritical) / this.queueThresholdCritical, 0.7) : 0
    }

    if (this.onBitrateChange) {
      this.onBitrateChange(this.currentBitrate, this.stats)
    }

    return this.stats
  }

  _handleCritical(queueSize) {
    this.shouldSkipFrames = true
    this.shouldDropFrames = true

    const reductionFactor = Math.max(0.3, 1 - (queueSize - this.queueThresholdCritical) / 100)
    this.currentBitrate = Math.max(this.minBitrate, this.currentBitrate * reductionFactor)
  }

  _handleHigh(queueSize, actualSendBitrate) {
    this.shouldDropFrames = true
    this.shouldSkipFrames = false

    if (actualSendBitrate > 0) {
      this.currentBitrate = actualSendBitrate * 0.8
    } else {
      const reductionFactor = Math.max(0.7, 1 - (queueSize - this.queueThresholdHigh) / 100)
      this.currentBitrate = Math.max(this.minBitrate, this.currentBitrate * reductionFactor)
    }
  }

  _handleLow(queueSize, estimatedBitrate) {
    this.shouldDropFrames = false
    this.shouldSkipFrames = false

    if (this.currentBitrate < this.targetBitrate) {
      const increaseFactor = Math.min(1.1, 1 + (this.queueThresholdLow - queueSize) / 50)
      this.currentBitrate = Math.min(this.targetBitrate, this.currentBitrate * increaseFactor)
    }
  }

  _handleNormal(queueSize, actualSendBitrate, estimatedBitrate) {
    this.shouldDropFrames = false
    this.shouldSkipFrames = false

    if (actualSendBitrate > 0 && this.currentBitrate > actualSendBitrate) {
      this.currentBitrate = actualSendBitrate * 0.9
    }
  }

  shouldDropFrame(frameIndex, isKeyFrame) {
    if (!this.shouldDropFrames) return false
    if (isKeyFrame) return false

    const dropInterval = Math.floor(1 / Math.max(this.stats.dropRatio, 0.1))
    return frameIndex % dropInterval !== 0
  }

  shouldSkipFrame(frameIndex, isKeyFrame) {
    if (!this.shouldSkipFrames) return false
    if (isKeyFrame) return false

    const skipInterval = Math.floor(1 / Math.max(this.stats.skipRatio, 0.1))
    return frameIndex % skipInterval !== 0
  }

  reset() {
    this.currentBitrate = this.targetBitrate
    this.shouldDropFrames = false
    this.shouldSkipFrames = false
    this.lastAdjustmentTime = 0
    this.stats = {
      currentBitrate: this.currentBitrate,
      shouldDropFrames: false,
      shouldSkipFrames: false,
      dropRatio: 0,
      skipRatio: 0
    }
  }

  getBitrate() {
    return this.currentBitrate
  }

  getStats() {
    return this.stats
  }
}
