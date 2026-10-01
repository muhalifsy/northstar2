import { preloadMarketDataSoon, preloadQuarterDataSoon } from "./shell.js";
import { TAX_SETTINGS_KEY, REBUY_MONTHS_KEY, DEFAULT_REBUY_MONTHS, MANUAL_PORTFOLIO_KEY, MARKET_STATUS_KEY, DEFAULT_TAX_RATES, elements, state } from "./state.js";
import { apiFetch } from "./api.js";
import { refreshPrices, rebuildPortfolio } from "./abd.js";
import { renderTrPortfolio, refreshTrMarketData } from "./tr.js";
import { refreshCryptoPrices, rebuildCryptoPortfolio } from "./crypto.js";
import { renderCashFlow, renderStatus, cashFlowAllMovements, cashFlowNum, cashFlowInteger } from "./cashflow.js";
import { invalidateCashFlowReturns, loadQuarterData } from "./performance.js";
import { quarterPlusRows, getQuarterPlusRows } from "./quarter.js";

// Tax rates live in D1 user settings (key "taxRates") so every device uses the
// same rates; localStorage is only the offline/first-paint copy.
function normalizeTaxRates(value) {
  const parsed = value && typeof value === "object" ? value : {};
  const pick = (key) => {
    const number = Number(parsed[key]);
    return parsed[key] !== "" && parsed[key] != null && Number.isFinite(number) ? number : DEFAULT_TAX_RATES[key];
  };
  return { tr: pick("tr"), usa: pick("usa"), crypto: pick("crypto") };
}


export function loadTaxRates() {
  try {
    return normalizeTaxRates(JSON.parse(localStorage.getItem(TAX_SETTINGS_KEY) || "{}"));
  } catch {
    return { ...DEFAULT_TAX_RATES };
  }
}


function saveTaxRates() {
  try {
    localStorage.setItem(TAX_SETTINGS_KEY, JSON.stringify(state.taxRates));
  } catch {}
}


let persistTaxRatesTimer = null;


function persistTaxRatesSoon() {
  clearTimeout(persistTaxRatesTimer);
  persistTaxRatesTimer = setTimeout(() => {
    if (!state.session) return;
    apiFetch("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ settings: { taxRates: state.taxRates } }),
    }).catch(() => {});
  }, 600);
}


function normalizeRebuyMonths(value) {
  const number = Number(value);
  return value !== "" && value != null && Number.isFinite(number) && number >= 0 ? number : DEFAULT_REBUY_MONTHS;
}


export function loadRebuyMonths() {
  try {
    return normalizeRebuyMonths(localStorage.getItem(REBUY_MONTHS_KEY));
  } catch {
    return DEFAULT_REBUY_MONTHS;
  }
}


export function rebuyMergeMonths() {
  return normalizeRebuyMonths(state?.rebuyMonths);
}


let persistRebuyMonthsTimer = null;


export function handleRebuyMonthsChange() {
  state.rebuyMonths = normalizeRebuyMonths(elements.rebuyMonths.value);
  try {
    localStorage.setItem(REBUY_MONTHS_KEY, String(state.rebuyMonths));
  } catch {}
  clearTimeout(persistRebuyMonthsTimer);
  persistRebuyMonthsTimer = setTimeout(() => {
    if (!state.session) return;
    apiFetch("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ settings: { rebuyMonths: state.rebuyMonths } }),
    }).catch(() => {});
  }, 600);
  renderTrPortfolio();
  rebuildPortfolio();
  rebuildCryptoPortfolio();
}


export function applyTaxRatesToInputs() {
  if (elements.rebuyMonths) elements.rebuyMonths.value = state.rebuyMonths;
  elements.taxRateTr.value = state.taxRates.tr;
  elements.taxRateUsa.value = state.taxRates.usa;
  if (elements.taxRateCrypto) elements.taxRateCrypto.value = state.taxRates.crypto;
}


export function taxRateDecimal(market) {
  const value = market === "tr" ? state.taxRates.tr
    : market === "crypto" ? state.taxRates.crypto
    : state.taxRates.usa;
  return Math.max(Number(value) || 0, 0) / 100;
}


export function handleTaxRateChange() {
  state.taxRates = {
    tr: cashFlowNum(elements.taxRateTr.value),
    usa: cashFlowNum(elements.taxRateUsa.value),
    crypto: elements.taxRateCrypto ? cashFlowNum(elements.taxRateCrypto.value) : state.taxRates.crypto,
  };
  saveTaxRates();
  persistTaxRatesSoon();
  renderTrPortfolio();
  rebuildPortfolio();
  rebuildCryptoPortfolio();
}


export function loadManualPortfolioValues() {
  try {
    return JSON.parse(localStorage.getItem(MANUAL_PORTFOLIO_KEY) || "{}");
  } catch {
    return {};
  }
}


