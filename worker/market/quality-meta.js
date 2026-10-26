import { nowIso } from "../util.js";

// Per-symbol price-data quality record (see worker/market/quality.js), one
// market_meta row each: "quality:<symbol>" -> JSON.
export const QUALITY_PREFIX = "quality:";
export const REPAIR_SOURCE_PREFIX = "Repair:";

export async function readQuality(env, symbol) {
  const row = await env.DB.prepare("SELECT value FROM market_meta WHERE key = ?").bind(`${QUALITY_PREFIX}${symbol}`).first();
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

export async function writeQuality(env, symbol, value) {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO market_meta (key, value, updated_at) VALUES (?, ?, ?)"
  ).bind(`${QUALITY_PREFIX}${symbol}`, JSON.stringify(value), nowIso()).run();
}

// Date windows whose stored candles came from a repair. Saves from the usual
// sources skip these dates so a re-fetch cannot write the bad values back.
export async function repairedWindows(env, symbol) {
  const quality = await readQuality(env, symbol);
  return Array.isArray(quality?.repaired) ? quality.repaired : [];
}

export function insideWindows(date, windows) {
  return windows.some((window) => date >= window.from && date <= window.to);
}
