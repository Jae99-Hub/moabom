import React, { useState, useEffect } from 'react'
import { useStorePick } from '../store/useStore'
import { confirmDialog, alertDialog, showToast } from '../store/dialogs'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { OtherScopeInfo, AutoBackupInfo } from '../types'

const isWebEnv =
  typeof import.meta.env.VITE_SUPABASE_URL === 'string' &&
  !!import.meta.env.VITE_SUPABASE_URL

type UpdateCheckState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'
type Tab = 'account' | 'general' | 'data'

/** moabom-auto-YYYY-MM-DD_HHMMSS.db → "YYYY-MM-DD HH:MM" */
function fmtBackupLabel(b: AutoBackupInfo): string {
  const m = b.name.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : b.name
}

/** ISO → "YYYY.M.D HH:MM" (짧게) */
function fmtWhen(iso: string): string {
  const d = new Date(iso)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function SettingsModal() {
  const { isSettingsOpen, closeSettings, syncStatus, setSyncStatus, triggerSync, openTour, fetchAll } =
    useStorePick('isSettingsOpen', 'closeSettings', 'syncStatus', 'setSyncStatus', 'triggerSync', 'openTour', 'fetchAll')

  const [activeTab, setActiveTab] = useState<Tab>('account')

  // 웹 전용 유저
  const [userEmail, setUserEmail] = useState('')
  const [userName, setUserName]   = useState('')

  // Electron 전용 유저
  const [electronEmail, setElectronEmail] = useState('')
  const [electronName, setElectronName]   = useState('')
  const [signingIn, setSigningIn]         = useState(false)
  useEscapeKey(closeSettings, isSettingsOpen)

  // 업데이트
  const [updateState, setUpdateState]     = useState<UpdateCheckState>('idle')
  const [updateVersion, setUpdateVersion] = useState('')
  const [updateProgress, setUpdateProgress] = useState(0)
  const [currentVersion, setCurrentVersion] = useState('')

  // 데이터 탭: 백업 / orphan 복구
  const [scope, setScope] = useState<OtherScopeInfo>({ loggedIn: false, anon: 0, otherAccount: 0 })
  const [autoBackups, setAutoBackups] = useState<AutoBackupInfo[]>([])
  const [backupStatus, setBackupStatus] = useState<{ lastAt: string; dir: string }>({ lastAt: '', dir: '' })
  const [busy, setBusy] = useState(false)

  const isElectron = !!window.updaterBridge

  // 데이터 탭 정보 로드 (스코프 카운트 + 자동 백업 목록/상태). 웹 빌드는 일부 API 미지원 → try/catch.
  const loadDataTab = (): void => {
    try { window.api.items.scopeInfo?.().then(setScope).catch(() => {}) } catch { /* 미지원 */ }
    if (isElectron) {
      try { window.api.backup.list().then(setAutoBackups).catch(() => {}) } catch { /* 미지원 */ }
      try { window.api.backup.status().then(setBackupStatus).catch(() => {}) } catch { /* 미지원 */ }
    }
  }
  useEffect(() => {
    if (isSettingsOpen && activeTab === 'data') loadDataTab()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSettingsOpen, activeTab])

  // ── 모달 열릴 때마다 ────────────────────────────────────────────────
  useEffect(() => {
    if (!isSettingsOpen) return
    setActiveTab('account')
    setUpdateState('idle')
    setUpdateVersion('')

    window.updaterBridge?.getVersion().then(setCurrentVersion).catch(() => {})

    // 웹 전용: 유저 정보 (Electron에서는 표시 안 함)
    if (isWebEnv && !isElectron) {
      import('../api/supabaseClient').then(({ supabase }) => {
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user) {
            setUserEmail(user.email ?? '')
            setUserName((user.user_metadata as Record<string, string>)?.full_name ?? '')
          }
        })
      }).catch(() => {})
    }

    // Electron 전용: 로그인 세션 확인
    if (isElectron) {
      import('../api/syncService').then(({ getElectronUser }) => {
        getElectronUser().then((user) => {
          setElectronEmail(user?.email ?? '')
          setElectronName(user?.name ?? '')
        }).catch(() => {})
      })
    }
  }, [isSettingsOpen])

  // ── 업데이트 이벤트 구독 (설정창이 열려 있는 동안만, 닫히면 해제) ──
  useEffect(() => {
    const b = window.updaterBridge
    if (!isSettingsOpen || !b) return
    const offs = [
      b.onAvailable((v) => { setUpdateVersion(v); setUpdateState('available') }),
      b.onNotAvailable(() => setUpdateState('not-available')),
      b.onError(() => setUpdateState('error')),
      b.onProgress((pct) => { setUpdateProgress(pct); setUpdateState('downloading') }),
      b.onDownloaded(() => setUpdateState('downloaded')),
    ]
    return () => offs.forEach((off) => off())
  }, [isSettingsOpen])

  // ── 로그인 실패 시 '대기 중...' 해제 ──────────────────────────────
  // 콜백 처리(토큰 교환)는 main.tsx 한 곳에서만 한다. 예전엔 여기서도 콜백을 등록해
  // main.tsx 것을 덮어쓰는 바람에 로그인 실패 안내가 뜨지 않았음.
  useEffect(() => {
    const onFailed = () => setSigningIn(false)
    window.addEventListener('moabom:auth-failed', onFailed)
    return () => window.removeEventListener('moabom:auth-failed', onFailed)
  }, [])

  // ── 핸들러 ──────────────────────────────────────────────────────────
  const handleBackup = async () => {
    try {
      const result = await window.api.db.backup() as { success: boolean; path?: string }
      if (result.success) void alertDialog(result.path ?? '백업 파일을 내려받았어요.', '백업했어요')
    } catch { void alertDialog('다시 시도해 주세요.', '백업하지 못했어요') }
  }

  const handleRestore = async () => {
    const ok = await confirmDialog({
      title: '백업 파일로 되돌릴까요?',
      message: '지금 기록이 고른 파일의 내용으로 바뀌어요.',
      confirmText: '되돌리기',
      danger: true,
    })
    if (!ok) return
    const result = await window.api.db.restore()
    if (result.success) {
      await alertDialog('화면을 새로 불러올게요.', '되돌렸어요')
      window.location.reload()
    } else if (result.error && result.error !== 'read-source') {
      void alertDialog('파일이 손상됐거나 모아봄 백업 파일이 아니에요. 지금 기록은 그대로예요.', '되돌리지 못했어요')
    }
  }

  // orphan 복구: 다른 스코프 항목을 현재 화면으로 불러오기 (사전 백업 후 실행)
  const handleImport = async (source: 'anon' | 'otherAccount') => {
    // 비로그인은 DB가 source 무시하고 계정 항목 전체를 불러오므로 표시 개수도 otherAccount 기준
    const count  = scope.loggedIn ? (source === 'anon' ? scope.anon : scope.otherAccount) : scope.otherAccount
    const target = scope.loggedIn ? '현재 계정' : '이 컴퓨터(로컬)'
    const warn = source === 'otherAccount'
      ? '\n다른 계정의 기록을 현재 계정으로 복사해요. 원래 계정의 기록은 그대로 남아요.' : ''
    const ok = await confirmDialog({
      title: `${count}개를 ${target}(으)로 불러올까요?`,
      message: `불러오기 전에 자동 백업을 만들어요.${warn}`,
      confirmText: '불러오기',
    })
    if (!ok) return
    setBusy(true)
    try {
      try { await window.api.backup?.run(true) } catch { /* 사전 스냅샷 best-effort */ }
      const { imported, skipped } = await window.api.items.importOtherScope(source)
      await fetchAll()
      if (scope.loggedIn) await triggerSync()
      loadDataTab()
      showToast(`${imported}개 불러왔어요.${skipped ? ` (${skipped}개는 이미 있어서 건너뛰었어요)` : ''}`)
    } finally {
      setBusy(false)
    }
  }

  const handleAutoBackupNow = async () => {
    setBusy(true)
    try {
      const r = await window.api.backup.run(true)
      showToast(r.success ? '백업했어요.' : '백업하지 못했어요. 다시 시도해 주세요.')
      loadDataTab()
    } finally {
      setBusy(false)
    }
  }

  const handleOpenBackupFolder = () => { window.api.backup.openFolder().catch(() => {}) }

  const handleChooseDir = async () => {
    setBusy(true)
    try {
      const r = await window.api.backup.chooseDir()
      if (r.success) { loadDataTab(); showToast('백업 폴더를 바꿨어요. 기존 백업도 새 폴더로 옮겼어요.') }
      else if (!r.canceled) void alertDialog('저장할 수 없는 폴더일 수 있어요. 다른 폴더를 골라 주세요.', '폴더를 바꾸지 못했어요')
    } finally { setBusy(false) }
  }

  const handleRestoreFrom = async (b: AutoBackupInfo) => {
    const extra = scope.loggedIn
      ? '\n로그인 상태라서, 다음 동기화 때 다른 기기의 최근 변경도 이 시점으로 돌아갈 수 있어요.' : ''
    const ok = await confirmDialog({
      title: `'${fmtBackupLabel(b)}' 시점으로 되돌릴까요?`,
      message: `지금 기록이 그 시점의 내용으로 바뀌어요.${extra}`,
      confirmText: '되돌리기',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await window.api.backup.restoreFrom(b.path)
      if (r.success) { await alertDialog('화면을 새로 불러올게요.', '되돌렸어요'); window.location.reload() }
      else void alertDialog('백업 파일이 손상됐거나 열 수 없어요. 지금 기록은 그대로예요.', '되돌리지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  const confirmSignOut = () => confirmDialog({
    title: '로그아웃할까요?',
    message: isElectron
      ? '이 컴퓨터의 기록은 그대로 남아요. 다시 로그인하면 이어서 동기화돼요.'
      : '다시 로그인하면 기록을 이어서 볼 수 있어요.',
    confirmText: '로그아웃',
  })

  const handleSignOut = async () => {
    if (!(await confirmSignOut())) return
    const { supabase, isSupabaseConfigured } = await import('../api/supabaseClient')
    if (!isSupabaseConfigured || !supabase) return
    await supabase.auth.signOut()
    window.location.reload()
  }

  const handleElectronSignIn = async () => {
    const { supabase, isSupabaseConfigured } = await import('../api/supabaseClient')
    if (!isSupabaseConfigured || !supabase || !window.authBridge) return
    setSigningIn(true)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:3000',
        queryParams: { prompt: 'select_account' },
        skipBrowserRedirect: true,
      }
    })
    if (error || !data.url) { setSigningIn(false); return }
    await window.authBridge.openExternal(data.url)
  }

  const handleElectronSignOut = async () => {
    if (!(await confirmSignOut())) return
    const { electronSignOut } = await import('../api/syncService')
    await electronSignOut()
    // setCurrentUser(null), renderAuth()는 onAuthStateChange SIGNED_OUT이 처리
    setElectronEmail(''); setElectronName(''); setSyncStatus('idle')
  }

  const handleWebSignIn = async () => {
    const { supabase, isSupabaseConfigured } = await import('../api/supabaseClient')
    if (!isSupabaseConfigured || !supabase) return
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } }
    })
  }

  const handleCheckUpdate = async () => {
    setUpdateState('checking')
    await window.updaterBridge?.checkForUpdates()
    setTimeout(() => setUpdateState((s) => s === 'checking' ? 'error' : s), 10000)
  }

  const syncStatusText = () => {
    switch (syncStatus) {
      case 'syncing': return '동기화 중...'
      case 'success': return '동기화 완료 ✓'
      case 'error':   return '동기화 오류 ⚠️'
      default:        return '다른 기기와 기록을 맞춰요'
    }
  }

  if (!isSettingsOpen) return null

  const TABS: { key: Tab; label: string }[] = [
    { key: 'account', label: '계정' },
    { key: 'general', label: '일반' },
    { key: 'data',    label: '데이터' },
  ]

  const backupStale = isElectron && (!backupStatus.lastAt || Date.now() - Date.parse(backupStatus.lastAt) > 8 * 864e5)

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeSettings()}>
      <div className="settings-modal">

        {/* ── 헤더 ── */}
        <div className="modal-header">
          <span className="modal-title">설정</span>
          <button className="btn-icon" onClick={closeSettings} aria-label="닫기" title="닫기">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── 탭 바 ── */}
        <div className="settings-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`settings-tab${activeTab === t.key ? ' active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── 탭 콘텐츠 ── */}
        <div className="settings-modal-body">

          {/* ────────── 계정 탭 ────────── */}
          {activeTab === 'account' && (
            <>
              {/* Electron 환경 */}
              {isElectron && (
                <>
                  {electronEmail ? (
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
                      <div className="settings-divider" />
                      <div className="settings-actions-row">
                        <div>
                          <div className="settings-group-label">클라우드 동기화</div>
                          <div className="settings-group-desc">{syncStatusText()}</div>
                        </div>
                        <button
                          className="btn-secondary"
                          style={{ flexShrink: 0 }}
                          onClick={triggerSync}
                          disabled={syncStatus === 'syncing'}
                        >
                          {syncStatus === 'syncing' ? '동기화 중...' : '지금 동기화'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="settings-anon-row">
                      <div className="settings-anon-info">
                        <div className="settings-group-label">비로그인 상태</div>
                        <div className="settings-group-desc">
                          {signingIn
                            ? '브라우저에서 로그인 중...'
                            : '로그인하면 여러 기기에서 데이터를 동기화할 수 있어요'}
                        </div>
                      </div>
                      <button
                        className="btn-primary settings-signin-btn"
                        onClick={handleElectronSignIn}
                        disabled={signingIn}
                      >
                        {signingIn ? '대기 중...' : 'Google 로그인'}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* 웹 환경 (Electron 아닐 때만) */}
              {!isElectron && isWebEnv && (
                <>
                  {userEmail || userName ? (
                    <div className="settings-user-row">
                      <div className="settings-user-avatar">
                        {(userName || userEmail).slice(0, 1).toUpperCase()}
                      </div>
                      <div className="settings-user-info">
                        {userName && <div className="settings-user-name">{userName}</div>}
                        <div className="settings-user-email">{userEmail}</div>
                      </div>
                      <button className="btn-secondary settings-signout-btn" onClick={handleSignOut}>
                        로그아웃
                      </button>
                    </div>
                  ) : (
                    <div className="settings-anon-row">
                      <div className="settings-anon-info">
                        <div className="settings-group-label">비로그인 상태</div>
                        <div className="settings-group-desc">기록이 이 브라우저에만 저장돼요</div>
                      </div>
                      <button className="btn-primary settings-signin-btn" onClick={handleWebSignIn}>
                        Google 로그인
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Electron도 아니고 웹도 아닌 경우 */}
              {!isElectron && !isWebEnv && (
                <div className="settings-group">
                  <div className="settings-group-desc" style={{ textAlign: 'center', padding: '24px 0' }}>
                    이 환경에서는 로그인을 쓸 수 없어요
                  </div>
                </div>
              )}
            </>
          )}

          {/* ────────── 일반 탭 ────────── */}
          {activeTab === 'general' && (
            <>
              {isElectron && (
                <>
                  <div className="settings-update-block">
                    <div className="settings-update-top">
                      <div>
                        <div className="settings-group-label">
                          업데이트 확인
                          {currentVersion && (
                            <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                              현재 v{currentVersion}
                            </span>
                          )}
                        </div>
                        <div className="settings-group-desc">
                          {updateState === 'idle'          && '새 버전이 나왔는지 확인해요'}
                          {updateState === 'checking'      && '서버에서 확인 중...'}
                          {updateState === 'available'     && `🎉 새 버전 v${updateVersion} 이 있어요!`}
                          {updateState === 'downloading'   && `다운로드 중... ${updateProgress}%`}
                          {updateState === 'downloaded'    && '✅ 다운로드 완료! 재시작하면 적용돼요'}
                          {updateState === 'not-available' && `✅ 최신 버전이에요 (v${currentVersion})`}
                          {updateState === 'error'         && '⚠️ 확인 중 오류가 발생했어요'}
                        </div>
                      </div>

                      {/* 상태별 버튼 */}
                      {(updateState === 'idle' || updateState === 'not-available' || updateState === 'error') && (
                        <button
                          className="btn-secondary"
                          style={{ flexShrink: 0 }}
                          onClick={handleCheckUpdate}
                        >
                          업데이트 확인
                        </button>
                      )}
                      {updateState === 'checking' && (
                        <button className="btn-secondary" style={{ flexShrink: 0 }} disabled>
                          확인 중...
                        </button>
                      )}
                      {updateState === 'available' && (
                        <button
                          className="btn-primary"
                          style={{ flexShrink: 0 }}
                          onClick={async () => {
                            setUpdateState('downloading')
                            setUpdateProgress(0)
                            await window.updaterBridge?.startDownload()
                          }}
                        >
                          다운로드
                        </button>
                      )}
                      {updateState === 'downloading' && (
                        <button className="btn-secondary" style={{ flexShrink: 0 }} disabled>
                          다운로드 중
                        </button>
                      )}
                      {updateState === 'downloaded' && (
                        <button
                          className="btn-primary"
                          style={{ flexShrink: 0 }}
                          onClick={() => window.updaterBridge?.install()}
                        >
                          지금 재시작
                        </button>
                      )}
                    </div>

                    {/* 다운로드 진행바 */}
                    {updateState === 'downloading' && (
                      <div className="settings-update-progress">
                        <div
                          className="settings-update-progress-fill"
                          style={{ width: `${updateProgress}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="settings-divider" />
                </>
              )}
              <div className="settings-actions-row">
                <div>
                  <div className="settings-group-label">사용법 다시 보기</div>
                  <div className="settings-group-desc">주요 기능 안내 투어를 다시 봐요</div>
                </div>
                <button
                  className="btn-secondary"
                  style={{ flexShrink: 0 }}
                  onClick={() => { closeSettings(); setTimeout(() => openTour(), 200) }}
                >
                  안내 보기
                </button>
              </div>
            </>
          )}

          {/* ────────── 데이터 탭 ────────── */}
          {activeTab === 'data' && (
            <>
              {/* orphan 복구: 다른 스코프 항목 불러오기 */}
              {scope.anon > 0 && (
                <div className="settings-actions-row">
                  <div>
                    <div className="settings-group-label">로그인 없이 추가한 항목 {scope.anon}개</div>
                    <div className="settings-group-desc">
                      이 기기에만 저장돼 있어요. {scope.loggedIn ? '현재 계정으로' : '이 컴퓨터로'} 불러올 수 있어요
                    </div>
                  </div>
                  <button className="btn-secondary" style={{ flexShrink: 0 }} disabled={busy} onClick={() => handleImport('anon')}>
                    불러오기
                  </button>
                </div>
              )}
              {scope.loggedIn && scope.otherAccount > 0 && (
                <div className="settings-actions-row">
                  <div>
                    <div className="settings-group-label">다른 계정 데이터 {scope.otherAccount}개</div>
                    <div className="settings-group-desc">이 컴퓨터에 남은 다른 계정 항목을 현재 계정으로 복제해요 (원본 유지)</div>
                  </div>
                  <button className="btn-secondary" style={{ flexShrink: 0, color: 'var(--accent)' }} disabled={busy} onClick={() => handleImport('otherAccount')}>
                    불러오기
                  </button>
                </div>
              )}
              {!scope.loggedIn && scope.otherAccount > 0 && (
                <div className="settings-actions-row">
                  <div>
                    <div className="settings-group-label">계정에 저장된 항목 {scope.otherAccount}개</div>
                    <div className="settings-group-desc">로그인 계정으로 저장돼 지금 안 보이는 항목을 이 컴퓨터에서 열람할 수 있게 해요</div>
                  </div>
                  <button className="btn-secondary" style={{ flexShrink: 0 }} disabled={busy} onClick={() => handleImport('anon')}>
                    불러오기
                  </button>
                </div>
              )}
              {(scope.anon > 0 || scope.otherAccount > 0) && <div className="settings-divider" />}

              {/* 자동 백업 (Electron 전용) */}
              {isElectron && (
                <>
                  <div className="settings-group">
                    <div className="settings-group-label">
                      자동 백업
                      {backupStale && <span style={{ color: 'var(--danger)', marginLeft: 8, fontSize: 12 }}>⚠️ 최근 백업 없음</span>}
                    </div>
                    <div className="settings-group-desc" style={{ marginTop: 2 }}>
                      최근 14일 보관 · 30분마다 자동 저장
                      {backupStatus.lastAt && <> · 마지막 {fmtWhen(backupStatus.lastAt)}</>}
                    </div>
                    {backupStatus.dir && (
                      <div
                        title={backupStatus.dir}
                        style={{
                          fontSize: 12, color: 'var(--text-muted)', marginTop: 8,
                          display: 'flex', alignItems: 'center', gap: 6,
                          background: 'var(--surface-2, rgba(127,127,127,0.08))',
                          padding: '6px 9px', borderRadius: 7
                        }}
                      >
                        <span style={{ flexShrink: 0 }}>📁</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{backupStatus.dir}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <button className="btn-secondary" disabled={busy} onClick={handleAutoBackupNow}>지금 백업</button>
                      <button className="btn-secondary" onClick={handleOpenBackupFolder}>폴더 열기</button>
                      <button className="btn-secondary" disabled={busy} onClick={handleChooseDir}>폴더 변경</button>
                    </div>
                  </div>

                  {autoBackups.length > 0 && (
                    <div className="settings-group" style={{ marginTop: 14 }}>
                      <div className="settings-group-desc" style={{ marginBottom: 6 }}>백업 시점에서 되돌리기</div>
                      <div style={{ maxHeight: 176, overflowY: 'auto' }}>
                        {autoBackups.map((b) => (
                          <div
                            key={b.name}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 2px', borderBottom: '1px solid var(--border)' }}
                          >
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fmtBackupLabel(b)}</span>
                            <button className="btn-secondary" style={{ padding: '4px 12px', flexShrink: 0 }} disabled={busy} onClick={() => handleRestoreFrom(b)}>
                              복원
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="settings-divider" />
                </>
              )}

              {/* 수동 파일 백업 / 복원 */}
              <div className="settings-actions-row">
                <div>
                  <div className="settings-group-label">파일로 백업</div>
                  <div className="settings-group-desc">전체 데이터를 원하는 위치에 .db 파일로 내보내기</div>
                </div>
                <button className="btn-secondary" style={{ flexShrink: 0 }} onClick={handleBackup}>
                  백업
                </button>
              </div>
              <div className="settings-actions-row">
                <div>
                  <div className="settings-group-label">파일에서 복원</div>
                  <div className="settings-group-desc">백업 .db 파일로 데이터 복원 (현재 데이터 교체)</div>
                </div>
                <button
                  className="btn-secondary"
                  style={{ flexShrink: 0, color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }}
                  onClick={handleRestore}
                >
                  복원
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── 푸터 ── */}
        <div className="modal-footer">
          <button className="btn-secondary" style={{ width: 80 }} onClick={closeSettings}>닫기</button>
        </div>
      </div>
    </div>
  )
}
