import type { KLineData } from 'klinecharts'
import type { SymbolInfo } from '@klinecharts/pro'

const DAY_MS = 24 * 60 * 60 * 1000
const SERIES_LENGTH = 520

const SYMBOLS: SymbolInfo[] = [
  {
    ticker: 'ACME',
    name: 'Acme Manufacturing',
    shortName: 'ACME',
    exchange: 'INT',
    market: 'Industrial',
    pricePrecision: 2,
    volumePrecision: 0,
    type: 'equity',
  },
  {
    ticker: 'BETA',
    name: 'Beta Biotech',
    shortName: 'BETA',
    exchange: 'INT',
    market: 'Healthcare',
    pricePrecision: 2,
    volumePrecision: 0,
    type: 'equity',
  },
  {
    ticker: 'OMEGA',
    name: 'Omega Energy',
    shortName: 'OMEGA',
    exchange: 'INT',
    market: 'Energy',
    pricePrecision: 2,
    volumePrecision: 0,
    type: 'equity',
  },
  {
    ticker: 'ZEUS',
    name: 'Zeus Logistics',
    shortName: 'ZEUS',
    exchange: 'INT',
    market: 'Transportation',
    pricePrecision: 2,
    volumePrecision: 0,
    type: 'equity',
  },
]

function createBasePrice(ticker: string): number {
  return 40 + (ticker.charCodeAt(0) % 10) * 5 + (ticker.length % 3) * 3
}

function createVolatility(ticker: string): number {
  return 0.8 + (ticker.charCodeAt(ticker.length - 1) % 5) * 0.25
}

function generateSeries(ticker: string): KLineData[] {
  const basePrice = createBasePrice(ticker)
  const volatility = createVolatility(ticker)
  const startTime = Date.now() - SERIES_LENGTH * DAY_MS
  let previousClose = basePrice

  return Array.from({ length: SERIES_LENGTH }).map((_, index) => {
    const timestamp = startTime + index * DAY_MS
    const seasonal = Math.sin(index / 18) * volatility * 0.8
    const drift = (index % 20) * 0.05
    const random = (Math.random() - 0.5) * volatility

    const open = Math.max(5, previousClose + random * 0.5)
    const close = Math.max(5, open + seasonal + random * 0.7 + drift * 0.1)
    const high = Math.max(open, close) + Math.random() * volatility
    const low = Math.max(2, Math.min(open, close) - Math.random() * volatility)
    const volume = Math.round(50000 + Math.random() * 125000)

    previousClose = close

    return {
      timestamp,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    }
  })
}

const SERIES_MAP: Record<string, KLineData[]> = Object.fromEntries(
  SYMBOLS.map((symbol) => [symbol.ticker, generateSeries(symbol.ticker)]),
)

export const MOCK_SYMBOLS = SYMBOLS
export const MOCK_SERIES = SERIES_MAP

export function getMockSeries(ticker: string): KLineData[] {
  return SERIES_MAP[ticker] ?? []
}
