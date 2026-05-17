/**
 * 웹(브라우저) 환경에서 window.api를 구현합니다.
 * Electron IPC 대신 sql.js(WebAssembly) + IndexedDB를 사용합니다.
 * sql.js는 번들링 없이 CDN에서 동적으로 로드합니다.
 */

// sql.js CDN 동적 로드 (Vite 번들링 문제 방지)
const SQL_JS_CDN = 'https://sql.js.org/dist/'

type SqlParam = string | number | null | Uint8Array
type SqlParams = Record<string, SqlParam>

type SqlJsStatic = {
  Database: new (data?: ArrayLike<number> | Buffer | null) => SqlDatabase
}
type SqlDatabase = {
  run(sql: string, params?: SqlParams): SqlDatabase
  prepare(sql: string): SqlStatement
  export(): Uint8Array
}
type SqlStatement = {
  bind(params?: SqlParams): boolean
  step(): boolean
  getAsObject(params?: Record<string, unknown>): Record<string, unknown>
  free(): boolean
}

// unknown 값을 sql.js 허용 타입으로 안전하게 변환
function p(v: unknown): SqlParam {
  if (v === undefined) return null
  if (v === null || typeof v === 'string' || typeof v === 'number') return v as SqlParam
  return String(v)
}

// window.initSqlJs는 sql-wasm.js 스크립트가 로드되면 설정됨
declare global {
  interface Window {
    initSqlJs?: (config: { locateFile: (file: string) => string }) => Promise<SqlJsStatic>
  }
}

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (!window.initSqlJs) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = `${SQL_JS_CDN}sql-wasm.js`
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('sql.js 로드 실패'))
      document.head.appendChild(script)
    })
  }
  return window.initSqlJs!({ locateFile: (file) => `${SQL_JS_CDN}${file}` })
}

// ── IndexedDB 영속화 ─────────────────────────────────────────────
const IDB_NAME = 'bookvault-web'
const IDB_STORE = 'sqliteDb'

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = (e) => {
      (e.target as IDBOpenDBRequest).result.createObjectStore(IDB_STORE)
    }
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror = () => reject(req.error)
  })
}

