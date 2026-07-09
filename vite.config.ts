// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',   // 使用相对路径

  define: {
    // Inject whether we are building for Tauri. TAURI_ENV is set by @tauri-apps/cli.
    "import.meta.env.VITE_IS_TAURI": JSON.stringify(process.env.TAURI_ENV !== undefined),
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 避免 Three.js 等库被过度分割导致加载闪烁
    chunkSizeWarningLimit: 1000
  },

  // 开发服务器端口需与 tauri.conf.json 中的 devPath 一致
  server: {
    port: 5173
  }
});
