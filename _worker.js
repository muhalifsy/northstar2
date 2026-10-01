import { CASH_FLOW_SEED, CRYPTO_PORTFOLIO_SEED, TR_PORTFOLIO_SEED } from "./worker/data/seeds.js";
import { GS3M_FALLBACK_POINTS, TRY_DEPOSIT_FALLBACK_POINTS } from "./worker/data/rate-fallbacks.js";
import { ALTINS1_DOVIZ_HISTORY, DMLKT_HISTORY } from "./worker/data/price-history.js";

const COINGECKO_CRYPTO_IDS = {
  ADA: "cardano",
  ALGO: "algorand",
  APE: "apecoin",
  APPC: "appcoins",
  AVAX: "avalanche-2",
  BNB: "binancecoin",
  BTC: "bitcoin",
  DOGE: "dogecoin",
  DOT: "polkadot",
  ENJ: "enjincoin",
  ETH: "ethereum",
  FIL: "filecoin",
  GRT: "the-graph",
  KDA: "kadena",
  LINK: "chainlink",
  // CoinGecko renamed: "terra-luna-classic" was removed, LUNC now lives
  // under the original "terra-luna" id (verified 2026-06-05).
  LUNC: "terra-luna",
  MANA: "decentraland",
  MANTA: "manta-network",
  // MATIC migrated to POL; CoinGecko's "matic-network" returns no data
  // anymore. POL price continues the MATIC series 1:1 (verified 2026-06-05).
  MATIC: "polygon-ecosystem-token",
  MITH: "mithril",
  NEAR: "near",
  OP: "optimism",
  RAY: "raydium",
  SAND: "the-sandbox",
  SHIB: "shiba-inu",
  SOL: "solana",
  UNI: "uniswap",
  VET: "vechain",
  WLD: "worldcoin-wld",
  XLM: "stellar",
  XMR: "monero",
  XRP: "ripple",
  ZK: "zksync",
};

const COINPAPRIKA_CRYPTO_IDS = {
  ADA: "ada-cardano",
  ALGO: "algo-algorand",
  APE: "ape-apecoin",
  APPC: "appc-appcoins",
  AVAX: "avax-avalanche",
  BNB: "bnb-binance-coin",
  BTC: "btc-bitcoin",
  DOGE: "doge-dogecoin",
  DOT: "dot-polkadot",
  ENJ: "enj-enjin-coin",
  ETH: "eth-ethereum",
  FIL: "fil-filecoin",
  GRT: "grt-the-graph",
  KDA: "kda-kadena",
  LINK: "link-chainlink",
  LUNC: "lunc-terra-classic",
  MANA: "mana-decentraland",
  MANTA: "manta-manta-network",
  MATIC: "matic-polygon",
  MITH: "mith-mithril",
  NEAR: "near-near-protocol",
  OP: "op-optimism",
  RAY: "ray-raydium",
  SAND: "sand-the-sandbox",
  SHIB: "shib-shiba-inu",
  SOL: "sol-solana",
  UNI: "uni-uniswap",
  VET: "vet-vechain",
  WLD: "wld-worldcoin",
  XLM: "xlm-stellar",
  XMR: "xmr-monero",
  XRP: "xrp-xrp",
  ZK: "zk-zksync",
};

// Yahoo tickers for coins whose plain "<BASE>-USD" is taken or missing.
// MATIC migrated 1:1 to POL, so it follows POL. Verified 2026-09-22.
const YAHOO_CRYPTO_SYMBOLS = {
  UNI: "UNI7083-USD",
  GRT: "GRT6719-USD",
  MATIC: "POL28321-USD",
  POL: "POL28321-USD",
  ZK: "ZK24091-USD",
};

function yahooCryptoSymbol(symbol) {
  const base = cryptoBaseSymbol(symbol);
  return YAHOO_CRYPTO_SYMBOLS[base] || `${base}-USD`;
}

// Current prices for up to 20 Yahoo symbols per request (spark endpoint;
// unknown symbols are simply left out). Quotes older than 3 days are dropped
// so a dead listing cannot pose as a live price.
async function fetchYahooSparkPrices(yahooSymbols) {
  const out = {};
  const unique = [...new Set(yahooSymbols.filter(Boolean))];
  for (let index = 0; index < unique.length; index += 20) {
    const chunk = unique.slice(index, index + 20);
    const response = await fetch(`https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(chunk.join(","))}&range=1d&interval=1d`, {
      headers: { "user-agent": "Mozilla/5.0" },
    });
    if (!response.ok) throw new Error(`Yahoo spark failed (${response.status})`);
    const payload = await response.json().catch(() => null);
    for (const item of payload?.spark?.result ?? []) {
      const meta = item?.response?.[0]?.meta;
      const price = Number(meta?.regularMarketPrice);
      const time = Number(meta?.regularMarketTime);
      if (Number.isFinite(price) && price > 0 && Number.isFinite(time) && Date.now() / 1000 - time < 3 * 86400) out[item.symbol] = price;
    }
  }
  return out;
}

// Binance's public market-data mirror. api.binance.com answers Cloudflare's US
// egress with 451 "restricted location"; this host serves the same klines
// without the geo block.
const BINANCE_API_BASE = "https://data-api.binance.vision";

const BINANCE_CRYPTO_PAIRS = {
  MATIC: ["MATICUSDT", "POLUSDT", "MATICUSDC", "MATICBUSD"],
  LUNC: ["LUNCUSDT", "LUNCBUSD"],
  WLD: ["WLDUSDT", "WLDUSDC"],
  ZK: ["ZKUSDT", "ZKUSDC"],
};

// Symbols delisted from / never on Binance — skip Binance and CoinPaprika,
// go straight to CoinGecko. Avoids wasted subrequests and rate limits.
const CRYPTO_PREFERRED_GECKO = new Set(["KDA", "XMR", "MITH"]);

// Map a normalized internal symbol (output of normalizeMarketSymbol) to its
// BIST ticker for TradingView's scanner. Keys here override the default
// "strip .IS / use as-is" behaviour for cases where the broker-internal name
// differs from the BIST listing (sub-series, ETFs renamed, etc.). Verified
// 2026-06-05 against scanner.tradingview.com/turkey/scan.
const TR_TRADINGVIEW_BIST_OVERRIDES = {
  ALTINS1: "ALTIN",        // Darphane Altın Sertifikası
  "GLDTR.IS": "GLDTR",     // GOLDIST Istanbul Gold ETF (input: GLDR.F)
  "USDTR.F": "USDTR",      // Finans American Dollar ETF
  "GMSTR.F": "GMSTR",      // Istanbul Silver ETF
  "RTALB.IS": "RTALB",     // RTA Laboratuvarları (input: RTLAB)
};

const MANUAL_CRYPTO_DAILY_CLOSES = {
  "APPC-USD": [
    { date: "2024-12-31", close: 0.0019 },
    { date: "2025-03-31", close: 0.0010 },
    { date: "2025-06-30", close: 0.0014 },
    { date: "2025-09-30", close: 0.0024 },
    { date: "2025-12-31", close: 0.0017 },
    { date: "2026-03-31", close: 0.0010 },
    { date: "2026-05-21", close: 0.0010 },
  ],
};

const MANUAL_CORPORATE_ACTIONS = [
  {
    symbol: "HEKTS.IS",
    date: "2022-10-12",
    factor: 2.9418604,
    actionType: "rights-bonus",
    label: "150% rights issue + 44.18604% bonus issue",
  },
  {
    symbol: "HEKTS.IS",
    date: "2024-09-18",
    factor: 3.3320158,
    actionType: "rights",
    label: "233.20158% rights issue",
  },
];

const SPLIT_SCAN_CRON = "0 6 * * *";

// Hourly (:15): crypto prices (bulk) + a rotating slice of crypto candle
// tails; once a day (06 UTC) also the TL deposit and USD GS3M curves.
// Sequential so the whole run stays well inside one invocation's budget.
async function runHourlyMarketRefresh(env) {
  await refreshAllCryptoPrices(env).catch(() => {});
  await refreshHeldCryptoHistoryTails(env).catch(() => {});
  if (new Date().getUTCHours() === 6) {
    await getTryDepositCurve(env, { refresh: true }).catch(() => {});
    await getGs3mCurve(env).catch(() => {});
  }
}

async function refreshHeldCryptoHistoryTails(env) {
  await ensureCryptoPortfolioDb(env);
  const rows = await env.DB.prepare("SELECT DISTINCT symbol FROM crypto_transactions").all().catch(() => ({ results: [] }));
  const symbols = (rows.results ?? []).map((row) => String(row.symbol || "").toUpperCase()).filter(Boolean);
  return refreshCryptoHistoryTails(env, symbols);
}

let cashFlowDbReady = false;
let marketDataDbReady = false;
let trPortfolioDbReady = false;
let cryptoPortfolioDbReady = false;
let marketSplitsDbReady = false;
let portfolioDbReady = false;
let userSettingsDbReady = false;
let calculatedCacheDbReady = false;

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === SPLIT_SCAN_CRON) {
      ctx.waitUntil(scanAllPortfolioSplits(env));
      return;
    }
    ctx.waitUntil(runHourlyMarketRefresh(env));
  },

  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(request),
        });
      }

      if (url.pathname === "/api/auth/register" && request.method === "POST") {
        return handleRegister(request, env);
      }

      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        return handleLogin(request, env);
      }

      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        return handleLogout(request, env);
      }

      if (url.pathname === "/api/session" && request.method === "GET") {
        return handleSession(request, env);
      }

      if (url.pathname === "/api/admin/users" && request.method === "GET") {
        return handleAdminListUsers(request, env);
      }

      if (url.pathname === "/api/admin/users/approve" && request.method === "POST") {
        return handleAdminSetUserStatus(request, env, "approved");
      }

      if (url.pathname === "/api/admin/users/reject" && request.method === "POST") {
        return handleAdminSetUserStatus(request, env, "rejected");
      }

      if (url.pathname === "/api/settings" && request.method === "GET") {
        return handleGetSettings(request, env);
      }

      if (url.pathname === "/api/settings" && request.method === "PUT") {
        return handlePutSettings(request, env);
      }

      if (url.pathname === "/api/calculated-cache" && request.method === "GET") {
        return handleGetCalculatedCache(request, env);
      }

      if (url.pathname === "/api/calculated-cache" && request.method === "PUT") {
        return handlePutCalculatedCache(request, env);
      }

      if (url.pathname === "/api/portfolio" && request.method === "GET") {
        return handleGetPortfolio(request, env);
      }

      if (url.pathname === "/api/portfolio" && request.method === "PUT") {
        return handlePutPortfolio(request, env);
      }

      if (url.pathname === "/api/crypto-portfolio" && request.method === "GET") {
        return handleGetCryptoPortfolio(request, env);
      }

      if (url.pathname === "/api/crypto-portfolio/status" && request.method === "GET") {
        return handleCryptoPortfolioStatus(request, env);
      }

      if (url.pathname === "/api/crypto-portfolio" && request.method === "PUT") {
        return handlePutCryptoPortfolio(request, env);
      }

      if (url.pathname === "/api/tr-portfolio" && request.method === "GET") {
        return handleGetTrPortfolio(request, env);
      }

      if (url.pathname === "/api/tr-portfolio" && request.method === "PUT") {
        return handlePutTrPortfolio(request, env);
      }

      if (url.pathname === "/api/cash-flow" && request.method === "GET") {
        return handleGetCashFlow(request, env);
      }

      if (url.pathname === "/api/cash-flow/status" && request.method === "GET") {
        return handleCashFlowStatus(request, env);
      }

      if (url.pathname === "/api/cash-flow" && request.method === "PUT") {
        return handlePutCashFlow(request, env);
      }

      if (url.pathname === "/api/rates" && request.method === "GET") {
        return handleRates(request, env);
      }

      if (url.pathname === "/api/yields" && request.method === "GET") {
        return handleYields(request, env);
      }

      if (url.pathname === "/api/quotes" && request.method === "GET") {
        return handleQuotes(request, env, ctx);
      }

      if (url.pathname === "/api/crypto-quotes" && request.method === "GET") {
        return handleCryptoQuotes(request, env, ctx);
      }

      if (url.pathname === "/api/gs3m" && request.method === "GET") {
        return handleGs3m(request, env);
      }

      if (url.pathname === "/api/candles" && request.method === "GET") {
        return handleCandles(request, env, ctx);
      }

      if (url.pathname === "/api/history" && request.method === "GET") {
        return handleHistory(request, env, ctx);
      }

      if (url.pathname === "/api/splits" && request.method === "GET") {
        return handleSplits(request, env);
      }

      if (url.pathname === "/api/splits/scan" && request.method === "POST") {
        await scanAllPortfolioSplits(env);
        return json(request, { ok: true });
      }

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      return json(request, {
        ok: true,
        message: "secure worker running",
      });
    } catch (error) {
      return json(request, {
        ok: false,
        error: error?.message || "Worker failed.",
      }, 500);
    }
  },
};

async function handleRegister(request, env) {
  ensureDb(env);

  const body = await parseBody(request);
  const username = body.username;
  const password = body.password;

  if (!username || !password) {
    return json(request, { error: "Username and password are required." }, 400);
  }

  if (password.length < 6) {
    return json(request, { error: "Password must be at least 6 characters." }, 400);
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE username = ?"
  ).bind(username).first();

  if (existing) {
    return json(request, { error: "That username is already taken." }, 409);
  }

  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  const userId = crypto.randomUUID();

  await env.DB.prepare(
    "INSERT INTO users (id, username, password_hash, salt, created_at, status, is_admin) VALUES (?, ?, ?, ?, ?, 'pending', 0)"
  ).bind(userId, username, passwordHash, salt, nowIso()).run();

  return json(request, {
    ok: true,
    pending: true,
    message: "Kaydınız alındı. Hesabınız yönetici onayından sonra aktifleşecek.",
  });
}

