import { nullableNumber, nowIso } from "./util.js";
import { json } from "./http.js";
import { requireUser, isSeedOwner } from "./auth.js";
import { ensureDb, ensureCashFlowDb, ensurePortfolioDb, ensureUserSettingsDb, ensureCalculatedCacheDb, ensureTrPortfolioDb, ensureCryptoPortfolioDb } from "./db.js";
import { CASH_FLOW_SEED, CRYPTO_PORTFOLIO_SEED, TR_PORTFOLIO_SEED } from "./data/seeds.js";

export async function handleGetPortfolio(request, env) {
  ensureDb(env);
  await ensurePortfolioDb(env);

  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);

  const result = await env.DB.prepare(
    "SELECT symbol, date, pcs, price, amount, fee, total, note, chain_id AS chainId, split_date AS splitDate, split_factor AS splitFactor, split_shares AS splitShares, split_total AS splitTotal, split_approved AS splitApproved, dividend_quantity AS dividendQuantity FROM transactions WHERE user_id = ? ORDER BY date ASC, created_at ASC"
  ).bind(user.id).all();

  return json(request, { transactions: result.results ?? [] });
}

export async function handlePutPortfolio(request, env) {
  ensureDb(env);
  await ensurePortfolioDb(env);

  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);

  const body = await request.json().catch(() => null);
  const transactions = Array.isArray(body?.transactions) ? body.transactions : null;

  if (!transactions) {
    return json(request, { error: "Transactions payload is required." }, 400);
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM transactions WHERE user_id = ?").bind(user.id),
    ...transactions.map((row) =>
      env.DB.prepare(
        "INSERT INTO transactions (id, user_id, symbol, date, pcs, price, amount, fee, total, note, chain_id, split_date, split_factor, split_shares, split_total, split_approved, dividend_quantity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        crypto.randomUUID(),
        user.id,
        row.symbol ?? "",
        row.date ?? "",
        Number(row.pcs) || 0,
        Number(row.price) || 0,
        Number(row.amount) || 0,
        Number(row.fee) || 0,
        Number(row.total) || 0,
        row.note ?? "",
        row.chainId ?? "",
        row.splitDate ?? "",
        nullableNumber(row.splitFactor),
        nullableNumber(row.splitShares),
        nullableNumber(row.splitTotal),
        row.splitApproved === true || row.splitApproved === "true" ? 1 : 0,
        nullableNumber(row.dividendQuantity),
        nowIso()
      )
    ),
  ]);

  return json(request, { ok: true });
}

export async function handleGetSettings(request, env) {
  ensureDb(env);
  await ensureUserSettingsDb(env);
  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  const result = await env.DB.prepare(
    "SELECT key, value FROM user_settings WHERE user_id = ?"
  ).bind(user.id).all();
  const settings = {};
  for (const row of result.results ?? []) {
    settings[row.key] = JSON.parse(row.value || "null");
  }
  return json(request, { settings });
}

export async function handlePutSettings(request, env) {
  ensureDb(env);
  await ensureUserSettingsDb(env);
  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  const body = await request.json().catch(() => null);
  const settings = body?.settings && typeof body.settings === "object" ? body.settings : null;
  if (!settings) return json(request, { error: "Settings payload is required." }, 400);
  const now = nowIso();
  await env.DB.batch(Object.entries(settings).map(([key, value]) =>
    env.DB.prepare(
      "INSERT OR REPLACE INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)"
    ).bind(user.id, key, JSON.stringify(value), now)
  ));
  return json(request, { ok: true });
}

export async function handleGetCalculatedCache(request, env) {
  ensureDb(env);
  await ensureCalculatedCacheDb(env);
  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  const url = new URL(request.url);
  const key = String(url.searchParams.get("key") || "").trim();
  if (!key) return json(request, { error: "Cache key is required." }, 400);
  const row = await env.DB.prepare(
    "SELECT value, updated_at AS updatedAt FROM calculated_cache WHERE user_id = ? AND key = ?"
  ).bind(user.id, key).first();
  if (!row) return json(request, { ok: true, key, value: null, updatedAt: "" });
  return json(request, { ok: true, key, value: JSON.parse(row.value || "null"), updatedAt: row.updatedAt || "" });
}

export async function handlePutCalculatedCache(request, env) {
  ensureDb(env);
  await ensureCalculatedCacheDb(env);
  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  const body = await request.json().catch(() => null);
  const key = String(body?.key || "").trim();
  if (!key) return json(request, { error: "Cache key is required." }, 400);
  const updatedAt = nowIso();
  await env.DB.prepare(
    "INSERT OR REPLACE INTO calculated_cache (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)"
  ).bind(user.id, key, JSON.stringify(body?.value ?? null), updatedAt).run();
  return json(request, { ok: true, key, updatedAt });
}

