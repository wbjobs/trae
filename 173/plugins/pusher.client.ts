import Pusher from 'pusher-js'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()

  const pusher = new Pusher(config.public.pusher.key, {
    wsHost: config.public.pusher.host,
    wsPort: Number(config.public.pusher.port),
    wssPort: Number(config.public.pusher.port),
    forceTLS: config.public.pusher.scheme === 'https',
    enabledTransports: ['ws', 'wss'],
    authEndpoint: '/api/pusher/auth'
  })

  return {
    provide: {
      pusher
    }
  }
})
