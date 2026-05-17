import React from 'react'

interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', gap: 16,
          color: 'var(--text-secondary)', background: 'var(--bg-primary)'
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>오류가 발생했습니다</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, maxWidth: 320, textAlign: 'center' }}>
            {this.state.error?.message ?? '알 수 없는 오류'}
          </p>
          <button
            style={{
              padding: '8px 20px', borderRadius: 8, background: 'var(--accent)',
              color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13
            }}
            onClick={() => window.location.reload()}
          >
            새로고침
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
