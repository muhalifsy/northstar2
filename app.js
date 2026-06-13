const API_BASE = "";
const AUTH_TOKEN_KEY = "northstar-secure-token";
const SPLIT_SCAN_KEY = "northstar-last-split-scan";
const TAX_SETTINGS_KEY = "northstar-tax-settings";
const MANUAL_PORTFOLIO_KEY = "northstar-manual-portfolio-values";
const MARKET_STATUS_KEY = "northstar-market-status";
const DEFAULT_FEE = 1.5;
const DEFAULT_TAX_RATES = { tr: 0, usa: 20 };
const BUILD_VERSION = "20260515w";
const TODAY_ISO = new Date().toISOString().slice(0, 10);
const TR_YAHOO_SYMBOL_OVERRIDES = {
  ALTINS1: "ALTINS1",
  // BTC bought in TL lives in the TR tab; the worker derives BTC-TRY from
  // BTC-USD × TCMB USD/TRY (no BIST/Yahoo listing exists for it).
  BTC: "BTC-TRY",
  DMLKTG: "DMLKT",
  "DMLKT.G": "DMLKT",
  "GLDR.F": "GLDTR.IS",
  "GLDTR.F": "GLDTR.IS",
  "GMSTR.F": "GMSTR.IS",
  RTLAB: "RTALB.IS",
  RTALB: "RTALB.IS",
  "USDTR.F": "USDTR.IS",
};

const seedTransactions = [
  { symbol: "TLT", date: "2023-11-02", pcs: 58, price: 86.5, amount: 5017, fee: 1.5, total: 5018.5, note: "" },
  { symbol: "TSLA", date: "2023-11-22", pcs: 43, price: 232, amount: 9976, fee: 1.5, total: 9977.5, note: "" },
  { symbol: "NVDA", date: "2023-11-24", pcs: 20, price: 483, amount: 9660, fee: 1.5, total: 9661.5, note: "a" },
  { symbol: "GLD", date: "2023-12-08", pcs: 26, price: 186, amount: 4836, fee: 1.5, total: 4837.5, note: "" },
  { symbol: "NVDA", date: "2024-02-16", pcs: -13, price: 744, amount: -9672, fee: 1.5, total: -9670.5, note: "a" },
  { symbol: "TSLA", date: "2024-06-05", pcs: 57, price: 174, amount: 9918, fee: 1.5, total: 9919.5, note: "" },
  { symbol: "QQQ", date: "2024-08-16", pcs: 10, price: 473, amount: 4730, fee: 1.5, total: 4731.5, note: "" },
  { symbol: "MSTR", date: "2024-09-05", pcs: 41, price: 121.9, amount: 4997.9, fee: 1.5, total: 4999.4, note: "" },
  { symbol: "SOFI", date: "2024-10-02", pcs: 657, price: 7.6, amount: 4993.2, fee: 1.5, total: 4994.7, note: "" },
  { symbol: "AMZN", date: "2024-10-23", pcs: 26, price: 188, amount: 4888, fee: 1.5, total: 4889.5, note: "" },
  { symbol: "AMD", date: "2024-12-09", pcs: 37, price: 132, amount: 4884, fee: 1.5, total: 4885.5, note: "" },
  { symbol: "SEZL", date: "2025-01-17", pcs: 126, price: 38.333333333333336, amount: 4830, fee: 1.5, total: 4831.5, note: "b" },
  { symbol: "CRDO", date: "2025-01-27", pcs: 19, price: 53, amount: 1007, fee: 1.5, total: 1008.5, note: "" },
  { symbol: "SEZL", date: "2025-05-22", pcs: -56, price: 103, amount: -5768, fee: 1.5, total: -5766.5, note: "b" },
  { symbol: "NBIS", date: "2025-05-22", pcs: 133, price: 37.5, amount: 4987.5, fee: 1.5, total: 4989, note: "" },
  { symbol: "HIMS", date: "2025-06-23", pcs: 114, price: 43.5, amount: 4959, fee: 1.5, total: 4960.5, note: "" },
  { symbol: "OSCR", date: "2025-07-11", pcs: 353, price: 14.138810198300283, amount: 4991, fee: 3, total: 4994, note: "", chainId: "OSCR::merged-2025-07" },
  { symbol: "APP", date: "2025-08-14", pcs: 11, price: 429, amount: 4719, fee: 1.5, total: 4720.5, note: "" },
  { symbol: "RKLB", date: "2025-08-18", pcs: 100, price: 45.48, amount: 4548, fee: 1.5, total: 4549.5, note: "" },
  { symbol: "SMCI", date: "2025-09-12", pcs: 111, price: 45.03, amount: 4998.33, fee: 1.5, total: 4999.83, note: "d" },
  { symbol: "RBRK", date: "2025-09-15", pcs: 66, price: 75.67, amount: 4994.22, fee: 1.5, total: 4995.72, note: "" },
  { symbol: "SLNH", date: "2025-09-25", pcs: 356, price: 2.8, amount: 996.8, fee: 1.5, total: 998.3, note: "" },
  { symbol: "RDDT", date: "2025-10-02", pcs: 25, price: 199, amount: 4975, fee: 1.5, total: 4976.5, note: "" },
  { symbol: "INFQ", date: "2025-10-06", pcs: 66, price: 14.98, amount: 988.68, fee: 1.5, total: 990.18, note: "" },
  { symbol: "IMSR", date: "2025-10-06", pcs: 53, price: 18.69, amount: 990.57, fee: 1.5, total: 992.07, note: "e" },
  { symbol: "CRWV", date: "2025-10-09", pcs: 26, price: 139, amount: 3614, fee: 1.5, total: 3615.5, note: "c" },
  { symbol: "IOT", date: "2025-10-09", pcs: 24, price: 40, amount: 960, fee: 1.5, total: 961.5, note: "" },
  { symbol: "MSTR", date: "2025-10-31", pcs: 79, price: 272.59, amount: 21534.61, fee: 1.5, total: 21536.11, note: "" },
  { symbol: "AXON", date: "2025-11-07", pcs: 47, price: 606.2, amount: 28491.4, fee: 1.5, total: 28492.9, note: "" },
  { symbol: "CRWV", date: "2025-12-22", pcs: -26, price: 84.1, amount: -2186.6, fee: 1.5, total: -2185.1, note: "c" },
  { symbol: "CRWV", date: "2025-12-23", pcs: 26, price: 83.4, amount: 2168.4, fee: 1.5, total: 2169.9, note: "c" },
  { symbol: "SMCI", date: "2025-12-29", pcs: -111, price: 30.31, amount: -3364.41, fee: 1.5, total: -3362.91, note: "d" },
  { symbol: "SMCI", date: "2025-12-29", pcs: 112, price: 30.02, amount: 3362.24, fee: 1.5, total: 3363.74, note: "d" },
  { symbol: "IMSR", date: "2025-12-30", pcs: -53, price: 6.02, amount: -319.06, fee: 1.5, total: -317.56, note: "e" },
  { symbol: "HOOD", date: "2026-02-04", pcs: 12, price: 83.21, amount: 998.52, fee: 1.5, total: 1000.02, note: "" },
  { symbol: "EOSE", date: "2026-02-13", pcs: 70, price: 10.8, amount: 756, fee: 1.5, total: 757.5, note: "" },
  { symbol: "IMSR", date: "2026-03-30", pcs: 53, price: 5.95, amount: 315.35, fee: 1.5, total: 316.85, note: "e" },
  { symbol: "IREN", date: "2026-03-31", pcs: 156, price: 32, amount: 4992, fee: 1.5, total: 4993.5, note: "" },
];

const elements = {
  authShell: document.getElementById("auth-shell"),
  appShell: document.getElementById("app-shell"),
  currentUser: document.getElementById("current-user"),
  loginTab: document.getElementById("login-tab"),
  registerTab: document.getElementById("register-tab"),
  loginForm: document.getElementById("login-form"),
  registerForm: document.getElementById("register-form"),
  loginSubmit: document.querySelector("#login-form button[type='submit']"),
  registerSubmit: document.querySelector("#register-form button[type='submit']"),
  authFeedback: document.getElementById("auth-feedback"),
  loginUsername: document.getElementById("login-username"),
  loginPassword: document.getElementById("login-password"),
  registerUsername: document.getElementById("register-username"),
  registerPassword: document.getElementById("register-password"),
  logoutButton: document.getElementById("logout-button"),
  trViewTab: document.getElementById("tr-view-tab"),
  abdViewTab: document.getElementById("abd-view-tab"),
  cryptoViewTab: document.getElementById("crypto-view-tab"),
  cashflowViewTab: document.getElementById("cashflow-view-tab"),
  quarterPlusViewTab: document.getElementById("quarter-plus-view-tab"),
  quarterChartViewTab: document.getElementById("quarter-chart-view-tab"),
  splitsViewTab: document.getElementById("splits-view-tab"),
  statusViewTab: document.getElementById("status-view-tab"),
  trShell: document.getElementById("tr-shell"),
  trEntryForm: document.getElementById("tr-entry-form"),
  trSymbolInput: document.getElementById("tr-symbol-input"),
  trBuyDateInput: document.getElementById("tr-buy-date-input"),
  trQuantityInput: document.getElementById("tr-quantity-input"),
  trBuyTotalInput: document.getElementById("tr-buy-total-input"),
  trTable: document.getElementById("tr-table"),
  abdShell: document.getElementById("abd-shell"),
  cryptoShell: document.getElementById("crypto-shell"),
  cryptoEntryForm: document.getElementById("crypto-entry-form"),
  cryptoSymbolInput: document.getElementById("crypto-symbol-input"),
  cryptoDateInput: document.getElementById("crypto-date-input"),
  cryptoQuantityInput: document.getElementById("crypto-quantity-input"),
  cryptoTotalInput: document.getElementById("crypto-total-input"),
  cryptoTable: document.getElementById("crypto-table"),
  cashflowShell: document.getElementById("cashflow-shell"),
  quarterPlusShell: document.getElementById("quarter-plus-shell"),
  quarterChartShell: document.getElementById("quarter-chart-shell"),
  splitsShell: document.getElementById("splits-shell"),
  statusShell: document.getElementById("status-shell"),
  positionsTable: document.getElementById("positions-table"),
  portfolioProfit: document.getElementById("portfolio-profit"),
  portfolioProfitPercent: document.getElementById("portfolio-profit-percent"),
  portfolioChartWrap: document.getElementById("portfolio-chart-wrap"),
  transactionForm: document.getElementById("transaction-form"),
  symbolInput: document.getElementById("symbol-input"),
  sideInput: document.getElementById("side-input"),
  dateInput: document.getElementById("date-input"),
  sharesInput: document.getElementById("shares-input"),
  totalInput: document.getElementById("total-input"),
  noteInput: document.getElementById("note-input"),
  cashflowNote: document.getElementById("cashflow-note"),
  cashflowDate: document.getElementById("cashflow-date"),
  cashflowTry: document.getElementById("cashflow-try"),
  cashflowUsd: document.getElementById("cashflow-usd"),
  cashflowUsdt: document.getElementById("cashflow-usdt"),
  cashflowAdd: document.getElementById("cashflow-add"),
  taxRateTr: document.getElementById("tax-rate-tr"),
  taxRateUsa: document.getElementById("tax-rate-usa"),
  cashflowAbdPortfolioUsd: document.getElementById("cashflow-abd-portfolio-usd"),
  cashflowTrPortfolioValue: document.getElementById("cashflow-tr-portfolio-value"),
  refreshDataButton: document.getElementById("refresh-data-button"),
  manualAbdPortfolioUsd: document.getElementById("manual-abd-portfolio-usd"),
  manualTrPortfolioTry: document.getElementById("manual-tr-portfolio-try"),
  latestRateLabel: document.getElementById("latest-rate-label"),
  statusSummary: document.getElementById("status-summary"),
  statusChartSummary: document.getElementById("status-chart-summary"),
  statusPerformanceChart: document.getElementById("status-performance-chart"),
  years2Summary: document.getElementById("years2-summary"),
  years2Body: document.getElementById("years2-body"),
  yearsQuarterSummary: document.getElementById("years-quarter-summary"),
  yearsQuarterBody: document.getElementById("years-quarter-body"),
  quarterPlusSummary: document.getElementById("quarter-plus-summary"),
  quarterPlusBody: document.getElementById("quarter-plus-body"),
  quarterDebug: document.getElementById("quarter-debug"),
  yearsQuarterChart: document.getElementById("years-quarter-chart"),
  splitsSummary: document.getElementById("splits-summary"),
  splitsBody: document.getElementById("splits-body"),
  statusMessageList: document.getElementById("status-message-list"),
  cashflowSummaryBody: document.getElementById("cashflow-summary-body"),
  cashflowBody: document.getElementById("cashflow-body"),
};

const state = {
  session: null,
  authToken: localStorage.getItem(AUTH_TOKEN_KEY) || "",
  activeView: "quarterChart",
  transactions: [],
  trRows: [],
  cryptoRows: [],
  cryptoOpenLots: [],
  cryptoClosedLots: [],
  cryptoEditingIndex: null,
  cryptoSaving: false,
  cryptoPricesBySymbol: new Map(),
  trEditingId: null,
  trSaving: false,
  trAutoSaveToken: 0,
  trPricesBySymbol: new Map(),
  trCandlesBySymbol: new Map(),
  trSplitsBySymbol: new Map(),
  openLots: [],
  closedLots: [],
  pricesBySymbol: new Map(),
  candlesBySymbol: new Map(),
  splitsBySymbol: new Map(),
  gs3mByMonth: new Map(),
  gs3mStatus: { source: "", latestDate: "", pointCount: 0, refreshError: "" },
  autoSaveToken: 0,
  priceRefreshToken: 0,
  editingIndex: null,
  saving: false,
  cashFlowMovements: [],
  cashFlowEditingId: null,
  cashFlowSaving: false,
  cashFlowRates: {},
  cashFlowLatestRate: null,
  cashFlowLoadError: "",
  cashFlowMarketDataError: "",
  cashFlowStatusMessage: "",
  cashFlowYieldStatus: { usdMissingMonths: 0, tryMissingMonths: 0, message: "" },
  cashFlowYields: { usd: { points: [] }, try: { points: [] } },
  cashFlowMarketRefreshing: false,
  performance: { loading: false, loaded: false, messages: [], series: [], history: {}, rates: {} },
  returnCalc: { loading: false, loaded: false, messages: [], history: {}, rates: {} },
  quarterCalc: { loading: false, loaded: false, messages: [], history: {}, rates: {} },
  quarterRowsCache: null,
  quarterPlusRowsCache: null,
  quarterCacheUpdatedAt: "",
  auditMessages: [],
  auditRowsCache: null,
  auditDebugDate: "2023-04-13",
  marketDataMessages: [],
  marketDataMessageBuckets: {},
  calculatedCacheMessages: [],
  manualPortfolio: loadManualPortfolioValues(),
  taxRates: loadTaxRates(),
  marketPreloadStarted: false,
  marketStatus: loadMarketStatus(),
};

bindEvents();
boot().catch(() => {
  showAuth();
});

