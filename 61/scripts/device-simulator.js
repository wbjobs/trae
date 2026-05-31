import net from 'net'
import { PROTOCOL_HEADER, PROTOCOL_TAIL, MSG_TYPE, buildMessage, parseMessage } from '../backend/src/protocol/index.js'

const SERVER_HOST = 'localhost'
const SERVER_PORT = 8888

const deviceConfigs = [
  { deviceId: 'DEV001', deviceName: 'CNC机床-A1', factory: 'factory-a' },
  { deviceId: 'DEV002', deviceName: '注塑机-B2', factory: 'factory-b' },
  { deviceId: 'DEV003', deviceName: '机器人-C3', factory: 'factory-c' },
  { deviceId: 'DEV004', deviceName: '传送带-A4', factory: 'factory-a' },
  { deviceId: 'DEV005', deviceName: '包装机-B5', factory: 'factory-b' }
]

class DeviceSimulator {
  constructor(config) {
    this.config = config
    this.client = null
    this.connected = false
    this.heartbeatTimer = null
    this.dataReportTimer = null
  }

  connect() {
    this.client = new net.Socket()
    
    this.client.connect(SERVER_PORT, SERVER_HOST, () => {
      console.log(`[${this.config.deviceId}] 已连接到服务器`)
      this.connected = true
      this.register()
    })

    this.client.on('data', (data) => {
      const msg = parseMessage(data)
      if (msg) {
        this.handleMessage(msg)
      }
    })

    this.client.on('close', () => {
      console.log(`[${this.config.deviceId}] 连接已关闭`)
      this.connected = false
      this.stopTimers()
      setTimeout(() => this.connect(), 5000)
    })

    this.client.on('error', (err) => {
      console.error(`[${this.config.deviceId}] 连接错误:`, err.message)
    })
  }

  register() {
    const payload = Buffer.from(JSON.stringify({
      deviceId: this.config.deviceId,
      deviceName: this.config.deviceName,
      factory: this.config.factory,
      model: 'V1.0',
      firmware: '2.1.0'
    }))
    this.sendMessage(MSG_TYPE.REGISTER, payload)
    console.log(`[${this.config.deviceId}] 发送注册请求`)
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      const payload = Buffer.from(JSON.stringify({
        deviceId: this.config.deviceId,
        timestamp: Date.now(),
        status: 'online'
      }))
      this.sendMessage(MSG_TYPE.HEARTBEAT, payload)
    }, 15000)
  }

  startDataReport() {
    this.dataReportTimer = setInterval(() => {
      const temperature = 20 + Math.random() * 60
      const pressure = 0.5 + Math.random() * 1.5
      const vibration = Math.random() * 10
      
      const payload = Buffer.from(JSON.stringify({
        deviceId: this.config.deviceId,
        timestamp: Date.now(),
        metrics: {
          temperature,
          pressure,
          vibration,
          rpm: Math.floor(1000 + Math.random() * 2000),
          power: 50 + Math.random() * 100
        }
      }))
      this.sendMessage(MSG_TYPE.DATA_REPORT, payload)
    }, 3000)
  }

  sendMessage(msgType, payload) {
    if (!this.connected) return
    const message = buildMessage(msgType, this.config.deviceId, payload)
    this.client.write(message)
  }

  handleMessage(msg) {
    switch (msg.msgType) {
      case MSG_TYPE.REGISTER_ACK:
        console.log(`[${this.config.deviceId}] 注册成功`)
        this.startHeartbeat()
        this.startDataReport()
        break
      case MSG_TYPE.CONTROL_CMD:
        console.log(`[${this.config.deviceId}] 收到控制命令:`, msg.payload.toString())
        this.sendControlAck()
        break
      default:
        console.log(`[${this.config.deviceId}] 收到消息类型: ${msg.msgType}`)
    }
  }

  sendControlAck() {
    const payload = Buffer.from(JSON.stringify({
      deviceId: this.config.deviceId,
      timestamp: Date.now(),
      success: true
    }))
    this.sendMessage(MSG_TYPE.CONTROL_ACK, payload)
  }

  stopTimers() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.dataReportTimer) {
      clearInterval(this.dataReportTimer)
      this.dataReportTimer = null
    }
  }

  disconnect() {
    this.stopTimers()
    if (this.client) {
      this.client.destroy()
    }
  }
}

const simulators = deviceConfigs.map(config => new DeviceSimulator(config))

simulators.forEach(sim => sim.connect())

process.on('SIGINT', () => {
  console.log('\n正在停止设备模拟器...')
  simulators.forEach(sim => sim.disconnect())
  process.exit(0)
})

console.log(`设备模拟器已启动，连接到 ${SERVER_HOST}:${SERVER_PORT}`)
console.log('模拟设备数量:', deviceConfigs.length)
console.log('按 Ctrl+C 停止')
