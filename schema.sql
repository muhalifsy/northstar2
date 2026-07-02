-- Northstar Portfolio — D1 initial schema
-- Run once on a new D1 database:
--   wrangler d1 execute <DB_NAME> --remote --file=schema.sql
--
-- Other tables (cash_flow_movements, tr_portfolio_rows, crypto_transactions,
-- user_settings, calculated_cache, market_data_points, market_candles,
-- market_splits) are auto-created by the Worker on first request.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  is_admin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  pcs REAL,
  price REAL,
  amount REAL,
  fee REAL,
  total REAL,
  note TEXT NOT NULL DEFAULT '',
  chain_id TEXT,
  split_date TEXT DEFAULT '',
  split_factor REAL,
  split_shares REAL,
  split_total REAL,
  split_approved INTEGER DEFAULT 0,
  dividend_quantity REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
