import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    authBridge?: {
      openExternal: (url: string) => Promise<void>
      onCallback: (callback: (url: string) => void) => void
      setCurrentUser: (userId: string | null) => Promise<void>
    }
    updaterBridge?: {
      onAvailable: (cb: (version: string) => void) => void
      onProgress: (cb: (pct: number) => void) => void
      onDownloaded: (cb: () => void) => void
      onNotAvailable: (cb: () => void) => void
      onError: (cb: (msg: string) => void) => void
      checkForUpdates: () => Promise<void>
      startDownload: () => Promise<void>
      install: () => Promise<void>
      getVersion: () => Promise<string>
    }
  }
}
