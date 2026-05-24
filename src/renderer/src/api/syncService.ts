import { supabase, isSupabaseConfigured } from './supabaseClient'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

type CloudRow = Record<string, unknown>

// ── 타입 정의 ────────────────────────────────────────────────────────
export interface SyncConflict {
  localId: number   // 로컬 SQLite id
  cloudId: number   // Supabase id
  local: CloudRow
  cloud: CloudRow
  reason: string    // "같은 제목, 다른 연도" 등
}

export interface SyncResult {
  autoMerged: number
  conflicts: SyncConflict[]
}

// ── 유사도 판별 ───────────────────────────────────────────────────────
function normalizeTitle(t: unknown): string {
  return String(t ?? '').toLowerCase().trim()
}

/** 완전히 같은 항목 판별 (자동 합치기 대상) */
function isExactMatch(local: CloudRow, cloud: CloudRow): boolean {
  if (normalizeTitle(local.title) !== normalizeTitle(cloud.title)) return false
  if (local.item_type !== cloud.item_type) return false
  // 둘 다 연도 있으면 같아야 함
  if (local.year != null && cloud.year != null) {
    if (String(local.year) !== String(cloud.year)) return false
  }
  // 고유 ID 둘 다 있으면 같아야 함
  if (local.tmdb_id && cloud.tmdb_id && local.tmdb_id !== cloud.tmdb_id) return false
  if (local.isbn && cloud.isbn && local.isbn !== cloud.isbn) return false
  if (local.google_books_id && cloud.google_books_id && local.google_books_id !== cloud.google_books_id) return false
  return true
}

/** 비슷한 항목 판별 (사용자 판단 필요) */
function isSimilarMatch(local: CloudRow, cloud: CloudRow): boolean {
  const titleMatch = normalizeTitle(local.title) === normalizeTitle(cloud.title)
  if (titleMatch) return true  // 제목 같음 (연도/타입 달라도)
  // 고유 ID 일치
  if (local.tmdb_id && local.tmdb_id === cloud.tmdb_id) return true
  if (local.isbn && local.isbn === cloud.isbn) return true
  if (local.google_books_id && local.google_books_id === cloud.google_books_id) return true
  return false
}

function conflictReason(local: CloudRow, cloud: CloudRow): string {
  const titleMatch = normalizeTitle(local.title) === normalizeTitle(cloud.title)
  if (titleMatch && local.item_type !== cloud.item_type) return '같은 제목이지만 유형이 달라요'
  if (titleMatch && local.year != null && cloud.year != null && String(local.year) !== String(cloud.year)) {
    return `같은 제목, 연도 다름 (로컬 ${local.year} / 클라우드 ${cloud.year})`
  }
  if (titleMatch) return '같은 제목의 항목이 이미 있어요'
  if (local.tmdb_id && local.tmdb_id === cloud.tmdb_id) return '같은 TMDB ID의 항목이 있어요'
  if (local.isbn && local.isbn === cloud.isbn) return '같은 ISBN의 책이 있어요'
  return '비슷한 항목이 발견됐어요'
}

// ── 스마트 합치기 ─────────────────────────────────────────────────────
function mergeStatus(a: string, b: string): string {
  const priority: Record<string, number> = { done: 4, reading: 3, want: 2, dropped: 1 }
  return (priority[a] ?? 0) >= (priority[b] ?? 0) ? a : b
}

export function mergeItemFields(local: CloudRow, cloud: CloudRow): Partial<CloudRow> {
  return {
    // 더 긴 리뷰 우선
    review: ((local.review as string) || '').length >= ((cloud.review as string) || '').length
      ? (local.review ?? cloud.review)
      : (cloud.review ?? local.review),
    // 더 많이 읽은 페이지
    current_page: Math.max(Number(local.current_page ?? 0), Number(cloud.current_page ?? 0)),
    // 평점: 로컬 우선 (최근 변경)
    rating: local.rating ?? cloud.rating,
    // 완료일: 있는 것 우선
    read_date: local.read_date ?? cloud.read_date,
    // 상태: 더 진행된 것
    status: mergeStatus(String(local.status ?? 'want'), String(cloud.status ?? 'want')),
    // 메타데이터: 클라우드 우선 (API 검색으로 가져온 정확한 정보)
    overview: cloud.overview ?? local.overview,
    genre: cloud.genre ?? local.genre,
    cover_path: cloud.cover_path ?? local.cover_path,
    backdrop_path: cloud.backdrop_path ?? local.backdrop_path,
  }
}

