export interface Ticket {
  id: string
  title: string
  description: string
  status: 'pending' | 'processing' | 'reviewing' | 'completed'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  customer_id: string
  customer_name: string
  assignee_id: string | null
  assignee_name: string | null
  sla_response_at: string | null
  sla_resolve_at: string | null
  responded_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface TicketNote {
  id: string
  ticket_id: string
  author_id: string
  author_name: string
  content: string
  created_at: string
}

export interface TicketActivity {
  id: string
  ticket_id: string
  user_id: string
  user_name: string
  action: string
  old_status: string | null
  new_status: string | null
  note: string | null
  created_at: string
}

export interface TicketDetail extends Ticket {
  notes: TicketNote[]
  activities: TicketActivity[]
}

export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'agent' | 'customer'
}

export interface TicketStats {
  total: number
  pending: number
  processing: number
  reviewing: number
  completed: number
  breached_response: number
  breached_resolve: number
}

export const STATUS_LABELS: Record<string, string> = {
  pending: '待接单',
  processing: '处理中',
  reviewing: '待验收',
  completed: '已完成'
}

export const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  processing: '#3b82f6',
  reviewing: '#8b5cf6',
  completed: '#10b981'
}

export const PRIORITY_LABELS: Record<string, string> = {
  low: '低',
  normal: '普通',
  high: '高',
  urgent: '紧急'
}

export const PRIORITY_COLORS: Record<string, string> = {
  low: '#6b7280',
  normal: '#3b82f6',
  high: '#f97316',
  urgent: '#ef4444'
}

export const SLA_LABELS: Record<string, string> = {
  met: '已达标',
  pending: '进行中',
  breached: '已超时'
}

export const SLA_COLORS: Record<string, string> = {
  met: '#10b981',
  pending: '#3b82f6',
  breached: '#ef4444'
}

export interface AgentPerformance {
  id: string
  name: string
  email: string
  current_load: number
  avg_resolve_minutes: number | null
  sla_rate: number | null
  total_completed: number
  score: number
  recommendation_reason: string[]
}

export interface RecommendationResult {
  recommended: AgentPerformance | null
  candidates: AgentPerformance[]
}