async function handleLogin(request, env) {
  ensureDb(env);

  const body = await parseBody(request);
  const username = body.username;
  const password = body.password;

  if (!username || !password) {
    return json(request, { error: "Username and password are required." }, 400);
  }

  const user = await env.DB.prepare(
    "SELECT id, username, password_hash, salt, status, is_admin FROM users WHERE username = ?"
  ).bind(username).first();

  if (!user) {
    return json(request, { error: "Incorrect username or password." }, 401);
  }

  const passwordHash = await hashPassword(password, user.salt);
  if (passwordHash !== user.password_hash) {
    return json(request, { error: "Incorrect username or password." }, 401);
  }

  if (user.status !== "approved") {
    const msg = user.status === "rejected"
      ? "Hesabınız reddedildi. Lütfen yönetici ile iletişime geçin."
      : "Hesabınız henüz onaylanmadı. Yönetici onayı bekleniyor.";
    return json(request, { error: msg }, 403);
  }

  const session = await createSession(env, user.id);
  return json(request, {
    ok: true,
    user: { id: user.id, username: user.username, isAdmin: !!user.is_admin },
    token: session.token,
  });
}

async function handleLogout(request, env) {
  ensureDb(env);

  const token = getSessionToken(request);
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
  }

  return json(request, { ok: true });
}

async function handleSession(request, env) {
  ensureDb(env);

  const user = await requireUser(request, env);
  if (!user) return json(request, { user: null });
  return json(request, { user: { id: user.id, username: user.username, isAdmin: user.isAdmin } });
}

async function handleAdminListUsers(request, env) {
  ensureDb(env);
  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  if (!user.isAdmin) return json(request, { error: "Forbidden." }, 403);

  const result = await env.DB.prepare(
    "SELECT id, username, status, is_admin AS isAdmin, created_at AS createdAt FROM users ORDER BY (status = 'pending') DESC, created_at DESC"
  ).all();

  const users = (result.results ?? []).map((u) => ({ ...u, isAdmin: !!u.isAdmin }));
  const pendingCount = users.filter((u) => u.status === "pending").length;
  return json(request, { users, pendingCount });
}

async function handleAdminSetUserStatus(request, env, status) {
  ensureDb(env);
  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  if (!user.isAdmin) return json(request, { error: "Forbidden." }, 403);

  const body = await request.json().catch(() => ({}));
  const targetId = (body?.userId || "").trim();
  if (!targetId) return json(request, { error: "userId is required." }, 400);

  const target = await env.DB.prepare(
    "SELECT id, is_admin FROM users WHERE id = ?"
  ).bind(targetId).first();
  if (!target) return json(request, { error: "User not found." }, 404);
  if (target.is_admin) return json(request, { error: "Admin hesabının durumu değiştirilemez." }, 400);

  await env.DB.prepare("UPDATE users SET status = ? WHERE id = ?").bind(status, targetId).run();
  if (status === "rejected") {
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(targetId).run();
  }

  return json(request, { ok: true, status });
}

async function handleGetPortfolio(request, env) {
  ensureDb(env);
  await ensurePortfolioDb(env);

  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);

  const result = await env.DB.prepare(
    "SELECT symbol, date, pcs, price, amount, fee, total, note, chain_id AS chainId, split_date AS splitDate, split_factor AS splitFactor, split_shares AS splitShares, split_total AS splitTotal, split_approved AS splitApproved, dividend_quantity AS dividendQuantity FROM transactions WHERE user_id = ? ORDER BY date ASC, created_at ASC"
  ).bind(user.id).all();

  return json(request, { transactions: result.results ?? [] });
}

async function handlePutPortfolio(request, env) {
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

async function handleGetSettings(request, env) {
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

async function handlePutSettings(request, env) {
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

async function handleGetCalculatedCache(request, env) {
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

async function handlePutCalculatedCache(request, env) {
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

async function handleGetCryptoPortfolio(request, env) {
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

async function handleCryptoPortfolioStatus(request, env) {
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

async function handlePutCryptoPortfolio(request, env) {
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

async function handleGetTrPortfolio(request, env) {
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

async function handlePutTrPortfolio(request, env) {
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

function seedOwnerName(env) {
  return String(env.SEED_OWNER_USERNAME || "").trim().toLowerCase();
}

async function handleGetCashFlow(request, env) {
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

async function handleCashFlowStatus(request, env) {
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

async function handlePutCashFlow(request, env) {
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

function nullableNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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

async function requireUser(request, env) {
  const token = getSessionToken(request);
  if (!token) return null;

  const session = await env.DB.prepare(
    `SELECT sessions.id, sessions.user_id, sessions.expires_at, users.username, users.is_admin
     FROM sessions
     INNER JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ?`
  ).bind(token).first();

  if (!session) return null;

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
    return null;
  }

  return { id: session.user_id, username: session.username, isAdmin: !!session.is_admin };
}

async function createSession(env, userId) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).bind(token, userId, expiresAt, nowIso()).run();

  return { token, expiresAt };
}

async function parseBody(request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const raw = await request.text();
    const params = new URLSearchParams(raw);
    return {
      username: (params.get("username") || "").trim(),
      password: params.get("password") || "",
    };
  }

  const body = await request.json().catch(() => ({}));
  return {
    username: (body?.username || "").trim(),
    password: body?.password || "",
  };
}

function getSessionToken(request) {
  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  return bearer?.[1] || "";
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "https://codexabdyeni2.suleymannet.workers.dev";
  const requestedHeaders =
    request.headers.get("Access-Control-Request-Headers") || "Content-Type, Authorization";
  const requestedMethod =
    request.headers.get("Access-Control-Request-Method") || "GET, POST, PUT, OPTIONS";

  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin, Access-Control-Request-Headers, Access-Control-Request-Method",
    "Access-Control-Allow-Methods": requestedMethod,
    "Access-Control-Allow-Headers": requestedHeaders,
    "Access-Control-Max-Age": "86400",
  };
}

function json(request, payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request),
    },
  });
}

function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256
  );

  return [...new Uint8Array(bits)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDb(env) {
  if (!env.DB) {
    throw new Error("DB binding is missing.");
  }
}

function isSeedOwner(user, env) {
  const owner = seedOwnerName(env);
  if (!owner) return false;
  return String(user?.username || "").trim().toLowerCase() === owner;
}

async function ensureCashFlowDb(env) {
  ensureDb(env);
  if (cashFlowDbReady) return;

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS cash_flow_movements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      currency TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cash_flow_user_date
    ON cash_flow_movements(user_id, date);
  `).run();

  cashFlowDbReady = true;
}

async function ensurePortfolioDb(env) {
  ensureDb(env);
  if (portfolioDbReady) return;

  await env.DB.prepare("ALTER TABLE transactions ADD COLUMN split_date TEXT DEFAULT ''").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE transactions ADD COLUMN split_factor REAL").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE transactions ADD COLUMN split_shares REAL").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE transactions ADD COLUMN split_total REAL").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE transactions ADD COLUMN split_approved INTEGER DEFAULT 0").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE transactions ADD COLUMN dividend_quantity REAL").run().catch(() => {});

  portfolioDbReady = true;
}

async function ensureUserSettingsDb(env) {
  ensureDb(env);
  if (userSettingsDbReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();
  userSettingsDbReady = true;
}

async function ensureCalculatedCacheDb(env) {
  ensureDb(env);
  if (calculatedCacheDbReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS calculated_cache (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();
  calculatedCacheDbReady = true;
}

async function ensureTrPortfolioDb(env) {
  ensureDb(env);
  if (trPortfolioDbReady) return;

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS tr_portfolio_rows (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      buy_date TEXT NOT NULL,
      sell_date TEXT NOT NULL DEFAULT '',
      quantity REAL,
      sell_quantity REAL,
      split_factor_applied REAL DEFAULT 1,
      buy_total REAL,
      sell_total REAL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();

  await env.DB.prepare("ALTER TABLE tr_portfolio_rows ADD COLUMN sell_quantity REAL").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE tr_portfolio_rows ADD COLUMN split_factor_applied REAL DEFAULT 1").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE tr_portfolio_rows ADD COLUMN split_date TEXT DEFAULT ''").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE tr_portfolio_rows ADD COLUMN split_factor REAL").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE tr_portfolio_rows ADD COLUMN split_quantity REAL").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE tr_portfolio_rows ADD COLUMN split_buy_total REAL").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE tr_portfolio_rows ADD COLUMN split_approved INTEGER DEFAULT 0").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE tr_portfolio_rows ADD COLUMN dividend_quantity REAL").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE tr_portfolio_rows ADD COLUMN group_id TEXT DEFAULT ''").run().catch(() => {});

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_tr_portfolio_user_date
    ON tr_portfolio_rows(user_id, sell_date, buy_date);
  `).run();

  trPortfolioDbReady = true;
}

async function ensureCryptoPortfolioDb(env) {
  ensureDb(env);
  if (cryptoPortfolioDbReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS crypto_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      quantity REAL NOT NULL,
      total REAL NOT NULL,
      price REAL,
      chain_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_crypto_transactions_user_date
    ON crypto_transactions(user_id, date);
  `).run();
  cryptoPortfolioDbReady = true;
}

async function ensureMarketDataDb(env) {
  ensureDb(env);
  if (marketDataDbReady) return;

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS market_data_points (
      series TEXT NOT NULL,
      date TEXT NOT NULL,
      rate REAL NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (series, date)
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS market_candles (
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (symbol, date)
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_market_candles_symbol_date
    ON market_candles(symbol, date)
  `).run();

  marketDataDbReady = true;
}

async function ensureMarketSplitsDb(env) {
  ensureDb(env);
  if (marketSplitsDbReady) return;

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS market_splits (
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      factor REAL NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      action_type TEXT NOT NULL DEFAULT 'split',
      label TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (symbol, date)
    )
  `).run();

  await env.DB.prepare("ALTER TABLE market_splits ADD COLUMN action_type TEXT NOT NULL DEFAULT 'split'").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE market_splits ADD COLUMN label TEXT NOT NULL DEFAULT ''").run().catch(() => {});

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_market_splits_symbol_date
    ON market_splits(symbol, date)
  `).run();

  await seedManualCorporateActions(env);

  marketSplitsDbReady = true;
}

async function seedManualCorporateActions(env) {
  await env.DB.batch(MANUAL_CORPORATE_ACTIONS.map((event) =>
    env.DB.prepare(
      "INSERT OR REPLACE INTO market_splits (symbol, date, factor, source, action_type, label, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      normalizeMarketSymbol(event.symbol),
      event.date,
      Number(event.factor),
      "Manual",
      event.actionType || "corporate-action",
      event.label || "",
      nowIso()
    )
  ));
}

async function handleQuotes(request, env, ctx) {
  await ensureMarketDataDb(env);
  const url = new URL(request.url);
  const cacheOnly = isCacheOnlyRequest(url);
  const fresh = isFreshRequest(url);
  const backgroundRefresh = url.searchParams.get("background") === "1";
  const symbols = splitSymbols(url.searchParams.get("symbols"));
  const prices = {};
  const errors = [];
  const normalizedByInput = new Map(symbols.map((symbol) => [symbol, normalizeMarketSymbol(symbol)]));

  // fresh=1 → block until refresh completes, then return updated cache.
  // Strategy: (1) one TradingView scanner call for all BIST-mapped symbols
  // (covers full TR portfolio in 1 subrequest, with correct ALTINS1 price);
  // (2) per-symbol fetchPrice for the remainder (US tickers via Yahoo).
  if (fresh && symbols.length) {
    let tvPrices = {};
    try {
      tvPrices = await fetchTradingViewBistBulkPrices(symbols);
    } catch (error) {
      errors.push(`TradingView bulk fetch failed: ${error?.message || "unknown"}`);
    }
    const today = todayIso();
    const todayTime = Math.floor(Date.parse(`${today}T12:00:00Z`) / 1000);
    const tvSaves = Object.entries(tvPrices).flatMap(([input, price]) => {
      const normalized = normalizeMarketSymbol(input);
      return [
        saveMarketDataPoint(env, `PRICE:${normalized}`, today, price),
        // Also persist the close as today's daily candle. Keeps 14D/12M
        // charts accumulating for BIST symbols whose archive source is down
        // (e.g. Doviz.com ALTINS1 auth broke 2026-06). Real OHLC from a
        // working archive source later overwrites via INSERT OR REPLACE.
        saveMarketCandles(env, normalized, [{ time: todayTime, open: price, high: price, low: price, close: price }], "TradingView close"),
      ];
    });
    await Promise.allSettled(tvSaves);

    const remaining = symbols.filter((s) => !(s in tvPrices));
    if (remaining.length) {
      const refreshResults = await runInBatches(
        remaining,
        (symbol) => refreshCurrentPrice(env, symbol),
        5
      );
      refreshResults.forEach((result, idx) => {
        if (result.status === "rejected") {
          errors.push(`${remaining[idx]}: refresh failed (${result.reason?.message || "unknown"}).`);
        }
      });
    }
  }

  const cachedBySeries = await getPreviousCachedMarketDataPoints(
    env,
    [...new Set([...normalizedByInput.values()].filter(Boolean).map((symbol) => `PRICE:${symbol}`))],
    todayIso()
  ).catch((error) => {
    errors.push(`D1 current price batch read failed (${error?.message || "unknown error"}).`);
    return new Map();
  });

  let latestDate = "";
  for (const symbol of symbols) {
    const normalized = normalizedByInput.get(symbol);
    const series = `PRICE:${normalized}`;
    const cached = cachedBySeries.get(series);
    if (cached) {
      prices[symbol] = cached.rate;
      if (cached.date && cached.date > latestDate) latestDate = cached.date;
    } else {
      errors.push(`${symbol}: current price data is missing in D1.`);
    }
    if (!cacheOnly && !fresh) ctx?.waitUntil?.(refreshCurrentPrice(env, symbol));
  }

  return json(request, { prices, errors, fetchedAt: nowIso(), latestDate });
}

async function refreshCurrentPrice(env, symbol) {
  const normalized = normalizeMarketSymbol(symbol);
  // BTC held in the TR portfolio is priced in TL as a derived symbol:
  // BTC-USD (maintained by the crypto tab) × TCMB USD/TRY. No external
  // fetch of its own. Errors propagate so the caller reports them.
  if (normalized === "BTC-TRY") {
    const price = await computeBtcTryPrice(env);
    const today = todayIso();
    await saveMarketDataPoint(env, "PRICE:BTC-TRY", today, price);
    const todayTime = Math.floor(Date.parse(`${today}T12:00:00Z`) / 1000);
    await saveMarketCandles(env, "BTC-TRY", [{ time: todayTime, open: price, high: price, low: price, close: price }], "BTC-USD x TCMB live");
    return;
  }
  const price = await fetchPrice(symbol).catch(() => null);
  if (Number.isFinite(price) && price > 0) {
    await saveMarketDataPoint(env, `PRICE:${normalized}`, todayIso(), price);
  }
}

async function computeBtcTryPrice(env) {
  const today = todayIso();
  let btcUsd = (await getCachedMarketDataPoint(env, "PRICE:BTC-USD", today).catch(() => null))?.rate;
  if (!Number.isFinite(btcUsd) || btcUsd <= 0) {
    const bulk = await fetchCoinGeckoBulkPrices(env, ["bitcoin"]).catch(() => ({}));
    btcUsd = bulk.bitcoin;
    if (Number.isFinite(btcUsd) && btcUsd > 0) {
      await saveMarketDataPoint(env, "PRICE:BTC-USD", today, btcUsd);
    }
  }
  let rate = (await getCachedOrPreviousMarketDataPoint(env, "TCMB_USD_TRY", today).catch(() => null))?.rate;
  if (!Number.isFinite(rate) || rate <= 0) {
    const latest = await getLatestRate().catch(() => null);
    if (latest?.rate) {
      rate = latest.rate;
      await saveMarketDataPoint(env, "TCMB_USD_TRY", latest.date || today, latest.rate);
    }
  }
  if (!Number.isFinite(btcUsd) || btcUsd <= 0) throw new Error("BTC-TRY: BTC-USD price unavailable (D1 + CoinGecko)");
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("BTC-TRY: TCMB USD/TRY rate unavailable");
  return btcUsd * rate;
}

// Materialize BTC-TRY daily candles by converting cached BTC-USD candles with
// the TCMB USD/TRY series (carry-forward over weekends/holidays). Pure D1
// derivation — zero external subrequests.
async function refreshBtcTryCandles(env, start) {
  const usdCandles = await getCachedMarketCandles(env, "BTC-USD", start);
  if (!usdCandles.length) {
    return { ok: false, error: "BTC-USD candles are not cached yet; refresh the Crypto tab first" };
  }
  const ratesResult = await env.DB.prepare(
    "SELECT date, rate FROM market_data_points WHERE series = 'TCMB_USD_TRY' AND date >= ? ORDER BY date ASC"
  ).bind(addIsoDays(start, -14)).all();
  const ratePoints = (ratesResult.results ?? [])
    .map((row) => ({ date: row.date, rate: Number(row.rate) }))
    .filter((row) => row.date && Number.isFinite(row.rate) && row.rate > 0);
  if (!ratePoints.length) {
    return { ok: false, error: "TCMB_USD_TRY rates are not cached yet; open Cash Flow once" };
  }
  let rateIndex = 0;
  let currentRate = ratePoints[0].rate;
  const converted = [];
  for (const candle of usdCandles) {
    const date = toCandleDate(candle);
    while (rateIndex < ratePoints.length && ratePoints[rateIndex].date <= date) {
      currentRate = ratePoints[rateIndex].rate;
      rateIndex += 1;
    }
    converted.push({
      time: candle.time,
      open: candle.open * currentRate,
      high: candle.high * currentRate,
      low: candle.low * currentRate,
      close: candle.close * currentRate,
    });
  }
  await saveMarketCandles(env, "BTC-TRY", converted, "BTC-USD x TCMB_USD_TRY");
  return { ok: true, count: converted.length };
}

// Derive the BIST ticker for TradingView from a user-supplied symbol. Most
// BIST tickers map 1:1 to their normalized form; overrides handle the cases
// where the broker code (.F suffix, ALTIN.S1, RTLAB) differs from BIST.
function bistTickerForSymbol(symbol) {
  const clean = normalizeMarketSymbol(symbol);
  if (!clean) return "";
  // Derived symbol, not a BIST listing — handled by computeBtcTryPrice.
  if (clean === "BTC-TRY" || clean === "BTC") return "";
  if (Object.prototype.hasOwnProperty.call(TR_TRADINGVIEW_BIST_OVERRIDES, clean)) {
    return TR_TRADINGVIEW_BIST_OVERRIDES[clean];
  }
  if (clean.endsWith(".IS")) return clean.slice(0, -3);
  return clean;
}

// Fetch live prices for many BIST symbols in a single TradingView scanner
// request. Returns { inputSymbol: price } only for symbols TradingView knows;
// others are silently absent (caller falls back to Yahoo / per-symbol path).
// One subrequest covers an entire TR portfolio — replaces the prior pattern
// of N Yahoo calls (rate-limited and produced wrong values for ALTINS1).
async function fetchTradingViewBistBulkPrices(symbols) {
  const inputs = [...new Set(symbols.map((s) => String(s || "").trim()).filter(Boolean))];
  const inputToTicker = new Map();
  for (const input of inputs) {
    const ticker = bistTickerForSymbol(input);
    if (ticker) inputToTicker.set(input, `BIST:${ticker}`);
  }
  if (!inputToTicker.size) return {};

  const tickers = [...new Set(inputToTicker.values())];
  const response = await fetch("https://scanner.tradingview.com/turkey/scan", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "Mozilla/5.0",
    },
    body: JSON.stringify({ symbols: { tickers }, columns: ["close"] }),
  });
  if (!response.ok) {
    throw new Error(`TradingView scanner failed (${response.status})`);
  }
  const payload = await response.json().catch(() => null);
  const tickerToPrice = new Map();
  for (const row of payload?.data ?? []) {
    const price = Number(row?.d?.[0]);
    if (row?.s && Number.isFinite(price) && price > 0) {
      tickerToPrice.set(row.s, price);
    }
  }
  const out = {};
  for (const [input, ticker] of inputToTicker) {
    const price = tickerToPrice.get(ticker);
    if (Number.isFinite(price) && price > 0) out[input] = price;
  }
  return out;
}

