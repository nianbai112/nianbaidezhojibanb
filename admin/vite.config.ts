import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import path from 'node:path'

export default defineConfig({
  plugins: [
    vue(),
    Components({ resolvers: [ElementPlusResolver()] }),
  ],
  base: process.env.VITE_ADMIN_BASE || '/admin/',
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  // @tmagic/editor 依赖链（randombytes 等）在浏览器端引用 Node 的 global，需映射为 globalThis
  define: { global: 'globalThis' },
  optimizeDeps: {
    esbuildOptions: { define: { global: 'globalThis' } },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@element-plus/icons-vue')) return 'element-icons'
          if (id.includes('/node_modules/vue/') || id.includes('/node_modules/vue-router/') || id.includes('/node_modules/pinia/')) return 'vue-vendor'
          return undefined
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: p => p.replace(/^\/api/, '')
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/miniapp-static': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
