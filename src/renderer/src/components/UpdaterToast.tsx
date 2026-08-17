import React, { useEffect, useState } from 'react'

type Phase = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error'

export default function UpdaterToast() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [version, setVersion] = useState('')
  const [progress, setProgress] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const bridge = window.updaterBridge
    if (!bridge) return

    bridge.onAvailable((v) => { setVersion(v); setPhase('available') })
    bridge.onProgress((pct) => { setProgress(pct); setPhase('downloading') })
    bridge.onDownloaded(() => setPhase('downloaded'))
    bridge.onError(() => setPhase('error')) // 실패 시 '다운로드 중'에 영원히 머무는 것 방지
  }, [])

  async function handleDownload() {
    setPhase('downloading')
    setProgress(0)
    await window.updaterBridge?.startDownload()
  }

  async function handleInstall() {
    await window.updaterBridge?.install()
  }

  if (phase === 'idle' || dismissed) return null

  return (
    <div style={styles.wrap}>
      <div style={styles.toast}>
        {/* 아이콘 */}
        <div style={styles.iconWrap}>
          {phase === 'downloading' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1.2s linear infinite' }}>
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          ) : phase === 'downloaded' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
        </div>

        {/* 내용 */}
        <div style={styles.body}>
          {phase === 'available' && (
            <>
              <p style={styles.title}>새 버전 출시 <span style={styles.version}>v{version}</span></p>
              <p style={styles.sub}>업데이트를 다운로드할까요?</p>
            </>
          )}
          {phase === 'downloading' && (
            <>
              <p style={styles.title}>다운로드 중... <span style={styles.pct}>{progress}%</span></p>
              <div style={styles.track}>
                <div style={{ ...styles.fill, width: `${progress}%` }} />
              </div>
            </>
          )}
          {phase === 'downloaded' && (
            <>
              <p style={styles.title}>다운로드 완료 ✓</p>
              <p style={styles.sub}>재시작하면 업데이트가 적용돼요</p>
            </>
          )}
          {phase === 'error' && (
            <>
              <p style={styles.title}>다운로드 실패 ⚠️</p>
              <p style={styles.sub}>네트워크 확인 후 다시 시도해 주세요</p>
            </>
          )}
        </div>

        {/* 버튼 */}
        <div style={styles.actions}>
          {phase === 'available' && (
            <>
              <button style={styles.btnPrimary} onClick={handleDownload}>다운로드</button>
              <button style={styles.btnGhost} onClick={() => setDismissed(true)}>나중에</button>
            </>
          )}
          {phase === 'downloading' && (
            <button style={{ ...styles.btnGhost, opacity: 0.5, cursor: 'not-allowed' }} disabled>
              다운로드 중
            </button>
          )}
          {phase === 'downloaded' && (
            <>
              <button style={styles.btnSuccess} onClick={handleInstall}>지금 재시작</button>
              <button style={styles.btnGhost} onClick={() => setDismissed(true)}>나중에</button>
            </>
          )}
          {phase === 'error' && (
            <>
              <button style={styles.btnPrimary} onClick={handleDownload}>다시 시도</button>
              <button style={styles.btnGhost} onClick={() => setDismissed(true)}>닫기</button>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    zIndex: 9999,
    animation: 'slideUp 0.3s ease',
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'var(--bg-card, #1e2130)',
    border: '1px solid var(--border, rgba(255,255,255,0.08))',
    borderRadius: 14,
    padding: '14px 16px',
    minWidth: 320,
    maxWidth: 380,
    boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
  },
  iconWrap: {
    flexShrink: 0,
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'var(--accent-soft, rgba(99,102,241,0.15))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--accent, #818cf8)',
  },
  body: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  title: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-primary, #e8e8e8)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  sub: {
    margin: 0,
    fontSize: 12,
    color: 'var(--text-muted, #888)',
  },
  version: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--accent, #818cf8)',
    background: 'var(--accent-soft, rgba(99,102,241,0.12))',
    padding: '1px 7px',
    borderRadius: 99,
  },
  pct: {
    fontSize: 13,
    fontWeight: 800,
    color: 'var(--accent, #818cf8)',
    marginLeft: 'auto',
  },
  track: {
    height: 5,
    borderRadius: 99,
    background: 'var(--border, rgba(255,255,255,0.08))',
    overflow: 'hidden',
    marginTop: 2,
  },
  fill: {
    height: '100%',
    borderRadius: 99,
    background: 'linear-gradient(90deg, var(--accent, #6366f1), #a78bfa)',
    transition: 'width 0.3s ease',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flexShrink: 0,
  },
  btnPrimary: {
    padding: '7px 14px',
    borderRadius: 99,
    border: 'none',
    background: 'var(--accent, #6366f1)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  btnSuccess: {
    padding: '7px 14px',
    borderRadius: 99,
    border: 'none',
    background: 'linear-gradient(135deg, #10b981, #059669)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  btnGhost: {
    padding: '6px 14px',
    borderRadius: 99,
    border: '1px solid var(--border, rgba(255,255,255,0.1))',
    background: 'transparent',
    color: 'var(--text-muted, #888)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
}
