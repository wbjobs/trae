import type { Ticket, TicketDetail, TicketStats, User, RecommendationResult } from './types'

export const useTicketStore = () => {
  const { $client, $pusher } = useNuxtApp()

  const tickets = ref<Ticket[]>([])
  const currentTicket = ref<TicketDetail | null>(null)
  const stats = ref<TicketStats | null>(null)
  const agents = ref<User[]>([])
  const recommendation = ref<RecommendationResult | null>(null)
  const recommendationLoading = ref(false)
  const loading = ref(false)
  const filter = ref({
    status: 'all',
    assigneeId: ''
  })

  const ticketsChannel = ref<any>(null)

  const subscribeToChannel = (channelName: string, callback: (data: any) => void) => {
    if (!$pusher) return null
    const channel = $pusher.subscribe(channelName)
    channel.bind('list-updated', callback)
    channel.bind('updated', callback)
    return channel
  }

  const subscribeToTicket = (ticketId: string) => {
    if (!$pusher) return null
    const channel = $pusher.subscribe(`ticket-${ticketId}`)
    channel.bind('updated', (data: any) => {
      if (currentTicket.value) {
        if (data.type === 'status_changed' || data.type === 'assigned' || data.type === 'transferred') {
          Object.assign(currentTicket.value, data.ticket)
        } else if (data.type === 'note_added' && data.note) {
          currentTicket.value.notes.unshift(data.note)
        }
      }
    })
    return channel
  }

  const unsubscribeFromTicket = (ticketId: string) => {
    if ($pusher) {
      $pusher.unsubscribe(`ticket-${ticketId}`)
    }
  }

  const fetchTickets = async () => {
    loading.value = true
    try {
      tickets.value = await $client.ticket.list.query({
        status: filter.value.status !== 'all' ? filter.value.status : undefined,
        assigneeId: filter.value.assigneeId || undefined
      })
    } finally {
      loading.value = false
    }
  }

  const fetchStats = async () => {
    stats.value = await $client.ticket.getStats.query()
  }

  const fetchAgents = async () => {
    agents.value = await $client.ticket.getAgents.query()
  }

  const fetchTicketDetail = async (id: string) => {
    currentTicket.value = await $client.ticket.getById.query(id)
  }

  const createTicket = async (data: { title: string; description: string; priority: string; customerId: string }) => {
    const result = await $client.ticket.create.mutate(data)
    await fetchTickets()
    await fetchStats()
    return result
  }

  const assignTicket = async (ticketId: string, assigneeId: string) => {
    const result = await $client.ticket.assign.mutate({ ticketId, assigneeId })
    await fetchTickets()
    await fetchStats()
    return result
  }

  const transferTicket = async (ticketId: string, newAssigneeId: string, reason?: string) => {
    const result = await $client.ticket.transfer.mutate({ ticketId, newAssigneeId, reason })
    await fetchTickets()
    return result
  }

  const updateTicketStatus = async (ticketId: string, status: string) => {
    const result = await $client.ticket.updateStatus.mutate({ ticketId, status })
    await fetchTickets()
    await fetchStats()
    return result
  }

  const addNote = async (ticketId: string, content: string) => {
    const result = await $client.ticket.addNote.mutate({ ticketId, content })
    return result
  }

  const fetchRecommendation = async () => {
    recommendationLoading.value = true
    try {
      recommendation.value = await $client.ticket.getRecommendation.query()
    } finally {
      recommendationLoading.value = false
    }
  }

  const autoAssignTicket = async (ticketId: string) => {
    const result = await $client.ticket.autoAssign.mutate({ ticketId })
    await fetchTickets()
    await fetchStats()
    return result
  }

  const initRealtime = () => {
    if ($pusher && !ticketsChannel.value) {
      ticketsChannel.value = subscribeToChannel('tickets', () => {
        fetchTickets()
        fetchStats()
      })
    }
  }

  const cleanup = () => {
    if ($pusher) {
      if (ticketsChannel.value) {
        $pusher.unsubscribe('tickets')
        ticketsChannel.value = null
      }
    }
  }

  return {
    tickets,
    currentTicket,
    stats,
    agents,
    recommendation,
    recommendationLoading,
    loading,
    filter,
    fetchTickets,
    fetchStats,
    fetchAgents,
    fetchTicketDetail,
    createTicket,
    assignTicket,
    transferTicket,
    updateTicketStatus,
    addNote,
    fetchRecommendation,
    autoAssignTicket,
    subscribeToTicket,
    unsubscribeFromTicket,
    initRealtime,
    cleanup
  }
}
