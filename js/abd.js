import { API_BASE, DEFAULT_FEE, elements, state } from "./state.js";
import { escapeHtml, normalizeMarketSymbol, nullableClientNumber, chunkSymbols, parseDate, normalizeInputDate, formatDate, formatCurrency, renderDurationCell, formatNumber, formatSmartNumber, round2, round4, formatEditNumber } from "./util.js";
import { apiFailureMessage, persistState } from "./api.js";
import { taxRateDecimal, updateMarketStatus } from "./settings.js";
import { profitAmountText, buildAbdPositionLots, renderPositionRow, positionMovementInfo, renderPortfolioSummary, profitClassName, renderBreakEvenCell } from "./positions.js";
import { splitEventFactor } from "./tr.js";
import { splitFieldsChanged, formSplitFieldsTouched, bindSplitFieldTracking } from "./splits.js";
import { renderCashFlow, updateStatusTab } from "./cashflow.js";
import { marketFetchIsFresh, markMarketFetch, setMarketDataMessages } from "./performance.js";
import { renderCandlesCell } from "./charts.js";

export function normalizeTransactions() {
  state.transactions = state.transactions.map((row, index) => {
    if (row.symbol === "IMSR-HOND") {
      row = { ...row, symbol: "IMSR", note: row.note || "e" };
    }
    if (row.symbol === "IMSR" && row.date === "2026-03-30" && !row.note) {
      row = { ...row, note: "e" };
    }
    const symbol = String(row.symbol || "").trim().toUpperCase();
    return {
      ...row,
      symbol,
      splitDate: normalizeInputDate(row.splitDate || "") || row.splitDate || "",
      splitFactor: nullableClientNumber(row.splitFactor),
      splitShares: nullableClientNumber(row.splitShares),
      splitTotal: nullableClientNumber(row.splitTotal),
      splitApproved: row.splitApproved === true || row.splitApproved === "true" || row.splitApproved === 1 || row.splitApproved === "1" || (row.splitApproved == null && nullableClientNumber(row.splitShares) > 0),
      dividendQuantity: nullableClientNumber(row.dividendQuantity),
      chainId: row.chainId || buildChainId(row, index),
    };
  });
  migrateAbdMergeGroups(state.transactions);
}


// The OSCR buys of 2025-07 were historically shown as a single merged lot via a
// hardcoded collapse. Now that lots default to separate, preserve that view by
// stamping those rows with a real, persistable merge group (idempotent).
function migrateAbdMergeGroups(rows) {
  const oscrLotDates = new Set(["2025-07-11", "2025-07-18"]);
  const oscrLots = rows.filter((row) => row.symbol === "OSCR" && Number(row.pcs) > 0 && oscrLotDates.has(row.date));
  if (oscrLots.length >= 2 && !oscrLots.every((row) => mergeGroupOf(row.chainId))) {
    const gid = "oscr0725";
    const identities = new Set(oscrLots.map((row) => lotIdentityOf(row.chainId)));
    for (const row of rows) {
      if (row.symbol === "OSCR" && identities.has(lotIdentityOf(row.chainId))) {
        row.chainId = `${lotIdentityOf(row.chainId)}::grp-${gid}`;
      }
    }
  }
}


export function handleDraftChange() {}


export function autoSaveTransaction() {
  const symbol = elements.symbolInput.value.trim().toUpperCase();
  const date = normalizeInputDate(elements.dateInput.value);
  const shares = Number(elements.sharesInput.value);
  const totalPaid = Number(elements.totalInput.value);
  const note = elements.noteInput.value.trim();

  if (!symbol && !date && !elements.sharesInput.value && !elements.totalInput.value) return;
  if (!symbol || !date || !Number.isFinite(shares) || shares === 0 || !Number.isFinite(totalPaid) || totalPaid <= 0) return;

  const absoluteShares = Math.abs(shares);

  if (shares < 0) {
    // Sell: allocate across one or more open lots (prompt per lot; spill to the
    // next when one isn't enough). Each allocation becomes its own sell row tied
    // to that lot's chainId, with the proceeds/fee split proportionally.
    const allocations = allocateAbdSell(symbol, absoluteShares);
    if (!allocations) return;
    for (const alloc of allocations) {
      const ratio = alloc.qty / absoluteShares;
      const rowTotal = round2(totalPaid * ratio);
      const rowFee = round2(DEFAULT_FEE * ratio);
      const rowAmount = round2(Math.max(rowTotal - rowFee, 0));
      state.transactions.push({
        symbol,
        date,
        pcs: -alloc.qty,
        price: alloc.qty > 0 ? round2(rowAmount / alloc.qty) : 0,
        amount: -rowAmount,
        fee: rowFee,
        total: -rowTotal,
        note,
        chainId: alloc.chainId,
      });
    }
    persistState();
    rebuildPortfolio();
    clearDraftForm();
    return;
  }

  const fee = DEFAULT_FEE;
  const amount = round2(Math.max(totalPaid - fee, 0));
  const price = absoluteShares > 0 ? round2(amount / absoluteShares) : 0;

  state.transactions.push({
    symbol,
    date,
    pcs: shares,
    price,
    amount,
    fee,
    total: round2(totalPaid),
    note,
    chainId: `${symbol}::user-${Date.now()}`,
  });

  persistState();
  rebuildPortfolio();
  clearDraftForm();
}


