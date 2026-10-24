/**
 * 웹(브라우저) 환경에서 window.api를 구현합니다.
 * - 로그인 시: Supabase (PostgreSQL)
 * - 비로그인 시: localStorage
 */

import { supabase, isSupabaseConfigured, storedUserId } from './supabaseClient'
import { isExactMatch, mergeItemFields } from './syncMatch'

// ── Anonymous localStorage 헬퍼 ──────────────────────────────────
const ANON = {
  items:   'moabom_items',
  quotes:  'moabom_quotes',
  nextId:  'moabom_next_id',
}

function anonLoad<T>(key: string, def: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? def } catch { return def }
}
function anonSave(key: string, val: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch {
    // 브라우저 저장 공간(보통 5MB)이 가득 참 — 직접 넣은 표지가 많으면 생김. 조용히 버리면 기록이 사라지므로 알린다
    throw new Error('이 브라우저의 저장 공간이 가득 찼어요. 로그인하면 공간 걱정 없이 기록할 수 있어요.')
  }
}
function anonNextId(): number {
  const id = anonLoad<number>(ANON.nextId, 0) + 1
  anonSave(ANON.nextId, id)
  return id
}

const nowIso = (): string => new Date().toISOString()
const TRASH_DAYS = 15
const PAGE = 1000 // Supabase가 한 번에 돌려주는 최대 행 수
type Row = Record<string, unknown>

// 작품 칸 (클라우드·브라우저 저장 공통) — 화면이 보낸 값 중 이것만 저장
const ITEM_FIELDS = [
  'title', 'original_title', 'item_type', 'cover_path', 'backdrop_path',
  'author', 'publisher', 'isbn', 'page_count', 'current_page',
  'director', 'platform', 'tmdb_id', 'google_books_id', 'genre',
  'year', 'overview', 'rating', 'status', 'review', 'read_date',
] as const

function itemFields(src: Row): Row {
  const out: Row = {}
  for (const k of ITEM_FIELDS) out[k] = src[k] ?? null
  out.title = String(src.title ?? '')
  out.item_type = src.item_type ?? 'book'
  out.status = src.status ?? 'want'
  out.current_page = Number(src.current_page ?? 0) || 0
  return out
}

/** 바꾼 칸만 (부분 수정용) */
function changedItemFields(src: Row): Row {
  const out: Row = {}
  for (const k of ITEM_FIELDS) if (k in src) out[k] = src[k] ?? null
  return out
}

/** 명대사 정렬 — 데스크톱과 같게: 쪽/회차 순, 같으면 쓴 순서 */
function sortQuotes(list: Row[]): Row[] {
  const pos = (q: Row) => Number(q.page_number ?? q.episode_number ?? Infinity)
  return list.sort((a, b) => (pos(a) - pos(b)) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
}

/** 휴지통 15일 지난 항목 영구삭제 (휴지통을 열 때 정리) */
async function purgeExpiredTrash(days = TRASH_DAYS): Promise<void> {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()
  const userId = await currentUserId()
  if (!userId) {
    const items = anonLoad<Row[]>(ANON.items, [])
    const expired = new Set(items.filter((i) => i.is_deleted && String(i.deleted_at ?? '') < cutoff).map((i) => i.id))
    if (expired.size === 0) return
    anonSave(ANON.items, items.filter((i) => !expired.has(i.id)))
    anonSave(ANON.quotes, anonLoad<Row[]>(ANON.quotes, []).filter((q) => !expired.has(q.item_id)))
    return
  }
  await supabase.from('quotes').delete().eq('user_id', userId).eq('is_deleted', true).lt('deleted_at', cutoff)
  await supabase.from('items').delete().eq('user_id', userId).eq('is_deleted', true).lt('deleted_at', cutoff)
}

/** 지금 로그인한 계정 id. 이 기기에 저장된 로그인으로 판단해 작업마다 서버에 묻지 않는다.
 *  (예전엔 매번 서버에 물어 느렸고, 연결이 잠깐 끊기면 '로그인 안 됨'으로 보고 이 브라우저의 비로그인 기록을 보여 줬음) */
async function currentUserId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (session) return session.user.id
    // 만료된 로그인을 연결 문제로 갱신하지 못함 → 로그인 상태로 두고, 요청이 실패하면 그 오류를 보여 준다
    return error ? storedUserId() : null
  } catch { return storedUserId() }
}

