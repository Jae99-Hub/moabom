import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'

// 웹 환경인지 체크 (VITE_ 환경변수 존재 여부로 판단)
const isWebEnv = typeof import.meta.env.VITE_SUPABASE_URL === 'string' && !!import.meta.env.VITE_SUPABASE_URL

type UpdateCheckState = 'idle' | 'checking' | 'available' | 'not-available' | 'error'

export default function SettingsModal() {
  const { isSettingsOpen, closeSettings, syncStatus, setSyncStatus, triggerSync } = useStore()
  const [tmdbKey, setTmdbKey] = useState('')
  const [googleKey, setGoogleKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [userName, setUserName] = useState('')
  const [updateState, setUpdateState] = useState<UpdateCheckState>('idle')
  const [updateVersion, setUpdateVersion] = useState('')

  // Electron 로그인 상태
  const [electronEmail, setElectronEmail] = useState('')
  const [electronName, setElectronName] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const callbackRegistered = useRef(false)

  const isElectron = !!window.updaterBridge

  // ── 모달 열릴 때마다 실행 ────────────────────────────────────────
  useEffect(() => {
    if (!isSettingsOpen) return
    setUpdateState('idle')
    setUpdateVersion('')
    // updaterBridge 리스너 등록 (설정 모달이 열릴 때마다)
    if (window.updaterBridge) {
      window.updaterBridge.onAvailable((v) => { setUpdateVersion(v); setUpdateState('available') })
      window.updaterBridge.onNotAvailable(() => setUpdateState('not-available'))
      window.updaterBridge.onError(() => setUpdateState('error'))
    }
    window.api.settings.get('tmdb_api_key').then(setTmdbKey).catch(() => {})
    window.api.settings.get('google_books_api_key').then(setGoogleKey).catch(() => {})

    // 웹 환경에서만 유저 정보 로드
    if (isWebEnv) {
      import('../api/supabaseClient').then(({ supabase }) => {
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user) {
            setUserEmail(user.email ?? '')
            setUserName((user.user_metadata as Record<string, string>)?.full_name ?? '')
          }
        })
      }).catch(() => {})
    }

    // Electron: 기존 로그인 세션 확인
    if (isElectron) {
      import('../api/syncService').then(({ getElectronUser }) => {
        getElectronUser().then((user) => {
          setElectronEmail(user?.email ?? '')
          setElectronName(user?.name ?? '')
        }).catch(() => {})
      })
    }
  }, [isSettingsOpen])

  // ── 마운트 시 한 번: Electron OAuth 콜백 리스너 등록 ─────────────
  useEffect(() => {
    if (!isElectron || !window.authBridge || callbackRegistered.current) return
    callbackRegistered.current = true

    window.authBridge.onCallback(async (callbackUrl: string) => {
      try {
        const { supabase, isSupabaseConfigured } = await import('../api/supabaseClient')
        if (!isSupabaseConfigured || !supabase) return
        const code = new URL(callbackUrl.replace('moabom://', 'https://dummy.local/')).searchParams.get('code')
        if (!code) return
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) { setSigningIn(false); return }
        const { getElectronUser } = await import('../api/syncService')
        const user = await getElectronUser()
        setElectronEmail(user?.email ?? '')
        setElectronName(user?.name ?? '')
        setSigningIn(false)
        // 로그인 직후 초기 동기화
        triggerSync()
      } catch (err) {
        console.error('[Auth] 콜백 처리 오류:', err)
        setSigningIn(false)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async () => {
    try {
      await window.api.settings.set('tmdb_api_key', tmdbKey.trim())
      await window.api.settings.set('google_books_api_key', googleKey.trim())
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      alert('설정 저장에 실패했습니다. 다시 시도해주세요.')
    }
  }

  const handleBackup = async () => {
    try {
      const result = await window.api.db.backup() as { success: boolean; path?: string }
      if (result.success) {
        if (result.path) alert(`백업 완료: ${result.path}`)
        else alert('백업 파일이 다운로드됐습니다.')
      }
    } catch {
      alert('백업에 실패했습니다. 다시 시도해주세요.')
    }
  }

  const handleRestore = async () => {
    if (!window.confirm('복원하면 현재 데이터가 교체됩니다. 계속할까요?')) return
    const result = await window.api.db.restore() as { success: boolean; path?: string }
    if (result.success) {
      alert('복원 완료. 앱을 재시작(또는 새로고침)해 주세요.')
      if (!result.path) window.location.reload()
    } else {
      alert('복원에 실패했습니다. 파일 형식을 확인해주세요.')
    }
  }

  const handleSignOut = async () => {
    if (!window.confirm('로그아웃할까요?')) return
    const { supabase, isSupabaseConfigured } = await import('../api/supabaseClient')
    if (!isSupabaseConfigured || !supabase) return
    await supabase.auth.signOut()
    window.location.reload()
  }

  const handleCheckUpdate = async () => {
    setUpdateState('checking')
    await window.updaterBridge?.checkForUpdates()
    // 결과는 onAvailable / onNotAvailable / onError 콜백에서 처리
    // 10초 타임아웃
    setTimeout(() => {
      setUpdateState((s) => s === 'checking' ? 'error' : s)
    }, 10000)
  }

  const handleSignIn = async () => {
    const { supabase, isSupabaseConfigured } = await import('../api/supabaseClient')
    if (!isSupabaseConfigured || !supabase) return
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } }
    })
  }

  const handleElectronSignIn = async () => {
    const { supabase, isSupabaseConfigured } = await import('../api/supabaseClient')
    if (!isSupabaseConfigured || !supabase || !window.authBridge) return
    setSigningIn(true)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'moabom://auth/callback',
        queryParams: { prompt: 'select_account' },
        skipBrowserRedirect: true,
      }
    })
    if (error || !data.url) { setSigningIn(false); return }
    await window.authBridge.openExternal(data.url)
    // 결과는 onCallback 리스너에서 처리됨
  }

  const handleElectronSignOut = async () => {
    if (!window.confirm('로그아웃할까요?')) return
    const { electronSignOut } = await import('../api/syncService')
    await electronSignOut()
    setElectronEmail('')
    setElectronName('')
    setSyncStatus('idle')
  }

  const handleSync = async () => {
    await triggerSync()
  }

  const syncStatusText = () => {
    switch (syncStatus) {
      case 'syncing': return '동기화 중...'
      case 'success': return '동기화 완료 ✓'
      case 'error': return '동기화 오류 ⚠️'
      default: return '클라우드와 데이터를 동기화합니다'
    }
  }

  if (!isSettingsOpen) return null

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeSettings()}>
      <div className="settings-modal">
        <div className="modal-header">
          <span className="modal-title">설정</span>
          <button className="btn-icon" onClick={closeSettings}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-modal-body">
          {/* ── Electron 로그인 섹션 ── */}
          {isElectron && !electronEmail && (
            <>
              <div className="settings-anon-row">
                <div className="settings-anon-info">
                  <div className="settings-group-label">비로그인 상태</div>
                  <div className="settings-group-desc">
                    {signingIn ? '브라우저에서 로그인 중...' : '로그인하면 클라우드에 데이터를 백업할 수 있어요'}
                  </div>
                </div>
                <button
                  className="btn-secondary settings-signout-btn"
                  onClick={handleElectronSignIn}
                  disabled={signingIn}
                >
                  {signingIn ? '대기 중...' : 'Google 로그인'}
                </button>
              </div>
              <div className="settings-divider" />
            </>
          )}

          {isElectron && electronEmail && (
            <>
              <div className="settings-user-row">
                <div className="settings-user-avatar">
                  {(electronName || electronEmail).slice(0, 1).toUpperCase()}
                </div>
                <div className="settings-user-info">
                  {electronName && <div className="settings-user-name">{electronName}</div>}
                  <div className="settings-user-email">{electronEmail}</div>
                </div>
                <button className="btn-secondary settings-signout-btn" onClick={handleElectronSignOut}>
                  로그아웃
                </button>
              </div>
              <div className="settings-actions-row" style={{ marginTop: 8 }}>
                <div>
                  <div className="settings-group-label">클라우드 동기화</div>
                  <div className="settings-group-desc">{syncStatusText()}</div>
                </div>
                <button
                  className="btn-secondary"
                  style={{ flexShrink: 0 }}
                  onClick={handleSync}
                  disabled={syncStatus === 'syncing'}
                >
                  {syncStatus === 'syncing' ? '동기화 중...' : '지금 동기화'}
                </button>
              </div>
              <div className="settings-divider" />
            </>
          )}

          {/* 비로그인 상태 (웹 전용) */}
          {isWebEnv && !userEmail && !userName && (
            <>
              <div className="settings-anon-row">
                <div className="settings-anon-info">
                  <div className="settings-group-label">비로그인 상태</div>
                  <div className="settings-group-desc">데이터가 이 브라우저에만 저장됩니다</div>
                </div>
                <button className="btn-secondary settings-signout-btn" onClick={handleSignIn}>
                  Google 로그인
                </button>
              </div>
              <div className="settings-divider" />
            </>
          )}

          {/* 로그인 유저 정보 (웹 전용) */}
          {isWebEnv && (userEmail || userName) && (
            <>
              <div className="settings-user-row">
                <div className="settings-user-avatar">
                  {(userName || userEmail).slice(0, 1).toUpperCase()}
                </div>
                <div className="settings-user-info">
                  {userName && <div className="settings-user-name">{userName}</div>}
                  <div className="settings-user-email">{userEmail}</div>
                </div>
                <button
                  className="btn-secondary settings-signout-btn"
                  onClick={handleSignOut}
                >
                  로그아웃
                </button>
              </div>
              <div className="settings-divider" />
            </>
          )}

          <div className="settings-group">
            <div className="settings-group-label">TMDB API Key</div>
            <div className="settings-group-desc">영화·드라마 자동 검색에 사용 (기본 키 내장)</div>
            <input
              className="form-input"
              value={tmdbKey}
              onChange={(e) => setTmdbKey(e.target.value)}
              placeholder="비워두면 기본 키 사용"
              type="password"
            />
          </div>

          <div className="settings-group">
            <div className="settings-group-label">Google Books API Key</div>
            <div className="settings-group-desc">도서 자동 검색에 사용 (기본 키 내장)</div>
            <input
              className="form-input"
              value={googleKey}
              onChange={(e) => setGoogleKey(e.target.value)}
              placeholder="비워두면 기본 키 사용"
              type="password"
            />
          </div>

          <div className="settings-divider" />

          {/* 업데이트 확인 (Electron 전용) */}
          {isElectron && (
            <>
              <div className="settings-actions-row">
                <div>
                  <div className="settings-group-label">업데이트 확인</div>
                  <div className="settings-group-desc">
                    {updateState === 'idle' && '최신 버전을 확인합니다'}
                    {updateState === 'checking' && '확인 중...'}
                    {updateState === 'available' && `🎉 새 버전 v${updateVersion} 이 있어요! 하단 토스트에서 업데이트하세요.`}
                    {updateState === 'not-available' && '✅ 최신 버전이에요'}
                    {updateState === 'error' && '⚠️ 확인 중 오류가 발생했어요'}
                  </div>
                </div>
                <button
                  className="btn-secondary"
                  style={{ flexShrink: 0 }}
                  onClick={handleCheckUpdate}
                  disabled={updateState === 'checking'}
                >
                  {updateState === 'checking' ? '확인 중...' : '확인'}
                </button>
              </div>
              <div className="settings-divider" />
            </>
          )}

          <div className="settings-actions-row">
            <div>
              <div className="settings-group-label">데이터 백업</div>
              <div className="settings-group-desc">JSON 파일로 내보내기</div>
            </div>
            <button className="btn-secondary" style={{ flexShrink: 0 }} onClick={handleBackup}>백업</button>
          </div>

          <div className="settings-actions-row">
            <div>
              <div className="settings-group-label">데이터 복원</div>
              <div className="settings-group-desc">이전에 내보낸 JSON 파일로 복원</div>
            </div>
            <button
              className="btn-secondary"
              style={{ flexShrink: 0, color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }}
              onClick={handleRestore}
            >
              복원
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" style={{ width: 80 }} onClick={closeSettings}>닫기</button>
          <button className="btn-primary" style={{ minWidth: 80 }} onClick={handleSave}>
            {saved ? '저장됨 ✓' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
