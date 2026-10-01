import { TODAY_ISO, elements, state } from "./state.js";
import { escapeHtml, addIsoDays, nullableClientNumber, maxDate, minDate, toIsoDate, parseDate, formatDate, formatShortDate, round2 } from "./util.js";
import { normalizeTrRow, toYahooTrSymbol } from "./tr.js";
import { normalizeCryptoRow, normalizeCryptoSymbol } from "./crypto.js";
import { cashFlowAllMovements, cashFlowCurrentCryptoPortfolioUsd, cashFlowDiffDays, cashFlowMoney, cashFlowSignedPlain } from "./cashflow.js";
import { accountValuePartsForDate, usdHoldingsValueForDate, trHoldingsValueTryForDate, trCanUseImportedValueFallback, cashBalancesForDate, usdHoldingsAtDate, trQuantityForDate, performancePriceMap, performancePriceForDate, performanceRateForDate, cashFlowOnlyUsdBalancesForDate, cashFlowTryDepositUsdForDate, cashFlowAssetUsdForDate } from "./performance.js";
import { formatCurrencyShort } from "./charts.js";

function renderYears2() {
  if (elements.years2Body && elements.years2Summary) {
    const rows = cashFlowAllMovements().slice().sort((left, right) => (left.date || "").localeCompare(right.date || ""));
    const dataLabel = state.returnCalc.loaded ? "portfolio values ready" : state.returnCalc.loading ? "loading portfolio values" : "portfolio values waiting";
    elements.years2Summary.textContent = rows.length ? `${rows.length} movements, ${dataLabel}` : "No data";
    elements.years2Body.innerHTML = rows.length
      ? rows.map(years2CashFlowRowHtml).join("")
      : `<tr><td colspan="8" class="muted">No cash flow movements.</td></tr>`;
  }
  renderYearsQuarterCash();
}


function years2CashFlowRowHtml(row) {
  const amount = Number(row.amount) || 0;
  const tryValue = row.currency === "TRY" ? cashFlowSignedPlain(amount) : "";
  const usdValue = row.currency === "USD" ? cashFlowSignedPlain(amount) : "";
  const tone = amount >= 0 ? "positive" : "negative";
  const previousDate = addIsoDays(row.date, -1);
  const trPortfolio = row.currency === "TRY" ? years2PreviousPortfolioValue(previousDate, "tr") : null;
  const abdPortfolio = row.currency === "USD" ? years2PreviousPortfolioValue(previousDate, "abd") : null;
  const statusItems = [trPortfolio, abdPortfolio].filter(Boolean).map((item) => item.status).filter(Boolean);
  const ok = [trPortfolio, abdPortfolio].filter(Boolean).every((item) => item.ok);
  return `<tr><td>${formatDate(row.date)}</td><td>${formatDate(previousDate)}</td><td>${escapeHtml(row.note || "")}</td><td class="${row.currency === "TRY" ? tone : ""}">${tryValue}</td><td class="${row.currency === "USD" ? tone : ""}">${usdValue}</td><td>${trPortfolio?.value == null ? "-" : cashFlowMoney(trPortfolio.value, "TRY")}</td><td>${abdPortfolio?.value == null ? "-" : cashFlowMoney(abdPortfolio.value, "USD")}</td><td class="${ok ? "" : "negative"}">${escapeHtml(statusItems.join(" "))}</td></tr>`;
}


function years2PreviousPortfolioValue(date, market) {
  if (!state.returnCalc.loaded) {
    return { value: null, ok: false, status: state.returnCalc.loading ? "Loading DB data" : "DB data not loaded" };
  }
  const history = state.returnCalc.history || {};
  const cash = cashBalancesForDate(date);
  if (market === "abd") {
    const errors = usdAccountErrorsForDate(date, history);
    if (errors.length) return { value: null, ok: false, status: errors.join(" ") };
    return { value: round2(usdHoldingsValueForDate(date, history) + cash.usd), ok: true, status: "OK" };
  }
  const errors = trAccountErrorsForDate(date, history);
  if (errors.length) return { value: null, ok: false, status: errors.join(" ") };
  return { value: round2(trHoldingsValueTryForDate(date, history) + cash.try), ok: true, status: "OK" };
}


function usdAccountErrorsForDate(date, history) {
  const errors = [];
  for (const [symbol, quantity] of usdHoldingsAtDate(date).entries()) {
    const price = performancePriceForDate(performancePriceMap(history[symbol]), date);
    if (quantity > 0 && !price) errors.push(`${date}: ${symbol} historical price is missing.`);
  }
  return errors;
}


