import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'

export interface SlaInfo {
  responseRemaining: string
  resolveRemaining: string
  responseStatus: 'met' | 'breached' | 'pending'
  resolveStatus: 'met' | 'breached' | 'pending'
  responseIsOverdue: boolean
  resolveIsOverdue: boolean
}

export const useSlaCountdown = (
  ticket: Ref<{
    status: string
    sla_response_at: string | null
    sla_resolve_at: string | null
    responded_at: string | null
    resolved_at: string | null
  } | null>
) => {
  const slaInfo = ref<SlaInfo>({
    responseRemaining: '-',
    resolveRemaining: '-',
    responseStatus: 'pending',
    resolveStatus: 'pending',
    responseIsOverdue: false,
    resolveIsOverdue: false
  })

  let interval: NodeJS.Timeout | null = null

  const formatRemaining = (deadline: Date): { text: string; isOverdue: boolean } => {
    const now = new Date()
    const diff = deadline.getTime() - now.getTime()
    const isOverdue = diff < 0
    const absDiff = Math.abs(diff)
    const minutes = Math.floor(absDiff / 60000)
    const seconds = Math.floor((absDiff % 60000) / 1000)

    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60)
      const mins = minutes % 60
      return { text: `${isOverdue ? '-' : ''}${hours}h ${mins}m`, isOverdue }
    }
    return { text: `${isOverdue ? '-' : ''}${minutes}m ${seconds.toString().padStart(2, '0')}s`, isOverdue }
  }

  const updateSla = () => {
    if (!ticket.value) {
      slaInfo.value = {
        responseRemaining: '-',
        resolveRemaining: '-',
        responseStatus: 'pending',
        resolveStatus: 'pending',
        responseIsOverdue: false,
        resolveIsOverdue: false
      }
      return
    }

    const t = ticket.value
    const now = new Date()

    if (t.sla_response_at) {
      const deadline = new Date(t.sla_response_at)
      if (!isNaN(deadline.getTime())) {
        const result = formatRemaining(deadline)
        slaInfo.value.responseRemaining = result.text
        slaInfo.value.responseIsOverdue = result.isOverdue

        if (t.responded_at) {
          slaInfo.value.responseStatus = new Date(t.responded_at) <= deadline ? 'met' : 'breached'
        } else if (t.status !== 'pending') {
          slaInfo.value.responseStatus = now <= deadline ? 'met' : 'breached'
        } else {
          slaInfo.value.responseStatus = now <= deadline ? 'pending' : 'breached'
        }
      }
    } else {
      slaInfo.value.responseRemaining = '-'
      slaInfo.value.responseIsOverdue = false
      slaInfo.value.responseStatus = 'pending'
    }

    if (t.sla_resolve_at) {
      const deadline = new Date(t.sla_resolve_at)
      if (!isNaN(deadline.getTime())) {
        const result = formatRemaining(deadline)
        slaInfo.value.resolveRemaining = result.text
        slaInfo.value.resolveIsOverdue = result.isOverdue

        if (t.resolved_at) {
          slaInfo.value.resolveStatus = new Date(t.resolved_at) <= deadline ? 'met' : 'breached'
        } else if (t.status === 'completed') {
          slaInfo.value.resolveStatus = now <= deadline ? 'met' : 'breached'
        } else {
          slaInfo.value.resolveStatus = now <= deadline ? 'pending' : 'breached'
        }
      }
    } else {
      slaInfo.value.resolveRemaining = '-'
      slaInfo.value.resolveIsOverdue = false
      slaInfo.value.resolveStatus = 'pending'
    }
  }

  watch(ticket, () => {
    updateSla()
  }, { deep: true, immediate: true })

  onMounted(() => {
    if (!interval) {
      interval = setInterval(updateSla, 1000)
    }
  })

  onUnmounted(() => {
    if (interval) {
      clearInterval(interval)
      interval = null
    }
  })

  return slaInfo
}
