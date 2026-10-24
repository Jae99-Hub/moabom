import React, { useState, useEffect, useRef } from 'react'
import { useStorePick } from '../store/useStore'
import { confirmDialog, alertDialog, showToast } from '../store/dialogs'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { startGoogleSignIn, signOutHere } from '../api/auth'
import { OtherScopeInfo, AutoBackupInfo } from '../types'
import { josa } from '../utils/korean'

const isWebEnv =
  typeof import.meta.env.VITE_SUPABASE_URL === 'string' &&
  !!import.meta.env.VITE_SUPABASE_URL

type UpdateCheckState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'

/** 되돌리기에 실패했을 때 보여 줄 문구 */
function restoreFailMessage(error?: string): string {
  if (error === 'snapshot-failed') return '되돌리기 전에 지금 기록을 백업하지 못해서 되돌리지 않았어요. 백업 폴더를 확인해 주세요.'
  if (error === 'swap-failed') return '되돌리는 도중에 문제가 생겼어요. 인터넷 연결을 확인하고 다시 시도해 주세요.'
  return '파일이 손상됐거나 모아봄 백업 파일이 아니에요. 지금 기록은 그대로예요.'
}

/** 읽기 쉬운 시각 — '오늘 오후 3:05', '어제 오전 9:10', '10월 3일 오후 1:00' (같은 분에 여러 개면 초까지) */
function friendlyTime(d: Date, withSeconds = false): string {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const same = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString()
  const p = (n: number): string => String(n).padStart(2, '0')
  const h = d.getHours()
  const time = `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${p(d.getMinutes())}${withSeconds ? `:${p(d.getSeconds())}` : ''}`
  const day = same(d, now) ? '오늘'
    : same(d, yesterday) ? '어제'
    : d.getFullYear() === now.getFullYear() ? `${d.getMonth() + 1}월 ${d.getDate()}일`
    : `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
  return `${day} ${time}`
}

/** moabom-auto-YYYY-MM-DD_HHMMSS(-N).db → 만든 시각 (이 컴퓨터 시간) */
function backupDate(b: AutoBackupInfo): Date | null {
  const m = b.name.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})/)
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null
}

function fmtBackupLabel(b: AutoBackupInfo, withSeconds = false): string {
  const d = backupDate(b)
  return d ? friendlyTime(d, withSeconds) : b.name
}

function fmtSize(bytes: number): string {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`
}

/** 한 줄 설정 — 왼쪽에 이름·설명, 오른쪽에 버튼 */
function Row({ label, desc, children, tone }: {
  label: React.ReactNode; desc?: React.ReactNode; children?: React.ReactNode; tone?: 'warn'
}) {
  return (
    <div className="st-row">
      <div className="st-row-text">
        <div className="st-row-label">{label}</div>
        {desc && <div className={`st-row-desc${tone === 'warn' ? ' warn' : ''}`}>{desc}</div>}
      </div>
      {children && <div className="st-row-actions">{children}</div>}
    </div>
  )
}

