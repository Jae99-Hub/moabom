import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  // root = 프로젝트 루트 (기본값). web/index.html에서 /src/... 경로가 올바르게 해석됨
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  build: {
    outDir: resolve(__dirname, 'dist/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html')
    }
  },
  server: {
    port: 5174,
    open: true
  }
  // sql.js는 CDN에서 동적으로 로드하므로 번들에 포함되지 않음
})
