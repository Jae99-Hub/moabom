import React from 'react'
import { useStore, useStorePick, selectFilteredItems, hasTrash } from '../store/useStore'
import { confirmDialog } from '../store/dialogs'
import { useEscapeKey } from '../hooks/useEscapeKey'

export default function SelectionBar() {
  const { selectionMode, checkedItems, exitSelectionMode, selectAllChecked, deleteCheckedItems } =
    useStorePick('selectionMode', 'checkedItems', 'exitSelectionMode', 'selectAllChecked', 'deleteCheckedItems')
  // 선택 모드일 때만 개수를 본다 (목록 계산은 공유 캐시라 다시 정렬하지 않음)
  const filteredCount = useStore((s) => (s.selectionMode ? selectFilteredItems(s).length : 0))
  useEscapeKey(exitSelectionMode, selectionMode) // Esc로 선택 모드 끝내기

  if (!selectionMode) return null

  const allSelected = filteredCount > 0 && checkedItems.length === filteredCount
  const count = checkedItems.length

  const handleToggleAll = () => {
    if (allSelected) {
      selectAllChecked([])
    } else {
      selectAllChecked(selectFilteredItems(useStore.getState()).map((i) => i.id))
    }
  }

  const handleDelete = async () => {
    if (count === 0) return
    const trashAvailable = hasTrash() // 웹 버전은 휴지통 없이 바로 삭제
    const ok = (count === 1 && trashAvailable) || await confirmDialog(trashAvailable
      ? { title: `${count}개를 휴지통으로 옮길까요?`, message: '15일 안에는 휴지통에서 되돌릴 수 있어요.', confirmText: '휴지통으로' }
      : { title: `${count}개를 삭제할까요?`, message: '삭제하면 되돌릴 수 없어요.', confirmText: '삭제', danger: true })
    if (ok) void deleteCheckedItems()
  }

  return (
    <div className="selection-bar" role="toolbar" aria-label="선택한 작품">
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
