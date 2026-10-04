import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The map is the home page but a lazy chunk (so tag taps never download it). On "/" only, start
 * fetching that chunk, its CSS and the shelter list straight from the HTML, in parallel with the
 * main bundle, instead of one after another.
 */
function preloadMapOnHome(apiUrl: string): Plugin {
  return {
    name: 'luminest-preload-map',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const chunk = Object.values(ctx.bundle ?? {}).find(
          (c) => c.type === 'chunk' && c.facadeModuleId?.endsWith('/pages/MapPage.tsx'),
        )
        if (!chunk || chunk.type !== 'chunk') return html
        const files = [chunk.fileName, ...chunk.imports, ...(chunk.viteMetadata?.importedCss ?? [])].map((f) => `/${f}`)
        const shelters = `${apiUrl.replace(/\/+$/, '')}/api/shelters`
        const script =
          `<script>if(location.pathname==='/'){var h=document.head;` +
          `${JSON.stringify(files)}.forEach(function(f){var l=document.createElement('link');` +
          `if(/\\.css$/.test(f)){l.rel='preload';l.as='style'}else{l.rel='modulepreload'}l.href=f;h.appendChild(l)});` +
          `var a=document.createElement('link');a.rel='preload';a.as='fetch';a.crossOrigin='anonymous';a.href=${JSON.stringify(shelters)};h.appendChild(a)}</script>`
        return html.replace('</head>', `    ${script}\n  </head>`)
      },
    },
  }
}

// One .env at the repo root serves backend and frontend (only VITE_* reaches the browser).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '')
  const backend = env.BACKEND_DEV_URL || 'http://localhost:8000'
  return {
    envDir: '..',
    plugins: [react(), tailwindcss(), preloadMapOnHome(env.VITE_API_URL ?? '')],
    server: {
      port: 5173,
      // In dev, leave VITE_API_URL empty: the browser talks to Vite and Vite forwards to Flask.
      // That way a phone on the same Wi-Fi only needs the frontend URL.
      // Socket.IO is long-polling only in dev (see lib/socket.ts). WebSocket upgrades are not proxied:
      // Werkzeug (Flask's dev server) breaks them, which flooded the log with "ws proxy error: EPIPE".
      // A client still trying to upgrade (e.g. an old tab) just stays on polling. Production uses WebSocket.
      proxy: {
        '/api': { target: backend, changeOrigin: true },
        '/socket.io': { target: backend, ws: false, changeOrigin: true },
        '/audio': { target: backend, changeOrigin: true }, // voice-line MP3s (admin voice simulator)
      },
    },
  }
})
