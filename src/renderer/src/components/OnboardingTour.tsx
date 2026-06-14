import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useStore } from '../store/useStore'

interface TourStep {
  selector?: string   // 하이라이트할 실제 요소 (없으면 가운데 카드)
  title: string
  body: string
  emoji: string
}

const STEPS: TourStep[] = [
  {
    emoji: '📚',
    title: '모아봄에 오신 걸 환영해요',
    body: '책·영화·드라마를 한 곳에 기록하고, 마음에 든 문장과 별점·리뷰를 모아두는 앱이에요. 주요 기능을 빠르게 둘러볼게요.',
  },
  {
    selector: '[data-tour="add"]',
    emoji: '➕',
    title: '작품 추가',
    body: '여기서 책·영화·드라마를 추가해요. 제목으로 검색하면 표지·저자·줄거리가 자동으로 채워져요.',
  },
  {
    selector: '[data-tour="search"]',
    emoji: '🔍',
    title: '검색',
    body: '제목·저자·ISBN으로 찾을 수 있어요. 옆의 📖 / 💬 버튼을 누르면 적어둔 명문장 내용으로도 검색돼요.',
  },
  {
    selector: '[data-tour="filter"]',
    emoji: '🧭',
    title: '필터 · 정렬 · 보기',
    body: '상태(읽고 싶다 / 읽는 중 / 완료)로 거르고, 정렬 방식과 그리드 / 리스트 보기를 바꿀 수 있어요.',
  },
  {
    selector: '[data-tour="sidebar"]',
    emoji: '📂',
    title: '라이브러리',
    body: '왼쪽에서 유형과 장르별로 작품을 둘러봐요. 장르는 폴더처럼 펼쳐서 정리할 수 있어요.',
  },
  {
    selector: '[data-tour="settings"]',
    emoji: '⚙️',
    title: '동기화 · 설정',
    body: '설정에서 Google로 로그인하면 여러 컴퓨터에서 데이터가 자동으로 동기화돼요.',
  },
  {
    selector: '[data-tour="trash"]',
    emoji: '🗑️',
    title: '휴지통',
    body: '삭제한 작품은 휴지통으로 가고 15일 동안 복원할 수 있어요. 기기 간에도 삭제가 동기화돼요.',
  },
  {
    emoji: '🎉',
    title: '이제 시작해보세요!',
    body: '오른쪽 위 “추가” 버튼으로 첫 작품을 등록해보세요. 이 안내는 설정 > 일반 탭에서 다시 볼 수 있어요.',
  },
]

const TOOLTIP_W = 340
const PAD = 8

export default function OnboardingTour() {
  const { isTourOpen, closeTour } = useStore()
  const [idx, setIdx] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const step = STEPS[idx]

  const recalc = useCallback(() => {
    const sel = STEPS[idx]?.selector
    if (!sel) { setRect(null); return }
    const el = document.querySelector(sel) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      setRect(el.getBoundingClientRect())
    } else {
      setRect(null)
    }
  }, [idx])

  // 투어 열릴 때 첫 단계로 리셋
  useEffect(() => { if (isTourOpen) setIdx(0) }, [isTourOpen])

  useLayoutEffect(() => {
    if (!isTourOpen) return
    recalc()
    window.addEventListener('resize', recalc)
    return () => window.removeEventListener('resize', recalc)
  }, [isTourOpen, recalc])

  if (!isTourOpen || !step) return null

  const isFirst = idx === 0
  const isLast = idx === STEPS.length - 1
  const next = () => (isLast ? closeTour() : setIdx((i) => i + 1))
  const prev = () => setIdx((i) => Math.max(0, i - 1))

  const vw = window.innerWidth
  const vh = window.innerHeight

  // ── 스포트라이트 (대상 주위 투명 구멍) ──
  const spotlight = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null

  // ── 툴팁 위치: 공간이 충분한 쪽(아래→위→오른쪽→왼쪽) 자동 선택 후 화면 안으로 clamp ──
  let tipStyle: React.CSSProperties
  if (!rect) {
    tipStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  } else {
    const m = 14
    const TIP_H = 250 // 높이 추정치 (clamp 용)
    const clampLeft = (l: number) => Math.min(Math.max(l, 12), vw - TOOLTIP_W - 12)
    const clampTop = (t: number) => Math.min(Math.max(t, 12), vh - TIP_H - 12)
    const cx = rect.left + rect.width / 2 - TOOLTIP_W / 2
    const cy = rect.top + rect.height / 2 - TIP_H / 2

    if (vh - rect.bottom >= TIP_H + m) {
      tipStyle = { top: rect.bottom + m, left: clampLeft(cx) }               // 아래
    } else if (rect.top >= TIP_H + m) {
      tipStyle = { bottom: vh - rect.top + m, left: clampLeft(cx) }          // 위
    } else if (vw - rect.right >= TOOLTIP_W + m) {
      tipStyle = { left: rect.right + m, top: clampTop(cy) }                 // 오른쪽 (세로로 긴 사이드바 등)
    } else if (rect.left >= TOOLTIP_W + m) {
      tipStyle = { left: rect.left - m - TOOLTIP_W, top: clampTop(cy) }      // 왼쪽
    } else {
      tipStyle = { top: clampTop(rect.bottom + m), left: clampLeft(cx) }     // 폴백
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000 }}>
      {/* 어두운 배경 + 스포트라이트 */}
      {spotlight ? (
        <div
          style={{
            position: 'fixed',
            top: spotlight.top, left: spotlight.left,
            width: spotlight.width, height: spotlight.height,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.66)',
            border: '2px solid var(--accent)',
            transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
            pointerEvents: 'none',
          }}
        />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.66)' }} onClick={closeTour} />
      )}

      {/* 툴팁 카드 */}
      <div
        style={{
          position: 'fixed',
          width: TOOLTIP_W,
          maxWidth: 'calc(100vw - 24px)',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg, 16px)',
          boxShadow: 'var(--shadow-modal, 0 12px 40px rgba(0,0,0,0.5))',
          padding: 20,
          ...tipStyle,
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>{step.emoji}</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{step.title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>{step.body}</div>

        {/* 진행 점 */}
        <div style={{ display: 'flex', gap: 6, margin: '16px 0 4px' }}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === idx ? 18 : 6, height: 6, borderRadius: 99,
                background: i === idx ? 'var(--accent)' : 'var(--border)',
                transition: 'all 0.2s',
              }}
            />
          ))}
        </div>

        {/* 버튼 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <button
            onClick={closeTour}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 12, padding: '6px 4px',
            }}
          >
            건너뛰기
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isFirst && (
              <button className="btn-secondary" style={{ padding: '7px 14px' }} onClick={prev}>이전</button>
            )}
            <button className="btn-primary" style={{ padding: '7px 16px' }} onClick={next}>
              {isLast ? '시작하기' : '다음'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
