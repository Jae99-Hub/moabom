import React, { useState } from 'react'
import { supabase } from '../api/supabaseClient'

interface Props {
  onContinueAnonymous?: () => void
  isElectron?: boolean
}

export default function AuthScreen({ onContinueAnonymous, isElectron }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const signInWithGoogle = async () => {
    setLoading(true)
    setError('')

    if (isElectron) {
      // Electron: 웹 URL로 받아서 web→moabom:// 릴레이 방식 사용
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'https://moabom-app.vercel.app?from=electron',
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' }
        }
      })
      if (error) { setError(error.message); setLoading(false); return }
      if (data.url) {
        const bridge = (window as unknown as { authBridge?: { openExternal: (url: string) => Promise<void> } }).authBridge
        try {
          await bridge?.openExternal(data.url)
        } catch {
          setError('브라우저 열기에 실패했습니다. 직접 로그인 링크를 열어주세요.')
        }
      }
      // 로그인 완료는 main process → auth:callback IPC로 처리됨
      setLoading(false)
      return
    }

    // 웹: 기존 방식
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: 'select_account' }
      }
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // 성공 시 Google 페이지로 리다이렉트됨
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </div>

        <h1 className="auth-title">모아봄</h1>
        <p className="auth-subtitle">책 · 영화 · 드라마를 한 곳에서</p>

        <button
          className="auth-google-btn"
          onClick={signInWithGoogle}
          disabled={loading}
        >
          {loading ? (
            <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
          ) : (
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
          )}
          {loading ? '로그인 중...' : 'Google로 계속하기'}
        </button>

        {error && (
          <div className="auth-error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        <p className="auth-notice">
          로그인하면 어떤 기기에서도 데이터가 동기화됩니다
        </p>

        {onContinueAnonymous && (
          <button className="auth-anon-btn" onClick={onContinueAnonymous}>
            로그인 없이 계속하기
          </button>
        )}
      </div>
    </div>
  )
}
