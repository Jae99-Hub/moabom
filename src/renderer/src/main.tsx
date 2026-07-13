import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { isSupabaseConfigured, supabase } from './api/supabaseClient'
import { setupWebApi } from './api/webApi'
import AuthScreen from './components/AuthScreen'

// 초기 테마 적용 (저장값 없으면 라이트) — React 렌더 전에 적용해 다크 플래시 방지
try {
  document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'light')
} catch { document.documentElement.setAttribute('data-theme', 'light') }

const root = ReactDOM.createRoot(document.getElementById('root')!)

const renderApp = () => root.render(<React.StrictMode><App /></React.StrictMode>)
const renderAuth = () =>
  root.render(<AuthScreen onContinueAnonymous={renderApp} isElectron={true} />)

function renderError(msg: string) {
  root.render(
    <div style={{
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      height:'100vh', gap:12, background:'#0f0f13', color:'#e8e8e8', padding:24, textAlign:'center'
    }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p style={{fontSize:16, fontWeight:700, margin:0, color:'#f87171'}}>앱 시작 오류</p>
      <p style={{fontSize:12, opacity:0.6, margin:0, maxWidth:480, wordBreak:'break-all'}}>{msg}</p>
      <button onClick={()=>window.location.reload()}
        style={{marginTop:8, padding:'8px 20px', borderRadius:99, background:'#6366f1', color:'#fff', border:'none', cursor:'pointer', fontSize:13}}>
        다시 시도
      </button>
    </div>
  )
}

// ── 백엔드(Supabase) 연결 가능 여부 프로브 (타임아웃 포함) ─────────────
// 프로젝트가 삭제/일시정지되면 도메인이 해석되지 않아 startup이 멈추고 흰 화면이 됨.
// 짧은 타임아웃으로 도달 불가를 판정해 무조건 앱이 열리도록 함.
async function backendReachable(timeoutMs = 4000): Promise<boolean> {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
    if (!url) return false
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    // GoTrue의 공개 health 엔드포인트 — 인증 없이 응답. 응답만 오면(상태코드 무관) 도달 가능.
    await fetch(url.replace(/\/$/, '') + '/auth/v1/health', { signal: ctrl.signal })
    clearTimeout(timer)
    return true
  } catch {
    return false // DNS 실패 / 타임아웃 / 네트워크 오류 → 도달 불가
  }
}

// ── 로그인 세션으로 앱 진입 (동기화는 백그라운드) ────────────────────
async function enterAppLoggedIn(userId: string): Promise<void> {
  try {
    const bridge = (window as unknown as { authBridge?: { setCurrentUser: (id: string | null) => Promise<void> } }).authBridge
    await bridge?.setCurrentUser(userId)
  } catch { /* ignore */ }
  renderApp()
  bgSync()
}

// ── 로컬(오프라인/비로그인) 모드로 앱 진입 ───────────────────────────
async function enterAppLocal(): Promise<void> {
  try {
    const bridge = (window as unknown as { authBridge?: { setCurrentUser: (id: string | null) => Promise<void> } }).authBridge
    await bridge?.setCurrentUser(null)
  } catch { /* ignore */ }
  renderApp()
}

// ── 백그라운드 동기화 (앱 렌더 후 비차단 실행) ───────────────────────
async function bgSync() {
  try { await setupWebApi() } catch { /* Electron에서는 정상 */ }
  try {
    const { runSync } = await import('./api/syncService')
    await runSync()
    const { useStore } = await import('./store/useStore')
    await useStore.getState().fetchAll()
    // 첫 동기화로 데이터가 채워진 직후 스냅샷 1회 (빈 백업 방지)
    try { await window.api?.backup?.run?.(false) } catch { /* 웹/실패 무시 */ }
  } catch { /* 오프라인이어도 앱은 이미 떠 있음 */ }
}


// ── OAuth 콜백 URL 처리 (main process → renderer) ────────────────────
// 로그아웃 후 재로그인에도 동작하도록 함수로 분리해 재등록 가능하게 함
type AuthBridgeType = { onCallback: (cb: (url: string) => void) => void }
let authBridgeRef: AuthBridgeType | undefined

function registerAuthCallback() {
  authBridgeRef?.onCallback(async (url: string) => {
    try {
      const fake = url.replace('moabom://', 'https://x/')
      const urlObj = new URL(fake)

      const access_token = urlObj.searchParams.get('access_token')
      const refresh_token = urlObj.searchParams.get('refresh_token')
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token })
        if (error) alert(`로그인 실패: ${error.message}`)
        // renderApp()은 onAuthStateChange SIGNED_IN이 처리
        return
      }

      const code = urlObj.searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) alert(`로그인 실패: ${error.message}`)
        // renderApp()은 onAuthStateChange SIGNED_IN이 처리
        return
      }

      console.warn('[auth] 콜백 URL에 인증 정보 없음:', url)
    } catch (e) {
      console.error('Auth callback 처리 실패:', e)
      alert(`로그인 오류: ${e instanceof Error ? e.message : String(e)}`)
    }
  })
}

async function bootstrap() {
  try {
    // Supabase 미설정 → 순수 로컬 모드
    if (!isSupabaseConfigured) {
      renderApp()
      return
    }

    // OAuth 콜백 핸들러는 항상 등록 (백엔드가 살아있을 때 로그인 가능)
    authBridgeRef = (window as unknown as { authBridge?: AuthBridgeType }).authBridge
    registerAuthCallback()

    // 인증 상태 변화 감지 (백엔드 복구/로그인/로그아웃 시 자동 반영)
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await enterAppLoggedIn(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        const bridge = (window as unknown as { authBridge?: { setCurrentUser: (id: string | null) => void } }).authBridge
        bridge?.setCurrentUser(null)
        try {
          const { useStore } = await import('./store/useStore')
          useStore.getState().closeSettings()
        } catch { /* ignore */ }
        registerAuthCallback()
        renderAuth()
      }
    })

    // ── 백엔드 도달 가능 여부 먼저 확인 (흰 화면 방지의 핵심) ──
    const reachable = await backendReachable()

    if (!reachable) {
      // 백엔드가 삭제/정지/오프라인 → 로컬 데이터로 앱을 무조건 연다.
      console.warn('[bootstrap] Supabase 백엔드에 도달할 수 없음 → 로컬 모드로 실행')
      await enterAppLocal()
      return
    }

    // 백엔드 정상 → 저장된 세션 확인
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      // 세션 복원 실패해도 앱은 로컬 모드로 연다
      console.warn('[bootstrap] 세션 확인 실패 → 로컬 모드', sessionError)
      await enterAppLocal()
      return
    }

    if (session) {
      await enterAppLoggedIn(session.user.id)
    } else {
      renderAuth()
    }
  } catch (e: unknown) {
    // 어떤 예외가 나도 흰 화면 대신 로컬 모드로 앱을 연다
    console.error('[bootstrap 오류] → 로컬 모드로 폴백', e)
    try {
      await enterAppLocal()
    } catch (e2) {
      renderError(e2 instanceof Error ? e2.message : String(e2))
    }
  }
}

bootstrap()
