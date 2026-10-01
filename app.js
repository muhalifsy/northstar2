import { handleOutsideEditPointerDown, boot, showAuth, setActiveView } from "./js/shell.js";
import { TODAY_ISO, elements, state } from "./js/state.js";
import { openAdminModal, closeAdminModal, switchAuthMode, handleLogin, handleRegister, handleLogout } from "./js/auth.js";
import { handleRebuyMonthsChange, applyTaxRatesToInputs, handleTaxRateChange, handleManualPortfolioChange, formatManualPortfolioInputs, formatManualMoney } from "./js/settings.js";
import { handleDraftChange, autoSaveTransaction } from "./js/abd.js";
import { handleTrDraftChange, autoSaveTrRow } from "./js/tr.js";
import { handleCryptoDraftChange, autoSaveCryptoTransaction } from "./js/crypto.js";
import { addCashFlowMovement } from "./js/cashflow.js";
import { handleChart2Preset, handleChart2DateChange } from "./js/quarter.js";

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
  elements.adminButton.addEventListener("click", openAdminModal);
  elements.adminModalClose.addEventListener("click", closeAdminModal);
  elements.adminModalBackdrop.addEventListener("click", closeAdminModal);
  elements.trViewTab.addEventListener("click", () => setActiveView("tr"));
  elements.abdViewTab.addEventListener("click", () => setActiveView("abd"));
  elements.cryptoViewTab.addEventListener("click", () => setActiveView("crypto"));
  elements.cashflowViewTab.addEventListener("click", () => setActiveView("cashflow"));
  elements.quarterChartViewTab.addEventListener("click", () => setActiveView("quarterChart"));
  elements.chart2StartDate?.addEventListener("change", handleChart2DateChange);
  document.querySelectorAll("[data-chart2-preset]").forEach((button) => button.addEventListener("click", handleChart2Preset));
  elements.splitsViewTab.addEventListener("click", () => setActiveView("splits"));
  elements.statusViewTab.addEventListener("click", () => setActiveView("status"));
  elements.cashflowAdd?.addEventListener("click", addCashFlowMovement);
  if (elements.cashflowDate) elements.cashflowDate.value = TODAY_ISO;
  applyTaxRatesToInputs();
  if (elements.manualAbdPortfolioUsd) elements.manualAbdPortfolioUsd.value = formatManualMoney(state.manualPortfolio.abd);
  if (elements.manualTrPortfolioTry) elements.manualTrPortfolioTry.value = formatManualMoney(state.manualPortfolio.tr);
  elements.taxRateTr.addEventListener("input", handleTaxRateChange);
  elements.taxRateUsa.addEventListener("input", handleTaxRateChange);
  elements.taxRateCrypto?.addEventListener("input", handleTaxRateChange);
  elements.rebuyMonths?.addEventListener("input", handleRebuyMonthsChange);
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


bindEvents();

boot().catch(() => {
  showAuth();
});

