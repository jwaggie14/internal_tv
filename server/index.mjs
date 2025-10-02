import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DB_PATH = resolve(__dirname, 'data', 'settings.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.prepare(`
  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`).run()

const selectPreference = db.prepare('SELECT payload FROM user_preferences WHERE user_id = ?')
const upsertPreference = db.prepare(`
  INSERT INTO user_preferences (user_id, payload, updated_at)
  VALUES (@userId, @payload, @updatedAt)
  ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
`)

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const PORT = process.env.PORT ?? 4000

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/settings/:userId', (req, res) => {
  const userId = req.params.userId.trim()
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' })
  }
  const row = selectPreference.get(userId)
  if (!row) {
    return res.status(404).json({ error: 'Preferences not found.' })
  }
  try {
    const preferences = JSON.parse(row.payload)
    res.json({ userId, preferences })
  } catch (error) {
    console.error('Failed to parse stored preferences for user', userId, error)
    res.status(500).json({ error: 'Corrupted preferences data.' })
  }
})

app.put('/api/settings/:userId', (req, res) => {
  const userId = req.params.userId.trim()
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' })
  }

  const { preferences } = req.body ?? {}
  if (typeof preferences !== 'object' || preferences === null) {
    return res.status(400).json({ error: 'Request body must include a preferences object.' })
  }

  try {
    upsertPreference.run({
      userId,
      payload: JSON.stringify(preferences),
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Failed to persist preferences', error)
    return res.status(500).json({ error: 'Failed to persist preferences.' })
  }

  res.status(204).end()
})

app.delete('/api/settings/:userId', (req, res) => {
  const userId = req.params.userId.trim()
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' })
  }
  try {
    db.prepare('DELETE FROM user_preferences WHERE user_id = ?').run(userId)
  } catch (error) {
    console.error('Failed to delete preferences', error)
    return res.status(500).json({ error: 'Failed to delete preferences.' })
  }
  res.status(204).end()
})

app.listen(PORT, () => {
  console.log(`Settings API listening on http://localhost:${PORT}`)
})

