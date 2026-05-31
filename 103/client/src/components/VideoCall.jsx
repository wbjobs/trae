import React, { useState, useRef, useEffect, useCallback } from 'react'
import VideoPlayer from './VideoPlayer.jsx'
import { useVideoEncoder } from '../hooks/useVideoEncoder.js'
import { useWebTransport } from '../hooks/useWebTransport.js'
import { FecEncoder, FecDecoder, parsePacketHeader } from '../utils/fec.js'
import { FecController } from '../utils/fec-controller.js'

export default function VideoCall({
  transport,
  connected,
  encodingConfig,
  onNetworkStatsUpdate,
  onBitrateChange,
  serverUrl
}) {
  const [localStream, setLocalStream] = useState(null)
  const [remoteFrames, setRemoteFrames] = useState(0)
  const [mediaError, setMediaError] = useState(null)
  const [fecStats, setFecStats] = useState({
    enabled: false,
    groupSize: 1,
    redundancyPercent: 0,
    recoveryRate: 0,
    effectiveThroughput: 1
  })

  const videoRef = useRef(null)
  const remoteCanvasRef = useRef(null)
  const encoderRef = useRef(null)
  const decoderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const fecEncoderRef = useRef(null)
  const fecDecoderRef = useRef(null)
  const fecControllerRef = useRef(null)

  const sequenceNumberRef = useRef(0)
  const actualPayloadBytesRef = useRef(0)
  const totalSentBytesRef = useRef(0)
  const recoveredPacketsRef = useRef(0)
  const totalReceivedDataPacketsRef = useRef(0)
  const receivedPacketsRef = useRef(new Set())
  const maxSeqRef = useRef(0)
  const fecAdjustIntervalRef = useRef(null)

  useEffect(() => {
    fecEncoderRef.current = new FecEncoder()
    fecDecoderRef.current = new FecDecoder()
    fecControllerRef.current = new FecController()
  }, [])

  const { encodeFrame, isEncodingReady } = useVideoEncoder({
    config: encodingConfig,
    onEncodedChunk: useCallback((chunk, metadata) => {
      if (!transport || !chunk || !fecEncoderRef.current || !fecControllerRef.current) return

      const chunkData = new Uint8Array(chunk.byteLength)
      chunk.copyTo(chunkData)

      const fecConfig = fecControllerRef.current.getConfig()
      fecEncoderRef.current.configure(fecConfig.fecGroupSize)

      const seqNum = sequenceNumberRef.current++
      const isKeyFrame = chunk.type === 'key'

      const result = fecEncoderRef.current.encode(
        seqNum,
        chunk.timestamp,
        isKeyFrame,
        chunkData
      )

      try {
        for (const primary of result.primaryPackets) {
          transport.sendDatagram(primary)
          actualPayloadBytesRef.current += primary.length - 10
          totalSentBytesRef.current += primary.length
        }

        for (const redundant of result.redundantPackets) {
          transport.sendDatagram(redundant)
          totalSentBytesRef.current += redundant.length
        }
      } catch (err) {
        console.warn('[VideoCall] Failed to send datagram:', err)
      }
    }, [transport]),
    encoderRef
  })

  const {
    signalReader,
    signalWriter,
    rtt,
    packetLoss,
    qualityScore,
    suggestedBitrate,
    bitrateTrend
  } = useWebTransport({
    transport,
    connected,
    onBitrateChange
  })

  useEffect(() => {
    if (!fecControllerRef.current) return

    fecControllerRef.current.updateStats(
      packetLoss,
      actualPayloadBytesRef.current,
      totalSentBytesRef.current,
      recoveredPacketsRef.current,
      totalReceivedDataPacketsRef.current
    )

    const config = fecControllerRef.current.getConfig()
    setFecStats({
      enabled: config.isEnabled,
      groupSize: config.fecGroupSize,
      redundancyPercent: config.redundancyPercent,
      recoveryRate: config.recoveryRate,
      effectiveThroughput: config.effectiveThroughput
    })
  }, [packetLoss])

  useEffect(() => {
    if (!transport || !connected) return

    fecAdjustIntervalRef.current = setInterval(() => {
      if (fecControllerRef.current) {
        fecControllerRef.current.updateStats(
          packetLoss,
          actualPayloadBytesRef.current,
          totalSentBytesRef.current,
          recoveredPacketsRef.current,
          totalReceivedDataPacketsRef.current
        )
      }
    }, 2000)

    return () => {
      if (fecAdjustIntervalRef.current) {
        clearInterval(fecAdjustIntervalRef.current)
        fecAdjustIntervalRef.current = null
      }
    }
  }, [transport, connected, packetLoss])

  useEffect(() => {
    if (onNetworkStatsUpdate) {
      onNetworkStatsUpdate({
        rtt,
        packetLoss,
        qualityScore,
        currentBitrate: encodingConfig.bitrate,
        suggestedBitrate,
        bitrateTrend,
        fecEnabled: fecStats.enabled,
        fecGroupSize: fecStats.groupSize,
        fecRedundancy: fecStats.redundancyPercent,
        fecRecoveryRate: fecStats.recoveryRate,
        fecEffectiveThroughput: fecStats.effectiveThroughput
      })
    }
  }, [rtt, packetLoss, qualityScore, suggestedBitrate, bitrateTrend, encodingConfig.bitrate, onNetworkStatsUpdate, fecStats])

  useEffect(() => {
    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: encodingConfig.width },
            height: { ideal: encodingConfig.height },
            frameRate: { ideal: encodingConfig.framerate }
          },
          audio: true
        })
        mediaStreamRef.current = stream
        setLocalStream(stream)

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.muted = true
          videoRef.current.play().catch(() => {})
        }

        startEncodingLoop(stream)
      } catch (err) {
        console.error('[VideoCall] Camera error:', err)
        setMediaError(err.message)
      }
    }

    if (connected && isEncodingReady && !localStream) {
      initCamera()
    }

    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop())
        mediaStreamRef.current = null
      }
    }
  }, [connected, isEncodingReady])

  const startEncodingLoop = useCallback((stream) => {
    const videoTrack = stream.getVideoTracks()[0]
    const processor = new MediaStreamTrackProcessor({ track: videoTrack })
    const reader = processor.readable.getReader()

    let frameCount = 0
    const encodeInterval = Math.max(1, Math.round(30 / encodingConfig.framerate))

    ;(async () => {
      while (true) {
        try {
          const { value: frame, done } = await reader.read()
          if (done) break

          frameCount++
          if (frameCount % encodeInterval === 0) {
            encodeFrame(frame)
          } else {
            frame.close()
          }
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.error('[VideoCall] Frame read error:', err)
          }
          break
        }
      }
    })()
  }, [encodeFrame, encodingConfig.framerate])

  useEffect(() => {
    if (!transport || !connected) return

    const initDecoder = async () => {
      decoderRef.current = new VideoDecoder({
        output: (frame) => {
          if (remoteCanvasRef.current) {
            const ctx = remoteCanvasRef.current.getContext('2d')
            ctx.drawImage(frame, 0, 0, remoteCanvasRef.current.width, remoteCanvasRef.current.height)
          }
          frame.close()
          setRemoteFrames((c) => c + 1)
        },
        error: (err) => {
          console.error('[VideoCall] Decoder error:', err)
        }
      })

      const config = {
        codec: encodingConfig.codec,
        codedWidth: encodingConfig.width,
        codedHeight: encodingConfig.height
      }

      try {
        await decoderRef.current.configure(config)
      } catch (err) {
        console.warn('[VideoCall] Decoder configure failed:', err)
      }
    }

    initDecoder()

    return () => {
      if (decoderRef.current) {
        decoderRef.current.close()
        decoderRef.current = null
      }
    }
  }, [transport, connected, encodingConfig.codec, encodingConfig.width, encodingConfig.height])

  useEffect(() => {
    if (!transport || !connected) return

    const handleDatagram = (evt) => {
      try {
        const data = new Uint8Array(evt.data)
        const header = parsePacketHeader(data)

        if (!header.isFecPacket) {
          totalReceivedDataPacketsRef.current++
        }

        if (header.sequenceNumber > maxSeqRef.current) {
          maxSeqRef.current = header.sequenceNumber
        }
        receivedPacketsRef.current.add(header.sequenceNumber)

        if (!header.isFecPacket && decoderRef.current && decoderRef.current.state === 'configured') {
          const chunk = new EncodedVideoChunk({
            type: header.isKeyFrame ? 'key' : 'delta',
            timestamp: header.timestamp,
            data: header.payload
          })
          decoderRef.current.decode(chunk)
        }

        if (fecDecoderRef.current && header.fecGroupSize > 1) {
          const result = fecDecoderRef.current.receive(header)

          if (result.recovered && decoderRef.current && decoderRef.current.state === 'configured') {
            recoveredPacketsRef.current++
            try {
              const chunk = new EncodedVideoChunk({
                type: result.recovered.isKeyFrame ? 'key' : 'delta',
                timestamp: result.recovered.timestamp,
                data: result.recovered.payload
              })
              decoderRef.current.decode(chunk)
            } catch (err) {
              console.warn('[VideoCall] FEC recovered chunk decode error:', err)
            }
          }
        }
      } catch (err) {
        console.warn('[VideoCall] Datagram parse error:', err)
      }
    }

    transport.addEventListener('datagram', handleDatagram)

    return () => {
      transport.removeEventListener('datagram', handleDatagram)
    }
  }, [transport, connected])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="video-container">
        {localStream ? (
          <video ref={videoRef} autoPlay playsInline muted />
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#666',
            fontSize: '14px'
          }}>
            {connected ? 'Starting camera...' : 'Connect to server to start video call'}
            {mediaError && <span style={{ color: '#f44336', marginLeft: '12px' }}>{mediaError}</span>}
          </div>
        )}
        <span className="video-label">Local (You)</span>
      </div>

      <div className="video-container video-h264">
        <canvas
          ref={remoteCanvasRef}
          width={encodingConfig.width}
          height={encodingConfig.height}
          style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
        />
        <span className="video-label">Remote — {remoteFrames} frames</span>
        {fecStats.enabled && (
          <span className="video-label" style={{ right: '12px', left: 'auto', background: 'rgba(76,175,80,0.7)' }}>
            FEC {fecStats.redundancyPercent}%
          </span>
        )}
        {!connected && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: '14px',
            background: 'rgba(0,0,0,0.5)'
          }}>
            Waiting for remote stream...
          </div>
        )}
      </div>
    </div>
  )
}
