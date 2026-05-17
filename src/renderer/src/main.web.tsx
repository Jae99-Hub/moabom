import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { setupWebApi } from './api/webApi'
import { supabase, isSupabaseConfigured } from './api/supabaseClient'
import AuthScreen from './components/AuthScreen'

const root = ReactDOM.createRoot(document.getElementById('root')!)

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

async function bootstrap() {
  root.render(<LoadingScreen />)

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

    if (session) {
      // 이미 로그인 → 앱 바로 렌더
      renderApp()
    } else {
      // 비로그인 → 로그인 화면 (비로그인 계속 버튼 포함)
      root.render(<AuthScreen onContinueAnonymous={renderApp} />)
    }

    // 로그인/로그아웃 상태 변화 감지
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        root.render(<React.StrictMode><App /></React.StrictMode>)
      } else if (event === 'SIGNED_OUT') {
        root.render(<AuthScreen />)
      }
    })

  } catch (e) {
    console.error('웹 API 초기화 실패:', e)
    const msg = e instanceof Error ? e.message : String(e)
    root.render(<ErrorScreen message={msg} />)
  }
}

bootstrap()
