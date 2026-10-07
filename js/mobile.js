import { elements } from "./state.js";
import { isPhoneLayout } from "./util.js";
import { setActiveView } from "./shell.js";

// Phone navigation: a menu of pages, each showing one part of a desktop view.
// It only sets body[data-mobile-page] and the active view; mobile.css decides
// what each page shows, so desktop never sees any of it.

const PAGES = {
  summary: { view: "cashflow", title: "Özet" },
  tr: { view: "tr", title: "TR" },
  abd: { view: "abd", title: "ABD" },
  crypto: { view: "crypto", title: "Crypto" },
  new: { view: "abd", title: "Yeni İşlem" },
  cashflow: { view: "cashflow", title: "Giriş / Çıkış" },
  quarters: { view: "cashflow", title: "Çeyrekler" },
  chart: { view: "quarterChart", title: "Grafik" },
  splits: { view: "splits", title: "Splits" },
  status: { view: "status", title: "Status" },
};

// Open/closed boxes of each market, copied into the summary page as they are.
const TOTALS = [
  ["TR", ["trPortfolioProfit", "trPortfolioProfitPercent"], ["trPortfolioClosedProfit", "trPortfolioClosedProfitPercent"]],
  ["ABD", ["portfolioProfit", "portfolioProfitPercent"], ["portfolioClosedProfit", "portfolioClosedProfitPercent"]],
  ["Crypto", ["cryptoPortfolioProfit", "cryptoPortfolioProfitPercent"], ["cryptoPortfolioClosedProfit", "cryptoPortfolioClosedProfitPercent"]],
];

let bound = false;


export function initMobileNav() {
  if (!isPhoneLayout()) return;
  if (!bound) bindMobileNav();
  document.getElementById("mobile-menu-user").textContent = elements.currentUser.textContent;
  syncMenuBadges();
  renderMobileTotals();
  showMobilePage("menu", { push: false });
  history.replaceState({ mobilePage: "menu" }, "");
}


function bindMobileNav() {
  bound = true;
  for (const button of document.querySelectorAll("[data-mobile-page]")) {
    button.addEventListener("click", () => showMobilePage(button.dataset.mobilePage));
  }
  document.getElementById("mobile-back").addEventListener("click", () => {
    if (history.state?.mobilePage && history.state.mobilePage !== "menu") history.back();
    else showMobilePage("menu", { push: false });
  });
  document.getElementById("mobile-logout").addEventListener("click", () => elements.logoutButton.click());
  document.getElementById("mobile-admin").addEventListener("click", () => elements.adminButton.click());
  window.addEventListener("popstate", (event) => {
    if (!document.body.dataset.mobilePage) return;
    showMobilePage(event.state?.mobilePage || "menu", { push: false });
  });
  new MutationObserver(syncMenuBadges).observe(elements.statusViewTab, { attributes: true, attributeFilter: ["class"] });
  new MutationObserver(syncMenuBadges).observe(elements.adminButton, { attributes: true, attributeFilter: ["class"] });
  const totalsObserver = new MutationObserver(renderMobileTotals);
  for (const [, open, closed] of TOTALS) {
    for (const key of [...open, ...closed]) {
      totalsObserver.observe(elements[key], { childList: true, characterData: true, subtree: true, attributes: true });
    }
  }
}


export function showMobilePage(page, { push = true } = {}) {
  const config = PAGES[page];
  document.body.dataset.mobilePage = config ? page : "menu";
  document.getElementById("mobile-title").textContent = config?.title || "";
  if (config) setActiveView(config.view);
  if (push && config) history.pushState({ mobilePage: page }, "");
  window.scrollTo(0, 0);
}


function syncMenuBadges() {
  const status = document.getElementById("mobile-status-item");
  status.classList.toggle("status-has-issues", elements.statusViewTab.classList.contains("status-has-issues"));
  document.getElementById("mobile-admin").classList.toggle("hidden", elements.adminButton.classList.contains("hidden"));
}


function renderMobileTotals() {
  const target = document.getElementById("mobile-totals");
  const copy = (key) => `<span class="${elements[key].className}">${elements[key].innerHTML}</span>`;
  target.innerHTML = `
    <span class="summary-label">Açık</span><span class="summary-label">Kapalı</span>
    ${TOTALS.map(([label, open, closed]) => `
      <strong class="mobile-total-label">${label}</strong>
      <div class="mobile-total">${open.map(copy).join("")}</div>
      <div class="mobile-total">${closed.map(copy).join("")}</div>
    `).join("")}
  `;
}
