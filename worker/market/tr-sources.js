import { todayIso } from "../util.js";
import { json } from "../http.js";
import { parseTrNumber } from "./quotes.js";
import { historyNeedsRefresh, toCandleDate, fetchYahooHistoricalDailyCandles, uniqueSortedCandles } from "./candles.js";
import { ALTINS1_DOVIZ_HISTORY, DMLKT_HISTORY } from "../data/price-history.js";

export async function fetchInfqHistoricalCandles(startDate) {
  const mergerDate = "2026-02-17";
  const [legacy, current] = await Promise.all([
    fetchYahooHistoricalDailyCandles("CCCX", startDate).catch(() => []),
    fetchYahooHistoricalDailyCandles("INFQ", startDate).catch(() => []),
  ]);
  const merged = [
    ...builtInCccxCandles().filter((candle) => toCandleDate(candle) >= startDate && toCandleDate(candle) < mergerDate),
    ...legacy.filter((candle) => toCandleDate(candle) < mergerDate),
    ...current.filter((candle) => toCandleDate(candle) >= mergerDate),
  ];
  if (merged.length) return uniqueSortedCandles(merged);
  return fetchYahooHistoricalDailyCandles("INFQ", startDate);
}

const CCCX_HISTORY = "2025-10-03:14.45|2025-10-06:15.99|2025-10-07:18.23|2025-10-08:19.29|2025-10-09:21.59|2025-10-10:22.41|2025-10-13:25.95|2025-10-14:24.33|2025-10-15:22.90|2025-10-16:19.74|2025-10-17:21.10|2025-10-20:21.50|2025-10-21:18.61|2025-10-22:16.98|2025-10-23:19.58|2025-10-24:20.49|2025-10-27:21.34|2025-10-28:20.33|2025-10-29:19.48|2025-10-30:17.86|2025-10-31:19.26|2025-11-03:17.37|2025-11-04:15.51|2025-11-05:18.47|2025-11-06:17.72|2025-11-13:16.06";

function builtInCccxCandles() {
  return builtInHistoryCandles(CCCX_HISTORY);
}

export async function fetchDmlktCandles(startDate) {
  const seeded = builtInDmlktCandles().filter((candle) => toCandleDate(candle) >= startDate);
  const live = await fetchInvestingSymbolCandles("DMLKT", startDate).catch(() => []);
  return uniqueSortedCandles([...seeded, ...live]);
}

export function isAltins1Symbol(symbol) {
  const clean = String(symbol || "").trim().toUpperCase();
  return clean === "ALTIN" || clean === "ALTIN.S1" || clean === "ALTINS1" || clean === "ALTINS1.IS";
}

export async function fetchAltins1Candles(startDate = "2023-01-01") {
  const seeded = builtInAltins1Candles();
  if (seeded.length && toCandleDate(seeded[seeded.length - 1]) >= startDate) return seeded;

  const errors = [];
  const sources = [
    ["Doviz.com", () => fetchDovizAltins1Candles(startDate)],
    ["Hisse.net", () => fetchHisseNetAltins1Candles()],
    ["Investing", () => fetchInvestingAltinCandles()],
  ];

  for (const [name, loader] of sources) {
    try {
      const candles = uniqueSortedCandles(await loader());
      if (candles.length && !historyNeedsRefresh(candles, startDate)) return candles;
      if (candles.length) errors.push(`${name}: starts at ${toCandleDate(candles[0])}`);
      else errors.push(`${name}: no candles`);
    } catch (error) {
      errors.push(`${name}: ${error?.message || "failed"}`);
    }
  }

  throw new Error(errors.join("; "));
}

function builtInAltins1Candles() {
  return builtInHistoryCandles(ALTINS1_DOVIZ_HISTORY);
}

function builtInDmlktCandles() {
  return builtInHistoryCandles(DMLKT_HISTORY);
}

function builtInHistoryCandles(historyText) {
  return String(historyText || "").split("|")
    .map((entry) => {
      const [date, rawPrice] = entry.split(":");
      const close = Number(rawPrice);
      if (!date || !Number.isFinite(close) || close <= 0) return null;
      return {
        time: Math.floor(Date.parse(`${date}T12:00:00Z`) / 1000),
        open: close,
        high: close,
        low: close,
        close,
      };
    })
    .filter(Boolean);
}

