import { nowIso, todayIso, shiftDate, daysSince, toIsoDate, isCacheOnlyRequest } from "../util.js";
import { json } from "../http.js";
import { ensureMarketDataDb } from "../db.js";
import { GS3M_FALLBACK_POINTS, TRY_DEPOSIT_FALLBACK_POINTS } from "../data/rate-fallbacks.js";

export async function handleGs3m(request, env) {
  const url = new URL(request.url);
  const cacheOnly = isCacheOnlyRequest(url);
  let curve;
  try {
    curve = cacheOnly ? await getCachedGs3mCurve(env) : await getGs3mCurve(env);
  } catch {
    curve = cacheOnly ? { points: [], source: "D1 GS3M", latestDate: "", pointCount: 0, refreshError: "GS3M data is missing in D1." } : getFallbackGs3mCurve();
  }

  const rates = {};
  for (const point of curve.points || []) {
    if (point?.date && Number.isFinite(point.rate)) rates[point.date.slice(0, 7)] = point.rate;
  }

  return json(request, {
    rates,
    source: curve.source,
    latestDate: curve.latestDate,
    pointCount: (curve.points || []).length,
    refreshError: curve.refreshError || "",
  });
}

export async function handleRates(request, env) {
  const url = new URL(request.url);
  const cacheOnly = isCacheOnlyRequest(url);
  const dates = (url.searchParams.get("dates") || "")
    .split(",")
    .map((date) => date.trim())
    .filter(Boolean);

  const latest = cacheOnly ? await getPreviousCachedMarketDataPoint(env, "TCMB_USD_TRY", todayIso()) : await getLatestRate();
  if (!cacheOnly && latest) await saveMarketDataPoint(env, "TCMB_USD_TRY", latest.date || todayIso(), latest.rate);
  const pairs = await Promise.all(dates.map(async (date) => [
    date,
    cacheOnly ? await getCachedOrPreviousMarketDataPoint(env, "TCMB_USD_TRY", date) : await getCachedOrFetchHistoricalRate(env, date),
  ]));
  const rates = {};
  const missing = [];
  for (const [date, rate] of pairs) {
    if (rate) rates[date] = rate;
    else missing.push(date);
  }

  return json(request, { ok: true, source: "TCMB USD ForexBuying", latest, rates, missing });
}

export async function handleYields(request, env) {
  const url = new URL(request.url);
  const cacheOnly = isCacheOnlyRequest(url);
  let usd;
  try {
    usd = cacheOnly ? await getCachedGs3mCurve(env) : await getGs3mCurve(env);
  } catch {
    usd = { points: [], source: "D1 GS3M", latestDate: "", refreshError: "GS3M data is missing in D1." };
  }
  const tryCurve = await getTryDepositCurve(env);
  const usdUsingFallback = usd.source === "Fallback GS3M";
  const usdMissingMonths = usd.latestDate ? missingMonths(usd.latestDate) : 0;
  const tryMissingMonths = missingMonths(tryCurve.latestDate);
  const tryStale = daysSince(tryCurve.latestDate) > TRY_DEPOSIT_STALE_DAYS;
  const refreshWarning = usd.refreshError ? `GS3M refresh failed; using saved D1 data. (${usd.refreshError})` : "";
  return json(request, {
    ok: true,
    usd,
    try: tryCurve,
    status: {
      usdMissingMonths,
      tryMissingMonths,
      usdSource: usd.source,
      usdLatestDate: usd.latestDate || "",
      usdPointCount: (usd.points || []).length,
      trySource: tryCurve.source,
      tryLatestDate: tryCurve.latestDate,
      message: [usd.points?.length ? "" : "GS3M data is missing in D1.", refreshWarning, buildYieldMessage(usdMissingMonths, tryStale, usdUsingFallback)].filter(Boolean).join(" "),
    },
  });
}

