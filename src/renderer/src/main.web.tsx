import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App'
import './styles/index.css'
import { setupWebApi } from './api/webApi'
import { supabase, isSupabaseConfigured, storedUserId } from './api/supabaseClient'
import AuthScreen from './components/AuthScreen'
import DialogHost from './components/DialogHost'
import { useStore } from './store/useStore'
import { confirmDialog, showToast } from './store/dialogs'

// 화면 오류만 보고 (성능 추적·화면 녹화 없음, 개발 중엔 보내지 않음).
// 주소의 검색어·로그인 코드·계정 id는 지우고 보낸다.
const scrubUrl = (u?: string): string | undefined => u?.replace(/\?.*$/, '')
Sentry.init({
  dsn: 'https://c1a6f0fc7eaa862efb711e724e94e3d6@o4511405192052736.ingest.us.sentry.io/4511405197295616',
  environment: 'web',
  enabled: import.meta.env.PROD,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeBreadcrumb(crumb) {
    if (crumb.category === 'console') return null // 오류 안에 기록 내용이 들어 있을 수 있음
    if (crumb.data?.url) crumb.data.url = scrubUrl(String(crumb.data.url))
    if (crumb.data?.to) crumb.data.to = scrubUrl(String(crumb.data.to))
    if (crumb.data?.from) crumb.data.from = scrubUrl(String(crumb.data.from))
    return crumb
  },
  beforeSend(event) {
    if (event.request?.url) event.request.url = scrubUrl(event.request.url)
    if (event.request) delete event.request.query_string
    return event
  },
})

// 저장해 둔 테마를 그리기 전에 적용 (밝은 테마인데 어두운 화면이 잠깐 비치던 것)
try {
  document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'light')
} catch { document.documentElement.setAttribute('data-theme', 'light') }

const rootEl = document.getElementById('root') ?? document.body
const root = ReactDOM.createRoot(rootEl)

function CenterScreen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100dvh', gap: 12, padding: '0 24px', textAlign: 'center',
      background: 'var(--bg-primary)', color: 'var(--text-primary)',
    }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.6 }} aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
      {children}
    </div>
  )
}

const LoadingScreen = () => <CenterScreen><p style={{ fontSize: 14, opacity: 0.6, margin: 0 }}>불러오는 중...</p></CenterScreen>

function ErrorScreen({ message }: { message: string }) {
  return (
    <CenterScreen>
      <p style={{ fontSize: 14, color: 'var(--danger)', margin: 0 }}>화면을 열지 못했어요</p>
      <p style={{ fontSize: 12, opacity: 0.6, margin: 0, maxWidth: 480, wordBreak: 'break-all' }}>{message}</p>
      <button className="btn-primary" onClick={() => window.location.reload()}>다시 시도</button>
    </CenterScreen>
  )
}

// ── 로그인 없이 쓰기 (이 브라우저에 저장) ──────────────────────────
const ANON_KEY = 'moabom_anon_mode'
const isAnonMode = () => { try { return localStorage.getItem(ANON_KEY) === '1' } catch { return false } }
const setAnonMode = (v: boolean) => { try { if (v) localStorage.setItem(ANON_KEY, '1'); else localStorage.removeItem(ANON_KEY) } catch { /* ignore */ } }

let shownUid: string | null | undefined // 지금 화면의 계정 (null = 로그인 없이, undefined = 로그인 화면)

const renderAuth = () => {
  shownUid = undefined
  root.render(<><AuthScreen onContinueAnonymous={() => { setAnonMode(true); renderApp(null) }} /><DialogHost /></>)
}

function renderApp(uid: string | null): void {
  if (shownUid === uid) return
  shownUid = uid
  // 계정이 바뀌면 App을 새로 그리고 목록을 비운 채 시작 — 이전 계정의 기록이 잠깐이라도 보이지 않게
  useStore.setState({ itemList: [], selectedId: null, checkedItems: [], selectionMode: false })
  root.render(<React.StrictMode><App key={uid ?? 'local'} /></React.StrictMode>)
  if (uid) void offerAnonImport()
  else remindAnonStorage()
}

