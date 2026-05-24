import React from 'react'
import { create } from 'zustand'
import { Item, ItemFormData, FilterState, Quote, QuoteSearchResult, ItemType, ItemStatus } from '../types'
import type { SyncStatus } from '../api/syncService'

interface AppState {
  itemList: Item[]
  selectedId: number | null
  filters: FilterState
  theme: 'light' | 'dark'
  isAddModalOpen: boolean
  isSettingsOpen: boolean
  isQuotesModalOpen: boolean
  editingItem: Item | null
  quoteSearchResults: QuoteSearchResult[]
  quoteSearchQuery: string
  quotesVersion: number
  viewMode: 'grid' | 'list'
  selectionMode: boolean
  checkedItems: number[]
  isSidebarOpen: boolean

  fetchAll: () => Promise<void>
  addItem: (data: ItemFormData) => Promise<Item>
  updateItem: (id: number, data: Partial<ItemFormData>) => Promise<void>
  deleteItem: (id: number) => Promise<void>
  selectItem: (id: number | null) => void
  setFilter: (key: keyof FilterState, value: string) => void
  toggleTheme: () => void
  openAddModal: (editing?: Item | null) => void
  closeAddModal: () => void
  openSettings: () => void
  closeSettings: () => void
  openQuotesModal: () => void
  closeQuotesModal: () => void
  bumpQuotesVersion: () => void
  searchQuotes: (query: string) => Promise<void>
  clearQuoteSearch: () => void
  toggleViewMode: () => void
  enterSelectionMode: () => void
  exitSelectionMode: () => void
  toggleCheckedItem: (id: number) => void
  selectAllChecked: (ids: number[]) => void
  deleteCheckedItems: () => Promise<void>
  toggleSidebar: () => void
  closeSidebar: () => void

  // 동기화
  syncStatus: SyncStatus
  setSyncStatus: (s: SyncStatus) => void
  triggerSync: () => Promise<void>
}

function applyFilters(list: Item[], filters: FilterState, quoteItemIds?: Set<number>): Item[] {
  let result = [...list]

  if (filters.type !== 'all') {
    result = result.filter((m) => m.item_type === filters.type)
  }
  if (filters.status !== 'all') {
    result = result.filter((m) => m.status === filters.status)
  }
  if (filters.genre !== 'all' && filters.genre) {
    const filterSegs = filters.genre.split('>').map((s) => s.trim().toLowerCase())
    result = result.filter((m) => {
      if (!m.genre) return false
      const paths = m.genre.split(',').map((p) =>
        p.trim().split('>').map((s) => s.trim().toLowerCase()).filter(Boolean)
      )
      return paths.some((path) => filterSegs.every((seg, i) => path[i] === seg))
    })
  }
  if (filters.search.trim() && filters.searchMode === 'title') {
    const q = filters.search.toLowerCase()
    result = result.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.original_title?.toLowerCase().includes(q) ||
        m.author?.toLowerCase().includes(q) ||
        m.director?.toLowerCase().includes(q) ||
        m.isbn?.includes(q) ||
        quoteItemIds?.has(m.id)  // 명언 내용이 일치하는 작품도 포함
    )
  }

  switch (filters.sort) {
    case 'date_desc':
      result.sort((a, b) => b.created_at.localeCompare(a.created_at))
      break
    case 'date_asc':
      result.sort((a, b) => a.created_at.localeCompare(b.created_at))
      break
    case 'rating_desc':
      result.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
      break
    case 'rating_asc':
      result.sort((a, b) => (a.rating ?? 99) - (b.rating ?? 99))
      break
    case 'title_asc':
      result.sort((a, b) => a.title.localeCompare(b.title, 'ko'))
      break
  }

  return result
}

