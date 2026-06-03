import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5174,
    proxy: {
      "/api": {
        target: process.env.VITE_GATESTORAGE_BACKEND_URL || "http://localhost:8002",
        changeOrigin: true
      },
      "/auth": {
        target: process.env.VITE_GATESTORAGE_BACKEND_URL || "http://localhost:8002",
        changeOrigin: true
      }
    }
  }
});
