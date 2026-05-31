const MIN_BITRATE = 128_000
const MAX_BITRATE = 8_000_000
const START_BITRATE = 2_000_000

const RTT_GOOD_THRESHOLD = 50
const RTT_FAIR_THRESHOLD = 150
const RTT_POOR_THRESHOLD = 300

const LOSS_GOOD_THRESHOLD = 0.02
const LOSS_FAIR_THRESHOLD = 0.05
const LOSS_POOR_THRESHOLD = 0.10

const ADJUST_INTERVAL = 1000

const LOSS_SMOOTH_NORMAL = 0.3
const LOSS_SMOOTH_FAST = 0.7

const SUDDEN_LOSS_DELTA = 0.06
const SEVERE_LOSS_THRESHOLD = 0.15

export class BitrateEstimator {
  constructor() {
    this.rtt = 0
    this.packetLoss = 0
    this.bitrate = START_BITRATE
    this.lastAdjustTime = 0
    this.history = []
    this.suggestedBitrate = START_BITRATE
    this.rttSmoothed = 0
    this.lossSmoothed = 0
    this.rawLoss = 0
    this.rawRtt = 0
  }

  updateStats(stats) {
    const now = Date.now()
    let shouldImmediateAdjust = false

    if (stats.rtt !== undefined && stats.rtt > 0) {
      this.rawRtt = stats.rtt
      this.rtt = stats.rtt
      this.rttSmoothed = this._smooth(this.rttSmoothed, stats.rtt, LOSS_SMOOTH_NORMAL)
    }

    if (stats.packetLoss !== undefined && stats.packetLoss >= 0) {
      const prevSmoothed = this.lossSmoothed
      this.rawLoss = stats.packetLoss
      this.packetLoss = stats.packetLoss

      const lossDelta = Math.abs(stats.packetLoss - prevSmoothed)
      const smoothingFactor = lossDelta > SUDDEN_LOSS_DELTA ? LOSS_SMOOTH_FAST : LOSS_SMOOTH_NORMAL
      this.lossSmoothed = this._smooth(prevSmoothed, stats.packetLoss, smoothingFactor)

      if (stats.packetLoss > SEVERE_LOSS_THRESHOLD || (lossDelta > SUDDEN_LOSS_DELTA && stats.packetLoss > LOSS_POOR_THRESHOLD)) {
        shouldImmediateAdjust = true
      }
    }

    this.history.push({
      time: now,
      rtt: this.rtt,
      packetLoss: this.packetLoss,
      bitrate: this.bitrate
    })

    if (this.history.length > 100) {
      this.history.shift()
    }

    if (shouldImmediateAdjust || now - this.lastAdjustTime >= ADJUST_INTERVAL) {
      this._adjustBitrate(shouldImmediateAdjust)
      this.lastAdjustTime = now
    }
  }

  _smooth(prev, current, factor) {
    return prev * (1 - factor) + current * factor
  }

  _adjustBitrate(useRaw) {
    const rtt = useRaw ? this.rawRtt : this.rttSmoothed
    const loss = useRaw ? this.rawLoss : this.lossSmoothed

    let newBitrate = this.bitrate

    if (loss > SEVERE_LOSS_THRESHOLD) {
      newBitrate = this.bitrate * 0.25
    } else if (loss > LOSS_POOR_THRESHOLD) {
      newBitrate = this.bitrate * 0.4
    } else if (loss > LOSS_FAIR_THRESHOLD) {
      newBitrate = this.bitrate * 0.6
    } else if (rtt > RTT_POOR_THRESHOLD && loss > LOSS_GOOD_THRESHOLD) {
      newBitrate = this.bitrate * 0.5
    } else if (rtt > RTT_FAIR_THRESHOLD && loss > 0) {
      newBitrate = this.bitrate * 0.75
    } else if (rtt <= RTT_GOOD_THRESHOLD && loss <= LOSS_GOOD_THRESHOLD) {
      newBitrate = this.bitrate * 1.15
    } else if (rtt <= RTT_FAIR_THRESHOLD && loss <= LOSS_FAIR_THRESHOLD) {
      newBitrate = this.bitrate * 1.05
    } else if (rtt > RTT_POOR_THRESHOLD) {
      newBitrate = this.bitrate * 0.8
    } else if (rtt > RTT_FAIR_THRESHOLD) {
      newBitrate = this.bitrate * 0.9
    }

    newBitrate = Math.max(MIN_BITRATE, Math.min(MAX_BITRATE, newBitrate))

    this.bitrate = newBitrate
    this.suggestedBitrate = newBitrate
  }

  getBitrateSuggestion() {
    const prevBitrate = this.history.length >= 2
      ? this.history[this.history.length - 2].bitrate
      : this.bitrate

    let trend = 'stable'
    if (this.bitrate > prevBitrate * 1.05) {
      trend = 'increasing'
    } else if (this.bitrate < prevBitrate * 0.95) {
      trend = 'decreasing'
    }

    return {
      suggestedBitrate: this.suggestedBitrate,
      trend
    }
  }

  getQualityScore() {
    const rtt = this.rttSmoothed
    const loss = this.lossSmoothed

    let rttScore = 100
    if (rtt <= RTT_GOOD_THRESHOLD) {
      rttScore = 100 - (rtt / RTT_GOOD_THRESHOLD) * 15
    } else if (rtt <= RTT_FAIR_THRESHOLD) {
      rttScore = 85 - ((rtt - RTT_GOOD_THRESHOLD) / (RTT_FAIR_THRESHOLD - RTT_GOOD_THRESHOLD)) * 35
    } else if (rtt <= RTT_POOR_THRESHOLD) {
      rttScore = 50 - ((rtt - RTT_FAIR_THRESHOLD) / (RTT_POOR_THRESHOLD - RTT_FAIR_THRESHOLD)) * 30
    } else {
      rttScore = 20 - Math.min(20, (rtt - RTT_POOR_THRESHOLD) / 50)
    }

    let lossScore = 100
    if (loss <= LOSS_GOOD_THRESHOLD) {
      lossScore = 100 - (loss / LOSS_GOOD_THRESHOLD) * 15
    } else if (loss <= LOSS_FAIR_THRESHOLD) {
      lossScore = 85 - ((loss - LOSS_GOOD_THRESHOLD) / (LOSS_FAIR_THRESHOLD - LOSS_GOOD_THRESHOLD)) * 40
    } else if (loss <= LOSS_POOR_THRESHOLD) {
      lossScore = 45 - ((loss - LOSS_FAIR_THRESHOLD) / (LOSS_POOR_THRESHOLD - LOSS_FAIR_THRESHOLD)) * 30
    } else {
      lossScore = 15 - Math.min(15, (loss - LOSS_POOR_THRESHOLD) * 100)
    }

    const combinedScore = rttScore * 0.55 + lossScore * 0.45
    return Math.max(0, Math.min(100, Math.round(combinedScore)))
  }
}
