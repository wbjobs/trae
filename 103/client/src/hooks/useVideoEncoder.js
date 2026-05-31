import { useState, useRef, useCallback, useEffect } from 'react'

export function useVideoEncoder({ config, onEncodedChunk, encoderRef }) {
  const [isEncodingReady, setIsEncodingReady] = useState(false)
  const [encoderError, setEncoderError] = useState(null)

  const pendingKeyFrameRef = useRef(false)
  const lastConfigRef = useRef(null)

  const initEncoder = useCallback(async () => {
    if (encoderRef.current) {
      try {
        encoderRef.current.close()
      } catch {}
    }

    const encoder = new VideoEncoder({
      output: (chunk, metadata) => {
        if (onEncodedChunk) {
          onEncodedChunk(chunk, metadata)
        }
      },
      error: (err) => {
        console.error('[useVideoEncoder] Encoder error:', err)
        setEncoderError(err.message)
        setIsEncodingReady(false)
      }
    })

    const encoderConfig = {
      codec: config.codec,
      width: config.width,
      height: config.height,
      bitrate: config.bitrate,
      framerate: config.framerate,
      latencyMode: config.latencyMode,
      hardwareAcceleration: 'prefer-hardware'
    }

    try {
      await encoder.configure(encoderConfig)
      encoderRef.current = encoder
      setIsEncodingReady(true)
      setEncoderError(null)
      lastConfigRef.current = { ...config }
      console.log('[useVideoEncoder] Encoder configured:', encoderConfig)
    } catch (err) {
      console.error('[useVideoEncoder] Configure failed:', err)
      setEncoderError(err.message)
      setIsEncodingReady(false)
    }
  }, [config, onEncodedChunk, encoderRef])

  useEffect(() => {
    const last = lastConfigRef.current
    const needsReconfigure = !last ||
      last.codec !== config.codec ||
      last.width !== config.width ||
      last.height !== config.height ||
      last.bitrate !== config.bitrate ||
      last.framerate !== config.framerate ||
      last.latencyMode !== config.latencyMode

    if (needsReconfigure) {
      initEncoder()
    }
  }, [config.codec, config.width, config.height, config.bitrate, config.framerate, config.latencyMode, initEncoder])

  const encodeFrame = useCallback((frame) => {
    if (!encoderRef.current || encoderRef.current.state !== 'configured') {
      frame.close()
      return
    }

    try {
      const insertKeyFrame = pendingKeyFrameRef.current
      encoderRef.current.encode(frame, { keyFrame: insertKeyFrame })
      if (insertKeyFrame) {
        pendingKeyFrameRef.current = false
      }
    } catch (err) {
      console.warn('[useVideoEncoder] Encode error:', err)
    } finally {
      frame.close()
    }
  }, [encoderRef])

  return {
    encodeFrame,
    isEncodingReady,
    encoderError,
    requestKeyFrame: () => { pendingKeyFrameRef.current = true }
  }
}