export async function getLatestRate() {
  const response = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml", { headers: { accept: "application/xml,text/xml,*/*" } });
  if (!response.ok) return null;
  return parseTcmbXml(await response.text());
}

async function getHistoricalRate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  for (let offset = 0; offset <= 7; offset += 1) {
    const lookupDate = shiftDate(date, -offset);
    const [year, month, day] = lookupDate.split("-");
    const response = await fetch(`https://www.tcmb.gov.tr/kurlar/${year}${month}/${day}${month}${year}.xml`, {
      headers: { accept: "application/xml,text/xml,*/*" },
    });
    if (!response.ok) continue;
    const parsed = parseTcmbXml(await response.text(), lookupDate);
    if (parsed) return { ...parsed, requestedDate: date, usedPreviousBusinessDay: offset > 0 };
  }

  return null;
}

async function getCachedOrFetchHistoricalRate(env, date) {
  await ensureMarketDataDb(env);
  const cached = await getCachedMarketDataPoint(env, "TCMB_USD_TRY", date);
  if (cached) return cached;

  const fetched = await getHistoricalRate(date);
  if (fetched) {
    await saveMarketDataPoint(env, "TCMB_USD_TRY", fetched.date || date, fetched.rate);
    if ((fetched.date || date) !== date) await saveMarketDataPoint(env, "TCMB_USD_TRY", date, fetched.rate);
    return fetched;
  }

  return getPreviousCachedMarketDataPoint(env, "TCMB_USD_TRY", date);
}

export async function getCachedMarketDataPoint(env, series, date) {
  const row = await env.DB.prepare(
    "SELECT date, rate FROM market_data_points WHERE series = ? AND date = ?"
  ).bind(series, date).first();
  return row ? { date: row.date, rate: Number(row.rate), cached: true } : null;
}

async function getPreviousCachedMarketDataPoint(env, series, date) {
  const row = await env.DB.prepare(
    "SELECT date, rate FROM market_data_points WHERE series = ? AND date <= ? ORDER BY date DESC LIMIT 1"
  ).bind(series, date).first();
  return row ? { date: row.date, rate: Number(row.rate), cached: true, usedPreviousCachedDate: true } : null;
}

export async function getPreviousCachedMarketDataPoints(env, seriesList, date) {
  await ensureMarketDataDb(env);
  const unique = [...new Set((seriesList || []).filter(Boolean))];
  if (!unique.length) return new Map();
  const placeholders = unique.map(() => "?").join(",");
  const result = await env.DB.prepare(
    `SELECT series, date, rate FROM market_data_points WHERE series IN (${placeholders}) AND date <= ? ORDER BY series ASC, date DESC`
  ).bind(...unique, date).all();
  const map = new Map();
  for (const row of result.results ?? []) {
    if (!map.has(row.series)) {
      map.set(row.series, { date: row.date, rate: Number(row.rate), cached: true, usedPreviousCachedDate: true });
    }
  }
  return map;
}

export async function getCachedOrPreviousMarketDataPoint(env, series, date) {
  await ensureMarketDataDb(env);
  return await getCachedMarketDataPoint(env, series, date)
    || await getPreviousCachedMarketDataPoint(env, series, date);
}

async function getFreshMarketDataPoint(env, series, date, maxAgeMinutes) {
  const row = await env.DB.prepare(
    "SELECT date, rate, updated_at FROM market_data_points WHERE series = ? AND date = ?"
  ).bind(series, date).first();
  if (!row) return null;
  const updated = Date.parse(row.updated_at);
  const maxAgeMs = Math.max(Number(maxAgeMinutes) || 0, 1) * 60000;
  if (!Number.isFinite(updated) || Date.now() - updated > maxAgeMs) return null;
  return { date: row.date, rate: Number(row.rate), cached: true, updatedAt: row.updated_at };
}

export async function saveMarketDataPoint(env, series, date, rate) {
  await ensureMarketDataDb(env);
  if (!date || !Number.isFinite(Number(rate))) return;
  await env.DB.prepare(
    "INSERT OR REPLACE INTO market_data_points (series, date, rate, updated_at) VALUES (?, ?, ?, ?)"
  ).bind(series, date, Number(rate), nowIso()).run();
}

export async function getGs3mCurve(env) {
  const cached = await getCachedGs3mCurve(env);
  const shouldRefresh = !cached.points.length || missingMonths(cached.latestDate) >= 1;
  if (!shouldRefresh) return cached;

  try {
    const fresh = await fetchFreshGs3mCurve();
    await saveGs3mCurve(env, fresh.points);
    return fresh;
  } catch (error) {
    if (cached.points.length) return { ...cached, refreshError: error?.message || "GS3M refresh failed" };
    throw error;
  }
}

