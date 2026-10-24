import { describe, it, expect } from 'vitest'
import { parseDbDate } from './date'
import { coverSrc, fileUrl } from './cover'

describe('날짜 읽기', () => {
  it('이 기기 형식(UTC)·ISO·날짜만 모두 읽음', () => {
    expect(parseDbDate('2026-10-01 12:30:00')?.toISOString()).toBe('2026-10-01T12:30:00.000Z')
    expect(parseDbDate('2026-10-01 12:30:00.250')?.toISOString()).toBe('2026-10-01T12:30:00.250Z')
    expect(parseDbDate('2026-10-01T09:00:00+09:00')?.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(parseDbDate('2026-10-01')?.toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it('비었거나 엉터리면 null', () => {
    expect(parseDbDate(null)).toBeNull()
    expect(parseDbDate('')).toBeNull()
    expect(parseDbDate('어제')).toBeNull()
  })
})

describe('표지 주소', () => {
  it('파일 경로의 #·% 같은 글자도 깨지지 않게', () => {
    expect(fileUrl('C:\\Users\\me\\covers\\#살아있다 100%.jpg'))
      .toBe('file:///C:/Users/me/covers/%23%EC%82%B4%EC%95%84%EC%9E%88%EB%8B%A4%20100%25.jpg')
  })

  it('TMDB 포스터는 크기를 줄여 받고, data URL·빈 값은 그대로', () => {
    expect(coverSrc('https://image.tmdb.org/t/p/w500/a.jpg', 'card')).toBe('https://image.tmdb.org/t/p/w342/a.jpg')
    expect(coverSrc('https://image.tmdb.org/t/p/w500/a.jpg')).toBe('https://image.tmdb.org/t/p/w500/a.jpg')
    expect(coverSrc('data:image/png;base64,AA', 'small')).toBe('data:image/png;base64,AA')
    expect(coverSrc(null)).toBeNull()
  })
})
