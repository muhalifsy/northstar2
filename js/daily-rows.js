import { TODAY_ISO, state } from "./state.js";
import { addIsoDays } from "./util.js";
import { apiFetch } from "./api.js";
import { cashFlowAllMovements } from "./cashflow.js";

// The daily chart's rows, saved in D1 (calculated_cache "daily-rows") so an
// open does not recompute ~1,800 past days. A saved row is reused only while
// nothing it depends on changed: the portfolio / cash-flow entries dated on or
// before it, the stored prices and USD/TRY rates of its month and before, and
// the split list. The earliest change decides from which day rows are
// recomputed: an edit dated today recomputes today, a price repaired in
// 2023-11 recomputes from 2023-11-01. The last SETTLE_DAYS stay live because
// their closes may still arrive. Bump DAILY_ROWS_VERSION whenever the row
// calculation (js/quarter.js buildQuarterRow and what it calls) changes.
const DAILY_ROWS_KEY = "daily-rows";
const DAILY_ROWS_VERSION = 1;
const SETTLE_DAYS = 3;
const DAILY_FIELDS = [
  "totalUsd",
  "accountUsd",
  "cryptoUsd",
  "breakdownUsdHoldings",
  "breakdownCryptoHoldings",
  "breakdownTrHoldingsUsd",
  "breakdownCashUsd",
  "breakdownCashUsdt",
  "breakdownCashTryUsd",
  "breakdownTotal",
  "abdHoldingsCashUsd",
  "trHoldingsCashUsd",
  "cryptoHoldingsCashUsd",
];

let saved = null;
let savedSignature = "";


export async function loadDailyRows() {
  try {
    const payload = await apiFetch(`/api/calculated-cache?key=${DAILY_ROWS_KEY}`);
    const value = payload?.value;
    saved = value?.version === DAILY_ROWS_VERSION && Array.isArray(value.rows) ? value : null;
  } catch {
    saved = null;
  }
}


export function clearDailyRows() {
  saved = null;
  savedSignature = "";
}


function hashText(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}


// [earliest date the entry affects, hash of the entry] for every saved entry.
function dataEntries() {
  const entries = [];
  const add = (kind, row, dates) => {
    entries.push([dates.filter(Boolean).sort()[0] || "0000-00-00", hashText(`${kind}${JSON.stringify(row)}`)]);
  };
  for (const row of state.transactions) add("abd", row, [row.date, row.splitDate]);
  for (const row of state.trRows) add("tr", row, [row.buyDate, row.sellDate, row.splitDate]);
  for (const row of state.cryptoRows) add("crypto", row, [row.date]);
  for (const row of cashFlowAllMovements()) add("cash", row, [row.date]);
  return entries;
}


function earliestEntryChange(entries) {
  if (!saved?.entries) return "0000-00-00";
  const before = new Map(saved.entries.map(([date, hash]) => [hash, date]));
  const now = new Map(entries.map(([date, hash]) => [hash, date]));
  let earliest = "9999-12-31";
  for (const [hash, date] of now) if (!before.has(hash) && date < earliest) earliest = date;
  for (const [hash, date] of before) if (!now.has(hash) && date < earliest) earliest = date;
  return earliest;
}


// Month-by-month hashes of every stored close and rate, plus the split list.
const _priceFingerprints = new WeakMap();

function priceFingerprints(history, rates) {
  const cached = _priceFingerprints.get(history);
  if (cached?.rates === rates) return cached.prints;
  const prints = {};
  for (const [symbol, candles] of Object.entries(history || {})) {
    if (!Array.isArray(candles)) continue;
    const months = {};
    for (const candle of candles) {
      const month = new Date(candle.time * 1000).toISOString().slice(0, 7);
      (months[month] ||= []).push(candle.close);
    }
    prints[symbol] = Object.fromEntries(Object.entries(months).map(([month, closes]) => [month, hashText(closes.join(","))]));
  }
  const rateMonths = {};
  for (const [date, value] of Object.entries(rates || {})) (rateMonths[date.slice(0, 7)] ||= []).push(`${date}:${value?.rate}`);
  prints.__rates = Object.fromEntries(Object.entries(rateMonths).map(([month, items]) => [month, hashText(items.sort().join(","))]));
  prints.__splits = hashText(JSON.stringify([...state.historySplitsBySymbol.entries()]));
  _priceFingerprints.set(history, { rates, prints });
  return prints;
}


function earliestPriceChange(prints) {
  if (!saved?.prices) return "0000-00-00";
  if (saved.prices.__splits !== prints.__splits) return "0000-00-00";
  let earliest = "9999-12-31";
  const symbols = new Set([...Object.keys(saved.prices), ...Object.keys(prints)]);
  symbols.delete("__splits");
  for (const symbol of symbols) {
    const before = saved.prices[symbol] || {};
    const now = prints[symbol] || {};
    for (const month of new Set([...Object.keys(before), ...Object.keys(now)])) {
      if (before[month] !== now[month] && `${month}-01` < earliest) earliest = `${month}-01`;
    }
  }
  return earliest;
}


function rowFromValues(values) {
  const row = { date: values[0], hasBenchmarks: false, status: "OK" };
  DAILY_FIELDS.forEach((field, index) => {
    row[field] = values[index + 1];
  });
  return row;
}


// Saved rows usable before the price history has loaded (only the entries
// can be checked yet), for drawing the daily chart right away.
export function savedRowsBeforeHistory() {
  if (!saved) return [];
  const from = earliestEntryChange(dataEntries());
  return saved.rows.filter((values) => values[0] < from).map(rowFromValues);
}


// Puts the saved rows still valid for the loaded history into the row memo.
export function seedDailyRows(memo, history, rates) {
  if (!saved) return;
  const changedFrom = [earliestEntryChange(dataEntries()), earliestPriceChange(priceFingerprints(history, rates))].sort()[0];
  const settled = addIsoDays(TODAY_ISO, -SETTLE_DAYS);
  for (const values of saved.rows) {
    const date = values[0];
    if (date >= changedFrom || date > settled || memo.has(date)) continue;
    memo.set(date, rowFromValues(values));
  }
}


// Saves the settled rows of the memo when they differ from what is saved.
export function saveDailyRows(memo, history, rates) {
  const settled = addIsoDays(TODAY_ISO, -SETTLE_DAYS);
  const rows = [...memo.values()]
    .filter((row) => row.date <= settled && row.status === "OK")
    .sort((left, right) => (left.date < right.date ? -1 : 1))
    .map((row) => [row.date, ...DAILY_FIELDS.map((field) => (Number.isFinite(row[field]) ? row[field] : null))]);
  if (!rows.length) return;
  const value = {
    version: DAILY_ROWS_VERSION,
    savedAt: new Date().toISOString(),
    entries: dataEntries(),
    prices: priceFingerprints(history, rates),
    rows,
  };
  const signature = hashText(JSON.stringify([value.entries, value.prices, rows]));
  if (signature === savedSignature) return;
  savedSignature = signature;
  saved = value;
  apiFetch("/api/calculated-cache", { method: "PUT", body: JSON.stringify({ key: DAILY_ROWS_KEY, value }) }).catch(() => {});
}
