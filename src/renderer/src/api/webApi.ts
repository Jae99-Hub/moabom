/**
 * 웹(브라우저) 환경에서 window.api를 구현합니다.
 * - 로그인 시: Supabase (PostgreSQL + Storage)
 * - 비로그인 시: localStorage
 */

import { supabase, isSupabaseConfigured } from './supabaseClient'

// ── Anonymous localStorage 헬퍼 ──────────────────────────────────
const ANON = {
  items:   'moabom_items',
  quotes:  'moabom_quotes',
  settings:'moabom_settings',
  nextId:  'moabom_next_id',
}

function anonLoad<T>(key: string, def: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? def } catch { return def }
}
function anonSave(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}
function anonNextId(): number {
  const id = anonLoad<number>(ANON.nextId, 0) + 1
  anonSave(ANON.nextId, id)
  return id
}

async function isAuthenticated(): Promise<boolean> {
  if (!isSupabaseConfigured) return false
  try {
    const { data: { user } } = await supabase.auth.getUser()
    return !!user
  } catch { return false }
}

// ── 현재 유저 ID 조회 ────────────────────────────────────────────
async function getUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다')
  return user.id
}

// ── API 키 (설정에 저장된 키 우선, 없으면 기본값) ─────────────────
const DEFAULT_GOOGLE_BOOKS_KEY = 'AIzaSyB2CqQVMkx89-S3xAAfG85Qk-LycoKNA0o'
const DEFAULT_TMDB_KEY = '2231c307ea12a6d255fca6d45014212b'

