// 로그인·로그아웃 — 로그인 화면과 설정 창이 같은 코드를 쓰도록 한 곳에
import { supabase, isSupabaseConfigured } from './supabaseClient'

export type InAppBrowser = 'kakao' | 'android' | 'ios'

/** 앱 안 브라우저(카카오톡·네이버·인스타그램·페이스북·라인 등) — Google이 이런 곳의 로그인을 막아 둠(403 disallowed_useragent) */
export function detectInAppBrowser(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): InAppBrowser | null {
  if (!/KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|FB_IAB|Line\/|DaumApps|everytimeApp|Whale\/[\d.]+.*inapp|; wv\)/i.test(ua)) return null
  if (/KAKAOTALK/i.test(ua)) return 'kakao'
  return /Android/i.test(ua) ? 'android' : 'ios'
}

/** 이 페이지를 바깥 브라우저로 여는 주소. 아이폰 앱들은 이런 주소가 없어 메뉴에서 직접 열어야 함(null) */
export function externalBrowserUrl(kind: InAppBrowser, href: string): string | null {
  if (kind === 'kakao') return `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`
  if (kind === 'android') {
    const u = new URL(href)
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`
  }
  return null
}

/** Google 로그인 시작. 실패하면 사용자에게 보여 줄 문구, 성공하면 null.
 *  데스크톱: 기본 브라우저에서 로그인 → localhost:3000이 받아 moabom://로 앱에 일회용 코드 전달(PKCE)
 *  웹: 이 창이 Google 로그인으로 이동했다가 돌아옴 */
export async function startGoogleSignIn(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return '로그인을 쓸 수 없는 환경이에요.'
  const desktop = !!window.authBridge
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: desktop ? 'http://localhost:3000' : window.location.origin,
      skipBrowserRedirect: desktop,
      queryParams: { prompt: 'select_account' },
    },
  })
  if (error) return `잠시 뒤 다시 시도해 주세요. (${error.message})`
  if (desktop) {
    if (!data.url) return '로그인 주소를 받지 못했어요. 잠시 뒤 다시 시도해 주세요.'
    try { await window.authBridge!.openExternal(data.url) } catch { return '브라우저를 열지 못했어요. 잠시 뒤 다시 시도해 주세요.' }
  }
  return null
}

/** 이 기기에서만 로그아웃 — 기본값(global)은 다른 기기·데스크톱 앱의 로그인까지 모두 끊었음 */
export async function signOutHere(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  await supabase.auth.signOut({ scope: 'local' })
}
