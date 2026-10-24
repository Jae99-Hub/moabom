import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// 실제 database.ts를 sql.js로 돌린다. Electron 부분만 가짜로 바꿈 (데이터 폴더 = 테스트마다 새 임시 폴더)
const env = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({ app: { getPath: () => env.dir } }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))

type DbModule = typeof import('./database')
let db: DbModule

const UID = 'user-a'
const OTHER = 'user-b'

function sql(query: string, params: Record<string, unknown> = {}): Record<string, unknown>[] {
  const raw = db.__dbForTests()
  const stmt = raw.prepare(query)
  stmt.bind(params as never)
  const rows: Record<string, unknown>[] = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

function newItem(title: string, extra: Partial<Parameters<DbModule['insertItem']>[0]> = {}) {
  return db.insertItem({
    title, original_title: null, item_type: 'book', cover_path: null, backdrop_path: null,
    author: null, publisher: null, isbn: null, page_count: null, current_page: 0,
    director: null, platform: null, tmdb_id: null, google_books_id: null, genre: null,
    year: null, overview: null, rating: null, status: 'want', review: null, read_date: null,
    deleted_at: null, ...extra,
  } as Parameters<DbModule['insertItem']>[0])
}

function cloudItem(id: number, extra: Record<string, unknown> = {}) {
  return {
    id, user_id: UID, title: `cloud ${id}`, item_type: 'book', status: 'want',
    created_at: '2026-10-01T00:00:00.000000+00:00', updated_at: '2026-10-01T00:00:00.000000+00:00',
    ...extra,
  } as Parameters<DbModule['upsertItemFromCloud']>[0]
}

beforeEach(async () => {
  env.dir = mkdtempSync(join(tmpdir(), 'moabom-test-'))
  vi.resetModules()
  db = await import('./database')
  await db.initDatabase()
})

afterEach(() => {
  db.flushSave()
  rmSync(env.dir, { recursive: true, force: true })
})

describe('동기화 표시(dirty)', () => {
  it('올리는 사이 다시 고쳐진 항목은 dirty가 남는다', () => {
    db.setCurrentUserId(UID)
    const item = newItem('데미안')
    sql("UPDATE items SET updated_at = '2026-01-01 00:00:00.000'") // 같은 1ms 안에 수정돼 시각이 같아지는 일 방지
    const seen = db.getDirtyItems()[0].updated_at
    db.updateItem(item.id, { rating: 5 }) // 올리는 도중의 수정
    db.markItemSynced(item.id, 101, seen)
    expect(db.getDirtyItems().map((i) => i.id)).toContain(item.id)
  })

  it('그대로면 dirty가 지워진다', () => {
    db.setCurrentUserId(UID)
    const item = newItem('데미안')
    db.markItemSynced(item.id, 101, db.getDirtyItems()[0].updated_at)
    expect(db.getDirtyItems()).toHaveLength(0)
  })

  it('클라우드 id가 바뀌면 명대사도 다시 올리도록 표시', () => {
    db.setCurrentUserId(UID)
    const item = newItem('데미안')
    const q = db.insertQuote({ item_id: item.id, text: '새는 알에서', page_number: 1, episode_number: null, note: null, deleted_at: null } as never)
    db.markItemSynced(item.id, 101)
    db.markQuoteSynced(q.id, 501)
    db.markItemSynced(item.id, 202) // 클라우드에서 지워져 새로 올림
    expect(sql('SELECT server_id, is_dirty FROM quotes WHERE id = :id', { ':id': q.id })[0]).toEqual({ server_id: null, is_dirty: 1 })
  })

  it('수정하면 dirty·updated_at이 바뀌고 모르는 칸은 무시', () => {
    db.setCurrentUserId(UID)
    const item = newItem('데미안')
    db.markItemSynced(item.id, 101)
    const before = sql('SELECT updated_at FROM items WHERE id = :id', { ':id': item.id })[0].updated_at
    db.updateItem(item.id, { review: '좋았다', hacked: 1 } as never)
    const after = sql('SELECT updated_at, is_dirty, review FROM items WHERE id = :id', { ':id': item.id })[0]
    expect(after.is_dirty).toBe(1)
    expect(after.review).toBe('좋았다')
    expect(String(after.updated_at) >= String(before)).toBe(true)
  })
})

describe('클라우드에서 받기', () => {
  it('올리지 않은 로컬 수정이 있으면 덮어쓰지 않는다', () => {
    db.setCurrentUserId(UID)
    db.upsertItemFromCloud(cloudItem(101, { title: '원래' }))
    const local = sql('SELECT id FROM items WHERE server_id = 101')[0].id as number
    db.updateItem(local, { title: '로컬 수정' })
    db.upsertItemFromCloud(cloudItem(101, { title: '클라우드 수정', updated_at: '2099-01-01T00:00:00+00:00' }))
    expect(sql('SELECT title FROM items WHERE id = :id', { ':id': local })[0].title).toBe('로컬 수정')
  })

  it('깨끗한 로컬보다 새 클라우드 값은 반영되고 시각은 로컬 형식으로 저장', () => {
    db.setCurrentUserId(UID)
    db.upsertItemFromCloud(cloudItem(101, { title: '원래' }))
    db.upsertItemFromCloud(cloudItem(101, { title: '새 제목', updated_at: '2026-10-02T09:30:00.123456+09:00' }))
    const row = sql('SELECT title, updated_at FROM items WHERE server_id = 101')[0]
    expect(row.title).toBe('새 제목')
    expect(row.updated_at).toBe('2026-10-02 00:30:00.123')
  })

  it('이 기기에 없던 삭제 항목은 만들지 않고, 있던 항목은 휴지통으로', () => {
    db.setCurrentUserId(UID)
    db.upsertItemFromCloud(cloudItem(101, { is_deleted: true, deleted_at: '2026-10-03T00:00:00+00:00' }))
    expect(sql('SELECT COUNT(*) n FROM items')[0].n).toBe(0)
    db.upsertItemFromCloud(cloudItem(102))
    db.upsertItemFromCloud(cloudItem(102, { is_deleted: true, deleted_at: '2026-10-03T00:00:00+00:00', updated_at: '2026-10-03T00:00:00+00:00' }))
    expect(sql('SELECT is_deleted FROM items WHERE server_id = 102')[0].is_deleted).toBe(1)
  })

  it('명대사는 부모 항목에 연결되고, 부모가 없으면 건너뜀', () => {
    db.setCurrentUserId(UID)
    db.upsertItemFromCloud(cloudItem(101))
    db.upsertQuoteFromCloud({ id: 501, item_id: 101, user_id: UID, text: '문장', created_at: '2026-10-01T00:00:00+00:00' })
    db.upsertQuoteFromCloud({ id: 502, item_id: 999, user_id: UID, text: '고아', created_at: '2026-10-01T00:00:00+00:00' })
    const quotes = sql('SELECT q.text, i.server_id FROM quotes q JOIN items i ON q.item_id = i.id')
    expect(quotes).toEqual([{ text: '문장', server_id: 101 }])
  })
})

describe('휴지통', () => {
  it('함께 휴지통에 들어간 명대사만 복원되고, 먼저 따로 지운 명대사는 그대로', () => {
    db.setCurrentUserId(UID)
    const item = newItem('데미안')
    const keep = db.insertQuote({ item_id: item.id, text: '남길 문장', page_number: 1, episode_number: null, note: null, deleted_at: null } as never)
    const gone = db.insertQuote({ item_id: item.id, text: '지운 문장', page_number: 2, episode_number: null, note: null, deleted_at: null } as never)
    db.markQuoteSynced(gone.id, 502) // 클라우드에 있던 명대사라 소프트 삭제됨
    db.deleteQuote(gone.id)
    sql("UPDATE quotes SET deleted_at = '2026-10-01 00:00:00' WHERE id = :id", { ':id': gone.id })
    db.deleteItem(item.id)
    db.restoreItem(item.id)
    expect(db.getQuotesByItemId(item.id).map((q) => q.id)).toEqual([keep.id])
  })

  it('15일 지난 휴지통만 영구삭제, 비로그인 정리는 클라우드에 올라간 것은 남김', () => {
    const old = newItem('오래된')
    const recent = newItem('최근')
    const synced = newItem('올라간')
    db.markItemSynced(synced.id, 103)
    for (const it of [old, recent, synced]) db.deleteItem(it.id)
    sql("UPDATE items SET deleted_at = datetime('now', '-16 days') WHERE id IN (:a, :c)", { ':a': old.id, ':c': synced.id })
    sql("UPDATE items SET deleted_at = datetime('now', '-14 days') WHERE id = :b", { ':b': recent.id })
    db.purgeExpiredTrash(15, true)
    const left = sql('SELECT title FROM items ORDER BY title').map((r) => r.title)
    expect(left).toEqual(['올라간', '최근'])
  })

  it('휴지통에 없는(살아 있는) 항목은 영구삭제되지 않는다', () => {
    const item = newItem('데미안')
    db.deleteItem(item.id)
    db.restoreItem(item.id) // 되돌리기 — 열려 있던 휴지통 목록에는 아직 남아 있을 수 있음
    expect(db.purgeItem(item.id)).toBe(false)
    expect(db.getAllItems().map((i) => i.title)).toEqual(['데미안'])
    db.deleteItem(item.id)
    expect(db.purgeItem(item.id)).toBe(true)
    expect(sql('SELECT COUNT(*) n FROM items')[0].n).toBe(0)
  })

  it('동기화 후 정리는 지금 계정의, 삭제를 이미 올린 휴지통만', () => {
    db.setCurrentUserId(OTHER)
    const others = newItem('남의 것')
    db.setCurrentUserId(UID)
    const pushed = newItem('올린 삭제')
    const pending = newItem('못 올린 삭제')
    for (const it of [others, pushed, pending]) db.deleteItem(it.id)
    db.clearItemDirty(pushed.id)
    db.clearItemDirty(others.id)
    sql("UPDATE items SET deleted_at = datetime('now', '-20 days')")
    db.purgeExpiredTrash(15, false)
    expect(sql('SELECT title FROM items ORDER BY title').map((r) => r.title)).toEqual(['남의 것', '못 올린 삭제'])
  })

  it('로그인 중 명대사 삭제는 표시만 남기고, 비로그인은 바로 지움', () => {
    db.setCurrentUserId(UID)
    const item = newItem('데미안')
    const q = db.insertQuote({ item_id: item.id, text: '문장', page_number: null, episode_number: null, note: null, deleted_at: null } as never)
    db.deleteQuote(q.id)
    expect(sql('SELECT is_deleted, is_dirty FROM quotes WHERE id = :id', { ':id': q.id })[0]).toEqual({ is_deleted: 1, is_dirty: 1 })
    db.setCurrentUserId(null)
    const anon = newItem('비로그인')
    const aq = db.insertQuote({ item_id: anon.id, text: '문장', page_number: null, episode_number: null, note: null, deleted_at: null } as never)
    db.deleteQuote(aq.id)
    expect(sql('SELECT COUNT(*) n FROM quotes WHERE id = :id', { ':id': aq.id })[0].n).toBe(0)
  })
})

describe('계정 분리', () => {
  it('로그인 계정과 비로그인 기록이 서로 보이지 않는다', () => {
    db.setCurrentUserId(null)
    const anon = newItem('비로그인 책')
    db.insertQuote({ item_id: anon.id, text: '비로그인 문장', page_number: null, episode_number: null, note: null, deleted_at: null } as never)
    db.setCurrentUserId(UID)
    const mine = newItem('내 책')
    db.setCurrentUserId(OTHER)
    newItem('남의 책')

    db.setCurrentUserId(UID)
    expect(db.getAllItems().map((i) => i.title)).toEqual(['내 책'])
    expect(db.searchQuotes('문장')).toHaveLength(0)
    expect(db.getDirtyItems().map((i) => i.id)).toEqual([mine.id])
    db.setCurrentUserId(null)
    expect(db.getAllItems().map((i) => i.title)).toEqual(['비로그인 책'])
    expect(db.getDirtyItems()).toHaveLength(0) // 비로그인 기록은 올리지 않음
  })

  it('비로그인 기록 불러오기: 같은 제목은 건너뛰고 배치 안 중복은 하나만', () => {
    db.setCurrentUserId(null)
    newItem('데미안')
    newItem('데미안 ')
    newItem('새 책')
    db.setCurrentUserId(UID)
    newItem('새 책')
    const r = db.importOtherScopeItems('anon')
    expect(r).toEqual({ imported: 1, skipped: 2 })
    expect(db.getAllItems().map((i) => i.title).sort()).toEqual(['데미안', '새 책'])
  })
})

describe('파일·복구', () => {
  it('엉터리 파일로 복원하면 거절하고 지금 데이터는 그대로', async () => {
    newItem('지킬 책')
    const bad = join(env.dir, 'bad.db')
    writeFileSync(bad, 'not a database at all')
    const r = await db.restoreFromFile(bad)
    expect(r.success).toBe(false)
    expect(db.getAllItems().map((i) => i.title)).toEqual(['지킬 책'])
  })

  it('백업으로 되돌리면: 되돌리기 전 기록을 자동 백업으로 남기고, 되돌린 내용은 다시 올릴 것으로 표시', async () => {
    db.setCurrentUserId(UID)
    const item = newItem('예전 책')
    db.markItemSynced(item.id, 101)
    db.flushSave()
    const backup = join(env.dir, 'old.db')
    writeFileSync(backup, readFileSync(db.getDbPath()))
    db.updateItem(item.id, { title: '바뀐 책' })
    db.markItemSynced(item.id, 101)
    const before = db.listAutoBackups().length

    expect((await db.restoreFromFile(backup)).success).toBe(true)
    expect(db.getAllItems().map((i) => [i.title, i.is_dirty])).toEqual([['예전 책', 1]])
    expect(db.listAutoBackups().length).toBe(before + 1)
  })

  it('되돌린 다른 계정 기록은 올릴 것으로 표시하지 않음 (나중에 로그인해도 클라우드 최신본을 덮지 않게)', async () => {
    db.setCurrentUserId(OTHER)
    const other = newItem('남의 책')
    db.setCurrentUserId(UID)
    newItem('내 책')
    db.flushSave()
    const backup = join(env.dir, 'old.db')
    writeFileSync(backup, readFileSync(db.getDbPath()))

    db.setCurrentUserId(null) // 로그아웃한 채 되돌리면 어느 계정도 표시하지 않음
    expect((await db.restoreFromFile(backup)).success).toBe(true)
    expect(sql('SELECT COUNT(*) n FROM items WHERE is_dirty = 1')[0].n).toBe(0)

    db.setCurrentUserId(UID)
    expect((await db.restoreFromFile(backup)).success).toBe(true)
    expect(db.getDirtyItems().map((i) => i.title)).toEqual(['내 책'])
    expect(sql('SELECT is_dirty FROM items WHERE id = :id', { ':id': other.id })[0].is_dirty).toBe(0)
  })

  it('DB 파일이 손상돼 있으면 최신 자동 백업으로 복구하고 원본은 따로 보관', async () => {
    newItem('백업된 책')
    db.runAutoBackup(true)
    db.flushSave()
    const dbFile = db.getDbPath()
    writeFileSync(dbFile, Buffer.alloc(4096, 7)) // 망가진 파일
    vi.resetModules()
    db = await import('./database')
    await db.initDatabase()
    expect(db.getAllItems().map((i) => i.title)).toEqual(['백업된 책'])
    expect(readdirSync(env.dir).some((f) => f.startsWith('bookvault.db.corrupt-'))).toBe(true)
  })

  it('같은 초에 두 번 백업해도 앞의 백업을 덮어쓰지 않음', () => {
    newItem('책')
    const a = db.runAutoBackup(true)
    const b = db.runAutoBackup(true)
    expect(a.path).not.toBe(b.path)
    expect(db.listAutoBackups()).toHaveLength(2)
  })

  it('바뀐 게 없으면 자동 백업을 건너뜀', () => {
    newItem('책')
    expect(db.runAutoBackup(false).skipped).toBeFalsy()
    expect(db.runAutoBackup(false).skipped).toBe(true)
  })

  it('종료 시 저장(flush) 후 다시 열면 그대로', async () => {
    newItem('저장될 책')
    db.flushSave()
    expect(existsSync(db.getDbPath())).toBe(true)
    vi.resetModules()
    db = await import('./database')
    await db.initDatabase()
    expect(db.getAllItems().map((i) => i.title)).toEqual(['저장될 책'])
  })
})
