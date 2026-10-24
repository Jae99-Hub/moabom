import { useEffect, useRef } from 'react'

// Esc는 '맨 위에 열린 창' 하나만 닫는다.
// 열린 순서대로 쌓아 두고 마지막 것만 실행 — 명대사 창에서 Esc를 누르면 뒤의 상세창까지 닫히던 문제 방지.
// priority가 높은 창(확인창 > 사용법 안내)은 나중에 열린 일반 창보다 먼저 닫힌다.
const stack: { run: () => void; priority: number }[] = []

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || stack.length === 0 || e.isComposing) return
  e.preventDefault()
  let top = stack[stack.length - 1]
  for (const entry of stack) if (entry.priority >= top.priority) top = entry // 같은 우선순위면 나중에 열린 것
  top.run()
}

let installed = false

/** active일 때 Esc를 누르면 onEscape 실행 (다른 창이 위에 열려 있으면 그 창이 먼저) */
export function useEscapeKey(onEscape: () => void, active = true, priority = 0): void {
  const handler = useRef(onEscape)
  handler.current = onEscape

  useEffect(() => {
    if (!active) return
    if (!installed) {
      window.addEventListener('keydown', onKeyDown)
      installed = true
    }
    const entry = { run: () => handler.current(), priority }
    stack.push(entry)
    return () => {
      const i = stack.lastIndexOf(entry)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [active, priority])
}
