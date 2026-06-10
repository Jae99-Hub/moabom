import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

// 환경변수가 없으면 null (앱이 크래시하지 않도록)
// flowType: 'implicit' — Electron OAuth 릴레이 구조에 필수
// PKCE(기본값)는 code_verifier가 동일 컨텍스트에 있어야 해서
// Electron → 외부 브라우저 → Vercel 릴레이 구조에서 code 교환 불가
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { flowType: 'implicit' }
    })
  : (null as unknown as SupabaseClient)
