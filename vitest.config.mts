import { defineConfig } from 'vitest/config'

// 자동 테스트 설정 — 저장·동기화 로직처럼 화면 없이 확인할 수 있는 부분을 Node에서 돌린다
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 20000,
  },
})
