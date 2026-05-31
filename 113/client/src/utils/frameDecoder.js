export class FrameDecoder {
  constructor(options = {}) {
    this.decoder = null
    this.canvas = options.canvas || document.createElement('canvas')
    this.ctx = this.canvas.getContext('2d')
    this.isInitialized = false
    this.onFrameDecoded = options.onFrameDecoded || null
    this.decodedFrames = 0
  }

  async init(width, height) {
    if (!('VideoDecoder' in window)) {
      throw new Error('当前浏览器不支持 WebCodecs API')
    }

    this.canvas.width = width
    this.canvas.height = height

    const config = {
      codec: 'av01.0.08M.08',
      codedWidth: width,
      codedHeight: height
    }

    try {
      const supported = await VideoDecoder.isConfigSupported(config)
      if (!supported.supported) {
        throw new Error('AV1 解码配置不支持')
      }

      this.decoder = new VideoDecoder({
        output: (frame) => {
          this._handleDecodedFrame(frame)
        },
        error: (error) => {
          console.error('解码错误:', error)
        }
      })

      this.decoder.configure(config)
      this.isInitialized = true
    } catch (error) {
      console.error('初始化解码器失败:', error)
      throw error
    }
  }

  decodeFrame(encodedData, timestamp, isKeyFrame) {
    if (!this.isInitialized || !this.decoder) return

    try {
      const chunk = new EncodedVideoChunk({
        type: isKeyFrame ? 'key' : 'delta',
        timestamp: timestamp,
        data: encodedData
      })

      this.decoder.decode(chunk)
    } catch (error) {
      console.error('解码帧失败:', error)
    }
  }

  _handleDecodedFrame(frame) {
    this.decodedFrames++

    this.ctx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height)

    if (this.onFrameDecoded) {
      this.onFrameDecoded(frame, this.decodedFrames)
    }

    frame.close()
  }

  getDecodedFramesCount() {
    return this.decodedFrames
  }

  async flush() {
    if (this.decoder && this.decoder.state !== 'closed') {
      await this.decoder.flush()
    }
  }

  reset() {
    if (this.decoder) {
      this.decoder.reset()
    }
    this.decodedFrames = 0
  }

  close() {
    if (this.decoder) {
      this.decoder.close()
      this.decoder = null
    }
    this.isInitialized = false
    this.decodedFrames = 0
  }
}
