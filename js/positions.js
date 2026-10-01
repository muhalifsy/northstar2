import { TODAY_ISO, elements, state } from "./state.js";
import { escapeHtml, escapeAttr, normalizeMarketSymbol, nullableClientNumber, isoDay, parseDate, formatDate, formatAmountHtml, plainAmount, stackedCell, renderDateWithExitCell, renderDurationCell, formatNumber, formatSmartNumber, round2, round4 } from "./util.js";
import { rebuyMergeMonths, taxRateDecimal } from "./settings.js";
import { accrueRolledDeposit, addIsoMonths } from "./interest.js";
import { getSplitFactor, abdSplitApproved, firstRelevantAbdSplitEvent } from "./abd.js";
import { normalizeTrSymbol, trIsOpen, trDisplayQuantity, trEffectiveBuyTotal, trNeedsSplitInput, trLatestPrice, renderTrCandlesCell } from "./tr.js";
import { normalizeCryptoRow, renderCryptoCandlesCell } from "./crypto.js";
import { renderCandlesCell, renderPortfolioCandles } from "./charts.js";

// ---- Position economics, shared by ABD, TR and crypto ----
// Opportunity is modelled on cash flows: every buy puts its cost into a deposit
// on the buy date, every sale takes its after-tax proceeds out on the sale
// date, and in between the balance earns a rolled 3-month deposit
// (accrueRolledDeposit). What is left at the end is what the position still
// owes the deposit: > 0 not yet recouped, <= 0 recouped. Only the curve differs
// per market — TL deposits for TR, USD 3M for ABD and crypto.
//   flows: [{ date, amount }] — amount > 0 money in (buy), < 0 money out (sale).
export function depositShadowBalance(flows, endDate, curvePoints) {
  const sorted = flows
    .filter((flow) => flow.date && Number.isFinite(flow.amount) && flow.amount !== 0)
    .sort((left, right) => left.date.localeCompare(right.date));
  let balance = 0;
  let lastDate = "";
  for (const flow of sorted) {
    if (balance > 0 && lastDate) balance += accrueRolledDeposit(balance, lastDate, flow.date, curvePoints);
    balance += flow.amount;
    lastDate = flow.date;
  }
  if (balance > 0 && lastDate && endDate > lastDate) balance += accrueRolledDeposit(balance, lastDate, endDate, curvePoints);
  return round2(balance);
}


// After-tax proceeds per share when selling now: the gain over the shares'
// purchase basis is taxed at the market's rate.
function netSellPricePerShare(price, basisPerShare, taxRate) {
  if (!(price > 0)) return null;
  return Math.max(price - Math.max(price - (basisPerShare || 0), 0) * taxRate, 0);
}


// Exit Qty: fewest shares whose after-tax, after-fee sale clears the deposit
// balance (money put in plus the interest it would have earned). null when
// already recouped or when even selling everything would not clear it.
// Stocks round up to whole shares; crypto to 8 decimals.
export function positionExitQuantity(balance, remainingShares, price, basisPerShare, taxRate, sellFee = 0, wholeShares = true) {
  if (!(balance > 0) || !(remainingShares > 0)) return null;
  const netPrice = netSellPricePerShare(price, basisPerShare, taxRate);
  if (!(netPrice > 0)) return null;
  if (wholeShares) return calculateBreakEvenShares(remainingShares, balance, sellFee, netPrice);
  const required = Math.ceil(((balance + sellFee) / netPrice) * 1e8) / 1e8;
  return required < remainingShares ? required : null;
}


// P/L cell for every tab: real profit on top, simple profit below, each with
// its % of the total bought cost (the money put into the position). single:
// only the real figure (recouped positions, where both are the same).
function renderProfitCell(realProfit, simpleProfit, boughtCost, { single = false } = {}) {
  return stackedCell(
    realProfit == null ? "-" : `${profitAmountText(realProfit)}${profitPercentHtml(realProfit, boughtCost)}`,
    single ? "" : simpleProfit == null ? "-" : `${profitAmountText(simpleProfit)}${profitPercentHtml(simpleProfit, boughtCost)}`,
    { topClass: profitClassName(realProfit), bottomClass: profitClassName(simpleProfit), mutedBottom: false }
  );
}


