import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const envDir = "../..";
  const env = loadEnv(mode, envDir, "");
  const protocol = process.env.VITE_SERVER_PROTOCOL || env.VITE_SERVER_PROTOCOL || "http";
  const host = process.env.VITE_SERVER_HOST || env.VITE_SERVER_HOST || "localhost";
  const port = process.env.VITE_GATESTORAGE_BACKEND_PORT || env.VITE_GATESTORAGE_BACKEND_PORT || "8002";
  const backendUrl = process.env.VITE_GATESTORAGE_BACKEND_URL || env.VITE_GATESTORAGE_BACKEND_URL || `${protocol}://${host}:${port}`;

  return {
    envDir,
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5175,
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true
        },
        "/auth": {
          target: backendUrl,
          changeOrigin: true
        }
      }
    }
  };
});
