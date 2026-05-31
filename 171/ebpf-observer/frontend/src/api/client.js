const API_BASE = 'http://localhost:8080'

export async function fetchData() {
  const [health, topology, httpStats, httpRecent] = await Promise.all([
    fetch(`${API_BASE}/health`).then((r) => r.json()),
    fetch(`${API_BASE}/topology`).then((r) => r.json()),
    fetch(`${API_BASE}/http/stats`).then((r) => r.json()),
    fetch(`${API_BASE}/http/recent`).then((r) => r.json()),
  ])
  return { health, topology, http_stats: httpStats, http_recent: httpRecent }
}

export function connectWebSocket(onMessage, onOpen, onClose) {
  const ws = new WebSocket(`ws://localhost:8080/ws`)

  ws.onopen = () => {
    console.log('WebSocket connected')
    onOpen?.()
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      onMessage(data)
    } catch (e) {
      console.error('WS parse error:', e)
    }
  }

  ws.onclose = () => {
    console.log('WebSocket disconnected')
    onClose?.()
  }

  ws.onerror = (err) => {
    console.error('WebSocket error:', err)
  }

  return ws
}
