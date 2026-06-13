import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { isSupabaseConfigured, supabase } from './api/supabaseClient'
import { setupWebApi } from './api/webApi'
import AuthScreen from './components/AuthScreen'

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

// ── 로그인 후 처리 ────────────────────────────────────────────────
async function loginAndSync() {
  // 웹 환경에서는 window.api를 Supabase로 전환
  // Electron에서는 contextBridge가 읽기전용이라 실패해도 무시
  try { await setupWebApi() } catch { /* Electron에서는 정상 */ }

  // 현재 유저 ID를 main process에 전달 (SQLite 필터링용)
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const bridge = (window as unknown as { authBridge?: { setCurrentUser: (id: string | null) => void } }).authBridge
    bridge?.setCurrentUser(user?.id ?? null)
  } catch { /* ignore */ }

  // 로그인 시 자동 동기화: 로컬 dirty 항목 push + 클라우드 데이터 pull
  try {
    const { runSync } = await import('./api/syncService')
    await runSync()
  } catch { /* 오프라인이어도 앱 실행 */ }
}

async function bootstrap() {
  try {
  // Supabase 환경변수 없으면 그냥 로컬 SQLite로 실행
  if (!isSupabaseConfigured) {
    renderApp()
    return
  }

  // 저장된 세션 확인
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError

  if (session) {
    await loginAndSync()
    renderApp()
  } else {
    renderAuth()
  }

  // OAuth 콜백 처리 (main process → renderer)
  const authBridge = (window as unknown as { authBridge?: { onCallback: (cb: (url: string) => void) => void } }).authBridge
  authBridge?.onCallback(async (url: string) => {
    try {
      const fake = url.replace('moabom://', 'https://x/')
      const urlObj = new URL(fake)

      // Implicit flow: 로컬 서버에서 해시→쿼리 변환 후 ?access_token=... 로 도착
      const access_token = urlObj.searchParams.get('access_token')
      const refresh_token = urlObj.searchParams.get('refresh_token')
      if (access_token && refresh_token) {
        const { data: { session }, error } = await supabase.auth.setSession({ access_token, refresh_token })
        if (error) { alert(`로그인 실패: ${error.message}`); return }
        if (session) { await loginAndSync(); renderApp() }
        return
      }

      // PKCE flow: ?code=...
      const code = urlObj.searchParams.get('code')
      if (code) {
        const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) { alert(`로그인 실패: ${error.message}`); return }
        if (session) { await loginAndSync(); renderApp() }
        return
      }

      console.warn('[auth] 콜백 URL에 인증 정보 없음:', url)
    } catch (e) {
      console.error('Auth callback 처리 실패:', e)
      alert(`로그인 오류: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  // 인증 상태 변화 감지
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await loginAndSync()
      renderApp()
    } else if (event === 'SIGNED_OUT') {
      const bridge = (window as unknown as { authBridge?: { setCurrentUser: (id: string | null) => void } }).authBridge
      bridge?.setCurrentUser(null)
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
