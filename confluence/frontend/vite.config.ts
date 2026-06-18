import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = "../.."
  const env = loadEnv(mode, envDir, "")
  const protocol = process.env.VITE_SERVER_PROTOCOL || env.VITE_SERVER_PROTOCOL || "http"
  const host = process.env.VITE_SERVER_HOST || env.VITE_SERVER_HOST || "localhost"
  const port = process.env.VITE_GATEWIKI_BACKEND_PORT || env.VITE_GATEWIKI_BACKEND_PORT || "8001"
  const backendUrl = process.env.VITE_GATEWIKI_BACKEND_URL || env.VITE_GATEWIKI_BACKEND_URL || `${protocol}://${host}:${port}`

  return {
    envDir,
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            markdown: ["react-markdown", "remark-gfm", "rehype-sanitize", "rehype-highlight", "highlight.js"],
          },
        },
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5174,
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true,
        },
        "/auth": {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
  }
})
