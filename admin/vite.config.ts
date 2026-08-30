import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import path from "node:path";

export default defineConfig({
  plugins: [
    vue(),
    Components({
      resolvers: [ElementPlusResolver()],
      // 两个 SearchPanel 都由页面显式导入，排除自动扫描以避免同名组件被静默忽略。
      globsExclude: [
        "src/components/common/SearchPanel.vue",
        "src/components/glass/SearchPanel.vue",
      ],
    }),
  ],
  base: process.env.VITE_ADMIN_BASE || "/admin/",
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@element-plus/icons-vue")) return "element-icons";
          if (
            id.includes("/node_modules/vue/") ||
            id.includes("/node_modules/vue-router/") ||
            id.includes("/node_modules/pinia/")
          )
            return "vue-vendor";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api/ws-native": {
        target: "ws://localhost:3001",
        ws: true,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/ws-native/, "/ws-native"),
      },
      "/socket.io": {
        target: "ws://localhost:3001",
        ws: true,
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      "/uploads": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/miniapp-static": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
