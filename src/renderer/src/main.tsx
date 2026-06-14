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

// ── 앱 시작 시 초기 로그인 처리 (세션 복원 + 동기화) ────────────────
async function loginAndSync() {
  try { await setupWebApi() } catch { /* Electron에서는 정상 */ }
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const bridge = (window as unknown as { authBridge?: { setCurrentUser: (id: string | null) => Promise<void> } }).authBridge
    await bridge?.setCurrentUser(user?.id ?? null)
  } catch { /* ignore */ }
  try {
    const { runSync } = await import('./api/syncService')
    await runSync()
  } catch { /* 오프라인이어도 앱 실행 */ }
}

// ── OAuth 코드 교환 후 백그라운드 동기화 ─────────────────────────────
// onAuthStateChange SIGNED_IN에서 renderApp() 직후 호출 (await 없이)
async function bgSync() {
  try { await setupWebApi() } catch { }
  try {
    const { runSync } = await import('./api/syncService')
    await runSync()
    // sync 완료 후 아이템 목록 갱신
    const { useStore } = await import('./store/useStore')
    await useStore.getState().fetchAll()
  } catch { }
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
    if (!isSupabaseConfigured) {
      renderApp()
      return
    }

    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw sessionError

    if (session) {
      await loginAndSync()
      renderApp()
    } else {
      renderAuth()
    }

    // OAuth 콜백 핸들러 등록
    authBridgeRef = (window as unknown as { authBridge?: AuthBridgeType }).authBridge
    registerAuthCallback()

    // 인증 상태 변화 감지
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // currentUserId 먼저 설정 (SQLite 필터링이 즉시 정확하게 동작)
        try {
          const bridge = (window as unknown as { authBridge?: { setCurrentUser: (id: string | null) => Promise<void> } }).authBridge
          await bridge?.setCurrentUser(session.user.id)
        } catch { }
        // 화면을 즉시 전환 — sync는 백그라운드에서 처리
        renderApp()
        bgSync()
      } else if (event === 'SIGNED_OUT') {
        const bridge = (window as unknown as { authBridge?: { setCurrentUser: (id: string | null) => void } }).authBridge
        bridge?.setCurrentUser(null)
        // 설정 모달이 열린 채로 로그아웃 시 재로그인 후 자동 열리는 것 방지
        try {
          const { useStore } = await import('./store/useStore')
          useStore.getState().closeSettings()
        } catch { }
        // 로그아웃 후 재로그인을 위해 OAuth 콜백 핸들러 재등록
        registerAuthCallback()
        renderAuth()
      }
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[bootstrap 오류]', e)
    renderError(msg)
  }
}

bootstrap()