async function getApiKey(settingKey: string, defaultKey: string): Promise<string> {
  try {
    if (!(await isAuthenticated())) {
      const settings = anonLoad<Record<string, string>>(ANON.settings, {})
      return settings[settingKey]?.trim() || defaultKey
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return defaultKey
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('user_id', user.id)
      .eq('key', settingKey)
      .maybeSingle()
    return (data?.value as string)?.trim() || defaultKey
  } catch {
    return defaultKey
  }
}

// ── Google Books ──────────────────────────────────────────────────
async function searchGoogleBooks(query: string): Promise<unknown[]> {
  const GOOGLE_BOOKS_API_KEY = await getApiKey('google_books_api_key', DEFAULT_GOOGLE_BOOKS_KEY)
  const fetchBooks = async (q: string) => {
    const params = new URLSearchParams({ q, maxResults: '10', printType: 'books', key: GOOGLE_BOOKS_API_KEY })
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`)
    if (!res.ok) throw new Error(`Google Books API 오류: ${res.status}`)
    const data = await res.json() as { items?: unknown[] }
    return data.items ?? []
  }

  const mapVolume = (item: Record<string, unknown>) => {
    const v = item.volumeInfo as Record<string, unknown>
    const ids = (v.industryIdentifiers as Array<{ type: string; identifier: string }> | undefined) ?? []
    const isbn = ids.find((i) => i.type === 'ISBN_13')?.identifier ?? ids.find((i) => i.type === 'ISBN_10')?.identifier ?? ''
    const imageLinks = v.imageLinks as Record<string, string> | undefined
    const rawThumb = imageLinks?.thumbnail ?? imageLinks?.smallThumbnail ?? null
    const coverPath = rawThumb ? rawThumb.replace('http://', 'https://') : null
    return {
      google_books_id: item.id,
      title: v.title ?? '',
      original_title: '',
      author: ((v.authors as string[] | undefined) ?? []).join(', '),
      publisher: v.publisher ?? '',
      isbn,
      page_count: v.pageCount ?? null,
      year: v.publishedDate ? String(v.publishedDate).slice(0, 4) : null,
      overview: v.description ?? '',
      cover_path: coverPath,
      genre: ((v.categories as string[] | undefined) ?? []).join(', ')
    }
  }

  const [byTitle, byGeneral] = await Promise.all([
    fetchBooks(`intitle:${query}`),
    fetchBooks(query)
  ])
  const seen = new Set<string>()
  const merged: ReturnType<typeof mapVolume>[] = []
  for (const item of [...byTitle, ...byGeneral] as Record<string, unknown>[]) {
    const id = item.id as string
    if (!seen.has(id)) { seen.add(id); merged.push(mapVolume(item)) }
  }
  return merged.slice(0, 8)
}

// ── TMDB ──────────────────────────────────────────────────────────
const MOVIE_GENRES: Record<number, string> = {
  28: '액션', 12: '모험', 16: '애니메이션', 35: '코미디', 80: '범죄',
  99: '다큐멘터리', 18: '드라마', 10751: '가족', 14: '판타지', 36: '역사',
  27: '공포', 10402: '음악', 9648: '미스터리', 10749: '로맨스', 878: 'SF',
  53: '스릴러', 10752: '전쟁', 37: '서부'
}
const TV_GENRES: Record<number, string> = {
  10759: '액션어드벤처', 16: '애니메이션', 35: '코미디', 80: '범죄',
  99: '다큐멘터리', 18: '드라마', 10751: '가족', 10762: '키즈',
  9648: '미스터리', 10765: 'SF판타지', 10768: '전쟁정치', 37: '서부'
}

async function searchTmdb(query: string): Promise<unknown[]> {
  const TMDB_API_KEY = await getApiKey('tmdb_api_key', DEFAULT_TMDB_KEY)
  const params = new URLSearchParams({ api_key: TMDB_API_KEY, query, language: 'ko-KR', page: '1' })
  const res = await fetch(`https://api.themoviedb.org/3/search/multi?${params}`)
  if (!res.ok) throw new Error(`TMDB API 오류: ${res.status}`)
  const data = await res.json() as { results?: Record<string, unknown>[] }
  const items = (data.results ?? []).filter((r) => ['movie', 'tv'].includes(r.media_type as string)).slice(0, 6)

  return Promise.all(items.map(async (item) => {
    const mediaType = item.media_type as string
    let director = ''
    try {
      const endpoint = mediaType === 'movie' ? 'movie' : 'tv'
      const cp = new URLSearchParams({ api_key: TMDB_API_KEY, language: 'ko-KR' })
      const cr = await fetch(`https://api.themoviedb.org/3/${endpoint}/${item.id}/credits?${cp}`)
      if (cr.ok) {
        const cd = await cr.json() as { crew?: Array<{ job: string; name: string }> }
        director = mediaType === 'movie'
          ? cd.crew?.find((c) => c.job === 'Director')?.name ?? ''
          : cd.crew?.filter((c) => ['Creator', 'Executive Producer', 'Series Director'].includes(c.job))?.[0]?.name ?? ''
      }
    } catch { /* ignore */ }

    const genreIds = (item.genre_ids as number[] | undefined) ?? []
    const genreMap = mediaType === 'movie' ? MOVIE_GENRES : TV_GENRES
    const genre = genreIds.map((id) => genreMap[id]).filter(Boolean).slice(0, 3).join(', ')

    return {
      tmdb_id: item.id,
      title: item.title ?? item.name ?? '',
      original_title: item.original_title ?? item.original_name ?? '',
      item_type: mediaType === 'movie' ? 'movie' : 'drama',
      cover_path: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
      backdrop_path: item.backdrop_path ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}` : null,
      year: ((item.release_date ?? item.first_air_date ?? '') as string).slice(0, 4) || null,
      overview: item.overview ?? '',
      genre,
      director,
      vote_average: item.vote_average ?? 0
    }
  }))
}

// ── 이미지 선택 + 리사이즈 ────────────────────────────────────────
function pickImageRaw(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    let resolved = false

    const done = (val: string | null) => {
      if (resolved) return
      resolved = true
      resolve(val)
    }

    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) { done(null); return }
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const img = new Image()
        img.onload = () => {
          const MAX = 1200
          const scale = img.width > MAX || img.height > MAX
            ? Math.min(MAX / img.width, MAX / img.height) : 1
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(img.width * scale)
          canvas.height = Math.round(img.height * scale)
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          done(canvas.toDataURL('image/jpeg', 0.85))
        }
        img.onerror = () => done(dataUrl)
        img.src = dataUrl
      }
      reader.onerror = () => done(null)
      reader.readAsDataURL(file)
    }

    // 취소 이벤트 (모던 브라우저 지원)
    input.addEventListener('cancel', () => done(null))

    // 폴백: focus 복귀 후 충분한 시간 대기 (모바일 대응 1500ms)
    window.addEventListener('focus', () => {
      setTimeout(() => done(null), 1500)
    }, { once: true })

    input.click()
  })
}

// ── Supabase Storage 업로드 ────────────────────────────────────────
async function uploadCover(dataUrl: string, userId: string): Promise<string> {
  try {
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    const ext = blob.type.includes('png') ? 'png' : 'jpg'
    const path = `${userId}/${Date.now()}.${ext}`
    const { data, error } = await supabase.storage
      .from('covers')
      .upload(path, blob, { contentType: blob.type, upsert: false })
    if (error) return dataUrl
    const { data: { publicUrl } } = supabase.storage.from('covers').getPublicUrl(data.path)
    return publicUrl
  } catch {
    return dataUrl
  }
}

// ── window.api 구현 ───────────────────────────────────────────────
export async function setupWebApi(): Promise<void> {
  const api = {
    items: {
      getAll: async () => {
        if (!(await isAuthenticated())) {
          return anonLoad<Record<string, unknown>[]>(ANON.items, [])
            .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
        }
        const userId = await getUserId()
        const { data, error } = await supabase
          .from('items')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
        if (error) throw error
        return data ?? []
      },

      getById: async (id: number) => {
        if (!(await isAuthenticated())) {
          const items = anonLoad<Record<string, unknown>[]>(ANON.items, [])
          return items.find((i) => i.id === id) ?? null
        }
        const { data, error } = await supabase
          .from('items')
          .select('*')
          .eq('id', id)
          .maybeSingle()
        if (error) throw error
        return data
      },

      insert: async (data: Record<string, unknown>) => {
        if (!(await isAuthenticated())) {
          const items = anonLoad<Record<string, unknown>[]>(ANON.items, [])
          const now = new Date().toISOString()
          const newItem: Record<string, unknown> = {
            id: anonNextId(),
            title: data.title ?? '',
            original_title: data.original_title ?? null,
            item_type: data.item_type ?? 'book',
            cover_path: data.cover_path ?? null,
            backdrop_path: data.backdrop_path ?? null,
            author: data.author ?? null,
            publisher: data.publisher ?? null,
            isbn: data.isbn ?? null,
            page_count: data.page_count ?? null,
            current_page: data.current_page ?? 0,
            director: data.director ?? null,
            platform: data.platform ?? null,
            tmdb_id: data.tmdb_id ?? null,
            google_books_id: data.google_books_id ?? null,
            genre: data.genre ?? null,
            year: data.year ?? null,
            overview: data.overview ?? null,
            rating: data.rating ?? null,
            status: data.status ?? 'want',
            review: data.review ?? null,
            read_date: data.read_date ?? null,
            created_at: now,
            updated_at: now,
          }
          items.unshift(newItem)
          anonSave(ANON.items, items)
          return newItem
        }
        const userId = await getUserId()
        const insertPayload: Record<string, unknown> = {
            user_id: userId,
            title: data.title ?? '',
            original_title: data.original_title ?? null,
            item_type: data.item_type ?? 'book',
            cover_path: data.cover_path ?? null,
            backdrop_path: data.backdrop_path ?? null,
            author: data.author ?? null,
            publisher: data.publisher ?? null,
            isbn: data.isbn ?? null,
            page_count: data.page_count ?? null,
            current_page: data.current_page ?? 0,
            director: data.director ?? null,
            platform: data.platform ?? null,
            tmdb_id: data.tmdb_id ?? null,
            google_books_id: data.google_books_id ?? null,
            genre: data.genre ?? null,
            year: data.year ?? null,
            overview: data.overview ?? null,
            rating: data.rating ?? null,
            status: data.status ?? 'want',
            review: data.review ?? null,
            read_date: data.read_date ?? null,
          }
        // 마이그레이션 등 created_at이 명시된 경우 보존
        if (data.created_at) insertPayload.created_at = data.created_at
        const { data: row, error } = await supabase
          .from('items')
          .insert(insertPayload)
          .select()
          .single()
        if (error) throw error
        return row
      },

      update: async (id: number, data: Record<string, unknown>) => {
        if (!(await isAuthenticated())) {
          const items = anonLoad<Record<string, unknown>[]>(ANON.items, [])
          const idx = items.findIndex((i) => i.id === id)
          if (idx === -1) return
          const allowed = [
            'title', 'original_title', 'item_type', 'cover_path', 'backdrop_path',
            'author', 'publisher', 'isbn', 'page_count', 'current_page',
            'director', 'platform', 'tmdb_id', 'google_books_id', 'genre',
            'year', 'overview', 'rating', 'status', 'review', 'read_date'
          ]
          for (const key of allowed) {
            if (key in data) items[idx][key] = data[key] ?? null
          }
          items[idx].updated_at = new Date().toISOString()
          anonSave(ANON.items, items)
          return
        }
        const allowed = [
          'title', 'original_title', 'item_type', 'cover_path', 'backdrop_path',
          'author', 'publisher', 'isbn', 'page_count', 'current_page',
          'director', 'platform', 'tmdb_id', 'google_books_id', 'genre',
          'year', 'overview', 'rating', 'status', 'review', 'read_date'
        ]
        const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
        for (const key of allowed) {
          if (key in data) payload[key] = data[key] ?? null
        }
        const { error } = await supabase.from('items').update(payload).eq('id', id)
        if (error) throw error
      },

      delete: async (id: number) => {
        if (!(await isAuthenticated())) {
          const items = anonLoad<Record<string, unknown>[]>(ANON.items, [])
          anonSave(ANON.items, items.filter((i) => i.id !== id))
          // 관련 quotes도 삭제
          const quotes = anonLoad<Record<string, unknown>[]>(ANON.quotes, [])
          anonSave(ANON.quotes, quotes.filter((q) => q.item_id !== id))
          return
        }
        // CASCADE가 없는 환경을 대비해 명시적으로 quotes 먼저 삭제
        await supabase.from('quotes').delete().eq('item_id', id)
        const { error } = await supabase.from('items').delete().eq('id', id)
        if (error) throw error
      }
    },

    quotes: {
      getByItemId: async (itemId: number) => {
        if (!(await isAuthenticated())) {
          const quotes = anonLoad<Record<string, unknown>[]>(ANON.quotes, [])
          return quotes
            .filter((q) => q.item_id === itemId)
            .sort((a, b) => (Number(a.page_number ?? 0) - Number(b.page_number ?? 0)))
        }
        const { data, error } = await supabase
          .from('quotes')
          .select('*')
          .eq('item_id', itemId)
          .order('page_number', { ascending: true, nullsFirst: false })
        if (error) throw error
        return data ?? []
      },

      search: async (query: string) => {
        if (!(await isAuthenticated())) {
          const items = anonLoad<Record<string, unknown>[]>(ANON.items, [])
          const quotes = anonLoad<Record<string, unknown>[]>(ANON.quotes, [])
          const itemMap = new Map(items.map((i) => [i.id, i]))
          const q = query.toLowerCase()
          return quotes
            .filter((qt) => String(qt.text ?? '').toLowerCase().includes(q) || String(qt.note ?? '').toLowerCase().includes(q))
            .map((qt) => {
              const item = itemMap.get(qt.item_id) as Record<string, unknown> | undefined
              return { ...qt, item_title: item?.title ?? '', item_type: item?.item_type ?? '', cover_path: item?.cover_path ?? null }
            })
        }
        const userId = await getUserId()
        const { data: userItems } = await supabase
          .from('items')
          .select('id, title, item_type, cover_path')
          .eq('user_id', userId)
        if (!userItems || userItems.length === 0) return []
        const itemIds = userItems.map((i: Record<string, unknown>) => i.id)
        const itemMap = new Map(userItems.map((i: Record<string, unknown>) => [i.id, i]))

        const { data: quotes, error } = await supabase
          .from('quotes')
          .select('*')
          .in('item_id', itemIds)
          .or(`text.ilike.%${query}%,note.ilike.%${query}%`)
          .order('created_at', { ascending: false })
        if (error) throw error

        return (quotes ?? []).map((q: Record<string, unknown>) => {
          const item = itemMap.get(q.item_id) as Record<string, unknown> | undefined
          return {
            ...q,
            item_title: item?.title ?? '',
            item_type: item?.item_type ?? '',
            cover_path: item?.cover_path ?? null,
          }
        })
      },

      insert: async (data: Record<string, unknown>) => {
        if (!(await isAuthenticated())) {
          const quotes = anonLoad<Record<string, unknown>[]>(ANON.quotes, [])
          const newQuote: Record<string, unknown> = {
            id: anonNextId(),
            item_id: data.item_id,
            text: data.text,
            page_number: data.page_number ?? null,
            note: data.note ?? null,
            created_at: new Date().toISOString(),
          }
          quotes.push(newQuote)
          anonSave(ANON.quotes, quotes)
          return newQuote
        }
        const userId = await getUserId()
        const { data: row, error } = await supabase
          .from('quotes')
          .insert({
            user_id: userId,
            item_id: data.item_id,
            text: data.text,
            page_number: data.page_number ?? null,
            note: data.note ?? null,
          })
          .select()
          .single()
        if (error) throw error
        return row
      },

      update: async (id: number, data: Record<string, unknown>) => {
        if (!(await isAuthenticated())) {
          const quotes = anonLoad<Record<string, unknown>[]>(ANON.quotes, [])
          const idx = quotes.findIndex((q) => q.id === id)
          if (idx === -1) return
          if (data.text !== undefined) quotes[idx].text = data.text
          if (data.page_number !== undefined) quotes[idx].page_number = data.page_number
          if (data.note !== undefined) quotes[idx].note = data.note
          anonSave(ANON.quotes, quotes)
          return
        }
        const payload: Record<string, unknown> = {}
        if (data.text !== undefined) payload.text = data.text
        if (data.page_number !== undefined) payload.page_number = data.page_number
        if (data.note !== undefined) payload.note = data.note
        if (Object.keys(payload).length === 0) return
        const { error } = await supabase.from('quotes').update(payload).eq('id', id)
        if (error) throw error
      },

      delete: async (id: number) => {
        if (!(await isAuthenticated())) {
          const quotes = anonLoad<Record<string, unknown>[]>(ANON.quotes, [])
          anonSave(ANON.quotes, quotes.filter((q) => q.id !== id))
          return
        }
        const { error } = await supabase.from('quotes').delete().eq('id', id)
        if (error) throw error
      }
    },

    settings: {
      get: async (key: string) => {
        if (!(await isAuthenticated())) {
          const settings = anonLoad<Record<string, string>>(ANON.settings, {})
          return settings[key] ?? ''
        }
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return ''
        const { data } = await supabase
          .from('settings')
          .select('value')
          .eq('user_id', user.id)
          .eq('key', key)
          .maybeSingle()
        return (data?.value as string) ?? ''
      },
      set: async (key: string, value: string) => {
        if (!(await isAuthenticated())) {
          const settings = anonLoad<Record<string, string>>(ANON.settings, {})
          settings[key] = value
          anonSave(ANON.settings, settings)
          return
        }
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        await supabase.from('settings').upsert({ user_id: user.id, key, value })
      }
    },

    books: {
      search: async (query: string) => searchGoogleBooks(query)
    },

    tmdb: {
      search: async (query: string) => searchTmdb(query)
    },

    image: {
      pick: async (): Promise<string | null> => {
        const dataUrl = await pickImageRaw()
        if (!dataUrl) return null
        // 비로그인: data URL 그대로 반환 (localStorage에 저장됨)
        if (!(await isAuthenticated())) return dataUrl
        try {
          const userId = await getUserId()
          return await uploadCover(dataUrl, userId)
        } catch {
          return dataUrl
        }
      },
      saveCropped: async (base64Data: string, _fileName: string): Promise<string> => {
        if (!(await isAuthenticated())) return base64Data
        try {
          const userId = await getUserId()
          return await uploadCover(base64Data, userId)
        } catch {
          return base64Data
        }
      },
      copyLocal: async (srcPath: string): Promise<string> => srcPath
    },

    db: {
      backup: async () => {
        let items: unknown[], quotes: unknown[]
        if (!(await isAuthenticated())) {
          items = anonLoad<unknown[]>(ANON.items, [])
          quotes = anonLoad<unknown[]>(ANON.quotes, [])
        } else {
          const userId = await getUserId()
          const [{ data: i }, { data: q }] = await Promise.all([
            supabase.from('items').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
            supabase.from('quotes').select('*').eq('user_id', userId).order('created_at', { ascending: true })
          ])
          items = i ?? []
          quotes = q ?? []
        }
        const json = JSON.stringify({ items, quotes }, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `moabom-backup-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        return { success: true }
      },

      restore: async () => {
        return new Promise<{ success: boolean }>((resolve) => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = '.json'
          input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0]
            if (!file) { resolve({ success: false }); return }
            try {
              const text = await file.text()
              const { items, quotes } = JSON.parse(text) as {
                items: Record<string, unknown>[]
                quotes: Record<string, unknown>[]
              }

              if (!(await isAuthenticated())) {
                // 비로그인: localStorage에 덮어쓰기 (유효성 검사 후)
                if (!Array.isArray(items) || !Array.isArray(quotes)) {
                  throw new Error('올바르지 않은 백업 파일 형식입니다.')
                }
                anonSave(ANON.items, items)
                anonSave(ANON.quotes, quotes)
                resolve({ success: true })
                return
              }

              // 유효성 검사: 삭제 전 먼저 구조 확인 (데이터 손실 방지)
              if (!Array.isArray(items) || !Array.isArray(quotes)) {
                throw new Error('올바르지 않은 백업 파일 형식입니다. items/quotes 배열이 없습니다.')
              }

              const userId = await getUserId()

              // 삭제 전 현재 데이터 백업 (복원 실패 시 롤백용)
              const [{ data: oldItems }, { data: oldQuotes }] = await Promise.all([
                supabase.from('items').select('*').eq('user_id', userId),
                supabase.from('quotes').select('*').eq('user_id', userId)
              ])

              await supabase.from('quotes').delete().eq('user_id', userId)
              await supabase.from('items').delete().eq('user_id', userId)

              const idMap = new Map<number, number>()
              for (const item of items) {
                const oldId = item.id as number
                const { data: newItem } = await supabase
                  .from('items')
                  .insert({
                    user_id: userId,
                    title: item.title ?? '',
                    original_title: item.original_title ?? null,
                    item_type: item.item_type ?? 'book',
                    cover_path: item.cover_path ?? null,
                    backdrop_path: item.backdrop_path ?? null,
                    author: item.author ?? null,
                    publisher: item.publisher ?? null,
                    isbn: item.isbn ?? null,
                    page_count: item.page_count ?? null,
                    current_page: item.current_page ?? 0,
                    director: item.director ?? null,
                    platform: item.platform ?? null,
                    tmdb_id: item.tmdb_id ?? null,
                    google_books_id: item.google_books_id ?? null,
                    genre: item.genre ?? null,
                    year: item.year ?? null,
                    overview: item.overview ?? null,
                    rating: item.rating ?? null,
                    status: item.status ?? 'want',
                    review: item.review ?? null,
                    read_date: item.read_date ?? null,
                  })
                  .select('id')
                  .single()
                if (newItem) idMap.set(oldId, (newItem as Record<string, unknown>).id as number)
              }

              for (const q of quotes) {
                const newItemId = idMap.get(q.item_id as number)
                if (!newItemId) continue
                await supabase.from('quotes').insert({
                  user_id: userId,
                  item_id: newItemId,
                  text: q.text,
                  page_number: q.page_number ?? null,
                  note: q.note ?? null,
                })
              }

              resolve({ success: true })
            } catch (err) {
              console.error('복원 실패:', err)
              // 복원 실패 시 원래 데이터 복구 시도
              try {
                const userId2 = await getUserId()
                if (oldItems && oldItems.length > 0) {
                  await supabase.from('quotes').delete().eq('user_id', userId2)
                  await supabase.from('items').delete().eq('user_id', userId2)
                  for (const item of oldItems) {
                    await supabase.from('items').insert({ ...item })
                  }
                  for (const quote of (oldQuotes ?? [])) {
                    await supabase.from('quotes').insert({ ...quote })
                  }
                }
              } catch (rollbackErr) {
                console.error('롤백 실패:', rollbackErr)
              }
              resolve({ success: false })
            }
          }
          input.click()
        })
      }
    }
  }

  ;(window as unknown as Record<string, unknown>).api = api
}
