import { vi } from 'vitest'

// Vitest도 Vite처럼 .env의 VITE_* 값을 읽는다 — 테스트가 실제 Supabase 프로젝트에 붙지 않도록 비워 둠
vi.stubEnv('VITE_SUPABASE_URL', '')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
