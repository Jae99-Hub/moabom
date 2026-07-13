import initSqlJs, { Database } from 'sql.js'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync,
         readdirSync, statSync, unlinkSync, renameSync, copyFileSync } from 'fs'
import { resolve } from 'path'
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
    try {
      db = new sqlInstance.Database(readFileSync(dbPath))
      db.exec("SELECT 1 FROM sqlite_master LIMIT 1") // 손상 감지 (로드 시 조용히 열리는 경우 대비)
    } catch {
      // DB 파일 손상 → 원본 보존 후 최신 백업으로 복구 (없으면 빈 DB)
      try { renameSync(dbPath, dbPath + '.corrupt-' + Date.now()) } catch { /* ignore */ }
      db = recoverDbOrEmpty()
    }
  } else {
    db = new sqlInstance.Database()
  }

  bootstrapSchema()

  runStmt("INSERT OR IGNORE INTO settings (key, value) VALUES ('tmdb_api_key', '')")
  runStmt("INSERT OR IGNORE INTO settings (key, value) VALUES ('last_sync_at', '')")
  // 시작 시 비로그인/미동기화 휴지통 중 15일 경과분 영구삭제 (로그인분은 동기화에서 처리)
  purgeExpiredTrash(15, true)
  save()
}

function save(): void {
  // 원자적 저장: 임시파일 기록 후 rename → 쓰기 중 중단돼도 dbPath는 항상 완전한 이전본/새본
  const data = db.export()
  const tmp = dbPath + '.savetmp'
  writeFileSync(tmp, Buffer.from(data))
  renameSync(tmp, dbPath)
}

export function getDbPath(): string { return dbPath }

/** 파일을 열어 무결성 검증. 유효하면 Database, 아니면 null. */
function tryOpenValid(path: string): Database | null {
  try {
    if (!existsSync(path)) return null
    const d = new sqlInstance.Database(readFileSync(path))
    const ic = d.exec("PRAGMA integrity_check")
    if (ic?.[0]?.values?.[0]?.[0] !== 'ok') { try { d.close() } catch { /* ignore */ } ; return null }
    d.exec("SELECT 1 FROM items LIMIT 1")
    return d
  } catch { return null }
}

/** dbPath 손상 시: 최신 자동 백업(검증 통과분)으로 복구, 없으면 빈 DB. */
function recoverDbOrEmpty(): Database {
  try {
    for (const b of listAutoBackups()) { // 최신순
      const d = tryOpenValid(b.path)
      if (d) return d
    }
  } catch { /* ignore */ }
  return new sqlInstance.Database()
}

// ── 스키마 + 마이그레이션 (초기화 및 복원 후 재적용) ─────────────────
const MIGRATIONS: string[] = [
  "ALTER TABLE items ADD COLUMN server_id INTEGER",
  "ALTER TABLE items ADD COLUMN is_dirty INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE items ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE items ADD COLUMN user_id TEXT",
  "ALTER TABLE items ADD COLUMN deleted_at TEXT",
  "ALTER TABLE quotes ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))",
  "ALTER TABLE quotes ADD COLUMN server_id INTEGER",
  "ALTER TABLE quotes ADD COLUMN is_dirty INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE quotes ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE quotes ADD COLUMN episode_number INTEGER",
  "ALTER TABLE quotes ADD COLUMN deleted_at TEXT",
]

function bootstrapSchema(): void {
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
  // SQLite는 ADD COLUMN IF NOT EXISTS 미지원 → try/catch
  for (const sql of MIGRATIONS) {
    try { db.run(sql) } catch { /* 이미 존재하면 무시 */ }
  }
}

/** DB 파일 복원 — 소스를 먼저 검증한 뒤에만 라이브 DB 교체 (실패해도 현재 데이터 무손상).
 *  성공 시 { success:true }, 실패 시 { success:false, error } (라이브 DB는 그대로 유지). */
