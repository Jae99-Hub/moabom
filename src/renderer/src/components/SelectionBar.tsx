import React from 'react'
import { useStore, useFilteredItems } from '../store/useStore'

export default function SelectionBar() {
  const { selectionMode, checkedItems, exitSelectionMode, selectAllChecked, deleteCheckedItems } = useStore()
  const filtered = useFilteredItems()

  if (!selectionMode) return null

  const allSelected = filtered.length > 0 && checkedItems.length === filtered.length
  const count = checkedItems.length

  const handleToggleAll = () => {
    if (allSelected) {
      selectAllChecked([])
    } else {
      selectAllChecked(filtered.map((i) => i.id))
    }
  }

  const handleDelete = () => {
    if (count === 0) return
    if (window.confirm(`선택한 ${count}개 항목을 삭제할까요?`)) {
      deleteCheckedItems()
    }
  }

  return (
    <div className="selection-bar">
      <button className="selection-bar-cancel" onClick={exitSelectionMode}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        취소
      </button>

      <button className="selection-bar-all" onClick={handleToggleAll}>
        <span className={`selection-checkbox${allSelected ? ' checked' : ''}`}>
          {allSelected && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </span>
        전체 선택
      </button>

      <span className="selection-bar-count">
        {count > 0 ? `${count}개 선택됨` : '항목을 선택하세요'}
      </span>

      <button
        className="selection-bar-delete"
        onClick={handleDelete}
        disabled={count === 0}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4h6v2" />
        </svg>
        삭제 ({count})
      </button>
    </div>
  )
}
