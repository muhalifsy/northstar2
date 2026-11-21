import { state } from "./state.js";
import { apiFetch } from "./api.js";
import { escapeHtml, escapeAttr, formatNumber } from "./util.js";
import { trIsOpen } from "./tr.js";
import { combinedBreakEven } from "./break-even.js";

// Levels page: the user's own ticker list as price ladders. Each row shows
// the chosen levels and averages sorted by price, with the current price in
// its place among them. The worker computes the numbers once a day from
// closed daily candles (worker/market/levels.js); this file only draws them.

const MARKET_LABELS = { bist: "BIST", usa: "USA", crypto: "Crypto" };
const MARKET_ORDER = ["bist", "usa", "crypto"];
// Page groups, top to bottom: the user's own tickers, then open positions per market.
const GROUPS = [
  { key: "watch", label: "Watchlist" },
  { key: "usa", label: "USA" },
  { key: "bist", label: "BIST" },
  { key: "crypto", label: "Crypto" },
];

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
  { key: "ath", label: "All-time high", cells: ["ath"], group: "Reference" },
  { key: "be", label: "Break-even · all costs (held only)", cells: ["be"], group: "Position" },
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
  ath: ["ATH", "All-time high"],
  be: ["BE", "Break-even price, all costs"],
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
  collapsed: [],
  autoMarked: true,
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
// Drag to reorder: the row being moved (null when none) and the save of the last drop,
// which a load waits for so it never brings back the order from before the drop.
let drag = null;
let renderWaiting = false;
let orderSave = Promise.resolve();

const el = (id) => document.getElementById(id);


// ---- Loading ----

// Called whenever the Levels view is opened.
export function openLevelsPage() {
  bindLevelsPage();
  renderLevels();
  if (!view.loading && (!view.loaded || Date.now() - view.fetchedAt > REFRESH_MS)) loadLevels();
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
  Object.assign(view, { loaded: false, loading: false, tickers: [], collapsed: [], autoMarked: true, rows: [], pending: 0, feedback: "", feedbackError: false, choose: null, busy: false, fetchedAt: 0 });
}


