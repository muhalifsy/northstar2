import { API_BASE, seedTransactions, state } from "./state.js";
import { isSeedOwner } from "./auth.js";
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


export async function loadRemotePortfolio() {
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


export async function persistState() {
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


export async function loadRemoteTrPortfolio() {
  const payload = await apiFetch("/api/tr-portfolio");
  state.trRows = Array.isArray(payload?.rows) ? payload.rows.map(normalizeTrRow) : [];
  renderTrPortfolio();
}


export async function loadRemoteCryptoPortfolio() {
  const payload = await apiFetch("/api/crypto-portfolio");
  state.cryptoRows = Array.isArray(payload?.transactions) ? payload.transactions.map(normalizeCryptoRow) : [];
  rebuildCryptoPortfolio();
}


export async function persistCryptoPortfolio() {
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


export async function persistTrPortfolio() {
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

