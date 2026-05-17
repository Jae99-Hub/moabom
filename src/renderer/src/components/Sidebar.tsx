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
                className={`sidebar-item sidebar-genre-item${isActive ? ' active' : ''}`}
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
                <span className="count">{node.itemIds.size}</span>
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
  const { itemList, filters, setFilter, isSidebarOpen, closeSidebar, openSettings } = useStore()
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

  return (
    <>
      {/* 모바일: 사이드바 오버레이 */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar} />
      )}
    <div className={`sidebar${isSidebarOpen ? ' sidebar-open' : ''}`}>
      <div className="sidebar-section-title">라이브러리</div>

      <button
        className={`sidebar-item${filters.type === 'all' ? ' active' : ''}`}
        onClick={() => handleSelectType('all')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        전체
        <span className="count">{itemList.length}</span>
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
                className={`sidebar-item sidebar-type-item${isTypeActive ? ' active' : ''}`}
                onClick={() => handleSelectType(t.value)}
                style={{ flex: 1 }}
              >
                <span className="sidebar-type-dot" style={{ background: t.color }} />
                {t.label}
                <span className="count">{typeCount}</span>
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
      {/* 모바일 전용: 설정 버튼 */}
      <div className="sidebar-footer">
        <button className="sidebar-item sidebar-settings-btn" onClick={() => { openSettings(); closeSidebar() }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          설정
        </button>
      </div>
    </div>
    </>
  )
}