function bindEvents() {
  elements.loginTab.addEventListener("click", () => switchAuthMode("login"));
  elements.registerTab.addEventListener("click", () => switchAuthMode("register"));
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.registerForm.addEventListener("submit", handleRegister);
  elements.loginSubmit.addEventListener("click", (event) => {
    event.preventDefault();
    handleLogin(event);
  });
  elements.registerSubmit.addEventListener("click", (event) => {
    event.preventDefault();
    handleRegister(event);
  });
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.trViewTab.addEventListener("click", () => setActiveView("tr"));
  elements.abdViewTab.addEventListener("click", () => setActiveView("abd"));
  elements.cryptoViewTab.addEventListener("click", () => setActiveView("crypto"));
  elements.cashflowViewTab.addEventListener("click", () => setActiveView("cashflow"));
  elements.quarterPlusViewTab.addEventListener("click", () => setActiveView("quarterPlus"));
  elements.quarterChartViewTab.addEventListener("click", () => setActiveView("quarterChart"));
  elements.splitsViewTab.addEventListener("click", () => setActiveView("splits"));
  elements.statusViewTab.addEventListener("click", () => setActiveView("status"));
  elements.cashflowAdd?.addEventListener("click", addCashFlowMovement);
  if (elements.cashflowDate) elements.cashflowDate.value = TODAY_ISO;
  elements.taxRateTr.value = state.taxRates.tr;
  elements.taxRateUsa.value = state.taxRates.usa;
  if (elements.manualAbdPortfolioUsd) elements.manualAbdPortfolioUsd.value = formatManualMoney(state.manualPortfolio.abd);
  if (elements.manualTrPortfolioTry) elements.manualTrPortfolioTry.value = formatManualMoney(state.manualPortfolio.tr);
  elements.taxRateTr.addEventListener("input", handleTaxRateChange);
  elements.taxRateUsa.addEventListener("input", handleTaxRateChange);
  elements.manualAbdPortfolioUsd?.addEventListener("input", handleManualPortfolioChange);
  elements.manualTrPortfolioTry?.addEventListener("input", handleManualPortfolioChange);
  elements.manualAbdPortfolioUsd?.addEventListener("blur", formatManualPortfolioInputs);
  elements.manualTrPortfolioTry?.addEventListener("blur", formatManualPortfolioInputs);

  for (const field of [
    elements.trSymbolInput,
    elements.trBuyDateInput,
    elements.trQuantityInput,
    elements.trBuyTotalInput,
  ]) {
    field.addEventListener("input", handleTrDraftChange);
    field.addEventListener("change", handleTrDraftChange);
  }

  elements.trEntryForm.addEventListener("focusout", () => {
    const token = ++state.trAutoSaveToken;
    queueMicrotask(() => {
      if (token !== state.trAutoSaveToken) return;
      if (!elements.trEntryForm.contains(document.activeElement)) autoSaveTrRow();
    });
  });

  for (const field of [
    elements.symbolInput,
    elements.sideInput,
    elements.dateInput,
    elements.sharesInput,
    elements.totalInput,
    elements.noteInput,
  ]) {
    field.addEventListener("input", handleDraftChange);
    field.addEventListener("change", handleDraftChange);
  }

  for (const field of [
    elements.cryptoSymbolInput,
    elements.cryptoDateInput,
    elements.cryptoQuantityInput,
    elements.cryptoTotalInput,
  ]) {
    field.addEventListener("input", handleCryptoDraftChange);
    field.addEventListener("change", handleCryptoDraftChange);
  }

  elements.transactionForm.addEventListener("focusout", () => {
    const token = ++state.autoSaveToken;
    queueMicrotask(() => {
      if (token !== state.autoSaveToken) return;
      if (!elements.transactionForm.contains(document.activeElement)) autoSaveTransaction();
    });
  });

  elements.cryptoEntryForm.addEventListener("focusout", () => {
    queueMicrotask(() => {
      if (!elements.cryptoEntryForm.contains(document.activeElement)) autoSaveCryptoTransaction();
    });
  });

  document.addEventListener("pointerdown", handleOutsideEditPointerDown);
}

function loadTaxRates() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TAX_SETTINGS_KEY) || "{}");
    return {
      tr: Number.isFinite(Number(parsed.tr)) ? Number(parsed.tr) : DEFAULT_TAX_RATES.tr,
      usa: Number.isFinite(Number(parsed.usa)) ? Number(parsed.usa) : DEFAULT_TAX_RATES.usa,
    };
  } catch {
    return { ...DEFAULT_TAX_RATES };
  }
}

function saveTaxRates() {
  localStorage.setItem(TAX_SETTINGS_KEY, JSON.stringify(state.taxRates));
}

function taxRateDecimal(market) {
  const value = market === "tr" ? state.taxRates.tr : state.taxRates.usa;
  return Math.max(Number(value) || 0, 0) / 100;
}

function handleTaxRateChange() {
  state.taxRates = {
    tr: cashFlowNum(elements.taxRateTr.value),
    usa: cashFlowNum(elements.taxRateUsa.value),
  };
  saveTaxRates();
  renderTrPortfolio();
  rebuildPortfolio();
}

function loadManualPortfolioValues() {
  try {
    return JSON.parse(localStorage.getItem(MANUAL_PORTFOLIO_KEY) || "{}");
  } catch {
    return {};
  }
}

function emptyMarketStatus() {
  return {
    abd: { fetchedAt: "", latestDate: "" },
    tr: { fetchedAt: "", latestDate: "" },
    crypto: { fetchedAt: "", latestDate: "" },
  };
}

