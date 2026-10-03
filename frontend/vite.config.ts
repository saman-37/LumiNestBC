import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// One .env at the repo root serves backend and frontend (only VITE_* reaches the browser).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '')
  const backend = env.BACKEND_DEV_URL || 'http://localhost:8000'
  return {
    envDir: '..',
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      // In dev, leave VITE_API_URL empty: the browser talks to Vite and Vite forwards to Flask.
      // That way a phone on the same Wi-Fi only needs the frontend URL.
      proxy: {
        '/api': backend,
        '/socket.io': { target: backend, ws: true },
      },
    },
  }
})