export async function handleGetCryptoPortfolio(request, env) {
  ensureDb(env);
  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  await ensureCryptoPortfolioDb(env);
  await ensureSeedCryptoPortfolio(env, user);
  const result = await env.DB.prepare(
    "SELECT id, symbol, date, quantity, total, price, chain_id AS chainId FROM crypto_transactions WHERE user_id = ? ORDER BY date ASC, created_at ASC"
  ).bind(user.id).all();
  return json(request, { transactions: result.results ?? [] });
}

export async function handleCryptoPortfolioStatus(request, env) {
  ensureDb(env);
  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  await ensureCryptoPortfolioDb(env);
  const before = await cryptoTransactionCount(env, user.id);
  const cmcBefore = await cryptoCmcSeedCount(env, user.id);
  const seeded = await ensureSeedCryptoPortfolio(env, user);
  const after = await cryptoTransactionCount(env, user.id);
  const cmcAfter = await cryptoCmcSeedCount(env, user.id);
  return json(request, {
    user: { username: user.username },
    seedOwner: isSeedOwner(user, env),
    expectedSeedCount: isSeedOwner(user, env) ? CRYPTO_PORTFOLIO_SEED.length : 0,
    before,
    cmcBefore,
    seeded,
    after,
    cmcAfter,
  });
}

export async function handlePutCryptoPortfolio(request, env) {
  ensureDb(env);
  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  await ensureCryptoPortfolioDb(env);
  const body = await request.json().catch(() => null);
  const transactions = Array.isArray(body?.transactions) ? body.transactions : null;
  if (!transactions) return json(request, { error: "Crypto transactions payload is required." }, 400);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM crypto_transactions WHERE user_id = ?").bind(user.id),
    ...transactions.map((row) =>
      env.DB.prepare(
        "INSERT INTO crypto_transactions (id, user_id, symbol, date, quantity, total, price, chain_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        row.id || crypto.randomUUID(),
        user.id,
        String(row.symbol || "").trim().toUpperCase(),
        row.date || "",
        nullableNumber(row.quantity),
        nullableNumber(row.total),
        nullableNumber(row.price),
        row.chainId || "",
        nowIso(),
        nowIso()
      )
    ),
  ]);
  return json(request, { ok: true });
}

export async function handleGetTrPortfolio(request, env) {
  ensureDb(env);

  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  await ensureTrPortfolioDb(env);
  await ensureSeedTrPortfolio(env, user);

  const result = await env.DB.prepare(
    "SELECT id, symbol, buy_date AS buyDate, sell_date AS sellDate, quantity, sell_quantity AS sellQuantity, split_factor_applied AS splitFactorApplied, split_date AS splitDate, split_factor AS splitFactor, split_quantity AS splitQuantity, split_buy_total AS splitBuyTotal, split_approved AS splitApproved, dividend_quantity AS dividendQuantity, buy_total AS buyTotal, sell_total AS sellTotal, group_id AS groupId, note FROM tr_portfolio_rows WHERE user_id = ? ORDER BY COALESCE(NULLIF(sell_date, ''), buy_date) DESC, buy_date DESC, created_at DESC"
  ).bind(user.id).all();

  return json(request, { rows: result.results ?? [] });
}

export async function handlePutTrPortfolio(request, env) {
  ensureDb(env);

  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  await ensureTrPortfolioDb(env);

  const body = await request.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) {
    return json(request, { error: "TR rows payload is required." }, 400);
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM tr_portfolio_rows WHERE user_id = ?").bind(user.id),
    ...rows.map((row) =>
      env.DB.prepare(
        "INSERT INTO tr_portfolio_rows (id, user_id, symbol, buy_date, sell_date, quantity, sell_quantity, split_factor_applied, split_date, split_factor, split_quantity, split_buy_total, split_approved, dividend_quantity, buy_total, sell_total, group_id, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        row.id || crypto.randomUUID(),
        user.id,
        String(row.symbol || "").trim().toUpperCase(),
        row.buyDate || "",
        row.sellDate || "",
        nullableNumber(row.quantity),
        nullableNumber(row.sellQuantity),
        nullableNumber(row.splitFactorApplied) || 1,
        row.splitDate ?? "",
        nullableNumber(row.splitFactor),
        nullableNumber(row.splitQuantity),
        nullableNumber(row.splitBuyTotal),
        row.splitApproved === true || row.splitApproved === "true" ? 1 : 0,
        nullableNumber(row.dividendQuantity),
        nullableNumber(row.buyTotal),
        nullableNumber(row.sellTotal),
        row.groupId ?? "",
        row.note ?? "",
        nowIso(),
        nowIso()
      )
    ),
  ]);

  return json(request, { ok: true });
}

export async function handleGetCashFlow(request, env) {
  ensureDb(env);

  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  await ensureCashFlowDb(env);

  await ensureSeedCashFlow(env, user);

  let result = await env.DB.prepare(
    "SELECT id, note, date, currency, amount FROM cash_flow_movements WHERE user_id = ? ORDER BY date DESC, created_at DESC"
  ).bind(user.id).all();

  return json(request, { movements: result.results ?? [] });
}

