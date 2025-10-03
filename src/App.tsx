import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SymbolInfo } from '@klinecharts/pro'
import '@klinecharts/pro/dist/klinecharts-pro.css'
import './App.css'

import { ChartTile } from './components/ChartTile'
import { SettingsModal } from './components/SettingsModal'
import { LocalDatafeed, DEFAULT_PERIOD } from './data/localDatafeed'
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
import { loadPriceData, type PriceData } from './services/priceApi'
import { getUserPreferences, saveUserPreferences } from './services/userSettingsStore'

const DEFAULT_USER_ID = 'default-user'

function getInitialUserId(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_USER_ID
  }
  try {
    const url = new URL(window.location.href)
    const value = url.searchParams.get('user')?.trim()
    return value && value.length ? value : DEFAULT_USER_ID
  } catch (error) {
    console.error('Failed to parse user from URL.', error)
    return DEFAULT_USER_ID
  }
}

function updateUserInUrl(userId: string): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const url = new URL(window.location.href)
    if (userId && userId !== DEFAULT_USER_ID) {
      url.searchParams.set('user', userId)
    } else {
      url.searchParams.delete('user')
    }
    const next = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState(null, '', next)
  } catch (error) {
    console.error('Failed to update user in URL.', error)
  }
}

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

type PriceDataState = PriceData

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

function sanitizeIndicatorParams(
  params: Record<string, number[]> | undefined,
  allowedNames: Set<string>,
): Record<string, number[]> {
  if (!params) {
    return {}
  }
  const sanitized: Record<string, number[]> = {}
  allowedNames.forEach((name) => {
    const raw = params[name]
    if (!Array.isArray(raw)) {
      return
    }
    const parsed = raw
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
    if (parsed.length) {
      sanitized[name] = parsed
    }
  })
  return sanitized
}

function areNumberArraysEqual(a: number[] | undefined, b: number[]): boolean {
  if (!a || a.length !== b.length) {
    return false
  }
  for (let index = 0; index < a.length; index += 1) {
    if (Number(a[index]) !== Number(b[index])) {
      return false
    }
  }
  return true
}

