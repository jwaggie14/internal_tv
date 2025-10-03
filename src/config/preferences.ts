import type { SymbolInfo } from '@klinecharts/pro'

import type { ChartTileConfig, Preferences, TabConfig } from '../types'
import { createId } from '../utils/id'

export const DEFAULT_MAIN_INDICATORS = ['MA']
export const DEFAULT_SUB_INDICATORS: string[] = []
export const MAX_TILES_PER_TAB = 6

export const INDICATOR_CATALOG = {
  main: ['MA', 'EMA', 'BOLL', 'SAR', 'TD_SETUP', 'TD_SETUP_CLOSE'],
  sub: ['VOL', 'MACD', 'KDJ', 'RSI'],
}

export function buildTile(symbolTicker: string): ChartTileConfig {
  return {
    id: createId('tile'),
    symbolTicker,
    indicators: {
      main: [...DEFAULT_MAIN_INDICATORS],
      sub: [...DEFAULT_SUB_INDICATORS],
      params: {},
    },
  }
}

export function buildTab(symbols: SymbolInfo[], name = 'Overview'): TabConfig {
  const fallbackTicker = symbols[0]?.ticker ?? 'ACME'
  return {
    id: createId('tab'),
    name,
    tiles: [buildTile(fallbackTicker)],
  }
}

export function buildDefaultPreferences(symbols: SymbolInfo[]): Preferences {
  const defaultTab = buildTab(symbols)
  return {
    tabs: [defaultTab],
    activeTabId: defaultTab.id,
  }
}

export function cloneTabs(tabs: TabConfig[]): TabConfig[] {
  return tabs.map((tab) => ({
    ...tab,
    tiles: tab.tiles.map((tile) => ({
      ...tile,
      indicators: {
        main: [...tile.indicators.main],
        sub: [...tile.indicators.sub],
        params: tile.indicators.params ? { ...tile.indicators.params } : {},
      },
    })),
  }))
}
