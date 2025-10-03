import csv
import json
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from flask import Flask, jsonify, request
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
PUBLIC_DIR = ROOT_DIR / 'public'
CSV_PATH = PUBLIC_DIR / 'data.csv'
DB_DIR = BASE_DIR / 'data'
DB_PATH = DB_DIR / 'settings.db'

DB_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
CORS(app)

CREATE_PREFS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
"""

CREATE_PRICES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS prices (
  symbol TEXT NOT NULL,
  published_date TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  PRIMARY KEY (symbol, published_date)
);
"""

with sqlite3.connect(DB_PATH) as conn:
    conn.execute(CREATE_PREFS_TABLE_SQL)
    conn.execute(CREATE_PRICES_TABLE_SQL)
    conn.commit()


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def normalize_symbol(symbol: str) -> str:
    return symbol.strip()


DATE_INPUT_FORMATS: Tuple[str, ...] = (
    '%Y-%m-%d',
    '%Y/%m/%d',
    '%m/%d/%Y',
    '%m/%d/%y',
)


def _normalize_row(row: Dict[str, str]) -> Dict[str, str]:
    return {
        (key or '').strip().lower(): (value or '').strip()
        for key, value in row.items()
    }


def _parse_timestamp(value: str) -> Tuple[int, str]:
    text = (value or '').strip()
    if not text:
        raise ValueError('empty date value')

    normalized = text.replace('Z', '+00:00')

    parsed: Optional[datetime] = None
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        for fmt in DATE_INPUT_FORMATS:
            try:
                parsed = datetime.strptime(text, fmt)
                break
            except ValueError:
                continue
    if parsed is None:
        raise ValueError('unsupported date format')

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    else:
        parsed = parsed.astimezone(timezone.utc)

    day_key = parsed.date().isoformat()
    midnight = datetime(parsed.year, parsed.month, parsed.day, tzinfo=timezone.utc)
    timestamp_ms = int(midnight.timestamp() * 1000)
    return timestamp_ms, day_key


def ensure_price_data_loaded() -> None:
    if not CSV_PATH.exists():
        app.logger.warning("data.csv not found at %s", CSV_PATH)
        return

    app.logger.info("Loading price data from %s", CSV_PATH)

    rows_by_symbol: Dict[str, List[Tuple[int, str, float]]] = defaultdict(list)

    with CSV_PATH.open('r', encoding='utf-8-sig', newline='') as csv_file:
        reader = csv.DictReader(csv_file)
        if reader.fieldnames is None:
            app.logger.warning('data.csv missing header row; prices not updated')
            return

        normalized_headers = { (name or '').strip().lower() for name in reader.fieldnames }
        required = {'symbol', 'publisheddate', 'price'}
        missing = required.difference(normalized_headers)
        if missing:
            raise RuntimeError(f'data.csv must include columns: {", ".join(sorted(required))}. Missing: {", ".join(sorted(missing))}.')

        for line_number, raw_row in enumerate(reader, start=2):
            row = _normalize_row(raw_row)

            symbol = normalize_symbol(row.get('symbol', ''))
            if not symbol:
                app.logger.debug('Skipping row %s: missing symbol', line_number)
                continue

            try:
                timestamp_ms, day_key = _parse_timestamp(row.get('publisheddate', ''))
            except ValueError:
                app.logger.debug('Skipping row %s: invalid published date %r', line_number, row.get('publisheddate'))
                continue

            try:
                close_price = float(row.get('price') or '')
            except ValueError:
                app.logger.debug('Skipping row %s: invalid price %r', line_number, row.get('price'))
                continue

            rows_by_symbol[symbol].append((timestamp_ms, day_key, close_price))

    if not rows_by_symbol:
        app.logger.warning('No price rows were parsed from %s; prices table not updated.', CSV_PATH)
        return

    price_rows: List[Tuple[str, str, int, float, float, float, float]] = []
    for symbol, entries in rows_by_symbol.items():
        entries.sort(key=lambda item: item[0])

        previous_close = entries[0][2]
        for index, (timestamp_ms, day_key, close_price) in enumerate(entries):
            open_price = previous_close if index > 0 else close_price
            high_price = max(open_price, close_price)
            low_price = min(open_price, close_price)

            price_rows.append((
                symbol,
                day_key,
                timestamp_ms,
                open_price,
                high_price,
                low_price,
                close_price,
            ))

            previous_close = close_price

    with get_db_connection() as conn:
        conn.execute('DELETE FROM prices')
        conn.executemany(
            'INSERT OR REPLACE INTO prices (symbol, published_date, timestamp, open, high, low, close) '
            'VALUES (?, ?, ?, ?, ?, ?, ?)',
            price_rows,
        )
        conn.commit()

    app.logger.info('Loaded %s price rows across %s symbols.', len(price_rows), len(rows_by_symbol))


@app.get('/api/health')
def health() -> Any:
    return jsonify({"status": "ok"})


@app.get('/api/symbols')
def get_symbols() -> Any:
    with get_db_connection() as conn:
        rows = conn.execute('SELECT DISTINCT symbol FROM prices ORDER BY symbol').fetchall()

    symbols = [normalize_symbol(row['symbol']) for row in rows]
    payload = [
        {
            'ticker': symbol,
            'shortName': symbol,
            'name': symbol,
            'type': 'custom',
            'pricePrecision': 2,
            'volumePrecision': 0,
        }
        for symbol in symbols
    ]
    return jsonify(payload)


@app.get('/api/prices')
def get_prices() -> Any:
    symbol = request.args.get('symbol')

    conditions = []
    params = []

    if symbol:
        conditions.append('symbol = ?')
        params.append(normalize_symbol(symbol))

    where_clause = ''
    if conditions:
        where_clause = ' WHERE ' + ' AND '.join(conditions)

    query = (
        'SELECT symbol, timestamp, open, high, low, close '
        'FROM prices'
        f'{where_clause} '
        'ORDER BY symbol, timestamp'
    )

    with get_db_connection() as conn:
        rows = conn.execute(query, params).fetchall()

    series = {}
    for row in rows:
        payload = {
            'timestamp': row['timestamp'],
            'open': row['open'],
            'high': row['high'],
            'low': row['low'],
            'close': row['close'],
        }
        series.setdefault(row['symbol'], []).append(payload)

    symbols_payload = [
        {
            'ticker': symbol,
            'shortName': symbol,
            'name': symbol,
            'type': 'custom',
            'pricePrecision': 2,
            'volumePrecision': 0,
        }
        for symbol in series.keys()
    ]

    return jsonify({'symbols': symbols_payload, 'series': series})


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


@app.post('/api/prices/reload')
def reload_prices() -> Any:
    ensure_price_data_loaded()
    return ('', 204)


def _iso_timestamp() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()
ensure_price_data_loaded()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=4000, debug=False)
