import { TODAY_ISO, elements, state } from "./state.js";
import { addIsoDays, nextWeekdayDate, normalizeMarketSymbol, nullableClientNumber, maxDate, minDate, toIsoDate, chunk, parseDate, formatDate, round2, round4 } from "./util.js";
import { apiFetch } from "./api.js";
import { saveQuarterCalculatedCache } from "./settings.js";
import { cashFlowAccrueWithCurve } from "./interest.js";
import { abdGroupKey, getSplitFactor, firstRelevantAbdSplitEvent } from "./abd.js";
import { normalizeTrRow, toYahooTrSymbol, trIsImportedUnknownQuantity, getTrSplitFactor, relevantTrSplitEvent } from "./tr.js";
import { normalizeCryptoRow } from "./crypto.js";
import { renderCashFlow, renderStatus, cashFlowAllMovements, cashFlowCurrentPortfolioUsd, cashFlowCurrentTryPortfolioTry, cashFlowYearsInData, cashFlowDiffDays, isUsdLikeCurrency, cashFlowDecimal2 } from "./cashflow.js";
import { renderYearsQuarterCash, renderQuarterPlus, getQuarterPlusRows, getYearsQuarterCashRows, yearsQuarterStartDate, cryptoHistorySymbol, cryptoRefreshErrorsForSymbols, cryptoHistoryMissingForQuarterDates, yearsQuarterDates } from "./quarter.js";
import { auditYearRowsWithData } from "./audit.js";
import { niceTicks, performanceDateTicks, formatMonthYear, formatCurrencyShort } from "./charts.js";

async function loadPerformanceChart({ force = false } = {}) {
  if (state.performance.loading || (state.performance.loaded && !force)) return;
  state.performance.loading = true;
  if (force) state.performance.loaded = false;
  renderPerformanceChart();

  const initialFlows = performanceCashFlows();
  if (!initialFlows.length) {
    state.performance = { loading: false, loaded: true, messages: ["Performance chart needs cash flow movements."], series: [] };
    renderStatus();
    return;
  }

  const startDate = initialFlows[0].date;
  const dates = performanceTimeline(startDate);
  const trSymbols = [...new Set(state.trRows.map((row) => toYahooTrSymbol(row.symbol)).filter(Boolean))];
  const usdSymbols = [...new Set(state.transactions.map((row) => normalizeMarketSymbol(row.symbol)).filter(Boolean))];
  const benchmarkSymbols = ["GC=F", "^XU100", "XU100.IS", "^IXIC", "BTC-USD"];
  const symbols = [...new Set([...benchmarkSymbols, ...usdSymbols, ...trSymbols])];
  const [history, monthlyRates] = await Promise.all([
    fetchPerformanceHistory(symbols, startDate),
    fetchPerformanceRates([...new Set([...dates, ...initialFlows.map((flow) => flow.date)])]),
  ]);
  const flows = performanceCashFlows(monthlyRates);

  const warnings = [];
  const gold = buildAssetPerformanceSeries("Gold", "#c79219", history["GC=F"], flows, dates);
  const bistHistory = history["XU100.IS"] || history["^XU100"];
  const bist = buildAssetPerformanceSeries("BIST 100", "#00bcd4", bistHistory, flows, dates, monthlyRates);
  const nasdaq = buildAssetPerformanceSeries("Nasdaq", "#d7263d", history["^IXIC"], flows, dates);
  const btc = buildAssetPerformanceSeries("BTC", "#8bdc65", history["BTC-USD"], flows, dates);
  const deposit = buildTryDepositPerformanceSeries(flows, dates, monthlyRates);
  const portfolio = buildPortfolioPerformanceSeries(history, flows, dates, monthlyRates);

  for (const item of [gold, bist, nasdaq, btc, deposit, portfolio]) {
    if (!item.points.length) warnings.push(`${item.name} performance series could not be calculated.`);
  }

  state.performance = {
    loading: false,
    loaded: true,
    messages: warnings,
    series: [gold, bist, deposit, nasdaq, btc, portfolio].filter((item) => item.points.length),
    history,
    rates: monthlyRates,
  };
  if (state.activeView === "cashflow") renderCashFlow();
  renderStatus();
}