export function emptyMarketStatus() {
  return {
    abd: { fetchedAt: "", latestDate: "" },
    tr: { fetchedAt: "", latestDate: "" },
    crypto: { fetchedAt: "", latestDate: "" },
  };
}


export function loadMarketStatus() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MARKET_STATUS_KEY) || "{}");
    const fresh = emptyMarketStatus();
    for (const market of ["abd", "tr", "crypto"]) {
      if (parsed[market] && typeof parsed[market] === "object") {
        fresh[market] = {
          fetchedAt: String(parsed[market].fetchedAt || ""),
          latestDate: String(parsed[market].latestDate || ""),
        };
      }
    }
    return fresh;
  } catch {
    return emptyMarketStatus();
  }
}


function saveMarketStatus() {
  try {
    localStorage.setItem(MARKET_STATUS_KEY, JSON.stringify(state.marketStatus));
  } catch {}
}


export function updateMarketStatus(market, payload) {
  if (!state.marketStatus || !state.marketStatus[market]) return;
  const current = state.marketStatus[market];
  // Only update fetchedAt if the response actually returned a timestamp (refresh attempted)
  if (payload?.fetchedAt) current.fetchedAt = payload.fetchedAt;
  // Promote latestDate only if newer than what we have
  if (payload?.latestDate && payload.latestDate > current.latestDate) {
    current.latestDate = payload.latestDate;
  }
  saveMarketStatus();
}


export function handleManualPortfolioChange() {
  if (!elements.manualAbdPortfolioUsd || !elements.manualTrPortfolioTry) return;
  state.manualPortfolio = {
    abd: String(parseManualMoney(elements.manualAbdPortfolioUsd.value) ?? ""),
    tr: String(parseManualMoney(elements.manualTrPortfolioTry.value) ?? ""),
  };
  localStorage.setItem(MANUAL_PORTFOLIO_KEY, JSON.stringify({
    abd: state.manualPortfolio.abd,
    tr: state.manualPortfolio.tr,
  }));
  persistUserSettings().catch(() => {});
  renderStatus();
  preloadMarketDataSoon();
  preloadQuarterDataSoon();
}


export async function loadUserSettings() {
  try {
    const payload = await apiFetch("/api/settings");
    const serverTaxRates = payload?.settings?.taxRates;
    if (serverTaxRates && typeof serverTaxRates === "object") {
      const next = normalizeTaxRates(serverTaxRates);
      const changed = JSON.stringify(next) !== JSON.stringify(state.taxRates);
      state.taxRates = next;
      saveTaxRates();
      applyTaxRatesToInputs();
      if (changed) {
        renderTrPortfolio();
        rebuildPortfolio();
        rebuildCryptoPortfolio();
      }
    } else if (payload?.settings) {
      // First run after the move: seed D1 with this browser's rates.
      persistTaxRatesSoon();
    }
    const serverRebuyMonths = payload?.settings?.rebuyMonths;
    if (serverRebuyMonths != null && normalizeRebuyMonths(serverRebuyMonths) !== state.rebuyMonths) {
      state.rebuyMonths = normalizeRebuyMonths(serverRebuyMonths);
      try {
        localStorage.setItem(REBUY_MONTHS_KEY, String(state.rebuyMonths));
      } catch {}
      if (elements.rebuyMonths) elements.rebuyMonths.value = state.rebuyMonths;
      renderTrPortfolio();
      rebuildPortfolio();
      rebuildCryptoPortfolio();
    }
    const manualPortfolio = payload?.settings?.manualPortfolio;
    if (manualPortfolio && typeof manualPortfolio === "object") {
      state.manualPortfolio = {
        abd: manualPortfolio.abd || "",
        tr: manualPortfolio.tr || "",
      };
      localStorage.setItem(MANUAL_PORTFOLIO_KEY, JSON.stringify(state.manualPortfolio));
      if (elements.manualAbdPortfolioUsd) elements.manualAbdPortfolioUsd.value = formatManualMoney(state.manualPortfolio.abd);
      if (elements.manualTrPortfolioTry) elements.manualTrPortfolioTry.value = formatManualMoney(state.manualPortfolio.tr);
    }
  } catch {}
}


export function formatManualPortfolioInputs() {
  if (elements.manualAbdPortfolioUsd) elements.manualAbdPortfolioUsd.value = formatManualMoney(elements.manualAbdPortfolioUsd.value);
  if (elements.manualTrPortfolioTry) elements.manualTrPortfolioTry.value = formatManualMoney(elements.manualTrPortfolioTry.value);
}


function parseManualMoney(value) {
  if (value === "" || value === null || value === undefined) return null;
  const normalized = String(value).trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}


export function formatManualMoney(value) {
  const parsed = parseManualMoney(value);
  return parsed == null ? "" : cashFlowInteger(parsed);
}


