import { describe, it, expect } from 'vitest'
// @ts-expect-error — Vercel 함수는 JS라 타입 선언이 없음
import { canonicalRedirect, normalizeQuery } from '../../api/_shared.js'

const follow = (url: string): string | null => {
  const res = canonicalRedirect(new Request(url)) as Response | null
  return res ? res.headers.get('location') : null
}

describe('검색 서버 주소 정리', () => {
  it('정리된 검색어 하나만 있으면 그대로 처리', () => {
    expect(follow('https://x.app/api/books?q=%EB%8D%B0%EB%AF%B8%EC%95%88')).toBeNull()
  })

  it("'가 든 검색어도 되돌림이 반복되지 않음", () => {
    const first = follow("https://x.app/api/tmdb?q=schindler's list")
    expect(first === null || follow(first) === null).toBe(true)
    expect(follow('https://x.app/api/tmdb?q=schindler%27s%20list')).toBeNull()
  })

  it('다른 값을 덧붙이거나 대소문자·공백이 다르면 정리된 주소로 한 번만 보냄', () => {
    const to = follow('https://x.app/api/books?q=Dune%20%20&cb=1')
    expect(to).not.toBeNull()
    expect(new URL(to!).searchParams.get('q')).toBe('dune')
    expect([...new URL(to!).searchParams.keys()]).toEqual(['q'])
    expect(follow(to!)).toBeNull()
  })

  it('이모지를 반으로 자르지 않고, 자른 뒤 끝 공백도 정리', () => {
    expect(Array.from(normalizeQuery('a'.repeat(99) + '😀😀'))).toHaveLength(100)
    expect(normalizeQuery('a'.repeat(99) + ' b')).toBe('a'.repeat(99))
  })
})
