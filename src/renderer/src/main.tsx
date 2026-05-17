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

async function bootstrap() {
  // Supabase 환경변수 없으면 그냥 로컬 SQLite로 실행
  if (!isSupabaseConfigured) {
    renderApp()
    return
  }

  // 저장된 세션 확인
  const { data: { session } } = await supabase.auth.getSession()

  if (session) {
    // 이미 로그인 → Supabase API로 전환 후 앱 시작
    await setupWebApi()
    renderApp()
  } else {
    // 비로그인 → 로그인 화면
    renderAuth()
  }

  // OAuth 콜백 처리 (main process → renderer)
  const authBridge = (window as unknown as { authBridge?: { onCallback: (cb: (url: string) => void) => void } }).authBridge
  authBridge?.onCallback(async (url: string) => {
    try {
      // moabom://auth-callback#access_token=...&refresh_token=...
      const fake = url.replace('moabom://', 'https://x/')
      const urlObj = new URL(fake)
      const params = new URLSearchParams(urlObj.hash.slice(1) || urlObj.search.slice(1))
      const access_token = params.get('access_token')
      const refresh_token = params.get('refresh_token')
      if (access_token && refresh_token) {
        const { data: { session } } = await supabase.auth.setSession({ access_token, refresh_token })
        if (session) {
          await setupWebApi()
          renderApp()
        }
      }
    } catch (e) {
      console.error('Auth callback 처리 실패:', e)
    }
  })

  // 인증 상태 변화 감지
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await setupWebApi()
      renderApp()
    } else if (event === 'SIGNED_OUT') {
      renderAuth()
    }
  })
}

bootstrap()