export async function restoreFromFile(srcPath: string): Promise<{ success: boolean; error?: string }> {
  let srcBytes: Buffer
  try { srcBytes = readFileSync(srcPath) } // OneDrive 오프라인 placeholder 등 → throw
  catch { return { success: false, error: 'read-source' } }
  if (!srcBytes || srcBytes.length === 0) return { success: false, error: 'empty-source' }

  // 1) 소스를 임시 핸들로 열어 검증 (라이브 DB는 아직 손대지 않음)
  let tmpDb: Database | null = null
  try {
    tmpDb = new sqlInstance.Database(srcBytes)
    const ic = tmpDb.exec("PRAGMA integrity_check")
    if (ic?.[0]?.values?.[0]?.[0] !== 'ok') throw new Error('integrity')
    tmpDb.exec("SELECT 1 FROM items LIMIT 1") // 우리 스키마 최소 확인
  } catch {
    try { tmpDb?.close() } catch { /* ignore */ }
    return { success: false, error: 'invalid-db' } // ← 라이브 DB 무손상
  }

  // 2) 검증된 핸들에 스키마 보강 → 최종 바이트를 임시파일 기록 → 단 한 번의 rename으로만 커밋.
  //    커밋(rename) 이후엔 실패할 코드가 없어 '디스크는 새본인데 실패 반환' 불일치가 원천 차단됨.
  const validDb = tmpDb as Database
  const prevDb = db
  try {
    db = validDb
    bootstrapSchema()                      // 구버전 백업 누락 컬럼 보강
    const bytes = Buffer.from(db.export())
    const tmpPath = dbPath + '.restoretmp'
    writeFileSync(tmpPath, bytes)          // 실패해도 dbPath는 아직 원본
    renameSync(tmpPath, dbPath)            // ← 유일한 커밋 지점 (원자적)
    try { prevDb.close() } catch { /* ignore */ }
    return { success: true }
  } catch {
    // 커밋 전 실패 → 인메모리 원본 복구 + 채택 핸들 닫기 (디스크 dbPath는 원본 그대로)
    db = prevDb
    try { validDb.close() } catch { /* ignore */ }
    return { success: false, error: 'swap-failed' }
  }
}

// ── 자동 로컬 백업 (최근 14일 보관, 데이터 변경 시에만 기록) ──────────
const AUTO_BACKUP_PREFIX = 'moabom-auto-'
const AUTO_BACKUP_RE = /^moabom-auto-\d{4}-\d{2}-\d{2}_\d{6}\.db$/
const AUTO_BACKUP_KEEP_DAYS = 14
export interface AutoBackupInfo { name: string; path: string; size: number; mtime: number }

// 사용자 지정 백업 경로는 DB가 아니라 별도 파일에 저장.
// → DB 손상 자동복구(recoverDbOrEmpty) 시점(DB 미로드)에도 읽을 수 있어 custom 폴더의 백업을 찾을 수 있음.
function backupDirConfigPath(): string {
  return join(app.getPath('userData'), 'backup-dir.txt')
}
function readCustomBackupDir(): string {
  try {
    const p = backupDirConfigPath()
    return existsSync(p) ? readFileSync(p, 'utf-8').trim() : ''
  } catch { return '' }
}
function writeCustomBackupDir(dir: string): void {
  try { writeFileSync(backupDirConfigPath(), dir, 'utf-8') } catch { /* ignore */ }
}

let cachedBackupDir: string | null = null
export function getAutoBackupDir(): string {
  if (cachedBackupDir) return cachedBackupDir
  // 사용자 지정 폴더 우선 (파일 기반이라 DB 없이도 조회 가능)
  const custom = readCustomBackupDir()
  if (custom) {
    try {
      if (!existsSync(custom)) mkdirSync(custom, { recursive: true })
      return (cachedBackupDir = custom)
    } catch { /* 커스텀 폴더 접근 불가 → 기본값으로 폴백 */ }
  }
  const primary = join(app.getPath('documents'), '모아봄 백업')
  try {
    if (!existsSync(primary)) mkdirSync(primary, { recursive: true })
    return (cachedBackupDir = primary)
  } catch { /* Documents 불가 → userData 폴백 */ }
  const fb = join(app.getPath('userData'), 'backups')
  try { if (!existsSync(fb)) mkdirSync(fb, { recursive: true }) } catch { /* ignore */ }
  return (cachedBackupDir = fb)
}

