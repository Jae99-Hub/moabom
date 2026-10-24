import React from 'react'
import ReactDOM from 'react-dom/client'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import App from './App'
import './styles/index.css'
import { isSupabaseConfigured, supabase } from './api/supabaseClient'
import { useStore } from './store/useStore'
import AuthScreen from './components/AuthScreen'

// 초기 테마 적용 (저장값 없으면 라이트) — React 렌더 전에 적용해 다크 플래시 방지
try {
  document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'light')
} catch { document.documentElement.setAttribute('data-theme', 'light') }

// 파일을 창에 끌어다 놓아도 아무 일도 일어나지 않게 (기본 동작은 그 파일로 화면 이동)
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

const root = ReactDOM.createRoot(document.getElementById('root')!)

const renderAuth = () =>
  root.render(<AuthScreen onContinueAnonymous={() => { void enterApp(null) }} isElectron={true} />)

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
// 프로젝트가 삭제/일시정지되면 도메인이 해석되지 않아 요청이 멈춤 → 짧은 타임아웃으로 도달 불가를 판정.
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

/** 이 PC에 저장된 로그인 정보의 계정 id (네트워크 없이 읽음). 없으면 null */
function readCachedUserId(): string | null {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
    if (!url) return null
    // supabase-js 기본 저장 키: sb-<프로젝트 ref>-auth-token
    const raw = localStorage.getItem(`sb-${new URL(url).hostname.split('.')[0]}-auth-token`)
    if (!raw) return null
    const saved = JSON.parse(raw)
    const uid = saved?.user?.id ?? saved?.currentSession?.user?.id
    return typeof uid === 'string' ? uid : null
  } catch { return null }
}

// ── 앱 진입 ────────────────────────────────────────────────────────
// 지금 화면에 띄운 데이터 범위: 로그인 계정 id, null(로그인 없이), undefined(아직 앱 밖 — 로그인 화면 등)
let enteredScope: string | null | undefined
let syncedThisSession = false

async function enterApp(uid: string | null): Promise<void> {
  if (enteredScope === uid) return
  enteredScope = uid
  syncedThisSession = false
  // 이전 계정 화면·충돌 안내가 잠깐 비치지 않게 목록·선택 상태를 비우고 시작
  useStore.setState({ itemList: [], selectedId: null, checkedItems: [], selectionMode: false, syncConflicts: [], syncAutoMerged: 0 })
  try { await window.authBridge?.setCurrentUser(uid) } catch { /* ignore */ }
  if (enteredScope !== uid) return // 기다리는 사이 다른 계정으로 바뀌었거나 로그아웃됨
  // key: 계정이 바뀌면 App을 새로 마운트해 그 계정의 데이터로 다시 불러온다
  root.render(<React.StrictMode><App key={uid ?? 'local'} /></React.StrictMode>)
}

// ── 백그라운드 동기화 (앱 렌더 후 비차단 실행) ───────────────────────
let bgSyncRunning: Promise<void> | null = null
let bgSyncFor: string | null | undefined

function bgSync(): Promise<void> {
  if (bgSyncRunning) {
    if (bgSyncFor === enteredScope) return bgSyncRunning
    // 이전 계정의 동기화가 아직 도는 중 → 끝난 뒤 지금 계정으로 다시
    return bgSyncRunning.then(() => bgSync())
  }
  const scope = enteredScope
  bgSyncFor = scope
  bgSyncRunning = (async () => {
    try {
      const store = useStore.getState()
      await store.triggerSync() // 동기화 + 목록 새로고침 + 충돌 안내
      if (useStore.getState().syncStatus === 'success' && enteredScope === scope) {
        syncedThisSession = true
        // 첫 동기화로 데이터가 채워진 직후 스냅샷 1회 (빈 백업 방지)
        try { await window.api?.backup?.run?.(false) } catch { /* 실패 무시 */ }
      }
    } catch { /* 오프라인이어도 앱은 이미 떠 있음 */ }
    finally { bgSyncRunning = null }
  })()
  return bgSyncRunning
}

