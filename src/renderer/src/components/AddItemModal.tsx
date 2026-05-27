import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { ItemFormData, ItemType, ItemStatus, GoogleBookResult, TmdbResult } from '../types'
import StarRating from './StarRating'
import ImageCropModal from './ImageCropModal'
import GenreTagInput from './GenreTagInput'

const DEFAULT_FORM: ItemFormData = {
  title: '', original_title: '', item_type: 'book',
  cover_path: null, backdrop_path: null,
  author: '', publisher: '', isbn: '', page_count: null, current_page: 0,
  director: '', platform: '',
  tmdb_id: null, google_books_id: null,
  genre: '', year: null, overview: '',
  rating: null, status: 'want', review: '', read_date: ''
}

// editingItem → ItemFormData 변환 (useState 초기화 & useEffect 공용)
function buildEditForm(item: NonNullable<ReturnType<typeof useStore>['editingItem']>): ItemFormData {
  return {
    title: item.title,
    original_title: item.original_title ?? '',
    item_type: item.item_type as ItemType,
    cover_path: item.cover_path,
    backdrop_path: item.backdrop_path,
    author: item.author ?? '',
    publisher: item.publisher ?? '',
    isbn: item.isbn ?? '',
    page_count: item.page_count,
    current_page: item.current_page ?? 0,
    director: item.director ?? '',
    platform: item.platform ?? '',
    tmdb_id: item.tmdb_id,
    google_books_id: item.google_books_id,
    genre: item.genre ?? '',
    year: item.year,
    overview: item.overview ?? '',
    rating: item.rating,
    status: item.status as ItemStatus,
    review: item.review ?? '',
    read_date: item.read_date ?? ''
  }
}

// 최근 사용 장르 추천
function useRecentGenres(): string[] {
  const { itemList } = useStore()
  const seen = new Set<string>()
  const result: string[] = []
  const sorted = [...itemList].sort((a, b) => b.id - a.id)
  for (const item of sorted) {
    if (!item.genre) continue
    for (const g of item.genre.split(',').map((p) => p.trim()).filter(Boolean)) {
      if (!seen.has(g)) { seen.add(g); result.push(g) }
      if (result.length >= 6) return result
    }
  }
  return result
}

