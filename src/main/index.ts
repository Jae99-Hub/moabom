import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import * as http from 'http'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { initDatabase, runAutoBackup } from './database'
import { registerIpcHandlers } from './ipc'

// ── 자동 로컬 백업 스케줄 ─────────────────────────────────────────
// 시작 5초 뒤 1회 + 30분마다. runAutoBackup(false)는 데이터가 바뀐 경우에만 기록.
let didQuitBackup = false
function setupAutoBackup(): void {
  setTimeout(() => { try { runAutoBackup(false) } catch { /* ignore */ } }, 5000)
  setInterval(() => { try { runAutoBackup(false) } catch { /* ignore */ } }, 30 * 60 * 1000)

  // 종료 직전 마지막 백업.
  // runAutoBackup은 동기 함수 → 핸들러가 리턴하면 백업이 끝난 뒤 종료가 이어진다.
  // preventDefault를 쓰지 않고(비동기 대기 없음) try/catch + 1회 가드 → 백업이 실패/지연돼도
  // 종료가 막히거나 무한 대기하지 않는다. 변경 없으면 지문 게이트로 즉시 skip.
  app.on('before-quit', () => {
    if (didQuitBackup) return
    didQuitBackup = true
    try { runAutoBackup(false) } catch { /* 백업 실패해도 정상 종료 */ }
  })
}

// ── 자동 업데이트 설정 ────────────────────────────────────────────
function setupAutoUpdater(win: BrowserWindow) {
  if (is.dev) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  // 차등(blockmap) 다운로드 비활성화 — GitHub 릴리스에서 범위 요청이 폭주하며
  // 다운로드가 멈추고 CPU 부하가 치솟는 문제가 있어 항상 전체 파일을 받는다.
  autoUpdater.disableDifferentialDownload = true

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
// redirectTo: 'http://localhost:3000'으로 OAuth 콜백을 받음.
// PKCE flow: ?code=...가 쿼리로 옴 → moabom://auth-callback?code=...로 전달
// Implicit flow(fallback): #access_token=...가 해시로 옴 → 해시째 전달
function startLocalAuthServer() {
  const HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f0f13;color:#e8e8e8;}</style>
</head><body>
<p>로그인 처리 중... 앱으로 돌아갑니다.</p>
<script>
var s = window.location.search;
var h = window.location.hash;
if (s && s.includes('code=')) {
  // PKCE: ?code=... → 쿼리 파라미터 그대로 전달
  window.location.href = 'moabom://auth-callback' + s;
  setTimeout(function(){ window.close(); }, 2000);
} else if (h && h.includes('access_token')) {
  // Implicit: #access_token=... → 해시는 커스텀 프로토콜에서 잘리므로 쿼리 파라미터로 변환
  window.location.href = 'moabom://auth-callback?' + h.slice(1);
  setTimeout(function(){ window.close(); }, 2000);
} else {
  document.querySelector('p').textContent = '인증 정보를 찾을 수 없습니다. 다시 시도해주세요.';
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

  try { await initDatabase() } catch (e) { console.error('[DB init 실패]', e) } // 최악에도 창은 띄운다
  registerIpcHandlers(ipcMain)
  setupAutoBackup()

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
