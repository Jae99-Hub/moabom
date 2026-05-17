import React, { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'

export default function SettingsModal() {
  const { isSettingsOpen, closeSettings } = useStore()
  const [tmdbKey, setTmdbKey] = useState('')
  const [googleKey, setGoogleKey] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!isSettingsOpen) return
    window.api.settings.get('tmdb_api_key').then(setTmdbKey)
    window.api.settings.get('google_books_api_key').then(setGoogleKey)
  }, [isSettingsOpen])

  const handleSave = async () => {
    await window.api.settings.set('tmdb_api_key', tmdbKey.trim())
    await window.api.settings.set('google_books_api_key', googleKey.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleBackup = async () => {
    const result = await window.api.db.backup() as { success: boolean; path?: string }
    if (result.success) {
      if (result.path) alert(`백업 완료: ${result.path}`)
      else alert('백업 파일이 다운로드됐습니다.')
    }
  }

  const handleRestore = async () => {
    if (!window.confirm('복원하면 현재 데이터가 교체됩니다. 계속할까요?')) return
    const result = await window.api.db.restore() as { success: boolean; path?: string }
    if (result.success) {
      alert('복원 완료. 앱을 재시작(또는 새로고침)해 주세요.')
      if (!result.path) window.location.reload() // 웹 환경: 자동 새로고침
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
