import { nowIso } from "../util.js";
import { json } from "../http.js";
import { ensureMarketDataDb } from "../db.js";

// Year rows for daily candles. D1 bills rows read, and a history request used
// to read one market_candles row per symbol per day (tens of thousands per
// page load). market_candle_years keeps the same candles packed as one JSON
// row per symbol per year, so the same request reads a few rows per symbol.
//
// market_candles stays the source of truth and is still written as before.
// A symbol is served from its year rows only once its year = 0 marker exists,
// i.e. after stepCandleYears() built every year from market_candles; until
// then reads fall back to market_candles, so a half-built symbol is never
// served. Writes after that are merged into the year rows as they happen, and
// the hourly step keeps re-checking symbols against market_candles and
// rewrites any year that drifted (e.g. two writers racing on one year row).

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MARKER_YEAR = 0;
// The first full build reads every stored candle once; it waits for the next
// daily D1 quota reset (00:00 UTC) after the day the quota ran hot.
const BUILD_AFTER = Date.parse("2026-10-08T00:10:00Z");
const SYMBOLS_PER_RUN_BUILDING = 15;
const SYMBOLS_PER_RUN_CHECKING = 3;
const META_PREFIX = "candle_years:";

function candleEntry(row) {
  return [row.date, row.open, row.high, row.low, row.close];
}

function entryToRow(entry) {
  return { date: entry[0], open: entry[1], high: entry[2], low: entry[3], close: entry[4] };
}

// Candle rows ({ date, open, high, low, close }) with date >= startDate, for
// every symbol in `symbols` whose year rows are complete. Symbols missing from
// the returned map must be read from market_candles.
export async function readCandleYears(env, symbols, startDate) {
  const bySymbol = new Map();
  if (!symbols.length || !DATE_PATTERN.test(String(startDate || ""))) return bySymbol;
  const placeholders = symbols.map(() => "?").join(",");
  let result;
  try {
    result = await env.DB.prepare(
      `SELECT symbol, year, candles FROM market_candle_years WHERE symbol IN (${placeholders}) AND (year = ${MARKER_YEAR} OR year >= ?) ORDER BY symbol ASC, year ASC`
    ).bind(...symbols, Number(startDate.slice(0, 4))).all();
  } catch {
    return bySymbol;
  }
  const complete = new Set();
  const yearsBySymbol = new Map();
  for (const row of result.results ?? []) {
    if (Number(row.year) === MARKER_YEAR) {
      complete.add(row.symbol);
      continue;
    }
    if (!yearsBySymbol.has(row.symbol)) yearsBySymbol.set(row.symbol, []);
    yearsBySymbol.get(row.symbol).push(row.candles);
  }
  for (const symbol of complete) {
    try {
      const rows = [];
      for (const text of yearsBySymbol.get(symbol) || []) {
        for (const entry of JSON.parse(text)) {
          if (entry[0] >= startDate) rows.push(entryToRow(entry));
        }
      }
      bySymbol.set(symbol, rows);
    } catch {
      // Unreadable year row: leave the symbol to the market_candles fallback.
    }
  }
  return bySymbol;
}

// Called right after saveMarketCandles wrote `rows` to market_candles. Merges
// them into the symbol's year rows (new values win, as INSERT OR REPLACE does
// there). Symbols without a marker are left alone; the hourly step builds them.
export async function mergeIntoCandleYears(env, symbol, rows, updatedAt = nowIso()) {
  if (!rows.length) return;
  if (rows.some((row) => !DATE_PATTERN.test(String(row.date || "")))) {
    // A date the year rows cannot hold: serve this symbol from market_candles.
    await env.DB.prepare(`DELETE FROM market_candle_years WHERE symbol = ? AND year = ${MARKER_YEAR}`).bind(symbol).run();
    return;
  }
  const rowsByYear = new Map();
  for (const row of rows) {
    const year = Number(row.date.slice(0, 4));
    if (!rowsByYear.has(year)) rowsByYear.set(year, []);
    rowsByYear.get(year).push(row);
  }
  const years = [...rowsByYear.keys()];
  const existing = await env.DB.prepare(
    `SELECT year, candles FROM market_candle_years WHERE symbol = ? AND (year = ${MARKER_YEAR} OR year IN (${years.map(() => "?").join(",")}))`
  ).bind(symbol, ...years).all();
  const storedByYear = new Map((existing.results ?? []).map((row) => [Number(row.year), row.candles]));
  if (!storedByYear.has(MARKER_YEAR)) return;

  const statements = years.map((year) => {
    const byDate = new Map(JSON.parse(storedByYear.get(year) || "[]").map((entry) => [entry[0], entry]));
    for (const row of rowsByYear.get(year)) byDate.set(row.date, candleEntry(row));
    const entries = [...byDate.values()].sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
    return env.DB.prepare(
      "INSERT OR REPLACE INTO market_candle_years (symbol, year, candles, updated_at) VALUES (?, ?, ?, ?)"
    ).bind(symbol, year, JSON.stringify(entries), updatedAt);
  });
  await env.DB.batch(statements);
}

