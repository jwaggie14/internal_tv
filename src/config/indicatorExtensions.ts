import {
  registerIndicator,
  getSupportedIndicators,
  IndicatorSeries,
  type IndicatorTemplate,
  type IndicatorCreateTooltipDataSourceParams,
  type IndicatorDrawParams,
  type KLineData,
} from 'klinecharts'

interface TdSetupResult {
  sellSetup: number | null
  buySetup: number | null
}

interface TdOptions {
  name: string
  shortName: string
  closeOnly: boolean
}

const SELL_COLOR = '#f87171'
const BUY_COLOR = '#4ade80'
const HIGHLIGHT_COLOR = '#facc15'
const CLOSE_ONLY_SELL = '#fb7185'
const CLOSE_ONLY_BUY = '#60a5fa'

function createTdSetupResults(dataList: KLineData[], options: TdOptions): TdSetupResult[] {
  const results: TdSetupResult[] = []
  let sellCount = 0
  let buyCount = 0

  for (let index = 0; index < dataList.length; index += 1) {
    const current = dataList[index]
    let sellValue: number | null = null
    let buyValue: number | null = null

    if (index >= 4) {
      const compared = dataList[index - 4]
      const sellCloseCondition = current.close > compared.close
      const buyCloseCondition = current.close < compared.close

      let sellCondition = sellCloseCondition
      let buyCondition = buyCloseCondition

      if (!options.closeOnly) {
        sellCondition = sellCondition && current.high >= compared.high
        buyCondition = buyCondition && current.low <= compared.low
      }

      if (sellCondition) {
        sellCount += 1
        sellValue = Math.min(sellCount, 9)
      } else {
        sellCount = 0
      }

      if (buyCondition) {
        buyCount += 1
        buyValue = Math.min(buyCount, 9)
      } else {
        buyCount = 0
      }
    } else {
      sellCount = 0
      buyCount = 0
    }

    results.push({
      sellSetup: sellValue,
      buySetup: buyValue,
    })
  }

  return results
}

function createTooltip({ indicator, crosshair }: IndicatorCreateTooltipDataSourceParams<TdSetupResult>) {
  const result = indicator.result ?? []
  const targetIndex = crosshair.dataIndex ?? result.length - 1
  const latest = result[targetIndex] ?? result[result.length - 1]
  const sellText = latest?.sellSetup ? `${latest.sellSetup}` : '--'
  const buyText = latest?.buySetup ? `${latest.buySetup}` : '--'

  return {
    name: indicator.shortName,
    calcParamsText: '',
    icons: [],
    values: [
      {
        title: 'Sell Setup',
        value: sellText,
      },
      {
        title: 'Buy Setup',
        value: buyText,
      },
    ],
  }
}

function createDrawCallback(closeOnly: boolean) {
  const sellColor = closeOnly ? CLOSE_ONLY_SELL : SELL_COLOR
  const buyColor = closeOnly ? CLOSE_ONLY_BUY : BUY_COLOR

  return ({
    ctx,
    indicator,
    visibleRange,
    bounding,
    yAxis,
    barSpace,
    kLineDataList,
  }: IndicatorDrawParams<TdSetupResult>) => {
    const results = indicator.result
    if (!results?.length) {
      return false
    }

    const from = Math.max(Math.floor(visibleRange.from) - 1, 0)
    const to = Math.min(Math.ceil(visibleRange.to) + 1, results.length - 1)
    const barWidth = barSpace.bar
    const left = bounding.left
    const right = bounding.left + bounding.width
    const top = bounding.top
    const bottom = bounding.top + bounding.height
    const fontSize = Math.max(11, Math.min(18, barWidth * 0.75))

    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `bold ${fontSize}px Inter, sans-serif`

    for (let index = from; index <= to; index += 1) {
      const setup = results[index]
      const candle = kLineDataList[index]
      if (!setup || !candle) {
        continue
      }

      const relativeIndex = index - visibleRange.from
      const x = left + (relativeIndex + 0.5) * barWidth
      if (!Number.isFinite(x) || x < left - barWidth || x > right + barWidth) {
        continue
      }

      if (setup.sellSetup) {
        const highPx = typeof yAxis.convertToPixel === 'function' ? yAxis.convertToPixel(candle.high) : top
        const y = Math.max(top + fontSize * 0.6, highPx - fontSize * 0.8)
        ctx.fillStyle = setup.sellSetup >= 9 ? HIGHLIGHT_COLOR : sellColor
        ctx.fillText(`${setup.sellSetup}`, x, y)
      }

      if (setup.buySetup) {
        const lowPx = typeof yAxis.convertToPixel === 'function' ? yAxis.convertToPixel(candle.low) : bottom
        const y = Math.min(bottom - fontSize * 0.6, lowPx + fontSize * 0.8)
        ctx.fillStyle = setup.buySetup >= 9 ? HIGHLIGHT_COLOR : buyColor
        ctx.fillText(`${setup.buySetup}`, x, y)
      }
    }

    ctx.restore()
    return true
  }
}

function createTdSetupIndicator(options: TdOptions): IndicatorTemplate<TdSetupResult> {
  return {
    name: options.name,
    shortName: options.shortName,
    series: IndicatorSeries.Price,
    precision: 0,
    calcParams: [],
    shouldOhlc: true,
    shouldFormatBigNumber: false,
    figures: [],
    calc: (dataList) => createTdSetupResults(dataList, options),
    draw: createDrawCallback(options.closeOnly),
    createTooltipDataSource: createTooltip,
  }
}

const TD_SETUP_INDICATORS: TdOptions[] = [
  {
    name: 'TD_SETUP',
    shortName: 'TD Setup',
    closeOnly: false,
  },
  {
    name: 'TD_SETUP_CLOSE',
    shortName: 'TD Setup Close',
    closeOnly: true,
  },
]

export function initializeCustomIndicators(): void {
  const registered = new Set(getSupportedIndicators())
  TD_SETUP_INDICATORS.forEach((options) => {
    if (!registered.has(options.name)) {
      registerIndicator(createTdSetupIndicator(options))
    }
  })
}
