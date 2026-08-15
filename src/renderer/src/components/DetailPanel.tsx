import React, { useEffect, useState, useRef } from 'react'
import { useStore } from '../store/useStore'
import { Item, ItemType, ItemStatus, Quote } from '../types'
import StarRating from './StarRating'

const TYPE_LABEL: Record<ItemType, string> = { book: '도서', movie: '영화', drama: '드라마', documentary: '다큐' }
const STATUS_LABEL: Record<string, string> = {
  want: '읽고 싶다',
  reading: '읽는 중',
  done: '완독',
  dropped: '중단'
}
const STATUS_LABEL_MEDIA: Record<string, string> = {
  want: '볼 예정',
  reading: '보는 중',
  done: '시청 완료',
  dropped: '중단'
}

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

function QuotesList({ itemId }: { itemId: number }) {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const { openQuotesModal, quotesVersion } = useStore()

  useEffect(() => {
    window.api.quotes.getByItemId(itemId).then(setQuotes).catch(() => {})
  }, [itemId, quotesVersion])

  return (
    <div className="detail-section">
      <div className="detail-section-title">
        <span>명문장 {quotes.length > 0 ? `(${quotes.length})` : ''}</span>
        <button className="btn-text" onClick={openQuotesModal}>관리</button>
      </div>
      {quotes.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          기록된 명문장이 없습니다
        </div>
      ) : (
        quotes.slice(0, 3).map((q) => (
          <div key={q.id} className="quote-item">
            <div className="quote-item-text">"{q.text}"</div>
            {(q.page_number || q.note) && (
              <div className="quote-item-meta">
                {q.page_number ? `p.${q.page_number}` : ''}
                {q.page_number && q.note ? ' · ' : ''}
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

function SelectedDetail({ item }: { item: Item }) {
  const { deleteItem, openAddModal, openQuotesModal, selectItem } = useStore()
  const [detailOpen, setDetailOpen] = useState(false)
  const isBook = item.item_type === 'book'
  const statusMap = isBook ? STATUS_LABEL : STATUS_LABEL_MEDIA

  const handleDelete = () => {
    if (window.confirm(`"${item.title}"을(를) 삭제할까요?`)) {
      deleteItem(item.id)
    }
  }

  const coverSrc = item.cover_path
    ? (item.cover_path.startsWith('http') || item.cover_path.startsWith('data:'))
      ? item.cover_path
      : `file://${item.cover_path}`
    : null

  return (
    <>
      <button className="detail-close-btn" onClick={() => selectItem(null)} title="닫기">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <div className="detail-panel-scroll">
        {item.backdrop_path ? (
          <img className="detail-backdrop" src={item.backdrop_path} alt="" />
        ) : (
          <div className="detail-backdrop-placeholder">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              {isBook ? (
                <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>
              ) : (
                <><rect x="2" y="2" width="20" height="20" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>
              )}
            </svg>
          </div>
        )}

        <div className="detail-header">
          {coverSrc ? (
            <img className="detail-poster" src={coverSrc} alt={item.title} />
          ) : (
            <div className="detail-poster-placeholder">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                {isBook ? (
                  <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>
                ) : (
                  <><rect x="2" y="2" width="20" height="20" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>
                )}
              </svg>
            </div>
          )}
          <div className="detail-title-section">
            <div className="detail-title">{item.title}</div>
            {item.original_title && item.original_title !== item.title && (
              <div className="detail-original-title">{item.original_title}</div>
            )}
            {(isBook ? item.author : item.director) && (
              <div className="detail-header-author">
                {isBook ? item.author : item.director}
                {isBook && item.publisher && <span className="detail-header-pub"> · {item.publisher}</span>}
                {!isBook && item.platform && <span className="detail-header-pub"> · {item.platform}</span>}
              </div>
            )}
            <div className="detail-tags">
              <span className="tag">{TYPE_LABEL[item.item_type as ItemType]}</span>
              {item.year && <span className="tag">{item.year}</span>}
            </div>
          </div>
        </div>

        <div className="detail-body">
          {item.rating != null && (
            <div className="detail-section">
              <div className="detail-section-title"><span>내 별점</span></div>
              <StarRating value={item.rating} readonly size={22} />
            </div>
          )}

          {isBook && item.page_count && item.page_count > 0 && (
            <ProgressBar current={item.current_page || 0} total={item.page_count} />
          )}

          <div className="detail-section">
            <div className="detail-info-grid">
              {/* 저자/감독 + 출판사/플랫폼 */}
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
              {/* 연도 + 완독일/시청일 */}
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
              {/* 페이지 수 */}
              {isBook && item.page_count && item.page_count > 0 && (
                <div className="detail-info-item">
                  <div className="detail-info-label">페이지 수</div>
                  <div className="detail-info-value">{item.page_count}p</div>
                </div>
              )}
              {/* 장르 */}
              {item.genre && (
                <div className="detail-info-item detail-info-full">
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
            </div>

            {/* 자세히 토글 (ISBN만) */}
            {isBook && item.isbn && (
              <div className="detail-more-wrap">
                <button className="detail-more-btn" onClick={() => setDetailOpen(o => !o)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    style={{ transform: detailOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  {detailOpen ? '간단히' : '자세히'}
                </button>
                {detailOpen && (
                  <div className="detail-info-grid" style={{ marginTop: 6 }}>
                    <div className="detail-info-item detail-info-full">
                      <div className="detail-info-label">ISBN</div>
                      <div className="detail-info-value" style={{ fontSize: 12, letterSpacing: '0.02em' }}>{item.isbn}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {item.overview && (
            <div className="detail-section">
              <div className="detail-section-title"><span>줄거리</span></div>
              <div className="detail-overview">{item.overview}</div>
            </div>
          )}

          {item.review && (
            <div className="detail-section">
              <div className="detail-section-title"><span>{isBook ? '독후감' : '감상평'}</span></div>
              <div className="detail-review">{item.review}</div>
            </div>
          )}

          {isBook && <QuotesList itemId={item.id} />}
        </div>
      </div>

      {isBook && (
        <button className="detail-quotes-btn" onClick={openQuotesModal}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          명문장 기록하기
        </button>
      )}

      <div className="detail-actions">
        <button className="btn-secondary" style={{ flex: 1 }} onClick={() => openAddModal(item)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          편집
        </button>
        <button className="btn-danger" onClick={handleDelete} title="삭제">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4h6v2" />
          </svg>
        </button>
      </div>
    </>
  )
}

export default function DetailPanel({ panelOpen }: { panelOpen: boolean }) {
  const { itemList, selectedId } = useStore()
  const selected = itemList.find((m) => m.id === selectedId)

  return (
    <div className={`detail-panel${panelOpen ? ' detail-panel--open' : ''}`}>
      {selected && <SelectedDetail item={selected} />}
    </div>
  )
}
