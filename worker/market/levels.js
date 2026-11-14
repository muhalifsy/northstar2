import { nowIso, addIsoDays, isoDaysAgo, normalizeMarketSymbol } from "../util.js";
import { json } from "../http.js";
import { requireUser } from "../auth.js";
import { ensureDb, ensureMarketDataDb, ensureUserSettingsDb } from "../db.js";
import { refreshHistoricalCandles, getCachedMarketCandles, saveMarketCandles, toCandleDate, fetchYahooHistoricalDailyCandles } from "./candles.js";
import { fetchOkxDailyCandles } from "./crypto.js";
import { fetchTradingViewBistBulkPrices } from "./quotes.js";
import { computeLevels, closedCandles } from "./levels-calc.js";

// Levels page: a user's own ticker list (BIST / USA / crypto) with the current
// price, moving averages and support / resistance levels of each ticker.
//
// The list and the view choices live in user_settings (key "levels"). The
// levels of a ticker change once a day, so they are computed here from closed
// daily candles and kept in market_meta ("levels:<market>:<series>"); a page
// load reads one small row per ticker and fetches only the current prices.
// A stored entry is recomputed when its market's day has moved on. Only a few
// tickers are recomputed per request (D1 query and subrequest limits); the
// response says how many are still waiting and the page asks again.
//
// Candles: USA and BIST share the portfolio pages' series (Yahoo and the TR
// sources). Crypto uses OKX spot <BASE>-USDT with UTC days, stored as its own
// series, because that is the feed the page was specified against.

const SETTINGS_KEY = "levels";
const META_PREFIX = "levels:";
const ENTRY_VERSION = 2;
const MAX_TICKERS = 50;
const REFRESH_PER_REQUEST = 3;
// Enough closed candles for a settled EMA200 and the 52-week range.
const HISTORY_DAYS = 790;
const TAIL_DAYS = 6;

const MARKETS = {
  bist: { zone: "Europe/Istanbul", closeMinutes: 18 * 60 + 30, yearWindow: 252 },
  usa: { zone: "America/New_York", closeMinutes: 16 * 60 + 30, yearWindow: 252 },
  crypto: { zone: "UTC", closeMinutes: null, yearWindow: 365 },
};

export const LEVEL_KEYS = [
  "dk", "fib", "tk",
  "ma7", "ma25", "ma50", "ma100", "ma200",
  "ema20", "ema50", "ema200",
  "prevClose", "range52",
];
const DEFAULT_SHOW = ["dk", "fib", "tk", "ma7", "ma200"];
const SORTS = ["added", "market", "ticker", "nearest"];


// ---- Market days ----

function zonedNow(zone, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    weekend: parts.weekday === "Sat" || parts.weekday === "Sun",
  };
}

// The first date whose daily candle is not closed yet. Stock sessions count as
// closed half an hour after the bell; crypto days close at 00:00 UTC.
function marketClock(market) {
  const config = MARKETS[market];
  const local = zonedNow(config.zone);
  const sessionOver = config.closeMinutes != null && local.minutes >= config.closeMinutes;
  const cutoff = sessionOver ? addIsoDays(local.date, 1) : local.date;
  // The newest candle that should exist, when that is certain: yesterday for
  // crypto, today for a weekday stock session that just ended.
  let expectedLast = "";
  if (market === "crypto") expectedLast = addIsoDays(local.date, -1);
  else if (sessionOver && !local.weekend) expectedLast = local.date;
  return { cutoff, expectedLast };
}


// ---- Tickers ----

function tickerId(ticker) {
  return `${ticker.market}:${ticker.symbol}`;
}

// Cleans what the user typed: { symbol, market } where market is set only when
// the text itself says so (BTC-USDT, ASELS.IS).
function parseTickerInput(text) {
  const clean = String(text || "").trim().toUpperCase().replace(/İ/g, "I").replace(/\s+/g, "");
  if (!/^[A-Z0-9.\-^=]{1,20}$/.test(clean)) return null;
  const crypto = clean.match(/^([A-Z0-9]{1,12})(-USDT|-USD|USDT)$/);
  if (crypto) return { symbol: crypto[1], market: "crypto" };
  if (clean.endsWith(".IS")) return { symbol: clean.slice(0, -3), market: "bist" };
  return { symbol: clean, market: "" };
}

