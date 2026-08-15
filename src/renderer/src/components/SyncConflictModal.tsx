import React, { useState } from 'react'
import { useStore } from '../store/useStore'
import { resolveConflict, SyncConflict, mergeItemFields } from '../api/syncService'

const TYPE_LABEL: Record<string, string> = { book: '📚 책', movie: '🎬 영화', drama: '📺 드라마', documentary: '🎞️ 다큐' }
const STATUS_LABEL: Record<string, string> = { want: '볼 예정', reading: '읽는 중 / 보는 중', done: '완료', dropped: '중단' }

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
          src={String(item.cover_path)}
          alt=""
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
      <div className="conflict-side-title">{String(item.title ?? '')}</div>
      <div className="conflict-side-meta">
        <span>{TYPE_LABEL[String(item.item_type)] ?? item.item_type as string}</span>
        {!!item.year && <span>· {String(item.year)}</span>}
        {!!(item.author || item.director) && (
          <span>· {String(item.author ?? item.director ?? '')}</span>
        )}
      </div>
      <div className="conflict-side-rows">
        <div className="conflict-row">
          <span className="conflict-row-key">상태</span>
          <span className="conflict-row-val">{STATUS_LABEL[String(item.status ?? '')] ?? String(item.status ?? '-')}</span>
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
        <ItemSide label="로컬 (이 기기)" item={conflict.local} />
        <div className="conflict-vs">vs</div>
        <ItemSide label="클라우드" item={conflict.cloud} />
        {showMergePreview && <MergePreview local={conflict.local} cloud={conflict.cloud} />}
      </div>

      <div className="conflict-actions">
        <button
          className="btn-conflict btn-conflict--cloud"
          onClick={() => onResolve(conflict, 'keep-cloud')}
          disabled={resolving}
          title="클라우드 버전 유지, 로컬 삭제"
        >
          ☁️ 클라우드 유지
        </button>
        <button
          className="btn-conflict btn-conflict--local"
          onClick={() => onResolve(conflict, 'keep-local')}
          disabled={resolving}
          title="로컬 버전으로 클라우드 덮어쓰기"
        >
          💾 로컬 유지
        </button>
        <button
          className="btn-conflict btn-conflict--merge"
          onClick={() => onResolve(conflict, 'merge')}
          onMouseEnter={() => setShowMergePreview(true)}
          onMouseLeave={() => setShowMergePreview(false)}
          disabled={resolving}
          title="두 항목의 좋은 내용을 합쳐요"
        >
          ✨ 합치기
        </button>
        <button
          className="btn-conflict btn-conflict--both"
          onClick={() => onResolve(conflict, 'keep-both')}
          disabled={resolving}
          title="두 항목을 별도로 모두 유지"
        >
          📋 둘 다 유지
        </button>
      </div>
    </div>
  )
}

export default function SyncConflictModal() {
  const { syncConflicts, syncAutoMerged, removeSyncConflict, clearSyncResult, fetchAll } = useStore()
  const [resolvingId, setResolvingId] = useState<number | null>(null)
  const [bulkResolving, setBulkResolving] = useState(false)

  const visible = syncConflicts.length > 0 || syncAutoMerged > 0
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
    } catch (err) {
      console.error('[Conflict] 해결 오류:', err)
    } finally {
      setResolvingId(null)
    }
  }

  const handleBulkResolve = async (resolution: 'keep-cloud' | 'keep-local' | 'merge') => {
    if (!window.confirm(
      resolution === 'keep-cloud' ? `${syncConflicts.length}개 항목 모두 클라우드 버전으로 유지할까요?`
        : resolution === 'keep-local' ? `${syncConflicts.length}개 항목 모두 로컬 버전으로 유지할까요?`
        : `${syncConflicts.length}개 항목 모두 합칠까요?`
    )) return

    setBulkResolving(true)
    try {
      for (const conflict of [...syncConflicts]) {
        await resolveConflict(conflict, resolution)
        removeSyncConflict(conflict.localId)
      }
      await fetchAll()
    } catch (err) {
      console.error('[Conflict] 일괄 해결 오류:', err)
    } finally {
      setBulkResolving(false)
    }
  }

  const handleClose = () => {
    if (syncConflicts.length > 0) {
      if (!window.confirm('아직 해결하지 않은 항목이 있어요. 나중에 다시 동기화하면 다시 나타나요. 닫을까요?')) return
    }
    clearSyncResult()
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="conflict-modal">
        {/* 헤더 */}
        <div className="modal-header">
          <span className="modal-title">🔄 동기화 중복 확인</span>
          <button className="btn-icon" onClick={handleClose}>
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
                <strong>{syncConflicts.length}개 항목</strong>에서 비슷한 클라우드 항목이 발견됐어요.
                어떻게 할지 선택해 주세요.
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
                <span className="conflict-bulk-label">전체 일괄 처리:</span>
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
                  ☁️ 모두 클라우드 유지
                </button>
                <button
                  className="btn-conflict-bulk btn-conflict-bulk--local"
                  onClick={() => handleBulkResolve('keep-local')}
                  disabled={bulkResolving}
                >
                  💾 모두 로컬 유지
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

        {/* 완료 버튼 (충돌 해결 후 남은 안내만 있을 때) */}
        {syncConflicts.length === 0 && syncAutoMerged > 0 && (
          <div className="modal-footer">
            <button className="btn-primary" style={{ minWidth: 80 }} onClick={clearSyncResult}>
              확인
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
