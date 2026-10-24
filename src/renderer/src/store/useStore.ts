import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { Item, ItemFormData, FilterState, QuoteSearchResult } from '../types'
import type { SyncStatus, SyncConflict } from '../api/syncService'

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
  isStatsOpen: boolean
  openStats: () => void
  closeStats: () => void
  isTrashOpen: boolean
  openTrash: () => void
  closeTrash: () => void
  isTourOpen: boolean
  openTour: () => void
  closeTour: () => void

  // 동기화
  syncStatus: SyncStatus
  setSyncStatus: (s: SyncStatus) => void
  triggerSync: () => Promise<void>
  requestSync: () => void
  syncConflicts: SyncConflict[]
  syncAutoMerged: number
  setSyncResult: (conflicts: SyncConflict[], autoMerged: number) => void
  removeSyncConflict: (localId: number) => void
  clearSyncResult: () => void
}

// 아이템 변경 후 3초 디바운스 자동 sync
let _syncTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSync(triggerSync: () => Promise<void>) {
  if (_syncTimer) clearTimeout(_syncTimer)
  _syncTimer = setTimeout(() => { triggerSync() }, 3000)
}

const koCollator = new Intl.Collator('ko')

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
      result.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
      break
    case 'date_asc':
      result.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
      break
    case 'rating_desc':
      result.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
      break
    case 'rating_asc':
      result.sort((a, b) => (a.rating ?? 99) - (b.rating ?? 99))
      break
    case 'title_asc':
      result.sort((a, b) => koCollator.compare(a.title, b.title))
      break
  }

  return result
}

/** 새로 받은 목록에서 내용이 그대로인 항목은 이전 객체를 재사용 → 바뀐 카드만 다시 그려짐 */
function reuseUnchanged(prev: Item[], next: Item[]): Item[] {
  const byId = new Map(prev.map((m) => [m.id, m]))
  let same = prev.length === next.length
  const merged = next.map((n, i) => {
    const o = byId.get(n.id)
    if (o && sameFields(o, n)) {
      if (prev[i] !== o) same = false
      return o
    }
    same = false
    return n
  })
  return same ? prev : merged
}

function sameFields(a: Item, b: Item): boolean {
  const keys = Object.keys(b) as (keyof Item)[]
  return keys.length === Object.keys(a).length && keys.every((k) => a[k] === b[k])
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
  theme: (() => { try { return (localStorage.getItem('theme') as 'light' | 'dark') || 'light' } catch { return 'light' } })(),
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
  isStatsOpen: false,
  isTrashOpen: false,
  isTourOpen: false,
  syncStatus: 'idle' as SyncStatus,
  syncConflicts: [] as SyncConflict[],
  syncAutoMerged: 0,

  fetchAll: async () => {
    const list = await window.api.items.getAll()
    const prev = get().itemList
    const next = reuseUnchanged(prev, list)
    if (next !== prev) set({ itemList: next })
  },

  addItem: async (data) => {
    const item = await window.api.items.insert(data)
    await get().fetchAll()
    scheduleSync(get().triggerSync)
    return item
  },

  updateItem: async (id, data) => {
    await window.api.items.update(id, data)
    await get().fetchAll()
    scheduleSync(get().triggerSync)
  },

  deleteItem: async (id) => {
    await window.api.items.delete(id)
    set((s) => ({
      itemList: s.itemList.filter((m) => m.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId
    }))
    scheduleSync(get().triggerSync)
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
    if (get().filters.search !== query) return // 그사이 검색어가 바뀌었으면 늦게 온 결과는 버림
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
  openStats: () => set({ isStatsOpen: true }),
  closeStats: () => set({ isStatsOpen: false }),
  openTrash: () => set({ isTrashOpen: true }),
  closeTrash: () => set({ isTrashOpen: false }),
  openTour: () => set({ isTourOpen: true }),
  closeTour: () => {
    try { localStorage.setItem('onboarding_done', '1') } catch { /* ignore */ }
    set({ isTourOpen: false })
  },

  setSyncStatus: (s) => set({ syncStatus: s }),
  // 데이터 변경 후 3초 디바운스 동기화 예약 (명대사 등 스토어 밖에서 바뀐 데이터용)
  requestSync: () => scheduleSync(get().triggerSync),
  setSyncResult: (conflicts, autoMerged) => set({ syncConflicts: conflicts, syncAutoMerged: autoMerged }),
  removeSyncConflict: (localId) =>
    set((s) => ({ syncConflicts: s.syncConflicts.filter((c) => c.localId !== localId) })),
  clearSyncResult: () => set({ syncConflicts: [], syncAutoMerged: 0 }),
  triggerSync: async () => {
    const { setSyncStatus, fetchAll, setSyncResult } = get()
    try {
      const { runSync } = await import('../api/syncService')
      const result = await runSync(setSyncStatus)
      await fetchAll()
      if (result.conflicts.length > 0 || result.autoMerged > 0) {
        setSyncResult(result.conflicts, result.autoMerged)
      }
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
    if (checkedItems.length > failed.length) scheduleSync(get().triggerSync) // 삭제를 클라우드에도 반영
    if (failed.length > 0) {
      alert(`${failed.length}개 항목 삭제에 실패했습니다. 다시 시도해주세요.`)
    }
  }
}))

/** 필요한 값만 구독 — 다른 상태가 바뀔 때는 다시 그리지 않음.
 *  예: const { theme, toggleTheme } = useStorePick('theme', 'toggleTheme')
 *  (예전엔 useStore()로 전체를 구독해 검색어 한 글자에도 모든 카드가 다시 그려졌음) */
export function useStorePick<K extends keyof AppState>(...keys: K[]): Pick<AppState, K> {
  return useStore(useShallow((s: AppState) => {
    const picked = {} as Pick<AppState, K>
    for (const k of keys) picked[k] = s[k]
    return picked
  }))
}

// 필터 결과는 한 곳에서만 계산해 공유 (목록·선택바·상세창이 각자 같은 정렬을 반복하던 것)
let filteredCache: { list: Item[]; filters: FilterState; quotes: QuoteSearchResult[]; result: Item[] } | null = null

export function selectFilteredItems(s: Pick<AppState, 'itemList' | 'filters' | 'quoteSearchResults'>): Item[] {
  const c = filteredCache
  if (c && c.list === s.itemList && c.filters === s.filters && c.quotes === s.quoteSearchResults) return c.result
  const quoteItemIds = s.quoteSearchResults.length > 0
    ? new Set(s.quoteSearchResults.map((q) => q.item_id))
    : undefined
  const result = applyFilters(s.itemList, s.filters, quoteItemIds)
  filteredCache = { list: s.itemList, filters: s.filters, quotes: s.quoteSearchResults, result }
  return result
}

export function useFilteredItems(): Item[] {
  return useStore(selectFilteredItems)
}
