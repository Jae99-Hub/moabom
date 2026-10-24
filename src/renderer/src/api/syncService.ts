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
    cover_path: pickCover(cloud.cover_path, local.cover_path),
    backdrop_path: cloud.backdrop_path ?? local.backdrop_path,
  }
}

/** 표지: 어느 기기에서나 보이는 것(URL·이미지 데이터)을 우선. 다른 PC의 파일 경로는 여기서 안 보임 */
function pickCover(cloud: unknown, local: unknown): unknown {
  const portable = (v: unknown) => typeof v === 'string' && /^(https?:|data:)/.test(v)
  if (portable(cloud)) return cloud
  if (portable(local)) return local
  return cloud ?? local
}

// 합치기 결과는 항상 '살아 있는' 항목 — 휴지통 상태의 클라우드 행과 합쳐져 새 항목이 휴지통으로 가는 일 방지
const ALIVE = { is_deleted: false, deleted_at: null }

async function autoMergeExact(local: CloudRow, cloud: CloudRow, userId: string): Promise<boolean> {
  const merged = mergeItemFields(local, cloud)
  // updated_at 갱신 → 다음 pull에서 합쳐진 결과가 이 기기에도 반영됨
  const { error } = await supabase
    .from('items')
    .update({ ...merged, ...ALIVE, updated_at: new Date().toISOString() })
    .eq('id', cloud.id)
    .eq('user_id', userId)
  if (error) return false // 실패 시 dirty 유지 → 다음 동기화에서 재시도
  await window.api.sync.markItemSynced(local.id as number, cloud.id as number, local.updated_at as string)
  return true
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
    // push 시각으로 기록 → 오프라인 편집이 늦게 올라와도 다른 기기의 증분 pull에 잡힘
    updated_at: new Date().toISOString(),
    is_deleted: !!item.is_deleted,
    deleted_at: item.deleted_at ?? null,
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
    const seen = item.updated_at as string // 올리는 사이 또 고쳐졌는지 확인용
    if (item.is_deleted) {
      // 휴지통(소프트 삭제): 클라우드에 tombstone(is_deleted=true)으로 반영 → 다른 기기도 휴지통으로 이동.
      // 15일 후 purgeExpiredTrash가 클라우드/로컬에서 영구삭제.
      if (item.server_id) {
        const { data, error } = await supabase
          .from('items')
          .update(buildItemPayload(item, userId))
          .eq('id', item.server_id)
          .eq('user_id', userId)
          .select('id')
        if (!error) {
          if (data && data.length > 0) await window.api.sync.markItemSynced(item.id as number, item.server_id as number, seen)
          else await window.api.sync.clearItemDirty(item.id as number, seen) // 클라우드에선 이미 영구삭제됨
        }
      } else {
        // 클라우드에 올린 적 없는 항목 → 로컬 휴지통에만 보관, dirty 해제
        await window.api.sync.clearItemDirty(item.id as number, seen)
      }
      continue
    }

    if (item.server_id) {
      // 기존 서버 항목 업데이트 → 중복 검사 불필요
      const { data, error } = await supabase
        .from('items')
        .update(buildItemPayload(item, userId))
        .eq('id', item.server_id)
        .eq('user_id', userId)
        .select('id')
      if (error) continue // 다음 동기화에서 재시도
      if (data && data.length > 0) {
        await window.api.sync.markItemSynced(item.id as number, item.server_id as number, seen)
        continue
      }
      // 클라우드에 이 항목이 없음(다른 기기에서 휴지통 15일 경과로 영구삭제 등).
      // 예전엔 0행 수정을 성공으로 보고 넘어가 영영 업로드되지 않았음 → 아래에서 새 항목으로 다시 올린다.
    }

    // ── 새 항목: 클라우드에서 중복 검사 ──────────────────────────────
    const escapedTitle = normalizeTitle(item.title).replace(/[%_]/g, '\\$&')
    const { data: candidates } = await supabase
      .from('items')
      .select('*')
      .eq('user_id', userId)
      .ilike('title', escapedTitle)
      .not('is_deleted', 'is', true) // 휴지통의 클라우드 행과 합치지 않음 (합치면 새 항목이 휴지통으로 감)

    let handled = false

    if (candidates && candidates.length > 0) {
      // 1) 완전히 같은 항목 → 자동 합치기
      for (const cloud of candidates) {
        if (isExactMatch(item, cloud)) {
          if (await autoMergeExact(item, cloud, userId)) autoMerged++
          handled = true // 실패해도 새로 삽입하지 않음(중복 방지) — 다음 동기화에서 재시도
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
        await window.api.sync.markItemSynced(item.id as number, (data as { id: number }).id, seen)
      }
    }
  }

  return { autoMerged, conflicts }
}

