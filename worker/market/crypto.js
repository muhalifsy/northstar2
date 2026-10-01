import { nowIso, todayIso, runInBatches, addIsoDays, isoDaysAgo, isFreshRequest, normalizeMarketSymbol } from "../util.js";
import { json } from "../http.js";
import { requireUser } from "../auth.js";
import { ensureCryptoPortfolioDb, ensureMarketDataDb } from "../db.js";
import { historyNeedsRefresh, refreshHistoricalCandles, saveMarketCandles, toCandleDate, fetchYahooHistoricalDailyCandles, uniqueSortedCandles } from "./candles.js";
import { getPreviousCachedMarketDataPoints, saveMarketDataPoint } from "./rates.js";

const COINGECKO_CRYPTO_IDS = {
  ADA: "cardano",
  ALGO: "algorand",
  APE: "apecoin",
  APPC: "appcoins",
  AVAX: "avalanche-2",
  BNB: "binancecoin",
  BTC: "bitcoin",
  DOGE: "dogecoin",
  DOT: "polkadot",
  ENJ: "enjincoin",
  ETH: "ethereum",
  FIL: "filecoin",
  GRT: "the-graph",
  KDA: "kadena",
  LINK: "chainlink",
  // CoinGecko renamed: "terra-luna-classic" was removed, LUNC now lives
  // under the original "terra-luna" id (verified 2026-06-05).
  LUNC: "terra-luna",
  MANA: "decentraland",
  MANTA: "manta-network",
  // MATIC migrated to POL; CoinGecko's "matic-network" returns no data
  // anymore. POL price continues the MATIC series 1:1 (verified 2026-06-05).
  MATIC: "polygon-ecosystem-token",
  MITH: "mithril",
  NEAR: "near",
  OP: "optimism",
  RAY: "raydium",
  SAND: "the-sandbox",
  SHIB: "shiba-inu",
  SOL: "solana",
  UNI: "uniswap",
  VET: "vechain",
  WLD: "worldcoin-wld",
  XLM: "stellar",
  XMR: "monero",
  XRP: "ripple",
  ZK: "zksync",
};

const COINPAPRIKA_CRYPTO_IDS = {
  ADA: "ada-cardano",
  ALGO: "algo-algorand",
  APE: "ape-apecoin",
  APPC: "appc-appcoins",
  AVAX: "avax-avalanche",
  BNB: "bnb-binance-coin",
  BTC: "btc-bitcoin",
  DOGE: "doge-dogecoin",
  DOT: "dot-polkadot",
  ENJ: "enj-enjin-coin",
  ETH: "eth-ethereum",
  FIL: "fil-filecoin",
  GRT: "grt-the-graph",
  KDA: "kda-kadena",
  LINK: "link-chainlink",
  LUNC: "lunc-terra-classic",
  MANA: "mana-decentraland",
  MANTA: "manta-manta-network",
  MATIC: "matic-polygon",
  MITH: "mith-mithril",
  NEAR: "near-near-protocol",
  OP: "op-optimism",
  RAY: "ray-raydium",
  SAND: "sand-the-sandbox",
  SHIB: "shib-shiba-inu",
  SOL: "sol-solana",
  UNI: "uni-uniswap",
  VET: "vet-vechain",
  WLD: "wld-worldcoin",
  XLM: "xlm-stellar",
  XMR: "xmr-monero",
  XRP: "xrp-xrp",
  ZK: "zk-zksync",
};

// Yahoo tickers for coins whose plain "<BASE>-USD" is taken or missing.
// MATIC migrated 1:1 to POL, so it follows POL. Verified 2026-09-22.
const YAHOO_CRYPTO_SYMBOLS = {
  UNI: "UNI7083-USD",
  GRT: "GRT6719-USD",
  MATIC: "POL28321-USD",
  POL: "POL28321-USD",
  ZK: "ZK24091-USD",
};

function yahooCryptoSymbol(symbol) {
  const base = cryptoBaseSymbol(symbol);
  return YAHOO_CRYPTO_SYMBOLS[base] || `${base}-USD`;
}

