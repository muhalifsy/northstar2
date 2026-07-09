# Northstar Portfolio

A self-hosted, multi-asset personal portfolio tracker that runs entirely on
the Cloudflare edge — Turkish equities (BIST), US equities, crypto, and cash
flow in one place. Frontend and API ship as a single Cloudflare Pages deploy
backed by a D1 (SQLite) database. No servers to run, no build step, vanilla JS.

> Northstar is a personal-finance **application**, not a library. It is open
> source so others can self-host their own instance and learn from the edge
> patterns it uses (single-request bulk pricing, provider fallback chains,
> D1-materialized candles). Your own financial data lives only in *your* D1
> database — nothing personal ships in this repository.

## Features

- **Multi-asset tracking** — BIST (Turkey), US stocks, crypto, and cash-flow
  accounts, each with its own transaction ledger and cost-basis logic.
- **Live pricing with fallback chains** — quotes and historical candles are
  pulled from multiple providers with automatic failover:
  - Crypto: CoinGecko (pro/demo) → Binance → CoinPaprika
  - US/BIST equities: Yahoo Finance, Stooq, TradingView scanner (bulk BIST)
  - FX & yields: TCMB (Turkish central bank XML), FRED, Federal Reserve
- **Edge-efficient market data** — bulk price fetches (up to ~250 symbols in a
  single subrequest), incremental candle refresh, and a daily cron backfill
  keep Cloudflare subrequest usage low.
- **Corporate actions** — automatic stock-split detection and lot adjustment,
  dividend tracking, and merge-group lot identity for crypto.
- **Analytics** — cost basis, realized/unrealized P&L, and opportunity-cost
  vs. a risk-free deposit return.
- **Auth & multi-user** — session-based auth with an admin approval flow.

## Architecture

| File | Role |
|------|------|
| `index.html`, `app.js`, `style.css`, `favicon.png` | Static frontend (vanilla JS, no framework, no bundler) |
| `_worker.js` | Pages Advanced Mode worker — serves `/api/*`, static assets otherwise |
| `schema.sql` | Initial D1 schema (other tables auto-create on first request) |
| `wrangler.toml` | Worker name, D1 binding, and the daily `0 6 * * *` cron |

The worker exposes a small REST API (`/api/portfolio`, `/api/quotes`,
`/api/candles`, `/api/splits`, `/api/rates`, `/api/auth/*`, …). The database
binding name is `DB`.

## Setup (one time)

1. Create an empty D1 database:
   ```
   wrangler d1 create northstar-v2
   ```
2. Load the schema:
   ```
   wrangler d1 execute northstar-v2 --remote --file=schema.sql
   ```
3. In the Cloudflare Pages dashboard → **Settings → Functions → D1 bindings**,
   add: variable name `DB` → your `northstar-v2` database.
4. *(Optional)* Provide provider API keys as environment secrets for higher
   rate limits: `COINGECKO_PRO_API_KEY` / `COINGECKO_DEMO_API_KEY`,
   `COINPAPRIKA_API_KEY`. The app degrades gracefully to public endpoints
   without them.
5. *(Optional)* `SEED_OWNER_USERNAME` — username that seed data is attached to.

## Deploy

Every `git push` triggers an automatic Cloudflare Pages deploy. Manual deploy:
```
wrangler pages deploy . --project-name=northstar-v2
```

## Development

Local preview with a real edge runtime:
```
wrangler pages dev .
```

## Tech stack

Cloudflare Pages (Advanced Mode) · Cloudflare D1 (SQLite) · Cloudflare Cron
Triggers · Vanilla JavaScript (no framework, no build step).

## License

[MIT](LICENSE)
