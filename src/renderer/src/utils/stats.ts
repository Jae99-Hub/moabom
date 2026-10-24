// 통계 계산 (화면 없이 순수 함수) — StatsModal에서 사용
import { Item } from '../types'
import { parseDbDate } from './date'

/** 완료한 해 — 완료일(read_date)이 없으면 마지막 수정 시각으로 대신함 */
export function getDateYear(item: Item): number | null {
  return parseDbDate(item.read_date || (item.status === 'done' ? item.updated_at : null))?.getFullYear() ?? null
}

function getDateMonth(item: Item, year: number): number | null {
  const dt = parseDbDate(item.read_date || (item.status === 'done' ? item.updated_at : null))
  return dt && dt.getFullYear() === year ? dt.getMonth() : null
}

export interface MonthSlot { month: number; book: number; movie: number; drama: number; documentary: number }

export function buildMonthly(items: Item[], year: number): MonthSlot[] {
  const slots: MonthSlot[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, book: 0, movie: 0, drama: 0, documentary: 0,
  }))
  items
    .filter((m) => m.status === 'done')
    .forEach((m) => {
      const mo = getDateMonth(m, year)
      if (mo == null) return
      const t = m.item_type as 'book' | 'movie' | 'drama' | 'documentary'
      if (t in slots[mo]) slots[mo][t]++
    })
  return slots
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

export function buildGenre(items: Item[]): [string, number][] {
  const map = new Map<string, number>()
  items.forEach((m) => {
    if (!m.genre) return
    m.genre.split(',').forEach((g) => {
      const name = g.split('>')[0].trim()
      if (name) map.set(name, (map.get(name) || 0) + 1)
    })
  })
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)
}
