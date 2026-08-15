import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Item, ItemType, ItemStatus } from '../types'
import { useStore } from '../store/useStore'
import { CardContextMenu } from './CardContextMenu'


const TYPE_LABEL: Record<ItemType, string> = { book: '도서', movie: '영화', drama: '드라마', documentary: '다큐' }
const STATUS_LABEL: Record<ItemStatus, string> = {
  want: '예정',
  reading: '진행',
  done: '완료',
  dropped: '중단'
}

function getProgress(item: Item): number | null {
  if (item.item_type !== 'book') return null
  if (!item.page_count || item.page_count === 0) return null
  return Math.min(100, Math.round((item.current_page / item.page_count) * 100))
}


export default function ItemCard({ item }: { item: Item }) {
  const { selectedId, selectItem, selectionMode, checkedItems, toggleCheckedItem } = useStore()
  const isSelected = selectedId === item.id
  const isChecked = checkedItems.includes(item.id)
  const progress = getProgress(item)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchMoved = useRef(false)

  const handleContextMenu = (e: React.MouseEvent) => {
    if (selectionMode) return
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  // 모바일 롱프레스 (500ms)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (selectionMode) return
    touchMoved.current = false
    const touch = e.touches[0]
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current) {
        setMenu({ x: touch.clientX, y: touch.clientY })
      }
    }, 500)
  }

  const handleTouchMove = () => {
    touchMoved.current = true
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  // 언마운트 시 타이머 해제 (stale setState 방지)
  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
    }
  }, [])

  const handleClick = () => {
    if (selectionMode) {
      toggleCheckedItem(item.id)
    } else {
      selectItem(isSelected ? null : item.id)
    }
  }

  return (
    <div
      className={`media-card${isSelected && !selectionMode ? ' selected' : ''}${selectionMode && isChecked ? ' checked' : ''}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {selectionMode && (
        <div className="card-checkbox">
          <span className={`selection-checkbox${isChecked ? ' checked' : ''}`}>
            {isChecked && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </span>
        </div>
      )}
      {item.cover_path ? (
        <img
          className="media-card-poster"
          src={item.cover_path.startsWith('http') || item.cover_path.startsWith('data:') ? item.cover_path : `file://${item.cover_path}`}
          alt={item.title}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      ) : (
        <div className="media-card-poster-placeholder">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            {item.item_type === 'book' ? (
              <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>
            ) : (
              <><rect x="2" y="2" width="20" height="20" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>
            )}
          </svg>
          <span className="media-card-placeholder-title">{item.title}</span>
        </div>
      )}

      <span className={`media-card-status status-${item.status}`}>
        {STATUS_LABEL[item.status as ItemStatus]}
      </span>

      <span className={`media-card-type type-${item.item_type}`}>
        {TYPE_LABEL[item.item_type as ItemType]}
      </span>

      {progress !== null && item.status === 'reading' && (
        <div className="media-card-progress">
          <div className="media-card-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="media-card-info">
        <div className="media-card-title">{item.title}</div>
        <div className="media-card-meta">
          <span className="media-card-year">
            {[item.author || item.director, item.year].filter(Boolean).join(' · ')}
          </span>
          {item.rating != null && (
            <span className="media-card-rating">
              ★ {item.rating.toFixed(1)}
            </span>
          )}
        </div>
        {item.genre && (
          <div className="media-card-genre">
            {item.genre.split(',').map((g) => g.trim()).filter(Boolean).slice(0, 2).map((g, i) => (
              <span key={i} className="media-card-genre-tag">
                {g.split('>').map((s) => s.trim()).join(' › ')}
              </span>
            ))}
          </div>
        )}
      </div>

      {menu && <CardContextMenu item={item} x={menu.x} y={menu.y} onClose={closeMenu} />}
    </div>
  )
}
