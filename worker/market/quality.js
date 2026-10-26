import { nowIso, todayIso, addIsoDays, normalizeMarketSymbol } from "../util.js";
import { json } from "../http.js";
import { requireUser } from "../auth.js";
import { ensureMarketDataDb } from "../db.js";
import { getCachedMarketCandles, saveMarketCandles, toCandleDate } from "./candles.js";
import { fetchCnnTurkCandles, fetchIsYatirimCandles, fetchInvestingSymbolCandles } from "./tr-sources.js";
import { fetchStooqDailyCandles } from "./quotes.js";
import { CRYPTO_REPAIR_SOURCES } from "./crypto.js";
import { QUALITY_PREFIX, REPAIR_SOURCE_PREFIX, readQuality, writeQuality } from "./quality-meta.js";

// Price-data quality: stored daily series can go bad at the source (Yahoo
// served GMSTR.IS as one frozen close for three years). For every symbol a
// portfolio holds, the hourly cron walks its stored closes from the first
// holding date, finds frozen stretches and missing days, and fills them from
// other sources. A source's prices are only written after they are checked
// against the user's own trade prices or the series' good stored days, so a
// wrong instrument or unit can never overwrite data. Every outcome is kept in
// market_meta ("quality:<symbol>") for the Status page.

const SYMBOLS_PER_RUN = 3;
const SCAN_LIMIT = 4;
const CURSOR_KEY = "_cursor";

// Mirrors toYahooTrSymbol in js/tr.js: the history symbol the app reads for a
// TR portfolio row.
const TR_HISTORY_OVERRIDES = {
  ALTINS1: "ALTINS1",
  BTC: "BTC-TRY",
  DMLKTG: "DMLKT",
  "DMLKT.G": "DMLKT",
  "GLDR.F": "GLDTR.IS",
  "GLDTR.F": "GLDTR.IS",
  "GMSTR.F": "GMSTR.IS",
  RTLAB: "RTALB.IS",
  RTALB: "RTALB.IS",
  "USDTR.F": "USDTR.IS",
};

function trHistorySymbol(symbol) {
  let clean = String(symbol || "").trim().toUpperCase().replace(/İ/g, "I");
  if (clean === "ALTIN.S1") clean = "ALTINS1";
  clean = clean.replace(/\.IS$/, "");
  if (TR_HISTORY_OVERRIDES[clean]) return TR_HISTORY_OVERRIDES[clean];
  if (!clean || clean.includes(".F") || clean.includes(".G") || clean.includes(".S1")) return "";
  return `${clean}.IS`;
}

function cryptoHistorySymbol(symbol) {
  const clean = String(symbol || "").trim().toUpperCase();
  if (!clean) return "";
  return clean.endsWith("-USD") ? clean : `${clean}-USD`;
}

function isCrypto(symbol) {
  return symbol.endsWith("-USD");
}


// The sources tried, in order, for a history symbol. Indices, futures and the
// app's own derived series (ALTINS1, DMLKT, BTC-TRY) have none.
function repairSourcesFor(symbol) {
  if (isCrypto(symbol)) {
    return CRYPTO_REPAIR_SOURCES.map((source) => ({
      name: source.name,
      fetch: (env, from) => source.fetch(env, symbol, from),
    }));
  }
  if (symbol.endsWith(".IS")) {
    const code = symbol.slice(0, -3);
    return [
      { name: "CNN Türk", fetch: () => fetchCnnTurkCandles(code) },
      { name: "İş Yatırım", fetch: (env, from, to) => fetchIsYatirimCandles(code, from, to) },
      { name: "Investing", fetch: (env, from) => fetchInvestingSymbolCandles(code, from) },
    ];
  }
  if (/^[A-Z][A-Z0-9.-]*$/.test(symbol) && !symbol.includes("=") && !["ALTINS1", "DMLKT", "INFQ", "BTC-TRY"].includes(symbol)) {
    return [
      { name: "Stooq", fetch: (env, from, to) => fetchStooqDailyCandles(symbol, from, to) },
      { name: "Investing", fetch: (env, from) => fetchInvestingSymbolCandles(symbol, from) },
    ];
  }
  return [];
}