function cleanTicker(value) {
  const market = String(value?.market || "");
  const parsed = parseTickerInput(value?.symbol);
  if (!MARKETS[market] || !parsed) return null;
  return { symbol: parsed.symbol, market };
}

const BIST_OWN_SERIES = new Set(["ALTINS1", "DMLKT"]);

// The series a ticker's candles are stored under in market_candles.
function seriesKey(ticker) {
  if (ticker.market === "crypto") return `${ticker.symbol}-USDT`;
  const clean = normalizeMarketSymbol(ticker.symbol);
  if (ticker.market !== "bist") return clean;
  // Same names the TR page uses: the gold certificate, the DMLKT fund and
  // .F / .G fund codes have their own series; everything else is <code>.IS.
  if (BIST_OWN_SERIES.has(clean) || clean.endsWith(".IS") || clean.includes(".F") || clean.includes(".G")) return clean;
  return `${clean}.IS`;
}

function metaKey(ticker) {
  return `${META_PREFIX}${ticker.market}:${seriesKey(ticker)}`;
}


// ---- Saved list ----

function cleanSettings(value) {
  const seen = new Set();
  const tickers = [];
  for (const item of Array.isArray(value?.tickers) ? value.tickers : []) {
    const ticker = cleanTicker(item);
    if (!ticker || seen.has(tickerId(ticker)) || tickers.length >= MAX_TICKERS) continue;
    seen.add(tickerId(ticker));
    tickers.push(ticker);
  }
  const show = Array.isArray(value?.show) ? LEVEL_KEYS.filter((key) => value.show.includes(key)) : DEFAULT_SHOW;
  const sort = SORTS.includes(value?.sort) ? value.sort : "added";
  return { tickers, show, sort };
}

async function readSettings(env, userId) {
  const row = await env.DB.prepare(
    "SELECT value FROM user_settings WHERE user_id = ? AND key = ?"
  ).bind(userId, SETTINGS_KEY).first();
  let value = null;
  try {
    value = JSON.parse(row?.value || "null");
  } catch {}
  return cleanSettings(value);
}

async function writeSettings(env, userId, settings) {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)"
  ).bind(userId, SETTINGS_KEY, JSON.stringify(settings), nowIso()).run();
}

async function signedIn(request, env) {
  ensureDb(env);
  await ensureUserSettingsDb(env);
  return requireUser(request, env);
}


// ---- Stored levels ----

async function readEntries(env, tickers) {
  const keys = [...new Set(tickers.map(metaKey))];
  const entries = new Map();
  if (!keys.length) return entries;
  const result = await env.DB.prepare(
    `SELECT key, value FROM market_meta WHERE key IN (${keys.map(() => "?").join(",")})`
  ).bind(...keys).all();
  for (const row of result.results ?? []) {
    try {
      const entry = JSON.parse(row.value);
      if (entry?.v === ENTRY_VERSION) entries.set(row.key, entry);
    } catch {}
  }
  return entries;
}

function entryIsCurrent(entry, clock) {
  if (!entry) return false;
  if (entry.retryAt) return Date.now() < Date.parse(entry.retryAt);
  return entry.cutoff === clock.cutoff;
}

const trimNumber = (value) => Number(Number(value).toPrecision(10));

// Fetches the ticker's newest candles into market_candles. A ticker computed
// before only needs its last few days again (they also replace a candle that
// was stored while its day was still open).
async function refreshCandles(env, ticker, previous) {
  const key = seriesKey(ticker);
  const start = previous?.lastDate ? addIsoDays(previous.lastDate, -TAIL_DAYS) : isoDaysAgo(HISTORY_DAYS);
  if (ticker.market !== "crypto") {
    const result = await refreshHistoricalCandles(env, key, start);
    if (result?.ok === false) throw new Error(result.error || "source fetch failed");
    return ticker.market === "bist" ? "BIST daily" : "Yahoo";
  }
  let okxError = "";
  try {
    const candles = await fetchOkxDailyCandles(ticker.symbol, start);
    if (candles.length) {
      await saveMarketCandles(env, key, candles, "OKX");
      return "OKX";
    }
    okxError = "OKX returned no candles";
  } catch (error) {
    okxError = error?.message || "OKX failed";
  }
  // A series that came from OKX is not continued from another feed.
  if (String(previous?.source || "").startsWith("OKX")) throw new Error(okxError);
  const yahooSymbol = `${ticker.symbol}-USD`;
  const candles = await fetchYahooHistoricalDailyCandles(yahooSymbol, start);
  if (!candles.length) throw new Error(`${okxError}; Yahoo ${yahooSymbol} returned no candles`);
  await saveMarketCandles(env, key, candles, `Yahoo ${yahooSymbol}`);
  return `Yahoo ${yahooSymbol}`;
}