// Current prices for up to 20 Yahoo symbols per request (spark endpoint;
// unknown symbols are simply left out). Quotes older than 3 days are dropped
// so a dead listing cannot pose as a live price.
async function fetchYahooSparkPrices(yahooSymbols) {
  const out = {};
  const unique = [...new Set(yahooSymbols.filter(Boolean))];
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
      if (Number.isFinite(price) && price > 0 && Number.isFinite(time) && Date.now() / 1000 - time < 3 * 86400) out[item.symbol] = price;
    }
  }
  return out;
}

// Binance's public market-data mirror. api.binance.com answers Cloudflare's US
// egress with 451 "restricted location"; this host serves the same klines
// without the geo block.
const BINANCE_API_BASE = "https://data-api.binance.vision";

const BINANCE_CRYPTO_PAIRS = {
  MATIC: ["MATICUSDT", "POLUSDT", "MATICUSDC", "MATICBUSD"],
  LUNC: ["LUNCUSDT", "LUNCBUSD"],
  WLD: ["WLDUSDT", "WLDUSDC"],
  ZK: ["ZKUSDT", "ZKUSDC"],
};

// Symbols delisted from / never on Binance — skip Binance and CoinPaprika,
// go straight to CoinGecko. Avoids wasted subrequests and rate limits.
const CRYPTO_PREFERRED_GECKO = new Set(["KDA", "XMR", "MITH"]);

const MANUAL_CRYPTO_DAILY_CLOSES = {
  "APPC-USD": [
    { date: "2024-12-31", close: 0.0019 },
    { date: "2025-03-31", close: 0.0010 },
    { date: "2025-06-30", close: 0.0014 },
    { date: "2025-09-30", close: 0.0024 },
    { date: "2025-12-31", close: 0.0017 },
    { date: "2026-03-31", close: 0.0010 },
    { date: "2026-05-21", close: 0.0010 },
  ],
};

// Crypto daily candles, kept fresh incrementally: each symbol fetches only
// the days after its last cached candle (1 Binance request when listed).
// At most CRYPTO_TAILS_PER_RUN symbols per invocation, rotating by the hour so
// a dead symbol cannot starve the others; the rest follow on later runs.
export async function refreshCryptoHistoryTails(env, symbols, defaultStart = isoDaysAgo(420)) {
  await ensureMarketDataDb(env);
  const wanted = [...new Set(symbols.map((symbol) => cryptoHistorySymbolForWorker(symbol)))].filter(isCryptoHistorySymbol).sort();
  if (!wanted.length) return { refreshed: 0 };
  const today = todayIso();
  // One indexed lookup per symbol (reads a single row) instead of a GROUP BY
  // over the whole table, and we stop as soon as the run is full.
  const offset = (new Date().getUTCHours() * CRYPTO_TAILS_PER_RUN) % wanted.length;
  const rotated = [...wanted.slice(offset), ...wanted.slice(0, offset)];
  const maxDates = new Map();
  const batch = [];
  for (const symbol of rotated) {
    if (batch.length >= CRYPTO_TAILS_PER_RUN) break;
    const row = await env.DB.prepare(
      "SELECT date FROM market_candles WHERE symbol = ? ORDER BY date DESC LIMIT 1"
    ).bind(symbol).first().catch(() => null);
    const maxDate = row?.date || "";
    maxDates.set(symbol, maxDate);
    if (maxDate < today) batch.push(symbol);
  }
  if (!batch.length) return { refreshed: 0 };
  let refreshed = 0;
  for (const symbol of batch) {
    const maxDate = maxDates.get(symbol) || "";
    const start = maxDate && maxDate >= defaultStart ? addIsoDays(maxDate, -1) : defaultStart;
    const result = await refreshHistoricalCandles(env, symbol, start).catch(() => null);
    if (result?.ok) refreshed += 1;
  }
  return { refreshed };
}

export function isCryptoHistorySymbol(symbol) {
  const clean = normalizeMarketSymbol(symbol);
  if (!clean.endsWith("-USD")) return false;
  const base = clean.slice(0, -4);
  return Boolean(COINGECKO_CRYPTO_IDS[base]);
}

