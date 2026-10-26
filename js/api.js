import { API_BASE, state } from "./state.js";
import { normalizeTransactions, rebuildPortfolio } from "./abd.js";
import { normalizeTrRow, renderTrPortfolio } from "./tr.js";
import { normalizeCryptoRow, rebuildCryptoPortfolio } from "./crypto.js";
import { invalidateCashFlowReturns } from "./performance.js";

export async function apiFailureMessage(response, fallback) {
  const status = response ? `${response.status} ${response.statusText || ""}`.trim() : "";
  const payload = await response?.json?.().catch(() => null);
  const error = payload?.error || payload?.message || "";
  return [fallback, status ? `HTTP ${status}.` : "", error].filter(Boolean).join(" ");
}


export async function loadGs3mRates() {
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


const DATA_LABELS = { abd: "ABD portfolio", tr: "TR portfolio", crypto: "Crypto portfolio", cashFlow: "Cash flow" };


// Loads one saved list. A failed request must never look like an empty
// portfolio: every save replaces the whole table, so saving after a failed
// load would wipe it. On failure the kind is marked, its saves are refused
// and the error stays on screen until a reload succeeds.
export async function loadDataList(kind, path, key) {
  try {
    const payload = await apiFetch(path);
    if (payload?.ok === false || payload?.error || !Array.isArray(payload?.[key])) {
      throw new Error(payload?.error || "unexpected response");
    }
    state.dataLoadErrors[kind] = "";
    state.dataRevisions[kind] = typeof payload.revision === "string" ? payload.revision : "";
    return payload[key];
  } catch (error) {
    state.dataLoadErrors[kind] = `${DATA_LABELS[kind]} could not be loaded (${error?.message || "network error"}); changes are not saved until the page is reloaded.`;
    return [];
  } finally {
    renderDataAlert();
  }
}


const saveSlots = {};

// Saves one list (the server replaces the whole table). One save per kind
// runs at a time; an edit made while it runs is saved right after it with the
// latest rows instead of being dropped. Each save names the revision the list
// was loaded with; when another device saved in between, the server refuses
// and this kind stops saving until a reload (worker/portfolio.js). Never
// throws: a failure is shown in the data alert.
export function saveDataList(kind, path, buildBody) {
  if (!state.session) return Promise.resolve();
  if (state.dataLoadErrors[kind]) {
    renderDataAlert();
    return Promise.resolve();
  }
  const slot = saveSlots[kind] || (saveSlots[kind] = { running: null, again: false });
  if (slot.running) {
    slot.again = true;
    return slot.running;
  }
  slot.running = (async () => {
    try {
      do {
        slot.again = false;
        const body = buildBody();
        const list = Object.values(body).find(Array.isArray);
        if (list && !list.length) body.confirmEmpty = true;
        body.baseRevision = state.dataRevisions[kind] || "";
        const payload = await apiFetch(path, { method: "PUT", body: JSON.stringify(body) });
        if (payload?.code === "stale") {
          state.dataLoadErrors[kind] = `${DATA_LABELS[kind]} was changed on another device, so your last change here was not saved. Reload the page to see the latest data.`;
          state.dataSaveErrors[kind] = "";
          return;
        }
        if (payload?.ok !== true) throw new Error(payload?.error || "save failed");
        if (typeof payload.revision === "string") state.dataRevisions[kind] = payload.revision;
      } while (slot.again);
      state.dataSaveErrors[kind] = "";
    } catch (error) {
      state.dataSaveErrors[kind] = `${DATA_LABELS[kind]} could not be saved (${error?.message || "network error"}). Reload the page to see what is saved.`;
    } finally {
      slot.running = null;
      renderDataAlert();
    }
  })();
  return slot.running;
}


// A fixed banner for load/save failures, so they are seen on every tab.
export function renderDataAlert() {
  const messages = [...Object.values(state.dataLoadErrors), ...Object.values(state.dataSaveErrors)].filter(Boolean);
  let box = document.getElementById("data-alert");
  if (!messages.length) {
    box?.remove();
    return;
  }
  if (!box) {
    box = document.createElement("div");
    box.id = "data-alert";
    box.className = "data-alert";
    box.setAttribute("role", "alert");
    document.body.append(box);
  }
  box.textContent = messages.join(" ");
}


export async function loadRemotePortfolio() {
  state.transactions = await loadDataList("abd", "/api/portfolio", "transactions");
  normalizeTransactions();
  rebuildPortfolio();
}


export function persistState() {
  invalidateCashFlowReturns();
  return saveDataList("abd", "/api/portfolio", () => ({ transactions: state.transactions }));
}


export async function loadRemoteTrPortfolio() {
  state.trRows = (await loadDataList("tr", "/api/tr-portfolio", "rows")).map(normalizeTrRow);
  renderTrPortfolio();
}


export async function loadRemoteCryptoPortfolio() {
  state.cryptoRows = (await loadDataList("crypto", "/api/crypto-portfolio", "transactions")).map(normalizeCryptoRow);
  rebuildCryptoPortfolio();
}


export function persistCryptoPortfolio() {
  invalidateCashFlowReturns();
  return saveDataList("crypto", "/api/crypto-portfolio", () => ({ transactions: state.cryptoRows.map(normalizeCryptoRow) }));
}


export function persistTrPortfolio() {
  invalidateCashFlowReturns();
  return saveDataList("tr", "/api/tr-portfolio", () => ({ rows: state.trRows.map(normalizeTrRow) }));
}


// The signed-in user's Authorization header, for calls made with fetch().
export function authHeaders() {
  return state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {};
}


export async function apiFetch(path, options = {}) {
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


export async function authFetch(path, options = {}) {
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

