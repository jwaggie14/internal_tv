import type { SymbolInfo } from '@klinecharts/pro'

export type IndicatorSettings = {
  main: string[]
  sub: string[]
  params?: Record<string, number[]>
}

export interface ChartTileConfig {
  id: string
  symbolTicker: string
  indicators: IndicatorSettings
}

export interface TabConfig {
  id: string
  name: string
  tiles: ChartTileConfig[]
}

export interface Preferences {
  tabs: TabConfig[]
  activeTabId?: string
}

export interface SettingsDraft {
  userId: string
  preferences: Preferences
}

export type SymbolRegistry = Record<string, SymbolInfo>
