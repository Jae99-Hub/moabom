import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

/** 배포할 때마다 서비스 워커의 저장소 이름을 바꿈 → 새 버전이 깔리면 지난 버전 파일이 정리됨 */
function swVersion(): Plugin {
  return {
    name: 'moabom-sw-version',
    apply: 'build',
    closeBundle() {
      const p = resolve(__dirname, 'dist/web/sw.js')
      if (!existsSync(p)) return
      writeFileSync(p, readFileSync(p, 'utf8').replace('__BUILD_ID__', Date.now().toString(36)))
    },
  }
}

export default defineConfig({
  // root = 프로젝트 루트 (기본값). index.html에서 /src/... 경로가 올바르게 해석됨
  plugins: [react(), swVersion()],
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
