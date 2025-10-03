import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { KLineChartPro, type Datafeed, type Period, type SymbolInfo } from '@klinecharts/pro'

import { createChartOptions, DEFAULT_PERIOD } from '../data/localDatafeed'
import type { IndicatorSettings } from '../types'

const toNumericArray = (values: unknown): number[] => {
  if (!Array.isArray(values)) {
    return []
  }
  const parsed: number[] = []
  values.forEach((value) => {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      parsed.push(numeric)
    }
  })
  return parsed
}

const arraysEqual = (a: number[], b: number[]): boolean => {
  if (a.length !== b.length) {
    return false
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false
    }
  }
  return true
}

const collectIndicatorParams = (chart: any, name: string, paneId?: string | null): number[] | null => {
  if (!chart || typeof chart.getIndicatorByPaneId !== 'function') {
    return null
  }

  const read = (instance: any): number[] | null => {
    const values = toNumericArray(instance?.calcParams)
    return values.length ? values : null
  }

  if (paneId) {
    const instance = chart.getIndicatorByPaneId(paneId, name)
    const result = read(instance)
    if (result) {
      return result
    }
  }

  const mapping = chart.getIndicatorByPaneId()
  if (mapping instanceof Map) {
    for (const indicatorMap of mapping.values()) {
      if (indicatorMap instanceof Map) {
        const instance = indicatorMap.get(name)
        const result = read(instance)
        if (result) {
          return result
        }
      }
    }
  }

  return null
}

const applyIndicatorParams = (chart: any, params?: Record<string, number[]>) => {
  if (!chart || typeof chart.getIndicatorByPaneId !== 'function' || typeof chart.overrideIndicator !== 'function') {
    return
  }
  if (!params || Object.keys(params).length === 0) {
    return
  }

  const mapping = chart.getIndicatorByPaneId()
  if (!(mapping instanceof Map)) {
    return
  }

  mapping.forEach((indicatorMap: unknown, paneId: string) => {
    if (!(indicatorMap instanceof Map)) {
      return
    }
    indicatorMap.forEach((instance: any, indicatorName: string) => {
      const desired = toNumericArray(params[indicatorName])
      if (!desired.length) {
        return
      }
      const current = toNumericArray(instance?.calcParams)
      if (arraysEqual(current, desired)) {
        return
      }
      chart.overrideIndicator({ name: indicatorName, calcParams: desired }, paneId)
    })
  })
}

const buildParamsKey = (params: Record<string, number[]> | undefined): string => {
  if (!params) {
    return ''
  }
  const entries = Object.entries(params).map(([name, values]) => {
    const formatted = toNumericArray(values).join(',')
    return `${name}:${formatted}`
  })
  entries.sort()
  return entries.join('|')
}

interface ChartTileProps {
  symbol: SymbolInfo
  datafeed: Datafeed
  period?: Period
  indicatorSettings: IndicatorSettings
  onIndicatorParamsChange?: (indicatorName: string, calcParams: number[]) => void
  style?: CSSProperties
}

export function ChartTile({
  symbol,
  datafeed,
  period = DEFAULT_PERIOD,
  indicatorSettings,
  onIndicatorParamsChange,
  style,
}: ChartTileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<any>(null)
  const overrideRestoreRef = useRef<((override: any, paneId?: string | null) => void) | null>(null)

  const paramsKey = useMemo(() => buildParamsKey(indicatorSettings.params), [indicatorSettings.params])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    container.innerHTML = ''
    const chart: any = new KLineChartPro(
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

    chartRef.current = chart

    if (typeof chart.overrideIndicator === 'function') {
      const originalOverride = chart.overrideIndicator
      chart.overrideIndicator = function patched(override: any, paneId?: string | null) {
        const result = originalOverride.call(chart, override, paneId)
        if (onIndicatorParamsChange && override?.name) {
          const params =
            collectIndicatorParams(chart, override.name, paneId ?? null) ??
            (Array.isArray(override?.calcParams) ? toNumericArray(override.calcParams) : null)
          if (params && params.length) {
            onIndicatorParamsChange(override.name, params)
          }
        }
        return result
      }
      overrideRestoreRef.current = originalOverride
    } else {
      overrideRestoreRef.current = null
    }

    applyIndicatorParams(chart, indicatorSettings.params)

    return () => {
      container.innerHTML = ''
      if (overrideRestoreRef.current && chart && typeof chart.overrideIndicator === 'function') {
        chart.overrideIndicator = overrideRestoreRef.current
      }
      overrideRestoreRef.current = null
      if (chartRef.current === chart) {
        chartRef.current = null
      }
    }
  }, [
    symbol.ticker,
    datafeed,
    period.multiplier,
    period.timespan,
    period.text,
    indicatorSettings.main.join(','),
    indicatorSettings.sub.join(','),
    onIndicatorParamsChange,
  ])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) {
      return
    }
    applyIndicatorParams(chart, indicatorSettings.params)
  }, [paramsKey])

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
