import React, { useEffect, useState } from 'react'
import { useStore, useFilteredItems } from '../store/useStore'
import { Item, ItemType, ItemStatus, Quote } from '../types'
import StarRating from './StarRating'

const TYPE_LABEL: Record<ItemType, string> = { book: '도서', movie: '영화', drama: '드라마' }
const STATUS_LABEL: Record<string, string> = { want: '읽고 싶다', reading: '읽는 중', done: '완독', dropped: '중단' }
const STATUS_LABEL_MEDIA: Record<string, string> = { want: '볼 예정', reading: '보는 중', done: '시청 완료', dropped: '중단' }

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
  const { openQuotesModal, quotesVersion } = useStore()
  const label = itemType === 'book' ? '명문장' : '명대사'

  useEffect(() => {
    window.api.quotes.getByItemId(itemId).then(setQuotes).catch(() => {})
  }, [itemId, quotesVersion])

  return (
    <div className="detail-section">
      <div className="detail-section-title">
        <span>{label} {quotes.length > 0 ? `(${quotes.length})` : ''}</span>
        <button className="btn-text" onClick={openQuotesModal}>관리</button>
      </div>
      {quotes.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>기록된 {label}이 없습니다</div>
      ) : (
        quotes.slice(0, 3).map((q) => (
          <div key={q.id} className="quote-item">
            <div className="quote-item-text">"{q.text}"</div>
            {(q.page_number || q.episode_number || q.note) && (
              <div className="quote-item-meta">
                {q.page_number ? `p.${q.page_number}` : ''}
                {q.episode_number ? `E${String(q.episode_number).padStart(2, '0')}` : ''}
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
  const { deleteItem, openAddModal, openQuotesModal, selectItem } = useStore()
  const [isbnOpen, setIsbnOpen] = useState(false)
  const isBook = item.item_type === 'book'
  const statusMap = isBook ? STATUS_LABEL : STATUS_LABEL_MEDIA

  const coverSrc = item.cover_path
    ? (item.cover_path.startsWith('http') || item.cover_path.startsWith('data:')) ? item.cover_path : `file://${item.cover_path}`
    : null

  const handleDelete = () => {
    if (window.confirm(`"${item.title}"을(를) 삭제할까요?`)) {
      deleteItem(item.id)
      selectItem(null)
    }
  }

  return (
    <div className="detail-modal-inner" onClick={(e) => e.stopPropagation()}>
      {/* 상단 배경 */}
      {item.backdrop_path && (
        <div className="dm-backdrop" style={{ backgroundImage: `url(${item.backdrop_path})` }} />
      )}

      {/* 닫기 버튼 */}
      <button className="dm-close" onClick={() => selectItem(null)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* 헤더: 커버 + 제목 정보 */}
      <div className="dm-header">
        <div className="dm-cover-wrap">
          {coverSrc ? (
            <img className="dm-cover" src={coverSrc} alt={item.title}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
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
            <span className={`tag media-card-status status-${item.status}`} style={{ position: 'static', fontSize: 10 }}>
              {statusMap[item.status]}
            </span>
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
            <div className="detail-section-title"><span>줄거리</span></div>
            <div className="dm-overview">{item.overview}</div>
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
        <button className="btn-danger" onClick={handleDelete}>
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
  const { selectedId, selectItem, itemList, isAddModalOpen } = useStore()
  const filtered = useFilteredItems()
  // 필터가 바뀌어도 선택 아이템이 사라지지 않도록 전체 목록에서 조회
  const selected = itemList.find((m) => m.id === selectedId)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 다른 모달이 열려 있으면 무시
      if (isAddModalOpen) return
      // 입력창에 포커스 중이면 무시
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

      if (e.key === 'Escape') { selectItem(null); return }
      if (!selectedId) return
      const idx = filtered.findIndex((m) => m.id === selectedId)
      if (e.key === 'ArrowRight') {
        if (idx < filtered.length - 1) selectItem(filtered[idx + 1].id)
      } else if (e.key === 'ArrowLeft') {
        if (idx > 0) selectItem(filtered[idx - 1].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, filtered, isAddModalOpen, selectItem])

  if (!selected) return null

  return (
    <div className="dm-overlay" onClick={() => selectItem(null)}>
      <DetailContent item={selected} />
    </div>
  )
}
