import pako from 'pako'

const API_BASE = '/api'

function decompressResponse(response) {
  return response.json().then(data => {
    if (data.compressed) {
      const compressed = Uint8Array.from(atob(data.compressed), c => c.charCodeAt(0))
      const decompressed = pako.inflate(compressed)
      const text = new TextDecoder().decode(decompressed)
      return JSON.parse(text)
    }
    return data
  })
}

export async function getInitialMesh() {
  const response = await fetch(`${API_BASE}/initial`)
  return decompressResponse(response)
}

export async function refineByClick(x, y, levels = 1) {
  const response = await fetch(`${API_BASE}/refine/click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y, levels })
  })
  return decompressResponse(response)
}

export async function refineByEstimator() {
  const response = await fetch(`${API_BASE}/refine/estimator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  return decompressResponse(response)
}

export async function resetMesh() {
  const response = await fetch(`${API_BASE}/reset`, {
    method: 'POST'
  })
  return decompressResponse(response)
}

export async function getHistory() {
  const response = await fetch(`${API_BASE}/history`)
  return response.json()
}

export async function healthCheck() {
  const response = await fetch(`${API_BASE}/health`)
  return response.json()
}
