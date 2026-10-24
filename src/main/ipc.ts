import { IpcMain, dialog, BrowserWindow, shell, nativeImage } from 'electron'
import { copyFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, relative, isAbsolute } from 'path'
import { app } from 'electron'
import {
  getAllItems, getItemById, insertItem, updateItem, deleteItem,
  getQuotesByItemId, searchQuotes, insertQuote, updateQuote, deleteQuote,
  getSetting, setSetting,
  getDirtyItems, getDirtyQuotes, markItemSynced, markQuoteSynced,
  upsertItemFromCloud, upsertQuoteFromCloud,
  setCurrentUserId, getCurrentUserId,
  getTrashedItems, restoreItem, purgeItem, purgeExpiredTrash,
  clearItemDirty, clearQuoteDirty, getCoverPushItems, markCoverPushed,
  getDbPath, restoreFromFile, flushSave, inlineLocalCovers,
  runAutoBackup, listAutoBackups, getAutoBackupDir, setAutoBackupDir,
  getOtherScopeInfo, importOtherScopeItems,
  ItemRow, QuoteRow
} from './database'
import { searchTmdb } from './tmdb'
import { searchGoogleBooks } from './googlebooks'

// 검색 키는 코드에 두지 않고 빌드할 때 .env(MAIN_VITE_*)에서 넣는다 — 저장소가 공개라 코드에 있으면 누구나 볼 수 있음
const TMDB_API_KEY = import.meta.env.MAIN_VITE_TMDB_API_KEY ?? ''
const GOOGLE_BOOKS_API_KEY = import.meta.env.MAIN_VITE_GOOGLE_BOOKS_API_KEY ?? ''

function getTmdbApiKey(): string {
  return getSetting('tmdb_api_key') || TMDB_API_KEY
}

