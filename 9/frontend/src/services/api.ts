import axios from 'axios'
import type { Device, DeviceData, Alert, WorkOrder, AlertRule, FaultSimulation } from '../types'

export interface PlaybackData {
  device_id: string
  start_time: string
  end_time: string
  data_points: Record<string, DeviceData[]>
  alerts: Alert[]
  total_data_points: number
  total_alerts: number
}

export interface HealthScore {
  device_id: string
  score: number
  level: 'excellent' | 'good' | 'fair' | 'poor'
  status: 'normal' | 'warning' | 'critical'
  time_window_hours: number
  calculated_at: string
  alert_summary: {
    critical: number
    warning: number
    info: number
  }
  component_health: Record<string, {
    score: number
    status: string
    latest_data?: DeviceData
    issues: string[]
  }>
  recommendations: string[]
}

export interface Operator {
  id: string
  operator_id: string
  name: string
  phone?: string
  email?: string
  regions: string[]
  specialization: string[]
  workload: number
  is_available: boolean
  rating: number
  created_at: string
  updated_at: string
}

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

export const deviceApi = {
  getAll: () => api.get<Device[]>('/devices').then(res => res.data),
  getById: (id: string) => api.get<Device>(`/devices/${id}`).then(res => res.data),
  create: (device: Omit<Device, 'id' | 'created_at' | 'updated_at'>) =>
    api.post<Device>('/devices', device).then(res => res.data),
  uploadModel: (deviceId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post(`/devices/${deviceId}/model`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(res => res.data)
  },
  getLatestData: (deviceId: string, componentId?: string) =>
    api.get<DeviceData>(`/devices/${deviceId}/data/latest`, {
      params: componentId ? { component_id: componentId } : undefined,
    }).then(res => res.data),
  getHistoricalData: (deviceId: string, componentId?: string, startTime?: string, endTime?: string, limit?: number) =>
    api.get<DeviceData[]>(`/devices/${deviceId}/data/historical`, {
      params: {
        component_id: componentId,
        start_time: startTime,
        end_time: endTime,
        limit,
      },
    }).then(res => res.data),
  getPlaybackData: (deviceId: string, startTime: string, endTime: string) =>
    api.get<PlaybackData>(`/devices/${deviceId}/playback`, {
      params: {
        start_time: startTime,
        end_time: endTime,
      },
    }).then(res => res.data),
  getHealthScore: (deviceId: string, timeWindowHours: number = 24) =>
    api.get<HealthScore>(`/devices/${deviceId}/health`, {
      params: {
        time_window_hours: timeWindowHours,
      },
    }).then(res => res.data),
  startSimulation: (deviceId: string) =>
    api.post(`/devices/${deviceId}/simulation/start`).then(res => res.data),
  stopSimulation: (deviceId: string) =>
    api.post(`/devices/${deviceId}/simulation/stop`).then(res => res.data),
  simulateFault: (fault: FaultSimulation) =>
    api.post('/fault/simulate', fault).then(res => res.data),
}

export const alertApi = {
  getAll: (deviceId?: string, status?: string) =>
    api.get<Alert[]>('/alerts', {
      params: { device_id: deviceId, status },
    }).then(res => res.data),
  getActive: (deviceId?: string) =>
    api.get<Alert[]>('/alerts/active', {
      params: deviceId ? { device_id: deviceId } : undefined,
    }).then(res => res.data),
  acknowledge: (alertId: string, acknowledgedBy: string = 'operator') =>
    api.post(`/alerts/${alertId}/acknowledge`, null, {
      params: { acknowledged_by: acknowledgedBy },
    }).then(res => res.data),
  resolve: (alertId: string, resolvedBy: string = 'operator') =>
    api.post(`/alerts/${alertId}/resolve`, null, {
      params: { resolved_by: resolvedBy },
    }).then(res => res.data),
  addRule: (rule: AlertRule) =>
    api.post('/alert-rules', rule).then(res => res.data),
}

export const workOrderApi = {
  getAll: (deviceId?: string, status?: string) =>
    api.get<WorkOrder[]>('/work-orders', {
      params: { device_id: deviceId, status },
    }).then(res => res.data),
  getById: (id: string) =>
    api.get<WorkOrder>(`/work-orders/${id}`).then(res => res.data),
  create: (workOrder: Partial<WorkOrder>) =>
    api.post<WorkOrder>('/work-orders', workOrder).then(res => res.data),
  createWithDispatch: (workOrder: Partial<WorkOrder>, autoDispatch: boolean = true) =>
    api.post<{
      work_order: WorkOrder
      dispatch?: {
        success: boolean
        operator?: Operator
        message: string
      }
    }>('/work-orders/auto-dispatch', workOrder, {
      params: { auto_dispatch: autoDispatch },
    }).then(res => res.data),
  reassign: (orderId: string, operatorId?: string, autoDispatch: boolean = true) =>
    api.post(`/work-orders/${orderId}/reassign`, null, {
      params: { operator_id: operatorId, auto_dispatch: autoDispatch },
    }).then(res => res.data),
  update: (id: string, data: Partial<WorkOrder>) =>
    api.patch(`/work-orders/${id}`, data).then(res => res.data),
  delete: (id: string) =>
    api.delete(`/work-orders/${id}`).then(res => res.data),
}

export const operatorApi = {
  getAll: (region?: string, specialization?: string) =>
    api.get<Operator[]>('/operators', {
      params: { region, specialization },
    }).then(res => res.data),
  getById: (operatorId: string) =>
    api.get<Operator>(`/operators/${operatorId}`).then(res => res.data),
  create: (operator: Partial<Operator>) =>
    api.post<Operator>('/operators', operator).then(res => res.data),
}

export default api