// P/L figures are shown conservatively: always rounded DOWN, so a loss never
// looks smaller and a profit never looks bigger than it is (−19.450,50 →
// −19.451; 20.100,90 → 20.100). Amounts drop the decimals; % keeps one.
function floorTo(value, decimals = 0) {
  const factor = 10 ** decimals;
  const floored = Math.floor(Number(value) * factor + 1e-7) / factor;
  return floored === 0 ? 0 : floored;
}


export function profitAmountText(value) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return formatNumber(floorTo(value), 0);
}


function profitPercentText(profit, boughtCost) {
  if (profit == null || !(boughtCost > 0)) return "";
  const percent = floorTo((profit / boughtCost) * 100, 1);
  return `${percent > 0 ? "+" : ""}${formatNumber(percent, 1)}%`;
}


export function profitPercentHtml(profit, boughtCost) {
  const text = profitPercentText(profit, boughtCost);
  return text ? `<span class="profit-percent">${text}</span>` : "";
}


// ==== Positions: one row per holding period of a symbol (ABD, TR, crypto) ====
// Every market is reduced to "portions": pieces of a buy lot that are either
// still held or were sold in one sale, matched FIFO. TR rows already are
// portions; ABD and crypto movements are cut into portions by fifoPortions().
//   portion: { buyDate, buyRef, qty, cost, sellDate?, sellRef?, proceeds?, rowId? }
// A holding period (cycle) ends when the quantity returns to zero; a later
// buy starts a new row. Accounting splits each cycle into what is still held
// (open P/L) and what was sold (realized P/L, the "Kapalı" total); the
// "bedava hisse" target (★ / Exit Qty) looks at the cycle's whole cash flow.
const QTY_EPSILON = 1e-8;


// movements, already in processing order:
//   { type: "buy", date, qty, amount, ref }   amount = total paid
//   { type: "sell", date, qty, amount, ref }  amount = total received
//   { type: "scale", date, targetQty?, factor?, extraCost? }  split / bonus shares
function fifoPortions(movements) {
  const lots = [];
  const portions = [];
  for (const movement of movements) {
    if (movement.type === "buy") {
      if (movement.qty > QTY_EPSILON) lots.push({ buyDate: movement.date, buyRef: movement.ref, qty: movement.qty, cost: movement.amount });
      continue;
    }
    if (movement.type === "scale") {
      const openQty = lots.reduce((total, lot) => total + lot.qty, 0);
      if (!(openQty > QTY_EPSILON)) continue;
      const factor = movement.targetQty > 0 ? movement.targetQty / openQty : movement.factor;
      if (!(factor > 0)) continue;
      for (const lot of lots) {
        const share = lot.qty / openQty;
        lot.qty *= factor;
        lot.cost += (movement.extraCost || 0) * share;
      }
      continue;
    }
    let remaining = movement.qty;
    while (remaining > QTY_EPSILON && lots.length) {
      const lot = lots[0];
      const take = Math.min(lot.qty, remaining);
      const costPart = lot.cost * (take / lot.qty);
      portions.push({
        buyDate: lot.buyDate, buyRef: lot.buyRef, qty: take, cost: costPart,
        sellDate: movement.date, sellRef: movement.ref, proceeds: movement.amount * (take / movement.qty),
      });
      lot.qty -= take;
      lot.cost -= costPart;
      remaining -= take;
      if (lot.qty <= QTY_EPSILON) lots.shift();
    }
  }
  for (const lot of lots) {
    if (lot.qty > QTY_EPSILON) portions.push({ buyDate: lot.buyDate, buyRef: lot.buyRef, qty: lot.qty, cost: lot.cost });
  }
  return portions;
}


// Holding periods: walk buys (+) and sells (−) in date order; each time the
// quantity returns to zero the period closes. On a shared date, sells of
// earlier lots go first. A buy within rebuyMonths of the close (e.g. a
// tax-loss sell and rebuy) continues the same period instead of a new row.
function splitIntoCycles(portions, rebuyMonths = rebuyMergeMonths()) {
  const events = [];
  portions.forEach((portion, index) => {
    events.push({ date: portion.buyDate, delta: portion.qty, index, order: 1 });
    if (portion.sellDate) events.push({ date: portion.sellDate, delta: -portion.qty, index, order: portion.sellDate === portion.buyDate ? 2 : 0 });
  });
  events.sort((left, right) => left.date.localeCompare(right.date) || left.order - right.order);
  const cycleOf = new Map();
  let running = 0;
  let cycle = 0;
  let started = false;
  let closedOn = "";
  for (const event of events) {
    running += event.delta;
    if (event.delta > 0) {
      if (!started && closedOn && rebuyMonths > 0 && event.date <= addIsoMonths(closedOn, rebuyMonths)) cycle -= 1;
      cycleOf.set(event.index, cycle);
      started = true;
    } else if (started && running <= QTY_EPSILON) {
      running = 0;
      cycle += 1;
      started = false;
      closedOn = event.date;
    }
  }
  const cycles = [];
  portions.forEach((portion, index) => {
    const id = cycleOf.get(index) ?? 0;
    (cycles[id] ||= []).push(portion);
  });
  return cycles.filter((items) => items?.length);
}