async function persistUserSettings() {
  if (!state.session) return;
  await apiFetch("/api/settings", {
    method: "PUT",
    body: JSON.stringify({ settings: { manualPortfolio: state.manualPortfolio } }),
  });
}


export async function loadQuarterCalculatedCache() {
  try {
    const payload = await apiFetch("/api/calculated-cache?key=quarter-plus");
    if (payload?.key !== "quarter-plus") {
      state.calculatedCacheMessages = ["Calculated cache API is not active yet; deploy the Worker update."];
      return;
    }
    const value = payload?.value;
    if (!value || !Array.isArray(value.rows)) {
      state.calculatedCacheMessages = ["1/4 calculated cache is empty; use Refresh data once to create it."];
      return;
    }
    // Cache signature mismatch (a transaction or setting changed since the
    // last Refresh) is the normal post-edit state, not an error worth
    // flagging in Status. We still load the stale rows so the 1/4 view shows
    // something — the next Refresh recomputes and overwrites.
    const isStale = value.signature !== calculatedCacheSignature();
    state.quarterRowsCache = value.rows;
    state.quarterPlusRowsCache = Array.isArray(value.quarterPlusRows) ? value.quarterPlusRows : null;
    state.quarterCacheUpdatedAt = payload.updatedAt || value.updatedAt || "";
    state.quarterCalc = {
      ...state.quarterCalc,
      loading: false,
      loaded: true,
      messages: Array.isArray(value.messages) ? value.messages : [],
      history: {},
      rates: {},
      source: isStale ? "calculated-cache-stale" : "calculated-cache",
    };
    state.calculatedCacheMessages = [];
  } catch (error) {
    state.calculatedCacheMessages = [`1/4 calculated cache could not be loaded. ${error?.message || ""}`.trim()];
  }
}


export async function saveQuarterCalculatedCache() {
  if (!state.session || !state.quarterRowsCache) return;
  const value = {
    signature: calculatedCacheSignature(),
    rows: state.quarterRowsCache,
    quarterPlusRows: getQuarterPlusRows(),
    messages: state.quarterCalc.messages || [],
    updatedAt: new Date().toISOString(),
  };
  const payload = await apiFetch("/api/calculated-cache", {
    method: "PUT",
    body: JSON.stringify({ key: "quarter-plus", value }),
  });
  if (payload?.key !== "quarter-plus" || !payload?.updatedAt) {
    state.calculatedCacheMessages = ["Calculated cache could not be saved; deploy the Worker update."];
    throw new Error("Calculated cache save failed.");
  }
  state.quarterCacheUpdatedAt = payload?.updatedAt || value.updatedAt;
  state.calculatedCacheMessages = [];
}


function calculatedCacheSignature() {
  const compactRows = (rows) => rows.map((row) => ({
    id: row.id || "",
    symbol: row.symbol || "",
    date: row.date || row.buyDate || "",
    sellDate: row.sellDate || "",
    currency: row.currency || "",
    amount: row.amount ?? "",
    quantity: row.quantity ?? row.pcs ?? "",
    total: row.total ?? row.buyTotal ?? "",
    sellTotal: row.sellTotal ?? "",
    splitDate: row.splitDate || "",
    splitFactor: row.splitFactor ?? "",
    splitQuantity: row.splitQuantity ?? "",
  }));
  return JSON.stringify({
    version: "quarter-cash-crypto-usdt-v6-rebuy-months",
    rebuyMonths: state.rebuyMonths,
    taxRates: state.taxRates,
    cashFlow: compactRows(cashFlowAllMovements()),
    abd: compactRows(state.transactions),
    tr: compactRows(state.trRows),
    crypto: compactRows(state.cryptoRows),
  });
}


// Cash Flow auto-refresh is "smart": it only re-fetches when the cached data
// is older than this. Repeated visits within the window use the cache instead
// of hammering the market APIs on every tab switch.
const CALCULATED_REFRESH_STALE_MS = 5 * 60 * 1000;


export function maybeAutoRefreshCalculated() {
  const last = state.lastCalculatedRefreshAt || 0;
  if (Date.now() - last >= CALCULATED_REFRESH_STALE_MS) {
    refreshCalculatedData().catch(() => {});
  }
}


async function refreshCalculatedData() {
  if (state.calculatedRefreshing) return;
  state.calculatedRefreshing = true;
  try {
    invalidateCashFlowReturns();
    await Promise.allSettled([
      refreshPrices({ fresh: true }),
      refreshTrMarketData({ fresh: true }),
      refreshCryptoPrices({ fresh: true }),
    ]);
    await loadQuarterData({ force: true });
    renderCashFlow();
    renderStatus();
  } finally {
    state.lastCalculatedRefreshAt = Date.now();
    state.calculatedRefreshing = false;
  }
}

