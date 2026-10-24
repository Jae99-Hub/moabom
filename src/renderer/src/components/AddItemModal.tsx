import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useStore, useStorePick } from '../store/useStore'
import { Item, ItemFormData, ItemType, ItemStatus, GoogleBookResult, TmdbResult } from '../types'
import StarRating from './StarRating'
import ImageCropModal from './ImageCropModal'
import GenreTagInput from './GenreTagInput'
import { coverSrc } from '../utils/cover'
import { confirmDialog, alertDialog } from '../store/dialogs'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { statusPatch, findDuplicate, validateForm } from '../utils/itemRules'
import { josa } from '../utils/korean'

/** Electron이 붙이는 "Error invoking remote method '…': Error: " 접두어를 떼고 사용자용 문구만 남김 */
function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** 닫을 때 '작성 중인 내용'으로 볼 값만 비교 (유형만 바꾼 건 제외) */
const formSnapshot = (f: ItemFormData): string => JSON.stringify({ ...f, item_type: '' })

const DEFAULT_FORM: ItemFormData = {
  title: '', original_title: '', item_type: 'book',
  cover_path: null, backdrop_path: null,
  author: '', publisher: '', isbn: '', page_count: null, current_page: 0,
  director: '', platform: '',
  tmdb_id: null, google_books_id: null,
  genre: '', year: null, overview: '',
  rating: null, status: 'want', review: '', read_date: ''
}

const TYPES = [
  { v: 'book', icon: '📖', l: '도서' },
  { v: 'movie', icon: '🎬', l: '영화' },
  { v: 'drama', icon: '📺', l: '드라마' },
  { v: 'documentary', icon: '🎞️', l: '다큐' },
] as const

// editingItem → ItemFormData 변환 (useState 초기화 & useEffect 공용)
function buildEditForm(item: Item): ItemFormData {
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
  const itemList = useStore((s) => s.itemList)
  return useMemo(() => {
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
  }, [itemList])
}

