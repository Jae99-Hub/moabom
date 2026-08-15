import React, { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { TrashItem } from '../types'

const TYPE_LABEL: Record<string, string> = { book: '📚 도서', movie: '🎬 영화', drama: '📺 드라마', documentary: '🎞️ 다큐' }
const RETENTION_DAYS = 15

function parseTs(s: string | null | undefined): number {
  if (!s) return 0
  const t = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z').getTime()
  return isNaN(t) ? 0 : t
}

function daysLeft(deletedAt: string | null): number {
  const t = parseTs(deletedAt)
  if (!t) return RETENTION_DAYS
  const left = RETENTION_DAYS - Math.floor((Date.now() - t) / 86_400_000)
  return Math.max(0, left)
}

/** 휴지통 항목을 클라우드에서도 영구삭제 */
async function cloudPurge(item: TrashItem): Promise<void> {
  if (!item.server_id) return
  try {
    const { supabase, isSupabaseConfigured } = await import('../api/supabaseClient')
    if (!isSupabaseConfigured || !supabase) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('quotes').delete().eq('user_id', user.id).eq('item_id', item.server_id)
    await supabase.from('items').delete().eq('id', item.server_id).eq('user_id', user.id)
  } catch { /* 오프라인이면 로컬만 삭제, 클라우드는 15일 후 자동 정리 */ }
}

export default function TrashModal() {
  const { isTrashOpen, closeTrash, fetchAll, triggerSync } = useStore()
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const list = await window.api.trash.getAll()
      setItems(list)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isTrashOpen) refresh()
  }, [isTrashOpen])

  if (!isTrashOpen) return null

  const handleRestore = async (item: TrashItem) => {
    setBusyId(item.id)
    try {
      await window.api.trash.restore(item.id)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      await fetchAll()
      triggerSync()
    } finally {
      setBusyId(null)
    }
  }

  const handlePurge = async (item: TrashItem) => {
    if (!window.confirm(`"${item.title}"을(를) 완전히 삭제할까요? 이 작업은 되돌릴 수 없어요.`)) return
    setBusyId(item.id)
    try {
      await cloudPurge(item)
      await window.api.trash.purge(item.id)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    } finally {
      setBusyId(null)
    }
  }

  const handleEmpty = async () => {
    if (items.length === 0) return
    if (!window.confirm(`휴지통의 ${items.length}개 항목을 모두 완전히 삭제할까요? 되돌릴 수 없어요.`)) return
    setLoading(true)
    try {
      for (const item of [...items]) {
        await cloudPurge(item)
        await window.api.trash.purge(item.id)
      }
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeTrash()}>
      <div className="settings-modal">
        {/* 헤더 */}
        <div className="modal-header">
          <span className="modal-title">🗑️ 휴지통</span>
          <button className="btn-icon" onClick={closeTrash}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-modal-body">
          <div className="settings-group-desc" style={{ marginBottom: 12 }}>
            삭제한 항목은 <strong>{RETENTION_DAYS}일</strong> 후 자동으로 영구 삭제돼요. 그 전에 복원할 수 있어요.
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>불러오는 중...</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🗑️</div>
              <div>휴지통이 비어 있어요</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((item) => {
                const left = daysLeft(item.deleted_at)
                const busy = busyId === item.id
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', borderRadius: 10,
                      background: 'var(--surface-2, rgba(255,255,255,0.03))',
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    {item.cover_path ? (
                      <img
                        src={item.cover_path}
                        alt=""
                        style={{ width: 36, height: 52, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div style={{ width: 36, height: 52, borderRadius: 4, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {TYPE_LABEL[item.item_type] ?? item.item_type}
                        {' · '}
                        <span style={{ color: left <= 3 ? 'var(--danger)' : 'var(--text-muted)' }}>
                          {left}일 후 삭제
                        </span>
                      </div>
                    </div>
                    <button
                      className="btn-secondary"
                      style={{ flexShrink: 0, padding: '6px 12px' }}
                      onClick={() => handleRestore(item)}
                      disabled={busy}
                    >
                      복원
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ flexShrink: 0, padding: '6px 12px', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }}
                      onClick={() => handlePurge(item)}
                      disabled={busy}
                    >
                      영구삭제
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="modal-footer">
          <button className="btn-secondary" style={{ width: 80 }} onClick={closeTrash}>닫기</button>
          {items.length > 0 && (
            <button
              className="btn-secondary"
              style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }}
              onClick={handleEmpty}
              disabled={loading}
            >
              휴지통 비우기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
