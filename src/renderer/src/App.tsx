import React, { useEffect } from 'react'
import { useStore } from './store/useStore'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import FilterBar from './components/FilterBar'
import ItemGrid from './components/ItemGrid'
import DetailModal from './components/DetailModal'
import AddItemModal from './components/AddItemModal'
import QuotesModal from './components/QuotesModal'
import SettingsModal from './components/SettingsModal'
import SelectionBar from './components/SelectionBar'
import { ErrorBoundary } from './components/ErrorBoundary'
import UpdaterToast from './components/UpdaterToast'
import SyncConflictModal from './components/SyncConflictModal'
import StatsModal from './components/StatsModal'
import TrashModal from './components/TrashModal'
import OnboardingTour from './components/OnboardingTour'

export default function App() {
  const { fetchAll, theme, openTour } = useStore()

  // 테마는 변경될 때마다 즉시 반영
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // 앱 마운트 시 데이터 로드
  useEffect(() => {
    fetchAll()
  }, [])

  // 첫 실행 시 사용법 투어 자동 시작 (레이아웃 안정화 후)
  useEffect(() => {
    let done = true
    try { done = localStorage.getItem('onboarding_done') === '1' } catch { /* ignore */ }
    if (done) return
    const t = setTimeout(() => openTour(), 600)
    return () => clearTimeout(t)
  }, [])

  return (
    <ErrorBoundary>
      <div className="app">
        <Header />
        <div className="app-body">
          <Sidebar />
          <div className="content-wrapper">
            <div className="main-content">
              <FilterBar />
              <ItemGrid />
              <SelectionBar />
            </div>
          </div>
        </div>
        <DetailModal />
        <AddItemModal />
        <QuotesModal />
        <SettingsModal />
        <UpdaterToast />
        <SyncConflictModal />
        <StatsModal />
        <TrashModal />
        <OnboardingTour />
      </div>
    </ErrorBoundary>
  )
}
