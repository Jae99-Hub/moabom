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

const nowIso = (): string => new Date().toISOString()
const TRASH_DAYS = 15
type Row = Record<string, unknown>

/** 휴지통 15일 지난 항목 영구삭제 (휴지통을 열 때 정리) */
async function purgeExpiredTrash(days = TRASH_DAYS): Promise<void> {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()
  if (!(await isAuthenticated())) {
    const items = anonLoad<Row[]>(ANON.items, [])
    const expired = new Set(items.filter((i) => i.is_deleted && String(i.deleted_at ?? '') < cutoff).map((i) => i.id))
    if (expired.size === 0) return
    anonSave(ANON.items, items.filter((i) => !expired.has(i.id)))
    anonSave(ANON.quotes, anonLoad<Row[]>(ANON.quotes, []).filter((q) => !expired.has(q.item_id)))
    return
  }
  const userId = await getUserId()
  await supabase.from('quotes').delete().eq('user_id', userId).eq('is_deleted', true).lt('deleted_at', cutoff)
  await supabase.from('items').delete().eq('user_id', userId).eq('is_deleted', true).lt('deleted_at', cutoff)
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

// ── 도서·영화 검색 — 모아봄 웹 서버(/api)를 거친다 ──────────────────
// 검색 키를 브라우저 코드에 두지 않기 위해서 (서버가 키를 들고 대신 요청, 같은 검색어는 잠시 저장해 빠르게 돌려줌)
async function searchViaServer(path: 'books' | 'tmdb', query: string): Promise<unknown[]> {
  let res: Response
  try {
    res = await fetch(`/api/${path}?q=${encodeURIComponent(query.trim())}`, { signal: AbortSignal.timeout(15000) })
  } catch {
    throw new Error('검색 응답이 없어요. 인터넷 연결을 확인하고 다시 시도해 주세요.')
  }
  const data = await res.json().catch(() => null) as unknown
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error
    throw new Error(message || `검색 서버에 문제가 있어요. 잠시 뒤 다시 시도해 주세요. (${res.status})`)
  }
  return Array.isArray(data) ? data : []
}

