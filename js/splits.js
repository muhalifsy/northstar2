import { SPLIT_SCAN_KEY, TODAY_ISO, elements, state } from "./state.js";
import { escapeHtml, normalizeMarketSymbol, nullableClientNumber, parseDate, normalizeInputDate, formatDate } from "./util.js";
import { apiFetch } from "./api.js";
import { rebuildPortfolio, abdGroupKey, firstRelevantAbdSplitEvent } from "./abd.js";
import { normalizeTrRow, normalizeTrSymbol, renderTrPortfolio, toYahooTrSymbol, firstRelevantTrSplitEvent } from "./tr.js";
import { cashFlowDiffDays, cashFlowDecimal2 } from "./cashflow.js";

export function renderSplitsPage() {
  if (!elements.splitsBody) return;
  const rows = [];
  const addRow = (row) => {
    if (!row.symbol || !row.date) return;
    const key = `${row.market}::${normalizeMarketSymbol(row.symbol)}::${row.date}`;
    const existingIndex = rows.findIndex((item) => item.key === key);
    const normalized = { ...row, key, factor: Number(row.factor) };
    if (existingIndex < 0) {
      rows.push(normalized);
      return;
    }
    if (row.source === "D1") rows[existingIndex] = normalized;
  };
  for (const [symbol, events] of state.splitsBySymbol.entries()) {
    for (const event of events || []) {
      addRow({ market: "ABD", symbol, date: event.date, factor: event.factor, type: event.actionType || "split", source: event.source || "D1", label: event.label || "" });
    }
  }
  for (const [symbol, events] of state.trSplitsBySymbol.entries()) {
    for (const event of events || []) {
      addRow({ market: "TR", symbol, date: event.date, factor: event.factor, type: event.actionType || "split", source: event.source || "D1", label: event.label || "" });
    }
  }

  const sorted = rows
    .filter((row) => row.symbol && row.date)
    .sort((left, right) => left.market.localeCompare(right.market) || left.symbol.localeCompare(right.symbol) || parseDate(right.date) - parseDate(left.date));

  elements.splitsSummary.textContent = `${sorted.length} records`;
  elements.splitsBody.innerHTML = sorted.length
    ? sorted.map((row) => `
      <tr>
        <td>${escapeHtml(row.market)}</td>
        <td>${escapeHtml(row.symbol)}</td>
        <td>${formatDate(row.date)}</td>
        <td>${cashFlowDecimal2(row.factor)}</td>
        <td>${escapeHtml(corporateActionLabel(row))}</td>
        <td>${escapeHtml(row.source)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="6" class="muted">No corporate action records loaded.</td></tr>`;
}


function corporateActionLabel(row) {
  if (row.label) return row.label;
  if (row.type === "rights") return "Rights issue";
  if (row.type === "rights-bonus") return "Rights + bonus issue";
  if (row.type === "bonus") return "Bonus issue";
  return "Stock split";
}


export async function loadSavedSplits({ refresh = false } = {}) {
  const abdSymbols = [...new Set(state.transactions.map((row) => normalizeMarketSymbol(row.symbol)).filter(Boolean))];
  const trSymbolPairs = new Map();
  for (const row of state.trRows) {
    const marketSymbol = toYahooTrSymbol(row.symbol);
    if (marketSymbol) trSymbolPairs.set(marketSymbol, row.symbol);
  }
  const allSymbols = [...new Set([...abdSymbols, ...trSymbolPairs.keys()])];
  if (!allSymbols.length) return;

  const payload = await apiFetch(`/api/splits?cacheOnly=1&symbols=${encodeURIComponent(allSymbols.join(","))}`);
  const splits = payload?.splits || {};

  state.splitsBySymbol = new Map();
  state.trSplitsBySymbol = new Map();

  for (const [symbol, events] of Object.entries(splits)) {
    const key = normalizeMarketSymbol(symbol);
    if (!Array.isArray(events)) continue;
    if (abdSymbols.includes(key)) state.splitsBySymbol.set(key, events);
    const trSymbol = trSymbolPairs.get(key);
    if (trSymbol) state.trSplitsBySymbol.set(normalizeTrSymbol(trSymbol), events);
  }
  applyDetectedSplitFields();
  if (refresh) localStorage.setItem(SPLIT_SCAN_KEY, TODAY_ISO);
  rebuildPortfolio();
  renderTrPortfolio();
}


export function shouldRefreshSplitScan() {
  const last = localStorage.getItem(SPLIT_SCAN_KEY) || "";
  if (!last) return true;
  return cashFlowDiffDays(last, TODAY_ISO) >= 30;
}


function applyDetectedSplitFields() {
  state.transactions = state.transactions.map((row) => {
    if (Number(row.pcs) <= 0) return row;
    const relatedRows = state.transactions.filter((item) => abdGroupKey(item) === abdGroupKey(row));
    const event = firstRelevantAbdSplitEvent(normalizeMarketSymbol(row.symbol), relatedRows, row.date);
    if (!event) return row;
    return {
      ...row,
      splitDate: row.splitDate || event.date,
      splitFactor: nullableClientNumber(row.splitFactor) ?? event.factor,
    };
  });

  state.trRows = state.trRows.map((row) => {
    const symbol = normalizeTrSymbol(row.symbol);
    const relatedRows = state.trRows.map(normalizeTrRow).filter((item) => normalizeTrSymbol(item.symbol) === symbol);
    const event = firstRelevantTrSplitEvent(symbol, relatedRows, row.buyDate);
    if (!event) return row;
    return {
      ...row,
      splitDate: row.splitDate || event.date,
      splitFactor: nullableClientNumber(row.splitFactor) ?? event.factor,
    };
  });
}


function firstSplitAfterDate(symbol, date, dynamicMap, staticMap) {
  const key = normalizeMarketSymbol(symbol);
  const cleanKey = normalizeTrSymbol(key);
  const events = [
    ...(dynamicMap.get(key) ?? []),
    ...(dynamicMap.get(cleanKey) ?? []),
  ]
    .filter((event) => event?.date && Number.isFinite(Number(event.factor)) && parseDate(event.date) > parseDate(date))
    .sort((left, right) => parseDate(left.date) - parseDate(right.date));
  return events[0] ? { date: events[0].date, factor: Number(events[0].factor) } : null;
}


export function splitFieldsChanged(row, next, keys = {}) {
  const quantityKey = keys.quantityKey || "splitQuantity";
  const totalKey = keys.totalKey || "splitBuyTotal";
  const currentDate = normalizeInputDate(row.splitDate || "") || row.splitDate || "";
  const nextDate = normalizeInputDate(next.splitDate || "") || next.splitDate || "";
  const currentQuantity = nullableClientNumber(row[quantityKey]);
  const nextQuantity = nullableClientNumber(next.splitQuantity);
  const currentTotal = nullableClientNumber(row[totalKey]);
  const nextTotal = nullableClientNumber(next.splitBuyTotal);
  return currentDate !== nextDate || currentQuantity !== nextQuantity || currentTotal !== nextTotal;
}


export function formSplitFieldsTouched(form) {
  return form.dataset.splitTouched === "1";
}


export function bindSplitFieldTracking(form) {
  form.querySelectorAll("[data-split-field]").forEach((field) => {
    field.addEventListener("input", () => {
      form.dataset.splitTouched = "1";
    });
    field.addEventListener("change", () => {
      form.dataset.splitTouched = "1";
    });
  });
}

