import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Item } from '../types'
import { useStore } from '../store/useStore'

export function CardContextMenu({ item, x, y, onClose }: { item: Item; x: number; y: number; onClose: () => void }) {
  const { deleteItem, openAddModal, selectItem } = useStore()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const [visible, setVisible] = useState(false)

  // 화면 가장자리 벗어남 방지 + 위치 확정 후 보이기 (깜빡임 방지)
  useEffect(() => {
    if (!ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    setPos({
      x: x + width > window.innerWidth ? x - width : x,
      y: y + height > window.innerHeight ? y - height : y,
    })
    setVisible(true)
  }, [x, y])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    openAddModal(item)
    onClose()
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClose()
    if (window.confirm(`"${item.title}"을(를) 삭제할까요?`)) {
      deleteItem(item.id)
      selectItem(null)
    }
  }

  return ReactDOM.createPortal(
    <div
      ref={ref}
      className="card-menu"
      style={{ position: 'fixed', top: pos.y, left: pos.x, visibility: visible ? 'visible' : 'hidden' }}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="card-menu-item" onClick={handleEdit}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        편집
      </button>
      <button className="card-menu-item danger" onClick={handleDelete}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4h6v2" />
        </svg>
        삭제
      </button>
    </div>,
    document.body
  )
}
