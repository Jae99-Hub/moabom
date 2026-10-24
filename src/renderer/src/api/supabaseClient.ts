import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

// 로그인은 Electron·웹 모두 PKCE(기본값): 브라우저가 돌려주는 건 일회용 코드뿐이고,
// 이 앱이 로그인을 시작할 때 만든 비밀값이 있어야만 세션으로 바꿀 수 있다.
// (예전 Electron의 implicit 방식은 토큰 자체가 주소에 실려 와 남의 로그인 링크로도 로그인될 수 있었음)
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : (null as unknown as SupabaseClient)
