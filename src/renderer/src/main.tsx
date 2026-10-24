import React from 'react'
import ReactDOM from 'react-dom/client'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import App from './App'
import './styles/index.css'
import { isSupabaseConfigured, supabase, storedUserId } from './api/supabaseClient'
import * as Sentry from '@sentry/react'
import { useStore } from './store/useStore'
import { alertDialog } from './store/dialogs'
import AuthScreen from './components/AuthScreen'
import DialogHost from './components/DialogHost'

// 지인 PC에서 화면 오류가 나면 알 수 있게 오류만 보고 (성능 추적·화면 녹화 없음, 개발 중엔 보내지 않음)
// 파일 경로에 든 Windows 사용자 이름(C:\Users\이름\...)은 지우고 보낸다.
const scrubUserPath = (s?: string): string | undefined => s?.replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/]+/gi, '~')
Sentry.init({
  dsn: 'https://c1a6f0fc7eaa862efb711e724e94e3d6@o4511405192052736.ingest.us.sentry.io/4511405197295616',
  environment: 'desktop',
  enabled: import.meta.env.PROD,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request?.url) event.request.url = scrubUserPath(event.request.url)
    for (const ex of event.exception?.values ?? []) {
      for (const frame of ex.stacktrace?.frames ?? []) {
        frame.filename = scrubUserPath(frame.filename)
        frame.abs_path = scrubUserPath(frame.abs_path)
      }
    }
    return event
  },
})

// 초기 테마 적용 (저장값 없으면 라이트) — React 렌더 전에 적용해 다크 플래시 방지
try {
  document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'light')
} catch { document.documentElement.setAttribute('data-theme', 'light') }

// 파일을 창에 끌어다 놓아도 아무 일도 일어나지 않게 (기본 동작은 그 파일로 화면 이동)
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

const root = ReactDOM.createRoot(document.getElementById('root')!)

// '로그인 없이 계속하기'를 고르면 기억해 두고 다음부터는 바로 연다 (예전엔 켤 때마다 로그인 화면이 떴음)
const ANON_KEY = 'moabom_anon_mode'
const isAnonMode = (): boolean => { try { return localStorage.getItem(ANON_KEY) === '1' } catch { return false } }
const setAnonMode = (v: boolean): void => {
  try { if (v) localStorage.setItem(ANON_KEY, '1'); else localStorage.removeItem(ANON_KEY) } catch { /* ignore */ }
}

const renderAuth = () =>
  root.render(<><AuthScreen onContinueAnonymous={() => { setAnonMode(true); void enterApp(null) }} /><DialogHost /></>)

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
  lastBgSyncAt = Date.now()
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

// 다른 기기에서 고친 내용도 받아 오게: 창으로 돌아올 때(1분 넘게 지났으면)와 켜 둔 동안 10분마다 동기화.
// 예전엔 앱을 켤 때·이 기기에서 고칠 때만 동기화해서, 켜 둔 채로는 다른 기기의 변경이 안 보였음
const RESYNC_MIN_GAP_MS = 60_000
let lastBgSyncAt = 0
function syncIfStale(): void {
  if (typeof enteredScope !== 'string' || document.hidden) return
  if (Date.now() - lastBgSyncAt < RESYNC_MIN_GAP_MS) return
  void bgSync()
}
window.addEventListener('focus', syncIfStale)
setInterval(syncIfStale, 10 * 60_000)

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
    setAnonMode(false)
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
  void alertDialog(message, '로그인하지 못했어요')
}

function registerAuthCallback() {
  window.authBridge?.onCallback(async (url: string) => {
    try {
      const fake = url.replace('moabom://', 'https://x/')
      const urlObj = new URL(fake)

      // PKCE: 일회용 코드만 받는다. 이 앱이 로그인을 시작할 때 만든 비밀값과 짝이 맞아야 세션이 됨.
      // (토큰을 주소로 직접 받던 예전 방식은 남이 만든 moabom:// 링크로도 그 사람 계정에 로그인될 수 있어 받지 않음)
      const code = urlObj.searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) authFailed(`로그인 버튼을 다시 눌러 주세요.\n(${error.message})`)
        // 앱 진입은 onAuthStateChange SIGNED_IN이 처리
        return
      }

      console.warn('[auth] 콜백 URL에 인증 정보 없음:', url)
      window.dispatchEvent(new Event('moabom:auth-failed'))
    } catch (e) {
      console.error('Auth callback 처리 실패:', e)
      authFailed(`잠시 뒤 다시 시도해 주세요.\n(${e instanceof Error ? e.message : String(e)})`)
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
    const cachedUid = storedUserId()
    if (cachedUid) {
      await enterApp(cachedUid)
      void confirmSessionAndSync(cachedUid)
      return
    }

    // 저장된 로그인 없음 → '로그인 없이'를 골랐었으면 바로 열고,
    // 아니면 서버에 닿을 때 로그인 화면, 닿지 않으면 로그인 없이 바로 연다
    if (isAnonMode()) await enterApp(null)
    else if (await backendReachable()) renderAuth()
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