function renderPerformanceChart() {
  if (!elements.statusPerformanceChart) return;
  if (state.performance.loading) {
    if (elements.statusChartSummary) elements.statusChartSummary.textContent = "Loading";
    elements.statusPerformanceChart.innerHTML = `<div class="empty-card">Loading performance chart.</div>`;
    return;
  }
  if (!state.performance.series.length) {
    if (elements.statusChartSummary) elements.statusChartSummary.textContent = "No data";
    elements.statusPerformanceChart.innerHTML = `<div class="empty-card">No performance data yet.</div>`;
    return;
  }

  const width = 920;
  const height = 520;
  const pad = { left: 58, right: 8, top: 8, bottom: 26 };
  const points = state.performance.series.flatMap((serie) => serie.points);
  const minDate = Math.min(...points.map((point) => parseDate(point.date)));
  const maxDate = Math.max(...points.map((point) => parseDate(point.date)));
  const values = points.map((point) => point.value).filter(Number.isFinite);
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 0);
  const padding = Math.max((rawMax - rawMin) * 0.08, 50);
  const minValue = rawMin - padding;
  const maxValue = rawMax + padding;
  const x = (date) => {
    const time = parseDate(date);
    const ratio = maxDate === minDate ? 0 : (time - minDate) / (maxDate - minDate);
    return pad.left + ratio * (width - pad.left - pad.right);
  };
  const y = (value) => {
    const ratio = (value - minValue) / (maxValue - minValue || 1);
    return height - pad.bottom - ratio * (height - pad.top - pad.bottom);
  };
  const zeroY = y(0);
  const gridValues = niceTicks(minValue, maxValue, 5);
  const paths = state.performance.series.map((serie) => {
    const d = serie.points.map((point, index) => `${index ? "L" : "M"} ${round2(x(point.date))} ${round2(y(point.value))}`).join(" ");
    return `<path d="${d}" fill="none" stroke="${serie.color}" stroke-width="${serie.name === "Portfolio" ? 3.2 : 2.2}" ${serie.dash ? `stroke-dasharray="${serie.dash}"` : ""} stroke-linecap="round" stroke-linejoin="round" />`;
  }).join("");
  const grid = gridValues.map((value) => `
    <line class="${value === 0 ? "performance-zero-line" : "performance-grid-line"}" x1="${pad.left}" y1="${round2(y(value))}" x2="${width - pad.right}" y2="${round2(y(value))}" />
    <text class="performance-axis-label" x="12" y="${round2(y(value) + 4)}">${formatCurrencyShort(value)}</text>
  `).join("");
  const startLabel = formatDate(toIsoDate(minDate));
  const endLabel = formatDate(toIsoDate(maxDate));
  const xTicks = performanceDateTicks(minDate, maxDate, 7).map((date) => `
    <text class="performance-axis-label" x="${round2(x(date))}" y="${height - 8}" text-anchor="middle">${formatMonthYear(date)}</text>
  `).join("");
  const legend = state.performance.series.map((serie) => `<span><i style="background:${serie.color}"></i>${serie.name}</span>`).join("");

  if (elements.statusChartSummary) elements.statusChartSummary.textContent = `${startLabel} - ${endLabel}`;
  elements.statusPerformanceChart.innerHTML = `
    <svg class="performance-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Net profit and loss versus invested capital">
      ${grid}
      ${paths}
      ${xTicks}
    </svg>
    <div class="performance-legend">${legend}</div>
  `;
}


function performanceCashFlows(rates = state.cashFlowRates) {
  return state.cashFlowMovements
    .map((item) => {
      const date = item.date <= TODAY_ISO ? item.date : TODAY_ISO;
      const rate = item.currency === "TRY" ? performanceRateForDate(date, rates) : 1;
      const amount = item.currency === "TRY" ? (rate ? Number(item.amount) / rate : 0) : Number(item.amount);
      return { date, amount };
    })
    .filter((item) => item.date && Number.isFinite(item.amount) && item.amount !== 0)
    .sort((left, right) => left.date.localeCompare(right.date));
}