async function isAuthenticated(): Promise<boolean> {
  return (await currentUserId()) !== null
}

async function getUserId(): Promise<string> {
  const id = await currentUserId()
  if (!id) throw new Error('로그인이 필요합니다')
  return id
}

/** 내 행 전부 (1,000행씩 나눠 받음 — 한 번에 받으면 1,000행 넘는 부분이 잘림) */
async function fetchAllRows(table: 'items' | 'quotes', userId: string): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').eq('user_id', userId)
      .order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

// ── 도서·영화 검색 — 모아봄 웹 서버(/api)를 거친다 ──────────────────
// 검색 키를 브라우저 코드에 두지 않기 위해서 (서버가 키를 들고 대신 요청, 같은 검색어는 잠시 저장해 빠르게 돌려줌)
async function searchViaServer(path: 'books' | 'tmdb', query: string): Promise<unknown[]> {
  // 서버와 같은 방식으로 검색어를 정리해서 보냄 → 같은 검색어는 서버에 저장된 결과를 바로 받음 (api/_shared.js)
  const q = Array.from(query.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()).slice(0, 100).join('').trim()
  let res: Response
  try {
    res = await fetch(`/api/${path}?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(15000) })
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

// ── 파일 고르기 ───────────────────────────────────────────────────
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    let resolved = false
    const done = (file: File | null) => {
      if (resolved) return
      resolved = true
      resolve(file)
    }
    input.onchange = () => done(input.files?.[0] ?? null)
    // 취소 이벤트 (최신 브라우저). 지원하지 않는 브라우저에서 취소하면 다음 고르기 때까지 그냥 기다린다
    // — 예전의 '창으로 돌아오면 1.5초 뒤 취소로 보기'는 휴대폰에서 사진을 고르는 중에 취소돼 버렸음
    input.addEventListener('cancel', () => done(null))
    input.click()
  })
}

// ── 이미지 선택 + 리사이즈 (표지는 data URL로 기록에 함께 저장) ─────
async function pickImage(): Promise<string | null> {
  const file = await pickFile('image/*')
  if (!file) return null
  const dataUrl = await new Promise<string | null>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
  if (!dataUrl) return null
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const MAX = 1200
      const scale = Math.min(1, MAX / img.width, MAX / img.height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(dataUrl); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => resolve(null) // 이미지가 아니거나 브라우저가 못 여는 형식(HEIC 등)
    img.src = dataUrl
  })
}

// ── 백업 파일로 되돌리기 (로그인) ────────────────────────────────────
// 지우고 다시 넣지 않고, 같은 항목은 그 자리에서 고치고 백업에 없는 항목은 휴지통으로 옮긴다.
// 예전엔 클라우드의 내 기록을 모두 지우고 새로 넣어서 ① 데스크톱 앱이 가진 연결이 모두 끊겨 같은 작품이 두 번씩 생기고
// ② 회차·삭제 상태·기록한 날짜가 빠졌으며 ③ 중간에 실패하면 기록이 사라질 수 있었음.
/** 작업을 limit개씩 동시에 (요청을 하나씩 기다리면 수백 개에 몇 분이 걸림). 하나라도 실패하면 그 오류를 던짐 */
async function runLimited(tasks: (() => Promise<void>)[], limit = 8): Promise<void> {
  let next = 0
  let failed = false
  let firstError: unknown
  // 하나가 실패하면 나머지는 새로 시작하지 않음 (실패를 알린 뒤에도 뒤에서 계속 쓰지 않게)
  const worker = async () => {
    while (!failed && next < tasks.length) {
      try { await tasks[next++]() } catch (e) { if (!failed) { failed = true; firstError = e } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  if (failed) throw firstError
}

/** 지금 기록을 JSON 파일로 내려받음 (설정의 '백업'과 백업으로 되돌리기 직전의 안전 백업) */
async function downloadBackup(userId: string | null, label = '백업'): Promise<void> {
  let items: Row[], quotes: Row[]
  if (!userId) {
    items = anonLoad<Row[]>(ANON.items, [])
    quotes = anonLoad<Row[]>(ANON.quotes, [])
  } else {
    ;[items, quotes] = await Promise.all([fetchAllRows('items', userId), fetchAllRows('quotes', userId)])
  }
  const json = JSON.stringify({ app: 'moabom', exported_at: nowIso(), items, quotes }, null, 2)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `모아봄-${label}-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function restoreCloudFromBackup(userId: string, items: Row[], quotes: Row[]): Promise<void> {
  const ts = nowIso()
  const [curItems, curQuotes] = await Promise.all([fetchAllRows('items', userId), fetchAllRows('quotes', userId)])
  const curItemIds = new Set(curItems.map((r) => r.id))
  const curQuoteIds = new Set(curQuotes.map((r) => r.id))

  // 같은 계정의 백업이면 id로 그 자리를 고치고, 아니면(다른 계정·비로그인 백업) 새로 넣는다
  const sameRow = (r: Row, ids: Set<unknown>) => r.user_id === userId && ids.has(r.id)
  const check = ({ error }: { error: unknown }) => { if (error) throw error }
  const idMap = new Map<unknown, unknown>()
  await runLimited(items.map((it) => async () => {
    const row: Row = {
      ...itemFields(it), user_id: userId, updated_at: ts,
      created_at: it.created_at ?? ts, is_deleted: !!it.is_deleted, deleted_at: it.is_deleted ? (it.deleted_at ?? ts) : null,
    }
    if (sameRow(it, curItemIds)) {
      check(await supabase.from('items').update(row).eq('id', it.id).eq('user_id', userId))
      idMap.set(it.id, it.id)
      return
    }
    const { data, error } = await supabase.from('items').insert(row).select('id').single()
    if (error) throw error
    idMap.set(it.id, (data as Row).id)
  }))

  const restoredQuoteIds = new Set<unknown>()
  await runLimited(quotes.map((q) => async () => {
    const itemId = idMap.get(q.item_id)
    if (itemId == null) return
    const row: Row = {
      user_id: userId, item_id: itemId, text: String(q.text ?? ''),
      page_number: q.page_number ?? null, episode_number: q.episode_number ?? null, note: q.note ?? null,
      created_at: q.created_at ?? ts, updated_at: ts,
      is_deleted: !!q.is_deleted, deleted_at: q.is_deleted ? (q.deleted_at ?? ts) : null,
    }
    if (sameRow(q, curQuoteIds)) {
      check(await supabase.from('quotes').update(row).eq('id', q.id).eq('user_id', userId))
      restoredQuoteIds.add(q.id)
      return
    }
    check(await supabase.from('quotes').insert(row))
  }))

  // 백업에 없던 지금 기록은 휴지통으로 (15일 안에 되살릴 수 있음)
  const keptItems = new Set(idMap.values())
  const extraItems = curItems.filter((r) => !r.is_deleted && !keptItems.has(r.id)).map((r) => r.id)
  const extraQuotes = curQuotes.filter((r) => !r.is_deleted && !restoredQuoteIds.has(r.id) && keptItems.has(r.item_id)).map((r) => r.id)
  const trash = { is_deleted: true, deleted_at: ts, updated_at: ts }
  for (let i = 0; i < extraQuotes.length; i += 200) {
    check(await supabase.from('quotes').update(trash).eq('user_id', userId).in('id', extraQuotes.slice(i, i + 200)))
  }
  for (let i = 0; i < extraItems.length; i += 200) {
    const ids = extraItems.slice(i, i + 200)
    check(await supabase.from('items').update(trash).eq('user_id', userId).in('id', ids))
    check(await supabase.from('quotes').update(trash).eq('user_id', userId).in('item_id', ids).not('is_deleted', 'is', true))
  }
}

function readBackupFile(text: string): { items: Row[]; quotes: Row[] } {
  const parsed = JSON.parse(text) as { items?: unknown; quotes?: unknown }
  if (!Array.isArray(parsed?.items) || !Array.isArray(parsed?.quotes)) throw new Error('invalid-backup')
  const isRow = (v: unknown): v is Row => !!v && typeof v === 'object'
  return { items: parsed.items.filter(isRow), quotes: parsed.quotes.filter(isRow) }
}

// ── window.api 구현 ───────────────────────────────────────────────
export async function setupWebApi(): Promise<void> {
  const api = {
    items: {
      getAll: async () => {
        const userId = await currentUserId()
        if (!userId) {
          return anonLoad<Row[]>(ANON.items, [])
            .filter((i) => !i.is_deleted)
            .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
        }
        // 휴지통 항목은 빼고 (데스크톱 앱이 휴지통으로 옮긴 것도 클라우드엔 '삭제 표시'로 남아 있음)
        const rows: Row[] = []
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from('items')
            .select('*')
            .eq('user_id', userId)
            .not('is_deleted', 'is', true)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, from + PAGE - 1)
          if (error) throw error
          rows.push(...(data ?? []))
          if (!data || data.length < PAGE) return rows
        }
      },

      insert: async (data: Row) => {
        const userId = await currentUserId()
        const now = nowIso()
        if (!userId) {
          const items = anonLoad<Row[]>(ANON.items, [])
          const newItem: Row = { id: anonNextId(), ...itemFields(data), created_at: now, updated_at: now }
          items.unshift(newItem)
          anonSave(ANON.items, items)
          return newItem
        }
        // updated_at을 꼭 넣는다 — 데스크톱 앱은 이 시각 이후 바뀐 것만 받아 가므로 비어 있으면 영영 안 내려감
        const { data: row, error } = await supabase
          .from('items')
          .insert({ ...itemFields(data), user_id: userId, created_at: now, updated_at: now })
          .select()
          .single()
        if (error) throw error
        return row
      },

      update: async (id: number, data: Row) => {
        const userId = await currentUserId()
        const payload = { ...changedItemFields(data), updated_at: nowIso() }
        if (!userId) {
          const items = anonLoad<Row[]>(ANON.items, [])
          const idx = items.findIndex((i) => i.id === id)
          if (idx === -1) return
          items[idx] = { ...items[idx], ...payload }
          anonSave(ANON.items, items)
          return
        }
        const { error } = await supabase.from('items').update(payload).eq('id', id).eq('user_id', userId)
        if (error) throw error
      },

      // 휴지통으로 옮김 (15일 뒤 영구삭제). 함께 옮긴 명대사는 같은 삭제 시각을 받아 복원할 때 함께 되살아남.
      // 클라우드에 '삭제 표시'로 남기므로 데스크톱 앱도 동기화 때 휴지통으로 옮긴다.
      delete: async (id: number) => {
        const ts = nowIso()
        const userId = await currentUserId()
        if (!userId) {
          const items = anonLoad<Row[]>(ANON.items, []).map((i) =>
            i.id === id ? { ...i, is_deleted: true, deleted_at: ts, updated_at: ts } : i)
          anonSave(ANON.items, items)
          const quotes = anonLoad<Row[]>(ANON.quotes, []).map((q) =>
            q.item_id === id && !q.is_deleted ? { ...q, is_deleted: true, deleted_at: ts } : q)
          anonSave(ANON.quotes, quotes)
          return
        }
        const { error } = await supabase.from('items')
          .update({ is_deleted: true, deleted_at: ts, updated_at: ts }).eq('id', id).eq('user_id', userId)
        if (error) throw error
        await supabase.from('quotes')
          .update({ is_deleted: true, deleted_at: ts, updated_at: ts })
          .eq('item_id', id).eq('user_id', userId).not('is_deleted', 'is', true)
      },

      // 로그인했는데 이 브라우저에 로그인 없이 쓴 기록이 남아 있으면 그 개수 (계정으로 옮길 수 있게)
      scopeInfo: async () => {
        const loggedIn = await isAuthenticated()
        const anon = loggedIn ? anonLoad<Row[]>(ANON.items, []).filter((i) => !i.is_deleted).length : 0
        return { loggedIn, anon, otherAccount: 0 }
      },

      // 로그인 없이 쓴 기록을 지금 계정으로 옮김. 계정에 같은 작품(제목·종류, 둘 다 있으면 연도·번호까지)이 있으면
      // 새로 만들지 않고 그 작품에 합친다(감상·별점·명대사 보존). 옮기거나 합친 것만 이 브라우저에서 지우고,
      // 실패한 것은 남겨 다음에 다시. (예전엔 같은 제목이면 '건너뛰었다'면서 감상·명대사까지 지웠음)
      importOtherScope: async (source: 'anon' | 'otherAccount') => {
        const userId = await currentUserId()
        if (!userId || source !== 'anon') return { imported: 0, skipped: 0 }
        const localItems = anonLoad<Row[]>(ANON.items, []).filter((i) => !i.is_deleted)
        const localQuotes = anonLoad<Row[]>(ANON.quotes, []).filter((q) => !q.is_deleted)
        const cloudItems = (await fetchAllRows('items', userId)).filter((r) => !r.is_deleted)
        const done = new Set<unknown>()
        let imported = 0
        for (const it of localItems) {
          const now = nowIso()
          const quotesOf = (itemId: unknown) => localQuotes.filter((q) => q.item_id === it.id).map((q) => ({
            user_id: userId, item_id: itemId, text: String(q.text ?? ''),
            page_number: q.page_number ?? null, episode_number: q.episode_number ?? null, note: q.note ?? null,
            created_at: q.created_at ?? now, updated_at: now,
          }))
          const same = cloudItems.find((c) => isExactMatch(it, c))
          if (same) {
            const { error } = await supabase.from('items')
              .update({ ...mergeItemFields(it, same), updated_at: now }).eq('id', same.id).eq('user_id', userId)
            if (error) continue
            // 이미 계정에 있는 같은 문장은 빼고 넣음
            const { data: have, error: haveError } = await supabase.from('quotes').select('text')
              .eq('user_id', userId).eq('item_id', same.id).not('is_deleted', 'is', true)
            if (haveError) continue
            const known = new Set((have ?? []).map((q: Row) => String(q.text ?? '')))
            const add = quotesOf(same.id).filter((q) => !known.has(q.text))
            if (add.length > 0 && (await supabase.from('quotes').insert(add)).error) continue
          } else {
            const { data, error } = await supabase.from('items')
              .insert({ ...itemFields(it), user_id: userId, created_at: it.created_at ?? now, updated_at: now })
              .select('*').single()
            if (error || !data) continue
            const add = quotesOf((data as Row).id)
            if (add.length > 0 && (await supabase.from('quotes').insert(add)).error) {
              await supabase.from('items').delete().eq('id', (data as Row).id).eq('user_id', userId)
              continue
            }
            cloudItems.push(data as Row) // 같은 브라우저 기록 안의 중복도 하나로 합쳐지게
          }
          done.add(it.id)
          imported++
        }
        anonSave(ANON.items, anonLoad<Row[]>(ANON.items, []).filter((i) => !done.has(i.id)))
        anonSave(ANON.quotes, anonLoad<Row[]>(ANON.quotes, []).filter((q) => !done.has(q.item_id)))
        return { imported, skipped: 0 }
      },
    },

    trash: {
      getAll: async () => {
        try { await purgeExpiredTrash() } catch { /* 정리 실패는 목록 표시에 영향 없음 */ }
        const userId = await currentUserId()
        if (!userId) {
          return anonLoad<Row[]>(ANON.items, [])
            .filter((i) => i.is_deleted)
            .sort((a, b) => String(b.deleted_at ?? '').localeCompare(String(a.deleted_at ?? '')))
        }
        const { data, error } = await supabase
          .from('items').select('*')
          .eq('user_id', userId).eq('is_deleted', true)
          .order('deleted_at', { ascending: false })
        if (error) throw error
        return data ?? []
      },

      restore: async (id: number) => {
        const ts = nowIso()
        const userId = await currentUserId()
        if (!userId) {
          const items = anonLoad<Row[]>(ANON.items, [])
          const deletedAt = items.find((i) => i.id === id)?.deleted_at
          anonSave(ANON.items, items.map((i) =>
            i.id === id ? { ...i, is_deleted: false, deleted_at: null, updated_at: ts } : i))
          anonSave(ANON.quotes, anonLoad<Row[]>(ANON.quotes, []).map((q) =>
            q.item_id === id && q.is_deleted && q.deleted_at === deletedAt ? { ...q, is_deleted: false, deleted_at: null } : q))
          return
        }
        const { data: item } = await supabase.from('items').select('deleted_at').eq('id', id).eq('user_id', userId).maybeSingle()
        const deletedAt = (item?.deleted_at as string | null) ?? null
        // 항목과 함께 휴지통에 들어간 명대사만 되살림 (따로 지운 명대사는 그대로)
        let quotes = supabase.from('quotes')
          .update({ is_deleted: false, deleted_at: null, updated_at: ts })
          .eq('item_id', id).eq('user_id', userId).eq('is_deleted', true)
        quotes = deletedAt ? quotes.eq('deleted_at', deletedAt) : quotes.is('deleted_at', null)
        await quotes
        const { error } = await supabase.from('items')
          .update({ is_deleted: false, deleted_at: null, updated_at: ts }).eq('id', id).eq('user_id', userId)
        if (error) throw error
      },

      // 휴지통에 있는 것만 지우고, 지웠으면 true (열어 둔 목록이 오래돼 그사이 복원된 항목을 지우는 일 방지)
      purge: async (id: number): Promise<boolean> => {
        const userId = await currentUserId()
        if (!userId) {
          const items = anonLoad<Row[]>(ANON.items, [])
          if (!items.some((i) => i.id === id && i.is_deleted)) return false
          anonSave(ANON.items, items.filter((i) => i.id !== id))
          anonSave(ANON.quotes, anonLoad<Row[]>(ANON.quotes, []).filter((q) => q.item_id !== id))
          return true
        }
        const { data: trashed, error: findError } = await supabase.from('items').select('id')
          .eq('id', id).eq('user_id', userId).eq('is_deleted', true).maybeSingle()
        if (findError) throw findError
        if (!trashed) return false
        await supabase.from('quotes').delete().eq('item_id', id).eq('user_id', userId)
        const { error } = await supabase.from('items').delete().eq('id', id).eq('user_id', userId).eq('is_deleted', true)
        if (error) throw error
        return true
      },

      purgeExpired: async (days: number) => purgeExpiredTrash(days),
    },

    quotes: {
      getByItemId: async (itemId: number) => {
        const userId = await currentUserId()
        if (!userId) {
          return sortQuotes(anonLoad<Row[]>(ANON.quotes, []).filter((q) => q.item_id === itemId && !q.is_deleted))
        }
        const { data, error } = await supabase
          .from('quotes')
          .select('*')
          .eq('item_id', itemId)
          .eq('user_id', userId)
          .not('is_deleted', 'is', true)
        if (error) throw error
        return sortQuotes(data ?? [])
      },

      search: async (query: string) => {
        const q = query.trim()
        if (!q) return []
        const userId = await currentUserId()
        if (!userId) {
          const items = anonLoad<Row[]>(ANON.items, [])
          const quotes = anonLoad<Row[]>(ANON.quotes, [])
          const itemMap = new Map(items.map((i) => [i.id, i]))
          const lower = q.toLowerCase()
          return quotes
            .filter((qt) => !qt.is_deleted && itemMap.has(qt.item_id) && !itemMap.get(qt.item_id)?.is_deleted)
            .filter((qt) => String(qt.text ?? '').toLowerCase().includes(lower) || String(qt.note ?? '').toLowerCase().includes(lower))
            .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
            .map((qt) => {
              const item = itemMap.get(qt.item_id)
              return { ...qt, item_title: item?.title ?? '', item_type: item?.item_type ?? '', cover_path: item?.cover_path ?? null }
            })
        }
        // 검색어의 %·_는 글자 그대로 찾게 이스케이프. 문장·메모를 따로 찾아 합침
        // (예전엔 검색어를 필터 문법에 그대로 끼워 넣어 쉼표·괄호가 든 검색어에서 오류가 났음)
        const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`
        const find = (col: 'text' | 'note') => supabase.from('quotes').select('*')
          .eq('user_id', userId).not('is_deleted', 'is', true).ilike(col, pattern)
          .order('created_at', { ascending: false }).limit(200)
        const [byText, byNote] = await Promise.all([find('text'), find('note')])
        if (byText.error) throw byText.error
        if (byNote.error) throw byNote.error
        const found = new Map<unknown, Row>()
        for (const r of [...(byText.data ?? []), ...(byNote.data ?? [])]) found.set(r.id, r)
        const itemIds = [...new Set([...found.values()].map((r) => r.item_id))]
        if (itemIds.length === 0) return []
        const { data: items, error } = await supabase.from('items').select('id, title, item_type, cover_path')
          .eq('user_id', userId).in('id', itemIds).not('is_deleted', 'is', true)
        if (error) throw error
        const itemMap = new Map((items ?? []).map((i: Row) => [i.id, i]))
        return [...found.values()]
          .filter((r) => itemMap.has(r.item_id)) // 휴지통에 있는 작품의 명대사는 빼고
          .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
          .map((r) => {
            const item = itemMap.get(r.item_id)
            return { ...r, item_title: item?.title ?? '', item_type: item?.item_type ?? '', cover_path: item?.cover_path ?? null }
          })
      },

      insert: async (data: Row) => {
        const now = nowIso()
        const quote = {
          item_id: data.item_id,
          text: data.text,
          page_number: data.page_number ?? null,
          episode_number: data.episode_number ?? null, // 드라마·다큐 회차
          note: data.note ?? null,
          created_at: now,
          updated_at: now, // 비어 있으면 데스크톱 앱이 이 명대사를 받아 가지 못함
        }
        const userId = await currentUserId()
        if (!userId) {
          const quotes = anonLoad<Row[]>(ANON.quotes, [])
          const newQuote: Row = { id: anonNextId(), ...quote }
          quotes.push(newQuote)
          anonSave(ANON.quotes, quotes)
          return newQuote
        }
        const { data: row, error } = await supabase
          .from('quotes')
          .insert({ ...quote, user_id: userId })
          .select()
          .single()
        if (error) throw error
        return row
      },

      update: async (id: number, data: Row) => {
        const payload: Row = {}
        for (const k of ['text', 'page_number', 'episode_number', 'note']) {
          if (data[k] !== undefined) payload[k] = data[k] ?? null
        }
        if (Object.keys(payload).length === 0) return
        payload.updated_at = nowIso() // 데스크톱 앱이 바뀐 걸 알아채게
        const userId = await currentUserId()
        if (!userId) {
          const quotes = anonLoad<Row[]>(ANON.quotes, [])
          const idx = quotes.findIndex((q) => q.id === id)
          if (idx === -1) return
          quotes[idx] = { ...quotes[idx], ...payload }
          anonSave(ANON.quotes, quotes)
          return
        }
        const { error } = await supabase.from('quotes').update(payload).eq('id', id).eq('user_id', userId)
        if (error) throw error
      },

      delete: async (id: number) => {
        const userId = await currentUserId()
        if (!userId) {
          anonSave(ANON.quotes, anonLoad<Row[]>(ANON.quotes, []).filter((q) => q.id !== id))
          return
        }
        // 지우지 않고 '삭제 표시' — 그래야 데스크톱 앱도 동기화 때 지운 걸 알 수 있음 (15일 뒤 정리)
        const ts = nowIso()
        const { error } = await supabase.from('quotes')
          .update({ is_deleted: true, deleted_at: ts, updated_at: ts }).eq('id', id).eq('user_id', userId)
        if (error) throw error
      }
    },

    books: {
      search: async (query: string) => searchViaServer('books', query)
    },

    tmdb: {
      search: async (query: string) => searchViaServer('tmdb', query)
    },

    image: {
      pick: pickImage,
    },

    db: {
      backup: async () => {
        await downloadBackup(await currentUserId())
        return { success: true }
      },

      restore: async (): Promise<{ success: boolean; error?: string }> => {
        const file = await pickFile('.json,application/json')
        if (!file) return { success: false, error: 'read-source' } // 취소
        let backup: { items: Row[]; quotes: Row[] }
        try { backup = readBackupFile(await file.text()) } catch { return { success: false, error: 'invalid-db' } }
        const userId = await currentUserId()
        // 되돌리기 전에 지금 기록을 파일로 내려받아 둠 — 잘못 고른 파일로 되돌려도 이 파일로 다시 돌아올 수 있게
        try { await downloadBackup(userId, '되돌리기-전-백업') } catch { return { success: false, error: 'snapshot-failed' } }
        try {
          if (!userId) {
            anonSave(ANON.items, backup.items)
            anonSave(ANON.quotes, backup.quotes)
            const maxId = Math.max(0, ...[...backup.items, ...backup.quotes].map((r) => Number(r.id) || 0))
            if (maxId > anonLoad<number>(ANON.nextId, 0)) anonSave(ANON.nextId, maxId) // 새 기록 id가 겹치지 않게
          } else {
            await restoreCloudFromBackup(userId, backup.items, backup.quotes)
          }
          return { success: true }
        } catch (err) {
          console.error('복원 실패:', err)
          return { success: false, error: 'swap-failed' }
        }
      }
    }
  }

  ;(window as unknown as Record<string, unknown>).api = api
}
