import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { useStore, useStorePick, useFilteredItems, applyFilters } from '../store/useStore'
import ItemCard from './ItemCard'
import { CardContextMenu } from './CardContextMenu'
import { Item, ItemType, ItemStatus, QuoteSearchResult } from '../types'
import { coverSrc } from '../utils/cover'

import { TYPE_LABEL, STATUS_SHORT } from '../constants/itemMeta'

function QuoteResults({ results: allResults, query }: { results: QuoteSearchResult[]; query: string }) {
  const { itemList, selectItem, filters } = useStorePick('itemList', 'selectItem', 'filters')
  // 왼쪽·위의 종류·상태·장르 필터도 명대사 검색에 적용 (예전엔 필터가 켜져 보여도 무시됐음)
  const results = useMemo(() => {
    const allowed = new Set(applyFilters(itemList, { ...filters, search: '' }).map((m) => m.id))
    return allResults.filter((r) => allowed.has(r.item_id))
  }, [allResults, itemList, filters])

  if (results.length === 0) {
    return (
      <div className="media-grid-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <p>명문장·명대사 검색 결과가 없어요</p>
        <span>다른 낱말로 검색해 보세요</span>
      </div>
    )
  }

  return (
    <div className="quote-search-results">
      <div className="grid-count">"{query}" 검색 결과 {results.length}건</div>
      {results.map((r) => {
        const item = itemList.find((i) => i.id === r.item_id)
        const resultCover = coverSrc(r.cover_path, 'small')
        return (
          <div
            key={r.id}
            className="quote-result-card"
            role="button"
            tabIndex={0}
            onClick={() => item && selectItem(item.id)}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && item) { e.preventDefault(); selectItem(item.id) } }}
          >
            {resultCover ? (
              <img className="quote-result-cover" src={resultCover} alt="" loading="lazy" decoding="async" />
            ) : (
              <div className="quote-result-cover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  {r.item_type === 'book'
                    ? <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>
                    : <><rect x="2" y="2" width="20" height="20" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>}
                </svg>
              </div>
            )}
            <div className="quote-result-content">
              <div className="quote-result-text">"{r.text}"</div>
              <div className="quote-result-meta">
                <span className="quote-result-book">{r.item_title}</span>
                {!!r.page_number && <span>p.{r.page_number}</span>}
                {!!r.episode_number && <span>{r.episode_number}화</span>}
                {r.note && <span>— {r.note}</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const ItemRow = React.memo(function ItemRow({ item }: { item: Item }) {
  const isSelected = useStore((s) => s.selectedId === item.id)
  const isChecked = useStore((s) => s.checkedItems.includes(item.id))
  const selectionMode = useStore((s) => s.selectionMode)
  const { selectItem, toggleCheckedItem } = useStore.getState()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const coverUrl = coverSrc(item.cover_path, 'small')
  const [coverFailed, setCoverFailed] = useState(false)
  useEffect(() => setCoverFailed(false), [item.cover_path])

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
      role="button"
      tabIndex={0}
      data-item-id={item.id}
      aria-label={item.title}
      aria-pressed={selectionMode ? isChecked : undefined}
      onKeyDown={(e) => {
        if (!selectionMode && useStore.getState().selectedId != null) return // 상세창이 열려 있으면 무시
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() }
      }}
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
        {coverUrl && !coverFailed
          ? <img src={coverUrl} alt={item.title} loading="lazy" decoding="async" onError={() => setCoverFailed(true)} />
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
        <span className="list-row-title-text" title={item.title}>{item.title}</span>
        {item.original_title && item.original_title !== item.title && (
          <span className="list-row-original">{item.original_title}</span>
        )}
      </div>

      <div className="list-row-author">
        {item.author || item.director || '—'}
      </div>

      <div className="list-row-year">{item.year ?? '—'}</div>

      <div className="list-row-genre">
        {item.genre?.trim()
          ? item.genre.split(',').map(g => g.trim()).filter(Boolean).slice(0, 2).map((g, i) => (
              <span key={i} className="list-row-genre-tag">
                {g.replace(/\s*>\s*/g, ' › ')}
              </span>
            ))
          : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
      </div>

      <div className="list-row-right">
        {item.rating != null && (
          <span className="list-row-rating">★ {item.rating.toFixed(1)}</span>
        )}
        <span className={`list-row-status status-${item.status}`}>
          {STATUS_SHORT[item.status as ItemStatus]}
        </span>
        <span className={`list-row-type type-${item.item_type}`}>
          {TYPE_LABEL[item.item_type as ItemType]}
        </span>
      </div>
      {menu && <CardContextMenu item={item} x={menu.x} y={menu.y} onClose={closeMenu} />}
    </div>
  )
})

export default function ItemGrid() {
  const { filters, quoteSearchResults, quoteSearchQuery, viewMode, selectionMode, resetFilters } =
    useStorePick('filters', 'quoteSearchResults', 'quoteSearchQuery', 'viewMode', 'selectionMode', 'resetFilters')
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
          <p>{isFiltered ? '조건에 맞는 작품이 없어요' : '아직 기록한 작품이 없어요'}</p>
          <span>{isFiltered ? '다른 낱말이나 필터로 찾아보세요' : '오른쪽 위 + 추가 버튼으로 첫 작품을 등록해 보세요'}</span>
          {isFiltered && (
            <button className="btn-secondary btn-compact" style={{ marginTop: 12 }} onClick={resetFilters}>필터 초기화</button>
          )}
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