async function autoMergeExact(local: CloudRow, cloud: CloudRow, userId: string): Promise<void> {
  const merged = mergeItemFields(local, cloud)
  await supabase.from('items').update(merged).eq('id', cloud.id).eq('user_id', userId)
  await window.api.sync.markItemSynced(local.id as number, cloud.id as number)
}

// ── 페이로드 빌더 ────────────────────────────────────────────────────
function buildItemPayload(item: CloudRow, userId: string): CloudRow {
  return {
    user_id: userId,
    title: item.title,
    original_title: item.original_title ?? null,
    item_type: item.item_type,
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
    year: item.year != null ? String(item.year) : null, // Supabase → TEXT
    overview: item.overview ?? null,
    rating: item.rating ?? null,
    status: item.status,
    review: item.review ?? null,
    read_date: item.read_date ?? null,
    created_at: item.created_at,
    updated_at: item.updated_at,
  }
}

// ── 푸시: 로컬 dirty 아이템 → Supabase ──────────────────────────────
async function pushDirtyItems(
  userId: string
): Promise<{ autoMerged: number; conflicts: SyncConflict[] }> {
  const dirtyItems = await window.api.sync.getDirtyItems()
  let autoMerged = 0
  const conflicts: SyncConflict[] = []

  for (const item of dirtyItems) {
    if (item.is_deleted) {
      if (item.server_id) {
        await supabase.from('items').delete().eq('id', item.server_id).eq('user_id', userId)
      }
      await window.api.sync.hardDeleteItem(item.id as number)
      continue
    }

    if (item.server_id) {
      // 기존 서버 항목 업데이트 → 중복 검사 불필요
      const { error } = await supabase
        .from('items')
        .update(buildItemPayload(item, userId))
        .eq('id', item.server_id)
        .eq('user_id', userId)
      if (!error) await window.api.sync.markItemSynced(item.id as number, item.server_id as number)
      continue
    }

    // ── 새 항목: 클라우드에서 중복 검사 ──────────────────────────────
    const escapedTitle = normalizeTitle(item.title).replace(/[%_]/g, '\\$&')
    const { data: candidates } = await supabase
      .from('items')
      .select('*')
      .eq('user_id', userId)
      .ilike('title', escapedTitle)

    let handled = false

    if (candidates && candidates.length > 0) {
      // 1) 완전히 같은 항목 → 자동 합치기
      for (const cloud of candidates) {
        if (isExactMatch(item, cloud)) {
          await autoMergeExact(item, cloud, userId)
          autoMerged++
          handled = true
          break
        }
      }
      // 2) 비슷한 항목 → 사용자 판단 큐에 추가
      if (!handled) {
        for (const cloud of candidates) {
          if (isSimilarMatch(item, cloud)) {
            conflicts.push({
              localId: item.id as number,
              cloudId: cloud.id as number,
              local: item,
              cloud,
              reason: conflictReason(item, cloud),
            })
            handled = true
            break
          }
        }
      }
    }

    if (!handled) {
      // 중복 없음 → 정상 삽입
      const { data, error } = await supabase
        .from('items')
        .insert(buildItemPayload(item, userId))
        .select('id')
        .single()
      if (!error && data) {
        await window.api.sync.markItemSynced(item.id as number, (data as { id: number }).id)
      }
    }
  }

  return { autoMerged, conflicts }
}

// ── 푸시: 로컬 dirty 명문장 → Supabase ──────────────────────────────
async function pushDirtyQuotes(userId: string): Promise<void> {
  const dirtyQuotes = await window.api.sync.getDirtyQuotes()

  for (const quote of dirtyQuotes) {
    if (quote.is_deleted) {
      if (quote.server_id) {
        await supabase.from('quotes').delete().eq('id', quote.server_id).eq('user_id', userId)
      }
      await window.api.sync.hardDeleteQuote(quote.id as number)
      continue
    }

    const parentItem = (await window.api.sync.getItemById(quote.item_id as number)) as
      | (Record<string, unknown> & { server_id?: number | null })
      | undefined
    if (!parentItem?.server_id) continue // 부모 미동기화 → 다음 동기화

    const payload = {
      user_id: userId,
      item_id: parentItem.server_id as number,
      text: quote.text,
      page_number: quote.page_number ?? null,
      note: quote.note ?? null,
      created_at: quote.created_at,
      updated_at: quote.updated_at,
    }

    if (quote.server_id) {
      const { error } = await supabase
        .from('quotes')
        .update(payload)
        .eq('id', quote.server_id)
        .eq('user_id', userId)
      if (!error) await window.api.sync.markQuoteSynced(quote.id as number, quote.server_id as number)
    } else {
      // 완전히 같은 명문장이 이미 있으면 자동 연결
      const { data: existing } = await supabase
        .from('quotes')
        .select('id')
        .eq('user_id', userId)
        .eq('item_id', parentItem.server_id)
        .eq('text', String(quote.text))
        .maybeSingle()

      if (existing) {
        await window.api.sync.markQuoteSynced(quote.id as number, (existing as { id: number }).id)
      } else {
        const { data, error } = await supabase
          .from('quotes')
          .insert(payload)
          .select('id')
          .single()
        if (!error && data) {
          await window.api.sync.markQuoteSynced(quote.id as number, (data as { id: number }).id)
        }
      }
    }
  }
}