// Figures for one holding period. FIFO gives the tax basis (Unit Cost, tax on
// each sale, unrealized tax). P/L follows the period's cash: sales first pay
// back the money put in (real: after tax, plus deposit interest; simple:
// plain amounts), the rest is realized profit ("Kapalı"). The shares still
// held carry whatever net cost is left, which may be zero or negative.
function computePositionCycle(portions, { price, taxRate, curve, sellFee = 0, wholeShares = true }) {
  const depositValue = (portion, endDate) => portion.cost + accrueRolledDeposit(portion.cost, portion.buyDate, endDate, curve);
  const openPortions = portions.filter((portion) => !portion.sellDate);
  const openQty = openPortions.reduce((total, portion) => total + portion.qty, 0);
  const isOpen = openQty > QTY_EPSILON;
  const openCost = round2(openPortions.reduce((total, portion) => total + portion.cost, 0));
  const value = isOpen && price != null ? round2(price * openQty) : null;
  const fee = isOpen ? sellFee : 0;
  const unrealizedTax = value != null ? Math.max(value - openCost, 0) * taxRate : 0;

  const sales = new Map();
  for (const portion of portions.filter((item) => item.sellDate)) {
    const key = `${portion.sellRef}`;
    const sale = sales.get(key) || { ref: portion.sellRef, date: portion.sellDate, qty: 0, cost: 0, proceeds: 0, deposit: 0, matches: [] };
    sale.qty += portion.qty;
    sale.cost += portion.cost;
    sale.proceeds += portion.proceeds;
    sale.deposit += depositValue(portion, portion.sellDate);
    sale.matches.push({ buyDate: portion.buyDate, qty: portion.qty });
    sales.set(key, sale);
  }
  let realizedCost = 0;
  let proceeds = 0;
  let soldQty = 0;
  const flows = [];
  // Per-sale FIFO figures: the tax view, shown next to each sale in the editor.
  for (const sale of sales.values()) {
    sale.tax = Math.max(sale.proceeds - sale.cost, 0) * taxRate;
    sale.real = round2(sale.proceeds - sale.tax - sale.deposit);
    sale.simple = round2(sale.proceeds - sale.cost);
    realizedCost += sale.cost;
    proceeds += sale.proceeds;
    soldQty += sale.qty;
    flows.push({ date: sale.date, amount: -(sale.proceeds - sale.tax) });
  }
  // Per-portion realized figure (TR lists its rows one by one).
  for (const portion of portions) {
    if (!portion.sellDate) continue;
    const sale = sales.get(`${portion.sellRef}`);
    const share = sale && sale.proceeds > 0 ? portion.proceeds / sale.proceeds : 0;
    portion.real = round2(portion.proceeds - sale.tax * share - depositValue(portion, portion.sellDate));
  }

  const buys = new Map();
  for (const portion of portions) {
    const key = `${portion.buyRef}`;
    const buy = buys.get(key) || { ref: portion.buyRef, date: portion.buyDate, qty: 0, cost: 0, remaining: 0 };
    buy.qty += portion.qty;
    buy.cost += portion.cost;
    if (!portion.sellDate) buy.remaining += portion.qty;
    buys.set(key, buy);
  }
  for (const buy of buys.values()) flows.push({ date: buy.date, amount: buy.cost });

  const firstBuyDate = [...buys.values()].map((buy) => buy.date).sort()[0] || "";
  const lastSellDate = [...sales.values()].map((sale) => sale.date).sort().pop() || "";
  const buyTotal = round2([...buys.values()].reduce((total, buy) => total + buy.cost, 0));
  // Net cost still in the position: real (deposit balance) and simple.
  const balance = depositShadowBalance(flows, isOpen ? TODAY_ISO : lastSellDate, curve);
  const simpleNet = round2(buyTotal - proceeds);
  const openReal = value != null ? round2(value - unrealizedTax - fee - Math.max(balance, 0)) : null;
  const openSimple = value != null ? round2(value - Math.max(simpleNet, 0)) : null;
  // Realized: an open period only the excess over its cost, a closed one all.
  const realizedReal = isOpen ? Math.max(-balance, 0) : -balance;
  const realizedSimple = isOpen ? Math.max(-simpleNet, 0) : -simpleNet;
  const basisPerShare = isOpen ? openCost / openQty : 0;
  return {
    isOpen, openQty, openCost, value, openReal, openSimple, buyTotal,
    taxableGain: value != null ? round2(value - openCost) : null,
    realizedReal: round2(realizedReal), realizedSimple: round2(realizedSimple), realizedCost: round2(realizedCost),
    proceeds: round2(proceeds), soldQty,
    balance,
    exitQuantity: isOpen && price != null ? positionExitQuantity(balance, openQty, price, basisPerShare, taxRate, fee, wholeShares) : null,
    firstBuyDate, lastSellDate,
    buys, sales, portions,
  };
}


