import React, { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'

export default function Header() {
  const { filters, setFilter, theme, toggleTheme, openAddModal, openSettings, searchQuotes, clearQuoteSearch, toggleSidebar } = useStore()
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const mobileInputRef = useRef<HTMLInputElement>(null)

  const isQuoteMode = filters.searchMode === 'quote'

  useEffect(() => {
    if (mobileSearchOpen && mobileInputRef.current) {
      mobileInputRef.current.focus()
    }
  }, [mobileSearchOpen])

  const handleSearchChange = (val: string) => {
    setFilter('search', val)
    // 제목 모드에서도 명언 검색 병행 (결과를 필터에 활용)
    if (val.trim()) searchQuotes(val)
    else clearQuoteSearch()
  }

  const toggleSearchMode = () => {
    const next = isQuoteMode ? 'title' : 'quote'
    setFilter('searchMode', next)
    if (next === 'title') clearQuoteSearch()
    else if (filters.search.trim()) searchQuotes(filters.search)
  }

  const closeMobileSearch = () => {
    setMobileSearchOpen(false)
  }

  return (
    <header className={`header${mobileSearchOpen ? ' mobile-search-open' : ''}`}>

      {/* 모바일 전용: 검색 열렸을 때 오버레이 */}
      <div className="mobile-search-bar">
        <button className="btn-icon" onClick={closeMobileSearch} aria-label="닫기">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div className="header-search" style={{ flex: 1, maxWidth: 'none' }}>
          <svg className="header-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={mobileInputRef}
            type="text"
            placeholder={isQuoteMode ? '명언·문장 검색...' : '제목, 저자, ISBN 검색...'}
            value={filters.search}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
          <button
            className={`search-mode-toggle mobile-mode-toggle${isQuoteMode ? ' quote-mode' : ''}`}
            onClick={toggleSearchMode}
            title={isQuoteMode ? '제목 검색으로 전환' : '명언 검색으로 전환'}
          >
            {isQuoteMode ? '💬' : '📖'}
          </button>
        </div>
      </div>

      {/* 모바일 전용 햄버거 */}
      <button className="hamburger-btn" onClick={toggleSidebar} aria-label="메뉴">
        <span className="hamburger-line" />
        <span className="hamburger-line" />
        <span className="hamburger-line" />
      </button>

      <div className="header-logo">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <span className="header-logo-text">모아봄</span>
      </div>

      {/* 데스크탑 전용 검색 */}
      <div className="header-search desktop-search">
        <svg className="header-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder={isQuoteMode ? '명언·문장 검색...' : '제목, 저자, ISBN 검색...'}
          value={filters.search}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
        <button
          className={`search-mode-toggle${isQuoteMode ? ' quote-mode' : ''}`}
          onClick={toggleSearchMode}
          title={isQuoteMode ? '제목 검색으로 전환' : '명언 검색으로 전환'}
        >
          {isQuoteMode ? '💬 명언' : '📖 제목'}
        </button>
      </div>

      <div className="header-actions">
        {/* 모바일 전용 검색 트리거 */}
        <button className="btn-icon mobile-search-trigger" onClick={() => setMobileSearchOpen(true)} aria-label="검색">
          {filters.search ? (
            /* 검색어 있으면 활성 표시 */
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--accent)' }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          )}
        </button>

        <button className="btn-icon" onClick={toggleTheme} title={theme === 'dark' ? '라이트 모드' : '다크 모드'}>
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        <button className="btn-icon header-settings-btn" onClick={openSettings} title="설정">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        <button className="btn-primary" onClick={() => openAddModal()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="btn-primary-text">추가</span>
        </button>
      </div>
    </header>
  )
}