function loadMarketStatus() {
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

function updateMarketStatus(market, payload) {
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

function handleManualPortfolioChange() {
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

async function loadUserSettings() {
  try {
    const payload = await apiFetch("/api/settings");
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

function formatManualPortfolioInputs() {
  if (elements.manualAbdPortfolioUsd) elements.manualAbdPortfolioUsd.value = formatManualMoney(elements.manualAbdPortfolioUsd.value);
  if (elements.manualTrPortfolioTry) elements.manualTrPortfolioTry.value = formatManualMoney(elements.manualTrPortfolioTry.value);
}

function parseManualMoney(value) {
  if (value === "" || value === null || value === undefined) return null;
  const normalized = String(value).trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatManualMoney(value) {
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

async function loadQuarterCalculatedCache() {
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

async function saveQuarterCalculatedCache() {
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
    version: "quarter-cash-crypto-usdt-v1",
    cashFlow: compactRows(cashFlowAllMovements()),
    abd: compactRows(state.transactions),
    tr: compactRows(state.trRows),
    crypto: compactRows(state.cryptoRows),
  });
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
    state.calculatedRefreshing = false;
  }
}

function handleOutsideEditPointerDown(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(".edit-row-form, .crypto-edit-form, .tr-edit-form, .edit-row, #transaction-form, #crypto-entry-form, #tr-entry-form")) return;

  const hadPositionEdit = state.editingIndex !== null;
  const hadCryptoEdit = state.cryptoEditingIndex !== null;
  const hadTrEdit = state.trEditingId !== null;
  if (hadPositionEdit || hadCryptoEdit || hadTrEdit) {
    setTimeout(() => {
      const positionForm = hadPositionEdit ? document.querySelector(".edit-row-form") : null;
      const trForm = hadTrEdit ? document.querySelector(".tr-edit-form") : null;
      if (positionForm) saveEditForm(positionForm);
      else if (hadPositionEdit) {
        state.editingIndex = null;
        renderPositions();
      }
      if (trForm) saveTrEditForm(trForm);
      else if (hadTrEdit) {
        state.trEditingId = null;
        renderTrPortfolio();
      }
      const cryptoForm = hadCryptoEdit ? document.querySelector(".crypto-edit-form") : null;
      if (cryptoForm) saveCryptoEditForm(cryptoForm);
      else if (hadCryptoEdit) {
        state.cryptoEditingIndex = null;
        renderCryptoPortfolio();
      }
    }, 0);
    return;
  }

  if (target.closest(
    [
      "[data-edit-index]",
      "[data-tr-edit]",
      "[data-cashflow-edit]",
      ".edit-row-form",
      ".tr-edit-form",
      ".edit-row",
      "#transaction-form",
      "#tr-entry-form",
      "#cashflow-add",
      "[data-cashflow-save]",
      "[data-cashflow-cancel]",
      "[data-cashflow-delete]",
      "[data-delete-index]",
      "[data-tr-delete]",
    ].join(",")
  )) {
    return;
  }

  if (state.editingIndex === null && state.trEditingId === null && state.cashFlowEditingId === null) return;
  setTimeout(() => {
    let changed = false;
    if (state.editingIndex !== null) {
      state.editingIndex = null;
      changed = true;
    }
    if (state.trEditingId !== null) {
      state.trEditingId = null;
      changed = true;
    }
    if (state.cashFlowEditingId !== null) {
      state.cashFlowEditingId = null;
      changed = true;
    }
    if (!changed) return;
    renderPositions();
    renderTrPortfolio();
    renderCashFlow();
  }, 0);
}

async function boot() {
  switchAuthMode("login");
  let session = null;
  try {
    session = await apiFetch("/api/session");
  } catch {
    showAuth();
    return;
  }

  if (!session?.user) {
    showAuth();
    return;
  }

  state.session = session.user;
  await loadGs3mRates();
  await Promise.all([loadUserSettings(), loadRemotePortfolio(), loadRemoteTrPortfolio(), loadRemoteCryptoPortfolio(), loadCashFlowData()]);
  await loadQuarterCalculatedCache();
  await loadSavedSplits({ refresh: shouldRefreshSplitScan() });
  showApp();
}

function showAuth(message = "") {
  elements.authShell.classList.remove("hidden");
  elements.appShell.classList.add("hidden");
  elements.authFeedback.textContent = message;
}

function showApp() {
  elements.currentUser.textContent = state.session ? `Signed in as ${state.session.username}` : "";
  elements.authShell.classList.add("hidden");
  elements.appShell.classList.remove("hidden");
  elements.authFeedback.textContent = "";
  applyActiveView();
  renderTrPortfolio();
  rebuildPortfolio();
  rebuildCryptoPortfolio();
  renderCashFlow();
  if (state.activeView === "cashflow") refreshCashFlowCalculatedValues().catch(() => {});
  if (state.activeView === "quarterPlus") {
    loadQuarterData().catch(() => {
      state.quarterCalc = { loading: false, loaded: true, messages: ["1/4 data could not be loaded."], history: {}, rates: {} };
      renderQuarterPlus();
      renderStatus();
    });
    renderQuarterPlus();
  }
  if (state.activeView === "quarterChart") {
    loadQuarterData().catch(() => {
      state.quarterCalc = { loading: false, loaded: true, messages: ["Quarter chart data could not be loaded."], history: {}, rates: {} };
      renderYearsQuarterCash();
      renderStatus();
    });
    renderYearsQuarterCash();
  }
  renderStatus();
}

function isSeedOwner() {
  return String(state.session?.username || "").trim().toLowerCase() === "sekkpl";
}

function setActiveView(view) {
  state.activeView = view;
  applyActiveView();
  if (view === "tr") {
    renderTrPortfolio();
    if (!state.trPricesBySymbol.size || !state.trCandlesBySymbol.size) refreshTrMarketData().catch(() => {});
  }
  if (view === "abd" && (!state.pricesBySymbol.size || !state.candlesBySymbol.size)) startPriceRefreshBurst();
  if (view === "crypto") {
    renderCryptoPortfolio();
    if (!state.cryptoPricesBySymbol.size) refreshCryptoPrices().catch(() => {});
  }
  if (view === "cashflow") {
    renderCashFlow();
    // Auto-refresh on entry (replaces the manual "Refresh data" button).
    refreshCalculatedData().catch(() => {});
  }
  if (view === "quarterPlus") {
    loadQuarterData().catch(() => {
      state.quarterCalc = { loading: false, loaded: true, messages: ["1/4 data could not be loaded."], history: {}, rates: {} };
      renderQuarterPlus();
    });
    renderQuarterPlus();
  }
  if (view === "quarterChart") {
    loadQuarterData().catch(() => {
      state.quarterCalc = { loading: false, loaded: true, messages: ["Quarter chart data could not be loaded."], history: {}, rates: {} };
      renderYearsQuarterCash();
    });
    renderYearsQuarterCash();
  }
  if (view === "splits") renderSplitsPage();
  if (view === "status") renderStatus();
}

function cashFlowHasCurrentMarketData() {
  const hasAbd = !state.openLots.length || state.openLots.every((lot) => state.pricesBySymbol.has(lot.symbol));
  const hasTr = !state.trRows.some((row) => trIsOpen(row)) || state.trRows.filter((row) => trIsOpen(row)).every((row) => state.trPricesBySymbol.has(row.symbol));
  const hasCrypto = !state.cryptoOpenLots.length || state.cryptoOpenLots.every((lot) => state.cryptoPricesBySymbol.has(lot.symbol));
  return hasAbd && hasTr && hasCrypto;
}

function preloadMarketDataSoon() {
  if (state.marketPreloadStarted) return;
  state.marketPreloadStarted = true;
  setTimeout(() => {
    refreshPrices().catch(() => {});
    refreshTrMarketData().catch(() => {});
    refreshCryptoPrices().catch(() => {});
  }, 250);
}

function preloadQuarterDataSoon() {
  setTimeout(() => {
    if (!state.quarterCalc.loaded && !state.quarterCalc.loading) {
      loadQuarterData().catch(() => {
        state.quarterCalc = { loading: false, loaded: true, messages: ["1/4 data could not be loaded."], history: {}, rates: {} };
        renderStatus();
      });
    }
  }, 450);
}

function startPriceRefreshBurst({ background = false } = {}) {
  const token = ++state.priceRefreshToken;
  setTimeout(() => {
    if (token !== state.priceRefreshToken) return;
    if (!background && state.activeView !== "abd") return;
    refreshPrices().catch(() => {});
  }, 80);
}

function applyActiveView() {
  document.body.classList.toggle("cashflow-lock", state.activeView === "cashflow");
  elements.trViewTab.classList.toggle("active", state.activeView === "tr");
  elements.abdViewTab.classList.toggle("active", state.activeView === "abd");
  elements.cryptoViewTab.classList.toggle("active", state.activeView === "crypto");
  elements.cashflowViewTab.classList.toggle("active", state.activeView === "cashflow");
  elements.quarterPlusViewTab.classList.toggle("active", state.activeView === "quarterPlus");
  elements.quarterChartViewTab.classList.toggle("active", state.activeView === "quarterChart");
  elements.splitsViewTab.classList.toggle("active", state.activeView === "splits");
  elements.statusViewTab.classList.toggle("active", state.activeView === "status");
  elements.trShell.classList.toggle("hidden", state.activeView !== "tr");
  elements.abdShell.classList.toggle("hidden", state.activeView !== "abd");
  elements.cryptoShell.classList.toggle("hidden", state.activeView !== "crypto");
  elements.cashflowShell.classList.toggle("hidden", state.activeView !== "cashflow");
  elements.quarterPlusShell.classList.toggle("hidden", state.activeView !== "quarterPlus");
  elements.quarterChartShell.classList.toggle("hidden", state.activeView !== "quarterChart");
  elements.splitsShell.classList.toggle("hidden", state.activeView !== "splits");
  elements.statusShell.classList.toggle("hidden", state.activeView !== "status");
  updateStatusTab();
}

async function loadCashFlowData() {
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

async function addCashFlowMovement() {
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

function renderCashFlow() {
  const rows = cashFlowAllMovements();
  const displayRows = rows.map(cashFlowEnrichForDisplay);
  elements.latestRateLabel.textContent = state.cashFlowLatestRate?.rate ? cashFlowDecimal2(state.cashFlowLatestRate.rate) : "-";
  elements.cashflowAbdPortfolioUsd.textContent = cashFlowMoney(cashFlowCurrentPortfolioUsd(), "USD");
  elements.cashflowTrPortfolioValue.textContent = cashFlowTrPortfolioValueLabel();
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
    card.classList.add(classifyMarketStatus(market, info, todayDate));
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

async function refreshCashFlowCalculatedValues() {
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

function cashFlowMessages() {
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

function renderStatus() {
  const messages = cashFlowMessages();
  updateStatusTab(messages);
  elements.statusSummary.textContent = messages.length ? `${messages.length} issue${messages.length === 1 ? "" : "s"}` : "Ready";
  elements.statusMessageList.innerHTML = messages.length
    ? messages.map((message) => `<div>${escapeHtml(message)}</div>`).join("")
    : `<div class="status-ok">No current issues.</div>`;
}

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

async function fetchPerformanceHistory(symbols, startDate, options = {}) {
  const history = {};
  const errors = [];
  const cacheOnly = options.cacheOnly !== false;
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

function invalidateCashFlowReturns() {
  state.returnCalc = { loading: false, loaded: false, messages: [], history: {}, rates: {} };
  state.quarterCalc = { loading: false, loaded: false, messages: [], history: {}, rates: {} };
  state.quarterRowsCache = null;
  state.quarterPlusRowsCache = null;
  state.auditRowsCache = null;
  state.auditMessages = [];
}

async function loadQuarterData({ force = false } = {}) {
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
      if (state.activeView === "quarterPlus") renderQuarterPlus();
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

function auditMessagesFromRows(rows) {
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

function setMarketDataMessages(scope, messages) {
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

async function apiFailureMessage(response, fallback) {
  const status = response ? `${response.status} ${response.statusText || ""}`.trim() : "";
  const payload = await response?.json?.().catch(() => null);
  const error = payload?.error || payload?.message || "";
  return [fallback, status ? `HTTP ${status}.` : "", error].filter(Boolean).join(" ");
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

function accountValuePartsForDate(date, history, rates) {
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

function usdHoldingsValueForDate(date, history) {
  let total = 0;
  for (const [symbol, quantity] of usdHoldingsAtDate(date).entries()) {
    const price = performancePriceForDate(performancePriceMap(history[symbol]), date);
    if (price) total += quantity * price;
  }
  return round2(total);
}

function trHoldingsValueTryForDate(date, history) {
  let total = 0;
  for (const row of state.trRows.map(normalizeTrRow)) {
    if (row.buyDate > date || (row.sellDate && row.sellDate <= date)) continue;
    total += trHistoricalHoldingValueForDate(row, date, history).value;
  }
  return round2(total);
}

function trHistoricalHoldingValueForDate(row, date, history) {
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

function trCanUseImportedValueFallback(row) {
  return trIsImportedUnknownQuantity(row)
    && nullableClientNumber(row.buyTotal) != null;
}

function cashBalancesForDate(date) {
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

function externalCashTryForDate(date, rates) {
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

function usdHoldingsAtDate(date) {
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

function trQuantityForDate(row, date, history = {}) {
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

function performancePriceMap(candles, rates = null) {
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
  return map;
}

function performancePriceForDate(priceMap, date) {
  let found = null;
  for (const [priceDate, price] of [...priceMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (priceDate <= date) found = price;
    else break;
  }
  return found;
}

function performanceRateForDate(date, rates) {
  if (rates?.[date]?.rate) return rates[date].rate;
  let found = null;
  for (const key of Object.keys(rates || {}).sort()) {
    if (key <= date && rates[key]?.rate) found = rates[key].rate;
    else if (key > date) break;
  }
  return found;
}

function niceTicks(minValue, maxValue, count) {
  const span = Math.max(maxValue - minValue, 1);
  const rawStep = span / Math.max(count - 1, 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  const step = niceResidual * magnitude;
  const start = Math.ceil(minValue / step) * step;
  const ticks = [];
  for (let value = start; value <= maxValue + step * 0.5; value += step) {
    ticks.push(round2(value));
  }
  if (!ticks.includes(0) && minValue < 0 && maxValue > 0) ticks.push(0);
  return ticks.sort((a, b) => a - b);
}

function performanceDateTicks(minDate, maxDate, count) {
  const ticks = [];
  const span = maxDate - minDate || 1;
  for (let index = 0; index < count; index += 1) {
    const value = minDate + (span * index) / (count - 1);
    ticks.push(toIsoDate(value));
  }
  return [...new Set(ticks)];
}

function formatMonthYear(date) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  return `${String(value.getMonth() + 1).padStart(2, "0")}.${String(value.getFullYear()).slice(2)}`;
}

function formatCurrencyShort(value) {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  if (absolute >= 1000000) return `${sign}$${round2(absolute / 1000000)}M`;
  if (absolute >= 1000) return `${sign}$${Math.round(absolute / 1000)}K`;
  return `${sign}$${Math.round(absolute)}`;
}

function updateStatusTab(messages = cashFlowMessages()) {
  const hasIssues = messages.length > 0;
  elements.statusViewTab.classList.toggle("status-has-issues", hasIssues);
  elements.statusViewTab.classList.toggle("status-ok", !hasIssues);
}

function renderSplitsPage() {
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
  elements.cashflowSummaryBody.innerHTML = [total, ...yearly].map(cashFlowSummaryRow).join("");
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
      <td><input id="cashflow-date" type="text" inputmode="numeric" placeholder="dd.mm.yyyy"></td>
      <td><input id="cashflow-try" type="number" step="1" placeholder="TL"></td>
      <td><input id="cashflow-usd" type="number" step="1" placeholder="USD"></td>
      <td><input id="cashflow-usdt" type="number" step="1" placeholder="USDT"></td>
    </tr>
  `;
}

function cashFlowAllMovements() {
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
  const currentUsd = isTotal ? cashFlowCurrentPortfolioUsd() : null;
  const currentUsdt = isTotal ? cashFlowCurrentCryptoPortfolioUsd() : null;
  const currentTryUsd = isTotal ? cashFlowCurrentTryPortfolioUsd() : null;
  const totalCurrent = (currentUsd || 0) + (currentUsdt || 0) + (currentTryUsd || 0);
  const totalInvested = investedUsd + investedUsdt + investedTryUsd;
  const totalOpportunity = opportunityUsdCost + opportunityTryUsd;
  const profit = currentUsd !== null || currentUsdt !== null || currentTryUsd !== null ? totalCurrent - totalInvested - totalOpportunity : null;
  const returnPercent = isTotal
    ? cashFlowPercent(profit, positiveInvested)
    : cashFlowTimeWeightedReturnPercent(label);
  return { label, returnPercent, investedUsd, investedUsdt, investedTryUsd, currentUsd, currentUsdt, currentTryUsd, opportunityUsdCost, opportunityTryUsd, profit };
}

function cashFlowCurrentPortfolioUsd() {
  return round2(state.openLots.reduce((total, lot) => total + ((lot.referencePrice != null ? lot.referencePrice : 0) * lot.remainingShares), 0));
}

function cashFlowCurrentCryptoPortfolioUsd() {
  return round2(state.cryptoOpenLots.reduce((total, lot) => total + ((lot.referencePrice != null ? lot.referencePrice : 0) * lot.remainingShares), 0));
}

function cashFlowCurrentTryPortfolioUsd() {
  const rate = state.cashFlowLatestRate?.rate;
  if (!rate) return 0;
  return round2(cashFlowCurrentTryPortfolioTry() / rate);
}

function cashFlowCurrentTryPortfolioTry() {
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

function renderAudit2022() {
  if (!elements.audit2022Body || !elements.audit2022Summary) return;
  if (!state.returnCalc.loaded) {
    elements.audit2022Summary.textContent = state.returnCalc.loading ? "Loading" : "Waiting";
    elements.audit2022Body.innerHTML = `<tr><td colspan="9" class="muted">Loading year check data.</td></tr>`;
    if (elements.audit2022Debug) elements.audit2022Debug.innerHTML = `<div class="audit-debug-empty">Loading 13.04.2023 math.</div>`;
    return;
  }

  const displayRows = getAuditDisplayRowsCached();
  elements.audit2022Summary.textContent = displayRows.length ? `${auditYears().length} years` : "No data";
  elements.audit2022Body.innerHTML = displayRows.length
    ? displayRows.map(audit2022RowHtml).join("")
    : `<tr><td colspan="9" class="muted">No cash flow movements.</td></tr>`;
  if (elements.audit2022Debug) elements.audit2022Debug.innerHTML = auditDateDebugHtml(state.auditDebugDate);
  elements.audit2022Body.querySelectorAll("[data-audit-date]").forEach((row) => {
    row.addEventListener("click", () => {
      state.auditDebugDate = row.dataset.auditDate;
      if (elements.audit2022Debug) elements.audit2022Debug.innerHTML = auditDateDebugHtml(state.auditDebugDate);
    });
  });
  renderStatus();
}

function getAuditDisplayRowsCached() {
  if (state.auditRowsCache) return state.auditRowsCache;
  const rows = auditYearDisplayRows();
  state.auditRowsCache = rows;
  state.auditMessages = auditMessagesFromRows(rows);
  return rows;
}

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

function renderYearsQuarterCash() {
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
  if (state.activeView === "quarterChart") renderYearsQuarterChart(quarterPlusRows(rows));
  if (elements.yearsQuarterBody) {
    elements.yearsQuarterBody.innerHTML = rows.length
      ? rows.map((row) => `<tr><td>${formatDate(row.date)}</td><td>${row.totalUsd == null ? "-" : cashFlowMoney(row.totalUsd, "USD")}</td><td>${row.accountUsd == null ? "-" : cashFlowMoney(row.accountUsd, "USD")}</td><td>${row.tryDepositUsd == null ? "-" : cashFlowMoney(row.tryDepositUsd, "USD")}</td><td>${row.goldUsd == null ? "-" : cashFlowMoney(row.goldUsd, "USD")}</td><td>${row.bistUsd == null ? "-" : cashFlowMoney(row.bistUsd, "USD")}</td><td>${row.nasdaqUsd == null ? "-" : cashFlowMoney(row.nasdaqUsd, "USD")}</td><td>${row.btcUsd == null ? "-" : cashFlowMoney(row.btcUsd, "USD")}</td><td class="${row.status === "OK" ? "" : "negative"}">${escapeHtml(row.status)}</td></tr>`).join("")
      : `<tr><td colspan="9" class="muted">No quarter dates.</td></tr>`;
  }
}

function renderQuarterPlus() {
  if (!elements.quarterPlusBody || !elements.quarterPlusSummary) return;
  if (state.quarterCalc.loading) {
    elements.quarterPlusSummary.textContent = "Loading DB data";
    elements.quarterPlusBody.innerHTML = `<tr><td colspan="9" class="muted">Loading DB data.</td></tr>`;
    return;
  }

  const rows = getQuarterPlusRows();
  const dataLabel = state.quarterCalc.loaded ? "DB ready" : "DB waiting";
  elements.quarterPlusSummary.textContent = rows.length ? `${rows.length} dates, ${dataLabel}` : "No data";
  elements.quarterPlusBody.innerHTML = rows.length
    ? rows.map((row) => `<tr><td>${formatDate(row.date)}</td><td>${row.totalUsd == null ? "-" : cashFlowMoney(row.totalUsd, "USD")}</td><td>${row.accountUsd == null ? "-" : cashFlowMoney(row.accountUsd, "USD")}</td><td>${row.tryDepositUsd == null ? "-" : cashFlowMoney(row.tryDepositUsd, "USD")}</td><td>${row.goldUsd == null ? "-" : cashFlowMoney(row.goldUsd, "USD")}</td><td>${row.bistUsd == null ? "-" : cashFlowMoney(row.bistUsd, "USD")}</td><td>${row.nasdaqUsd == null ? "-" : cashFlowMoney(row.nasdaqUsd, "USD")}</td><td>${row.btcUsd == null ? "-" : cashFlowMoney(row.btcUsd, "USD")}</td><td class="${row.status === "OK" ? "" : "negative"}">${escapeHtml(row.status)}</td></tr>`).join("")
    : `<tr><td colspan="9" class="muted">No quarter dates.</td></tr>`;
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

function accountUsdCashSplitForDate(date) {
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

function quarterPlusRows(rows) {
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

function getQuarterPlusRows() {
  if (state.quarterPlusRowsCache) return state.quarterPlusRowsCache;
  state.quarterPlusRowsCache = quarterPlusRows(getYearsQuarterCashRows());
  return state.quarterPlusRowsCache;
}

function renderYearsQuarterChart(rows) {
  if (!elements.yearsQuarterChart) return;
  const series = [
    { key: "accountUsd", name: "Portfolio+Cash", color: "#d100d1", width: 3 },
    { key: "tryDepositUsd", name: "TRY Deposit", color: "#8c8f94", dash: "8 7" },
    { key: "goldUsd", name: "Gold", color: "#c79219" },
    { key: "bistUsd", name: "BIST100", color: "#00bcd4" },
    { key: "nasdaqUsd", name: "Nasdaq100", color: "#d7263d" },
    { key: "btcUsd", name: "BTC", color: "#8bdc65" },
  ].map((serie) => ({
    ...serie,
    points: rows
      .filter((row) => Number.isFinite(row.totalUsd) && Number.isFinite(row[serie.key]))
      .map((row) => ({ date: row.date, value: round2(row[serie.key] - row.totalUsd) })),
  })).filter((serie) => serie.points.length);

  if (!rows.length || !series.length) {
    elements.yearsQuarterChart.innerHTML = `<div class="empty-card">No quarter chart data yet.</div>`;
    return;
  }

  const points = series.flatMap((serie) => serie.points);
  const minDate = Math.min(...points.map((point) => parseDate(point.date)));
  const maxDate = Math.max(...points.map((point) => parseDate(point.date)));
  const availableWidth = Math.max(elements.yearsQuarterChart.clientWidth || 0, 980);
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
  // Plot area is exactly double the original 612px, so every 10k band is ~2x
  // taller regardless of how many bands there are. Total height stays bounded
  // (it does NOT scale with band count), giving a mild vertical scroll.
  const plotHeight = 1224;
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
  const xTicks = tickDates.map((date, index) => `
    <line class="performance-grid-line quarter-date-line" x1="${round2(x(date))}" y1="${pad.top}" x2="${round2(x(date))}" y2="${bottomGridY}" />
    ${index === 0 ? "" : `<text class="performance-axis-label quarter-date-label" x="${round2(x(date))}" y="${bottomGridY + 3}" text-anchor="middle" dominant-baseline="hanging">${index === 1 ? `${quarterStartOffsetLabel(tickDates)} ` : ""}${formatShortDate(date)}</text>`}
  `).join("");
  const legend = [
    `<span><i style="background:#202d39"></i>Total USD baseline</span>`,
    ...series.map((serie) => `<span><i style="background:${serie.color}"></i>${serie.name}</span>`),
  ].join("");

  elements.yearsQuarterChart.innerHTML = `
    <svg class="quarter-chart performance-chart" viewBox="0 0 ${width} ${height}" style="height:${height}px" preserveAspectRatio="none" role="img" aria-label="Quarter values relative to Total USD">
      ${grid}
      ${paths}
      ${xTicks}
    </svg>
    <div class="performance-legend quarter-chart-legend">${legend}</div>
  `;
}

function yearsQuarterCashRows() {
  if (state.quarterRowsCache) return state.quarterRowsCache;
  const rates = state.quarterCalc.loaded ? state.quarterCalc.rates : state.cashFlowRates;
  const history = state.quarterCalc.loaded ? state.quarterCalc.history || {} : {};
  const flows = combinedSystemMoneyFlows();
  state.quarterRowsCache = yearsQuarterDates(yearsQuarterStartDate(), TODAY_ISO).map((date) => {
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
      status: errors.length ? [...new Set(errors)].join(" ") : "OK",
    };
  });
  return state.quarterRowsCache;
}

function getYearsQuarterCashRows() {
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

function yearsQuarterStartDate() {
  const firstFlowDate = [
    ...cashFlowAllMovements().map((item) => item.date),
    ...state.cryptoRows.map((item) => item.date),
  ]
    .filter(Boolean)
    .sort()[0];
  return firstFlowDate || "2022-09-30";
}

function cryptoHistorySymbol(symbol) {
  const key = normalizeCryptoSymbol(symbol);
  if (!key) return "";
  return key.endsWith("-USD") ? key : `${key}-USD`;
}

function cryptoPortfolioUsdForDate(targetDate, history) {
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

function cryptoRefreshErrorsForSymbols(symbols, refreshedHistory) {
  if (!symbols?.length || !refreshedHistory) return [];
  const errors = refreshedHistory.__errors || [];
  return symbols
    .filter((symbol) => !Array.isArray(refreshedHistory[symbol]) || !refreshedHistory[symbol].length)
    .map((symbol) => {
      const detail = errors.find((message) => String(message || "").includes(symbol));
      return detail || `${symbol}: crypto historical source refresh did not return D1 data.`;
    });
}

function cryptoHistoryMissingForQuarterDates(historySymbol, history, dates) {
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

function yearsQuarterDates(startDate, endDate) {
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

function cashFlowOnlyUsdBalancesForDate(date, rates, flows = state.cashFlowMovements) {
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

function cashFlowTryDepositUsdForDate(targetDate, rates, flows = state.cashFlowMovements) {
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

function cashFlowAssetUsdForDate(targetDate, rates, history, symbol, label, options = {}) {
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

function auditYears() {
  const years = cashFlowYearsInData(cashFlowAllMovements());
  if (!years.length) return [];
  const start = Number(years[0]);
  const end = Number(TODAY_ISO.slice(0, 4));
  const result = [];
  for (let year = start; year <= end; year += 1) result.push(String(year));
  return result;
}

function auditYearDisplayRows() {
  return auditYears().flatMap((year) => {
    const rows = auditYearRows(year);
    const totalRow = rows.length ? auditYearTotalRow(rows) : null;
    return totalRow ? [...rows, totalRow] : rows;
  });
}

function auditYearRows(year) {
  return auditYearRowsWithData(year, state.returnCalc.history, state.returnCalc.rates);
}

function auditYearRowsWithData(year, history, rates) {
  const flows = state.cashFlowMovements
    .filter((item) => item.date?.slice(0, 4) === year)
    .sort((left, right) => left.date.localeCompare(right.date));
  const yearStart = `${year}-01-01`;
  const yearEnd = year === TODAY_ISO.slice(0, 4) ? TODAY_ISO : `${year}-12-31`;
  if (!flows.length && externalCashTryForDate(yearStart, rates) === 0) return [];

  const dates = new Set();
  if (externalCashTryForDate(yearStart, rates) > 0) dates.add(yearStart);
  for (let index = 0; index < flows.length; index += 1) {
    const date = flows[index].date;
    if (index > 0) dates.add(addIsoDays(date, -1));
    dates.add(date);
  }
  dates.add(yearEnd);

  const rows = [...dates]
    .filter((date) => date.startsWith(year))
    .sort()
    .map((date) => {
      const parts = accountValuePartsForDate(date, history, rates);
      const systemMoney = externalCashTryForDate(date, rates);
      const hasErrors = parts.errors.length > 0;
      const portfolioValue = hasErrors ? null : parts.totalTry;
      const holdingsValue = hasErrors || parts.rate == null ? null : round2(parts.trHoldingsTry + parts.usdHoldings * parts.rate);
      const cashValue = hasErrors || parts.rate == null ? null : round2(parts.cashTry + parts.cashUsd * parts.rate);
      const flowAmount = flows
        .filter((flow) => flow.date === date)
        .reduce((total, flow) => {
          const amount = Number(flow.amount) || 0;
          if (flow.currency === "TRY") return total + amount;
          const rate = performanceRateForDate(date, rates);
          return rate ? total + amount * rate : total;
        }, 0);
      return {
        year,
        date,
        systemMoney,
        portfolioValue,
        holdingsValue,
        cashValue,
        errors: parts.errors,
        difference: portfolioValue == null ? null : round2(portfolioValue - systemMoney),
        returnPercent: auditReturnPercent(portfolioValue, systemMoney),
        note: parts.errors.length ? parts.errors.join(" ") : date === yearStart ? "Year start" : date === yearEnd ? "Year end" : flowAmount ? `Cash flow ${cashFlowSignedPlain(flowAmount)} TL` : "Day before cash flow",
      };
    });
  return rows.map((row, index) => {
    const previous = index === 0 ? null : rows[index - 1];
    const returnPercent = previous ? auditPeriodReturnPercent(previous, row) : null;
    const debugNote = previous ? auditReturnDebugNote(previous, row, returnPercent) : "";
    return {
      ...row,
      returnPercent,
      note: debugNote ? `${row.note} ${debugNote}` : row.note,
    };
  });
}

function auditReturnPercent(portfolioValue, systemMoney) {
  if (portfolioValue == null || !Number.isFinite(portfolioValue)) return null;
  if (!Number.isFinite(systemMoney) || systemMoney === 0) return null;
  return round2(((portfolioValue - systemMoney) / Math.abs(systemMoney)) * 100);
}

function audit2022RowHtml(row) {
  const differenceClass = row.difference == null ? "muted" : row.difference >= 0 ? "positive" : "negative";
  const returnClass = row.returnPercent == null ? "muted" : row.returnPercent >= 0 ? "positive" : "negative";
  return `<tr class="${row.total ? "total-row" : "clickable-row"}" ${row.total ? "" : `data-audit-date="${row.date}"`}><td>${row.year}</td><td>${row.total ? `${row.year} Total` : formatDate(row.date)}</td><td>${cashFlowMoney(row.systemMoney, "TRY")}</td><td>${row.portfolioValue == null ? "-" : cashFlowMoney(row.portfolioValue, "TRY")}</td><td>${row.holdingsValue == null ? "-" : cashFlowMoney(row.holdingsValue, "TRY")}</td><td>${row.cashValue == null ? "-" : cashFlowMoney(row.cashValue, "TRY")}</td><td class="${returnClass}">${row.returnPercent == null ? "-" : `%${cashFlowDecimal2(row.returnPercent)}`}</td><td class="${differenceClass}">${row.difference == null ? "-" : cashFlowMoney(row.difference, "TRY")}</td><td>${escapeHtml(row.note)}</td></tr>`;
}

function auditDateDebugHtml(date) {
  const yearRows = getAuditDisplayRowsCached().filter((row) => !row.total && row.date?.slice(0, 4) === date.slice(0, 4));
  const index = yearRows.findIndex((row) => row.date === date);
  const current = yearRows[index] || null;
  const previous = index > 0 ? yearRows[index - 1] : null;
  const parts = accountValuePartsForDate(date, state.returnCalc.history, state.returnCalc.rates);
  const cash = cashBalancesForDate(date);
  const cashValue = parts.rate == null ? null : round2(cash.try + cash.usd * parts.rate);
  const usdHoldingsTry = parts.rate == null ? null : round2(parts.usdHoldings * parts.rate);
  const flowsToday = state.cashFlowMovements.filter((item) => item.date === date);
  const trRows = auditTrHoldingRowsForDate(date, state.returnCalc.history);
  const trHoldingTotal = round2(trRows.reduce((total, row) => total + (Number(row.value) || 0), 0));
  const trRowsHtml = trRows.length
    ? trRows.map((row) => `
        <tr>
          <td>${escapeHtml(row.symbol)}</td>
          <td>${escapeHtml(row.method)}</td>
          <td>${row.quantity == null ? "-" : formatSmartNumber(row.quantity)}</td>
          <td>${row.price == null ? "-" : cashFlowMoney(row.price, "TRY")}</td>
          <td>${cashFlowMoney(row.value, "TRY")}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="5" class="muted">No active TR holdings on this date.</td></tr>`;
  const returnBase = previous ? Math.abs(Number(previous.systemMoney) || 0) : null;
  const deltaDifference = previous && current ? round2(current.difference - previous.difference) : null;
  const returnFormula = previous && current && returnBase
    ? `${cashFlowMoney(deltaDifference, "TRY")} / ${cashFlowMoney(returnBase, "TRY")} = %${cashFlowDecimal2(current.returnPercent)}`
    : "-";

  return `
    <div class="audit-debug-heading">
      <h2>${formatDate(date)} Math</h2>
      <span>${current ? `%${cashFlowDecimal2(current.returnPercent)}` : "No row"}</span>
    </div>
    <p class="audit-build-label">Build ${BUILD_VERSION}</p>
    <div class="audit-debug-grid">
      ${auditDebugLine("System money", current?.systemMoney, "TRY")}
      ${auditDebugLine("Portfolio", current?.portfolioValue, "TRY")}
      ${auditDebugLine("Difference", current?.difference, "TRY")}
      ${auditDebugLine("TR holdings", parts.trHoldingsTry, "TRY")}
      ${auditDebugLine("USD holdings in TL", usdHoldingsTry, "TRY")}
      ${auditDebugLine("Cash TRY", cash.try, "TRY")}
      ${auditDebugLine("Cash USD", cash.usd, "USD")}
      ${auditDebugLine("Cash in TL", cashValue, "TRY")}
      ${auditDebugLine("USD/TRY", parts.rate, "")}
    </div>
    <div class="audit-debug-block">
      <h3>Portfolio Formula</h3>
      <p>TR holdings ${cashFlowMoney(parts.trHoldingsTry, "TRY")} + USD holdings ${usdHoldingsTry == null ? "-" : cashFlowMoney(usdHoldingsTry, "TRY")} + cash ${cashValue == null ? "-" : cashFlowMoney(cashValue, "TRY")} = ${current?.portfolioValue == null ? "-" : cashFlowMoney(current.portfolioValue, "TRY")}</p>
    </div>
    <div class="audit-debug-block">
      <h3>Return Formula</h3>
      <p>Previous ${previous ? formatDate(previous.date) : "-"} difference ${previous?.difference == null ? "-" : cashFlowMoney(previous.difference, "TRY")}</p>
      <p>Current difference ${current?.difference == null ? "-" : cashFlowMoney(current.difference, "TRY")}</p>
      <p>Delta / previous system money: ${returnFormula}</p>
    </div>
    <div class="audit-debug-block">
      <h3>Cash Flow On Date</h3>
      ${flowsToday.length ? flowsToday.map((item) => `<p>${escapeHtml(item.note || "")} ${cashFlowSignedPlain(Number(item.amount) || 0)} ${item.currency}</p>`).join("") : "<p>No cash flow.</p>"}
    </div>
    <div class="audit-debug-block">
      <h3>Holdings Quantity And Value</h3>
      <div class="audit-holding-total">
        <span>Active TR rows</span>
        <strong>${trRows.length}</strong>
        <span>Total value</span>
        <strong>${cashFlowMoney(trHoldingTotal, "TRY")}</strong>
      </div>
      ${trRows.length ? trRows.map((row) => `
        <div class="audit-holding-card">
          <div>
            <strong>${escapeHtml(row.symbol)}</strong>
            <span>${escapeHtml(row.method)}</span>
          </div>
          <div>
            <span>Qty</span>
            <strong>${row.quantity == null ? "-" : formatSmartNumber(row.quantity)}</strong>
          </div>
          <div>
            <span>Unit</span>
            <strong>${row.price == null ? "-" : cashFlowMoney(row.price, "TRY")}</strong>
          </div>
          <div>
            <span>Value</span>
            <strong>${cashFlowMoney(row.value, "TRY")}</strong>
          </div>
        </div>
      `).join("") : `<p>No active TR holdings on this date.</p>`}
    </div>
    <div class="audit-debug-block">
      <h3>Active TR Holdings</h3>
      <table class="audit-debug-table">
        <thead><tr><th>Stock</th><th>Method</th><th>Qty</th><th>Price</th><th>Value</th></tr></thead>
        <tbody>${trRowsHtml}</tbody>
      </table>
    </div>
  `;
}

function auditDebugLine(label, value, currency) {
  const text = value == null ? "-" : currency ? cashFlowMoney(value, currency) : cashFlowDecimal2(value);
  return `<div><span>${label}</span><strong>${text}</strong></div>`;
}

function auditTrHoldingRowsForDate(date, history) {
  const rows = [];
  for (const row of state.trRows.map(normalizeTrRow)) {
    if (row.buyDate > date || (row.sellDate && row.sellDate <= date)) continue;
    const detail = trHistoricalHoldingValueForDate(row, date, history);
    rows.push({
      symbol: row.symbol,
      method: detail.method,
      quantity: detail.quantity,
      price: detail.price,
      value: round2(detail.value),
    });
  }
  return rows;
}

function auditYearTotalReturnPercent(year) {
  const rows = auditYearRows(year);
  return rows.length ? auditYearTotalRow(rows).returnPercent : null;
}

function auditYearTotalRow(rows) {
  let factor = 1;
  let previous = rows[0];
  for (let index = 1; index < rows.length; index += 1) {
    const current = rows[index];
    const periodReturn = auditPeriodReturn(previous, current);
    if (periodReturn == null) {
      previous = current;
      continue;
    }
    factor *= 1 + periodReturn;
    previous = current;
  }
  const last = rows[rows.length - 1];
  return {
    ...last,
    total: true,
    returnPercent: Number.isFinite(factor) ? round2((factor - 1) * 100) : null,
    difference: last.portfolioValue == null ? null : round2(last.portfolioValue - last.systemMoney),
    holdingsValue: last.holdingsValue,
    cashValue: last.cashValue,
    note: "Compounded row returns",
  };
}

function auditPeriodReturnPercent(previous, current) {
  const periodReturn = auditPeriodReturn(previous, current);
  return periodReturn == null ? null : round2(periodReturn * 100);
}

function auditPeriodReturn(previous, current) {
  if (!previous || !current) return null;
  if (!Number.isFinite(previous.difference) || !Number.isFinite(current.difference)) return null;
  const base = Math.abs(Number(previous.systemMoney) || 0);
  if (!Number.isFinite(base) || base <= 0) return null;
  return (current.difference - previous.difference) / base;
}

function auditReturnDebugNote(previous, current, returnPercent) {
  if (returnPercent == null || Math.abs(returnPercent) < 50) return "";
  const base = Math.abs(Number(previous.systemMoney) || 0);
  const delta = current.difference - previous.difference;
  return `Return check: previous ${formatDate(previous.date)} difference TL ${cashFlowInteger(previous.difference)}, current difference TL ${cashFlowInteger(current.difference)}, delta TL ${cashFlowInteger(delta)}, base TL ${cashFlowInteger(base)}.`;
}

function performancePointForDate(points, date) {
  let found = null;
  for (const point of points) {
    if (point.date <= date) found = point;
    else break;
  }
  return found;
}

function cashFlowConvertTryInterestToUsd(year, interestTry) {
  if (!interestTry) return 0;
  const conversionDate = year === TODAY_ISO.slice(0, 4) ? TODAY_ISO : `${year}-12-31`;
  const rate = state.cashFlowRates[conversionDate]?.rate || state.cashFlowLatestRate?.rate;
  return rate ? interestTry / rate : 0;
}

function cashFlowSummaryRow(row) {
  return `<tr class="${row.label === "Total" ? "total-row" : ""}"><td class="return-percent ${row.returnPercent == null ? "muted" : row.returnPercent >= 0 ? "positive" : "negative"}">${row.returnPercent == null ? "-" : `%${Math.round(row.returnPercent)}`}</td><td>${row.label}</td><td>${cashFlowMoney(row.investedUsd, "USD")}</td><td>${cashFlowMoney(row.investedUsdt, "USD")}</td><td>${cashFlowMoney(row.investedTryUsd, "USD")}</td><td>${cashFlowEmptyMoney(row.currentUsd)}</td><td>${cashFlowEmptyMoney(row.currentUsdt)}</td><td>${cashFlowEmptyMoney(row.currentTryUsd)}</td><td class="${row.profit === null ? "muted" : row.profit >= 0 ? "positive" : "negative"}">${row.profit === null ? "-" : cashFlowMoney(row.profit, "USD")}</td></tr>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function cashFlowDisplayRow(row) {
  const toneClass = row.amount >= 0 ? "row-positive" : "row-negative";
  const stateClass = row.future ? "future-rate" : row.needsRate ? "missing-rate" : "";
  return `<tr class="clickable-row ${toneClass} ${stateClass}" data-cashflow-edit="${row.id}"><td>${escapeHtml(row.note || "")}</td><td>${formatDate(row.date)}</td><td>${row.currency === "TRY" ? cashFlowSignedPlain(row.amount) : ""}</td><td>${row.currency === "USD" ? cashFlowSignedPlain(row.amount) : ""}</td><td>${row.currency === "USDT" ? cashFlowSignedPlain(row.amount) : ""}</td></tr>`;
}

function cashFlowEditRow(row) {
  return `<tr class="edit-row cashflow-input-row" data-cashflow-edit-row="${row.id}"><td><input id="cashflow-edit-note" value="${escapeAttr(row.note || "")}"></td><td><input id="cashflow-edit-date" type="text" inputmode="numeric" value="${formatDate(row.date)}"></td><td><input id="cashflow-edit-try" type="number" step="1" value="${row.currency === "TRY" ? row.amount : ""}"></td><td><input id="cashflow-edit-usd" type="number" step="1" value="${row.currency === "USD" ? row.amount : ""}"></td><td><div class="edit-grid"><input id="cashflow-edit-usdt" type="number" step="1" value="${row.currency === "USDT" ? row.amount : ""}"><button class="danger" data-cashflow-delete="${row.id}" type="button">Delete</button></div></td></tr>`;
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

function cashFlowYearsInData(movements) {
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

function cashFlowDiffDays(left, right) {
  return Math.max(0, Math.round((new Date(`${right}T12:00:00`) - new Date(`${left}T12:00:00`)) / 86400000));
}

function addIsoDays(date, days) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function nextWeekdayDate(date) {
  const value = new Date(`${date}T12:00:00`);
  const day = value.getDay();
  if (day === 6) return addIsoDays(date, 2);
  if (day === 0) return addIsoDays(date, 1);
  return date;
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

function cashFlowYieldForDate(points, date) {
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

function cashFlowNum(value) {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isUsdLikeCurrency(currency) {
  return currency === "USD" || currency === "USDT";
}

function cashFlowInteger(value) {
  const sign = value < 0 ? "-" : "";
  return sign + Math.round(Math.abs(value || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function cashFlowMoney(value, currency) {
  return `${currency === "TRY" ? "TL " : "$"}${cashFlowInteger(value)}`;
}

function cashFlowEmptyMoney(value) {
  return value === null || value === undefined ? "-" : cashFlowMoney(value, "USD");
}

function cashFlowSignedPlain(value) {
  return `${value > 0 ? "+" : ""}${cashFlowInteger(value)}`;
}

function cashFlowDecimal2(value) {
  return Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cashFlowDecimal1(value) {
  return Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function switchAuthMode(mode) {
  const login = mode === "login";
  elements.loginTab.classList.toggle("active", login);
  elements.registerTab.classList.toggle("active", !login);
  elements.loginForm.classList.toggle("hidden", !login);
  elements.registerForm.classList.toggle("hidden", login);
  elements.authFeedback.textContent = "";
}

async function handleLogin(event) {
  event.preventDefault();
  const username = elements.loginUsername.value.trim();
  const password = elements.loginPassword.value;
  if (!username || !password) {
    elements.authFeedback.textContent = "Enter both username and password.";
    return;
  }

  elements.authFeedback.textContent = "Signing in...";
  elements.loginSubmit.disabled = true;

  let result;
  try {
    result = await authFetch("/api/auth/login", {
      method: "POST",
      body: new URLSearchParams({ username, password }).toString(),
    });
  } catch (error) {
    elements.authFeedback.textContent = "Worker connection failed.";
    elements.loginSubmit.disabled = false;
    return;
  }

  if (!result?.ok) {
    elements.authFeedback.textContent = result?.error || "Sign in failed.";
    elements.loginSubmit.disabled = false;
    return;
  }

  state.session = result.user;
  state.authToken = result.token || "";
  localStorage.setItem(AUTH_TOKEN_KEY, state.authToken);
  await loadGs3mRates();
  await Promise.allSettled([loadUserSettings(), loadRemotePortfolio(), loadRemoteTrPortfolio(), loadRemoteCryptoPortfolio(), loadCashFlowData()]);
  elements.loginForm.reset();
  elements.loginSubmit.disabled = false;
  showApp();
}

async function handleRegister(event) {
  event.preventDefault();
  const username = elements.registerUsername.value.trim();
  const password = elements.registerPassword.value;
  if (!username || !password) {
    elements.authFeedback.textContent = "Choose both username and password.";
    return;
  }

  elements.authFeedback.textContent = "Creating account...";
  elements.registerSubmit.disabled = true;

  let result;
  try {
    result = await authFetch("/api/auth/register", {
      method: "POST",
      body: new URLSearchParams({ username, password }).toString(),
    });
  } catch {
    elements.authFeedback.textContent = "Worker connection failed.";
    elements.registerSubmit.disabled = false;
    return;
  }

  if (!result?.ok) {
    elements.authFeedback.textContent = result?.error || "Account could not be created.";
    elements.registerSubmit.disabled = false;
    return;
  }

  state.session = result.user;
  state.authToken = result.token || "";
  localStorage.setItem(AUTH_TOKEN_KEY, state.authToken);
  await loadGs3mRates();
  await Promise.allSettled([loadUserSettings(), loadRemotePortfolio(), loadRemoteTrPortfolio(), loadCashFlowData()]);
  elements.registerForm.reset();
  elements.registerSubmit.disabled = false;
  showApp();
}

async function handleLogout() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } catch {}
  state.session = null;
  state.authToken = "";
  localStorage.removeItem(AUTH_TOKEN_KEY);
  state.transactions = [];
  state.trRows = [];
  state.cryptoRows = [];
  state.cryptoOpenLots = [];
  state.cryptoClosedLots = [];
  state.cryptoEditingIndex = null;
  state.cryptoPricesBySymbol = new Map();
  state.trEditingId = null;
  state.trPricesBySymbol = new Map();
  state.trCandlesBySymbol = new Map();
  state.trSplitsBySymbol = new Map();
  state.openLots = [];
  state.closedLots = [];
  state.pricesBySymbol = new Map();
  state.candlesBySymbol = new Map();
  state.splitsBySymbol = new Map();
  state.gs3mByMonth = new Map();
  state.priceRefreshToken += 1;
  state.cashFlowMovements = [];
  state.cashFlowEditingId = null;
  state.cashFlowRates = {};
  state.cashFlowLatestRate = null;
  state.cashFlowLoadError = "";
  state.cashFlowMarketDataError = "";
  state.cashFlowStatusMessage = "";
  state.cashFlowYieldStatus = { usdMissingMonths: 0, tryMissingMonths: 0, message: "" };
  state.cashFlowYields = { usd: { points: [] }, try: { points: [] } };
  state.performance = { loading: false, loaded: false, messages: [], series: [], history: {}, rates: {} };
  state.returnCalc = { loading: false, loaded: false, messages: [], history: {}, rates: {} };
  state.quarterCalc = { loading: false, loaded: false, messages: [], history: {}, rates: {} };
  state.marketDataMessages = [];
  state.marketDataMessageBuckets = {};
  showAuth();
}

async function loadGs3mRates() {
  try {
    const payload = await apiFetch("/api/gs3m?cacheOnly=1");
    state.gs3mByMonth = new Map(
      Object.entries(payload?.rates ?? {}).filter(([, value]) => Number.isFinite(Number(value)))
    );
    state.gs3mStatus = {
      source: payload?.source || "",
      latestDate: payload?.latestDate || "",
      pointCount: Number(payload?.pointCount || Object.keys(payload?.rates || {}).length),
      refreshError: payload?.refreshError || "",
    };
  } catch {
    state.gs3mByMonth = new Map();
    state.gs3mStatus = { source: "", latestDate: "", pointCount: 0, refreshError: "" };
  }
}

async function loadRemotePortfolio() {
  const payload = await apiFetch("/api/portfolio");
  state.transactions = Array.isArray(payload?.transactions) ? payload.transactions : [];
  if (!state.transactions.length && isSeedOwner()) {
    state.transactions = structuredClone(seedTransactions);
    normalizeTransactions();
    await persistState();
  }
  normalizeTransactions();
  rebuildPortfolio();
}

async function persistState() {
  if (!state.session || state.saving) return;
  invalidateCashFlowReturns();
  state.saving = true;
  try {
    await apiFetch("/api/portfolio", {
      method: "PUT",
      body: JSON.stringify({ transactions: state.transactions }),
    });
  } finally {
    state.saving = false;
  }
}

async function loadRemoteTrPortfolio() {
  const payload = await apiFetch("/api/tr-portfolio");
  state.trRows = Array.isArray(payload?.rows) ? payload.rows.map(normalizeTrRow) : [];
  renderTrPortfolio();
}

async function loadRemoteCryptoPortfolio() {
  const payload = await apiFetch("/api/crypto-portfolio");
  state.cryptoRows = Array.isArray(payload?.transactions) ? payload.transactions.map(normalizeCryptoRow) : [];
  rebuildCryptoPortfolio();
}

async function persistCryptoPortfolio() {
  if (!state.session || state.cryptoSaving) return;
  state.cryptoSaving = true;
  try {
    await apiFetch("/api/crypto-portfolio", {
      method: "PUT",
      body: JSON.stringify({ transactions: state.cryptoRows.map(normalizeCryptoRow) }),
    });
  } finally {
    state.cryptoSaving = false;
  }
}

function normalizeCryptoRow(row, index = 0) {
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

function normalizeCryptoSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

async function loadSavedSplits({ refresh = false } = {}) {
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

function shouldRefreshSplitScan() {
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

async function persistTrPortfolio() {
  if (!state.session || state.trSaving) return;
  invalidateCashFlowReturns();
  state.trSaving = true;
  try {
    await apiFetch("/api/tr-portfolio", {
      method: "PUT",
      body: JSON.stringify({ rows: state.trRows.map(normalizeTrRow) }),
    });
  } finally {
    state.trSaving = false;
  }
}

function normalizeTrRow(row) {
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

function handleTrDraftChange() {}

function autoSaveTrRow() {
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

function normalizeTrSymbol(symbol) {
  const clean = String(symbol || "").trim().toUpperCase().replace(/İ/g, "I");
  if (clean === "ALTIN.S1") return "ALTINS1";
  return clean.replace(/\.IS$/, "");
}

function normalizeMarketSymbol(symbol) {
  const clean = String(symbol || "").trim().toUpperCase().replace(/İ/g, "I").replace(/Ä°/g, "I");
  if (clean === "ALTIN" || clean === "ALTIN.S1" || clean === "ALTINS1.IS") return "ALTINS1";
  return clean;
}

function renderTrPortfolio() {
  if (!elements.trTable) return;
  state.trRows = state.trRows.map(applyTrDetectedSplitFieldsToRow);
  const openRows = state.trRows.filter(trIsOpen).sort(compareTrRows);
  const closedRows = state.trRows.filter((row) => !trIsOpen(row)).sort(compareTrRows);
  if (!openRows.length && !closedRows.length) {
    elements.trTable.innerHTML = `<div class="empty-card">No TR rows yet.</div>`;
    return;
  }
  const openHtml = openRows.length ? openRows.map(renderTrRow).join("") : `<div class="empty-card">No open TR lots.</div>`;
  const closedHtml = closedRows.length ? closedRows.map(renderTrRow).join("") : `<div class="empty-card">No closed TR lots.</div>`;
  elements.trTable.innerHTML = `
    <section class="tr-lot-panel">
      ${openHtml}
    </section>
    <section class="tr-lot-panel tr-lot-panel-closed">
      <div class="tr-lot-title">Closed lots</div>
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

function renderTrRow(row) {
  return state.trEditingId === row.id ? renderTrEditRow(row) : renderTrDisplayRow(row);
}

function buildTrChainLots() {
  const grouped = new Map();
  for (const row of state.trRows.map(normalizeTrRow)) {
    const symbol = normalizeTrSymbol(row.symbol);
    if (!symbol) continue;
    if (!grouped.has(symbol)) grouped.set(symbol, []);
    grouped.get(symbol).push({ ...row, symbol });
  }

  const openRows = [];
  const closedRows = [];

  for (const [symbol, rows] of grouped.entries()) {
    const sorted = [...rows].sort((left, right) => (left.buyDate || "").localeCompare(right.buyDate || "") || (left.sellDate || "").localeCompare(right.sellDate || ""));
    const first = sorted[0];
    const splitEvent = firstRelevantTrSplitEvent(symbol, sorted, first.buyDate);
    const splitInputRow = sorted.find(trHasValidSplitQuantity) || first;
    const chain = {
      symbol,
      id: first.id,
      sourceId: first.id,
      buyDate: first.buyDate,
      quantity: 0,
      boughtQuantity: 0,
      soldQuantity: 0,
      netCost: 0,
      accrualDate: first.buyDate,
      splitDate: splitInputRow.splitDate || splitEvent?.date || "",
      splitFactor: nullableClientNumber(splitInputRow.splitFactor) ?? splitEvent?.factor ?? getTrSplitFactor(symbol, first.buyDate),
      splitQuantity: nullableClientNumber(splitInputRow.splitQuantity),
      splitBuyTotal: nullableClientNumber(splitInputRow.splitBuyTotal) ?? 0,
      splitApproved: trSplitApproved(splitInputRow),
      dividendQuantity: nullableClientNumber(sorted.find((row) => nullableClientNumber(row.dividendQuantity) != null)?.dividendQuantity),
      splitApplied: false,
      lastSaleDate: "",
      lastSaleTotal: 0,
      lastSaleQuantity: 0,
    };
    chain.splitPending = Boolean(splitEvent || chain.splitDate) && chain.splitFactor > 1 && !(chain.splitQuantity > 0 && chain.splitApproved);

    const accrueTo = (date) => {
      if (!date) return;
      chain.netCost = accrueTrNetCost(chain.netCost, chain.accrualDate, date);
      chain.accrualDate = date;
    };
    const applySplitIfDue = (date) => {
      if (chain.splitApplied || !chain.splitDate || parseDate(date) < parseDate(chain.splitDate)) return;
      if (chain.splitQuantity > 0) chain.quantity = chain.splitQuantity;
      else if (chain.splitFactor > 1) chain.quantity = round4(chain.quantity * chain.splitFactor);
      chain.netCost += chain.splitBuyTotal;
      chain.boughtQuantity = Math.max(chain.boughtQuantity, chain.quantity);
      chain.splitApplied = true;
    };

    for (const row of sorted) {
      accrueTo(row.buyDate);
      applySplitIfDue(row.buyDate);
      const buyQuantity = nullableClientNumber(row.quantity) ?? 1;
      if (row.buyTotal != null) {
        chain.quantity += buyQuantity;
        chain.boughtQuantity += buyQuantity;
        chain.netCost += Number(row.buyTotal) || 0;
      }
      if (row.sellDate && row.sellTotal != null) {
        accrueTo(row.sellDate);
        applySplitIfDue(row.sellDate);
        const sellQuantity = Math.min(nullableClientNumber(row.sellQuantity) ?? buyQuantity, chain.quantity || buyQuantity);
        const quantityBeforeSale = chain.quantity || sellQuantity;
        const saleTotal = Math.abs(Number(row.sellTotal) || 0);
        const soldCost = Math.max(chain.netCost, 0) * (sellQuantity / quantityBeforeSale);
        const estimatedTax = Math.max(saleTotal - soldCost, 0) * taxRateDecimal("tr");
        chain.quantity = round4(quantityBeforeSale - sellQuantity);
        chain.soldQuantity += sellQuantity;
        chain.netCost = round2(chain.netCost - saleTotal + estimatedTax);
        chain.lastSaleDate = row.sellDate;
        chain.lastSaleTotal = saleTotal;
        chain.lastSaleQuantity = sellQuantity;
      }
      chain.accrualDate = row.sellDate || row.buyDate || chain.accrualDate;
    }

    accrueTo(TODAY_ISO);
    applySplitIfDue(TODAY_ISO);
    const quantity = round4(Math.max(chain.dividendQuantity > 0 ? chain.dividendQuantity : chain.quantity, 0));
    const currentPrice = trLatestPrice(symbol);
    const currentValue = currentPrice != null ? round2(currentPrice * quantity) : null;
    const totalProfit = currentValue != null ? round2(currentValue - Math.max(chain.netCost, 0) - Math.max(currentValue - Math.max(chain.netCost, 0), 0) * taxRateDecimal("tr")) : null;
    const unitCost = quantity > 0 ? chain.netCost / quantity : chain.netCost;
    const netSellPrice = currentPrice != null ? currentPrice : null;
    const breakEvenShares = quantity > 0 && chain.netCost > 0 && netSellPrice
      ? calculateBreakEvenShares(quantity, chain.netCost, 0, netSellPrice)
      : null;
    const computed = {
      ...first,
      id: first.id,
      sourceId: first.id,
      symbol,
      buyDate: chain.buyDate,
      sellDate: quantity > 0 ? "" : chain.lastSaleDate,
      sellTotal: quantity > 0 ? null : chain.lastSaleTotal,
      quantity,
      computedQuantity: quantity,
      computedUnitCost: round2(unitCost),
      computedCurrentOrExitPrice: quantity > 0 ? currentPrice : chain.lastSaleQuantity ? chain.lastSaleTotal / chain.lastSaleQuantity : null,
      computedProfit: quantity > 0 ? totalProfit : round2(-Math.max(chain.netCost, 0)),
      computedBreakEvenShares: breakEvenShares,
      splitDate: chain.splitDate,
      splitFactor: chain.splitFactor,
      splitQuantity: chain.splitQuantity,
      splitApproved: chain.splitApproved,
      dividendQuantity: chain.dividendQuantity,
      splitPending: chain.splitPending,
    };
    if (quantity > 0) openRows.push(computed);
    else closedRows.push(computed);
  }

  return {
    openRows: openRows.sort(compareTrRows),
    closedRows: closedRows.sort(compareTrRows),
  };
}

function renderTrDisplayRow(row) {
  const profit = trProfit(row);
  const quantity = trDisplayQuantity(row);
  const entryPrice = trEntryPrice(row);
  const currentOrExitPrice = trCurrentOrExitPrice(row);
  const totalCost = trEffectiveBuyTotal(row);
  const currentOrExitValue = trCurrentOrExitValue(row);
  const naiveProfit = (currentOrExitValue != null && totalCost != null)
    ? round2(currentOrExitValue - totalCost)
    : null;
  const splitPending = trNeedsSplitInput(row);
  const rowState = splitPending ? "row-split-pending" : classifyRowState(trEffectiveBuyTotal(row) || 0, profit);
  return `
    <article class="position-row tr-row ${rowState}" data-tr-edit="${row.id}">
      <div class="tr-grid">
        <div class="cell-strong">${escapeHtml(row.symbol)}${splitPending ? `<span class="split-needed">Corporate action info needed</span>` : ""}</div>
        <div class="cell-center">${formatDate(row.buyDate)}</div>
        <div class="number-cell">${formatAmountHtml(quantity, 2)}</div>
        ${stackedCell(plainAmount(entryPrice), currentOrExitPrice == null ? "No price" : plainAmount(currentOrExitPrice))}
        ${stackedCell(plainAmount(totalCost), currentOrExitValue == null ? "No price" : plainAmount(currentOrExitValue))}
        ${stackedCell(
          profit == null ? "-" : plainAmount(profit),
          naiveProfit == null ? "-" : plainAmount(naiveProfit),
          { topClass: profitClassName(profit), bottomClass: profitClassName(naiveProfit), mutedBottom: false }
        )}
        <div class="cell-center">${renderTrBreakEvenCell(row)}</div>
        <div class="cell-center">${trIsOpen(row) ? renderTrCandlesCell(row.symbol, "m12") : ""}</div>
        <div class="cell-center">${trIsOpen(row) ? renderTrCandlesCell(row.symbol, "d14") : ""}</div>
      </div>
    </article>
  `;
}

function renderTrEditRow(row) {
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
        <input name="symbol" value="${escapeAttr(row.symbol)}" />
        <input name="buyDate" type="text" inputmode="numeric" value="${formatDate(row.buyDate)}" />
        <input name="quantity" type="number" step="0.0001" placeholder="Qty" value="${row.quantity == null ? "" : row.quantity}" />
        <input name="buyTotal" type="number" step="0.01" placeholder="Entry total" value="${row.buyTotal == null ? "" : row.buyTotal}" />
        <div class="number-cell">${trCurrentOrExitPrice(row) == null ? "No price" : trMoney(trCurrentOrExitPrice(row))}</div>
        <div class="number-cell">${trProfit(row) == null ? "-" : trMoney(trProfit(row))}</div>
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
      </form>
    </article>
  `;
}

function saveTrEditForm(form) {
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

async function refreshTrMarketData(options = {}) {
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

  if (fresh) updateMarketStatus("tr", aggregateStatus);
  state.trCandlesBySymbol = mergedCandles;
  renderTrPortfolio();
  renderCashFlow();
}

function toYahooTrSymbol(symbol) {
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

function trIsOpen(row) {
  if (row?.computedQuantity != null) return row.computedQuantity > 0;
  return !row.sellDate || row.sellTotal == null;
}

function trProfit(row) {
  if (row?.computedProfit != null) return row.computedProfit;
  const cost = trEffectiveBuyTotal(row);
  if (cost == null) return null;
  const currentOrExit = trCurrentOrExitValue(row);
  if (currentOrExit == null) return null;
  return round2(currentOrExit - cost - trOpportunityCost(row) - trEstimatedTax(row));
}

function trUnitPrice(total, quantity) {
  if (total == null || !quantity) return null;
  return round2(total / quantity);
}

function trIsImportedUnknownQuantity(row) {
  const quantity = nullableClientNumber(row?.quantity);
  if (quantity == null || quantity <= 0) return true;
  if (String(row?.id || "").includes("tr-xlsx-") && quantity === 1) return true;
  const buyTotal = nullableClientNumber(row?.buyTotal);
  const symbol = normalizeTrSymbol(row?.symbol);
  const livePrice = symbol ? trLatestPrice(symbol) : null;
  return quantity === 1 && buyTotal != null && buyTotal > 1000 && (!livePrice || buyTotal > livePrice * 5);
}

function trDisplayQuantity(row) {
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

function trCurrentOrExitValue(row) {
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

function trEffectiveBuyTotal(row) {
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

function trNeedsSplitInput(row) {
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
  if (row?.computedBreakEvenShares != null) return row.computedBreakEvenShares;
  if (!trIsOpen(row)) return null;
  const cost = trEffectiveBuyTotal(row);
  const price = trCurrentOrExitPrice(row);
  const quantity = trDisplayQuantity(row);
  if (!(cost > 0) || !(price > 0) || !(quantity > 0)) return null;
  const required = Math.ceil(cost / price);
  return required < quantity ? required : null;
}

function accrueTrNetCost(amount, startDate, endDate) {
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return round2(Number(amount) || 0);
  return round2(Number(amount) + cashFlowAccrueWithCurve(Number(amount), startDate, endDate, state.cashFlowYields.try.points));
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

function splitEventFactor(event) {
  return nullableClientNumber(event?.factor) || nullableClientNumber(event?.ratio) || nullableClientNumber(event?.splitFactor);
}

function trSaleBeforeSplit(row) {
  if (!row?.splitDate || !row?.sellDate) return false;
  return parseDate(row.sellDate) < parseDate(row.splitDate);
}

function getTrSplitFactor(symbol, buyDate) {
  const key = String(symbol || "").trim().toUpperCase();
  const cleanKey = normalizeTrSymbol(key);
  const event = firstRelevantTrSplitEvent(cleanKey, [], buyDate);
  if (event) return Number(event.factor) || 1;
  return 1;
}

function relevantTrSplitEvent(row) {
  if (!row?.buyDate) return null;
  const manualEvent = row.splitDate ? { date: row.splitDate, factor: nullableClientNumber(row.splitFactor) || 1 } : null;
  const event = manualEvent || detectedTrSplitEventForRow(row) || firstRelevantTrSplitEvent(row.symbol, [normalizeTrRow(row)], row.buyDate);
  if (!event) return null;
  const sellDate = row.sellDate || "";
  if (sellDate && parseDate(sellDate) < parseDate(event.date)) return null;
  if (parseDate(row.buyDate) >= parseDate(event.date)) return null;
  return event;
}

function firstRelevantTrSplitEvent(symbol, rows = [], buyDate = "") {
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

function trLatestPrice(symbol) {
  const directPrice = state.trPricesBySymbol.get(symbol);
  if (Number.isFinite(directPrice)) return round2(directPrice);
  const candles = state.trCandlesBySymbol.get(symbol);
  const daily = candles?.d14 || candles?.d30;
  const monthly = candles?.m12;
  const last = Array.isArray(daily) && daily.length ? daily[daily.length - 1] : Array.isArray(monthly) && monthly.length ? monthly[monthly.length - 1] : null;
  return Number.isFinite(last?.close) ? round2(last.close) : null;
}

function trOpportunityCost(row) {
  const principal = Number(trEffectiveBuyTotal(row));
  if (!Number.isFinite(principal) || principal <= 0 || !row.buyDate) return 0;
  const endDate = trIsOpen(row) ? TODAY_ISO : row.sellDate;
  if (!endDate || endDate <= row.buyDate) return 0;
  return round2(cashFlowAccrueWithCurve(principal, row.buyDate, endDate, state.cashFlowYields.try.points));
}

function trEstimatedTax(row) {
  const rate = taxRateDecimal("tr");
  if (!rate) return 0;
  const cost = trEffectiveBuyTotal(row);
  const currentOrExit = trCurrentOrExitValue(row);
  if (cost == null || currentOrExit == null) return 0;
  return round2(Math.max(currentOrExit - cost, 0) * rate);
}

function cashFlowAccrueWithCurve(principal, startDate, endDate, curvePoints) {
  if (!curvePoints?.length) return 0;
  let interest = 0;
  const boundaries = new Set([startDate, endDate]);
  for (const point of curvePoints) if (point.date >= startDate && point.date <= endDate) boundaries.add(point.date);
  const dates = [...boundaries].sort();
  for (let index = 0; index < dates.length - 1; index += 1) {
    const date = dates[index];
    const next = dates[index + 1];
    const days = cashFlowDiffDays(date, next);
    const rate = cashFlowYieldForDate(curvePoints, date);
    interest += principal * (rate / 100) * days / 365;
  }
  return interest;
}

function renderTrCandlesCell(symbol, key) {
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

function nullableClientNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(String(value).replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}

function splitFieldsChanged(row, next, keys = {}) {
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

function formSplitFieldsTouched(form) {
  return form.dataset.splitTouched === "1";
}

function bindSplitFieldTracking(form) {
  form.querySelectorAll("[data-split-field]").forEach((field) => {
    field.addEventListener("input", () => {
      form.dataset.splitTouched = "1";
    });
    field.addEventListener("change", () => {
      form.dataset.splitTouched = "1";
    });
  });
}

function normalizeTransactions() {
  state.transactions = mergeLegacyLots(state.transactions).map((row, index) => {
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
}

function mergeLegacyLots(rows) {
  const oscrRows = rows.filter((row) => row.symbol === "OSCR" && row.pcs > 0 && (row.date === "2025-07-11" || row.date === "2025-07-18"));
  if (oscrRows.length < 2) return rows;

  const mergedShares = oscrRows.reduce((sum, row) => sum + Number(row.pcs), 0);
  const mergedAmount = round2(oscrRows.reduce((sum, row) => sum + Math.abs(Number(row.amount) || 0), 0));
  const mergedFee = round2(oscrRows.reduce((sum, row) => sum + Math.abs(Number(row.fee) || 0), 0));
  const mergedTotal = round2(oscrRows.reduce((sum, row) => sum + Math.abs(Number(row.total) || 0), 0));
  const mergedDate = [...oscrRows].sort((a, b) => parseDate(a.date) - parseDate(b.date))[0].date;
  const mergedRow = {
    symbol: "OSCR",
    date: mergedDate,
    pcs: mergedShares,
    price: round4(mergedAmount / mergedShares),
    amount: mergedAmount,
    fee: mergedFee,
    total: mergedTotal,
    note: "",
    chainId: "OSCR::merged-2025-07",
  };

  return [
    ...rows.filter((row) => !(row.symbol === "OSCR" && row.pcs > 0 && (row.date === "2025-07-11" || row.date === "2025-07-18"))),
    mergedRow,
  ].sort((a, b) => parseDate(a.date) - parseDate(b.date));
}

function handleDraftChange() {}

function autoSaveTransaction() {
  const symbol = elements.symbolInput.value.trim().toUpperCase();
  const date = normalizeInputDate(elements.dateInput.value);
  const shares = Number(elements.sharesInput.value);
  const totalPaid = Number(elements.totalInput.value);
  const note = elements.noteInput.value.trim();

  if (!symbol && !date && !elements.sharesInput.value && !elements.totalInput.value) return;
  if (!symbol || !date || !Number.isFinite(shares) || shares === 0 || !Number.isFinite(totalPaid) || totalPaid <= 0) return;

  const fee = DEFAULT_FEE;
  const amount = round2(Math.max(totalPaid - fee, 0));
  const absoluteShares = Math.abs(shares);
  const price = absoluteShares > 0 ? round2(amount / absoluteShares) : 0;
  const signedAmount = shares < 0 ? -amount : amount;
  const signedTotal = shares < 0 ? -round2(totalPaid) : round2(totalPaid);
  const chainId = shares < 0 ? resolveSellChainId(symbol, absoluteShares) : `${symbol}::user-${Date.now()}`;

  if (!chainId) return;

  state.transactions.push({
    symbol,
    date,
    pcs: shares,
    price,
    amount: signedAmount,
    fee,
    total: signedTotal,
    note,
    chainId,
  });

  persistState();
  rebuildPortfolio();
  clearDraftForm();
}

async function refreshPrices(options = {}) {
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
  if (fresh) updateMarketStatus("abd", aggregateStatus);
  setMarketDataMessages("abd", messages);
  renderPortfolioSummary();
  renderPositions();
  updateStatusTab();
}

function rebuildPortfolio() {
  const lots = buildOpenLots(state.transactions, taxRateDecimal("usa"), state.pricesBySymbol, state.gs3mByMonth);
  state.openLots = lots.openLots;
  state.closedLots = lots.closedLots;
  renderPortfolioSummary();
  renderPositions();
  renderCashFlow();
}

function buildOpenLots(rows, taxRate, pricesBySymbol, gs3mByMonth) {
  const grouped = new Map();
  for (const row of rows) {
    const symbol = normalizeMarketSymbol(row.symbol);
    if (!symbol) continue;
    const groupKey = abdGroupKey({ ...row, symbol });
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey).push({ ...row, symbol });
  }

  const openLots = [];
  const closedLots = [];

  for (const [, symbolRows] of grouped.entries()) {
    const symbol = symbolRows[0]?.symbol;
    if (!symbol) continue;
    const sortedRows = [...symbolRows].sort((a, b) => parseDate(a.date) - parseDate(b.date));
    const buyRows = sortedRows.filter((row) => Number(row.pcs) > 0);
    if (!buyRows.length) continue;
    const firstBuy = buyRows[0];
    const firstBuyIndex = rows.findIndex((row) => row === firstBuy || (normalizeMarketSymbol(row.symbol) === symbol && row.date === firstBuy.date && Number(row.pcs) > 0));
    const sourceIndex = firstBuyIndex >= 0 ? firstBuyIndex : findSourceIndex(rows, { chainId: firstBuy.chainId });
    const splitEvent = firstRelevantAbdSplitEvent(symbol, sortedRows, firstBuy.date);
    const splitInputRow = buyRows.find((row) => nullableClientNumber(row.splitShares) != null && nullableClientNumber(row.splitShares) > 0) || firstBuy;
    const splitDate = splitInputRow.splitDate || splitEvent?.date || "";
    const splitFactor = nullableClientNumber(splitInputRow.splitFactor) ?? splitEvent?.factor ?? getSplitFactor(symbol, firstBuy.date);
    const splitShares = nullableClientNumber(splitInputRow.splitShares);
    const splitExtraCost = nullableClientNumber(splitInputRow.splitTotal) ?? 0;
    const splitApproved = abdSplitApproved(splitInputRow);
    const dividendShares = nullableClientNumber(buyRows.find((row) => nullableClientNumber(row.dividendQuantity) != null)?.dividendQuantity);
    const hasSplitQuantity = splitShares != null && splitShares > 0;
    const splitPending = Boolean(splitEvent || splitDate) && splitFactor > 1 && !(hasSplitQuantity && splitApproved);
    const stateForSymbol = {
      symbol,
      originDate: firstBuy.date,
      quantity: 0,
      boughtQuantity: 0,
      soldQuantity: 0,
      netCost: 0,
      accrualDate: firstBuy.date,
      sellFeeEstimate: 1.5,
      splitDate,
      splitFactor,
      splitShares,
      splitExtraCost,
      splitApproved,
      dividendShares,
      hasSplitQuantity,
      splitPending,
      splitApplied: false,
      lastSaleDate: "",
      lastSaleTotal: 0,
      lastSaleQuantity: 0,
      chainId: firstBuy.chainId || `${symbol}::chain`,
    };

    const accrueChainTo = (targetDate) => {
      stateForSymbol.netCost = accrueUsdCarry(stateForSymbol.netCost, stateForSymbol.accrualDate, targetDate, gs3mByMonth);
      stateForSymbol.accrualDate = toIsoDate(targetDate);
    };
    const applySplitIfDue = (targetDate) => {
      if (stateForSymbol.splitApplied || !stateForSymbol.splitDate || parseDate(targetDate) < parseDate(stateForSymbol.splitDate)) return;
      if (stateForSymbol.hasSplitQuantity) {
        stateForSymbol.quantity = stateForSymbol.splitShares;
      } else if (stateForSymbol.splitFactor > 1) {
        stateForSymbol.quantity = round4(stateForSymbol.quantity * stateForSymbol.splitFactor);
      }
      stateForSymbol.netCost += stateForSymbol.splitExtraCost;
      stateForSymbol.boughtQuantity = Math.max(stateForSymbol.boughtQuantity, stateForSymbol.quantity);
      stateForSymbol.splitApplied = true;
    };

    for (const row of sortedRows) {
      accrueChainTo(row.date);
      applySplitIfDue(row.date);
      const rowQuantity = Number(row.pcs) || 0;
      const rowTotal = Math.abs(Number(row.total) || Number(row.amount) || 0);
      const fee = Math.abs(Number(row.fee) || 0);
      stateForSymbol.sellFeeEstimate = Math.max(stateForSymbol.sellFeeEstimate, fee || 0);

      if (rowQuantity > 0) {
        stateForSymbol.quantity += rowQuantity;
        stateForSymbol.boughtQuantity += rowQuantity;
        stateForSymbol.netCost += rowTotal;
        stateForSymbol.accrualDate = row.date;
        continue;
      }

      if (rowQuantity < 0 && stateForSymbol.quantity > 0) {
        const saleQuantity = Math.min(Math.abs(rowQuantity), stateForSymbol.quantity);
        const saleTotal = rowTotal;
        const costBeforeSale = stateForSymbol.netCost;
        const quantityBeforeSale = stateForSymbol.quantity;
        const soldCost = Math.max(costBeforeSale, 0) * (saleQuantity / quantityBeforeSale);
        const estimatedTax = Math.max(saleTotal - soldCost, 0) * taxRate;
        stateForSymbol.quantity = round4(quantityBeforeSale - saleQuantity);
        stateForSymbol.soldQuantity += saleQuantity;
        stateForSymbol.netCost = round2(costBeforeSale - saleTotal + estimatedTax);
        stateForSymbol.accrualDate = row.date;
        stateForSymbol.lastSaleDate = row.date;
        stateForSymbol.lastSaleTotal = saleTotal;
        stateForSymbol.lastSaleQuantity = saleQuantity;
      }
    }

    accrueChainTo(new Date());
    applySplitIfDue(new Date());
    const livePrice = pricesBySymbol.get(String(symbol || "").trim().toUpperCase()) ?? null;
    const remainingShares = round4(Math.max(stateForSymbol.dividendShares > 0 ? stateForSymbol.dividendShares : stateForSymbol.quantity, 0));
    const displayNetCost = round2(stateForSymbol.netCost);
    const unitCost = remainingShares > 0 ? displayNetCost / remainingShares : 0;
    const referencePrice = livePrice ?? null;
    const netSellPrice = referencePrice != null
      ? Math.max(referencePrice - Math.max(referencePrice - unitCost, 0) * taxRate, 0)
      : null;
    const breakEvenShares = displayNetCost > 0 && netSellPrice && netSellPrice > 0
      ? calculateBreakEvenShares(remainingShares, displayNetCost, stateForSymbol.sellFeeEstimate, netSellPrice)
      : null;
    const totalProfit = referencePrice != null && remainingShares > 0
      ? calculateTotalProfit(remainingShares, referencePrice, displayNetCost, unitCost, stateForSymbol.sellFeeEstimate, taxRate)
      : null;
    const rowState = stateForSymbol.splitPending ? "row-split-pending" : classifyRowState(displayNetCost, totalProfit);
    const lot = {
      symbol,
      date: stateForSymbol.originDate,
      originalShares: round4(Math.max(stateForSymbol.boughtQuantity, remainingShares)),
      soldShares: round4(stateForSymbol.soldQuantity),
      remainingShares,
      averageCost: round2(unitCost),
      referencePrice,
      remainingCost: displayNetCost,
      totalProfit,
      breakEvenShares,
      rowState,
      sourceIndex,
      sourceTotal: Number(firstBuy.total) || 0,
      splitFactor: stateForSymbol.splitFactor,
      splitDate: stateForSymbol.splitDate,
      splitApproved: stateForSymbol.splitApproved,
      dividendQuantity: stateForSymbol.dividendShares,
      splitPending: stateForSymbol.splitPending,
      chainId: stateForSymbol.chainId,
      candles: pricesBySymbol ? null : null,
      exitDate: stateForSymbol.lastSaleDate,
    };

    if (remainingShares > 0) openLots.push(lot);
    else closedLots.push({
      ...lot,
      originalShares: round4(stateForSymbol.soldQuantity || stateForSymbol.boughtQuantity),
      averageCost: round2(displayNetCost),
      referencePrice: stateForSymbol.lastSaleQuantity > 0 ? stateForSymbol.lastSaleTotal / stateForSymbol.lastSaleQuantity : 0,
      totalProfit: round2(-Math.max(displayNetCost, 0)),
    });
  }

  return {
    openLots: openLots.sort((a, b) => parseDate(b.date) - parseDate(a.date)),
    closedLots: closedLots.sort((a, b) => parseDate(b.date) - parseDate(a.date)),
  };
}

function renderPositions() {
  if (!state.openLots.length && !state.closedLots.length) {
    elements.positionsTable.innerHTML = `<div class="empty-card">No positions yet.</div>`;
    return;
  }

  const openHtml = state.openLots
    .map((lot) => state.editingIndex === lot.sourceIndex ? renderEditRow(lot) : renderDisplayRow(lot))
    .join("");
  const closedHtml = state.closedLots.length
    ? state.closedLots.map((lot) => state.editingIndex === lot.sourceIndex ? renderEditRow(lot) : renderClosedDisplayRow(lot)).join("")
    : "";

  elements.positionsTable.innerHTML = `
    <section class="abd-lot-panel">
      ${openHtml || `<div class="empty-card">No open positions.</div>`}
    </section>
    ${closedHtml ? `
      <section class="abd-lot-panel abd-lot-panel-closed">
        <div class="tr-lot-title">Closed lots</div>
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
  elements.positionsTable.querySelectorAll("[data-toggle-abd-separate]").forEach((button) => button.addEventListener("click", toggleAbdSeparateTransaction));
}

function clearDraftForm() {
  elements.transactionForm.reset();
  elements.sideInput.value = "buy";
}

function handleCryptoDraftChange() {}

function autoSaveCryptoTransaction() {
  const symbol = normalizeCryptoSymbol(elements.cryptoSymbolInput.value);
  const date = normalizeInputDate(elements.cryptoDateInput.value) || elements.cryptoDateInput.value || "";
  const quantity = Number(elements.cryptoQuantityInput.value);
  const total = Number(elements.cryptoTotalInput.value);
  if (!symbol && !date && !elements.cryptoQuantityInput.value && !elements.cryptoTotalInput.value) return;
  if (!symbol || !date || !Number.isFinite(quantity) || quantity === 0 || !Number.isFinite(total) || total <= 0) return;
  const signedTotal = quantity < 0 ? -Math.abs(total) : Math.abs(total);
  state.cryptoRows.push(normalizeCryptoRow({
    symbol,
    date,
    quantity,
    total: signedTotal,
    chainId: `${symbol}::crypto-${Date.now()}`,
  }, state.cryptoRows.length));
  elements.cryptoEntryForm.reset();
  persistCryptoPortfolio();
  rebuildCryptoPortfolio();
}

async function refreshCryptoPrices(options = {}) {
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

function rebuildCryptoPortfolio() {
  const lots = buildCryptoLots(state.cryptoRows, state.cryptoPricesBySymbol);
  state.cryptoOpenLots = lots.openLots;
  state.cryptoClosedLots = lots.closedLots;
  renderCryptoPortfolio();
}

function buildCryptoLots(rows, pricesBySymbol) {
  const grouped = new Map();
  for (const row of rows.map(normalizeCryptoRow)) {
    if (!row.symbol) continue;
    if (!grouped.has(row.symbol)) grouped.set(row.symbol, []);
    grouped.get(row.symbol).push(row);
  }
  const openLots = [];
  const closedLots = [];
  const usdCurvePoints = state.cashFlowYields?.usd?.points || [];
  for (const [symbol, symbolRows] of grouped.entries()) {
    let quantity = 0;
    let cost = 0;
    // USD opportunity cost: each buy tranche accrues GS3M (USD risk-free)
    // interest from its own date to today; sells shrink the accrued figure by
    // the same proportion as the cost basis. Mirrors the TR tab's TRY-deposit
    // opportunity cost, but with USD rates (~4-5%) since crypto is USD-priced.
    let opportunityCost = 0;
    let firstBuy = null;
    let lastSale = null;
    const sorted = [...symbolRows].sort((a, b) => parseDate(a.date) - parseDate(b.date));
    for (const row of sorted) {
      if (row.quantity > 0) {
        if (!firstBuy) firstBuy = row;
        quantity += row.quantity;
        cost += Math.abs(row.total);
        opportunityCost += cashFlowAccrueWithCurve(Math.abs(row.total), row.date, TODAY_ISO, usdCurvePoints);
      } else if (row.quantity < 0) {
        const sellQuantity = Math.min(Math.abs(row.quantity), quantity);
        const ratio = quantity > 0 ? sellQuantity / quantity : 0;
        cost = round2(cost - cost * ratio - Math.abs(row.total));
        opportunityCost -= opportunityCost * ratio;
        quantity = round8(quantity - sellQuantity);
        lastSale = row;
      }
    }
    if (!firstBuy) continue;
    const price = pricesBySymbol.get(symbol) ?? null;
    const unitCost = quantity > 0 ? cost / quantity : firstBuy.price;
    const value = price != null && quantity > 0 ? round2(price * quantity) : null;
    const opportunity = quantity > 0 ? round2(Math.max(opportunityCost, 0)) : 0;
    const profit = value != null ? round2(value - Math.max(cost, 0) - opportunity) : null;
    const lot = {
      symbol,
      date: firstBuy.date,
      remainingShares: round8(Math.max(quantity, 0)),
      averageCost: round2(unitCost),
      referencePrice: price,
      totalProfit: profit,
      opportunityCost: opportunity,
      remainingCost: round2(cost),
      breakEvenShares: null,
      rowState: classifyRowState(cost, profit),
      sourceIndex: state.cryptoRows.findIndex((row) => normalizeCryptoSymbol(row.symbol) === symbol && Number(row.quantity) > 0),
      sourceTotal: firstBuy.total,
      exitDate: lastSale?.date || "",
    };
    if (quantity > 0) openLots.push(lot);
    else closedLots.push({ ...lot, remainingShares: 0, referencePrice: lastSale ? Math.abs(lastSale.total / lastSale.quantity) : null, totalProfit: round2(-Math.max(cost, 0)) });
  }
  return {
    openLots: openLots.sort((a, b) => parseDate(b.date) - parseDate(a.date)),
    closedLots: closedLots.sort((a, b) => parseDate(b.date) - parseDate(a.date)),
  };
}

function renderCryptoPortfolio() {
  if (!elements.cryptoTable) return;
  if (!state.cryptoOpenLots.length && !state.cryptoClosedLots.length) {
    elements.cryptoTable.innerHTML = state.cryptoRows.length
      ? `<div class="crypto-raw-list">${state.cryptoRows.slice().sort((a, b) => parseDate(b.date) - parseDate(a.date)).map(renderCryptoRawRow).join("")}</div>`
      : `<div class="empty-card">No crypto positions yet.</div>`;
    return;
  }
  const openHtml = state.cryptoOpenLots.map((lot) => state.cryptoEditingIndex === lot.sourceIndex ? renderCryptoEditRow(lot) : renderCryptoDisplayRow(lot)).join("");
  const closedHtml = state.cryptoClosedLots.map(renderCryptoClosedRow).join("");
  elements.cryptoTable.innerHTML = `
    <section class="abd-lot-panel">${openHtml || `<div class="empty-card">No open crypto positions.</div>`}</section>
    ${closedHtml ? `<section class="abd-lot-panel abd-lot-panel-closed"><div class="tr-lot-title">Closed lots</div>${closedHtml}</section>` : ""}
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
        <div class="cell-center">${formatSmartNumber(row.quantity)}</div>
        <div class="number-cell">${cryptoMoney(Math.abs(row.total) / Math.abs(row.quantity || 1))}</div>
        <div class="number-cell">No price</div>
        <div class="number-cell">${cryptoMoney(row.total)}</div>
        <div></div><div></div><div></div>
      </div>
    </article>
  `;
}

function renderCryptoDisplayRow(lot) {
  const currentValue = (lot.referencePrice != null && lot.remainingShares > 0)
    ? round2(lot.referencePrice * lot.remainingShares)
    : null;
  const naiveProfit = currentValue != null
    ? round2(currentValue - Math.max(lot.remainingCost ?? 0, 0))
    : null;
  return `
    <article class="position-row ${lot.rowState}" data-crypto-edit="${lot.sourceIndex}">
      <div class="row-grid">
        <div class="cell-strong">${escapeHtml(lot.symbol)}</div>
        <div class="cell-center">${formatDate(lot.date)}</div>
        <div class="cell-center">${formatSmartNumber(lot.remainingShares)}</div>
        ${stackedCell(plainAmount(lot.averageCost), lot.referencePrice == null ? "No price" : plainAmount(lot.referencePrice))}
        ${stackedCell(plainAmount(lot.remainingCost), currentValue == null ? "No price" : plainAmount(currentValue))}
        ${stackedCell(
          lot.totalProfit == null ? "-" : plainAmount(lot.totalProfit),
          naiveProfit == null ? "-" : plainAmount(naiveProfit),
          { topClass: profitClassName(lot.totalProfit), bottomClass: profitClassName(naiveProfit), mutedBottom: false }
        )}
        <div class="cell-center"></div><div></div><div></div>
      </div>
    </article>
  `;
}

function renderCryptoClosedRow(lot) {
  return renderCryptoDisplayRow(lot);
}

function renderCryptoEditRow(lot) {
  const row = state.cryptoRows[lot.sourceIndex] || {};
  const activityRows = cryptoTransactionRowsForEdit(lot.symbol);
  return `
    <article class="position-row ${lot.rowState} editing-row">
      <form class="row-grid crypto-edit-form" data-crypto-form="${lot.sourceIndex}">
        <input class="cell-center" name="symbol" value="${escapeAttr(row.symbol || lot.symbol)}" />
        <input class="cell-center" name="date" type="text" inputmode="numeric" value="${formatDate(row.date || lot.date)}" />
        <input class="cell-center" name="quantity" type="number" step="0.00000001" value="${formatEditNumber(row.quantity ?? lot.remainingShares)}" />
        <input class="cell-center" name="total" type="number" step="0.01" value="${formatEditNumber(Math.abs(row.total ?? lot.sourceTotal))}" />
        <div class="number-cell">${lot.referencePrice == null ? "No price" : cryptoMoney(lot.referencePrice)}</div>
        <div class="number-cell ${profitClassName(lot.totalProfit)}">${lot.totalProfit == null ? "-" : cryptoMoney(lot.totalProfit)}</div>
        <button class="danger delete-button" data-crypto-delete="${lot.sourceIndex}" type="button">Delete</button><div></div><div></div>
        <div class="abd-transaction-list crypto-transaction-list">
          <span>Activities</span>
          ${activityRows.map(renderCryptoTransactionItem).join("")}
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

function renderCryptoTransactionItem({ row, index }) {
  const quantity = Number(row.quantity) || 0;
  const side = quantity > 0 ? "Buy" : "Sell";
  return `
    <div class="abd-transaction-item crypto-transaction-item" data-crypto-movement="${index}">
      <strong>${side}</strong>
      <input name="cryptoDate-${index}" type="text" inputmode="numeric" value="${formatDate(row.date)}" />
      <input name="cryptoQuantity-${index}" type="number" step="0.00000001" value="${formatEditNumber(row.quantity)}" />
      <input name="cryptoTotal-${index}" type="number" min="0" step="0.01" value="${formatEditNumber(Math.abs(Number(row.total) || 0))}" />
      <button class="danger delete-button" data-crypto-delete="${index}" type="button">Delete</button>
    </div>
  `;
}

function saveCryptoEditForm(form) {
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

function renderPortfolioSummary() {
  const totalProfit = round2(state.openLots.reduce((sum, lot) => sum + (lot.totalProfit ?? 0), 0));
  const totalCostBase = round2(state.openLots.reduce((sum, lot) => sum + Math.max(lot.remainingCost ?? 0, 0), 0));
  const totalPercent = totalCostBase > 0 ? Math.round((totalProfit / totalCostBase) * 100) : 0;

  elements.portfolioProfit.textContent = formatCurrency(totalProfit);
  elements.portfolioProfit.className = `summary-profit ${profitClassName(totalProfit)}`;
  elements.portfolioProfitPercent.textContent = `%${totalPercent}`;
  elements.portfolioProfitPercent.className = `summary-profit-percent ${profitClassName(totalProfit)}`;
  elements.portfolioChartWrap.innerHTML = renderPortfolioCandles();
}

function renderShareCell(lot) {
  return formatNumber(lot.remainingShares, 0);
}

function renderDisplayRow(lot) {
  const splitPending = Boolean(lot.splitPending);
  const currentValue = (lot.referencePrice != null && lot.remainingShares > 0)
    ? round2(lot.referencePrice * lot.remainingShares)
    : null;
  const naiveProfit = currentValue != null
    ? round2(currentValue - Math.max(lot.remainingCost ?? 0, 0))
    : null;
  return `
    <article class="position-row ${lot.rowState}" data-edit-index="${lot.sourceIndex}">
      <div class="row-grid">
        <div class="cell-strong">${lot.symbol}${splitPending ? `<span class="split-needed">Corporate action info needed</span>` : ""}</div>
        <div class="cell-center">${formatDate(lot.date)}</div>
        <div class="cell-center">${renderShareCell(lot)}</div>
        ${stackedCell(plainAmount(lot.averageCost), lot.referencePrice != null ? plainAmount(lot.referencePrice) : "No price")}
        ${stackedCell(plainAmount(lot.remainingCost), currentValue != null ? plainAmount(currentValue) : "No price")}
        ${stackedCell(
          lot.totalProfit != null ? plainAmount(lot.totalProfit) : "-",
          naiveProfit != null ? plainAmount(naiveProfit) : "-",
          { topClass: profitClassName(lot.totalProfit), bottomClass: profitClassName(naiveProfit), mutedBottom: false }
        )}
        <div class="cell-center">${renderBreakEvenCell(lot)}</div>
        <div class="cell-center">${renderCandlesCell(lot.symbol, "m12")}</div>
        <div class="cell-center">${renderCandlesCell(lot.symbol, "d14")}</div>
      </div>
    </article>
  `;
}

function renderEditRow(lot) {
  const row = state.transactions[lot.sourceIndex] || {};
  const splitEvent = relevantAbdSplitEventForRow(row);
  const needsSplitInput = Boolean(splitEvent);
  const splitDateValue = row.splitDate || splitEvent?.date || "";
  const suggestedSplitShares = abdSuggestedSplitShares(row, splitEvent);
  const splitSharesValue = row.splitShares == null || Number(row.splitShares) <= 0 ? suggestedSplitShares : row.splitShares;
  const sellRow = findRelatedSellRow(row);
  const chainRows = abdTransactionRowsForEdit(lot.symbol);
  return `
    <article class="position-row ${lot.rowState} editing-row">
      <form class="row-grid edit-row-form" data-edit-form="${lot.sourceIndex}">
        <input class="cell-center" name="symbol" value="${lot.symbol}" />
        <input class="cell-center" name="date" type="text" inputmode="numeric" value="${formatDate(lot.date)}" />
        <input class="cell-center" name="shares" type="number" min="0.0001" step="0.0001" value="${formatEditNumber(row.pcs ?? lot.originalShares)}" />
        <input class="cell-center" name="total" type="number" min="0" step="0.01" value="${formatEditNumber(row.total ?? lot.sourceTotal)}" />
        <div class="number-cell">${lot.referencePrice != null ? formatCurrency(lot.referencePrice) : "No price"}</div>
        <div class="number-cell ${profitClassName(lot.totalProfit)}">${lot.totalProfit != null ? formatCurrency(lot.totalProfit) : ""}</div>
        <div class="cell-center">${renderBreakEvenCell(lot)}</div>
        <div class="cell-center">${renderCandlesCell(lot.symbol, "m12")}</div>
        <button class="danger delete-button" data-delete-index="${lot.sourceIndex}" type="button">Delete</button>
        ${needsSplitInput ? `
          <div class="split-edit-fields">
            <span>Post-action</span>
            <input name="splitDate" data-split-field type="text" inputmode="numeric" placeholder="Split date" value="${splitDateValue ? formatDate(splitDateValue) : ""}" />
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
          <input name="sellDate" type="text" inputmode="numeric" placeholder="Sell date" value="${sellRow?.date ? formatDate(sellRow.date) : ""}" />
          <input name="sellShares" type="number" min="0.0001" step="0.0001" placeholder="Sell qty" value="${sellRow ? formatEditNumber(Math.abs(Number(sellRow.pcs) || 0)) : ""}" />
          <input name="sellTotal" type="number" min="0" step="0.01" placeholder="Sell total" value="${sellRow ? formatEditNumber(Math.abs(Number(sellRow.total) || 0)) : ""}" />
        </div>
        <div class="abd-transaction-list">
          <span>Activities</span>
          ${chainRows.map(renderAbdTransactionItem).join("")}
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

function renderAbdTransactionItem({ row, index, type, quantityFlow }) {
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
  const separate = isSeparateAbdChain(row);
  return `
      <div class="abd-transaction-item">
        <strong>${side}</strong>
        <span>${formatDate(row.date)}</span>
      <span>${quantityFlow || formatSmartNumber(Math.abs(quantity))}</span>
        <span>${formatCurrency(Math.abs(Number(row.total) || 0))}</span>
        <button type="button" class="secondary" data-toggle-abd-separate="${index}" ${quantity <= 0 ? "disabled" : ""}>${separate ? "Merge" : "Separate"}</button>
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

function renderClosedDisplayRow(lot) {
  const rowState = classifyRowState(Math.abs(lot.sourceTotal || lot.remainingCost || 0), lot.totalProfit);
  const costTotal = (lot.averageCost != null && lot.originalShares)
    ? round2(lot.averageCost * lot.originalShares)
    : null;
  const exitTotal = (lot.referencePrice != null && lot.originalShares)
    ? round2(lot.referencePrice * lot.originalShares)
    : null;
  const naiveProfit = (exitTotal != null && costTotal != null) ? round2(exitTotal - costTotal) : null;
  return `
    <article class="position-row closed-row ${rowState}" data-edit-index="${lot.sourceIndex}">
      <div class="row-grid">
        <div class="cell-strong">${lot.symbol}</div>
        <div class="cell-center">${formatDate(lot.date)}</div>
        <div class="cell-center">${formatNumber(lot.originalShares, 0)}</div>
        ${stackedCell(plainAmount(lot.averageCost), plainAmount(lot.referencePrice))}
        ${stackedCell(plainAmount(costTotal), plainAmount(exitTotal))}
        ${stackedCell(
          plainAmount(lot.totalProfit),
          naiveProfit != null ? plainAmount(naiveProfit) : "-",
          { topClass: profitClassName(lot.totalProfit), bottomClass: profitClassName(naiveProfit), mutedBottom: false }
        )}
        <div class="cell-center">${formatDate(lot.exitDate)}</div>
        <div class="cell-center"></div>
        <div class="cell-center"></div>
      </div>
    </article>
  `;
}

function saveEditForm(form) {
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

function toggleAbdSeparateTransaction(event) {
  event.preventDefault();
  event.stopPropagation();
  const index = Number(event.currentTarget.dataset.toggleAbdSeparate);
  const row = state.transactions[index];
  if (!row || Number(row.pcs) <= 0) return;
  const separate = isSeparateAbdChain(row);
  state.transactions[index] = {
    ...row,
    chainId: separate
      ? `${normalizeMarketSymbol(row.symbol)}::merged-${Date.now()}-${index}`
      : `${normalizeMarketSymbol(row.symbol)}::separate-${Date.now()}-${index}`,
  };
  state.editingIndex = index;
  persistState();
  rebuildPortfolio();
}

function buildGroupKey(row) {
  return row.chainId || (row.note ? `${row.symbol}::${row.note}` : "");
}

function abdGroupKey(row) {
  const symbol = normalizeMarketSymbol(row.symbol);
  return isSeparateAbdChain(row) ? `${symbol}::${row.chainId}` : symbol;
}

function isSeparateAbdChain(row) {
  return String(row?.chainId || "").includes("::separate-");
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

function getSplitFactor(symbol, buyDate) {
  const event = firstRelevantAbdSplitEvent(symbol, [], buyDate);
  return event ? Number(event.factor) || 1 : 1;
}

function abdSplitApproved(row) {
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

function firstRelevantAbdSplitEvent(symbol, rows = [], buyDate = "") {
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

function accrueLotsToDate(lots, targetDate, gs3mByMonth) {
  for (const lot of lots) {
    if (lot.remainingShares <= 0) continue;
    lot.netCost = accrueUsdCarry(lot.netCost, lot.accrualDate ?? lot.date, targetDate, gs3mByMonth);
    lot.accrualDate = toIsoDate(targetDate);
  }
}

function accrueUsdCarry(amount, startDate, endDate = new Date(), gs3mByMonth = state.gs3mByMonth) {
  if (!Number.isFinite(amount)) return 0;
  if (amount <= 0) return round2(amount);
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) return round2(amount);

  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  currentMonthStart.setHours(0, 0, 0, 0);

  const effectiveEnd = minDate(end, currentMonthStart);
  if (effectiveEnd <= start) return round2(amount);

  let value = amount;
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cursor < effectiveEnd) {
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const rangeStart = maxDate(start, cursor);
    const rangeEnd = minDate(effectiveEnd, nextMonth);

    if (rangeEnd > rangeStart) {
      const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      const annualRate = Number(gs3mByMonth?.get(monthKey));
      if (Number.isFinite(annualRate)) {
        const days = diffDays(rangeStart, rangeEnd);
        value *= Math.pow(1 + annualRate / 100 / 360, days);
      }
    }

    cursor = nextMonth;
  }

  return round2(value);
}

function maxDate(left, right) {
  return left > right ? left : right;
}

function minDate(left, right) {
  return left < right ? left : right;
}

function diffDays(start, end) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((end - start) / msPerDay));
}

function toIsoDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function classifyRowState(remainingCost, totalProfit) {
  if (remainingCost <= 0) return "row-star";
  if (totalProfit == null) return "";
  const ratio = remainingCost > 0 ? Math.abs(totalProfit) / remainingCost : 0;
  const tone = ratio < 0.1 ? 1 : ratio < 0.3 ? 2 : 3;
  return totalProfit >= 0 ? `row-profit-${tone}` : `row-loss-${tone}`;
}

function profitClassName(totalProfit) {
  if (totalProfit == null) return "";
  if (totalProfit > 0) return "value-positive";
  if (totalProfit < 0) return "value-negative";
  return "";
}

function renderBreakEvenCell(lot) {
  if (lot.breakEvenShares == null) return "";
  const percent = lot.remainingShares > 0 ? Math.round((lot.breakEvenShares / lot.remainingShares) * 100) : null;
  return `
    <div class="break-even-cell">
      <span class="break-even-shares">${formatNumber(lot.breakEvenShares, 0)}</span>
      ${percent != null ? `<span class="break-even-percent">%${percent}</span>` : ""}
    </div>
  `;
}

function renderCandlesCell(symbol, key = "m12") {
  const candles = state.candlesBySymbol.get(symbol);
  const series = key === "d14" ? candles?.d14 || candles?.d30?.slice(-14) : candles?.[key];
  if (!Array.isArray(series) || !series.length) return "";
  const label = key === "d14" ? `${symbol} 14D` : `${symbol} 12M`;
  const className = key === "d14" ? "mini-candles short" : "mini-candles";
  return key === "d14"
    ? renderLineSvg(series, label, className, 108, 22)
    : renderCandlesSvg(series, label, className, 108, 22);
}

function renderPortfolioCandles() {
  const monthly = buildPortfolioCandles("m12");
  return `
    ${monthly.length ? renderCandlesSvg(monthly, "Portfolio 12M", "summary-candles monthly", 156, 54) : ""}
  `;
}

function buildPortfolioCandles(key) {
  const entries = state.openLots
    .map((lot) => ({
      quantity: lot.remainingShares,
      symbol: lot.symbol,
      candles: state.candlesBySymbol.get(lot.symbol),
    }))
    .filter((entry) => entry.quantity > 0 && entry.candles && Array.isArray(entry.candles[key]) && entry.candles[key].length);

  if (!entries.length) return [];

  const bucket = new Map();

  for (const entry of entries) {
    for (const candle of entry.candles[key]) {
      const periodKey = key === "m12" ? toMonthKey(candle.time) : toDayKey(candle.time);
      if (!periodKey) continue;
      if (!bucket.has(periodKey)) {
        bucket.set(periodKey, { open: 0, high: 0, low: 0, close: 0, weight: 0, time: candle.time });
      }

      const target = bucket.get(periodKey);
      target.open += candle.open * entry.quantity;
      target.high += candle.high * entry.quantity;
      target.low += candle.low * entry.quantity;
      target.close += candle.close * entry.quantity;
      target.weight += entry.quantity;
      target.time = Math.max(target.time, candle.time);
    }
  }

  return [...bucket.values()]
    .sort((left, right) => left.time - right.time)
    .slice(key === "m12" ? -12 : -14)
    .map((item) => ({
      open: item.open / item.weight,
      high: item.high / item.weight,
      low: item.low / item.weight,
      close: item.close / item.weight,
      time: item.time,
    }));
}

function renderCandlesSvg(candles, label, className, width, height) {
  const wickWidth = 1;
  const candleWidth = Math.max(3, Math.floor(width / (candles.length * 1.5)));
  const step = Math.max(candleWidth + 2, Math.floor(width / candles.length));
  const padY = 0;
  const allValues = candles.flatMap((candle) => [candle.high, candle.low]).filter(Number.isFinite);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const y = (value) => {
    const normalized = (value - min) / range;
    return round2(height - padY - normalized * (height - padY * 2));
  };

  const body = candles.map((candle, index) => {
    const x = index * step + 4;
    const highY = y(candle.high);
    const lowY = y(candle.low);
    const openY = y(candle.open);
    const closeY = y(candle.close);
    const top = Math.min(openY, closeY);
    const bodyHeight = Math.max(1.5, Math.abs(openY - closeY));
    const rising = candle.close >= candle.open;
    const fill = rising ? "#117c46" : "#b42318";
    return `
      <line x1="${x + candleWidth / 2}" y1="${highY}" x2="${x + candleWidth / 2}" y2="${lowY}" stroke="${fill}" stroke-width="${wickWidth}" />
      <rect x="${x}" y="${top}" width="${candleWidth}" height="${bodyHeight}" rx="1" fill="${fill}" opacity="${rising ? "0.78" : "0.84"}" />
    `;
  }).join("");

  return `
    <svg class="${className}" viewBox="0 0 ${width} ${height}" aria-label="${label} last 12 months">
      ${body}
    </svg>
  `;
}

function renderLineSvg(candles, label, className, width, height) {
  const padX = 3;
  const padY = 2;
  const values = candles.map((candle) => candle.close).filter(Number.isFinite);
  if (!values.length) return "";

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = candles.length > 1 ? (width - padX * 2) / (candles.length - 1) : 0;
  const y = (value) => round2(height - padY - ((value - min) / range) * (height - padY * 2));

  const points = candles
    .map((candle, index) => `${round2(padX + index * step)},${y(candle.close)}`)
    .join(" ");

  const rising = candles[candles.length - 1].close >= candles[0].close;
  const stroke = rising ? "#117c46" : "#b42318";

  return `
    <svg class="${className}" viewBox="0 0 ${width} ${height}" aria-label="${label} last 14 days">
      <polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

function chunkSymbols(symbols, size) {
  return chunk(symbols, size);
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body,
  });

  if (response.status === 204) return { ok: true };

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, ...payload };
  return payload;
}

async function authFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      ...(options.headers || {}),
    },
    body: options.body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, ...payload };
  return payload;
}

function toMonthKey(timestamp) {
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toDayKey(timestamp) {
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
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

function parseDate(value) {
  if (!value) return 0;
  const normalized = normalizeInputDate(value) || value;
  return new Date(normalized).getTime() || 0;
}

function normalizeInputDate(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = String(value).trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return "";
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatShortDate(value) {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

function formatCurrency(value) {
  return `${formatNumber(value, 2)} $`;
}

// HTML number: groups thousands and wraps the fractional part (comma +
// decimals) in a <span class="frac"> so it can be rendered smaller (system
// rule: digits right of the comma are 75% the size of those on the left).
// HTML-only — never use in SVG text or element attributes.
function formatAmountHtml(value, decimals = 2) {
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
function plainAmount(value) {
  return value == null || !Number.isFinite(Number(value)) ? "-" : formatAmountHtml(Number(value), 2);
}

// Two-line numeric cell. Top line is the primary figure (cost / smart P/L),
// bottom line a secondary figure (current price / naive P/L). The bottom is
// muted grey unless a colour class is passed (used for the naive P/L sign).
function stackedCell(topHtml, bottomHtml, { topClass = "", bottomClass = "", mutedBottom = true } = {}) {
  const bottomClasses = `stacked-bottom ${mutedBottom ? "stacked-muted" : ""} ${bottomClass}`.trim();
  return `<div class="number-cell stacked-cell">
      <span class="stacked-top ${topClass}">${topHtml}</span>
      <span class="${bottomClasses}">${bottomHtml}</span>
    </div>`;
}

function formatNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) return "";
  const sign = value < 0 || Object.is(value, -0) ? "-" : "";
  const absolute = Math.abs(value);
  const fixed = absolute.toFixed(decimals);
  const [integerPart, decimalPart] = fixed.split(".");
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimals > 0 ? `${sign}${grouped},${decimalPart}` : `${sign}${grouped}`;
}

function formatSmartNumber(value) {
  if (!Number.isFinite(Number(value))) return "";
  const rounded = round4(Number(value));
  if (rounded === 0) return "0";
  const decimals = Number.isInteger(rounded) ? 0 : 4;
  const text = formatNumber(rounded, decimals);
  if (decimals === 0) return text;
  return text.replace(/,(\d*?[1-9])0+$/, ",$1").replace(/,0+$/, "");
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function round8(value) {
  return Math.round(value * 100000000) / 100000000;
}

function formatEditNumber(value) {
  return Number.isFinite(value) ? String(round4(value)) : "";
}
