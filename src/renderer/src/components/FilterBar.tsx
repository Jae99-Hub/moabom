import React from 'react'
import { useStorePick } from '../store/useStore'
import { ItemStatus } from '../types'
import { statusLabels, STATUS_SHORT } from '../constants/itemMeta'

const STATUS_OPTIONS: { value: ItemStatus | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'want', label: '읽고 싶다' },
  { value: 'reading', label: '읽는 중' },
  { value: 'done', label: '완료' },
  { value: 'dropped', label: '중단' }
]

// 모바일에서 짧게 표시할 라벨
const SHORT_LABELS: Record<string, string> = { all: '전체', ...STATUS_SHORT }

export default function FilterBar() {
  const { filters, setFilter, viewMode, toggleViewMode, selectionMode, enterSelectionMode, exitSelectionMode } =
    useStorePick('filters', 'setFilter', 'viewMode', 'toggleViewMode', 'selectionMode', 'enterSelectionMode', 'exitSelectionMode')

  // 책만 보면 '읽다', 영상만 보면 '보다', 섞여 있으면 공통 표현 (예전엔 '볼 예정'과 '읽는/보는 중'이 섞여 나왔음)
  const labels: Record<string, string> = { all: '전체', ...statusLabels(filters.type) }

  return (
    <div className="filter-bar" data-tour="filter">
      {STATUS_OPTIONS.map((s) => (
        <button
          key={s.value}
          className={`filter-chip${filters.status === s.value ? ' active' : ''}`}
          onClick={() => setFilter('status', s.value)}
        >
          <span className="chip-label-full">{labels[s.value] ?? s.label}</span>
          <span className="chip-label-short">{SHORT_LABELS[s.value] ?? s.label}</span>
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
        <option value="title_asc">제목순</option>
      </select>

      {/* 데스크탑: 두 개의 뷰 전환 버튼 */}
      <button className={`view-toggle-btn view-toggle-desktop${viewMode === 'grid' ? ' active' : ''}`} onClick={() => { if (viewMode !== 'grid') toggleViewMode() }} title="그리드 보기">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
        </svg>
      </button>
      <button className={`view-toggle-btn view-toggle-desktop${viewMode === 'list' ? ' active' : ''}`} onClick={() => { if (viewMode !== 'list') toggleViewMode() }} title="리스트 보기">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {/* 모바일: 단일 뷰 전환 버튼 */}
      <button className="view-toggle-btn view-toggle-single" onClick={toggleViewMode} title="뷰 전환">
        {viewMode === 'grid' ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
          </svg>
        )}
      </button>

      <div className="filter-divider" />

      <button
        className={`filter-chip${selectionMode ? ' active' : ''}`}
        onClick={selectionMode ? exitSelectionMode : enterSelectionMode}
      >
        <span className="chip-label-full">선택</span>
        <span className="chip-label-short">선택</span>
      </button>
    </div>
  )
}
