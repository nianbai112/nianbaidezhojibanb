import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  build: {
    minify: false,
    reportCompressedSize: false,
  },
  server: {
    port: 5174,
    proxy: {
      "/api/ws-native": {
        target: "ws://localhost:3001",
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ws-native/, "/ws-native"),
      },
      "/socket.io": {
        target: "ws://localhost:3001",
        ws: true,
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/uploads": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