// Prompt the user to allocate a sell across open lots of `symbol`. Returns
// [{ chainId, qty }] covering `quantity`, or null if cancelled / not enough.
function allocateAbdSell(symbol, quantity) {
  const lots = state.openLots
    .filter((lot) => lot.symbol === symbol && lot.remainingShares > 1e-9)
    .map((lot) => ({ chainId: lot.chainId, date: lot.date, remaining: lot.remainingShares, averageCost: lot.averageCost }))
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));
  if (!lots.length) {
    window.alert?.(`${symbol}: açık lot bulunamadı.`);
    return null;
  }
  const totalAvailable = lots.reduce((sum, lot) => sum + lot.remaining, 0);
  if (quantity - totalAvailable > 1e-6) {
    window.alert?.(`${symbol}: toplam ${formatNumber(totalAvailable)} adet açık lot var, ${formatNumber(quantity)} satılamaz.`);
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
      const menu = available.map((lot, index) => `${index + 1}: ${formatDate(lot.date)} | ${formatNumber(lot.remaining)} adet | maliyet ${formatCurrency(lot.averageCost)}`).join("\n");
      const raw = window.prompt?.(`${symbol} satışı — kalan ${formatNumber(remaining)} adet hangi lottan düşülsün?\n${menu}`, "1");
      if (raw == null) return null;
      const choice = Number(raw);
      if (!Number.isInteger(choice) || choice < 1 || choice > available.length) {
        window.alert?.("Geçersiz seçim, satış iptal edildi.");
        return null;
      }
      picked = available[choice - 1];
    }
    const take = Math.min(picked.remaining, remaining);
    allocations.push({ chainId: picked.chainId, qty: round4(take) });
    picked.remaining = round4(picked.remaining - take);
    remaining = round4(remaining - take);
  }
  return allocations;
}


export async function refreshPrices(options = {}) {
  const fresh = options.fresh === true;
  const cacheParam = fresh ? "fresh=1" : "cacheOnly=1";
  const symbols = [...new Set(state.openLots
    .map((lot) => String(lot.symbol || "").trim().toUpperCase())
    .filter(Boolean))];
  if (!symbols.length) return;

  let pricesChanged = false;
  const messages = [];
  const aggregateStatus = { fetchedAt: "", latestDate: "" };

  try {
    const mergedPrices = new Map(state.pricesBySymbol);
    const quotePayloads = [];
    for (const batch of chunkSymbols(symbols, 6)) {
      try {
        const quotesResponse = await fetch(`${API_BASE}/api/quotes?${cacheParam}&symbols=${encodeURIComponent(batch.join(","))}`);
        if (!quotesResponse.ok) {
          messages.push(await apiFailureMessage(quotesResponse, `Quote request failed for ${batch.join(", ")}.`));
          quotePayloads.push(null);
          continue;
        }
        quotePayloads.push(await quotesResponse.json());
      } catch (error) {
        messages.push(`Quote request failed for ${batch.join(", ")}. ${error?.message || ""}`.trim());
        quotePayloads.push(null);
      }
    }
    for (const quotesPayload of quotePayloads) {
      if (!quotesPayload) continue;
      messages.push(...(quotesPayload.errors || []));
      if (quotesPayload.fetchedAt && quotesPayload.fetchedAt > aggregateStatus.fetchedAt) aggregateStatus.fetchedAt = quotesPayload.fetchedAt;
      if (quotesPayload.latestDate && quotesPayload.latestDate > aggregateStatus.latestDate) aggregateStatus.latestDate = quotesPayload.latestDate;
      for (const [symbol, price] of Object.entries(quotesPayload.prices ?? {})) {
        const key = String(symbol || "").trim().toUpperCase();
        if (key && Number.isFinite(price)) mergedPrices.set(key, price);
      }
    }
    pricesChanged = mergedPrices.size !== state.pricesBySymbol.size
      || [...mergedPrices].some(([symbol, price]) => state.pricesBySymbol.get(symbol) !== price);
    state.pricesBySymbol = mergedPrices;
  } catch {}

  // Update status only when this was a fresh attempt — cache-only loads should not bump "last refresh"
  if (fresh) updateMarketStatus("abd", aggregateStatus);

  if (pricesChanged) rebuildPortfolio();
  else renderPositions();
  refreshCandles(symbols, messages, { fresh }).catch(() => {
    setMarketDataMessages("abd", [...messages, "Chart data request failed."]);
    updateStatusTab();
  });
}