function coingeckoIdForHistorySymbol(symbol) {
  const clean = normalizeMarketSymbol(symbol);
  const base = clean.endsWith("-USD") ? clean.slice(0, -4) : clean;
  return COINGECKO_CRYPTO_IDS[base] || "";
}

export async function fetchCryptoHistoricalCandles(env, symbol, startDate) {
  const errors = [];
  let bestPartial = null;
  const manualCandles = manualCryptoCandlesForSymbol(symbol, startDate);
  if (manualCandles.length) {
    return { candles: manualCandles, source: "Manual crypto close" };
  }

  // Yahoo first: reachable from Cloudflare, one request per coin. Binance
  // (403 from Cloudflare), CoinPaprika (monthly quota) and CoinGecko (429
  // without a key) remain only as fallbacks. A Yahoo series that reaches
  // today is accepted even if it starts after startDate — the coin simply
  // did not trade earlier.
  const yahooSymbol = yahooCryptoSymbol(symbol);
  try {
    const candles = await fetchYahooHistoricalDailyCandles(yahooSymbol, startDate);
    const lastDate = candles.length ? toCandleDate(candles[candles.length - 1]) : "";
    if (lastDate && lastDate >= addIsoDays(todayIso(), -4)) {
      return { candles, source: `Yahoo ${yahooSymbol}` };
    }
    if (candles.length) {
      bestPartial = betterCryptoPartial(bestPartial, { candles, source: `Yahoo ${yahooSymbol}` }, startDate);
      errors.push(`Yahoo ${yahooSymbol} is stale (last ${lastDate})`);
    } else {
      errors.push(`Yahoo ${yahooSymbol} returned no candles`);
    }
  } catch (error) {
    errors.push(`Yahoo: ${error?.message || "failed"}`);
  }

  // Fast path for symbols known to be absent from Binance/CoinPaprika.
  const cleanBase = cryptoBaseSymbol(symbol);
  const preferGecko = cleanBase && CRYPTO_PREFERRED_GECKO.has(cleanBase);

  if (!preferGecko) {
    try {
      const result = await fetchBinanceCryptoCandles(symbol, startDate);
      if (result.candles.length && !historyNeedsRefresh(result.candles, startDate)) {
        return result;
      }
      if (result.candles.length) {
        bestPartial = betterCryptoPartial(bestPartial, result, startDate);
        errors.push(`${result.source} returned partial history starting ${toCandleDate(result.candles[0])}`);
      } else {
        errors.push("Binance returned no candles");
      }
    } catch (error) {
      errors.push(`Binance: ${error?.message || "failed"}`);
    }

    try {
      const result = await fetchCoinPaprikaCryptoCandles(env, symbol, startDate);
      if (result.candles.length && !historyNeedsRefresh(result.candles, startDate)) {
        return result;
      }
      if (result.candles.length) {
        bestPartial = betterCryptoPartial(bestPartial, result, startDate);
        errors.push(`${result.source} returned partial history starting ${toCandleDate(result.candles[0])}`);
      } else {
        errors.push("CoinPaprika returned no candles");
      }
    } catch (error) {
      errors.push(`CoinPaprika: ${error?.message || "failed"}`);
    }
  }

  try {
    const candles = await fetchCoinGeckoCryptoCandles(env, symbol, startDate);
    if (candles.length && !historyNeedsRefresh(candles, startDate)) {
      return { candles, source: "CoinGecko" };
    }
    if (candles.length) {
      const result = { candles, source: "CoinGecko" };
      bestPartial = betterCryptoPartial(bestPartial, result, startDate);
      errors.push(`CoinGecko returned partial history starting ${toCandleDate(candles[0])}`);
    } else {
      errors.push("CoinGecko returned no candles");
    }
  } catch (error) {
    errors.push(`CoinGecko: ${error?.message || "failed"}`);
  }

  if (bestPartial?.candles?.length) return bestPartial;
  throw new Error(errors.join("; "));
}

