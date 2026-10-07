import { TODAY_ISO, elements, state } from "./state.js";
import { escapeHtml, escapeAttr, chunk, normalizeInputDate, formatDate, round2 } from "./util.js";
import { apiFetch } from "./api.js";
import { emptyMarketStatus } from "./settings.js";
import { refreshPrices } from "./abd.js";
import { refreshTrMarketData, trIsOpen, trCurrentOrExitValue } from "./tr.js";
import { refreshCryptoPrices } from "./crypto.js";
import { invalidateCashFlowReturns, cashBalancesForDate } from "./performance.js";
import { accountUsdCashSplitForDate, getYearsQuarterCashRows } from "./quarter.js";

export async function loadCashFlowData() {
  state.cashFlowLoadError = "";
  state.cashFlowMarketDataError = "";
  state.cashFlowStatusMessage = "";

  try {
    const movementsPayload = await apiFetch("/api/cash-flow");
    if (movementsPayload?.ok === false || movementsPayload?.error) {
      throw new Error(movementsPayload.error || "Cash flow data could not be loaded.");
    }
    state.cashFlowMovements = Array.isArray(movementsPayload?.movements) ? movementsPayload.movements : [];
    const statusPayload = await apiFetch("/api/cash-flow/status");
    const statusMovements = Array.isArray(statusPayload?.movements) ? statusPayload.movements : [];
    state.cashFlowStatusMessage = "";
    if (!state.cashFlowMovements.length) {
      if (statusMovements.length) {
        state.cashFlowMovements = statusMovements;
      }
      if (Number(statusPayload?.cashFlowCount) > 0) {
        const retryPayload = await apiFetch("/api/cash-flow");
        const retryMovements = Array.isArray(retryPayload?.movements) ? retryPayload.movements : [];
        if (retryMovements.length) state.cashFlowMovements = retryMovements;
      }
      if (!state.cashFlowMovements.length && statusPayload?.seedOwner === false) {
        state.cashFlowLoadError = "No cash flow movements found for this account.";
      }
      if (!state.cashFlowMovements.length) {
        state.cashFlowStatusMessage += " No cash flow rows were returned by the API.";
      }
    }
  } catch (error) {
    state.cashFlowMovements = [];
    state.cashFlowLoadError = error?.message === "Failed to fetch"
      ? "Cash flow API could not be reached."
      : error?.message || "Cash flow data could not be loaded.";
  }

  try {
    const yieldsPayload = await apiFetch("/api/yields?cacheOnly=1");
    if (yieldsPayload?.ok === false || yieldsPayload?.error) {
      throw new Error(yieldsPayload.error || "Yield data could not be loaded.");
    }
    state.cashFlowYields = {
      usd: { points: Array.isArray(yieldsPayload?.usd?.points) ? yieldsPayload.usd.points : [] },
      try: { points: Array.isArray(yieldsPayload?.try?.points) ? yieldsPayload.try.points : [] },
    };
    state.cashFlowYieldStatus = yieldsPayload?.status || { usdMissingMonths: 0, tryMissingMonths: 0, message: "" };
  } catch (error) {
    state.cashFlowYields = { usd: { points: [] }, try: { points: [] } };
    state.cashFlowYieldStatus = { usdMissingMonths: 0, tryMissingMonths: 0, message: "" };
    state.cashFlowMarketDataError = "Yield data is temporarily unavailable.";
  }

  try {
    await refreshCashFlowRates();
  } catch (error) {
    state.cashFlowRates = {};
    state.cashFlowLatestRate = null;
    state.cashFlowMarketDataError = "Exchange rate data is temporarily unavailable.";
  }

  renderCashFlow();
}


async function persistCashFlowMovements() {
  if (!state.session || state.cashFlowSaving) return;
  invalidateCashFlowReturns();
  state.cashFlowSaving = true;
  try {
    await apiFetch("/api/cash-flow", {
      method: "PUT",
      body: JSON.stringify({ movements: state.cashFlowMovements }),
    });
  } finally {
    state.cashFlowSaving = false;
  }
}


