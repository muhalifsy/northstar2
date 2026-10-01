import { showAuth, showApp } from "./shell.js";
import { AUTH_TOKEN_KEY, elements, state } from "./state.js";
import { escapeHtml } from "./util.js";
import { loadGs3mRates, loadRemotePortfolio, loadRemoteTrPortfolio, loadRemoteCryptoPortfolio, apiFetch, authFetch } from "./api.js";
import { loadUserSettings } from "./settings.js";
import { loadCashFlowData } from "./cashflow.js";

export function isSeedOwner() {
  return String(state.session?.username || "").trim().toLowerCase() === "sekkpl";
}


function isAdminUser() {
  return !!(state.session?.isAdmin) || isSeedOwner();
}


export async function updateAdminButton() {
  if (!isAdminUser()) {
    elements.adminButton.classList.add("hidden");
    return;
  }
  elements.adminButton.classList.remove("hidden");
  elements.adminButton.textContent = "Onaylar";
  try {
    const data = await apiFetch("/api/admin/users");
    const pending = data?.pendingCount || 0;
    elements.adminButton.textContent = pending > 0 ? `Onaylar (${pending})` : "Onaylar";
  } catch {
    /* sessizce geç */
  }
}


export async function openAdminModal() {
  elements.adminModal.classList.remove("hidden");
  await renderAdminUsers();
}


export function closeAdminModal() {
  elements.adminModal.classList.add("hidden");
}


async function renderAdminUsers() {
  elements.adminModalFeedback.textContent = "Yükleniyor...";
  elements.adminUsersBody.innerHTML = "";
  let data;
  try {
    data = await apiFetch("/api/admin/users");
  } catch {
    elements.adminModalFeedback.textContent = "Kullanıcılar yüklenemedi.";
    return;
  }
  const users = data?.users || [];
  elements.adminModalFeedback.textContent = "";
  const statusText = { pending: "Onay bekliyor", approved: "Onaylı", rejected: "Reddedildi" };
  for (const u of users) {
    const tr = document.createElement("tr");
    const created = (u.createdAt || "").slice(0, 10);
    let actions = "";
    if (u.isAdmin) {
      actions = "<span class=\"admin-tag\">Yönetici</span>";
    } else if (u.status === "pending") {
      actions =
        `<button type="button" class="admin-approve" data-id="${u.id}">Onayla</button>` +
        `<button type="button" class="admin-reject" data-id="${u.id}">Reddet</button>`;
    } else if (u.status === "approved") {
      actions = `<button type="button" class="admin-reject" data-id="${u.id}">Erişimi Kaldır</button>`;
    } else {
      actions = `<button type="button" class="admin-approve" data-id="${u.id}">Onayla</button>`;
    }
    tr.innerHTML =
      `<td>${escapeHtml(u.username)}</td>` +
      `<td>${statusText[u.status] || u.status}</td>` +
      `<td>${created}</td>` +
      `<td class="admin-actions">${actions}</td>`;
    elements.adminUsersBody.appendChild(tr);
  }
  elements.adminUsersBody.querySelectorAll(".admin-approve").forEach((btn) =>
    btn.addEventListener("click", () => setUserStatus(btn.dataset.id, "approve")));
  elements.adminUsersBody.querySelectorAll(".admin-reject").forEach((btn) =>
    btn.addEventListener("click", () => setUserStatus(btn.dataset.id, "reject")));
}


async function setUserStatus(userId, action) {
  elements.adminModalFeedback.textContent = "İşleniyor...";
  let result;
  try {
    result = await apiFetch(`/api/admin/users/${action}`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  } catch {
    elements.adminModalFeedback.textContent = "İşlem başarısız.";
    return;
  }
  if (!result?.ok) {
    elements.adminModalFeedback.textContent = result?.error || "İşlem başarısız.";
    return;
  }
  await renderAdminUsers();
  updateAdminButton();
}


export function switchAuthMode(mode) {
  const login = mode === "login";
  elements.loginTab.classList.toggle("active", login);
  elements.registerTab.classList.toggle("active", !login);
  elements.loginForm.classList.toggle("hidden", !login);
  elements.registerForm.classList.toggle("hidden", login);
  elements.authFeedback.textContent = "";
}


export async function handleLogin(event) {
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


export async function handleRegister(event) {
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

  if (result.pending) {
    elements.registerForm.reset();
    elements.registerSubmit.disabled = false;
    switchAuthMode("login");
    elements.authFeedback.textContent =
      result.message || "Kaydınız alındı. Yönetici onayından sonra giriş yapabilirsiniz.";
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


export async function handleLogout() {
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

