import { useEffect, useRef, type CSSProperties } from 'react'
import { KLineChartPro, type Datafeed, type Period, type SymbolInfo } from '@klinecharts/pro'

import { createChartOptions, DEFAULT_PERIOD } from '../data/localDatafeed'
import type { IndicatorSettings } from '../types'

interface ChartTileProps {
  symbol: SymbolInfo
  datafeed: Datafeed
  period?: Period
  indicatorSettings: IndicatorSettings
  style?: CSSProperties
}

export function ChartTile({
  symbol,
  datafeed,
  period = DEFAULT_PERIOD,
  indicatorSettings,
  style,
}: ChartTileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    container.innerHTML = ''
    const chart = new KLineChartPro(
      createChartOptions({
        container,
        symbol,
        period,
        datafeed,
        theme: 'dark',
        mainIndicators: indicatorSettings.main,
        locale: 'en-US',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
        subIndicators: indicatorSettings.sub,
      }),
    )

    return () => {
      container.innerHTML = ''
      // Pro charts do not expose a public dispose API yet; clearing the DOM removes the instance.
      void chart
    }
  }, [symbol.ticker, datafeed, period, indicatorSettings.main.join(','), indicatorSettings.sub.join(',')])

  return (
    <div className="chart-tile" style={style}>
      <div className="chart-tile__header">
        <span className="chart-tile__symbol">{symbol.shortName ?? symbol.ticker}</span>
        <span className="chart-tile__name">{symbol.name}</span>
      </div>
      <div ref={containerRef} className="chart-tile__canvas" />
    </div>
  )
}
