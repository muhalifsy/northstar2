import { nowIso, todayIso, runInBatches, addIsoDays, isoDaysAgo, isCacheOnlyRequest, isFreshRequest, splitSymbols, normalizeMarketSymbol } from "../util.js";
import { json } from "../http.js";
import { ensureMarketDataDb } from "../db.js";
import { refreshBtcTryCandles } from "./quotes.js";
import { refreshCryptoHistoryTails, isCryptoHistorySymbol, fetchCryptoHistoricalCandles } from "./crypto.js";
import { saveMarketDataPoint } from "./rates.js";
import { fetchInfqHistoricalCandles, fetchDmlktCandles, isAltins1Symbol, fetchAltins1Candles } from "./tr-sources.js";

export async function handleCandles(request, env, ctx) {
  await ensureMarketDataDb(env);
  const url = new URL(request.url);
  const cacheOnly = isCacheOnlyRequest(url);
  const fresh = isFreshRequest(url);
  const symbols = splitSymbols(url.searchParams.get("symbols"));
  const candles = {};
  const errors = [];
  // 12 monthly candles + the 30-day strip; a wider window is rows read for nothing.
  const start = isoDaysAgo(400);

  // fresh=1 → incremental refresh (only fetch gap from last cached date to today)
  if (fresh && symbols.length) {
    const refreshResults = await runInBatches(
      symbols,
      (symbol) => refreshHistoricalCandlesIncremental(env, symbol, start),
      5
    );
    refreshResults.forEach((result, idx) => {
      if (result.status === "rejected") {
        errors.push(`${symbols[idx]}: candle refresh failed (${result.reason?.message || "unknown"}).`);
      } else if (result.value?.ok === false) {
        errors.push(`${symbols[idx]}: candle refresh failed (${result.value.error || "unknown"}).`);
      }
    });
  }

  const cachedBySymbol = await getCachedMarketCandlesForSymbols(env, symbols, start);

  let latestDate = "";
  for (const symbol of symbols) {
    const normalized = normalizeMarketSymbol(symbol);
    const cached = cachedBySymbol.get(normalized) || [];
    if (cached.length) {
      candles[symbol] = {
        m12: aggregateMonthlyCandles(cached).slice(-12),
        d30: cached.slice(-30),
      };
      const lastCandleDate = toCandleDate(cached[cached.length - 1]);
      if (lastCandleDate && lastCandleDate > latestDate) latestDate = lastCandleDate;
    } else {
      errors.push(`${symbol}: chart data is not cached in D1 yet.`);
    }
    if (!cacheOnly && !fresh) ctx?.waitUntil?.(refreshHistoricalCandles(env, symbol, start));
  }

  return json(request, { candles, errors, fetchedAt: nowIso(), latestDate });
}

