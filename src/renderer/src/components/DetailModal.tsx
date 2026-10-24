import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, useStorePick, selectFilteredItems } from '../store/useStore'
import { Item, ItemType, ItemStatus, Quote } from '../types'
import StarRating from './StarRating'
import { coverSrc } from '../utils/cover'
import { TYPE_LABEL, statusLabels, quoteWord } from '../constants/itemMeta'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { statusPatch } from '../utils/itemRules'
import { reportProblem } from '../utils/report'
import { josa } from '../utils/korean'

function ProgressBar({ current, total }: { current: number; total: number }) {
  if (!total || total <= 0) return null
  const pct = Math.min(100, Math.round((current / total) * 100))
  return (
    <div className="detail-progress-wrap">
      <div className="detail-progress-label">
        <span>독서 진행률</span>
        <span>{current} / {total}p ({pct}%)</span>
      </div>
      <div className="detail-progress-bar-bg">
        <div className="detail-progress-bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function QuotesList({ itemId, itemType }: { itemId: number; itemType: string }) {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [failed, setFailed] = useState(false)
  const { openQuotesModal, quotesVersion } = useStorePick('openQuotesModal', 'quotesVersion')
  const label = quoteWord(itemType)

  useEffect(() => {
    window.api.quotes.getByItemId(itemId)
      .then((q) => { setQuotes(q); setFailed(false) })
      // 실패를 '없어요'로 보이지 않게 (기록이 사라진 것처럼 보였음)
      .catch((e) => { reportProblem('quotes.load', e); setFailed(true) })
  }, [itemId, quotesVersion])

  return (
    <div className="detail-section">
      <div className="detail-section-title">
        <span>{label} {quotes.length > 0 ? `(${quotes.length})` : ''}</span>
        <button className="btn-text" onClick={openQuotesModal}>관리</button>
      </div>
      {failed ? (
        <div style={{ fontSize: 12, color: 'var(--danger)' }}>{label}{josa(label, '을/를')} 불러오지 못했어요. 창을 닫았다 다시 열어 주세요.</div>
      ) : quotes.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>기록한 {label}{itemType === 'book' ? '이' : '가'} 없어요</div>
      ) : (
        quotes.slice(0, 3).map((q) => (
          <div key={q.id} className="quote-item">
            <div className="quote-item-text">"{q.text}"</div>
            {(q.page_number || q.episode_number || q.note) && (
              <div className="quote-item-meta">
                {q.page_number ? `p.${q.page_number}` : ''}
                {q.episode_number ? `${q.episode_number}화` : ''}
                {(q.page_number || q.episode_number) && q.note ? ' · ' : ''}
                {q.note}
              </div>
            )}
          </div>
        ))
      )}
      {quotes.length > 3 && (
        <button className="btn-text" style={{ marginTop: 4 }} onClick={openQuotesModal}>
          +{quotes.length - 3}개 더 보기
        </button>
      )}
    </div>
  )
}

