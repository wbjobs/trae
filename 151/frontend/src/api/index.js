import axios from 'axios'

const request = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

request.interceptors.response.use(
  response => response.data,
  error => {
    console.error('API Error:', error)
    return Promise.reject(error)
  }
)

export const gameServerApi = {
  list(namespace = '') {
    const params = namespace ? { namespace } : {}
    return request.get('/apis/game.kruise.io/v1alpha1/gameservers', { params })
  },

  get(namespace, name) {
    return request.get(`/apis/game.kruise.io/v1alpha1/namespaces/${namespace}/gameservers/${name}`)
  },

  update(namespace, name, data) {
    return request.put(`/apis/game.kruise.io/v1alpha1/namespaces/${namespace}/gameservers/${name}`, data)
  },

  upgrade(namespace, name, image) {
    return request.patch(`/apis/game.kruise.io/v1alpha1/namespaces/${namespace}/gameservers/${name}`, {
      spec: {
        template: {
          containers: [{
            name: 'gameserver',
            image: image
          }]
        }
      }
    })
  },

  getStatus(namespace, name) {
    return request.get(`/apis/game.kruise.io/v1alpha1/namespaces/${namespace}/gameservers/${name}/status`)
  }
}

export const metricsApi = {
  getGameServerMetrics(namespace, name) {
    return request.get('/metrics/gameserver', {
      params: { namespace, name }
    })
  },

  getAllMetrics() {
    return request.get('/metrics/gameservers')
  }
}

export const podApi = {
  list(namespace, labelSelector = '') {
    const params = { namespace }
    if (labelSelector) {
      params.labelSelector = labelSelector
    }
    return request.get('/api/v1/pods', { params })
  },

  getPod(namespace, name) {
    return request.get(`/api/v1/namespaces/${namespace}/pods/${name}`)
  }
}
