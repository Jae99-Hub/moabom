import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
})
