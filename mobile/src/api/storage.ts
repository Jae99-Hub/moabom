/**
 * AsyncStorage 기반 로컬 데이터 저장소
 * 로그인 없이도 앱 사용 가능
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Item, Quote, AppSettings } from '../types'

const KEYS = {
  items: 'moabom_items',
  quotes: 'moabom_quotes',
  settings: 'moabom_settings',
  nextItemId: 'moabom_next_item_id',
  nextQuoteId: 'moabom_next_quote_id',
}

// ── ID generator ──────────────────────────────────────────

async function nextId(key: string): Promise<number> {
  const val = await AsyncStorage.getItem(key)
  const id = val ? parseInt(val) + 1 : 1
  await AsyncStorage.setItem(key, String(id))
  return id
}

// ── Items ─────────────────────────────────────────────────

export async function getItems(): Promise<Item[]> {
  const raw = await AsyncStorage.getItem(KEYS.items)
  if (!raw) return []
  const items: Item[] = JSON.parse(raw)
  return items.filter(i => !i.is_deleted)
}

export async function saveItem(item: Omit<Item, 'id' | 'created_at' | 'updated_at'>): Promise<Item> {
  const items = await getAllItems()
  const now = new Date().toISOString()
  const id = await nextId(KEYS.nextItemId)
  const newItem: Item = { ...item, id, created_at: now, updated_at: now }
  items.push(newItem)
  await AsyncStorage.setItem(KEYS.items, JSON.stringify(items))
  return newItem
}

export async function updateItem(id: number, updates: Partial<Item>): Promise<Item> {
  const items = await getAllItems()
  const idx = items.findIndex(i => i.id === id)
  if (idx === -1) throw new Error('Item not found')
  items[idx] = { ...items[idx], ...updates, updated_at: new Date().toISOString() }
  await AsyncStorage.setItem(KEYS.items, JSON.stringify(items))
  return items[idx]
}

export async function deleteItem(id: number): Promise<void> {
  await updateItem(id, { is_deleted: true })
}

async function getAllItems(): Promise<Item[]> {
  const raw = await AsyncStorage.getItem(KEYS.items)
  return raw ? JSON.parse(raw) : []
}

// ── Quotes ────────────────────────────────────────────────

export async function getQuotes(itemId?: number): Promise<Quote[]> {
  const raw = await AsyncStorage.getItem(KEYS.quotes)
  const quotes: Quote[] = raw ? JSON.parse(raw) : []
  return itemId ? quotes.filter(q => q.item_id === itemId) : quotes
}

export async function saveQuote(quote: Omit<Quote, 'id' | 'created_at'>): Promise<Quote> {
  const raw = await AsyncStorage.getItem(KEYS.quotes)
  const quotes: Quote[] = raw ? JSON.parse(raw) : []
  const id = await nextId(KEYS.nextQuoteId)
  const newQuote: Quote = { ...quote, id, created_at: new Date().toISOString() }
  quotes.push(newQuote)
  await AsyncStorage.setItem(KEYS.quotes, JSON.stringify(quotes))
  return newQuote
}

export async function deleteQuote(id: number): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.quotes)
  const quotes: Quote[] = raw ? JSON.parse(raw) : []
  await AsyncStorage.setItem(KEYS.quotes, JSON.stringify(quotes.filter(q => q.id !== id)))
}

// ── Settings ──────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = { theme: 'system' }

export async function getSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(KEYS.settings)
  return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const current = await getSettings()
  await AsyncStorage.setItem(KEYS.settings, JSON.stringify({ ...current, ...settings }))
}