// 작품 추가·편집 창 — 한 화면에 위에서부터 [종류] → [검색] → [작품] → [나의 기록].
// 예전엔 '기본 정보'·'기록' 탭으로 나뉘어 있어 검색 후 탭을 넘어가야 했고, 왼쪽 요약과 입력칸이 같은 내용을 두 번 보여 줬음.
// 검색으로 채워지는 세부 정보(원제·저자·줄거리 등)는 '작품 정보 더 입력하기'로 접어 둔다.
export default function AddItemModal() {
  const { isAddModalOpen, editingItem, closeAddModal, addItem, updateItem, selectItem, filters, itemList } =
    useStorePick('isAddModalOpen', 'editingItem', 'closeAddModal', 'addItem', 'updateItem', 'selectItem', 'filters', 'itemList')

  // editingItem이 있으면 첫 렌더부터 올바른 값으로 시작 (중간 빈 렌더 방지)
  const [form, setForm] = useState<ItemFormData>(() =>
    editingItem ? buildEditForm(editingItem) : DEFAULT_FORM
  )
  const [detailsOpen, setDetailsOpen] = useState(false)
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
  // 마지막 검색만 반영 — 빠르게 두 번 검색하거나 도중에 유형을 바꾸면 늦게 온 이전 결과가 덮어쓰던 문제
  const searchSeqRef = useRef(0)
  // 열렸을 때의 입력값 — 닫을 때 작성 중인 내용이 있는지 비교
  const initialSnapshotRef = useRef('')
  // 배경에서 누르고 배경에서 뗐을 때만 닫음 (감상문을 드래그하다 창 밖에서 놓아도 닫히지 않게)
  const downOnBackdrop = useRef(false)
  const shellRef = useRef<HTMLDivElement>(null)
  useFocusTrap(shellRef, isAddModalOpen)

  useEffect(() => {
    if (!isAddModalOpen) return
    searchSeqRef.current++
    setIsSearching(false)
    setDetailsOpen(false)
    setSearchQuery('')
    setBookResults([])
    setTmdbResults([])
    setSearchError('')
    setSuggestedGenres([])
    let initial: ItemFormData
    if (editingItem) {
      initial = buildEditForm(editingItem)
    } else {
      const defaultType: ItemType =
        filters.type !== 'all'
          ? (filters.type as ItemType)
          : ([...itemList].sort((a, b) => b.id - a.id)[0]?.item_type as ItemType | undefined) ?? 'book'
      initial = { ...DEFAULT_FORM, item_type: defaultType }
    }
    setForm(initial)
    initialSnapshotRef.current = formSnapshot(initial)
    // 새로 추가할 때는 바로 검색할 수 있게
    if (!editingItem) setTimeout(() => searchInputRef.current?.focus(), 80)
  }, [isAddModalOpen, editingItem])

  const requestClose = async () => {
    if (formSnapshot(form) !== initialSnapshotRef.current) {
      const ok = await confirmDialog({
        title: editingItem ? '수정한 내용이 있어요' : '작성 중인 내용이 있어요',
        message: editingItem ? '저장하지 않고 닫으면 고친 내용이 사라져요.' : '저장하지 않고 닫으면 지금 쓴 내용이 사라져요.',
        confirmText: '닫기',
        cancelText: '계속 쓰기',
        danger: true,
      })
      if (!ok) return
    }
    closeAddModal()
  }
  useEscapeKey(() => { void requestClose() }, isAddModalOpen)

  const clearSearch = () => {
    setSearchQuery('')
    setBookResults([])
    setTmdbResults([])
    setSearchError('')
    setSuggestedGenres([])
  }

  const switchType = (newType: ItemType) => {
    // 영화·드라마·다큐끼리는 같은 작품 정보가 그대로 맞으므로 유지 (예: 다큐 시리즈를 드라마로 검색했다가 다큐로)
    if ((form.item_type === 'book') === (newType === 'book')) {
      setForm((p) => ({ ...p, item_type: newType }))
      return
    }
    searchSeqRef.current++ // 진행 중이던 검색 결과는 버림
    setIsSearching(false)
    setForm((p) => {
      // 이미 저장된 작품을 고치는 중이면 종류를 바로잡는 것 — 제목·표지·줄거리는 두고
      // 새 종류에 없는 칸(저자↔감독 등)과 다른 검색처의 번호만 비운다 (예전엔 제목까지 모두 지워졌음)
      if (editingItem) {
        return newType === 'book'
          ? { ...p, item_type: newType, director: '', platform: '', tmdb_id: null, backdrop_path: null }
          : { ...p, item_type: newType, author: '', publisher: '', isbn: '', page_count: null, current_page: 0, google_books_id: null }
      }
      // 새로 추가하는 중, 책 ↔ 영상: 검색으로 채운 작품 정보(제목·표지·줄거리 등)는 다른 종류의 것이라 비운다
      // (예전엔 드라마로 검색한 뒤 도서로 바꿔도 드라마 정보가 그대로 남았음).
      // 직접 쓴 기록(상태·별점·감상·완료일)과 직접 넣은 표지는 남김.
      if (p.google_books_id || p.tmdb_id) {
        return {
          ...DEFAULT_FORM, item_type: newType,
          cover_path: p.cover_path?.startsWith('data:') ? p.cover_path : null,
          status: p.status, rating: p.rating, review: p.review, read_date: p.read_date,
        }
      }
      // 검색 없이 직접 쓰던 중이면 제목 등은 두고, 종류에 안 맞는 칸(저자↔감독 등)만 비움
      return {
        ...p, item_type: newType,
        author: '', publisher: '', isbn: '', page_count: null, current_page: 0,
        director: '', platform: '',
      }
    })
    clearSearch()
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    const seq = ++searchSeqRef.current
    const isLatest = () => seq === searchSeqRef.current
    setIsSearching(true)
    setBookResults([])
    setTmdbResults([])
    setSearchError('')
    try {
      if (form.item_type === 'book') {
        const r = await window.api.books.search(searchQuery)
        if (!isLatest()) return
        if (r.length === 0) setSearchError('검색 결과가 없어요. 아래에 직접 적어도 돼요.')
        else setBookResults(r)
      } else {
        const r = await window.api.tmdb.search(searchQuery)
        if (!isLatest()) return
        if (r.length === 0) setSearchError('검색 결과가 없어요. 아래에 직접 적어도 돼요.')
        else setTmdbResults(r)
      }
    } catch (e) {
      if (isLatest()) setSearchError(friendlyError(e))
    } finally {
      if (isLatest()) setIsSearching(false)
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
      // 사용자가 '다큐'로 선택한 경우 TMDB 분류(영화/드라마)와 무관하게 다큐로 유지
      item_type: p.item_type === 'documentary' ? 'documentary' : (r.item_type as ItemType),
      director: r.director,
      year: r.year ? parseInt(r.year) : null,
      overview: r.overview, cover_path: r.cover_path,
      backdrop_path: r.backdrop_path, tmdb_id: r.tmdb_id
    }))
    setTmdbResults([])
    setSearchError('')
  }

  // 검색으로 고른 작품을 비우고 다시 고르기 (직접 쓴 기록은 남김)
  const handleResetSearch = () => {
    setForm((p) => ({
      ...DEFAULT_FORM, item_type: p.item_type,
      status: p.status, review: p.review, read_date: p.read_date, rating: p.rating,
    }))
    clearSearch()
    setTimeout(() => searchInputRef.current?.focus(), 0)
  }

  const handlePickImage = async () => {
    const path = await window.api.image.pick()
    if (path) setCropImagePath(path)
  }

  // 자른 표지는 파일 대신 이미지 데이터(data URL)로 저장 → 다른 기기·웹·백업 파일에서도 보임
  const handleCropDone = (dataUrl: string) => {
    setForm((p) => ({ ...p, cover_path: dataUrl }))
    setCropImagePath(null)
  }

  const handleSubmit = async () => {
    const problem = validateForm(form)
    if (problem) {
      // 연도·페이지처럼 접어 둔 칸의 문제면 펼쳐서 보여 줌
      if (form.title.trim()) {
        if (problem.tab === 'info') setDetailsOpen(true)
        void alertDialog(problem.message, '입력을 확인해 주세요')
      }
      return
    }
    if (!editingItem) {
      const dup = findDuplicate(itemList, form)
      if (dup) {
        const ok = await confirmDialog({
          title: '이미 기록한 작품이에요',
          message: `'${dup.title}'${josa(dup.title, '이/가')} 이미 있어요. 그래도 하나 더 추가할까요?`,
          confirmText: '추가',
          cancelText: '돌아가기',
        })
        if (!ok) return
      }
    }
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
        // 완독이면 다 읽은 것으로 (예전엔 120/244쪽에서 완독으로 바꿔도 진행률 49%가 남았음)
        current_page: safePageCount == null ? 0
          : form.status === 'done' ? safePageCount
          : Math.min(safePageCount, Math.max(0, Math.round(form.current_page ?? 0)))
      }
      if (editingItem) {
        await updateItem(editingItem.id, payload)
      } else {
        const newItem = await addItem(payload)
        selectItem(newItem.id)
      }
      closeAddModal()
    } catch (e) {
      void alertDialog(`다시 시도해 주세요.\n(${friendlyError(e)})`, '저장하지 못했어요')
    } finally {
      setIsSaving(false)
    }
  }

  const set = (key: keyof ItemFormData, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  // 완료로 바꾸면 완료일 칸에 오늘을 넣어 둔다 (비어 있을 때만 — 보이는 칸이라 바로 고치거나 지울 수 있음)
  const setStatus = (status: ItemStatus) =>
    setForm((prev) => ({ ...prev, ...statusPatch({ ...prev, current_page: prev.current_page ?? 0 }, status) }))

  if (!isAddModalOpen) return null

  const isBook = form.item_type === 'book'
  const hasResults = bookResults.length > 0 || tmdbResults.length > 0
  const closeResults = () => { setBookResults([]); setTmdbResults([]) }
  const picked = !!(form.google_books_id || form.tmdb_id)

  const coverUrl = coverSrc(form.cover_path)
  const metaLine = [isBook ? form.author : form.director, form.year, isBook ? form.publisher : form.platform]
    .filter(Boolean).join(' · ')

  const genreTags = form.genre ? form.genre.split(',').map(s => s.trim()).filter(Boolean) : []
  const genreSuggestions = [
    ...suggestedGenres.filter(g => !genreTags.includes(g)),
    ...recentGenres.filter(g => !genreTags.includes(g) && !suggestedGenres.includes(g)),
  ].slice(0, 6)

  const showDate = form.status === 'done' || !!form.read_date
  const showPage = isBook && form.status === 'reading' && !!form.page_count
  const progress = showPage && form.page_count
    ? Math.min(100, Math.round(((form.current_page ?? 0) / form.page_count) * 100))
    : null

  const STATUS = [
    { v: 'want',    label: isBook ? '읽고 싶다' : '볼 예정' },
    { v: 'reading', label: isBook ? '읽는 중'   : '보는 중' },
    { v: 'done',    label: isBook ? '완독'       : '시청 완료' },
    { v: 'dropped', label: '중단' },
  ] as const

  return (
    <>
      <div
        className="modal-overlay"
        onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget }}
        onClick={(e) => { if (e.target === e.currentTarget && downOnBackdrop.current) void requestClose() }}
      >
        <div
          className="aim"
          ref={shellRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={editingItem ? '기록 고치기' : '새 작품 기록'}
        >
          {/* ── 머리: 제목 + 종류 ── */}
          <div className="aim-header">
            <span className="modal-title">{editingItem ? '기록 고치기' : '새 작품 기록'}</span>
            <button className="btn-icon" onClick={() => { void requestClose() }} aria-label="닫기" title="닫기">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="aim-types" role="group" aria-label="종류">
            {TYPES.map(({ v, icon, l }) => (
              <button
                key={v}
                className={`aim-type${form.item_type === v ? ' active' : ''}`}
                onClick={() => switchType(v)}
                aria-pressed={form.item_type === v}
              >
                <span aria-hidden="true">{icon}</span>{l}
              </button>
            ))}
          </div>

          <div className="aim-body">
            {/* ── 검색 ── */}
            <div className="aim-search">
              <div className="aim-search-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void handleSearch() }}
                  placeholder={isBook ? '책 제목이나 저자로 찾기' : '제목이나 감독으로 찾기'}
                  aria-label="작품 검색"
                />
                {hasResults && (
                  <button className="aim-search-clear" onClick={closeResults} aria-label="검색 결과 닫기" title="결과 닫기">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
                <button className="aim-search-btn" onClick={() => { void handleSearch() }} disabled={isSearching || !searchQuery.trim()}>
                  {isSearching ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '검색'}
                </button>
              </div>
              {searchError && <div className="search-error-msg">{searchError}</div>}
              {hasResults && (
                <div className="aim-results">
                  {bookResults.map((r) => (
                    <button type="button" key={r.google_books_id} className="search-result-item" onClick={() => applyBook(r)}>
                      {r.cover_path ? <img className="search-result-poster" src={r.cover_path} alt="" /> : <div className="search-result-poster" />}
                      <div className="search-result-info">
                        <div className="search-result-title">{r.title}</div>
                        <div className="search-result-meta">{[r.author, r.year, r.publisher].filter(Boolean).join(' · ')}</div>
                      </div>
                    </button>
                  ))}
                  {tmdbResults.map((r) => (
                    <button type="button" key={r.tmdb_id} className="search-result-item" onClick={() => applyTmdb(r)}>
                      {r.cover_path ? <img className="search-result-poster" src={r.cover_path} alt="" /> : <div className="search-result-poster" />}
                      <div className="search-result-info">
                        <div className="search-result-title">{r.title}</div>
                        <div className="search-result-meta">
                          {r.item_type === 'movie' ? '영화' : '드라마'} · {r.year ?? '?'}{r.director ? ` · ${r.director}` : ''}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── 작품 ── */}
            <section className="aim-section" aria-label="작품">
              <div className="aim-work">
                <button type="button" className="aim-cover" onClick={() => { void handlePickImage() }} aria-label={coverUrl ? '표지 바꾸기' : '표지 넣기'}>
                  {coverUrl ? (
                    <>
                      <img src={coverUrl} alt="" />
                      <span className="aim-cover-hint">바꾸기</span>
                    </>
                  ) : (
                    <span className="aim-cover-empty">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                      </svg>
                      표지 넣기
                    </span>
                  )}
                </button>
                <div className="aim-work-main">
                  <label className="form-label" htmlFor="aim-title">제목</label>
                  <input
                    id="aim-title"
                    className="form-input aim-title-input"
                    value={form.title}
                    onChange={(e) => set('title', e.target.value)}
                    placeholder={picked ? '' : '검색하거나 직접 적어 주세요'}
                  />
                  {metaLine && <div className="aim-meta">{metaLine}</div>}
                  <div className="aim-work-actions">
                    <button className="aim-link" onClick={() => setDetailsOpen((v) => !v)} aria-expanded={detailsOpen}>
                      {detailsOpen ? '작품 정보 접기' : '작품 정보 더 입력하기'}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                        style={{ transform: detailsOpen ? 'rotate(180deg)' : undefined }} aria-hidden="true">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {picked && !editingItem && <button className="aim-link muted" onClick={handleResetSearch}>다른 작품 고르기</button>}
                    {coverUrl && <button className="aim-link muted" onClick={() => set('cover_path', null)}>표지 빼기</button>}
                  </div>
                </div>
              </div>

              {/* 장르는 접지 않음 — 왼쪽 목록의 장르별 보기에 쓰이고, 검색으로 고르면 추천이 바로 보임 */}
              <div className="form-group">
                <label className="form-label">
                  장르
                  <span className="aim-hint aim-hint-keys">Tab으로 하위 장르 · Enter로 추가</span>
                  <span className="aim-hint aim-hint-touch">한국&gt;드라마처럼 쓰면 하위 장르</span>
                </label>
                <GenreTagInput value={form.genre ?? ''} onChange={(v) => set('genre', v)} suggestions={genreSuggestions} />
              </div>

              {detailsOpen && (
                <div className="aim-details">
                  <div className="form-group">
                    <label className="form-label">원제</label>
                    <input className="form-input" value={form.original_title ?? ''} onChange={(e) => set('original_title', e.target.value)} placeholder="원래 제목 (있으면)" />
                  </div>
                  {isBook ? (
                    <>
                      <div className="aim-fields">
                        <div className="form-group">
                          <label className="form-label">저자</label>
                          <input className="form-input" value={form.author ?? ''} onChange={(e) => set('author', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">출판사</label>
                          <input className="form-input" value={form.publisher ?? ''} onChange={(e) => set('publisher', e.target.value)} />
                        </div>
                      </div>
                      <div className="aim-fields">
                        <div className="form-group">
                          <label className="form-label">전체 페이지</label>
                          <input className="form-input" type="number" inputMode="numeric" value={form.page_count ?? ''} onChange={(e) => set('page_count', e.target.value ? parseInt(e.target.value) : null)} placeholder="예: 300" min={1} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">ISBN</label>
                          <input className="form-input" value={form.isbn ?? ''} onChange={(e) => set('isbn', e.target.value)} placeholder="13자리 숫자" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="aim-fields">
                      <div className="form-group">
                        <label className="form-label">감독</label>
                        <input className="form-input" value={form.director ?? ''} onChange={(e) => set('director', e.target.value)} placeholder="감독·연출" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">플랫폼</label>
                        <input className="form-input" value={form.platform ?? ''} onChange={(e) => set('platform', e.target.value)} placeholder="넷플릭스, 왓챠…" />
                      </div>
                    </div>
                  )}
                  <div className="aim-fields">
                    <div className="form-group">
                      <label className="form-label">연도</label>
                      <input className="form-input" type="number" inputMode="numeric" value={form.year ?? ''} onChange={(e) => set('year', e.target.value ? parseInt(e.target.value) : null)} placeholder="예: 2024" min={1000} max={2100} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">줄거리·소개</label>
                    <textarea className="form-textarea" value={form.overview ?? ''} onChange={(e) => set('overview', e.target.value)} rows={4} />
                  </div>
                </div>
              )}
            </section>

            {/* ── 나의 기록 ── */}
            <section className="aim-section" aria-label="나의 기록">
              <h3 className="aim-section-title">{isBook ? '나의 독서 기록' : '나의 시청 기록'}</h3>
              <div className="aim-status" role="group" aria-label="상태">
                {STATUS.map(({ v, label }) => (
                  <button key={v} className={form.status === v ? 'active' : ''} onClick={() => setStatus(v)} aria-pressed={form.status === v}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="aim-rating">
                <span className="form-label">별점</span>
                <StarRating value={form.rating} onChange={(v) => set('rating', v === form.rating ? null : v)} size={24} />
                {form.rating != null && (
                  <>
                    <span className="aim-rating-value">{form.rating.toFixed(1)}</span>
                    <button className="aim-link muted" onClick={() => set('rating', null)}>지우기</button>
                  </>
                )}
              </div>

              {(showDate || showPage) && (
                <div className="aim-fields">
                  {showDate && (
                    <div className="form-group">
                      <label className="form-label">{isBook ? '완독일' : '시청일'}</label>
                      <input className="form-input" type="date" value={form.read_date ?? ''} onChange={(e) => set('read_date', e.target.value)} />
                    </div>
                  )}
                  {showPage && (
                    <div className="form-group">
                      <label className="form-label">지금 읽는 쪽</label>
                      {/* 0일 때는 빈칸으로 — 예전엔 0 뒤에 이어 쳐져 '0120'이 됐음 */}
                      <input className="form-input" type="number" inputMode="numeric" value={form.current_page || ''} onChange={(e) => set('current_page', Math.max(0, parseInt(e.target.value) || 0))} min={0} max={form.page_count ?? undefined} placeholder={`0 ~ ${form.page_count}`} />
                    </div>
                  )}
                </div>
              )}
              {progress !== null && (
                <div className="reading-progress-preview">
                  <div className="reading-progress-bar-bg">
                    <div className="reading-progress-bar-fill" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="reading-progress-pct">{progress}%</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="aim-review">{isBook ? '독후감' : '감상평'}</label>
                <textarea
                  id="aim-review"
                  className="form-textarea"
                  value={form.review ?? ''}
                  onChange={(e) => set('review', e.target.value)}
                  placeholder={isBook ? '읽고 난 소감, 인상 깊은 점…' : '본 소감, 기억하고 싶은 장면…'}
                  rows={5}
                />
              </div>
            </section>
          </div>

          <div className="aim-footer">
            <button className="aim-cancel" onClick={() => { void requestClose() }}>취소</button>
            <button className="btn-primary" onClick={() => { void handleSubmit() }} disabled={isSaving || !form.title.trim()}>
              {isSaving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : (editingItem ? '저장하기' : '추가하기')}
            </button>
          </div>
        </div>
      </div>

      {/* 자르기 창은 추가 창보다 뒤에 그려야 위에 보임 (같은 z-index에선 나중 요소가 위) */}
      {cropImagePath && (
        <ImageCropModal imagePath={cropImagePath} onDone={handleCropDone} onCancel={() => setCropImagePath(null)} />
      )}
    </>
  )
}
