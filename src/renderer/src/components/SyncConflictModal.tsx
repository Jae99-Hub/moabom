import React, { useState } from 'react'
import { useStorePick } from '../store/useStore'
import { coverSrc } from '../utils/cover'
import { confirmDialog, alertDialog } from '../store/dialogs'
import { typeEmojiLabel, statusLabel } from '../constants/itemMeta'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { resolveConflict, SyncConflict, mergeItemFields } from '../api/syncService'

function excerpt(text: unknown, max = 60): string {
  const s = String(text ?? '')
  return s.length > max ? s.slice(0, max) + '…' : s
}

function ItemSide({
  label,
  item,
  highlight,
}: {
  label: string
  item: Record<string, unknown>
  highlight?: 'local' | 'cloud'
}) {
  const rating = item.rating != null ? Number(item.rating).toFixed(1) : null
  return (
    <div className={`conflict-side ${highlight ? `conflict-side--${highlight}` : ''}`}>
      <div className="conflict-side-label">{label}</div>
      {!!item.cover_path && (
        <img
          className="conflict-side-cover"
          src={coverSrc(String(item.cover_path)) ?? undefined}
          alt=""
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
      <div className="conflict-side-title">{String(item.title ?? '')}</div>
      <div className="conflict-side-meta">
        <span>{typeEmojiLabel(String(item.item_type ?? ''))}</span>
        {!!item.year && <span>· {String(item.year)}</span>}
        {!!(item.author || item.director) && (
          <span>· {String(item.author ?? item.director ?? '')}</span>
        )}
      </div>
      <div className="conflict-side-rows">
        <div className="conflict-row">
          <span className="conflict-row-key">상태</span>
          <span className="conflict-row-val">{item.status ? statusLabel(String(item.status), String(item.item_type ?? '')) : '-'}</span>
        </div>
        {rating && (
          <div className="conflict-row">
            <span className="conflict-row-key">평점</span>
            <span className="conflict-row-val">⭐ {rating}</span>
          </div>
        )}
        {item.current_page != null && Number(item.current_page) > 0 && (
          <div className="conflict-row">
            <span className="conflict-row-key">읽은 쪽</span>
            <span className="conflict-row-val">{String(item.current_page)}p</span>
          </div>
        )}
        {!!item.read_date && (
          <div className="conflict-row">
            <span className="conflict-row-key">완료일</span>
            <span className="conflict-row-val">{String(item.read_date)}</span>
          </div>
        )}
        {!!item.review && (
          <div className="conflict-row">
            <span className="conflict-row-key">리뷰</span>
            <span className="conflict-row-val conflict-row-val--review">{excerpt(item.review)}</span>
          </div>
        )}
        {!item.cover_path && !item.rating && !item.review && !item.read_date && (
          <div className="conflict-row">
            <span className="conflict-row-val" style={{ color: 'var(--text-muted)' }}>기록 없음</span>
          </div>
        )}
      </div>
    </div>
  )
}

function MergePreview({ local, cloud }: { local: Record<string, unknown>; cloud: Record<string, unknown> }) {
  const merged = mergeItemFields(local, cloud)
  const display = { ...cloud, ...merged }
  return <ItemSide label="합치기 결과 미리보기" item={display} />
}

function ConflictCard({
  conflict,
  index,
  total,
  onResolve,
  resolving,
}: {
  conflict: SyncConflict
  index: number
  total: number
  onResolve: (c: SyncConflict, res: 'keep-cloud' | 'keep-local' | 'merge' | 'keep-both') => void
  resolving: boolean
}) {
  const [showMergePreview, setShowMergePreview] = useState(false)

  return (
    <div className={`conflict-card ${resolving ? 'conflict-card--resolving' : ''}`}>
      <div className="conflict-card-header">
        <div className="conflict-card-num">{index + 1} / {total}</div>
        <div className="conflict-card-reason">⚠️ {conflict.reason}</div>
      </div>

      <div className="conflict-sides">
        <ItemSide label="💻 이 컴퓨터" item={conflict.local} highlight="local" />
        <div className="conflict-vs">vs</div>
        <ItemSide label="☁️ 다른 기기에서 올린 것" item={conflict.cloud} highlight="cloud" />
        {showMergePreview && <MergePreview local={conflict.local} cloud={conflict.cloud} />}
      </div>

      <div className="conflict-actions">
        <button
          className="btn-conflict btn-conflict--cloud"
          onClick={() => onResolve(conflict, 'keep-cloud')}
          disabled={resolving}
          title="다른 기기에서 올린 것을 남기고, 이 컴퓨터의 것은 휴지통으로"
        >
          ☁️ 다른 기기 것으로
        </button>
        <button
          className="btn-conflict btn-conflict--local"
          onClick={() => onResolve(conflict, 'keep-local')}
          disabled={resolving}
          title="이 컴퓨터의 내용으로 덮어쓰기"
        >
          💻 이 컴퓨터 것으로
        </button>
        <button
          className="btn-conflict btn-conflict--merge"
          onClick={() => onResolve(conflict, 'merge')}
          onMouseEnter={() => setShowMergePreview(true)}
          onMouseLeave={() => setShowMergePreview(false)}
          onFocus={() => setShowMergePreview(true)}
          onBlur={() => setShowMergePreview(false)}
          disabled={resolving}
          title="두 항목의 좋은 내용을 합쳐요"
        >
          ✨ 합치기
        </button>
        <button
          className="btn-conflict btn-conflict--both"
          onClick={() => onResolve(conflict, 'keep-both')}
          disabled={resolving}
          title="두 항목을 따로따로 모두 남기기"
        >
          📋 둘 다 남기기
        </button>
      </div>
    </div>
  )
}

export default function SyncConflictModal() {
  const { syncConflicts, syncAutoMerged, removeSyncConflict, clearSyncResult, fetchAll, requestSync } =
    useStorePick('syncConflicts', 'syncAutoMerged', 'removeSyncConflict', 'clearSyncResult', 'fetchAll', 'requestSync')
  const [resolvingId, setResolvingId] = useState<number | null>(null)
  const [bulkResolving, setBulkResolving] = useState(false)

  const visible = syncConflicts.length > 0 || syncAutoMerged > 0
  useEscapeKey(() => { void handleClose() }, visible)
  if (!visible) return null

  const handleResolve = async (
    conflict: SyncConflict,
    resolution: 'keep-cloud' | 'keep-local' | 'merge' | 'keep-both'
  ) => {
    setResolvingId(conflict.localId)
    try {
      await resolveConflict(conflict, resolution)
      removeSyncConflict(conflict.localId)
      await fetchAll()
      requestSync() // 합치기 결과 등을 곧바로 이 기기에도 반영
    } catch (err) {
      console.error('[Conflict] 해결 오류:', err)
      void alertDialog('인터넷 연결을 확인하고 다시 시도해 주세요.', '정리하지 못했어요')
    } finally {
      setResolvingId(null)
    }
  }

  const handleBulkResolve = async (resolution: 'keep-cloud' | 'keep-local' | 'merge') => {
    const n = syncConflicts.length
    const ok = await confirmDialog({
      title: resolution === 'keep-cloud' ? `${n}개 모두 다른 기기 것으로 할까요?`
        : resolution === 'keep-local' ? `${n}개 모두 이 컴퓨터 것으로 할까요?`
        : `${n}개 모두 합칠까요?`,
      message: resolution === 'merge'
        ? '별점·감상·진행 상황은 더 많이 채워진 쪽을 남겨요.'
        : resolution === 'keep-cloud'
          ? '이 컴퓨터의 같은 작품은 휴지통으로 옮겨요.'
          : '다른 기기에서 올린 내용을 이 컴퓨터 것으로 덮어써요.',
    })
    if (!ok) return

    setBulkResolving(true)
    try {
      for (const conflict of [...syncConflicts]) {
        await resolveConflict(conflict, resolution)
        removeSyncConflict(conflict.localId)
      }
      await fetchAll()
      requestSync()
    } catch (err) {
      console.error('[Conflict] 일괄 해결 오류:', err)
      void alertDialog('인터넷 연결을 확인하고 다시 시도해 주세요.', '정리하지 못했어요')
    } finally {
      setBulkResolving(false)
    }
  }

  async function handleClose() {
    if (syncConflicts.length > 0) {
      const ok = await confirmDialog({
        title: '나중에 정리할까요?',
        message: '정리하지 않은 항목은 다음 동기화 때 다시 보여 드려요.',
        confirmText: '나중에',
        cancelText: '계속 정리',
      })
      if (!ok) return
    }
    clearSyncResult()
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) void handleClose() }}>
      <div className="conflict-modal">
        {/* 헤더 */}
        <div className="modal-header">
          <span className="modal-title">🔄 비슷한 작품 정리</span>
          <button className="btn-icon" onClick={() => { void handleClose() }} aria-label="닫기" title="닫기">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 자동 합치기 안내 */}
        {syncAutoMerged > 0 && (
          <div className="conflict-auto-info">
            ✅ <strong>{syncAutoMerged}개 항목</strong>이 완전히 같아 자동으로 합쳐졌어요
          </div>
        )}

        {/* 충돌 목록 */}
        {syncConflicts.length > 0 ? (
          <>
            <div className="conflict-list-header">
              <span>
                <strong>{syncConflicts.length}개</strong>가 다른 기기에서 올린 작품과 비슷해요.
                어떻게 할지 골라 주세요.
              </span>
            </div>

            <div className="conflict-list">
              {syncConflicts.map((c, i) => (
                <ConflictCard
                  key={c.localId}
                  conflict={c}
                  index={i}
                  total={syncConflicts.length}
                  onResolve={handleResolve}
                  resolving={resolvingId === c.localId || bulkResolving}
                />
              ))}
            </div>

            {/* 일괄 처리 버튼 */}
            {syncConflicts.length > 1 && (
              <div className="conflict-bulk">
                <span className="conflict-bulk-label">한꺼번에:</span>
                <button
                  className="btn-conflict-bulk btn-conflict-bulk--merge"
                  onClick={() => handleBulkResolve('merge')}
                  disabled={bulkResolving}
                >
                  ✨ 모두 합치기
                </button>
                <button
                  className="btn-conflict-bulk btn-conflict-bulk--cloud"
                  onClick={() => handleBulkResolve('keep-cloud')}
                  disabled={bulkResolving}
                >
                  ☁️ 모두 다른 기기 것으로
                </button>
                <button
                  className="btn-conflict-bulk btn-conflict-bulk--local"
                  onClick={() => handleBulkResolve('keep-local')}
                  disabled={bulkResolving}
                >
                  💻 모두 이 컴퓨터 것으로
                </button>
              </div>
            )}
          </>
        ) : (
          // 충돌 없음 (자동 합치기만 있는 경우)
          <div className="conflict-all-done">
            <div className="conflict-all-done-icon">🎉</div>
            <div>모든 항목이 정리됐어요!</div>
            <button className="btn-primary" style={{ marginTop: 16, width: 120 }} onClick={clearSyncResult}>
              확인
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
