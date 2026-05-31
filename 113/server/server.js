import { createServer } from 'https'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { WebTransportServer } from '@fails-components/webtransport'
import { Mp4Muxer } from 'mp4-muxer'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PACKET_TYPE_INIT = 0
const PACKET_TYPE_FRAME = 1
const PACKET_TYPE_END = 2
const PACKET_TYPE_ACK = 3

const HEADER_SIZE = 12

const options = {
  cert: readFileSync(join(__dirname, 'cert.pem')),
  key: readFileSync(join(__dirname, 'key.pem'))
}

const PORT = process.env.PORT || 4433
const OUTPUT_DIR = join(__dirname, 'recordings')

if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true })
}

const activeSessions = new Map()

const nodeServer = createServer(options, (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', activeSessions: activeSessions.size }))
  } else {
    res.writeHead(404)
    res.end('Not Found')
  }
})

const webTransportServer = new WebTransportServer({
  port: PORT,
  host: '0.0.0.0',
  server: nodeServer
}, {
  allowPooling: true,
  noServerCertificateValidation: true,
  initialStreamFlowControlWindow: 10 * 1024 * 1024,
  initialSessionFlowControlWindow: 15 * 1024 * 1024
})

webTransportServer.ready.then(() => {
  console.log(`[Server] WebTransport 服务器已启动，监听端口 ${PORT}`)
  console.log(`[Server] 录制文件将保存到: ${OUTPUT_DIR}`)
}).catch((error) => {
  console.error('[Server] 服务器启动失败:', error)
})

webTransportServer.sessionStream.addEventListener('data', handleSession)

async function handleSession(session) {
  const sessionId = generateSessionId()
  console.log(`[Session:${sessionId}] 新的连接已建立`)

  const sessionData = {
    id: sessionId,
    session: session,
    muxer: null,
    outputFile: null,
    fileStream: null,
    config: null,
    frameCount: 0,
    startTime: Date.now(),
    lastFrameTime: 0,
    lastKeyFrameTime: 0,
    totalBytesReceived: 0,
    lastStatsTime: Date.now()
  }

  activeSessions.set(sessionId, sessionData)

  session.closed.then(() => {
    console.log(`[Session:${sessionId}] 会话已关闭`)
    cleanupSession(sessionId)
  }).catch((error) => {
    console.error(`[Session:${sessionId}] 会话错误:`, error)
    cleanupSession(sessionId)
  })

  try {
    const bidiStream = await session.acceptBidirectionalStream()
    console.log(`[Session:${sessionId}] 双向流已建立`)

    const reader = bidiStream.readable.getReader()
    const writer = bidiStream.writable.getWriter()

    sendAck(writer, sessionId)

    readStream(reader, writer, sessionData)
  } catch (error) {
    console.error(`[Session:${sessionId}] 流处理错误:`, error)
    cleanupSession(sessionId)
  }
}

function parseBinaryPacket(buffer) {
  if (buffer.length < HEADER_SIZE) {
    return null
  }

  const view = new DataView(buffer.buffer || buffer)
  const type = view.getUint8(0)
  const isKeyFrame = view.getUint8(1) === 1
  const frameIndex = view.getUint32(2, false)
  const timestamp = view.getFloat64(6, false)
  
  const data = new Uint8Array(buffer, HEADER_SIZE)

  return {
    type,
    isKeyFrame,
    frameIndex,
    timestamp,
    data
  }
}

async function readStream(reader, writer, sessionData) {
  try {
    while (true) {
      const { value, done } = await reader.read()

      if (done) {
        console.log(`[Session:${sessionData.id}] 流已结束`)
        finalizeRecording(sessionData)
        break
      }

      if (!value || value.length < HEADER_SIZE) continue

      const packet = parseBinaryPacket(value)
      if (!packet) continue

      sessionData.totalBytesReceived += value.length

      handleBinaryPacket(packet, writer, sessionData)
    }
  } catch (error) {
    console.log(`[Session:${sessionData.id}] 读取结束: ${error.message}`)
    finalizeRecording(sessionData)
  }
}

function handleBinaryPacket(packet, writer, sessionData) {
  switch (packet.type) {
    case PACKET_TYPE_INIT:
      handleInit(packet, writer, sessionData)
      break

    case PACKET_TYPE_FRAME:
      handleFrame(packet, writer, sessionData)
      break

    case PACKET_TYPE_END:
      handleEnd(packet, writer, sessionData)
      break

    default:
      console.log(`[Session:${sessionData.id}] 未知数据包类型: ${packet.type}`)
  }
}