async function getCachedGs3mCurve(env) {
  await ensureMarketDataDb(env);
  const result = await env.DB.prepare(
    "SELECT date, rate FROM market_data_points WHERE series = ? ORDER BY date ASC"
  ).bind("GS3M").all();
  const points = (result.results ?? [])
    .map((row) => ({ date: row.date, rate: Number(row.rate) }))
    .filter((row) => row.date && Number.isFinite(row.rate));
  const latest = points[points.length - 1];
  return {
    rate: latest?.rate || 0,
    latestDate: latest?.date || "",
    points,
    source: "D1 GS3M",
  };
}

async function fetchFreshGs3mCurve() {
  const errors = [];
  try {
    return await fetchFredGs3mCurve();
  } catch (error) {
    errors.push(`FRED: ${error?.message || "failed"}`);
  }
  try {
    return await fetchFedH15Gs3mCurve();
  } catch (error) {
    errors.push(`Federal Reserve H15: ${error?.message || "failed"}`);
  }
  throw new Error(errors.join("; "));
}

async function fetchFredGs3mCurve() {
  const urls = [
    "https://fred.stlouisfed.org/graph/fredgraph.csv?id=GS3M",
    "https://fred.stlouisfed.org/graph/fredgraph.csv?cosd=1900-01-01&id=GS3M",
  ];
  let csv = "";
  let lastStatus = "";
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "text/csv,application/csv,*/*",
          "cache-control": "no-cache",
        },
        cf: { cacheTtl: 0, cacheEverything: false },
      });
      lastStatus = `${response.status} ${response.statusText}`;
      if (!response.ok) continue;
      csv = await response.text();
      if (csv.includes("GS3M") || csv.includes("observation_date")) break;
    } catch (error) {
      lastStatus = error?.message || "network error";
    }
  }
  if (!csv) throw new Error(`GS3M curve fetch failed: ${lastStatus}`);

  const points = csv.trim().split(/\r?\n/).slice(1).map((line) => {
    const [date, value] = line.split(",");
    return { date, rate: Number(value) };
  }).filter((row) => row.date && Number.isFinite(row.rate));
  if (!points.length) throw new Error("GS3M curve fetch returned no numeric points");

  const latest = points[points.length - 1];
  return { rate: latest?.rate || 0, latestDate: latest?.date || "", points, source: "FRED GS3M" };
}