async function buildEntry(env, ticker, previous, clock) {
  let source = previous?.source || "";
  let error = "";
  try {
    source = await refreshCandles(env, ticker, previous);
  } catch (failure) {
    error = failure?.message || "price history could not be fetched";
  }
  const stored = await getCachedMarketCandles(env, seriesKey(ticker), isoDaysAgo(HISTORY_DAYS + 10));
  const candles = closedCandles(
    stored.map((candle) => ({ date: toCandleDate(candle), open: candle.open, high: candle.high, low: candle.low, close: candle.close })),
    clock.cutoff
  );
  const result = computeLevels(candles, { yearWindow: MARKETS[ticker.market].yearWindow });
  const entry = {
    v: ENTRY_VERSION,
    cutoff: clock.cutoff,
    lastDate: result.lastDate,
    count: result.count,
    rangeDays: result.rangeDays,
    source,
    values: Object.fromEntries(Object.entries(result.values).map(([key, value]) => [key, trimNumber(value)])),
    missing: result.missing,
    fib: result.fib,
    computedAt: nowIso(),
  };
  // Try again soon when the source failed or the candle of a day that just
  // closed is not out yet; otherwise the entry holds until the next cutoff.
  const late = clock.expectedLast && result.lastDate < clock.expectedLast;
  if (error || late) {
    entry.retryAt = new Date(Date.now() + (error ? 15 : 30) * 60000).toISOString();
    if (error) entry.error = error;
  }
  // A series that stopped long ago gives levels for a price that has moved on.
  if (!entry.error && result.lastDate && result.lastDate < addIsoDays(clock.cutoff, -8)) {
    entry.error = `price history ends on ${result.lastDate}`;
    entry.retryAt = new Date(Date.now() + 6 * 3600000).toISOString();
  }
  await env.DB.prepare(
    "INSERT OR REPLACE INTO market_meta (key, value, updated_at) VALUES (?, ?, ?)"
  ).bind(metaKey(ticker), JSON.stringify(entry), entry.computedAt).run();
  return entry;
}


// ---- Current prices ----

async function yahooSparkPrices(symbols) {
  const out = new Map();
  const unique = [...new Set(symbols.filter(Boolean))];
  for (let index = 0; index < unique.length; index += 20) {
    const chunk = unique.slice(index, index + 20);
    const response = await fetch(`https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(chunk.join(","))}&range=1d&interval=1d`, {
      headers: { "user-agent": "Mozilla/5.0" },
    });
    if (!response.ok) throw new Error(`Yahoo spark failed (${response.status})`);
    const payload = await response.json().catch(() => null);
    for (const item of payload?.spark?.result ?? []) {
      const meta = item?.response?.[0]?.meta;
      const price = Number(meta?.regularMarketPrice);
      const time = Number(meta?.regularMarketTime);
      // A week covers long holiday weekends; older than that is a dead listing.
      if (Number.isFinite(price) && price > 0 && Number.isFinite(time) && Date.now() / 1000 - time < 7 * 86400) out.set(item.symbol, price);
    }
  }
  return out;
}

async function okxSpotPrices() {
  const response = await fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT", { headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`OKX tickers failed (${response.status})`);
  const payload = await response.json().catch(() => null);
  const out = new Map();
  for (const row of payload?.data ?? []) {
    const price = Number(row?.last);
    if (row?.instId && Number.isFinite(price) && price > 0) out.set(row.instId, price);
  }
  return out;
}