export async function fetchDovizAltins1Candles(startDate = "2023-01-01") {
  const start = Math.floor(Date.parse(`${startDate}T00:00:00Z`) / 1000);
  const end = Math.floor((Date.now() + 86400000) / 1000);
  if (!Number.isFinite(start) || start <= 0) return [];
  const token = await fetchDovizApiToken();
  if (!token) throw new Error("Doviz.com ALTINS1 archive skipped: no API token");
  const endDate = todayIso();
  const slugs = [
    "altins1-darphane-altin-sertifikasi",
    "ALTINS1",
    "altins1",
  ];
  const errors = [];

  for (const slug of slugs) {
    for (const url of dovizAltins1ArchiveUrls(slug, start, end, startDate, endDate)) {
      try {
        const response = await fetch(url, {
          headers: {
            accept: "application/json,text/plain,*/*",
            authorization: `Bearer ${token}`,
            origin: "https://borsa.doviz.com",
            referer: "https://borsa.doviz.com/hisseler/altins1-darphane-altin-sertifikasi/tarihsel-veri",
            "user-agent": "Mozilla/5.0",
            "x-requested-with": "XMLHttpRequest",
          },
          cf: { cacheTtl: 0, cacheEverything: false },
        });
        if (!response.ok) {
          errors.push(`${slug}: ${response.status}`);
          continue;
        }
        const payload = await response.json().catch(() => null);
        const archive = extractDovizArchive(payload);
        const candles = uniqueSortedCandles(archive.map(dovizArchiveItemToCandle).filter(Boolean));
        if (candles.length && !historyNeedsRefresh(candles, startDate)) return candles;
        if (candles.length) {
          errors.push(`${slug}: archive starts at ${toCandleDate(candles[0])} (${describeJsonShape(payload)})`);
        } else {
          errors.push(`${slug}: empty archive (${describeJsonShape(payload)})`);
        }
      } catch (error) {
        errors.push(`${slug}: ${error?.message || "failed"}`);
      }
    }
  }

  throw new Error(`Doviz.com ALTINS1 archive failed (${errors.join("; ")})`);
}

function dovizAltins1ArchiveUrls(slug, start, end, startDate, endDate) {
  const encoded = encodeURIComponent(slug);
  const base = `https://api.doviz.com/api/v12/assets/${encoded}`;
  return [
    `${base}/archive?start=${start}&end=${end}`,
    `${base}/archive?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`,
    `${base}/archive?from=${start}&to=${end}`,
    `${base}/archive?from_date=${encodeURIComponent(startDate)}&to_date=${encodeURIComponent(endDate)}`,
    `${base}/historical?start=${start}&end=${end}`,
    `${base}/historical?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`,
  ];
}

function extractDovizArchive(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.archive)) return payload.archive;
  if (Array.isArray(payload?.data?.archive)) return payload.data.archive;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.result?.archive)) return payload.result.archive;
  if (Array.isArray(payload?.result?.data)) return payload.result.data;
  return [];
}

function describeJsonShape(value) {
  if (value == null) return "null";
  if (Array.isArray(value)) return `array:${value.length}`;
  if (typeof value !== "object") return typeof value;
  return Object.keys(value).slice(0, 8).join(",") || "empty object";
}

