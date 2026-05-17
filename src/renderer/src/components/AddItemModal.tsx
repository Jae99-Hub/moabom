import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { ItemFormData, ItemType, ItemStatus, GoogleBookResult, TmdbResult } from '../types'
import StarRating from './StarRating'
import ImageCropModal from './ImageCropModal'

// ── 장르 태그 입력 컴포넌트 ──────────────────────────────────────
const MAX_TAGS = 10
const MAX_DEPTH = 5
const MAX_RECENT = 5

function useRecentGenres(): string[] {
  const { itemList } = useStore()
  const seen = new Set<string>()
  const result: string[] = []
  const sorted = [...itemList].sort((a, b) => b.id - a.id)
  for (const item of sorted) {
    if (!item.genre) continue
    for (const path of item.genre.split(',').map((p) => p.trim()).filter(Boolean)) {
      if (!seen.has(path)) {
        seen.add(path)
        result.push(path)
        if (result.length >= MAX_RECENT) return result
      }
    }
  }
  return result
}

function GenreTagInput({ value, onChange, suggestedGenres = [] }: { value: string; onChange: (v: string) => void; suggestedGenres?: string[] }) {
  const [adding, setAdding] = useState(false)
  const [levels, setLevels] = useState<string[]>([''])
  const recentGenres = useRecentGenres()

  const tags = value ? value.split(',').map((p) => p.trim()).filter(Boolean) : []

  const removeTag = (idx: number) => onChange(tags.filter((_, i) => i !== idx).join(', '))

  const addTag = (path: string) => {
    if (tags.includes(path) || tags.length >= MAX_TAGS) return
    onChange([...tags, path].join(', '))
  }

  const confirmTag = () => {
    const path = levels.map((l) => l.trim()).filter(Boolean).join('>')
    if (!path) { setAdding(false); return }
    if (tags.length >= MAX_TAGS) { setAdding(false); setLevels(['']); return }
    addTag(path)
    setAdding(false)
    setLevels([''])
  }

  const setLevel = (i: number, v: string) => setLevels(levels.map((l, li) => (li === i ? v : l)))
  const addLevel = () => { if (levels.length < MAX_DEPTH) setLevels([...levels, '']) }
  const removeLevel = (i: number) => setLevels(levels.filter((_, li) => li !== i))

  const availableRecent = recentGenres.filter((g) => !tags.includes(g) && !suggestedGenres.includes(g))
  const availableSuggested = suggestedGenres.filter((g) => !tags.includes(g))

  return (
    <div className="genre-tag-wrap">
      <div className="genre-chips">
        {tags.map((tag, i) => (
          <span key={i} className="genre-chip">
            {tag.split('>').map((s) => s.trim()).join(' › ')}
            <button className="genre-chip-remove" onClick={() => removeTag(i)}>×</button>
          </span>
        ))}
        {!adding && tags.length < MAX_TAGS && (
          <button className="genre-add-btn" onClick={() => { setAdding(true); setLevels(['']) }}>
            + 장르 추가
          </button>
        )}
        {!adding && tags.length >= MAX_TAGS && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>최대 {MAX_TAGS}개</span>
        )}
      </div>
      {availableSuggested.length > 0 && (
        <div className="genre-recent">
          <span className="genre-recent-label">추천</span>
          {availableSuggested.map((g) => (
            <button key={g} className="genre-recent-chip genre-suggested-chip" onClick={() => addTag(g)}>
              {g.split('>').map((s) => s.trim()).join(' › ')}
            </button>
          ))}
        </div>
      )}
      {adding && (
        <>
          {availableRecent.length > 0 && (
            <div className="genre-recent">
              <span className="genre-recent-label">최근</span>
              {availableRecent.map((g) => (
                <button key={g} className="genre-recent-chip" onClick={() => { addTag(g); setAdding(false); setLevels(['']) }}>
                  {g.split('>').map((s) => s.trim()).join(' › ')}
                </button>
              ))}
            </div>
          )}
        <div className="genre-builder">
          {levels.map((lvl, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="genre-builder-sep">›</span>}
              <input
                className="genre-level-input"
                value={lvl}
                placeholder={i === 0 ? '장르' : '하위 장르'}
                autoFocus={i === levels.length - 1}
                onChange={(e) => setLevel(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmTag()
                  if (e.key === 'Escape') { setAdding(false); setLevels(['']) }
                  if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); if (levels.length < MAX_DEPTH) addLevel() }
                }}
              />
              {i > 0 && (
                <button className="genre-remove-level" onClick={() => removeLevel(i)} title="삭제">×</button>
              )}
            </React.Fragment>
          ))}
          {levels.length < MAX_DEPTH && (
            <button className="genre-add-level" onClick={addLevel} title="하위 장르 추가">＋</button>
          )}
          <button className="genre-confirm" onClick={confirmTag}>확인</button>
          <button className="genre-cancel" onClick={() => { setAdding(false); setLevels(['']) }}>취소</button>
        </div>
        </>
      )}
    </div>
  )
}