export default function SettingsModal() {
  const { isSettingsOpen, closeSettings, syncStatus, setSyncStatus, triggerSync, openTour, fetchAll, theme, toggleTheme } =
    useStorePick('isSettingsOpen', 'closeSettings', 'syncStatus', 'setSyncStatus', 'triggerSync', 'openTour', 'fetchAll', 'theme', 'toggleTheme')

  // 로그인한 계정 (데스크톱은 동기화 서비스, 웹은 Supabase에서 읽음)
  const [account, setAccount] = useState<{ email: string; name: string }>({ email: '', name: '' })
  const [signingIn, setSigningIn] = useState(false)
  useEscapeKey(closeSettings, isSettingsOpen)
  const modalRef = useRef<HTMLDivElement>(null)
  useFocusTrap(modalRef, isSettingsOpen)

  // 업데이트
  const [updateState, setUpdateState]     = useState<UpdateCheckState>('idle')
  const [updateVersion, setUpdateVersion] = useState('')
  const [updateProgress, setUpdateProgress] = useState(0)
  const [currentVersion, setCurrentVersion] = useState('')

  // 백업 / 다른 범위의 기록
  const [scope, setScope] = useState<OtherScopeInfo>({ loggedIn: false, anon: 0, otherAccount: 0 })
  const [autoBackups, setAutoBackups] = useState<AutoBackupInfo[]>([])
  // 되돌리기 목록·파일 관리는 자주 쓰지 않아 접어 둠 (예전엔 모두 펼쳐져 있어 백업 묶음이 정신없었음)
  const [showRestoreList, setShowRestoreList] = useState(false)
  const [showManage, setShowManage] = useState(false)
  const [backupStatus, setBackupStatus] = useState<{ lastAt: string; dir: string }>({ lastAt: '', dir: '' })
  const [busy, setBusy] = useState(false)

  const isElectron = !!window.updaterBridge

  // 기록 범위 개수 + 자동 백업 목록·상태
  const loadData = (): void => {
    window.api.items.scopeInfo().then(setScope).catch(() => {})
    if (isElectron) {
      window.api.backup.list().then(setAutoBackups).catch(() => {})
      window.api.backup.status().then(setBackupStatus).catch(() => {})
    }
  }

  // ── 열릴 때마다 ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSettingsOpen) return
    setUpdateState('idle')
    setUpdateVersion('')
    setShowRestoreList(false)
    setShowManage(false)
    setSigningIn(false)
    loadData()
    window.updaterBridge?.getVersion().then(setCurrentVersion).catch(() => {})

    if (isElectron) {
      import('../api/syncService').then(({ getElectronUser }) => getElectronUser())
        .then((user) => setAccount({ email: user?.email ?? '', name: user?.name ?? '' }))
        .catch(() => {})
    } else if (isWebEnv) {
      import('../api/supabaseClient').then(({ supabase }) => supabase.auth.getSession())
        .then(({ data: { session } }) => {
          const user = session?.user
          setAccount({ email: user?.email ?? '', name: (user?.user_metadata as Record<string, string> | undefined)?.full_name ?? '' })
        })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ── 로그인 실패 시 '기다리는 중' 해제 ──────────────────────────────
  // 콜백 처리(코드 교환)는 main.tsx 한 곳에서만 한다
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
      message: isElectron
        ? `지금 기록이 고른 파일의 내용으로 바뀌어요. 바꾸기 전 지금 기록은 자동 백업으로 남겨 둬요.${
            scope.loggedIn ? '\n로그인 상태라서, 다음 동기화 때 다른 기기의 기록도 이 시점으로 돌아가요.' : ''}`
        : '지금 기록이 고른 파일의 내용으로 바뀌어요. 바꾸기 전 지금 기록을 파일로 먼저 내려받아 둬요.',
      confirmText: '되돌리기',
      danger: true,
    })
    if (!ok) return
    const result = await window.api.db.restore()
    if (result.success) {
      await alertDialog('화면을 새로 불러올게요.', '되돌렸어요')
      window.location.reload()
    } else if (result.error && result.error !== 'read-source') {
      void alertDialog(restoreFailMessage(result.error), '되돌리지 못했어요')
    }
  }

  // 다른 범위의 기록을 지금 화면으로 불러오기 (데스크톱은 먼저 자동 백업)
  const handleImport = async (source: 'anon' | 'otherAccount') => {
    // 비로그인은 DB가 source 무시하고 계정 항목 전체를 불러오므로 표시 개수도 otherAccount 기준
    const count  = scope.loggedIn ? (source === 'anon' ? scope.anon : scope.otherAccount) : scope.otherAccount
    const target = scope.loggedIn ? '지금 계정' : '이 컴퓨터'
    const warn = source === 'otherAccount'
      ? '\n다른 계정의 기록을 지금 계정으로 복사해요. 원래 계정의 기록은 그대로 남아요.' : ''
    const ok = await confirmDialog({
      title: `${count}개를 ${target}${josa(target, '으로/로')} 불러올까요?`,
      message: isElectron
        ? `불러오기 전에 자동 백업을 만들어요.${warn}`
        : '옮긴 기록은 계정에 저장되고, 이 브라우저에서는 지워져요.',
      confirmText: '불러오기',
    })
    if (!ok) return
    setBusy(true)
    try {
      try { await window.api.backup?.run(true) } catch { /* 사전 스냅샷 best-effort */ }
      const { imported, skipped, failed } = await window.api.items.importOtherScope(source)
      await fetchAll()
      if (scope.loggedIn) await triggerSync()
      loadData()
      showToast(`${imported}개 불러왔어요.${skipped ? ` (${skipped}개는 이미 있어서 건너뛰었어요)` : ''}${
        failed ? ` ${failed}개는 옮기지 못해 그대로 남겨 뒀어요.` : ''}`)
    } finally {
      setBusy(false)
    }
  }

  const handleAutoBackupNow = async () => {
    setBusy(true)
    try {
      const r = await window.api.backup.run(true)
      showToast(r.success ? '백업했어요.' : '백업하지 못했어요. 다시 시도해 주세요.')
      loadData()
    } finally {
      setBusy(false)
    }
  }

  const handleOpenBackupFolder = () => { window.api.backup.openFolder().catch(() => {}) }

  const handleChooseDir = async () => {
    setBusy(true)
    try {
      const r = await window.api.backup.chooseDir()
      if (r.success) { loadData(); showToast('백업 폴더를 바꿨어요. 기존 백업도 새 폴더로 옮겼어요.') }
      else if (!r.canceled) void alertDialog('저장할 수 없는 폴더일 수 있어요. 다른 폴더를 골라 주세요.', '폴더를 바꾸지 못했어요')
    } finally { setBusy(false) }
  }

  const handleRestoreFrom = async (b: AutoBackupInfo) => {
    const extra = scope.loggedIn
      ? '\n로그인 상태라서, 다음 동기화 때 다른 기기의 기록도 이 시점으로 돌아가요.' : ''
    const ok = await confirmDialog({
      title: `'${fmtBackupLabel(b)}' 시점으로 되돌릴까요?`,
      message: `지금 기록이 그 시점의 내용으로 바뀌어요. 바꾸기 전 지금 기록은 자동 백업으로 남겨 둬요.${extra}`,
      confirmText: '되돌리기',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await window.api.backup.restoreFrom(b.path)
      if (r.success) { await alertDialog('화면을 새로 불러올게요.', '되돌렸어요'); window.location.reload() }
      else void alertDialog(restoreFailMessage(r.error), '되돌리지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  const handleSignIn = async () => {
    // 데스크톱: 브라우저에서 로그인이 끝나면 앱이 알아서 넘어감 (그동안 '기다리는 중')
    // 웹: 이 창이 Google 로그인으로 이동 — 뒤로 가기로 돌아오면 버튼이 멈춰 있지 않게 표시하지 않음
    if (window.authBridge) setSigningIn(true)
    const message = await startGoogleSignIn()
    if (message) { setSigningIn(false); void alertDialog(message, '로그인하지 못했어요') }
  }

  const handleSignOut = async () => {
    const ok = await confirmDialog({
      title: '로그아웃할까요?',
      message: isElectron
        ? '이 컴퓨터의 기록은 그대로 남아요. 다시 로그인하면 이어서 동기화돼요.'
        : '다시 로그인하면 기록을 이어서 볼 수 있어요.',
      confirmText: '로그아웃',
    })
    if (!ok) return
    await signOutHere()
    if (!isElectron) { window.location.reload(); return }
    // 데스크톱: 로그인 화면 전환은 onAuthStateChange SIGNED_OUT이 처리
    setAccount({ email: '', name: '' }); setSyncStatus('idle')
  }

  const handleCheckUpdate = async () => {
    setUpdateState('checking')
    await window.updaterBridge?.checkForUpdates()
    setTimeout(() => setUpdateState((s) => s === 'checking' ? 'error' : s), 10000)
  }

  if (!isSettingsOpen) return null

  const loggedIn = !!account.email
  const backupStale = isElectron && (!backupStatus.lastAt || Date.now() - Date.parse(backupStatus.lastAt) > 8 * 864e5)
  // 같은 분에 만든 백업이 있으면 그것들만 초까지 보여 구별
  const minuteLabels = autoBackups.map((b) => fmtBackupLabel(b))
  const backupLabel = (b: AutoBackupInfo, i: number): string =>
    minuteLabels.filter((l) => l === minuteLabels[i]).length > 1 ? fmtBackupLabel(b, true) : minuteLabels[i]
  const hasOtherScope = scope.anon > 0 || scope.otherAccount > 0

  const syncText = {
    syncing: '맞추는 중…',
    success: '모든 기록이 맞춰져 있어요',
    error: '아직 맞추지 못한 기록이 있어요. 잠시 뒤 다시 시도해요',
    idle: '다른 기기와 기록을 맞춰요',
  }[syncStatus]

  const updateText = {
    idle: '새 버전이 나왔는지 확인해요',
    checking: '확인하는 중…',
    available: `새 버전 ${updateVersion}${josa(updateVersion, '이/가')} 있어요`,
    downloading: `내려받는 중… ${updateProgress}%`,
    downloaded: '내려받았어요. 다시 시작하면 바뀌어요',
    'not-available': '최신 버전이에요',
    error: '확인하지 못했어요. 잠시 뒤 다시 시도해 주세요',
  }[updateState]

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeSettings()}>
      <div className="st-modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="설정">
        <div className="st-header">
          <span className="modal-title">설정</span>
          <button className="btn-icon" onClick={closeSettings} aria-label="닫기" title="닫기">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="st-body">
          {/* ── 계정 ── */}
          {(isElectron || isWebEnv) && (
            <section className="st-section">
              <h3 className="st-section-title">계정</h3>
              <div className="st-card">
                {loggedIn ? (
                  <>
                    <div className="st-row">
                      <div className="st-avatar" aria-hidden="true">{(account.name || account.email).slice(0, 1).toUpperCase()}</div>
                      <div className="st-row-text">
                        <div className="st-row-label">{account.name || account.email}</div>
                        {account.name && <div className="st-row-desc">{account.email}</div>}
                      </div>
                      <div className="st-row-actions">
                        <button className="st-btn subtle" onClick={handleSignOut}>로그아웃</button>
                      </div>
                    </div>
                    {isElectron && (
                      <Row
                        label={<><span className={`st-dot ${syncStatus}`} aria-hidden="true" />클라우드 동기화</>}
                        desc={syncText}
                        tone={syncStatus === 'error' ? 'warn' : undefined}
                      >
                        <button className="st-btn" onClick={() => { void triggerSync() }} disabled={syncStatus === 'syncing'}>
                          {syncStatus === 'syncing' ? '맞추는 중…' : '지금 동기화'}
                        </button>
                      </Row>
                    )}
                  </>
                ) : (
                  <Row
                    label="로그인하지 않았어요"
                    desc={signingIn
                      ? '브라우저에서 로그인을 마쳐 주세요'
                      : isElectron
                        ? '로그인하면 여러 기기에서 기록을 함께 볼 수 있어요'
                        : '지금 기록은 이 브라우저에만 저장돼요'}
                  >
                    <button className="st-btn primary" onClick={handleSignIn} disabled={signingIn}>
                      {signingIn ? '기다리는 중…' : 'Google로 로그인'}
                    </button>
                  </Row>
                )}
              </div>
            </section>
          )}

          {/* ── 불러올 기록 (다른 범위에 남은 기록이 있을 때만) ── */}
          {hasOtherScope && (
            <section className="st-section">
              <h3 className="st-section-title">불러올 기록</h3>
              <div className="st-card">
                {scope.anon > 0 && (
                  <Row
                    label={`로그인 없이 쓴 기록 ${scope.anon}개`}
                    desc={`이 ${isElectron ? '컴퓨터' : '브라우저'}에만 있어요. ${scope.loggedIn ? '지금 계정으로' : '이 컴퓨터로'} 불러올 수 있어요`}
                  >
                    <button className="st-btn" disabled={busy} onClick={() => handleImport('anon')}>불러오기</button>
                  </Row>
                )}
                {scope.loggedIn && scope.otherAccount > 0 && (
                  <Row label={`다른 계정의 기록 ${scope.otherAccount}개`} desc="이 컴퓨터에 남은 다른 계정의 기록을 지금 계정으로 복사해요 (원본은 그대로)">
                    <button className="st-btn" disabled={busy} onClick={() => handleImport('otherAccount')}>불러오기</button>
                  </Row>
                )}
                {!scope.loggedIn && scope.otherAccount > 0 && (
                  <Row label={`계정에 저장된 기록 ${scope.otherAccount}개`} desc="로그인하지 않은 지금도 이 컴퓨터에서 볼 수 있게 해요">
                    <button className="st-btn" disabled={busy} onClick={() => handleImport('anon')}>불러오기</button>
                  </Row>
                )}
              </div>
            </section>
          )}

          {/* ── 백업 ── */}
          <section className="st-section">
            <h3 className="st-section-title">백업</h3>
            <div className="st-card">
              {isElectron && (
                <>
                  <Row
                    label="자동 백업"
                    desc={backupStale
                      ? '최근 백업이 없어요. 지금 한 번 백업해 두세요'
                      : backupStatus.lastAt
                        ? `마지막 백업 ${friendlyTime(new Date(backupStatus.lastAt))} · 기록이 바뀌면 30분마다 만들어요`
                        : '기록이 바뀌면 30분마다 만들어요'}
                    tone={backupStale ? 'warn' : undefined}
                  >
                    <button className="st-btn" disabled={busy} onClick={handleAutoBackupNow}>지금 백업</button>
                  </Row>
                  {autoBackups.length > 0 && (
                    <div className="st-row st-row-block">
                      <div className="st-row-inline">
                        <div className="st-row-text">
                          <div className="st-row-label">이전 시점으로 되돌리기</div>
                          <div className="st-row-desc">백업 {autoBackups.length}개</div>
                        </div>
                        <div className="st-row-actions">
                          <button className="st-btn" onClick={() => setShowRestoreList((v) => !v)} aria-expanded={showRestoreList}>
                            {showRestoreList ? '닫기' : '고르기'}
                          </button>
                        </div>
                      </div>
                      {showRestoreList && (
                        <>
                          <ul className="st-list st-list-scroll">
                            {autoBackups.map((b, i) => (
                              <li key={b.name} className="st-list-item">
                                <span className="st-list-main">{backupLabel(b, i)}</span>
                                <span className="st-list-sub">{fmtSize(b.size)}</span>
                                <button className="st-btn small" disabled={busy} onClick={() => handleRestoreFrom(b)}>되돌리기</button>
                              </li>
                            ))}
                          </ul>
                          <div className="st-row-desc">고른 시점의 기록으로 바뀌어요. 바꾸기 전 지금 기록은 자동으로 백업해요</div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
              {/* 폴더·파일 관리는 자주 쓰지 않아 접어 둠 (웹은 이 두 줄뿐이라 그대로 보임) */}
              {(showManage || !isElectron) && (
                <>
                  {isElectron && (
                    <Row label="백업 폴더" desc={<span className="st-path" title={backupStatus.dir}>{backupStatus.dir || '…'}</span>}>
                      <button className="st-btn" onClick={handleOpenBackupFolder}>열기</button>
                      <button className="st-btn" disabled={busy} onClick={handleChooseDir}>바꾸기</button>
                    </Row>
                  )}
                  <Row label="파일로 내보내기" desc={`모든 기록을 ${isElectron ? '.db' : '.json'} 파일 하나로 저장해요`}>
                    <button className="st-btn" onClick={handleBackup}>내보내기</button>
                  </Row>
                  <Row label="파일에서 되돌리기" desc={`내보낸 ${isElectron ? '.db' : '.json'} 파일의 기록으로 바꿔요`}>
                    <button className="st-btn danger" onClick={handleRestore}>파일 고르기</button>
                  </Row>
                </>
              )}
              {isElectron && (
                <button className="st-disclosure" onClick={() => setShowManage((v) => !v)} aria-expanded={showManage}>
                  {showManage ? '접기' : '백업 폴더·파일 관리'}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    style={{ transform: showManage ? 'rotate(180deg)' : undefined }} aria-hidden="true">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              )}
            </div>
          </section>

          {/* ── 앱 ── */}
          <section className="st-section">
            <h3 className="st-section-title">앱</h3>
            <div className="st-card">
              <Row label="화면">
                <div className="st-segment" role="group" aria-label="화면 밝기">
                  <button className={theme === 'light' ? 'active' : ''} aria-pressed={theme === 'light'} onClick={() => theme !== 'light' && toggleTheme()}>밝게</button>
                  <button className={theme === 'dark' ? 'active' : ''} aria-pressed={theme === 'dark'} onClick={() => theme !== 'dark' && toggleTheme()}>어둡게</button>
                </div>
              </Row>
              {isElectron && (
                <div className="st-row st-row-block">
                  <div className="st-row-inline">
                    <div className="st-row-text">
                      <div className="st-row-label">버전 {currentVersion}</div>
                      <div className={`st-row-desc${updateState === 'error' ? ' warn' : ''}`}>{updateText}</div>
                    </div>
                    <div className="st-row-actions">
                      {updateState === 'available' ? (
                        <button className="st-btn primary" onClick={async () => {
                          setUpdateState('downloading')
                          setUpdateProgress(0)
                          await window.updaterBridge?.startDownload()
                        }}>내려받기</button>
                      ) : updateState === 'downloaded' ? (
                        <button className="st-btn primary" onClick={() => window.updaterBridge?.install()}>다시 시작</button>
                      ) : (
                        <button className="st-btn" onClick={handleCheckUpdate} disabled={updateState === 'checking' || updateState === 'downloading'}>
                          {updateState === 'checking' ? '확인 중…' : updateState === 'downloading' ? '내려받는 중' : '업데이트 확인'}
                        </button>
                      )}
                    </div>
                  </div>
                  {updateState === 'downloading' && (
                    <div className="st-progress" role="progressbar" aria-valuenow={updateProgress} aria-valuemin={0} aria-valuemax={100}>
                      <div style={{ width: `${updateProgress}%` }} />
                    </div>
                  )}
                </div>
              )}
              <Row label="사용법 다시 보기" desc="주요 기능을 차례로 안내해요">
                <button className="st-btn" onClick={() => { closeSettings(); setTimeout(() => openTour(), 200) }}>보기</button>
              </Row>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