// Incremental candle refresh: only fetch days after the last cached date.
// New symbols (no cache) get the full default window in one shot.
async function refreshHistoricalCandlesIncremental(env, symbol, defaultStart) {
  const normalized = normalizeMarketSymbol(symbol);
  const maxRow = await env.DB.prepare(
    "SELECT MAX(date) AS maxDate FROM market_candles WHERE symbol = ?"
  ).bind(normalized).first().catch(() => null);
  const maxDate = maxRow?.maxDate || "";
  const today = todayIso();
  // Already up to date for today
  if (maxDate && maxDate >= today) return { ok: true, fetched: 0, skipped: true };
  // Pick incremental start: day after last cached, or default window
  let start = defaultStart;
  if (maxDate) {
    const next = new Date(`${maxDate}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    start = next.toISOString().slice(0, 10);
  }
  return refreshHistoricalCandles(env, symbol, start);
}

export async function handleHistory(request, env, ctx) {
  await ensureMarketDataDb(env);
  const url = new URL(request.url);
  const cacheOnly = isCacheOnlyRequest(url);
  const symbols = splitSymbols(url.searchParams.get("symbols"));
  const start = url.searchParams.get("start") || "2020-01-01";
  const history = {};
  const errors = [];
  const symbolMap = new Map(symbols.map((symbol) => [normalizeMarketSymbol(symbol), symbol]));
  const cachedBySymbol = await getCachedMarketCandlesForSymbols(env, [...symbolMap.keys()], start);
  const missingSymbols = [];
  const cryptoGaps = [];

  for (const symbol of symbols) {
    const normalized = normalizeMarketSymbol(symbol);
    try {
      let cached = cachedBySymbol.get(normalized) || [];
      let refreshResult = null;
      const isCrypto = isCryptoHistorySymbol(symbol);
      const gap = !cacheOnly && historyNeedsRefresh(cached, start);
      // Crypto historical refresh is heavy (multi-source chain + paginated
      // Binance, ~3-5 subrequests per symbol). 12 symbols in one /api/history
      // call exceeds Workers' subrequest budget and times out the response.
      // For crypto we ALWAYS run the refresh in the background and return the
      // current cache; the next refresh click fills in any holes. Non-crypto
      // symbols (Yahoo) stay inline since they are 1 subrequest each.
      if (gap && !isCrypto) {
        refreshResult = await refreshHistoricalCandles(env, symbol, start);
        cached = await getCachedMarketCandles(env, normalized, start);
      } else if (gap && isCrypto) {
        cryptoGaps.push(symbol);
      }
      if (cached.length) {
        history[symbol] = cached;
        if (refreshResult?.ok === false) errors.push(`${symbol}: source refresh failed: ${refreshResult.error}`);
      } else {
        errors.push(`${symbol}: historical price data is not cached in D1 yet.${refreshResult?.error ? ` Source refresh failed: ${refreshResult.error}` : ""}`);
        missingSymbols.push(symbol);
      }
    } catch (error) {
      errors.push(`${symbol}: ${error?.message || "historical price data could not be loaded."}`);
    }
  }
  const missingStocks = missingSymbols.filter((symbol) => !isCryptoHistorySymbol(symbol));
  if (!cacheOnly && missingStocks.length) ctx?.waitUntil?.(refreshHistoricalCandlesForSymbols(env, missingStocks, start));
  if (!cacheOnly && cryptoGaps.length) ctx?.waitUntil?.(refreshCryptoHistoryTails(env, cryptoGaps, start));

  return json(request, { history, errors });
}

export function historyNeedsRefresh(candles, startDate) {
  if (!Array.isArray(candles) || !candles.length) return true;
  const firstDate = toCandleDate(candles[0]);
  if (!firstDate || !startDate) return true;
  // Missing coverage at the START of the requested range.
  if (firstDate > addIsoDays(startDate, 7)) return true;
  // Missing coverage at the END (stale tail): if the newest stored candle is
  // more than a few days old, the series flat-lines from that point on and
  // recent range starts (e.g. 1-month view) return nothing. 4 days tolerates a
  // normal weekend (Fri close -> Mon load) without refetching every request.
  const lastDate = toCandleDate(candles[candles.length - 1]);
  const todayIso = new Date().toISOString().slice(0, 10);
  if (!lastDate || lastDate < addIsoDays(todayIso, -4)) return true;
  return false;
}

async function refreshHistoricalCandlesForSymbols(env, symbols, start) {
  for (const symbol of symbols) {
    await refreshHistoricalCandles(env, symbol, start);
  }
}

export async function refreshHistoricalCandles(env, symbol, start) {
  const normalized = normalizeMarketSymbol(symbol);
  if (normalized === "BTC-TRY") return refreshBtcTryCandles(env, start);
  let candles = [];
  let source = candleSourceForSymbol(symbol);
  try {
    if (isCryptoHistorySymbol(symbol)) {
      const result = await fetchCryptoHistoricalCandles(env, symbol, start);
      candles = result.candles;
      source = result.source;
    } else {
      candles = await fetchHistoricalDailyCandles(symbol, start);
    }
  } catch (error) {
    return { ok: false, error: error?.message || "source fetch failed" };
  }
  if (!candles.length) return { ok: false, error: "source returned no candles" };
  if (candles.length) {
    await saveMarketCandles(env, normalized, candles, source);
    const latest = candles[candles.length - 1];
    if (Number.isFinite(Number(latest?.close)) && Number(latest.close) > 0) {
      await saveMarketDataPoint(env, `PRICE:${normalized}`, toCandleDate(latest) || todayIso(), Number(latest.close));
    }
  }
  return { ok: true, count: candles.length };
}

async function getCachedMarketCandlesForSymbols(env, symbols, startDate) {
  const filtered = [...new Set(symbols.map(normalizeMarketSymbol).filter(Boolean))];
  const grouped = new Map(filtered.map((symbol) => [symbol, []]));
  if (!filtered.length) return grouped;
  const placeholders = filtered.map(() => "?").join(",");
  const result = await env.DB.prepare(
    `SELECT symbol, date, open, high, low, close FROM market_candles WHERE symbol IN (${placeholders}) AND date >= ? ORDER BY symbol ASC, date ASC`
  ).bind(...filtered, startDate).all();
  for (const row of result.results ?? []) {
    const candle = candleRowToPayload(row);
    if (candle) (grouped.get(row.symbol) || grouped.set(row.symbol, []).get(row.symbol)).push(candle);
  }
  return grouped;
}

export async function getCachedMarketCandles(env, symbol, startDate) {
  const result = await env.DB.prepare(
    "SELECT date, open, high, low, close FROM market_candles WHERE symbol = ? AND date >= ? ORDER BY date ASC"
  ).bind(symbol, startDate).all();
  return (result.results ?? [])
    .map((row) => candleRowToPayload(row))
    .filter(Boolean);
}

export async function saveMarketCandles(env, symbol, candles, source) {
  const rows = candles
    .map((candle) => {
      const date = toCandleDate(candle);
      return {
        date,
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
      };
    })
    .filter((row) => row.date && [row.open, row.high, row.low, row.close].every(Number.isFinite));
  if (!rows.length) return;

  const updatedAt = nowIso();
  await env.DB.batch(rows.map((row) =>
    env.DB.prepare(
      "INSERT OR REPLACE INTO market_candles (symbol, date, open, high, low, close, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(symbol, row.date, row.open, row.high, row.low, row.close, source, updatedAt)
  ));
}

function candleRowToPayload(row) {
  if (!row?.date) return null;
  const time = Math.floor(Date.parse(`${row.date}T12:00:00Z`) / 1000);
  const open = Number(row.open);
  const high = Number(row.high);
  const low = Number(row.low);
  const close = Number(row.close);
  if (!Number.isFinite(time) || ![open, high, low, close].every(Number.isFinite)) return null;
  return { time, open, high, low, close };
}

export function toCandleDate(candle) {
  const time = Number(candle?.time);
  if (!Number.isFinite(time)) return "";
  return new Date(time * 1000).toISOString().slice(0, 10);
}

function candleSourceForSymbol(symbol) {
  if (isCryptoHistorySymbol(symbol)) return "Yahoo / Binance / CoinPaprika / CoinGecko";
  if (isAltins1Symbol(symbol)) return "Doviz.com ALTINS1 / Hisse.net / Investing ALTIN";
  if (normalizeMarketSymbol(symbol) === "DMLKT") return "Investing.com DMLKT";
  return "Yahoo Chart";
}

async function fetchMonthlyCandles(symbol) {
  if (isAltins1Symbol(symbol)) {
    const daily = await fetchAltins1Candles();
    const monthly = aggregateMonthlyCandles(daily).slice(-12);
    return monthly;
  }
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=2y`;
  const response = await fetch(target, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) return [];
  const payload = await response.json();
  return extractCandles(payload).slice(-12);
}

async function fetchDailyCandles(symbol) {
  if (isAltins1Symbol(symbol)) {
    return (await fetchAltins1Candles()).slice(-30);
  }
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;
  const response = await fetch(target, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) return [];
  const payload = await response.json();
  return extractCandles(payload).slice(-30);
}

async function fetchHistoricalDailyCandles(symbol, startDate) {
  if (isAltins1Symbol(symbol)) {
    const candles = await fetchAltins1Candles(startDate);
    return candles.filter((candle) => {
      const date = new Date(candle.time * 1000).toISOString().slice(0, 10);
      return date >= startDate;
    });
  }
  if (normalizeMarketSymbol(symbol) === "INFQ") {
    return fetchInfqHistoricalCandles(startDate);
  }
  if (normalizeMarketSymbol(symbol) === "DMLKT") {
    return fetchDmlktCandles(startDate);
  }
  const start = Math.floor(Date.parse(`${startDate}T00:00:00Z`) / 1000);
  const end = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(start) || start <= 0) return [];
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${start}&period2=${end}`;
  const response = await fetch(target, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null);
  return extractCandles(payload);
}

export async function fetchYahooHistoricalDailyCandles(symbol, startDate) {
  const start = Math.floor(Date.parse(`${startDate}T00:00:00Z`) / 1000);
  const end = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(start) || start <= 0) return [];
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${start}&period2=${end}`;
  const response = await fetch(target, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null);
  return extractCandles(payload);
}

export function uniqueSortedCandles(candles) {
  return candles
    .filter((item) => Number.isFinite(item?.time) && [item.open, item.high, item.low, item.close].every(Number.isFinite))
    .sort((left, right) => left.time - right.time)
    .filter((item, index, list) => index === 0 || item.time !== list[index - 1].time);
}

function aggregateMonthlyCandles(dailyCandles) {
  const buckets = new Map();
  for (const candle of dailyCandles) {
    const date = new Date(candle.time * 1000);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!buckets.has(key)) {
      buckets.set(key, { ...candle });
      continue;
    }
    const bucket = buckets.get(key);
    bucket.high = Math.max(bucket.high, candle.high);
    bucket.low = Math.min(bucket.low, candle.low);
    bucket.close = candle.close;
    bucket.time = candle.time;
  }
  return [...buckets.values()].sort((left, right) => left.time - right.time);
}

function extractCandles(payload) {
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp || [];
  if (!quote || !timestamps.length) return [];

  return timestamps
    .map((timestamp, index) => ({
      time: timestamp,
      open: Number(quote.open?.[index]),
      high: Number(quote.high?.[index]),
      low: Number(quote.low?.[index]),
      close: Number(quote.close?.[index]),
    }))
    .filter(
      (item) =>
        Number.isFinite(item.open) &&
        Number.isFinite(item.high) &&
        Number.isFinite(item.low) &&
        Number.isFinite(item.close)
    );
}
