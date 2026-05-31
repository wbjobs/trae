export class SendRateMonitor {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 1000
    this.samples = []
    this.totalBytesSent = 0
    this.totalPacketsSent = 0
    this.startTime = Date.now()
    this.currentBitrate = 0
    this.currentPacketRate = 0
  }

  recordPacket(bytes) {
    const now = Date.now()
    this.samples.push({ time: now, bytes })
    this.totalBytesSent += bytes
    this.totalPacketsSent++
    
    this._cleanup(now)
    this._calculate(now)
  }

  _cleanup(now) {
    const cutoffTime = now - this.windowSize
    while (this.samples.length > 0 && this.samples[0].time < cutoffTime) {
      this.samples.shift()
    }
  }

  _calculate(now) {
    if (this.samples.length === 0) {
      this.currentBitrate = 0
      this.currentPacketRate = 0
      return
    }

    const timeSpan = this.windowSize / 1000
    const bytesInWindow = this.samples.reduce((sum, s) => sum + s.bytes, 0)
    
    this.currentBitrate = (bytesInWindow * 8) / timeSpan
    this.currentPacketRate = this.samples.length / timeSpan
  }

  getCurrentBitrate() {
    return this.currentBitrate
  }

  getCurrentPacketRate() {
    return this.currentPacketRate
  }

  getAverageBitrate() {
    const elapsed = (Date.now() - this.startTime) / 1000
    if (elapsed === 0) return 0
    return (this.totalBytesSent * 8) / elapsed
  }

  getTotalBytesSent() {
    return this.totalBytesSent
  }

  getTotalPacketsSent() {
    return this.totalPacketsSent
  }

  reset() {
    this.samples = []
    this.totalBytesSent = 0
    this.totalPacketsSent = 0
    this.startTime = Date.now()
    this.currentBitrate = 0
    this.currentPacketRate = 0
  }

  getStats() {
    return {
      currentBitrate: this.currentBitrate,
      currentPacketRate: this.currentPacketRate,
      averageBitrate: this.getAverageBitrate(),
      totalBytesSent: this.totalBytesSent,
      totalPacketsSent: this.totalPacketsSent,
      samplesInWindow: this.samples.length
    }
  }
}
