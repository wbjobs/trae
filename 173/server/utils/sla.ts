// SLA 配置和计算工具

export const SLA_RESPONSE_MINUTES = 30
export const SLA_RESOLVE_MINUTES = 120

export const calculateSlaDeadline = (createdAt: Date, minutes: number): Date => {
  return new Date(createdAt.getTime() + minutes * 60 * 1000)
}

export const getRemainingTime = (deadline: Date): { minutes: number; seconds: number; isOverdue: boolean } => {
  const now = new Date()
  const diff = deadline.getTime() - now.getTime()
  const isOverdue = diff < 0
  const absDiff = Math.abs(diff)
  const minutes = Math.floor(absDiff / 60000)
  const seconds = Math.floor((absDiff % 60000) / 1000)
  return { minutes, seconds, isOverdue }
}

export const formatRemainingTime = (deadline: Date): string => {
  const { minutes, seconds, isOverdue } = getRemainingTime(deadline)
  const prefix = isOverdue ? '-' : ''
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${prefix}${hours}h ${mins}m`
  }
  return `${prefix}${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

export const getSlaStatus = (
  status: string,
  slaResponseAt: Date | null,
  slaResolveAt: Date | null,
  respondedAt: Date | null,
  resolvedAt: Date | null
): { responseStatus: 'met' | 'breached' | 'pending', resolveStatus: 'met' | 'breached' | 'pending' } => {
  const now = new Date()
  
  let responseStatus: 'met' | 'breached' | 'pending' = 'pending'
  let resolveStatus: 'met' | 'breached' | 'pending' = 'pending'

  if (slaResponseAt) {
    if (respondedAt) {
      responseStatus = respondedAt <= slaResponseAt ? 'met' : 'breached'
    } else if (status !== 'pending') {
      responseStatus = now <= slaResponseAt ? 'met' : 'breached'
    } else {
      responseStatus = now <= slaResponseAt ? 'pending' : 'breached'
    }
  }

  if (slaResolveAt) {
    if (resolvedAt) {
      resolveStatus = resolvedAt <= slaResolveAt ? 'met' : 'breached'
    } else if (status === 'completed') {
      resolveStatus = now <= slaResolveAt ? 'met' : 'breached'
    } else {
      resolveStatus = now <= slaResolveAt ? 'pending' : 'breached'
    }
  }

  return { responseStatus, resolveStatus }
}