function DetailContent({ item }: { item: Item }) {
  const { deleteItem, openAddModal, openQuotesModal, selectItem, updateItem } =
    useStorePick('deleteItem', 'openAddModal', 'openQuotesModal', 'selectItem', 'updateItem')
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [coverFailed, setCoverFailed] = useState(false)
  useEffect(() => setCoverFailed(false), [item.cover_path]) // 표지를 바꾸면 다시 시도
  // 열리면 포커스를 상세창 안으로 — 키 입력이 뒤의 카드로 가지 않고, 스페이스로 내용을 스크롤.
  // Tab은 창 안에서만 돈다. 닫힐 때 포커스는 DetailModal이 그 작품 카드로 돌려준다.
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => { rootRef.current?.focus({ preventScroll: true }) }, [])
  useFocusTrap(rootRef, true, false)
  const statusMenuRef = useRef<HTMLDivElement>(null)
  // 상태 목록이 열려 있으면 Esc는 목록만 닫음 (예전엔 상세창까지 닫혔음)
  useEscapeKey(() => setShowStatusMenu(false), showStatusMenu)
  const isBook = item.item_type === 'book'
  const statusMap = statusLabels(item.item_type)

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    if (!showStatusMenu) return
    const handler = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showStatusMenu])

  const handleStatusChange = async (newStatus: ItemStatus) => {
    setShowStatusMenu(false)
    if (newStatus === item.status) return
    // 완료로 바꾸면 완료일(비었을 때 오늘)·다 읽은 쪽수도 함께
    await updateItem(item.id, statusPatch(item, newStatus))
  }

  const coverUrl = coverSrc(item.cover_path)

  // 바로 휴지통으로 옮기고 '되돌리기' 알림을 띄움 (15일 동안 휴지통에서도 복원 가능)
  const handleDelete = () => {
    void deleteItem(item.id)
    selectItem(null)
  }

  return (
    <div className="detail-modal-inner" onClick={(e) => e.stopPropagation()} ref={rootRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={item.title}>
      {/* 상단 배경 */}
      {item.backdrop_path && (
        <div className="dm-backdrop" style={{ backgroundImage: `url(${item.backdrop_path})` }} />
      )}

      {/* 닫기 버튼 */}
      <button className="dm-close" onClick={() => selectItem(null)} aria-label="닫기" title="닫기">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* 헤더: 커버 + 제목 정보 */}
      <div className={`dm-header${item.backdrop_path ? '' : ' no-backdrop'}`}>
        <div className="dm-cover-wrap">
          {coverUrl && !coverFailed ? (
            <img className="dm-cover" src={coverUrl} alt={item.title} onError={() => setCoverFailed(true)} />
          ) : (
            <div className="dm-cover-placeholder">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                {isBook
                  ? <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>
                  : <><rect x="2" y="2" width="20" height="20" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>}
              </svg>
            </div>
          )}
        </div>

        <div className="dm-title-section">
          <div className="dm-title">{item.title}</div>
          {item.original_title && item.original_title !== item.title && (
            <div className="dm-original-title">{item.original_title}</div>
          )}
          {(isBook ? item.author : item.director) && (
            <div className="dm-author">
              {isBook ? item.author : item.director}
              {(isBook ? item.publisher : item.platform) && (
                <span className="dm-publisher"> · {isBook ? item.publisher : item.platform}</span>
              )}
            </div>
          )}
          <div className="dm-tags">
            <span className="tag">{TYPE_LABEL[item.item_type as ItemType]}</span>
            {item.year && <span className="tag">{item.year}</span>}
            <div ref={statusMenuRef} style={{ position: 'relative', display: 'inline-flex' }}>
              <button
                className={`status-tag-btn status-${item.status}`}
                onClick={() => setShowStatusMenu((v) => !v)}
                title="상태 변경"
                aria-haspopup="menu"
                aria-expanded={showStatusMenu}
              >
                {statusMap[item.status]}
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ opacity: 0.7 }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {showStatusMenu && (
                <div className="status-dropdown">
                  {(Object.keys(statusMap) as ItemStatus[]).map((s) => (
                    <button
                      key={s}
                      className={`status-dropdown-item${s === item.status ? ' current' : ''}`}
                      onClick={() => handleStatusChange(s)}
                    >
                      <span className={`dot dot-${s}`} />
                      {statusMap[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {item.rating != null && (
            <div style={{ marginTop: 8 }}>
              <StarRating value={item.rating} readonly size={20} />
            </div>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="dm-body">
        {isBook && item.page_count && item.page_count > 0 && (
          <ProgressBar current={item.current_page || 0} total={item.page_count} />
        )}

        {/* 정보 그리드 */}
        <div className="dm-info-grid">
          {(isBook ? item.author : item.director) && (
            <div className="detail-info-item">
              <div className="detail-info-label">{isBook ? '저자' : '감독'}</div>
              <div className="detail-info-value">{isBook ? item.author : item.director}</div>
            </div>
          )}
          {(isBook ? item.publisher : item.platform) && (
            <div className="detail-info-item">
              <div className="detail-info-label">{isBook ? '출판사' : '플랫폼'}</div>
              <div className="detail-info-value">{isBook ? item.publisher : item.platform}</div>
            </div>
          )}
          {item.year && (
            <div className="detail-info-item">
              <div className="detail-info-label">{isBook ? '출판연도' : '개봉연도'}</div>
              <div className="detail-info-value">{item.year}</div>
            </div>
          )}
          {item.read_date && (
            <div className="detail-info-item">
              <div className="detail-info-label">{isBook ? '완독일' : '시청일'}</div>
              <div className="detail-info-value">{item.read_date}</div>
            </div>
          )}
          {isBook && item.page_count && item.page_count > 0 && (
            <div className="detail-info-item">
              <div className="detail-info-label">페이지 수</div>
              <div className="detail-info-value">{item.page_count}p</div>
            </div>
          )}
          {item.genre && (
            <div className="detail-info-item dm-info-span2">
              <div className="detail-info-label">장르</div>
              <div className="detail-info-genre">
                {item.genre.split(',').map((g, i) => (
                  <span key={i} className="detail-genre-tag">
                    {g.trim().split('>').map(s => s.trim()).join(' › ')}
                  </span>
                ))}
              </div>
            </div>
          )}
          {isBook && item.isbn && (
            <div className="detail-info-item">
              <div className="detail-info-label">ISBN</div>
              <div className="detail-info-value" style={{ fontSize: 12, letterSpacing: '0.02em' }}>{item.isbn}</div>
            </div>
          )}
        </div>

        {item.overview && (
          <div className="detail-section">
            <div className="detail-section-title">
              <span>줄거리</span>
              {item.overview.length > 240 && (
                <button className="btn-text" onClick={() => setOverviewOpen((v) => !v)} aria-expanded={overviewOpen}>
                  {overviewOpen ? '접기' : '더 보기'}
                </button>
              )}
            </div>
            {/* 긴 줄거리는 접어 둠 — 감상평·명대사가 한참 아래로 밀리던 것 */}
            <div className={`dm-overview${item.overview.length > 240 && !overviewOpen ? ' clamped' : ''}`}>{item.overview}</div>
          </div>
        )}
        {item.review && (
          <div className="detail-section">
            <div className="detail-section-title"><span>{isBook ? '독후감' : '감상평'}</span></div>
            <div className="detail-review">{item.review}</div>
          </div>
        )}

        <QuotesList itemId={item.id} itemType={item.item_type} />
      </div>

      {/* 하단 액션 */}
      <div className="dm-footer">
        <button className="btn-secondary" onClick={openQuotesModal}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {isBook ? '명문장' : '명대사'}
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn-secondary" onClick={() => openAddModal(item)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          편집
        </button>
        <button className="btn-danger" onClick={handleDelete} aria-label="휴지통으로 옮기기" title="휴지통으로 옮기기">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4h6v2" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default function DetailModal() {
  const { selectedId, selectItem, itemList } = useStorePick('selectedId', 'selectItem', 'itemList')
  // 필터가 바뀌어도 선택 아이템이 사라지지 않도록 전체 목록에서 조회
  const selected = useMemo(() => itemList.find((m) => m.id === selectedId), [itemList, selectedId])

  // Esc는 맨 위 창부터 닫힘 (명대사 창이 위에 있으면 그것 먼저)
  useEscapeKey(() => selectItem(null), !!selected)

  // 닫히면 마지막으로 보던 작품의 카드로 포커스를 돌려줌 — 키보드로 600개 목록의 자리를 잃지 않게
  const lastShownId = useRef<number | null>(null)
  useEffect(() => {
    if (selected) { lastShownId.current = selected.id; return }
    const id = lastShownId.current
    lastShownId.current = null
    if (id == null) return
    const card = document.querySelector<HTMLElement>(`[data-item-id="${id}"]`)
    if (card && (document.activeElement === document.body || !document.activeElement)) card.focus({ preventScroll: false })
  }, [selected])

  useEffect(() => {
    if (!selectedId) return // 상세창이 닫혀 있으면 키를 가로채지 않음
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      // 위에 다른 창이 떠 있으면 무시 — ←/→를 누르면 뒤에서 다른 작품으로 바뀌던 문제
      const s = useStore.getState()
      if (s.isAddModalOpen || s.isQuotesModalOpen || s.isSettingsOpen || s.isStatsOpen ||
          s.isTrashOpen || s.isTourOpen || s.syncConflicts.length > 0 || s.syncAutoMerged > 0) return
      // 입력창에 포커스 중이면 무시
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      const filtered = selectFilteredItems(s)
      const idx = filtered.findIndex((m) => m.id === selectedId)
      if (e.key === 'ArrowRight') {
        if (idx < filtered.length - 1) selectItem(filtered[idx + 1].id)
      } else {
        if (idx > 0) selectItem(filtered[idx - 1].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, selectItem])

  if (!selected) return null

  return (
    <div className="dm-overlay" onClick={() => selectItem(null)}>
      <DetailContent key={selected.id} item={selected} />
    </div>
  )
}
