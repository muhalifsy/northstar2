import { API_BASE, TODAY_ISO, TR_YAHOO_SYMBOL_OVERRIDES, elements, state } from "./state.js";
import { escapeHtml, escapeAttr, nullableClientNumber, isoDay, chunkSymbols, parseDate, normalizeInputDate, formatDate, renderDurationCell, formatNumber, formatSmartNumber, round2, round4, formatEditNumber } from "./util.js";
import { apiFailureMessage, persistTrPortfolio } from "./api.js";
import { taxRateDecimal, updateMarketStatus } from "./settings.js";
import { depositShadowBalance, positionExitQuantity, profitAmountText, profitPercentHtml, buildTrPositionLots, renderPositionRow, renderPositionSummary, profitClassName } from "./positions.js";
import { splitFieldsChanged, formSplitFieldsTouched, bindSplitFieldTracking } from "./splits.js";
import { renderCashFlow, updateStatusTab } from "./cashflow.js";
import { marketFetchIsFresh, markMarketFetch, setMarketDataMessages, trQuantityForDate } from "./performance.js";
import { buildPortfolioCandles, renderCandlesSvg, renderLineSvg } from "./charts.js";

export function normalizeTrRow(row) {
  const buyTotal = nullableClientNumber(row.buyTotal);
  const sellTotal = nullableClientNumber(row.sellTotal);
  const quantity = nullableClientNumber(row.quantity) ?? 1;
  const sellQuantity = nullableClientNumber(row.sellQuantity);
  const splitFactorApplied = nullableClientNumber(row.splitFactorApplied) ?? 1;
  const splitQuantity = nullableClientNumber(row.splitQuantity);
  const splitBuyTotal = nullableClientNumber(row.splitBuyTotal);
  const splitFactor = nullableClientNumber(row.splitFactor);
  const dividendQuantity = nullableClientNumber(row.dividendQuantity);
  return {
    id: row.id || `tr-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    symbol: normalizeTrSymbol(row.symbol),
    buyDate: normalizeInputDate(row.buyDate || "") || row.buyDate || "",
    sellDate: normalizeInputDate(row.sellDate || "") || row.sellDate || "",
    quantity,
    sellQuantity,
    splitFactorApplied,
    splitDate: normalizeInputDate(row.splitDate || "") || row.splitDate || "",
    splitFactor,
    splitQuantity,
    splitBuyTotal,
    splitApproved: row.splitApproved === true || row.splitApproved === "true" || row.splitApproved === 1 || row.splitApproved === "1" || (row.splitApproved == null && splitQuantity > 0),
    dividendQuantity,
    buyTotal,
    sellTotal,
    groupId: row.groupId || "",
    note: row.note || "",
  };
}


function applyTrDetectedSplitFieldsToRow(row) {
  const normalized = normalizeTrRow(row);
  const event = detectedTrSplitEventForRow(normalized);
  if (!event) return normalized;
  const currentSplitIsUsable =
    normalized.splitDate &&
    parseDate(normalized.splitDate) > parseDate(normalized.buyDate) &&
    (!normalized.sellDate || parseDate(normalized.sellDate) >= parseDate(normalized.splitDate));
  return {
    ...normalized,
    splitDate: currentSplitIsUsable ? normalized.splitDate : event.date,
    splitFactor: currentSplitIsUsable && nullableClientNumber(normalized.splitFactor) != null ? normalized.splitFactor : event.factor,
  };
}


function detectedTrSplitEventForRow(row) {
  if (!row?.buyDate) return null;
  const symbol = normalizeTrSymbol(row.symbol);
  const events = [
    ...(state.trSplitsBySymbol.get(symbol) ?? []),
    ...(state.trSplitsBySymbol.get(toYahooTrSymbol(symbol)) ?? []),
  ]
    .filter((event) => event?.date && Number.isFinite(Number(event.factor)))
    .sort((left, right) => parseDate(left.date) - parseDate(right.date));

  for (const event of events) {
    if (parseDate(event.date) <= parseDate(row.buyDate)) continue;
    if (row.sellDate && parseDate(row.sellDate) < parseDate(event.date)) continue;
    return { date: event.date, factor: Number(event.factor) };
  }
  return null;
}


export function handleTrDraftChange() {}


export function autoSaveTrRow() {
  const symbol = normalizeTrSymbol(elements.trSymbolInput.value);
  const date = normalizeInputDate(elements.trBuyDateInput.value) || elements.trBuyDateInput.value || "";
  const quantity = nullableClientNumber(elements.trQuantityInput.value);
  const total = nullableClientNumber(elements.trBuyTotalInput.value);
  if (!symbol && !date && quantity == null && total == null) return;
  if (!symbol || !date || quantity == null || quantity === 0 || total == null) return;

  if (quantity < 0) {
    const applied = applyTrSaleEntry(symbol, date, Math.abs(quantity), Math.abs(total));
    if (!applied) return;
    clearTrDraftForm();
    persistTrPortfolio();
    renderTrPortfolio();
    renderCashFlow();
    return;
  }

  const splitEvent = firstRelevantTrSplitEvent(symbol, [], date);
  const row = normalizeTrRow({
    symbol,
    buyDate: date,
    quantity,
    splitFactorApplied: 1,
    splitDate: splitEvent?.date || "",
    splitFactor: splitEvent?.factor || null,
    buyTotal: total,
  });
  state.trRows = [...splitTrPartialSale(row), ...state.trRows];
  clearTrDraftForm();
  persistTrPortfolio();
  renderTrPortfolio();
  renderCashFlow();
}


function applyTrSaleEntry(symbol, sellDate, sellQuantity, sellTotal) {
  let remainingQuantity = sellQuantity;
  let remainingTotal = sellTotal;
  const openRows = state.trRows
    .filter((row) => trIsOpen(row) && normalizeTrSymbol(row.symbol) === symbol)
    .sort((left, right) => parseDate(left.buyDate) - parseDate(right.buyDate));

  const availableTotal = openRows.reduce((total, row) => total + trSellableQuantity(row, sellDate), 0);
  if (availableTotal + 0.0001 < sellQuantity) {
    window.alert?.(`Not enough open ${symbol} quantity for this sale.`);
    return false;
  }

  const replacements = new Map();
  for (const row of openRows) {
    if (remainingQuantity <= 0) break;
    const availableQuantity = trSellableQuantity(row, sellDate);
    if (availableQuantity <= 0) continue;
    const consumedQuantity = Math.min(availableQuantity, remainingQuantity);
    const consumedTotal = sellQuantity > 0 ? round2(sellTotal * (consumedQuantity / sellQuantity)) : remainingTotal;
    const saleRow = {
      ...row,
      sellDate,
      sellQuantity: consumedQuantity,
      sellTotal: consumedTotal,
    };
    const saleRowQuantity = trEffectiveQuantity(saleRow);
    if (!Number.isFinite(saleRowQuantity) || consumedQuantity > saleRowQuantity + 0.0001) {
      window.alert?.("Sell qty cannot be greater than Qty. For imported Excel rows, enter the total Qty first.");
      return false;
    }
    replacements.set(row.id, splitTrPartialSale(saleRow));
    remainingQuantity = round4(remainingQuantity - consumedQuantity);
    remainingTotal = round2(remainingTotal - consumedTotal);
  }

  state.trRows = state.trRows.flatMap((row) => replacements.get(row.id) || [row]);
  return true;
}


function trSellableQuantity(row, sellDate = TODAY_ISO) {
  const normalized = normalizeTrRow(row);
  const quantityAtSaleDate = trQuantityForDate(normalized, sellDate || TODAY_ISO);
  if (Number.isFinite(quantityAtSaleDate) && quantityAtSaleDate > 0) return round4(quantityAtSaleDate);
  const displayQuantity = trDisplayQuantity(normalized);
  return Number.isFinite(displayQuantity) && displayQuantity > 0 ? round4(displayQuantity) : 0;
}


function clearTrDraftForm() {
  elements.trEntryForm.reset();
}


export function normalizeTrSymbol(symbol) {
  const clean = String(symbol || "").trim().toUpperCase().replace(/İ/g, "I");
  if (clean === "ALTIN.S1") return "ALTINS1";
  return clean.replace(/\.IS$/, "");
}


export function renderTrPortfolio() {
  if (!elements.trTable) return;
  state.trRows = state.trRows.map(applyTrDetectedSplitFieldsToRow);
  const lots = buildTrPositionLots(state.trRows);
  state.trOpenLots = lots.openLots;
  state.trClosedLots = lots.closedLots;
  renderTrSummary();
  if (!lots.openLots.length && !lots.closedLots.length) {
    elements.trTable.innerHTML = `<div class="empty-card">No TR rows yet.</div>`;
    return;
  }
  const rowsById = new Map(state.trRows.map((row) => [row.id, row]));
  const renderLot = (lot) => state.trEditingId && lot.rowIds.includes(state.trEditingId) && rowsById.has(state.trEditingId)
    ? renderTrEditRow(rowsById.get(state.trEditingId), lot)
    : renderPositionRow(lot, "tr");
  const openHtml = lots.openLots.map(renderLot).join("") || `<div class="empty-card">No open TR lots.</div>`;
  const closedHtml = lots.closedLots.map(renderLot).join("") || `<div class="empty-card">No closed TR lots.</div>`;
  elements.trTable.innerHTML = `
    <section class="tr-lot-panel">
      ${openHtml}
    </section>
    <section class="tr-lot-panel tr-lot-panel-closed">
      ${closedHtml}
    </section>
  `;
  elements.trTable.querySelectorAll("[data-tr-edit]").forEach((row) => row.addEventListener("click", () => {
    state.trEditingId = row.dataset.trEdit;
    renderTrPortfolio();
  }));
  elements.trTable.querySelectorAll(".tr-edit-form").forEach((form) => {
    bindSplitFieldTracking(form);
  });
  // Jump the editor to another row of the same holding period (saving first).
  elements.trTable.querySelectorAll("[data-tr-edit-row]").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget.dataset.trEditRow;
    const form = event.currentTarget.closest(".tr-edit-form");
    if (form) saveTrEditForm(form);
    state.trEditingId = target;
    renderTrPortfolio();
  }));
  elements.trTable.querySelectorAll("[data-tr-approve-split]").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const form = event.currentTarget.closest(".tr-edit-form");
    if (!form) return;
    form.dataset.splitApproved = "1";
    saveTrEditForm(form);
  }));
  elements.trTable.querySelectorAll("[data-tr-delete]").forEach((button) => button.addEventListener("click", deleteTrRow));
}


function renderTrEditRow(row, lot = null) {
  row = state.trRows.find((item) => item.id === row.sourceId) || row;
  const splitEvent = detectedTrSplitEventForRow(row) || relevantTrSplitEvent(row);
  const needsSplitInput = Boolean(splitEvent);
  const splitDateValue = row.splitDate || splitEvent?.date || "";
  const suggestedSplitQuantity = trSuggestedSplitQuantity(row, splitEvent);
  const splitQuantityValue = row.splitQuantity == null || Number(row.splitQuantity) <= 0 ? suggestedSplitQuantity : row.splitQuantity;
  const pendingClass = trNeedsSplitInput(row) ? "row-split-pending" : "";
  return `
    <article class="position-row tr-row ${pendingClass} editing-row">
      <form class="tr-grid tr-edit-form" data-tr-form="${row.id}">
        <label class="edit-field" data-label="Stock"><input name="symbol" value="${escapeAttr(row.symbol)}" /></label>
        <label class="edit-field" data-label="Date"><input name="buyDate" type="text" inputmode="numeric" value="${formatDate(row.buyDate)}" /></label>
        <div class="cell-center" data-label="Days">${renderDurationCell(row.buyDate, trIsOpen(row) ? "" : row.sellDate)}</div>
        <label class="edit-field" data-label="Qty"><input name="quantity" type="number" step="0.0001" placeholder="Qty" value="${row.quantity == null ? "" : row.quantity}" /></label>
        <label class="edit-field" data-label="Entry total"><input name="buyTotal" type="number" step="0.01" placeholder="Entry total" value="${row.buyTotal == null ? "" : row.buyTotal}" /></label>
        <div class="number-cell" data-label="Current/Exit">${trCurrentOrExitPrice(row) == null ? "No price" : trMoney(trCurrentOrExitPrice(row))}</div>
        <div class="number-cell" data-label="P/L">${trProfit(row) == null ? "-" : `${profitAmountText(trProfit(row))} TL`}</div>
        <div></div>
        <button class="danger delete-button" data-tr-delete="${row.id}" type="button">Delete</button>
        ${needsSplitInput ? `
          <div class="split-edit-fields">
            <span>Post-action</span>
            <input name="splitDate" data-split-field type="text" inputmode="numeric" placeholder="Split date" value="${splitDateValue ? formatDate(splitDateValue) : ""}" />
            <input name="splitQuantity" data-split-field type="number" step="0.0001" placeholder="New qty" value="${splitQuantityValue == null ? "" : formatEditNumber(splitQuantityValue)}" />
            <input name="splitBuyTotal" data-split-field type="number" step="0.01" placeholder="Extra cost" value="${row.splitBuyTotal == null ? "" : row.splitBuyTotal}" />
            <button class="secondary split-approve-button" data-tr-approve-split type="button">Approve</button>
          </div>
        ` : ""}
        <div class="split-edit-fields">
          <span>Dividend</span>
          <input name="dividendQuantity" type="number" step="0.0001" placeholder="Qty with dividends" value="${row.dividendQuantity == null ? "" : row.dividendQuantity}" />
        </div>
        <div class="split-edit-fields">
          <span>Sale</span>
          <input name="sellDate" type="text" inputmode="numeric" placeholder="Sell date" value="${row.sellDate ? formatDate(row.sellDate) : ""}" />
          <input name="sellQuantity" type="number" step="0.0001" placeholder="Sell qty" value="${row.sellQuantity == null ? "" : row.sellQuantity}" />
          <input name="sellTotal" type="number" step="0.01" placeholder="Exit total" value="${row.sellTotal == null ? "" : row.sellTotal}" />
        </div>
        ${renderTrPositionRowsList(lot, row.id)}
      </form>
    </article>
  `;
}


export function saveTrEditForm(form) {
  const id = form.dataset.trForm;
  const nextRows = [];
  for (const row of state.trRows) {
    if (row.id !== id) {
      nextRows.push(row);
      continue;
    }
    const rawQuantity = nullableClientNumber(form.elements.quantity.value);
    const rawSellQuantity = nullableClientNumber(form.elements.sellQuantity.value);
    const inferredPartialSellQuantity =
      rawSellQuantity == null &&
      form.elements.sellDate.value &&
      form.elements.sellTotal.value &&
      rawQuantity != null &&
      Number(row.quantity) > rawQuantity
        ? rawQuantity
        : rawSellQuantity;
    const splitChanged = formSplitFieldsTouched(form) && splitFieldsChanged(row, {
      splitDate: form.elements.splitDate?.value ?? row.splitDate,
      splitQuantity: form.elements.splitQuantity?.value ?? row.splitQuantity,
      splitBuyTotal: form.elements.splitBuyTotal?.value ?? row.splitBuyTotal,
    });
    let dividendQuantity = form.elements.dividendQuantity?.value ?? row.dividendQuantity;
    if (splitChanged && (nullableClientNumber(dividendQuantity) || 0) > 0) {
      const ok = window.confirm?.("Qty with dividends will be cleared because split information is being updated. Continue?");
      if (!ok) return;
      dividendQuantity = null;
    }
    const normalized = normalizeTrRow({
      ...row,
      symbol: form.elements.symbol.value,
      buyDate: form.elements.buyDate.value,
      sellDate: form.elements.sellDate.value,
      quantity: inferredPartialSellQuantity !== rawSellQuantity ? row.quantity : form.elements.quantity.value,
      sellQuantity: inferredPartialSellQuantity,
      splitFactorApplied: row.splitFactorApplied,
      splitDate: form.elements.splitDate?.value ?? row.splitDate,
      splitFactor: row.splitFactor,
      splitQuantity: form.elements.splitQuantity?.value ?? row.splitQuantity,
      splitBuyTotal: form.elements.splitBuyTotal?.value ?? row.splitBuyTotal,
      splitApproved: (form.dataset.splitApproved === "1" || (formSplitFieldsTouched(form) && nullableClientNumber(form.elements.splitQuantity?.value) > 0)) ? true : row.splitApproved,
      dividendQuantity,
      buyTotal: form.elements.buyTotal.value,
      sellTotal: form.elements.sellTotal.value,
    });
    nextRows.push(...splitTrPartialSale(normalized));
  }
  state.trRows = nextRows;
  state.trEditingId = null;
  persistTrPortfolio();
  renderTrPortfolio();
  renderCashFlow();
}


function deleteTrRow(event) {
  event.preventDefault();
  event.stopPropagation();
  const id = event.currentTarget.dataset.trDelete;
  const row = state.trRows.find((item) => item.id === id);
  if (!row) return;
  if (!window.confirm?.(`Delete ${row.symbol} row?`)) return;
  state.trRows = state.trRows.filter((item) => item.id !== id);
  state.trEditingId = null;
  persistTrPortfolio();
  renderTrPortfolio();
  renderCashFlow();
}


function splitTrPartialSale(row) {
  const quantity = trEffectiveQuantity(row);
  const sellQuantity = Number(row.sellQuantity);
  if (
    row.sellDate &&
    row.sellTotal != null &&
    Number.isFinite(sellQuantity) &&
    sellQuantity > 0 &&
    (!Number.isFinite(quantity) || sellQuantity > quantity)
  ) {
    window.alert?.("Sell qty cannot be greater than Qty. For imported Excel rows, enter the total Qty first.");
    return [row];
  }
  if (
    !row.sellDate ||
    row.sellTotal == null ||
    !Number.isFinite(quantity) ||
    !Number.isFinite(sellQuantity) ||
    sellQuantity <= 0 ||
    sellQuantity >= quantity ||
    row.buyTotal == null
  ) {
    return [row];
  }

  const totalCost = trEffectiveBuyTotal(row);
  const entryUnit = totalCost / quantity;
  const remainingQuantity = round4(quantity - sellQuantity);
  const closedBuyTotal = round2(entryUnit * sellQuantity);
  const remainingBuyTotal = round2(totalCost - closedBuyTotal);
  const baseId = String(row.id || `tr-${Date.now()}`);
  const originalEntryUnit = Number(row.buyTotal) / quantity;
  const extraCost = nullableClientNumber(row.splitBuyTotal) ?? 0;
  const extraEntryUnit = extraCost / quantity;
  const remainingOriginalBuyTotal = Number.isFinite(originalEntryUnit) ? round2(originalEntryUnit * remainingQuantity) : row.buyTotal;
  const closedOriginalBuyTotal = Number.isFinite(originalEntryUnit) ? round2(originalEntryUnit * sellQuantity) : row.buyTotal;
  const remainingExtraCost = Number.isFinite(extraEntryUnit) ? round2(extraEntryUnit * remainingQuantity) : null;
  const closedExtraCost = Number.isFinite(extraEntryUnit) ? round2(extraEntryUnit * sellQuantity) : null;

  return [
    {
      ...row,
      id: `${baseId}-rem-${Date.now()}`,
      sellDate: "",
      sellQuantity: null,
      sellTotal: null,
      quantity: remainingQuantity,
      buyTotal: remainingOriginalBuyTotal,
      splitQuantity: row.splitQuantity == null ? null : remainingQuantity,
      splitBuyTotal: row.splitBuyTotal == null ? null : remainingExtraCost,
      splitApproved: row.splitApproved,
      splitFactorApplied: row.splitFactorApplied,
    },
    {
      ...row,
      id: `${baseId}-sold-${Date.now()}`,
      quantity: sellQuantity,
      sellQuantity,
      buyTotal: closedOriginalBuyTotal,
      splitQuantity: row.splitQuantity == null ? null : sellQuantity,
      splitBuyTotal: row.splitBuyTotal == null ? null : closedExtraCost,
      splitApproved: row.splitApproved,
      splitFactorApplied: row.splitFactorApplied,
    },
  ];
}


export async function refreshTrMarketData(options = {}) {
  const messages = [];
  await Promise.all([refreshTrPrices(messages, options), refreshTrCandles(messages, options)]);
  setMarketDataMessages("tr", messages);
  updateStatusTab();
}


function buildTrYahooSymbolMap() {
  const symbolMap = new Map();
  for (const row of state.trRows) {
    if (!trIsOpen(normalizeTrRow(row))) continue;
    const yahooSymbol = toYahooTrSymbol(row.symbol);
    if (yahooSymbol) symbolMap.set(yahooSymbol, row.symbol);
  }
  return symbolMap;
}


async function refreshTrPrices(messages = [], options = {}) {
  const fresh = options.fresh === true;
  const cacheParam = fresh ? "fresh=1" : "cacheOnly=1";
  const symbolMap = buildTrYahooSymbolMap();
  const yahooSymbols = [...symbolMap.keys()];
  if (!yahooSymbols.length) return;

  const mergedPrices = new Map(state.trPricesBySymbol);
  const payloads = [];
  const aggregateStatus = { fetchedAt: "", latestDate: "" };
  for (const batch of chunkSymbols(yahooSymbols, 6)) {
    try {
      const response = await fetch(`${API_BASE}/api/quotes?${cacheParam}&symbols=${encodeURIComponent(batch.join(","))}`);
      if (!response.ok) {
        messages.push(await apiFailureMessage(response, `TR quote request failed for ${batch.join(", ")}.`));
        payloads.push(null);
        continue;
      }
      payloads.push(await response.json());
    } catch (error) {
      messages.push(`TR quote request failed for ${batch.join(", ")}. ${error?.message || ""}`.trim());
      payloads.push(null);
    }
  }

  for (const payload of payloads) {
    if (!payload) continue;
    messages.push(...(payload.errors || []));
    if (payload.fetchedAt && payload.fetchedAt > aggregateStatus.fetchedAt) aggregateStatus.fetchedAt = payload.fetchedAt;
    if (payload.latestDate && payload.latestDate > aggregateStatus.latestDate) aggregateStatus.latestDate = payload.latestDate;
    for (const [yahooSymbol, price] of Object.entries(payload.prices ?? {})) {
      const original = symbolMap.get(String(yahooSymbol || "").trim().toUpperCase());
      if (original && Number.isFinite(price)) mergedPrices.set(original, price);
    }
  }

  if (fresh) updateMarketStatus("tr", aggregateStatus);
  state.trPricesBySymbol = mergedPrices;
  renderTrPortfolio();
  renderCashFlow();
}


async function refreshTrCandles(messages = [], options = {}) {
  const fresh = options.fresh === true;
  const cacheParam = fresh ? "fresh=1" : "cacheOnly=1";
  const symbolMap = buildTrYahooSymbolMap();
  const yahooSymbols = [...symbolMap.keys()];
  if (!yahooSymbols.length) return;
  const cacheKey = `candles:tr:${[...yahooSymbols].sort().join(",")}`;
  if (!fresh && marketFetchIsFresh(cacheKey)) return;

  const mergedCandles = new Map(state.trCandlesBySymbol);
  const payloads = [];
  const aggregateStatus = { fetchedAt: "", latestDate: "" };
  for (const batch of chunkSymbols(yahooSymbols, 3)) {
    try {
      const response = await fetch(`${API_BASE}/api/candles?${cacheParam}&symbols=${encodeURIComponent(batch.join(","))}`);
      if (!response.ok) {
        messages.push(await apiFailureMessage(response, `TR chart request failed for ${batch.join(", ")}.`));
        payloads.push(null);
        continue;
      }
      payloads.push(await response.json());
    } catch (error) {
      messages.push(`TR chart request failed for ${batch.join(", ")}. ${error?.message || ""}`.trim());
      payloads.push(null);
    }
  }

  for (const payload of payloads) {
    if (!payload) continue;
    messages.push(...(payload.errors || []));
    if (payload.fetchedAt && payload.fetchedAt > aggregateStatus.fetchedAt) aggregateStatus.fetchedAt = payload.fetchedAt;
    if (payload.latestDate && payload.latestDate > aggregateStatus.latestDate) aggregateStatus.latestDate = payload.latestDate;
    for (const [yahooSymbol, candles] of Object.entries(payload.candles ?? {})) {
      const original = symbolMap.get(String(yahooSymbol || "").trim().toUpperCase());
      if (original) mergedCandles.set(original, candles);
    }
  }

  markMarketFetch(cacheKey);
  if (fresh) updateMarketStatus("tr", aggregateStatus);
  state.trCandlesBySymbol = mergedCandles;
  renderTrPortfolio();
  renderCashFlow();
}


export function toYahooTrSymbol(symbol) {
  const clean = normalizeTrSymbol(symbol);
  if (TR_YAHOO_SYMBOL_OVERRIDES[clean]) return TR_YAHOO_SYMBOL_OVERRIDES[clean];
  if (!clean || clean.includes(".F") || clean.includes(".G") || clean.includes(".S1")) return "";
  return clean.endsWith(".IS") ? clean : `${clean}.IS`;
}


function trSortKey(row) {
  return `${trIsOpen(row) ? "0" : "1"}-${row.buyDate || "0000-00-00"}-${row.id}`;
}


function compareTrRows(left, right) {
  if (trIsOpen(left) !== trIsOpen(right)) return trIsOpen(left) ? -1 : 1;
  const dateCompare = (right.buyDate || "").localeCompare(left.buyDate || "");
  if (dateCompare) return dateCompare;
  return String(right.id || "").localeCompare(String(left.id || ""));
}


export function trIsOpen(row) {
  if (row?.computedQuantity != null) return row.computedQuantity > 0;
  return !row.sellDate || row.sellTotal == null;
}


function trProfit(row) {
  return trPositionFigures(row)?.realProfit ?? null;
}


// One TR row = one lot (a buy, optionally fully sold) run through the shared
// position model: deposit balance on TL deposits, tax at the TR rate on the
// gain over the purchase cost, no sell-fee estimate.
function trPositionFigures(row) {
  const boughtCost = trEffectiveBuyTotal(row);
  if (boughtCost == null) return null;
  const taxRate = taxRateDecimal("tr");
  const curve = state.cashFlowYields.try.points;
  const buyFlow = { date: isoDay(row.buyDate), amount: boughtCost };
  if (!trIsOpen(row)) {
    const sellTotal = Math.abs(Number(row.sellTotal) || 0);
    const realizedTax = Math.max(sellTotal - boughtCost, 0) * taxRate;
    const sellDate = isoDay(row.sellDate);
    const depositBalance = depositShadowBalance([buyFlow, { date: sellDate, amount: -(sellTotal - realizedTax) }], sellDate, curve);
    return { open: false, boughtCost, depositBalance, realProfit: round2(-depositBalance), simpleProfit: round2(sellTotal - boughtCost), exitQuantity: null };
  }
  const depositBalance = depositShadowBalance([buyFlow], TODAY_ISO, curve);
  const value = trCurrentOrExitValue(row);
  if (value == null) return { open: true, boughtCost, depositBalance, realProfit: null, simpleProfit: null, exitQuantity: null };
  const quantity = trDisplayQuantity(row);
  const unrealizedTax = Math.max(value - boughtCost, 0) * taxRate;
  return {
    open: true,
    boughtCost,
    depositBalance,
    realProfit: round2(value - unrealizedTax - depositBalance),
    simpleProfit: round2(value - boughtCost),
    exitQuantity: positionExitQuantity(depositBalance, quantity, trCurrentOrExitPrice(row), quantity > 0 ? boughtCost / quantity : 0, taxRate),
  };
}


function trUnitPrice(total, quantity) {
  if (total == null || !quantity) return null;
  return round2(total / quantity);
}


export function trIsImportedUnknownQuantity(row) {
  const quantity = nullableClientNumber(row?.quantity);
  if (quantity == null || quantity <= 0) return true;
  if (String(row?.id || "").includes("tr-xlsx-") && quantity === 1) return true;
  const buyTotal = nullableClientNumber(row?.buyTotal);
  const symbol = normalizeTrSymbol(row?.symbol);
  const livePrice = symbol ? trLatestPrice(symbol) : null;
  return quantity === 1 && buyTotal != null && buyTotal > 1000 && (!livePrice || buyTotal > livePrice * 5);
}


export function trDisplayQuantity(row) {
  if (row?.computedQuantity != null) return round4(row.computedQuantity);
  const quantity = trEffectiveQuantity(row);
  return round4(quantity);
}


function trEntryPrice(row) {
  if (row?.computedUnitCost != null) return row.computedUnitCost;
  const cost = trEffectiveBuyTotal(row);
  return trUnitPrice(cost, trDisplayQuantity(row));
}


function trCurrentOrExitPrice(row) {
  if (row?.computedCurrentOrExitPrice != null) return row.computedCurrentOrExitPrice;
  if (!trIsOpen(row)) {
    if (trIsImportedUnknownQuantity(row)) return row.sellTotal;
    return trUnitPrice(row.sellTotal, trDisplayQuantity(row));
  }
  return trLatestPrice(row.symbol);
}


export function trCurrentOrExitValue(row) {
  if (row?.computedQuantity != null) {
    const price = trCurrentOrExitPrice(row);
    return price == null ? null : round2(price * row.computedQuantity);
  }
  if (!trIsOpen(row)) return row.sellTotal;
  const livePrice = trLatestPrice(row.symbol);
  const quantity = trDisplayQuantity(row);
  if (livePrice != null && quantity) return round2(livePrice * quantity);
  return null;
}


export function trEffectiveBuyTotal(row) {
  const base = nullableClientNumber(row.buyTotal);
  if (base == null) return null;
  if (trSaleBeforeSplit(row)) return base;
  if (!trHasValidSplitQuantity(row)) return base;
  return base + (nullableClientNumber(row.splitBuyTotal) ?? 0);
}


function trEffectiveQuantity(row) {
  const dividendQuantity = nullableClientNumber(row?.dividendQuantity);
  if (dividendQuantity != null && dividendQuantity > 0) return dividendQuantity;
  if (trSaleBeforeSplit(row)) return nullableClientNumber(row.quantity) ?? 1;
  return trHasValidSplitQuantity(row) ? nullableClientNumber(row.splitQuantity) : nullableClientNumber(row.quantity) ?? 1;
}


export function trNeedsSplitInput(row) {
  if (row?.splitPending != null) return row.splitPending;
  const event = detectedTrSplitEventForRow(row) || relevantTrSplitEvent(row);
  if (!event) return false;
  return !(trHasValidSplitQuantity(row) && trSplitApproved(row));
}


function trSplitApproved(row) {
  if (row?.splitApproved === true || row?.splitApproved === "true" || row?.splitApproved === 1 || row?.splitApproved === "1") return true;
  return row?.splitApproved == null && trHasValidSplitQuantity(row);
}


function renderTrBreakEvenCell(row) {
  const shares = trBreakEvenShares(row);
  if (shares == null) return "";
  const quantity = trDisplayQuantity(row);
  const percent = quantity > 0 ? Math.round((shares / quantity) * 100) : null;
  return `
    <div class="break-even-cell">
      <span class="break-even-shares">${formatNumber(shares, 0)}</span>
      ${percent != null ? `<span class="break-even-percent">%${percent}</span>` : ""}
    </div>
  `;
}


function trBreakEvenShares(row) {
  return trPositionFigures(row)?.exitQuantity ?? null;
}


function trHasSplitAfterBuy(row) {
  return Boolean(relevantTrSplitEvent(row));
}


function trHasValidSplitQuantity(row) {
  const value = nullableClientNumber(row?.splitQuantity);
  return value != null && value > 0;
}


function trSuggestedSplitQuantity(row, splitEvent = null) {
  const factor = splitEventFactor(row) || splitEventFactor(splitEvent);
  const quantity = nullableClientNumber(row?.quantity) || nullableClientNumber(row?.originalQuantity) || nullableClientNumber(row?.computedQuantity);
  if (!(factor > 0) || !(quantity > 0)) return null;
  return round4(quantity * factor);
}


export function splitEventFactor(event) {
  return nullableClientNumber(event?.factor) || nullableClientNumber(event?.ratio) || nullableClientNumber(event?.splitFactor);
}


function trSaleBeforeSplit(row) {
  if (!row?.splitDate || !row?.sellDate) return false;
  return parseDate(row.sellDate) < parseDate(row.splitDate);
}


export function getTrSplitFactor(symbol, buyDate) {
  const key = String(symbol || "").trim().toUpperCase();
  const cleanKey = normalizeTrSymbol(key);
  const event = firstRelevantTrSplitEvent(cleanKey, [], buyDate);
  if (event) return Number(event.factor) || 1;
  return 1;
}


export function relevantTrSplitEvent(row) {
  if (!row?.buyDate) return null;
  const manualEvent = row.splitDate ? { date: row.splitDate, factor: nullableClientNumber(row.splitFactor) || 1 } : null;
  const event = manualEvent || detectedTrSplitEventForRow(row) || firstRelevantTrSplitEvent(row.symbol, [normalizeTrRow(row)], row.buyDate);
  if (!event) return null;
  const sellDate = row.sellDate || "";
  if (sellDate && parseDate(sellDate) < parseDate(event.date)) return null;
  if (parseDate(row.buyDate) >= parseDate(event.date)) return null;
  return event;
}


export function firstRelevantTrSplitEvent(symbol, rows = [], buyDate = "") {
  const key = String(symbol || "").trim().toUpperCase();
  const cleanKey = normalizeTrSymbol(key);
  const events = [
    ...(state.trSplitsBySymbol.get(cleanKey) ?? []),
    ...(state.trSplitsBySymbol.get(key) ?? []),
  ].sort((left, right) => parseDate(left.date) - parseDate(right.date));
  for (const event of events) {
    if (parseDate(event.date) <= parseDate(buyDate)) continue;
    const wasOpenOnSplit = rows.length
      ? rows.some((row) => {
          const normalized = normalizeTrRow(row);
          if (normalized.buyDate && parseDate(normalized.buyDate) >= parseDate(event.date)) return false;
          return !normalized.sellDate || parseDate(normalized.sellDate) >= parseDate(event.date);
        })
      : true;
    if (wasOpenOnSplit) return event;
  }
  return null;
}


export function trLatestPrice(symbol) {
  const directPrice = state.trPricesBySymbol.get(symbol);
  if (Number.isFinite(directPrice)) return round2(directPrice);
  const candles = state.trCandlesBySymbol.get(symbol);
  const daily = candles?.d14 || candles?.d30;
  const monthly = candles?.m12;
  const last = Array.isArray(daily) && daily.length ? daily[daily.length - 1] : Array.isArray(monthly) && monthly.length ? monthly[monthly.length - 1] : null;
  return Number.isFinite(last?.close) ? round2(last.close) : null;
}


export function renderTrCandlesCell(symbol, key) {
  const candles = state.trCandlesBySymbol.get(symbol);
  const series = key === "d14" ? candles?.d14 || candles?.d30?.slice(-14) : candles?.[key];
  if (!Array.isArray(series) || !series.length) return "";
  const label = key === "d14" ? `${symbol} 14D` : `${symbol} 12M`;
  const className = key === "d14" ? "mini-candles short" : "mini-candles";
  return key === "d14"
    ? renderLineSvg(series, label, className, 108, 22)
    : renderCandlesSvg(series, label, className, 108, 22);
}


function trMoney(value) {
  return value == null ? "-" : `${formatNumber(value, 2)} TL`;
}


// TR editor: the holding period's rows (each a buy piece, sold or held),
// each one a button into its own editor.
function renderTrPositionRowsList(lot, editingId) {
  if (!lot?.position) return "";
  const rowsById = new Map(state.trRows.map((row) => [row.id, row]));
  const items = [...lot.position.portions]
    .sort((left, right) => left.buyDate.localeCompare(right.buyDate) || (left.sellDate || "9").localeCompare(right.sellDate || "9"))
    .map((portion) => {
      const row = rowsById.get(portion.rowId);
      if (!row) return "";
      const status = portion.sellDate
        ? `<span class="movement-info">satış ${formatDate(portion.sellDate)} · <span class="${profitClassName(portion.real)}">${profitAmountText(portion.real)}${profitPercentHtml(portion.real, portion.cost)}</span></span>`
        : `<span class="movement-info">elde</span>`;
      const control = row.id === editingId
        ? `<span class="abd-merge-self">Düzenleniyor</span>`
        : `<button type="button" class="secondary" data-tr-edit-row="${escapeAttr(row.id)}">Düzenle</button>`;
      return `
        <div class="abd-transaction-item">
          <strong>Alım</strong>
          <span>${formatDate(portion.buyDate)}</span>
          <span>${formatSmartNumber(portion.qty)}</span>
          <span>${trMoney(portion.cost)}</span>
          ${status}
          ${control}
        </div>
      `;
    })
    .join("");
  return `
    <div class="abd-transaction-list">
      <span>Hareketler (${escapeHtml(lot.symbol)})</span>
      ${items}
    </div>
  `;
}


function renderTrSummary() {
  const openLots = state.trOpenLots || [];
  const openRows = state.trRows.filter(trIsOpen);
  const monthly = buildPortfolioCandles("m12", openRows.map((row) => ({
    quantity: trDisplayQuantity(row),
    candles: state.trCandlesBySymbol.get(row.symbol),
  })));
  renderPositionSummary(
    { profit: elements.trPortfolioProfit, percent: elements.trPortfolioProfitPercent, closedProfit: elements.trPortfolioClosedProfit, closedPercent: elements.trPortfolioClosedProfitPercent, chart: elements.trPortfolioChartWrap },
    [...openLots, ...(state.trClosedLots || [])],
    "TL",
    monthly.length ? renderCandlesSvg(monthly, "TR Portfolio 12M", "summary-candles monthly", 156, 54) : "",
    taxRateDecimal("tr")
  );
}

