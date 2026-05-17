import initSqlJs, { Database } from 'sql.js'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { is } from '@electron-toolkit/utils'

let db: Database
let dbPath: string
let sqlInstance: initSqlJs.SqlJsStatic

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
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  runStmt("INSERT OR IGNORE INTO settings (key, value) VALUES ('tmdb_api_key', '')")
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
}

export type QuoteRow = {
  id: number
  item_id: number
  text: string
  page_number: number | null
  note: string | null
  created_at: string
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
    updated_at: row.updated_at as string
  }
}

function rowToQuote(row: Record<string, unknown>): QuoteRow {
  return {
    id: row.id as number,
    item_id: row.item_id as number,
    text: row.text as string,
    page_number: row.page_number != null ? Number(row.page_number) : null,
    note: (row.note as string) || null,
    created_at: row.created_at as string
  }
}

export function getAllItems(): ItemRow[] {
  return queryAll('SELECT * FROM items ORDER BY created_at DESC').map(rowToItem)
}

export function getItemById(id: number): ItemRow | undefined {
  const row = queryOne('SELECT * FROM items WHERE id = :id', { ':id': id })
  return row ? rowToItem(row) : undefined
}

export function insertItem(data: Omit<ItemRow, 'id' | 'created_at' | 'updated_at'>): ItemRow {
  db.run(
    `INSERT INTO items (title, original_title, item_type, cover_path, backdrop_path, author, publisher,
      isbn, page_count, current_page, director, platform, tmdb_id, google_books_id, genre, year,
      overview, rating, status, review, read_date)
     VALUES (:title, :original_title, :item_type, :cover_path, :backdrop_path, :author, :publisher,
      :isbn, :page_count, :current_page, :director, :platform, :tmdb_id, :google_books_id, :genre, :year,
      :overview, :rating, :status, :review, :read_date)`,
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
      ':read_date': data.read_date ?? null
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
    'year', 'overview', 'rating', 'status', 'review', 'read_date'
  ]
  const entries = Object.entries(data).filter(([k]) => allowed.includes(k))
  if (!entries.length) return getItemById(id)

  const sets = entries.map(([k]) => `${k} = :${k}`).join(', ')
  const params: Record<string, unknown> = { ':id': id }
  entries.forEach(([k, v]) => { params[`:${k}`] = v ?? null })

  db.run(
    `UPDATE items SET ${sets}, updated_at = datetime('now') WHERE id = :id`,
    params as Record<string, string | number | null | Uint8Array>
  )
  save()
  return getItemById(id)
}

export function deleteItem(id: number): void {
  db.run('DELETE FROM quotes WHERE item_id = :id', { ':id': id })
  db.run('DELETE FROM items WHERE id = :id', { ':id': id })
  save()
}

export function getQuotesByItemId(itemId: number): QuoteRow[] {
  return queryAll('SELECT * FROM quotes WHERE item_id = :id ORDER BY page_number ASC, created_at ASC', { ':id': itemId }).map(rowToQuote)
}

export function searchQuotes(query: string): (QuoteRow & { item_title: string; item_type: string; cover_path: string | null })[] {
  const rows = queryAll(
    `SELECT q.*, i.title as item_title, i.item_type, i.cover_path
     FROM quotes q
     JOIN items i ON q.item_id = i.id
     WHERE q.text LIKE :q OR q.note LIKE :q
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

export function insertQuote(data: Omit<QuoteRow, 'id' | 'created_at'>): QuoteRow {
  db.run(
    `INSERT INTO quotes (item_id, text, page_number, note) VALUES (:item_id, :text, :page_number, :note)`,
    {
      ':item_id': data.item_id,
      ':text': data.text,
      ':page_number': data.page_number ?? null,
      ':note': data.note ?? null
    }
  )
  const id = (queryOne('SELECT last_insert_rowid() as id') as { id: number }).id
  save()
  return getQuotesByItemId(data.item_id).find((q) => q.id === id)!
}

export function updateQuote(id: number, data: Partial<Pick<QuoteRow, 'text' | 'page_number' | 'note'>>): QuoteRow | undefined {
  const parts: string[] = []
  const params: Record<string, unknown> = { ':id': id }
  if (data.text !== undefined) { parts.push('text = :text'); params[':text'] = data.text }
  if (data.page_number !== undefined) { parts.push('page_number = :page_number'); params[':page_number'] = data.page_number ?? null }
  if (data.note !== undefined) { parts.push('note = :note'); params[':note'] = data.note ?? null }
  if (!parts.length) return undefined
  db.run(`UPDATE quotes SET ${parts.join(', ')} WHERE id = :id`, params as Record<string, string | number | null | Uint8Array>)
  save()
  const row = queryOne('SELECT * FROM quotes WHERE id = :id', { ':id': id })
  return row ? rowToQuote(row) : undefined
}

export function deleteQuote(id: number): void {
  db.run('DELETE FROM quotes WHERE id = :id', { ':id': id })
  save()
}

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
