import { nowIso, todayIso, runInBatches, addIsoDays, isoDaysAgo, isCacheOnlyRequest, isFreshRequest, splitSymbols, normalizeMarketSymbol } from "../util.js";
import { json } from "../http.js";
import { ensureMarketDataDb } from "../db.js";
import { getCachedMarketCandles, saveMarketCandles, toCandleDate } from "./candles.js";
import { fetchCoinGeckoBulkPrices } from "./crypto.js";
import { getLatestRate, getCachedMarketDataPoint, getPreviousCachedMarketDataPoints, getCachedOrPreviousMarketDataPoint, saveMarketDataPoint } from "./rates.js";
import { fetchDmlktCandles, isAltins1Symbol, fetchDovizAltins1Candles } from "./tr-sources.js";

// Map a normalized internal symbol (output of normalizeMarketSymbol) to its
// BIST ticker for TradingView's scanner. Keys here override the default
// "strip .IS / use as-is" behaviour for cases where the broker-internal name
// differs from the BIST listing (sub-series, ETFs renamed, etc.). Verified
// 2026-06-05 against scanner.tradingview.com/turkey/scan.
const TR_TRADINGVIEW_BIST_OVERRIDES = {
  ALTINS1: "ALTIN",        // Darphane Altın Sertifikası
  "GLDTR.IS": "GLDTR",     // GOLDIST Istanbul Gold ETF (input: GLDR.F)
  "USDTR.F": "USDTR",      // Finans American Dollar ETF
  "GMSTR.F": "GMSTR",      // Istanbul Silver ETF
  "RTALB.IS": "RTALB",     // RTA Laboratuvarları (input: RTLAB)
};

export async function handleQuotes(request, env, ctx) {
  await ensureMarketDataDb(env);
  const url = new URL(request.url);
  const cacheOnly = isCacheOnlyRequest(url);
  const fresh = isFreshRequest(url);
  const backgroundRefresh = url.searchParams.get("background") === "1";
  const symbols = splitSymbols(url.searchParams.get("symbols"));
  const prices = {};
  const errors = [];
  const normalizedByInput = new Map(symbols.map((symbol) => [symbol, normalizeMarketSymbol(symbol)]));

  // fresh=1 → block until refresh completes, then return updated cache.
  // Strategy: (1) one TradingView scanner call for all BIST-mapped symbols
  // (covers full TR portfolio in 1 subrequest, with correct ALTINS1 price);
  // (2) per-symbol fetchPrice for the remainder (US tickers via Yahoo).
  if (fresh && symbols.length) {
    let tvPrices = {};
    try {
      tvPrices = await fetchTradingViewBistBulkPrices(symbols);
    } catch (error) {
      errors.push(`TradingView bulk fetch failed: ${error?.message || "unknown"}`);
    }
    const today = todayIso();
    const todayTime = Math.floor(Date.parse(`${today}T12:00:00Z`) / 1000);
    const tvSaves = Object.entries(tvPrices).flatMap(([input, price]) => {
      const normalized = normalizeMarketSymbol(input);
      return [
        saveMarketDataPoint(env, `PRICE:${normalized}`, today, price),
        // Also persist the close as today's daily candle. Keeps 14D/12M
        // charts accumulating for BIST symbols whose archive source is down
        // (e.g. Doviz.com ALTINS1 auth broke 2026-06). Real OHLC from a
        // working archive source later overwrites via INSERT OR REPLACE.
        saveMarketCandles(env, normalized, [{ time: todayTime, open: price, high: price, low: price, close: price }], "TradingView close"),
      ];
    });
    await Promise.allSettled(tvSaves);

    const remaining = symbols.filter((s) => !(s in tvPrices));
    if (remaining.length) {
      const refreshResults = await runInBatches(
        remaining,
        (symbol) => refreshCurrentPrice(env, symbol),
        5
      );
      refreshResults.forEach((result, idx) => {
        if (result.status === "rejected") {
          errors.push(`${remaining[idx]}: refresh failed (${result.reason?.message || "unknown"}).`);
        }
      });
    }
  }

  const cachedBySeries = await getPreviousCachedMarketDataPoints(
    env,
    [...new Set([...normalizedByInput.values()].filter(Boolean).map((symbol) => `PRICE:${symbol}`))],
    todayIso()
  ).catch((error) => {
    errors.push(`D1 current price batch read failed (${error?.message || "unknown error"}).`);
    return new Map();
  });

  let latestDate = "";
  for (const symbol of symbols) {
    const normalized = normalizedByInput.get(symbol);
    const series = `PRICE:${normalized}`;
    const cached = cachedBySeries.get(series);
    if (cached) {
      prices[symbol] = cached.rate;
      if (cached.date && cached.date > latestDate) latestDate = cached.date;
    } else {
      errors.push(`${symbol}: current price data is missing in D1.`);
    }
    if (!cacheOnly && !fresh) ctx?.waitUntil?.(refreshCurrentPrice(env, symbol));
  }

  return json(request, { prices, errors, fetchedAt: nowIso(), latestDate });
}

