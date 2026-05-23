import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { initDatabase } from './database'
import { registerIpcHandlers } from './ipc'

// ── 자동 업데이트 설정 ────────────────────────────────────────────
function setupAutoUpdater(win: BrowserWindow) {
  if (is.dev) return // 개발 중엔 업데이트 체크 안 함

  autoUpdater.autoDownload = false // 사용자 확인 후 다운로드
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(win, {
      type: 'info',
      title: '업데이트 가능',
      message: `새 버전이 있습니다 (v${info.version})\n지금 다운로드할까요?`,
      buttons: ['다운로드', '나중에'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate()
        win.webContents.send('updater:downloading')
      }
    })
  })

  autoUpdater.on('update-not-available', () => {
    // 조용히 무시
  })

  autoUpdater.on('download-progress', (progress) => {
    win.webContents.send('updater:progress', Math.round(progress.percent))
  })

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(win, {
      type: 'info',
      title: '업데이트 준비 완료',
      message: '다운로드가 완료됐습니다.\n지금 재시작해서 업데이트를 적용할까요?',
      buttons: ['재시작', '나중에'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    console.error('업데이트 오류:', err)
  })

  // 앱 시작 3초 후 업데이트 체크
  setTimeout(() => autoUpdater.checkForUpdates(), 3000)
}

// ── Custom protocol (moabom://) for Google OAuth callback ─────────
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('moabom', process.execPath, [process.argv[1]])
  }
} else {
  app.setAsDefaultProtocolClient('moabom')
}

let mainWindow: BrowserWindow | null = null

function handleAuthUrl(url: string) {
  if (mainWindow && url.startsWith('moabom://')) {
    mainWindow.webContents.send('auth:callback', url)
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
}

// ── Single instance lock (Windows: 프로토콜 리다이렉트 처리) ──────
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    const url = commandLine.find((arg) => arg.startsWith('moabom://'))
    if (url) handleAuthUrl(url)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.moabom.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Mac: 프로토콜 URL 처리
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleAuthUrl(url)
  })

  // IPC: 시스템 브라우저로 OAuth URL 열기
  ipcMain.handle('auth:openExternal', async (_event, url: string) => {
    await shell.openExternal(url)
  })

  await initDatabase()
  registerIpcHandlers(ipcMain)

  createWindow()
  if (mainWindow) setupAutoUpdater(mainWindow)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
