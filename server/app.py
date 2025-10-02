import json
import sqlite3
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent
DB_DIR = BASE_DIR / 'data'
DB_PATH = DB_DIR / 'settings.db'

DB_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
CORS(app)

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
"""

with sqlite3.connect(DB_PATH) as conn:
    conn.execute(CREATE_TABLE_SQL)
    conn.commit()


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@app.get('/api/health')
def health() -> Any:
    return jsonify({"status": "ok"})


@app.get('/api/settings/<user_id>')
def get_settings(user_id: str) -> Any:
    user_id = user_id.strip()
    if not user_id:
        return jsonify({"error": "User ID is required."}), 400

    with get_db_connection() as conn:
        row = conn.execute(
            'SELECT payload FROM user_preferences WHERE user_id = ?',
            (user_id,),
        ).fetchone()

    if row is None:
        return jsonify({"error": "Preferences not found."}), 404

    try:
        preferences = json.loads(row['payload'])
    except json.JSONDecodeError:
        return jsonify({"error": "Corrupted preferences data."}), 500

    return jsonify({"userId": user_id, "preferences": preferences})


@app.put('/api/settings/<user_id>')
def put_settings(user_id: str) -> Any:
    user_id = user_id.strip()
    if not user_id:
        return jsonify({"error": "User ID is required."}), 400

    payload = request.get_json(silent=True) or {}
    preferences = payload.get('preferences')
    if not isinstance(preferences, dict):
        return jsonify({"error": "Request body must include a preferences object."}), 400

    record = (
        user_id,
        json.dumps(preferences, separators=(',', ':')),
        request.headers.get('X-Request-Time', '') or _iso_timestamp(),
    )

    upsert_sql = (
        "INSERT INTO user_preferences (user_id, payload, updated_at) VALUES (?, ?, ?)"
        " ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
    )

    with get_db_connection() as conn:
        conn.execute(upsert_sql, record)
        conn.commit()

    return ('', 204)


@app.delete('/api/settings/<user_id>')
def delete_settings(user_id: str) -> Any:
    user_id = user_id.strip()
    if not user_id:
        return jsonify({"error": "User ID is required."}), 400

    with get_db_connection() as conn:
        conn.execute('DELETE FROM user_preferences WHERE user_id = ?', (user_id,))
        conn.commit()

    return ('', 204)


def _iso_timestamp() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=4000, debug=False)
