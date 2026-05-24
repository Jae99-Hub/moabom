import { IpcMain, dialog, BrowserWindow } from 'electron'
import { copyFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { app } from 'electron'
import {
  getAllItems, getItemById, insertItem, updateItem, deleteItem,
  getQuotesByItemId, searchQuotes, insertQuote, updateQuote, deleteQuote,
  getSetting, setSetting, reloadDatabase,
  getDirtyItems, getDirtyQuotes, markItemSynced, markQuoteSynced,
  hardDeleteItem, hardDeleteQuote, upsertItemFromCloud, upsertQuoteFromCloud,
  ItemRow, QuoteRow
} from './database'
import { searchTmdb } from './tmdb'
import { searchGoogleBooks } from './googlebooks'

const DEFAULT_TMDB_API_KEY = '2231c307ea12a6d255fca6d45014212b'

function getTmdbApiKey(): string {
  return getSetting('tmdb_api_key') || DEFAULT_TMDB_API_KEY
}

function getCoversDir(): string {
  const dir = join(app.getPath('userData'), 'covers')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
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
  ipcMain.handle('quotes:update', (_, id: number, data: Partial<Pick<QuoteRow, 'text' | 'page_number' | 'note'>>) => updateQuote(id, data))
  ipcMain.handle('quotes:delete', (_, id: number) => deleteQuote(id))

  ipcMain.handle('settings:get', (_, key: string) => getSetting(key))
  ipcMain.handle('settings:set', (_, key: string, value: string) => setSetting(key, value))

  ipcMain.handle('books:search', async (_, query: string) => {
    const apiKey = getSetting('google_books_api_key') || 'AIzaSyB2CqQVMkx89-S3xAAfG85Qk-LycoKNA0o'
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
    const name = `${fileName}_${Date.now()}${ext}`
    const filePath = join(coversDir, name)
    const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    writeFileSync(filePath, buffer)
    return filePath
  })

  ipcMain.handle('image:copyLocal', async (_, srcPath: string) => {
    const coversDir = getCoversDir()
    const ext = extname(srcPath) || '.jpg'
    const name = `cover_${Date.now()}${ext}`
    const destPath = join(coversDir, name)
    copyFileSync(srcPath, destPath)
    return destPath
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
    const dbPath = join(app.getPath('userData'), 'bookvault.db')
    copyFileSync(dbPath, result.filePath)
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
    const dbPath = join(app.getPath('userData'), 'bookvault.db')
    copyFileSync(result.filePaths[0], dbPath)
    await reloadDatabase() // 기존 DB 닫고 새 파일로 재오픈
    return { success: true }
  })

  // ── 동기화 핸들러 ──────────────────────────────────────────────────
  ipcMain.handle('sync:getDirtyItems', () => getDirtyItems())
  ipcMain.handle('sync:getDirtyQuotes', () => getDirtyQuotes())
  ipcMain.handle('sync:markItemSynced', (_, localId: number, serverId: number) =>
    markItemSynced(localId, serverId))
  ipcMain.handle('sync:markQuoteSynced', (_, localId: number, serverId: number) =>
    markQuoteSynced(localId, serverId))
  ipcMain.handle('sync:hardDeleteItem', (_, localId: number) => hardDeleteItem(localId))
  ipcMain.handle('sync:hardDeleteQuote', (_, localId: number) => hardDeleteQuote(localId))
  ipcMain.handle('sync:upsertItemFromCloud', (_, cloudItem: Parameters<typeof upsertItemFromCloud>[0]) =>
    upsertItemFromCloud(cloudItem))
  ipcMain.handle('sync:upsertQuoteFromCloud', (_, cloudQuote: Parameters<typeof upsertQuoteFromCloud>[0]) =>
    upsertQuoteFromCloud(cloudQuote))
  ipcMain.handle('sync:getLastSyncAt', () => getSetting('last_sync_at'))
  ipcMain.handle('sync:setLastSyncAt', (_, ts: string) => setSetting('last_sync_at', ts))
  ipcMain.handle('sync:getItemById', (_, id: number) => getItemById(id))
  ipcMain.handle('app:getVersion', () => app.getVersion())
}