// The row object the three tabs render (open or closed holding period).
function positionDisplayLot(symbol, position, price, extra = {}) {
  const common = {
    symbol,
    date: position.firstBuyDate,
    buyCount: position.buys.size,
    realizedProfit: position.realizedReal,
    realizedSimple: position.realizedSimple,
    // Kapalı box base: only a closed period's money; an open one's excess
    // counts as profit while its cost stays in the Açık box.
    closedCost: position.isOpen ? 0 : position.buyTotal,
    proceeds: position.proceeds,
    soldShares: position.soldQty,
    depositBalance: position.balance,
    position,
    ...extra,
  };
  if (position.isOpen) {
    return {
      ...common,
      exitDate: "",
      remainingShares: position.openQty,
      originalShares: position.openQty,
      averageCost: round2(position.openCost / position.openQty),
      referencePrice: price,
      // Current/Exit top line: real net cost still in (≤ 0 once recouped).
      remainingCost: position.balance,
      boughtCost: position.buyTotal,
      totalProfit: position.openReal,
      naiveProfit: position.openSimple,
      taxableGain: position.taxableGain,
      breakEvenShares: position.exitQuantity,
      // ★ when the whole period's money (plus deposit interest) is back.
      rowState: extra.splitPending ? "row-split-pending" : classifyRowState(position.balance <= 0 ? 0 : position.buyTotal, position.openReal),
    };
  }
  return {
    ...common,
    exitDate: position.lastSellDate,
    remainingShares: 0,
    originalShares: position.soldQty,
    averageCost: position.soldQty > 0 ? round2(position.buyTotal / position.soldQty) : 0,
    referencePrice: position.soldQty > 0 ? position.proceeds / position.soldQty : null,
    remainingCost: 0,
    boughtCost: position.buyTotal,
    totalProfit: position.realizedReal,
    naiveProfit: position.realizedSimple,
    breakEvenShares: null,
    rowState: classifyRowState(position.buyTotal, position.realizedReal),
  };
}


function sortPositionLots(lots) {
  return lots.sort((left, right) => parseDate(right.date) - parseDate(left.date));
}


// Movement processing order for ABD/crypto: by date, sells before buys on the
// same day (sell-then-rebuy), then entry order.
function compareMovementRows(dateOf, qtyOf) {
  return (left, right) => parseDate(dateOf(left.row)) - parseDate(dateOf(right.row))
    || (qtyOf(left.row) < 0 ? 0 : 1) - (qtyOf(right.row) < 0 ? 0 : 1)
    || left.index - right.index;
}


