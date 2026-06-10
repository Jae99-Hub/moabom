import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import * as http from 'http'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { initDatabase } from './database'
import { registerIpcHandlers } from './ipc'

// ── 자동 업데이트 설정 ────────────────────────────────────────────
function setupAutoUpdater(win: BrowserWindow) {
  if (is.dev) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // 업데이트 있음 → 렌더러에 버전 알림 (다운로드 버튼은 렌더러가 표시)
  autoUpdater.on('update-available', (info) => {
    win.webContents.send('updater:available', info.version)
  })

  autoUpdater.on('update-not-available', () => {
    win.webContents.send('updater:not-available')
  })

  // 다운로드 진행률 → 렌더러로 전달
  autoUpdater.on('download-progress', (progress) => {
    win.webContents.send('updater:progress', Math.round(progress.percent))
  })

  // 다운로드 완료 → 렌더러에 알림 (재시작 버튼은 렌더러가 표시)
  autoUpdater.on('update-downloaded', () => {
    win.webContents.send('updater:downloaded')
  })

  autoUpdater.on('error', (err) => {
    console.error('업데이트 오류:', err)
    win.webContents.send('updater:error', err.message)
  })

  // 렌더러에서 업데이트 수동 확인 요청
  ipcMain.handle('updater:check', () => {
    autoUpdater.checkForUpdates()
  })

  // 렌더러에서 다운로드 시작 요청
  ipcMain.handle('updater:startDownload', () => {
    autoUpdater.downloadUpdate()
  })

  // 렌더러에서 설치 요청
  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall()
  })

  // 앱 시작 3초 후 업데이트 체크
  setTimeout(() => autoUpdater.checkForUpdates(), 3000)
}

// ── 로컬 OAuth 수신 서버 (localhost:3000) ─────────────────────────
// Supabase Site URL이 localhost:3000으로 설정되어 있어
// 외부 redirectTo가 whitelist에 없으면 여기로 리다이렉트됨.
// implicit flow이므로 토큰이 URL 해시(#access_token=...)로 옴.
// 브라우저는 해시를 서버에 보내지 않으므로,
// HTML 페이지에서 JS로 해시를 읽어 moabom:// 스킴으로 전달.
function startLocalAuthServer() {
  const HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f0f13;color:#e8e8e8;}</style>
</head><body>
<p>로그인 처리 중... 앱으로 돌아갑니다.</p>
<script>
var h = window.location.hash;
if (h && h.includes('access_token')) {
  window.location.href = 'moabom://auth-callback' + h;
  setTimeout(function(){ window.close(); }, 2000);
} else {
  document.querySelector('p').textContent = '토큰을 찾을 수 없습니다. 다시 시도해주세요.';
}
</script>
</body></html>`

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(HTML)
  })

  server.listen(3000, '127.0.0.1', () => {
    console.log('[auth] Local OAuth server listening on http://localhost:3000')
  })

  server.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code !== 'EADDRINUSE') console.error('[auth] Server error:', e)
    // EADDRINUSE: 다른 프로세스가 이미 사용 중 — 무시
  })

  return server
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
  const iconPath = process.platform === 'win32'
    ? join(process.resourcesPath, 'icon.ico')
    : undefined

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    icon: iconPath,
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

  // OAuth 콜백 수신 서버 시작 (production 전용)
  if (!is.dev) startLocalAuthServer()

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