function handleInit(packet, writer, sessionData) {
  const configStr = new TextDecoder().decode(packet.data)
  const config = JSON.parse(configStr)

  console.log(`[Session:${sessionData.id}] 初始化配置:`, JSON.stringify(config, null, 2))
  
  sessionData.config = config
  sessionData.startTime = Date.now()

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `recording-${sessionData.id}-${timestamp}.mp4`
  const filePath = join(OUTPUT_DIR, fileName)
  sessionData.outputFile = filePath

  sessionData.muxer = new Mp4Muxer({
    width: config.width || 1920,
    height: config.height || 1080,
    fps: config.fps || 60
  })

  console.log(`[Session:${sessionData.id}] 录制文件: ${fileName}`)

  sendAck(writer, sessionData.id, 'init-ack')
}

function handleFrame(packet, writer, sessionData) {
  if (!sessionData.muxer) {
    console.error(`[Session:${sessionData.id}] 收到帧但未初始化`)
    return
  }

  const frameData = packet.data
  const isKeyFrame = packet.isKeyFrame
  const frameIndex = packet.frameIndex
  const timestamp = packet.timestamp

  if (isKeyFrame) {
    sessionData.lastKeyFrameTime = timestamp
  }

  if (sessionData.frameCount === 0 && !isKeyFrame) {
    console.log(`[Session:${sessionData.id}] 跳过首帧非关键帧`)
    return
  }

  sessionData.muxer.addVideoFrame({
    data: frameData,
    type: isKeyFrame ? 'key' : 'delta',
    timestamp: timestamp,
    duration: sessionData.config ? (1000000 / sessionData.config.fps) : 16666
  })

  sessionData.frameCount++
  sessionData.lastFrameTime = timestamp

  const now = Date.now()
  if (now - sessionData.lastStatsTime >= 5000) {
    const elapsed = (now - sessionData.startTime) / 1000
    const bitrate = (sessionData.totalBytesReceived * 8) / elapsed
    
    console.log(`[Session:${sessionData.id}] 统计: ${sessionData.frameCount} 帧, ${formatFileSize(sessionData.totalBytesReceived)}, ${formatBitrate(bitrate)}`)
    sessionData.lastStatsTime = now
  }

  if (sessionData.frameCount % 60 === 0) {
    console.log(`[Session:${sessionData.id}] 已接收 ${sessionData.frameCount} 帧`)
  }
}

function handleEnd(packet, writer, sessionData) {
  console.log(`[Session:${sessionData.id}] 收到结束信号`)
  finalizeRecording(sessionData)
}

function finalizeRecording(sessionData) {
  if (!sessionData.muxer) return

  console.log(`[Session:${sessionData.id}] 正在保存录制文件...`)

  try {
    const mp4Data = sessionData.muxer.finalize()
    
    const buffer = Buffer.from(mp4Data)
    writeFileSync(sessionData.outputFile, buffer)

    const fileSize = buffer.length
    const duration = (Date.now() - sessionData.startTime) / 1000

    console.log(`[Session:${sessionData.id}] 录制完成!`)
    console.log(`  文件: ${sessionData.outputFile}`)
    console.log(`  大小: ${formatFileSize(fileSize)}`)
    console.log(`  帧数: ${sessionData.frameCount}`)
    console.log(`  时长: ${duration.toFixed(2)} 秒`)
    console.log(`  平均码率: ${formatBitrate(fileSize * 8 / duration)}`)
  } catch (error) {
    console.error(`[Session:${sessionData.id}] 保存文件失败:`, error)
  }
}

function sendAck(writer, sessionId, message = 'ack') {
  try {
    const ack = JSON.stringify({ type: 'ack', message, sessionId, timestamp: Date.now() })
    writer.write(new TextEncoder().encode(ack))
  } catch (error) {
    console.log(`[Session:${sessionId}] 发送确认失败: ${error.message}`)
  }
}

function cleanupSession(sessionId) {
  const sessionData = activeSessions.get(sessionId)
  if (sessionData) {
    if (sessionData.muxer) {
      finalizeRecording(sessionData)
    }
    activeSessions.delete(sessionId)
    console.log(`[Session:${sessionId}] 会话已清理`)
  }
}

function generateSessionId() {
  return Math.random().toString(36).substring(2, 10)
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatBitrate(bps) {
  if (bps >= 1_000_000) {
    return (bps / 1_000_000).toFixed(2) + ' Mbps'
  } else if (bps >= 1_000) {
    return (bps / 1_000).toFixed(2) + ' Kbps'
  }
  return bps + ' bps'
}

process.on('SIGINT', () => {
  console.log('\n[Server] 正在关闭服务器...')
  for (const [sessionId, sessionData] of activeSessions) {
    finalizeRecording(sessionData)
  }
  webTransportServer.close().then(() => {
    console.log('[Server] 服务器已关闭')
    process.exit(0)
  })
})

export default nodeServer