async function refreshCandles(symbols, messages = [], options = {}) {
  const fresh = options.fresh === true;
  const cacheKey = `candles:abd:${[...symbols].sort().join(",")}`;
  if (!fresh && marketFetchIsFresh(cacheKey)) return;
  const cacheParam = fresh ? "fresh=1" : "cacheOnly=1";
  const mergedCandles = new Map(state.candlesBySymbol);
  const candlePayloads = [];
  const aggregateStatus = { fetchedAt: "", latestDate: "" };
  for (const batch of chunkSymbols(symbols, 3)) {
    try {
      const candlesResponse = await fetch(`${API_BASE}/api/candles?${cacheParam}&symbols=${encodeURIComponent(batch.join(","))}`);
      if (!candlesResponse.ok) {
        messages.push(await apiFailureMessage(candlesResponse, `Chart request failed for ${batch.join(", ")}.`));
        candlePayloads.push(null);
        continue;
      }
      candlePayloads.push(await candlesResponse.json());
    } catch (error) {
      messages.push(`Chart request failed for ${batch.join(", ")}. ${error?.message || ""}`.trim());
      candlePayloads.push(null);
    }
  }
  for (const candlesPayload of candlePayloads) {
    if (!candlesPayload) continue;
    messages.push(...(candlesPayload.errors || []));
    if (candlesPayload.fetchedAt && candlesPayload.fetchedAt > aggregateStatus.fetchedAt) aggregateStatus.fetchedAt = candlesPayload.fetchedAt;
    if (candlesPayload.latestDate && candlesPayload.latestDate > aggregateStatus.latestDate) aggregateStatus.latestDate = candlesPayload.latestDate;
    for (const [symbol, candles] of Object.entries(candlesPayload.candles ?? {})) {
      const key = String(symbol || "").trim().toUpperCase();
      if (key) mergedCandles.set(key, candles);
    }
  }
  state.candlesBySymbol = mergedCandles;
  markMarketFetch(cacheKey);
  if (fresh) updateMarketStatus("abd", aggregateStatus);
  setMarketDataMessages("abd", messages);
  renderPortfolioSummary();
  renderPositions();
  updateStatusTab();
}


export function rebuildPortfolio() {
  const lots = buildOpenLots(state.transactions, taxRateDecimal("usa"), state.pricesBySymbol, state.gs3mByMonth);
  state.openLots = lots.openLots;
  state.closedLots = lots.closedLots;
  renderPortfolioSummary();
  renderPositions();
  renderCashFlow();
}


function buildOpenLots(rows, taxRate, pricesBySymbol) {
  return buildAbdPositionLots(rows, taxRate, pricesBySymbol);
}