export function buildAbdPositionLots(rows, taxRate, pricesBySymbol) {
  const curve = state.cashFlowYields?.usd?.points || [];
  const bySymbol = new Map();
  rows.forEach((row, index) => {
    const symbol = normalizeMarketSymbol(row.symbol);
    if (!symbol) return;
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
    bySymbol.get(symbol).push({ row: { ...row, symbol }, index });
  });
  const openLots = [];
  const closedLots = [];
  for (const [symbol, items] of bySymbol.entries()) {
    const sorted = [...items].sort(compareMovementRows((row) => row.date, (row) => Number(row.pcs) || 0));
    const buyItems = sorted.filter((item) => Number(item.row.pcs) > 0);
    if (!buyItems.length) continue;
    const firstBuy = buyItems[0].row;
    const sortedRows = sorted.map((item) => item.row);
    const splitEvent = firstRelevantAbdSplitEvent(symbol, sortedRows, firstBuy.date);
    const splitInputRow = buyItems.map((item) => item.row).find((row) => nullableClientNumber(row.splitShares) > 0) || firstBuy;
    const splitDate = isoDay(splitInputRow.splitDate || splitEvent?.date || "");
    const splitFactor = nullableClientNumber(splitInputRow.splitFactor) || splitEvent?.factor || getSplitFactor(symbol, firstBuy.date);
    const splitShares = nullableClientNumber(splitInputRow.splitShares);
    const splitExtraCost = nullableClientNumber(splitInputRow.splitTotal) ?? 0;
    const hasSplitQuantity = splitShares != null && splitShares > 0;
    const splitPending = Boolean(splitEvent || splitDate) && splitFactor > 1 && !(hasSplitQuantity && abdSplitApproved(splitInputRow));
    const dividendShares = nullableClientNumber(buyItems.map((item) => item.row).find((row) => nullableClientNumber(row.dividendQuantity) != null)?.dividendQuantity);
    const sellFee = Math.max(1.5, ...sorted.map((item) => Math.abs(Number(item.row.fee) || 0)));

    const movements = [];
    let splitInserted = !(splitDate && (hasSplitQuantity || splitFactor > 1));
    for (const { row, index } of sorted) {
      const date = isoDay(row.date);
      if (!splitInserted && date >= splitDate) {
        movements.push({ type: "scale", date: splitDate, targetQty: hasSplitQuantity ? splitShares : null, factor: splitFactor, extraCost: splitExtraCost });
        splitInserted = true;
      }
      const qty = Math.abs(Number(row.pcs) || 0);
      const amount = Math.abs(Number(row.total) || Number(row.amount) || 0);
      movements.push({ type: Number(row.pcs) > 0 ? "buy" : "sell", date, qty, amount, ref: index });
    }
    if (!splitInserted && splitDate <= TODAY_ISO) {
      movements.push({ type: "scale", date: splitDate, targetQty: hasSplitQuantity ? splitShares : null, factor: splitFactor, extraCost: splitExtraCost });
    }
    if (dividendShares > 0) movements.push({ type: "scale", date: TODAY_ISO, targetQty: dividendShares, extraCost: 0 });

    const price = pricesBySymbol.get(symbol) ?? null;
    for (const cycle of splitIntoCycles(fifoPortions(movements))) {
      const position = computePositionCycle(cycle, { price, taxRate, curve, sellFee, wholeShares: true });
      const txIndices = [...new Set(cycle.flatMap((portion) => [portion.buyRef, portion.sellRef]).filter((ref) => ref != null))];
      const firstBuyRef = [...position.buys.values()].sort((left, right) => left.date.localeCompare(right.date) || left.ref - right.ref)[0]?.ref;
      const sourceRow = rows[firstBuyRef] || {};
      const lot = positionDisplayLot(symbol, position, price, {
        sourceIndex: firstBuyRef,
        sourceTotal: Math.abs(Number(sourceRow.total) || 0),
        txIndices,
        chainId: sourceRow.chainId || `${symbol}::chain`,
        splitPending: position.isOpen && splitPending,
        splitFactor,
        splitDate,
        dividendQuantity: dividendShares,
      });
      (position.isOpen ? openLots : closedLots).push(lot);
    }
  }
  return { openLots: sortPositionLots(openLots), closedLots: sortPositionLots(closedLots) };
}