const DEFAULT_FORM: ItemFormData = {
  title: '', original_title: '', item_type: 'book',
  cover_path: null, backdrop_path: null,
  author: '', publisher: '', isbn: '', page_count: null, current_page: 0,
  director: '', platform: '',
  tmdb_id: null, google_books_id: null,
  genre: '', year: null, overview: '',
  rating: null, status: 'want', review: '', read_date: ''
}

type ActiveTab = 'info' | 'record'

export default function AddItemModal() {
  const { isAddModalOpen, editingItem, closeAddModal, addItem, updateItem, selectItem } = useStore()

  const [form, setForm] = useState<ItemFormData>(DEFAULT_FORM)
  const [activeTab, setActiveTab] = useState<ActiveTab>('info')
  const [searchQuery, setSearchQuery] = useState('')
  const [bookResults, setBookResults] = useState<GoogleBookResult[]>([])
  const [tmdbResults, setTmdbResults] = useState<TmdbResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [cropImagePath, setCropImagePath] = useState<string | null>(null)
  const [suggestedGenres, setSuggestedGenres] = useState<string[]>([])

  useEffect(() => {
    if (!isAddModalOpen) return
    setActiveTab('info')
    setSearchQuery('')
    setBookResults([])
    setTmdbResults([])
    setSearchError('')
    setSuggestedGenres([])
    if (editingItem) {
      setForm({
        title: editingItem.title,
        original_title: editingItem.original_title ?? '',
        item_type: editingItem.item_type as ItemType,
        cover_path: editingItem.cover_path,
        backdrop_path: editingItem.backdrop_path,
        author: editingItem.author ?? '',
        publisher: editingItem.publisher ?? '',
        isbn: editingItem.isbn ?? '',
        page_count: editingItem.page_count,
        current_page: editingItem.current_page ?? 0,
        director: editingItem.director ?? '',
        platform: editingItem.platform ?? '',
        tmdb_id: editingItem.tmdb_id,
        google_books_id: editingItem.google_books_id,
        genre: editingItem.genre ?? '',
        year: editingItem.year,
        overview: editingItem.overview ?? '',
        rating: editingItem.rating,
        status: editingItem.status as ItemStatus,
        review: editingItem.review ?? '',
        read_date: editingItem.read_date ?? ''
      })
    } else {
      setForm(DEFAULT_FORM)
    }
  }, [isAddModalOpen, editingItem])

  // 종류 전환: 타입별 필드만 초기화, 공통 필드(제목·연도·장르·줄거리 등) 유지
  const switchType = (newType: ItemType) => {
    setForm((p) => ({
      ...p,
      item_type: newType,
      author: '', publisher: '', isbn: '', page_count: null, current_page: 0,
      director: '', platform: '',
      google_books_id: null, tmdb_id: null,
    }))
    setSearchQuery('')
    setBookResults([])
    setTmdbResults([])
    setSearchError('')
    setSuggestedGenres([])
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    // 모바일 키보드 닫기
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    setIsSearching(true)
    setBookResults([])
    setTmdbResults([])
    setSearchError('')
    try {
      if (form.item_type === 'book') {
        const r = await window.api.books.search(searchQuery)
        if (r.length === 0) setSearchError('검색 결과가 없습니다. 다른 키워드로 시도해보세요.')
        else setBookResults(r)
      } else {
        const r = await window.api.tmdb.search(searchQuery)
        if (r.length === 0) setSearchError('검색 결과가 없습니다. 다른 키워드로 시도해보세요.')
        else setTmdbResults(r)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setSearchError(`검색 오류: ${msg}`)
    } finally {
      setIsSearching(false)
    }
  }

  const applyBook = (r: GoogleBookResult) => {
    if (r.genre) {
      const parsed = r.genre.split(',').map((g) => g.trim()).filter(Boolean)
      if (parsed.length) setSuggestedGenres(parsed)
    }
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
    if (r.genre) {
      const parsed = r.genre.split(',').map((g) => g.trim()).filter(Boolean)
      if (parsed.length) setSuggestedGenres(parsed)
    }
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
    // API로 채워진 필드만 초기화, 사용자가 직접 입력한 필드(독후감·완독일·별점)는 유지
    setForm((p) => ({
      ...DEFAULT_FORM,
      item_type: p.item_type,
      status: p.status,
      review: p.review,
      read_date: p.read_date,
      rating: p.rating,
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
      const safeCurrentPage = safePageCount != null
        ? Math.min(safePageCount, Math.max(0, Math.round(form.current_page ?? 0)))
        : 0
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
        current_page: safeCurrentPage
      }
      if (editingItem) {
        await updateItem(editingItem.id, payload)
      } else {
        const newItem = await addItem(payload)
        selectItem(newItem.id)
      }
      closeAddModal()
    } finally { setIsSaving(false) }
  }

  const set = (key: keyof ItemFormData, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const isBook = form.item_type === 'book'

  if (!isAddModalOpen) return null

  const coverSrc = form.cover_path
    ? (form.cover_path.startsWith('http') || form.cover_path.startsWith('data:')) ? form.cover_path : `file://${form.cover_path}`
    : null

  const hasResults = bookResults.length > 0 || tmdbResults.length > 0
  const closeResults = () => { setBookResults([]); setTmdbResults([]) }

  return (
    <>
      {cropImagePath && (
        <ImageCropModal
          imagePath={cropImagePath}
          onDone={handleCropDone}
          onCancel={() => setCropImagePath(null)}
        />
      )}

      <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeAddModal(); else if (hasResults) closeResults() }}>
        <div className="add-modal-shell" onClick={(e) => { if (hasResults) { closeResults(); e.stopPropagation() } }}>

          {/* ── 왼쪽 패널: 표지 + 종류 ── */}
          <div className="add-modal-left">
            <div className="add-modal-cover-wrap">
              {coverSrc ? (
                <>
                  <img className="add-modal-cover-img" src={coverSrc} alt="" />
                  <div className="add-modal-cover-actions">
                    <button className="cover-action-btn" onClick={handlePickImage}>변경</button>
                    <button className="cover-action-btn danger" onClick={() => set('cover_path', null)}>삭제</button>
                  </div>
                </>
              ) : (
                <div className="add-modal-cover-empty" onClick={handlePickImage}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>표지 추가</span>
                  <span className="cover-hint">클릭 후 크롭 가능</span>
                </div>
              )}
            </div>

            <div style={{ padding: '0 16px 8px' }}>
              <input
                className="form-input"
                style={{ fontSize: 11, height: 30 }}
                value={form.cover_path?.startsWith('http') ? form.cover_path : ''}
                onChange={(e) => set('cover_path', e.target.value || null)}
                placeholder="이미지 URL..."
              />
            </div>

            {/* 종류 선택 */}
            <div className="add-modal-type-section">
              <div className="add-modal-type-label">종류</div>
              <div className="add-modal-type-btns">
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
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ marginLeft: 'auto', color: 'var(--accent)' }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* 미리보기 */}
            {form.title && (
              <div className="add-modal-summary">
                <div className="add-modal-summary-title">{form.title}</div>
                {(form.author || form.director) && (
                  <div className="add-modal-summary-sub">{(form.author || form.director) as string}</div>
                )}
                {form.year && <div className="add-modal-summary-sub">{form.year}년</div>}
                {form.genre && <div className="add-modal-summary-sub" style={{ color: 'var(--text-accent)', fontSize: 10 }}>
                {(form.genre as string).split(',').map(p => p.trim()).filter(Boolean).map((p, i) => (
                  <span key={i} style={{ marginRight: 6 }}># {p.replace(/>/g, ' › ')}</span>
                ))}
              </div>}
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
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                기본 정보
              </button>
              <button className={`add-modal-tab${activeTab === 'record' ? ' active' : ''}`} onClick={() => setActiveTab('record')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                {isBook ? '독서 기록' : '시청 기록'}
              </button>
            </div>

            <div className="add-modal-body">
              {activeTab === 'info' && (
                <div className="add-tab-content">
                  {/* 자동 검색 */}
                  <div className="form-section">
                    <div className="form-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{isBook ? '구글 북스 자동 검색' : 'TMDB 자동 검색'}</span>
                      {(form.google_books_id || form.tmdb_id) && (
                        <button className="btn-reset-search" onClick={handleResetSearch}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="1 4 1 10 7 10" />
                            <path d="M3.51 15a9 9 0 1 0 .49-4.5" />
                          </svg>
                          초기화
                        </button>
                      )}
                    </div>

                    <div className="search-row" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="form-input"
                        placeholder="제목으로 검색..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        autoFocus
                      />
                      <button className="btn-search" onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
                        {isSearching ? <span className="spinner" /> : '검색'}
                      </button>
                    </div>

                    {searchError && (
                      <div className="search-error-msg">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        {searchError}
                      </div>
                    )}

                    {hasResults && (
                      <div className="search-results" onClick={(e) => e.stopPropagation()}>
                        {bookResults.map((r) => (
                          <div key={r.google_books_id} className="search-result-item" onClick={() => applyBook(r)}>
                            {r.cover_path
                              ? <img className="search-result-poster" src={r.cover_path} alt="" />
                              : <div className="search-result-poster" />}
                            <div className="search-result-info">
                              <div className="search-result-title">{r.title}</div>
                              <div className="search-result-meta">
                                {[r.author, r.year, r.publisher].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </div>
                        ))}
                        {tmdbResults.map((r) => (
                          <div key={r.tmdb_id} className="search-result-item" onClick={() => applyTmdb(r)}>
                            {r.cover_path
                              ? <img className="search-result-poster" src={r.cover_path} alt="" />
                              : <div className="search-result-poster" />}
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
                  <div className="form-section">
                    <div className="form-section-title">제목</div>
                    <div className="form-group" style={{ marginBottom: 10 }}>
                      <label className="form-label">한국어 제목 <span style={{ color: 'var(--accent)' }}>*</span></label>
                      <input className="form-input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="제목을 입력하세요" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">원제 (선택)</label>
                      <input className="form-input" value={form.original_title ?? ''} onChange={(e) => set('original_title', e.target.value)} placeholder="Original Title" />
                    </div>
                  </div>

                  <div className="form-section-divider" />

                  {/* 책 전용 */}
                  {isBook && (
                    <div className="form-section">
                      <div className="form-section-title">도서 정보</div>
                      <div className="form-row" style={{ marginBottom: 10 }}>
                        <div className="form-group">
                          <label className="form-label">저자</label>
                          <input className="form-input" value={form.author ?? ''} onChange={(e) => set('author', e.target.value)} placeholder="저자 이름" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">출판사</label>
                          <input className="form-input" value={form.publisher ?? ''} onChange={(e) => set('publisher', e.target.value)} placeholder="출판사" />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">ISBN</label>
                          <input className="form-input" value={form.isbn ?? ''} onChange={(e) => set('isbn', e.target.value)} placeholder="9791234567890" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">전체 페이지</label>
                          <input className="form-input" type="number" value={form.page_count ?? ''} onChange={(e) => set('page_count', e.target.value ? parseInt(e.target.value) : null)} placeholder="300" min={1} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 영화/드라마 전용 */}
                  {!isBook && (
                    <div className="form-section">
                      <div className="form-section-title">작품 정보</div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">감독</label>
                          <input className="form-input" value={form.director ?? ''} onChange={(e) => set('director', e.target.value)} placeholder="감독 이름" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">플랫폼</label>
                          <input className="form-input" value={form.platform ?? ''} onChange={(e) => set('platform', e.target.value)} placeholder="Netflix, 왓챠, 웨이브..." />
                        </div>
                      </div>
                    </div>
                  )}

                  {isBook && <div className="form-section-divider" />}

                  {/* 장르 + 연도 */}
                  <div className="form-section">
                    <div className="form-section-title">분류</div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: '1 1 100%' }}>
                        <label className="form-label">장르</label>
                        <GenreTagInput
                          value={form.genre ?? ''}
                          onChange={(v) => set('genre', v)}
                          suggestedGenres={suggestedGenres}
                        />
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                          Tab 또는 ＋ 으로 하위 장르 추가
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">출판 / 개봉 연도</label>
                        <input className="form-input" type="number" value={form.year ?? ''} onChange={(e) => set('year', e.target.value ? parseInt(e.target.value) : null)} placeholder="2024" min={1900} max={2100} />
                      </div>
                    </div>
                  </div>

                  <div className="form-section-divider" />

                  {/* 줄거리 */}
                  <div className="form-section">
                    <div className="form-section-title">소개</div>
                    <textarea className="form-textarea" value={form.overview ?? ''} onChange={(e) => set('overview', e.target.value)} placeholder="줄거리 또는 책 소개..." rows={4} />
                  </div>
                </div>
              )}

              {activeTab === 'record' && (
                <div className="add-tab-content">
                  <div className="form-section">
                    <div className="form-section-title">현재 상태</div>
                    <div className="status-btn-group">
                      {[
                        { v: 'want',    label: isBook ? '읽고 싶다' : '볼 예정',    icon: '🔖' },
                        { v: 'reading', label: isBook ? '읽는 중'   : '보는 중',    icon: '📖' },
                        { v: 'done',    label: isBook ? '완독'       : '시청 완료',  icon: '✅' },
                        { v: 'dropped', label: '중단',                               icon: '⏸' }
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

                  <div className="form-section">
                    <div className="form-section-title">날짜</div>
                    <div className={isBook && form.status === 'reading' && form.page_count ? 'form-row' : ''}>
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
                    {isBook && form.status === 'reading' && form.page_count && (
                      <div className="reading-progress-preview">
                        <div className="reading-progress-bar-bg">
                          <div className="reading-progress-bar-fill" style={{ width: `${Math.min(100, Math.round(((form.current_page ?? 0) / form.page_count) * 100))}%` }} />
                        </div>
                        <span className="reading-progress-pct">
                          {Math.min(100, Math.round(((form.current_page ?? 0) / form.page_count) * 100))}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="form-section">
                    <div className="form-section-title">별점</div>
                    <div className="rating-row">
                      <StarRating value={form.rating} onChange={(v) => set('rating', v === form.rating ? null : v)} size={28} />
                      {form.rating != null && <span className="rating-value">{form.rating}.0</span>}
                      {form.rating != null && <button className="btn-text" style={{ marginLeft: 4 }} onClick={() => set('rating', null)}>초기화</button>}
                    </div>
                  </div>

                  <div className="form-section">
                    <div className="form-section-title">{isBook ? '독후감' : '감상평'}</div>
                    <textarea
                      className="form-textarea"
                      value={form.review ?? ''}
                      onChange={(e) => set('review', e.target.value)}
                      placeholder={isBook ? '읽고 난 소감, 인상 깊은 점, 기억에 남는 장면...' : '본 소감, 기억하고 싶은 장면, 추천 여부...'}
                      rows={7}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="add-modal-footer">
              {activeTab === 'info' ? (
                <>
                  <button className="btn-secondary" style={{ width: 80 }} onClick={closeAddModal}>취소</button>
                  <button className="btn-primary" onClick={() => setActiveTab('record')} disabled={!form.title.trim()}>
                    다음: {isBook ? '독서 기록' : '시청 기록'}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-secondary" onClick={() => setActiveTab('info')}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                    </svg>
                    기본 정보
                  </button>
                  <button className="btn-primary" style={{ minWidth: 90 }} onClick={handleSubmit} disabled={isSaving || !form.title.trim()}>
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
