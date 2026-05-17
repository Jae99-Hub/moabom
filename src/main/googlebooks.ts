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
    overview: v.description ?? '',
    cover_path: coverPath,
    genre: (v.categories ?? []).join(', ')
  }
}

async function fetchBooks(q: string, apiKey?: string): Promise<GoogleBookResult[]> {
  const params = new URLSearchParams({ q, maxResults: '10', printType: 'books' })
  if (apiKey) params.set('key', apiKey)
  const res = await fetch(`${BASE_URL}/volumes?${params}`)
  if (res.status === 429) throw new Error('검색 횟수 초과. 설정에서 Google Books API 키를 등록하면 해결됩니다.')
  if (!res.ok) throw new Error(`Google Books API 오류: ${res.status}`)
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
  const [byTitle, byGeneral] = await Promise.all([
    fetchBooks(`intitle:${q}`, apiKey),
    fetchBooks(q, apiKey)
  ])

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

  cache.set(cacheKey, { data: results, ts: Date.now() })
  return results
}