async function handleCandles(request, env, ctx) {
  await ensureMarketDataDb(env);
  const url = new URL(request.url);
  const cacheOnly = isCacheOnlyRequest(url);
  const fresh = isFreshRequest(url);
  const symbols = splitSymbols(url.searchParams.get("symbols"));
  const candles = {};
  const errors = [];
  // 12 monthly candles + the 30-day strip; a wider window is rows read for nothing.
  const start = isoDaysAgo(400);

  // fresh=1 → incremental refresh (only fetch gap from last cached date to today)
  if (fresh && symbols.length) {
    const refreshResults = await runInBatches(
      symbols,
      (symbol) => refreshHistoricalCandlesIncremental(env, symbol, start),
      5
    );
    refreshResults.forEach((result, idx) => {
      if (result.status === "rejected") {
        errors.push(`${symbols[idx]}: candle refresh failed (${result.reason?.message || "unknown"}).`);
      } else if (result.value?.ok === false) {
        errors.push(`${symbols[idx]}: candle refresh failed (${result.value.error || "unknown"}).`);
      }
    });
  }

  const cachedBySymbol = await getCachedMarketCandlesForSymbols(env, symbols, start);

  let latestDate = "";
  for (const symbol of symbols) {
    const normalized = normalizeMarketSymbol(symbol);
    const cached = cachedBySymbol.get(normalized) || [];
    if (cached.length) {
      candles[symbol] = {
        m12: aggregateMonthlyCandles(cached).slice(-12),
        d30: cached.slice(-30),
      };
      const lastCandleDate = toCandleDate(cached[cached.length - 1]);
      if (lastCandleDate && lastCandleDate > latestDate) latestDate = lastCandleDate;
    } else {
      errors.push(`${symbol}: chart data is not cached in D1 yet.`);
    }
    if (!cacheOnly && !fresh) ctx?.waitUntil?.(refreshHistoricalCandles(env, symbol, start));
  }

  return json(request, { candles, errors, fetchedAt: nowIso(), latestDate });
}