async function fetchFedH15Gs3mCurve() {
  const url = "https://www.federalreserve.gov/datadownload/Output.aspx?filetype=csv&from=&label=include&lastobs=&layout=seriescolumn&rel=H15&series=bf17364827e38702b42a58cf8eaa3f78&to=&type=package";
  const response = await fetch(url, {
    headers: { accept: "text/csv,application/csv,*/*" },
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const csv = await response.text();
  if (!csv.includes("RIFLGFCM03_N.B")) throw new Error("H15 CSV did not include the 3-month series");

  const lines = csv.trim().split(/\r?\n/).map(parseCsvLine).filter((row) => row.length);
  const headerIndex = lines.findIndex((row) => row.some((cell) => cell === "RIFLGFCM03_N.B"));
  if (headerIndex < 0) throw new Error("H15 CSV header was not found");
  const header = lines[headerIndex];
  const dateIndex = header.findIndex((cell) => /time\s*period/i.test(cell));
  const valueIndex = header.findIndex((cell) => cell === "RIFLGFCM03_N.B");
  if (dateIndex < 0 || valueIndex < 0) throw new Error("H15 CSV columns were not found");

  const months = new Map();
  for (const row of lines.slice(headerIndex + 1)) {
    const date = row[dateIndex];
    const value = Number(row[valueIndex]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) continue;
    const month = date.slice(0, 7);
    const bucket = months.get(month) || { total: 0, count: 0 };
    bucket.total += value;
    bucket.count += 1;
    months.set(month, bucket);
  }

  const points = [...months.entries()]
    .filter(([, bucket]) => bucket.count > 0)
    .map(([month, bucket]) => ({ date: `${month}-01`, rate: Math.round((bucket.total / bucket.count) * 100) / 100 }))
    .sort((left, right) => left.date.localeCompare(right.date));
  if (!points.length) throw new Error("H15 CSV returned no numeric GS3M points");

  const latest = points[points.length - 1];
  return { rate: latest?.rate || 0, latestDate: latest?.date || "", points, source: "Federal Reserve H15 GS3M" };
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

async function saveGs3mCurve(env, points) {
  await ensureMarketDataDb(env);
  if (!points.length) return;
  const updatedAt = nowIso();
  await env.DB.batch(points.map((point) =>
    env.DB.prepare(
      "INSERT OR REPLACE INTO market_data_points (series, date, rate, updated_at) VALUES (?, ?, ?, ?)"
    ).bind("GS3M", point.date, Number(point.rate), updatedAt)
  ));
}

function getFallbackGs3mCurve() {
  const latest = GS3M_FALLBACK_POINTS[GS3M_FALLBACK_POINTS.length - 1];
  return {
    rate: latest?.rate || 0,
    latestDate: latest?.date || "",
    points: GS3M_FALLBACK_POINTS,
    source: "Fallback GS3M",
  };
}

// TL deposit opportunity curve: TCMB weekly "3 aya kadar vadeli TL mevduat"
// flow rate (EVDS TP.TRY.MT02, gross %). The daily cron refreshes it into D1;
// the embedded list below is only used while D1 is empty and TCMB is down.
const TRY_DEPOSIT_EVDS_SERIES = "TP.TRY.MT02";

const TRY_DEPOSIT_DB_SERIES = "TRY_DEPOSIT_MT02";

const TRY_DEPOSIT_STALE_DAYS = 21;

// Stopaj on TL deposits up to 6 months (2006/10731 BKK geçici 2). Each rate
// applies from its date on — the date accounts opened/renewed get it.
const TRY_DEPOSIT_WITHHOLDING = [
  { date: "1900-01-01", rate: 15 },
  { date: "2020-09-30", rate: 5 },   // CK 3032, extended through 30.04.2024
  { date: "2024-05-01", rate: 7.5 },
  { date: "2024-11-01", rate: 10 },
  { date: "2025-02-01", rate: 15 },
  { date: "2025-07-09", rate: 17.5 }, // CK 10041
];

export async function getTryDepositCurve(env, { refresh = false } = {}) {
  let gross = await getCachedTryDepositPoints(env).catch(() => []);
  let source = "D1 TCMB TP.TRY.MT02";
  let refreshError = "";
  if (refresh || !gross.length) {
    try {
      const fresh = await fetchTcmbTryDepositPoints();
      await saveTryDepositPoints(env, fresh);
      gross = fresh;
      source = "TCMB EVDS TP.TRY.MT02";
    } catch (error) {
      refreshError = error?.message || "TCMB refresh failed";
    }
  }
  if (!gross.length) {
    gross = TRY_DEPOSIT_FALLBACK_POINTS;
    source = "Fallback TCMB TP.TRY.MT02";
  }
  const latest = gross[gross.length - 1];
  const points = applyTryDepositWithholding(gross);
  return {
    rate: points[points.length - 1].rate,
    grossRate: latest.rate,
    latestDate: latest.date,
    points,
    source,
    withholding: TRY_DEPOSIT_WITHHOLDING,
    ...(refreshError ? { refreshError } : {}),
  };
}

// Net (after-stopaj) curve. Stopaj change dates become their own boundaries so
// a new rate starts exactly on its effective date, not at the next weekly print.
function applyTryDepositWithholding(grossPoints) {
  const first = grossPoints[0]?.date || "";
  const dates = new Set(grossPoints.map((point) => point.date));
  for (const step of TRY_DEPOSIT_WITHHOLDING) if (step.date > first) dates.add(step.date);
  let grossIndex = 0;
  let stepIndex = 0;
  return [...dates].sort().map((date) => {
    while (grossIndex + 1 < grossPoints.length && grossPoints[grossIndex + 1].date <= date) grossIndex += 1;
    while (stepIndex + 1 < TRY_DEPOSIT_WITHHOLDING.length && TRY_DEPOSIT_WITHHOLDING[stepIndex + 1].date <= date) stepIndex += 1;
    const grossRate = grossPoints[grossIndex].rate;
    const withholding = TRY_DEPOSIT_WITHHOLDING[stepIndex].rate;
    return { date, rate: Math.round(grossRate * (1 - withholding / 100) * 100) / 100, grossRate, withholding };
  });
}

async function getCachedTryDepositPoints(env) {
  await ensureMarketDataDb(env);
  const result = await env.DB.prepare(
    "SELECT date, rate FROM market_data_points WHERE series = ? ORDER BY date ASC"
  ).bind(TRY_DEPOSIT_DB_SERIES).all();
  return (result.results ?? [])
    .map((row) => ({ date: row.date, rate: Number(row.rate) }))
    .filter((row) => row.date && Number.isFinite(row.rate));
}

async function saveTryDepositPoints(env, points) {
  await ensureMarketDataDb(env);
  if (!points.length) return;
  const updatedAt = nowIso();
  await env.DB.batch(points.map((point) =>
    env.DB.prepare(
      "INSERT OR REPLACE INTO market_data_points (series, date, rate, updated_at) VALUES (?, ?, ?, ?)"
    ).bind(TRY_DEPOSIT_DB_SERIES, point.date, Number(point.rate), updatedAt)
  ));
}

// EVDS3 web data endpoint (the one evds3.tcmb.gov.tr itself uses; no API key).
async function fetchTcmbTryDepositPoints() {
  const evdsDate = (date) => `${String(date.getUTCDate()).padStart(2, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${date.getUTCFullYear()}`;
  const response = await fetch("https://evds3.tcmb.gov.tr/igmevdsms-dis/fe", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      type: "json",
      series: TRY_DEPOSIT_EVDS_SERIES,
      aggregationTypes: "avg",
      formulas: "0",
      startDate: "01-01-2019",
      endDate: evdsDate(new Date()),
      frequency: "3",
      decimalSeperator: ".",
      decimal: "2",
      dateFormat: "0",
      lang: "tr",
      yon: "1",
      sira: "1",
      ozelFormuller: [],
      groupSeperator: true,
      isRaporSayfasi: false,
    }),
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  if (!response.ok) throw new Error(`TCMB EVDS ${response.status} ${response.statusText}`);
  const payload = await response.json();
  const key = TRY_DEPOSIT_EVDS_SERIES.replaceAll(".", "_");
  const points = (payload?.items ?? []).map((item) => {
    const [day, month, year] = String(item.Tarih || "").split("-");
    return { date: `${year}-${month}-${day}`, rate: Number(item[key]) };
  }).filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.rate) && point.rate > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (points.length < 50) throw new Error(`TCMB EVDS returned only ${points.length} ${TRY_DEPOSIT_EVDS_SERIES} points`);
  return points;
}

function missingMonths(latestDate) {
  if (!latestDate) return 99;
  const now = new Date();
  const latest = new Date(`${latestDate}T12:00:00`);
  return Math.max(0, (now.getFullYear() - latest.getFullYear()) * 12 + (now.getMonth() - latest.getMonth()));
}

function buildYieldMessage(usdMissingMonths, tryStale, usdUsingFallback = false) {
  const warnings = [];
  if (usdUsingFallback) {
    warnings.push("GS3M live source is unavailable; fallback curve is being used.");
  } else if (usdMissingMonths >= 3) {
    warnings.push("GS3M has not refreshed for three consecutive months.");
  }
  if (tryStale) warnings.push(`TCMB TRY deposit rates have not refreshed for more than ${TRY_DEPOSIT_STALE_DAYS} days.`);
  return warnings.join(" ");
}

function parseTcmbXml(xml, fallbackDate) {
  const usdBlock = xml.match(/<Currency[^>]+CurrencyCode="USD"[\s\S]*?<\/Currency>/);
  const rateMatch = usdBlock?.[0]?.match(/<ForexBuying>([^<]+)<\/ForexBuying>/);
  const rate = Number(rateMatch?.[1]);
  if (!rate) return null;
  const dateMatch = xml.match(/Date="([^"]+)"/);
  return { date: fallbackDate || toIsoDate(dateMatch?.[1]), rate };
}
