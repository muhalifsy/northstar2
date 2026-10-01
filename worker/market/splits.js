import { nowIso, splitSymbols, normalizeMarketSymbol } from "../util.js";
import { json } from "../http.js";
import { ensureTrPortfolioDb, ensureMarketSplitsDb } from "../db.js";
import { toWorkerYahooTrSymbol } from "./quotes.js";

export async function handleSplits(request, env) {
  await ensureMarketSplitsDb(env);
  const url = new URL(request.url);
  const symbols = splitSymbols(url.searchParams.get("symbols"));
  if (url.searchParams.get("refresh") === "1") {
    await scanSymbolsForSplits(env, symbols);
  }
  const splits = {};

  if (symbols.length) {
    const placeholders = symbols.map(() => "?").join(",");
    const result = await env.DB.prepare(
      `SELECT symbol, date, factor, source, action_type AS actionType, label FROM market_splits WHERE symbol IN (${placeholders}) ORDER BY date ASC`
    ).bind(...symbols).all();
    for (const row of result.results ?? []) {
      (splits[row.symbol] ||= []).push({
        date: row.date,
        factor: Number(row.factor),
        source: row.source || "",
        actionType: row.actionType || "split",
        label: row.label || "",
      });
    }
  }

  return json(request, { splits });
}

export async function scanAllPortfolioSplits(env) {
  await ensureMarketSplitsDb(env);
  await ensureTrPortfolioDb(env);
  const symbols = new Set();

  const usRows = await env.DB.prepare("SELECT DISTINCT symbol FROM transactions").all().catch(() => ({ results: [] }));
  for (const row of usRows.results ?? []) {
    const symbol = normalizeMarketSymbol(row.symbol);
    if (symbol) symbols.add(symbol);
  }

  const trRows = await env.DB.prepare("SELECT DISTINCT symbol FROM tr_portfolio_rows").all().catch(() => ({ results: [] }));
  for (const row of trRows.results ?? []) {
    const symbol = toWorkerYahooTrSymbol(row.symbol);
    if (symbol) symbols.add(symbol);
  }

  await scanSymbolsForSplits(env, [...symbols]);
}

async function scanSymbolsForSplits(env, symbols) {
  await ensureMarketSplitsDb(env);
  const uniqueSymbols = [...new Set(symbols.map(normalizeMarketSymbol).filter(Boolean))];
  for (const symbol of uniqueSymbols) {
    const events = await fetchSplitEvents(symbol).catch(() => []);
    for (const event of events) {
      await env.DB.prepare(
        "INSERT OR REPLACE INTO market_splits (symbol, date, factor, source, action_type, label, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(symbol, event.date, event.factor, "Yahoo", event.actionType || "split", event.label || "Stock split", nowIso()).run();
    }
  }
}

async function fetchSplitEvents(symbol) {
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=20y&events=splits`;
  const response = await fetch(target, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) return [];
  const payload = await response.json();
  const splitMap = payload?.chart?.result?.[0]?.events?.splits || {};
  return Object.values(splitMap)
    .map((event) => {
      const numerator = Number(event.numerator);
      const denominator = Number(event.denominator);
      const factor = denominator ? numerator / denominator : Number(event.splitRatio);
      return {
        date: new Date(Number(event.date) * 1000).toISOString().slice(0, 10),
        factor,
        actionType: "split",
        label: "Stock split",
      };
    })
    .filter((event) => event.date && Number.isFinite(event.factor) && event.factor > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
}
