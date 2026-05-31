import { create } from 'zustand'
import type { Device, DeviceData, Alert, WorkOrder } from '../types'

interface AppState {
  devices: Device[]
  currentDevice: Device | null
  deviceData: Record<string, DeviceData>
  alerts: Alert[]
  activeAlerts: Alert[]
  workOrders: WorkOrder[]
  selectedComponent: string | null
  wsConnected: boolean
  
  setDevices: (devices: Device[]) => void
  setCurrentDevice: (device: Device | null) => void
  updateDeviceData: (data: DeviceData) => void
  setAlerts: (alerts: Alert[]) => void
  setActiveAlerts: (alerts: Alert[]) => void
  addAlert: (alert: Alert) => void
  updateAlert: (alert: Alert) => void
  setWorkOrders: (orders: WorkOrder[]) => void
  setSelectedComponent: (componentId: string | null) => void
  setWsConnected: (connected: boolean) => void
}

export const useStore = create<AppState>((set) => ({
  devices: [],
  currentDevice: null,
  deviceData: {},
  alerts: [],
  activeAlerts: [],
  workOrders: [],
  selectedComponent: null,
  wsConnected: false,

  setDevices: (devices) => set({ devices }),
  setCurrentDevice: (device) => set({ currentDevice: device }),
  updateDeviceData: (data) =>
    set((state) => ({
      deviceData: {
        ...state.deviceData,
        [data.component_id || data.device_id]: data,
      },
    })),
  setAlerts: (alerts) => set({ alerts }),
  setActiveAlerts: (alerts) => set({ activeAlerts: alerts }),
  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts],
      activeAlerts: state.activeAlerts.some((a) => a.id === alert.id)
        ? state.activeAlerts
        : [alert, ...state.activeAlerts],
    })),
  updateAlert: (updatedAlert) =>
    set((state) => {
      const newAlerts = state.alerts.map((a) =>
        a.id === updatedAlert.id ? { ...a, ...updatedAlert } : a
      )
      const newActiveAlerts = newAlerts.filter(
        (a) => a.status === 'active' || a.status === 'acknowledged'
      )
      return {
        alerts: newAlerts,
        activeAlerts: newActiveAlerts,
      }
    }),
  setWorkOrders: (orders) => set({ workOrders: orders }),
  setSelectedComponent: (componentId) => set({ selectedComponent: componentId }),
  setWsConnected: (connected) => set({ wsConnected: connected }),
}))