export function buildCryptoPositionLots(rows, pricesBySymbol) {
  const curve = state.cashFlowYields?.usd?.points || [];
  const taxRate = taxRateDecimal("crypto");
  const bySymbol = new Map();
  rows.forEach((raw, index) => {
    const row = normalizeCryptoRow(raw, index);
    if (!row.symbol) return;
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
    bySymbol.get(row.symbol).push({ row, index });
  });
  const openLots = [];
  const closedLots = [];
  for (const [symbol, items] of bySymbol.entries()) {
    const sorted = [...items].sort(compareMovementRows((row) => row.date, (row) => Number(row.quantity) || 0));
    const movements = sorted
      .filter(({ row }) => Number(row.quantity))
      .map(({ row, index }) => ({
        type: Number(row.quantity) > 0 ? "buy" : "sell",
        date: isoDay(row.date),
        qty: Math.abs(Number(row.quantity)),
        amount: Math.abs(Number(row.total) || 0),
        ref: index,
      }));
    const price = pricesBySymbol.get(symbol) ?? null;
    for (const cycle of splitIntoCycles(fifoPortions(movements))) {
      const position = computePositionCycle(cycle, { price, taxRate, curve, sellFee: 0, wholeShares: false });
      const txIndices = [...new Set(cycle.flatMap((portion) => [portion.buyRef, portion.sellRef]).filter((ref) => ref != null))];
      const firstBuyRef = [...position.buys.values()].sort((left, right) => left.date.localeCompare(right.date) || left.ref - right.ref)[0]?.ref;
      const lot = positionDisplayLot(symbol, position, price, {
        sourceIndex: firstBuyRef,
        sourceTotal: Math.abs(Number(rows[firstBuyRef]?.total) || 0),
        txIndices,
      });
      (position.isOpen ? openLots : closedLots).push(lot);
    }
  }
  return { openLots: sortPositionLots(openLots), closedLots: sortPositionLots(closedLots) };
}


// TR rows are already FIFO portions (a sale splits the rows it consumes), so
// they feed the engine directly. Buys are counted by date + unit cost, so a
// buy that a partial sale cut into two rows still counts once.
export function buildTrPositionLots(rows) {
  const curve = state.cashFlowYields?.try?.points || [];
  const taxRate = taxRateDecimal("tr");
  const bySymbol = new Map();
  for (const row of rows) {
    const symbol = normalizeTrSymbol(row.symbol);
    const cost = trEffectiveBuyTotal(row);
    const qty = trDisplayQuantity(row);
    if (!symbol || cost == null || !(qty > 0) || !row.buyDate) continue;
    const buyDate = isoDay(row.buyDate);
    const unit = round4(cost / qty);
    const portion = { buyDate, buyRef: `${buyDate}|${unit}`, qty, cost, rowId: row.id };
    if (!trIsOpen(row)) {
      const sellTotal = Math.abs(Number(row.sellTotal) || 0);
      portion.sellDate = isoDay(row.sellDate);
      portion.sellRef = `${portion.sellDate}|${round4(sellTotal / qty)}`;
      portion.proceeds = sellTotal;
    }
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
    bySymbol.get(symbol).push({ portion, row });
  }
  const openLots = [];
  const closedLots = [];
  for (const [symbol, items] of bySymbol.entries()) {
    const price = trLatestPrice(symbol);
    const rowsById = new Map(items.map(({ row }) => [row.id, row]));
    for (const cycle of splitIntoCycles(items.map(({ portion }) => portion))) {
      const position = computePositionCycle(cycle, { price, taxRate, curve, sellFee: 0, wholeShares: true });
      const rowIds = cycle.map((portion) => portion.rowId);
      const ordered = [...cycle].sort((left, right) => left.buyDate.localeCompare(right.buyDate));
      const source = ordered.find((portion) => !portion.sellDate) || ordered[0];
      const lot = positionDisplayLot(symbol, position, price, {
        sourceId: source.rowId,
        rowIds,
        splitPending: position.isOpen && rowIds.some((id) => trIsOpen(rowsById.get(id)) && trNeedsSplitInput(rowsById.get(id))),
      });
      (position.isOpen ? openLots : closedLots).push(lot);
    }
  }
  return { openLots: sortPositionLots(openLots), closedLots: sortPositionLots(closedLots) };
}


// ---- Rendering shared by the three tabs ----
const POSITION_VIEWS = {
  abd: {
    grid: "row-grid",
    article: "",
    attr: (lot) => `data-edit-index="${lot.sourceIndex}"`,
    qty: (value) => formatNumber(value, 0),
    candles: (symbol, key) => renderCandlesCell(symbol, key),
  },
  tr: {
    grid: "tr-grid",
    article: "tr-row",
    attr: (lot) => `data-tr-edit="${escapeAttr(lot.sourceId)}"`,
    qty: (value) => formatAmountHtml(value, 2),
    candles: (symbol, key) => renderTrCandlesCell(symbol, key),
  },
  crypto: {
    grid: "row-grid",
    article: "",
    attr: (lot) => `data-crypto-edit="${lot.sourceIndex}"`,
    qty: (value) => formatSmartNumber(value),
    candles: (symbol, key) => renderCryptoCandlesCell(symbol, key),
  },
};


