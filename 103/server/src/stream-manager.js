import { BitrateEstimator } from './bitrate-estimator.js'

const CLIENT_ID_COUNTER = { value: 1 }

export class StreamManager {
  constructor() {
    this.clients = new Map()
    this.bitrateEstimators = new Map()
    this.signalStreams = new Map()
    this.lastMediaData = new Map()
  }

  addClient(session, signalStream) {
    const clientId = CLIENT_ID_COUNTER.value++
    this.clients.set(session, clientId)

    const estimator = new BitrateEstimator()
    this.bitrateEstimators.set(clientId, estimator)

    this.signalStreams.set(clientId, signalStream)

    this._startSignalReader(clientId, signalStream)

    return clientId
  }

  removeClient(session) {
    const clientId = this.clients.get(session)
    if (clientId) {
      this.clients.delete(session)
      this.bitrateEstimators.delete(clientId)
      this.signalStreams.delete(clientId)
      this.lastMediaData.delete(clientId)
      console.log(`[StreamManager] Client ${clientId} removed`)
    }
  }

  _startSignalReader(clientId, signalStream) {
    const reader = signalStream.readable.getReader()
    const writer = signalStream.writable.getWriter()

    ;(async () => {
      while (true) {
        try {
          const { value, done } = await reader.read()
          if (done) break

          const text = new TextDecoder().decode(value)
          const msg = JSON.parse(text)

          await this._handleSignalMessage(clientId, msg, writer)
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.error(`[StreamManager] Signal read error for client ${clientId}:`, err)
          }
          break
        }
      }
    })()
  }

  async _handleSignalMessage(clientId, msg, writer) {
    switch (msg.type) {
      case 'ping': {
        const pong = {
          type: 'pong',
          originalTimestamp: msg.timestamp,
          serverTime: Date.now()
        }
        const encoded = new TextEncoder().encode(JSON.stringify(pong))
        await writer.write(encoded)
        break
      }
      case 'networkStats': {
        const estimator = this.bitrateEstimators.get(clientId)
        if (estimator) {
          estimator.updateStats(msg)

          const suggestion = estimator.getBitrateSuggestion()
          const qualityScore = estimator.getQualityScore()

          const response = {
            type: 'bitrateAdvice',
            suggestedBitrate: suggestion.suggestedBitrate,
            qualityScore,
            rtt: estimator.rtt,
            packetLoss: estimator.packetLoss,
            bitrateTrend: suggestion.trend,
            timestamp: Date.now()
          }

          const encoded = new TextEncoder().encode(JSON.stringify(response))
          await writer.write(encoded)
        }
        break
      }
      default:
        console.warn(`[StreamManager] Unknown signal type: ${msg.type}`)
    }
  }

  async handleDatagram(data, session) {
    const clientId = this.clients.get(session)
    if (!clientId) return

    try {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
      const sequenceNumber = view.getUint16(0)
      const timestamp = view.getUint32(2) >>> 0
      const flags = data.byteLength > 6 ? view.getUint8(6) : 0
      const isFecPacket = (flags & 0x40) !== 0

      if (!isFecPacket) {
        this.lastMediaData.set(clientId, {
          sequenceNumber,
          timestamp,
          data,
          receivedAt: Date.now()
        })
      }

      this._broadcastToOthers(clientId, data)
    } catch (err) {
      console.error('[StreamManager] Datagram parsing error:', err)
    }
  }

  _broadcastToOthers(sourceClientId, data) {
    for (const [session, clientId] of this.clients.entries()) {
      if (clientId !== sourceClientId) {
        try {
          session.sendDatagram(data)
        } catch (err) {
          console.warn(`[StreamManager] Failed to send datagram to client ${clientId}:`, err)
        }
      }
    }
  }
}