function performanceTimeline(startDate) {
  const dates = [];
  const cursor = new Date(`${startDate.slice(0, 7)}-01T12:00:00`);
  const end = new Date(`${TODAY_ISO.slice(0, 7)}-01T12:00:00`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (!dates.includes(TODAY_ISO)) dates.push(TODAY_ISO);
  return dates;
}


// Market history/candles barely change during the day, but the 5-minute
// auto-refresh used to re-read all of it from D1 every time — millions of
// rows a day against the free plan's quota. Cache-only reads reuse the last
// response for MARKET_CACHE_TTL_MS; an explicit refresh (fresh=1) still goes
// to the source.
const MARKET_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const marketFetchAt = new Map();


export function marketFetchIsFresh(key) {
  const at = marketFetchAt.get(key) || 0;
  return Date.now() - at < MARKET_CACHE_TTL_MS;
}


export function markMarketFetch(key) {
  marketFetchAt.set(key, Date.now());
}


const performanceHistoryCache = new Map();


async function fetchPerformanceHistory(symbols, startDate, options = {}) {
  const history = {};
  const errors = [];
  const cacheOnly = options.cacheOnly !== false;
  const cacheKey = `history:${startDate}:${[...symbols].sort().join(",")}`;
  if (cacheOnly && marketFetchIsFresh(cacheKey) && performanceHistoryCache.has(cacheKey)) {
    return performanceHistoryCache.get(cacheKey);
  }
  for (const batch of chunk(symbols, 12)) {
    const cacheParam = cacheOnly ? "cacheOnly=1&" : "";
    const backgroundParam = options.background ? "background=1&" : "";
    let payload = null;
    try {
      payload = await apiFetch(`/api/history?${cacheParam}${backgroundParam}symbols=${encodeURIComponent(batch.join(","))}&start=${encodeURIComponent(startDate)}`);
    } catch (error) {
      errors.push(`History request failed for ${batch.join(", ")}. ${error?.message || ""}`.trim());
      continue;
    }
    if (payload?.ok === false || payload?.error) {
      errors.push(payload.error || `History request failed for ${batch.join(", ")}.`);
      continue;
    }
    Object.assign(history, payload?.history || {});
    if (Array.isArray(payload?.errors)) errors.push(...payload.errors);
  }
  Object.defineProperty(history, "__errors", { value: errors, enumerable: false, configurable: true });
  if (cacheOnly && Object.keys(history).length) {
    performanceHistoryCache.set(cacheKey, history);
    markMarketFetch(cacheKey);
  }
  return history;
}


async function fetchPerformanceRates(dates) {
  const rates = { ...state.cashFlowRates };
  for (const batch of chunk(dates, 25)) {
    const payload = await apiFetch(`/api/rates?cacheOnly=1&dates=${encodeURIComponent(batch.join(","))}`);
    Object.assign(rates, payload?.rates || {});
  }
  const missingDates = [...new Set((dates || []).filter((date) => date && !performanceRateForDate(date, rates)))];
  for (const batch of chunk(missingDates, 25)) {
    const payload = await apiFetch(`/api/rates?dates=${encodeURIComponent(batch.join(","))}`);
    Object.assign(rates, payload?.rates || {});
  }
  return rates;
}


export function invalidateCashFlowReturns() {
  state.returnCalc = { loading: false, loaded: false, messages: [], history: {}, rates: {} };
  state.quarterCalc = { loading: false, loaded: false, messages: [], history: {}, rates: {} };
  state.quarterRowsCache = null;
  state.quarterPlusRowsCache = null;
  state.auditRowsCache = null;
  state.auditMessages = [];
}


export async function loadQuarterData({ force = false } = {}) {
  if (state.quarterCalc.loading || (state.quarterCalc.loaded && !force)) return;
  const dates = yearsQuarterDates(yearsQuarterStartDate(), TODAY_ISO);
  if (!dates.length) {
    state.quarterCalc = { loading: false, loaded: true, messages: ["Quarter needs cash flow movements."], history: {}, rates: {} };
    renderYearsQuarterCash();
    renderQuarterPlus();
    return;
  }

  state.quarterCalc = { ...state.quarterCalc, loading: true };
  renderYearsQuarterCash();
  renderQuarterPlus();

  const flowDates = cashFlowAllMovements().map((item) => item.date).filter(Boolean);
  const symbols = quarterDataSymbols();
  const cryptoSymbols = cryptoQuarterSymbols();
  const rateDates = [...new Set([TODAY_ISO, ...dates, ...flowDates, ...Object.keys(state.cashFlowRates || {})])].sort();
  try {
    const [history, rates] = await Promise.all([
      symbols.length ? fetchPerformanceHistory(symbols, dates[0]) : Promise.resolve({}),
      fetchPerformanceRates(rateDates),
    ]);
    const missingBenchmarks = quarterBenchmarkMissingSymbols(history, dates);
    const missingCrypto = cryptoSymbols.filter((symbol) => cryptoHistoryMissingForQuarterDates(symbol, history, dates));
    const refreshSymbols = [...new Set([...missingBenchmarks, ...missingCrypto])];
    if (refreshSymbols.length) queueQuarterHistoryRefresh(refreshSymbols, dates[0]);
    const messages = [
      ...quarterHistoryErrors(history),
    ];
    state.quarterCalc = {
      loading: false,
      loaded: true,
      messages: [...new Set(messages)],
      history,
      rates,
      source: "calculated",
    };
    state.quarterRowsCache = null;
    state.quarterPlusRowsCache = null;
    getYearsQuarterCashRows();
    getQuarterPlusRows();
    await saveQuarterCalculatedCache().catch(() => {});
  } catch (error) {
    state.quarterCalc = { loading: false, loaded: true, messages: [`Quarter data could not be loaded. ${error?.message || ""}`.trim()], history: {}, rates: {} };
    state.quarterRowsCache = null;
    state.quarterPlusRowsCache = null;
  }

  renderYearsQuarterCash();
  renderQuarterPlus();
  renderStatus();
}


function queueQuarterHistoryRefresh(symbols, startDate) {
  const refreshSymbols = [...new Set(symbols || [])].filter(Boolean).sort();
  if (!refreshSymbols.length) return;
  const key = `${startDate}:${refreshSymbols.join(",")}`;
  if (state.quarterCalc.refreshKey === key) return;
  state.quarterCalc.refreshKey = key;
  fetchPerformanceHistory(refreshSymbols, startDate, { cacheOnly: false, background: true })
    .then((refreshedHistory) => {
      const refreshMessages = [
        ...quarterHistoryErrors(refreshedHistory),
        ...cryptoRefreshErrorsForSymbols(refreshSymbols, refreshedHistory),
      ];
      if (refreshMessages.length) {
        state.quarterCalc.messages = [...new Set([...(state.quarterCalc.messages || []), ...refreshMessages])];
      }
      state.quarterCalc = { ...state.quarterCalc, loading: false };
      if (state.activeView === "cashflow") renderQuarterPlus();
      if (state.activeView === "quarterChart") renderYearsQuarterCash();
      renderStatus();
    })
    .catch((error) => {
      state.quarterCalc.messages = [...new Set([...(state.quarterCalc.messages || []), `Quarter background data refresh failed. ${error?.message || ""}`.trim()])];
      renderStatus();
    });
}


function quarterHistoryErrors(history) {
  const hasXU100 = Array.isArray(history?.["XU100.IS"]) && history["XU100.IS"].length;
  const hasCaretXU100 = Array.isArray(history?.["^XU100"]) && history["^XU100"].length;
  return (history.__errors || []).filter((message) => {
    const text = String(message || "");
    if (text.includes("^XU100")) return false;
    if (hasCaretXU100 && text.includes("XU100.IS")) return false;
    return true;
  });
}


function quarterBenchmarkMissingSymbols(history, dates) {
  const missing = [];
  if (quarterSymbolMissingForDates("GC=F", history, dates)) missing.push("GC=F");
  if (quarterSymbolMissingForDates("XU100.IS", history, dates)) missing.push("XU100.IS");
  if (quarterSymbolMissingForDates("^IXIC", history, dates)) missing.push("^IXIC");
  if (quarterSymbolMissingForDates("BTC-USD", history, dates)) missing.push("BTC-USD");
  return [...new Set(missing)];
}


function quarterAlternativeSymbolsMissingForDates(symbols, history, dates) {
  return dates.some((date) => !symbols.some((symbol) => {
    const prices = performancePriceMap(history[symbol]);
    return Boolean(performancePriceForDate(prices, date));
  }));
}


function quarterSymbolMissingForDates(symbol, history, dates) {
  const prices = performancePriceMap(history[symbol]);
  return dates.some((date) => !performancePriceForDate(prices, date));
}


function quarterDataSymbols() {
  const usdSymbols = state.transactions
    .map((row) => normalizeMarketSymbol(row.symbol))
    .filter(Boolean);
  const trSymbols = state.trRows
    .map((row) => toYahooTrSymbol(row.symbol))
    .filter(Boolean);
  const cryptoSymbols = cryptoQuarterSymbols();
  return [...new Set(["GC=F", "XU100.IS", "^IXIC", "BTC-USD", ...usdSymbols, ...trSymbols, ...cryptoSymbols])];
}


function cryptoQuarterSymbols() {
  return [...new Set(state.cryptoRows
    .map((row) => cryptoHistorySymbol(row.symbol))
    .filter(Boolean))];
}


async function loadCashFlowReturnData({ force = false } = {}) {
  if (state.returnCalc.loading || (state.returnCalc.loaded && !force)) return;
  const flows = performanceCashFlows();
  if (!flows.length) {
    state.returnCalc = { loading: false, loaded: true, messages: ["Yearly return needs cash flow movements."], history: {}, rates: {} };
    renderCashFlow();
    renderStatus();
    return;
  }

  state.returnCalc.loading = true;
  const startDate = cashFlowReturnStartDate(flows);
  const symbols = cashFlowReturnSymbols();
  const rateDates = cashFlowReturnRateDates(flows);

  try {
    const [history, rates] = await Promise.all([
      symbols.length ? fetchPerformanceHistory(symbols, startDate) : Promise.resolve({}),
      fetchPerformanceRates(rateDates),
    ]);
    const missing = symbols.filter((symbol) => !Array.isArray(history[symbol]) || !history[symbol].length);
    const messages = missing.length ? [`Yearly return is missing historical price data for ${missing.join(", ")}.`] : [];
    messages.push(...(history.__errors || []));
    messages.push(...auditCalculationMessages(history, rates));
    state.returnCalc = {
      loading: false,
      loaded: true,
      messages: [...new Set(messages)],
      history,
      rates,
    };
    state.auditRowsCache = null;
  } catch {
    state.returnCalc = { loading: false, loaded: true, messages: ["Yearly return data could not be loaded."], history: {}, rates: {} };
    state.auditRowsCache = null;
  }

  renderCashFlow();
  renderStatus();
  if (state.activeView === "quarterChart") renderYearsQuarterCash();
}


function cashFlowReturnStartDate(flows) {
  const candidates = [
    ...flows.map((flow) => flow.date),
    ...state.transactions.map((row) => row.date).filter(Boolean),
    ...state.trRows.map((row) => normalizeTrRow(row).buyDate).filter(Boolean),
  ].filter((date) => date && date <= TODAY_ISO);
  return candidates.length ? candidates.sort()[0] : TODAY_ISO;
}


function cashFlowReturnSymbols() {
  const usdSymbols = state.transactions
    .map((row) => normalizeMarketSymbol(row.symbol))
    .filter(Boolean);
  const trSymbols = state.trRows
    .map((row) => toYahooTrSymbol(row.symbol))
    .filter(Boolean);
  const benchmarkSymbols = ["GC=F", "^XU100", "XU100.IS", "^IXIC", "BTC-USD"];
  return [...new Set([...benchmarkSymbols, ...usdSymbols, ...trSymbols])];
}


function cashFlowReturnRateDates(flows) {
  const dates = new Set([TODAY_ISO, ...Object.keys(state.cashFlowRates || {}), ...flows.map((flow) => flow.date)]);
  for (const row of state.transactions) {
    if (row.date && row.date <= TODAY_ISO) dates.add(row.date);
    if (row.splitDate && row.splitDate <= TODAY_ISO) dates.add(row.splitDate);
  }
  for (const row of state.trRows.map(normalizeTrRow)) {
    if (row.buyDate && row.buyDate <= TODAY_ISO) dates.add(row.buyDate);
    if (row.sellDate && row.sellDate <= TODAY_ISO) dates.add(row.sellDate);
    if (row.splitDate && row.splitDate <= TODAY_ISO) dates.add(row.splitDate);
  }
  for (const year of cashFlowYearsInData(cashFlowAllMovements())) {
    dates.add(`${year}-01-01`);
    dates.add(year === TODAY_ISO.slice(0, 4) ? TODAY_ISO : `${year}-12-31`);
  }
  return [...dates].filter(Boolean).sort();
}


function auditCalculationMessages(history, rates) {
  const messages = [];
  const missingPriceCounts = new Map();
  for (const year of cashFlowYearsInData(cashFlowAllMovements())) {
    for (const row of auditYearRowsWithData(year, history, rates)) {
      for (const message of row.errors || []) {
        const match = String(message).match(/^(\d{4}-\d{2}-\d{2}):\s+(.+?)\s+historical price is missing\.$/);
        if (match) {
          const symbol = match[2];
          missingPriceCounts.set(symbol, (missingPriceCounts.get(symbol) || 0) + 1);
        } else {
          messages.push(message);
        }
      }
    }
  }
  for (const [symbol, count] of missingPriceCounts.entries()) {
    messages.push(`${symbol} historical price is missing for ${count} date${count === 1 ? "" : "s"} used by yearly return.`);
  }
  return [...new Set(messages)];
}


export function auditMessagesFromRows(rows) {
  const messages = [];
  const missingPriceCounts = new Map();
  for (const row of rows || []) {
    if (row.total) continue;
    if (Number.isFinite(row.returnPercent) && Math.abs(row.returnPercent) >= 25) {
      messages.push(`${formatDate(row.date)} yearly return check has an unusual move of %${cashFlowDecimal2(row.returnPercent)}. Review the Years math panel for that date.`);
    }
    for (const message of row.errors || []) {
      const match = String(message).match(/^(\d{4}-\d{2}-\d{2}):\s+(.+?)\s+historical price is missing\.$/);
      if (match) {
        const symbol = match[2];
        missingPriceCounts.set(symbol, (missingPriceCounts.get(symbol) || 0) + 1);
      } else {
        messages.push(message);
      }
    }
  }
  for (const [symbol, count] of missingPriceCounts.entries()) {
    messages.push(`${symbol} historical price is missing for ${count} date${count === 1 ? "" : "s"} used by yearly return.`);
  }
  return [...new Set(messages)];
}


function dedupeMessages(messages) {
  return [...new Set((messages || []).filter(Boolean))];
}


export function setMarketDataMessages(scope, messages) {
  state.marketDataMessageBuckets[scope] = summarizeMarketDataMessages(messages);
  state.marketDataMessages = dedupeMessages(Object.values(state.marketDataMessageBuckets).flat());
}


function summarizeMarketDataMessages(messages) {
  const result = [];
  let d1BusyCount = 0;
  for (const message of dedupeMessages(messages)) {
    if (/D1 DB is overloaded|Requests queued for too long/i.test(String(message))) {
      d1BusyCount += 1;
      continue;
    }
    result.push(message);
  }
  if (d1BusyCount) {
    result.unshift(`D1 is temporarily busy while reading market data (${d1BusyCount} request${d1BusyCount === 1 ? "" : "s"} affected).`);
  }
  return result;
}


function buildAssetPerformanceSeries(name, color, candles, flows, dates, rates = null) {
  const prices = performancePriceMap(candles, rates);
  if (!prices.size) return { name, color, points: [] };
  let units = 0;
  let invested = 0;
  let flowIndex = 0;
  const points = [];
  for (const date of dates) {
    let price = performancePriceForDate(prices, date);
    while (flowIndex < flows.length && flows[flowIndex].date <= date) {
      price = performancePriceForDate(prices, flows[flowIndex].date) || price;
      if (price) {
        units += flows[flowIndex].amount / price;
        invested += flows[flowIndex].amount;
      }
      flowIndex += 1;
    }
    price = performancePriceForDate(prices, date);
    if (price) points.push({ date, value: round2(units * price - invested) });
  }
  return { name, color, points };
}


function buildTryDepositPerformanceSeries(flows, dates, rates) {
  let valueTry = 0;
  let invested = 0;
  let flowIndex = 0;
  let lastDate = dates[0];
  const points = [];
  for (const date of dates) {
    valueTry += cashFlowAccrueWithCurve(valueTry, lastDate, date, state.cashFlowYields.try.points);
    while (flowIndex < flows.length && flows[flowIndex].date <= date) {
      const rate = performanceRateForDate(flows[flowIndex].date, rates);
      if (rate) {
        valueTry += flows[flowIndex].amount * rate;
        invested += flows[flowIndex].amount;
      }
      flowIndex += 1;
    }
    const currentRate = performanceRateForDate(date, rates);
    if (currentRate) points.push({ date, value: round2(valueTry / currentRate - invested) });
    lastDate = date;
  }
  return { name: "TRY Deposit", color: "#8c8f94", dash: "8 7", points };
}


function buildPortfolioPerformanceSeries(history, flows, dates, rates) {
  const investedByDate = new Map();
  let invested = 0;
  let flowIndex = 0;
  for (const date of dates) {
    while (flowIndex < flows.length && flows[flowIndex].date <= date) {
      invested += flows[flowIndex].amount;
      flowIndex += 1;
    }
    investedByDate.set(date, invested);
  }
  const points = dates.map((date) => {
    const value = portfolioValueForDate(date, history, rates);
    return Number.isFinite(value) ? { date, value: round2(value - (investedByDate.get(date) || 0)) } : null;
  }).filter(Boolean);
  return { name: "Portfolio", color: "#d100d1", points };
}


function portfolioValueForDate(date, history, rates) {
  const parts = accountValuePartsForDate(date, history, rates);
  return round2(parts.usdHoldings + (parts.rate ? parts.trHoldingsTry / parts.rate : 0));
}


function accountValueForDate(date, history, rates) {
  const parts = accountValuePartsForDate(date, history, rates);
  if (!parts.rate) return null;
  return round2(parts.totalTry / parts.rate);
}


function accountValueTryForDate(date, history, rates) {
  const parts = accountValuePartsForDate(date, history, rates);
  return parts.rate ? round2(parts.totalTry) : null;
}


export function accountValuePartsForDate(date, history, rates) {
  const rate = performanceRateForDate(date, rates);
  const usdHoldings = usdHoldingsValueForDate(date, history);
  const trHoldingsTry = trHoldingsValueTryForDate(date, history);
  const cash = cashBalancesForDate(date);
  const totalTry = rate ? trHoldingsTry + cash.try + (usdHoldings + cash.usd) * rate : null;
  return {
    rate,
    usdHoldings: round2(usdHoldings),
    trHoldingsTry: round2(trHoldingsTry),
    cashUsd: round2(cash.usd),
    cashTry: round2(cash.try),
    totalTry: totalTry == null ? null : round2(totalTry),
    errors: accountValueErrorsForDate(date, history, rates),
  };
}


export function usdHoldingsValueForDate(date, history) {
  // For today, value at live prices so it matches the Cash Flow "Current" row
  // (cached candles can lag the live quote, which made crypto/TR diverge).
  if (date === TODAY_ISO) {
    const live = cashFlowCurrentPortfolioUsd();
    if (live > 0) return live;
  }
  let total = 0;
  for (const [symbol, quantity] of usdHoldingsAtDate(date).entries()) {
    const price = performancePriceForDate(performancePriceMap(history[symbol]), date);
    if (price) total += quantity * price;
  }
  return round2(total);
}


export function trHoldingsValueTryForDate(date, history) {
  if (date === TODAY_ISO) {
    const live = cashFlowCurrentTryPortfolioTry();
    if (live > 0) return live;
  }
  let total = 0;
  for (const row of state.trRows.map(normalizeTrRow)) {
    if (row.buyDate > date || (row.sellDate && row.sellDate <= date)) continue;
    total += trHistoricalHoldingValueForDate(row, date, history).value;
  }
  return round2(total);
}


export function trHistoricalHoldingValueForDate(row, date, history) {
  const buyTotal = nullableClientNumber(row.buyTotal);
  const fallbackValue = buyTotal == null ? null : trFallbackHoldingValueTry(row, date);
  if (buyTotal != null && date <= row.buyDate) {
    return { value: round2(buyTotal), method: "buyTotal on buy date", price: null, quantity: trQuantityForDate(row, date, history) || null };
  }
  if (trCanUseImportedValueFallback(row) && fallbackValue != null) {
    return { value: round2(fallbackValue), method: "buyTotal fallback", price: null, quantity: trQuantityForDate(row, date, history) || null };
  }
  const yahoo = toYahooTrSymbol(row.symbol);
  const price = performancePriceForDate(performancePriceMap(history[yahoo]), date);
  const quantity = trQuantityForDate(row, date, history);
  if (price && quantity > 0) {
    return { value: round2(price * quantity), method: "price x qty", price, quantity };
  }
  if (fallbackValue != null) {
    return { value: round2(fallbackValue), method: "missing price fallback", price: null, quantity: quantity > 0 ? quantity : null };
  }
  return { value: 0, method: "missing", price: price || null, quantity: quantity > 0 ? quantity : null };
}


function accountValueErrorsForDate(date, history, rates) {
  const errors = [];
  if (!performanceRateForDate(date, rates)) errors.push(`${date}: USD/TRY rate is missing.`);
  for (const [symbol, quantity] of usdHoldingsAtDate(date).entries()) {
    const price = performancePriceForDate(performancePriceMap(history[symbol]), date);
    if (quantity > 0 && !price) errors.push(`${date}: ${symbol} historical price is missing.`);
  }
  for (const row of state.trRows.map(normalizeTrRow)) {
    if (row.buyDate > date || (row.sellDate && row.sellDate <= date)) continue;
    const yahoo = toYahooTrSymbol(row.symbol);
    const priceTry = performancePriceForDate(performancePriceMap(history[yahoo]), date);
    const quantity = trQuantityForDate(row, date, history);
    const hasFallback = trCanUseImportedValueFallback(row) || nullableClientNumber(row.buyTotal) != null;
    if (!priceTry && !hasFallback) errors.push(`${date}: ${row.symbol} historical price is missing.`);
    if (!(quantity > 0) && !hasFallback) errors.push(`${date}: ${row.symbol} quantity could not be calculated.`);
  }
  return errors;
}


export function trCanUseImportedValueFallback(row) {
  return trIsImportedUnknownQuantity(row)
    && nullableClientNumber(row.buyTotal) != null;
}


export function cashBalancesForDate(date) {
  let usd = 0;
  let tryAmount = 0;
  for (const item of state.cashFlowMovements) {
    const flowDate = item.date <= TODAY_ISO ? item.date : TODAY_ISO;
    if (!flowDate || flowDate > date) continue;
    const amount = Number(item.amount) || 0;
    if (isUsdLikeCurrency(item.currency)) usd += amount;
    else tryAmount += amount;
  }

  for (const row of state.transactions) {
    if (row.date && row.date <= date) {
      usd -= Number(row.total) || 0;
    }
    const splitCost = nullableClientNumber(row.splitTotal);
    if (splitCost && row.splitDate && row.splitDate <= date) {
      usd -= splitCost;
    }
  }

  for (const row of state.cryptoRows.map(normalizeCryptoRow)) {
    if (row.date && row.date <= date) {
      usd -= Number(row.total) || 0;
    }
  }

  for (const row of state.trRows.map(normalizeTrRow)) {
    if (row.buyDate && row.buyDate <= date && row.buyTotal != null) {
      tryAmount -= Number(row.buyTotal) || 0;
    }
    if (row.splitDate && row.splitDate <= date && row.splitBuyTotal != null) {
      tryAmount -= Number(row.splitBuyTotal) || 0;
    }
    if (row.sellDate && row.sellDate <= date && row.sellTotal != null) {
      tryAmount += Number(row.sellTotal) || 0;
    }
  }

  return { usd, try: tryAmount };
}


function externalCashUsdForDate(date, rates) {
  return round2(performanceCashFlows(rates)
    .filter((flow) => flow.date <= date)
    .reduce((total, flow) => total + flow.amount, 0));
}


export function externalCashTryForDate(date, rates) {
  return round2(state.cashFlowMovements
    .filter((item) => item.date && item.date <= date)
    .reduce((total, item) => {
      const flowDate = item.date <= TODAY_ISO ? item.date : TODAY_ISO;
      const amount = Number(item.amount) || 0;
      if (item.currency === "TRY") return total + amount;
      if (isUsdLikeCurrency(item.currency)) {
        const rate = performanceRateForDate(flowDate, rates);
        return rate ? total + amount * rate : total;
      }
      const rate = performanceRateForDate(flowDate, rates);
      return rate ? total + amount * rate : total;
    }, 0));
}


function transactionCashUsdForDate(date, rates) {
  let cash = 0;
  for (const row of state.transactions) {
    if (row.date && row.date <= date) {
      cash -= Number(row.total) || 0;
    }
    const splitCost = nullableClientNumber(row.splitTotal);
    if (splitCost && row.splitDate && row.splitDate <= date) {
      cash -= splitCost;
    }
  }

  for (const row of state.trRows.map(normalizeTrRow)) {
    if (row.buyDate && row.buyDate <= date && row.buyTotal != null) {
      const rate = performanceRateForDate(row.buyDate, rates);
      if (rate) cash -= Number(row.buyTotal) / rate;
    }
    if (row.splitDate && row.splitDate <= date && row.splitBuyTotal != null) {
      const rate = performanceRateForDate(row.splitDate, rates);
      if (rate) cash -= Number(row.splitBuyTotal) / rate;
    }
    if (row.sellDate && row.sellDate <= date && row.sellTotal != null) {
      const rate = performanceRateForDate(row.sellDate, rates);
      if (rate) cash += Number(row.sellTotal) / rate;
    }
  }

  return round2(cash);
}


export function usdHoldingsAtDate(date) {
  const holdings = new Map();
  const grouped = new Map();
  for (const row of state.transactions) {
    const symbol = normalizeMarketSymbol(row.symbol);
    if (!symbol) continue;
    const groupKey = abdGroupKey({ ...row, symbol });
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey).push({ ...row, symbol });
  }
  for (const rows of grouped.values()) {
    const sorted = [...rows].sort((left, right) => (left.date || "").localeCompare(right.date || ""));
    const buyRows = sorted.filter((row) => Number(row.pcs) > 0);
    if (!buyRows.length) continue;
    const symbol = buyRows[0].symbol;
    const firstBuy = buyRows[0];
    const splitEvent = firstRelevantAbdSplitEvent(symbol, sorted, firstBuy.date);
    const splitInputRow = buyRows.find((row) => nullableClientNumber(row.splitShares) != null && nullableClientNumber(row.splitShares) > 0) || firstBuy;
    const splitDate = splitInputRow.splitDate || splitEvent?.date || "";
    const splitFactor = nullableClientNumber(splitInputRow.splitFactor) ?? splitEvent?.factor ?? getSplitFactor(symbol, firstBuy.date);
    const splitShares = nullableClientNumber(splitInputRow.splitShares);
    let quantity = 0;
    let splitApplied = false;
    const applySplit = (targetDate) => {
      if (splitApplied || !splitDate || parseDate(targetDate) < parseDate(splitDate)) return;
      if (splitShares != null && splitShares > 0) quantity = splitShares;
      else if (splitFactor > 1) quantity = round4(quantity * splitFactor);
      splitApplied = true;
    };

    for (const row of sorted) {
      if (row.date > date) break;
      applySplit(row.date);
      quantity = round4(quantity + (Number(row.pcs) || 0));
    }
    applySplit(date);
    if (date === TODAY_ISO) {
      const dividendQuantity = nullableClientNumber(buyRows.find((row) => nullableClientNumber(row.dividendQuantity) != null)?.dividendQuantity);
      if (dividendQuantity > 0) quantity = dividendQuantity;
    }
    if (quantity > 0) holdings.set(symbol, (holdings.get(symbol) || 0) + quantity);
  }
  return holdings;
}