// Every held history symbol with its first holding date and the trade prices
// recorded for it (all users).
async function heldSymbols(env) {
  const held = new Map();
  const note = (symbol, date, price) => {
    if (!symbol || !date) return;
    const entry = held.get(symbol) || { first: date, anchors: [] };
    if (date < entry.first) entry.first = date;
    if (Number.isFinite(price) && price > 0) entry.anchors.push({ date, price });
    held.set(symbol, entry);
  };
  const all = async (sql) => (await env.DB.prepare(sql).all().catch(() => ({ results: [] }))).results ?? [];
  for (const row of await all("SELECT symbol, date, price FROM transactions")) {
    note(normalizeMarketSymbol(row.symbol), row.date, Number(row.price));
  }
  for (const row of await all("SELECT symbol, buy_date, sell_date, quantity, sell_quantity, buy_total, sell_total FROM tr_portfolio_rows")) {
    const symbol = trHistorySymbol(row.symbol);
    const quantity = Number(row.quantity);
    note(symbol, row.buy_date, quantity > 0 ? Number(row.buy_total) / quantity : NaN);
    if (row.sell_date) {
      const sold = Number(row.sell_quantity) > 0 ? Number(row.sell_quantity) : quantity;
      note(symbol, row.sell_date, sold > 0 ? Number(row.sell_total) / sold : NaN);
    }
  }
  for (const row of await all("SELECT symbol, date, quantity, total FROM crypto_transactions")) {
    const quantity = Math.abs(Number(row.quantity));
    note(cryptoHistorySymbol(row.symbol), row.date, quantity > 0 ? Math.abs(Number(row.total)) / quantity : NaN);
  }
  return held;
}


// Trade prices are as of their date while stored closes are split-adjusted,
// so only trades with no split after them can be compared directly.
async function comparableAnchors(env, symbol, anchors) {
  if (!anchors.length) return [];
  const result = await env.DB.prepare("SELECT date FROM market_splits WHERE symbol = ?").bind(symbol).all().catch(() => ({ results: [] }));
  const splitDates = (result.results ?? []).map((row) => row.date).filter(Boolean);
  return anchors.filter((anchor) => !splitDates.some((date) => date > anchor.date));
}


function closesFrom(candles) {
  return candles
    .map((candle) => ({ date: toCandleDate(candle), close: Number(candle.close) }))
    .filter((row) => row.date && Number.isFinite(row.close) && row.close > 0)
    .sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0));
}


// Frozen stretches (the same close repeated) and missing stretches between
// start and end. Stock markets close for holidays (up to ~9 days in Türkiye),
// so only longer gaps count; crypto trades every day.
export function findBadWindows(rows, start, end, crypto) {
  const minRepeats = crypto ? 5 : 10;
  const maxGap = crypto ? 3 : 12;
  const windows = [];
  const inRange = rows.filter((row) => row.date >= start && row.date <= end);
  for (let i = 0; i < inRange.length;) {
    let j = i;
    while (j + 1 < inRange.length && inRange[j + 1].close === inRange[i].close) j += 1;
    if (j - i >= minRepeats) windows.push({ from: inRange[i + 1].date, to: inRange[j].date, kind: "frozen", close: inRange[i].close });
    i = j + 1;
  }
  const dayGap = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
  const edges = [{ date: addIsoDays(start, -1) }, ...inRange, { date: addIsoDays(end, 1) }];
  for (let k = 1; k < edges.length; k += 1) {
    if (dayGap(edges[k - 1].date, edges[k].date) > maxGap) {
      windows.push({ from: addIsoDays(edges[k - 1].date, 1), to: addIsoDays(edges[k].date, -1), kind: "missing" });
    }
  }
  return windows.sort((left, right) => (left.from < right.from ? -1 : 1));
}


function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}


function nearestClose(byDate, date, days) {
  for (let offset = 0; offset <= days; offset += 1) {
    for (const candidate of offset ? [addIsoDays(date, -offset), addIsoDays(date, offset)] : [date]) {
      if (byDate.has(candidate)) return byDate.get(candidate);
    }
  }
  return null;
}