// ── 푸시: 표지만 올릴 항목 (예전 파일 표지를 DB 안으로 옮긴 동기화 항목) ──
// 표지 칸만 바꿔 올려 다른 필드(다른 기기의 최신 수정)는 건드리지 않는다.
async function pushCoverOnly(userId: string): Promise<void> {
  const rows = await window.api.sync.getCoverPushItems()
  for (const r of rows) {
    const { error } = await supabase
      .from('items')
      .update({ cover_path: r.cover_path, updated_at: new Date().toISOString() })
      .eq('id', r.server_id)
      .eq('user_id', userId)
    if (!error) await window.api.sync.markCoverPushed(r.id) // 클라우드에 행이 없어도(0행) 올릴 곳이 없으니 해제
  }
}

// ── 푸시: 로컬 dirty 명문장 → Supabase ──────────────────────────────
async function pushDirtyQuotes(userId: string): Promise<void> {
  const dirtyQuotes = await window.api.sync.getDirtyQuotes()

  for (const quote of dirtyQuotes) {
    const seen = quote.updated_at as string
    if (quote.is_deleted) {
      // 휴지통(tombstone)으로 반영 — 15일 후 purgeExpiredTrash가 영구삭제
      if (quote.server_id) {
        const { data, error } = await supabase
          .from('quotes')
          .update({ is_deleted: true, deleted_at: quote.deleted_at ?? null, updated_at: new Date().toISOString() })
          .eq('id', quote.server_id)
          .eq('user_id', userId)
          .select('id')
        if (!error) {
          if (data && data.length > 0) await window.api.sync.markQuoteSynced(quote.id as number, quote.server_id as number, seen)
          else await window.api.sync.clearQuoteDirty(quote.id as number, seen) // 클라우드에선 이미 영구삭제됨
        }
      } else {
        await window.api.sync.clearQuoteDirty(quote.id as number, seen)
      }
      continue
    }

    const itemServerId = quote.item_server_id as number | null
    // 부모가 아직 안 올라갔거나(충돌 대기·실패 포함) 그사이 또 고쳐졌으면 다음 동기화에서 — 옛 부모 id로 올리지 않게
    if (!itemServerId || Number(quote.item_is_dirty) === 1) continue

    const payload = {
      user_id: userId,
      item_id: itemServerId,
      text: quote.text,
      page_number: quote.page_number ?? null,
      episode_number: quote.episode_number ?? null,
      note: quote.note ?? null,
      created_at: quote.created_at,
      updated_at: new Date().toISOString(), // push 시각 기준 (증분 pull 누락 방지)
      is_deleted: false,
      deleted_at: null,
    }

    if (quote.server_id) {
      const { data, error } = await supabase
        .from('quotes')
        .update(payload)
        .eq('id', quote.server_id)
        .eq('user_id', userId)
        .select('id')
      if (error) continue
      if (data && data.length > 0) {
        await window.api.sync.markQuoteSynced(quote.id as number, quote.server_id as number, seen)
        continue
      }
      // 클라우드에서 사라진 명대사 → 아래에서 새로 올린다
    }

    // 완전히 같은 명문장이 이미 있으면 자동 연결 (같은 문장이 여러 개여도 첫 번째에 연결)
    const { data: existing } = await supabase
      .from('quotes')
      .select('id')
      .eq('user_id', userId)
      .eq('item_id', itemServerId)
      .eq('text', String(quote.text))
      .not('is_deleted', 'is', true) // 휴지통의 명대사에 연결하면 다른 기기에 안 보임
      .limit(1)

    if (existing && existing.length > 0) {
      await window.api.sync.markQuoteSynced(quote.id as number, (existing[0] as { id: number }).id, seen)
    } else {
      const { data, error } = await supabase
        .from('quotes')
        .insert(payload)
        .select('id')
        .single()
      if (!error && data) {
        await window.api.sync.markQuoteSynced(quote.id as number, (data as { id: number }).id, seen)
      }
    }
  }
}

// ── 풀: Supabase → 로컬 ───────────────────────────────────────────────
const PAGE_SIZE = 1000 // Supabase(PostgREST)가 한 번에 돌려주는 최대 행 수
const APPLY_CHUNK = 200 // 로컬 반영은 이만큼씩 묶어서 (한 번에 너무 오래 메인 프로세스를 붙잡지 않게)

