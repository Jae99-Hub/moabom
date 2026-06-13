export type ItemType = 'book' | 'movie' | 'drama'
export type ItemStatus = 'want' | 'reading' | 'done' | 'dropped'

export interface Item {
  id: number
  title: string
  original_title: string | null
  item_type: ItemType
  cover_path: string | null
  backdrop_path: string | null
  author: string | null
  publisher: string | null
  isbn: string | null
  page_count: number | null
  current_page: number
  director: string | null
  platform: string | null
  tmdb_id: number | null
  google_books_id: string | null
  genre: string | null
  year: number | null
  overview: string | null
  rating: number | null
  status: ItemStatus
  review: string | null
  read_date: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export type ItemFormData = Omit<Item, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>

/** 휴지통 항목 — 동기화 식별자 포함 (클라우드 영구삭제용) */
export interface TrashItem extends Item {
  server_id: number | null
  deleted_at: string | null
}

export interface Quote {
  id: number
  item_id: number
  text: string
  page_number: number | null
  episode_number: number | null
  note: string | null
  created_at: string
}

export interface QuoteSearchResult extends Quote {
  item_title: string
  item_type: string
  cover_path: string | null
}

export type SortOption = 'date_desc' | 'date_asc' | 'rating_desc' | 'rating_asc' | 'title_asc'

export interface FilterState {
  type: ItemType | 'all'
  status: ItemStatus | 'all'
  genre: string | 'all'
  sort: SortOption
  search: string
  searchMode: 'title' | 'quote'
}

export interface GoogleBookResult {
  google_books_id: string
  title: string
  original_title: string
  author: string
  publisher: string
  isbn: string
  page_count: number | null
  year: string | null
  overview: string
  cover_path: string | null
  genre: string
}

export interface TmdbResult {
  tmdb_id: number
  title: string
  original_title: string
  item_type: string
  cover_path: string | null
  backdrop_path: string | null
  year: string | null
  overview: string
  genre: string
  director: string
  vote_average: number
}

declare global {
  interface Window {
    api: {
      items: {
        getAll: () => Promise<Item[]>
        getById: (id: number) => Promise<Item | undefined>
        insert: (data: ItemFormData) => Promise<Item>
        update: (id: number, data: Partial<ItemFormData>) => Promise<Item | undefined>
        delete: (id: number) => Promise<void>
      }
      quotes: {
        getByItemId: (itemId: number) => Promise<Quote[]>
        search: (query: string) => Promise<QuoteSearchResult[]>
        insert: (data: Omit<Quote, 'id' | 'created_at'>) => Promise<Quote>
        update: (id: number, data: Partial<Pick<Quote, 'text' | 'page_number' | 'episode_number' | 'note'>>) => Promise<Quote | undefined>
        delete: (id: number) => Promise<void>
      }
      settings: {
        get: (key: string) => Promise<string>
        set: (key: string, value: string) => Promise<void>
      }
      books: {
        search: (query: string) => Promise<GoogleBookResult[]>
      }
      tmdb: {
        search: (query: string) => Promise<TmdbResult[]>
      }
      image: {
        pick: () => Promise<string | null>
        saveCropped: (base64Data: string, fileName: string) => Promise<string>
        copyLocal: (srcPath: string) => Promise<string>
      }
      db: {
        backup: () => Promise<{ success: boolean; path?: string }>
        restore: () => Promise<{ success: boolean }>
      }
      sync: {
        getDirtyItems: () => Promise<Record<string, unknown>[]>
        getDirtyQuotes: () => Promise<Record<string, unknown>[]>
        markItemSynced: (localId: number, serverId: number) => Promise<void>
        markQuoteSynced: (localId: number, serverId: number) => Promise<void>
        hardDeleteItem: (localId: number) => Promise<void>
        hardDeleteQuote: (localId: number) => Promise<void>
        upsertItemFromCloud: (cloudItem: unknown) => Promise<void>
        upsertQuoteFromCloud: (cloudQuote: unknown) => Promise<void>
        getLastSyncAt: () => Promise<string>
        setLastSyncAt: (ts: string) => Promise<void>
        getItemById: (id: number) => Promise<unknown>
        clearItemDirty: (localId: number) => Promise<void>
        clearQuoteDirty: (localId: number) => Promise<void>
      }
      trash: {
        getAll: () => Promise<TrashItem[]>
        restore: (id: number) => Promise<void>
        purge: (id: number) => Promise<void>
        purgeExpired: (days: number) => Promise<void>
      }
    }
    authBridge?: {
      openExternal: (url: string) => Promise<void>
      onCallback: (callback: (url: string) => void) => void
      setCurrentUser: (userId: string | null) => Promise<void>
    }
    updaterBridge?: {
      onAvailable: (cb: (version: string) => void) => void
      onProgress: (cb: (pct: number) => void) => void
      onDownloaded: (cb: () => void) => void
      onNotAvailable: (cb: () => void) => void
      onError: (cb: (msg: string) => void) => void
      checkForUpdates: () => Promise<void>
      startDownload: () => Promise<void>
      install: () => Promise<void>
      getVersion: () => Promise<string>
    }
  }
}
