import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      // Proxy all API requests to the backend
      '/state': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/pause': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/restart': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/stream': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        ws: true,
      },
      '/drones': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/jobs': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
    },
  },
})

