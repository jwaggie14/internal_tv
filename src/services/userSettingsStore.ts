import type { Preferences } from '../types'

const API_BASE = import.meta.env.VITE_SETTINGS_API ?? 'http://localhost:4000/api'

const cache = new Map<string, Preferences | null>()

function normalizeUserId(userId: string): string {
  return userId.trim()
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (response.status === 404) {
    throw Object.assign(new Error('NOT_FOUND'), { code: 404 })
  }

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText)
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function getUserPreferences(userId: string): Promise<Preferences | null> {
  const normalized = normalizeUserId(userId)
  if (!normalized) {
    return null
  }

  if (cache.has(normalized)) {
    return cache.get(normalized) ?? null
  }

  try {
    const payload = await request<{ preferences: Preferences }>(`/settings/${encodeURIComponent(normalized)}`)
    cache.set(normalized, payload.preferences)
    return payload.preferences
  } catch (error) {
    if ((error as { code?: number }).code === 404) {
      cache.set(normalized, null)
      return null
    }
    throw error
  }
}

export async function saveUserPreferences(userId: string, preferences: Preferences): Promise<void> {
  const normalized = normalizeUserId(userId)
  if (!normalized) {
    throw new Error('User ID is required to save preferences.')
  }

  cache.set(normalized, preferences)
  await request<void>(`/settings/${encodeURIComponent(normalized)}`, {
    method: 'PUT',
    body: JSON.stringify({ preferences }),
  })
}

export async function deleteUserPreferences(userId: string): Promise<void> {
  const normalized = normalizeUserId(userId)
  if (!normalized) {
    return
  }

  cache.delete(normalized)
  await request<void>(`/settings/${encodeURIComponent(normalized)}`, { method: 'DELETE' }).catch((error) => {
    if ((error as { code?: number }).code !== 404) {
      throw error
    }
  })
}
