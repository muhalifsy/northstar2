import { state } from "./state.js";
import { apiFetch } from "./api.js";
import { escapeHtml, escapeAttr, formatNumber } from "./util.js";
import { trIsOpen } from "./tr.js";

// Levels page: the user's own ticker list as price ladders. Each row shows
// the chosen levels and averages sorted by price, with the current price in
// its place among them. The worker computes the numbers once a day from
// closed daily candles (worker/market/levels.js); this file only draws them.

const MARKET_LABELS = { bist: "BIST", usa: "USA", crypto: "Crypto" };
const MARKET_ORDER = ["bist", "usa", "crypto"];

// What the "Show" menu offers, in menu order. `cells` are the value keys a
// choice puts on the ladder.
const CHOICES = [
  { key: "dk", label: "DK · lowest close, 120 days", cells: ["dk"], group: "Levels" },
  { key: "fib", label: "Fibonacci 1–4 · 100-day swing", cells: ["fib1", "fib2", "fib3", "fib4"], group: "Levels" },
  { key: "tk", label: "TK · highest close, 120 days", cells: ["tk"], group: "Levels" },
  { key: "ma7", label: "MA7", cells: ["ma7"], group: "Averages" },
  { key: "ma25", label: "MA25", cells: ["ma25"], group: "Averages" },
  { key: "ma50", label: "MA50", cells: ["ma50"], group: "Averages" },
  { key: "ma100", label: "MA100", cells: ["ma100"], group: "Averages" },
  { key: "ma200", label: "MA200", cells: ["ma200"], group: "Averages" },
  { key: "ema20", label: "EMA20", cells: ["ema20"], group: "Averages" },
  { key: "ema50", label: "EMA50", cells: ["ema50"], group: "Averages" },
  { key: "ema200", label: "EMA200", cells: ["ema200"], group: "Averages" },
  { key: "prevClose", label: "Previous close", cells: ["prevClose"], group: "Reference" },
  { key: "range52", label: "52-week low / high", cells: ["low52", "high52"], group: "Reference" },
];

// Short name on the cell and the long one in the legend.
const CELLS = {
  price: ["NOW", "Current price"],
  dk: ["DK", "Lowest close (120 days)"],
  fib1: ["1", "Fibonacci, lowest"],
  fib2: ["2", "Fibonacci"],
  fib3: ["3", "Fibonacci"],
  fib4: ["4", "Fibonacci, highest"],
  tk: ["TK", "Highest close (120 days)"],
  ma7: ["MA7", "7-day average"],
  ma25: ["MA25", "25-day average"],
  ma50: ["MA50", "50-day average"],
  ma100: ["MA100", "100-day average"],
  ma200: ["MA200", "200-day average"],
  ema20: ["EMA20", "20-day exponential average"],
  ema50: ["EMA50", "50-day exponential average"],
  ema200: ["EMA200", "200-day exponential average"],
  prevClose: ["PREV", "Previous close"],
  low52: ["52L", "52-week low"],
  high52: ["52H", "52-week high"],
};

const SORT_LABELS = { added: "As added", market: "Market", ticker: "Ticker", nearest: "Nearest level" };
const REFRESH_MS = 60000;
const MAX_ROUNDS = 40;

const view = {
  loaded: false,
  loading: false,
  tickers: [],
  show: [],
  sort: "added",
  rows: [],
  pending: 0,
  limit: 50,
  feedback: "",
  feedbackError: false,
  choose: null,
  busy: false,
  fetchedAt: 0,
};

let loadToken = 0;
let bound = false;
let refreshTimer = null;

const el = (id) => document.getElementById(id);


// ---- Loading ----

// Called whenever the Levels view is opened.
export function openLevelsPage() {
  bindLevelsPage();
  renderLevels();
  if (!view.loaded || Date.now() - view.fetchedAt > REFRESH_MS) loadLevels();
  if (!refreshTimer) {
    refreshTimer = window.setInterval(() => {
      if (state.activeView !== "levels" || document.visibilityState !== "visible" || view.loading || view.busy) return;
      loadLevels();
    }, REFRESH_MS);
  }
}


// Another user may sign in on this page: forget the list that was loaded.
export function resetLevelsPage() {
  loadToken += 1;
  Object.assign(view, { loaded: false, loading: false, tickers: [], rows: [], pending: 0, feedback: "", feedbackError: false, choose: null, busy: false, fetchedAt: 0 });
}