function trHoldingsAtDate(date, history = {}) {
  const holdings = new Map();
  for (const row of state.trRows.map(normalizeTrRow)) {
    if (row.buyDate > date || (row.sellDate && row.sellDate <= date)) continue;
    const quantity = trQuantityForDate(row, date, history);
    if (quantity > 0) holdings.set(row.symbol, (holdings.get(row.symbol) || 0) + quantity);
  }
  return holdings;
}


export function trQuantityForDate(row, date, history = {}) {
  let quantity = trHistoricalQuantity(row, date, history);
  const splitEvent = relevantTrSplitEvent(row);
  const splitDate = row.splitDate || splitEvent?.date || "";
  if (splitDate && splitDate <= date) {
    const splitQuantity = nullableClientNumber(row.splitQuantity);
    const splitFactor = nullableClientNumber(row.splitFactor) ?? splitEvent?.factor ?? getTrSplitFactor(row.symbol, row.buyDate);
    quantity = splitQuantity && splitQuantity > 0 ? splitQuantity : round4(quantity * Math.max(splitFactor || 1, 1));
  }
  if (date === TODAY_ISO) {
    const dividendQuantity = nullableClientNumber(row.dividendQuantity);
    if (dividendQuantity > 0) quantity = dividendQuantity;
  }
  return quantity;
}


