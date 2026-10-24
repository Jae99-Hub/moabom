import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// 배포용 빌드에 검색 키가 빠지면 지인들 앱에서 검색이 안 되므로 빌드를 멈춘다 (.env의 MAIN_VITE_*)
function requireSearchKeys(mode: string): void {
  if (mode !== 'production') return
  const env = loadEnv(mode, process.cwd(), 'MAIN_VITE_')
  const missing = ['MAIN_VITE_TMDB_API_KEY', 'MAIN_VITE_GOOGLE_BOOKS_API_KEY'].filter((k) => !env[k])
  if (missing.length) throw new Error(`.env에 검색 키가 없어요: ${missing.join(', ')}`)
}

export default defineConfig(({ mode }) => {
  requireSearchKeys(mode)
  return {
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    define: {
      'import.meta.env.VITE_IS_ELECTRON': '"true"'
    },
    // electron-vite는 렌더러를 기본으로 압축하지 않음 → 압축해 화면 코드 크기를 절반 이하로 (시작 시 읽는 양 감소)
    build: { minify: 'esbuild' }
  }
  }
})
