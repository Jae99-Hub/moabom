import { supabase, isSupabaseConfigured } from './supabaseClient'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

// ── 푸시: 로컬 dirty 아이템 → Supabase ──────────────────────────────
async function pushDirtyItems(userId: string): Promise<void> {
  const dirtyItems = await window.api.sync.getDirtyItems()

  for (const item of dirtyItems) {
    if (item.is_deleted) {
      // 소프트 삭제 → 클라우드에서 삭제 후 로컬 하드 삭제
      if (item.server_id) {
        await supabase.from('items').delete().eq('id', item.server_id).eq('user_id', userId)
      }
      await window.api.sync.hardDeleteItem(item.id)
    } else {
      const payload = {
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
        year: item.year != null ? String(item.year) : null, // Supabase stores year as TEXT
        overview: item.overview ?? null,
        rating: item.rating ?? null,
        status: item.status,
        review: item.review ?? null,
        read_date: item.read_date ?? null,
        created_at: item.created_at,
        updated_at: item.updated_at,
      }

      if (item.server_id) {
        // 기존 항목 업데이트
        const { error } = await supabase
          .from('items')
          .update(payload)
          .eq('id', item.server_id)
          .eq('user_id', userId)
        if (!error) {
          await window.api.sync.markItemSynced(item.id, item.server_id)
        }
      } else {
        // 새 항목 삽입
        const { data, error } = await supabase
          .from('items')
          .insert(payload)
          .select('id')
          .single()
        if (!error && data) {
          await window.api.sync.markItemSynced(item.id, (data as { id: number }).id)
        }
      }
    }
  }
}

// ── 푸시: 로컬 dirty 명문장 → Supabase ──────────────────────────────
async function pushDirtyQuotes(userId: string): Promise<void> {
  const dirtyQuotes = await window.api.sync.getDirtyQuotes()

  for (const quote of dirtyQuotes) {
    if (quote.is_deleted) {
      if (quote.server_id) {
        await supabase.from('quotes').delete().eq('id', quote.server_id).eq('user_id', userId)
      }
      await window.api.sync.hardDeleteQuote(quote.id)
    } else {
      // 부모 아이템의 server_id 필요 (클라우드 item id로 매핑)
      const parentItem = (await window.api.sync.getItemById(quote.item_id)) as
        | (Record<string, unknown> & { server_id?: number | null })
        | undefined
      if (!parentItem?.server_id) {
        // 부모 아이템이 아직 동기화 안됨 → 다음 동기화에서 처리
        continue
      }

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
        if (!error) {
          await window.api.sync.markQuoteSynced(quote.id, quote.server_id)
        }
      } else {
        const { data, error } = await supabase
          .from('quotes')
          .insert(payload)
          .select('id')
          .single()
        if (!error && data) {
          await window.api.sync.markQuoteSynced(quote.id, (data as { id: number }).id)
        }
      }
    }
  }
}

// ── 풀: Supabase 아이템 → 로컬 ───────────────────────────────────────
async function pullCloudItems(userId: string): Promise<void> {
  const lastSyncAt = await window.api.sync.getLastSyncAt()

  let query = supabase.from('items').select('*').eq('user_id', userId)
  if (lastSyncAt) query = query.gt('updated_at', lastSyncAt)

  const { data, error } = await query
  if (error || !data) return

  for (const item of data) {
    await window.api.sync.upsertItemFromCloud({
      ...item,
      year: item.year != null ? Number(item.year) : null, // Supabase TEXT → 로컬 INTEGER
    })
  }
}

// ── 풀: Supabase 명문장 → 로컬 ───────────────────────────────────────
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
export async function runSync(onStatus?: (status: SyncStatus) => void): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  if (!window.api?.sync) return

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  onStatus?.('syncing')
  try {
    await pushDirtyItems(user.id)
    await pushDirtyQuotes(user.id)
    await pullCloudItems(user.id)
    await pullCloudQuotes(user.id)
    await window.api.sync.setLastSyncAt(new Date().toISOString())
    onStatus?.('success')
  } catch (err) {
    console.error('[Sync] 오류:', err)
    onStatus?.('error')
    throw err
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