/** 백업 폴더 변경. 쓰기 검증 → 기존 백업 이동(안전한 copy+삭제) → 설정 저장 + 캐시 무효화. */
export function setAutoBackupDir(newPath: string): { success: boolean; error?: string } {
  if (!newPath) return { success: false, error: 'empty' }
  // 쓰기 가능 검증
  try {
    if (!existsSync(newPath)) mkdirSync(newPath, { recursive: true })
    const probe = join(newPath, '.moabom-write-test')
    writeFileSync(probe, 'ok')
    unlinkSync(probe)
  } catch { return { success: false, error: 'not-writable' } }

  const oldDir = getAutoBackupDir()
  if (resolve(oldDir).toLowerCase() === resolve(newPath).toLowerCase()) {
    writeCustomBackupDir(newPath) // 경로만 정규화 저장
    cachedBackupDir = null
    return { success: true }
  }

  // 기존 백업 파일 이동 (copy 후 삭제 → 실패해도 원본은 남아 유실 없음)
  try {
    for (const b of listAutoBackups()) {
      try {
        copyFileSync(b.path, join(newPath, b.name))
        try { unlinkSync(b.path) } catch { /* 원본 삭제 실패는 무시(중복만 남음) */ }
      } catch { /* 개별 파일 이동 실패 무시 */ }
    }
  } catch { /* ignore */ }

  writeCustomBackupDir(newPath)
  cachedBackupDir = null // 다음 getAutoBackupDir가 새 경로 반환
  return { success: true }
}

