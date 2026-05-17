import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { Quote } from '../types'

export default function QuotesModal() {
  const { isQuotesModalOpen, closeQuotesModal, bumpQuotesVersion, selectedId, itemList } = useStore()
  const item = itemList.find((i) => i.id === selectedId)

  const [quotes, setQuotes] = useState<Quote[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [editPage, setEditPage] = useState('')
  const [editNote, setEditNote] = useState('')
  const [newText, setNewText] = useState('')
  const [newPage, setNewPage] = useState('')
  const [newNote, setNewNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [mutError, setMutError] = useState<string | null>(null)

  // 레이스 컨디션 방지: 마지막 reload 요청만 반영
  const reloadSeqRef = useRef(0)

  useEffect(() => {
    if (isQuotesModalOpen && selectedId) {
      window.api.quotes.getByItemId(selectedId).then(setQuotes).catch(() => {})
    }
  }, [isQuotesModalOpen, selectedId])

  const reload = async () => {
    if (!selectedId) return
    const seq = ++reloadSeqRef.current
    try {
      const q = await window.api.quotes.getByItemId(selectedId)
      if (seq === reloadSeqRef.current) {
        setQuotes(q)
        bumpQuotesVersion()
      }
    } catch { /* 조용히 무시 */ }
  }

  const handleAdd = async () => {
    if (!newText.trim() || !selectedId) return
    setIsSaving(true)
    setMutError(null)
    try {
      await window.api.quotes.insert({
        item_id: selectedId,
        text: newText.trim(),
        page_number: newPage ? parseInt(newPage) : null,
        note: newNote.trim() || null
      })
      setNewText('')
      setNewPage('')
      setNewNote('')
      await reload()
    } catch {
      setMutError('추가에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setIsSaving(false)
    }
  }

  const startEdit = (q: Quote) => {
    setEditingId(q.id)
    setEditText(q.text)
    setEditPage(q.page_number ? String(q.page_number) : '')
    setEditNote(q.note ?? '')
    setMutError(null)
  }

  const handleSaveEdit = async (id: number) => {
    setIsSaving(true)
    setMutError(null)
    try {
      await window.api.quotes.update(id, {
        text: editText.trim(),
        page_number: editPage ? parseInt(editPage) : null,
        note: editNote.trim() || null
      })
      setEditingId(null)
      await reload()
    } catch {
      setMutError('저장에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('이 명언을 삭제할까요?')) return
    setMutError(null)
    try {
      await window.api.quotes.delete(id)
      await reload()
    } catch {
      setMutError('삭제에 실패했습니다. 다시 시도해주세요.')
    }
  }

  if (!isQuotesModalOpen) return null

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeQuotesModal()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <span className="modal-title">
            {item ? `"${item.title}" 명언 · 문장` : '명언 · 문장'}
          </span>
          <button className="btn-icon" onClick={closeQuotesModal}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {mutError && (
            <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, fontSize: 12, color: 'var(--danger)', marginBottom: 12 }}>
              {mutError}
            </div>
          )}
          {/* 새 명언 추가 */}
          <div className="add-quote-form">
            <div className="form-group">
              <label className="form-label">새 명언 · 문장 추가</label>
              <textarea
                className="form-textarea"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="기억하고 싶은 문장을 입력하세요..."
                rows={3}
                style={{ minHeight: 70 }}
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">페이지 번호 (선택)</label>
                <input
                  className="form-input"
                  type="number"
                  value={newPage}
                  onChange={(e) => setNewPage(e.target.value)}
                  placeholder="p."
                  min={1}
                />
              </div>
              <div className="form-group">
                <label className="form-label">메모 (선택)</label>
                <input
                  className="form-input"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="이 문장에 대한 생각..."
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn-primary"
                onClick={handleAdd}
                disabled={isSaving || !newText.trim()}
                style={{ height: 34, fontSize: 13 }}
              >
                {isSaving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '추가'}
              </button>
            </div>
          </div>

          {/* 기존 명언 목록 */}
          {quotes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              아직 기록된 명언이 없습니다
            </div>
          ) : (
            <div className="quotes-list">
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                총 {quotes.length}개
              </div>
              {quotes.map((q) => (
                <div key={q.id} className="quote-edit-item">
                  {editingId === q.id ? (
                    <>
                      <textarea
                        className="form-textarea"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        style={{ minHeight: 60 }}
                      />
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">페이지</label>
                          <input className="form-input" type="number" value={editPage} onChange={(e) => setEditPage(e.target.value)} placeholder="p." min={1} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">메모</label>
                          <input className="form-input" value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="메모..." />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn-text" onClick={() => setEditingId(null)}>취소</button>
                        <button className="btn-primary" style={{ height: 30, fontSize: 12, padding: '0 12px' }} onClick={() => handleSaveEdit(q.id)} disabled={isSaving}>{isSaving ? '저장 중...' : '저장'}</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="quote-edit-row">
                        <div style={{ flex: 1 }}>
                          <div className="quote-edit-text">"{q.text}"</div>
                          {(q.page_number || q.note) && (
                            <div className="quote-edit-meta" style={{ marginTop: 6 }}>
                              {q.page_number ? <span style={{ fontWeight: 600 }}>p.{q.page_number}</span> : null}
                              {q.page_number && q.note ? ' · ' : ''}
                              {q.note ? <span style={{ fontStyle: 'italic' }}>{q.note}</span> : null}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button className="btn-text" onClick={() => startEdit(q)}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button className="btn-text danger" onClick={() => handleDelete(q.id)}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14H6L5 6" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" style={{ width: 80 }} onClick={closeQuotesModal}>닫기</button>
        </div>
      </div>
    </div>
  )
}