// Builds or re-checks one symbol's year rows against market_candles.
// Returns "built" (marker was missing), "repaired" (a year differed), "ok",
// or "skipped" (a stored date the year rows cannot hold).
async function syncSymbol(env, symbol) {
  const daily = await env.DB.prepare(
    "SELECT date, open, high, low, close FROM market_candles WHERE symbol = ? ORDER BY date ASC"
  ).bind(symbol).all();
  const expected = new Map();
  for (const row of daily.results ?? []) {
    if (!DATE_PATTERN.test(String(row.date || ""))) {
      await env.DB.prepare("DELETE FROM market_candle_years WHERE symbol = ?").bind(symbol).run();
      return "skipped";
    }
    const year = Number(row.date.slice(0, 4));
    if (!expected.has(year)) expected.set(year, []);
    expected.get(year).push(candleEntry(row));
  }
  const expectedText = new Map([...expected].map(([year, entries]) => [year, JSON.stringify(entries)]));

  const stored = await env.DB.prepare("SELECT year, candles FROM market_candle_years WHERE symbol = ?").bind(symbol).all();
  const storedByYear = new Map((stored.results ?? []).map((row) => [Number(row.year), row.candles]));
  const hasMarker = storedByYear.has(MARKER_YEAR);
  storedByYear.delete(MARKER_YEAR);
  const changedYears = [...expectedText].filter(([year, text]) => storedByYear.get(year) !== text).map(([year]) => year);
  const extraYears = [...storedByYear.keys()].filter((year) => !expectedText.has(year));
  if (hasMarker && !changedYears.length && !extraYears.length) return "ok";

  const updatedAt = nowIso();
  await env.DB.batch([
    ...changedYears.map((year) => env.DB.prepare(
      "INSERT OR REPLACE INTO market_candle_years (symbol, year, candles, updated_at) VALUES (?, ?, ?, ?)"
    ).bind(symbol, year, expectedText.get(year), updatedAt)),
    ...extraYears.map((year) => env.DB.prepare(
      "DELETE FROM market_candle_years WHERE symbol = ? AND year = ?"
    ).bind(symbol, year)),
    env.DB.prepare(
      "INSERT OR REPLACE INTO market_candle_years (symbol, year, candles, updated_at) VALUES (?, ?, '[]', ?)"
    ).bind(symbol, MARKER_YEAR, updatedAt),
  ]);
  return hasMarker ? "repaired" : "built";
}

async function readMeta(env) {
  const result = await env.DB.prepare("SELECT key, value FROM market_meta WHERE key LIKE ?").bind(`${META_PREFIX}%`).all();
  return Object.fromEntries((result.results ?? []).map((row) => [row.key.slice(META_PREFIX.length), row.value]));
}

// Hourly: walks the symbols in market_candles in name order, a few per run.
// The first pass builds every symbol; after that the walk keeps comparing
// symbols with market_candles, builds new ones and repairs drifted years.
export async function stepCandleYears(env, { force = false } = {}) {
  if (!force && Date.now() < BUILD_AFTER) return { skipped: "waiting for quota reset" };
  await ensureMarketDataDb(env);
  const meta = await readMeta(env);
  let cursor = meta.cursor || "";
  let phase = meta.phase || "building";
  const counts = {
    built: Number(meta.built) || 0,
    checked: Number(meta.checked) || 0,
    repaired: Number(meta.repaired) || 0,
  };
  let lastRepair = meta.last_repair || "";
  const budget = phase === "checking" ? SYMBOLS_PER_RUN_CHECKING : SYMBOLS_PER_RUN_BUILDING;
  for (let visited = 0; visited < budget; visited += 1) {
    const next = await env.DB.prepare(
      "SELECT symbol FROM market_candles WHERE symbol > ? ORDER BY symbol ASC LIMIT 1"
    ).bind(cursor).first();
    if (!next) {
      cursor = "";
      phase = "checking";
      break;
    }
    cursor = next.symbol;
    const outcome = await syncSymbol(env, cursor);
    if (outcome === "built") counts.built += 1;
    if (outcome === "ok") counts.checked += 1;
    if (outcome === "repaired") {
      counts.repaired += 1;
      lastRepair = `${cursor} ${nowIso()}`;
    }
  }
  const updatedAt = nowIso();
  const values = { cursor, phase, ...counts, last_repair: lastRepair, last_run: updatedAt };
  await env.DB.batch(Object.entries(values).map(([key, value]) => env.DB.prepare(
    "INSERT OR REPLACE INTO market_meta (key, value, updated_at) VALUES (?, ?, ?)"
  ).bind(`${META_PREFIX}${key}`, String(value), updatedAt)));
  return values;
}

export async function handleCandleYearsStatus(request, env) {
  await ensureMarketDataDb(env);
  return json(request, { candleYears: await readMeta(env) });
}