async function refreshCurrentPrice(env, symbol) {
  const normalized = normalizeMarketSymbol(symbol);
  // BTC held in the TR portfolio is priced in TL as a derived symbol:
  // BTC-USD (maintained by the crypto tab) × TCMB USD/TRY. No external
  // fetch of its own. Errors propagate so the caller reports them.
  if (normalized === "BTC-TRY") {
    const price = await computeBtcTryPrice(env);
    const today = todayIso();
    await saveMarketDataPoint(env, "PRICE:BTC-TRY", today, price);
    const todayTime = Math.floor(Date.parse(`${today}T12:00:00Z`) / 1000);
    await saveMarketCandles(env, "BTC-TRY", [{ time: todayTime, open: price, high: price, low: price, close: price }], "BTC-USD x TCMB live");
    return;
  }
  const price = await fetchPrice(symbol).catch(() => null);
  if (Number.isFinite(price) && price > 0) {
    await saveMarketDataPoint(env, `PRICE:${normalized}`, todayIso(), price);
  }
}

async function computeBtcTryPrice(env) {
  const today = todayIso();
  let btcUsd = (await getCachedMarketDataPoint(env, "PRICE:BTC-USD", today).catch(() => null))?.rate;
  if (!Number.isFinite(btcUsd) || btcUsd <= 0) {
    const bulk = await fetchCoinGeckoBulkPrices(env, ["bitcoin"]).catch(() => ({}));
    btcUsd = bulk.bitcoin;
    if (Number.isFinite(btcUsd) && btcUsd > 0) {
      await saveMarketDataPoint(env, "PRICE:BTC-USD", today, btcUsd);
    }
  }
  let rate = (await getCachedOrPreviousMarketDataPoint(env, "TCMB_USD_TRY", today).catch(() => null))?.rate;
  if (!Number.isFinite(rate) || rate <= 0) {
    const latest = await getLatestRate().catch(() => null);
    if (latest?.rate) {
      rate = latest.rate;
      await saveMarketDataPoint(env, "TCMB_USD_TRY", latest.date || today, latest.rate);
    }
  }
  if (!Number.isFinite(btcUsd) || btcUsd <= 0) throw new Error("BTC-TRY: BTC-USD price unavailable (D1 + CoinGecko)");
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("BTC-TRY: TCMB USD/TRY rate unavailable");
  return btcUsd * rate;
}

