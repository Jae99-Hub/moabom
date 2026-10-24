import React, { useRef } from 'react'
import { useDialogStore, closeConfirm, dismissToast } from '../store/dialogs'
import { useEscapeKey } from '../hooks/useEscapeKey'

/** 앱 안 확인창과 아래쪽 알림을 그리는 곳 (App과 로그인 화면에 하나씩) */
export default function DialogHost() {
  const confirm = useDialogStore((s) => s.confirm)
  const toasts = useDialogStore((s) => s.toasts)
  const downOnBackdrop = useRef(false)
  const isAlert = confirm?.cancelText === ''
  // 되돌릴 수 없는 작업은 처음 포커스를 '취소'에 둠 (Enter를 길게 눌러 바로 지워지지 않게)
  const focusCancel = !!confirm?.danger && !isAlert

  // 확인창은 다른 어떤 창보다 먼저 Esc로 닫힘
  useEscapeKey(() => closeConfirm(isAlert), !!confirm, 2)

  return (
    <>
      {confirm && (
        <div
          className="dialog-overlay"
          onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget }}
          onClick={(e) => { if (e.target === e.currentTarget && downOnBackdrop.current) closeConfirm(isAlert) }}
        >
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-message">
            {confirm.title && <div className="dialog-title" id="dialog-title">{confirm.title}</div>}
            <div className="dialog-message" id="dialog-message">{confirm.message}</div>
            <div className="dialog-actions">
              {!isAlert && (
                <button className="btn-secondary dialog-btn" onClick={() => closeConfirm(false)} autoFocus={focusCancel}>
                  {confirm.cancelText ?? '취소'}
                </button>
              )}
              <button
                className={`dialog-btn ${confirm.danger ? 'btn-danger-solid' : 'btn-primary'}`}
                onClick={() => closeConfirm(true)}
                autoFocus={!focusCancel}
              >
                {confirm.confirmText ?? '확인'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 화면 낭독기가 첫 알림부터 읽도록 알림 영역은 항상 두고 내용만 바꾼다 */}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="app-toast">
            <span className="app-toast-message">{t.message}</span>
            {t.actionText && (
              <button className="app-toast-action" onClick={() => { t.onAction?.(); dismissToast(t.id) }}>
                {t.actionText}
              </button>
            )}
            <button className="app-toast-close" onClick={() => dismissToast(t.id)} aria-label="알림 닫기" title="닫기">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