function sanitizePreferences(
  preferences: Preferences | undefined,
  symbols: SymbolInfo[],
): Preferences {
  const fallbackTicker = symbols[0]?.ticker ?? 'ACME'
  const allowedTickers = new Set(symbols.map((symbol) => symbol.ticker))
  const fallbackTile = () => buildTile(fallbackTicker)

  const sanitizeTile = (tile: ChartTileConfig): ChartTileConfig => {
    const mainIndicators = sanitizeIndicatorList(
      tile.indicators?.main,
      INDICATOR_CATALOG.main,
      DEFAULT_MAIN_INDICATORS,
    )
    const subIndicators = sanitizeIndicatorList(
      tile.indicators?.sub,
      INDICATOR_CATALOG.sub,
      DEFAULT_SUB_INDICATORS,
    )
    const indicatorNames = new Set([...mainIndicators, ...subIndicators])
    const params = sanitizeIndicatorParams(tile.indicators?.params, indicatorNames)

    return {
      ...tile,
      symbolTicker: allowedTickers.has(tile.symbolTicker) ? tile.symbolTicker : fallbackTicker,
      indicators: {
        main: mainIndicators,
        sub: subIndicators,
        params,
      },
    }
  }

  const baseTabs = preferences?.tabs?.length ? preferences.tabs : buildDefaultPreferences(symbols).tabs
  const sanitizedTabs: TabConfig[] = cloneTabs(baseTabs).map((tab) => {
    const baseTiles = tab.tiles.length ? tab.tiles : [fallbackTile()]
    const normalizedTiles = baseTiles.map(sanitizeTile).slice(0, MAX_TILES_PER_TAB)
    const ensuredTiles = normalizedTiles.length ? normalizedTiles : [sanitizeTile(fallbackTile())]
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [priceData, setPriceData] = useState<PriceDataState | null>(null)
  const [priceLoading, setPriceLoading] = useState(true)
  const [priceError, setPriceError] = useState<string | null>(null)

  const [state, setState] = useState<{ userId: string; preferences: Preferences } | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const initialUserIdRef = useRef<string>(getInitialUserId())

  useEffect(() => {
    let cancelled = false
    const hydratePrices = async () => {
      setPriceLoading(true)
      setPriceError(null)
      try {
        const data = await loadPriceData()
        if (!cancelled) {
          setPriceData(data)
        }
      } catch (error) {
        console.error('Failed to load price data from the API.', error)
        if (!cancelled) {
          setPriceError('Unable to load market data from the server.')
        }
      } finally {
        if (!cancelled) {
          setPriceLoading(false)
        }
      }
    }

    void hydratePrices()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!priceData) {
      return
    }
    let cancelled = false
    const hydrateSettings = async () => {
      setSettingsLoading(true)
      setSettingsError(null)
      const requestedUserId = initialUserIdRef.current
      try {
        const stored = await getUserPreferences(requestedUserId)
        if (!cancelled) {
          const sanitized = sanitizePreferences(stored ?? undefined, priceData.symbols)
          setState({ userId: requestedUserId, preferences: sanitized })
        }
      } catch (error) {
        console.error('Failed to load saved workspace.', error)
        if (!cancelled) {
          setSettingsError('Unable to load saved workspace. Defaults are being used.')
          const fallback = sanitizePreferences(undefined, priceData.symbols)
          setState({ userId: requestedUserId, preferences: fallback })
        }
      } finally {
        if (!cancelled) {
          setSettingsLoading(false)
        }
      }
    }

    void hydrateSettings()
    return () => {
      cancelled = true
    }
  }, [priceData])

  useEffect(() => {
    initializeCustomIndicators()
  }, [])

  useEffect(() => {
    if (state?.userId) {
      updateUserInUrl(state.userId)
    }
  }, [state?.userId])

  const persistPreferencesAsync = useCallback((userId: string, preferences: Preferences) => {
    void saveUserPreferences(userId, preferences).catch((error) => {
      console.error('Failed to save user preferences.', error)
    })
  }, [])

  const handleIndicatorParamsChange = useCallback(
    (tileId: string, indicatorName: string, calcParams: number[]) => {
      if (!calcParams.length) {
        return
      }
      let nextStatePayload: { userId: string; preferences: Preferences } | null = null
      setState((previous) => {
        if (!previous) {
          return previous
        }

        let updated = false
        const nextTabs = previous.preferences.tabs.map((tab) => {
          let tabUpdated = false
          const nextTiles = tab.tiles.map((tile) => {
            if (tile.id !== tileId) {
              return tile
            }
            const existingParams = tile.indicators.params ?? {}
            if (areNumberArraysEqual(existingParams[indicatorName], calcParams)) {
              return tile
            }
            tabUpdated = true
            updated = true
            return {
              ...tile,
              indicators: {
                ...tile.indicators,
                params: {
                  ...existingParams,
                  [indicatorName]: calcParams.slice(),
                },
              },
            }
          })
          if (!tabUpdated) {
            return tab
          }
          return {
            ...tab,
            tiles: nextTiles,
          }
        })

        if (!updated) {
          return previous
        }

        const nextPreferences: Preferences = {
          ...previous.preferences,
          tabs: nextTabs,
        }

        nextStatePayload = {
          userId: previous.userId,
          preferences: nextPreferences,
        }

        return nextStatePayload
      })

      if (nextStatePayload !== null) {
        const payload = nextStatePayload as { userId: string; preferences: Preferences }
        persistPreferencesAsync(payload.userId, payload.preferences)
      }
    },
    [persistPreferencesAsync],
  )

  const ready = Boolean(priceData && state)
  const symbolRegistry: SymbolRegistry = useMemo(() => {
    if (!priceData) {
      return {}
    }
    return priceData.symbols.reduce<SymbolRegistry>((registry, symbol) => {
      registry[symbol.ticker] = symbol
      return registry
    }, {})
  }, [priceData])

  const activeTab = ready
    ? state!.preferences.tabs.find((tab) => tab.id === state!.preferences.activeTabId)
      ?? state!.preferences.tabs[0]
    : null

  const activeTiles = activeTab?.tiles ?? []
  const gridLayout = useMemo(() => getGridLayout(activeTiles.length), [activeTiles.length])

  const datafeed = useMemo(() => {
    if (!priceData) {
      return null
    }
    return new LocalDatafeed(priceData.series, priceData.symbols)
  }, [priceData])

  const handleSelectTab = (tabId: string) => {
    if (!state || state.preferences.activeTabId === tabId) {
      return
    }
    const nextPreferences: Preferences = {
      ...state.preferences,
      activeTabId: tabId,
    }
    persistPreferencesAsync(state.userId, nextPreferences)
    setState({ userId: state.userId, preferences: nextPreferences })
  }

  const handleApplySettings = useCallback(
    (draft: SettingsDraft) => {
      if (!priceData) {
        return
      }
      const sanitized = sanitizePreferences(draft.preferences, priceData.symbols)
      persistPreferencesAsync(draft.userId, sanitized)
      setState({ userId: draft.userId, preferences: sanitized })
    },
    [persistPreferencesAsync, priceData],
  )

  const showLoading = priceLoading || settingsLoading || !ready

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__title">Internal TV</span>
          <span className="app__subtitle">Chart Studio</span>
        </div>
        <div className="app__actions">
          <div className="app__user-id">User: {state?.userId ?? initialUserIdRef.current}</div>
          <button className="app__button" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
        </div>
      </header>

      {priceError && <div className="app__banner">{priceError}</div>}
      {settingsError && <div className="app__banner">{settingsError}</div>}
      {showLoading && (
        <div className="app__loading" role="status" aria-live="polite">
          <span className="app__loading-spinner" />
          <span>Loading workspace...</span>
        </div>
      )}

      <nav className="app__tabs">
        {ready
          ? state!.preferences.tabs.map((tab) => (
              <button
                key={tab.id}
                className={`app__tab ${tab.id === state!.preferences.activeTabId ? 'app__tab--active' : ''}`}
                onClick={() => handleSelectTab(tab.id)}
              >
                {tab.name || 'Untitled'}
              </button>
            ))
          : <span className="app__tabs-empty">Workspace is loading...</span>}
      </nav>

      <main className="app__workspace">
        {!ready || !datafeed ? (
          <div className="app__empty">
            <p>Preparing charts. Hang tight.</p>
          </div>
        ) : !activeTab ? (
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
              const fallbackSymbol = priceData!.symbols[0] ?? { ticker: 'ACME', shortName: 'ACME', name: 'ACME', type: 'custom' } as SymbolInfo;
              const symbol = symbolRegistry[tile.symbolTicker] ?? fallbackSymbol
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
                  onIndicatorParamsChange={(indicatorName, calcParams) =>
                    handleIndicatorParamsChange(tile.id, indicatorName, calcParams)
                  }
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
        onLoadPreferences={async (userId) => {
          if (!priceData) {
            return null;
          }
          const stored = await getUserPreferences(userId);
          return stored ? sanitizePreferences(stored, priceData.symbols) : null;
        }}
        currentUserId={state?.userId ?? initialUserIdRef.current}
        preferences={ready ? state!.preferences : sanitizePreferences(undefined, priceData?.symbols ?? [])}
        symbols={priceData?.symbols ?? []}
        indicatorCatalog={INDICATOR_CATALOG}
      />
    </div>
  )
}

export default App









