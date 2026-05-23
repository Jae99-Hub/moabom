import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App'
import './styles/index.css'
import { setupWebApi } from './api/webApi'
import { supabase, isSupabaseConfigured } from './api/supabaseClient'
import AuthScreen from './components/AuthScreen'

// ── Sentry 에러 모니터링 초기화 ───────────────────────────────────
Sentry.init({
  dsn: 'https://c1a6f0fc7eaa862efb711e724e94e3d6@o4511405192052736.ingest.us.sentry.io/4511405197295616',
  environment: 'production',
  tracesSampleRate: 0.2,   // 20% 성능 트레이싱
  replaysOnErrorSampleRate: 1.0,  // 에러 발생 시 100% 세션 리플레이
})

const rootEl = document.getElementById('root') ?? document.body
const root = ReactDOM.createRoot(rootEl)

function LoadingScreen() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', gap: 16, background: 'var(--bg-primary, #0f0f0f)', color: 'var(--text-primary, #e8e8e8)'
    }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.6 }}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
      <p style={{ fontSize: 14, opacity: 0.6, margin: 0 }}>불러오는 중...</p>
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', gap: 12, background: 'var(--bg-primary, #0f0f0f)', color: 'var(--text-primary, #e8e8e8)'
    }}>
      <p style={{ fontSize: 14, color: '#f87171', margin: 0 }}>초기화 실패: {message}</p>
      <button
        onClick={() => window.location.reload()}
        style={{ padding: '8px 16px', borderRadius: 8, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}
      >
        다시 시도
      </button>
    </div>
  )
}

function SetupScreen() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', gap: 12, background: 'var(--bg-primary, #0f0f0f)', color: 'var(--text-primary, #e8e8e8)',
      padding: '0 24px', textAlign: 'center'
    }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.5 }}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
      <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>모아봄</p>
      <p style={{ fontSize: 13, color: '#f87171', margin: 0 }}>Supabase 환경변수가 설정되지 않았습니다.</p>
      <p style={{ fontSize: 12, opacity: 0.5, margin: 0 }}>Netlify 환경변수에 VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 설정해주세요.</p>
    </div>
  )
}

// ── 비로그인 모드 유지 플래그 ────────────────────────────────────
const ANON_KEY = 'moabom_anon_mode'
const isAnonMode = () => { try { return localStorage.getItem(ANON_KEY) === '1' } catch { return false } }
const setAnonMode = (v: boolean) => { try { v ? localStorage.setItem(ANON_KEY, '1') : localStorage.removeItem(ANON_KEY) } catch {} }

// 인증 리스너 중복 방지용 참조
let authSubscription: { unsubscribe: () => void } | null = null

// ── Electron OAuth 릴레이 ─────────────────────────────────────────
// Electron이 redirectTo: 'https://moabom-app.vercel.app?from=electron' 로 설정하면
// Google OAuth 후 이 웹페이지에 access_token이 hash로 붙어서 옴
// 이를 감지해 moabom://auth-callback 으로 자동 전달
function handleElectronRelay() {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('from') !== 'electron') return false

    const hash = window.location.hash.slice(1)
    const hashParams = new URLSearchParams(hash)
    const access_token = hashParams.get('access_token')
    const refresh_token = hashParams.get('refresh_token')

    if (access_token && refresh_token) {
      // Electron 앱으로 토큰 전달
      window.location.href = `moabom://auth-callback#access_token=${access_token}&refresh_token=${refresh_token}`
      return true
    }

    // 토큰 아직 없음 (페이지 첫 로드) - 기다리는 화면 표시
    root.render(
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100vh', gap: 16, background: 'var(--bg-primary, #0f0f0f)', color: 'var(--text-primary, #e8e8e8)'
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.6 }}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>모아봄</p>
        <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>Google 로그인 처리 중...</p>
        <p style={{ fontSize: 12, opacity: 0.4, margin: 0 }}>완료되면 자동으로 앱으로 돌아갑니다</p>
      </div>
    )
    return true
  } catch { return false }
}

async function bootstrap() {
  root.render(<LoadingScreen />)

  // Electron OAuth 릴레이 처리 (from=electron 파라미터 감지)
  if (handleElectronRelay()) return

  // Supabase 환경변수 없으면 안내 화면
  if (!isSupabaseConfigured) {
    root.render(<SetupScreen />)
    return
  }

  try {
    // window.api 설정 (Supabase 기반)
    await setupWebApi()

    // 현재 로그인 세션 확인
    const { data: { session } } = await supabase.auth.getSession()

    const renderApp = () => root.render(<React.StrictMode><App /></React.StrictMode>)
    const renderAuth = () => root.render(<AuthScreen onContinueAnonymous={() => { setAnonMode(true); renderApp() }} />)

    if (session) {
      setAnonMode(false) // 로그인 상태면 플래그 초기화
      renderApp()
    } else if (isAnonMode()) {
      renderApp() // 이전에 비로그인 선택 → 로그인 화면 건너뜀
    } else {
      renderAuth()
    }

    // 기존 리스너 해제 후 재등록 (bootstrap 재호출 시 중복 방지)
    if (authSubscription) authSubscription.unsubscribe()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setAnonMode(false) // 로그인 시 플래그 해제
        renderApp()
      } else if (event === 'SIGNED_OUT') {
        setAnonMode(false) // 로그아웃 시 플래그 해제 → 다음엔 로그인 화면 표시
        renderAuth()
      }
    })
    authSubscription = subscription

  } catch (e) {
    console.error('웹 API 초기화 실패:', e)
    const msg = e instanceof Error ? e.message : String(e)
    root.render(<ErrorScreen message={msg} />)
  }
}

bootstrap()
