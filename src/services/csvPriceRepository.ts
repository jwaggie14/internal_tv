import type { SymbolInfo } from '@klinecharts/pro'
import type { KLineData } from 'klinecharts'

const CSV_URL = `${import.meta.env.BASE_URL}data.csv`
const CACHE_KEY = 'internal-tv:csv-cache'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface CsvCacheRecord {
  timestamp: number
  symbols: SymbolInfo[]
  series: Record<string, KLineData[]>
}

interface CsvPriceData {
  symbols: SymbolInfo[]
  series: Record<string, KLineData[]>
}

function parseCsv(raw: string): CsvPriceData {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (!lines.length) {
    throw new Error('The data.csv file is empty.')
  }

  const [headerLine, ...rows] = lines
  const headers = headerLine.split(',').map((column) => column.trim().toLowerCase())
  const symbolIndex = headers.indexOf('symbol')
  const dateIndex = headers.indexOf('publisheddate')
  const priceIndex = headers.indexOf('price')

  if (symbolIndex === -1 || dateIndex === -1 || priceIndex === -1) {
    throw new Error('The CSV header must include symbol, publisheddate, and price columns.')
  }

  const rawSeriesMap = new Map<string, { timestamp: number; close: number }[]>()

  rows.forEach((line, lineNumber) => {
    const columns = line.split(',')
    if (columns.length <= Math.max(symbolIndex, dateIndex, priceIndex)) {
      return
    }

    const symbol = columns[symbolIndex]?.trim()
    const publishedDate = columns[dateIndex]?.trim()
    const priceValue = Number.parseFloat(columns[priceIndex]?.trim())

    if (!symbol) {
      console.warn(`[CSV] Row ${lineNumber + 2} skipped: symbol is missing.`)
      return
    }
    const timestamp = Number.isNaN(Date.parse(publishedDate)) ? NaN : new Date(publishedDate).getTime()
    if (!Number.isFinite(timestamp)) {
      console.warn(`[CSV] Row ${lineNumber + 2} skipped: invalid publisheddate '${publishedDate}'.`)
      return
    }
    if (Number.isNaN(priceValue)) {
      console.warn(`[CSV] Row ${lineNumber + 2} skipped: invalid price '${columns[priceIndex]}'.`)
      return
    }

    const entries = rawSeriesMap.get(symbol) ?? []
    entries.push({ timestamp, close: priceValue })
    rawSeriesMap.set(symbol, entries)
  })

  if (!rawSeriesMap.size) {
    throw new Error('No valid rows were found in data.csv.')
  }

  const symbols: SymbolInfo[] = []
  const series: Record<string, KLineData[]> = {}

  rawSeriesMap.forEach((entries, symbol) => {
    const sorted = entries.sort((a, b) => a.timestamp - b.timestamp)
    const klineSeries: KLineData[] = []

    let previousClose = sorted[0]?.close ?? 0
    sorted.forEach(({ timestamp, close }) => {
      const open = (previousClose + close) / 2
      const high = Math.max(open, close)
      const low = Math.min(open, close)

      klineSeries.push({
        timestamp,
        open,
        high,
        low,
        close,
      })

      previousClose = close
    })

    series[symbol] = klineSeries
    symbols.push({
      ticker: symbol,
      shortName: symbol,
      name: symbol,
      type: 'custom',
      pricePrecision: 2,
      volumePrecision: 0,
    })
  })

  return { symbols, series }
}

function readCache(): CsvCacheRecord | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as CsvCacheRecord
    if (!parsed.series || !parsed.symbols || !parsed.timestamp) {
      return null
    }
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      return null
    }
    return parsed
  } catch (error) {
    console.warn('[CSV] Failed to parse cached data.', error)
    return null
  }
}

function writeCache(payload: CsvCacheRecord) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  } catch (error) {
    console.warn('[CSV] Failed to store cache.', error)
  }
}

export async function loadCsvPriceData(): Promise<CsvPriceData> {
  const cache = readCache()
  if (cache) {
    return {
      symbols: cache.symbols,
      series: cache.series,
    }
  }

  const response = await fetch(CSV_URL, { cache: 'no-cache' })
  if (!response.ok) {
    throw new Error(`Failed to load data.csv (status ${response.status}).`)
  }
  const text = await response.text()
  const parsed = parseCsv(text)
  writeCache({
    timestamp: Date.now(),
    symbols: parsed.symbols,
    series: parsed.series,
  })
  return parsed
}
