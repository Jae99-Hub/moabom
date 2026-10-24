// 도서 검색 (Google Books) — 검색 키를 브라우저 코드에 두지 않으려고 서버에서 대신 요청한다
import { fromOurSite, json, readQuery, canonicalRedirect } from './_shared.js'

// 서울에서 실행 — Google Books는 요청한 곳의 나라에 따라 결과가 달라서(미국에서 요청하면 한국 책이 빠지거나
// 일시 오류 503이 잦음) 한국 사용자가 직접 검색할 때와 같은 결과가 나오게 한다
export const config = { runtime: 'edge', regions: ['icn1'] }

/** 책 소개에 섞여 오는 HTML 태그(<p>, <br> 등)를 글자만 남기고 정리 */
function plainText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim()
}

function mapVolume(item) {
  const v = item.volumeInfo || {}
  const ids = v.industryIdentifiers || []
  const isbn = ids.find((i) => i.type === 'ISBN_13')?.identifier || ids.find((i) => i.type === 'ISBN_10')?.identifier || ''
  const thumb = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || null
  return {
    google_books_id: item.id,
    title: v.title || '',
    original_title: '',
    author: (v.authors || []).join(', '),
    publisher: v.publisher || '',
    isbn,
    page_count: v.pageCount ?? null,
    year: v.publishedDate ? String(v.publishedDate).slice(0, 4) : null,
    overview: plainText(v.description || ''),
    cover_path: thumb ? thumb.replace('http://', 'https://') : null,
    genre: (v.categories || []).join(', '),
  }
}

function scoreTitle(title, query) {
  const t = title.toLowerCase().trim()
  const q = query.toLowerCase().trim()
  if (t === q) return 3
  if (t.startsWith(q)) return 2
  if (t.includes(q)) return 1
  return 0
}

export default async function handler(req) {
  if (!fromOurSite(req)) return json({ error: '허용되지 않은 요청이에요.' }, 403)
  const redirect = canonicalRedirect(req)
  if (redirect) return redirect
  const q = readQuery(req)
  if (!q) return json([])
  const key = process.env.GOOGLE_BOOKS_API_KEY
  if (!key) return json({ error: '도서 검색이 아직 준비되지 않았어요.' }, 500)

  const fetchBooks = async (query) => {
    const params = new URLSearchParams({ q: query, maxResults: '10', printType: 'books', key })
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`)
    if (res.status === 429) throw Object.assign(new Error('도서 검색 요청이 잠시 많아요. 1~2분 뒤 다시 시도해 주세요.'), { status: 429 })
    if (!res.ok) throw Object.assign(new Error(`도서 검색 서버에 문제가 있어요. 잠시 뒤 다시 시도해 주세요. (${res.status})`), { status: 502 })
    const data = await res.json()
    return data.items || []
  }

  // 제목 검색과 전체 검색을 함께 — 하나만 실패해도 나머지 결과는 보여준다
  const settled = await Promise.allSettled([fetchBooks(`intitle:${q}`), fetchBooks(q)])
  const ok = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value)
  if (ok.length === 0) {
    const err = settled[0].reason
    return json({ error: err.message }, err.status || 502)
  }
  const seen = new Set()
  const merged = []
  for (const item of ok.flat()) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    merged.push(mapVolume(item))
  }
  const results = merged.sort((a, b) => scoreTitle(b.title, q) - scoreTitle(a.title, q)).slice(0, 8)
  return json(results, 200, ok.length === settled.length) // 일부만 받은 결과는 저장하지 않음
}
