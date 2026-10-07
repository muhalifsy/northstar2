import { corsHeaders, json } from "./worker/http.js";
import { handleRegister, handleLogin, handleLogout, handleSession, handleAdminListUsers, handleAdminSetUserStatus } from "./worker/auth.js";
import { ensureCryptoPortfolioDb } from "./worker/db.js";
import { handleGetPortfolio, handlePutPortfolio, handleGetSettings, handlePutSettings, handleGetCalculatedCache, handlePutCalculatedCache, handleGetCryptoPortfolio, handleCryptoPortfolioStatus, handlePutCryptoPortfolio, handleGetTrPortfolio, handlePutTrPortfolio, handleGetCashFlow, handleCashFlowStatus, handlePutCashFlow } from "./worker/portfolio.js";
import { handleQuotes } from "./worker/market/quotes.js";
import { handleCandles, handleHistory } from "./worker/market/candles.js";
import { stepCandleYears, handleCandleYearsStatus } from "./worker/market/candle-years.js";
import { refreshCryptoHistoryTails, handleCryptoQuotes, refreshAllCryptoPrices } from "./worker/market/crypto.js";
import { handleSplits, scanAllPortfolioSplits } from "./worker/market/splits.js";
import { handleGs3m, handleRates, handleYields, getGs3mCurve, getTryDepositCurve } from "./worker/market/rates.js";

const SPLIT_SCAN_CRON = "0 6 * * *";

// Hourly (:15): crypto prices (bulk) + a rotating slice of crypto candle
// tails, then a few symbols' candle year rows built or re-checked; once a day
// (06 UTC) also the TL deposit and USD GS3M curves.
// Sequential so the whole run stays well inside one invocation's budget.
async function runHourlyMarketRefresh(env) {
  await refreshAllCryptoPrices(env).catch(() => {});
  await refreshHeldCryptoHistoryTails(env).catch(() => {});
  await stepCandleYears(env).catch(() => {});
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

      if (url.pathname === "/api/candle-years/status" && request.method === "GET") {
        return handleCandleYearsStatus(request, env);
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