// Materialize BTC-TRY daily candles by converting cached BTC-USD candles with
// the TCMB USD/TRY series (carry-forward over weekends/holidays). Pure D1
// derivation — zero external subrequests.
export async function refreshBtcTryCandles(env, start) {
  const usdCandles = await getCachedMarketCandles(env, "BTC-USD", start);
  if (!usdCandles.length) {
    return { ok: false, error: "BTC-USD candles are not cached yet; refresh the Crypto tab first" };
  }
  const ratesResult = await env.DB.prepare(
    "SELECT date, rate FROM market_data_points WHERE series = 'TCMB_USD_TRY' AND date >= ? ORDER BY date ASC"
  ).bind(addIsoDays(start, -14)).all();
  const ratePoints = (ratesResult.results ?? [])
    .map((row) => ({ date: row.date, rate: Number(row.rate) }))
    .filter((row) => row.date && Number.isFinite(row.rate) && row.rate > 0);
  if (!ratePoints.length) {
    return { ok: false, error: "TCMB_USD_TRY rates are not cached yet; open Cash Flow once" };
  }
  let rateIndex = 0;
  let currentRate = ratePoints[0].rate;
  const converted = [];
  for (const candle of usdCandles) {
    const date = toCandleDate(candle);
    while (rateIndex < ratePoints.length && ratePoints[rateIndex].date <= date) {
      currentRate = ratePoints[rateIndex].rate;
      rateIndex += 1;
    }
    converted.push({
      time: candle.time,
      open: candle.open * currentRate,
      high: candle.high * currentRate,
      low: candle.low * currentRate,
      close: candle.close * currentRate,
    });
  }
  await saveMarketCandles(env, "BTC-TRY", converted, "BTC-USD x TCMB_USD_TRY");
  return { ok: true, count: converted.length };
}

// Derive the BIST ticker for TradingView from a user-supplied symbol. Most
// BIST tickers map 1:1 to their normalized form; overrides handle the cases
// where the broker code (.F suffix, ALTIN.S1, RTLAB) differs from BIST.
function bistTickerForSymbol(symbol) {
  const clean = normalizeMarketSymbol(symbol);
  if (!clean) return "";
  // Derived symbol, not a BIST listing — handled by computeBtcTryPrice.
  if (clean === "BTC-TRY" || clean === "BTC") return "";
  if (Object.prototype.hasOwnProperty.call(TR_TRADINGVIEW_BIST_OVERRIDES, clean)) {
    return TR_TRADINGVIEW_BIST_OVERRIDES[clean];
  }
  if (clean.endsWith(".IS")) return clean.slice(0, -3);
  return clean;
}

// Fetch live prices for many BIST symbols in a single TradingView scanner
// request. Returns { inputSymbol: price } only for symbols TradingView knows;
// others are silently absent (caller falls back to Yahoo / per-symbol path).
// One subrequest covers an entire TR portfolio — replaces the prior pattern
// of N Yahoo calls (rate-limited and produced wrong values for ALTINS1).
async function fetchTradingViewBistBulkPrices(symbols) {
  const inputs = [...new Set(symbols.map((s) => String(s || "").trim()).filter(Boolean))];
  const inputToTicker = new Map();
  for (const input of inputs) {
    const ticker = bistTickerForSymbol(input);
    if (ticker) inputToTicker.set(input, `BIST:${ticker}`);
  }
  if (!inputToTicker.size) return {};

  const tickers = [...new Set(inputToTicker.values())];
  const response = await fetch("https://scanner.tradingview.com/turkey/scan", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "Mozilla/5.0",
    },
    body: JSON.stringify({ symbols: { tickers }, columns: ["close"] }),
  });
  if (!response.ok) {
    throw new Error(`TradingView scanner failed (${response.status})`);
  }
  const payload = await response.json().catch(() => null);
  const tickerToPrice = new Map();
  for (const row of payload?.data ?? []) {
    const price = Number(row?.d?.[0]);
    if (row?.s && Number.isFinite(price) && price > 0) {
      tickerToPrice.set(row.s, price);
    }
  }
  const out = {};
  for (const [input, ticker] of inputToTicker) {
    const price = tickerToPrice.get(ticker);
    if (Number.isFinite(price) && price > 0) out[input] = price;
  }
  return out;
}

export function toWorkerYahooTrSymbol(symbol) {
  const clean = normalizeMarketSymbol(symbol);
  if (!clean || clean.includes(".F") || clean.includes(".G")) return "";
  if (clean === "ALTINS1") return "ALTINS1";
  // BTC in the TR portfolio is crypto priced via BTC-TRY derivation — it has
  // no BIST listing and no corporate actions to scan.
  if (clean === "BTC" || clean === "BTC-TRY") return "";
  return clean.endsWith(".IS") ? clean : `${clean}.IS`;
}

