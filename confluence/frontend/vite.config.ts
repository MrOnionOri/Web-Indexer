import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
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
        target: process.env.VITE_GATEWIKI_BACKEND_URL || "http://localhost:8001",
        changeOrigin: true,
      },
      "/auth": {
        target: process.env.VITE_GATEWIKI_BACKEND_URL || "http://localhost:8001",
        changeOrigin: true,
      },
    },
  },
})
