import Pusher from 'pusher'

let pusher: Pusher | null = null

export const usePusher = () => {
  if (!pusher) {
    const config = useRuntimeConfig()
    pusher = new Pusher({
      appId: config.pusher.appId,
      key: config.pusher.key,
      secret: config.pusher.secret,
      host: config.pusher.host,
      port: config.pusher.port,
      scheme: config.pusher.scheme,
      useTLS: config.pusher.scheme === 'https'
    })
  }
  return pusher
}

export const notifyTicketUpdate = async (ticketId: string, data: any) => {
  const p = usePusher()
  await p.trigger(`ticket-${ticketId}`, 'updated', data)
}

export const notifyTicketListUpdate = async (data: any) => {
  const p = usePusher()
  await p.trigger('tickets', 'list-updated', data)
}
