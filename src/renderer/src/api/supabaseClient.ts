import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

// 로그인은 Electron·웹 모두 PKCE: 브라우저가 돌려주는 건 일회용 코드뿐이고,
// 이 앱이 로그인을 시작할 때 만든 비밀값이 있어야만 세션으로 바꿀 수 있다.
// (supabase-js 기본값은 implicit — 토큰 자체가 주소에 실려 와 남의 로그인 링크로도 로그인될 수 있어 꼭 명시)
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, { auth: { flowType: 'pkce' } })
  : (null as unknown as SupabaseClient)

/** 이 기기에 저장된 로그인 정보의 계정 id (네트워크 없이 읽음). 없으면 null */
export function storedUserId(): string | null {
  try {
    if (!supabaseUrl) return null
    // supabase-js 기본 저장 키: sb-<프로젝트 ref>-auth-token
    const raw = localStorage.getItem(`sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`)
    if (!raw) return null
    const saved = JSON.parse(raw)
    const uid = saved?.user?.id ?? saved?.currentSession?.user?.id
    return typeof uid === 'string' ? uid : null
  } catch { return null }
}
