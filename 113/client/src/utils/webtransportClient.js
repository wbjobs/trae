import { SendRateMonitor } from './sendRateMonitor.js'

const PACKET_TYPE_INIT = 0
const PACKET_TYPE_FRAME = 1
const PACKET_TYPE_END = 2
const PACKET_TYPE_ACK = 3

const HEADER_SIZE = 12

export class WebTransportClient {
  constructor(options = {}) {
    this.url = options.url || 'https://localhost:4433'
    this.transport = null
    this.datagramWriter = null
    this.datagramReader = null
    this.stream = null
    this.writer = null
    this.reader = null
    this.isConnected = false
    this.onStatusChange = options.onStatusChange || null
    this.onDataReceived = options.onDataReceived || null
    this.onQueueStatusChange = options.onQueueStatusChange || null
    this.sentBytes = 0
    this.sentFrames = 0
    this.queue = []
    this.isSending = false
    this.maxQueueSize = options.maxQueueSize || 100
    this.rateMonitor = new SendRateMonitor({ windowSize: 1000 })
    this.lastQueueReportTime = 0
    this.queueReportInterval = 200
    this.droppedFrames = 0
  }

  async connect() {
    try {
      if (!('WebTransport' in window)) {
        throw new Error('当前浏览器不支持 WebTransport，请使用 Chrome 114+ 或 Edge 114+')
      }

      this.transport = new WebTransport(this.url)
      
      this.transport.closed
        .then(() => {
          console.log('WebTransport 连接已关闭')
          this.isConnected = false
          this._notifyStatus('disconnected')
        })
        .catch((error) => {
          console.error('WebTransport 连接错误:', error)
          this.isConnected = false
          this._notifyStatus('error', error)
        })

      this.transport.ready
        .then(() => {
          console.log('WebTransport 连接成功')
          this.isConnected = true
          this._notifyStatus('connected')
          this._startSending()
        })
        .catch((error) => {
          console.error('WebTransport 连接失败:', error)
          throw error
        })

      await this.transport.ready

      this.datagramWriter = this.transport.datagrams.writable.getWriter()
      this.datagramReader = this.transport.datagrams.readable.getReader()

      this.stream = await this.transport.createBidirectionalStream()
      this.writer = this.stream.writable.getWriter()
      this.reader = this.stream.readable.getReader()

      this._startReading()

      return true
    } catch (error) {
      console.error('连接失败:', error)
      throw error
    }
  }

  sendData(data, options = {}) {
    if (!this.isConnected) return false

    if (this.queue.length >= this.maxQueueSize) {
      const removed = this._removeOldestNonKeyFrame()
      if (removed) {
        this.droppedFrames++
      } else if (this.queue.length >= this.maxQueueSize * 1.5) {
        return false
      }
    }

    const packet = this._createBinaryPacket(
      PACKET_TYPE_FRAME,
      data,
      options.frameIndex || 0,
      options.isKeyFrame || false,
      options.timestamp || Date.now()
    )

    this.queue.push(packet)
    
    this._maybeReportQueueStatus()

    return true
  }

  _removeOldestNonKeyFrame() {
    for (let i = 0; i < this.queue.length; i++) {
      const packet = this.queue[i]
      const isKeyFrame = this._isKeyFrame(packet)
      
      if (!isKeyFrame) {
        this.queue.splice(i, 1)
        return true
      }
    }
    return false
  }

  _createBinaryPacket(type, data, frameIndex, isKeyFrame, timestamp) {
    const buffer = new ArrayBuffer(HEADER_SIZE + data.length)
    const view = new DataView(buffer)
    
    view.setUint8(0, type)
    view.setUint8(1, isKeyFrame ? 1 : 0)
    view.setUint32(2, frameIndex, false)
    view.setFloat64(6, timestamp, false)
    
    const uint8View = new Uint8Array(buffer)
    uint8View.set(data, HEADER_SIZE)
    
    return buffer
  }

  _isKeyFrame(packet) {
    const view = new DataView(packet)
    return view.getUint8(1) === 1
  }

  async _startSending() {
    while (this.isConnected) {
      if (this.queue.length > 0 && this.writer) {
        const packet = this.queue.shift()
        
        try {
          const uint8Array = new Uint8Array(packet)
          
          await this.writer.write(uint8Array)
          
          this.rateMonitor.recordPacket(uint8Array.length)
          this.sentBytes += uint8Array.length
          this.sentFrames++
        } catch (error) {
          console.error('发送数据失败:', error)
          this.queue.unshift(packet)
          await this._sleep(10)
        }
      }
      
      this._maybeReportQueueStatus()
      
      if (this.queue.length === 0) {
        await this._sleep(1)
      }
    }
  }

  async _startReading() {
    try {
      while (this.isConnected && this.reader) {
        const { value, done } = await this.reader.read()
        
        if (done) break
        
        if (value && this.onDataReceived) {
          this.onDataReceived(value)
        }
      }
    } catch (error) {
      console.log('读取结束:', error.message)
    }
  }

  sendInit(config) {
    const configData = new TextEncoder().encode(JSON.stringify(config))
    const packet = this._createBinaryPacket(
      PACKET_TYPE_INIT,
      configData,
      0,
      true,
      Date.now()
    )
    this.queue.unshift(packet)
  }

  sendEnd() {
    const packet = this._createBinaryPacket(
      PACKET_TYPE_END,
      new Uint8Array(0),
      0,
      true,
      Date.now()
    )
    this.queue.push(packet)
  }

  _notifyStatus(status, error = null) {
    if (this.onStatusChange) {
      this.onStatusChange({ status, error, time: Date.now() })
    }
  }

  _maybeReportQueueStatus() {
    const now = Date.now()
    if (now - this.lastQueueReportTime >= this.queueReportInterval) {
      this.lastQueueReportTime = now
      
      if (this.onQueueStatusChange) {
        this.onQueueStatusChange({
          queueSize: this.queue.length,
          maxQueueSize: this.maxQueueSize,
          currentBitrate: this.rateMonitor.getCurrentBitrate(),
          droppedFrames: this.droppedFrames,
          sentBytes: this.sentBytes,
          sentFrames: this.sentFrames
        })
      }
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getStats() {
    return {
      isConnected: this.isConnected,
      sentBytes: this.sentBytes,
      sentFrames: this.sentFrames,
      queueSize: this.queue.length,
      currentBitrate: this.rateMonitor.getCurrentBitrate(),
      droppedFrames: this.droppedFrames
    }
  }

  getCurrentSendBitrate() {
    return this.rateMonitor.getCurrentBitrate()
  }

  async close() {
    this.isConnected = false

    try {
      if (this.writer) {
        await this.writer.close()
        this.writer = null
      }
      
      if (this.datagramWriter) {
        await this.datagramWriter.close()
        this.datagramWriter = null
      }
      
      if (this.transport) {
        await this.transport.close()
        this.transport = null
      }
      
      this.queue = []
      this._notifyStatus('disconnected')
    } catch (error) {
      console.error('关闭连接时出错:', error)
    }
  }
}