// Loads the list. The worker recomputes only a few out-of-date tickers per
// request and says how many are left, so this asks again until none are.
async function loadLevels() {
  const token = ++loadToken;
  view.loading = true;
  renderStatus();
  try {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const payload = await apiFetch("/api/levels");
      if (token !== loadToken) return;
      if (payload?.ok !== true || !Array.isArray(payload.rows)) throw new Error(payload?.error || "Levels could not be loaded.");
      view.loaded = true;
      view.tickers = payload.tickers || [];
      view.show = payload.show || [];
      view.sort = payload.sort || "added";
      view.rows = payload.rows;
      view.pending = Number(payload.pending) || 0;
      view.limit = Number(payload.limit) || view.limit;
      view.fetchedAt = Date.now();
      renderLevels();
      if (!view.pending) break;
    }
  } catch (error) {
    if (token !== loadToken) return;
    setFeedback(error?.message || "Levels could not be loaded.", true);
  } finally {
    if (token === loadToken) {
      view.loading = false;
      renderStatus();
    }
  }
}


// ---- Changes ----

function setFeedback(text, isError = false, choose = null) {
  view.feedback = text;
  view.feedbackError = isError;
  view.choose = choose;
  renderFeedback();
}

function saveView(body) {
  return apiFetch("/api/levels", { method: "PUT", body: JSON.stringify(body) }).then((payload) => {
    if (payload?.ok !== true) setFeedback(payload?.error || "The change could not be saved.", true);
  }).catch(() => setFeedback("The change could not be saved.", true));
}

// A typed symbol held in exactly one of the portfolios is known to be there.
function heldMarkets(symbol) {
  const markets = [];
  if (state.trRows.some((row) => row.symbol === symbol)) markets.push("bist");
  if (state.transactions.some((row) => String(row.symbol || "").toUpperCase() === symbol)) markets.push("usa");
  if (state.cryptoRows.some((row) => row.symbol === symbol)) markets.push("crypto");
  return markets;
}

async function addTicker(symbol, market = "", replace = "") {
  const typed = String(symbol || "").trim().toUpperCase();
  if (!typed || view.busy) return;
  view.busy = true;
  setFeedback(`Looking up ${typed}…`);
  try {
    const held = market ? [] : heldMarkets(typed);
    const payload = await apiFetch("/api/levels/add", {
      method: "POST",
      body: JSON.stringify({ symbol: typed, market: market || (held.length === 1 ? held[0] : ""), replace }),
    });
    if (payload?.code === "choose") {
      setFeedback(`${payload.symbol} is listed on more than one market. Which one?`, false, { symbol: payload.symbol, markets: payload.markets, replace });
      return;
    }
    if (payload?.ok !== true) {
      setFeedback(payload?.error || `${typed} could not be added.`, true);
      return;
    }
    el("levels-symbol-input").value = "";
    setFeedback("");
    await loadLevels();
  } catch {
    setFeedback(`${typed} could not be added.`, true);
  } finally {
    view.busy = false;
  }
}

async function addHoldings() {
  if (view.busy) return;
  const tickers = [
    // BTC bought in TL sits in the TR list but is not a BIST listing.
    ...state.trRows.filter((row) => trIsOpen(row) && row.symbol !== "BTC").map((row) => ({ symbol: row.symbol, market: "bist" })),
    ...state.openLots.map((lot) => ({ symbol: lot.symbol, market: "usa" })),
    ...state.cryptoOpenLots.map((lot) => ({ symbol: lot.symbol, market: "crypto" })),
  ].filter((ticker) => ticker.symbol);
  if (!tickers.length) {
    setFeedback("There are no open positions to add.");
    return;
  }
  view.busy = true;
  try {
    const payload = await apiFetch("/api/levels/add", { method: "POST", body: JSON.stringify({ tickers }) });
    if (payload?.ok !== true) {
      setFeedback(payload?.error || "Holdings could not be added.", true);
      return;
    }
    setFeedback(payload.added ? `${payload.added} added.` : "All open positions are already in the list.");
    await loadLevels();
  } catch {
    setFeedback("Holdings could not be added.", true);
  } finally {
    view.busy = false;
  }
}

function removeTicker(id) {
  view.tickers = view.tickers.filter((ticker) => `${ticker.market}:${ticker.symbol}` !== id);
  view.rows = view.rows.filter((row) => row.id !== id);
  renderLevels();
  saveView({ tickers: view.tickers });
}


// ---- Drawing ----

function decimalsFor(price) {
  const size = Math.abs(Number(price));
  if (!(size > 0)) return 2;
  if (size >= 1) return 2;
  if (size >= 0.01) return 4;
  if (size >= 0.0001) return 6;
  return 8;
}

function percentText(value, price) {
  const percent = (value / price - 1) * 100;
  const text = formatNumber(Math.abs(percent), Math.abs(percent) >= 100 ? 0 : 1);
  return `${percent < 0 ? "−" : "+"}${text}%`;
}

