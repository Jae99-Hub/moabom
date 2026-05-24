import React, { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { Item, ItemType } from '../types'

const TYPES: { value: ItemType; label: string; color: string }[] = [
  { value: 'book',  label: '도서',   color: '#3b82f6' },
  { value: 'movie', label: '영화',  color: '#8b5cf6' },
  { value: 'drama', label: '드라마', color: '#ec4899' }
]

type GenreNode = {
  itemIds: Set<number>
  path: string
  children: Map<string, GenreNode>
}

function buildForest(items: Item[], itemType: string): Map<string, GenreNode> {
  const forest = new Map<string, GenreNode>()
  items
    .filter((item) => item.item_type === itemType && item.genre)
    .forEach((item) => {
      const paths = item.genre!
        .split(',')
        .map((p) => p.trim().split('>').map((s) => s.trim()).filter(Boolean))
      paths.forEach((path) => {
        let cur = forest
        let fullPath = ''
        path.forEach((seg, i) => {
          fullPath = i === 0 ? seg : `${fullPath}>${seg}`
          if (!cur.has(seg)) cur.set(seg, { itemIds: new Set(), path: fullPath, children: new Map() })
          cur.get(seg)!.itemIds.add(item.id)
          cur = cur.get(seg)!.children
        })
      })
    })
  return forest
}

function sorted(map: Map<string, GenreNode>): [string, GenreNode][] {
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'ko'))
}

