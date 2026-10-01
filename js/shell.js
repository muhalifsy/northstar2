import { elements, state } from "./state.js";
import { loadGs3mRates, loadRemotePortfolio, loadRemoteTrPortfolio, loadRemoteCryptoPortfolio, apiFetch } from "./api.js";
import { updateAdminButton, switchAuthMode } from "./auth.js";
import { loadUserSettings, loadQuarterCalculatedCache, maybeAutoRefreshCalculated } from "./settings.js";
import { refreshPrices, rebuildPortfolio, renderPositions, saveEditForm } from "./abd.js";
import { renderTrPortfolio, saveTrEditForm, refreshTrMarketData, trIsOpen } from "./tr.js";
import { refreshCryptoPrices, rebuildCryptoPortfolio, renderCryptoPortfolio, saveCryptoEditForm } from "./crypto.js";
import { renderSplitsPage, loadSavedSplits, shouldRefreshSplitScan } from "./splits.js";
import { loadCashFlowData, renderCashFlow, refreshCashFlowCalculatedValues, renderStatus, updateStatusTab } from "./cashflow.js";
import { loadQuarterData } from "./performance.js";
import { renderYearsQuarterCash, renderQuarterPlus } from "./quarter.js";

export function handleOutsideEditPointerDown(event) {
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


export async function boot() {
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


export function showAuth(message = "") {
  elements.authShell.classList.remove("hidden");
  elements.appShell.classList.add("hidden");
  elements.authFeedback.textContent = message;
}


export function showApp() {
  elements.currentUser.textContent = state.session ? `Signed in as ${state.session.username}` : "";
  updateAdminButton();
  elements.authShell.classList.add("hidden");
  elements.appShell.classList.remove("hidden");
  elements.authFeedback.textContent = "";
  applyActiveView();
  renderTrPortfolio();
  rebuildPortfolio();
  rebuildCryptoPortfolio();
  renderCashFlow();
  renderQuarterPlus();
  if (state.activeView === "cashflow") {
    refreshCashFlowCalculatedValues().catch(() => {});
    loadQuarterData().catch(() => {
      state.quarterCalc = { loading: false, loaded: true, messages: ["1/4 data could not be loaded."], history: {}, rates: {} };
      renderQuarterPlus();
      renderStatus();
    });
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
  // Populate every tab's prices on open without requiring the user to visit
  // each page: instant fill from the D1 cache, plus a background fresh fetch
  // when the cached data is stale (>5 min).
  preloadMarketDataSoon();
  maybeAutoRefreshCalculated();
}


export function setActiveView(view) {
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
    // The 1/4 quarter table now lives in the Cash Flow left panel.
    renderQuarterPlus();
    loadQuarterData().catch(() => {
      state.quarterCalc = { loading: false, loaded: true, messages: ["1/4 data could not be loaded."], history: {}, rates: {} };
      renderQuarterPlus();
    });
    // Auto-refresh on entry (replaces the manual "Refresh data" button), but
    // only when the cached data is stale — see maybeAutoRefreshCalculated.
    maybeAutoRefreshCalculated();
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


export function preloadMarketDataSoon() {
  if (state.marketPreloadStarted) return;
  state.marketPreloadStarted = true;
  setTimeout(() => {
    refreshPrices().catch(() => {});
    refreshTrMarketData().catch(() => {});
    refreshCryptoPrices().catch(() => {});
  }, 250);
}


export function preloadQuarterDataSoon() {
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
  elements.quarterChartViewTab.classList.toggle("active", state.activeView === "quarterChart");
  elements.splitsViewTab.classList.toggle("active", state.activeView === "splits");
  elements.statusViewTab.classList.toggle("active", state.activeView === "status");
  elements.trShell.classList.toggle("hidden", state.activeView !== "tr");
  elements.abdShell.classList.toggle("hidden", state.activeView !== "abd");
  elements.cryptoShell.classList.toggle("hidden", state.activeView !== "crypto");
  elements.cashflowShell.classList.toggle("hidden", state.activeView !== "cashflow");
  elements.quarterChartShell.classList.toggle("hidden", state.activeView !== "quarterChart");
  elements.splitsShell.classList.toggle("hidden", state.activeView !== "splits");
  elements.statusShell.classList.toggle("hidden", state.activeView !== "status");
  updateStatusTab();
}

