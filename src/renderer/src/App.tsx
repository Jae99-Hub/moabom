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

export default function App() {
  const { fetchAll, theme } = useStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    fetchAll()
  }, [])

  return (
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
    </div>
  )
}
