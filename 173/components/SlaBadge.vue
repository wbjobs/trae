<template>
  <div class="sla-badge" :class="{ 'sla-breached': slaInfo.value.isOverdue }">
    <div class="sla-time">{{ slaInfo.value.text }}</div>
    <div class="sla-status" :style="{ color: SLA_COLORS[slaInfo.value.status] }">
      {{ SLA_LABELS[slaInfo.value.status] }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { SLA_LABELS, SLA_COLORS } from '~/composables/types'

const props = defineProps<{
  ticket: {
    status: string
    sla_response_at: string | null
    sla_resolve_at: string | null
    responded_at: string | null
    resolved_at: string | null
  } | null | undefined
  type: 'response' | 'resolve'
}>()

interface SlaDisplay {
  text: string
  status: 'met' | 'breached' | 'pending'
  isOverdue: boolean
}

const slaInfo = ref<SlaDisplay>({
  text: '-',
  status: 'pending',
  isOverdue: false
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
  const t = props.ticket
  if (!t) {
    slaInfo.value = { text: '-', status: 'pending', isOverdue: false }
    return
  }

  const now = new Date()

  const slaField = props.type === 'response' ? t.sla_response_at : t.sla_resolve_at
  const doneField = props.type === 'response' ? t.responded_at : t.resolved_at

  if (!slaField) {
    slaInfo.value = { text: '-', status: 'pending', isOverdue: false }
    return
  }

  const deadline = new Date(slaField)
  if (isNaN(deadline.getTime())) {
    slaInfo.value = { text: '-', status: 'pending', isOverdue: false }
    return
  }

  const result = formatRemaining(deadline)

  let status: 'met' | 'breached' | 'pending' = 'pending'
  if (doneField) {
    status = new Date(doneField) <= deadline ? 'met' : 'breached'
  } else if (props.type === 'resolve' && t.status === 'completed') {
    status = now <= deadline ? 'met' : 'breached'
  } else if (props.type === 'response' && t.status !== 'pending') {
    status = now <= deadline ? 'met' : 'breached'
  } else {
    status = now <= deadline ? 'pending' : 'breached'
  }

  slaInfo.value = {
    text: result.text,
    status,
    isOverdue: result.isOverdue && status !== 'met'
  }
}

watch(() => props.ticket, () => {
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
</script>

<style scoped>
.sla-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 12px;
}

.sla-time {
  font-weight: 600;
  color: #4b5563;
}

.sla-status {
  font-size: 11px;
}

.sla-breached .sla-time {
  color: #ef4444;
}
</style>
