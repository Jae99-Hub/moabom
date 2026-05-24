export type ItemType = 'book' | 'movie' | 'drama'
export type StatusType = 'want' | 'doing' | 'done' | 'paused'

export interface Item {
  id: number
  item_type: ItemType
  title: string
  subtitle?: string
  author?: string
  cover_url?: string
  status: StatusType
  rating?: number
  genre?: string
  year?: number
  description?: string
  memo?: string
  created_at: string
  updated_at: string
  is_deleted?: boolean
}

export interface Quote {
  id: number
  item_id: number
  text: string
  page?: number
  created_at: string
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  tmdb_api_key?: string
  naver_client_id?: string
  naver_client_secret?: string
}