export function renderPositionRow(lot, market) {
  const view = POSITION_VIEWS[market];
  const open = lot.remainingShares > 0;
  const qty = open ? lot.remainingShares : lot.soldShares;
  const value = open ? (lot.referencePrice != null ? round2(lot.referencePrice * qty) : null) : lot.proceeds;
  const cost = open ? lot.remainingCost : lot.boughtCost;
  // Recouped (★): no cost left, so real and simple P/L are the same single
  // figure: what selling today would bring in after tax and fee.
  const recouped = open && lot.depositBalance <= 0;
  const badge = lot.buyCount > 1 ? `<span class="merged-lot-badge">${lot.buyCount} alım</span>` : "";
  const pending = lot.splitPending ? `<span class="split-needed">Corporate action info needed</span>` : "";
  return `
    <article class="position-row ${view.article} ${open ? "" : "closed-row"} ${lot.rowState}" ${view.attr(lot)}>
      <div class="${view.grid}">
        <div class="cell-strong">${escapeHtml(lot.symbol)}${badge}${pending}</div>
        <div class="cell-center">${open ? formatDate(lot.date) : renderDateWithExitCell(lot.date, lot.exitDate)}</div>
        <div class="cell-center">${renderDurationCell(lot.date, open ? "" : lot.exitDate)}</div>
        <div class="number-cell">${view.qty(qty)}</div>
        ${stackedCell(plainAmount(lot.averageCost), lot.referencePrice != null ? plainAmount(lot.referencePrice) : "No price")}
        ${stackedCell(plainAmount(cost), value != null ? plainAmount(value) : "No price")}
        ${renderProfitCell(lot.totalProfit, lot.naiveProfit, lot.boughtCost, { single: recouped })}
        <div class="cell-center">${open ? renderBreakEvenCell(lot) : ""}</div>
        <div class="cell-center">${open ? view.candles(lot.symbol, "m12") : ""}</div>
        <div class="cell-center">${open ? view.candles(lot.symbol, "d14") : ""}</div>
      </div>
    </article>
  `;
}


// Info shown next to a movement inside an editor: what is left of a buy, or
// which buys a sale consumed (FIFO) and what it realized.
export function positionMovementInfo(lot, ref, isSell) {
  const position = lot?.position;
  if (!position) return "";
  if (!isSell) {
    const buy = position.buys.get(`${ref}`);
    return buy ? `<span class="movement-info">kalan ${formatSmartNumber(buy.remaining)}</span>` : "";
  }
  const sale = position.sales.get(`${ref}`);
  if (!sale) return "";
  const matches = sale.matches.map((match) => `${formatSmartNumber(match.qty)} ← ${formatDate(match.buyDate)}`).join(", ");
  return `<span class="movement-info">${matches} · <span class="${profitClassName(sale.real)}">${profitAmountText(sale.real)}${profitPercentHtml(sale.real, sale.cost)}</span></span>`;
}


// Open/closed summary boxes shared by the three tabs.
// Rows tax each position on its own gain. The summary boxes net losses
// against gains instead: "Açık" across all open positions (as if all were
// sold today), "Kapalı" within each calendar year of the sales. The tax this
// saves is added back to the box's real P/L; the rows stay unchanged.
export function renderPositionSummary(targets, lots, unit, chartHtml = "", taxRate = 0) {
  const openLots = lots.filter((lot) => lot.remainingShares > 0);
  const open = openLots.map((lot) => ({ profit: lot.totalProfit, simple: lot.naiveProfit, cost: lot.boughtCost }));
  const closed = lots.map((lot) => ({ profit: lot.realizedProfit, simple: lot.realizedSimple, cost: lot.closedCost }))
    .filter((item) => item.cost > 0 || item.profit || item.simple);
  const pricedGains = openLots.filter((lot) => lot.totalProfit != null).map((lot) => lot.taxableGain || 0);
  const saleGainsByYear = new Map();
  for (const lot of lots) {
    for (const sale of lot.position?.sales?.values() || []) {
      const year = String(sale.date || "").slice(0, 4);
      if (!saleGainsByYear.has(year)) saleGainsByYear.set(year, []);
      saleGainsByYear.get(year).push(sale.simple);
    }
  }
  const closedOffset = [...saleGainsByYear.values()].reduce((total, gains) => total + taxNettingOffset(gains, taxRate), 0);
  renderSummaryCard({ profit: targets.profit, percent: targets.percent, chart: targets.chart }, open, unit, chartHtml, taxNettingOffset(pricedGains, taxRate));
  renderSummaryCard({ profit: targets.closedProfit, percent: targets.closedPercent }, closed, unit, "", closedOffset);
}