// Incremental candle refresh: only fetch days after the last cached date.
// New symbols (no cache) get the full default window in one shot.
async function refreshHistoricalCandlesIncremental(env, symbol, defaultStart) {
  const normalized = normalizeMarketSymbol(symbol);
  const maxRow = await env.DB.prepare(
    "SELECT MAX(date) AS maxDate FROM market_candles WHERE symbol = ?"
  ).bind(normalized).first().catch(() => null);
  const maxDate = maxRow?.maxDate || "";
  const today = todayIso();
  // Already up to date for today
  if (maxDate && maxDate >= today) return { ok: true, fetched: 0, skipped: true };
  // Pick incremental start: day after last cached, or default window
  let start = defaultStart;
  if (maxDate) {
    const next = new Date(`${maxDate}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    start = next.toISOString().slice(0, 10);
  }
  return refreshHistoricalCandles(env, symbol, start);
}

async function handleHistory(request, env, ctx) {
  await ensureMarketDataDb(env);
  const url = new URL(request.url);
  const cacheOnly = isCacheOnlyRequest(url);
  const symbols = splitSymbols(url.searchParams.get("symbols"));
  const start = url.searchParams.get("start") || "2020-01-01";
  const history = {};
  const errors = [];
  const symbolMap = new Map(symbols.map((symbol) => [normalizeMarketSymbol(symbol), symbol]));
  const cachedBySymbol = await getCachedMarketCandlesForSymbols(env, [...symbolMap.keys()], start);
  const missingSymbols = [];
  const cryptoGaps = [];

  for (const symbol of symbols) {
    const normalized = normalizeMarketSymbol(symbol);
    try {
      let cached = cachedBySymbol.get(normalized) || [];
      let refreshResult = null;
      const isCrypto = isCryptoHistorySymbol(symbol);
      const gap = !cacheOnly && historyNeedsRefresh(cached, start);
      // Crypto historical refresh is heavy (multi-source chain + paginated
      // Binance, ~3-5 subrequests per symbol). 12 symbols in one /api/history
      // call exceeds Workers' subrequest budget and times out the response.
      // For crypto we ALWAYS run the refresh in the background and return the
      // current cache; the next refresh click fills in any holes. Non-crypto
      // symbols (Yahoo) stay inline since they are 1 subrequest each.
      if (gap && !isCrypto) {
        refreshResult = await refreshHistoricalCandles(env, symbol, start);
        cached = await getCachedMarketCandles(env, normalized, start);
      } else if (gap && isCrypto) {
        cryptoGaps.push(symbol);
      }
      if (cached.length) {
        history[symbol] = cached;
        if (refreshResult?.ok === false) errors.push(`${symbol}: source refresh failed: ${refreshResult.error}`);
      } else {
        errors.push(`${symbol}: historical price data is not cached in D1 yet.${refreshResult?.error ? ` Source refresh failed: ${refreshResult.error}` : ""}`);
        missingSymbols.push(symbol);
      }
    } catch (error) {
      errors.push(`${symbol}: ${error?.message || "historical price data could not be loaded."}`);
    }
  }
  const missingStocks = missingSymbols.filter((symbol) => !isCryptoHistorySymbol(symbol));
  if (!cacheOnly && missingStocks.length) ctx?.waitUntil?.(refreshHistoricalCandlesForSymbols(env, missingStocks, start));
  if (!cacheOnly && cryptoGaps.length) ctx?.waitUntil?.(refreshCryptoHistoryTails(env, cryptoGaps, start));

  return json(request, { history, errors });
}

function isCacheOnlyRequest(url) {
  return url.searchParams.get("cacheOnly") === "1";
}

function isFreshRequest(url) {
  return url.searchParams.get("fresh") === "1";
}

// Run async `fn` over `items` in batches of `batchSize` (sequential batches,
// parallel within a batch). Mirrors Promise.allSettled output shape so callers
// don't have to change their result handling. Throttling avoids Yahoo
// (and CoinGecko/Binance) rate limits when refreshing many symbols at once.
async function runInBatches(items, fn, batchSize = 5) {
  const out = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    const partial = await Promise.allSettled(slice.map((item) => fn(item)));
    out.push(...partial);
  }
  return out;
}

function historyNeedsRefresh(candles, startDate) {
  if (!Array.isArray(candles) || !candles.length) return true;
  const firstDate = toCandleDate(candles[0]);
  if (!firstDate || !startDate) return true;
  // Missing coverage at the START of the requested range.
  if (firstDate > addIsoDays(startDate, 7)) return true;
  // Missing coverage at the END (stale tail): if the newest stored candle is
  // more than a few days old, the series flat-lines from that point on and
  // recent range starts (e.g. 1-month view) return nothing. 4 days tolerates a
  // normal weekend (Fri close -> Mon load) without refetching every request.
  const lastDate = toCandleDate(candles[candles.length - 1]);
  const todayIso = new Date().toISOString().slice(0, 10);
  if (!lastDate || lastDate < addIsoDays(todayIso, -4)) return true;
  return false;
}

function addIsoDays(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

// Crypto daily candles, kept fresh incrementally: each symbol fetches only
// the days after its last cached candle (1 Binance request when listed).
// At most CRYPTO_TAILS_PER_RUN symbols per invocation, rotating by the hour so
// a dead symbol cannot starve the others; the rest follow on later runs.
async function refreshCryptoHistoryTails(env, symbols, defaultStart = isoDaysAgo(420)) {
  await ensureMarketDataDb(env);
  const wanted = [...new Set(symbols.map((symbol) => cryptoHistorySymbolForWorker(symbol)))].filter(isCryptoHistorySymbol).sort();
  if (!wanted.length) return { refreshed: 0 };
  const today = todayIso();
  // One indexed lookup per symbol (reads a single row) instead of a GROUP BY
  // over the whole table, and we stop as soon as the run is full.
  const offset = (new Date().getUTCHours() * CRYPTO_TAILS_PER_RUN) % wanted.length;
  const rotated = [...wanted.slice(offset), ...wanted.slice(0, offset)];
  const maxDates = new Map();
  const batch = [];
  for (const symbol of rotated) {
    if (batch.length >= CRYPTO_TAILS_PER_RUN) break;
    const row = await env.DB.prepare(
      "SELECT date FROM market_candles WHERE symbol = ? ORDER BY date DESC LIMIT 1"
    ).bind(symbol).first().catch(() => null);
    const maxDate = row?.date || "";
    maxDates.set(symbol, maxDate);
    if (maxDate < today) batch.push(symbol);
  }
  if (!batch.length) return { refreshed: 0 };
  let refreshed = 0;
  for (const symbol of batch) {
    const maxDate = maxDates.get(symbol) || "";
    const start = maxDate && maxDate >= defaultStart ? addIsoDays(maxDate, -1) : defaultStart;
    const result = await refreshHistoricalCandles(env, symbol, start).catch(() => null);
    if (result?.ok) refreshed += 1;
  }
  return { refreshed };
}

async function refreshHistoricalCandlesForSymbols(env, symbols, start) {
  for (const symbol of symbols) {
    await refreshHistoricalCandles(env, symbol, start);
  }
}

async function refreshHistoricalCandles(env, symbol, start) {
  const normalized = normalizeMarketSymbol(symbol);
  if (normalized === "BTC-TRY") return refreshBtcTryCandles(env, start);
  let candles = [];
  let source = candleSourceForSymbol(symbol);
  try {
    if (isCryptoHistorySymbol(symbol)) {
      const result = await fetchCryptoHistoricalCandles(env, symbol, start);
      candles = result.candles;
      source = result.source;
    } else {
      candles = await fetchHistoricalDailyCandles(symbol, start);
    }
  } catch (error) {
    return { ok: false, error: error?.message || "source fetch failed" };
  }
  if (!candles.length) return { ok: false, error: "source returned no candles" };
  if (candles.length) {
    await saveMarketCandles(env, normalized, candles, source);
    const latest = candles[candles.length - 1];
    if (Number.isFinite(Number(latest?.close)) && Number(latest.close) > 0) {
      await saveMarketDataPoint(env, `PRICE:${normalized}`, toCandleDate(latest) || todayIso(), Number(latest.close));
    }
  }
  return { ok: true, count: candles.length };
}

async function getCachedMarketCandlesForSymbols(env, symbols, startDate) {
  const filtered = [...new Set(symbols.map(normalizeMarketSymbol).filter(Boolean))];
  const grouped = new Map(filtered.map((symbol) => [symbol, []]));
  if (!filtered.length) return grouped;
  const placeholders = filtered.map(() => "?").join(",");
  const result = await env.DB.prepare(
    `SELECT symbol, date, open, high, low, close FROM market_candles WHERE symbol IN (${placeholders}) AND date >= ? ORDER BY symbol ASC, date ASC`
  ).bind(...filtered, startDate).all();
  for (const row of result.results ?? []) {
    const candle = candleRowToPayload(row);
    if (candle) (grouped.get(row.symbol) || grouped.set(row.symbol, []).get(row.symbol)).push(candle);
  }
  return grouped;
}


async function getCachedMarketCandles(env, symbol, startDate) {
  const result = await env.DB.prepare(
    "SELECT date, open, high, low, close FROM market_candles WHERE symbol = ? AND date >= ? ORDER BY date ASC"
  ).bind(symbol, startDate).all();
  return (result.results ?? [])
    .map((row) => candleRowToPayload(row))
    .filter(Boolean);
}

async function saveMarketCandles(env, symbol, candles, source) {
  const rows = candles
    .map((candle) => {
      const date = toCandleDate(candle);
      return {
        date,
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
      };
    })
    .filter((row) => row.date && [row.open, row.high, row.low, row.close].every(Number.isFinite));
  if (!rows.length) return;

  const updatedAt = nowIso();
  await env.DB.batch(rows.map((row) =>
    env.DB.prepare(
      "INSERT OR REPLACE INTO market_candles (symbol, date, open, high, low, close, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(symbol, row.date, row.open, row.high, row.low, row.close, source, updatedAt)
  ));
}

function candleRowToPayload(row) {
  if (!row?.date) return null;
  const time = Math.floor(Date.parse(`${row.date}T12:00:00Z`) / 1000);
  const open = Number(row.open);
  const high = Number(row.high);
  const low = Number(row.low);
  const close = Number(row.close);
  if (!Number.isFinite(time) || ![open, high, low, close].every(Number.isFinite)) return null;
  return { time, open, high, low, close };
}

function toCandleDate(candle) {
  const time = Number(candle?.time);
  if (!Number.isFinite(time)) return "";
  return new Date(time * 1000).toISOString().slice(0, 10);
}

function isCryptoHistorySymbol(symbol) {
  const clean = normalizeMarketSymbol(symbol);
  if (!clean.endsWith("-USD")) return false;
  const base = clean.slice(0, -4);
  return Boolean(COINGECKO_CRYPTO_IDS[base]);
}

function coingeckoIdForHistorySymbol(symbol) {
  const clean = normalizeMarketSymbol(symbol);
  const base = clean.endsWith("-USD") ? clean.slice(0, -4) : clean;
  return COINGECKO_CRYPTO_IDS[base] || "";
}

async function fetchCryptoHistoricalCandles(env, symbol, startDate) {
  const errors = [];
  let bestPartial = null;
  const manualCandles = manualCryptoCandlesForSymbol(symbol, startDate);
  if (manualCandles.length) {
    return { candles: manualCandles, source: "Manual crypto close" };
  }

  // Yahoo first: reachable from Cloudflare, one request per coin. Binance
  // (403 from Cloudflare), CoinPaprika (monthly quota) and CoinGecko (429
  // without a key) remain only as fallbacks. A Yahoo series that reaches
  // today is accepted even if it starts after startDate — the coin simply
  // did not trade earlier.
  const yahooSymbol = yahooCryptoSymbol(symbol);
  try {
    const candles = await fetchYahooHistoricalDailyCandles(yahooSymbol, startDate);
    const lastDate = candles.length ? toCandleDate(candles[candles.length - 1]) : "";
    if (lastDate && lastDate >= addIsoDays(todayIso(), -4)) {
      return { candles, source: `Yahoo ${yahooSymbol}` };
    }
    if (candles.length) {
      bestPartial = betterCryptoPartial(bestPartial, { candles, source: `Yahoo ${yahooSymbol}` }, startDate);
      errors.push(`Yahoo ${yahooSymbol} is stale (last ${lastDate})`);
    } else {
      errors.push(`Yahoo ${yahooSymbol} returned no candles`);
    }
  } catch (error) {
    errors.push(`Yahoo: ${error?.message || "failed"}`);
  }

  // Fast path for symbols known to be absent from Binance/CoinPaprika.
  const cleanBase = cryptoBaseSymbol(symbol);
  const preferGecko = cleanBase && CRYPTO_PREFERRED_GECKO.has(cleanBase);

  if (!preferGecko) {
    try {
      const result = await fetchBinanceCryptoCandles(symbol, startDate);
      if (result.candles.length && !historyNeedsRefresh(result.candles, startDate)) {
        return result;
      }
      if (result.candles.length) {
        bestPartial = betterCryptoPartial(bestPartial, result, startDate);
        errors.push(`${result.source} returned partial history starting ${toCandleDate(result.candles[0])}`);
      } else {
        errors.push("Binance returned no candles");
      }
    } catch (error) {
      errors.push(`Binance: ${error?.message || "failed"}`);
    }

    try {
      const result = await fetchCoinPaprikaCryptoCandles(env, symbol, startDate);
      if (result.candles.length && !historyNeedsRefresh(result.candles, startDate)) {
        return result;
      }
      if (result.candles.length) {
        bestPartial = betterCryptoPartial(bestPartial, result, startDate);
        errors.push(`${result.source} returned partial history starting ${toCandleDate(result.candles[0])}`);
      } else {
        errors.push("CoinPaprika returned no candles");
      }
    } catch (error) {
      errors.push(`CoinPaprika: ${error?.message || "failed"}`);
    }
  }

  try {
    const candles = await fetchCoinGeckoCryptoCandles(env, symbol, startDate);
    if (candles.length && !historyNeedsRefresh(candles, startDate)) {
      return { candles, source: "CoinGecko" };
    }
    if (candles.length) {
      const result = { candles, source: "CoinGecko" };
      bestPartial = betterCryptoPartial(bestPartial, result, startDate);
      errors.push(`CoinGecko returned partial history starting ${toCandleDate(candles[0])}`);
    } else {
      errors.push("CoinGecko returned no candles");
    }
  } catch (error) {
    errors.push(`CoinGecko: ${error?.message || "failed"}`);
  }

  if (bestPartial?.candles?.length) return bestPartial;
  throw new Error(errors.join("; "));
}

function manualCryptoCandlesForSymbol(symbol, startDate) {
  const clean = normalizeMarketSymbol(symbol);
  const rows = MANUAL_CRYPTO_DAILY_CLOSES[clean] || [];
  if (!rows.length) return [];
  return uniqueSortedCandles(rows
    .filter((row) => !startDate || row.date >= startDate)
    .map((row) => {
      const close = Number(row.close);
      const time = Math.floor(Date.parse(`${row.date}T12:00:00Z`) / 1000);
      if (!Number.isFinite(time) || !Number.isFinite(close) || close <= 0) return null;
      return { time, open: close, high: close, low: close, close };
    })
    .filter(Boolean));
}

function betterCryptoPartial(current, candidate, startDate) {
  if (!candidate?.candles?.length) return current;
  if (!current?.candles?.length) return candidate;
  const currentFirst = toCandleDate(current.candles[0]) || "9999-12-31";
  const candidateFirst = toCandleDate(candidate.candles[0]) || "9999-12-31";
  if (candidateFirst < currentFirst) return candidate;
  if (candidateFirst === currentFirst && candidate.candles.length > current.candles.length) return candidate;
  return current;
}

async function fetchBinanceCryptoCandles(symbol, startDate) {
  const pairs = binancePairsForHistorySymbol(symbol);
  if (!pairs.length) throw new Error(`${symbol}: Binance pair is not configured`);
  const errors = [];
  const mergedCandles = [];
  const usedPairs = [];
  for (const pair of pairs) {
    try {
      const candles = await fetchBinancePairCandles(pair, startDate);
      if (candles.length) {
        mergedCandles.push(...candles);
        usedPairs.push(pair);
        // First successful pair with full history is enough — additional
        // pairs cost extra subrequests for negligible coverage gain.
        if (!historyNeedsRefresh(mergedCandles, startDate)) break;
      } else {
        errors.push(`${pair} returned no candles`);
      }
    } catch (error) {
      const message = error?.message || "failed";
      errors.push(`${pair}: ${message}`);
      // 403/451 = Binance is blocking this Cloudflare egress IP, not a problem
      // with the pair. Remaining pairs would fail too — don't burn subrequests.
      if (message.includes("403") || message.includes("451") || /restricted location/i.test(message)) break;
    }
  }
  if (mergedCandles.length) {
    return {
      candles: uniqueSortedCandles(mergedCandles),
      source: `Binance ${usedPairs.join("+")}`,
    };
  }
  throw new Error(errors.join("; "));
}

function binancePairsForHistorySymbol(symbol) {
  const base = cryptoBaseSymbol(symbol);
  if (!base) return [];
  const explicit = BINANCE_CRYPTO_PAIRS[base] || [];
  return [...new Set([...explicit, `${base}USDT`, `${base}USDC`, `${base}BUSD`])];
}

async function fetchBinancePairCandles(pair, startDate) {
  const startTime = Date.parse(`${startDate}T00:00:00Z`);
  const endTime = Date.now();
  if (!Number.isFinite(startTime) || startTime <= 0) return [];
  const dayMs = 24 * 60 * 60 * 1000;
  const limit = 1000;
  let cursor = startTime;
  const candles = [];

  while (cursor <= endTime) {
    const target = `${BINANCE_API_BASE}/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=1d&startTime=${cursor}&endTime=${endTime}&limit=${limit}`;
    const response = await fetch(target, {
      headers: {
        accept: "application/json",
        "user-agent": "Northstar Portfolio/1.0",
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.msg || `failed (${response.status})`);
    }
    if (!Array.isArray(payload) || !payload.length) break;

    for (const row of payload) {
      const time = Math.floor(Number(row?.[0]) / 1000);
      const open = Number(row?.[1]);
      const high = Number(row?.[2]);
      const low = Number(row?.[3]);
      const close = Number(row?.[4]);
      if (!Number.isFinite(time) || ![open, high, low, close].every(Number.isFinite) || close <= 0) continue;
      candles.push({ time, open, high, low, close });
    }

    const lastOpen = Number(payload[payload.length - 1]?.[0]);
    if (!Number.isFinite(lastOpen) || lastOpen < cursor) break;
    const nextCursor = lastOpen + dayMs;
    if (nextCursor <= cursor) break;
    cursor = nextCursor;
    if (payload.length < limit) break;
  }

  return uniqueSortedCandles(candles);
}

async function fetchCoinPaprikaCryptoCandles(env, symbol, startDate) {
  const coinId = await coinPaprikaIdForHistorySymbol(env, symbol);
  if (!coinId) throw new Error(`${symbol}: CoinPaprika id is not configured`);
  const params = new URLSearchParams({
    start: startDate,
    end: todayIso(),
    interval: "24h",
  });
  const target = `https://api.coinpaprika.com/v1/coins/${encodeURIComponent(coinId)}/ohlcv/historical?${params.toString()}`;
  const response = await fetch(target, {
    headers: {
      accept: "application/json",
      "user-agent": "Northstar Portfolio/1.0",
      ...(env.COINPAPRIKA_API_KEY ? { Authorization: env.COINPAPRIKA_API_KEY } : {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `CoinPaprika ${coinId} failed (${response.status})`);
  }
  const rows = Array.isArray(payload) ? payload : [];
  const candles = rows.map((row) => {
    const close = Number(row?.close);
    const open = Number(row?.open ?? close);
    const high = Number(row?.high ?? close);
    const low = Number(row?.low ?? close);
    const time = Math.floor(Date.parse(row?.time_close || row?.time_open || row?.timestamp) / 1000);
    if (!Number.isFinite(time) || ![open, high, low, close].every(Number.isFinite) || close <= 0) return null;
    return { time, open, high, low, close };
  }).filter(Boolean);
  return { candles: uniqueSortedCandles(candles), source: `CoinPaprika ${coinId}` };
}

async function coinPaprikaIdForHistorySymbol(env, symbol) {
  const base = cryptoBaseSymbol(symbol);
  if (!base) return "";
  if (COINPAPRIKA_CRYPTO_IDS[base]) return COINPAPRIKA_CRYPTO_IDS[base];
  try {
    const response = await fetch(`https://api.coinpaprika.com/v1/search?q=${encodeURIComponent(base)}&c=currencies&limit=10`, {
      headers: {
        accept: "application/json",
        "user-agent": "Northstar Portfolio/1.0",
        ...(env.COINPAPRIKA_API_KEY ? { Authorization: env.COINPAPRIKA_API_KEY } : {}),
      },
    });
    if (!response.ok) return "";
    const payload = await response.json().catch(() => null);
    const currencies = Array.isArray(payload?.currencies) ? payload.currencies : [];
    const exact = currencies.find((item) => String(item?.symbol || "").toUpperCase() === base);
    return exact?.id || "";
  } catch {
    return "";
  }
}

const CRYPTO_FALLBACK_PER_RUN = 3;
const CRYPTO_TAILS_PER_RUN = 4;

// Bulk current-price fetch. Up to ~250 symbols in a single CoinGecko
// `/simple/price` call (1 subrequest), avoiding the ~3-5 subrequests per
// symbol that the Binance+CoinPaprika+CoinGecko candle chain consumes.
async function fetchCoinGeckoBulkPrices(env, geckoIds) {
  const ids = [...new Set((geckoIds || []).filter(Boolean))];
  if (!ids.length) return {};
  const api = coingeckoApiConfig(env);
  const target = `${api.base}/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd`;
  const response = await fetch(target, {
    headers: {
      accept: "application/json",
      ...api.headers,
      "user-agent": "Northstar Portfolio/1.0",
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`CoinGecko bulk simple/price failed (${response.status}${text ? `: ${text.slice(0, 120)}` : ""})`);
  }
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") return {};
  const out = {};
  for (const [id, value] of Object.entries(payload)) {
    const price = Number(value?.usd);
    if (Number.isFinite(price) && price > 0) out[id] = price;
  }
  return out;
}

// One-shot current-price refresh for many crypto symbols: Yahoo spark (20
// symbols per request) first, CoinGecko bulk for whatever Yahoo lacks, and a
// capped per-symbol candle fallback for the rest (picked up next run).
async function refreshCryptoCurrentPricesBulk(env, symbols) {
  const normalized = [...new Set(symbols.map((symbol) => cryptoBaseSymbol(symbol)).filter(Boolean))];
  const errors = [];
  const today = todayIso();
  const saves = [];
  const savePrice = (symbol, price) => saves.push(saveMarketDataPoint(env, `PRICE:${symbol}-USD`, today, price));

  let remaining = normalized;
  try {
    const yahooBySymbol = new Map(remaining.map((symbol) => [symbol, yahooCryptoSymbol(symbol)]));
    const prices = await fetchYahooSparkPrices([...yahooBySymbol.values()]);
    remaining = remaining.filter((symbol) => {
      const price = prices[yahooBySymbol.get(symbol)];
      if (!(price > 0)) return true;
      savePrice(symbol, price);
      return false;
    });
  } catch (error) {
    errors.push(`Yahoo crypto prices failed: ${error?.message || "unknown"}`);
  }

  const geckoBySymbol = new Map(remaining
    .map((symbol) => [symbol, coingeckoIdForHistorySymbol(`${symbol}-USD`)])
    .filter(([, id]) => id));
  if (geckoBySymbol.size) {
    try {
      const prices = await fetchCoinGeckoBulkPrices(env, [...geckoBySymbol.values()]);
      remaining = remaining.filter((symbol) => {
        const price = prices[geckoBySymbol.get(symbol)];
        if (!(price > 0)) return true;
        savePrice(symbol, price);
        return false;
      });
    } catch (error) {
      errors.push(`CoinGecko bulk fetch failed: ${error?.message || "unknown"}`);
    }
  }
  await Promise.allSettled(saves);

  // Capped: each fallback may walk the whole candle source chain.
  const fallback = remaining.slice(0, CRYPTO_FALLBACK_PER_RUN);
  if (fallback.length) {
    const results = await runInBatches(fallback, (symbol) => refreshCryptoCurrentPrice(env, `${symbol}-USD`), 2);
    results.forEach((result, idx) => {
      if (result.status === "rejected") {
        errors.push(`${fallback[idx]}: crypto refresh failed (${result.reason?.message || "unknown"}).`);
      }
    });
  }
  return { errors };
}

async function fetchCoinGeckoCryptoCandles(env, symbol, startDate) {
  const coinId = coingeckoIdForHistorySymbol(symbol);
  if (!coinId) throw new Error(`${symbol}: CoinGecko id is not configured`);
  const start = Math.floor(Date.parse(`${startDate}T00:00:00Z`) / 1000);
  const end = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(start) || start <= 0) return [];
  const api = coingeckoApiConfig(env);
  const target = `${api.base}/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${start}&to=${end}&interval=daily`;
  const response = await fetch(target, {
    headers: {
      accept: "application/json",
      ...api.headers,
      "user-agent": "Northstar Portfolio/1.0",
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`CoinGecko ${coinId} failed (${response.status}${text ? `: ${text.slice(0, 120)}` : ""})`);
  }
  const payload = await response.json().catch(() => null);
  const prices = Array.isArray(payload?.prices) ? payload.prices : [];
  return uniqueSortedCandles(prices
    .map(([timeMs, rawPrice]) => {
      const close = Number(rawPrice);
      const time = Math.floor(Number(timeMs) / 1000);
      if (!Number.isFinite(time) || !Number.isFinite(close) || close <= 0) return null;
      return { time, open: close, high: close, low: close, close };
    })
    .filter(Boolean));
}

function cryptoBaseSymbol(symbol) {
  const clean = normalizeMarketSymbol(symbol);
  return clean.endsWith("-USD") ? clean.slice(0, -4) : clean;
}

function coingeckoApiConfig(env) {
  const proKey = env.COINGECKO_PRO_API_KEY || env.CG_PRO_API_KEY;
  if (proKey) {
    return {
      base: "https://pro-api.coingecko.com/api/v3",
      headers: { "x-cg-pro-api-key": proKey },
      hasFullHistoricalAccess: true,
    };
  }
  const demoKey = env.COINGECKO_DEMO_API_KEY || env.COINGECKO_API_KEY || env.CG_DEMO_API_KEY;
  if (demoKey) {
    return {
      base: "https://api.coingecko.com/api/v3",
      headers: { "x-cg-demo-api-key": demoKey },
      hasFullHistoricalAccess: false,
    };
  }
  return {
    base: "https://api.coingecko.com/api/v3",
    headers: {},
    hasFullHistoricalAccess: false,
  };
}

function isoDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function candleSourceForSymbol(symbol) {
  if (isCryptoHistorySymbol(symbol)) return "Yahoo / Binance / CoinPaprika / CoinGecko";
  if (isAltins1Symbol(symbol)) return "Doviz.com ALTINS1 / Hisse.net / Investing ALTIN";
  if (normalizeMarketSymbol(symbol) === "DMLKT") return "Investing.com DMLKT";
  return "Yahoo Chart";
}

async function handleSplits(request, env) {
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

async function handleCryptoQuotes(request, env, ctx) {
  await ensureMarketDataDb(env);
  const user = await requireUser(request, env);
  if (!user) return json(request, { error: "Unauthorized." }, 401);
  const url = new URL(request.url);
  const fresh = isFreshRequest(url);
  const symbols = [...new Set(String(url.searchParams.get("symbols") || "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean))];
  if (!symbols.length) return json(request, { prices: {}, errors: [], fetchedAt: nowIso(), latestDate: "" });
  const prices = {};
  const errors = [];

  if (fresh) {
    // Bulk path: 1 subrequest for ALL gecko-mapped symbols, individual fall
    // back only for stragglers. Drops worst-case crypto refresh subrequest
    // count from ~150 (31 sym × 5 chain) to ~1-3.
    const bulkResult = await refreshCryptoCurrentPricesBulk(env, symbols);
    if (bulkResult.errors?.length) errors.push(...bulkResult.errors);
  }

  const series = symbols.map((symbol) => `PRICE:${cryptoHistorySymbolForWorker(symbol)}`);
  const cached = await getPreviousCachedMarketDataPoints(env, series, todayIso()).catch((error) => {
    errors.push(`D1 crypto price batch read failed (${error?.message || "unknown error"}).`);
    return new Map();
  });
  let latestDate = "";
  const missing = [];
  for (const symbol of symbols) {
    const historySymbol = cryptoHistorySymbolForWorker(symbol);
    const cachedPoint = cached.get(`PRICE:${historySymbol}`);
    if (cachedPoint) {
      prices[symbol] = cachedPoint.rate;
      if (cachedPoint.date && cachedPoint.date > latestDate) latestDate = cachedPoint.date;
    } else {
      errors.push(`${symbol}: current crypto price data is missing in D1.`);
      missing.push(symbol);
    }
  }
  // Cache-only load with empty D1: backfill via the bulk path (1 subrequest for
  // all gecko-mapped symbols + throttled fallback) instead of firing one
  // refreshCryptoCurrentPrice per missing symbol, which blows past Cloudflare's
  // per-invocation subrequest cap and trips CoinGecko/CoinPaprika rate limits.
  if (!fresh && missing.length) {
    ctx?.waitUntil?.(refreshCryptoCurrentPricesBulk(env, missing));
  }
  return json(request, { prices, errors, fetchedAt: nowIso(), latestDate });
}

function cryptoHistorySymbolForWorker(symbol) {
  const clean = normalizeMarketSymbol(symbol);
  return clean.endsWith("-USD") ? clean : `${clean}-USD`;
}

async function refreshCryptoCurrentPrice(env, symbol) {
  const historySymbol = cryptoHistorySymbolForWorker(symbol);
  const result = await fetchCryptoHistoricalCandles(env, historySymbol, isoDaysAgo(7));
  const candles = result.candles;
  if (!candles.length) return;
  await saveMarketCandles(env, historySymbol, candles, result.source);
  const latest = candles[candles.length - 1];
  if (Number.isFinite(Number(latest?.close)) && Number(latest.close) > 0) {
    await saveMarketDataPoint(env, `PRICE:${historySymbol}`, toCandleDate(latest) || todayIso(), Number(latest.close));
  }
}

// Daily backfill of current prices for every held crypto symbol so D1 stays
// warm and users rarely hit "missing in D1". Uses the bulk path (1 subrequest
// for all gecko-mapped symbols + throttled fallback), so it stays well under
// Cloudflare's per-invocation subrequest cap. Runs off the scheduled() cron.
async function refreshAllCryptoPrices(env) {
  await ensureCryptoPortfolioDb(env);
  const rows = await env.DB.prepare("SELECT DISTINCT symbol FROM crypto_transactions").all().catch(() => ({ results: [] }));
  const symbols = [...new Set((rows.results ?? []).map((row) => String(row.symbol || "").toUpperCase()).filter(Boolean))];
  if (!symbols.length) return;
  await refreshCryptoCurrentPricesBulk(env, symbols).catch(() => {});
}

async function scanAllPortfolioSplits(env) {
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

async function handleGs3m(request, env) {
  const url = new URL(request.url);
  const cacheOnly = isCacheOnlyRequest(url);
  let curve;
  try {
    curve = cacheOnly ? await getCachedGs3mCurve(env) : await getGs3mCurve(env);
  } catch {
    curve = cacheOnly ? { points: [], source: "D1 GS3M", latestDate: "", pointCount: 0, refreshError: "GS3M data is missing in D1." } : getFallbackGs3mCurve();
  }

  const rates = {};
  for (const point of curve.points || []) {
    if (point?.date && Number.isFinite(point.rate)) rates[point.date.slice(0, 7)] = point.rate;
  }

  return json(request, {
    rates,
    source: curve.source,
    latestDate: curve.latestDate,
    pointCount: (curve.points || []).length,
    refreshError: curve.refreshError || "",
  });
}

async function handleRates(request, env) {
  const url = new URL(request.url);
  const cacheOnly = isCacheOnlyRequest(url);
  const dates = (url.searchParams.get("dates") || "")
    .split(",")
    .map((date) => date.trim())
    .filter(Boolean);

  const latest = cacheOnly ? await getPreviousCachedMarketDataPoint(env, "TCMB_USD_TRY", todayIso()) : await getLatestRate();
  if (!cacheOnly && latest) await saveMarketDataPoint(env, "TCMB_USD_TRY", latest.date || todayIso(), latest.rate);
  const pairs = await Promise.all(dates.map(async (date) => [
    date,
    cacheOnly ? await getCachedOrPreviousMarketDataPoint(env, "TCMB_USD_TRY", date) : await getCachedOrFetchHistoricalRate(env, date),
  ]));
  const rates = {};
  const missing = [];
  for (const [date, rate] of pairs) {
    if (rate) rates[date] = rate;
    else missing.push(date);
  }

  return json(request, { ok: true, source: "TCMB USD ForexBuying", latest, rates, missing });
}

async function handleYields(request, env) {
  const url = new URL(request.url);
  const cacheOnly = isCacheOnlyRequest(url);
  let usd;
  try {
    usd = cacheOnly ? await getCachedGs3mCurve(env) : await getGs3mCurve(env);
  } catch {
    usd = { points: [], source: "D1 GS3M", latestDate: "", refreshError: "GS3M data is missing in D1." };
  }
  const tryCurve = await getTryDepositCurve(env);
  const usdUsingFallback = usd.source === "Fallback GS3M";
  const usdMissingMonths = usd.latestDate ? missingMonths(usd.latestDate) : 0;
  const tryMissingMonths = missingMonths(tryCurve.latestDate);
  const tryStale = daysSince(tryCurve.latestDate) > TRY_DEPOSIT_STALE_DAYS;
  const refreshWarning = usd.refreshError ? `GS3M refresh failed; using saved D1 data. (${usd.refreshError})` : "";
  return json(request, {
    ok: true,
    usd,
    try: tryCurve,
    status: {
      usdMissingMonths,
      tryMissingMonths,
      usdSource: usd.source,
      usdLatestDate: usd.latestDate || "",
      usdPointCount: (usd.points || []).length,
      trySource: tryCurve.source,
      tryLatestDate: tryCurve.latestDate,
      message: [usd.points?.length ? "" : "GS3M data is missing in D1.", refreshWarning, buildYieldMessage(usdMissingMonths, tryStale, usdUsingFallback)].filter(Boolean).join(" "),
    },
  });
}

async function getLatestRate() {
  const response = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml", { headers: { accept: "application/xml,text/xml,*/*" } });
  if (!response.ok) return null;
  return parseTcmbXml(await response.text());
}

async function getHistoricalRate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  for (let offset = 0; offset <= 7; offset += 1) {
    const lookupDate = shiftDate(date, -offset);
    const [year, month, day] = lookupDate.split("-");
    const response = await fetch(`https://www.tcmb.gov.tr/kurlar/${year}${month}/${day}${month}${year}.xml`, {
      headers: { accept: "application/xml,text/xml,*/*" },
    });
    if (!response.ok) continue;
    const parsed = parseTcmbXml(await response.text(), lookupDate);
    if (parsed) return { ...parsed, requestedDate: date, usedPreviousBusinessDay: offset > 0 };
  }

  return null;
}

async function getCachedOrFetchHistoricalRate(env, date) {
  await ensureMarketDataDb(env);
  const cached = await getCachedMarketDataPoint(env, "TCMB_USD_TRY", date);
  if (cached) return cached;

  const fetched = await getHistoricalRate(date);
  if (fetched) {
    await saveMarketDataPoint(env, "TCMB_USD_TRY", fetched.date || date, fetched.rate);
    if ((fetched.date || date) !== date) await saveMarketDataPoint(env, "TCMB_USD_TRY", date, fetched.rate);
    return fetched;
  }

  return getPreviousCachedMarketDataPoint(env, "TCMB_USD_TRY", date);
}

async function getCachedMarketDataPoint(env, series, date) {
  const row = await env.DB.prepare(
    "SELECT date, rate FROM market_data_points WHERE series = ? AND date = ?"
  ).bind(series, date).first();
  return row ? { date: row.date, rate: Number(row.rate), cached: true } : null;
}

async function getPreviousCachedMarketDataPoint(env, series, date) {
  const row = await env.DB.prepare(
    "SELECT date, rate FROM market_data_points WHERE series = ? AND date <= ? ORDER BY date DESC LIMIT 1"
  ).bind(series, date).first();
  return row ? { date: row.date, rate: Number(row.rate), cached: true, usedPreviousCachedDate: true } : null;
}

async function getPreviousCachedMarketDataPoints(env, seriesList, date) {
  await ensureMarketDataDb(env);
  const unique = [...new Set((seriesList || []).filter(Boolean))];
  if (!unique.length) return new Map();
  const placeholders = unique.map(() => "?").join(",");
  const result = await env.DB.prepare(
    `SELECT series, date, rate FROM market_data_points WHERE series IN (${placeholders}) AND date <= ? ORDER BY series ASC, date DESC`
  ).bind(...unique, date).all();
  const map = new Map();
  for (const row of result.results ?? []) {
    if (!map.has(row.series)) {
      map.set(row.series, { date: row.date, rate: Number(row.rate), cached: true, usedPreviousCachedDate: true });
    }
  }
  return map;
}

async function getCachedOrPreviousMarketDataPoint(env, series, date) {
  await ensureMarketDataDb(env);
  return await getCachedMarketDataPoint(env, series, date)
    || await getPreviousCachedMarketDataPoint(env, series, date);
}

async function getFreshMarketDataPoint(env, series, date, maxAgeMinutes) {
  const row = await env.DB.prepare(
    "SELECT date, rate, updated_at FROM market_data_points WHERE series = ? AND date = ?"
  ).bind(series, date).first();
  if (!row) return null;
  const updated = Date.parse(row.updated_at);
  const maxAgeMs = Math.max(Number(maxAgeMinutes) || 0, 1) * 60000;
  if (!Number.isFinite(updated) || Date.now() - updated > maxAgeMs) return null;
  return { date: row.date, rate: Number(row.rate), cached: true, updatedAt: row.updated_at };
}

async function saveMarketDataPoint(env, series, date, rate) {
  await ensureMarketDataDb(env);
  if (!date || !Number.isFinite(Number(rate))) return;
  await env.DB.prepare(
    "INSERT OR REPLACE INTO market_data_points (series, date, rate, updated_at) VALUES (?, ?, ?, ?)"
  ).bind(series, date, Number(rate), nowIso()).run();
}

async function getGs3mCurve(env) {
  const cached = await getCachedGs3mCurve(env);
  const shouldRefresh = !cached.points.length || missingMonths(cached.latestDate) >= 1;
  if (!shouldRefresh) return cached;

  try {
    const fresh = await fetchFreshGs3mCurve();
    await saveGs3mCurve(env, fresh.points);
    return fresh;
  } catch (error) {
    if (cached.points.length) return { ...cached, refreshError: error?.message || "GS3M refresh failed" };
    throw error;
  }
}

async function getCachedGs3mCurve(env) {
  await ensureMarketDataDb(env);
  const result = await env.DB.prepare(
    "SELECT date, rate FROM market_data_points WHERE series = ? ORDER BY date ASC"
  ).bind("GS3M").all();
  const points = (result.results ?? [])
    .map((row) => ({ date: row.date, rate: Number(row.rate) }))
    .filter((row) => row.date && Number.isFinite(row.rate));
  const latest = points[points.length - 1];
  return {
    rate: latest?.rate || 0,
    latestDate: latest?.date || "",
    points,
    source: "D1 GS3M",
  };
}

async function fetchFreshGs3mCurve() {
  const errors = [];
  try {
    return await fetchFredGs3mCurve();
  } catch (error) {
    errors.push(`FRED: ${error?.message || "failed"}`);
  }
  try {
    return await fetchFedH15Gs3mCurve();
  } catch (error) {
    errors.push(`Federal Reserve H15: ${error?.message || "failed"}`);
  }
  throw new Error(errors.join("; "));
}

async function fetchFredGs3mCurve() {
  const urls = [
    "https://fred.stlouisfed.org/graph/fredgraph.csv?id=GS3M",
    "https://fred.stlouisfed.org/graph/fredgraph.csv?cosd=1900-01-01&id=GS3M",
  ];
  let csv = "";
  let lastStatus = "";
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "text/csv,application/csv,*/*",
          "cache-control": "no-cache",
        },
        cf: { cacheTtl: 0, cacheEverything: false },
      });
      lastStatus = `${response.status} ${response.statusText}`;
      if (!response.ok) continue;
      csv = await response.text();
      if (csv.includes("GS3M") || csv.includes("observation_date")) break;
    } catch (error) {
      lastStatus = error?.message || "network error";
    }
  }
  if (!csv) throw new Error(`GS3M curve fetch failed: ${lastStatus}`);

  const points = csv.trim().split(/\r?\n/).slice(1).map((line) => {
    const [date, value] = line.split(",");
    return { date, rate: Number(value) };
  }).filter((row) => row.date && Number.isFinite(row.rate));
  if (!points.length) throw new Error("GS3M curve fetch returned no numeric points");

  const latest = points[points.length - 1];
  return { rate: latest?.rate || 0, latestDate: latest?.date || "", points, source: "FRED GS3M" };
}

async function fetchFedH15Gs3mCurve() {
  const url = "https://www.federalreserve.gov/datadownload/Output.aspx?filetype=csv&from=&label=include&lastobs=&layout=seriescolumn&rel=H15&series=bf17364827e38702b42a58cf8eaa3f78&to=&type=package";
  const response = await fetch(url, {
    headers: { accept: "text/csv,application/csv,*/*" },
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const csv = await response.text();
  if (!csv.includes("RIFLGFCM03_N.B")) throw new Error("H15 CSV did not include the 3-month series");

  const lines = csv.trim().split(/\r?\n/).map(parseCsvLine).filter((row) => row.length);
  const headerIndex = lines.findIndex((row) => row.some((cell) => cell === "RIFLGFCM03_N.B"));
  if (headerIndex < 0) throw new Error("H15 CSV header was not found");
  const header = lines[headerIndex];
  const dateIndex = header.findIndex((cell) => /time\s*period/i.test(cell));
  const valueIndex = header.findIndex((cell) => cell === "RIFLGFCM03_N.B");
  if (dateIndex < 0 || valueIndex < 0) throw new Error("H15 CSV columns were not found");

  const months = new Map();
  for (const row of lines.slice(headerIndex + 1)) {
    const date = row[dateIndex];
    const value = Number(row[valueIndex]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) continue;
    const month = date.slice(0, 7);
    const bucket = months.get(month) || { total: 0, count: 0 };
    bucket.total += value;
    bucket.count += 1;
    months.set(month, bucket);
  }

  const points = [...months.entries()]
    .filter(([, bucket]) => bucket.count > 0)
    .map(([month, bucket]) => ({ date: `${month}-01`, rate: Math.round((bucket.total / bucket.count) * 100) / 100 }))
    .sort((left, right) => left.date.localeCompare(right.date));
  if (!points.length) throw new Error("H15 CSV returned no numeric GS3M points");

  const latest = points[points.length - 1];
  return { rate: latest?.rate || 0, latestDate: latest?.date || "", points, source: "Federal Reserve H15 GS3M" };
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

async function saveGs3mCurve(env, points) {
  await ensureMarketDataDb(env);
  if (!points.length) return;
  const updatedAt = nowIso();
  await env.DB.batch(points.map((point) =>
    env.DB.prepare(
      "INSERT OR REPLACE INTO market_data_points (series, date, rate, updated_at) VALUES (?, ?, ?, ?)"
    ).bind("GS3M", point.date, Number(point.rate), updatedAt)
  ));
}

function getFallbackGs3mCurve() {
  const latest = GS3M_FALLBACK_POINTS[GS3M_FALLBACK_POINTS.length - 1];
  return {
    rate: latest?.rate || 0,
    latestDate: latest?.date || "",
    points: GS3M_FALLBACK_POINTS,
    source: "Fallback GS3M",
  };
}

// TL deposit opportunity curve: TCMB weekly "3 aya kadar vadeli TL mevduat"
// flow rate (EVDS TP.TRY.MT02, gross %). The daily cron refreshes it into D1;
// the embedded list below is only used while D1 is empty and TCMB is down.
const TRY_DEPOSIT_EVDS_SERIES = "TP.TRY.MT02";
const TRY_DEPOSIT_DB_SERIES = "TRY_DEPOSIT_MT02";
const TRY_DEPOSIT_STALE_DAYS = 21;

// Stopaj on TL deposits up to 6 months (2006/10731 BKK geçici 2). Each rate
// applies from its date on — the date accounts opened/renewed get it.
const TRY_DEPOSIT_WITHHOLDING = [
  { date: "1900-01-01", rate: 15 },
  { date: "2020-09-30", rate: 5 },   // CK 3032, extended through 30.04.2024
  { date: "2024-05-01", rate: 7.5 },
  { date: "2024-11-01", rate: 10 },
  { date: "2025-02-01", rate: 15 },
  { date: "2025-07-09", rate: 17.5 }, // CK 10041
];

async function getTryDepositCurve(env, { refresh = false } = {}) {
  let gross = await getCachedTryDepositPoints(env).catch(() => []);
  let source = "D1 TCMB TP.TRY.MT02";
  let refreshError = "";
  if (refresh || !gross.length) {
    try {
      const fresh = await fetchTcmbTryDepositPoints();
      await saveTryDepositPoints(env, fresh);
      gross = fresh;
      source = "TCMB EVDS TP.TRY.MT02";
    } catch (error) {
      refreshError = error?.message || "TCMB refresh failed";
    }
  }
  if (!gross.length) {
    gross = TRY_DEPOSIT_FALLBACK_POINTS;
    source = "Fallback TCMB TP.TRY.MT02";
  }
  const latest = gross[gross.length - 1];
  const points = applyTryDepositWithholding(gross);
  return {
    rate: points[points.length - 1].rate,
    grossRate: latest.rate,
    latestDate: latest.date,
    points,
    source,
    withholding: TRY_DEPOSIT_WITHHOLDING,
    ...(refreshError ? { refreshError } : {}),
  };
}

// Net (after-stopaj) curve. Stopaj change dates become their own boundaries so
// a new rate starts exactly on its effective date, not at the next weekly print.
function applyTryDepositWithholding(grossPoints) {
  const first = grossPoints[0]?.date || "";
  const dates = new Set(grossPoints.map((point) => point.date));
  for (const step of TRY_DEPOSIT_WITHHOLDING) if (step.date > first) dates.add(step.date);
  let grossIndex = 0;
  let stepIndex = 0;
  return [...dates].sort().map((date) => {
    while (grossIndex + 1 < grossPoints.length && grossPoints[grossIndex + 1].date <= date) grossIndex += 1;
    while (stepIndex + 1 < TRY_DEPOSIT_WITHHOLDING.length && TRY_DEPOSIT_WITHHOLDING[stepIndex + 1].date <= date) stepIndex += 1;
    const grossRate = grossPoints[grossIndex].rate;
    const withholding = TRY_DEPOSIT_WITHHOLDING[stepIndex].rate;
    return { date, rate: Math.round(grossRate * (1 - withholding / 100) * 100) / 100, grossRate, withholding };
  });
}

async function getCachedTryDepositPoints(env) {
  await ensureMarketDataDb(env);
  const result = await env.DB.prepare(
    "SELECT date, rate FROM market_data_points WHERE series = ? ORDER BY date ASC"
  ).bind(TRY_DEPOSIT_DB_SERIES).all();
  return (result.results ?? [])
    .map((row) => ({ date: row.date, rate: Number(row.rate) }))
    .filter((row) => row.date && Number.isFinite(row.rate));
}

async function saveTryDepositPoints(env, points) {
  await ensureMarketDataDb(env);
  if (!points.length) return;
  const updatedAt = nowIso();
  await env.DB.batch(points.map((point) =>
    env.DB.prepare(
      "INSERT OR REPLACE INTO market_data_points (series, date, rate, updated_at) VALUES (?, ?, ?, ?)"
    ).bind(TRY_DEPOSIT_DB_SERIES, point.date, Number(point.rate), updatedAt)
  ));
}

// EVDS3 web data endpoint (the one evds3.tcmb.gov.tr itself uses; no API key).
async function fetchTcmbTryDepositPoints() {
  const evdsDate = (date) => `${String(date.getUTCDate()).padStart(2, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${date.getUTCFullYear()}`;
  const response = await fetch("https://evds3.tcmb.gov.tr/igmevdsms-dis/fe", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      type: "json",
      series: TRY_DEPOSIT_EVDS_SERIES,
      aggregationTypes: "avg",
      formulas: "0",
      startDate: "01-01-2019",
      endDate: evdsDate(new Date()),
      frequency: "3",
      decimalSeperator: ".",
      decimal: "2",
      dateFormat: "0",
      lang: "tr",
      yon: "1",
      sira: "1",
      ozelFormuller: [],
      groupSeperator: true,
      isRaporSayfasi: false,
    }),
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  if (!response.ok) throw new Error(`TCMB EVDS ${response.status} ${response.statusText}`);
  const payload = await response.json();
  const key = TRY_DEPOSIT_EVDS_SERIES.replaceAll(".", "_");
  const points = (payload?.items ?? []).map((item) => {
    const [day, month, year] = String(item.Tarih || "").split("-");
    return { date: `${year}-${month}-${day}`, rate: Number(item[key]) };
  }).filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.rate) && point.rate > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (points.length < 50) throw new Error(`TCMB EVDS returned only ${points.length} ${TRY_DEPOSIT_EVDS_SERIES} points`);
  return points;
}

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function missingMonths(latestDate) {
  if (!latestDate) return 99;
  const now = new Date();
  const latest = new Date(`${latestDate}T12:00:00`);
  return Math.max(0, (now.getFullYear() - latest.getFullYear()) * 12 + (now.getMonth() - latest.getMonth()));
}

function daysSince(date) {
  if (!date) return Infinity;
  return (Date.now() - Date.parse(`${date}T00:00:00Z`)) / 86400000;
}

function buildYieldMessage(usdMissingMonths, tryStale, usdUsingFallback = false) {
  const warnings = [];
  if (usdUsingFallback) {
    warnings.push("GS3M live source is unavailable; fallback curve is being used.");
  } else if (usdMissingMonths >= 3) {
    warnings.push("GS3M has not refreshed for three consecutive months.");
  }
  if (tryStale) warnings.push(`TCMB TRY deposit rates have not refreshed for more than ${TRY_DEPOSIT_STALE_DAYS} days.`);
  return warnings.join(" ");
}

function parseTcmbXml(xml, fallbackDate) {
  const usdBlock = xml.match(/<Currency[^>]+CurrencyCode="USD"[\s\S]*?<\/Currency>/);
  const rateMatch = usdBlock?.[0]?.match(/<ForexBuying>([^<]+)<\/ForexBuying>/);
  const rate = Number(rateMatch?.[1]);
  if (!rate) return null;
  const dateMatch = xml.match(/Date="([^"]+)"/);
  return { date: fallbackDate || toIsoDate(dateMatch?.[1]), rate };
}

function toIsoDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
    const [month, day, year] = value.split("/");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const [day, month, year] = value.split(".");
  return `${year}-${month}-${day}`;
}

function splitSymbols(rawSymbols = "") {
  return rawSymbols
    .split(",")
    .map(normalizeMarketSymbol)
    .filter(Boolean);
}

function normalizeMarketSymbol(symbol) {
  const clean = String(symbol || "").trim().toUpperCase().replace(/Ä°/g, "I").replace(/Ã„Â°/g, "I");
  if (clean === "ALTIN" || clean === "ALTIN.S1" || clean === "ALTINS1.IS") return "ALTINS1";
  if (clean === "DMLKT" || clean === "DMLKT.G" || clean === "DMLKTG" || clean === "DMLKTG.IS" || clean === "DMLKT.IS") return "DMLKT";
  if (clean === "GLDR" || clean === "GLDR.F" || clean === "GLDR.IS" || clean === "GLDTR.F") return "GLDTR.IS";
  if (clean === "RTLAB" || clean === "RTLAB.IS") return "RTALB.IS";
  return clean;
}

function toWorkerYahooTrSymbol(symbol) {
  const clean = normalizeMarketSymbol(symbol);
  if (!clean || clean.includes(".F") || clean.includes(".G")) return "";
  if (clean === "ALTINS1") return "ALTINS1";
  // BTC in the TR portfolio is crypto priced via BTC-TRY derivation — it has
  // no BIST listing and no corporate actions to scan.
  if (clean === "BTC" || clean === "BTC-TRY") return "";
  return clean.endsWith(".IS") ? clean : `${clean}.IS`;
}

async function fetchPrice(symbol) {
  const loaders = [fetchDovizAltins1Price, fetchBorsaNetAltins1Price, fetchInvestingPrice, fetchYahooApiPrice, fetchYahooPagePrice, fetchStooqPrice];

  for (const loader of loaders) {
    try {
      const price = await loader(symbol);
      if (Number.isFinite(price) && price > 0) return price;
    } catch {}
  }

  return null;
}

async function fetchDovizAltins1Price(symbol) {
  if (!isAltins1Symbol(symbol)) throw new Error("ALTINS1 Doviz.com price skipped");
  const candles = await fetchDovizAltins1Candles(isoDaysAgo(14));
  const latest = candles[candles.length - 1];
  const price = Number(latest?.close);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Doviz.com ALTINS1 price parse failed");
  return price;
}

async function fetchBorsaNetAltins1Price(symbol) {
  const clean = String(symbol || "").trim().toUpperCase();
  if (clean !== "ALTINS1" && clean !== "ALTINS1.IS" && clean !== "ALTIN") {
    throw new Error("ALTINS1 fallback skipped");
  }
  const response = await fetch("https://www.borsa.net/hisse/altins1", {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new Error("Borsa.net failed");
  const html = await response.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = text.match(/DARPHANE\s+ALTIN\s+SERTIFIKASI\s+ALTINS1\s+(\d{1,3}(?:[.,]\d{1,4})?)\s*â‚º/i);
  const value = parseTrNumber(match?.[1]);
  if (!Number.isFinite(value) || value <= 0 || value > 1000) {
    throw new Error("Borsa.net ALTINS1 parse failed");
  }
  return value;
}

async function fetchInvestingPrice(symbol) {
  if (normalizeMarketSymbol(symbol) !== "DMLKT") throw new Error("Investing price skipped");
  const candles = await fetchDmlktCandles("2025-01-01");
  const latest = candles[candles.length - 1];
  const price = Number(latest?.close);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Investing price parse failed");
  return price;
}

function parseTrNumber(value) {
  if (value == null) return NaN;
  const raw = String(value).trim();
  if (!raw) return NaN;
  if (raw.includes(",") && raw.includes(".")) return Number(raw.replace(/\./g, "").replace(",", "."));
  if (raw.includes(",")) return Number(raw.replace(",", "."));
  return Number(raw);
}

async function fetchYahooApiPrice(symbol) {
  // Yahoo's "ALTINS1" listing is a different instrument (returns ~60k TL
  // instead of the real ~80 TL per-gram price). Doviz.com + Borsa.net are
  // the canonical sources; if both fail we'd rather have no value than a
  // wrong one polluting cache.
  if (isAltins1Symbol(symbol)) throw new Error("Yahoo not trusted for ALTINS1");
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const response = await fetch(target, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new Error("Yahoo API failed");
  const payload = await response.json();
  return Number(payload?.chart?.result?.[0]?.meta?.regularMarketPrice);
}

async function fetchYahooPagePrice(symbol) {
  if (isAltins1Symbol(symbol)) throw new Error("Yahoo not trusted for ALTINS1");
  const target = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
  const response = await fetch(target, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new Error("Yahoo page failed");
  const html = await response.text();
  const match = html.match(/"regularMarketPrice"\s*:\s*\{"raw"\s*:\s*([\d.]+)/);
  return Number(match?.[1]);
}

async function fetchStooqPrice(symbol) {
  if (isAltins1Symbol(symbol)) throw new Error("Stooq not trusted for ALTINS1");
  const target = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol.toLowerCase() + ".us")}&i=d`;
  const response = await fetch(target, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new Error("Stooq failed");
  const text = await response.text();
  const line = text.trim().split(/\r?\n/).pop();
  const parts = line.split(",");
  return Number(parts[6]);
}

async function fetchMonthlyCandles(symbol) {
  if (isAltins1Symbol(symbol)) {
    const daily = await fetchAltins1Candles();
    const monthly = aggregateMonthlyCandles(daily).slice(-12);
    return monthly;
  }
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=2y`;
  const response = await fetch(target, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) return [];
  const payload = await response.json();
  return extractCandles(payload).slice(-12);
}

async function fetchDailyCandles(symbol) {
  if (isAltins1Symbol(symbol)) {
    return (await fetchAltins1Candles()).slice(-30);
  }
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;
  const response = await fetch(target, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) return [];
  const payload = await response.json();
  return extractCandles(payload).slice(-30);
}

async function fetchHistoricalDailyCandles(symbol, startDate) {
  if (isAltins1Symbol(symbol)) {
    const candles = await fetchAltins1Candles(startDate);
    return candles.filter((candle) => {
      const date = new Date(candle.time * 1000).toISOString().slice(0, 10);
      return date >= startDate;
    });
  }
  if (normalizeMarketSymbol(symbol) === "INFQ") {
    return fetchInfqHistoricalCandles(startDate);
  }
  if (normalizeMarketSymbol(symbol) === "DMLKT") {
    return fetchDmlktCandles(startDate);
  }
  const start = Math.floor(Date.parse(`${startDate}T00:00:00Z`) / 1000);
  const end = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(start) || start <= 0) return [];
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${start}&period2=${end}`;
  const response = await fetch(target, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null);
  return extractCandles(payload);
}

async function fetchInfqHistoricalCandles(startDate) {
  const mergerDate = "2026-02-17";
  const [legacy, current] = await Promise.all([
    fetchYahooHistoricalDailyCandles("CCCX", startDate).catch(() => []),
    fetchYahooHistoricalDailyCandles("INFQ", startDate).catch(() => []),
  ]);
  const merged = [
    ...builtInCccxCandles().filter((candle) => toCandleDate(candle) >= startDate && toCandleDate(candle) < mergerDate),
    ...legacy.filter((candle) => toCandleDate(candle) < mergerDate),
    ...current.filter((candle) => toCandleDate(candle) >= mergerDate),
  ];
  if (merged.length) return uniqueSortedCandles(merged);
  return fetchYahooHistoricalDailyCandles("INFQ", startDate);
}

const CCCX_HISTORY = "2025-10-03:14.45|2025-10-06:15.99|2025-10-07:18.23|2025-10-08:19.29|2025-10-09:21.59|2025-10-10:22.41|2025-10-13:25.95|2025-10-14:24.33|2025-10-15:22.90|2025-10-16:19.74|2025-10-17:21.10|2025-10-20:21.50|2025-10-21:18.61|2025-10-22:16.98|2025-10-23:19.58|2025-10-24:20.49|2025-10-27:21.34|2025-10-28:20.33|2025-10-29:19.48|2025-10-30:17.86|2025-10-31:19.26|2025-11-03:17.37|2025-11-04:15.51|2025-11-05:18.47|2025-11-06:17.72|2025-11-13:16.06";

function builtInCccxCandles() {
  return builtInHistoryCandles(CCCX_HISTORY);
}

async function fetchDmlktCandles(startDate) {
  const seeded = builtInDmlktCandles().filter((candle) => toCandleDate(candle) >= startDate);
  const live = await fetchInvestingSymbolCandles("DMLKT", startDate).catch(() => []);
  return uniqueSortedCandles([...seeded, ...live]);
}

async function fetchYahooHistoricalDailyCandles(symbol, startDate) {
  const start = Math.floor(Date.parse(`${startDate}T00:00:00Z`) / 1000);
  const end = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(start) || start <= 0) return [];
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${start}&period2=${end}`;
  const response = await fetch(target, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null);
  return extractCandles(payload);
}

function isAltins1Symbol(symbol) {
  const clean = String(symbol || "").trim().toUpperCase();
  return clean === "ALTIN" || clean === "ALTIN.S1" || clean === "ALTINS1" || clean === "ALTINS1.IS";
}

async function fetchAltins1Candles(startDate = "2023-01-01") {
  const seeded = builtInAltins1Candles();
  if (seeded.length && toCandleDate(seeded[seeded.length - 1]) >= startDate) return seeded;

  const errors = [];
  const sources = [
    ["Doviz.com", () => fetchDovizAltins1Candles(startDate)],
    ["Hisse.net", () => fetchHisseNetAltins1Candles()],
    ["Investing", () => fetchInvestingAltinCandles()],
  ];

  for (const [name, loader] of sources) {
    try {
      const candles = uniqueSortedCandles(await loader());
      if (candles.length && !historyNeedsRefresh(candles, startDate)) return candles;
      if (candles.length) errors.push(`${name}: starts at ${toCandleDate(candles[0])}`);
      else errors.push(`${name}: no candles`);
    } catch (error) {
      errors.push(`${name}: ${error?.message || "failed"}`);
    }
  }

  throw new Error(errors.join("; "));
}

function builtInAltins1Candles() {
  return builtInHistoryCandles(ALTINS1_DOVIZ_HISTORY);
}

function builtInDmlktCandles() {
  return builtInHistoryCandles(DMLKT_HISTORY);
}

function builtInHistoryCandles(historyText) {
  return String(historyText || "").split("|")
    .map((entry) => {
      const [date, rawPrice] = entry.split(":");
      const close = Number(rawPrice);
      if (!date || !Number.isFinite(close) || close <= 0) return null;
      return {
        time: Math.floor(Date.parse(`${date}T12:00:00Z`) / 1000),
        open: close,
        high: close,
        low: close,
        close,
      };
    })
    .filter(Boolean);
}

async function fetchDovizAltins1Candles(startDate = "2023-01-01") {
  const start = Math.floor(Date.parse(`${startDate}T00:00:00Z`) / 1000);
  const end = Math.floor((Date.now() + 86400000) / 1000);
  if (!Number.isFinite(start) || start <= 0) return [];
  const token = await fetchDovizApiToken();
  if (!token) throw new Error("Doviz.com ALTINS1 archive skipped: no API token");
  const endDate = todayIso();
  const slugs = [
    "altins1-darphane-altin-sertifikasi",
    "ALTINS1",
    "altins1",
  ];
  const errors = [];

  for (const slug of slugs) {
    for (const url of dovizAltins1ArchiveUrls(slug, start, end, startDate, endDate)) {
      try {
        const response = await fetch(url, {
          headers: {
            accept: "application/json,text/plain,*/*",
            authorization: `Bearer ${token}`,
            origin: "https://borsa.doviz.com",
            referer: "https://borsa.doviz.com/hisseler/altins1-darphane-altin-sertifikasi/tarihsel-veri",
            "user-agent": "Mozilla/5.0",
            "x-requested-with": "XMLHttpRequest",
          },
          cf: { cacheTtl: 0, cacheEverything: false },
        });
        if (!response.ok) {
          errors.push(`${slug}: ${response.status}`);
          continue;
        }
        const payload = await response.json().catch(() => null);
        const archive = extractDovizArchive(payload);
        const candles = uniqueSortedCandles(archive.map(dovizArchiveItemToCandle).filter(Boolean));
        if (candles.length && !historyNeedsRefresh(candles, startDate)) return candles;
        if (candles.length) {
          errors.push(`${slug}: archive starts at ${toCandleDate(candles[0])} (${describeJsonShape(payload)})`);
        } else {
          errors.push(`${slug}: empty archive (${describeJsonShape(payload)})`);
        }
      } catch (error) {
        errors.push(`${slug}: ${error?.message || "failed"}`);
      }
    }
  }

  throw new Error(`Doviz.com ALTINS1 archive failed (${errors.join("; ")})`);
}

function dovizAltins1ArchiveUrls(slug, start, end, startDate, endDate) {
  const encoded = encodeURIComponent(slug);
  const base = `https://api.doviz.com/api/v12/assets/${encoded}`;
  return [
    `${base}/archive?start=${start}&end=${end}`,
    `${base}/archive?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`,
    `${base}/archive?from=${start}&to=${end}`,
    `${base}/archive?from_date=${encodeURIComponent(startDate)}&to_date=${encodeURIComponent(endDate)}`,
    `${base}/historical?start=${start}&end=${end}`,
    `${base}/historical?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`,
  ];
}

function extractDovizArchive(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.archive)) return payload.archive;
  if (Array.isArray(payload?.data?.archive)) return payload.data.archive;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.result?.archive)) return payload.result.archive;
  if (Array.isArray(payload?.result?.data)) return payload.result.data;
  return [];
}

