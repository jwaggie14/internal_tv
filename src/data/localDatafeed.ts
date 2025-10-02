import type { KLineData } from 'klinecharts'
import type {
  ChartProOptions,
  Datafeed,
  DatafeedSubscribeCallback,
  Period,
  SymbolInfo,
} from '@klinecharts/pro'

const DAILY_PERIOD: Period = {
  multiplier: 1,
  timespan: 'day',
  text: '1D',
}

const SUPPORTED_PERIODS: Period[] = [DAILY_PERIOD]

function ensureMs(timestamp: number): number {
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp
}

function buildSubscriptionKey(symbol: SymbolInfo, period: Period): string {
  return `${symbol.ticker}-${period.multiplier}${period.timespan}`
}

export class LocalDatafeed implements Datafeed {
  private readonly seriesMap: Record<string, KLineData[]>
  private readonly symbols: SymbolInfo[]
  private readonly subscriptions = new Map<string, ReturnType<typeof setInterval>>()

  constructor(seriesMap: Record<string, KLineData[]>, symbols: SymbolInfo[]) {
    this.seriesMap = seriesMap
    this.symbols = symbols
  }

  async searchSymbols(search?: string): Promise<SymbolInfo[]> {
    if (!search) {
      return this.symbols
    }
    const query = search.trim().toLowerCase()
    return this.symbols.filter((symbol) =>
      [symbol.ticker, symbol.shortName, symbol.name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    )
  }

  async getHistoryKLineData(
    symbol: SymbolInfo,
    period: Period,
    from: number,
    to: number,
  ): Promise<KLineData[]> {
    if (period.timespan !== DAILY_PERIOD.timespan) {
      return []
    }
    const data = this.seriesMap[symbol.ticker] ?? []
    if (!data.length) {
      return []
    }

    const start = ensureMs(from)
    const end = to ? ensureMs(to) : Number.MAX_SAFE_INTEGER

    return data.filter((item) => item.timestamp >= start && item.timestamp <= end)
  }

  subscribe(symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void {
    const key = buildSubscriptionKey(symbol, period)
    if (this.subscriptions.has(key)) {
      return
    }
    const data = this.seriesMap[symbol.ticker]
    if (!data?.length) {
      return
    }

    callback(data[data.length - 1])

    const interval = setInterval(() => {
      const last = data[data.length - 1]
      callback({ ...last })
    }, 60 * 60 * 1000)

    this.subscriptions.set(key, interval)
  }

  unsubscribe(symbol: SymbolInfo, period: Period): void {
    const key = buildSubscriptionKey(symbol, period)
    const interval = this.subscriptions.get(key)
    if (interval) {
      clearInterval(interval)
      this.subscriptions.delete(key)
    }
  }
}

export function createChartOptions(overrides: Partial<ChartProOptions>): ChartProOptions {
  if (!overrides.container) {
    throw new Error('container is required to bootstrap KLineChart Pro')
  }
  if (!overrides.symbol) {
    throw new Error('symbol is required to bootstrap KLineChart Pro')
  }
  if (!overrides.datafeed) {
    throw new Error('datafeed is required to bootstrap KLineChart Pro')
  }

  return {
    container: overrides.container,
    symbol: overrides.symbol,
    period: overrides.period ?? DAILY_PERIOD,
    periods: overrides.periods ?? SUPPORTED_PERIODS,
    datafeed: overrides.datafeed,
    theme: overrides.theme ?? 'dark',
    styles: overrides.styles,
    drawingBarVisible: overrides.drawingBarVisible ?? false,
    watermark: overrides.watermark,
    locale: overrides.locale,
    timezone: overrides.timezone,
    mainIndicators: overrides.mainIndicators,
    subIndicators: overrides.subIndicators,
  }
}

export const DEFAULT_PERIOD = DAILY_PERIOD
export const AVAILABLE_PERIODS = SUPPORTED_PERIODS
