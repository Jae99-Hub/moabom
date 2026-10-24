// 표지 이미지 주소 만들기 — 원격 URL, data URL, 이 PC의 파일 경로를 모두 처리

/** 파일 경로 → file:// URL. 경로 조각을 인코딩해 '#'·'%'가 든 파일명도 깨지지 않게 함
 *  (예전엔 `file://${path}`로 붙여 "#살아있다" 표지가 '#' 뒤를 주소의 일부로 잘못 읽어 안 보였음) */
export function fileUrl(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  const encoded = parts.map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
  return 'file:///' + encoded.join('/').replace(/^\/+/, '')
}

/** TMDB 포스터 크기 — 카드에는 원본(w500)보다 작은 이미지로 충분 (받는 양·디코딩 부담 감소) */
const TMDB_SIZE = { card: 'w342', small: 'w185' } as const

export function coverSrc(path: string | null | undefined, size?: keyof typeof TMDB_SIZE): string | null {
  if (!path) return null
  if (path.startsWith('data:')) return path
  if (/^https?:\/\//.test(path)) {
    return size ? path.replace('/t/p/w500/', `/t/p/${TMDB_SIZE[size]}/`) : path
  }
  return fileUrl(path)
}
