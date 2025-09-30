import { useCallback, useEffect, useMemo, useState } from 'react'
import '@klinecharts/pro/dist/klinecharts-pro.css'
import './App.css'

import { ChartTile } from './components/ChartTile'
import { SettingsModal } from './components/SettingsModal'
import {
  AVAILABLE_SYMBOLS,
  AVAILABLE_SERIES,
  DEFAULT_PERIOD,
  LocalDatafeed,
} from './data/localDatafeed'
import {
  INDICATOR_CATALOG,
  DEFAULT_MAIN_INDICATORS,
  DEFAULT_SUB_INDICATORS,
  MAX_TILES_PER_TAB,
  buildDefaultPreferences,
  buildTile,
  cloneTabs,
} from './config/preferences'
import { initializeCustomIndicators } from './config/indicatorExtensions'
import type { ChartTileConfig, Preferences, SettingsDraft, SymbolRegistry, TabConfig } from './types'

const STORAGE_PREFIX = 'internal-tv-preferences'
const DEFAULT_USER_ID = 'default-user'

const SYMBOL_REGISTRY: SymbolRegistry = AVAILABLE_SYMBOLS.reduce((registry, symbol) => {
  registry[symbol.ticker] = symbol
  return registry
}, {} as SymbolRegistry)

const DEFAULT_ROW_HEIGHT = 'minmax(420px, 1fr)'
const LARGE_SINGLE_HEIGHT = 'minmax(560px, 1.6fr)'
const LARGE_ROW_HEIGHT = 'minmax(500px, 1.4fr)'
const MID_ROW_HEIGHT = 'minmax(480px, 1.3fr)'
const SHORT_ROW_HEIGHT = 'minmax(360px, 1fr)'

type GridPlacement = {
  columnStart: number
  rowStart: number
  columnSpan?: number
  rowSpan?: number
}

