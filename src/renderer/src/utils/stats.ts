// 통계 계산 (화면 없이 순수 함수) — StatsModal에서 사용
import { Item } from '../types'
import { parseDbDate } from './date'

/** 완료한 날 — 완료일(read_date)이 없으면 기록한 날(created_at).
 *  수정·복원 때마다 바뀌는 updated_at은 쓰지 않는다 (예전엔 별점만 고쳐도 완료한 달이 이번 달로 옮겨 갔음) */
export function completedDate(item: Item): Date | null {
  if (item.status !== 'done') return null
  return parseDbDate(item.read_date || item.created_at)
}

export function getDateYear(item: Item): number | null {
  return completedDate(item)?.getFullYear() ?? null
}

export interface MonthSlot { month: number; book: number; movie: number; drama: number; documentary: number }

export function buildMonthly(items: Item[], year: number): MonthSlot[] {
  const slots: MonthSlot[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, book: 0, movie: 0, drama: 0, documentary: 0,
  }))
  for (const m of items) {
    const dt = completedDate(m)
    if (!dt || dt.getFullYear() !== year) continue
    const t = m.item_type as 'book' | 'movie' | 'drama' | 'documentary'
    if (t in slots[dt.getMonth()]) slots[dt.getMonth()][t]++
  }
  return slots
}

/** 막대그래프 눈금 — 눈금 간격과 맨 위 값을 깔끔한 수로 (맨 위 눈금이 그래프 꼭대기와 맞게) */
export function niceScale(maxVal: number): { max: number; ticks: number[] } {
  const raw = Math.max(1, maxVal)
  const step = raw <= 5 ? 1 : raw <= 10 ? 2 : Math.ceil(raw / 5)
  const max = Math.ceil(raw / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= max; v += step) ticks.push(v)
  return { max, ticks }
}

export interface RatingStat { dist: Record<number, number>; avg: number; count: number }

export function buildRating(items: Item[]): RatingStat {
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let sum = 0, count = 0
  items.forEach((m) => {
    if (m.rating != null) {
      const r = Math.min(5, Math.max(1, Math.round(m.rating)))
      dist[r] = (dist[r] || 0) + 1
      sum += m.rating
      count++
    }
  })
  return { dist, avg: count > 0 ? sum / count : 0, count }
}

/** 장르별 작품 수 (상위 10) — 한 작품은 장르마다 한 번만 센다 ('소설 > 한국소설, 소설 > 고전'은 소설 1) */
export function buildGenre(items: Item[]): [string, number][] {
  const map = new Map<string, number>()
  items.forEach((m) => {
    if (!m.genre) return
    const names = new Set(m.genre.split(',').map((g) => g.split('>')[0].trim()).filter(Boolean))
    for (const name of names) map.set(name, (map.get(name) || 0) + 1)
  })
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)
}