async function refreshCashFlowRates() {
  const dates = [...new Set([
    ...state.cashFlowMovements.map((item) => item.date <= TODAY_ISO ? item.date : TODAY_ISO),
    ...cashFlowYearEndDates(state.cashFlowMovements).filter((date) => date <= TODAY_ISO),
    TODAY_ISO,
  ])];

  state.cashFlowRates = {};
  if (!dates.length) {
    state.cashFlowLatestRate = null;
    return;
  }

  for (const batch of chunk(dates, 25)) {
    const payload = await apiFetch(`/api/rates?cacheOnly=1&dates=${encodeURIComponent(batch.join(","))}`);
    Object.assign(state.cashFlowRates, payload?.rates || {});
    state.cashFlowLatestRate = payload?.latest || state.cashFlowLatestRate;
  }
}


export async function addCashFlowMovement() {
  const noteInput = document.querySelector("#cashflow-note");
  const dateInput = document.querySelector("#cashflow-date");
  const tryInput = document.querySelector("#cashflow-try");
  const usdInput = document.querySelector("#cashflow-usd");
  const usdtInput = document.querySelector("#cashflow-usdt");
  const note = noteInput?.value.trim() || "";
  const date = normalizeInputDate(dateInput?.value || "") || dateInput?.value || TODAY_ISO;
  const tryAmount = cashFlowNum(tryInput?.value);
  const usdAmount = cashFlowNum(usdInput?.value);
  const usdtAmount = cashFlowNum(usdtInput?.value);
  const additions = [];

  if (tryAmount) additions.push({ id: `cash-${Date.now()}-try`, note, date, currency: "TRY", amount: tryAmount });
  if (usdAmount) additions.push({ id: `cash-${Date.now()}-usd`, note, date, currency: "USD", amount: usdAmount });
  if (usdtAmount) additions.push({ id: `cash-${Date.now()}-usdt`, note, date, currency: "USDT", amount: usdtAmount });
  if (!additions.length) return;

  state.cashFlowMovements = [...additions, ...state.cashFlowMovements];
  if (noteInput) noteInput.value = "";
  if (tryInput) tryInput.value = "";
  if (usdInput) usdInput.value = "";
  if (usdtInput) usdtInput.value = "";
  if (dateInput) dateInput.value = "";
  await persistCashFlowMovements();
  await refreshCashFlowRates();
  renderCashFlow();
}


export function renderCashFlow() {
  const rows = cashFlowAllMovements();
  const displayRows = rows.map(cashFlowEnrichForDisplay);
  elements.latestRateLabel.textContent = state.cashFlowLatestRate?.rate ? cashFlowDecimal2(state.cashFlowLatestRate.rate) : "-";
  elements.cashflowAbdPortfolioUsd.textContent = cashFlowMoney(cashFlowTotalPortfolioPlusCashUsd(), "USD");
  elements.cashflowTrPortfolioValue.textContent = cashFlowMoney(cashFlowCurrentTryPortfolioTry(), "TRY");
  renderCashFlowSummary(rows);
  renderMarketStatusStrip();
  updateStatusTab(cashFlowMessages());
  renderCashFlowMovements(displayRows);
}


function renderMarketStatusStrip() {
  const strip = document.getElementById("market-status-strip");
  if (!strip) return;
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const status = state.marketStatus || emptyMarketStatus();
  for (const card of strip.querySelectorAll(".market-status-card")) {
    const market = card.dataset.market;
    const info = status[market] || { fetchedAt: "", latestDate: "" };
    const dateEl = card.querySelector(".market-status-date");
    const fetchedEl = card.querySelector(".market-status-fetched");
    dateEl.textContent = info.latestDate ? formatMarketStatusDate(info.latestDate) : "—";
    fetchedEl.textContent = info.fetchedAt ? `${formatMarketStatusFetched(info.fetchedAt)}` : "no refresh yet";
    card.classList.remove("status-fresh", "status-recent", "status-stale", "status-error");
    const tone = classifyMarketStatus(market, info, todayDate);
    if (tone) card.classList.add(tone);
  }
}