export function renderPositions() {
  if (!state.openLots.length && !state.closedLots.length) {
    elements.positionsTable.innerHTML = `<div class="empty-card">No positions yet.</div>`;
    return;
  }

  const renderLot = (lot) => lot.txIndices?.includes(state.editingIndex)
    ? renderEditRow({ ...lot, sourceIndex: state.editingIndex })
    : renderPositionRow(lot, "abd");
  const openHtml = state.openLots.map(renderLot).join("");
  const closedHtml = state.closedLots.map(renderLot).join("");

  elements.positionsTable.innerHTML = `
    <section class="abd-lot-panel">
      ${openHtml || `<div class="empty-card">No open positions.</div>`}
    </section>
    ${closedHtml ? `
      <section class="abd-lot-panel abd-lot-panel-closed">
        ${closedHtml}
      </section>
    ` : ""}
  `;

  for (const row of elements.positionsTable.querySelectorAll("[data-edit-index]")) {
    row.addEventListener("click", () => {
      state.editingIndex = Number(row.dataset.editIndex);
      renderPositions();
    });
  }

  for (const form of elements.positionsTable.querySelectorAll(".edit-row-form")) {
    bindSplitFieldTracking(form);
  }
  elements.positionsTable.querySelectorAll("[data-abd-approve-split]").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const form = event.currentTarget.closest(".edit-row-form");
    if (!form) return;
    form.dataset.splitApproved = "1";
    saveEditForm(form);
  }));
  elements.positionsTable.querySelectorAll("[data-delete-index]").forEach((button) => button.addEventListener("click", deleteTransactionRow));
  // Jump the editor to another buy of the same holding period (saving first).
  elements.positionsTable.querySelectorAll("[data-abd-edit-tx]").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const target = Number(event.currentTarget.dataset.abdEditTx);
    const form = event.currentTarget.closest(".edit-row-form");
    if (form) saveEditForm(form);
    state.editingIndex = target;
    renderPositions();
  }));
}


function clearDraftForm() {
  elements.transactionForm.reset();
  elements.sideInput.value = "buy";
}


function renderShareCell(lot) {
  return formatNumber(lot.remainingShares, 0);
}


function renderEditRow(lot) {
  const row = state.transactions[lot.sourceIndex] || {};
  const splitEvent = relevantAbdSplitEventForRow(row);
  const needsSplitInput = Boolean(splitEvent);
  const splitDateValue = row.splitDate || splitEvent?.date || "";
  const suggestedSplitShares = abdSuggestedSplitShares(row, splitEvent);
  const splitSharesValue = row.splitShares == null || Number(row.splitShares) <= 0 ? suggestedSplitShares : row.splitShares;
  const sellRow = findRelatedSellRow(row);
  const chainRows = abdTransactionRowsForEdit(lot.symbol)
    .filter((item) => lot.txIndices?.includes(item.index));
  return `
    <article class="position-row ${lot.rowState} editing-row">
      <form class="row-grid edit-row-form" data-edit-form="${lot.sourceIndex}">
        <label class="edit-field" data-label="Stock"><input class="cell-center" name="symbol" value="${lot.symbol}" /></label>
        <label class="edit-field" data-label="Date"><input class="cell-center" name="date" type="text" inputmode="decimal" value="${formatDate(row.date || lot.date)}" /></label>
        <div class="cell-center" data-label="Days">${renderDurationCell(row.date || lot.date, lot.remainingShares > 0 ? "" : lot.exitDate)}</div>
        <label class="edit-field" data-label="Quantity"><input class="cell-center" name="shares" type="number" min="0.0001" step="0.0001" value="${formatEditNumber(row.pcs ?? lot.originalShares)}" /></label>
        <label class="edit-field" data-label="Total Paid"><input class="cell-center" name="total" type="number" min="0" step="0.01" value="${formatEditNumber(row.total ?? lot.sourceTotal)}" /></label>
        <div class="number-cell" data-label="Current">${lot.referencePrice != null ? formatCurrency(lot.referencePrice) : "No price"}</div>
        <div class="number-cell ${profitClassName(lot.totalProfit)}" data-label="P/L">${lot.totalProfit != null ? `${profitAmountText(lot.totalProfit)} $` : ""}</div>
        <div class="cell-center" data-label="Exit Qty">${renderBreakEvenCell(lot)}</div>
        <div class="cell-center" data-label="12M">${renderCandlesCell(lot.symbol, "m12")}</div>
        <button class="danger delete-button" data-delete-index="${lot.sourceIndex}" type="button">Delete</button>
        ${needsSplitInput ? `
          <div class="split-edit-fields">
            <span>Post-action</span>
            <input name="splitDate" data-split-field type="text" inputmode="decimal" placeholder="Split date" value="${splitDateValue ? formatDate(splitDateValue) : ""}" />
            <input name="splitShares" data-split-field type="number" min="0.0001" step="0.0001" placeholder="New qty" value="${formatEditNumber(splitSharesValue)}" />
            <input name="splitTotal" data-split-field type="number" min="0" step="0.01" placeholder="Extra cost" value="${formatEditNumber(row.splitTotal)}" />
            <button class="secondary split-approve-button" data-abd-approve-split type="button">Approve</button>
          </div>
        ` : ""}
        <div class="split-edit-fields">
          <span>Dividend</span>
          <input name="dividendQuantity" type="number" min="0.0001" step="0.0001" placeholder="Qty with dividends" value="${formatEditNumber(row.dividendQuantity)}" />
        </div>
        <div class="split-edit-fields">
          <span>Sale</span>
          <input name="sellDate" type="text" inputmode="decimal" placeholder="Sell date" value="${sellRow?.date ? formatDate(sellRow.date) : ""}" />
          <input name="sellShares" type="number" min="0.0001" step="0.0001" placeholder="Sell qty" value="${sellRow ? formatEditNumber(Math.abs(Number(sellRow.pcs) || 0)) : ""}" />
          <input name="sellTotal" type="number" min="0" step="0.01" placeholder="Sell total" value="${sellRow ? formatEditNumber(Math.abs(Number(sellRow.total) || 0)) : ""}" />
        </div>
        <div class="abd-transaction-list">
          <span>Hareketler (${escapeHtml(lot.symbol)})</span>
          ${chainRows.map((item) => renderAbdTransactionItem(item, lot.sourceIndex, lot)).join("")}
        </div>
      </form>
    </article>
  `;
}


