import { RefObject, useEffect } from 'react'

// 창(모달)이 열려 있는 동안 Tab 키 포커스가 그 창 안에서만 돌게 한다.
// 예전엔 Tab을 누르면 창 뒤의 머리글·사이드바로 빠져나가, 키보드로는 창이 어디 있는지 알 수 없었음.
// 여러 창이 겹치면 맨 위 창 하나만 붙잡는다 (Esc 처리와 같은 방식).

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

const traps: HTMLElement[] = []

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0)
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Tab' || traps.length === 0) return
  const root = traps[traps.length - 1]
  const nodes = focusables(root)
  if (nodes.length === 0) { e.preventDefault(); root.focus(); return }
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  const active = document.activeElement
  if (!root.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return }
  if (e.shiftKey && (active === first || active === root)) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
}

let installed = false

/** active인 동안 ref 안에 Tab 포커스를 가둔다.
 *  열릴 때 포커스가 창 밖에 있으면 창(또는 autoFocus 요소)으로 옮기고, 닫힐 때 원래 자리로 돌려준다.
 *  ref 요소에는 tabIndex={-1}을 줘야 창 자체에 포커스를 둘 수 있다. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true, restoreFocus = true): void {
  useEffect(() => {
    const root = ref.current
    if (!active || !root) return
    if (!installed) {
      document.addEventListener('keydown', onKeyDown)
      installed = true
    }
    const previous = document.activeElement as HTMLElement | null
    traps.push(root)
    // 렌더 직후 autoFocus가 먼저 잡았으면 그대로 두고, 아니면 창 자체로
    const t = setTimeout(() => {
      if (!root.contains(document.activeElement)) root.focus({ preventScroll: true })
    }, 0)
    return () => {
      clearTimeout(t)
      const i = traps.lastIndexOf(root)
      if (i >= 0) traps.splice(i, 1)
      if (restoreFocus && previous && previous !== document.body && document.contains(previous)) {
        setTimeout(() => previous.focus({ preventScroll: true }), 0)
      }
    }
  }, [active, ref, restoreFocus])
}
