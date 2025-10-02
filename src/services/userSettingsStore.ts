import type { Preferences } from '../types'

const API_BASE = import.meta.env.VITE_SETTINGS_API ?? 'http://localhost:4000/api'

const cache = new Map<string, Preferences>()

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
  if (cache.has(userId)) {
    return cache.get(userId) ?? null
  }

  try {
    const payload = await request<{ preferences: Preferences }>(`/settings/${encodeURIComponent(userId)}`)
    cache.set(userId, payload.preferences)
    return payload.preferences
  } catch (error) {
    if ((error as { code?: number }).code === 404) {
      cache.set(userId, undefined as unknown as Preferences)
      return null
    }
    throw error
  }
}

export async function saveUserPreferences(userId: string, preferences: Preferences): Promise<void> {
  cache.set(userId, preferences)
  await request<void>(`/settings/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify({ preferences }),
  })
}

export async function deleteUserPreferences(userId: string): Promise<void> {
  cache.delete(userId)
  await request<void>(`/settings/${encodeURIComponent(userId)}`, { method: 'DELETE' }).catch((error) => {
    if ((error as { code?: number }).code !== 404) {
      throw error
    }
  })
}