function shownCells() {
  return CHOICES.filter((choice) => view.show.includes(choice.key)).flatMap((choice) => choice.cells);
}

function cellTitle(key, row) {
  const [, long] = CELLS[key];
  if (key.startsWith("fib") && row.fib) {
    const rank = Number(key.slice(3)) - 1;
    const decimals = decimalsFor(row.fib.high);
    return `Fibonacci ${row.fib.ratios?.[rank] ?? ""} · swing ${row.fib.direction} · high ${formatNumber(row.fib.high, decimals)} (${row.fib.highDate}) · low ${formatNumber(row.fib.low, decimals)} (${row.fib.lowDate})`;
  }
  return long;
}

// The ladder of one row: chosen values sorted by price with the current price
// among them, then the values this ticker has too little history for.
function ladderHtml(row, cells) {
  const liveMissing = !Number.isFinite(row.price);
  const price = liveMissing ? row.values.prevClose : row.price;
  if (!Number.isFinite(price)) {
    const reason = row.waiting ? "Loading price history…" : (row.error || "No price data yet.");
    return `<span class="lv-note">${escapeHtml(reason)}</span>`;
  }
  const decimals = decimalsFor(price);
  const items = cells
    .filter((key) => Number.isFinite(row.values[key]))
    .map((key) => ({ key, value: row.values[key] }));
  items.push({ key: "price", value: price });
  items.sort((left, right) => left.value - right.value || (left.key === "price" ? 1 : right.key === "price" ? -1 : 0));
  const filled = items.map((item) => {
    const isPrice = item.key === "price";
    const title = isPrice
      ? (liveMissing ? "Last close; no live price right now" : "Current price")
      : cellTitle(item.key, row);
    const note = isPrice ? (liveMissing ? "CLOSE" : CELLS.price[0]) : `${CELLS[item.key][0]} · ${percentText(item.value, price)}`;
    return `<span class="lv-cell lv-${item.key}" title="${escapeAttr(title)}"><b>${formatNumber(item.value, decimals)}</b><small>${escapeHtml(note)}</small></span>`;
  });
  const empty = cells
    .filter((key) => !Number.isFinite(row.values[key]))
    .map((key) => {
      const needed = row.missing?.[key];
      const title = row.waiting
        ? "Loading price history…"
        : needed
          ? `${CELLS[key][1]} needs ${needed} closed daily candles; ${row.count} available.`
          : `${CELLS[key][1]} is not available.`;
      return `<span class="lv-cell lv-missing" title="${escapeAttr(title)}"><b>—</b><small>${escapeHtml(CELLS[key][0])}</small></span>`;
    });
  return [...filled, ...empty].join("");
}

function nearestDistance(row, cells) {
  const price = Number.isFinite(row.price) ? row.price : row.values.prevClose;
  if (!Number.isFinite(price)) return Infinity;
  const distances = cells.filter((key) => Number.isFinite(row.values[key])).map((key) => Math.abs(row.values[key] / price - 1));
  return distances.length ? Math.min(...distances) : Infinity;
}

function sortedRows(cells) {
  const rows = [...view.rows];
  const byTicker = (left, right) => left.symbol.localeCompare(right.symbol);
  if (view.sort === "ticker") rows.sort(byTicker);
  if (view.sort === "market") rows.sort((left, right) => MARKET_ORDER.indexOf(left.market) - MARKET_ORDER.indexOf(right.market) || byTicker(left, right));
  if (view.sort === "nearest") rows.sort((left, right) => nearestDistance(left, cells) - nearestDistance(right, cells));
  return rows;
}

// Open positions, by market and symbol, for the underline under a ticker.
function heldKeys() {
  const keys = new Set();
  const add = (market, symbol) => { if (symbol) keys.add(`${market}:${String(symbol).toUpperCase()}`); };
  for (const row of state.trRows || []) if (trIsOpen(row)) add(row.symbol === "BTC" ? "crypto" : "bist", row.symbol);
  for (const lot of state.openLots || []) add("usa", lot.symbol);
  for (const lot of state.cryptoOpenLots || []) add("crypto", lot.symbol);
  return keys;
}