// ── 풀: Supabase → 로컬 ───────────────────────────────────────────────
async function pullCloudItems(userId: string): Promise<void> {
  const lastSyncAt = await window.api.sync.getLastSyncAt()
  let query = supabase.from('items').select('*').eq('user_id', userId)
  if (lastSyncAt) query = query.gt('updated_at', lastSyncAt)
  const { data, error } = await query
  if (error || !data) return
  for (const item of data) {
    await window.api.sync.upsertItemFromCloud({
      ...item,
      year: item.year != null ? Number(item.year) : null,
    })
  }
}

async function pullCloudQuotes(userId: string): Promise<void> {
  const lastSyncAt = await window.api.sync.getLastSyncAt()
  let query = supabase.from('quotes').select('*').eq('user_id', userId)
  if (lastSyncAt) query = query.gt('updated_at', lastSyncAt)
  const { data, error } = await query
  if (error || !data) return
  for (const quote of data) {
    await window.api.sync.upsertQuoteFromCloud(quote)
  }
}

// ── 메인 동기화 함수 ─────────────────────────────────────────────────
export async function runSync(onStatus?: (status: SyncStatus) => void): Promise<SyncResult> {
  if (!isSupabaseConfigured || !supabase) return { autoMerged: 0, conflicts: [] }
  if (!window.api?.sync) return { autoMerged: 0, conflicts: [] }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { autoMerged: 0, conflicts: [] }

  onStatus?.('syncing')
  try {
    const { autoMerged, conflicts } = await pushDirtyItems(user.id)
    await pushDirtyQuotes(user.id)
    await pullCloudItems(user.id)
    await pullCloudQuotes(user.id)
    await window.api.sync.setLastSyncAt(new Date().toISOString())
    onStatus?.('success')
    return { autoMerged, conflicts }
  } catch (err) {
    console.error('[Sync] 오류:', err)
    onStatus?.('error')
    throw err
  }
}

// ── 충돌 해결 ─────────────────────────────────────────────────────────
export async function resolveConflict(
  conflict: SyncConflict,
  resolution: 'keep-cloud' | 'keep-local' | 'merge' | 'keep-both'
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { localId, cloudId, local, cloud } = conflict

  switch (resolution) {
    case 'keep-cloud': {
      // 로컬 삭제 → 클라우드 항목을 로컬로 가져오기
      await window.api.items.delete(localId)
      await window.api.sync.upsertItemFromCloud({
        ...cloud,
        year: cloud.year != null ? Number(cloud.year) : null,
      })
      break
    }
    case 'keep-local': {
      // 로컬 데이터로 클라우드 덮어쓰기 → 연결
      const { error } = await supabase
        .from('items')
        .update(buildItemPayload(local, user.id))
        .eq('id', cloudId)
        .eq('user_id', user.id)
      if (!error) await window.api.sync.markItemSynced(localId, cloudId)
      break
    }
    case 'merge': {
      // 두 항목의 좋은 필드만 합치기
      const merged = mergeItemFields(local, cloud)
      const { error } = await supabase
        .from('items')
        .update(merged)
        .eq('id', cloudId)
        .eq('user_id', user.id)
      if (!error) await window.api.sync.markItemSynced(localId, cloudId)
      break
    }
    case 'keep-both': {
      // 로컬을 별도의 새 클라우드 항목으로 삽입
      const { data, error } = await supabase
        .from('items')
        .insert(buildItemPayload(local, user.id))
        .select('id')
        .single()
      if (!error && data) {
        await window.api.sync.markItemSynced(localId, (data as { id: number }).id)
      }
      break
    }
  }
}

// ── Electron 로그인 / 로그아웃 ───────────────────────────────────────
export async function getElectronUser(): Promise<{ email: string; name: string } | null> {
  if (!isSupabaseConfigured || !supabase) return null
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null
    return {
      email: user.email ?? '',
      name: (user.user_metadata as Record<string, string>)?.full_name ?? '',
    }
  } catch {
    return null
  }
}

export async function electronSignOut(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  await supabase.auth.signOut()
}
