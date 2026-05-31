import { useStore } from '../store/useStore'
import type { DeviceData, Alert } from '../types'

class WebSocketService {
  private ws: WebSocket | null = null
  private deviceId: string | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 3000

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws?client_id=web-${Date.now()}`
    
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      console.log('WebSocket connected')
      useStore.getState().setWsConnected(true)
      this.reconnectAttempts = 0
      if (this.deviceId) {
        this.subscribe(this.deviceId)
      }
    }

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        this.handleMessage(message)
      } catch (e) {
        console.error('Error parsing WebSocket message:', e)
      }
    }

    this.ws.onclose = () => {
      console.log('WebSocket disconnected')
      useStore.getState().setWsConnected(false)
      this.attemptReconnect()
    }

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
  }

  private handleMessage(message: any) {
    const { type, data } = message

    switch (type) {
      case 'connection':
        console.log('Connection status:', data?.status)
        break
      case 'subscription':
        console.log('Subscription:', data?.device_id, data?.status)
        break
      case 'device_data':
        if (data) {
          const deviceData: DeviceData = data
          useStore.getState().updateDeviceData(deviceData)
        }
        break
      case 'device_data_batch':
        if (message.data) {
          for (const item of message.data) {
            const deviceData: DeviceData = {
              device_id: message.device_id,
              ...item,
            }
            useStore.getState().updateDeviceData(deviceData)
          }
        }
        break
      case 'alert':
        if (data) {
          const alert: Alert = data
          useStore.getState().addAlert(alert)
        }
        break
      case 'alert_update':
        if (data) {
          this.handleAlertUpdate(data)
        }
        break
      default:
        console.log('Unknown message type:', type)
    }
  }

  private handleAlertUpdate(data: any) {
    const updatedAlert = data.alert
    useStore.getState().updateAlert(updatedAlert)
  }

  subscribe(deviceId: string) {
    this.deviceId = deviceId
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'subscribe',
          device_id: deviceId,
        })
      )
    }
  }

  unsubscribe(deviceId: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'unsubscribe',
          device_id: deviceId,
        })
      )
    }
    if (this.deviceId === deviceId) {
      this.deviceId = null
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(
        `Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
      )
      setTimeout(() => {
        this.connect()
      }, this.reconnectDelay)
    } else {
      console.error('Max reconnect attempts reached')
    }
  }

  disconnect() {
    if (this.deviceId) {
      this.unsubscribe(this.deviceId)
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}

export const wsService = new WebSocketService()
