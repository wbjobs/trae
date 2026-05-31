import { Http3Server } from '@fails-components/webtransport'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StreamManager } from './stream-manager.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = process.env.PORT || 4433
const HOST = process.env.HOST || '127.0.0.1'

const certDir = path.resolve(__dirname, '../certs')
const certKey = fs.readFileSync(path.join(certDir, 'server.key'), 'utf8')
const cert = fs.readFileSync(path.join(certDir, 'server.crt'), 'utf8')

const server = new Http3Server({
  port: PORT,
  host: HOST,
  secret: 'webtransport-video-call-secret',
  cert,
  privKey: certKey
})

const streamManager = new StreamManager()

async function start() {
  const sessionStream = server.sessionStream('/video')
  const sessionReader = sessionStream.getReader()

  console.log(`[Server] WebTransport server listening on https://${HOST}:${PORT}`)
  console.log('[Server] Path: /video')
  console.log('[Server] Waiting for video call clients...')

  while (true) {
    try {
      const { done, value: session } = await sessionReader.read()
      if (done) {
        console.log('[Server] Session stream ended')
        break
      }

      console.log('[Server] New WebTransport session established')

      try {
        await session.ready
      } catch (err) {
        console.error('[Server] Session failed to become ready:', err)
        continue
      }

      handleSession(session)
    } catch (err) {
      console.error('[Server] Session stream error:', err)
      break
    }
  }
}

function handleSession(session) {
  session.addEventListener('datagram', async (dgEvt) => {
    try {
      const data = new Uint8Array(dgEvt.data)
      await streamManager.handleDatagram(data, session)
    } catch (err) {
      console.error('[Server] Datagram handling error:', err)
    }
  })

  const signalStreamReader = session.incomingBidirectionalStreams.getReader()

  ;(async () => {
    while (true) {
      try {
        const { value: bidiStream, done } = await signalStreamReader.read()
        if (done) break

        const clientId = streamManager.addClient(session, bidiStream)
        console.log(`[Server] Client ${clientId} connected via bidirectional stream`)
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[Server] Error reading bidirectional streams:', err)
        }
        break
      }
    }
  })()

  session.closed.then(() => {
    streamManager.removeClient(session)
    console.log('[Server] Session closed')
  }).catch((err) => {
    streamManager.removeClient(session)
    console.error('[Server] Session error:', err)
  })
}

server.startServer()

start().catch((err) => {
  console.error('[Server] Fatal error:', err)
  process.exit(1)
})
