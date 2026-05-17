import React, { useState } from 'react'
import { useStore, useFilteredItems } from '../store/useStore'
import ItemCard from './ItemCard'
import { CardContextMenu } from './CardContextMenu'
import { Item, ItemType, ItemStatus, QuoteSearchResult } from '../types'

const TYPE_LABEL: Record<ItemType, string> = { book: '도서', movie: '영화', drama: '드라마' }
const STATUS_LABEL: Record<ItemStatus, string> = { want: '예정', reading: '진행', done: '완료', dropped: '중단' }

function QuoteResults({ results, query }: { results: QuoteSearchResult[]; query: string }) {
  const { itemList, selectItem } = useStore()

  if (results.length === 0) {
    return (
      <div className="media-grid-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <p>명언 검색 결과가 없습니다</p>
        <span>다른 키워드로 검색해보세요</span>
      </div>
    )
  }

  return (
    <div className="quote-search-results">
      <div className="grid-count">"{query}" 검색 결과 {results.length}건</div>
      {results.map((r) => {
        const item = itemList.find((i) => i.id === r.item_id)
        return (
          <div key={r.id} className="quote-result-card" onClick={() => item && selectItem(item.id)}>
            {r.cover_path ? (
              <img className="quote-result-cover" src={`file://${r.cover_path}`} alt="" />
            ) : (
              <div className="quote-result-cover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </div>
            )}
            <div className="quote-result-content">
              <div className="quote-result-text">"{r.text}"</div>
              <div className="quote-result-meta">
                <span className="quote-result-book">{r.item_title}</span>
                {r.page_number && <span>p.{r.page_number}</span>}
                {r.note && <span>— {r.note}</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ItemRow({ item }: { item: Item }) {
  const { selectedId, selectItem, selectionMode, checkedItems, toggleCheckedItem } = useStore()
  const isSelected = selectedId === item.id
  const isChecked = checkedItems.includes(item.id)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const coverSrc = item.cover_path
    ? item.cover_path.startsWith('http') ? item.cover_path : `file://${item.cover_path}`
    : null

  const handleContextMenu = (e: React.MouseEvent) => {
    if (selectionMode) return
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  const handleClick = () => {
    if (selectionMode) {
      toggleCheckedItem(item.id)
    } else {
      selectItem(isSelected ? null : item.id)
    }
  }

  return (
    <div
      className={`list-row${isSelected && !selectionMode ? ' selected' : ''}${selectionMode && isChecked ? ' checked' : ''}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {selectionMode && (
        <span className={`selection-checkbox${isChecked ? ' checked' : ''}`} style={{ flexShrink: 0 }}>
          {isChecked && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </span>
      )}
      <div className="list-row-cover">
        {coverSrc
          ? <img src={coverSrc} alt={item.title} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          : <div className="list-row-cover-placeholder">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                {item.item_type === 'book'
                  ? <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>
                  : <><rect x="2" y="2" width="20" height="20" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>}
              </svg>
            </div>
        }
      </div>

      <div className="list-row-title">
        <span className="list-row-title-text">{item.title}</span>
        {item.original_title && item.original_title !== item.title && (
          <span className="list-row-original">{item.original_title}</span>
        )}
      </div>

      <div className="list-row-author">
        {item.author || item.director || '—'}
      </div>

      <div className="list-row-year">{item.year ?? '—'}</div>

      <div className="list-row-genre">
        {item.genre
          ? item.genre.split(',').map(g => g.trim()).filter(Boolean).slice(0, 2).map((g, i) => (
              <span key={i} className="list-row-genre-tag">
                {g.split('>').map(s => s.trim()).pop()}
              </span>
            ))
          : null}
      </div>

      <div className="list-row-right">
        {item.rating != null && (
          <span className="list-row-rating">★ {item.rating.toFixed(1)}</span>
        )}
        <span className={`list-row-status status-${item.status}`}>
          {STATUS_LABEL[item.status as ItemStatus]}
        </span>
        <span className={`list-row-type type-${item.item_type}`}>
          {TYPE_LABEL[item.item_type as ItemType]}
        </span>
      </div>
      {menu && <CardContextMenu item={item} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </div>
  )
}

export default function ItemGrid() {
  const { filters, quoteSearchResults, quoteSearchQuery, viewMode, itemList, selectionMode } = useStore()
  const filtered = useFilteredItems()

  if (filters.searchMode === 'quote' && filters.search.trim()) {
    return <QuoteResults results={quoteSearchResults} query={quoteSearchQuery} />
  }

  if (filtered.length === 0) {
    const isFiltered =
      filters.search.trim() !== '' ||
      filters.type !== 'all' ||
      filters.status !== 'all' ||
      filters.genre !== 'all'
    return (
      <div className="media-grid-wrapper">
        <div className="media-grid-empty">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <p>{isFiltered ? '검색 결과가 없습니다' : '아직 기록이 없습니다'}</p>
          <span>{isFiltered ? '다른 키워드나 필터로 검색해보세요' : '오른쪽 위 + 추가 버튼으로 시작하세요'}</span>
        </div>
      </div>
    )
  }

  if (viewMode === 'list') {
    return (
      <div className="media-grid-wrapper">
        <div className="grid-count">{filtered.length}개</div>
        <div className="list-view" style={{ marginTop: 8 }}>
          <div className="list-header">
            {selectionMode && <div style={{ width: 20, flexShrink: 0 }} />}
            <div className="list-row-cover" />
            <div className="list-row-title">제목</div>
            <div className="list-row-author">저자 / 감독</div>
            <div className="list-row-year">연도</div>
            <div className="list-row-genre">장르</div>
            <div className="list-row-right">별점 / 상태</div>
          </div>
          {filtered.map((item) => <ItemRow key={item.id} item={item} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="media-grid-wrapper">
      <div className="grid-count">{filtered.length}개</div>
      <div className="media-grid" style={{ marginTop: 8 }}>
        {filtered.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}
