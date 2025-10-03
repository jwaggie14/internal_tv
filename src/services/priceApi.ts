import type { SymbolInfo } from '@klinecharts/pro'
import type { KLineData } from 'klinecharts'

const API_BASE = (import.meta.env.VITE_SETTINGS_API ?? 'http://localhost:4000/api').replace(/\/$/, '')
const CACHE_STORAGE_KEY = 'price-data-cache-v1'
const CACHE_TTL_MS = 15 * 60 * 1000

export interface PriceData {
  symbols: SymbolInfo[]
  series: Record<string, KLineData[]>
}

type CachePayload = {
  expiresAt: number
  data: PriceData
}

let inMemoryCache: PriceData | null = null

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage
    }
  } catch (error) {
    console.debug('Local storage is unavailable', error)
  }
  return null
}

function toKLineData(series: Record<string, KLineData[]> | undefined): Record<string, KLineData[]> {
  if (!series) {
    return {}
  }
  const mapped: Record<string, KLineData[]> = {}
  Object.entries(series).forEach(([symbol, bars]) => {
    mapped[symbol] = bars.map((bar) => ({
      timestamp: Number(bar.timestamp),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
    }))
  })
  return mapped
}

function readPersistentCache(): PriceData | null {
  const storage = getStorage()
  if (!storage) {
    return null
  }
  try {
    const raw = storage.getItem(CACHE_STORAGE_KEY)
    if (!raw) {
      return null
    }
    const payload = JSON.parse(raw) as CachePayload
    if (!payload?.data || typeof payload.expiresAt !== 'number') {
      return null
    }
    if (payload.expiresAt < Date.now()) {
      storage.removeItem(CACHE_STORAGE_KEY)
      return null
    }
    const data: PriceData = {
      symbols: payload.data.symbols ?? [],
      series: toKLineData(payload.data.series),
    }
    inMemoryCache = data
    return data
  } catch (error) {
    console.debug('Failed to read cached price data', error)
    return null
  }
}

function writePersistentCache(data: PriceData): void {
  const storage = getStorage()
  if (!storage) {
    return
  }
  const payload: CachePayload = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data,
  }
  try {
    storage.setItem(CACHE_STORAGE_KEY, JSON.stringify(payload))
  } catch (error) {
    console.debug('Failed to persist price data cache', error)
  }
}

type PriceSeriesPayload = { symbols: SymbolInfo[]; series: Record<string, KLineData[]> }

function resolveUrl(path: string, query?: Record<string, string>): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = /^https?:/i.test(API_BASE)
    ? new URL(`${API_BASE}${normalizedPath}`)
    : new URL(`${API_BASE}${normalizedPath}`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value != null) {
        url.searchParams.set(key, value)
      }
    })
  }

  return url.toString()
}

async function requestPricePayload(forceRefresh: boolean): Promise<PriceSeriesPayload> {
  const url = resolveUrl('/prices')
  const response = await fetch(url, { cache: forceRefresh ? 'reload' : 'default' })
  if (!response.ok) {
    const error = new Error(`Failed to load price data (${response.status})`)
    ;(error as { status?: number }).status = response.status
    throw error
  }
  return (await response.json()) as PriceSeriesPayload
}

function normalizeSeries(symbols: SymbolInfo[], series: Record<string, KLineData[]>): Record<string, KLineData[]> {
  const mapped = toKLineData(series)
  symbols.forEach((symbol) => {
    if (!mapped[symbol.ticker]) {
      mapped[symbol.ticker] = []
    }
  })
  return mapped
}

export async function loadPriceData(forceRefresh = false): Promise<PriceData> {
  if (!forceRefresh && inMemoryCache) {
    return inMemoryCache
  }

  if (!forceRefresh) {
    const cached = readPersistentCache()
    if (cached) {
      return cached
    }
  }

  const payload = await requestPricePayload(forceRefresh)

  const data: PriceData = {
    symbols: payload.symbols ?? [],
    series: normalizeSeries(payload.symbols ?? [], payload.series ?? {}),
  }

  inMemoryCache = data
  writePersistentCache(data)
  return data
}

export function clearPriceDataCache(): void {
  inMemoryCache = null
  const storage = getStorage()
  if (!storage) {
    return
  }
  storage.removeItem(CACHE_STORAGE_KEY)
}