type GridLayout = {
  columns: number
  templateRows: string
  placements: GridPlacement[]
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`
}

function sanitizeIndicatorList(values: string[] | undefined, allowed: string[], fallback: string[]): string[] {
  if (!values?.length) {
    return [...fallback]
  }
  const allowedSet = new Set(allowed.map((value) => value.toUpperCase()))
  const deduped: string[] = []
  for (const value of values) {
    const code = value.toUpperCase()
    if (allowedSet.has(code) && !deduped.includes(code)) {
      deduped.push(code)
    }
  }
  return deduped.length ? deduped : [...fallback]
}

function sanitizePreferences(preferences: Preferences | undefined): Preferences {
  const fallbackTicker = AVAILABLE_SYMBOLS[0]?.ticker ?? 'ACME'
  const allowedTickers = new Set(AVAILABLE_SYMBOLS.map((symbol) => symbol.ticker))
  const sanitizeTile = (tile: ChartTileConfig): ChartTileConfig => ({
    ...tile,
    symbolTicker: allowedTickers.has(tile.symbolTicker) ? tile.symbolTicker : fallbackTicker,
    indicators: {
      main: sanitizeIndicatorList(tile.indicators?.main, INDICATOR_CATALOG.main, DEFAULT_MAIN_INDICATORS),
      sub: sanitizeIndicatorList(tile.indicators?.sub, INDICATOR_CATALOG.sub, DEFAULT_SUB_INDICATORS),
    },
  })

  const tabs = preferences?.tabs?.length ? preferences.tabs : buildDefaultPreferences(AVAILABLE_SYMBOLS).tabs

  const sanitizedTabs: TabConfig[] = cloneTabs(tabs).map((tab) => {
    const baseTiles = tab.tiles.length ? tab.tiles : [buildTile(fallbackTicker)]
    const normalizedTiles = baseTiles.map(sanitizeTile).slice(0, MAX_TILES_PER_TAB)
    const ensuredTiles = normalizedTiles.length ? normalizedTiles : [sanitizeTile(buildTile(fallbackTicker))]
    return {
      ...tab,
      tiles: ensuredTiles,
    }
  })

  const preferredActiveId = preferences?.activeTabId
  const activeTabId = sanitizedTabs.some((tab) => tab.id === preferredActiveId)
    ? preferredActiveId
    : sanitizedTabs[0]?.id

  return {
    tabs: sanitizedTabs,
    activeTabId,
  }
}

function loadPreferences(userId: string): Preferences {
  if (typeof window === 'undefined') {
    return buildDefaultPreferences(AVAILABLE_SYMBOLS)
  }
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) {
      return buildDefaultPreferences(AVAILABLE_SYMBOLS)
    }
    const parsed = JSON.parse(raw) as Preferences
    return sanitizePreferences(parsed)
  } catch (error) {
    console.warn('Failed to parse stored preferences, falling back to defaults.', error)
    return buildDefaultPreferences(AVAILABLE_SYMBOLS)
  }
}

function persistPreferences(userId: string, preferences: Preferences) {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(storageKey(userId), JSON.stringify(preferences))
}

function getGridLayout(tileCount: number): GridLayout {
  if (tileCount <= 0) {
    return {
      columns: 1,
      templateRows: DEFAULT_ROW_HEIGHT,
      placements: [],
    }
  }

  if (tileCount === 1) {
    return {
      columns: 1,
      templateRows: LARGE_SINGLE_HEIGHT,
      placements: [{ columnStart: 1, rowStart: 1 }],
    }
  }

  if (tileCount === 2) {
    return {
      columns: 1,
      templateRows: `repeat(2, ${DEFAULT_ROW_HEIGHT})`,
      placements: [
        { columnStart: 1, rowStart: 1 },
        { columnStart: 1, rowStart: 2 },
      ],
    }
  }

  if (tileCount === 3) {
    return {
      columns: 2,
      templateRows: `${LARGE_ROW_HEIGHT} ${SHORT_ROW_HEIGHT}`,
      placements: [
        { columnStart: 1, rowStart: 1, columnSpan: 2 },
        { columnStart: 1, rowStart: 2 },
        { columnStart: 2, rowStart: 2 },
      ],
    }
  }

  if (tileCount === 4) {
    return {
      columns: 2,
      templateRows: `repeat(2, ${DEFAULT_ROW_HEIGHT})`,
      placements: [
        { columnStart: 1, rowStart: 1 },
        { columnStart: 2, rowStart: 1 },
        { columnStart: 1, rowStart: 2 },
        { columnStart: 2, rowStart: 2 },
      ],
    }
  }

  if (tileCount === 5) {
    return {
      columns: 3,
      templateRows: `${MID_ROW_HEIGHT} ${DEFAULT_ROW_HEIGHT}`,
      placements: [
        { columnStart: 1, rowStart: 1, columnSpan: 2 },
        { columnStart: 3, rowStart: 1 },
        { columnStart: 1, rowStart: 2 },
        { columnStart: 2, rowStart: 2 },
        { columnStart: 3, rowStart: 2 },
      ],
    }
  }

  if (tileCount === 6) {
    return {
      columns: 3,
      templateRows: `repeat(2, ${DEFAULT_ROW_HEIGHT})`,
      placements: [
        { columnStart: 1, rowStart: 1 },
        { columnStart: 2, rowStart: 1 },
        { columnStart: 3, rowStart: 1 },
        { columnStart: 1, rowStart: 2 },
        { columnStart: 2, rowStart: 2 },
        { columnStart: 3, rowStart: 2 },
      ],
    }
  }

  const columns = 3
  const rows = Math.ceil(tileCount / columns)
  const placements: GridPlacement[] = []
  for (let index = 0; index < tileCount; index += 1) {
    placements.push({
      columnStart: (index % columns) + 1,
      rowStart: Math.floor(index / columns) + 1,
    })
  }
  return {
    columns,
    templateRows: `repeat(${rows}, ${DEFAULT_ROW_HEIGHT})`,
    placements,
  }
}

function App() {
  const [state, setState] = useState<{ userId: string; preferences: Preferences }>(() => ({
    userId: DEFAULT_USER_ID,
    preferences: loadPreferences(DEFAULT_USER_ID),
  }))
  const [settingsOpen, setSettingsOpen] = useState(false)

  const datafeed = useMemo(() => new LocalDatafeed(AVAILABLE_SERIES, AVAILABLE_SYMBOLS), [])

  useEffect(() => {
    initializeCustomIndicators()
  }, [])

  const activeTab = state.preferences.tabs.find((tab) => tab.id === state.preferences.activeTabId)
    ?? state.preferences.tabs[0]

  const activeTiles = activeTab?.tiles ?? []
  const gridLayout = useMemo(() => getGridLayout(activeTiles.length), [activeTiles.length])

  const handleSelectTab = (tabId: string) => {
    setState((prev) => {
      const nextPreferences: Preferences = {
        ...prev.preferences,
        activeTabId: tabId,
      }
      persistPreferences(prev.userId, nextPreferences)
      return { ...prev, preferences: nextPreferences }
    })
  }

  const handleApplySettings = useCallback(
    (draft: SettingsDraft) => {
      setState(() => {
        const sanitized = sanitizePreferences(draft.preferences)
        persistPreferences(draft.userId, sanitized)
        return {
          userId: draft.userId,
          preferences: sanitized,
        }
      })
    },
    [],
  )

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__title">Internal TV</span>
          <span className="app__subtitle">Chart Studio</span>
        </div>
        <div className="app__actions">
          <div className="app__user-id">User: {state.userId}</div>
          <button className="app__button" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
        </div>
      </header>

      <nav className="app__tabs">
        {state.preferences.tabs.map((tab) => (
          <button
            key={tab.id}
            className={`app__tab ${tab.id === state.preferences.activeTabId ? 'app__tab--active' : ''}`}
            onClick={() => handleSelectTab(tab.id)}
          >
            {tab.name || 'Untitled'}
          </button>
        ))}
        {!state.preferences.tabs.length && (
          <span className="app__tabs-empty">Create a tab from settings to get started.</span>
        )}
      </nav>

      <main className="app__workspace">
        {!activeTab ? (
          <div className="app__empty">
            <p>No tabs configured yet.</p>
            <button className="app__button" onClick={() => setSettingsOpen(true)}>
              Open Settings
            </button>
          </div>
        ) : !activeTiles.length ? (
          <div className="app__empty">
            <p>No tiles on this tab. Add one from settings.</p>
            <button className="app__button" onClick={() => setSettingsOpen(true)}>
              Manage Tiles
            </button>
          </div>
        ) : (
          <div
            className="app__grid"
            style={{
              gridTemplateColumns: `repeat(${gridLayout.columns}, minmax(0, 1fr))`,
              gridTemplateRows: gridLayout.templateRows,
            }}
          >
            {activeTiles.map((tile, index) => {
              const symbol = SYMBOL_REGISTRY[tile.symbolTicker] ?? AVAILABLE_SYMBOLS[0]
              const placement = gridLayout.placements[index]
              const columnStart = placement?.columnStart ?? ((index % gridLayout.columns) + 1)
              const columnSpan = placement?.columnSpan ?? 1
              const rowStart = placement?.rowStart ?? Math.floor(index / gridLayout.columns) + 1
              const rowSpan = placement?.rowSpan ?? 1

              return (
                <ChartTile
                  key={tile.id}
                  symbol={symbol}
                  datafeed={datafeed}
                  period={DEFAULT_PERIOD}
                  indicatorSettings={tile.indicators}
                  style={{
                    gridColumn: `${columnStart} / span ${columnSpan}`,
                    gridRow: `${rowStart} / span ${rowSpan}`,
                  }}
                />
              )
            })}
          </div>
        )}
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onApply={handleApplySettings}
        currentUserId={state.userId}
        preferences={state.preferences}
        symbols={AVAILABLE_SYMBOLS}
        indicatorCatalog={INDICATOR_CATALOG}
      />
    </div>
  )
}

export default App