// Whether a source's closes can fill a window: they must have data there that
// is not itself frozen, and agree with the user's trades in or near the window
// (when comparable) or else with the series' good stored days around it.
function checkCandidate(candidate, window, good, anchors, crypto, trusted) {
  const byDate = new Map(candidate.map((row) => [row.date, row.close]));
  const inside = candidate.filter((row) => row.date >= window.from && row.date <= window.to);
  if (!inside.length) {
    const before = candidate.some((row) => row.date < window.from);
    const after = candidate.some((row) => row.date > window.to);
    if (window.kind === "missing" && before && after) return { ok: true, closed: true, check: "the source has no trading days there either" };
    return { ok: false, reason: "no data for these dates" };
  }
  const frozen = findBadWindows(inside, window.from, window.to, crypto).filter((item) => item.kind === "frozen");
  if (frozen.length) {
    const sameClose = window.kind === "frozen" && frozen.some((item) => Math.abs(item.close / window.close - 1) < 0.005);
    if (sameClose) return { ok: true, confirmed: true, check: "the source shows the same unchanged price" };
    return { ok: false, reason: "its prices are frozen there too" };
  }
  if (trusted) return { ok: true, check: "source already verified for this symbol" };

  const near = anchors.filter((anchor) => anchor.date >= addIsoDays(window.from, -3) && anchor.date <= addIsoDays(window.to, 3));
  const compared = near.map((anchor) => ({ anchor, close: nearestClose(byDate, anchor.date, 3) })).filter((item) => item.close);
  if (compared.length) {
    const matches = compared.filter((item) => Math.abs(item.close / item.anchor.price - 1) <= 0.06).length;
    if (matches && matches * 2 >= compared.length) return { ok: true, check: `matches ${matches} of ${compared.length} trade prices` };
    return { ok: false, reason: `does not match the trade prices (${compared.map((item) => `${item.anchor.date} ${item.anchor.price.toFixed(2)} vs ${item.close.toFixed(2)}`).join(", ")})` };
  }

  const overlap = good
    .filter((row) => row.date >= addIsoDays(window.from, -45) && row.date <= addIsoDays(window.to, 45) && byDate.has(row.date))
    .map((row) => byDate.get(row.date) / row.close);
  if (overlap.length >= 3) {
    const ratio = median(overlap);
    if (Math.abs(ratio - 1) <= 0.03) return { ok: true, check: `matches ${overlap.length} stored days (${((ratio - 1) * 100).toFixed(1)}%)` };
    return { ok: false, reason: `differs from the stored prices by ${((ratio - 1) * 100).toFixed(1)}%` };
  }
  return { ok: false, reason: "could not be cross-checked (no trades or good stored prices nearby)" };
}


