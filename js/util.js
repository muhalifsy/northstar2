import { TODAY_ISO } from "./state.js";
import { cashFlowDiffDays } from "./cashflow.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


export function escapeAttr(value) {
  return escapeHtml(value);
}


// Same query as mobile.css: portrait phones, or phones held sideways.
const PHONE_LAYOUT_QUERY = "(max-width: 720px), (pointer: coarse) and (max-height: 500px)";

export function isPhoneLayout() {
  return Boolean(window.matchMedia?.(PHONE_LAYOUT_QUERY).matches);
}


export function addIsoDays(date, days) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}


export function nextWeekdayDate(date) {
  const value = new Date(`${date}T12:00:00`);
  const day = value.getDay();
  if (day === 6) return addIsoDays(date, 2);
  if (day === 0) return addIsoDays(date, 1);
  return date;
}


export function normalizeMarketSymbol(symbol) {
  const clean = String(symbol || "").trim().toUpperCase().replace(/İ/g, "I").replace(/Ä°/g, "I");
  if (clean === "ALTIN" || clean === "ALTIN.S1" || clean === "ALTINS1.IS") return "ALTINS1";
  return clean;
}


export function nullableClientNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(String(value).replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}


export function maxDate(left, right) {
  return left > right ? left : right;
}


export function minDate(left, right) {
  return left < right ? left : right;
}


export function diffDays(start, end) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((end - start) / msPerDay));
}


// Any stored date form (ISO or dd.mm.yyyy) to YYYY-MM-DD.
export function isoDay(value) {
  return normalizeInputDate(value) || toIsoDate(value);
}


export function toIsoDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}


export function chunkSymbols(symbols, size) {
  return chunk(symbols, size);
}


export function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}


export function toMonthKey(timestamp) {
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}


export function toDayKey(timestamp) {
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}


export function parseDate(value) {
  if (!value) return 0;
  const normalized = normalizeInputDate(value) || value;
  return new Date(normalized).getTime() || 0;
}


// Typed dates: day, month, year separated by ".", "/" or "," (the separator
// key on Turkish phone keypads), mixed freely, no leading zeros needed:
// 15/01.2026, 15.1/26. A two-digit year is 20yy, so 99 is 2099 and earlier
// years need all four digits. Dates that do not exist (31.02) give "".
export function normalizeInputDate(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = String(value).trim().match(/^(\d{1,2})[./,](\d{1,2})[./,](\d{2}|\d{4})$/);
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}


export function formatDate(value) {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}


export function formatShortDate(value) {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}


export function formatCurrency(value) {
  return `${formatNumber(value, 2)} $`;
}


// HTML number: groups thousands and wraps the fractional part (comma +
// decimals) in a <span class="frac"> so it can be rendered smaller (system
// rule: digits right of the comma are 75% the size of those on the left).
// HTML-only — never use in SVG text or element attributes.
export function formatAmountHtml(value, decimals = 2) {
  if (!Number.isFinite(Number(value))) return "-";
  const number = Number(value);
  const sign = number < 0 || Object.is(number, -0) ? "-" : "";
  const fixed = Math.abs(number).toFixed(decimals);
  const [integerPart, decimalPart] = fixed.split(".");
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (decimals > 0 && decimalPart != null) {
    return `${sign}${grouped}<span class="frac">,${decimalPart}</span>`;
  }
  return `${sign}${grouped}`;
}


// Plain 2-decimal number with no currency suffix (the symbol now lives in the
// column header), with the small-fraction treatment. Dash for null values.
export function plainAmount(value) {
  return value == null || !Number.isFinite(Number(value)) ? "-" : formatAmountHtml(Number(value), 2);
}


// Two-line numeric cell. Top line is the primary figure (cost / smart P/L),
// bottom line a secondary figure (current price / naive P/L). The bottom is
// muted grey unless a colour class is passed (used for the naive P/L sign).
export function stackedCell(topHtml, bottomHtml, { topClass = "", bottomClass = "", mutedBottom = true } = {}) {
  const bottomClasses = `stacked-bottom ${mutedBottom ? "stacked-muted" : ""} ${bottomClass}`.trim();
  return `<div class="number-cell stacked-cell">
      <span class="stacked-top ${topClass}">${topHtml}</span>
      <span class="${bottomClasses}">${bottomHtml}</span>
    </div>`;
}


// Date cell for closed lots: open date on top, closing date below (muted),
// same two-line treatment as stackedCell so it fits the row without growing it.
export function renderDateWithExitCell(openDate, exitDate) {
  const openHtml = formatDate(openDate);
  if (!exitDate) return openHtml;
  return `<span class="stacked-cell stacked-cell-center">
      <span class="stacked-top">${openHtml}</span>
      <span class="stacked-bottom stacked-muted">${formatDate(exitDate)}</span>
    </span>`;
}


// Days held: open date to today for open lots, open date to close date for closed lots.
export function renderDurationCell(openDate, closeDate) {
  if (!openDate) return "-";
  const endDate = closeDate || TODAY_ISO;
  const days = cashFlowDiffDays(openDate, endDate);
  return Number.isFinite(days) ? String(days) : "-";
}


export function formatNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) return "";
  const sign = value < 0 || Object.is(value, -0) ? "-" : "";
  const absolute = Math.abs(value);
  const fixed = absolute.toFixed(decimals);
  const [integerPart, decimalPart] = fixed.split(".");
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimals > 0 ? `${sign}${grouped},${decimalPart}` : `${sign}${grouped}`;
}


export function formatSmartNumber(value) {
  if (!Number.isFinite(Number(value))) return "";
  const rounded = round4(Number(value));
  if (rounded === 0) return "0";
  const decimals = Number.isInteger(rounded) ? 0 : 4;
  const text = formatNumber(rounded, decimals);
  if (decimals === 0) return text;
  return text.replace(/,(\d*?[1-9])0+$/, ",$1").replace(/,0+$/, "");
}


export function round2(value) {
  return Math.round(value * 100) / 100;
}


export function round4(value) {
  return Math.round(value * 10000) / 10000;
}


export function round8(value) {
  return Math.round(value * 100000000) / 100000000;
}


export function formatEditNumber(value) {
  return Number.isFinite(value) ? String(round4(value)) : "";
}