// Loads the list. The worker recomputes only a few out-of-date tickers per
// request and says how many are left, so this asks again until none are.
// Open positions join the list on their own (and closed ones leave it): when
// the saved list does not match the portfolio, one sync call fixes it first.
async function loadLevels() {
  const token = ++loadToken;
  view.loading = true;
  renderStatus();
  let synced = false;
  try {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      await orderSave;
      if (token !== loadToken) return;
      const payload = await apiFetch("/api/levels");
      if (token !== loadToken) return;
      if (payload?.ok !== true || !Array.isArray(payload.rows)) throw new Error(payload?.error || "Levels could not be loaded.");
      if (!synced) {
        synced = true;
        if (await syncHeld(payload)) {
          if (token !== loadToken) return;
          continue;
        }
      }
      view.loaded = true;
      view.tickers = payload.tickers || [];
      view.show = payload.show || [];
      view.sort = payload.sort || "added";
      view.collapsed = payload.collapsed || [];
      view.autoMarked = payload.autoMarked !== false;
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

// The markets whose portfolio loaded: only there may a missing position mean
// it was closed. TL-bought BTC sits in the TR list, so crypto needs both.
function loadedMarkets() {
  const errors = state.dataLoadErrors || {};
  return [
    !errors.abd ? "usa" : "",
    !errors.tr ? "bist" : "",
    !errors.crypto && !errors.tr ? "crypto" : "",
  ].filter(Boolean);
}

// Sends the open positions when the saved list does not match them: held
// tickers missing, auto rows whose position is closed, or an older list whose
// held rows are not marked yet. Returns true when the list was changed.
async function syncHeld(payload) {
  const markets = loadedMarkets();
  const held = heldTickers().filter((ticker) => markets.includes(ticker.market));
  const heldIds = new Set(held.map(tickerKey));
  const listed = new Set((payload.tickers || []).map(tickerKey));
  const missing = held.some((ticker) => !listed.has(tickerKey(ticker)));
  const closed = (payload.tickers || []).some((ticker) => ticker.auto && markets.includes(ticker.market) && !heldIds.has(tickerKey(ticker)));
  const unmarked = payload.autoMarked === false && markets.length === MARKET_ORDER.length;
  if (!missing && !closed && !unmarked) return false;
  try {
    const result = await apiFetch("/api/levels/sync", { method: "POST", body: JSON.stringify({ held, markets }) });
    return result?.ok === true && result.changed === true;
  } catch {
    return false;
  }
}

// Drop of a dragged row: `ids` is its group's new order. The group's rows keep the
// places they hold in the saved list (other groups' rows stay where they are) and
// take them in the new order.
function reorderGroup(ids) {
  const wanted = new Set(ids);
  const place = (list) => {
    const keyOf = (item) => item.id || tickerKey(item);
    const byKey = new Map(list.map((item) => [keyOf(item), item]));
    let next = 0;
    return list.map((item) => (wanted.has(keyOf(item)) ? byKey.get(ids[next++]) || item : item));
  };
  view.tickers = place(view.tickers);
  view.rows = place(view.rows);
  renderLevels();
  // A load already on its way carries the old order: drop it and load again after the save.
  loadToken += 1;
  view.loading = false;
  orderSave = saveView({ tickers: view.tickers });
  // Levels still being computed when the load was dropped: ask again once saved.
  if (view.pending) orderSave.then(() => { if (!view.loading) loadLevels(); });
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
  if (key === "ath") return athTitle(row);
  if (key === "be" && row.breakEven) return breakEvenTitle(row.breakEven);
  if ((key === "high52" || key === "low52") && row.rangeDays) {
    return `${key === "high52" ? "Highest high" : "Lowest low"} since listing (${row.rangeDays} trading days of history)`;
  }
  return long;
}

function athTitle(row) {
  const ath = row.ath || {};
  const when = ath.recent || !ath.month ? "within the last 52 weeks" : `in ${ath.month}`;
  return `All-time high, reached ${when}${ath.since ? ` (history since ${ath.since})` : ""}`;
}

function breakEvenTitle(info) {
  const decimals = decimalsFor(info.price);
  const shares = Number.isInteger(info.qty) ? formatNumber(info.qty, 0) : formatNumber(info.qty, 8).replace(/\.?0+$/, "");
  return [
    "Break-even: selling every open share here pays back the money in plus deposit interest, after tax and the sale fee",
    `unit cost ${formatNumber(info.basis / info.qty, decimals)}`,
    `${shares} shares`,
    info.count > 1 ? `${info.count} positions combined` : "",
  ].filter(Boolean).join(" · ");
}

// Open positions of one Levels row, in the figures js/break-even.js needs.
// BTC bought in TL (TR list) is priced in TL, so it never joins the USD crypto row.
function heldPositions(row) {
  const symbol = String(row.symbol || "").toUpperCase();
  const lots = row.market === "bist" ? state.trOpenLots
    : row.market === "usa" ? state.openLots
      : row.market === "crypto" ? state.cryptoOpenLots : [];
  return (lots || [])
    .filter((lot) => String(lot.symbol || "").toUpperCase() === symbol && lot.position?.isOpen)
    .map(({ position }) => ({ qty: position.openQty, basis: position.openCost, balance: position.balance, fee: position.sellFee, taxRate: position.taxRate }));
}

// The row with its break-even added to the values (held tickers only).
// held: true when the ticker has an open position, even one already recouped.
function withBreakEven(row) {
  const positions = heldPositions(row);
  if (!positions.length) return row;
  const breakEven = combinedBreakEven(positions);
  return { ...row, held: true, breakEven, values: { ...row.values, be: breakEven ? breakEven.price : null } };
}

// Equal values: 52H before ATH, the current price last.
const TIE_ORDER = { high52: 1, ath: 2, price: 3 };

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
  items.sort((left, right) => left.value - right.value || (TIE_ORDER[left.key] || 0) - (TIE_ORDER[right.key] || 0));
  const filled = items.map((item) => {
    const isPrice = item.key === "price";
    const title = isPrice
      ? (liveMissing ? "Last close; no live price right now" : "Current price")
      : cellTitle(item.key, row);
    const note = isPrice ? (liveMissing ? "CLOSE" : CELLS.price[0]) : `${CELLS[item.key][0]} · ${percentText(item.value, price)}`;
    return `<span class="lv-cell lv-${item.key}" title="${escapeAttr(title)}"><b>${formatNumber(item.value, decimals)}</b><small>${escapeHtml(note)}</small></span>`;
  });
  const empty = cells
    // BE belongs to held tickers only; elsewhere it leaves no empty cell.
    .filter((key) => !Number.isFinite(row.values[key]) && (key !== "be" || row.held))
    .map((key) => {
      const needed = row.missing?.[key];
      const title = key === "be"
        ? "Already recouped: the money put in plus deposit interest is back, so there is no break-even left."
        : row.waiting
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
  const rows = view.rows.map(withBreakEven);
  const byTicker = (left, right) => left.symbol.localeCompare(right.symbol);
  if (view.sort === "ticker") rows.sort(byTicker);
  if (view.sort === "market") rows.sort((left, right) => MARKET_ORDER.indexOf(left.market) - MARKET_ORDER.indexOf(right.market) || byTicker(left, right));
  if (view.sort === "nearest") rows.sort((left, right) => nearestDistance(left, cells) - nearestDistance(right, cells));
  return rows;
}

const tickerKey = (ticker) => `${ticker.market}:${String(ticker.symbol).toUpperCase()}`;

// Open positions as { symbol, market }. TL-bought BTC is a crypto holding, not a BIST listing.
function heldTickers() {
  const seen = new Map();
  const add = (market, symbol) => {
    // Same cleaning as the worker's parseTickerInput, so a held ticker matches its saved row.
    const ticker = { symbol: String(symbol || "").trim().toUpperCase().replace(/İ/g, "I").replace(/\s+/g, ""), market };
    if (/^[A-Z0-9.\-^=]{1,20}$/.test(ticker.symbol)) seen.set(tickerKey(ticker), ticker);
  };
  for (const row of state.trRows || []) if (trIsOpen(row)) add(row.symbol === "BTC" ? "crypto" : "bist", row.symbol);
  for (const lot of state.openLots || []) add("usa", lot.symbol);
  for (const lot of state.cryptoOpenLots || []) add("crypto", lot.symbol);
  return [...seen.values()];
}

function heldKeys() {
  return new Set(heldTickers().map(tickerKey));
}

function rowHtml(row, cells, held) {
  const isHeld = held.has(tickerKey(row));
  const info = [
    row.lastDate ? `Closed daily candles through ${row.lastDate}` : "",
    row.count ? `${row.count} candles` : "",
    row.source,
    row.error ? `Last update failed: ${row.error}` : "",
  ].filter(Boolean).join(" · ");
  const markets = MARKET_ORDER.map((market) => `<option value="${market}"${market === row.market ? " selected" : ""}>${MARKET_LABELS[market]}</option>`).join("");
  return `
    <div class="lv-row${row.waiting ? " lv-waiting" : ""}${row.error ? " lv-row-error" : ""}" data-level-id="${escapeAttr(row.id)}">
      <select class="lv-market lv-market-${row.market}" data-level-market aria-label="Market of ${escapeAttr(row.symbol)}"${isHeld ? " disabled" : ""}>${markets}</select>
      <strong class="lv-ticker${isHeld ? " lv-held" : ""}" title="${escapeAttr(info)}">${escapeHtml(row.symbol)}${row.error ? `<span class="lv-flag" aria-hidden="true">!</span>` : ""}</strong>
      <div class="lv-ladder">${ladderHtml(row, cells)}</div>
      ${isHeld ? "" : `<span class="lv-edit">
        <button type="button" class="lv-remove" data-level-remove aria-label="Remove ${escapeAttr(row.symbol)}" title="Remove">×</button>
      </span>`}
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
  else status.textContent = view.rows.length ? `${view.tickers.filter((ticker) => !ticker.auto).length} / ${view.limit}` : "";
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
  // A row is being dragged: redraw once it is dropped.
  if (drag) {
    renderWaiting = true;
    return;
  }
  renderWaiting = false;
  if (!view.loaded) {
    table.innerHTML = `<div class="empty-card">Loading…</div>`;
    return;
  }
  const held = heldKeys();
  const sorted = sortedRows(cells);
  if (!view.rows.length) {
    table.innerHTML = `<div class="empty-card">No tickers yet. Type one above; open positions show up here on their own.</div>`;
    return;
  }
  table.innerHTML = GROUPS.map((group) => {
    const inGroup = (row) => (group.key === "watch" ? !held.has(tickerKey(row)) : held.has(tickerKey(row)) && row.market === group.key);
    const rows = sorted.filter(inGroup);
    if (!rows.length) return "";
    const open = !view.collapsed.includes(group.key);
    const head = `
      <button type="button" class="lv-group-head" data-level-group="${group.key}" aria-expanded="${open}">
        <span class="lv-group-arrow" aria-hidden="true">${open ? "▾" : "▸"}</span>${group.label}<span class="lv-group-count">${rows.length}</span>
      </button>`;
    const body = open
      ? rows.map((row) => rowHtml(row, cells, held)).join("")
      : "";
    return `<section class="lv-group lv-group-${group.key}">${head}${body}</section>`;
  }).join("");
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

  bindRowDrag(el("levels-table"));

  el("levels-table").addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const group = event.target.closest("[data-level-group]");
    if (group) {
      const key = group.dataset.levelGroup;
      view.collapsed = view.collapsed.includes(key) ? view.collapsed.filter((item) => item !== key) : [...view.collapsed, key];
      renderLevels();
      saveView({ collapsed: view.collapsed });
      return;
    }
    const button = event.target.closest("[data-level-remove]");
    if (!button) return;
    const id = button.closest("[data-level-id]").dataset.levelId;
    const symbol = view.rows.find((row) => row.id === id)?.symbol || id;
    if (window.confirm(`Remove ${symbol} from Levels?`)) removeTicker(id);
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


// ---- Drag to reorder ----

// A row is held by its ticker or an empty spot (not the market box, a value cell
// or a button) and moved up or down within its group. A mouse starts after a
// small move; a finger or pen after a long press, so a swipe still scrolls the
// page. The other rows slide aside to show where it will land; Esc cancels.
const DRAG_START_PX = 5;
const LONG_PRESS_MS = 300;
const LONG_PRESS_SLOP_PX = 8;
const EDGE_PX = 60;

function bindRowDrag(table) {
  table.addEventListener("pointerdown", (event) => {
    if (drag || event.button !== 0 || !(event.target instanceof Element)) return;
    if (event.target.closest("select, button, input, a, .lv-cell")) return;
    const row = event.target.closest(".lv-row[data-level-id]");
    if (!row) return;
    drag = {
      id: row.dataset.levelId,
      pointerId: event.pointerId,
      touch: event.pointerType !== "mouse",
      startX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      active: false,
      timer: 0,
      scrollFrame: 0,
    };
    if (drag.touch) drag.timer = window.setTimeout(startDrag, LONG_PRESS_MS);
  });

  window.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.lastY = event.clientY;
    if (!drag.active) {
      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (drag.touch && moved > LONG_PRESS_SLOP_PX) endDrag(false);
      else if (!drag.touch && moved > DRAG_START_PX) startDrag();
      return;
    }
    event.preventDefault();
    moveDrag();
  });
  window.addEventListener("pointerup", (event) => {
    if (drag && event.pointerId === drag.pointerId) endDrag(drag.active);
  });
  window.addEventListener("pointercancel", (event) => {
    if (drag && event.pointerId === drag.pointerId) endDrag(false);
  });
  window.addEventListener("keydown", (event) => {
    if (drag?.active && event.key === "Escape") endDrag(false);
  });
  // Once a finger has picked a row up, its moves drag the row instead of scrolling the page.
  table.addEventListener("touchmove", (event) => {
    if (drag?.active) event.preventDefault();
  }, { passive: false });
  table.addEventListener("contextmenu", (event) => {
    if (drag) event.preventDefault();
  });
  // The click that ends a mouse drag must not toggle anything under it.
  table.addEventListener("click", (event) => {
    if (!table.dataset.dragJustEnded) return;
    delete table.dataset.dragJustEnded;
    event.stopPropagation();
    event.preventDefault();
  }, true);
}

const pageTop = (element) => element.getBoundingClientRect().top + window.scrollY;
const rowById = (id) => el("levels-table").querySelector(`.lv-row[data-level-id="${CSS.escape(id)}"]`);

function startDrag() {
  if (!drag || drag.active) return;
  let row = rowById(drag.id);
  if (!row) return endDrag(false);
  // Where in the row it was grabbed, so the row stays under the pointer.
  const offset = drag.startY + window.scrollY - pageTop(row);
  // Only the saved order can be changed by hand: another sort switches to it first.
  if (view.sort !== "added") {
    view.sort = "added";
    const held = drag;
    drag = null;
    renderLevels();
    drag = held;
    saveView({ sort: view.sort });
    row = rowById(drag.id);
    if (!row) return endDrag(false);
  }
  const rows = [...row.parentElement.querySelectorAll(":scope > .lv-row[data-level-id]")];
  const gap = parseFloat(getComputedStyle(row.parentElement).rowGap) || 0;
  Object.assign(drag, {
    active: true,
    row,
    rows,
    from: rows.indexOf(row),
    to: rows.indexOf(row),
    offset,
    step: row.getBoundingClientRect().height + gap,
    tops: rows.map(pageTop),
    heights: rows.map((item) => item.getBoundingClientRect().height),
  });
  window.clearTimeout(drag.timer);
  window.getSelection?.()?.removeAllRanges();
  document.body.classList.add("lv-dragging");
  row.classList.add("lv-drag-row");
  rows.forEach((item) => item !== row && item.classList.add("lv-drag-shift"));
  if (drag.touch) navigator.vibrate?.(15);
  moveDrag();
  drag.scrollFrame = window.requestAnimationFrame(autoScroll);
}

function moveDrag() {
  const { row, rows, from, tops, heights, step, offset } = drag;
  const top = drag.lastY + window.scrollY - offset;
  row.style.transform = `translateY(${top - tops[from]}px)`;
  // The new place: after every other row whose middle is above the dragged row's middle.
  const middle = top + heights[from] / 2;
  let to = 0;
  rows.forEach((item, index) => {
    if (index !== from && tops[index] + heights[index] / 2 < middle) to += 1;
  });
  drag.to = to;
  rows.forEach((item, index) => {
    if (index === from) return;
    const shift = from < to && index > from && index <= to ? -step : to < from && index >= to && index < from ? step : 0;
    item.style.transform = shift ? `translateY(${shift}px)` : "";
  });
}

// Scrolls the page while the dragged row is held near the top or bottom of the window.
function autoScroll() {
  if (!drag?.active) return;
  const y = drag.lastY;
  const bottom = window.innerHeight - EDGE_PX;
  const speed = y < EDGE_PX ? -(EDGE_PX - y) / 3 : y > bottom ? (y - bottom) / 3 : 0;
  if (speed) {
    window.scrollBy(0, speed);
    moveDrag();
  }
  drag.scrollFrame = window.requestAnimationFrame(autoScroll);
}

function endDrag(drop) {
  const ended = drag;
  if (!ended) return;
  drag = null;
  window.clearTimeout(ended.timer);
  window.cancelAnimationFrame(ended.scrollFrame);
  if (!ended.active) return;
  document.body.classList.remove("lv-dragging");
  const table = el("levels-table");
  if (!ended.touch) {
    table.dataset.dragJustEnded = "1";
    window.setTimeout(() => delete table.dataset.dragJustEnded, 0);
  }
  if (drop && ended.to !== ended.from) {
    const ids = ended.rows.map((item) => item.dataset.levelId);
    ids.splice(ended.to, 0, ...ids.splice(ended.from, 1));
    reorderGroup(ids);
    return;
  }
  ended.rows.forEach((item) => {
    item.classList.remove("lv-drag-row", "lv-drag-shift");
    item.style.transform = "";
  });
  if (renderWaiting) renderLevels();
}
