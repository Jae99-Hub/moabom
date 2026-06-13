import initSqlJs, { Database } from 'sql.js'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { is } from '@electron-toolkit/utils'

let db: Database
let dbPath: string
let sqlInstance: initSqlJs.SqlJsStatic

// 현재 로그인한 유저 ID (로그아웃 시 null)
let currentUserId: string | null = null
export function setCurrentUserId(id: string | null): void { currentUserId = id }
export function getCurrentUserId(): string | null { return currentUserId }

function getWasmPath(): string {
  if (is.dev) {
    return join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')
  }
  return join(process.resourcesPath, 'sql-wasm.wasm')
}

export async function initDatabase(): Promise<void> {
  const userDataPath = app.getPath('userData')
  if (!existsSync(userDataPath)) mkdirSync(userDataPath, { recursive: true })
  dbPath = join(userDataPath, 'bookvault.db')

  sqlInstance = await initSqlJs({ locateFile: () => getWasmPath() })

  if (existsSync(dbPath)) {
    db = new sqlInstance.Database(readFileSync(dbPath))
  } else {
    db = new sqlInstance.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      original_title TEXT,
      item_type TEXT NOT NULL DEFAULT 'book',
      cover_path TEXT,
      backdrop_path TEXT,
      author TEXT,
      publisher TEXT,
      isbn TEXT,
      page_count INTEGER,
      current_page INTEGER DEFAULT 0,
      director TEXT,
      platform TEXT,
      tmdb_id INTEGER,
      google_books_id TEXT,
      genre TEXT,
      year INTEGER,
      overview TEXT,
      rating REAL,
      status TEXT NOT NULL DEFAULT 'want',
      review TEXT,
      read_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      page_number INTEGER,
      episode_number INTEGER,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // ── 동기화 컬럼 마이그레이션 (기존 DB 호환) ──────────────────────
  // SQLite는 IF NOT EXISTS를 지원하지 않으므로 try/catch로 처리
  const migrations = [
    "ALTER TABLE items ADD COLUMN server_id INTEGER",
    "ALTER TABLE items ADD COLUMN is_dirty INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE items ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE items ADD COLUMN user_id TEXT",
    "ALTER TABLE quotes ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))",
    "ALTER TABLE quotes ADD COLUMN server_id INTEGER",
    "ALTER TABLE quotes ADD COLUMN is_dirty INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE quotes ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE quotes ADD COLUMN episode_number INTEGER",
  ]
  for (const sql of migrations) {
    try { db.run(sql) } catch { /* 이미 존재하면 무시 */ }
  }

  runStmt("INSERT OR IGNORE INTO settings (key, value) VALUES ('tmdb_api_key', '')")
  runStmt("INSERT OR IGNORE INTO settings (key, value) VALUES ('last_sync_at', '')")
  save()
}

function save(): void {
  const data = db.export()
  writeFileSync(dbPath, Buffer.from(data))
}

export async function reloadDatabase(): Promise<void> {
  db.close()
  db = new sqlInstance.Database(readFileSync(dbPath))
}

function runStmt(sql: string, params: Record<string, unknown> = {}): void {
  db.run(sql, params as Record<string, string | number | null | Uint8Array>)
  save()
}

function queryAll(sql: string, params: Record<string, unknown> = {}): Record<string, unknown>[] {
  const stmt = db.prepare(sql)
  stmt.bind(params as Record<string, string | number | null | Uint8Array>)
  const rows: Record<string, unknown>[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

function queryOne(sql: string, params: Record<string, unknown> = {}): Record<string, unknown> | undefined {
  return queryAll(sql, params)[0]
}

export type ItemRow = {
  id: number
  title: string
  original_title: string | null
  item_type: string
  cover_path: string | null
  backdrop_path: string | null
  author: string | null
  publisher: string | null
  isbn: string | null
  page_count: number | null
  current_page: number
  director: string | null
  platform: string | null
  tmdb_id: number | null
  google_books_id: string | null
  genre: string | null
  year: number | null
  overview: string | null
  rating: number | null
  status: string
  review: string | null
  read_date: string | null
  created_at: string
  updated_at: string
  // 동기화 필드
  server_id: number | null
  is_dirty: number
  is_deleted: number
}

export type QuoteRow = {
  id: number
  item_id: number
  text: string
  page_number: number | null
  episode_number: number | null
  note: string | null
  created_at: string
  updated_at: string
  // 동기화 필드
  server_id: number | null
  is_dirty: number
  is_deleted: number
}

function rowToItem(row: Record<string, unknown>): ItemRow {
  return {
    id: row.id as number,
    title: row.title as string,
    original_title: (row.original_title as string) || null,
    item_type: row.item_type as string,
    cover_path: (row.cover_path as string) || null,
    backdrop_path: (row.backdrop_path as string) || null,
    author: (row.author as string) || null,
    publisher: (row.publisher as string) || null,
    isbn: (row.isbn as string) || null,
    page_count: row.page_count != null ? Number(row.page_count) : null,
    current_page: row.current_page != null ? Number(row.current_page) : 0,
    director: (row.director as string) || null,
    platform: (row.platform as string) || null,
    tmdb_id: row.tmdb_id != null ? Number(row.tmdb_id) : null,
    google_books_id: (row.google_books_id as string) || null,
    genre: (row.genre as string) || null,
    year: row.year != null ? Number(row.year) : null,
    overview: (row.overview as string) || null,
    rating: row.rating != null ? Number(row.rating) : null,
    status: row.status as string,
    review: (row.review as string) || null,
    read_date: (row.read_date as string) || null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    server_id: row.server_id != null ? Number(row.server_id) : null,
    is_dirty: row.is_dirty != null ? Number(row.is_dirty) : 1,
    is_deleted: row.is_deleted != null ? Number(row.is_deleted) : 0,
  }
}

function rowToQuote(row: Record<string, unknown>): QuoteRow {
  return {
    id: row.id as number,
    item_id: row.item_id as number,
    text: row.text as string,
    page_number: row.page_number != null ? Number(row.page_number) : null,
    episode_number: row.episode_number != null ? Number(row.episode_number) : null,
    note: (row.note as string) || null,
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string) || (row.created_at as string),
    server_id: row.server_id != null ? Number(row.server_id) : null,
    is_dirty: row.is_dirty != null ? Number(row.is_dirty) : 1,
    is_deleted: row.is_deleted != null ? Number(row.is_deleted) : 0,
  }
}

// ── 기본 CRUD ───────────────────────────────────────────────────────

export function getAllItems(): ItemRow[] {
  if (currentUserId) {
    return queryAll(
      'SELECT * FROM items WHERE is_deleted = 0 AND user_id = :uid ORDER BY created_at DESC',
      { ':uid': currentUserId }
    ).map(rowToItem)
  }
  // 비로그인: user_id가 없는 아이템만
  return queryAll(
    'SELECT * FROM items WHERE is_deleted = 0 AND user_id IS NULL ORDER BY created_at DESC'
  ).map(rowToItem)
}

export function getItemById(id: number): ItemRow | undefined {
  const row = queryOne('SELECT * FROM items WHERE id = :id', { ':id': id })
  return row ? rowToItem(row) : undefined
}

export function insertItem(data: Omit<ItemRow, 'id' | 'created_at' | 'updated_at' | 'server_id' | 'is_dirty' | 'is_deleted'>): ItemRow {
  db.run(
    `INSERT INTO items (title, original_title, item_type, cover_path, backdrop_path, author, publisher,
      isbn, page_count, current_page, director, platform, tmdb_id, google_books_id, genre, year,
      overview, rating, status, review, read_date, user_id, is_dirty)
     VALUES (:title, :original_title, :item_type, :cover_path, :backdrop_path, :author, :publisher,
      :isbn, :page_count, :current_page, :director, :platform, :tmdb_id, :google_books_id, :genre, :year,
      :overview, :rating, :status, :review, :read_date, :user_id, 1)`,
    {
      ':title': data.title,
      ':original_title': data.original_title ?? null,
      ':item_type': data.item_type,
      ':cover_path': data.cover_path ?? null,
      ':backdrop_path': data.backdrop_path ?? null,
      ':author': data.author ?? null,
      ':publisher': data.publisher ?? null,
      ':isbn': data.isbn ?? null,
      ':page_count': data.page_count ?? null,
      ':current_page': data.current_page ?? 0,
      ':director': data.director ?? null,
      ':platform': data.platform ?? null,
      ':tmdb_id': data.tmdb_id ?? null,
      ':google_books_id': data.google_books_id ?? null,
      ':genre': data.genre ?? null,
      ':year': data.year ?? null,
      ':overview': data.overview ?? null,
      ':rating': data.rating ?? null,
      ':status': data.status,
      ':review': data.review ?? null,
      ':read_date': data.read_date ?? null,
      ':user_id': currentUserId ?? null
    }
  )
  const id = (queryOne('SELECT last_insert_rowid() as id') as { id: number }).id
  save()
  return getItemById(id)!
}

export function updateItem(id: number, data: Partial<Omit<ItemRow, 'id' | 'created_at'>>): ItemRow | undefined {
  const allowed = [
    'title', 'original_title', 'item_type', 'cover_path', 'backdrop_path',
    'author', 'publisher', 'isbn', 'page_count', 'current_page',
    'director', 'platform', 'tmdb_id', 'google_books_id', 'genre',
    'year', 'overview', 'rating', 'status', 'review', 'read_date',
    'server_id', 'is_dirty', 'is_deleted'
  ]
  const entries = Object.entries(data).filter(([k]) => allowed.includes(k))
  if (!entries.length) return getItemById(id)

  const sets = entries.map(([k]) => `${k} = :${k}`).join(', ')
  const params: Record<string, unknown> = { ':id': id }
  entries.forEach(([k, v]) => { params[`:${k}`] = v ?? null })

  // sync 필드 변경이 아닌 경우에만 dirty 마킹 + updated_at 갱신
  const isSyncInternalUpdate = entries.every(([k]) => ['server_id', 'is_dirty', 'is_deleted'].includes(k))
  const extraSets = isSyncInternalUpdate ? '' : `, updated_at = datetime('now'), is_dirty = 1`

  db.run(
    `UPDATE items SET ${sets}${extraSets} WHERE id = :id`,
    params as Record<string, string | number | null | Uint8Array>
  )
  save()
  return getItemById(id)
}

export function deleteItem(id: number): void {
  const item = getItemById(id)
  if (item?.server_id) {
    // 클라우드에 있는 항목은 소프트 삭제 (동기화 후 실제 삭제)
    db.run('UPDATE items SET is_deleted = 1, is_dirty = 1, updated_at = datetime(\'now\') WHERE id = :id', { ':id': id })
    db.run('UPDATE quotes SET is_deleted = 1, is_dirty = 1 WHERE item_id = :id', { ':id': id })
  } else {
    // 로컬에만 있는 항목은 즉시 하드 삭제
    db.run('DELETE FROM quotes WHERE item_id = :id', { ':id': id })
    db.run('DELETE FROM items WHERE id = :id', { ':id': id })
  }
  save()
}

// ── 명문장 ───────────────────────────────────────────────────────────

export function getQuotesByItemId(itemId: number): QuoteRow[] {
  return queryAll(
    `SELECT * FROM quotes WHERE item_id = :id AND is_deleted = 0
     ORDER BY COALESCE(page_number, episode_number, 999999) ASC, created_at ASC`,
    { ':id': itemId }
  ).map(rowToQuote)
}

export function searchQuotes(query: string): (QuoteRow & { item_title: string; item_type: string; cover_path: string | null })[] {
  const rows = queryAll(
    `SELECT q.*, i.title as item_title, i.item_type, i.cover_path
     FROM quotes q
     JOIN items i ON q.item_id = i.id
     WHERE (q.text LIKE :q OR q.note LIKE :q) AND q.is_deleted = 0 AND i.is_deleted = 0
     ORDER BY q.created_at DESC`,
    { ':q': `%${query}%` }
  )
  return rows.map((r) => ({
    ...rowToQuote(r),
    item_title: r.item_title as string,
    item_type: r.item_type as string,
    cover_path: (r.cover_path as string) || null
  }))
}

export function insertQuote(data: Omit<QuoteRow, 'id' | 'created_at' | 'updated_at' | 'server_id' | 'is_dirty' | 'is_deleted'>): QuoteRow {
  db.run(
    `INSERT INTO quotes (item_id, text, page_number, episode_number, note, is_dirty)
     VALUES (:item_id, :text, :page_number, :episode_number, :note, 1)`,
    {
      ':item_id': data.item_id,
      ':text': data.text,
      ':page_number': data.page_number ?? null,
      ':episode_number': data.episode_number ?? null,
      ':note': data.note ?? null
    }
  )
  const id = (queryOne('SELECT last_insert_rowid() as id') as { id: number }).id
  save()
  return getQuotesByItemId(data.item_id).find((q) => q.id === id)!
}

export function updateQuote(id: number, data: Partial<Pick<QuoteRow, 'text' | 'page_number' | 'episode_number' | 'note'>>): QuoteRow | undefined {
  const parts: string[] = []
  const params: Record<string, unknown> = { ':id': id }
  if (data.text !== undefined) { parts.push('text = :text'); params[':text'] = data.text }
  if (data.page_number !== undefined) { parts.push('page_number = :page_number'); params[':page_number'] = data.page_number ?? null }
  if (data.episode_number !== undefined) { parts.push('episode_number = :episode_number'); params[':episode_number'] = data.episode_number ?? null }
  if (data.note !== undefined) { parts.push('note = :note'); params[':note'] = data.note ?? null }
  if (!parts.length) return undefined
  db.run(
    `UPDATE quotes SET ${parts.join(', ')}, updated_at = datetime('now'), is_dirty = 1 WHERE id = :id`,
    params as Record<string, string | number | null | Uint8Array>
  )
  save()
  const row = queryOne('SELECT * FROM quotes WHERE id = :id', { ':id': id })
  return row ? rowToQuote(row) : undefined
}

export function deleteQuote(id: number): void {
  const row = queryOne('SELECT server_id FROM quotes WHERE id = :id', { ':id': id })
  if (row?.server_id) {
    db.run('UPDATE quotes SET is_deleted = 1, is_dirty = 1 WHERE id = :id', { ':id': id })
  } else {
    db.run('DELETE FROM quotes WHERE id = :id', { ':id': id })
  }
  save()
}

// ── 동기화 헬퍼 함수 ─────────────────────────────────────────────────

/** 클라우드에 올려야 할 dirty 아이템 목록 (삭제 포함) */
export function getDirtyItems(): ItemRow[] {
  return queryAll('SELECT * FROM items WHERE is_dirty = 1').map(rowToItem)
}

/** 클라우드에 올려야 할 dirty 명문장 목록 (삭제 포함) */
export function getDirtyQuotes(): QuoteRow[] {
  return queryAll('SELECT * FROM quotes WHERE is_dirty = 1').map(rowToQuote)
}

/** 동기화 완료 후 아이템 clean 마킹 */
export function markItemSynced(localId: number, serverId: number): void {
  db.run(
    'UPDATE items SET server_id = :sid, is_dirty = 0 WHERE id = :id',
    { ':sid': serverId, ':id': localId }
  )
  save()
}

/** 동기화 완료 후 명문장 clean 마킹 */
export function markQuoteSynced(localId: number, serverId: number): void {
  db.run(
    'UPDATE quotes SET server_id = :sid, is_dirty = 0 WHERE id = :id',
    { ':sid': serverId, ':id': localId }
  )
  save()
}

/** 소프트 삭제된 아이템 하드 삭제 (동기화 후) */
export function hardDeleteItem(localId: number): void {
  db.run('DELETE FROM quotes WHERE item_id = :id', { ':id': localId })
  db.run('DELETE FROM items WHERE id = :id', { ':id': localId })
  save()
}

/** 소프트 삭제된 명문장 하드 삭제 (동기화 후) */
export function hardDeleteQuote(localId: number): void {
  db.run('DELETE FROM quotes WHERE id = :id', { ':id': localId })
  save()
}

/** SQLite/ISO 혼용 날짜 문자열을 ms로 파싱 */
function parseDateMs(s: string | null | undefined): number {
  if (!s) return 0
  // SQLite datetime('now') → 'YYYY-MM-DD HH:MM:SS' (공백, UTC)
  // Supabase → 'YYYY-MM-DDTHH:MM:SS.ssssss+00:00' (ISO)
  const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z'
  const ms = new Date(iso).getTime()
  return isNaN(ms) ? 0 : ms
}

/** 클라우드에서 내려온 아이템을 로컬에 upsert */
export function upsertItemFromCloud(cloudItem: {
  id: number; user_id: string; title: string; original_title?: string | null
  item_type: string; cover_path?: string | null; backdrop_path?: string | null
  author?: string | null; publisher?: string | null; isbn?: string | null
  page_count?: number | null; current_page?: number; director?: string | null
  platform?: string | null; tmdb_id?: number | null; google_books_id?: string | null
  genre?: string | null; year?: number | null; overview?: string | null
  rating?: number | null; status: string; review?: string | null
  read_date?: string | null; created_at: string; updated_at: string
}): void {
  const existing = queryOne('SELECT id, updated_at FROM items WHERE server_id = :sid', { ':sid': cloudItem.id })
  if (existing) {
    // 로컬이 더 최신이면 덮어쓰지 않음 (로컬 변경사항 보호)
    const localUpdated = existing.updated_at as string
    if (parseDateMs(localUpdated) >= parseDateMs(cloudItem.updated_at)) return

    db.run(
      `UPDATE items SET
        title=:title, original_title=:original_title, item_type=:item_type,
        cover_path=:cover_path, backdrop_path=:backdrop_path,
        author=:author, publisher=:publisher, isbn=:isbn,
        page_count=:page_count, current_page=:current_page,
        director=:director, platform=:platform, tmdb_id=:tmdb_id,
        google_books_id=:google_books_id, genre=:genre, year=:year,
        overview=:overview, rating=:rating, status=:status,
        review=:review, read_date=:read_date,
        updated_at=:updated_at, is_dirty=0
       WHERE server_id=:sid`,
      {
        ':title': cloudItem.title, ':original_title': cloudItem.original_title ?? null,
        ':item_type': cloudItem.item_type, ':cover_path': cloudItem.cover_path ?? null,
        ':backdrop_path': cloudItem.backdrop_path ?? null, ':author': cloudItem.author ?? null,
        ':publisher': cloudItem.publisher ?? null, ':isbn': cloudItem.isbn ?? null,
        ':page_count': cloudItem.page_count ?? null, ':current_page': cloudItem.current_page ?? 0,
        ':director': cloudItem.director ?? null, ':platform': cloudItem.platform ?? null,
        ':tmdb_id': cloudItem.tmdb_id ?? null, ':google_books_id': cloudItem.google_books_id ?? null,
        ':genre': cloudItem.genre ?? null, ':year': cloudItem.year ?? null,
        ':overview': cloudItem.overview ?? null, ':rating': cloudItem.rating ?? null,
        ':status': cloudItem.status, ':review': cloudItem.review ?? null,
        ':read_date': cloudItem.read_date ?? null, ':updated_at': cloudItem.updated_at,
        ':sid': cloudItem.id,
      }
    )
  } else {
    db.run(
      `INSERT INTO items
        (title, original_title, item_type, cover_path, backdrop_path, author, publisher, isbn,
         page_count, current_page, director, platform, tmdb_id, google_books_id, genre, year,
         overview, rating, status, review, read_date, created_at, updated_at, server_id, user_id, is_dirty, is_deleted)
       VALUES
        (:title, :original_title, :item_type, :cover_path, :backdrop_path, :author, :publisher, :isbn,
         :page_count, :current_page, :director, :platform, :tmdb_id, :google_books_id, :genre, :year,
         :overview, :rating, :status, :review, :read_date, :created_at, :updated_at, :sid, :uid, 0, 0)`,
      {
        ':title': cloudItem.title, ':original_title': cloudItem.original_title ?? null,
        ':item_type': cloudItem.item_type, ':cover_path': cloudItem.cover_path ?? null,
        ':backdrop_path': cloudItem.backdrop_path ?? null, ':author': cloudItem.author ?? null,
        ':publisher': cloudItem.publisher ?? null, ':isbn': cloudItem.isbn ?? null,
        ':page_count': cloudItem.page_count ?? null, ':current_page': cloudItem.current_page ?? 0,
        ':director': cloudItem.director ?? null, ':platform': cloudItem.platform ?? null,
        ':tmdb_id': cloudItem.tmdb_id ?? null, ':google_books_id': cloudItem.google_books_id ?? null,
        ':genre': cloudItem.genre ?? null, ':year': cloudItem.year ?? null,
        ':overview': cloudItem.overview ?? null, ':rating': cloudItem.rating ?? null,
        ':status': cloudItem.status, ':review': cloudItem.review ?? null,
        ':read_date': cloudItem.read_date ?? null, ':created_at': cloudItem.created_at,
        ':updated_at': cloudItem.updated_at, ':sid': cloudItem.id,
        ':uid': cloudItem.user_id,
      }
    )
  }
  save()
}

/** 클라우드에서 내려온 명문장을 로컬에 upsert (item의 server_id → 로컬 item_id 변환 필요) */
export function upsertQuoteFromCloud(cloudQuote: {
  id: number; item_id: number; user_id: string; text: string
  page_number?: number | null; episode_number?: number | null; note?: string | null; created_at: string; updated_at?: string | null
}): void {
  // cloud item_id(=server_id)로 로컬 item 찾기
  const localItem = queryOne('SELECT id FROM items WHERE server_id = :sid', { ':sid': cloudQuote.item_id })
  if (!localItem) return // 연결된 아이템이 없으면 skip

  const localItemId = localItem.id as number
  const updatedAt = cloudQuote.updated_at ?? cloudQuote.created_at
  const existing = queryOne('SELECT id, updated_at FROM quotes WHERE server_id = :sid', { ':sid': cloudQuote.id })

  if (existing) {
    const localUpdated = (existing.updated_at as string) || ''
    if (parseDateMs(localUpdated) >= parseDateMs(updatedAt)) return
    db.run(
      `UPDATE quotes SET text=:text, page_number=:pn, episode_number=:en, note=:note, updated_at=:ua, is_dirty=0 WHERE server_id=:sid`,
      { ':text': cloudQuote.text, ':pn': cloudQuote.page_number ?? null,
        ':en': cloudQuote.episode_number ?? null,
        ':note': cloudQuote.note ?? null, ':ua': updatedAt, ':sid': cloudQuote.id }
    )
  } else {
    db.run(
      `INSERT INTO quotes (item_id, text, page_number, episode_number, note, created_at, updated_at, server_id, is_dirty, is_deleted)
       VALUES (:item_id, :text, :pn, :en, :note, :ca, :ua, :sid, 0, 0)`,
      { ':item_id': localItemId, ':text': cloudQuote.text, ':pn': cloudQuote.page_number ?? null,
        ':en': cloudQuote.episode_number ?? null,
        ':note': cloudQuote.note ?? null, ':ca': cloudQuote.created_at, ':ua': updatedAt, ':sid': cloudQuote.id }
    )
  }
  save()
}

/** 로컬 item의 server_id로 로컬 id 조회 */
export function getLocalItemIdByServerId(serverId: number): number | null {
  const row = queryOne('SELECT id FROM items WHERE server_id = :sid', { ':sid': serverId })
  return row ? (row.id as number) : null
}

// ── 설정 ─────────────────────────────────────────────────────────────

export function getSetting(key: string): string {
  const row = queryOne('SELECT value FROM settings WHERE key = :key', { ':key': key })
  return (row?.value as string) ?? ''
}

export function setSetting(key: string, value: string): void {
  db.run(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (:key, :value)',
    { ':key': key, ':value': value }
  )
  save()
}
