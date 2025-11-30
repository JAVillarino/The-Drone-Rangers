import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy all API requests to the backend
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/scenarios': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/load-scenario': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/policy-presets': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/scenario-types': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
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
      '/metrics': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
    },
  },
})

