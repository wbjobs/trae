import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    https: {
      key: '../server/certs/server.key',
      cert: '../server/certs/server.crt'
    },
    host: true
  }
})