async function loadDbBytes(): Promise<Uint8Array | null> {
  try {
    const idb = await openIDB()
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get('db')
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function saveDbBytes(data: Uint8Array): Promise<void> {
  try {
    const idb = await openIDB()
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(data, 'db')
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch { /* ignore */ }
}

// ── sql.js DB 초기화 ─────────────────────────────────────────────
let db: SqlDatabase | null = null

async function getDb(): Promise<SqlDatabase> {
  if (db) return db

  const SQL = await loadSqlJs()

  const saved = await loadDbBytes()
  db = saved ? new SQL.Database(saved) : new SQL.Database()

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
  await persist()
  return db
}

async function persist(): Promise<void> {
  if (!db) return
  await saveDbBytes(db.export())
}

function queryAll(database: SqlDatabase, sql: string, params: SqlParams = {}): Record<string, unknown>[] {
  const stmt = database.prepare(sql)
  stmt.bind(params)
  const rows: Record<string, unknown>[] = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

function queryOne(database: SqlDatabase, sql: string, params: SqlParams = {}): Record<string, unknown> | undefined {
  return queryAll(database, sql, params)[0]
}

// ── API 키 (기본값 / 설정에 저장된 키가 있으면 우선 사용) ───────────
const DEFAULT_GOOGLE_BOOKS_KEY = 'AIzaSyB2CqQVMkx89-S3xAAfG85Qk-LycoKNA0o'
const DEFAULT_TMDB_KEY = '2231c307ea12a6d255fca6d45014212b'

async function getApiKey(settingKey: string, defaultKey: string): Promise<string> {
  try {
    const db = await getDb()
    const row = queryOne(db, 'SELECT value FROM settings WHERE key = :key', { ':key': settingKey })
    const stored = (row?.value as string) ?? ''
    return stored.trim() || defaultKey
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

// ── 이미지 선택 (파일 input) ───────────────────────────────────────
function pickImageFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    let resolved = false
    input.onchange = (e) => {
      resolved = true
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) { resolve(null); return }
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    }
    // 파일 선택 안 하고 닫을 경우
    window.addEventListener('focus', () => {
      setTimeout(() => { if (!resolved) resolve(null) }, 500)
    }, { once: true })
    input.click()
  })
}

// ── window.api 구현 ───────────────────────────────────────────────
export async function setupWebApi(): Promise<void> {
  // DB 미리 초기화 (테이블 생성)
  await getDb()

  const api = {
    items: {
      getAll: async () => {
        const db = await getDb()
        return queryAll(db, 'SELECT * FROM items ORDER BY created_at DESC')
      },
      getById: async (id: number) => {
        const db = await getDb()
        return queryOne(db, 'SELECT * FROM items WHERE id = :id', { ':id': id }) ?? null
      },
      insert: async (data: Record<string, unknown>) => {
        const db = await getDb()
        db.run(
          `INSERT INTO items (title, original_title, item_type, cover_path, backdrop_path, author, publisher,
            isbn, page_count, current_page, director, platform, tmdb_id, google_books_id, genre, year,
            overview, rating, status, review, read_date)
           VALUES (:title, :original_title, :item_type, :cover_path, :backdrop_path, :author, :publisher,
            :isbn, :page_count, :current_page, :director, :platform, :tmdb_id, :google_books_id, :genre, :year,
            :overview, :rating, :status, :review, :read_date)`,
          {
            ':title': p(data.title ?? ''),
            ':original_title': p(data.original_title),
            ':item_type': p(data.item_type ?? 'book'),
            ':cover_path': p(data.cover_path),
            ':backdrop_path': p(data.backdrop_path),
            ':author': p(data.author),
            ':publisher': p(data.publisher),
            ':isbn': p(data.isbn),
            ':page_count': p(data.page_count),
            ':current_page': p(data.current_page ?? 0),
            ':director': p(data.director),
            ':platform': p(data.platform),
            ':tmdb_id': p(data.tmdb_id),
            ':google_books_id': p(data.google_books_id),
            ':genre': p(data.genre),
            ':year': p(data.year),
            ':overview': p(data.overview),
            ':rating': p(data.rating),
            ':status': p(data.status ?? 'want'),
            ':review': p(data.review),
            ':read_date': p(data.read_date)
          }
        )
        const row = queryOne(db, 'SELECT last_insert_rowid() as id')
        const newId = row?.id as number
        await persist()
        return queryOne(db, 'SELECT * FROM items WHERE id = :id', { ':id': newId })
      },
      update: async (id: number, data: Record<string, unknown>) => {
        const db = await getDb()
        const allowed = [
          'title', 'original_title', 'item_type', 'cover_path', 'backdrop_path',
          'author', 'publisher', 'isbn', 'page_count', 'current_page',
          'director', 'platform', 'tmdb_id', 'google_books_id', 'genre',
          'year', 'overview', 'rating', 'status', 'review', 'read_date'
        ]
        const entries = Object.entries(data).filter(([k]) => allowed.includes(k))
        if (!entries.length) return
        const sets = entries.map(([k]) => `${k} = :${k}`).join(', ')
        const params: SqlParams = { ':id': id }
        entries.forEach(([k, v]) => { params[`:${k}`] = p(v) })
        db.run(
          `UPDATE items SET ${sets}, updated_at = datetime('now') WHERE id = :id`,
          params
        )
        await persist()
      },
      delete: async (id: number) => {
        const db = await getDb()
        db.run('DELETE FROM quotes WHERE item_id = :id', { ':id': id })
        db.run('DELETE FROM items WHERE id = :id', { ':id': id })
        await persist()
      }
    },

    quotes: {
      getByItemId: async (itemId: number) => {
        const db = await getDb()
        return queryAll(db, 'SELECT * FROM quotes WHERE item_id = :id ORDER BY page_number ASC, created_at ASC', { ':id': itemId })
      },
      search: async (query: string) => {
        const db = await getDb()
        return queryAll(
          db,
          `SELECT q.*, i.title as item_title, i.item_type, i.cover_path
           FROM quotes q JOIN items i ON q.item_id = i.id
           WHERE q.text LIKE :q OR q.note LIKE :q ORDER BY q.created_at DESC`,
          { ':q': `%${query}%` }
        )
      },
      insert: async (data: Record<string, unknown>) => {
        const db = await getDb()
        db.run(
          'INSERT INTO quotes (item_id, text, page_number, note) VALUES (:item_id, :text, :page_number, :note)',
          {
            ':item_id': p(data.item_id),
            ':text': p(data.text),
            ':page_number': p(data.page_number),
            ':note': p(data.note)
          }
        )
        const row = queryOne(db, 'SELECT last_insert_rowid() as id')
        await persist()
        return queryOne(db, 'SELECT * FROM quotes WHERE id = :id', { ':id': row?.id as number })
      },
      update: async (id: number, data: Record<string, unknown>) => {
        const db = await getDb()
        const parts: string[] = []
        const params: SqlParams = { ':id': id }
        if (data.text !== undefined) { parts.push('text = :text'); params[':text'] = p(data.text) }
        if (data.page_number !== undefined) { parts.push('page_number = :page_number'); params[':page_number'] = p(data.page_number) }
        if (data.note !== undefined) { parts.push('note = :note'); params[':note'] = p(data.note) }
        if (parts.length) {
          db.run(`UPDATE quotes SET ${parts.join(', ')} WHERE id = :id`, params)
          await persist()
        }
      },
      delete: async (id: number) => {
        const db = await getDb()
        db.run('DELETE FROM quotes WHERE id = :id', { ':id': id })
        await persist()
      }
    },

    settings: {
      get: async (key: string) => {
        const db = await getDb()
        const row = queryOne(db, 'SELECT value FROM settings WHERE key = :key', { ':key': key })
        return (row?.value as string) ?? ''
      },
      set: async (key: string, value: string) => {
        const db = await getDb()
        db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (:key, :value)', {
          ':key': key, ':value': value
        })
        await persist()
      }
    },

    books: {
      search: async (query: string) => searchGoogleBooks(query)
    },

    tmdb: {
      search: async (query: string) => searchTmdb(query)
    },

    image: {
      pick: async (): Promise<string | null> => pickImageFile(),
      saveCropped: async (base64Data: string, _fileName: string): Promise<string> => base64Data,
      copyLocal: async (srcPath: string): Promise<string> => srcPath
    },

    db: {
      backup: async () => {
        const db = await getDb()
        const rows = queryAll(db, 'SELECT * FROM items')
        const quotes = queryAll(db, 'SELECT * FROM quotes')
        const json = JSON.stringify({ items: rows, quotes }, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `bookvault-backup-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)
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
              const { items, quotes } = JSON.parse(text) as { items: Record<string, unknown>[]; quotes: Record<string, unknown>[] }
              const restoreDb = await getDb()
              restoreDb.run('DELETE FROM quotes')
              restoreDb.run('DELETE FROM items')
              for (const item of items) {
                await api.items.insert(item)
              }
              for (const q of quotes) {
                await api.quotes.insert(q)
              }
              await persist()
              // 모듈 레벨 DB 캐시 초기화 → 다음 getDb() 호출 시 새 데이터 로드
              db = null
              resolve({ success: true })
            } catch {
              resolve({ success: false })
            }
          }
          input.click()
        })
      }
    }
  }

  // window.api로 노출
  ;(window as unknown as Record<string, unknown>).api = api
}
