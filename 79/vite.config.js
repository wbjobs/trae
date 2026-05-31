import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: './client',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src')
    }
  },
  optimizeDeps: {
    exclude: ['vtk.js']
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
});
