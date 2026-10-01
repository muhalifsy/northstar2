export function nullableNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function nowIso() {
  return new Date().toISOString();
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function isCacheOnlyRequest(url) {
  return url.searchParams.get("cacheOnly") === "1";
}

export function isFreshRequest(url) {
  return url.searchParams.get("fresh") === "1";
}

// Run async `fn` over `items` in batches of `batchSize` (sequential batches,
// parallel within a batch). Mirrors Promise.allSettled output shape so callers
// don't have to change their result handling. Throttling avoids Yahoo
// (and CoinGecko/Binance) rate limits when refreshing many symbols at once.
export async function runInBatches(items, fn, batchSize = 5) {
  const out = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    const partial = await Promise.allSettled(slice.map((item) => fn(item)));
    out.push(...partial);
  }
  return out;
}

export function addIsoDays(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function isoDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export function daysSince(date) {
  if (!date) return Infinity;
  return (Date.now() - Date.parse(`${date}T00:00:00Z`)) / 86400000;
}

export function toIsoDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
    const [month, day, year] = value.split("/");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const [day, month, year] = value.split(".");
  return `${year}-${month}-${day}`;
}

export function splitSymbols(rawSymbols = "") {
  return rawSymbols
    .split(",")
    .map(normalizeMarketSymbol)
    .filter(Boolean);
}

export function normalizeMarketSymbol(symbol) {
  const clean = String(symbol || "").trim().toUpperCase().replace(/Ä°/g, "I").replace(/Ã„Â°/g, "I");
  if (clean === "ALTIN" || clean === "ALTIN.S1" || clean === "ALTINS1.IS") return "ALTINS1";
  if (clean === "DMLKT" || clean === "DMLKT.G" || clean === "DMLKTG" || clean === "DMLKTG.IS" || clean === "DMLKT.IS") return "DMLKT";
  if (clean === "GLDR" || clean === "GLDR.F" || clean === "GLDR.IS" || clean === "GLDTR.F") return "GLDTR.IS";
  if (clean === "RTLAB" || clean === "RTLAB.IS") return "RTALB.IS";
  return clean;
}
