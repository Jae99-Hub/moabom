import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { isSupabaseConfigured, supabase } from './api/supabaseClient'
import { setupWebApi } from './api/webApi'
import AuthScreen from './components/AuthScreen'

const root = ReactDOM.createRoot(document.getElementById('root')!)

const renderApp = () => root.render(<React.StrictMode><App /></React.StrictMode>)
const renderAuth = () =>
  root.render(<AuthScreen onContinueAnonymous={renderApp} isElectron={true} />)

// ── 로컬 SQLite → Supabase 마이그레이션 ─────────────────────────
async function loginAndSwitch() {
  // 1. Supabase 전환 전에 로컬 데이터 스냅샷
  let localItems: Record<string, unknown>[] = []
  const localQuoteMap = new Map<number, Record<string, unknown>[]>()
  try {
    localItems = (await window.api.items.getAll()) as Record<string, unknown>[]
    for (const item of localItems) {
      const quotes = (await window.api.quotes.getByItemId(item.id as number)) as Record<string, unknown>[]
      if (quotes.length > 0) localQuoteMap.set(item.id as number, quotes)
    }
  } catch { /* IPC 실패 시 무시 */ }

  // 2. Supabase API로 전환
  await setupWebApi()

  // 3. Supabase가 비어있고 로컬 데이터가 있으면 이전 제안
  if (localItems.length === 0) return
  try {
    const supaItems = (await window.api.items.getAll()) as unknown[]
    if (supaItems.length > 0) return // 이미 Supabase에 데이터 있음

    const ok = window.confirm(
      `로컬에 저장된 작품 ${localItems.length}개를 클라우드에 업로드할까요?\n` +
      `(처음 로그인 시 한 번만 물어봅니다)`
    )
    if (!ok) return

    // 4. 아이템 이전 (old id → new Supabase id 매핑)
    const idMap = new Map<number, number>()
    for (const item of localItems) {
      try {
        const oldId = item.id as number
        const newItem = (await window.api.items.insert(item)) as Record<string, unknown>
        if (newItem?.id) idMap.set(oldId, newItem.id as number)
      } catch { /* 개별 실패 무시 */ }
    }

    // 5. 명언 이전
    for (const [oldItemId, quotes] of localQuoteMap.entries()) {
      const newItemId = idMap.get(oldItemId)
      if (!newItemId) continue
      for (const q of quotes) {
        try {
          await window.api.quotes.insert({ ...q, item_id: newItemId })
        } catch { /* 개별 실패 무시 */ }
      }
    }

    alert(`✓ ${idMap.size}개 작품을 클라우드에 업로드했습니다.`)
  } catch (e) {
    console.error('마이그레이션 실패:', e)
  }
}

async function bootstrap() {
  // Supabase 환경변수 없으면 그냥 로컬 SQLite로 실행
  if (!isSupabaseConfigured) {
    renderApp()
    return
  }

  // 저장된 세션 확인
  const { data: { session } } = await supabase.auth.getSession()

  if (session) {
    await loginAndSwitch()
    renderApp()
  } else {
    renderAuth()
  }

  // OAuth 콜백 처리 (main process → renderer)
  const authBridge = (window as unknown as { authBridge?: { onCallback: (cb: (url: string) => void) => void } }).authBridge
  authBridge?.onCallback(async (url: string) => {
    try {
      const fake = url.replace('moabom://', 'https://x/')
      const urlObj = new URL(fake)
      const params = new URLSearchParams(urlObj.hash.slice(1) || urlObj.search.slice(1))
      const access_token = params.get('access_token')
      const refresh_token = params.get('refresh_token')
      if (access_token && refresh_token) {
        const { data: { session } } = await supabase.auth.setSession({ access_token, refresh_token })
        if (session) {
          await loginAndSwitch()
          renderApp()
        }
      }
    } catch (e) {
      console.error('Auth callback 처리 실패:', e)
    }
  })

  // 인증 상태 변화 감지
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await loginAndSwitch()
      renderApp()
    } else if (event === 'SIGNED_OUT') {
      renderAuth()
    }
  })
}

bootstrap()
