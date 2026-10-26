import { loadTaxRates, loadRebuyMonths, loadManualPortfolioValues, loadMarketStatus } from "./settings.js";

export const API_BASE = "";

export const AUTH_TOKEN_KEY = "northstar-secure-token";

export const SPLIT_SCAN_KEY = "northstar-last-split-scan";

export const TAX_SETTINGS_KEY = "northstar-tax-settings";

export const REBUY_MONTHS_KEY = "northstar-rebuy-months";

export const DEFAULT_REBUY_MONTHS = 6;

export const MANUAL_PORTFOLIO_KEY = "northstar-manual-portfolio-values";

export const MARKET_STATUS_KEY = "northstar-market-status";

export const DEFAULT_FEE = 1.5;

export const DEFAULT_TAX_RATES = { tr: 0, usa: 20, crypto: 0 };

export const BUILD_VERSION = "20260515w";

export const TODAY_ISO = new Date().toISOString().slice(0, 10);

export const TR_YAHOO_SYMBOL_OVERRIDES = {
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


export const elements = {
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
  adminButton: document.getElementById("admin-button"),
  adminModal: document.getElementById("admin-modal"),
  adminModalBackdrop: document.getElementById("admin-modal-backdrop"),
  adminModalClose: document.getElementById("admin-modal-close"),
  adminModalFeedback: document.getElementById("admin-modal-feedback"),
  adminUsersBody: document.getElementById("admin-users-body"),
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
  trPortfolioProfit: document.getElementById("tr-portfolio-profit"),
  trPortfolioProfitPercent: document.getElementById("tr-portfolio-profit-percent"),
  trPortfolioChartWrap: document.getElementById("tr-portfolio-chart-wrap"),
  cryptoPortfolioProfit: document.getElementById("crypto-portfolio-profit"),
  cryptoPortfolioProfitPercent: document.getElementById("crypto-portfolio-profit-percent"),
  cryptoPortfolioChartWrap: document.getElementById("crypto-portfolio-chart-wrap"),
  portfolioClosedProfit: document.getElementById("portfolio-closed-profit"),
  portfolioClosedProfitPercent: document.getElementById("portfolio-closed-profit-percent"),
  trPortfolioClosedProfit: document.getElementById("tr-portfolio-closed-profit"),
  trPortfolioClosedProfitPercent: document.getElementById("tr-portfolio-closed-profit-percent"),
  cryptoPortfolioClosedProfit: document.getElementById("crypto-portfolio-closed-profit"),
  cryptoPortfolioClosedProfitPercent: document.getElementById("crypto-portfolio-closed-profit-percent"),
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
  taxRateCrypto: document.getElementById("tax-rate-crypto"),
  rebuyMonths: document.getElementById("rebuy-months"),
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
  yearsQuarterChart2: document.getElementById("years-quarter-chart-2"),
  yearsQuarterChart3: document.getElementById("years-quarter-chart-3"),
  chart2StartDate: document.getElementById("chart2-start-date"),
  chart2Hint: document.querySelector(".quarter-chart2-hint"),
  splitsSummary: document.getElementById("splits-summary"),
  splitsBody: document.getElementById("splits-body"),
  statusMessageList: document.getElementById("status-message-list"),
  cashflowSummaryBody: document.getElementById("cashflow-summary-body"),
  cashflowProfitValue: document.getElementById("cashflow-profit-value"),
  cashflowBody: document.getElementById("cashflow-body"),
};


export const state = {
  session: null,
  authToken: localStorage.getItem(AUTH_TOKEN_KEY) || "",
  activeView: "quarterChart",
  transactions: [],
  trRows: [],
  cryptoRows: [],
  cryptoOpenLots: [],
  trOpenLots: [],
  trClosedLots: [],
  cryptoClosedLots: [],
  cryptoEditingIndex: null,
  cryptoPricesBySymbol: new Map(),
  cryptoCandlesBySymbol: new Map(),
  trEditingId: null,
  trAutoSaveToken: 0,
  trPricesBySymbol: new Map(),
  trCandlesBySymbol: new Map(),
  trSplitsBySymbol: new Map(),
  openLots: [],
  closedLots: [],
  pricesBySymbol: new Map(),
  candlesBySymbol: new Map(),
  splitsBySymbol: new Map(),
  // Split events keyed like the history/candle maps (Yahoo symbol, e.g.
  // "NVDA", "FROTO.IS"); see asOfDatePriceMap in js/performance.js.
  historySplitsBySymbol: new Map(),
  gs3mByMonth: new Map(),
  gs3mStatus: { source: "", latestDate: "", pointCount: 0, refreshError: "" },
  autoSaveToken: 0,
  priceRefreshToken: 0,
  editingIndex: null,
  cashFlowMovements: [],
  cashFlowEditingId: null,
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
  rebuyMonths: loadRebuyMonths(),
  marketPreloadStarted: false,
  marketStatus: loadMarketStatus(),
  // Keyed by data kind ("abd", "tr", "crypto", "cashFlow"); "" or absent when fine.
  // A kind whose load failed is never saved: saves replace the whole table.
  dataLoadErrors: {},
  dataSaveErrors: {},
};

