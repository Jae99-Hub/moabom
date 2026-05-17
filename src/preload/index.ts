import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  items: {
    getAll: () => ipcRenderer.invoke('items:getAll'),
    getById: (id: number) => ipcRenderer.invoke('items:getById', id),
    insert: (data: unknown) => ipcRenderer.invoke('items:insert', data),
    update: (id: number, data: unknown) => ipcRenderer.invoke('items:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('items:delete', id)
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
      ipcRenderer.invoke('image:saveCropped', base64Data, fileName),
    copyLocal: (srcPath: string) => ipcRenderer.invoke('image:copyLocal', srcPath)
  },
  db: {
    backup: () => ipcRenderer.invoke('db:backup'),
    restore: () => ipcRenderer.invoke('db:restore')
  }
}

// ── Google OAuth 브릿지 (Electron 전용) ───────────────────────────
const authBridge = {
  openExternal: (url: string) => ipcRenderer.invoke('auth:openExternal', url),
  onCallback: (callback: (url: string) => void) => {
    ipcRenderer.removeAllListeners('auth:callback')
    ipcRenderer.on('auth:callback', (_event, url: string) => callback(url))
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('authBridge', authBridge)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
  // @ts-ignore
  window.authBridge = authBridge
}