// Scans one held symbol and repairs what it can. Returns the stored record.
export async function scanSymbolQuality(env, symbol, info) {
  await ensureMarketDataDb(env);
  const crypto = isCrypto(symbol);
  const start = info.first;
  const end = addIsoDays(todayIso(), -1);
  const previous = (await readQuality(env, symbol)) || {};
  const repaired = Array.isArray(previous.repaired) ? previous.repaired : [];
  const settled = Array.isArray(previous.settled) ? previous.settled : [];
  const rows = closesFrom(await getCachedMarketCandles(env, symbol, start));
  const windows = findBadWindows(rows, start, end, crypto)
    .filter((window) => !settled.some((item) => window.from >= item.from && window.to <= item.to));
  const sources = repairSourcesFor(symbol);
  const outcomes = [];

  if (windows.length) {
    const good = rows.filter((row) => !windows.some((window) => row.date >= window.from && row.date <= window.to));
    const anchors = await comparableAnchors(env, symbol, info.anchors);
    const from = addIsoDays(windows[0].from, -45);
    const fetched = new Map();
    const trusted = new Set();
    const load = async (source) => {
      if (!fetched.has(source.name)) {
        try {
          fetched.set(source.name, { rows: closesFrom(await source.fetch(env, from, end)) });
        } catch (error) {
          fetched.set(source.name, { error: error?.message || "request failed" });
        }
      }
      return fetched.get(source.name);
    };
    const pending = windows.map((window) => ({ ...window, status: "failed", errors: [] }));
    // Two passes: a source verified on one window (e.g. against trades) is
    // trusted for the symbol's other windows in the second pass.
    for (let pass = 0; pass < 2; pass += 1) {
      for (const outcome of pending.filter((item) => item.status === "failed")) {
        if (pass === 1 && !trusted.size) break;
        const earlierErrors = outcome.errors;
        outcome.errors = [];
        for (const source of sources) {
          if (pass === 1 && !trusted.has(source.name)) continue;
          const result = await load(source);
          if (result.error) {
            outcome.errors.push(`${source.name}: ${result.error}`);
            continue;
          }
          const verdict = checkCandidate(result.rows, outcome, good, anchors, crypto, trusted.has(source.name));
          if (!verdict.ok) {
            outcome.errors.push(`${source.name}: ${verdict.reason}`);
            continue;
          }
          outcome.source = source.name;
          outcome.check = verdict.check;
          if (verdict.closed || verdict.confirmed) {
            outcome.status = verdict.closed ? "closed" : "confirmed";
            settled.push({ from: outcome.from, to: outcome.to });
          } else {
            const fill = result.rows.filter((row) => row.date >= outcome.from && row.date <= outcome.to);
            await saveMarketCandles(env, symbol, fill.map((row) => ({
              time: Math.floor(Date.parse(`${row.date}T12:00:00Z`) / 1000),
              open: row.close,
              high: row.close,
              low: row.close,
              close: row.close,
            })), `${REPAIR_SOURCE_PREFIX}${source.name}`);
            outcome.status = "repaired";
            outcome.points = fill.length;
            repaired.push({ from: outcome.from, to: outcome.to, source: source.name });
            trusted.add(source.name);
          }
          outcome.errors = [];
          break;
        }
        if (pass === 1 && outcome.status === "failed") outcome.errors = earlierErrors;
        if (!sources.length) outcome.errors = ["no other source for this symbol"];
      }
    }
    outcomes.push(...pending);
  }

  const record = {
    symbol,
    checkedAt: nowIso(),
    start,
    windows: outcomes.map(({ close, ...rest }) => rest),
    repaired,
    settled,
  };
  await writeQuality(env, symbol, record);
  return record;
}


// Hourly: the next few held symbols, in name order.
export async function stepMarketQuality(env) {
  await ensureMarketDataDb(env);
  const held = await heldSymbols(env);
  const symbols = [...held.keys()].sort();
  if (!symbols.length) return [];
  const cursor = (await readQuality(env, CURSOR_KEY))?.symbol || "";
  let index = symbols.findIndex((symbol) => symbol > cursor);
  if (index < 0) index = 0;
  const batch = [];
  for (let k = 0; k < Math.min(SYMBOLS_PER_RUN, symbols.length); k += 1) batch.push(symbols[(index + k) % symbols.length]);
  const records = [];
  for (const symbol of batch) {
    records.push(await scanSymbolQuality(env, symbol, held.get(symbol)).catch((error) => ({ symbol, error: error?.message })));
  }
  await writeQuality(env, CURSOR_KEY, { symbol: batch[batch.length - 1] });
  return records;
}


// GET /api/market-quality: every stored record (Status page).
export async function handleMarketQuality(request, env) {
  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  await ensureMarketDataDb(env);
  const result = await env.DB.prepare("SELECT key, value FROM market_meta WHERE key LIKE ?").bind(`${QUALITY_PREFIX}%`).all();
  const records = [];
  for (const row of result.results ?? []) {
    if (row.key === `${QUALITY_PREFIX}${CURSOR_KEY}`) continue;
    try {
      records.push(JSON.parse(row.value));
    } catch {}
  }
  return json(request, { ok: true, records });
}


// POST /api/market-quality/scan {symbols}: scan a few held symbols now.
export async function handleMarketQualityScan(request, env) {
  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  const body = await request.json().catch(() => ({}));
  const held = await heldSymbols(env);
  const wanted = (Array.isArray(body?.symbols) ? body.symbols : []).map((symbol) => String(symbol || "").trim().toUpperCase()).filter((symbol) => held.has(symbol)).slice(0, SCAN_LIMIT);
  const records = [];
  for (const symbol of wanted) records.push(await scanSymbolQuality(env, symbol, held.get(symbol)));
  return json(request, { ok: true, records, held: [...held.keys()].sort() });
}
