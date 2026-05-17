import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { setupWebApi } from './api/webApi'

const root = ReactDOM.createRoot(document.getElementById('root')!)

function LoadingScreen() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', gap: 16, background: 'var(--bg-primary, #0f0f0f)', color: 'var(--text-primary, #e8e8e8)'
    }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.6 }}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
      <p style={{ fontSize: 14, opacity: 0.6, margin: 0 }}>불러오는 중...</p>
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', gap: 12, background: 'var(--bg-primary, #0f0f0f)', color: 'var(--text-primary, #e8e8e8)'
    }}>
      <p style={{ fontSize: 14, color: '#f87171', margin: 0 }}>초기화 실패: {message}</p>
      <button
        onClick={() => window.location.reload()}
        style={{ padding: '8px 16px', borderRadius: 8, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}
      >
        다시 시도
      </button>
    </div>
  )
}

async function bootstrap() {
  root.render(<LoadingScreen />)

  try {
    await setupWebApi()
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  } catch (e) {
    console.error('웹 API 초기화 실패:', e)
    const msg = e instanceof Error ? e.message : String(e)
    root.render(<ErrorScreen message={msg} />)
  }
}

bootstrap()
