import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

// Electron 빌드: implicit flow (localhost:3000 relay 구조 — 해시로 토큰 전달)
// 웹 빌드: PKCE (기본값 — 기존 세션 유지, 보안 강화)
const isElectron = import.meta.env.VITE_IS_ELECTRON === 'true'

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: isElectron ? { flowType: 'implicit' } : {}
    })
  : (null as unknown as SupabaseClient)
