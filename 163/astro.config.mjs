import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vue from '@astrojs/vue';
import svelte from '@astrojs/svelte';

export default defineConfig({
  integrations: [react(), vue(), svelte()],
  server: {
    port: 4321,
    host: true
  },
  vite: {
    ssr: {
      noExternal: ['yjs', 'y-websocket', 'lib0']
    }
  }
});