function abdTransactionRowsForEdit(symbol) {
  const key = normalizeMarketSymbol(symbol);
  const transactions = state.transactions
    .map((row, index) => ({ row, index }))
    .filter((item) => normalizeMarketSymbol(item.row.symbol) === key)
    .map((item) => ({ ...item, type: "transaction", date: item.row.date }));
  const splitMovements = state.transactions
    .map((row, index) => ({ row, index }))
    .filter((item) => normalizeMarketSymbol(item.row.symbol) === key && item.row.splitDate)
    .map((item) => ({ ...item, type: "split", date: item.row.splitDate }));
  return [...transactions, ...splitMovements]
    .sort((left, right) => parseDate(left.date) - parseDate(right.date) || movementSortOrder(left) - movementSortOrder(right) || left.index - right.index)
    .map(withAbdMovementQuantityFlow);
}


function movementSortOrder(item) {
  if (item.type === "split") return 1;
  return Number(item.row.pcs) >= 0 ? 0 : 2;
}


function renderAbdTransactionItem({ row, index, type, quantityFlow }, editedIndex, lot) {
  if (type === "split") {
    return `
      <div class="abd-transaction-item split-movement">
        <strong>Split</strong>
        <span>${formatDate(row.splitDate)}</span>
        <span>${quantityFlow || "-"}</span>
        <span>${row.splitTotal ? formatCurrency(Number(row.splitTotal)) : ""}</span>
        <span></span>
      </div>
    `;
  }
  const quantity = Number(row.pcs) || 0;
  const side = quantity >= 0 ? "Buy" : "Sell";
  return `
      <div class="abd-transaction-item">
        <strong>${side}</strong>
        <span>${formatDate(row.date)}</span>
      <span>${quantityFlow || formatSmartNumber(Math.abs(quantity))}</span>
        <span>${formatCurrency(Math.abs(Number(row.total) || 0))}</span>
        ${positionMovementInfo(lot, index, quantity < 0)}
        ${quantity > 0 && index !== editedIndex ? `<button type="button" class="secondary" data-abd-edit-tx="${index}">Düzenle</button>` : quantity > 0 ? `<span class="abd-merge-self">Düzenleniyor</span>` : `<span></span>`}
      </div>
  `;
}