// Tax saved by netting: each gain taxed alone minus the tax on the net gain.
function taxNettingOffset(gains, taxRate) {
  if (!(taxRate > 0) || !gains.length) return 0;
  const separate = gains.reduce((total, gain) => total + Math.max(gain, 0), 0) * taxRate;
  const netted = Math.max(gains.reduce((total, gain) => total + gain, 0), 0) * taxRate;
  return round2(separate - netted);
}


export function renderPortfolioSummary() {
  renderPositionSummary(
    { profit: elements.portfolioProfit, percent: elements.portfolioProfitPercent, closedProfit: elements.portfolioClosedProfit, closedPercent: elements.portfolioClosedProfitPercent, chart: elements.portfolioChartWrap },
    [...state.openLots, ...state.closedLots],
    "$",
    renderPortfolioCandles(),
    taxRateDecimal("usa")
  );
}


// One summary box: real P/L on the first line, simple P/L on the second, each
// with its % of the cost of the positions counted (priced ones only).
function renderSummaryCard(targets, positions, unit, chartHtml = "", realAdjustment = 0) {
  if (!targets.profit) return;
  const priced = positions.filter((item) => item.profit != null && Number.isFinite(item.profit));
  const totalProfit = round2(priced.reduce((sum, item) => sum + item.profit, 0) + realAdjustment);
  const totalSimple = round2(priced.reduce((sum, item) => sum + (Number(item.simple) || 0), 0));
  const totalCost = round2(priced.reduce((sum, item) => sum + Math.max(item.cost || 0, 0), 0));
  const line = (value) => `${profitAmountText(value)} ${unit}<span class="summary-pct">${profitPercentText(value, totalCost) || "0,0%"}</span>`;
  targets.profit.innerHTML = line(totalProfit);
  targets.profit.className = `summary-profit ${profitClassName(totalProfit)}`;
  targets.percent.innerHTML = line(totalSimple);
  targets.percent.className = `summary-profit-percent ${profitClassName(totalSimple)}`;
  if (targets.chart) targets.chart.innerHTML = chartHtml;
}


function classifyRowState(remainingCost, totalProfit) {
  if (remainingCost <= 0) return "row-star";
  if (totalProfit == null) return "";
  const ratio = remainingCost > 0 ? Math.abs(totalProfit) / remainingCost : 0;
  const tone = ratio < 0.1 ? 1 : ratio < 0.3 ? 2 : 3;
  return totalProfit >= 0 ? `row-profit-${tone}` : `row-loss-${tone}`;
}


export function profitClassName(totalProfit) {
  if (totalProfit == null) return "";
  if (totalProfit > 0) return "value-positive";
  if (totalProfit < 0) return "value-negative";
  return "";
}


export function renderBreakEvenCell(lot) {
  if (lot.breakEvenShares == null) return "";
  const percent = lot.remainingShares > 0 ? Math.round((lot.breakEvenShares / lot.remainingShares) * 100) : null;
  const shares = Number.isInteger(lot.breakEvenShares) ? formatNumber(lot.breakEvenShares, 0) : formatSmartNumber(lot.breakEvenShares);
  return `
    <div class="break-even-cell">
      <span class="break-even-shares">${shares}</span>
      ${percent != null ? `<span class="break-even-percent">%${percent}</span>` : ""}
    </div>
  `;
}


function calculateBreakEvenShares(remainingShares, remainingCost, sellFeeEstimate, netSellPrice) {
  const requiredShares = Math.ceil((remainingCost + sellFeeEstimate) / netSellPrice);
  if (!Number.isFinite(requiredShares) || requiredShares >= remainingShares) return null;
  return requiredShares;
}


function calculateTotalProfit(remainingShares, referencePrice, remainingCost, lotPrice, sellFeeEstimate, taxRate) {
  const currentValue = round2(remainingShares * referencePrice);
  const taxableGain = Math.max(currentValue - Math.max(remainingCost, 0), 0);
  const estimatedTax = round2(taxableGain * taxRate);
  const estimatedFee = Number.isFinite(sellFeeEstimate) ? sellFeeEstimate : 0;
  return round2(currentValue - Math.max(remainingCost, 0) - estimatedTax - estimatedFee);
}