// Current price per ticker id. A ticker no source answers for is left out and
// the page falls back to its last close.
async function currentPrices(tickers) {
  const prices = new Map();
  const byMarket = (market) => tickers.filter((ticker) => ticker.market === market);
  const yahooLater = [];

  await Promise.allSettled([
    (async () => {
      const list = byMarket("bist");
      if (!list.length) return;
      const found = await fetchTradingViewBistBulkPrices(list.map(seriesKey)).catch(() => ({}));
      for (const ticker of list) {
        const price = found[seriesKey(ticker)];
        if (Number.isFinite(price)) prices.set(tickerId(ticker), price);
        else if (seriesKey(ticker).endsWith(".IS")) yahooLater.push([ticker, seriesKey(ticker)]);
      }
    })(),
    (async () => {
      const list = byMarket("crypto");
      if (!list.length) return;
      const found = await okxSpotPrices().catch(() => new Map());
      for (const ticker of list) {
        const price = found.get(seriesKey(ticker));
        if (Number.isFinite(price)) prices.set(tickerId(ticker), price);
        else yahooLater.push([ticker, `${ticker.symbol}-USD`]);
      }
    })(),
  ]);
  for (const ticker of byMarket("usa")) yahooLater.push([ticker, seriesKey(ticker)]);
  if (yahooLater.length) {
    const found = await yahooSparkPrices(yahooLater.map(([, symbol]) => symbol)).catch(() => new Map());
    for (const [ticker, symbol] of yahooLater) {
      const price = found.get(symbol);
      if (Number.isFinite(price)) prices.set(tickerId(ticker), price);
    }
  }
  return prices;
}


// ---- Finding a typed ticker's market ----

async function yahooListing(symbol) {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) return null;
  const meta = (await response.json().catch(() => null))?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  const time = Number(meta?.regularMarketTime);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(time) || Date.now() / 1000 - time > 10 * 86400) return null;
  return meta;
}

