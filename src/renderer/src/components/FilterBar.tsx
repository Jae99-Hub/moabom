import React from 'react'
import { useStore, useFilteredItems } from '../store/useStore'
import { ItemStatus } from '../types'

const STATUS_OPTIONS: { value: ItemStatus | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'want', label: '읽고 싶다' },
  { value: 'reading', label: '읽는 중' },
  { value: 'done', label: '완료' },
  { value: 'dropped', label: '중단' }
]

export default function FilterBar() {
  const { filters, setFilter, itemList, viewMode, toggleViewMode, selectionMode, enterSelectionMode, exitSelectionMode } = useStore()
  const filtered = useFilteredItems()

  const currentType = filters.type
  const isBook = currentType === 'book'
  const isMixed = currentType === 'all'

  const readingLabel = isBook ? '읽는 중' : isMixed ? '읽는/보는 중' : '보는 중'
  const doneLabel = isBook ? '완독' : isMixed ? '완료' : '시청 완료'

  const statusLabels: Record<string, string> = {
    all: '전체',
    want: isBook ? '읽고 싶다' : '볼 예정',
    reading: readingLabel,
    done: doneLabel,
    dropped: '중단'
  }

  return (
    <div className="filter-bar">
      {STATUS_OPTIONS.map((s) => (
        <button
          key={s.value}
          className={`filter-chip${filters.status === s.value ? ' active' : ''}`}
          onClick={() => setFilter('status', s.value)}
        >
          {statusLabels[s.value] ?? s.label}
        </button>
      ))}

      <div className="filter-divider" />

      <select
        className="sort-select"
        value={filters.sort}
        onChange={(e) => setFilter('sort', e.target.value)}
      >
        <option value="date_desc">최근 추가순</option>
        <option value="date_asc">오래된순</option>
        <option value="rating_desc">별점 높은순</option>
        <option value="rating_asc">별점 낮은순</option>
        <option value="title_asc">제목 가나다순</option>
      </select>

      <button className={`view-toggle-btn${viewMode === 'grid' ? ' active' : ''}`} onClick={toggleViewMode} title="그리드 보기">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
        </svg>
      </button>
      <button className={`view-toggle-btn${viewMode === 'list' ? ' active' : ''}`} onClick={toggleViewMode} title="리스트 보기">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      <div className="filter-divider" />

      <button
        className={`filter-chip${selectionMode ? ' active' : ''}`}
        onClick={selectionMode ? exitSelectionMode : enterSelectionMode}
      >
        선택
      </button>
    </div>
  )
}