/** 저장된 로그인으로 먼저 연 뒤, 서버에 닿으면 세션을 확인(만료 시 갱신)하고 동기화 */
async function confirmSessionAndSync(uid: string): Promise<void> {
  if (!(await backendReachable())) return // 오프라인: 이 PC의 데이터로 계속 사용, 다음 수정 때 다시 시도
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session) return // 일시 오류면 다음 기회에, 로그아웃 처리됐으면 SIGNED_OUT이 로그인 화면으로 보냄
  if (session.user.id !== uid) await enterApp(session.user.id)
  await bgSync()
}

async function handleAuthEvent(event: AuthChangeEvent, session: Session | null): Promise<void> {
  if (event === 'SIGNED_IN' && session) {
    const uid = session.user.id
    if (enteredScope === uid) {
      // 같은 계정의 세션 복원 신호(시작 직후, 창을 내렸다 올릴 때마다 옴) → 다시 진입하지 않음.
      // 아직 한 번도 동기화에 성공하지 못했다면(오프라인으로 시작 등) 이때 한 번 시도.
      if (!syncedThisSession) void bgSync()
      return
    }
    await enterApp(uid) // 로그인 화면에서 로그인, 로그인 없이 쓰다가 설정에서 로그인
    void bgSync()
  } else if (event === 'SIGNED_OUT') {
    enteredScope = undefined
    syncedThisSession = false
    try { await window.authBridge?.setCurrentUser(null) } catch { /* ignore */ }
    useStore.getState().closeSettings()
    registerAuthCallback()
    renderAuth()
  }
}

// ── OAuth 콜백 URL 처리 (main process → renderer) ────────────────────
// 로그아웃 후 재로그인에도 동작하도록 함수로 분리해 재등록 가능하게 함
function authFailed(message: string) {
  window.dispatchEvent(new Event('moabom:auth-failed')) // 설정창의 '대기 중...' 표시 해제
  alert(message)
}

function registerAuthCallback() {
  window.authBridge?.onCallback(async (url: string) => {
    try {
      const fake = url.replace('moabom://', 'https://x/')
      const urlObj = new URL(fake)

      const access_token = urlObj.searchParams.get('access_token')
      const refresh_token = urlObj.searchParams.get('refresh_token')
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token })
        if (error) authFailed(`로그인 실패: ${error.message}`)
        // 앱 진입은 onAuthStateChange SIGNED_IN이 처리
        return
      }

      const code = urlObj.searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) authFailed(`로그인 실패: ${error.message}`)
        return
      }

      console.warn('[auth] 콜백 URL에 인증 정보 없음:', url)
      window.dispatchEvent(new Event('moabom:auth-failed'))
    } catch (e) {
      console.error('Auth callback 처리 실패:', e)
      authFailed(`로그인 오류: ${e instanceof Error ? e.message : String(e)}`)
    }
  })
}

async function bootstrap() {
  try {
    // Supabase 미설정 → 순수 로컬 모드
    if (!isSupabaseConfigured) {
      await enterApp(null)
      return
    }

    // OAuth 콜백 핸들러는 항상 등록 (백엔드가 살아있을 때 로그인 가능)
    registerAuthCallback()

    // 인증 상태 변화 감지. 콜백 안에서 바로 supabase를 호출하면 교착될 수 있어 다음 틱에 처리(supabase 권장).
    supabase.auth.onAuthStateChange((event, session) => {
      setTimeout(() => { void handleAuthEvent(event, session) }, 0)
    })

    // 저장된 로그인이 있으면 네트워크를 기다리지 않고 바로 그 계정 데이터로 연다
    // (예전엔 서버 확인을 기다리느라 화면이 늦게 떴고, 오프라인이면 내 데이터 대신 '로그인 없이' 데이터가 보였음)
    const cachedUid = readCachedUserId()
    if (cachedUid) {
      await enterApp(cachedUid)
      void confirmSessionAndSync(cachedUid)
      return
    }

    // 저장된 로그인 없음 → 서버에 닿으면 로그인 화면, 닿지 않으면 로그인 없이 바로 연다
    if (await backendReachable()) renderAuth()
    else await enterApp(null)
  } catch (e: unknown) {
    // 어떤 예외가 나도 흰 화면 대신 로컬 모드로 앱을 연다
    console.error('[bootstrap 오류] → 로컬 모드로 폴백', e)
    try {
      enteredScope = undefined
      await enterApp(null)
    } catch (e2) {
      renderError(e2 instanceof Error ? e2.message : String(e2))
    }
  }
}

bootstrap()