function trHistoricalQuantity(row, date, history = {}) {
  const explicit = nullableClientNumber(row.quantity);
  if (explicit != null && explicit > 0 && !trIsImportedUnknownQuantity(row)) return explicit;
  const yahoo = toYahooTrSymbol(row.symbol);
  const buyPrice = performancePriceForDate(performancePriceMap(history[yahoo]), row.buyDate || date);
  const buyTotal = nullableClientNumber(row.buyTotal);
  if (buyPrice && buyTotal) return round4(buyTotal / buyPrice);
  return explicit != null && explicit > 0 ? explicit : 0;
}


function trFallbackHoldingValueTry(row, date) {
  const buyTotal = nullableClientNumber(row.buyTotal) || 0;
  const sellTotal = nullableClientNumber(row.sellTotal);
  if (!sellTotal || !row.sellDate || row.sellDate <= row.buyDate || date <= row.buyDate) return buyTotal;
  const totalDays = Math.max(cashFlowDiffDays(row.buyDate, row.sellDate), 1);
  const elapsed = Math.max(0, Math.min(cashFlowDiffDays(row.buyDate, date), totalDays));
  return round2(buyTotal + (sellTotal - buyTotal) * (elapsed / totalDays));
}


// Perf note: valuing a portfolio across many dates (the quarter charts) calls
// performancePriceMap/performancePriceForDate/performanceRateForDate once per
// (date × symbol). Each call used to rebuild the Map from `candles` and
// re-sort its entries from scratch — with ~13 dates and several symbols this
// added up to seconds of redundant work (a single date-picker change on the
// second chart took 3.5s+). Since `candles`/`rates` are fresh objects each
// data load (never mutated in place — reassigned wholesale, see loadQuarterData),
// it's safe to memoize the built map / sorted keys by object reference: same
// reference in → same result out, computed once instead of once per date.
const _performancePriceMapCache = new WeakMap();