/** since 이후 바뀐 행을 끝까지 받는다. 한 번에 받으면 1,000행을 넘는 부분이 잘려서 영영 안 내려왔음. */
async function fetchChangedRows(table: 'items' | 'quotes', userId: string, since: string): Promise<CloudRow[]> {
  const rows: CloudRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select('*').eq('user_id', userId)
    if (since) query = query.gt('updated_at', since)
    const { data, error } = await query.order('id', { ascending: true }).range(from, from + PAGE_SIZE - 1)
    // 일부만 받은 채 기준 시각이 넘어가면 나머지를 놓치므로 이번 동기화를 실패로 처리 (다음에 다시 받음)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

async function applyInChunks(rows: CloudRow[], apply: (chunk: CloudRow[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < rows.length; i += APPLY_CHUNK) await apply(rows.slice(i, i + APPLY_CHUNK))
}

async function pullCloudItems(userId: string, since: string): Promise<void> {
  const rows = await fetchChangedRows('items', userId, since)
  await applyInChunks(
    rows.map((item) => ({ ...item, year: item.year != null ? Number(item.year) : null })),
    (chunk) => window.api.sync.upsertItemsFromCloud(chunk)
  )
}

async function pullCloudQuotes(userId: string, since: string): Promise<void> {
  const rows = await fetchChangedRows('quotes', userId, since)
  await applyInChunks(rows, (chunk) => window.api.sync.upsertQuotesFromCloud(chunk))
}

// ── 휴지통 만료 정리 (15일 경과분 영구삭제) ──────────────────────────
const TRASH_RETENTION_DAYS = 15
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000 // 동기화마다 하지 않고 6시간에 한 번
let lastPurgeAt = 0

async function purgeExpiredTrash(userId: string): Promise<void> {
  if (Date.now() - lastPurgeAt < PURGE_INTERVAL_MS) return
  lastPurgeAt = Date.now()
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  // 클라우드: 만료된 휴지통 영구삭제 (명문장 먼저 → 아이템)
  await supabase.from('quotes').delete().eq('user_id', userId).eq('is_deleted', true).lt('deleted_at', cutoff)
  await supabase.from('items').delete().eq('user_id', userId).eq('is_deleted', true).lt('deleted_at', cutoff)
  // 로컬: 만료된 휴지통 영구삭제
  await window.api.trash.purgeExpired(TRASH_RETENTION_DAYS)
}

// ── 메인 동기화 함수 ─────────────────────────────────────────────────
// 겹친 동기화는 이중 삽입을 만들므로 한 번에 하나만 돈다.
// 도는 중에 또 요청이 오면 끝난 뒤 한 번 더 돈다 → 그 사이 바뀐 내용이 다음 수정 때까지 미뤄지지 않음.
let inFlight: Promise<SyncResult> | null = null
let rerunRequested = false

export function runSync(onStatus?: (status: SyncStatus) => void): Promise<SyncResult> {
  if (inFlight) {
    rerunRequested = true
    return inFlight
  }
  inFlight = (async () => {
    const conflicts = new Map<number, SyncConflict>() // 재실행에서 같은 충돌이 또 나와도 한 번만
    let autoMerged = 0
    try {
      do {
        rerunRequested = false
        const r = await syncOnce(onStatus)
        autoMerged += r.autoMerged
        for (const c of r.conflicts) conflicts.set(c.localId, c)
      } while (rerunRequested)
      return { autoMerged, conflicts: [...conflicts.values()] }
    } finally {
      inFlight = null
      rerunRequested = false
    }
  })()
  return inFlight
}

/** 동기화 도중 계정이 바뀌었으면(로그아웃 후 다른 계정 로그인) 중단 — 다른 계정 데이터·기준 시각과 섞이지 않게 */
async function assertSameUser(userId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user.id !== userId) throw new Error('account-changed')
}

async function syncOnce(onStatus?: (status: SyncStatus) => void): Promise<SyncResult> {
  if (!isSupabaseConfigured || !supabase) return { autoMerged: 0, conflicts: [] }
  if (!window.api?.sync) return { autoMerged: 0, conflicts: [] }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { autoMerged: 0, conflicts: [] }

  // 다음 증분 pull 기준 시각 = 이번 동기화 '시작' 시점 − 여유 5분.
  // (끝난 시각을 쓰면 동기화 도중 다른 기기가 올린 변경을 영영 놓치고, 기기 간 시계 오차도 흡수)
  const nextSyncCursor = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  onStatus?.('syncing')
  try {
    const { autoMerged, conflicts } = await pushDirtyItems(user.id)
    await pushCoverOnly(user.id)
    await assertSameUser(user.id)
    await pushDirtyQuotes(user.id)
    await assertSameUser(user.id)
    const since = await window.api.sync.getLastSyncAt(user.id)
    await pullCloudItems(user.id, since)
    await pullCloudQuotes(user.id, since)
    await purgeExpiredTrash(user.id)
    await assertSameUser(user.id)
    await window.api.sync.setLastSyncAt(nextSyncCursor, user.id)
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
  // 실패는 던져서 화면이 '정리하지 못했어요'를 띄우게 (조용히 성공한 척하면 목록에서만 사라짐)
  if (!user) throw new Error('not-signed-in')

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
      if (error) throw error
      await window.api.sync.markItemSynced(localId, cloudId)
      break
    }
    case 'merge': {
      // 두 항목의 좋은 필드만 합치기
      const merged = mergeItemFields(local, cloud)
      const { error } = await supabase
        .from('items')
        .update({ ...merged, ...ALIVE, updated_at: new Date().toISOString() }) // 다음 pull에서 이 기기에도 반영
        .eq('id', cloudId)
        .eq('user_id', user.id)
      if (error) throw error
      await window.api.sync.markItemSynced(localId, cloudId)
      break
    }
    case 'keep-both': {
      // 로컬을 별도의 새 클라우드 항목으로 삽입
      const { data, error } = await supabase
        .from('items')
        .insert(buildItemPayload(local, user.id))
        .select('id')
        .single()
      if (error || !data) throw error ?? new Error('insert-failed')
      await window.api.sync.markItemSynced(localId, (data as { id: number }).id)
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
