import React, { useEffect, useRef, useState } from 'react'
import { useStorePick } from '../store/useStore'
import { TrashItem } from '../types'
import { coverSrc } from '../utils/cover'
import { confirmDialog, showToast } from '../store/dialogs'
import { typeEmojiLabel } from '../constants/itemMeta'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { parseDbDate } from '../utils/date'
import { josa } from '../utils/korean'

const RETENTION_DAYS = 15

function daysLeft(deletedAt: string | null): number {
  const t = parseDbDate(deletedAt)?.getTime() ?? 0
  if (!t) return RETENTION_DAYS
  const left = RETENTION_DAYS - Math.floor((Date.now() - t) / 86_400_000)
  return Math.max(0, left)
}

/** 휴지통 항목을 클라우드에서도 영구삭제 — 클라우드에서도 휴지통에 있을 때만 (다른 기기에서 복원했으면 그대로 둠) */
async function cloudPurge(item: TrashItem): Promise<void> {
  if (!item.server_id) return
  try {
    const { supabase, isSupabaseConfigured } = await import('../api/supabaseClient')
    if (!isSupabaseConfigured || !supabase) return
    // getSession은 저장된 세션을 읽어 항목마다 서버에 묻지 않음 (휴지통 비우기 시 항목 수만큼 왕복하던 것)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    const { data: trashed } = await supabase.from('items').select('id')
      .eq('id', item.server_id).eq('user_id', user.id).eq('is_deleted', true).maybeSingle()
    if (!trashed) return
    await supabase.from('quotes').delete().eq('user_id', user.id).eq('item_id', item.server_id)
    await supabase.from('items').delete().eq('id', item.server_id).eq('user_id', user.id).eq('is_deleted', true)
  } catch { /* 오프라인이면 로컬만 삭제, 클라우드는 15일 후 자동 정리 */ }
}

export default function TrashModal() {
  const { isTrashOpen, closeTrash, fetchAll, triggerSync } = useStorePick('isTrashOpen', 'closeTrash', 'fetchAll', 'triggerSync')
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [emptying, setEmptying] = useState(false)
  useEscapeKey(closeTrash, isTrashOpen)
  const modalRef = useRef<HTMLDivElement>(null)
  useFocusTrap(modalRef, isTrashOpen)

  // quiet: 복원·삭제 뒤 목록만 다시 맞출 때 ('불러오는 중'으로 깜빡이지 않게)
  const refresh = async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const list = await window.api.trash.getAll()
      setItems(list)
    } catch {
      if (!quiet) setItems([])
    } finally {
      if (!quiet) setLoading(false)
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
    } catch {
      showToast('복원하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setBusyId(null)
      void refresh(true)
    }
  }

  const handlePurge = async (item: TrashItem) => {
    const ok = await confirmDialog({
      title: '완전히 삭제할까요?',
      message: `'${item.title}'${josa(item.title, '을/를')} 지우면 되돌릴 수 없어요.`,
      confirmText: '완전히 삭제',
      danger: true,
    })
    if (!ok) return
    setBusyId(item.id)
    try {
      // 이 기기에서 먼저 지우고(휴지통에 있을 때만), 지워졌을 때만 클라우드도 지운다
      if (await window.api.trash.purge(item.id)) await cloudPurge(item)
      else showToast('이미 복원됐거나 정리된 항목이에요.')
    } catch {
      showToast('삭제하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setBusyId(null)
      void refresh(true)
    }
  }

  const handleEmpty = async () => {
    if (items.length === 0) return
    const ok = await confirmDialog({
      title: '휴지통을 비울까요?',
      message: items.length === 1
        ? '휴지통의 1개를 완전히 삭제해요. 되돌릴 수 없어요.'
        : `${items.length}개를 모두 완전히 삭제해요. 되돌릴 수 없어요.`,
      confirmText: '비우기',
      danger: true,
    })
    if (!ok) return
    setEmptying(true)
    try {
      for (const item of [...items]) {
        try {
          if (await window.api.trash.purge(item.id)) await cloudPurge(item)
        } catch { /* 하나 실패해도 나머지는 계속 */ }
      }
    } finally {
      setEmptying(false)
      await refresh(true)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeTrash()}>
      <div className="settings-modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="휴지통">
        {/* 헤더 */}
        <div className="modal-header">
          <span className="modal-title">🗑️ 휴지통</span>
          <button className="btn-icon" onClick={closeTrash} aria-label="닫기" title="닫기">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-modal-body">
          <div className="settings-group-desc" style={{ marginBottom: 12 }}>
            삭제한 항목은 <strong>{RETENTION_DAYS}일</strong> 후 자동으로 영구 삭제돼요. 그 전에 복원할 수 있어요.
          </div>

          {loading || emptying ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>{emptying ? '비우는 중...' : '불러오는 중...'}</div>
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
                        src={coverSrc(item.cover_path, 'small') ?? undefined}
                        alt=""
                        style={{ width: 36, height: 52, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div style={{ width: 36, height: 52, borderRadius: 4, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.title}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {typeEmojiLabel(item.item_type)}
                        {' · '}
                        <span style={{ color: left <= 3 ? 'var(--danger)' : 'var(--text-muted)' }}>
                          {left}일 후 삭제
                        </span>
                      </div>
                    </div>
                    <button
                      className="btn-secondary btn-compact"
                      style={{ padding: '6px 12px' }}
                      onClick={() => handleRestore(item)}
                      disabled={busy}
                      aria-label={`${item.title} 복원`}
                    >
                      복원
                    </button>
                    <button
                      className="btn-secondary btn-compact"
                      aria-label={`${item.title} 영구삭제`}
                      style={{ padding: '6px 12px', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }}
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
              disabled={loading || emptying}
            >
              휴지통 비우기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
