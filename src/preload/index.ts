import { contextBridge, ipcRenderer } from 'electron'

const api = {
  items: {
    getAll: () => ipcRenderer.invoke('items:getAll'),
    getById: (id: number) => ipcRenderer.invoke('items:getById', id),
    insert: (data: unknown) => ipcRenderer.invoke('items:insert', data),
    update: (id: number, data: unknown) => ipcRenderer.invoke('items:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('items:delete', id),
    scopeInfo: () => ipcRenderer.invoke('items:scopeInfo'),
    importOtherScope: (source: 'anon' | 'otherAccount') => ipcRenderer.invoke('items:importOtherScope', source)
  },
  quotes: {
    getByItemId: (itemId: number) => ipcRenderer.invoke('quotes:getByItemId', itemId),
    search: (query: string) => ipcRenderer.invoke('quotes:search', query),
    insert: (data: unknown) => ipcRenderer.invoke('quotes:insert', data),
    update: (id: number, data: unknown) => ipcRenderer.invoke('quotes:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('quotes:delete', id)
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value)
  },
  books: {
    search: (query: string) => ipcRenderer.invoke('books:search', query)
  },
  tmdb: {
    search: (query: string) => ipcRenderer.invoke('tmdb:search', query)
  },
  image: {
    pick: () => ipcRenderer.invoke('image:pick'),
    saveCropped: (base64Data: string, fileName: string) =>
      ipcRenderer.invoke('image:saveCropped', base64Data, fileName)
  },
  db: {
    backup: () => ipcRenderer.invoke('db:backup'),
    restore: () => ipcRenderer.invoke('db:restore')
  },
  sync: {
    getDirtyItems: () => ipcRenderer.invoke('sync:getDirtyItems'),
    getDirtyQuotes: () => ipcRenderer.invoke('sync:getDirtyQuotes'),
    markItemSynced: (localId: number, serverId: number, seenUpdatedAt?: string) =>
      ipcRenderer.invoke('sync:markItemSynced', localId, serverId, seenUpdatedAt),
    markQuoteSynced: (localId: number, serverId: number, seenUpdatedAt?: string) =>
      ipcRenderer.invoke('sync:markQuoteSynced', localId, serverId, seenUpdatedAt),
    getCoverPushItems: () => ipcRenderer.invoke('sync:getCoverPushItems'),
    markCoverPushed: (localId: number) => ipcRenderer.invoke('sync:markCoverPushed', localId),
    upsertItemFromCloud: (cloudItem: unknown) =>
      ipcRenderer.invoke('sync:upsertItemFromCloud', cloudItem),
    upsertQuoteFromCloud: (cloudQuote: unknown) =>
      ipcRenderer.invoke('sync:upsertQuoteFromCloud', cloudQuote),
    upsertItemsFromCloud: (rows: unknown[]) => ipcRenderer.invoke('sync:upsertItemsFromCloud', rows),
    upsertQuotesFromCloud: (rows: unknown[]) => ipcRenderer.invoke('sync:upsertQuotesFromCloud', rows),
    getLastSyncAt: (userId?: string) => ipcRenderer.invoke('sync:getLastSyncAt', userId),
    setLastSyncAt: (ts: string, userId?: string) => ipcRenderer.invoke('sync:setLastSyncAt', ts, userId),
    clearItemDirty: (localId: number, seenUpdatedAt?: string) => ipcRenderer.invoke('sync:clearItemDirty', localId, seenUpdatedAt),
    clearQuoteDirty: (localId: number, seenUpdatedAt?: string) => ipcRenderer.invoke('sync:clearQuoteDirty', localId, seenUpdatedAt),
  },
  trash: {
    getAll: () => ipcRenderer.invoke('trash:getAll'),
    restore: (id: number) => ipcRenderer.invoke('trash:restore', id),
    purge: (id: number) => ipcRenderer.invoke('trash:purge', id),
    purgeExpired: (days: number) => ipcRenderer.invoke('trash:purgeExpired', days),
  },
  backup: {
    run: (force?: boolean) => ipcRenderer.invoke('backup:run', !!force),
    list: () => ipcRenderer.invoke('backup:list'),
    restoreFrom: (filePath: string) => ipcRenderer.invoke('backup:restoreFrom', filePath),
    openFolder: () => ipcRenderer.invoke('backup:openFolder'),
    status: () => ipcRenderer.invoke('backup:status'),
    chooseDir: () => ipcRenderer.invoke('backup:chooseDir'),
  }
}

// ── 자동 업데이트 브릿지 ──────────────────────────────────────────
// 리스너를 덮어쓰지 않고 추가 등록하며, 해제 함수를 돌려준다.
// (예전엔 removeAllListeners로 덮어써서 설정창이 열리면 업데이트 알림창이 진행률·완료 신호를 못 받았음)
function subscribe(channel: string, listener: (...args: unknown[]) => void): () => void {
  ipcRenderer.on(channel, listener)
  return () => { ipcRenderer.removeListener(channel, listener) }
}

const updaterBridge = {
  onAvailable: (cb: (version: string) => void) =>
    subscribe('updater:available', (_e, version) => cb(version as string)),
  onProgress: (cb: (pct: number) => void) =>
    subscribe('updater:progress', (_e, pct) => cb(pct as number)),
  onDownloaded: (cb: () => void) =>
    subscribe('updater:downloaded', () => cb()),
  onNotAvailable: (cb: () => void) =>
    subscribe('updater:not-available', () => cb()),
  onError: (cb: (msg: string) => void) =>
    subscribe('updater:error', (_e, msg) => cb(msg as string)),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  startDownload: () => ipcRenderer.invoke('updater:startDownload'),
  install: () => ipcRenderer.invoke('updater:install'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
}

// ── Google OAuth 브릿지 (Electron 전용) ───────────────────────────
const authBridge = {
  openExternal: (url: string) => ipcRenderer.invoke('auth:openExternal', url),
  onCallback: (callback: (url: string) => void) => {
    ipcRenderer.removeAllListeners('auth:callback')
    ipcRenderer.on('auth:callback', (_event, url: string) => callback(url))
  },
  setCurrentUser: (userId: string | null) => ipcRenderer.invoke('auth:setCurrentUser', userId),
}

// 화면에는 앱이 쓰는 기능만 연다 (예전엔 쓰지 않는 ipcRenderer 전체(window.electron)까지 열려 있었음)
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('authBridge', authBridge)
    contextBridge.exposeInMainWorld('updaterBridge', updaterBridge)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
  // @ts-ignore
  window.authBridge = authBridge
  // @ts-ignore
  window.updaterBridge = updaterBridge
}
