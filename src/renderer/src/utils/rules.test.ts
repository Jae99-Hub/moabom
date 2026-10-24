import { describe, it, expect } from 'vitest'
import type { Item } from '../types'
import { statusPatch, findDuplicate, validateForm, todayLocal } from './itemRules'
import { josa } from './korean'
import { buildGenre, buildMonthly, getDateYear, niceScale } from './stats'

const item = (extra: Partial<Item> = {}): Item => ({
  id: 1, title: '데미안', original_title: null, item_type: 'book', cover_path: null, backdrop_path: null,
  author: null, publisher: null, isbn: null, page_count: 244, current_page: 120, director: null, platform: null,
  tmdb_id: null, google_books_id: null, genre: null, year: 1919, overview: null, rating: null, status: 'reading',
  review: null, read_date: null, created_at: '2025-01-05 10:00:00', updated_at: '2026-10-24 10:00:00',
  ...extra,
} as Item)

describe('상태 바꾸기', () => {
  it('완료로 바꾸면 완료일(비었을 때)과 다 읽은 쪽수를 채움', () => {
    expect(statusPatch(item(), 'done')).toEqual({ status: 'done', read_date: todayLocal(), current_page: 244 })
  })

  it('이미 완료일이 있거나 영상이면 그 칸은 그대로', () => {
    expect(statusPatch(item({ read_date: '2024-03-01' }), 'done')).toEqual({ status: 'done', current_page: 244 })
    expect(statusPatch(item({ item_type: 'movie', page_count: null }), 'done')).toEqual({ status: 'done', read_date: todayLocal() })
  })

  it('완료가 아닌 상태로 바꿀 때는 상태만', () => {
    expect(statusPatch(item(), 'dropped')).toEqual({ status: 'dropped' })
  })
})

describe('입력 확인', () => {
  const form = { ...item(), title: '데미안', year: 1919, page_count: 244 } as never
  it('정상 입력은 통과', () => expect(validateForm(form)).toBeNull())
  it('연도·페이지 범위', () => {
    expect(validateForm({ ...(form as object), year: 99999 } as never)?.message).toContain('연도')
    expect(validateForm({ ...(form as object), page_count: -10 } as never)?.message).toContain('페이지')
  })

  it('같은 작품 찾기: 공백·대소문자 무시, 종류·연도 다르면 다른 작품', () => {
    const list = [item({ id: 1, title: 'Demian ' }), item({ id: 2, title: '기생충', item_type: 'movie', year: 2019 })]
    expect(findDuplicate(list, { title: 'demian', item_type: 'book', year: null })?.id).toBe(1)
    expect(findDuplicate(list, { title: '기생충', item_type: 'movie', year: 2020 })).toBeUndefined()
    expect(findDuplicate(list, { title: 'demian', item_type: 'book', year: null }, 1)).toBeUndefined()
  })
})

describe('조사', () => {
  it('받침에 맞게', () => {
    expect(josa('데미안', '을/를')).toBe('을')
    expect(josa('나의 아저씨', '을/를')).toBe('를')
    expect(josa('기생충', '이/가')).toBe('이')
    expect(josa('서울', '으로/로')).toBe('로')
    expect(josa('1984', '을/를')).toBe('를')
    expect(josa('2001', '을/를')).toBe('을')
  })
  it('영어로 끝나면 둘 다', () => expect(josa('Dune', '을/를')).toBe('을(를)'))
})

describe('통계', () => {
  it('완료일이 없으면 기록한 날 기준 — 수정 시각은 쓰지 않음', () => {
    expect(getDateYear(item({ status: 'done' }))).toBe(2025)
    const months = buildMonthly([item({ status: 'done' }), item({ status: 'done', read_date: '2025-03-02' })], 2025)
    expect(months[0].book).toBe(1)
    expect(months[2].book).toBe(1)
  })

  it('장르는 작품마다 한 번', () => {
    expect(buildGenre([item({ genre: '소설 > 한국소설, 소설 > 고전, 에세이' })])).toEqual([['소설', 1], ['에세이', 1]])
  })

  it('눈금 맨 위가 깔끔한 수', () => {
    expect(niceScale(7)).toEqual({ max: 8, ticks: [0, 2, 4, 6, 8] })
    expect(niceScale(0)).toEqual({ max: 1, ticks: [0, 1] })
    expect(niceScale(23).max).toBe(25)
  })
})
