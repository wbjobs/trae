export interface ComponentInfo {
  component_id: string
  name: string
  name_cn?: string
  parent_id?: string
  position?: { x: number; y: number; z: number }
  parameters?: Record<string, any>
  children?: ComponentInfo[]
  model_path?: string
}

export interface Device {
  id: string
  device_id: string
  name: string
  name_cn: string
  description?: string
  location?: string
  status: string
  model_path?: string
  components: ComponentInfo[]
  created_at: string
  updated_at: string
}

export interface DeviceData {
  device_id: string
  component_id?: string
  temperature?: number
  pressure?: number
  rotation_speed?: number
  vibration?: number
  timestamp: string
}

export type AlertLevel = 'critical' | 'warning' | 'info'
export type AlertStatus = 'active' | 'acknowledged' | 'resolved'

export interface Alert {
  id: string
  device_id: string
  component_id?: string
  parameter: string
  current_value: number
  threshold: number
  level: AlertLevel
  status: AlertStatus
  message: string
  timestamp: string
  acknowledged_by?: string
  acknowledged_at?: string
  resolved_by?: string
  resolved_at?: string
}

export type WorkOrderStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type WorkOrderPriority = 'high' | 'medium' | 'low'

export interface WorkOrder {
  id: string
  device_id: string
  title: string
  description: string
  status: WorkOrderStatus
  priority: WorkOrderPriority
  assigned_to?: string
  alert_id?: string
  fault_type?: string
  created_at: string
  updated_at: string
  completed_at?: string
  notes?: string
}

export interface AlertRule {
  device_id: string
  parameter: string
  min_value?: number
  max_value?: number
  level: AlertLevel
  component_id?: string
}

export interface FaultSimulation {
  device_id: string
  component_id?: string
  parameter: string
  target_value: number
  duration: number
}