function withAbdMovementQuantityFlow(item, index, movements) {
  const previousQuantity = index === 0 ? 0 : movements[index - 1].runningQuantity || 0;
  item.runningQuantityBefore = previousQuantity;
  let nextQuantity = previousQuantity;
  if (item.type === "split") {
    const splitShares = nullableClientNumber(item.row.splitShares);
    const splitFactor = nullableClientNumber(item.row.splitFactor);
    nextQuantity = splitShares != null && splitShares > 0
      ? splitShares
      : splitFactor ? previousQuantity * splitFactor : previousQuantity;
  } else {
    const rawQuantity = Number(item.row.pcs) || 0;
    const splitMovement = movements.find((movement) =>
      movement.type === "split" &&
      normalizeMarketSymbol(movement.row.symbol) === normalizeMarketSymbol(item.row.symbol) &&
      parseDate(movement.date) <= parseDate(item.date)
    );
    const splitFactor = splitMovement ? abdSplitDisplayRatio(splitMovement) : 1;
    const displayQuantity = rawQuantity > 0 && splitFactor > 1 ? rawQuantity * splitFactor : rawQuantity;
    nextQuantity = previousQuantity + displayQuantity;
  }
  item.runningQuantity = Math.max(round4(nextQuantity), 0);
  item.quantityFlow = `${formatSmartNumber(Math.max(round4(previousQuantity), 0))} -> ${formatSmartNumber(item.runningQuantity)}`;
  return item;
}


function abdSplitDisplayRatio(splitMovement) {
  const before = splitMovement.runningQuantityBefore ?? null;
  const splitShares = nullableClientNumber(splitMovement.row.splitShares);
  const splitFactor = nullableClientNumber(splitMovement.row.splitFactor);
  if (before && splitShares) return splitShares / before;
  return splitFactor && splitFactor > 0 ? splitFactor : 1;
}


export function saveEditForm(form) {
  const index = Number(form.dataset.editForm);
  const row = state.transactions[index];
  if (!row) {
    state.editingIndex = null;
    renderPositions();
    return;
  }

  const symbol = form.elements.symbol.value.trim().toUpperCase();
  const date = normalizeInputDate(form.elements.date.value);
  const originalShares = Number(form.elements.shares.value);
  const totalPaid = Number(form.elements.total.value);

  if (!symbol || !date || !Number.isFinite(originalShares) || originalShares <= 0 || !Number.isFinite(totalPaid) || totalPaid <= 0) {
    state.editingIndex = null;
    renderPositions();
    return;
  }

  const fee = Number(row.fee) || DEFAULT_FEE;
  const amount = round2(Math.max(totalPaid - fee, 0));
  const price = originalShares > 0 ? round4(amount / originalShares) : 0;
  const splitShares = nullableClientNumber(form.elements.splitShares?.value);
  const splitTotal = nullableClientNumber(form.elements.splitTotal?.value);
  const splitDate = normalizeInputDate(form.elements.splitDate?.value || "") || row.splitDate || "";
  let dividendQuantity = nullableClientNumber(form.elements.dividendQuantity?.value);
  const splitChanged = formSplitFieldsTouched(form) && splitFieldsChanged(row, {
    splitDate,
    splitQuantity: splitShares,
    splitBuyTotal: splitTotal,
  }, { quantityKey: "splitShares", totalKey: "splitTotal" });
  if (splitChanged && (nullableClientNumber(dividendQuantity) || 0) > 0) {
    const ok = window.confirm?.("Qty with dividends will be cleared because split information is being updated. Continue?");
    if (!ok) return;
    dividendQuantity = null;
  }
  const chainId = row.chainId || buildChainId(row, index);

  state.transactions[index] = {
    ...row,
    symbol,
    date,
    pcs: originalShares,
    amount,
    total: round2(totalPaid),
    price,
    splitShares,
    splitTotal,
    splitDate,
    splitApproved: (form.dataset.splitApproved === "1" || (formSplitFieldsTouched(form) && splitShares > 0)) ? true : row.splitApproved,
    dividendQuantity,
    chainId,
  };

  saveRelatedSellRow(chainId, symbol, form.elements.sellDate?.value, form.elements.sellShares?.value, form.elements.sellTotal?.value);

  state.editingIndex = null;
  persistState();
  rebuildPortfolio();
}


function findRelatedSellRow(row) {
  const chainId = row?.chainId;
  if (!chainId) return null;
  return state.transactions.find((item) => item.chainId === chainId && Number(item.pcs) < 0) || null;
}


function saveRelatedSellRow(chainId, symbol, rawDate, rawShares, rawTotal) {
  if (!rawDate && !rawShares && !rawTotal) return;
  const date = normalizeInputDate(rawDate || "");
  const shares = Number(rawShares);
  const totalPaid = Number(rawTotal);
  if (!date || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(totalPaid) || totalPaid <= 0) return;

  const fee = DEFAULT_FEE;
  const amount = round2(Math.max(totalPaid - fee, 0));
  const sellRow = {
    symbol,
    date,
    pcs: -shares,
    price: shares > 0 ? round4(amount / shares) : 0,
    amount: -amount,
    fee,
    total: -round2(totalPaid),
    note: "",
    chainId,
  };
  const existingIndex = state.transactions.findIndex((item) => item.chainId === chainId && Number(item.pcs) < 0);
  if (existingIndex >= 0) {
    state.transactions[existingIndex] = { ...state.transactions[existingIndex], ...sellRow };
  } else {
    state.transactions.push(sellRow);
  }
}