function rowHtml(row, cells, held) {
  const info = [
    row.lastDate ? `Closed daily candles through ${row.lastDate}` : "",
    row.count ? `${row.count} candles` : "",
    row.source,
    row.error ? `Last update failed: ${row.error}` : "",
  ].filter(Boolean).join(" · ");
  const markets = MARKET_ORDER.map((market) => `<option value="${market}"${market === row.market ? " selected" : ""}>${MARKET_LABELS[market]}</option>`).join("");
  return `
    <div class="lv-row${row.waiting ? " lv-waiting" : ""}${row.error ? " lv-row-error" : ""}" data-level-id="${escapeAttr(row.id)}">
      <select class="lv-market lv-market-${row.market}" data-level-market aria-label="Market of ${escapeAttr(row.symbol)}">${markets}</select>
      <strong class="lv-ticker${held.has(`${row.market}:${String(row.symbol).toUpperCase()}`) ? " lv-held" : ""}" title="${escapeAttr(info)}">${escapeHtml(row.symbol)}${row.error ? `<span class="lv-flag" aria-hidden="true">!</span>` : ""}</strong>
      <div class="lv-ladder">${ladderHtml(row, cells)}</div>
      <button type="button" class="lv-remove" data-level-remove aria-label="Remove ${escapeAttr(row.symbol)}" title="Remove">×</button>
    </div>
  `;
}

function renderShowMenu() {
  let group = "";
  el("levels-show-list").innerHTML = CHOICES.map((choice) => {
    const heading = choice.group !== group ? `<span class="levels-show-group">${choice.group}</span>` : "";
    group = choice.group;
    return `${heading}<label><input type="checkbox" data-level-show="${choice.key}"${view.show.includes(choice.key) ? " checked" : ""} /> ${escapeHtml(choice.label)}</label>`;
  }).join("");
}

function renderStatus() {
  const status = el("levels-status");
  if (!status) return;
  if (view.pending) status.textContent = `Updating… ${view.pending} to go`;
  else if (view.loading && !view.loaded) status.textContent = "Loading…";
  else status.textContent = view.rows.length ? `${view.rows.length} / ${view.limit}` : "";
}

function renderFeedback() {
  const box = el("levels-feedback");
  if (!box) return;
  const buttons = view.choose
    ? view.choose.markets.map((market) => `<button type="button" class="levels-button" data-level-choose="${market}">${MARKET_LABELS[market]}</button>`).join("")
    : "";
  box.className = `levels-feedback${view.feedbackError ? " levels-feedback-error" : ""}`;
  box.innerHTML = view.feedback ? `<span>${escapeHtml(view.feedback)}</span>${buttons}` : "";
}

export function renderLevels() {
  const table = el("levels-table");
  if (!table) return;
  const cells = shownCells();
  // The wide panel (style.css) needs the page scrollbar's width to stay inside the window.
  document.documentElement.style.setProperty("--scrollbar-width", `${window.innerWidth - document.documentElement.clientWidth}px`);
  renderShowMenu();
  el("levels-sort").value = view.sort;
  renderStatus();
  renderFeedback();
  if (!view.loaded) {
    table.innerHTML = `<div class="empty-card">Loading…</div>`;
    return;
  }
  const held = heldKeys();
  table.innerHTML = view.rows.length
    ? sortedRows(cells).map((row) => rowHtml(row, cells, held)).join("")
    : `<div class="empty-card">No tickers yet. Type one above, or add your open positions.</div>`;
}


// ---- Events ----

function bindLevelsPage() {
  if (bound) return;
  bound = true;
  el("levels-sort").innerHTML = Object.entries(SORT_LABELS).map(([key, label]) => `<option value="${key}">${label}</option>`).join("");

  el("levels-add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    addTicker(el("levels-symbol-input").value);
  });
  el("levels-add-held").addEventListener("click", addHoldings);

  el("levels-sort").addEventListener("change", (event) => {
    view.sort = event.target.value;
    renderLevels();
    saveView({ sort: view.sort });
  });

  el("levels-show-list").addEventListener("change", (event) => {
    const key = event.target?.dataset?.levelShow;
    if (!key) return;
    view.show = CHOICES.map((choice) => choice.key).filter((item) => (item === key ? event.target.checked : view.show.includes(item)));
    const menuOpen = el("levels-show").open;
    renderLevels();
    el("levels-show").open = menuOpen;
    saveView({ show: view.show });
  });

  document.addEventListener("pointerdown", (event) => {
    const menu = el("levels-show");
    if (menu.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
  });

  el("levels-feedback").addEventListener("click", (event) => {
    const market = event.target?.dataset?.levelChoose;
    if (!market || !view.choose) return;
    addTicker(view.choose.symbol, market, view.choose.replace || "");
  });

  el("levels-table").addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-level-remove]") : null;
    if (button) removeTicker(button.closest("[data-level-id]").dataset.levelId);
  });

  el("levels-table").addEventListener("change", (event) => {
    const select = event.target instanceof Element ? event.target.closest("[data-level-market]") : null;
    if (!select) return;
    const id = select.closest("[data-level-id]").dataset.levelId;
    const row = view.rows.find((item) => item.id === id);
    if (!row || select.value === row.market) return;
    const wanted = select.value;
    select.value = row.market;
    addTicker(row.symbol, wanted, id);
  });
}
