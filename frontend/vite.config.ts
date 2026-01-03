import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { version } from './package.json'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    VITE_APP_VERSION: JSON.stringify(version),
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/lite': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
