// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  typescript: {
    strict: true,
    shim: false
  },
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ticket_system',
    pusher: {
      appId: process.env.PUSHER_APP_ID || 'ticket-app',
      key: process.env.PUSHER_KEY || 'ticket-key',
      secret: process.env.PUSHER_SECRET || 'ticket-secret',
      host: process.env.PUSHER_HOST || '127.0.0.1',
      port: process.env.PUSHER_PORT || 6001,
      scheme: process.env.PUSHER_SCHEME || 'http'
    },
    public: {
      pusher: {
        key: process.env.PUSHER_KEY || 'ticket-key',
        host: process.env.PUSHER_HOST || '127.0.0.1',
        port: process.env.PUSHER_PORT || 6001,
        scheme: process.env.PUSHER_SCHEME || 'http'
      }
    }
  }
})
