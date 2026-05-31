import { useState, useRef, useEffect, useCallback } from 'react'

const FAST_REPORT_INTERVAL = 500
const NORMAL_REPORT_INTERVAL = 1000
const SUDDEN_LOSS_DELTA = 0.06
const SEVERE_LOSS_THRESHOLD = 0.12

export function useWebTransport({ transport, connected, onBitrateChange }) {
  const [rtt, setRtt] = useState(0)
  const [packetLoss, setPacketLoss] = useState(0)
  const [qualityScore, setQualityScore] = useState(0)
  const [suggestedBitrate, setSuggestedBitrate] = useState(2_000_000)
  const [bitrateTrend, setBitrateTrend] = useState('stable')

  const signalStreamRef = useRef(null)
  const signalWriterRef = useRef(null)
  const signalReaderRef = useRef(null)
  const pingIntervalRef = useRef(null)
  const statsSendIntervalRef = useRef(null)

  const rttRef = useRef(0)
  const packetLossRef = useRef(0)
  const lastReportedLossRef = useRef(0)
  const lastReportedTimeRef = useRef(0)

  const sentPacketsRef = useRef(0)
  const receivedPacketsRef = useRef(new Set())
  const maxSeqRef = useRef(0)

  const sendSignal = useCallback(async (msg) => {
    if (!signalWriterRef.current) return
    try {
      const encoded = new TextEncoder().encode(JSON.stringify(msg))
      await signalWriterRef.current.write(encoded)
    } catch (err) {
      console.warn('[useWebTransport] Signal send error:', err)
    }
  }, [])

  const measurePacketLoss = useCallback(() => {
    const totalExpected = maxSeqRef.current + 1
    const received = receivedPacketsRef.current.size
    const loss = totalExpected > 0 ? 1 - (received / totalExpected) : 0
    return Math.max(0, Math.min(1, loss))
  }, [])

  const sendStats = useCallback(() => {
    const now = Date.now()
    const loss = measurePacketLoss()
    packetLossRef.current = loss

    const lossDelta = Math.abs(loss - lastReportedLossRef.current)
    const isSuddenChange = lossDelta > SUDDEN_LOSS_DELTA
    const isSevere = loss > SEVERE_LOSS_THRESHOLD

    const shouldSendNow = isSuddenChange || isSevere || (now - lastReportedTimeRef.current >= NORMAL_REPORT_INTERVAL)

    if (shouldSendNow) {
      setPacketLoss(loss)

      sendSignal({
        type: 'networkStats',
        rtt: rttRef.current,
        packetLoss: loss,
        timestamp: Date.now()
      })

      lastReportedLossRef.current = loss
      lastReportedTimeRef.current = now
    }
  }, [sendSignal, measurePacketLoss])

  useEffect(() => {
    if (!transport || !connected) return

    let cancelled = false

    const setupStreams = async () => {
      try {
        const bidiStream = await transport.createBidirectionalStream()
        signalStreamRef.current = bidiStream
        signalWriterRef.current = bidiStream.writable.getWriter()
        signalReaderRef.current = bidiStream.readable.getReader()

        const readLoop = async () => {
          while (!cancelled) {
            try {
              const { value, done } = await signalReaderRef.current.read()
              if (done) break

              const text = new TextDecoder().decode(value)
              const msg = JSON.parse(text)

              switch (msg.type) {
                case 'pong': {
                  const measuredRtt = Date.now() - msg.originalTimestamp
                  rttRef.current = measuredRtt
                  setRtt(measuredRtt)
                  break
                }
                case 'bitrateAdvice': {
                  setRtt(msg.rtt || 0)
                  setPacketLoss(msg.packetLoss || 0)
                  setQualityScore(msg.qualityScore || 0)
                  setSuggestedBitrate(msg.suggestedBitrate || 2_000_000)
                  setBitrateTrend(msg.bitrateTrend || 'stable')

                  if (onBitrateChange && msg.suggestedBitrate) {
                    onBitrateChange(msg.suggestedBitrate)
                  }
                  break
                }
                default:
                  console.warn('[useWebTransport] Unknown signal:', msg.type)
              }
            } catch (err) {
              if (err.name !== 'AbortError') {
                console.warn('[useWebTransport] Signal read error:', err)
              }
              break
            }
          }
        }

        readLoop()

        pingIntervalRef.current = setInterval(() => {
          sendSignal({ type: 'ping', timestamp: Date.now() })
        }, 1000)

        statsSendIntervalRef.current = setInterval(() => {
          sendStats()
        }, FAST_REPORT_INTERVAL)
      } catch (err) {
        console.error('[useWebTransport] Stream setup error:', err)
      }
    }

    setupStreams()

    return () => {
      cancelled = true

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
        pingIntervalRef.current = null
      }
      if (statsSendIntervalRef.current) {
        clearInterval(statsSendIntervalRef.current)
        statsSendIntervalRef.current = null
      }
      if (signalWriterRef.current) {
        signalWriterRef.current.close().catch(() => {})
        signalWriterRef.current = null
      }
      signalStreamRef.current = null
    }
  }, [transport, connected, sendSignal, sendStats, onBitrateChange])

  return {
    signalReader: signalReaderRef.current,
    signalWriter: signalWriterRef.current,
    rtt,
    packetLoss,
    qualityScore,
    suggestedBitrate,
    bitrateTrend
  }
}