function getCoversDir(): string {
  const dir = join(app.getPath('userData'), 'covers')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** covers 폴더의 표지 파일 → 작게 줄인 JPEG data URL. 폴더 밖·없는 파일·읽기 실패는 null */
function coverFileToDataUrl(filePath: string): string | null {
  try {
    const rel = relative(getCoversDir(), filePath)
    if (!rel || rel.startsWith('..') || isAbsolute(rel) || !existsSync(filePath)) return null
    let img = nativeImage.createFromPath(filePath)
    if (img.isEmpty()) return null
    if (img.getSize().width > 480) img = img.resize({ width: 480, quality: 'good' })
    return 'data:image/jpeg;base64,' + img.toJPEG(85).toString('base64')
  } catch { return null }
}

/** 예전 버전에서 파일로 저장한 직접 넣은 표지를 DB 안으로 옮김 (시작 시 1회, 대상 없으면 즉시 끝) */
export function migrateCoverFiles(): void {
  try { inlineLocalCovers(coverFileToDataUrl) } catch (e) { console.error('[표지 이전 실패]', e) }
}

export function registerIpcHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('items:getAll', () => getAllItems())
  ipcMain.handle('items:getById', (_, id: number) => getItemById(id))
  ipcMain.handle('items:insert', (_, data: Omit<ItemRow, 'id' | 'created_at' | 'updated_at'>) => insertItem(data))
  ipcMain.handle('items:update', (_, id: number, data: Partial<ItemRow>) => updateItem(id, data))
  ipcMain.handle('items:delete', (_, id: number) => deleteItem(id))

  ipcMain.handle('quotes:getByItemId', (_, itemId: number) => getQuotesByItemId(itemId))
  ipcMain.handle('quotes:search', (_, query: string) => searchQuotes(query))
  ipcMain.handle('quotes:insert', (_, data: Omit<QuoteRow, 'id' | 'created_at'>) => insertQuote(data))
  ipcMain.handle('quotes:update', (_, id: number, data: Partial<Pick<QuoteRow, 'text' | 'page_number' | 'episode_number' | 'note'>>) => updateQuote(id, data))
  ipcMain.handle('quotes:delete', (_, id: number) => deleteQuote(id))

  ipcMain.handle('settings:get', (_, key: string) => getSetting(key))
  ipcMain.handle('settings:set', (_, key: string, value: string) => setSetting(key, value))

  ipcMain.handle('books:search', async (_, query: string) => {
    const apiKey = getSetting('google_books_api_key') || GOOGLE_BOOKS_API_KEY
    return searchGoogleBooks(query, apiKey)
  })

  ipcMain.handle('tmdb:search', async (_, query: string) => {
    return searchTmdb(query, getTmdbApiKey())
  })

  ipcMain.handle('image:pick', async () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: '이미지 선택',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('image:saveCropped', async (_, base64Data: string, fileName: string) => {
    const coversDir = getCoversDir()
    const ext = '.jpg'
    // 작품 제목을 파일명으로 쓰므로 Windows 금지 문자(\ / : * ? " < > |)·제어문자·끝의 점/공백을 제거
    // (예: "미션 임파서블: 폴아웃" → 저장 실패/깨진 표지 방지, 경로 이동도 차단)
    const safeBase = String(fileName || 'cover')
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
      .replace(/[. ]+$/g, '')
      .trim()
      .slice(0, 60) || 'cover'
    const name = `${safeBase}_${Date.now()}${ext}`
    const filePath = join(coversDir, name)
    const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    writeFileSync(filePath, buffer)
    return filePath
  })

  ipcMain.handle('db:backup', async () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (!win) return { success: false }
    const result = await dialog.showSaveDialog(win, {
      title: '데이터 백업',
      defaultPath: `BookVault-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'Database', extensions: ['db'] }]
    })
    if (result.canceled || !result.filePath) return { success: false }
    flushSave() // 아직 파일에 안 쓴 최근 변경까지 포함해서 복사
    copyFileSync(getDbPath(), result.filePath)
    return { success: true, path: result.filePath }
  })

  ipcMain.handle('db:restore', async () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (!win) return { success: false }
    const result = await dialog.showOpenDialog(win, {
      title: '데이터 복원',
      filters: [{ name: 'Database', extensions: ['db'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return { success: false }
    return await restoreFromFile(result.filePaths[0]) // 검증 후에만 교체 (실패 시 현재 데이터 유지)
  })

  // ── 동기화 핸들러 ──────────────────────────────────────────────────
  ipcMain.handle('sync:getDirtyItems', () => getDirtyItems())
  ipcMain.handle('sync:getDirtyQuotes', () => getDirtyQuotes())
  ipcMain.handle('sync:markItemSynced', (_, localId: number, serverId: number, seenUpdatedAt?: string) =>
    markItemSynced(localId, serverId, seenUpdatedAt))
  ipcMain.handle('sync:markQuoteSynced', (_, localId: number, serverId: number, seenUpdatedAt?: string) =>
    markQuoteSynced(localId, serverId, seenUpdatedAt))
  ipcMain.handle('sync:getCoverPushItems', () => getCoverPushItems())
  ipcMain.handle('sync:markCoverPushed', (_, localId: number) => markCoverPushed(localId))
  ipcMain.handle('sync:upsertItemFromCloud', (_, cloudItem: Parameters<typeof upsertItemFromCloud>[0]) =>
    upsertItemFromCloud(cloudItem))
  ipcMain.handle('sync:upsertQuoteFromCloud', (_, cloudQuote: Parameters<typeof upsertQuoteFromCloud>[0]) =>
    upsertQuoteFromCloud(cloudQuote))
  // 클라우드에서 받은 여러 행을 한 번의 호출로 반영 (행마다 IPC 왕복하지 않음)
  ipcMain.handle('sync:upsertItemsFromCloud', (_, rows: Parameters<typeof upsertItemFromCloud>[0][]) => {
    for (const row of rows ?? []) upsertItemFromCloud(row)
  })
  ipcMain.handle('sync:upsertQuotesFromCloud', (_, rows: Parameters<typeof upsertQuoteFromCloud>[0][]) => {
    for (const row of rows ?? []) upsertQuoteFromCloud(row)
  })
  // last_sync_at은 계정별로 분리 저장 (계정 전환 시 새 계정의 클라우드 데이터를 전부 pull)
  // userId를 받으면 그 계정 키로 읽고 씀 (동기화 도중 계정이 바뀌어도 다른 계정의 기준 시각을 건드리지 않게)
  ipcMain.handle('sync:getLastSyncAt', (_, userId?: string) =>
    getSetting('last_sync_at_' + (userId ?? getCurrentUserId() ?? 'anon')))
  ipcMain.handle('sync:setLastSyncAt', (_, ts: string, userId?: string) =>
    setSetting('last_sync_at_' + (userId ?? getCurrentUserId() ?? 'anon'), ts))
  ipcMain.handle('sync:clearItemDirty', (_, localId: number, seenUpdatedAt?: string) => clearItemDirty(localId, seenUpdatedAt))
  ipcMain.handle('sync:clearQuoteDirty', (_, localId: number, seenUpdatedAt?: string) => clearQuoteDirty(localId, seenUpdatedAt))
  ipcMain.handle('auth:setCurrentUser', (_, userId: string | null) => setCurrentUserId(userId))
  ipcMain.handle('app:getVersion', () => app.getVersion())

  // ── 휴지통 핸들러 ─────────────────────────────────────────────────
  ipcMain.handle('trash:getAll', () => getTrashedItems())
  ipcMain.handle('trash:restore', (_, id: number) => restoreItem(id))
  ipcMain.handle('trash:purge', (_, id: number) => purgeItem(id))
  ipcMain.handle('trash:purgeExpired', (_, days: number) => purgeExpiredTrash(days ?? 15, false))

  // ── 자동 백업 핸들러 ──────────────────────────────────────────────
  ipcMain.handle('backup:run', (_, force: boolean) => runAutoBackup(!!force))
  ipcMain.handle('backup:list', () => listAutoBackups())
  ipcMain.handle('backup:restoreFrom', async (_, filePath: string) => {
    // 백업 폴더 밖 경로 차단 (relative로 판정 → startsWith 우회 방지)
    const rel = relative(getAutoBackupDir(), filePath)
    if (rel.startsWith('..') || isAbsolute(rel)) return { success: false, error: 'out-of-dir' }
    return await restoreFromFile(filePath)
  })
  ipcMain.handle('backup:openFolder', async () => {
    try { await shell.openPath(getAutoBackupDir()); return { success: true } }
    catch { return { success: false } }
  })
  ipcMain.handle('backup:status', () => ({ lastAt: getSetting('last_auto_backup_at'), dir: getAutoBackupDir() }))
  ipcMain.handle('backup:chooseDir', async () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (!win) return { success: false }
    const r = await dialog.showOpenDialog(win, {
      title: '백업 폴더 선택',
      defaultPath: getAutoBackupDir(),
      properties: ['openDirectory', 'createDirectory']
    })
    if (r.canceled || !r.filePaths[0]) return { success: false, canceled: true }
    return setAutoBackupDir(r.filePaths[0])
  })

  // ── orphan 복구 핸들러 ────────────────────────────────────────────
  ipcMain.handle('items:scopeInfo', () => getOtherScopeInfo())
  ipcMain.handle('items:importOtherScope', (_, source: 'anon' | 'otherAccount') => importOtherScopeItems(source))
}
