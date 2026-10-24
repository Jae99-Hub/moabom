import { describe, it, expect } from 'vitest'
import { isExactMatch, isSimilarMatch, conflictReason, mergeItemFields, pickCover, buildItemPayload, toIso } from './syncMatch'

const book = (extra: Record<string, unknown> = {}) => ({ title: '데미안', item_type: 'book', year: 1919, ...extra })

describe('같은 작품 판별', () => {
  it('제목 대소문자·앞뒤 공백, 숫자/문자 연도·id 차이는 같은 작품', () => {
    expect(isExactMatch(book({ title: ' 데미안 ', tmdb_id: 5 }), book({ year: '1919', tmdb_id: '5' }))).toBe(true)
  })

  it('연도·유형·ISBN이 다르면 자동으로 합치지 않음', () => {
    expect(isExactMatch(book(), book({ year: 2000 }))).toBe(false)
    expect(isExactMatch(book(), book({ item_type: 'movie' }))).toBe(false)
    expect(isExactMatch(book({ isbn: '111' }), book({ isbn: '222' }))).toBe(false)
  })

  it('한쪽에만 id가 있으면 같은 작품으로 봄', () => {
    expect(isExactMatch(book({ isbn: '111' }), book())).toBe(true)
  })

  it('비슷한 작품: 같은 제목이거나 같은 id', () => {
    expect(isSimilarMatch(book(), book({ item_type: 'movie' }))).toBe(true)
    expect(isSimilarMatch(book({ title: 'A', tmdb_id: 7 }), book({ title: 'B', tmdb_id: '7' }))).toBe(true)
    expect(isSimilarMatch(book({ title: 'A' }), book({ title: 'B' }))).toBe(false)
  })

  it('충돌 이유 문구', () => {
    expect(conflictReason(book(), book({ item_type: 'movie' }))).toBe('같은 제목이지만 유형이 달라요')
    expect(conflictReason(book(), book({ year: 2001 }))).toContain('연도 다름')
  })
})

describe('두 기록 합치기', () => {
  it('진행 상태는 더 나간 쪽, 페이지는 큰 쪽, 감상은 긴 쪽', () => {
    const m = mergeItemFields(
      { status: 'reading', current_page: 120, review: '좋다', rating: null },
      { status: 'done', current_page: 80, review: '아주 좋았다', rating: 4 },
    )
    expect(m).toMatchObject({ status: 'done', current_page: 120, review: '아주 좋았다', rating: 4 })
  })

  it('작품 정보는 클라우드 우선이되 비어 있으면 이 기기 것', () => {
    const m = mergeItemFields({ overview: '이 기기 줄거리', genre: '소설' }, { overview: '', genre: null })
    expect(m).toMatchObject({ overview: '이 기기 줄거리', genre: '소설' })
  })

  it('표지는 어느 기기에서나 보이는 것 우선', () => {
    expect(pickCover('C:\\covers\\a.jpg', 'https://x/a.jpg')).toBe('https://x/a.jpg')
    expect(pickCover('data:image/jpeg;base64,AA', 'https://x/a.jpg')).toBe('data:image/jpeg;base64,AA')
    expect(pickCover(null, null)).toBe(null)
  })
})

describe('클라우드로 올리는 행', () => {
  it('필요한 칸만, 시각은 ISO로, 연도는 문자열로', () => {
    const p = buildItemPayload({
      id: 3, server_id: 9, is_dirty: 1, title: 'T', item_type: 'book', status: 'want', year: 2020,
      created_at: '2026-10-01 01:02:03.456', is_deleted: 1, deleted_at: '2026-10-02 00:00:00',
    }, 'u1', '2026-10-24T00:00:00.000Z')
    expect(p).toMatchObject({
      user_id: 'u1', year: '2020', created_at: '2026-10-01T01:02:03.456Z', updated_at: '2026-10-24T00:00:00.000Z',
      is_deleted: true, deleted_at: '2026-10-02T00:00:00.000Z',
    })
    expect(p).not.toHaveProperty('id')
    expect(p).not.toHaveProperty('server_id')
    expect(p).not.toHaveProperty('is_dirty')
  })

  it('이미 ISO거나 해석 못 하는 시각은 그대로', () => {
    expect(toIso('2026-10-01T00:00:00+09:00')).toBe('2026-10-01T00:00:00+09:00')
    expect(toIso('어제')).toBe('어제')
    expect(toIso(null)).toBe(null)
  })
})