const MARKET_PROBES = {
  async usa(symbol) {
    const meta = await yahooListing(symbol);
    return Boolean(meta) && !["CRYPTOCURRENCY", "CURRENCY"].includes(meta.instrumentType) && meta.exchangeName !== "IST";
  },
  async bist(symbol) {
    const key = seriesKey({ symbol, market: "bist" });
    const found = await fetchTradingViewBistBulkPrices([key]).catch(() => ({}));
    if (Number.isFinite(found[key])) return true;
    return key.endsWith(".IS") && Boolean(await yahooListing(key));
  },
  // Yahoo lists thousands of dead tokens under <NAME>-USD, so it only counts
  // when the user picked crypto themselves; a typed ticker must be on OKX.
  async crypto(symbol, chosen) {
    const pair = `${symbol}-USDT`;
    const response = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(pair)}`, { headers: { "user-agent": "Mozilla/5.0" } }).catch(() => null);
    const payload = response?.ok ? await response.json().catch(() => null) : null;
    if (payload?.code === "0" && Number(payload.data?.[0]?.last) > 0) return true;
    return chosen && (await yahooListing(`${symbol}-USD`))?.instrumentType === "CRYPTOCURRENCY";
  },
};

async function marketsListing(symbol, candidates) {
  const chosen = candidates.length === 1;
  const checks = await Promise.allSettled(candidates.map((market) => MARKET_PROBES[market](symbol, chosen)));
  return candidates.filter((_, index) => checks[index].status === "fulfilled" && checks[index].value === true);
}


// ---- Handlers ----

function rowFor(ticker, entry, price, waiting) {
  return {
    id: tickerId(ticker),
    symbol: ticker.symbol,
    market: ticker.market,
    price: Number.isFinite(price) ? price : null,
    waiting,
    lastDate: entry?.lastDate || "",
    count: entry?.count || 0,
    rangeDays: entry?.rangeDays || 0,
    source: entry?.source || "",
    values: entry?.values || {},
    missing: entry?.missing || {},
    fib: entry?.fib || null,
    error: entry?.error || "",
  };
}

// GET /api/levels: the saved list with each ticker's stored levels and current
// price. Recomputes up to REFRESH_PER_REQUEST out-of-date tickers; `pending`
// counts the ones still waiting (their rows carry `waiting: true`).
export async function handleGetLevels(request, env) {
  const user = await signedIn(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  await ensureMarketDataDb(env);
  const settings = await readSettings(env, user.id);
  const clocks = Object.fromEntries(Object.keys(MARKETS).map((market) => [market, marketClock(market)]));
  const entries = await readEntries(env, settings.tickers);
  const pricesPromise = currentPrices(settings.tickers).catch(() => new Map());

  const stale = settings.tickers.filter((ticker) => !entryIsCurrent(entries.get(metaKey(ticker)), clocks[ticker.market]));
  const refreshed = new Set();
  for (const ticker of stale) {
    const key = metaKey(ticker);
    if (refreshed.has(key)) continue;
    if (refreshed.size >= REFRESH_PER_REQUEST) break;
    refreshed.add(key);
    const entry = await buildEntry(env, ticker, entries.get(key), clocks[ticker.market]).catch((error) => ({
      ...(entries.get(key) || {}), error: error?.message || "levels could not be computed",
    }));
    entries.set(key, entry);
  }
  const waitingKeys = new Set(stale.map(metaKey).filter((key) => !refreshed.has(key)));
  const prices = await pricesPromise;

  return json(request, {
    ok: true,
    tickers: settings.tickers,
    show: settings.show,
    sort: settings.sort,
    limit: MAX_TICKERS,
    pending: waitingKeys.size,
    rows: settings.tickers.map((ticker) => rowFor(ticker, entries.get(metaKey(ticker)), prices.get(tickerId(ticker)), waitingKeys.has(metaKey(ticker)))),
    fetchedAt: nowIso(),
  });
}

// PUT /api/levels { tickers?, show?, sort? }: saves the view choices, the
// order and removals. Tickers not already in the list are ignored here; new
// ones come in through POST /api/levels/add, which checks them.
export async function handlePutLevels(request, env) {
  const user = await signedIn(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json(request, { error: "Levels payload is required." }, 400);
  const current = await readSettings(env, user.id);
  const known = new Set(current.tickers.map(tickerId));
  const next = cleanSettings({
    tickers: Array.isArray(body.tickers) ? body.tickers.map(cleanTicker).filter((ticker) => ticker && known.has(tickerId(ticker))) : current.tickers,
    show: Array.isArray(body.show) ? body.show : current.show,
    sort: body.sort ?? current.sort,
  });
  await writeSettings(env, user.id, next);
  return json(request, { ok: true, ...next });
}

// POST /api/levels/add
//   { symbol }                  finds the market; { code: "choose", markets } when several list it
//   { symbol, market }          adds it in that market (still checked there)
//   { symbol, market, replace } same, taking the place of the ticker with id `replace`
//   { tickers: [{ symbol, market }] }  adds held positions as they are
export async function handleAddLevels(request, env) {
  const user = await signedIn(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  const body = await request.json().catch(() => null);
  const settings = await readSettings(env, user.id);
  const ids = new Set(settings.tickers.map(tickerId));
  const save = async (tickers) => {
    const next = cleanSettings({ ...settings, tickers });
    await writeSettings(env, user.id, next);
    return next;
  };

  if (Array.isArray(body?.tickers)) {
    const added = [];
    for (const item of body.tickers) {
      const ticker = cleanTicker(item);
      if (!ticker || ids.has(tickerId(ticker)) || settings.tickers.length + added.length >= MAX_TICKERS) continue;
      ids.add(tickerId(ticker));
      added.push(ticker);
    }
    const next = added.length ? await save([...settings.tickers, ...added]) : settings;
    return json(request, { ok: true, added: added.length, tickers: next.tickers });
  }

  const parsed = parseTickerInput(body?.symbol);
  if (!parsed) return json(request, { ok: false, error: "That does not look like a ticker." }, 400);
  const replaceId = typeof body?.replace === "string" ? body.replace : "";
  const replacing = replaceId && ids.has(replaceId);
  if (!replacing && settings.tickers.length >= MAX_TICKERS) {
    return json(request, { ok: false, error: `The list is full (${MAX_TICKERS} tickers).` }, 400);
  }
  const wanted = MARKETS[body?.market] ? body.market : parsed.market;
  const listed = await marketsListing(parsed.symbol, wanted ? [wanted] : Object.keys(MARKETS));
  if (!listed.length) {
    return json(request, {
      ok: false,
      code: "not-found",
      error: wanted ? `${parsed.symbol} was not found on ${wanted.toUpperCase()}.` : `${parsed.symbol} was not found on BIST, USA or crypto.`,
    }, 404);
  }
  if (listed.length > 1) return json(request, { ok: false, code: "choose", symbol: parsed.symbol, markets: listed });

  const ticker = { symbol: parsed.symbol, market: listed[0] };
  if (ids.has(tickerId(ticker)) && tickerId(ticker) !== replaceId) {
    return json(request, { ok: false, error: `${ticker.symbol} is already in the list.` }, 409);
  }
  const tickers = replacing
    ? settings.tickers.map((item) => (tickerId(item) === replaceId ? ticker : item))
    : [...settings.tickers, ticker];
  const next = await save(tickers);
  return json(request, { ok: true, ticker, tickers: next.tickers });
}
