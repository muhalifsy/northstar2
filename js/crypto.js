import { elements, state } from "./state.js";
import { escapeHtml, escapeAttr, parseDate, normalizeInputDate, formatDate, renderDurationCell, formatNumber, formatSmartNumber, round2, round4, round8, formatEditNumber } from "./util.js";
import { persistCryptoPortfolio, apiFetch } from "./api.js";
import { taxRateDecimal, updateMarketStatus } from "./settings.js";
import { profitAmountText, buildCryptoPositionLots, renderPositionRow, positionMovementInfo, renderPositionSummary, profitClassName } from "./positions.js";
import { cashFlowMessages, updateStatusTab } from "./cashflow.js";
import { marketFetchIsFresh, markMarketFetch, setMarketDataMessages } from "./performance.js";
import { buildPortfolioCandles, renderCandlesSvg, renderLineSvg } from "./charts.js";

export function normalizeCryptoRow(row, index = 0) {
  const quantity = Number(row.quantity ?? row.pcs);
  const total = Number(row.total);
  const absQuantity = Math.abs(Number.isFinite(quantity) ? quantity : 0);
  const absTotal = Math.abs(Number.isFinite(total) ? total : 0);
  return {
    id: row.id || `crypto-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
    symbol: normalizeCryptoSymbol(row.symbol),
    date: normalizeInputDate(row.date || "") || row.date || "",
    quantity: Number.isFinite(quantity) ? quantity : 0,
    total: Number.isFinite(total) ? total : 0,
    price: absQuantity > 0 ? round4(absTotal / absQuantity) : 0,
    chainId: row.chainId || `${normalizeCryptoSymbol(row.symbol)}::crypto-${index}`,
  };
}


export function normalizeCryptoSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}


export function handleCryptoDraftChange() {}


export function autoSaveCryptoTransaction() {
  const symbol = normalizeCryptoSymbol(elements.cryptoSymbolInput.value);
  const date = normalizeInputDate(elements.cryptoDateInput.value) || elements.cryptoDateInput.value || "";
  const quantity = Number(elements.cryptoQuantityInput.value);
  const total = Number(elements.cryptoTotalInput.value);
  if (!symbol && !date && !elements.cryptoQuantityInput.value && !elements.cryptoTotalInput.value) return;
  if (!symbol || !date || !Number.isFinite(quantity) || quantity === 0 || !Number.isFinite(total) || total <= 0) return;

  if (quantity < 0) {
    // Sell: allocate across open lots (prompt per lot; spill to the next when one
    // isn't enough). Each allocation is a sell row tied to that lot's chainId, so
    // buildCryptoLots drains the chosen lot(s) first.
    const allocations = allocateCryptoSell(symbol, Math.abs(quantity));
    if (!allocations) return;
    const absTotal = Math.abs(total);
    const absQty = Math.abs(quantity);
    for (const alloc of allocations) {
      const ratio = alloc.qty / absQty;
      state.cryptoRows.push(normalizeCryptoRow({
        symbol,
        date,
        quantity: -alloc.qty,
        total: -round2(absTotal * ratio),
        chainId: alloc.chainId,
      }, state.cryptoRows.length));
    }
    elements.cryptoEntryForm.reset();
    persistCryptoPortfolio();
    rebuildCryptoPortfolio();
    return;
  }

  state.cryptoRows.push(normalizeCryptoRow({
    symbol,
    date,
    quantity,
    total: Math.abs(total),
    chainId: `${symbol}::crypto-${Date.now()}`,
  }, state.cryptoRows.length));
  elements.cryptoEntryForm.reset();
  persistCryptoPortfolio();
  rebuildCryptoPortfolio();
}


// Prompt to allocate a crypto sell across open lots. Returns [{ chainId, qty }]
// where chainId is the chosen lot's identity (so the sell drains that lot first),
// or null if cancelled / not enough shares.
function allocateCryptoSell(symbol, quantity) {
  const lots = state.cryptoOpenLots
    .filter((lot) => lot.symbol === symbol && lot.remainingShares > 1e-9)
    .map((lot) => {
      const sourceRow = state.cryptoRows[lot.sourceIndex];
      return { chainId: sourceRow?.chainId || `${symbol}::crypto-${Date.now()}`, date: lot.date, remaining: lot.remainingShares, averageCost: lot.averageCost };
    })
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));
  if (!lots.length) {
    window.alert?.(`${symbol}: açık lot bulunamadı.`);
    return null;
  }
  const totalAvailable = lots.reduce((sum, lot) => sum + lot.remaining, 0);
  if (quantity - totalAvailable > 1e-6) {
    window.alert?.(`${symbol}: toplam ${formatSmartNumber(totalAvailable)} adet açık lot var, ${formatSmartNumber(quantity)} satılamaz.`);
    return null;
  }
  const allocations = [];
  let remaining = quantity;
  while (remaining > 1e-9) {
    const available = lots.filter((lot) => lot.remaining > 1e-9);
    if (!available.length) break;
    let picked;
    if (available.length === 1) {
      picked = available[0];
    } else {
      const menu = available.map((lot, index) => `${index + 1}: ${formatDate(lot.date)} | ${formatSmartNumber(lot.remaining)} adet | maliyet ${cryptoMoney(lot.averageCost)}`).join("\n");
      const raw = window.prompt?.(`${symbol} satışı — kalan ${formatSmartNumber(remaining)} adet hangi lottan düşülsün?\n${menu}`, "1");
      if (raw == null) return null;
      const choice = Number(raw);
      if (!Number.isInteger(choice) || choice < 1 || choice > available.length) {
        window.alert?.("Geçersiz seçim, satış iptal edildi.");
        return null;
      }
      picked = available[choice - 1];
    }
    const take = Math.min(picked.remaining, remaining);
    allocations.push({ chainId: picked.chainId, qty: round8(take) });
    picked.remaining = round8(picked.remaining - take);
    remaining = round8(remaining - take);
  }
  return allocations;
}


export async function refreshCryptoPrices(options = {}) {
  const fresh = options.fresh === true;
  const symbols = [...new Set(state.cryptoOpenLots.map((lot) => lot.symbol).filter(Boolean))];
  if (!symbols.length) return;
  try {
    const freshParam = fresh ? "fresh=1&" : "";
    const payload = await apiFetch(`/api/crypto-quotes?${freshParam}symbols=${encodeURIComponent(symbols.join(","))}`);
    setMarketDataMessages("crypto", payload?.errors || []);
    const merged = new Map(state.cryptoPricesBySymbol);
    for (const [symbol, price] of Object.entries(payload?.prices || {})) {
      if (Number.isFinite(Number(price))) merged.set(normalizeCryptoSymbol(symbol), Number(price));
    }
    state.cryptoPricesBySymbol = merged;
    if (fresh) updateMarketStatus("crypto", { fetchedAt: payload?.fetchedAt, latestDate: payload?.latestDate });
    rebuildCryptoPortfolio();
  } catch (error) {
    setMarketDataMessages("crypto", [`Crypto price request failed. ${error?.message || ""}`.trim()]);
  }
  await refreshCryptoCandles();
}


// 12M / 14D charts for open crypto lots. Always cache-only: the worker's
// hourly job keeps the daily candles fresh, so the page never triggers the
// heavy multi-source crypto fetch itself.
async function refreshCryptoCandles() {
  const symbols = [...new Set(state.cryptoOpenLots.map((lot) => lot.symbol).filter(Boolean))];
  if (!symbols.length) return;
  const cacheKey = `candles:crypto:${[...symbols].sort().join(",")}`;
  if (marketFetchIsFresh(cacheKey)) return;
  try {
    const payload = await apiFetch(`/api/candles?cacheOnly=1&symbols=${encodeURIComponent(symbols.map((symbol) => `${symbol}-USD`).join(","))}`);
    const merged = new Map(state.cryptoCandlesBySymbol);
    for (const [historySymbol, candles] of Object.entries(payload?.candles || {})) {
      merged.set(normalizeCryptoSymbol(historySymbol.replace(/-USD$/i, "")), candles);
    }
    state.cryptoCandlesBySymbol = merged;
    markMarketFetch(cacheKey);
    setMarketDataMessages("crypto-candles", payload?.errors || []);
    renderCryptoPortfolio();
  } catch (error) {
    setMarketDataMessages("crypto-candles", [`Crypto chart request failed. ${error?.message || ""}`.trim()]);
  }
}


export function renderCryptoCandlesCell(symbol, key) {
  const candles = state.cryptoCandlesBySymbol.get(symbol);
  const series = key === "d14" ? candles?.d14 || candles?.d30?.slice(-14) : candles?.[key];
  if (!Array.isArray(series) || !series.length) return "";
  return key === "d14"
    ? renderLineSvg(series, `${symbol} 14D`, "mini-candles short", 108, 22)
    : renderCandlesSvg(series, `${symbol} 12M`, "mini-candles", 108, 22);
}


async function refreshCryptoStatus() {
  try {
    await apiFetch("/api/crypto-portfolio/status");
    const portfolio = await apiFetch("/api/crypto-portfolio");
    state.cryptoRows = Array.isArray(portfolio?.transactions) ? portfolio.transactions.map(normalizeCryptoRow) : [];
    rebuildCryptoPortfolio();
    setMarketDataMessages("crypto-status", []);
  } catch (error) {
    setMarketDataMessages("crypto-status", [`Crypto portfolio status could not be refreshed. ${error?.message || ""}`.trim()]);
    updateStatusTab(cashFlowMessages());
  }
}


export function rebuildCryptoPortfolio() {
  const lots = buildCryptoLots(state.cryptoRows, state.cryptoPricesBySymbol);
  state.cryptoOpenLots = lots.openLots;
  state.cryptoClosedLots = lots.closedLots;
  renderCryptoPortfolio();
}


function buildCryptoLots(rows, pricesBySymbol) {
  return buildCryptoPositionLots(rows, pricesBySymbol);
}


export function renderCryptoPortfolio() {
  if (!elements.cryptoTable) return;
  renderCryptoSummary();
  if (!state.cryptoOpenLots.length && !state.cryptoClosedLots.length) {
    elements.cryptoTable.innerHTML = state.cryptoRows.length
      ? `<div class="crypto-raw-list">${state.cryptoRows.slice().sort((a, b) => parseDate(b.date) - parseDate(a.date)).map(renderCryptoRawRow).join("")}</div>`
      : `<div class="empty-card">No crypto positions yet.</div>`;
    return;
  }
  const renderLot = (lot) => lot.txIndices?.includes(state.cryptoEditingIndex)
    ? renderCryptoEditRow({ ...lot, sourceIndex: state.cryptoEditingIndex })
    : renderPositionRow(lot, "crypto");
  const openHtml = state.cryptoOpenLots.map(renderLot).join("");
  const closedHtml = state.cryptoClosedLots.map(renderLot).join("");
  elements.cryptoTable.innerHTML = `
    <section class="abd-lot-panel">${openHtml || `<div class="empty-card">No open crypto positions.</div>`}</section>
    ${closedHtml ? `<section class="abd-lot-panel abd-lot-panel-closed">${closedHtml}</section>` : ""}
  `;
  elements.cryptoTable.querySelectorAll("[data-crypto-edit]").forEach((row) => row.addEventListener("click", () => {
    state.cryptoEditingIndex = Number(row.dataset.cryptoEdit);
    renderCryptoPortfolio();
  }));
  elements.cryptoTable.querySelectorAll(".crypto-edit-form").forEach((form) => {
    form.addEventListener("focusout", () => queueMicrotask(() => {
      if (document.activeElement?.closest?.("[data-crypto-delete]")) return;
      if (!form.contains(document.activeElement)) saveCryptoEditForm(form);
    }));
  });
  elements.cryptoTable.querySelectorAll("[data-crypto-delete]").forEach((button) => {
    button.addEventListener("pointerdown", deleteCryptoTransaction);
  });
}


function renderCryptoRawRow(row) {
  const tone = Number(row.quantity) >= 0 ? "row-profit-1" : "row-loss-1";
  return `
    <article class="position-row ${tone}">
      <div class="row-grid">
        <div class="cell-strong">${escapeHtml(row.symbol)}</div>
        <div class="cell-center">${formatDate(row.date)}</div>
        <div class="cell-center">${renderDurationCell(row.date, "")}</div>
        <div class="cell-center">${formatSmartNumber(row.quantity)}</div>
        <div class="number-cell">${cryptoMoney(Math.abs(row.total) / Math.abs(row.quantity || 1))}</div>
        <div class="number-cell">No price</div>
        <div class="number-cell">${cryptoMoney(row.total)}</div>
        <div></div><div></div><div></div>
      </div>
    </article>
  `;
}


function renderCryptoEditRow(lot) {
  const row = state.cryptoRows[lot.sourceIndex] || {};
  const activityRows = cryptoTransactionRowsForEdit(lot.symbol)
    .filter((item) => lot.txIndices?.includes(item.index));
  return `
    <article class="position-row ${lot.rowState} editing-row">
      <form class="row-grid crypto-edit-form" data-crypto-form="${lot.sourceIndex}">
        <input class="cell-center" name="symbol" value="${escapeAttr(row.symbol || lot.symbol)}" />
        <input class="cell-center" name="date" type="text" inputmode="numeric" value="${formatDate(row.date || lot.date)}" />
        <div class="cell-center">${renderDurationCell(row.date || lot.date, "")}</div>
        <input class="cell-center" name="quantity" type="number" step="0.00000001" value="${formatEditNumber(row.quantity ?? lot.remainingShares)}" />
        <input class="cell-center" name="total" type="number" step="0.01" value="${formatEditNumber(Math.abs(row.total ?? lot.sourceTotal))}" />
        <div class="number-cell">${lot.referencePrice == null ? "No price" : cryptoMoney(lot.referencePrice)}</div>
        <div class="number-cell ${profitClassName(lot.totalProfit)}">${lot.totalProfit == null ? "-" : `${profitAmountText(lot.totalProfit)} $`}</div>
        <button class="danger delete-button" data-crypto-delete="${lot.sourceIndex}" type="button">Delete</button><div></div><div></div>
        <div class="abd-transaction-list crypto-transaction-list">
          <span>Hareketler (${escapeHtml(lot.symbol)})</span>
          ${activityRows.map((item) => renderCryptoTransactionItem(item, lot.sourceIndex, lot)).join("")}
        </div>
      </form>
    </article>
  `;
}


function cryptoTransactionRowsForEdit(symbol) {
  const key = normalizeCryptoSymbol(symbol);
  return state.cryptoRows
    .map((row, index) => ({ row, index }))
    .filter((item) => normalizeCryptoSymbol(item.row.symbol) === key)
    .sort((left, right) => parseDate(left.row.date) - parseDate(right.row.date) || left.index - right.index);
}


function renderCryptoTransactionItem({ row, index }, editedIndex, lot) {
  const quantity = Number(row.quantity) || 0;
  const side = quantity > 0 ? "Buy" : "Sell";
  return `
    <div class="abd-transaction-item crypto-transaction-item" data-crypto-movement="${index}">
      <strong>${side}</strong>
      <input name="cryptoDate-${index}" type="text" inputmode="numeric" value="${formatDate(row.date)}" />
      <input name="cryptoQuantity-${index}" type="number" step="0.00000001" value="${formatEditNumber(row.quantity)}" />
      <input name="cryptoTotal-${index}" type="number" min="0" step="0.01" value="${formatEditNumber(Math.abs(Number(row.total) || 0))}" />
      ${positionMovementInfo(lot, index, quantity < 0)}
      <button class="danger delete-button" data-crypto-delete="${index}" type="button">Delete</button>
    </div>
  `;
}


export function saveCryptoEditForm(form) {
  const index = Number(form.dataset.cryptoForm);
  const row = state.cryptoRows[index];
  if (!row) return;
  const quantity = Number(form.elements.quantity.value);
  const total = Number(form.elements.total.value);
  const date = normalizeInputDate(form.elements.date.value) || form.elements.date.value || "";
  const symbol = normalizeCryptoSymbol(form.elements.symbol.value);
  if (!symbol || !date || !Number.isFinite(quantity) || quantity === 0 || !Number.isFinite(total) || total < 0) {
    state.cryptoEditingIndex = null;
    renderCryptoPortfolio();
    return;
  }
  state.cryptoRows[index] = normalizeCryptoRow({ ...row, symbol, date, quantity, total: quantity < 0 ? -Math.abs(total) : Math.abs(total) }, index);
  for (const item of form.querySelectorAll("[data-crypto-movement]")) {
    const movementIndex = Number(item.dataset.cryptoMovement);
    if (movementIndex === index) continue;
    const movement = state.cryptoRows[movementIndex];
    if (!movement) continue;
    const movementDate = normalizeInputDate(item.querySelector(`[name="cryptoDate-${movementIndex}"]`)?.value || "") || item.querySelector(`[name="cryptoDate-${movementIndex}"]`)?.value || "";
    const movementQuantity = Number(item.querySelector(`[name="cryptoQuantity-${movementIndex}"]`)?.value);
    const movementTotal = Number(item.querySelector(`[name="cryptoTotal-${movementIndex}"]`)?.value);
    if (!movementDate || !Number.isFinite(movementQuantity) || movementQuantity === 0 || !Number.isFinite(movementTotal) || movementTotal < 0) continue;
    state.cryptoRows[movementIndex] = normalizeCryptoRow({
      ...movement,
      symbol: normalizeCryptoSymbol(movement.symbol),
      date: movementDate,
      quantity: movementQuantity,
      total: movementQuantity < 0 ? -Math.abs(movementTotal) : Math.abs(movementTotal),
    }, movementIndex);
  }
  state.cryptoEditingIndex = null;
  persistCryptoPortfolio();
  rebuildCryptoPortfolio();
}


async function deleteCryptoTransaction(event) {
  event.preventDefault();
  event.stopPropagation();
  const index = Number(event.currentTarget.dataset.cryptoDelete);
  const row = state.cryptoRows[index];
  if (!row) return;
  const label = `${normalizeCryptoSymbol(row.symbol)} ${formatDate(row.date)}`;
  if (!window.confirm?.(`Delete this crypto movement? ${label}`)) return;
  state.cryptoRows = state.cryptoRows.filter((_, rowIndex) => rowIndex !== index);
  state.cryptoEditingIndex = null;
  await persistCryptoPortfolio();
  rebuildCryptoPortfolio();
}


function cryptoMoney(value) {
  return value == null || !Number.isFinite(Number(value)) ? "-" : `$${formatNumber(Number(value), 2)}`;
}


function renderCryptoSummary() {
  const monthly = buildPortfolioCandles("m12", state.cryptoOpenLots.map((lot) => ({
    quantity: lot.remainingShares,
    candles: state.cryptoCandlesBySymbol.get(lot.symbol),
  })));
  renderPositionSummary(
    { profit: elements.cryptoPortfolioProfit, percent: elements.cryptoPortfolioProfitPercent, closedProfit: elements.cryptoPortfolioClosedProfit, closedPercent: elements.cryptoPortfolioClosedProfitPercent, chart: elements.cryptoPortfolioChartWrap },
    [...state.cryptoOpenLots, ...state.cryptoClosedLots],
    "$",
    monthly.length ? renderCandlesSvg(monthly, "Crypto Portfolio 12M", "summary-candles monthly", 156, 54) : "",
    taxRateDecimal("crypto")
  );
}