// Scrape doviz.com's public front-end for its short-lived API bearer token.
// Returns null when the token can't be found; callers treat Doviz.com as just
// one of several price sources and fall back to the others.
async function fetchDovizApiToken() {
  try {
    const response = await fetch("https://www.doviz.com/", {
      headers: { "user-agent": "Mozilla/5.0" },
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    if (!response.ok) return null;
    const html = await response.text();
    const match = html.match(/token["']?\s*:\s*["']([a-f0-9]{64})["']/i)
      || html.match(/Bearer\s+([a-f0-9]{64})/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

function dovizArchiveItemToCandle(item) {
  const date = dovizArchiveItemDate(item);
  const close = Number(item?.close ?? item?.value ?? item?.price ?? item?.last ?? item?.latest);
  if (!date || !Number.isFinite(close) || close <= 0) return null;
  const open = Number(item?.open);
  const high = Number(item?.highest ?? item?.high ?? item?.max);
  const low = Number(item?.lowest ?? item?.low ?? item?.min);
  return {
    time: Math.floor(Date.parse(`${date}T12:00:00Z`) / 1000),
    open: Number.isFinite(open) && open > 0 ? open : close,
    high: Number.isFinite(high) && high > 0 ? high : close,
    low: Number.isFinite(low) && low > 0 ? low : close,
    close,
  };
}

function dovizArchiveItemDate(item) {
  const raw = item?.update_date ?? item?.date ?? item?.created_at ?? item?.time ?? item?.timestamp;
  if (raw == null) return "";
  if (typeof raw === "number") {
    const ms = raw > 100000000000 ? raw : raw * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(String(raw))) return String(raw).slice(0, 10);
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    const ms = numeric > 100000000000 ? numeric : numeric * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return "";
}

async function fetchHisseNetAltins1Candles() {
  const urls = [
    "https://www.hisse.net/borsa/hisseler/altins1-darphane-altin-sertifikasi/tarihselveriler",
    "https://www.hisse.net/borsa/hisseler/altins1-darphane-altin-sertifikasibilanco/tarihselveriler",
  ];

  for (const url of urls) {
    const response = await fetch(url, {
      headers: {
        "accept-language": "tr-TR,tr;q=0.9,en;q=0.7",
        "user-agent": "Mozilla/5.0",
      },
    });
    if (!response.ok) continue;
    const html = await response.text();
    const candles = parseHisseNetHistoricalCandles(html);
    if (candles.length) return candles;
  }

  return [];
}

function parseHisseNetHistoricalCandles(html) {
  const rows = [...String(html || "").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const candles = [];

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => decodeHtml(cell[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()));
    const candle = parseHisseNetHistoricalCells(cells);
    if (candle) candles.push(candle);
  }

  if (!candles.length) {
    const text = htmlToPlainText(html);
    const linePattern = /(\d{1,2}\s+[A-Za-z\u00c7\u011e\u0130\u00d6\u015e\u00dc\u00e7\u011f\u0131\u00f6\u015f\u00fc]+\s+\d{4})\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)/g;
    for (const match of text.matchAll(linePattern)) {
      const candle = parseHisseNetHistoricalCells([match[1], match[2], match[3], match[4]]);
      if (candle) candles.push(candle);
    }
  }

  return candles
    .sort((left, right) => left.time - right.time)
    .filter((item, index, list) => index === 0 || item.time !== list[index - 1].time);
}

function parseHisseNetHistoricalCells(cells) {
  if (!Array.isArray(cells) || cells.length < 4) return null;
  const date = parseTurkishLongDate(cells[0]);
  const close = parseTrNumber(cells[1]);
  const low = parseTrNumber(cells[2]);
  const high = parseTrNumber(cells[3]);
  if (!date || ![close, low, high].every(Number.isFinite)) return null;
  return {
    time: Math.floor(Date.parse(`${date}T12:00:00Z`) / 1000),
    open: close,
    high,
    low,
    close,
  };
}

function htmlToPlainText(html) {
  return decodeHtml(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function parseTurkishLongDate(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})\s+([A-Za-z\u00c7\u011e\u0130\u00d6\u015e\u00dc\u00e7\u011f\u0131\u00f6\u015f\u00fc]+)\s+(\d{4})$/);
  if (!match) return parseInvestingDate(value);
  const monthName = normalizeTurkishToken(match[2]);
  const months = {
    ocak: "01", oca: "01", jan: "01",
    subat: "02", sub: "02", feb: "02",
    mart: "03", mar: "03",
    nisan: "04", nis: "04", apr: "04",
    mayis: "05", may: "05",
    haziran: "06", haz: "06", jun: "06",
    temmuz: "07", tem: "07", jul: "07",
    agustos: "08", agu: "08", aug: "08",
    eylul: "09", eyl: "09", sep: "09",
    ekim: "10", eki: "10", oct: "10",
    kasim: "11", kas: "11", nov: "11",
    aralik: "12", ara: "12", dec: "12",
  };
  const month = months[monthName] || months[monthName.slice(0, 3)];
  return month ? `${match[3]}-${month}-${match[1].padStart(2, "0")}` : "";
}

function normalizeTurkishToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\u0131/g, "i")
    .replace(/\u00e7/g, "c")
    .replace(/\u011f/g, "g")
    .replace(/\u00f6/g, "o")
    .replace(/\u015f/g, "s")
    .replace(/\u00fc/g, "u")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function fetchInvestingAltinCandles() {
  const apiCandles = await fetchInvestingAltinChartCandles();
  if (apiCandles.length >= 60) return apiCandles;

  const response = await fetch("https://tr.investing.com/equities/turkiye-cumhuriyeti-hazine-ve-historical-data", {
    headers: {
      "accept-language": "tr-TR,tr;q=0.9,en;q=0.7",
      "cookie": "smd=3; pair_date_filter=last_year",
      "referer": "https://tr.investing.com/equities/turkiye-cumhuriyeti-hazine-ve-historical-data",
      "user-agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) return [];
  const html = await response.text();
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const candles = [];

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => decodeHtml(cell[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()));
    if (cells.length < 5) continue;
    const date = parseInvestingDate(cells[0]);
    const close = parseTrNumber(cells[1]);
    const open = parseTrNumber(cells[2]);
    const high = parseTrNumber(cells[3]);
    const low = parseTrNumber(cells[4]);
    if (!date || ![open, high, low, close].every(Number.isFinite)) continue;
    candles.push({
      time: Math.floor(Date.parse(`${date}T12:00:00Z`) / 1000),
      open,
      high,
      low,
      close,
    });
  }

  return candles
    .sort((left, right) => left.time - right.time)
    .filter((item, index, list) => index === 0 || item.time !== list[index - 1].time);
}

async function fetchInvestingAltinChartCandles() {
  const pairId = await fetchInvestingAltinPairId();
  if (!pairId) return [];
  const url = `https://api.investing.com/api/financialdata/${encodeURIComponent(pairId)}/historical/chart?period=P5Y&interval=P1D&pointscount=1500`;
  const response = await fetch(url, {
    headers: {
      "accept": "application/json,text/plain,*/*",
      "domain-id": "tr",
      "origin": "https://tr.investing.com",
      "referer": "https://tr.investing.com/",
      "user-agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null);
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return rows
    .map((item) => {
      const time = Number(item.date || item.time || item.timestamp);
      const open = Number(item.price_open ?? item.open);
      const high = Number(item.price_high ?? item.high);
      const low = Number(item.price_low ?? item.low);
      const close = Number(item.price_close ?? item.close ?? item.value);
      return {
        time: time > 100000000000 ? Math.floor(time / 1000) : time,
        open,
        high,
        low,
        close,
      };
    })
    .filter((item) => Number.isFinite(item.time) && [item.open, item.high, item.low, item.close].every(Number.isFinite))
    .sort((left, right) => left.time - right.time);
}

async function fetchInvestingSymbolCandles(symbol, startDate = "2020-01-01") {
  const pairId = await fetchInvestingPairId(symbol);
  if (!pairId) return [];
  const url = `https://api.investing.com/api/financialdata/${encodeURIComponent(pairId)}/historical/chart?period=P5Y&interval=P1D&pointscount=1500`;
  const response = await fetch(url, {
    headers: {
      "accept": "application/json,text/plain,*/*",
      "domain-id": "www",
      "origin": "https://www.investing.com",
      "referer": "https://www.investing.com/",
      "user-agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null);
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return rows
    .map(investingChartItemToCandle)
    .filter(Boolean)
    .filter((item) => toCandleDate(item) >= startDate)
    .sort((left, right) => left.time - right.time);
}

function investingChartItemToCandle(item) {
  const time = Number(item?.date || item?.time || item?.timestamp);
  const open = Number(item?.price_open ?? item?.open ?? item?.price);
  const high = Number(item?.price_high ?? item?.high ?? item?.price);
  const low = Number(item?.price_low ?? item?.low ?? item?.price);
  const close = Number(item?.price_close ?? item?.close ?? item?.value ?? item?.price);
  const normalizedTime = time > 100000000000 ? Math.floor(time / 1000) : time;
  if (!Number.isFinite(normalizedTime) || ![open, high, low, close].every(Number.isFinite)) return null;
  return { time: normalizedTime, open, high, low, close };
}

async function fetchInvestingPairId(symbol) {
  const clean = String(symbol || "").trim().toUpperCase();
  const response = await fetch("https://www.investing.com/search/service/searchTopBar", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Mozilla/5.0",
      "x-requested-with": "XMLHttpRequest",
    },
    body: `search_text=${encodeURIComponent(clean)}`,
  });
  if (!response.ok) return "";
  const payload = await response.json().catch(() => null);
  const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];
  const match = quotes.find((item) => String(item.symbol || "").toUpperCase() === clean)
    || quotes.find((item) => String(item.symbol || "").toUpperCase().includes(clean));
  return match?.pairId ? String(match.pairId) : "";
}

async function fetchInvestingAltinPairId() {
  const response = await fetch("https://www.investing.com/search/service/searchTopBar", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Mozilla/5.0",
      "x-requested-with": "XMLHttpRequest",
    },
    body: "search_text=ALTIN",
  });
  if (!response.ok) return "";
  const payload = await response.json().catch(() => null);
  const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];
  const match = quotes.find((item) =>
    String(item.symbol || "").toUpperCase() === "ALTIN" &&
    String(item.description || "").toLowerCase().includes("darphane")
  ) || quotes.find((item) => String(item.symbol || "").toUpperCase() === "ALTIN");
  return match?.pairId ? String(match.pairId) : "";
}

function parseInvestingDate(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
  if (!match) return "";
  const months = {
    "Oca": "01", "Ocak": "01", "Jan": "01",
    "Sub": "02", "Subat": "02", "Feb": "02",
    "Mar": "03", "Mart": "03",
    "Nis": "04", "Nisan": "04", "Apr": "04",
    "May": "05", "Mayis": "05",
    "Haz": "06", "Haziran": "06", "Jun": "06",
    "Tem": "07", "Temmuz": "07", "Jul": "07",
    "Agu": "08", "Agustos": "08", "Aug": "08",
    "Eyl": "09", "Eylul": "09", "Sep": "09",
    "Eki": "10", "Ekim": "10", "Oct": "10",
    "Kas": "11", "Kasim": "11", "Nov": "11",
    "Ara": "12", "Aralik": "12", "Dec": "12",
  };
  const [, day, monthName, year] = match;
  const month = months[monthName] || months[monthName.slice(0, 3)];
  return month ? `${year}-${month}-${day.padStart(2, "0")}` : "";
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}