function manualCryptoCandlesForSymbol(symbol, startDate) {
  const clean = normalizeMarketSymbol(symbol);
  const rows = MANUAL_CRYPTO_DAILY_CLOSES[clean] || [];
  if (!rows.length) return [];
  return uniqueSortedCandles(rows
    .filter((row) => !startDate || row.date >= startDate)
    .map((row) => {
      const close = Number(row.close);
      const time = Math.floor(Date.parse(`${row.date}T12:00:00Z`) / 1000);
      if (!Number.isFinite(time) || !Number.isFinite(close) || close <= 0) return null;
      return { time, open: close, high: close, low: close, close };
    })
    .filter(Boolean));
}

function betterCryptoPartial(current, candidate, startDate) {
  if (!candidate?.candles?.length) return current;
  if (!current?.candles?.length) return candidate;
  const currentFirst = toCandleDate(current.candles[0]) || "9999-12-31";
  const candidateFirst = toCandleDate(candidate.candles[0]) || "9999-12-31";
  if (candidateFirst < currentFirst) return candidate;
  if (candidateFirst === currentFirst && candidate.candles.length > current.candles.length) return candidate;
  return current;
}

async function fetchBinanceCryptoCandles(symbol, startDate) {
  const pairs = binancePairsForHistorySymbol(symbol);
  if (!pairs.length) throw new Error(`${symbol}: Binance pair is not configured`);
  const errors = [];
  const mergedCandles = [];
  const usedPairs = [];
  for (const pair of pairs) {
    try {
      const candles = await fetchBinancePairCandles(pair, startDate);
      if (candles.length) {
        mergedCandles.push(...candles);
        usedPairs.push(pair);
        // First successful pair with full history is enough — additional
        // pairs cost extra subrequests for negligible coverage gain.
        if (!historyNeedsRefresh(mergedCandles, startDate)) break;
      } else {
        errors.push(`${pair} returned no candles`);
      }
    } catch (error) {
      const message = error?.message || "failed";
      errors.push(`${pair}: ${message}`);
      // 403/451 = Binance is blocking this Cloudflare egress IP, not a problem
      // with the pair. Remaining pairs would fail too — don't burn subrequests.
      if (message.includes("403") || message.includes("451") || /restricted location/i.test(message)) break;
    }
  }
  if (mergedCandles.length) {
    return {
      candles: uniqueSortedCandles(mergedCandles),
      source: `Binance ${usedPairs.join("+")}`,
    };
  }
  throw new Error(errors.join("; "));
}

function binancePairsForHistorySymbol(symbol) {
  const base = cryptoBaseSymbol(symbol);
  if (!base) return [];
  const explicit = BINANCE_CRYPTO_PAIRS[base] || [];
  return [...new Set([...explicit, `${base}USDT`, `${base}USDC`, `${base}BUSD`])];
}

