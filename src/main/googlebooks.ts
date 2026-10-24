const BASE_URL = 'https://www.googleapis.com/books/v1'

export type GoogleBookResult = {
  google_books_id: string
  title: string
  original_title: string
  author: string
  publisher: string
  isbn: string
  page_count: number | null
  year: string | null
  overview: string
  cover_path: string | null
  genre: string
}

/** 책 소개에 섞여 오는 HTML 태그(<p>, <br> 등)를 글자만 남기고 정리 */
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim()
}

// Simple in-memory cache to avoid hitting rate limits
const cache = new Map<string, { data: GoogleBookResult[]; ts: number }>()
const CACHE_MS = 5 * 60 * 1000

function mapVolume(item: {
  id: string
  volumeInfo: {
    title?: string
    authors?: string[]
    publisher?: string
    publishedDate?: string
    description?: string
    pageCount?: number
    categories?: string[]
    industryIdentifiers?: { type: string; identifier: string }[]
    imageLinks?: { thumbnail?: string; smallThumbnail?: string }
  }
}): GoogleBookResult {
  const v = item.volumeInfo
  const isbn13 = v.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier ?? ''
  const isbn10 = v.industryIdentifiers?.find((i) => i.type === 'ISBN_10')?.identifier ?? ''
  const rawThumb = v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail ?? null
  const coverPath = rawThumb ? rawThumb.replace('http://', 'https://') : null
  return {
    google_books_id: item.id,
    title: v.title ?? '',
    original_title: '',
    author: (v.authors ?? []).join(', '),
    publisher: v.publisher ?? '',
    isbn: isbn13 || isbn10,
    page_count: v.pageCount ?? null,
    year: v.publishedDate ? v.publishedDate.slice(0, 4) : null,
    overview: plainText(v.description ?? ''),
    cover_path: coverPath,
    genre: (v.categories ?? []).join(', ')
  }
}

async function fetchBooks(q: string, apiKey?: string): Promise<GoogleBookResult[]> {
  const params = new URLSearchParams({ q, maxResults: '10', printType: 'books' })
  if (apiKey) params.set('key', apiKey)
  let res: Response
  try {
    res = await fetch(`${BASE_URL}/volumes?${params}`, { signal: AbortSignal.timeout(10000) })
  } catch {
    throw new Error('검색 응답이 없어요. 인터넷 연결을 확인하고 다시 시도해 주세요.')
  }
  if (res.status === 429) throw new Error('도서 검색 요청이 잠시 많아요. 1~2분 뒤 다시 시도해 주세요.')
  if (!res.ok) throw new Error(`도서 검색 서버에 문제가 있어요. 잠시 뒤 다시 시도해 주세요. (${res.status})`)
  const data = await res.json() as { items?: unknown[] }
  return ((data.items ?? []) as Parameters<typeof mapVolume>[0][]).slice(0, 8).map(mapVolume)
}

function scoreTitle(title: string, query: string): number {
  const t = title.toLowerCase().trim()
  const q = query.toLowerCase().trim()
  if (t === q) return 3
  if (t.startsWith(q)) return 2
  if (t.includes(q)) return 1
  return 0
}

export async function searchGoogleBooks(query: string, apiKey?: string): Promise<GoogleBookResult[]> {
  const q = query.trim()
  if (!q) return []

  const cacheKey = `${q.toLowerCase()}|${apiKey ?? ''}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.ts < CACHE_MS) return hit.data

  // intitle: gives better title-match results from Google Books
  // 둘 중 하나만 실패해도 나머지 결과는 보여준다 (둘 다 실패하면 오류)
  const settled = await Promise.allSettled([
    fetchBooks(`intitle:${q}`, apiKey),
    fetchBooks(q, apiKey)
  ])
  const ok = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []))
  if (ok.length === 0) throw (settled[0] as PromiseRejectedResult).reason
  const [byTitle = [], byGeneral = []] = ok

  // Merge: deduplicate by google_books_id, intitle results first
  const seen = new Set<string>()
  const merged: GoogleBookResult[] = []
  for (const r of [...byTitle, ...byGeneral]) {
    if (!seen.has(r.google_books_id)) {
      seen.add(r.google_books_id)
      merged.push(r)
    }
  }

  // Sort by title relevance
  const results = merged
    .sort((a, b) => scoreTitle(b.title, q) - scoreTitle(a.title, q))
    .slice(0, 8)

  if (ok.length === settled.length) cache.set(cacheKey, { data: results, ts: Date.now() }) // 일부 실패한 결과는 캐시 안 함
  return results
}