function formatMarketStatusDate(isoDate) {
  if (!isoDate) return "—";
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return isoDate;
  // dd MMM ddd (e.g. "22 May Fri")
  const day = String(date.getUTCDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${day} ${months[date.getUTCMonth()]} ${weekdays[date.getUTCDay()]}`;
}


function formatMarketStatusFetched(isoTimestamp) {
  if (!isoTimestamp) return "—";
  const ts = new Date(isoTimestamp);
  if (!Number.isFinite(ts.getTime())) return isoTimestamp;
  const now = new Date();
  const diffMs = now.getTime() - ts.getTime();
  const sameDay = ts.toDateString() === now.toDateString();
  const hh = String(ts.getHours()).padStart(2, "0");
  const mm = String(ts.getMinutes()).padStart(2, "0");
  if (sameDay) return `refreshed ${hh}:${mm}`;
  if (diffMs < 36 * 60 * 60 * 1000) return `refreshed yesterday ${hh}:${mm}`;
  const daysAgo = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return `refreshed ${daysAgo}d ago`;
}


function classifyMarketStatus(market, info, todayDate) {
  if (!info.latestDate && !info.fetchedAt) return "";
  if (!info.latestDate) return "status-error";
  const latest = new Date(`${info.latestDate}T12:00:00Z`);
  if (!Number.isFinite(latest.getTime())) return "status-error";
  const dataAgeDays = Math.floor((todayDate.getTime() - latest.getTime()) / (24 * 60 * 60 * 1000));
  // Crypto trades 24/7 — stricter thresholds
  if (market === "crypto") {
    if (dataAgeDays <= 0) return "status-fresh";
    if (dataAgeDays <= 1) return "status-recent";
    return "status-stale";
  }
  // Stocks: weekend tolerance — Fri data is fine on Sat/Sun
  // Up to 3 days old is acceptable (Fri close visible thru Mon morning)
  if (dataAgeDays <= 1) return "status-fresh";
  if (dataAgeDays <= 3) return "status-recent";
  if (dataAgeDays <= 7) return "status-stale";
  return "status-error";
}


export async function refreshCashFlowCalculatedValues() {
  if (state.cashFlowMarketRefreshing) return;
  state.cashFlowMarketRefreshing = true;
  try {
    await Promise.allSettled([
      refreshPrices(),
      refreshTrMarketData(),
      refreshCryptoPrices(),
    ]);
  } finally {
    state.cashFlowMarketRefreshing = false;
    if (state.activeView === "cashflow") renderCashFlow();
  }
}


export function cashFlowMessages() {
  const messages = [];
  if (!state.cashFlowMovements.length) messages.push("No cash flow movements are currently loaded.");
  if (state.cashFlowLoadError) messages.push(state.cashFlowLoadError);
  if (state.cashFlowStatusMessage) messages.push(state.cashFlowStatusMessage);
  if (state.cashFlowMarketDataError) messages.push(state.cashFlowMarketDataError);
  if (state.gs3mStatus.refreshError) messages.push(`GS3M refresh failed; using saved D1 data. (${state.gs3mStatus.refreshError})`);
  if (state.gs3mStatus.source === "Fallback GS3M") messages.push("D1 has no saved GS3M data; temporary fallback curve is being used.");
  if (state.cashFlowYieldStatus.message) messages.push(state.cashFlowYieldStatus.message);
  const missingRates = cashFlowAllMovements().some((row) => row.currency === "TRY" && !(state.cashFlowRates[row.date]?.rate || state.cashFlowLatestRate?.rate));
  if (missingRates) messages.push("Some TRY movements are waiting for exchange rate data.");
  messages.push(...state.marketDataMessages);
  messages.push(...state.calculatedCacheMessages);
  messages.push(...state.returnCalc.messages);
  messages.push(...state.quarterCalc.messages);
  messages.push(...quarterDataStatusMessages());
  messages.push(...state.auditMessages);
  return messages.map(cashFlowFriendlyMessage);
}


function quarterDataStatusMessages() {
  if (!state.quarterCalc.loaded) return [];
  const grouped = new Map();
  const singles = new Set();
  for (const row of getYearsQuarterCashRows()) {
    if (!row.status || row.status === "OK") continue;
    const datedMessages = String(row.status).match(/\d{4}-\d{2}-\d{2}: [^.]+(?:\.)?/g) || [];
    if (!datedMessages.length) {
      singles.add(row.status);
      continue;
    }
    for (const message of datedMessages) {
      const match = message.match(/^(\d{4}-\d{2}-\d{2}):\s*(.+?)\.?$/);
      if (!match) {
        singles.add(message);
        continue;
      }
      const [, date, body] = match;
      if (!grouped.has(body)) grouped.set(body, new Set());
      grouped.get(body).add(date);
    }
  }
  const groupedMessages = [...grouped.entries()].map(([body, dates]) => {
    const sortedDates = [...dates].sort();
    return `1/4 ${body} for ${sortedDates.length} date${sortedDates.length === 1 ? "" : "s"}: ${sortedDates.join(", ")}.`;
  });
  return [...singles, ...groupedMessages];
}


export function renderStatus() {
  const messages = cashFlowMessages();
  updateStatusTab(messages);
  renderMarketStatusStrip();
  elements.statusSummary.textContent = messages.length ? `${messages.length} issue${messages.length === 1 ? "" : "s"}` : "Ready";
  elements.statusMessageList.innerHTML = messages.length
    ? messages.map((message) => `<div>${escapeHtml(message)}</div>`).join("")
    : `<div class="status-ok">No current issues.</div>`;
}


export function updateStatusTab(messages = cashFlowMessages()) {
  const hasIssues = messages.length > 0;
  elements.statusViewTab.classList.toggle("status-has-issues", hasIssues);
  elements.statusViewTab.classList.toggle("status-ok", !hasIssues);
}


function cashFlowFriendlyMessage(message) {
  if (message.includes("GS3M refresh failed")) return "USD opportunity cost is using saved D1 GS3M data because the live GS3M refresh failed.";
  if (message.includes("D1 has no saved GS3M")) return "D1 has no saved GS3M data yet; USD opportunity cost is using the temporary fallback curve.";
  if (message.includes("GS3M live source is unavailable")) return "USD opportunity cost is using the saved fallback curve because the live GS3M source is unavailable.";
  if (message.includes("GS3M has not refreshed")) return "USD opportunity cost data has not refreshed for three consecutive months.";
  if (message.includes("Yield data is temporarily unavailable")) return "Opportunity cost data is temporarily unavailable; related columns may be incomplete.";
  if (message.includes("Exchange rate data is temporarily unavailable")) return "Exchange-rate data is temporarily unavailable; TRY to USD conversions may be incomplete.";
  if (message.includes("Some TRY movements")) return "Some TRY cash movements are waiting for exchange-rate data.";
  if (message.includes("No cash flow movements")) return "No cash flow movements are loaded for this account.";
  if (message.includes("Yearly return needs cash flow")) return "Yearly return needs cash flow movements.";
  if (message.includes("Yearly return is missing historical price")) return message;
  if (message.includes("Yearly return data could not be loaded")) return "Yearly return data could not be loaded.";
  if (message.includes("historical price is missing")) return message;
  if (message.includes("quantity could not be calculated")) return message;
  if (message.includes("USD/TRY rate is missing")) return message;
  return message;
}


function renderCashFlowSummary(movements) {
  const years = cashFlowYearsInData(movements);
  const tryCalc = cashFlowCalculateInterestByYear(movements.filter((m) => m.currency === "TRY"), state.cashFlowYields.try.points, "TRY");
  const usdCalc = cashFlowCalculateInterestByYear(movements.filter((m) => isUsdLikeCurrency(m.currency)), state.cashFlowYields.usd.points, "USD");
  const total = cashFlowSummarizeYear("Total", years, tryCalc, usdCalc, true);
  const yearly = years.slice().sort((a, b) => b.localeCompare(a)).map((year) => cashFlowSummarizeYear(year, [year], tryCalc, usdCalc, false));

  // Columns are now per-asset (ABD / Crypto / TR). The first two rows are the
  // portfolio totals: "Current" (live values) then "Invested" (cost in), with
  // the per-year invested rows below.
  const currentRow = { label: "Current", returnPercent: null, abd: total.currentUsd, crypto: total.currentUsdt, tr: total.currentTryUsd };
  const investedRow = { label: "Invested", returnPercent: total.returnPercent, abd: total.investedUsd, crypto: total.investedUsdt, tr: total.investedTryUsd };
  const yearlyRows = yearly.map((row) => ({ label: row.label, returnPercent: row.returnPercent, abd: row.investedUsd, crypto: row.investedUsdt, tr: row.investedTryUsd }));
  elements.cashflowSummaryBody.innerHTML = [currentRow, investedRow, ...yearlyRows].map(cashFlowSummaryRow).join("");

  // Profit moved out of the table into its own card: full profit (opportunity
  // + tax deducted) / simple profit (current − invested, no opportunity).
  if (elements.cashflowProfitValue) {
    const simpleProfit = (total.currentUsd || 0) + (total.currentUsdt || 0) + (total.currentTryUsd || 0)
      - (total.investedUsd + total.investedUsdt + total.investedTryUsd);
    elements.cashflowProfitValue.textContent = total.profit == null
      ? "-"
      : `${cashFlowMoney(total.profit, "USD")} / ${cashFlowMoney(simpleProfit, "USD")}`;
    elements.cashflowProfitValue.className = total.profit == null ? "" : total.profit >= 0 ? "positive" : "negative";
  }
}


function renderCashFlowMovements(rows) {
  const movementRows = rows.length
    ? rows.map((row) => state.cashFlowEditingId === row.id ? cashFlowEditRow(row) : cashFlowDisplayRow(row)).join("")
    : `<tr><td class="muted" colspan="5">No cash flow movements.</td></tr>`;
  elements.cashflowBody.innerHTML = `${cashFlowDraftRow()}${movementRows}`;
  const draftRow = document.querySelector("[data-cashflow-draft]");
  draftRow?.addEventListener("focusout", () => {
    queueMicrotask(() => {
      if (!draftRow.contains(document.activeElement)) addCashFlowMovement();
    });
  });
  document.querySelectorAll("[data-cashflow-edit]").forEach((row) => row.addEventListener("click", () => {
    state.cashFlowEditingId = row.dataset.cashflowEdit;
    renderCashFlow();
  }));
  document.querySelectorAll("[data-cashflow-edit-row]").forEach((row) => {
    row.addEventListener("focusout", () => {
      queueMicrotask(() => {
        if (!row.contains(document.activeElement)) saveCashFlowEditById(row.dataset.cashflowEditRow);
      });
    });
  });
  document.querySelectorAll("[data-cashflow-save]").forEach((button) => button.addEventListener("click", saveCashFlowEdit));
  document.querySelectorAll("[data-cashflow-cancel]").forEach((button) => button.addEventListener("click", () => {
    state.cashFlowEditingId = null;
    renderCashFlow();
  }));
  document.querySelectorAll("[data-cashflow-delete]").forEach((button) => button.addEventListener("click", deleteCashFlowMovement));
}


function cashFlowDraftRow() {
  return `
    <tr class="cashflow-input-row" data-cashflow-draft>
      <td><input id="cashflow-note" type="text" placeholder="Note"></td>
      <td><input id="cashflow-date" type="text" inputmode="decimal" placeholder="dd.mm.yyyy"></td>
      <td><input id="cashflow-try" type="number" step="1" placeholder="TL"></td>
      <td><input id="cashflow-usd" type="number" step="1" placeholder="USD"></td>
      <td><input id="cashflow-usdt" type="number" step="1" placeholder="USDT"></td>
    </tr>
  `;
}


export function cashFlowAllMovements() {
  return [...state.cashFlowMovements].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
}


function cashFlowEnrichForDisplay(item) {
  const future = item.date > TODAY_ISO;
  const rate = item.currency === "TRY" ? (future ? state.cashFlowLatestRate?.rate || null : state.cashFlowRates[item.date]?.rate || null) : state.cashFlowLatestRate?.rate || null;
  const needsRate = item.currency === "TRY" && !rate;
  return { ...item, future, needsRate, rate };
}


function cashFlowEnrichForSummary(item) {
  const future = item.date > TODAY_ISO;
  const rate = item.currency === "TRY" ? (future ? state.cashFlowLatestRate?.rate || null : state.cashFlowRates[item.date]?.rate || null) : state.cashFlowLatestRate?.rate || null;
  const needsRate = item.currency === "TRY" && !rate;
  const entryUsdValue = isUsdLikeCurrency(item.currency) ? item.amount : (rate ? item.amount / rate : 0);
  return { ...item, future, needsRate, rate, entryUsdValue, year: item.date.slice(0, 4) };
}


function cashFlowCalculateInterestByYear(movements, curvePoints, currency) {
  const result = {};
  let balance = 0;
  const start = cashFlowMinDate(movements);
  if (!start || !curvePoints?.length) return result;
  const end = TODAY_ISO;
  const movementMap = cashFlowGroupMovementsByDate(movements, currency);
  const boundaries = new Set([start, end]);
  for (const date of Object.keys(movementMap)) boundaries.add(date > TODAY_ISO ? TODAY_ISO : date);
  for (const point of curvePoints) if (point.date >= start && point.date <= end) boundaries.add(point.date);
  for (const y of cashFlowYearsInData(movements)) {
    const endDate = `${y}-12-31`;
    if (endDate >= start && endDate <= end) boundaries.add(endDate);
    const nextYear = `${Number(y) + 1}-01-01`;
    if (nextYear >= start && nextYear <= end) boundaries.add(nextYear);
  }

  const dates = [...boundaries].sort();
  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index];
    if (movementMap[date]) balance += movementMap[date].reduce((total, item) => total + item.amount, 0);
    const next = dates[index + 1];
    if (!next) break;
    const days = cashFlowDiffDays(date, next);
    if (days <= 0 || balance === 0) continue;
    const rate = cashFlowYieldForDate(curvePoints, date);
    const interest = balance * (rate / 100) * days / 365;
    balance += interest;
    const year = date.slice(0, 4);
    result[year] ||= { interest: 0, balance: 0 };
    result[year].interest += interest;
    result[year].balance = balance;
  }

  return result;
}


function cashFlowSummarizeYear(label, years, tryCalc, usdCalc, isTotal) {
  const all = cashFlowAllMovements().map(cashFlowEnrichForSummary).filter((row) => !row.needsRate);
  const rows = isTotal ? all : all.filter((row) => years.includes(row.year));
  const investedUsd = cashFlowSum(rows.filter((row) => row.currency === "USD"), "entryUsdValue");
  const investedUsdt = cashFlowSum(rows.filter((row) => row.currency === "USDT"), "entryUsdValue");
  const investedTryUsd = cashFlowSum(rows.filter((row) => row.currency === "TRY"), "entryUsdValue");
  const positiveInvested = cashFlowSum(rows.filter((row) => row.entryUsdValue > 0), "entryUsdValue");
  const opportunityTryUsd = years.reduce((total, year) => total + cashFlowConvertTryInterestToUsd(year, tryCalc[year]?.interest || 0), 0);
  const opportunityUsdCost = years.reduce((total, year) => total + (usdCalc[year]?.interest || 0), 0);
  // "Current" per asset = holdings + that asset's uninvested cash (USD↔ABD,
  // USDT↔Crypto, TRY↔TR). Cash MUST be included so it is comparable with
  // "Invested" (which counts every deposit) — otherwise leftover cash is
  // dropped and profit is understated.
  const rate = state.cashFlowLatestRate?.rate || 0;
  const cashSplit = isTotal ? accountUsdCashSplitForDate(TODAY_ISO) : { usd: 0, usdt: 0 };
  const cashTry = isTotal ? (cashBalancesForDate(TODAY_ISO).try || 0) : 0;
  const currentUsd = isTotal ? round2(cashFlowCurrentPortfolioUsd() + (cashSplit.usd || 0)) : null;
  const currentUsdt = isTotal ? round2(cashFlowCurrentCryptoPortfolioUsd() + (cashSplit.usdt || 0)) : null;
  const currentTryUsd = isTotal ? round2(cashFlowCurrentTryPortfolioUsd() + (rate ? cashTry / rate : 0)) : null;
  const totalCurrent = (currentUsd || 0) + (currentUsdt || 0) + (currentTryUsd || 0);
  const totalInvested = investedUsd + investedUsdt + investedTryUsd;
  const totalOpportunity = opportunityUsdCost + opportunityTryUsd;
  const profit = currentUsd !== null || currentUsdt !== null || currentTryUsd !== null ? totalCurrent - totalInvested - totalOpportunity : null;
  const returnPercent = isTotal
    ? cashFlowPercent(profit, positiveInvested)
    : cashFlowTimeWeightedReturnPercent(label);
  return { label, returnPercent, investedUsd, investedUsdt, investedTryUsd, currentUsd, currentUsdt, currentTryUsd, opportunityUsdCost, opportunityTryUsd, profit };
}


export function cashFlowCurrentPortfolioUsd() {
  return round2(state.openLots.reduce((total, lot) => total + ((lot.referencePrice != null ? lot.referencePrice : 0) * lot.remainingShares), 0));
}


// Grand total shown in the top "Portfolio + Cash" card: current value of every
// holding (ABD + crypto + TR, all in USD) plus the uninvested cash balance
// (USD cash + TRY cash converted at the latest rate).
function cashFlowTotalPortfolioPlusCashUsd() {
  const portfolioUsd = cashFlowCurrentPortfolioUsd()
    + cashFlowCurrentCryptoPortfolioUsd()
    + cashFlowCurrentTryPortfolioUsd();
  const cash = cashBalancesForDate(TODAY_ISO);
  const rate = state.cashFlowLatestRate?.rate;
  const cashUsd = (Number(cash.usd) || 0) + (rate ? (Number(cash.try) || 0) / rate : 0);
  return round2(portfolioUsd + cashUsd);
}


export function cashFlowCurrentCryptoPortfolioUsd() {
  return round2(state.cryptoOpenLots.reduce((total, lot) => total + ((lot.referencePrice != null ? lot.referencePrice : 0) * lot.remainingShares), 0));
}


function cashFlowCurrentTryPortfolioUsd() {
  const rate = state.cashFlowLatestRate?.rate;
  if (!rate) return 0;
  return round2(cashFlowCurrentTryPortfolioTry() / rate);
}


export function cashFlowCurrentTryPortfolioTry() {
  const openTryValue = state.trRows
    .filter((row) => trIsOpen(row))
    .reduce((total, row) => total + (Number(trCurrentOrExitValue(row)) || 0), 0);
  return round2(openTryValue);
}


function cashFlowTrPortfolioValueLabel() {
  const tryValue = cashFlowCurrentTryPortfolioTry();
  const usdValue = cashFlowCurrentTryPortfolioUsd();
  return `${cashFlowMoney(tryValue, "TRY")} / ${cashFlowMoney(usdValue, "USD")}`;
}


function cashFlowPercent(profit, invested) {
  if (!Number.isFinite(profit) || !Number.isFinite(invested) || invested === 0) return null;
  return round2((profit / Math.abs(invested)) * 100);
}


function cashFlowTimeWeightedReturnPercent(year) {
  if (!/^\d{4}$/.test(String(year))) return null;
  if (!state.returnCalc.loaded) return null;
  if (!Object.keys(state.returnCalc.history || {}).length) return null;
  if (!state.auditRowsCache) return null;
  const totalRow = state.auditRowsCache.find((row) => row.total && row.year === String(year));
  return totalRow?.returnPercent ?? null;
}


function cashFlowConvertTryInterestToUsd(year, interestTry) {
  if (!interestTry) return 0;
  const conversionDate = year === TODAY_ISO.slice(0, 4) ? TODAY_ISO : `${year}-12-31`;
  const rate = state.cashFlowRates[conversionDate]?.rate || state.cashFlowLatestRate?.rate;
  return rate ? interestTry / rate : 0;
}


function cashFlowSummaryRow(row) {
  const isSummary = row.label === "Current" || row.label === "Invested";
  const pctClass = row.returnPercent == null ? "muted" : row.returnPercent >= 0 ? "positive" : "negative";
  const pct = row.returnPercent == null ? "" : `%${Math.round(row.returnPercent)}`;
  return `<tr class="${isSummary ? "total-row" : ""}"><td class="return-percent ${pctClass}">${pct}</td><td>${row.label}</td><td>${cashFlowEmptyMoney(row.tr)}</td><td>${cashFlowEmptyMoney(row.abd)}</td><td>${cashFlowEmptyMoney(row.crypto)}</td></tr>`;
}


function cashFlowDisplayRow(row) {
  const toneClass = row.amount >= 0 ? "row-positive" : "row-negative";
  const stateClass = row.future ? "future-rate" : row.needsRate ? "missing-rate" : "";
  return `<tr class="clickable-row ${toneClass} ${stateClass}" data-cashflow-edit="${row.id}"><td>${escapeHtml(row.note || "")}</td><td>${formatDate(row.date)}</td><td>${row.currency === "TRY" ? cashFlowSignedPlain(row.amount) : ""}</td><td>${row.currency === "USD" ? cashFlowSignedPlain(row.amount) : ""}</td><td>${row.currency === "USDT" ? cashFlowSignedPlain(row.amount) : ""}</td></tr>`;
}


function cashFlowEditRow(row) {
  return `<tr class="edit-row cashflow-input-row" data-cashflow-edit-row="${row.id}"><td><input id="cashflow-edit-note" value="${escapeAttr(row.note || "")}"></td><td><input id="cashflow-edit-date" type="text" inputmode="decimal" value="${formatDate(row.date)}"></td><td><input id="cashflow-edit-try" type="number" step="1" value="${row.currency === "TRY" ? row.amount : ""}"></td><td><input id="cashflow-edit-usd" type="number" step="1" value="${row.currency === "USD" ? row.amount : ""}"></td><td><div class="edit-grid"><input id="cashflow-edit-usdt" type="number" step="1" value="${row.currency === "USDT" ? row.amount : ""}"><button class="danger" data-cashflow-delete="${row.id}" type="button">Delete</button></div></td></tr>`;
}


async function saveCashFlowEdit(event) {
  await saveCashFlowEditById(event.currentTarget.dataset.cashflowSave);
}


async function saveCashFlowEditById(id) {
  if (!id) return;
  const tryAmount = cashFlowNum(document.querySelector("#cashflow-edit-try")?.value);
  const usdAmount = cashFlowNum(document.querySelector("#cashflow-edit-usd")?.value);
  const usdtAmount = cashFlowNum(document.querySelector("#cashflow-edit-usdt")?.value);
  const currency = usdtAmount ? "USDT" : usdAmount ? "USD" : "TRY";
  const amount = usdtAmount || usdAmount || tryAmount;
  if (!amount) {
    state.cashFlowEditingId = null;
    renderCashFlow();
    return;
  }

  state.cashFlowMovements = state.cashFlowMovements.map((item) => item.id !== id ? item : {
    ...item,
    note: document.querySelector("#cashflow-edit-note")?.value.trim() || "",
    date: normalizeInputDate(document.querySelector("#cashflow-edit-date")?.value || "") || document.querySelector("#cashflow-edit-date")?.value || TODAY_ISO,
    currency,
    amount,
  });

  state.cashFlowEditingId = null;
  await persistCashFlowMovements();
  await refreshCashFlowRates();
  renderCashFlow();
}


async function deleteCashFlowMovement(event) {
  event.preventDefault();
  event.stopPropagation();
  const id = event.currentTarget.dataset.cashflowDelete;
  const row = state.cashFlowMovements.find((item) => item.id === id);
  if (!row) return;
  if (!window.confirm?.("Delete this cash flow movement?")) return;
  state.cashFlowMovements = state.cashFlowMovements.filter((item) => item.id !== id);
  state.cashFlowEditingId = null;
  await persistCashFlowMovements();
  await refreshCashFlowRates();
  renderCashFlow();
}


function cashFlowYearEndDates(movements) {
  return cashFlowYearsInData(movements).map((year) => `${year}-12-31`);
}


export function cashFlowYearsInData(movements) {
  return [...new Set(movements.map((item) => item.date.slice(0, 4)))].filter(Boolean).sort();
}


function cashFlowMinDate(movements) {
  return movements.length ? movements.reduce((min, item) => item.date < min ? item.date : min, movements[0].date) : null;
}


function cashFlowGroupMovementsByDate(movements) {
  return movements.reduce((map, item) => {
    const date = item.date > TODAY_ISO ? TODAY_ISO : item.date;
    (map[date] ||= []).push(item);
    return map;
  }, {});
}


export function cashFlowDiffDays(left, right) {
  return Math.max(0, Math.round((new Date(`${right}T12:00:00`) - new Date(`${left}T12:00:00`)) / 86400000));
}


export function cashFlowYieldForDate(points, date) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  let found = sorted[0]?.rate || 0;
  for (const point of sorted) {
    if (point.date <= date) found = point.rate;
    else break;
  }
  return found;
}


function cashFlowSum(items, key) {
  return items.reduce((total, item) => total + (item[key] || 0), 0);
}


export function cashFlowNum(value) {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}


export function isUsdLikeCurrency(currency) {
  return currency === "USD" || currency === "USDT";
}


export function cashFlowInteger(value) {
  const sign = value < 0 ? "-" : "";
  return sign + Math.round(Math.abs(value || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}


export function cashFlowMoney(value, currency) {
  return `${currency === "TRY" ? "TL " : "$"}${cashFlowInteger(value)}`;
}


function cashFlowEmptyMoney(value) {
  return value === null || value === undefined ? "-" : cashFlowMoney(value, "USD");
}


export function cashFlowSignedPlain(value) {
  return `${value > 0 ? "+" : ""}${cashFlowInteger(value)}`;
}


export function cashFlowDecimal2(value) {
  return Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


function cashFlowDecimal1(value) {
  return Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

