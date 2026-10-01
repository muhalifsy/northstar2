import { nowIso, normalizeMarketSymbol } from "./util.js";

const MANUAL_CORPORATE_ACTIONS = [
  {
    symbol: "HEKTS.IS",
    date: "2022-10-12",
    factor: 2.9418604,
    actionType: "rights-bonus",
    label: "150% rights issue + 44.18604% bonus issue",
  },
  {
    symbol: "HEKTS.IS",
    date: "2024-09-18",
    factor: 3.3320158,
    actionType: "rights",
    label: "233.20158% rights issue",
  },
];

let cashFlowDbReady = false;

let marketDataDbReady = false;

let trPortfolioDbReady = false;

let cryptoPortfolioDbReady = false;

let marketSplitsDbReady = false;

let portfolioDbReady = false;

let userSettingsDbReady = false;

let calculatedCacheDbReady = false;

export function ensureDb(env) {
  if (!env.DB) {
    throw new Error("DB binding is missing.");
  }
}

export async function ensureCashFlowDb(env) {
  ensureDb(env);
  if (cashFlowDbReady) return;

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS cash_flow_movements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      currency TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cash_flow_user_date
    ON cash_flow_movements(user_id, date);
  `).run();

  cashFlowDbReady = true;
}

export async function ensurePortfolioDb(env) {
  ensureDb(env);
  if (portfolioDbReady) return;

  await env.DB.prepare("ALTER TABLE transactions ADD COLUMN split_date TEXT DEFAULT ''").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE transactions ADD COLUMN split_factor REAL").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE transactions ADD COLUMN split_shares REAL").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE transactions ADD COLUMN split_total REAL").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE transactions ADD COLUMN split_approved INTEGER DEFAULT 0").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE transactions ADD COLUMN dividend_quantity REAL").run().catch(() => {});

  portfolioDbReady = true;
}

export async function ensureUserSettingsDb(env) {
  ensureDb(env);
  if (userSettingsDbReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();
  userSettingsDbReady = true;
}

export async function ensureCalculatedCacheDb(env) {
  ensureDb(env);
  if (calculatedCacheDbReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS calculated_cache (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();
  calculatedCacheDbReady = true;
}

export async function ensureTrPortfolioDb(env) {
  ensureDb(env);
  if (trPortfolioDbReady) return;

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS tr_portfolio_rows (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      buy_date TEXT NOT NULL,
      sell_date TEXT NOT NULL DEFAULT '',
      quantity REAL,
      sell_quantity REAL,
      split_factor_applied REAL DEFAULT 1,
      buy_total REAL,
      sell_total REAL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();

  await env.DB.prepare("ALTER TABLE tr_portfolio_rows ADD COLUMN sell_quantity REAL").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE tr_portfolio_rows ADD COLUMN split_factor_applied REAL DEFAULT 1").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE tr_portfolio_rows ADD COLUMN split_date TEXT DEFAULT ''").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE tr_portfolio_rows ADD COLUMN split_factor REAL").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE tr_portfolio_rows ADD COLUMN split_quantity REAL").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE tr_portfolio_rows ADD COLUMN split_buy_total REAL").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE tr_portfolio_rows ADD COLUMN split_approved INTEGER DEFAULT 0").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE tr_portfolio_rows ADD COLUMN dividend_quantity REAL").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE tr_portfolio_rows ADD COLUMN group_id TEXT DEFAULT ''").run().catch(() => {});

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_tr_portfolio_user_date
    ON tr_portfolio_rows(user_id, sell_date, buy_date);
  `).run();

  trPortfolioDbReady = true;
}

export async function ensureCryptoPortfolioDb(env) {
  ensureDb(env);
  if (cryptoPortfolioDbReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS crypto_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      quantity REAL NOT NULL,
      total REAL NOT NULL,
      price REAL,
      chain_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_crypto_transactions_user_date
    ON crypto_transactions(user_id, date);
  `).run();
  cryptoPortfolioDbReady = true;
}

export async function ensureMarketDataDb(env) {
  ensureDb(env);
  if (marketDataDbReady) return;

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS market_data_points (
      series TEXT NOT NULL,
      date TEXT NOT NULL,
      rate REAL NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (series, date)
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS market_candles (
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (symbol, date)
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_market_candles_symbol_date
    ON market_candles(symbol, date)
  `).run();

  marketDataDbReady = true;
}

export async function ensureMarketSplitsDb(env) {
  ensureDb(env);
  if (marketSplitsDbReady) return;

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS market_splits (
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      factor REAL NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      action_type TEXT NOT NULL DEFAULT 'split',
      label TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (symbol, date)
    )
  `).run();

  await env.DB.prepare("ALTER TABLE market_splits ADD COLUMN action_type TEXT NOT NULL DEFAULT 'split'").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE market_splits ADD COLUMN label TEXT NOT NULL DEFAULT ''").run().catch(() => {});

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_market_splits_symbol_date
    ON market_splits(symbol, date)
  `).run();

  await seedManualCorporateActions(env);

  marketSplitsDbReady = true;
}

async function seedManualCorporateActions(env) {
  await env.DB.batch(MANUAL_CORPORATE_ACTIONS.map((event) =>
    env.DB.prepare(
      "INSERT OR REPLACE INTO market_splits (symbol, date, factor, source, action_type, label, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      normalizeMarketSymbol(event.symbol),
      event.date,
      Number(event.factor),
      "Manual",
      event.actionType || "corporate-action",
      event.label || "",
      nowIso()
    )
  ));
}