export default function AddItemModal() {
  const { isAddModalOpen, editingItem, closeAddModal, addItem, updateItem, selectItem, filters, itemList } = useStore()

  // editingItem이 있으면 첫 렌더부터 올바른 값으로 시작 (중간 빈 렌더 방지)
  const [form, setForm] = useState<ItemFormData>(() =>
    editingItem ? buildEditForm(editingItem) : DEFAULT_FORM
  )
  const [activeTab, setActiveTab] = useState<'info' | 'record'>('info')
  const [searchQuery, setSearchQuery] = useState('')
  const [bookResults, setBookResults] = useState<GoogleBookResult[]>([])
  const [tmdbResults, setTmdbResults] = useState<TmdbResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [cropImagePath, setCropImagePath] = useState<string | null>(null)
  const [suggestedGenres, setSuggestedGenres] = useState<string[]>([])

  const recentGenres = useRecentGenres()
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isAddModalOpen) return
    setActiveTab('info')
    setSearchQuery('')
    setBookResults([])
    setTmdbResults([])
    setSearchError('')
    setSuggestedGenres([])
    if (editingItem) {
      setForm(buildEditForm(editingItem))
    } else {
      const defaultType: ItemType =
        filters.type !== 'all'
          ? (filters.type as ItemType)
          : ([...itemList].sort((a, b) => b.id - a.id)[0]?.item_type as ItemType | undefined) ?? 'book'
      setForm({ ...DEFAULT_FORM, item_type: defaultType })
    }
    setTimeout(() => searchInputRef.current?.focus(), 80)
  }, [isAddModalOpen, editingItem])

  const switchType = (newType: ItemType) => {
    setForm((p) => ({
      ...p, item_type: newType,
      author: '', publisher: '', isbn: '', page_count: null, current_page: 0,
      director: '', platform: '', google_books_id: null, tmdb_id: null,
    }))
    setSearchQuery('')
    setBookResults([])
    setTmdbResults([])
    setSearchError('')
    setSuggestedGenres([])
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setIsSearching(true)
    setBookResults([])
    setTmdbResults([])
    setSearchError('')
    try {
      if (form.item_type === 'book') {
        const r = await window.api.books.search(searchQuery)
        if (r.length === 0) setSearchError('검색 결과가 없습니다.')
        else setBookResults(r)
      } else {
        const r = await window.api.tmdb.search(searchQuery)
        if (r.length === 0) setSearchError('검색 결과가 없습니다.')
        else setTmdbResults(r)
      }
    } catch (e) {
      setSearchError(`검색 오류: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setIsSearching(false)
    }
  }

  const applyBook = (r: GoogleBookResult) => {
    if (r.genre) setSuggestedGenres(r.genre.split(',').map((g) => g.trim()).filter(Boolean))
    setForm((p) => ({
      ...p,
      title: r.title, original_title: r.original_title, item_type: 'book',
      author: r.author, publisher: r.publisher, isbn: r.isbn,
      page_count: r.page_count, year: r.year ? parseInt(r.year) : null,
      overview: r.overview, cover_path: r.cover_path,
      google_books_id: r.google_books_id
    }))
    setBookResults([])
    setSearchError('')
  }

  const applyTmdb = (r: TmdbResult) => {
    if (r.genre) setSuggestedGenres(r.genre.split(',').map((g) => g.trim()).filter(Boolean))
    setForm((p) => ({
      ...p,
      title: r.title, original_title: r.original_title,
      item_type: r.item_type as ItemType, director: r.director,
      year: r.year ? parseInt(r.year) : null,
      overview: r.overview, cover_path: r.cover_path,
      backdrop_path: r.backdrop_path, tmdb_id: r.tmdb_id
    }))
    setTmdbResults([])
    setSearchError('')
  }

  const handleResetSearch = () => {
    setForm((p) => ({
      ...DEFAULT_FORM, item_type: p.item_type,
      status: p.status, review: p.review, read_date: p.read_date, rating: p.rating,
    }))
    setSuggestedGenres([])
    setSearchQuery('')
  }

  const handlePickImage = async () => {
    const path = await window.api.image.pick()
    if (path) setCropImagePath(path)
  }

  const handleCropDone = async (base64: string) => {
    const savedPath = await window.api.image.saveCropped(base64, form.title || 'cover')
    setForm((p) => ({ ...p, cover_path: savedPath }))
    setCropImagePath(null)
  }

  const handleSubmit = async () => {
    if (!form.title.trim()) { setActiveTab('info'); return }
    setIsSaving(true)
    try {
      const safePageCount = form.page_count != null ? Math.max(1, Math.round(form.page_count)) : null
      const payload: ItemFormData = {
        ...form,
        title: form.title.trim(),
        original_title: form.original_title?.trim() || null,
        author: form.author?.trim() || null,
        publisher: form.publisher?.trim() || null,
        isbn: form.isbn?.trim() || null,
        director: form.director?.trim() || null,
        platform: form.platform?.trim() || null,
        genre: form.genre?.trim() || null,
        overview: form.overview?.trim() || null,
        review: form.review?.trim() || null,
        read_date: form.read_date?.trim() || null,
        page_count: safePageCount,
        current_page: safePageCount != null
          ? Math.min(safePageCount, Math.max(0, Math.round(form.current_page ?? 0)))
          : 0
      }
      if (editingItem) {
        await updateItem(editingItem.id, payload)
      } else {
        const newItem = await addItem(payload)
        selectItem(newItem.id)
      }
      closeAddModal()
    } catch (e) {
      alert(`저장 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`)
    } finally {
      setIsSaving(false)
    }
  }

  const set = (key: keyof ItemFormData, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const addGenreChip = (g: string) => {
    const current = form.genre ? form.genre.split(',').map(s => s.trim()).filter(Boolean) : []
    if (!current.includes(g)) set('genre', [...current, g].join(', '))
  }

  if (!isAddModalOpen) return null

  const isBook = form.item_type === 'book'
  const hasResults = bookResults.length > 0 || tmdbResults.length > 0
  const closeResults = () => { setBookResults([]); setTmdbResults([]) }

  const coverSrc = form.cover_path
    ? (form.cover_path.startsWith('http') || form.cover_path.startsWith('data:'))
      ? form.cover_path
      : `file://${form.cover_path}`
    : null

  const genreTags = form.genre ? form.genre.split(',').map(s => s.trim()).filter(Boolean) : []
  const genreSuggestions = [
    ...suggestedGenres.filter(g => !genreTags.includes(g)),
    ...recentGenres.filter(g => !genreTags.includes(g) && !suggestedGenres.includes(g)),
  ].slice(0, 6)

  const progress = isBook && form.status === 'reading' && form.page_count
    ? Math.min(100, Math.round(((form.current_page ?? 0) / form.page_count) * 100))
    : null

  return (
    <>
      {cropImagePath && (
        <ImageCropModal imagePath={cropImagePath} onDone={handleCropDone} onCancel={() => setCropImagePath(null)} />
      )}

      <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeAddModal(); else if (hasResults) closeResults() }}>
        <div className="add-modal-shell" onClick={(e) => { if (hasResults) { closeResults(); e.stopPropagation() } }}>

          {/* ── 왼쪽: 표지 + 종류 ── */}
          <div className="add-modal-left">
            <div className="add-modal-cover-wrap" onClick={!coverSrc ? handlePickImage : undefined} style={!coverSrc ? { cursor: 'pointer' } : {}}>
              {coverSrc ? (
                <>
                  <img className="add-modal-cover-img" src={coverSrc} alt="" />
                  <div className="add-modal-cover-actions">
                    <button className="cover-action-btn" onClick={handlePickImage}>변경</button>
                    <button className="cover-action-btn danger" onClick={() => set('cover_path', null)}>삭제</button>
                  </div>
                </>
              ) : (
                <div className="add-modal-cover-empty">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>표지 추가</span>
                </div>
              )}
            </div>

            <div className="add-modal-type-btns" style={{ marginTop: 12 }}>
              {([
                { v: 'book',  icon: '📖', l: '도서' },
                { v: 'movie', icon: '🎬', l: '영화' },
                { v: 'drama', icon: '📺', l: '드라마' }
              ] as const).map(({ v, icon, l }) => (
                <button
                  key={v}
                  className={`add-modal-type-btn${form.item_type === v ? ' active' : ''}`}
                  onClick={() => switchType(v)}
                >
                  <span>{icon}</span>
                  <span>{l}</span>
                  {form.item_type === v && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ marginLeft: 'auto', color: 'var(--accent)' }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>

            {form.title && (
              <div className="add-modal-summary" style={{ marginTop: 10 }}>
                <div className="add-modal-summary-title">{form.title}</div>
                {(form.author || form.director) && (
                  <div className="add-modal-summary-sub">{(form.author || form.director) as string}</div>
                )}
                {form.year && <div className="add-modal-summary-sub">{form.year}년</div>}
              </div>
            )}
          </div>

          {/* ── 오른쪽 패널 ── */}
          <div className="add-modal-right">
            <div className="add-modal-header">
              <span className="modal-title">{editingItem ? '편집' : '새 항목 추가'}</span>
              <button className="btn-icon" onClick={closeAddModal}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="add-modal-tabs">
              <button className={`add-modal-tab${activeTab === 'info' ? ' active' : ''}`} onClick={() => setActiveTab('info')}>
                📋 기본 정보
              </button>
              <button className={`add-modal-tab${activeTab === 'record' ? ' active' : ''}`} onClick={() => setActiveTab('record')}>
                ✍️ {isBook ? '독서 기록' : '시청 기록'}
              </button>
            </div>

            <div className="add-modal-body">

              {/* ── 기본 정보 탭 ── */}
              {activeTab === 'info' && (
                <div className="add-tab-content">

                  {/* 자동 검색 */}
                  <div className="form-section" onClick={(e) => e.stopPropagation()}>
                    <div className="search-row">
                      <input
                        ref={searchInputRef}
                        className="form-input"
                        placeholder={isBook ? '책 제목 또는 저자 검색...' : '제목 또는 감독 검색...'}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      />
                      <button className="btn-search" onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
                        {isSearching ? <span className="spinner" /> : '검색'}
                      </button>
                      {(form.google_books_id || form.tmdb_id) && (
                        <button className="btn-reset-search" onClick={handleResetSearch} title="초기화">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="1 4 1 10 7 10" />
                            <path d="M3.51 15a9 9 0 1 0 .49-4.5" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {searchError && (
                      <div className="search-error-msg">{searchError}</div>
                    )}

                    {hasResults && (
                      <div className="search-results">
                        {bookResults.map((r) => (
                          <div key={r.google_books_id} className="search-result-item" onClick={() => applyBook(r)}>
                            {r.cover_path ? <img className="search-result-poster" src={r.cover_path} alt="" /> : <div className="search-result-poster" />}
                            <div className="search-result-info">
                              <div className="search-result-title">{r.title}</div>
                              <div className="search-result-meta">{[r.author, r.year, r.publisher].filter(Boolean).join(' · ')}</div>
                            </div>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </div>
                        ))}
                        {tmdbResults.map((r) => (
                          <div key={r.tmdb_id} className="search-result-item" onClick={() => applyTmdb(r)}>
                            {r.cover_path ? <img className="search-result-poster" src={r.cover_path} alt="" /> : <div className="search-result-poster" />}
                            <div className="search-result-info">
                              <div className="search-result-title">{r.title}</div>
                              <div className="search-result-meta">
                                {r.item_type === 'movie' ? '영화' : '드라마'} · {r.year ?? '?'}{r.director ? ` · ${r.director}` : ''}
                              </div>
                            </div>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="form-section-divider" />

                  {/* 제목 */}
                  <div className="form-group">
                    <label className="form-label">제목 <span style={{ color: 'var(--accent)' }}>*</span></label>
                    <input className="form-input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="제목" />
                  </div>
                  <div className="form-group" style={{ marginTop: 8 }}>
                    <label className="form-label">원제</label>
                    <input className="form-input" value={form.original_title ?? ''} onChange={(e) => set('original_title', e.target.value)} placeholder="Original Title (선택)" />
                  </div>

                  <div className="form-section-divider" />

                  {/* 책 전용 필드 */}
                  {isBook && (
                    <div className="form-row" style={{ marginBottom: 8 }}>
                      <div className="form-group">
                        <label className="form-label">저자</label>
                        <input className="form-input" value={form.author ?? ''} onChange={(e) => set('author', e.target.value)} placeholder="저자" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">출판사</label>
                        <input className="form-input" value={form.publisher ?? ''} onChange={(e) => set('publisher', e.target.value)} placeholder="출판사" />
                      </div>
                    </div>
                  )}
                  {isBook && (
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">전체 페이지</label>
                        <input className="form-input" type="number" value={form.page_count ?? ''} onChange={(e) => set('page_count', e.target.value ? parseInt(e.target.value) : null)} placeholder="300" min={1} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">ISBN</label>
                        <input className="form-input" value={form.isbn ?? ''} onChange={(e) => set('isbn', e.target.value)} placeholder="9791234567890" />
                      </div>
                    </div>
                  )}

                  {/* 영화/드라마 전용 필드 */}
                  {!isBook && (
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">감독</label>
                        <input className="form-input" value={form.director ?? ''} onChange={(e) => set('director', e.target.value)} placeholder="감독 / 연출" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">플랫폼</label>
                        <input className="form-input" value={form.platform ?? ''} onChange={(e) => set('platform', e.target.value)} placeholder="Netflix, 왓챠..." />
                      </div>
                    </div>
                  )}

                  <div className="form-section-divider" />

                  {/* 연도 + 장르 */}
                  <div className="form-row" style={{ alignItems: 'flex-start' }}>
                    <div className="form-group" style={{ flex: '0 0 90px' }}>
                      <label className="form-label">연도</label>
                      <input className="form-input" type="number" value={form.year ?? ''} onChange={(e) => set('year', e.target.value ? parseInt(e.target.value) : null)} placeholder="2024" min={1900} max={2100} />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">장르</label>
                      <GenreTagInput
                        value={form.genre ?? ''}
                        onChange={(v) => set('genre', v)}
                        suggestions={genreSuggestions}
                      />
                    </div>
                  </div>

                  <div className="form-section-divider" />

                  {/* 줄거리 */}
                  <div className="form-group">
                    <label className="form-label">줄거리 / 소개</label>
                    <textarea className="form-textarea" value={form.overview ?? ''} onChange={(e) => set('overview', e.target.value)} placeholder="간단한 소개..." rows={3} />
                  </div>
                </div>
              )}

              {/* ── 기록 탭 ── */}
              {activeTab === 'record' && (
                <div className="add-tab-content">

                  {/* 상태 */}
                  <div className="form-group">
                    <label className="form-label">상태</label>
                    <div className="status-btn-group">
                      {[
                        { v: 'want',    label: isBook ? '읽고 싶다' : '볼 예정',   icon: '🔖' },
                        { v: 'reading', label: isBook ? '읽는 중'   : '보는 중',   icon: '📖' },
                        { v: 'done',    label: isBook ? '완독'       : '시청 완료', icon: '✅' },
                        { v: 'dropped', label: '중단',                              icon: '⏸' }
                      ].map(({ v, label, icon }) => (
                        <button
                          key={v}
                          className={`status-btn${form.status === v ? ' active' : ''} status-btn-${v}`}
                          onClick={() => set('status', v)}
                        >
                          <span>{icon}</span>
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-section-divider" />

                  {/* 날짜 + 페이지 */}
                  <div className="form-row" style={{ alignItems: 'flex-end' }}>
                    <div className="form-group">
                      <label className="form-label">{isBook ? '완독일' : '시청일'}</label>
                      <input className="form-input" type="date" value={form.read_date ?? ''} onChange={(e) => set('read_date', e.target.value)} />
                    </div>
                    {isBook && form.status === 'reading' && form.page_count && (
                      <div className="form-group">
                        <label className="form-label">현재 페이지</label>
                        <input className="form-input" type="number" value={form.current_page ?? 0} onChange={(e) => set('current_page', parseInt(e.target.value) || 0)} min={0} max={form.page_count} placeholder={`0 ~ ${form.page_count}`} />
                      </div>
                    )}
                  </div>
                  {progress !== null && (
                    <div className="reading-progress-preview">
                      <div className="reading-progress-bar-bg">
                        <div className="reading-progress-bar-fill" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="reading-progress-pct">{progress}%</span>
                    </div>
                  )}

                  <div className="form-section-divider" />

                  {/* 별점 */}
                  <div className="form-group">
                    <label className="form-label">별점</label>
                    <div className="rating-row">
                      <StarRating value={form.rating} onChange={(v) => set('rating', v === form.rating ? null : v)} size={26} />
                      {form.rating != null && (
                        <>
                          <span className="rating-value">{form.rating}.0</span>
                          <button className="btn-text" style={{ marginLeft: 4 }} onClick={() => set('rating', null)}>초기화</button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="form-section-divider" />

                  {/* 감상평 */}
                  <div className="form-group">
                    <label className="form-label">{isBook ? '독후감' : '감상평'}</label>
                    <textarea
                      className="form-textarea"
                      value={form.review ?? ''}
                      onChange={(e) => set('review', e.target.value)}
                      placeholder={isBook ? '읽고 난 소감, 인상 깊은 점...' : '본 소감, 기억하고 싶은 장면...'}
                      rows={6}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 푸터 */}
            <div className="add-modal-footer">
              {activeTab === 'info' ? (
                <>
                  <button className="btn-secondary" onClick={closeAddModal}>취소</button>
                  <button className="btn-primary" onClick={() => setActiveTab('record')} disabled={!form.title.trim()}>
                    {isBook ? '독서 기록' : '시청 기록'} →
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-secondary" onClick={() => setActiveTab('info')}>← 기본 정보</button>
                  <button className="btn-primary" onClick={handleSubmit} disabled={isSaving || !form.title.trim()}>
                    {isSaving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : (editingItem ? '저장하기' : '추가하기')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