function trAccountErrorsForDate(date, history) {
  const errors = [];
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


export function renderYearsQuarterCash() {
  if (state.quarterCalc.loading) {
    if (elements.yearsQuarterSummary) elements.yearsQuarterSummary.textContent = "Loading DB data";
    if (elements.yearsQuarterBody) elements.yearsQuarterBody.innerHTML = `<tr><td colspan="9" class="muted">Loading DB data.</td></tr>`;
    if (state.activeView === "quarterChart" && elements.yearsQuarterChart) {
      elements.yearsQuarterChart.innerHTML = `<div class="empty-card">Loading DB data.</div>`;
    }
    return;
  }
  const rows = getYearsQuarterCashRows();
  const dataLabel = state.quarterCalc.loading ? "loading DB data" : state.quarterCalc.loaded ? "DB ready" : "DB waiting";
  if (elements.yearsQuarterSummary) elements.yearsQuarterSummary.textContent = rows.length ? `${rows.length} dates, ${dataLabel}` : "No data";
  if (state.activeView === "quarterChart") {
    renderYearsQuarterChart(elements.yearsQuarterChart, quarterPlusRows(rows));
    renderSecondQuarterChart();
  }
  if (elements.yearsQuarterBody) {
    elements.yearsQuarterBody.innerHTML = rows.length
      ? rows.map((row) => `<tr><td>${formatDate(row.date)}</td><td>${row.totalUsd == null ? "-" : cashFlowMoney(row.totalUsd, "USD")}</td><td>${row.accountUsd == null ? "-" : cashFlowMoney(row.accountUsd, "USD")}</td><td>${row.tryDepositUsd == null ? "-" : cashFlowMoney(row.tryDepositUsd, "USD")}</td><td>${row.goldUsd == null ? "-" : cashFlowMoney(row.goldUsd, "USD")}</td><td>${row.bistUsd == null ? "-" : cashFlowMoney(row.bistUsd, "USD")}</td><td>${row.nasdaqUsd == null ? "-" : cashFlowMoney(row.nasdaqUsd, "USD")}</td><td>${row.btcUsd == null ? "-" : cashFlowMoney(row.btcUsd, "USD")}</td><td class="${row.status === "OK" ? "" : "negative"}">${escapeHtml(row.status)}</td></tr>`).join("")
      : `<tr><td colspan="9" class="muted">No quarter dates.</td></tr>`;
  }
}


export function renderQuarterPlus() {
  if (!elements.quarterPlusBody || !elements.quarterPlusSummary) return;
  if (state.quarterCalc.loading) {
    elements.quarterPlusSummary.textContent = "Loading DB data";
    elements.quarterPlusBody.innerHTML = `<tr><td colspan="8" class="muted">Loading DB data.</td></tr>`;
    return;
  }

  const rows = getQuarterPlusRows();
  const dataLabel = state.quarterCalc.loaded ? "DB ready" : "DB waiting";
  elements.quarterPlusSummary.textContent = rows.length ? `${rows.length} dates, ${dataLabel}` : "No data";
  elements.quarterPlusBody.innerHTML = rows.length
    ? rows.map((row) => `<tr><td>${formatDate(row.date)}</td><td>${row.totalUsd == null ? "-" : cashFlowMoney(row.totalUsd, "USD")}</td><td>${row.accountUsd == null ? "-" : cashFlowMoney(row.accountUsd, "USD")}</td><td>${row.tryDepositUsd == null ? "-" : cashFlowMoney(row.tryDepositUsd, "USD")}</td><td>${row.goldUsd == null ? "-" : cashFlowMoney(row.goldUsd, "USD")}</td><td>${row.bistUsd == null ? "-" : cashFlowMoney(row.bistUsd, "USD")}</td><td>${row.nasdaqUsd == null ? "-" : cashFlowMoney(row.nasdaqUsd, "USD")}</td><td>${row.btcUsd == null ? "-" : cashFlowMoney(row.btcUsd, "USD")}</td></tr>`).join("")
    : `<tr><td colspan="8" class="muted">No quarter dates.</td></tr>`;
  renderQuarterDebug(rows);
}


function renderQuarterDebug(rows) {
  if (!elements.quarterDebug) return;
  const todayRow = rows.find((row) => row.date === TODAY_ISO) || rows[rows.length - 1];
  if (!todayRow) {
    elements.quarterDebug.innerHTML = "";
    return;
  }
  const details = quarterRowPortfolioCashBreakdown(todayRow);
  elements.quarterDebug.innerHTML = `
    <div class="quarter-debug-title">${formatDate(todayRow.date)} Portfolio+Cash Breakdown</div>
    <div class="quarter-debug-grid">
      <span>ABD holdings</span>
      <span>Crypto holdings</span>
      <span>TR holdings</span>
      <span>Cash USD</span>
      <span>Cash USDT</span>
      <span>Cash TRY</span>
      <span>Total</span>
      <strong>${quarterDebugMoney(details.usdHoldings)}</strong>
      <strong>${quarterDebugMoney(details.cryptoHoldings)}</strong>
      <strong>${quarterDebugMoney(details.trHoldingsUsd)}</strong>
      <strong>${quarterDebugMoney(details.cashUsd)}</strong>
      <strong>${quarterDebugMoney(details.cashUsdt)}</strong>
      <strong>${quarterDebugMoney(details.cashTryUsd)}</strong>
      <strong>${quarterDebugMoney(details.total)}</strong>
    </div>
  `;
}


function quarterRowPortfolioCashBreakdown(row) {
  return {
    usdHoldings: Number.isFinite(row.breakdownUsdHoldings) ? row.breakdownUsdHoldings : null,
    cryptoHoldings: Number.isFinite(row.breakdownCryptoHoldings) ? row.breakdownCryptoHoldings : null,
    trHoldingsUsd: Number.isFinite(row.breakdownTrHoldingsUsd) ? row.breakdownTrHoldingsUsd : null,
    cashUsd: Number.isFinite(row.breakdownCashUsd) ? row.breakdownCashUsd : null,
    cashUsdt: Number.isFinite(row.breakdownCashUsdt) ? row.breakdownCashUsdt : null,
    cashTryUsd: Number.isFinite(row.breakdownCashTryUsd) ? row.breakdownCashTryUsd : null,
    total: Number.isFinite(row.accountUsd) ? row.accountUsd : null,
  };
}


function quarterDebugMoney(value) {
  return Number.isFinite(value) ? cashFlowMoney(value, "USD") : "-";
}


function quarterPortfolioCashBreakdown(date, historyOverride = null, ratesOverride = null) {
  const rates = state.quarterCalc.loaded ? state.quarterCalc.rates : state.cashFlowRates;
  const history = historyOverride || (state.quarterCalc.loaded ? state.quarterCalc.history || {} : {});
  const rateData = ratesOverride || rates;
  const parts = accountValuePartsForDate(date, history, rateData);
  const crypto = cryptoPortfolioUsdForDate(date, history);
  const rate = parts.rate || performanceRateForDate(date, rateData) || state.cashFlowLatestRate?.rate || 0;
  const trHoldingsUsd = rate ? parts.trHoldingsTry / rate : 0;
  const cashTryUsd = rate ? parts.cashTry / rate : 0;
  const splitCash = accountUsdCashSplitForDate(date);
  const total = (parts.usdHoldings || 0) + (crypto.value || 0) + trHoldingsUsd + (parts.cashUsd || 0) + cashTryUsd;
  return {
    usdHoldings: round2(parts.usdHoldings || 0),
    cryptoHoldings: round2(crypto.value || 0),
    trHoldingsUsd: round2(trHoldingsUsd),
    cashUsd: splitCash.usd,
    cashUsdt: splitCash.usdt,
    cashTryUsd: round2(cashTryUsd),
    total: round2(total),
  };
}


export function accountUsdCashSplitForDate(date) {
  let usd = 0;
  let usdt = 0;
  for (const item of state.cashFlowMovements) {
    const flowDate = item.date <= TODAY_ISO ? item.date : TODAY_ISO;
    if (!flowDate || flowDate > date) continue;
    const amount = Number(item.amount) || 0;
    if (item.currency === "USD") usd += amount;
    if (item.currency === "USDT") usdt += amount;
  }

  for (const row of state.transactions) {
    if (row.date && row.date <= date) usd -= Number(row.total) || 0;
    const splitCost = nullableClientNumber(row.splitTotal);
    if (splitCost && row.splitDate && row.splitDate <= date) usd -= splitCost;
  }

  for (const row of state.cryptoRows.map(normalizeCryptoRow)) {
    if (row.date && row.date <= date) usdt -= Number(row.total) || 0;
  }

  return { usd: round2(usd), usdt: round2(usdt) };
}


export function quarterPlusRows(rows) {
  return rows.map((row) => {
    const cryptoUsd = Number.isFinite(row.cryptoUsd) ? row.cryptoUsd : 0;
    const accountUsd = row.accountUsd == null ? null : round2(row.accountUsd + cryptoUsd);
    return {
      ...row,
      totalUsd: row.totalUsd == null ? null : round2(row.totalUsd),
      accountUsd,
      breakdownTotal: accountUsd,
    };
  });
}


export function getQuarterPlusRows() {
  if (state.quarterPlusRowsCache) return state.quarterPlusRowsCache;
  state.quarterPlusRowsCache = quarterPlusRows(getYearsQuarterCashRows());
  return state.quarterPlusRowsCache;
}


function renderYearsQuarterChart(container, rows, options = {}) {
  if (!container) return;
  const baseSeries = [
    { key: "accountUsd", name: "Portfolio+Cash", color: "#d100d1", width: 3 },
    { key: "tryDepositUsd", name: "TRY Deposit", color: "#8c8f94", dash: "8 7" },
    { key: "goldUsd", name: "Gold", color: "#c79219" },
    { key: "bistUsd", name: "BIST100", color: "#00bcd4" },
    { key: "nasdaqUsd", name: "Nasdaq100", color: "#d7263d" },
    { key: "btcUsd", name: "BTC", color: "#8bdc65" },
  ];
  // Per-account holdings+cash lines — only offered when a caller explicitly
  // opts in via onlySeries (the third chart), so chart 1 and 2 stay unchanged.
  // Breakdown lines plot ABSOLUTE USD (raw), while the Portfolio+Cash line keeps
  // its original baseline-relative rendering — so raw is a per-series flag, not
  // a chart-wide one.
  const breakdownSeries = [
    { key: "abdHoldingsCashUsd", name: "ABD Holdings+Cash", color: "#f5a623", raw: true },
    { key: "trHoldingsCashUsd", name: "TR Holdings+Cash", color: "#4a90d9", raw: true },
    { key: "cryptoHoldingsCashUsd", name: "Crypto Holdings+Cash", color: "#7ed321", raw: true },
  ];
  const rawValues = !!options.rawValues;
  const serieDefs = Array.isArray(options.onlySeries) ? [...baseSeries, ...breakdownSeries] : baseSeries;
  const series = serieDefs.filter((serie) => !Array.isArray(options.onlySeries) || options.onlySeries.includes(serie.key)).map((serie) => {
    const serieRaw = rawValues || !!serie.raw;
    let points = rows
      .filter((row) => Number.isFinite(row[serie.key]) && (serieRaw || Number.isFinite(row.totalUsd)))
      .map((row) => ({ date: row.date, value: round2(row[serie.key] - (serieRaw ? 0 : row.totalUsd)) }));
    // Rebase every line to 0 at the chosen start date: subtract its first
    // point so all series begin together at 0 and show change since then.
    if (options.rebaseToStart && points.length) {
      const baseline = points[0].value;
      points = points.map((point) => ({ date: point.date, value: round2(point.value - baseline) }));
    }
    return { ...serie, points };
  }).filter((serie) => serie.points.length);

  if (!rows.length || !series.length) {
    container.innerHTML = `<div class="empty-card">No quarter chart data yet.</div>`;
    return;
  }

  const points = series.flatMap((serie) => serie.points);
  const minDate = Math.min(...points.map((point) => parseDate(point.date)));
  const maxDate = Math.max(...points.map((point) => parseDate(point.date)));
  const availableWidth = Math.max(container.clientWidth || 0, 980);
  // Axis amounts now sit on the right, so the left margin is minimal and the
  // right margin holds the labels.
  const pad = { left: 10, right: 66, top: 12, bottom: 58 };
  const width = availableWidth;
  const values = points.map((point) => point.value).filter(Number.isFinite);
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 0);
  const quarterTick = 10000;
  let minValue = Math.floor(rawMin / quarterTick) * quarterTick;
  let maxValue = Math.ceil(rawMax / quarterTick) * quarterTick;
  if (minValue === maxValue) {
    minValue -= quarterTick;
    maxValue += quarterTick;
  }
  // Fixed plot height (does NOT scale with band count) so each 10k band has a
  // consistent, readable height. Caller can pass a shorter height (e.g. the
  // second, screen-fit chart).
  const plotHeight = Number.isFinite(options.plotHeight) ? options.plotHeight : 857;
  const height = pad.top + pad.bottom + plotHeight;
  const x = (date) => {
    const time = parseDate(date);
    const ratio = maxDate === minDate ? 0 : (time - minDate) / (maxDate - minDate);
    return pad.left + ratio * (width - pad.left - pad.right);
  };
  const y = (value) => {
    const ratio = (value - minValue) / (maxValue - minValue || 1);
    return height - pad.bottom - ratio * (height - pad.top - pad.bottom);
  };
  const gridValues = [];
  for (let value = minValue; value <= maxValue; value += quarterTick) gridValues.push(value);
  const grid = gridValues.map((value) => `
    <line class="${value === 0 ? "performance-zero-line" : "performance-grid-line"}" x1="${pad.left}" y1="${round2(y(value))}" x2="${width - pad.right}" y2="${round2(y(value))}" />
    <text class="performance-axis-label" x="${width - 6}" y="${round2(y(value) + 4)}" text-anchor="end">${formatCurrencyShort(value)}</text>
  `).join("");
  const paths = series.map((serie) => {
    const d = serie.points.map((point, index) => `${index ? "L" : "M"} ${round2(x(point.date))} ${round2(y(point.value))}`).join(" ");
    return `<path d="${d}" fill="none" stroke="${serie.color}" stroke-width="${serie.width || 2.2}" ${serie.dash ? `stroke-dasharray="${serie.dash}"` : ""} stroke-linecap="round" stroke-linejoin="round" />`;
  }).join("");
  const bottomGridY = round2(y(minValue));
  const tickDates = rows.map((row) => row.date).filter((date) => parseDate(date) >= minDate && parseDate(date) <= maxDate);
  // The second chart samples many points (up to ~90), which would overprint the
  // date labels. Show at most ~25 evenly-spaced ticks (always incl. the last)
  // so the axis stays readable. The first chart has few dates, so all show.
  const maxTicks = 25;
  const tickStep = options.labelEveryTick ? 1 : Math.max(1, Math.ceil((tickDates.length - 1) / (maxTicks - 1)));
  const shownTicks = new Set();
  for (let i = 0; i < tickDates.length; i += tickStep) shownTicks.add(i);
  if (tickDates.length) shownTicks.add(tickDates.length - 1);
  const xTicks = tickDates.map((date, index) => {
    if (!shownTicks.has(index)) return "";
    const prefix = index === 1 && !options.hideStartOffset ? `${quarterStartOffsetLabel(tickDates)} ` : "";
    const label = index === 0 ? "" : `<text class="performance-axis-label quarter-date-label" x="${round2(x(date))}" y="${bottomGridY + 3}" text-anchor="middle" dominant-baseline="hanging">${prefix}${formatShortDate(date)}</text>`;
    return `<line class="performance-grid-line quarter-date-line" x1="${round2(x(date))}" y1="${pad.top}" x2="${round2(x(date))}" y2="${bottomGridY}" />${label}`;
  }).join("");
  const legend = [
    ...(rawValues ? [] : [`<span><i style="background:#202d39"></i>Total USD baseline</span>`]),
    ...series.map((serie) => `<span><i style="background:${serie.color}"></i>${serie.name}</span>`),
  ].join("");

  container.innerHTML = `
    <svg class="quarter-chart performance-chart" viewBox="0 0 ${width} ${height}" style="height:${height}px" preserveAspectRatio="none" role="img" aria-label="Quarter values relative to Total USD">
      ${grid}
      ${paths}
      ${xTicks}
    </svg>
    <div class="performance-legend quarter-chart-legend">${legend}</div>
  `;
}