const searchGoogleBooks = (query: string): Promise<unknown[]> => searchViaServer('books', query)
const searchTmdb = (query: string): Promise<unknown[]> => searchViaServer('tmdb', query)

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
            .filter((i) => !i.is_deleted)
            .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
        }
        const userId = await getUserId()
        // 휴지통 항목은 빼고 (데스크톱 앱이 휴지통으로 옮긴 것도 클라우드엔 '삭제 표시'로 남아 있음)
        const { data, error } = await supabase
          .from('items')
          .select('*')
          .eq('user_id', userId)
          .not('is_deleted', 'is', true)
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

      // 휴지통으로 옮김 (15일 뒤 영구삭제). 함께 옮긴 명대사는 같은 삭제 시각을 받아 복원할 때 함께 되살아남.
      // 클라우드에 '삭제 표시'로 남기므로 데스크톱 앱도 동기화 때 휴지통으로 옮긴다.
      delete: async (id: number) => {
        const ts = nowIso()
        if (!(await isAuthenticated())) {
          const items = anonLoad<Row[]>(ANON.items, []).map((i) =>
            i.id === id ? { ...i, is_deleted: true, deleted_at: ts, updated_at: ts } : i)
          anonSave(ANON.items, items)
          const quotes = anonLoad<Row[]>(ANON.quotes, []).map((q) =>
            q.item_id === id && !q.is_deleted ? { ...q, is_deleted: true, deleted_at: ts } : q)
          anonSave(ANON.quotes, quotes)
          return
        }
        const { error } = await supabase.from('items')
          .update({ is_deleted: true, deleted_at: ts, updated_at: ts }).eq('id', id)
        if (error) throw error
        await supabase.from('quotes')
          .update({ is_deleted: true, deleted_at: ts, updated_at: ts })
          .eq('item_id', id).not('is_deleted', 'is', true)
      }
    },

    trash: {
      getAll: async () => {
        try { await purgeExpiredTrash() } catch { /* 정리 실패는 목록 표시에 영향 없음 */ }
        if (!(await isAuthenticated())) {
          return anonLoad<Row[]>(ANON.items, [])
            .filter((i) => i.is_deleted)
            .sort((a, b) => String(b.deleted_at ?? '').localeCompare(String(a.deleted_at ?? '')))
        }
        const userId = await getUserId()
        const { data, error } = await supabase
          .from('items').select('*')
          .eq('user_id', userId).eq('is_deleted', true)
          .order('deleted_at', { ascending: false })
        if (error) throw error
        return data ?? []
      },

      restore: async (id: number) => {
        const ts = nowIso()
        if (!(await isAuthenticated())) {
          const items = anonLoad<Row[]>(ANON.items, [])
          const deletedAt = items.find((i) => i.id === id)?.deleted_at
          anonSave(ANON.items, items.map((i) =>
            i.id === id ? { ...i, is_deleted: false, deleted_at: null, updated_at: ts } : i))
          anonSave(ANON.quotes, anonLoad<Row[]>(ANON.quotes, []).map((q) =>
            q.item_id === id && q.is_deleted && q.deleted_at === deletedAt ? { ...q, is_deleted: false, deleted_at: null } : q))
          return
        }
        const { data: item } = await supabase.from('items').select('deleted_at').eq('id', id).maybeSingle()
        const deletedAt = (item?.deleted_at as string | null) ?? null
        // 항목과 함께 휴지통에 들어간 명대사만 되살림 (따로 지운 명대사는 그대로)
        let quotes = supabase.from('quotes')
          .update({ is_deleted: false, deleted_at: null, updated_at: ts })
          .eq('item_id', id).eq('is_deleted', true)
        quotes = deletedAt ? quotes.eq('deleted_at', deletedAt) : quotes.is('deleted_at', null)
        await quotes
        const { error } = await supabase.from('items')
          .update({ is_deleted: false, deleted_at: null, updated_at: ts }).eq('id', id)
        if (error) throw error
      },

      purge: async (id: number) => {
        if (!(await isAuthenticated())) {
          anonSave(ANON.items, anonLoad<Row[]>(ANON.items, []).filter((i) => i.id !== id))
          anonSave(ANON.quotes, anonLoad<Row[]>(ANON.quotes, []).filter((q) => q.item_id !== id))
          return
        }
        await supabase.from('quotes').delete().eq('item_id', id)
        const { error } = await supabase.from('items').delete().eq('id', id)
        if (error) throw error
      },

      purgeExpired: async (days: number) => purgeExpiredTrash(days),
    },

    quotes: {
      getByItemId: async (itemId: number) => {
        if (!(await isAuthenticated())) {
          const quotes = anonLoad<Record<string, unknown>[]>(ANON.quotes, [])
          return quotes
            .filter((q) => q.item_id === itemId && !q.is_deleted)
            .sort((a, b) => (Number(a.page_number ?? 0) - Number(b.page_number ?? 0)))
        }
        const { data, error } = await supabase
          .from('quotes')
          .select('*')
          .eq('item_id', itemId)
          .not('is_deleted', 'is', true)
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
            .filter((qt) => !qt.is_deleted && !(itemMap.get(qt.item_id) as Row | undefined)?.is_deleted)
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
          .not('is_deleted', 'is', true)
        if (!userItems || userItems.length === 0) return []
        const itemIds = userItems.map((i: Record<string, unknown>) => i.id)
        const itemMap = new Map(userItems.map((i: Record<string, unknown>) => [i.id, i]))

        const { data: quotes, error } = await supabase
          .from('quotes')
          .select('*')
          .in('item_id', itemIds)
          .not('is_deleted', 'is', true)
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
            episode_number: data.episode_number ?? null,
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
            episode_number: data.episode_number ?? null, // 드라마·다큐 회차 (예전엔 웹에서 빠졌음)
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
          if (data.episode_number !== undefined) quotes[idx].episode_number = data.episode_number
          if (data.note !== undefined) quotes[idx].note = data.note
          anonSave(ANON.quotes, quotes)
          return
        }
        const payload: Record<string, unknown> = {}
        if (data.text !== undefined) payload.text = data.text
        if (data.page_number !== undefined) payload.page_number = data.page_number
        if (data.episode_number !== undefined) payload.episode_number = data.episode_number
        if (data.note !== undefined) payload.note = data.note
        if (Object.keys(payload).length === 0) return
        payload.updated_at = nowIso() // 데스크톱 앱이 바뀐 걸 알아채게
        const { error } = await supabase.from('quotes').update(payload).eq('id', id)
        if (error) throw error
      },

      delete: async (id: number) => {
        if (!(await isAuthenticated())) {
          const quotes = anonLoad<Record<string, unknown>[]>(ANON.quotes, [])
          anonSave(ANON.quotes, quotes.filter((q) => q.id !== id))
          return
        }
        // 지우지 않고 '삭제 표시' — 그래야 데스크톱 앱도 동기화 때 지운 걸 알 수 있음 (15일 뒤 정리)
        const ts = nowIso()
        const { error } = await supabase.from('quotes')
          .update({ is_deleted: true, deleted_at: ts, updated_at: ts }).eq('id', id)
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
      }
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
            // 롤백용: catch 블록에서도 접근 가능하도록 try 밖에서 선언
            let oldItems: Record<string, unknown>[] | null = null
            let oldQuotes: Record<string, unknown>[] | null = null
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
              const [itemsRes, quotesRes] = await Promise.all([
                supabase.from('items').select('*').eq('user_id', userId),
                supabase.from('quotes').select('*').eq('user_id', userId)
              ])
              oldItems = itemsRes.data
              oldQuotes = quotesRes.data

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