export async function handleCashFlowStatus(request, env) {
  ensureDb(env);

  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  await ensureCashFlowDb(env);

  const before = await cashFlowCount(env, user.id);
  const seedOwner = isSeedOwner(user, env);
  const seeded = await ensureSeedCashFlow(env, user);
  const after = await cashFlowCount(env, user.id);
  const movementsResult = await env.DB.prepare(
    "SELECT id, note, date, currency, amount FROM cash_flow_movements WHERE user_id = ? ORDER BY date DESC, created_at DESC"
  ).bind(user.id).all();

  return json(request, {
    user: { username: user.username },
    cashFlowCountBeforeSeed: before,
    cashFlowCount: after,
    cashFlowReturned: movementsResult.results?.length ?? 0,
    movements: movementsResult.results ?? [],
    seedOwner,
    seeded,
    expectedSeedCount: seedOwner ? CASH_FLOW_SEED.length : 0,
  });
}

export async function handlePutCashFlow(request, env) {
  ensureDb(env);

  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  await ensureCashFlowDb(env);

  const body = await request.json().catch(() => null);
  const movements = Array.isArray(body?.movements) ? body.movements : null;
  if (!movements) {
    return json(request, { error: "Movements payload is required." }, 400);
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM cash_flow_movements WHERE user_id = ?").bind(user.id),
    ...movements.map((row) =>
      env.DB.prepare(
        "INSERT INTO cash_flow_movements (id, user_id, note, date, currency, amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        row.id || crypto.randomUUID(),
        user.id,
        row.note ?? "",
        row.date ?? "",
        row.currency ?? "",
        Number(row.amount) || 0,
        nowIso(),
        nowIso()
      )
    ),
  ]);

  return json(request, { ok: true });
}

async function ensureSeedCashFlow(env, user) {
  if (!isSeedOwner(user, env)) return false;
  const count = await cashFlowCount(env, user.id);
  if (count >= CASH_FLOW_SEED.length) return false;
  await seedCashFlow(env, user.id);
  return true;
}

async function ensureSeedTrPortfolio(env, user) {
  if (!isSeedOwner(user, env)) return false;
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM tr_portfolio_rows WHERE user_id = ?"
  ).bind(user.id).first();
  if ((Number(row?.count) || 0) >= TR_PORTFOLIO_SEED.length) return false;
  const now = nowIso();
  await env.DB.batch(TR_PORTFOLIO_SEED.map((item) =>
    env.DB.prepare(
      "INSERT OR IGNORE INTO tr_portfolio_rows (id, user_id, symbol, buy_date, sell_date, quantity, sell_quantity, split_factor_applied, buy_total, sell_total, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      `${user.id}-${item.id}`,
      user.id,
      item.symbol,
      item.buyDate || "",
      item.sellDate || "",
      nullableNumber(item.quantity),
      nullableNumber(item.sellQuantity),
      nullableNumber(item.splitFactorApplied) || 1,
      nullableNumber(item.buyTotal),
      nullableNumber(item.sellTotal),
      item.note || "",
      now,
      now
    )
  ));
  return true;
}

async function ensureSeedCryptoPortfolio(env, user) {
  if (!isSeedOwner(user, env)) return false;
  if (await cryptoCmcSeedCount(env, user.id) > 0) return false;
  const now = nowIso();
  await env.DB.batch(CRYPTO_PORTFOLIO_SEED.map((item) =>
    env.DB.prepare(
      "INSERT OR IGNORE INTO crypto_transactions (id, user_id, symbol, date, quantity, total, price, chain_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      `${user.id}-${item.id}`,
      user.id,
      item.symbol,
      item.date || "",
      nullableNumber(item.quantity),
      nullableNumber(item.total),
      Math.abs(Number(item.quantity) || 0) > 0 ? Math.abs(Number(item.total) || 0) / Math.abs(Number(item.quantity) || 0) : null,
      item.chainId || "",
      now,
      now
    )
  ));
  return true;
}

async function cryptoTransactionCount(env, userId) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM crypto_transactions WHERE user_id = ?"
  ).bind(userId).first();
  return Number(row?.count) || 0;
}

async function cryptoCmcSeedCount(env, userId) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM crypto_transactions WHERE user_id = ? AND id LIKE ?"
  ).bind(userId, `${userId}-cmc-%`).first();
  return Number(row?.count) || 0;
}

async function cashFlowCount(env, userId) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM cash_flow_movements WHERE user_id = ?"
  ).bind(userId).first();
  return Number(row?.count) || 0;
}

async function seedCashFlow(env, userId) {
  if (!CASH_FLOW_SEED.length) return;
  await env.DB.batch(CASH_FLOW_SEED.map((row) =>
    env.DB.prepare(
      "INSERT OR IGNORE INTO cash_flow_movements (id, user_id, note, date, currency, amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      `${userId}-${row.id}`,
      userId,
      row.note ?? "",
      row.date,
      row.currency,
      Number(row.amount) || 0,
      nowIso(),
      nowIso()
    )
  ));
}