/** 로그인 없이 쓰는 중이라는 것을 이 창에서 한 번 알려 줌 */
function remindAnonStorage(): void {
  try {
    if (sessionStorage.getItem('moabom_anon_notice')) return
    sessionStorage.setItem('moabom_anon_notice', '1')
  } catch { /* ignore */ }
  setTimeout(() => showToast('로그인 없이 쓴 기록은 이 브라우저에만 저장돼요', {
    text: '로그인', onClick: () => useStore.getState().openSettings(),
  }, 10000), 1500)
}

/** 로그인했는데 이 브라우저에 로그인 없이 쓴 기록이 있으면 계정으로 옮길지 물어봄 (예전엔 로그인하면 안 보이게 됐음) */
async function offerAnonImport(): Promise<void> {
  try {
    const info = await window.api.items.scopeInfo()
    if (!info.anon) return
    const ok = await confirmDialog({
      title: `로그인 없이 쓴 기록 ${info.anon}개가 있어요`,
      message: '이 브라우저에만 저장된 기록이에요. 지금 계정으로 옮길까요? 옮기면 다른 기기에서도 볼 수 있어요.',
      confirmText: '계정으로 옮기기',
      cancelText: '나중에',
    })
    if (!ok) return
    const { imported, failed } = await window.api.items.importOtherScope('anon')
    await useStore.getState().fetchAll()
    showToast(failed
      ? `${imported}개를 옮겼어요. ${failed}개는 옮기지 못해 이 브라우저에 남겨 뒀어요 (설정 > 데이터에서 다시 시도).`
      : `${imported}개를 옮겼어요.`)
  } catch {
    showToast('기록을 옮기지 못했어요. 설정 > 데이터에서 다시 시도해 주세요.')
  }
}

async function bootstrap() {
  root.render(<LoadingScreen />)

  if (!isSupabaseConfigured) {
    root.render(<ErrorScreen message="서버 연결 설정(VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY)이 빠졌어요." />)
    return
  }

  try {
    await setupWebApi()

    // 만료된 로그인을 연결 문제로 갱신하지 못했으면 저장된 계정으로 연다 (요청이 실패하면 그 오류를 보여 줌)
    const { data: { session }, error } = await supabase.auth.getSession()
    const uid = session?.user.id ?? (error ? storedUserId() : null)
    if (uid) {
      setAnonMode(false)
      renderApp(uid)
    } else if (isAnonMode()) {
      renderApp(null)
    } else {
      renderAuth()
    }

    supabase.auth.onAuthStateChange((event, s) => {
      // 콜백 안에서 바로 supabase를 부르면 교착될 수 있어 다음 틱에 (supabase 권장)
      setTimeout(() => {
        if (event === 'SIGNED_IN' && s) {
          setAnonMode(false)
          renderApp(s.user.id)
        } else if (event === 'SIGNED_OUT') {
          // 다른 탭에서 로그아웃 — 이전 계정의 기록이 메모리에 남지 않게 새로 불러옴
          setAnonMode(false)
          window.location.reload()
        }
      }, 0)
    })

    // 다른 기기에서 바꾼 기록도 보이게: 탭으로 돌아올 때 1분 넘게 지났으면 목록을 다시 받음
    let lastFetch = Date.now()
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || shownUid == null || Date.now() - lastFetch < 60_000) return
      lastFetch = Date.now()
      void useStore.getState().fetchAll().catch(() => { /* 오프라인 — 다음에 */ })
    })
  } catch (e) {
    console.error('웹 API 초기화 실패:', e)
    root.render(<ErrorScreen message={e instanceof Error ? e.message : String(e)} />)
  }
}

bootstrap()

// 휴대폰·PC에서 앱처럼 설치하고, 인터넷이 잠깐 끊겨도 화면은 열리게 (배포판에서만)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* 지원하지 않는 환경은 그냥 웹으로 */ })
  })
}