function deleteTransactionRow(event) {
  event.preventDefault();
  event.stopPropagation();
  const index = Number(event.currentTarget.dataset.deleteIndex);
  const row = state.transactions[index];
  if (!row) return;
  if (!window.confirm?.(`Delete ${row.symbol} row?`)) return;
  state.transactions.splice(index, 1);
  state.editingIndex = null;
  persistState();
  rebuildPortfolio();
}


function buildGroupKey(row) {
  return row.chainId || (row.note ? `${row.symbol}::${row.note}` : "");
}


// Lot grouping model (ABD + crypto share this):
//   - Each buy has a unique chainId, so by default every buy is its own lot.
//   - A sell carries the exact chainId of the buy lot it was allocated to, so it
//     groups with that buy.
//   - Merging lots stamps every row of the merged lots with a shared "::grp-<id>"
//     token appended to their chainId; the underlying per-lot identity (the part
//     before ::grp-) is preserved so a lot can be separated back out later.
function mergeGroupOf(chainId) {
  const match = String(chainId || "").match(/::grp-([^:]+)/);
  return match ? match[1] : "";
}


function lotIdentityOf(chainId) {
  return String(chainId || "").replace(/::grp-[^:]*/g, "");
}


export function abdGroupKey(row) {
  const symbol = normalizeMarketSymbol(row.symbol);
  const group = mergeGroupOf(row.chainId);
  if (group) return `${symbol}::grp-${group}`;
  return `${symbol}::${lotIdentityOf(row.chainId) || "nochain"}`;
}


function normalizeLotInput(row) {
  const splitEvent = relevantAbdSplitEventForRow(row);
  const splitFactor = splitEvent ? (Number(splitEvent.factor) || 1) : 1;
  const splitDate = row.splitDate || splitEvent?.date || "";
  const originalQuantity = Math.abs(Number(row.pcs) || 0);
  const originalTotal = Number.isFinite(Number(row.total))
    ? Math.abs(Number(row.total))
    : originalQuantity * Number(row.price || 0) + Math.abs(Number(row.fee) || 0);
  const splitQuantity = nullableClientNumber(row.splitShares);
  const splitExtraCost = nullableClientNumber(row.splitTotal) ?? 0;
  const hasSplitQuantity = splitQuantity != null && splitQuantity > 0;
  return {
    splitFactor,
    splitDate,
    splitPending: Boolean(splitEvent || splitDate) && splitFactor > 1 && !hasSplitQuantity,
    originalQuantity,
    originalTotal,
    originalUnitCost: originalQuantity > 0 ? originalTotal / originalQuantity : 0,
    splitQuantity,
    splitExtraCost,
    hasSplitQuantity,
  };
}


function buildClosedLot(rows, lot, sellRow, consumedShares, sharesBeforeSale, costBeforeSale, saleNetForLot, estimatedTax) {
  const soldRatio = sharesBeforeSale > 0 ? consumedShares / sharesBeforeSale : 1;
  const costShare = costBeforeSale * soldRatio;
  const profit = round2(saleNetForLot - costShare - estimatedTax);
  return {
    symbol: lot.symbol,
    date: lot.originDate,
    exitDate: sellRow.date,
    originalShares: round4(consumedShares),
    averageCost: round2(lot.lotPrice),
    referencePrice: Number(sellRow.price) || 0,
    totalProfit: profit,
    sourceIndex: findSourceIndex(rows, lot),
    sourceTotal: findSourceTotal(rows, lot),
    chainId: lot.chainId,
  };
}


function splitSaleRatio(sellRow, lot) {
  if (!lot.hasSplitQuantity || !lot.splitDate || !sellRow.date) return 1;
  if (parseDate(sellRow.date) < parseDate(lot.splitDate)) return 1;
  if (!lot.remainingShares || lot.remainingShares <= 0) return 1;
  return lot.splitShares / lot.remainingShares || 1;
}


