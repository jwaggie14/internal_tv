import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SymbolInfo } from '@klinecharts/pro'

import { buildTab, buildTile, cloneTabs, MAX_TILES_PER_TAB, buildDefaultPreferences } from '../config/preferences'
import type { Preferences, SettingsDraft, TabConfig } from '../types'

interface IndicatorCatalog {
  main: string[]
  sub: string[]
}

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  onApply: (draft: SettingsDraft) => void
  onLoadPreferences: (userId: string) => Promise<Preferences | null>
  currentUserId: string
  preferences: Preferences
  symbols: SymbolInfo[]
  indicatorCatalog: IndicatorCatalog
}

export function SettingsModal({
  open,
  onClose,
  onApply,
  onLoadPreferences,
  currentUserId,
  preferences,
  symbols,
  indicatorCatalog,
}: SettingsModalProps) {
  const [draftUserId, setDraftUserId] = useState(currentUserId)
  const [draftTabs, setDraftTabs] = useState<TabConfig[]>([])
  const [draftActiveTabId, setDraftActiveTabId] = useState<string>('')
  const [editingTabId, setEditingTabId] = useState<string>('')
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [loadMessage, setLoadMessage] = useState<string | null>(null)

  const applyDraftPreferences = useCallback(
    (prefs: Preferences) => {
      const baseTabs = prefs.tabs.length ? prefs.tabs : buildDefaultPreferences(symbols).tabs
      const clonedTabs = cloneTabs(baseTabs)
      const nextActiveTabId =
        prefs.activeTabId && clonedTabs.some((tab) => tab.id === prefs.activeTabId)
          ? prefs.activeTabId
          : clonedTabs[0]?.id ?? ''

      setDraftTabs(clonedTabs)
      setDraftActiveTabId(nextActiveTabId)
      setEditingTabId(nextActiveTabId)
    },
    [symbols],
  )

  useEffect(() => {
    if (!open) {
      return
    }
    applyDraftPreferences(preferences)
    setDraftUserId(currentUserId)
    setLoadMessage(null)
  }, [open, currentUserId, preferences, applyDraftPreferences])

  useEffect(() => {
    if (!open) {
      return
    }
    if (!draftTabs.some((tab) => tab.id === editingTabId)) {
      setEditingTabId(draftTabs[0]?.id ?? '')
    }
  }, [open, draftTabs, editingTabId])

  const handleLoadExisting = async () => {
    const userId = draftUserId.trim() || currentUserId
    setLoadingExisting(true)
    setLoadMessage(null)
    try {
      const loaded = await onLoadPreferences(userId)
      if (loaded) {
        applyDraftPreferences(loaded)
        setLoadMessage(`Loaded saved layout for "${userId}".`)
      } else {
        const defaults = buildDefaultPreferences(symbols)
        applyDraftPreferences(defaults)
        setLoadMessage(`No saved layout for "${userId}". Started from defaults.`)
      }
      setDraftUserId(userId)
    } catch (error) {
      console.error('Failed to load preferences for user', userId, error)
      setLoadMessage('Failed to load saved preferences.')
    } finally {
      setLoadingExisting(false)
    }
  }
  const editingTab = useMemo(
    () => draftTabs.find((tab) => tab.id === editingTabId) ?? draftTabs[0],
    [draftTabs, editingTabId],
  )

  const handleAddTab = () => {
    setDraftTabs((prev) => {
      const tabName = `Tab ${prev.length + 1}`
      const nextTab = buildTab(symbols, tabName)
      const nextTabs = [...prev, nextTab]
      setEditingTabId(nextTab.id)
      return nextTabs
    })
  }

  const handleRemoveTab = (tabId: string) => {
    setDraftTabs((prev) => {
      if (prev.length <= 1) {
        return prev
      }
      const remaining = prev.filter((tab) => tab.id !== tabId)
      if (draftActiveTabId === tabId) {
        setDraftActiveTabId(remaining[0]?.id ?? '')
      }
      if (editingTabId === tabId) {
        setEditingTabId(remaining[0]?.id ?? '')
      }
      return remaining
    })
  }

  const handleRenameTab = (tabId: string, name: string) => {
    setDraftTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, name } : tab)),
    )
  }

  const handleAddTile = (tabId: string) => {
    setDraftTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) {
          return tab
        }
        if (tab.tiles.length >= MAX_TILES_PER_TAB) {
          return tab
        }
        return {
          ...tab,
          tiles: [...tab.tiles, buildTile(symbols[0]?.ticker ?? 'ACME')],
        }
      }),
    )
  }

  const handleRemoveTile = (tabId: string, tileId: string) => {
    setDraftTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              tiles: tab.tiles.filter((tile) => tile.id !== tileId),
            }
          : tab,
      ),
    )
  }

  const handleSymbolChange = (tabId: string, tileId: string, ticker: string) => {
    setDraftTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              tiles: tab.tiles.map((tile) =>
                tile.id === tileId
                  ? {
                      ...tile,
                      symbolTicker: ticker,
                    }
                  : tile,
              ),
            }
          : tab,
      ),
    )
  }

  const toggleIndicator = (
    tabId: string,
    tileId: string,
    indicator: string,
    category: keyof IndicatorCatalog,
  ) => {
    setDraftTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              tiles: tab.tiles.map((tile) => {
                if (tile.id !== tileId) {
                  return tile
                }
                const nextIndicators = new Set(tile.indicators[category])
                if (nextIndicators.has(indicator)) {
                  nextIndicators.delete(indicator)
                } else {
                  nextIndicators.add(indicator)
                }
                return {
                  ...tile,
                  indicators: {
                    ...tile.indicators,
                    [category]: Array.from(nextIndicators),
                  },
                }
              }),
            }
          : tab,
      ),
    )
  }

  const handleApply = () => {
    const fallbackTicker = symbols[0]?.ticker ?? 'ACME'

    const normalizedTabs = draftTabs.map((tab) => {
      const baseTiles = tab.tiles.length ? tab.tiles.slice(0, MAX_TILES_PER_TAB) : [buildTile(fallbackTicker)]
      const nextTiles = baseTiles.map((tile) => ({
        ...tile,
        indicators: {
          main: [...tile.indicators.main],
          sub: [...tile.indicators.sub],
        },
      }))
      return {
        ...tab,
        tiles: nextTiles,
      }
    })

    const sanitizedTabs = normalizedTabs.length ? normalizedTabs : [buildTab(symbols)]
    const sanitizedActiveTabId =
      sanitizedTabs.some((tab) => tab.id === draftActiveTabId)
        ? draftActiveTabId
        : sanitizedTabs[0]?.id

    const draft: SettingsDraft = {
      userId: draftUserId.trim() || currentUserId,
      preferences: {
        tabs: sanitizedTabs,
        activeTabId: sanitizedActiveTabId,
      },
    }

    onApply(draft)
    onClose()
  }

  if (!open) {
    return null
  }

  return (
    <div className="modal">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__content" role="dialog" aria-modal="true">
        <header className="modal__header">
          <h2>Workspace Settings</h2>
          <button className="modal__close" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </header>

        <div className="modal__body">
          <section className="modal__section">
            <h3>User Context</h3>
            <label className="modal__label" htmlFor="user-id-input">
              User ID
            </label>
            <input
              id="user-id-input"
              className="modal__input"
              value={draftUserId}
              onChange={(event) => setDraftUserId(event.target.value)}
              placeholder="e.g. analyst-01"
            />
            <div className="modal__row">
              <button
                className="modal__ghost"
                onClick={handleLoadExisting}
                disabled={loadingExisting}
              >
                {loadingExisting ? 'Loading…' : 'Load Saved Layout'}
              </button>
            </div>
            {loadMessage && <p className="modal__hint">{loadMessage}</p>}
            <p className="modal__hint">Settings are stored per user ID.</p>
          </section>

          <section className="modal__section">
            <div className="modal__section-heading">
              <h3>Tabs</h3>
              <button className="modal__ghost" onClick={handleAddTab}>
                + Add Tab
              </button>
            </div>

            <div className="modal__tabs">
              {draftTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`modal__tab ${tab.id === editingTabId ? 'modal__tab--active' : ''}`}
                  onClick={() => setEditingTabId(tab.id)}
                >
                  {tab.name || 'Untitled'}
                </button>
              ))}
            </div>

            {editingTab && (
              <div className="modal__tab-details">
                <label className="modal__label" htmlFor="tab-name-input">
                  Tab Name
                </label>
                <input
                  id="tab-name-input"
                  className="modal__input"
                  value={editingTab.name}
                  onChange={(event) => handleRenameTab(editingTab.id, event.target.value)}
                  placeholder="Overview"
                />

                <div className="modal__row">
                  <label className="modal__checkbox">
                    <input
                      type="radio"
                      name="default-tab"
                      checked={draftActiveTabId === editingTab.id}
                      onChange={() => setDraftActiveTabId(editingTab.id)}
                    />
                    Set as default tab
                  </label>
                  <button
                    className="modal__ghost modal__ghost--danger"
                    onClick={() => handleRemoveTab(editingTab.id)}
                    disabled={draftTabs.length <= 1}
                  >
                    Remove Tab
                  </button>
                </div>

                <div className="modal__tiles">
                  {editingTab.tiles.map((tile) => (
                    <div key={tile.id} className="modal__tile-card">
                      <header className="modal__tile-card-header">
                        <h4>Tile</h4>
                        <button
                          className="modal__ghost"
                          onClick={() => handleRemoveTile(editingTab.id, tile.id)}
                          disabled={editingTab.tiles.length <= 1}
                        >
                          Remove
                        </button>
                      </header>

                      <label className="modal__label" htmlFor={`symbol-${tile.id}`}>
                        Symbol
                      </label>
                      <select
                        id={`symbol-${tile.id}`}
                        className="modal__input"
                        value={tile.symbolTicker}
                        onChange={(event) => handleSymbolChange(editingTab.id, tile.id, event.target.value)}
                      >
                        {symbols.map((symbol) => (
                          <option key={symbol.ticker} value={symbol.ticker}>
                            {symbol.ticker} - {symbol.name}
                          </option>
                        ))}
                      </select>

                      <div className="modal__indicator-group">
                        <span>Main Indicators</span>
                        <div className="modal__indicator-options">
                          {indicatorCatalog.main.map((indicator) => (
                            <label key={indicator} className="modal__checkbox">
                              <input
                                type="checkbox"
                                checked={tile.indicators.main.includes(indicator)}
                                onChange={() => toggleIndicator(editingTab.id, tile.id, indicator, 'main')}
                              />
                              {indicator}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="modal__indicator-group">
                        <span>Sub Indicators</span>
                        <div className="modal__indicator-options">
                          {indicatorCatalog.sub.map((indicator) => (
                            <label key={indicator} className="modal__checkbox">
                              <input
                                type="checkbox"
                                checked={tile.indicators.sub.includes(indicator)}
                                onChange={() => toggleIndicator(editingTab.id, tile.id, indicator, 'sub')}
                              />
                              {indicator}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    className="modal__ghost"
                    onClick={() => handleAddTile(editingTab.id)}
                    disabled={editingTab.tiles.length >= MAX_TILES_PER_TAB}
                    title={editingTab.tiles.length >= MAX_TILES_PER_TAB ? `Maximum of ${MAX_TILES_PER_TAB} tiles per tab` : undefined}
                  >
                    + Add Tile
                  </button>
                  {editingTab.tiles.length >= MAX_TILES_PER_TAB && (
                    <p className="modal__hint">Maximum of {MAX_TILES_PER_TAB} tiles per tab.</p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        <footer className="modal__footer">
          <button className="modal__ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="modal__primary" onClick={handleApply}>
            Save Changes
          </button>
        </footer>
      </div>
    </div>
  )
}

