# Northstar Portfolio — canonical project

This is the **only** working copy of this app. It is a git repo (`git remote -v`
to confirm) and has `wrangler.toml`. Any other `yatırım_takip*` folder on this
machine is stale/abandoned — do not edit or deploy from it.

- Live URL: https://northstar2.suleymannet.workers.dev
- Cloudflare Worker name: `northstar2`
- D1 database: `northstar2` (binding `DB`)
- Deploy: `wrangler deploy` from this directory. Pushing to `main` also deploys
  (Cloudflare Workers Builds is connected to the GitHub repo).

## Where things live (worker)

Open only the module you need — don't read the whole tree.

- `_worker.js` — router (`export default` fetch/scheduled) and cron entry only
- `worker/http.js` json / cors / parseBody · `worker/util.js` date + symbol helpers
- `worker/auth.js` register/login/session/admin, `requireUser`, seed owner
- `worker/db.js` `ensure*Db` table setup (+ manual corporate actions)
- `worker/portfolio.js` portfolio / settings / calculated-cache / TR / crypto / cash-flow handlers + seeding
- `worker/market/quotes.js` current prices (Yahoo, Stooq, TradingView BIST, BTC-TRY)
- `worker/market/candles.js` candle/history endpoints, D1 candle cache
- `worker/market/crypto.js` crypto prices + history (Yahoo, Binance, CoinGecko, CoinPaprika)
- `worker/market/rates.js` USD/TRY rates, GS3M, TCMB TL deposit curve, yields
- `worker/market/tr-sources.js` ALTINS1 / DMLKT / CCCX / Investing / Döviz / HisseNet scrapers
- `worker/market/splits.js` split scan · `worker/data/` seeds and built-in fallback series

`worker/` is in `.assetsignore` — anything under it must never be served publicly.

## Before every deploy

Diff local files against the live site first — do not trust that the local
working tree matches what's deployed:

```
curl -s https://northstar2.suleymannet.workers.dev/ -o /tmp/live_index.html
curl -s https://northstar2.suleymannet.workers.dev/app.js -o /tmp/live_app.js
curl -s https://northstar2.suleymannet.workers.dev/style.css -o /tmp/live_style.css
diff <(tr -d '\r' < index.html) <(tr -d '\r' < /tmp/live_index.html)
diff <(tr -d '\r' < app.js) <(tr -d '\r' < /tmp/live_app.js)
diff <(tr -d '\r' < style.css) <(tr -d '\r' < /tmp/live_style.css)
```

If these diffs show large unexpected differences before you've made any edits,
STOP — you are probably in the wrong directory or the live site has changes
not yet pulled. Do not deploy until the discrepancy is understood.

`git status` should also be clean (or only contain your intended edits) before
deploying.