function saleUnitPriceForLot(sellRow, lot, saleRatio = 1) {
  const sellShares = Math.abs(Number(sellRow.pcs) || 0);
  const sellTotal = Math.abs(Number(sellRow.total) || 0);
  if (sellShares > 0 && sellTotal > 0) {
    return (sellTotal / sellShares) * saleRatio;
  }
  return (Number(sellRow.price) || 0) * saleRatio;
}


export function getSplitFactor(symbol, buyDate) {
  const event = firstRelevantAbdSplitEvent(symbol, [], buyDate);
  return event ? Number(event.factor) || 1 : 1;
}


export function abdSplitApproved(row) {
  if (row?.splitApproved === true || row?.splitApproved === "true" || row?.splitApproved === 1 || row?.splitApproved === "1") return true;
  return row?.splitApproved == null && nullableClientNumber(row?.splitShares) > 0;
}


function abdSuggestedSplitShares(row, splitEvent = null) {
  const factor = splitEventFactor(row) || splitEventFactor(splitEvent);
  const shares = Math.abs(Number(row?.pcs) || 0);
  if (!(factor > 0) || !(shares > 0)) return null;
  return round4(shares * factor);
}


function relevantAbdSplitEventForRow(row) {
  if (!row?.date) return null;
  const manualEvent = row.splitDate ? { date: row.splitDate, factor: nullableClientNumber(row.splitFactor) || 1 } : null;
  const event = manualEvent || firstRelevantAbdSplitEvent(row.symbol, [row], row.date);
  if (!event) return null;
  if (parseDate(row.date) >= parseDate(event.date)) return null;
  return event;
}


export function firstRelevantAbdSplitEvent(symbol, rows = [], buyDate = "") {
  const key = String(symbol || "").trim().toUpperCase();
  const events = [...(state.splitsBySymbol.get(key) ?? [])]
    .sort((left, right) => parseDate(left.date) - parseDate(right.date));
  for (const event of events) {
    if (parseDate(event.date) <= parseDate(buyDate)) continue;
    const wasOpenOnSplit = rows.length
      ? rows.some((row) => {
          if (Number(row.pcs) <= 0) return false;
          const rowKey = row.chainId || abdGroupKey(row);
          const soldBeforeSplit = rows
            .filter((candidate) => Number(candidate.pcs) < 0 && (candidate.chainId || abdGroupKey(candidate)) === rowKey && parseDate(candidate.date) < parseDate(event.date))
            .reduce((total, candidate) => total + Math.abs(Number(candidate.pcs) || 0), 0);
          return soldBeforeSplit < Math.abs(Number(row.pcs) || 0);
        })
      : true;
    if (wasOpenOnSplit) return event;
  }
  return null;
}


function findSourceIndex(rows, lot) {
  return rows.findIndex((row) => row.chainId === lot.chainId && row.pcs > 0);
}


function findSourceTotal(rows, lot) {
  const row = rows.find((item) => item.chainId === lot.chainId && item.pcs > 0);
  return row ? Number(row.total) : 0;
}


function buildChainId(row, index) {
  if (row.note) return `${row.symbol}::${row.note}`;
  return `${row.symbol}::seed-${index}`;
}


function resolveSellChainId(symbol, quantity) {
  const candidates = state.openLots.filter((lot) => lot.symbol === symbol && lot.remainingShares > 0);
  if (!candidates.length) {
    window.alert?.(`No open lot found for ${symbol}.`);
    return null;
  }
  if (candidates.length === 1) {
    if (quantity > candidates[0].remainingShares) {
      window.alert?.(`You only have ${formatNumber(candidates[0].remainingShares)} shares in that lot.`);
      return null;
    }
    return candidates[0].chainId;
  }

  const message = candidates
    .map((lot, index) => `${index + 1}: ${formatDate(lot.date)} | ${formatNumber(lot.remainingShares)} | ${formatCurrency(lot.averageCost)}`)
    .join("\n");
  const rawChoice = window.prompt?.(`Choose lot for ${symbol} sale:\n${message}`, "1");
  const choice = Number(rawChoice);
  if (!Number.isInteger(choice) || choice < 1 || choice > candidates.length) return null;
  if (quantity > candidates[choice - 1].remainingShares) {
    window.alert?.(`You only have ${formatNumber(candidates[choice - 1].remainingShares)} shares in that lot.`);
    return null;
  }
  return candidates[choice - 1].chainId;
}