function describeJsonShape(value) {
  if (value == null) return "null";
  if (Array.isArray(value)) return `array:${value.length}`;
  if (typeof value !== "object") return typeof value;
  return Object.keys(value).slice(0, 8).join(",") || "empty object";
}

// Scrape doviz.com's public front-end for its short-lived API bearer token.
// Returns null when the token can't be found; callers treat Doviz.com as just
// one of several price sources and fall back to the others.
async function fetchDovizApiToken() {
  try {
    const response = await fetch("https://www.doviz.com/", {
      headers: { "user-agent": "Mozilla/5.0" },
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    if (!response.ok) return null;
    const html = await response.text();
    const match = html.match(/token["']?\s*:\s*["']([a-f0-9]{64})["']/i)
      || html.match(/Bearer\s+([a-f0-9]{64})/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

function dovizArchiveItemToCandle(item) {
  const date = dovizArchiveItemDate(item);
  const close = Number(item?.close ?? item?.value ?? item?.price ?? item?.last ?? item?.latest);
  if (!date || !Number.isFinite(close) || close <= 0) return null;
  const open = Number(item?.open);
  const high = Number(item?.highest ?? item?.high ?? item?.max);
  const low = Number(item?.lowest ?? item?.low ?? item?.min);
  return {
    time: Math.floor(Date.parse(`${date}T12:00:00Z`) / 1000),
    open: Number.isFinite(open) && open > 0 ? open : close,
    high: Number.isFinite(high) && high > 0 ? high : close,
    low: Number.isFinite(low) && low > 0 ? low : close,
    close,
  };
}

function dovizArchiveItemDate(item) {
  const raw = item?.update_date ?? item?.date ?? item?.created_at ?? item?.time ?? item?.timestamp;
  if (raw == null) return "";
  if (typeof raw === "number") {
    const ms = raw > 100000000000 ? raw : raw * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(String(raw))) return String(raw).slice(0, 10);
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    const ms = numeric > 100000000000 ? numeric : numeric * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return "";
}

async function fetchHisseNetAltins1Candles() {
  const urls = [
    "https://www.hisse.net/borsa/hisseler/altins1-darphane-altin-sertifikasi/tarihselveriler",
    "https://www.hisse.net/borsa/hisseler/altins1-darphane-altin-sertifikasibilanco/tarihselveriler",
  ];

  for (const url of urls) {
    const response = await fetch(url, {
      headers: {
        "accept-language": "tr-TR,tr;q=0.9,en;q=0.7",
        "user-agent": "Mozilla/5.0",
      },
    });
    if (!response.ok) continue;
    const html = await response.text();
    const candles = parseHisseNetHistoricalCandles(html);
    if (candles.length) return candles;
  }

  return [];
}

function parseHisseNetHistoricalCandles(html) {
  const rows = [...String(html || "").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const candles = [];

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => decodeHtml(cell[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()));
    const candle = parseHisseNetHistoricalCells(cells);
    if (candle) candles.push(candle);
  }

  if (!candles.length) {
    const text = htmlToPlainText(html);
    const linePattern = /(\d{1,2}\s+[A-Za-z\u00c7\u011e\u0130\u00d6\u015e\u00dc\u00e7\u011f\u0131\u00f6\u015f\u00fc]+\s+\d{4})\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)/g;
    for (const match of text.matchAll(linePattern)) {
      const candle = parseHisseNetHistoricalCells([match[1], match[2], match[3], match[4]]);
      if (candle) candles.push(candle);
    }
  }

  return candles
    .sort((left, right) => left.time - right.time)
    .filter((item, index, list) => index === 0 || item.time !== list[index - 1].time);
}

function parseHisseNetHistoricalCells(cells) {
  if (!Array.isArray(cells) || cells.length < 4) return null;
  const date = parseTurkishLongDate(cells[0]);
  const close = parseTrNumber(cells[1]);
  const low = parseTrNumber(cells[2]);
  const high = parseTrNumber(cells[3]);
  if (!date || ![close, low, high].every(Number.isFinite)) return null;
  return {
    time: Math.floor(Date.parse(`${date}T12:00:00Z`) / 1000),
    open: close,
    high,
    low,
    close,
  };
}

function htmlToPlainText(html) {
  return decodeHtml(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function parseTurkishLongDate(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})\s+([A-Za-z\u00c7\u011e\u0130\u00d6\u015e\u00dc\u00e7\u011f\u0131\u00f6\u015f\u00fc]+)\s+(\d{4})$/);
  if (!match) return parseInvestingDate(value);
  const monthName = normalizeTurkishToken(match[2]);
  const months = {
    ocak: "01", oca: "01", jan: "01",
    subat: "02", sub: "02", feb: "02",
    mart: "03", mar: "03",
    nisan: "04", nis: "04", apr: "04",
    mayis: "05", may: "05",
    haziran: "06", haz: "06", jun: "06",
    temmuz: "07", tem: "07", jul: "07",
    agustos: "08", agu: "08", aug: "08",
    eylul: "09", eyl: "09", sep: "09",
    ekim: "10", eki: "10", oct: "10",
    kasim: "11", kas: "11", nov: "11",
    aralik: "12", ara: "12", dec: "12",
  };
  const month = months[monthName] || months[monthName.slice(0, 3)];
  return month ? `${match[3]}-${month}-${match[1].padStart(2, "0")}` : "";
}

function normalizeTurkishToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\u0131/g, "i")
    .replace(/\u00e7/g, "c")
    .replace(/\u011f/g, "g")
    .replace(/\u00f6/g, "o")
    .replace(/\u015f/g, "s")
    .replace(/\u00fc/g, "u")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function fetchInvestingAltinCandles() {
  const apiCandles = await fetchInvestingAltinChartCandles();
  if (apiCandles.length >= 60) return apiCandles;

  const response = await fetch("https://tr.investing.com/equities/turkiye-cumhuriyeti-hazine-ve-historical-data", {
    headers: {
      "accept-language": "tr-TR,tr;q=0.9,en;q=0.7",
      "cookie": "smd=3; pair_date_filter=last_year",
      "referer": "https://tr.investing.com/equities/turkiye-cumhuriyeti-hazine-ve-historical-data",
      "user-agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) return [];
  const html = await response.text();
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const candles = [];

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => decodeHtml(cell[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()));
    if (cells.length < 5) continue;
    const date = parseInvestingDate(cells[0]);
    const close = parseTrNumber(cells[1]);
    const open = parseTrNumber(cells[2]);
    const high = parseTrNumber(cells[3]);
    const low = parseTrNumber(cells[4]);
    if (!date || ![open, high, low, close].every(Number.isFinite)) continue;
    candles.push({
      time: Math.floor(Date.parse(`${date}T12:00:00Z`) / 1000),
      open,
      high,
      low,
      close,
    });
  }

  return candles
    .sort((left, right) => left.time - right.time)
    .filter((item, index, list) => index === 0 || item.time !== list[index - 1].time);
}

function uniqueSortedCandles(candles) {
  return candles
    .filter((item) => Number.isFinite(item?.time) && [item.open, item.high, item.low, item.close].every(Number.isFinite))
    .sort((left, right) => left.time - right.time)
    .filter((item, index, list) => index === 0 || item.time !== list[index - 1].time);
}

async function fetchInvestingAltinChartCandles() {
  const pairId = await fetchInvestingAltinPairId();
  if (!pairId) return [];
  const url = `https://api.investing.com/api/financialdata/${encodeURIComponent(pairId)}/historical/chart?period=P5Y&interval=P1D&pointscount=1500`;
  const response = await fetch(url, {
    headers: {
      "accept": "application/json,text/plain,*/*",
      "domain-id": "tr",
      "origin": "https://tr.investing.com",
      "referer": "https://tr.investing.com/",
      "user-agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null);
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return rows
    .map((item) => {
      const time = Number(item.date || item.time || item.timestamp);
      const open = Number(item.price_open ?? item.open);
      const high = Number(item.price_high ?? item.high);
      const low = Number(item.price_low ?? item.low);
      const close = Number(item.price_close ?? item.close ?? item.value);
      return {
        time: time > 100000000000 ? Math.floor(time / 1000) : time,
        open,
        high,
        low,
        close,
      };
    })
    .filter((item) => Number.isFinite(item.time) && [item.open, item.high, item.low, item.close].every(Number.isFinite))
    .sort((left, right) => left.time - right.time);
}

async function fetchInvestingSymbolCandles(symbol, startDate = "2020-01-01") {
  const pairId = await fetchInvestingPairId(symbol);
  if (!pairId) return [];
  const url = `https://api.investing.com/api/financialdata/${encodeURIComponent(pairId)}/historical/chart?period=P5Y&interval=P1D&pointscount=1500`;
  const response = await fetch(url, {
    headers: {
      "accept": "application/json,text/plain,*/*",
      "domain-id": "www",
      "origin": "https://www.investing.com",
      "referer": "https://www.investing.com/",
      "user-agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null);
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return rows
    .map(investingChartItemToCandle)
    .filter(Boolean)
    .filter((item) => toCandleDate(item) >= startDate)
    .sort((left, right) => left.time - right.time);
}

function investingChartItemToCandle(item) {
  const time = Number(item?.date || item?.time || item?.timestamp);
  const open = Number(item?.price_open ?? item?.open ?? item?.price);
  const high = Number(item?.price_high ?? item?.high ?? item?.price);
  const low = Number(item?.price_low ?? item?.low ?? item?.price);
  const close = Number(item?.price_close ?? item?.close ?? item?.value ?? item?.price);
  const normalizedTime = time > 100000000000 ? Math.floor(time / 1000) : time;
  if (!Number.isFinite(normalizedTime) || ![open, high, low, close].every(Number.isFinite)) return null;
  return { time: normalizedTime, open, high, low, close };
}

async function fetchInvestingPairId(symbol) {
  const clean = String(symbol || "").trim().toUpperCase();
  const response = await fetch("https://www.investing.com/search/service/searchTopBar", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Mozilla/5.0",
      "x-requested-with": "XMLHttpRequest",
    },
    body: `search_text=${encodeURIComponent(clean)}`,
  });
  if (!response.ok) return "";
  const payload = await response.json().catch(() => null);
  const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];
  const match = quotes.find((item) => String(item.symbol || "").toUpperCase() === clean)
    || quotes.find((item) => String(item.symbol || "").toUpperCase().includes(clean));
  return match?.pairId ? String(match.pairId) : "";
}

async function fetchInvestingAltinPairId() {
  const response = await fetch("https://www.investing.com/search/service/searchTopBar", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Mozilla/5.0",
      "x-requested-with": "XMLHttpRequest",
    },
    body: "search_text=ALTIN",
  });
  if (!response.ok) return "";
  const payload = await response.json().catch(() => null);
  const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];
  const match = quotes.find((item) =>
    String(item.symbol || "").toUpperCase() === "ALTIN" &&
    String(item.description || "").toLowerCase().includes("darphane")
  ) || quotes.find((item) => String(item.symbol || "").toUpperCase() === "ALTIN");
  return match?.pairId ? String(match.pairId) : "";
}

function aggregateMonthlyCandles(dailyCandles) {
  const buckets = new Map();
  for (const candle of dailyCandles) {
    const date = new Date(candle.time * 1000);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!buckets.has(key)) {
      buckets.set(key, { ...candle });
      continue;
    }
    const bucket = buckets.get(key);
    bucket.high = Math.max(bucket.high, candle.high);
    bucket.low = Math.min(bucket.low, candle.low);
    bucket.close = candle.close;
    bucket.time = candle.time;
  }
  return [...buckets.values()].sort((left, right) => left.time - right.time);
}

function parseInvestingDate(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
  if (!match) return "";
  const months = {
    "Oca": "01", "Ocak": "01", "Jan": "01",
    "Sub": "02", "Subat": "02", "Feb": "02",
    "Mar": "03", "Mart": "03",
    "Nis": "04", "Nisan": "04", "Apr": "04",
    "May": "05", "Mayis": "05",
    "Haz": "06", "Haziran": "06", "Jun": "06",
    "Tem": "07", "Temmuz": "07", "Jul": "07",
    "Agu": "08", "Agustos": "08", "Aug": "08",
    "Eyl": "09", "Eylul": "09", "Sep": "09",
    "Eki": "10", "Ekim": "10", "Oct": "10",
    "Kas": "11", "Kasim": "11", "Nov": "11",
    "Ara": "12", "Aralik": "12", "Dec": "12",
  };
  const [, day, monthName, year] = match;
  const month = months[monthName] || months[monthName.slice(0, 3)];
  return month ? `${year}-${month}-${day.padStart(2, "0")}` : "";
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
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

function extractCandles(payload) {
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp || [];
  if (!quote || !timestamps.length) return [];

  return timestamps
    .map((timestamp, index) => ({
      time: timestamp,
      open: Number(quote.open?.[index]),
      high: Number(quote.high?.[index]),
      low: Number(quote.low?.[index]),
      close: Number(quote.close?.[index]),
    }))
    .filter(
      (item) =>
        Number.isFinite(item.open) &&
        Number.isFinite(item.high) &&
        Number.isFinite(item.low) &&
        Number.isFinite(item.close)
    );
}

