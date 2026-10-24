import { create } from 'zustand'

// 앱 안 확인창·알림 — 윈도우 기본 팝업(window.confirm/alert) 대신 앱 디자인에 맞는 창을 띄운다.
// (기본 팝업은 모양이 따로 놀고, 닫은 뒤 입력칸에 글자가 안 쳐지는 문제가 생기기도 함)

export interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  /** 빈 문자열이면 취소 버튼 없이 확인만 (알림창) */
  cancelText?: string
  /** 되돌릴 수 없는 작업 — 확인 버튼을 빨간색으로, 처음 포커스는 취소에 */
  danger?: boolean
}

export interface Toast {
  id: number
  message: string
  actionText?: string
  onAction?: () => void
}

interface DialogState {
  confirm: (ConfirmOptions & { resolve: (ok: boolean) => void; returnFocus: HTMLElement | null }) | null
  toasts: Toast[]
}

export const useDialogStore = create<DialogState>(() => ({ confirm: null, toasts: [] }))

/** 확인창을 띄우고 확인(true)/취소(false)를 기다린다 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const prev = useDialogStore.getState().confirm
    // 창이 닫히면 원래 있던 곳(예: 쓰던 입력칸)으로 포커스를 돌려주려고 지금 위치를 기억
    const returnFocus = prev ? prev.returnFocus : (document.activeElement as HTMLElement | null)
    prev?.resolve(false) // 이미 떠 있던 창은 취소로 닫음
    useDialogStore.setState({ confirm: { ...options, resolve, returnFocus } })
  })
}

/** 확인 버튼 하나짜리 알림창 */
export async function alertDialog(message: string, title?: string): Promise<void> {
  await confirmDialog({ title, message, cancelText: '' })
}

export function closeConfirm(ok: boolean): void {
  const current = useDialogStore.getState().confirm
  if (!current) return
  useDialogStore.setState({ confirm: null })
  current.resolve(ok)
  const el = current.returnFocus
  if (el && el !== document.body && document.contains(el)) {
    setTimeout(() => el.focus?.(), 0)
  }
}

let toastSeq = 0

/** 화면 아래에 잠깐 뜨는 알림. action을 주면 '되돌리기' 같은 버튼이 붙는다 */
export function showToast(message: string, action?: { text: string; onClick: () => void }, durationMs = 6000): void {
  const id = ++toastSeq
  useDialogStore.setState((s) => ({
    toasts: [...s.toasts.slice(-2), { id, message, actionText: action?.text, onAction: action?.onClick }]
  }))
  setTimeout(() => dismissToast(id), durationMs)
}

export function dismissToast(id: number): void {
  useDialogStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}
