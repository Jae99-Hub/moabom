import { create } from 'zustand'
import { Item, ItemType, StatusType, AppSettings } from '../types'
import * as storage from '../api/storage'

type FilterType = ItemType | 'all'
type FilterStatus = StatusType | 'all'

interface Store {
  // Data
  items: Item[]
  settings: AppSettings

  // Filters
  filterType: FilterType
  filterStatus: FilterStatus
  searchQuery: string

  // UI
  isLoading: boolean

  // Actions
  fetchAll: () => Promise<void>
  addItem: (item: Omit<Item, 'id' | 'created_at' | 'updated_at'>) => Promise<Item>
  updateItem: (id: number, updates: Partial<Item>) => Promise<void>
  deleteItem: (id: number) => Promise<void>
  setFilterType: (type: FilterType) => void
  setFilterStatus: (status: FilterStatus) => void
  setSearchQuery: (q: string) => void
  saveSettings: (s: Partial<AppSettings>) => Promise<void>

  // Computed
  filteredItems: () => Item[]
}

export const useStore = create<Store>((set, get) => ({
  items: [],
  settings: { theme: 'system' },
  filterType: 'all',
  filterStatus: 'all',
  searchQuery: '',
  isLoading: false,

  fetchAll: async () => {
    set({ isLoading: true })
    const [items, settings] = await Promise.all([
      storage.getItems(),
      storage.getSettings(),
    ])
    set({ items, settings, isLoading: false })
  },

  addItem: async (itemData) => {
    const newItem = await storage.saveItem(itemData)
    set(s => ({ items: [newItem, ...s.items] }))
    return newItem
  },

  updateItem: async (id, updates) => {
    const updated = await storage.updateItem(id, updates)
    set(s => ({ items: s.items.map(i => i.id === id ? updated : i) }))
  },

  deleteItem: async (id) => {
    await storage.deleteItem(id)
    set(s => ({ items: s.items.filter(i => i.id !== id) }))
  },

  setFilterType: (filterType) => set({ filterType, filterStatus: 'all', searchQuery: '' }),
  setFilterStatus: (filterStatus) => set({ filterStatus }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  saveSettings: async (updates) => {
    await storage.saveSettings(updates)
    set(s => ({ settings: { ...s.settings, ...updates } }))
  },

  filteredItems: () => {
    const { items, filterType, filterStatus, searchQuery } = get()
    return items.filter(item => {
      if (filterType !== 'all' && item.item_type !== filterType) return false
      if (filterStatus !== 'all' && item.status !== filterStatus) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          item.title.toLowerCase().includes(q) ||
          item.author?.toLowerCase().includes(q) ||
          item.genre?.toLowerCase().includes(q)
        )
      }
      return true
    })
  },
}))