function GenreNodes({
  nodes, type, depth, expanded, onToggle, onSelect, activeGenre, activeType
}: {
  nodes: Map<string, GenreNode>
  type: ItemType
  depth: number
  expanded: Set<string>
  onToggle: (path: string) => void
  onSelect: (type: ItemType, path: string) => void
  activeGenre: string
  activeType: string
}) {
  return (
    <>
      {sorted(nodes).map(([name, node]) => {
        const isActive = activeType === type && activeGenre === node.path
        const hasChildren = node.children.size > 0
        const isOpen = expanded.has(node.path)
        return (
          <div key={node.path}>
            <div className="sidebar-genre-row">
              <button
                className={`sidebar-nav-item sidebar-genre-item${isActive ? ' active' : ''}`}
                style={{ paddingLeft: 12 + Math.min(depth, 4) * 14 }}
                onClick={() => { onSelect(type, node.path); if (hasChildren) onToggle(node.path) }}
              >
                {hasChildren && (
                  <svg
                    width="12" height="12" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2.5"
                    style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
                {!hasChildren && <span className="sidebar-genre-hash">{depth === 0 ? '#' : '·'}</span>}
                <span className="sidebar-genre-name">{name}</span>
                <span className="nav-count">{node.itemIds.size}</span>
              </button>
            </div>
            {isOpen && hasChildren && (
              <GenreNodes
                nodes={node.children} type={type} depth={depth + 1}
                expanded={expanded} onToggle={onToggle} onSelect={onSelect}
                activeGenre={activeGenre} activeType={activeType}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

export default function Sidebar() {
  const { itemList, filters, setFilter, isSidebarOpen, closeSidebar, openSettings, openStats } = useStore()
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['book', 'movie', 'drama']))

  const forests = useMemo(() => ({
    book:  buildForest(itemList, 'book'),
    movie: buildForest(itemList, 'movie'),
    drama: buildForest(itemList, 'drama')
  }), [itemList])

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const selectType = (type: ItemType | 'all') => {
    setFilter('type', type)
    setFilter('genre', 'all')
  }

  const selectGenre = (type: ItemType, path: string) => {
    setFilter('type', type)
    setFilter('genre', path)
    closeSidebar() // 모바일: 선택 후 사이드바 닫기
  }

  const handleSelectType = (type: ItemType | 'all') => {
    selectType(type)
    closeSidebar() // 모바일: 선택 후 사이드바 닫기
  }

  const bookCount = itemList.filter((m) => m.item_type === 'book').length
  const movieCount = itemList.filter((m) => m.item_type === 'movie').length
  const dramaCount = itemList.filter((m) => m.item_type === 'drama').length

  return (
    <>
      {/* 모바일: 사이드바 오버레이 */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar} />
      )}
    <div className={`sidebar${isSidebarOpen ? ' sidebar-open' : ''}`}>

      {/* Stats row */}
      <div className="sidebar-stats">
        <div className="sidebar-stat">
          <span className="sidebar-stat-dot" style={{ background: '#3b82f6' }} />
          <span className="sidebar-stat-number">{bookCount}</span>
          <span className="sidebar-stat-label">도서</span>
        </div>
        <div className="sidebar-stat">
          <span className="sidebar-stat-dot" style={{ background: '#8b5cf6' }} />
          <span className="sidebar-stat-number">{movieCount}</span>
          <span className="sidebar-stat-label">영화</span>
        </div>
        <div className="sidebar-stat">
          <span className="sidebar-stat-dot" style={{ background: '#ec4899' }} />
          <span className="sidebar-stat-number">{dramaCount}</span>
          <span className="sidebar-stat-label">드라마</span>
        </div>
      </div>

      <div className="sidebar-section-header">라이브러리</div>

      {/* 전체 */}
      <button
        className={`sidebar-nav-item${filters.type === 'all' ? ' active' : ''}`}
        onClick={() => handleSelectType('all')}
      >
        <span className="sidebar-type-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </span>
        전체
        <span className="nav-count">{itemList.length}</span>
      </button>

      {TYPES.map((t) => {
        const forest = forests[t.value]
        const isOpen = expanded.has(t.value)
        const typeCount = itemList.filter((m) => m.item_type === t.value).length
        const isTypeActive = filters.type === t.value && filters.genre === 'all'

        return (
          <div key={t.value}>
            <div className="sidebar-type-row">
              <button
                className={`sidebar-nav-item sidebar-type-item${isTypeActive ? ' active' : ''}`}
                onClick={() => handleSelectType(t.value)}
                style={{ flex: 1 }}
              >
                <span className="sidebar-type-icon" style={{ color: t.color }}>
                  {t.value === 'book' && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    </svg>
                  )}
                  {t.value === 'movie' && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                      <line x1="7" y1="2" x2="7" y2="22" />
                      <line x1="17" y1="2" x2="17" y2="22" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <line x1="2" y1="7" x2="7" y2="7" />
                      <line x1="2" y1="17" x2="7" y2="17" />
                      <line x1="17" y1="17" x2="22" y2="17" />
                      <line x1="17" y1="7" x2="22" y2="7" />
                    </svg>
                  )}
                  {t.value === 'drama' && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
                      <polyline points="17 2 12 7 7 2" />
                    </svg>
                  )}
                </span>
                {t.label}
                <span className="nav-count">{typeCount}</span>
              </button>
              {forest.size > 0 && (
                <button
                  className="sidebar-expand-btn"
                  onClick={() => toggle(t.value)}
                  title={isOpen ? '접기' : '펼치기'}
                >
                  <svg
                    width="13" height="13" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2.5"
                    style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )}
            </div>

            {isOpen && forest.size > 0 && (
              <div className="sidebar-genre-group">
                <GenreNodes
                  nodes={forest} type={t.value} depth={0}
                  expanded={expanded} onToggle={toggle} onSelect={selectGenre}
                  activeGenre={filters.genre} activeType={filters.type}
                />
              </div>
            )}
          </div>
        )
      })}

      {/* 통계 + 설정 버튼 (데스크탑 + 모바일 공통) */}
      <div className="sidebar-footer">
        <button className="sidebar-nav-item" onClick={() => { openStats(); closeSidebar() }}>
          <span className="sidebar-type-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </span>
          통계
        </button>
        <button className="sidebar-nav-item sidebar-settings-btn" onClick={() => { openSettings(); closeSidebar() }}>
          <span className="sidebar-type-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </span>
          설정
        </button>
      </div>
    </div>
    </>
  )
}