async function fetchPrice(symbol) {
  const loaders = [fetchDovizAltins1Price, fetchBorsaNetAltins1Price, fetchInvestingPrice, fetchYahooApiPrice, fetchYahooPagePrice, fetchStooqPrice];

  for (const loader of loaders) {
    try {
      const price = await loader(symbol);
      if (Number.isFinite(price) && price > 0) return price;
    } catch {}
  }

  return null;
}

async function fetchDovizAltins1Price(symbol) {
  if (!isAltins1Symbol(symbol)) throw new Error("ALTINS1 Doviz.com price skipped");
  const candles = await fetchDovizAltins1Candles(isoDaysAgo(14));
  const latest = candles[candles.length - 1];
  const price = Number(latest?.close);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Doviz.com ALTINS1 price parse failed");
  return price;
}

async function fetchBorsaNetAltins1Price(symbol) {
  const clean = String(symbol || "").trim().toUpperCase();
  if (clean !== "ALTINS1" && clean !== "ALTINS1.IS" && clean !== "ALTIN") {
    throw new Error("ALTINS1 fallback skipped");
  }
  const response = await fetch("https://www.borsa.net/hisse/altins1", {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new Error("Borsa.net failed");
  const html = await response.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = text.match(/DARPHANE\s+ALTIN\s+SERTIFIKASI\s+ALTINS1\s+(\d{1,3}(?:[.,]\d{1,4})?)\s*â‚º/i);
  const value = parseTrNumber(match?.[1]);
  if (!Number.isFinite(value) || value <= 0 || value > 1000) {
    throw new Error("Borsa.net ALTINS1 parse failed");
  }
  return value;
}

async function fetchInvestingPrice(symbol) {
  if (normalizeMarketSymbol(symbol) !== "DMLKT") throw new Error("Investing price skipped");
  const candles = await fetchDmlktCandles("2025-01-01");
  const latest = candles[candles.length - 1];
  const price = Number(latest?.close);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Investing price parse failed");
  return price;
}

export function parseTrNumber(value) {
  if (value == null) return NaN;
  const raw = String(value).trim();
  if (!raw) return NaN;
  if (raw.includes(",") && raw.includes(".")) return Number(raw.replace(/\./g, "").replace(",", "."));
  if (raw.includes(",")) return Number(raw.replace(",", "."));
  return Number(raw);
}

async function fetchYahooApiPrice(symbol) {
  // Yahoo's "ALTINS1" listing is a different instrument (returns ~60k TL
  // instead of the real ~80 TL per-gram price). Doviz.com + Borsa.net are
  // the canonical sources; if both fail we'd rather have no value than a
  // wrong one polluting cache.
  if (isAltins1Symbol(symbol)) throw new Error("Yahoo not trusted for ALTINS1");
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const response = await fetch(target, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new Error("Yahoo API failed");
  const payload = await response.json();
  return Number(payload?.chart?.result?.[0]?.meta?.regularMarketPrice);
}

async function fetchYahooPagePrice(symbol) {
  if (isAltins1Symbol(symbol)) throw new Error("Yahoo not trusted for ALTINS1");
  const target = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
  const response = await fetch(target, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new Error("Yahoo page failed");
  const html = await response.text();
  const match = html.match(/"regularMarketPrice"\s*:\s*\{"raw"\s*:\s*([\d.]+)/);
  return Number(match?.[1]);
}

async function fetchStooqPrice(symbol) {
  if (isAltins1Symbol(symbol)) throw new Error("Stooq not trusted for ALTINS1");
  const target = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol.toLowerCase() + ".us")}&i=d`;
  const response = await fetch(target, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new Error("Stooq failed");
  const text = await response.text();
  const line = text.trim().split(/\r?\n/).pop();
  const parts = line.split(",");
  return Number(parts[6]);
}
