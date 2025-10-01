import type { Preferences } from '../types'

const STORAGE_KEY = 'internal-tv:mock-db'
const DEFAULT_LATENCY_MS = 120

interface PreferencesRow {
  preferences: Preferences
  updatedAt: string
}

type PreferencesTable = Record<string, PreferencesRow>

let cachedTable: PreferencesTable | null = null

function delay(ms = DEFAULT_LATENCY_MS) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function readFromStorage(): PreferencesTable {
  if (cachedTable) {
    return { ...cachedTable }
  }

  let table: PreferencesTable = {}
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        table = JSON.parse(raw) as PreferencesTable
      }
    } catch (error) {
      console.warn('[MockDB] Failed to read preferences from storage.', error)
    }
  }

  cachedTable = table
  return { ...table }
}

function writeToStorage(table: PreferencesTable) {
  cachedTable = { ...table }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(table))
    } catch (error) {
      console.warn('[MockDB] Failed to persist preferences to storage.', error)
    }
  }
}

export async function getUserPreferences(userId: string): Promise<Preferences | null> {
  await delay()
  const table = readFromStorage()
  return table[userId]?.preferences ?? null
}

export async function saveUserPreferences(userId: string, preferences: Preferences): Promise<void> {
  await delay()
  const table = readFromStorage()
  table[userId] = {
    preferences,
    updatedAt: new Date().toISOString(),
  }
  writeToStorage(table)
}

export async function deleteUserPreferences(userId: string): Promise<void> {
  await delay()
  const table = readFromStorage()
  if (userId in table) {
    delete table[userId]
    writeToStorage(table)
  }
}
