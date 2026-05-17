import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { setupWebApi } from './api/webApi'

async function bootstrap() {
  try {
    await setupWebApi()
  } catch (e) {
    console.error('웹 API 초기화 실패:', e)
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

bootstrap()