export function performancePriceMap(candles, rates = null) {
  if (!rates && candles) {
    const cached = _performancePriceMapCache.get(candles);
    if (cached) return cached;
  }
  const map = new Map();
  for (const candle of candles || []) {
    const date = toIsoDate(candle.time * 1000);
    let close = Number(candle.close);
    if (rates) {
      const rate = performanceRateForDate(date, rates);
      if (rate) close /= rate;
      else close = null;
    }
    if (date && Number.isFinite(close)) map.set(date, close);
  }
  if (!rates && candles) _performancePriceMapCache.set(candles, map);
  return map;
}


const _sortedPriceEntriesCache = new WeakMap();

export function performancePriceForDate(priceMap, date) {
  let sorted = _sortedPriceEntriesCache.get(priceMap);
  if (!sorted) {
    // ISO date strings (YYYY-MM-DD) sort correctly with plain comparison —
    // no need for the much slower locale-aware localeCompare.
    sorted = [...priceMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    _sortedPriceEntriesCache.set(priceMap, sorted);
  }
  let found = null;
  for (const [priceDate, price] of sorted) {
    if (priceDate <= date) found = price;
    else break;
  }
  return found;
}


const _sortedRateKeysCache = new WeakMap();

export function performanceRateForDate(date, rates) {
  if (rates?.[date]?.rate) return rates[date].rate;
  if (!rates) return null;
  let sortedKeys = _sortedRateKeysCache.get(rates);
  if (!sortedKeys) {
    sortedKeys = Object.keys(rates).sort();
    _sortedRateKeysCache.set(rates, sortedKeys);
  }
  let found = null;
  for (const key of sortedKeys) {
    if (key <= date && rates[key]?.rate) found = rates[key].rate;
    else if (key > date) break;
  }
  return found;
}


export function cashFlowOnlyUsdBalancesForDate(date, rates, flows = state.cashFlowMovements) {
  return flows.reduce((total, item) => {
    const flowDate = item.date <= TODAY_ISO ? item.date : TODAY_ISO;
    if (!flowDate || flowDate > date) return total;
    const amount = Number(item.amount) || 0;
    if (isUsdLikeCurrency(item.currency)) {
      total.usd += amount;
      return total;
    }
    const rate = performanceRateForDate(flowDate, rates);
    if (!rate) {
      total.errors.push(`${flowDate}: USD/TRY rate is missing.`);
      total.trUsd = null;
      return total;
    }
    if (total.trUsd != null) total.trUsd += amount / rate;
    return total;
  }, { trUsd: 0, usd: 0, errors: [] });
}


export function cashFlowTryDepositUsdForDate(targetDate, rates, flows = state.cashFlowMovements) {
  const errors = [];
  if (!state.cashFlowYields.try.points.length) errors.push("TRY deposit yield data is missing.");
  const targetRate = performanceRateForDate(targetDate, rates);
  if (!targetRate) errors.push(`${targetDate}: USD/TRY rate is missing.`);

  const activeFlows = flows
    .filter((item) => item.date && item.date <= targetDate)
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date));

  let valueTry = 0;
  let lastDate = activeFlows[0]?.date || targetDate;
  for (const item of activeFlows) {
    valueTry += cashFlowAccrueWithCurve(valueTry, lastDate, item.date, state.cashFlowYields.try.points);
    const amount = Number(item.amount) || 0;
    if (item.currency === "TRY") {
      valueTry += amount;
    } else {
      const flowRate = performanceRateForDate(item.date, rates);
      if (!flowRate) {
        errors.push(`${item.date}: USD/TRY rate is missing.`);
      } else {
        valueTry += amount * flowRate;
      }
    }
    lastDate = item.date;
  }

  valueTry += cashFlowAccrueWithCurve(valueTry, lastDate, targetDate, state.cashFlowYields.try.points);
  if (errors.length || !targetRate) return { value: null, errors };
  return { value: round2(valueTry / targetRate), errors };
}


