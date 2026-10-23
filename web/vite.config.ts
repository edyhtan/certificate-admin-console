import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The API port comes from API_PORT (backend_service/.env.example uses 3000).
const apiPort = process.env.API_PORT ?? '3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
    restoreMocks: true,
  },
})
