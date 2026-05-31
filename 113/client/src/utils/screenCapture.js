export class ScreenCapture {
  constructor(options = {}) {
    this.fps = options.fps || 60
    this.stream = null
    this.videoTrack = null
    this.onFrame = options.onFrame || null
    this.isCapturing = false
    this._frameInterval = 1000 / this.fps
    this._lastFrameTime = 0
    this._animationFrameId = null
    this._canvas = document.createElement('canvas')
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: true })
    this._videoElement = document.createElement('video')
    this._videoElement.muted = true
    this._videoElement.playsInline = true
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: this.fps, max: this.fps },
          cursor: 'always'
        },
        audio: false
      })

      this.videoTrack = this.stream.getVideoTracks()[0]
      const settings = this.videoTrack.getSettings()
      
      this._canvas.width = settings.width || 1920
      this._canvas.height = settings.height || 1080

      this._videoElement.srcObject = this.stream
      await this._videoElement.play()

      this.isCapturing = true
      this._captureLoop()

      return {
        width: this._canvas.width,
        height: this._canvas.height,
        fps: this.fps
      }
    } catch (error) {
      console.error('屏幕捕获失败:', error)
      throw error
    }
  }

  _captureLoop() {
    if (!this.isCapturing) return

    const now = performance.now()
    const elapsed = now - this._lastFrameTime

    if (elapsed >= this._frameInterval) {
      this._lastFrameTime = now - (elapsed % this._frameInterval)

      this._ctx.drawImage(this._videoElement, 0, 0, this._canvas.width, this._canvas.height)
      
      const imageData = this._ctx.getImageData(0, 0, this._canvas.width, this._canvas.height)
      
      if (this.onFrame) {
        this.onFrame(imageData, this._canvas)
      }
    }

    this._animationFrameId = requestAnimationFrame(() => this._captureLoop())
  }

  stop() {
    this.isCapturing = false
    
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId)
      this._animationFrameId = null
    }

    if (this._videoElement) {
      this._videoElement.pause()
      this._videoElement.srcObject = null
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }

    this.videoTrack = null
  }

  getResolution() {
    return {
      width: this._canvas.width,
      height: this._canvas.height
    }
  }
}
