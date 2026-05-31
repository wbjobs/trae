const MIN_FEC_GROUP_SIZE = 1
const MAX_FEC_GROUP_SIZE = 50

const TARGET_LOSS_FOR_REDUNDANCY = 0.02
const MAX_ALLOWED_EFFECTIVE_LOSS = 0.15

const SMOOTHING_FACTOR = 0.4
const ADJUST_INTERVAL = 2000
const MIN_CHANGE_DELTA = 0.05

export class FecController {
  constructor() {
    this.fecGroupSize = MIN_FEC_GROUP_SIZE
    this.smoothedLoss = 0
    this.smoothedEffectiveThroughput = 1
    this.lastAdjustTime = 0
    this.history = []
    this.actualPayloadBytes = 0
    this.totalSentBytes = 0
    this.recoveredPackets = 0
    this.totalPackets = 0
  }

  updateStats(packetLoss, actualPayloadBytes, totalSentBytes, recoveredPackets, totalPackets) {
    const now = Date.now()

    this.actualPayloadBytes = actualPayloadBytes
    this.totalSentBytes = totalSentBytes
    this.recoveredPackets = recoveredPackets
    this.totalPackets = totalPackets

    this.smoothedLoss = this._smooth(this.smoothedLoss, packetLoss, SMOOTHING_FACTOR)

    const effectiveThroughput = totalSentBytes > 0 ? actualPayloadBytes / totalSentBytes : 1
    this.smoothedEffectiveThroughput = this._smooth(
      this.smoothedEffectiveThroughput,
      effectiveThroughput,
      SMOOTHING_FACTOR
    )

    this.history.push({
      time: now,
      packetLoss,
      fecGroupSize: this.fecGroupSize,
      effectiveThroughput
    })

    if (this.history.length > 50) {
      this.history.shift()
    }

    if (now - this.lastAdjustTime >= ADJUST_INTERVAL) {
      this._adjustGroupSize()
      this.lastAdjustTime = now
    }
  }

  _smooth(prev, current, factor) {
    return prev * (1 - factor) + current * factor
  }

  _adjustGroupSize() {
    const loss = this.smoothedLoss
    const effectiveThroughput = this.smoothedEffectiveThroughput
    const maxAllowedThroughputDrop = 0.15
    const minEffectiveThroughput = 1 - maxAllowedThroughputDrop

    let targetGroupSize = this.fecGroupSize

    if (loss > TARGET_LOSS_FOR_REDUNDANCY) {
      const recoveryRatio = 1 / Math.max(0.01, loss)
      targetGroupSize = Math.min(MAX_FEC_GROUP_SIZE, Math.max(MIN_FEC_GROUP_SIZE, Math.round(recoveryRatio)))
    } else {
      targetGroupSize = MIN_FEC_GROUP_SIZE
    }

    if (targetGroupSize > 1) {
      const expectedOverhead = 1 / targetGroupSize
      const expectedEffectiveThroughput = 1 - expectedOverhead

      if (expectedEffectiveThroughput < minEffectiveThroughput) {
        const maxAllowedOverhead = maxAllowedThroughputDrop
        const maxGroupSize = Math.floor(1 / maxAllowedOverhead)
        targetGroupSize = Math.max(MIN_FEC_GROUP_SIZE, Math.min(targetGroupSize, maxGroupSize))
      }

      if (effectiveThroughput < minEffectiveThroughput && this.fecGroupSize > 1) {
        targetGroupSize = Math.max(MIN_FEC_GROUP_SIZE, this.fecGroupSize - 1)
      }
    }

    if (loss < TARGET_LOSS_FOR_REDUNDANCY * 0.5 && this.fecGroupSize > 1) {
      targetGroupSize = Math.max(MIN_FEC_GROUP_SIZE, this.fecGroupSize - 2)
    }

    targetGroupSize = Math.max(MIN_FEC_GROUP_SIZE, Math.min(MAX_FEC_GROUP_SIZE, targetGroupSize))

    if (Math.abs(targetGroupSize - this.fecGroupSize) >= 1 ||
        (targetGroupSize === MIN_FEC_GROUP_SIZE && this.fecGroupSize > MIN_FEC_GROUP_SIZE) ||
        (targetGroupSize > MIN_FEC_GROUP_SIZE && this.fecGroupSize === MIN_FEC_GROUP_SIZE)) {
      this.fecGroupSize = targetGroupSize
    }
  }

  getConfig() {
    const redundancyPercent = this.fecGroupSize > 1
      ? Math.round((1 / this.fecGroupSize) * 100)
      : 0

    return {
      fecGroupSize: this.fecGroupSize,
      redundancyPercent,
      effectiveThroughput: this.smoothedEffectiveThroughput,
      smoothedLoss: this.smoothedLoss,
      recoveryRate: this.totalPackets > 0 ? (this.recoveredPackets / this.totalPackets) : 0,
      isEnabled: this.fecGroupSize > 1
    }
  }

  forceAdjust() {
    this.lastAdjustTime = 0
  }
}