// Equally-spaced dates from startDate to endDate (inclusive), count+1 points,
// dividing the range into `count` equal segments. Used for the second chart's
// self-chosen, evenly-divided x-axis.
function equalIntervalDates(startDate, endDate, count) {
  const start = Date.parse(`${startDate}T12:00:00Z`);
  const end = Date.parse(`${endDate}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [endDate];
  const dates = [];
  for (let i = 0; i <= count; i += 1) {
    const t = start + ((end - start) * i) / count;
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return [...new Set(dates)];
}


// Default start for the second chart: the start of the current year (YTD),
// clamped to the earliest date we have data for.
function chart2DefaultStartDate() {
  const yearStart = `${new Date().getUTCFullYear()}-01-01`;
  const earliest = yearsQuarterStartDate();
  return yearStart > earliest ? yearStart : earliest;
}


// Start date for a preset range button, clamped to the earliest data date.
function chart2PresetStartDate(preset) {
  const now = new Date();
  const d = new Date();
  switch (preset) {
    case "1w": d.setUTCDate(now.getUTCDate() - 7); break;
    case "1m": d.setUTCMonth(now.getUTCMonth() - 1); break;
    case "3m": d.setUTCMonth(now.getUTCMonth() - 3); break;
    case "6m": d.setUTCMonth(now.getUTCMonth() - 6); break;
    case "1y": d.setUTCFullYear(now.getUTCFullYear() - 1); break;
    case "beginning": return yearsQuarterStartDate();
    case "ytd": return chart2DefaultStartDate();
    default: return chart2DefaultStartDate();
  }
  const candidate = d.toISOString().slice(0, 10);
  const earliest = yearsQuarterStartDate();
  return candidate > earliest ? candidate : earliest;
}


export function handleChart2Preset(event) {
  const preset = event.currentTarget.dataset.chart2Preset;
  const value = chart2PresetStartDate(preset);
  state.chart2StartDate = value;
  if (elements.chart2StartDate) elements.chart2StartDate.value = value;
  document.querySelectorAll("[data-chart2-preset]").forEach((button) => {
    button.classList.toggle("active", button.dataset.chart2Preset === preset);
  });
  renderSecondQuarterChart();
}


function renderSecondQuarterChart() {
  if (!elements.yearsQuarterChart2) return;
  const earliest = yearsQuarterStartDate();
  const startDate = state.chart2StartDate || chart2DefaultStartDate();
  if (elements.chart2StartDate) {
    elements.chart2StartDate.min = earliest;
    elements.chart2StartDate.max = TODAY_ISO;
    if (!elements.chart2StartDate.value) elements.chart2StartDate.value = startDate;
  }
  // Plot the chart only at the dates we actually label — no hidden in-between
  // sampling. equalIntervalDates de-dupes, so short ranges yield fewer points.
  const dates = equalIntervalDates(startDate, TODAY_ISO, CHART2_INTERVALS);
  const rows = quarterPlusRows(buildQuarterRowsForDates(dates));
  const plotHeight = Math.max(280, Math.min(640, (window.innerHeight || 800) - 250));
  if (elements.chart2Hint) {
    const intervals = Math.max(1, dates.length - 1);
    elements.chart2Hint.textContent = `→ today, rebased to 0, ${intervals} equal intervals`;
  }
  renderYearsQuarterChart(elements.yearsQuarterChart2, rows, { plotHeight, rebaseToStart: true, labelEveryTick: true, hideStartOffset: true });
  renderThirdQuarterChart(startDate);
}


// The third chart mirrors the first chart's Portfolio+Cash line but sampled at
// DAILY intervals, over the same range the second chart's controls select.
// Only the Portfolio+Cash series is drawn; date labels are thinned for
// readability while the line itself is plotted for every day.
function renderThirdQuarterChart(startDate) {
  if (!elements.yearsQuarterChart3) return;
  const dates = dailyDates(startDate, TODAY_ISO);
  const rows = quarterPlusRows(buildQuarterRowsForDates(dates));
  const plotHeight = Math.max(240, Math.min(560, (window.innerHeight || 800) - 320));
  renderYearsQuarterChart(elements.yearsQuarterChart3, rows, {
    plotHeight,
    hideStartOffset: true,
    onlySeries: ["accountUsd", "abdHoldingsCashUsd", "trHoldingsCashUsd", "cryptoHoldingsCashUsd"],
  });
}


// Every calendar day from startDate to endDate inclusive.
function dailyDates(startDate, endDate) {
  const out = [];
  let cursor = Date.parse(`${startDate}T12:00:00Z`);
  const end = Date.parse(`${endDate}T12:00:00Z`);
  if (!Number.isFinite(cursor) || !Number.isFinite(end) || end < cursor) return [endDate];
  while (cursor <= end) {
    out.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86400000;
  }
  if (out[out.length - 1] !== endDate) out.push(endDate);
  return out;
}


// The second chart divides its range into this many equal segments; each
// boundary is both a plotted point AND a labeled date (no in-between sampling).
// equalIntervalDates de-dupes, so short ranges collapse to fewer points.
const CHART2_INTERVALS = 24;


export function handleChart2DateChange() {
  const value = elements.chart2StartDate?.value;
  if (!value) return;
  state.chart2StartDate = value;
  document.querySelectorAll("[data-chart2-preset]").forEach((button) => button.classList.remove("active"));
  renderSecondQuarterChart();
}


function yearsQuarterCashRows() {
  if (state.quarterRowsCache) return state.quarterRowsCache;
  state.quarterRowsCache = buildQuarterRowsForDates(yearsQuarterDates(yearsQuarterStartDate(), TODAY_ISO));
  return state.quarterRowsCache;
}


// Builds a quarter-style metric row (Total, Portfolio+Cash, Gold, BIST, Nasdaq,
// BTC, TRY deposit) for each given date. Date-list agnostic — used both for the
// quarterly first chart and the second chart's equal-interval dates.
function buildQuarterRowsForDates(dates) {
  const rates = state.quarterCalc.loaded ? state.quarterCalc.rates : state.cashFlowRates;
  const history = state.quarterCalc.loaded ? state.quarterCalc.history || {} : {};
  const flows = combinedSystemMoneyFlows();
  return dates.map((date) => {
    const balances = cashFlowOnlyUsdBalancesForDate(date, rates, flows);
    const deposit = cashFlowTryDepositUsdForDate(date, rates, flows);
    const account = yearsQuarterAccountUsdForDate(date, rates);
    const gold = cashFlowAssetUsdForDate(date, rates, history, "GC=F", "Gold", { flows, adjustWeekendForward: true });
    const bist = cashFlowAssetUsdForDate(date, rates, history, "XU100.IS", "BIST100", { priceRates: rates, flows, adjustWeekendForward: true });
    const nasdaq = cashFlowAssetUsdForDate(date, rates, history, "^IXIC", "Nasdaq100", { flows, adjustWeekendForward: true });
    const btc = cashFlowAssetUsdForDate(date, rates, history, "BTC-USD", "BTC", { flows });
    const crypto = cryptoPortfolioUsdForDate(date, history);
    const breakdown = quarterPortfolioCashBreakdown(date, history, rates);
    const errors = [...balances.errors, ...deposit.errors, ...account.errors, ...gold.errors, ...bist.errors, ...nasdaq.errors, ...btc.errors, ...crypto.errors];
    const totalUsd = balances.trUsd == null ? null : balances.trUsd + balances.usd;
    return {
      date,
      totalUsd: totalUsd == null ? null : round2(totalUsd),
      accountUsd: account.value,
      cryptoUsd: crypto.value,
      tryDepositUsd: deposit.value,
      goldUsd: gold.value,
      bistUsd: bist.value,
      nasdaqUsd: nasdaq.value,
      btcUsd: btc.value,
      breakdownUsdHoldings: breakdown.usdHoldings,
      breakdownCryptoHoldings: breakdown.cryptoHoldings,
      breakdownTrHoldingsUsd: breakdown.trHoldingsUsd,
      breakdownCashUsd: breakdown.cashUsd,
      breakdownCashUsdt: breakdown.cashUsdt,
      breakdownCashTryUsd: breakdown.cashTryUsd,
      breakdownTotal: breakdown.total,
      // Per-account holdings+cash in USD (used by the third chart's breakdown
      // lines). ABD = USD holdings + USD cash; TR = TR holdings + TRY cash;
      // Crypto = crypto holdings + USDT cash.
      abdHoldingsCashUsd: round2((breakdown.usdHoldings || 0) + (breakdown.cashUsd || 0)),
      trHoldingsCashUsd: round2((breakdown.trHoldingsUsd || 0) + (breakdown.cashTryUsd || 0)),
      cryptoHoldingsCashUsd: round2((breakdown.cryptoHoldings || 0) + (breakdown.cashUsdt || 0)),
      status: errors.length ? [...new Set(errors)].join(" ") : "OK",
    };
  });
}


export function getYearsQuarterCashRows() {
  return yearsQuarterCashRows();
}


function combinedSystemMoneyFlows() {
  return cashFlowAllMovements().map((item) => ({
    date: item.date,
    currency: item.currency,
    amount: Number(item.amount) || 0,
  }))
    .filter((item) => item.date && Number.isFinite(item.amount) && item.amount !== 0)
    .sort((left, right) => left.date.localeCompare(right.date));
}


function yearsQuarterAccountUsdForDate(date, rates) {
  const history = state.quarterCalc.loaded ? state.quarterCalc.history || {} : {};
  if (!state.quarterCalc.loaded) return { value: null, errors: [state.quarterCalc.loading ? "Portfolio DB data is loading." : "Portfolio DB data is not loaded."] };
  const parts = accountValuePartsForDate(date, history, rates);
  if (parts.errors.length) return { value: null, errors: parts.errors };
  if (!parts.rate || parts.totalTry == null) return { value: null, errors: [`${date}: account value could not be calculated.`] };
  return { value: round2(parts.totalTry / parts.rate), errors: [] };
}


export function yearsQuarterStartDate() {
  const firstFlowDate = [
    ...cashFlowAllMovements().map((item) => item.date),
    ...state.cryptoRows.map((item) => item.date),
  ]
    .filter(Boolean)
    .sort()[0];
  return firstFlowDate || "2022-09-30";
}


export function cryptoHistorySymbol(symbol) {
  const key = normalizeCryptoSymbol(symbol);
  if (!key) return "";
  return key.endsWith("-USD") ? key : `${key}-USD`;
}


function cryptoPortfolioUsdForDate(targetDate, history) {
  if (targetDate === TODAY_ISO) {
    const live = cashFlowCurrentCryptoPortfolioUsd();
    if (live > 0) return { value: round2(live), errors: [] };
  }
  const errors = [];
  const holdings = cryptoHoldingsForDate(targetDate);

  let value = 0;
  let hasPositiveHolding = false;
  for (const [symbol, quantity] of holdings.entries()) {
    if (!(quantity > 0)) continue;
    hasPositiveHolding = true;
    const historySymbol = cryptoHistorySymbol(symbol);
    const price = performancePriceForDate(performancePriceMap(history[historySymbol]), targetDate);
    if (!price) {
      errors.push(`${targetDate}: ${symbol} crypto historical price is missing.`);
      continue;
    }
    value += quantity * price;
  }

  return { value: round2(value), errors };
}


function cryptoQuarterMissingMessages(history, dates) {
  const missingBySymbol = new Map();
  for (const date of dates) {
    const holdings = cryptoHoldingsForDate(date);
    for (const [symbol, quantity] of holdings.entries()) {
      if (!(quantity > 0)) continue;
      const historySymbol = cryptoHistorySymbol(symbol);
      const price = performancePriceForDate(performancePriceMap(history[historySymbol]), date);
      if (!price) {
        if (!missingBySymbol.has(symbol)) missingBySymbol.set(symbol, new Set());
        missingBySymbol.get(symbol).add(date);
      }
    }
  }
  return [...missingBySymbol.entries()].map(([symbol, datesSet]) => {
    const dates = [...datesSet].sort();
    return `${symbol} crypto historical price is missing for ${dates.length} 1/4 date${dates.length === 1 ? "" : "s"}: ${dates.join(", ")}.`;
  });
}


export function cryptoRefreshErrorsForSymbols(symbols, refreshedHistory) {
  if (!symbols?.length || !refreshedHistory) return [];
  const errors = refreshedHistory.__errors || [];
  return symbols
    .filter((symbol) => !Array.isArray(refreshedHistory[symbol]) || !refreshedHistory[symbol].length)
    .map((symbol) => {
      const detail = errors.find((message) => String(message || "").includes(symbol));
      return detail || `${symbol}: crypto historical source refresh did not return D1 data.`;
    });
}


export function cryptoHistoryMissingForQuarterDates(historySymbol, history, dates) {
  const symbol = normalizeCryptoSymbol(String(historySymbol || "").replace(/-USD$/, ""));
  const priceMap = performancePriceMap(history[historySymbol]);
  for (const date of dates) {
    const quantity = cryptoHoldingsForDate(date).get(symbol) || 0;
    if (quantity > 0 && !performancePriceForDate(priceMap, date)) return true;
  }
  return false;
}


function cryptoHoldingsForDate(targetDate) {
  return state.cryptoRows
    .filter((row) => row.date && row.date <= targetDate)
    .reduce((map, row) => {
      const symbol = normalizeCryptoSymbol(row.symbol);
      if (!symbol) return map;
      map.set(symbol, (map.get(symbol) || 0) + (Number(row.quantity) || 0));
      return map;
    }, new Map());
}


function quarterStartOffsetLabel(dates) {
  if (!Array.isArray(dates) || dates.length < 2) return "";
  return `-${cashFlowDiffDays(dates[0], dates[1])}`;
}


export function yearsQuarterDates(startDate, endDate) {
  const result = [startDate];
  let cursor = quarterEndDateFor(startDate);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return result;
  while (cursor <= end) {
    const quarterDate = toIsoDate(cursor);
    if (quarterDate >= startDate) result.push(quarterDate);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 4, 0, 12);
  }
  if (!result.includes(TODAY_ISO)) result.push(TODAY_ISO);
  return [...new Set(result)].filter((date) => date >= startDate && date <= endDate).sort();
}


function quarterEndDateFor(dateValue) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return new Date("2022-09-30T12:00:00");
  const quarterEndMonth = Math.floor(date.getMonth() / 3) * 3 + 2;
  return new Date(date.getFullYear(), quarterEndMonth + 1, 0, 12);
}

