import type { ItemType, ItemStatus } from '../types'

// 종류·상태 이름과 색 — 여러 화면에서 따로 정의해 이름이 서로 달라지던 것을 한 곳으로

export const TYPE_LABEL: Record<ItemType, string> = { book: '도서', movie: '영화', drama: '드라마', documentary: '다큐' }
export const TYPE_EMOJI: Record<ItemType, string> = { book: '📚', movie: '🎬', drama: '📺', documentary: '🎞️' }

/** 막대·점 등 채우기 색 (CSS 변수 — 테마별 값은 index.css) */
export const TYPE_COLOR: Record<ItemType, string> = {
  book: 'var(--type-book)', movie: 'var(--type-movie)', drama: 'var(--type-drama)', documentary: 'var(--type-doc)',
}
/** 글자 색 — 밝은 테마에서도 읽히는 진한 값 */
export const TYPE_TEXT_COLOR: Record<ItemType, string> = {
  book: 'var(--type-book-text)', movie: 'var(--type-movie-text)', drama: 'var(--type-drama-text)', documentary: 'var(--type-doc-text)',
}

export const typeLabel = (t: string): string => TYPE_LABEL[t as ItemType] ?? t
export const typeEmojiLabel = (t: string): string =>
  TYPE_EMOJI[t as ItemType] ? `${TYPE_EMOJI[t as ItemType]} ${typeLabel(t)}` : t

/** 카드 배지처럼 좁은 곳에 쓰는 짧은 상태 이름 */
export const STATUS_SHORT: Record<ItemStatus, string> = { want: '예정', reading: '진행', done: '완료', dropped: '중단' }

const STATUS_BOOK: Record<ItemStatus, string> = { want: '읽고 싶다', reading: '읽는 중', done: '완독', dropped: '중단' }
const STATUS_MEDIA: Record<ItemStatus, string> = { want: '볼 예정', reading: '보는 중', done: '시청 완료', dropped: '중단' }
const STATUS_MIXED: Record<ItemStatus, string> = { want: '예정', reading: '진행 중', done: '완료', dropped: '중단' }

/** 상태 이름 — 책은 '읽다', 영상은 '보다', 종류가 섞인 목록('all')은 공통 표현 */
export function statusLabels(type: ItemType | 'all' | string): Record<ItemStatus, string> {
  if (type === 'book') return STATUS_BOOK
  if (type === 'all') return STATUS_MIXED
  return STATUS_MEDIA
}

export const statusLabel = (status: string, type: ItemType | 'all' | string): string =>
  statusLabels(type)[status as ItemStatus] ?? status

/** 명문장(책) / 명대사(영상) */
export const quoteWord = (type: string): string => (type === 'book' ? '명문장' : '명대사')