const pad = (n: number): string => String(n).padStart(2, '0')
function todayStamp(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function autoBackupName(d = new Date()): string {
  return `${AUTO_BACKUP_PREFIX}${todayStamp(d)}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.db`
}
function backupDay(name: string): string {
  return name.slice(AUTO_BACKUP_PREFIX.length, AUTO_BACKUP_PREFIX.length + 10) // YYYY-MM-DD
}

/** 데이터 변경 감지용 지문 (최신 updated_at + 개수). 바뀌면 백업 필요. */
function dataFingerprint(): string {
  try {
    const r = queryOne(`SELECT
      (SELECT COALESCE(MAX(updated_at),'') FROM items)  AS mi,
      (SELECT COALESCE(MAX(updated_at),'') FROM quotes) AS mq,
      (SELECT COUNT(*) FROM items)  AS ci,
      (SELECT COUNT(*) FROM quotes) AS cq`) as Record<string, unknown>
    return `${r?.mi ?? ''}|${r?.mq ?? ''}|${r?.ci ?? ''}|${r?.cq ?? ''}`
  } catch { return String(Date.now()) } // 실패 시 항상 다르게 → 백업 진행
}

export function listAutoBackups(): AutoBackupInfo[] {
  const dir = getAutoBackupDir()
  let files: string[] = []
  try { files = readdirSync(dir) } catch { return [] }
  return files
    .filter((f) => AUTO_BACKUP_RE.test(f))
    .map((f): AutoBackupInfo | null => {
      const full = join(dir, f)
      try {
        const st = statSync(full)
        return { name: f, path: full, size: st.size, mtime: st.mtimeMs }
      } catch { return null } // 삭제/잠김/권한오류 파일은 목록에서 제외
    })
    .filter((x): x is AutoBackupInfo => x !== null)
    .sort((a, b) => b.name.localeCompare(a.name)) // 파일명(=시간) 최신순
}

/** 회전: 14일 지난 것 삭제 + 지난 날짜는 하루 1개만 유지(오늘은 전부 보존) */
function pruneAutoBackups(): void {
  const cutoff = todayStamp(new Date(Date.now() - AUTO_BACKUP_KEEP_DAYS * 86400000))
  const today = todayStamp()
  const keptDays = new Set<string>()
  for (const b of listAutoBackups()) { // 최신순
    const day = backupDay(b.name)
    let del = false
    if (day < cutoff) del = true          // 14일 초과 → 삭제
    else if (day === today) del = false   // 오늘 → 전부 보존
    else if (keptDays.has(day)) del = true // 지난 날짜 2개째부터 삭제
    else keptDays.add(day)                // 지난 날짜 최신 1개 보존
    if (del) { try { unlinkSync(b.path) } catch { /* EBUSY 등 무시 */ } }
  }
}

/** 자동 백업 실행. force=false면 지문이 이전과 같을 때(변경 없음) skip. */
export function runAutoBackup(force = false): { success: boolean; path?: string; skipped?: boolean } {
  try {
    const fp = dataFingerprint()
    if (!force && fp === (getSetting('last_auto_backup_fp') || '')) {
      return { success: true, skipped: true } // 변경 없음
    }
    const dir = getAutoBackupDir()
    const bytes = Buffer.from(db.export())
    if (bytes.length === 0) return { success: false }
    const dest = join(dir, autoBackupName())
    const tmp = dest + '.tmp'
    writeFileSync(tmp, bytes)
    renameSync(tmp, dest) // 원자적 확정 (부분 파일은 .tmp라 회전 대상 아님)
    setSetting('last_auto_backup_at', new Date().toISOString())
    setSetting('last_auto_backup_fp', fp)
    try { pruneAutoBackups() } catch { /* 회전 실패는 백업 성공에 영향 없음 (파일은 이미 확정됨) */ }
    return { success: true, path: dest }
  } catch { return { success: false } }
}

// ── orphan 복구 (계정 없이 열람 / 다른 스코프 데이터 불러오기) ────────
export interface OtherScopeInfo { loggedIn: boolean; anon: number; otherAccount: number }
const scopeNum = (r?: Record<string, unknown>): number => Number((r?.n as number) ?? 0)

// 현재 계정에 같은 제목(정규화)+유형이 이미 있으면 제외 → 유령/자기 중복 차단
const COLLISION = `AND NOT EXISTS (SELECT 1 FROM items cur
  WHERE cur.user_id = :uid AND cur.is_deleted = 0
    AND LOWER(TRIM(cur.title)) = LOWER(TRIM(items.title)) AND cur.item_type = items.item_type)`

export function getOtherScopeInfo(): OtherScopeInfo {
  if (currentUserId) {
    // anon: 순수 로컬 + 로컬 고아(user_id NULL). otherAccount: 클라우드에 존재(server_id NOT NULL)하는 분만.
    const anon = scopeNum(queryOne(
      `SELECT COUNT(*) n FROM items WHERE is_deleted=0 AND user_id IS NULL ${COLLISION}`,
      { ':uid': currentUserId }))
    const other = scopeNum(queryOne(
      `SELECT COUNT(*) n FROM items WHERE is_deleted=0 AND user_id IS NOT NULL AND user_id != :uid AND server_id IS NOT NULL ${COLLISION}`,
      { ':uid': currentUserId }))
    return { loggedIn: true, anon, otherAccount: other }
  }
  const acct = scopeNum(queryOne("SELECT COUNT(*) n FROM items WHERE is_deleted=0 AND user_id IS NOT NULL"))
  return { loggedIn: false, anon: 0, otherAccount: acct }
}

/** 대상 후보 중 현재계정 기존항목과 충돌하지 않고, 배치 내 정규화 제목+유형 중복은 최소 id 1건만 남긴 id 목록. */
function pickImportIds(base: string): number[] {
  const rows = queryAll(
    `SELECT id, title, item_type FROM items WHERE ${base} ${COLLISION} ORDER BY id ASC`,
    { ':uid': currentUserId }
  )
  const seen = new Set<string>()
  const ids: number[] = []
  for (const r of rows) {
    const key = String(r.title ?? '').trim().toLowerCase() + '|' + String(r.item_type ?? '')
    if (seen.has(key)) continue // 배치 내 중복 제거
    seen.add(key)
    ids.push(r.id as number)
  }
  return ids
}

export function importOtherScopeItems(source: 'anon' | 'otherAccount'): { imported: number; skipped: number } {
  if (currentUserId) {
    const base = source === 'anon'
      ? 'is_deleted = 0 AND user_id IS NULL'                                                   // 순수 로컬 + 로컬 고아 재귀속
      : 'is_deleted = 0 AND user_id IS NOT NULL AND user_id != :uid AND server_id IS NOT NULL' // 클라우드 존재분만 복제(원본 유실 방지)
    const total = scopeNum(queryOne(`SELECT COUNT(*) n FROM items WHERE ${base}`, { ':uid': currentUserId }))
    const ids = pickImportIds(base)

    if (source === 'otherAccount') { // 도너 last_sync_at 리셋 → 재로그인 시 전체 pull로 원본 복원
      for (const d of queryAll(`SELECT DISTINCT user_id FROM items WHERE ${base}`, { ':uid': currentUserId })) {
        const uid = d.user_id as string
        if (uid) setSetting('last_sync_at_' + uid, '')
      }
    }

    if (ids.length > 0) {
      const inList = ids.join(',') // DB 정수 id → 인젝션 안전
      // anon·otherAccount 모두 새 항목처럼 재삽입(server_id NULL). 교차계정 server_id를 유지하면
      // pushDirtyItems의 update가 0행에 매치되며 오류 없이 markSynced 처리돼 영영 업로드가 안 되는
      // 문제가 생김. server_id를 비우면 삽입 경로를 타고, 클라우드 중복은 push의 제목/텍스트 dedup이 흡수.
      db.run(`UPDATE quotes SET server_id = NULL, is_dirty = 1, updated_at = datetime('now') WHERE item_id IN (${inList})`)
      db.run(`UPDATE items  SET user_id = :uid, server_id = NULL, is_dirty = 1, updated_at = datetime('now') WHERE id IN (${inList})`, { ':uid': currentUserId })
      save()
    }
    return { imported: ids.length, skipped: total - ids.length }
  }

  // 비로그인(열람 전용): 대상 계정 last_sync_at 리셋(재로그인 시 full pull로 user_id 백필) 후 user_id NULL flip
  const donors = queryAll("SELECT DISTINCT user_id FROM items WHERE is_deleted = 0 AND user_id IS NOT NULL")
  const total = scopeNum(queryOne("SELECT COUNT(*) n FROM items WHERE is_deleted=0 AND user_id IS NOT NULL"))
  for (const d of donors) { const uid = d.user_id as string; if (uid) setSetting('last_sync_at_' + uid, '') }
  db.run("UPDATE items SET user_id = NULL WHERE is_deleted = 0 AND user_id IS NOT NULL")
  save()
  return { imported: total, skipped: 0 }
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
  deleted_at: string | null
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
  deleted_at: string | null
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
    deleted_at: (row.deleted_at as string) || null,
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
    deleted_at: (row.deleted_at as string) || null,
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
  // 항상 소프트 삭제(휴지통). deleted_at 기록 → 15일 후 자동 영구삭제.
  // 클라우드 동기화 시 tombstone(is_deleted=true)으로 올려 다른 기기에도 삭제 전파.
  db.run(
    "UPDATE items SET is_deleted = 1, is_dirty = 1, deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = :id",
    { ':id': id }
  )
  db.run(
    "UPDATE quotes SET is_deleted = 1, is_dirty = 1, deleted_at = datetime('now'), updated_at = datetime('now') WHERE item_id = :id AND is_deleted = 0",
    { ':id': id }
  )
  save()
}

// ── 휴지통 ───────────────────────────────────────────────────────────

/** 휴지통(소프트 삭제) 아이템 목록 — 현재 계정 소유분만, 삭제일 최신순 */
export function getTrashedItems(): ItemRow[] {
  if (currentUserId) {
    return queryAll(
      'SELECT * FROM items WHERE is_deleted = 1 AND user_id = :uid ORDER BY deleted_at DESC',
      { ':uid': currentUserId }
    ).map(rowToItem)
  }
  return queryAll(
    'SELECT * FROM items WHERE is_deleted = 1 AND user_id IS NULL ORDER BY deleted_at DESC'
  ).map(rowToItem)
}

/** 휴지통에서 복원 (dirty 마킹 → 다음 동기화 시 클라우드도 복원) */
export function restoreItem(id: number): void {
  db.run(
    "UPDATE items SET is_deleted = 0, is_dirty = 1, deleted_at = NULL, updated_at = datetime('now') WHERE id = :id",
    { ':id': id }
  )
  db.run(
    "UPDATE quotes SET is_deleted = 0, is_dirty = 1, deleted_at = NULL, updated_at = datetime('now') WHERE item_id = :id AND is_deleted = 1",
    { ':id': id }
  )
  save()
}

/** 휴지통에서 즉시 영구삭제 (로컬 하드 삭제). 클라우드 삭제는 호출측에서 처리. */
export function purgeItem(id: number): void {
  db.run('DELETE FROM quotes WHERE item_id = :id', { ':id': id })
  db.run('DELETE FROM items WHERE id = :id', { ':id': id })
  save()
}

/** 만료된 휴지통 항목 로컬 영구삭제 (deleted_at이 days일 이전).
 *  onlyLocalOnly=true면 클라우드에 올라간 적 없는(server_id IS NULL) 항목만 — 시작 시 비로그인 정리용 */
export function purgeExpiredTrash(days = 15, onlyLocalOnly = false): void {
  const cutoff = `datetime('now', '-${days} days')`
  const cond = onlyLocalOnly ? 'AND server_id IS NULL' : ''
  // datetime(deleted_at): 로컬('YYYY-MM-DD HH:MM:SS')과 클라우드 pull(ISO+TZ) 포맷을 모두 UTC로 정규화
  db.run(
    `DELETE FROM quotes WHERE item_id IN (
       SELECT id FROM items WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND datetime(deleted_at) < ${cutoff} ${cond}
     )`
  )
  db.run(
    `DELETE FROM items WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND datetime(deleted_at) < ${cutoff} ${cond}`
  )
  // 개별 삭제된 명문장(부모는 살아있음)도 만료 시 정리
  if (!onlyLocalOnly) {
    db.run(`DELETE FROM quotes WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND datetime(deleted_at) < ${cutoff}`)
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
    db.run(
      "UPDATE quotes SET is_deleted = 1, is_dirty = 1, deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = :id",
      { ':id': id }
    )
  } else {
    db.run('DELETE FROM quotes WHERE id = :id', { ':id': id })
  }
  save()
}

// ── 동기화 헬퍼 함수 ─────────────────────────────────────────────────

/** 클라우드에 올려야 할 dirty 아이템 목록 (삭제 포함)
 *  현재 계정 소유 항목만 — 비로그인(user_id=NULL) 항목은 클라우드에 올리지 않음 */
export function getDirtyItems(): ItemRow[] {
  if (!currentUserId) return []
  return queryAll(
    'SELECT * FROM items WHERE is_dirty = 1 AND user_id = :uid',
    { ':uid': currentUserId }
  ).map(rowToItem)
}

/** 클라우드에 올려야 할 dirty 명문장 목록 (삭제 포함)
 *  현재 계정 소유 아이템에 속한 명문장만 (quotes에는 user_id가 없어 items와 조인) */
export function getDirtyQuotes(): QuoteRow[] {
  if (!currentUserId) return []
  return queryAll(
    `SELECT q.* FROM quotes q JOIN items i ON q.item_id = i.id
     WHERE q.is_dirty = 1 AND i.user_id = :uid`,
    { ':uid': currentUserId }
  ).map(rowToQuote)
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

/** server_id 없이 dirty만 해제 (클라우드에 올린 적 없는 휴지통 항목 정리용) */
export function clearItemDirty(localId: number): void {
  db.run('UPDATE items SET is_dirty = 0 WHERE id = :id', { ':id': localId })
  save()
}

export function clearQuoteDirty(localId: number): void {
  db.run('UPDATE quotes SET is_dirty = 0 WHERE id = :id', { ':id': localId })
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
  is_deleted?: boolean | null; deleted_at?: string | null
}): void {
  const cloudDeleted = cloudItem.is_deleted ? 1 : 0
  const cloudDeletedAt = cloudItem.deleted_at ?? null
  const existing = queryOne('SELECT id, updated_at FROM items WHERE server_id = :sid', { ':sid': cloudItem.id })
  if (existing) {
    // 소유자 백필: 구버전에서 동기화된 항목은 user_id가 NULL일 수 있어
    // 로그인 후 계정 필터(getAllItems)에 안 잡히는 문제 방지
    db.run('UPDATE items SET user_id = :uid WHERE server_id = :sid', { ':uid': cloudItem.user_id, ':sid': cloudItem.id })
    // 로컬이 더 최신이면 나머지 필드는 덮어쓰지 않음 (로컬 변경사항 보호)
    const localUpdated = existing.updated_at as string
    if (parseDateMs(localUpdated) >= parseDateMs(cloudItem.updated_at)) { save(); return }

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
        updated_at=:updated_at, is_dirty=0,
        is_deleted=:is_deleted, deleted_at=:deleted_at
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
        ':is_deleted': cloudDeleted, ':deleted_at': cloudDeletedAt,
      }
    )
  } else {
    // 이 기기가 가진 적 없는 항목이 이미 삭제됨 → 휴지통에 새로 만들 필요 없음
    if (cloudDeleted) { return }
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
  is_deleted?: boolean | null; deleted_at?: string | null
}): void {
  // cloud item_id(=server_id)로 로컬 item 찾기
  const localItem = queryOne('SELECT id FROM items WHERE server_id = :sid', { ':sid': cloudQuote.item_id })
  if (!localItem) return // 연결된 아이템이 없으면 skip

  const localItemId = localItem.id as number
  const updatedAt = cloudQuote.updated_at ?? cloudQuote.created_at
  const cloudDeleted = cloudQuote.is_deleted ? 1 : 0
  const cloudDeletedAt = cloudQuote.deleted_at ?? null
  const existing = queryOne('SELECT id, updated_at FROM quotes WHERE server_id = :sid', { ':sid': cloudQuote.id })

  if (existing) {
    const localUpdated = (existing.updated_at as string) || ''
    if (parseDateMs(localUpdated) >= parseDateMs(updatedAt)) return
    db.run(
      `UPDATE quotes SET text=:text, page_number=:pn, episode_number=:en, note=:note, updated_at=:ua, is_dirty=0,
        is_deleted=:del, deleted_at=:da WHERE server_id=:sid`,
      { ':text': cloudQuote.text, ':pn': cloudQuote.page_number ?? null,
        ':en': cloudQuote.episode_number ?? null,
        ':note': cloudQuote.note ?? null, ':ua': updatedAt, ':sid': cloudQuote.id,
        ':del': cloudDeleted, ':da': cloudDeletedAt }
    )
  } else {
    // 이 기기가 가진 적 없는 명문장이 이미 삭제됨 → 새로 만들 필요 없음
    if (cloudDeleted) { return }
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