export const useStore = create<AppState>((set, get) => ({
  itemList: [],
  selectedId: null,
  filters: {
    type: 'all',
    status: 'all',
    genre: 'all',
    sort: 'date_desc',
    search: '',
    searchMode: 'title'
  },
  theme: (() => { try { return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark' } catch { return 'dark' } })(),
  isAddModalOpen: false,
  isSettingsOpen: false,
  isQuotesModalOpen: false,
  editingItem: null,
  quoteSearchResults: [],
  quoteSearchQuery: '',
  quotesVersion: 0,
  viewMode: (() => { try { return (localStorage.getItem('viewMode') as 'grid' | 'list') || 'grid' } catch { return 'grid' } })(),
  selectionMode: false,
  checkedItems: [],
  isSidebarOpen: false,
  syncStatus: 'idle' as SyncStatus,

  fetchAll: async () => {
    const list = await window.api.items.getAll()
    set({ itemList: list })
  },

  addItem: async (data) => {
    const item = await window.api.items.insert(data)
    await get().fetchAll()
    return item
  },

  updateItem: async (id, data) => {
    await window.api.items.update(id, data)
    await get().fetchAll()
  },

  deleteItem: async (id) => {
    await window.api.items.delete(id)
    set((s) => ({
      itemList: s.itemList.filter((m) => m.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId
    }))
  },

  selectItem: (id) => set({ selectedId: id }),

  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value }, checkedItems: [] })),

  toggleTheme: () =>
    set((s) => {
      const next = s.theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem('theme', next)
      document.documentElement.setAttribute('data-theme', next)
      return { theme: next }
    }),

  openAddModal: (editing = null) => set({ isAddModalOpen: true, editingItem: editing }),
  closeAddModal: () => set({ isAddModalOpen: false, editingItem: null }),
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  openQuotesModal: () => set({ isQuotesModalOpen: true }),
  closeQuotesModal: () => set((s) => ({ isQuotesModalOpen: false, quotesVersion: s.quotesVersion + 1 })),
  bumpQuotesVersion: () => set((s) => ({ quotesVersion: s.quotesVersion + 1 })),

  searchQuotes: async (query) => {
    if (!query.trim()) {
      set({ quoteSearchResults: [], quoteSearchQuery: '' })
      return
    }
    const results = await window.api.quotes.search(query)
    set({ quoteSearchResults: results, quoteSearchQuery: query })
  },

  clearQuoteSearch: () => set({ quoteSearchResults: [], quoteSearchQuery: '' }),

  toggleViewMode: () => set((s) => {
    const next = s.viewMode === 'grid' ? 'list' : 'grid'
    localStorage.setItem('viewMode', next)
    return { viewMode: next }
  }),

  enterSelectionMode: () => set({ selectionMode: true, selectedId: null, checkedItems: [] }),
  exitSelectionMode: () => set({ selectionMode: false, checkedItems: [] }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  closeSidebar: () => set({ isSidebarOpen: false }),

  setSyncStatus: (s) => set({ syncStatus: s }),
  triggerSync: async () => {
    const { setSyncStatus, fetchAll } = get()
    try {
      const { runSync } = await import('../api/syncService')
      await runSync(setSyncStatus)
      await fetchAll() // 동기화 후 목록 새로고침
    } catch {
      // runSync already called setSyncStatus('error')
    }
  },
  toggleCheckedItem: (id) => set((s) => ({
    checkedItems: s.checkedItems.includes(id)
      ? s.checkedItems.filter((x) => x !== id)
      : [...s.checkedItems, id]
  })),
  selectAllChecked: (ids) => set({ checkedItems: ids }),
  deleteCheckedItems: async () => {
    const { checkedItems } = get()
    const failed: number[] = []
    for (const id of checkedItems) {
      try {
        await window.api.items.delete(id)
      } catch {
        failed.push(id)
      }
    }
    await get().fetchAll()
    set({ checkedItems: failed, selectionMode: failed.length > 0, selectedId: null })
    if (failed.length > 0) {
      alert(`${failed.length}개 항목 삭제에 실패했습니다. 다시 시도해주세요.`)
    }
  }
}))

export function useFilteredItems(): Item[] {
  const { itemList, filters, quoteSearchResults } = useStore()
  const quoteItemIds = React.useMemo(
    () => quoteSearchResults.length > 0
      ? new Set(quoteSearchResults.map((q) => q.item_id))
      : undefined,
    [quoteSearchResults]
  )
  return React.useMemo(
    () => applyFilters(itemList, filters, quoteItemIds),
    [itemList, filters, quoteItemIds]
  )
}

export function useAllGenres(): string[] {
  const { itemList } = useStore()
  return React.useMemo(() => {
    const genreSet = new Set<string>()
    itemList.forEach((item) => {
      if (item.genre) {
        item.genre.split(',').forEach((g) => {
          const trimmed = g.trim()
          if (trimmed) genreSet.add(trimmed)
        })
      }
    })
    return Array.from(genreSet).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [itemList])
}