async function fetchBinancePairCandles(pair, startDate) {
  const startTime = Date.parse(`${startDate}T00:00:00Z`);
  const endTime = Date.now();
  if (!Number.isFinite(startTime) || startTime <= 0) return [];
  const dayMs = 24 * 60 * 60 * 1000;
  const limit = 1000;
  let cursor = startTime;
  const candles = [];

  while (cursor <= endTime) {
    const target = `${BINANCE_API_BASE}/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=1d&startTime=${cursor}&endTime=${endTime}&limit=${limit}`;
    const response = await fetch(target, {
      headers: {
        accept: "application/json",
        "user-agent": "Northstar Portfolio/1.0",
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.msg || `failed (${response.status})`);
    }
    if (!Array.isArray(payload) || !payload.length) break;

    for (const row of payload) {
      const time = Math.floor(Number(row?.[0]) / 1000);
      const open = Number(row?.[1]);
      const high = Number(row?.[2]);
      const low = Number(row?.[3]);
      const close = Number(row?.[4]);
      if (!Number.isFinite(time) || ![open, high, low, close].every(Number.isFinite) || close <= 0) continue;
      candles.push({ time, open, high, low, close });
    }

    const lastOpen = Number(payload[payload.length - 1]?.[0]);
    if (!Number.isFinite(lastOpen) || lastOpen < cursor) break;
    const nextCursor = lastOpen + dayMs;
    if (nextCursor <= cursor) break;
    cursor = nextCursor;
    if (payload.length < limit) break;
  }

  return uniqueSortedCandles(candles);
}

async function fetchCoinPaprikaCryptoCandles(env, symbol, startDate) {
  const coinId = await coinPaprikaIdForHistorySymbol(env, symbol);
  if (!coinId) throw new Error(`${symbol}: CoinPaprika id is not configured`);
  const params = new URLSearchParams({
    start: startDate,
    end: todayIso(),
    interval: "24h",
  });
  const target = `https://api.coinpaprika.com/v1/coins/${encodeURIComponent(coinId)}/ohlcv/historical?${params.toString()}`;
  const response = await fetch(target, {
    headers: {
      accept: "application/json",
      "user-agent": "Northstar Portfolio/1.0",
      ...(env.COINPAPRIKA_API_KEY ? { Authorization: env.COINPAPRIKA_API_KEY } : {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `CoinPaprika ${coinId} failed (${response.status})`);
  }
  const rows = Array.isArray(payload) ? payload : [];
  const candles = rows.map((row) => {
    const close = Number(row?.close);
    const open = Number(row?.open ?? close);
    const high = Number(row?.high ?? close);
    const low = Number(row?.low ?? close);
    const time = Math.floor(Date.parse(row?.time_close || row?.time_open || row?.timestamp) / 1000);
    if (!Number.isFinite(time) || ![open, high, low, close].every(Number.isFinite) || close <= 0) return null;
    return { time, open, high, low, close };
  }).filter(Boolean);
  return { candles: uniqueSortedCandles(candles), source: `CoinPaprika ${coinId}` };
}

async function coinPaprikaIdForHistorySymbol(env, symbol) {
  const base = cryptoBaseSymbol(symbol);
  if (!base) return "";
  if (COINPAPRIKA_CRYPTO_IDS[base]) return COINPAPRIKA_CRYPTO_IDS[base];
  try {
    const response = await fetch(`https://api.coinpaprika.com/v1/search?q=${encodeURIComponent(base)}&c=currencies&limit=10`, {
      headers: {
        accept: "application/json",
        "user-agent": "Northstar Portfolio/1.0",
        ...(env.COINPAPRIKA_API_KEY ? { Authorization: env.COINPAPRIKA_API_KEY } : {}),
      },
    });
    if (!response.ok) return "";
    const payload = await response.json().catch(() => null);
    const currencies = Array.isArray(payload?.currencies) ? payload.currencies : [];
    const exact = currencies.find((item) => String(item?.symbol || "").toUpperCase() === base);
    return exact?.id || "";
  } catch {
    return "";
  }
}

const CRYPTO_FALLBACK_PER_RUN = 3;

const CRYPTO_TAILS_PER_RUN = 4;

// Bulk current-price fetch. Up to ~250 symbols in a single CoinGecko
// `/simple/price` call (1 subrequest), avoiding the ~3-5 subrequests per
// symbol that the Binance+CoinPaprika+CoinGecko candle chain consumes.
export async function fetchCoinGeckoBulkPrices(env, geckoIds) {
  const ids = [...new Set((geckoIds || []).filter(Boolean))];
  if (!ids.length) return {};
  const api = coingeckoApiConfig(env);
  const target = `${api.base}/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd`;
  const response = await fetch(target, {
    headers: {
      accept: "application/json",
      ...api.headers,
      "user-agent": "Northstar Portfolio/1.0",
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`CoinGecko bulk simple/price failed (${response.status}${text ? `: ${text.slice(0, 120)}` : ""})`);
  }
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") return {};
  const out = {};
  for (const [id, value] of Object.entries(payload)) {
    const price = Number(value?.usd);
    if (Number.isFinite(price) && price > 0) out[id] = price;
  }
  return out;
}

// One-shot current-price refresh for many crypto symbols: Yahoo spark (20
// symbols per request) first, CoinGecko bulk for whatever Yahoo lacks, and a
// capped per-symbol candle fallback for the rest (picked up next run).
async function refreshCryptoCurrentPricesBulk(env, symbols) {
  const normalized = [...new Set(symbols.map((symbol) => cryptoBaseSymbol(symbol)).filter(Boolean))];
  const errors = [];
  const today = todayIso();
  const saves = [];
  const savePrice = (symbol, price) => saves.push(saveMarketDataPoint(env, `PRICE:${symbol}-USD`, today, price));

  let remaining = normalized;
  try {
    const yahooBySymbol = new Map(remaining.map((symbol) => [symbol, yahooCryptoSymbol(symbol)]));
    const prices = await fetchYahooSparkPrices([...yahooBySymbol.values()]);
    remaining = remaining.filter((symbol) => {
      const price = prices[yahooBySymbol.get(symbol)];
      if (!(price > 0)) return true;
      savePrice(symbol, price);
      return false;
    });
  } catch (error) {
    errors.push(`Yahoo crypto prices failed: ${error?.message || "unknown"}`);
  }

  const geckoBySymbol = new Map(remaining
    .map((symbol) => [symbol, coingeckoIdForHistorySymbol(`${symbol}-USD`)])
    .filter(([, id]) => id));
  if (geckoBySymbol.size) {
    try {
      const prices = await fetchCoinGeckoBulkPrices(env, [...geckoBySymbol.values()]);
      remaining = remaining.filter((symbol) => {
        const price = prices[geckoBySymbol.get(symbol)];
        if (!(price > 0)) return true;
        savePrice(symbol, price);
        return false;
      });
    } catch (error) {
      errors.push(`CoinGecko bulk fetch failed: ${error?.message || "unknown"}`);
    }
  }
  await Promise.allSettled(saves);

  // Capped: each fallback may walk the whole candle source chain.
  const fallback = remaining.slice(0, CRYPTO_FALLBACK_PER_RUN);
  if (fallback.length) {
    const results = await runInBatches(fallback, (symbol) => refreshCryptoCurrentPrice(env, `${symbol}-USD`), 2);
    results.forEach((result, idx) => {
      if (result.status === "rejected") {
        errors.push(`${fallback[idx]}: crypto refresh failed (${result.reason?.message || "unknown"}).`);
      }
    });
  }
  return { errors };
}

async function fetchCoinGeckoCryptoCandles(env, symbol, startDate) {
  const coinId = coingeckoIdForHistorySymbol(symbol);
  if (!coinId) throw new Error(`${symbol}: CoinGecko id is not configured`);
  const start = Math.floor(Date.parse(`${startDate}T00:00:00Z`) / 1000);
  const end = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(start) || start <= 0) return [];
  const api = coingeckoApiConfig(env);
  const target = `${api.base}/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${start}&to=${end}&interval=daily`;
  const response = await fetch(target, {
    headers: {
      accept: "application/json",
      ...api.headers,
      "user-agent": "Northstar Portfolio/1.0",
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`CoinGecko ${coinId} failed (${response.status}${text ? `: ${text.slice(0, 120)}` : ""})`);
  }
  const payload = await response.json().catch(() => null);
  const prices = Array.isArray(payload?.prices) ? payload.prices : [];
  return uniqueSortedCandles(prices
    .map(([timeMs, rawPrice]) => {
      const close = Number(rawPrice);
      const time = Math.floor(Number(timeMs) / 1000);
      if (!Number.isFinite(time) || !Number.isFinite(close) || close <= 0) return null;
      return { time, open: close, high: close, low: close, close };
    })
    .filter(Boolean));
}

function cryptoBaseSymbol(symbol) {
  const clean = normalizeMarketSymbol(symbol);
  return clean.endsWith("-USD") ? clean.slice(0, -4) : clean;
}

function coingeckoApiConfig(env) {
  const proKey = env.COINGECKO_PRO_API_KEY || env.CG_PRO_API_KEY;
  if (proKey) {
    return {
      base: "https://pro-api.coingecko.com/api/v3",
      headers: { "x-cg-pro-api-key": proKey },
      hasFullHistoricalAccess: true,
    };
  }
  const demoKey = env.COINGECKO_DEMO_API_KEY || env.COINGECKO_API_KEY || env.CG_DEMO_API_KEY;
  if (demoKey) {
    return {
      base: "https://api.coingecko.com/api/v3",
      headers: { "x-cg-demo-api-key": demoKey },
      hasFullHistoricalAccess: false,
    };
  }
  return {
    base: "https://api.coingecko.com/api/v3",
    headers: {},
    hasFullHistoricalAccess: false,
  };
}

export async function handleCryptoQuotes(request, env, ctx) {
  await ensureMarketDataDb(env);
  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  const url = new URL(request.url);
  const fresh = isFreshRequest(url);
  const symbols = [...new Set(String(url.searchParams.get("symbols") || "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean))];
  if (!symbols.length) return json(request, { prices: {}, errors: [], fetchedAt: nowIso(), latestDate: "" });
  const prices = {};
  const errors = [];

  if (fresh) {
    // Bulk path: 1 subrequest for ALL gecko-mapped symbols, individual fall
    // back only for stragglers. Drops worst-case crypto refresh subrequest
    // count from ~150 (31 sym × 5 chain) to ~1-3.
    const bulkResult = await refreshCryptoCurrentPricesBulk(env, symbols);
    if (bulkResult.errors?.length) errors.push(...bulkResult.errors);
  }

  const series = symbols.map((symbol) => `PRICE:${cryptoHistorySymbolForWorker(symbol)}`);
  const cached = await getPreviousCachedMarketDataPoints(env, series, todayIso()).catch((error) => {
    errors.push(`D1 crypto price batch read failed (${error?.message || "unknown error"}).`);
    return new Map();
  });
  let latestDate = "";
  const missing = [];
  for (const symbol of symbols) {
    const historySymbol = cryptoHistorySymbolForWorker(symbol);
    const cachedPoint = cached.get(`PRICE:${historySymbol}`);
    if (cachedPoint) {
      prices[symbol] = cachedPoint.rate;
      if (cachedPoint.date && cachedPoint.date > latestDate) latestDate = cachedPoint.date;
    } else {
      errors.push(`${symbol}: current crypto price data is missing in D1.`);
      missing.push(symbol);
    }
  }
  // Cache-only load with empty D1: backfill via the bulk path (1 subrequest for
  // all gecko-mapped symbols + throttled fallback) instead of firing one
  // refreshCryptoCurrentPrice per missing symbol, which blows past Cloudflare's
  // per-invocation subrequest cap and trips CoinGecko/CoinPaprika rate limits.
  if (!fresh && missing.length) {
    ctx?.waitUntil?.(refreshCryptoCurrentPricesBulk(env, missing));
  }
  return json(request, { prices, errors, fetchedAt: nowIso(), latestDate });
}

function cryptoHistorySymbolForWorker(symbol) {
  const clean = normalizeMarketSymbol(symbol);
  return clean.endsWith("-USD") ? clean : `${clean}-USD`;
}

async function refreshCryptoCurrentPrice(env, symbol) {
  const historySymbol = cryptoHistorySymbolForWorker(symbol);
  const result = await fetchCryptoHistoricalCandles(env, historySymbol, isoDaysAgo(7));
  const candles = result.candles;
  if (!candles.length) return;
  await saveMarketCandles(env, historySymbol, candles, result.source);
  const latest = candles[candles.length - 1];
  if (Number.isFinite(Number(latest?.close)) && Number(latest.close) > 0) {
    await saveMarketDataPoint(env, `PRICE:${historySymbol}`, toCandleDate(latest) || todayIso(), Number(latest.close));
  }
}

// Daily backfill of current prices for every held crypto symbol so D1 stays
// warm and users rarely hit "missing in D1". Uses the bulk path (1 subrequest
// for all gecko-mapped symbols + throttled fallback), so it stays well under
// Cloudflare's per-invocation subrequest cap. Runs off the scheduled() cron.
export async function refreshAllCryptoPrices(env) {
  await ensureCryptoPortfolioDb(env);
  const rows = await env.DB.prepare("SELECT DISTINCT symbol FROM crypto_transactions").all().catch(() => ({ results: [] }));
  const symbols = [...new Set((rows.results ?? []).map((row) => String(row.symbol || "").toUpperCase()).filter(Boolean))];
  if (!symbols.length) return;
  await refreshCryptoCurrentPricesBulk(env, symbols).catch(() => {});
}