export function cashFlowAssetUsdForDate(targetDate, rates, history, symbol, label, options = {}) {
  const errors = [];
  const symbols = Array.isArray(symbol) ? symbol : [symbol];
  const selectedSymbol = symbols.find((item) => Array.isArray(history[item]) && history[item].length) || symbols[0];
  const prices = performancePriceMap(history[selectedSymbol], options.priceRates || null);
  const targetPriceLookup = options.adjustWeekendForward ? performancePriceForDateNear(prices, targetDate, 3) : { price: performancePriceForDate(prices, targetDate), date: targetDate };
  const targetPrice = targetPriceLookup.price;
  if (!targetPrice) errors.push(`${targetPriceLookup.date}: ${label} historical price is missing.`);

  let units = 0;
  const flows = options.flows || state.cashFlowMovements;
  for (const item of flows.filter((flow) => flow.date && flow.date <= targetDate).sort((a, b) => a.date.localeCompare(b.date))) {
    const amount = Number(item.amount) || 0;
    const flowRate = item.currency === "TRY" ? performanceRateForDate(item.date, rates) : 1;
    if (!flowRate) {
      errors.push(`${item.date}: USD/TRY rate is missing.`);
      continue;
    }
    const flowPriceLookup = options.adjustWeekendForward ? performancePriceForDateNear(prices, item.date, 3) : { price: performancePriceForDate(prices, item.date), date: item.date };
    const flowPrice = flowPriceLookup.price;
    if (!flowPrice) {
      errors.push(`${flowPriceLookup.date}: ${label} historical price is missing.`);
      continue;
    }
    const amountUsd = item.currency === "TRY" ? amount / flowRate : amount;
    units += amountUsd / flowPrice;
  }

  if (errors.length || !targetPrice) return { value: null, errors };
  return { value: round2(units * targetPrice), errors };
}


function performancePriceForDateNear(priceMap, date, extraDays = 3) {
  if (date === TODAY_ISO) {
    const yesterday = addIsoDays(date, -1);
    const yesterdayPrice = performancePriceForDate(priceMap, yesterday);
    return { price: yesterdayPrice, date: yesterday };
  }
  const start = nextWeekdayDate(date);
  for (let offset = 0; offset <= extraDays; offset += 1) {
    const candidateDate = addIsoDays(start, offset);
    if (candidateDate < date) continue;
    const exactPrice = priceMap.get(candidateDate);
    if (Number.isFinite(exactPrice)) return { price: exactPrice, date: candidateDate };
  }
  const lastTriedDate = addIsoDays(start, extraDays);
  return { price: null, date: lastTriedDate };
}

