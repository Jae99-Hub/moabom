import React, { useState } from 'react'
import { startGoogleSignIn, detectInAppBrowser, externalBrowserUrl } from '../api/auth'

interface Props {
  onContinueAnonymous?: () => void
}

export default function AuthScreen({ onContinueAnonymous }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inApp = window.authBridge ? null : detectInAppBrowser()
  const openOutside = inApp ? externalBrowserUrl(inApp, window.location.href) : null

  const signInWithGoogle = async () => {
    setLoading(true)
    setError('')
    const message = await startGoogleSignIn()
    if (message) setError(message)
    // 데스크톱: 로그인은 브라우저에서 이어지고 끝나면 앱이 알아서 넘어감 / 웹: 성공하면 Google 페이지로 이동
    if (message || window.authBridge) setLoading(false)
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
        <p className="auth-subtitle">책 · 영화 · 드라마 · 다큐를 한 곳에서</p>

        {inApp && (
          // 카카오톡·인스타그램 등 앱 안에서 연 화면은 Google이 로그인을 막아 둠 → 바깥 브라우저로 안내
          <div className="auth-inapp" role="note">
            <strong>이 화면에서는 Google 로그인이 막혀 있어요</strong>
            <span>
              {openOutside
                ? 'Chrome·Safari 같은 브라우저로 열면 로그인할 수 있어요.'
                : '오른쪽 위(또는 아래)의 ⋯ 메뉴에서 “Safari로 열기” 또는 “다른 브라우저로 열기”를 눌러 주세요.'}
            </span>
            {openOutside && <a className="auth-inapp-btn" href={openOutside}>브라우저로 열기</a>}
          </div>
        )}

        <button
          className="auth-google-btn"
          onClick={signInWithGoogle}
          disabled={loading}
        >
          {loading ? (
            <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
          ) : (
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
          )}
          {loading ? '로그인 중...' : 'Google로 계속하기'}
        </button>

        {error && (
          <div className="auth-error" role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        <p className="auth-notice">
          로그인하면 여러 기기에서 기록을 함께 볼 수 있어요
        </p>

        {onContinueAnonymous && (
          <>
            <button className="auth-anon-btn" onClick={onContinueAnonymous}>
              로그인 없이 계속하기
            </button>
            <p className="auth-anon-note">
              {window.authBridge
                ? '로그인 없이 쓴 기록은 이 컴퓨터에만 저장돼요.'
                : '로그인 없이 쓴 기록은 이 브라우저에만 저장돼요. 방문 기록을 지우면 함께 사라질 수 있어요.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
