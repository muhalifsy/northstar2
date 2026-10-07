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

## Where things live (front end, native ES modules, no bundler)

- `app.js` — entry only: `bindEvents()` + `boot()`. Loaded as `app.js?v=...`, so
  **no module may import from `app.js`** (a second URL = a second copy that runs
  `bindEvents()` before `state` exists). Shell-level functions go in `js/shell.js`.
- `js/state.js` constants, `elements`, `state` · `js/util.js` format/date helpers
- `js/shell.js` boot, show app/auth, active view, preloads · `js/auth.js` login/register/admin
- `js/api.js` apiFetch/authFetch, load/persist portfolios · `js/settings.js` tax, rebuy, manual values, calculated cache
- `js/positions.js` FIFO, cycles, deposit shadow, P/L cells, summaries (shared ABD/TR/crypto)
- `js/abd.js` · `js/tr.js` · `js/crypto.js` per-market rows, edit forms, prices/candles
- `js/interest.js` deposit / USD carry accrual · `js/splits.js` split page + split fields
- `js/cashflow.js` cash-flow tab, status strip · `js/performance.js` performance chart, value-at-date
- `js/quarter.js` years/quarter tables + charts · `js/audit.js` audit rows · `js/charts.js` SVG candles/lines, ticks

## Phone layout

There is no separate mobile site. `mobile.css` (loaded after `style.css`)
reshapes the same markup for phones: position rows become cards, the tabs
become a bottom bar, wide tables scroll inside their panel. Its media query —
`(max-width: 720px), (pointer: coarse) and (max-height: 500px)` — is mirrored
by `isPhoneLayout()` in `js/util.js` for the few JS spots that must know
(chart width/labels in `js/quarter.js`). Edit-form inputs sit in
`<label class="edit-field" data-label>` wrappers, which are `display: contents`
on desktop. Desktop must stay pixel-identical: put phone rules in `mobile.css`,
not `style.css`. `manifest.webmanifest` makes it installable to the home screen.

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
curl -s https://northstar2.suleymannet.workers.dev/mobile.css | tr -d '\r' | diff -q <(tr -d '\r' < mobile.css) - >/dev/null || echo "DIFF mobile.css"
for f in js/*.js; do curl -s "https://northstar2.suleymannet.workers.dev/$f" | tr -d '\r' | diff -q <(tr -d '\r' < "$f") - >/dev/null || echo "DIFF $f"; done
```

After deploying front-end changes, open the site in a fresh tab and check the
console — a module load error leaves the page blank without a server error.

If these diffs show large unexpected differences before you've made any edits,
STOP — you are probably in the wrong directory or the live site has changes
not yet pulled. Do not deploy until the discrepancy is understood.

`git status` should also be clean (or only contain your intended edits) before
deploying.
