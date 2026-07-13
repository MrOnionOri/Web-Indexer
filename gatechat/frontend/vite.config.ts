import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const protocol = process.env.VITE_SERVER_PROTOCOL || env.VITE_SERVER_PROTOCOL || "http";
  const host = process.env.VITE_SERVER_HOST || env.VITE_SERVER_HOST || "localhost";
  const port = process.env.VITE_GATECHAT_BACKEND_PORT || env.VITE_GATECHAT_BACKEND_PORT || "8013";
  const backendUrl = process.env.VITE_GATECHAT_BACKEND_URL || env.VITE_GATECHAT_BACKEND_URL || `${protocol}://${host}:${port}`;

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5186,
      proxy: {
        "/api": backendUrl,
        "/health": backendUrl
      }
    }
  };
});
