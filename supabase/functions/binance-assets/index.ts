import { isTrustedJobCaller, schedulerSecretLookup } from "../_shared/require-scheduler.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccountUnavailableError, accountIdFromPayload, resolveAccount } from "../_shared/binance-account.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { assertTerminalWriteAllowed } from "../_shared/terminalDeviceMode.ts";
import { permissionSet, supabaseAccessDeps } from "../_shared/binance-access.ts";
import { gateAssetsRequest } from "./accessGate.ts";
import { checkOrder, computeFundingShortfall, fromUnits, rulesFromExchangeInfo, toUnits, type SymbolRules } from "./tradeRules.ts";

const BINANCE_BASE = "https://api.binance.com";

/** Money-moving asset actions — blocked on personal (view-only) devices. */
const MUTATING_ASSET_ACTIONS = new Set<string>([
  "executeTradeWithTransfer",
]);

// ===== Live Binance trading rules (public exchangeInfo), cached ~1 hour per instance =====
const RULES_TTL_MS = 60 * 60 * 1000;
const rulesCache = new Map<string, { at: number; rules: SymbolRules }>();

async function getSymbolRules(symbols: string[], force = false): Promise<Record<string, SymbolRules>> {
  const want = [...new Set(symbols.map((s) => String(s).toUpperCase()).filter((s) => /^[A-Z0-9]{2,20}$/.test(s)))];
  const out: Record<string, SymbolRules> = {};
  const missing: string[] = [];
  for (const sym of want) {
    const c = rulesCache.get(sym);
    if (!force && c && Date.now() - c.at < RULES_TTL_MS) out[sym] = c.rules;
    else missing.push(sym);
  }
  if (missing.length) {
    const url = `${BINANCE_BASE}/api/v3/exchangeInfo?symbols=${encodeURIComponent(JSON.stringify(missing))}`;
    let res = await fetchWithRetry(url, { method: "GET" });
    let body: any = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(body?.symbols)) {
      // One unknown symbol makes Binance reject the whole list — fetch one by one.
      body = { symbols: [] };
      for (const sym of missing) {
        res = await fetchWithRetry(`${BINANCE_BASE}/api/v3/exchangeInfo?symbol=${sym}`, { method: "GET" });
        const one: any = await res.json().catch(() => null);
        if (res.ok && Array.isArray(one?.symbols)) body.symbols.push(...one.symbols);
      }
    }
    for (const raw of body.symbols) {
      const r = rulesFromExchangeInfo(raw);
      rulesCache.set(r.symbol, { at: Date.now(), rules: r });
      out[r.symbol] = r;
    }
  }
  return out;
}

// Full public price list, cached briefly so many screens share one Binance call.
let tickerCache: { at: number; list: { symbol: string; price: string }[] } | null = null;
async function getAllTickerPrices(): Promise<{ symbol: string; price: string }[]> {
  if (tickerCache && Date.now() - tickerCache.at < 5000) return tickerCache.list;
  const res = await fetchWithRetry(`${BINANCE_BASE}/api/v3/ticker/price`, { method: "GET", headers: { "Content-Type": "application/json" } });
  const list = await res.json();
  if (Array.isArray(list)) tickerCache = { at: Date.now(), list };
  return Array.isArray(list) ? list : [];
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2,
  delayMs = 500
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (err) {
      lastError = err as Error;
      const msg = (err as Error).message || "";
      if (
        msg.includes("connection closed") ||
        msg.includes("ConnectionReset") ||
        msg.includes("SendRequest") ||
        msg.includes("ECONNRESET")
      ) {
        console.warn(`fetchWithRetry: attempt ${attempt + 1} failed (${msg}), retrying...`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError;
}

function isBinancePayMovement(movement: any): boolean {
  if (!movement) return false;
  const movementId = String(movement.id || "");
  const network = String(movement.network || "").toLowerCase();
  const raw = movement.raw_data || {};

  return (
    movementId.startsWith("pay-") ||
    network.includes("binance pay") ||
    Boolean(raw?.orderId && raw?.transactionTime && (raw?.payerInfo || raw?.receiverInfo))
  );
}

function isQueueEligibleMovement(movement: any, p2pOrderIds?: Set<string>): boolean {
  if (!movement) return false;

  if (isBinancePayMovement(movement)) {
    const payOrderId = String(movement.tx_id || movement.raw_data?.orderId || "");
    if (p2pOrderIds && payOrderId) {
      if (p2pOrderIds.has(payOrderId)) return false;
    }
  }

  const movementType = String(movement.movement_type || "").toLowerCase();
  const status = String(movement.status ?? "");

  const isCompletedDeposit = movementType === "deposit" && (status === "1" || status === "6");
  const isCompletedWithdrawal = movementType === "withdrawal" && status === "6";

  return isCompletedDeposit || isCompletedWithdrawal;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...payload } = await req.json();
    console.info(`binance-assets: action=${action}`);

    // === AM-SEC-5 (AS-SEC-1/2): signed-in staff or the service role only ===
    {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const gateAdmin = createClient(supabaseUrl, serviceRoleKey);
      // Scheduler secret is trusted only for the read-only balance read.
      const schedulerRead = action === "getBalances" &&
        await isTrustedJobCaller(req, undefined, schedulerSecretLookup(gateAdmin));
      const gate = schedulerRead ? { ok: true as const, kind: "service" as const, userId: null } : await gateAssetsRequest({
        serviceRoleKey,
        async userIdFromToken(token) {
          const c = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
          const { data, error } = await c.auth.getClaims(token);
          if (error || !data?.claims?.sub || data.claims.role !== "authenticated") return null;
          return String(data.claims.sub);
        },
        async permissions(uid) {
          const { data, error } = await gateAdmin.rpc("get_terminal_permissions", { p_user_id: uid });
          if (error) throw new Error(error.message);
          return permissionSet(data);
        },
        access: supabaseAccessDeps(gateAdmin),
      }, req.headers.get("Authorization"), String(action), payload);
      if (!gate.ok) {
        if (gate.status !== 401) console.warn(`binance-assets denied: action=${action} code=${gate.body.code}`);
        return new Response(JSON.stringify(gate.body), {
          status: gate.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Personal (view-only) device guard for trading.
      if (gate.kind === "user" && MUTATING_ASSET_ACTIONS.has(action)) {
        await assertTerminalWriteAllowed(gateAdmin, gate.userId, `binance-assets:${action}`);
      }
    }

    // AM-SEC-5c: an explicit account id must resolve to that very account —
    // never fall back to the default account on a lookup error or unknown id,
    // or balances/trades would be read from (and billed to) another account.
    const reqAcctId = accountIdFromPayload(payload);
    let acct;
    try { acct = await resolveAccount(reqAcctId, { strict: !!reqAcctId }); }
    catch (e) {
      if (e instanceof AccountUnavailableError) {
        return new Response(JSON.stringify({ success: false, error: e.message, code: e.code }), {
          status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw e;
    }
    const EXCHANGE_ACCOUNT_ID = acct.id;
    // Account-prefix for movement IDs. Keep the primary ("default") account's IDs
    // unprefixed for backward compatibility; prefix additional accounts to avoid
    // cross-account ID collisions in asset_movement_history / erp_action_queue.
    const ID_PFX = acct.credentialKey === "default" ? "" : `${acct.credentialKey}-`;
    const BINANCE_PROXY_URL = acct.proxyUrl;
    const BINANCE_API_KEY = acct.apiKey;
    const BINANCE_API_SECRET = acct.apiSecret;
    const BINANCE_PROXY_TOKEN = acct.proxyToken;

    if (!BINANCE_PROXY_URL || !BINANCE_API_KEY || !BINANCE_API_SECRET || !BINANCE_PROXY_TOKEN) {
      throw new Error("Missing Binance configuration secrets");
    }

    const proxyHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-proxy-token": BINANCE_PROXY_TOKEN,
      "x-api-key": BINANCE_API_KEY,
      "x-api-secret": BINANCE_API_SECRET,
      "clientType": "web",
    };

    async function proxyCall(path: string, params: Record<string, string> = {}): Promise<any> {
      const qs = new URLSearchParams(params).toString();
      const url = qs
        ? `${BINANCE_PROXY_URL}/api${path}?${qs}`
        : `${BINANCE_PROXY_URL}/api${path}`;
      const res = await fetchWithRetry(url, {
        method: "POST",
        headers: proxyHeaders,
      });
      const text = await res.text();
      if (!res.ok) console.error(`proxyCall ${path} failed: ${res.status}`);
      try {
        return JSON.parse(text);
      } catch {
        return { error: text };
      }
    }

    async function proxyGet(path: string, params: Record<string, string> = {}): Promise<any> {
      const qs = new URLSearchParams(params).toString();
      const url = qs
        ? `${BINANCE_PROXY_URL}/api${path}?${qs}`
        : `${BINANCE_PROXY_URL}/api${path}`;
      const res = await fetchWithRetry(url, {
        method: "GET",
        headers: proxyHeaders,
      });
      const text = await res.text();
      if (!res.ok) console.error(`proxyGet ${path} failed: ${res.status}`);
      try {
        return JSON.parse(text);
      } catch {
        return { error: text };
      }
    }

    let result: any;

    switch (action) {
      // ===== GET ALL BALANCES (Funding + Spot) =====
      case "getBalances": {
        const fundingData = await proxyCall("/sapi/v1/asset/get-funding-asset");
        const fundingList = Array.isArray(fundingData) ? fundingData : [];

        let spotData: any = {};
        try {
          const spotUrl = `${BINANCE_PROXY_URL}/api/api/v3/account`;
          const spotRes = await fetchWithRetry(spotUrl, {
            method: "GET",
            headers: proxyHeaders,
          });
          const spotText = await spotRes.text();
          spotData = JSON.parse(spotText);
        } catch (e) {
          console.error("Spot account fetch failed:", (e as Error).message);
        }

        const spotBalances: any[] = spotData?.balances || [];
        const assetMap = new Map<string, { asset: string; funding_free: number; funding_locked: number; funding_freeze: number; spot_free: number; spot_locked: number }>();

        for (const item of fundingList) {
          const asset = item.asset;
          const existing = assetMap.get(asset) || { asset, funding_free: 0, funding_locked: 0, funding_freeze: 0, spot_free: 0, spot_locked: 0 };
          existing.funding_free = parseFloat(item.free || "0");
          existing.funding_locked = parseFloat(item.locked || "0");
          existing.funding_freeze = parseFloat(item.freeze || "0");
          assetMap.set(asset, existing);
        }

        for (const item of spotBalances) {
          const asset = item.asset;
          const free = parseFloat(item.free || "0");
          const locked = parseFloat(item.locked || "0");
          if (free === 0 && locked === 0) continue;
          const existing = assetMap.get(asset) || { asset, funding_free: 0, funding_locked: 0, funding_freeze: 0, spot_free: 0, spot_locked: 0 };
          existing.spot_free = free;
          existing.spot_locked = locked;
          assetMap.set(asset, existing);
        }

        const balances = Array.from(assetMap.values())
          .map((b) => ({
            ...b,
            total_free: b.funding_free + b.spot_free,
            total_locked: b.funding_locked + b.spot_locked + b.funding_freeze,
            total_balance: b.funding_free + b.funding_locked + b.funding_freeze + b.spot_free + b.spot_locked,
          }))
          .filter((b) => b.total_balance > 0)
          .sort((a, b) => b.total_balance - a.total_balance);

        result = { balances, raw_funding: fundingList, raw_spot: spotBalances };
        break;
      }

      // ===== AUTO-TRANSFER + SPOT ORDER =====
      case "executeTradeWithTransfer": {
        const { symbol, side, quantity, quoteOrderQty, dryRun } = payload;
        if (!symbol || (side !== "BUY" && side !== "SELL")) throw new Error("Missing: symbol, side");
        // F5 — the order runs only on the account the operator explicitly chose.
        if (!payload.exchange_account_id) {
          throw new Error("Choose the Binance account for this order — nothing was sent.");
        }
        // resolveAccount() falls back to the default account for an unknown id; never trade on a fallback.
        if (String(payload.exchange_account_id) !== EXCHANGE_ACCOUNT_ID) {
          throw new Error("Unknown Binance account for this order — nothing was sent.");
        }

        // F3 — live rules, price and balances BEFORE any transfer or order.
        const rulesMap = await getSymbolRules([symbol]);
        const rules = rulesMap[String(symbol).toUpperCase()];
        if (!rules) throw new Error(`Couldn't read Binance's trading rules for ${symbol} — nothing was sent.`);
        const coin = side === "BUY" ? rules.quoteAsset : rules.baseAsset;

        const fundCheckData = await proxyCall("/sapi/v1/asset/get-funding-asset", { asset: coin });
        if (!Array.isArray(fundCheckData)) throw new Error(`Couldn't read the Funding balance for ${coin} — nothing was sent.`);
        const fundingFree = String(fundCheckData.find((f: any) => f.asset === coin)?.free ?? "0");
        const spotRes = await fetchWithRetry(`${BINANCE_PROXY_URL}/api/api/v3/account`, { method: "GET", headers: proxyHeaders });
        const spotData: any = await spotRes.json().catch(() => null);
        if (!Array.isArray(spotData?.balances)) throw new Error(`Couldn't read the Spot balance for ${coin} — nothing was sent.`);
        const spotFree = String(spotData.balances.find((b: any) => b.asset === coin)?.free ?? "0");

        let price = "0";
        if (side === "SELL") {
          const t = (await getAllTickerPrices()).find((x) => x.symbol === rules.symbol);
          price = t?.price ?? "0";
        }
        const available = fromUnits(toUnits(fundingFree) + toUnits(spotFree));
        const check = checkOrder({
          side, amount: side === "BUY" ? String(quoteOrderQty ?? "") : String(quantity ?? ""),
          available, price, rules, accountName: acct.accountName,
        });
        if (!check.ok) throw new Error(check.message);
        const need = side === "BUY" ? check.quoteOrderQty! : check.quantity!;

        // F1 — move only what Spot is missing.
        const plan = computeFundingShortfall(need, spotFree, fundingFree, coin);
        if (!plan.ok) throw new Error(plan.reason);

        const orderParams: Record<string, string> = { symbol: rules.symbol, side, type: "MARKET" };
        if (side === "BUY") orderParams.quoteOrderQty = check.quoteOrderQty!;
        else orderParams.quantity = check.quantity!;

        if (dryRun === true) {
          result = {
            dryRun: true, exchange_account_id: EXCHANGE_ACCOUNT_ID, account: acct.accountName,
            transfer: Number(plan.move) > 0 ? { type: "FUNDING_MAIN", asset: coin, amount: plan.move } : null,
            order: orderParams, balances: { fundingFree, spotFree }, rules,
          };
          break;
        }

        let transferResult = null;
        let fundingTransferred = false;
        if (Number(plan.move) > 0) {
          transferResult = await proxyCall("/sapi/v1/asset/transfer", { type: "FUNDING_MAIN", asset: coin, amount: plan.move });
          if (!transferResult?.tranId) {
            throw new Error(`Moving ${plan.move} ${coin} from Funding to Spot failed (${transferResult?.msg || transferResult?.error || "no transfer id"}) — no order was placed.`);
          }
          console.info(`Auto-transfer: ${coin} ${plan.move} Funding→Spot (Spot had ${spotFree})`);
          fundingTransferred = true;
          await new Promise((r) => setTimeout(r, 500));
        }

        const orderQs = new URLSearchParams(orderParams).toString();
        const orderUrl = `${BINANCE_PROXY_URL}/api/api/v3/order?${orderQs}`;
        const orderRes = await fetchWithRetry(orderUrl, { method: "POST", headers: proxyHeaders });
        const orderResult = JSON.parse(await orderRes.text());

        if (orderResult?.code && orderResult.code < 0) {
          throw new Error(orderResult.msg || `Spot order failed: ${orderResult.code}`);
        }

        console.info(`Spot order: ${symbol} ${side} — status=${orderResult?.status || 'unknown'}`);

        result = {
          transfer: transferResult,
          order: orderResult,
          fundingTransferred,
          fundingMovedAmount: fundingTransferred ? plan.move : "0",
          fundingMovedAsset: coin,
          exchange_account_id: EXCHANGE_ACCOUNT_ID,
          method: "SPOT",
        };
        break;
      }

      // ===== LIVE TRADING RULES (public) =====
      case "getSymbolRules": {
        const list = Array.isArray(payload.symbols) ? payload.symbols : [];
        result = await getSymbolRules(list.slice(0, 50), payload.force === true);
        break;
      }

      // ===== TICKER PRICE (public) =====
      case "getTickerPrice": {
        const { symbol, symbols } = payload;
        // F11 — a symbols list returns only those prices, filtered server-side
        // (unknown/delisted symbols are simply absent instead of failing the call).
        if (Array.isArray(symbols)) {
          const want = new Set(symbols.map((x: any) => String(x).toUpperCase()));
          result = (await getAllTickerPrices()).filter((t) => want.has(t.symbol));
          break;
        }
        const tickerUrl = symbol
          ? `${BINANCE_BASE}/api/v3/ticker/price?symbol=${symbol}`
          : `${BINANCE_BASE}/api/v3/ticker/price`;
        const tickerRes = await fetchWithRetry(tickerUrl, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        result = JSON.parse(await tickerRes.text());
        break;
      }

      // ===== GET MY TRADES (Spot trade history from Binance) =====
      case "getMyTrades": {
        const { symbols, startTime, limit: tradeLimit } = payload;
        // Binance myTrades needs a symbol; there is no "all my trades" endpoint.
        // So we discover every pair that could involve us: all Binance pairs whose
        // base AND quote are both coins we hold now (spot) or have ever booked.
        const svcUrl = Deno.env.get("SUPABASE_URL")!;
        const svc = createClient(svcUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const LEGACY = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "SOLUSDT", "TRXUSDT", "SHIBUSDT", "TONUSDT", "USDCUSDT", "FDUSDUSDT"];
        const symbolInfo = new Map<string, { base: string; quote: string }>();
        let tradingSymbols: string[] = symbols || [];
        if (!symbols) {
          const assets = new Set<string>(["USDT", "USDC", "FDUSD", "BTC", "ETH", "BNB", "XRP", "SOL", "TRX", "SHIB", "TON"]);
          try {
            const { data: pos } = await svc.from("wallet_asset_positions").select("asset_code");
            for (const p of pos || []) if (p.asset_code) assets.add(String(p.asset_code).toUpperCase());
          } catch (_) { /* best effort */ }
          try {
            const spotRes = await fetchWithRetry(`${BINANCE_PROXY_URL}/api/api/v3/account`, { method: "GET", headers: proxyHeaders });
            const spot = JSON.parse(await spotRes.text());
            for (const b of spot?.balances || []) {
              if (parseFloat(b.free || "0") + parseFloat(b.locked || "0") > 0) assets.add(String(b.asset).toUpperCase());
            }
          } catch (e) { console.warn("getMyTrades: spot balances unavailable:", (e as Error).message); }
          try {
            const exRes = await fetchWithRetry(`${BINANCE_BASE}/api/v3/exchangeInfo?permissions=SPOT`, { method: "GET", headers: {} });
            const ex = JSON.parse(await exRes.text());
            for (const s of ex?.symbols || []) {
              if (assets.has(s.baseAsset) && assets.has(s.quoteAsset)) {
                symbolInfo.set(s.symbol, { base: s.baseAsset, quote: s.quoteAsset });
              }
            }
          } catch (e) { console.warn("getMyTrades: exchangeInfo unavailable:", (e as Error).message); }
          tradingSymbols = symbolInfo.size ? Array.from(symbolInfo.keys()) : LEGACY;
          if (symbolInfo.size) {
            await svc.from("binance_symbol_map").upsert(
              Array.from(symbolInfo.entries()).map(([symbol, v]) => ({ symbol, base_asset: v.base, quote_asset: v.quote, updated_at: new Date().toISOString() })),
              { onConflict: "symbol" },
            );
          }
          console.info(`getMyTrades: ${assets.size} assets → ${tradingSymbols.length} pairs`);
        }

        // Per-symbol exact cursor (last stored trade id) so no pair is skipped even
        // after a long gap. Pairs with no history are backfilled for 30 days only.
        const cursors = new Map<string, number>();
        try {
          const { data: cur } = await svc.rpc("spot_trade_cursors", { p_account: EXCHANGE_ACCOUNT_ID });
          for (const c of (cur || []) as any[]) cursors.set(c.symbol, Number(c.max_trade_id));
        } catch (_) { /* fall back to startTime */ }
        const BACKFILL_SINCE = Date.now() - 30 * 24 * 60 * 60 * 1000;

        const allTrades: any[] = [];
        const pageLimit = Number(tradeLimit) > 0 ? Math.min(Number(tradeLimit), 1000) : 1000;
        const MAX_PAGES = 20; // safety cap: up to 20k trades per symbol per sync

        for (const sym of tradingSymbols) {
          try {
            const known = cursors.get(sym);
            const isNewPair = known === undefined && !LEGACY.includes(sym);
            let fromId: number | null = known !== undefined ? known + 1 : isNewPair ? 0 : null;
            for (let page = 0; page < MAX_PAGES; page++) {
              const tradeParams: Record<string, string> = { symbol: sym, limit: String(pageLimit) };
              if (fromId !== null) tradeParams.fromId = String(fromId);
              else if (startTime) tradeParams.startTime = String(startTime);

              const qs = new URLSearchParams(tradeParams).toString();
              const url = `${BINANCE_PROXY_URL}/api/api/v3/myTrades?${qs}`;
              const res = await fetchWithRetry(url, { method: "GET", headers: proxyHeaders });
              const text = await res.text();
              let trades: any[] = [];
              try { trades = JSON.parse(text); } catch { trades = []; }
              if (!Array.isArray(trades) || trades.length === 0) break;

              for (const t of trades) {
                if (isNewPair && Number(t.time) < BACKFILL_SINCE) continue;
                allTrades.push({ ...t, symbol: sym });
              }

              if (trades.length < pageLimit) break;
              const maxId = trades.reduce((m: number, t: any) => Math.max(m, Number(t.id) || 0), 0);
              if (!maxId) break;
              fromId = maxId + 1;
            }
          } catch (e) {
            console.warn(`Failed to fetch trades for ${sym}:`, (e as Error).message);
          }
        }

        // USDT valuation for trades whose paying coin is not USDT: the Binance
        // 1-minute close of <QUOTE>USDT (or inverse USDT<QUOTE>) at the trade minute.
        const rateRows: any[] = [];
        const seen = new Set<string>();
        for (const t of allTrades) {
          const info = symbolInfo.get(t.symbol);
          const quote = info?.quote || (t.symbol.endsWith("USDT") ? "USDT" : null);
          if (!quote || quote === "USDT") continue;
          const minute = Math.floor(Number(t.time) / 60000) * 60000;
          const key = `${quote}|${minute}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const { data: have } = await svc.from("binance_quote_usdt_rates").select("rate").eq("asset", quote).eq("minute_ms", minute).maybeSingle();
          if (have) continue;
          for (const [pair, inverse] of [[`${quote}USDT`, false], [`USDT${quote}`, true]] as [string, boolean][]) {
            try {
              const kRes = await fetchWithRetry(`${BINANCE_BASE}/api/v3/klines?symbol=${pair}&interval=1m&startTime=${minute}&limit=1`, { method: "GET", headers: {} });
              const k = JSON.parse(await kRes.text());
              const close = Array.isArray(k) && k[0] ? parseFloat(k[0][4]) : NaN;
              if (Number.isFinite(close) && close > 0) {
                rateRows.push({ asset: quote, minute_ms: minute, rate: inverse ? 1 / close : close, source_symbol: pair });
                break;
              }
            } catch (_) { /* try inverse */ }
          }
        }
        if (rateRows.length) await svc.from("binance_quote_usdt_rates").upsert(rateRows, { onConflict: "asset,minute_ms" });

        allTrades.sort((a, b) => (b.time || 0) - (a.time || 0));
        result = allTrades;
        break;
      }


      // ===== DEPOSIT HISTORY =====
      case "getDepositHistory": {
        const { startTime, endTime, coin, status, limit: depLimit, offset } = payload;
        const params: Record<string, string> = {};
        if (startTime) params.startTime = String(startTime);
        if (endTime) params.endTime = String(endTime);
        if (coin) params.coin = coin;
        if (status !== undefined) params.status = String(status);
        if (depLimit) params.limit = String(depLimit);
        if (offset) params.offset = String(offset);

        result = await proxyGet("/sapi/v1/capital/deposit/hisrec", params);
        break;
      }

      // ===== WITHDRAWAL HISTORY =====
      case "getWithdrawHistory": {
        const { startTime, endTime, coin, status, limit: wdLimit, offset } = payload;
        const params: Record<string, string> = {};
        if (startTime) params.startTime = String(startTime);
        if (endTime) params.endTime = String(endTime);
        if (coin) params.coin = coin;
        if (status !== undefined) params.status = String(status);
        if (wdLimit) params.limit = String(wdLimit);
        if (offset) params.offset = String(offset);

        result = await proxyGet("/sapi/v1/capital/withdraw/history", params);
        break;
      }

      // ===== BINANCE PAY TRANSACTION HISTORY =====
      case "getPayTransactions": {
        const { startTimestamp, endTimestamp, limit: payLimit } = payload;
        const params: Record<string, string> = {};
        if (startTimestamp) params.startTimestamp = String(startTimestamp);
        if (endTimestamp) params.endTimestamp = String(endTimestamp);
        params.limit = String(payLimit || 100);
        result = await proxyGet("/sapi/v1/pay/transactions", params);
        break;
      }

      // ===== UNIVERSAL TRANSFER HISTORY =====
      case "getTransferHistory": {
        const { type: transferType, startTime, endTime, current, size } = payload;
        if (!transferType) throw new Error("Missing: type (transfer type enum)");
        const params: Record<string, string> = { type: transferType };
        if (startTime) params.startTime = String(startTime);
        if (endTime) params.endTime = String(endTime);
        if (current) params.current = String(current);
        if (size) params.size = String(size);

        result = await proxyGet("/sapi/v1/asset/transfer", params);
        break;
      }

      // ===== SYNC ASSET MOVEMENTS TO DB =====
      case "syncAssetMovements": {
        const SUPABASE_URL = "https://vagiqbespusdxsbqpvbo.supabase.co";
        const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Per-account sync cursor: keep "default" for the primary account
        // (backward compatible) and use the account id for additional accounts.
        const movementMetaId = acct.credentialKey === "default" ? "default" : acct.id;

        const { data: syncMeta } = await sb
          .from("asset_movement_sync_metadata")
          .select("*")
          .eq("id", movementMetaId)
          .maybeSingle();

        const lastSync = syncMeta?.last_sync_at ? new Date(syncMeta.last_sync_at).getTime() : 0;
        const twoMinutes = 2 * 60 * 1000;
        const now = Date.now();
        const forceSync = payload.force === true;

        if (!forceSync && lastSync > 0 && (now - lastSync) < twoMinutes) {
          result = { synced: false, reason: "fresh" };
          break;
        }

        console.info("syncAssetMovements: starting");
        const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
        const oneDayAgo = now - 26 * 60 * 60 * 1000;
        const syncStartTime = lastSync > 0
          ? Math.min(lastSync - 2 * 60 * 60 * 1000, oneDayAgo)
          : ninetyDaysAgo;

        let totalUpserted = 0;

        // --- Deposits ---
        try {
          const depParams: Record<string, string> = {
            startTime: String(syncStartTime),
            endTime: String(now),
            limit: "200",
          };
          const deposits = await proxyGet("/sapi/v1/capital/deposit/hisrec", depParams);
          if (Array.isArray(deposits)) {
            const rows = deposits.map((d: any) => ({
              id: `dep-${ID_PFX}${d.id || d.txId || d.insertTime}`,
              movement_type: "deposit",
              asset: d.coin || "",
              amount: parseFloat(d.amount || "0"),
              fee: 0,
              status: String(d.status ?? ""),
              network: d.network || null,
              tx_id: d.txId || null,
              address: d.address || null,
              transfer_direction: null,
              raw_data: d,
              movement_time: d.insertTime || 0,
              synced_at: new Date().toISOString(),
              exchange_account_id: EXCHANGE_ACCOUNT_ID,
            }));
            if (rows.length > 0) {
              const { error } = await sb.from("asset_movement_history").upsert(rows, { onConflict: "id" });
              if (error) console.error("Deposit upsert error:", error.message);
              else totalUpserted += rows.length;
            }
            console.info(`Synced ${rows.length} deposits`);
          }
        } catch (e) { console.error("Deposit sync error:", (e as Error).message); }

        // --- Withdrawals ---
        try {
          const wdParams: Record<string, string> = {
            startTime: String(syncStartTime),
            endTime: String(now),
            limit: "200",
          };
          const withdrawals = await proxyGet("/sapi/v1/capital/withdraw/history", wdParams);
          if (Array.isArray(withdrawals)) {
            const rows = withdrawals.map((w: any) => ({
              id: `wd-${ID_PFX}${w.id}`,
              movement_type: "withdrawal",
              asset: w.coin || "",
              amount: parseFloat(w.amount || "0"),
              fee: parseFloat(w.transactionFee || "0"),
              status: String(w.status ?? ""),
              network: w.network || null,
              tx_id: w.txId || null,
              address: w.address || null,
              transfer_direction: null,
              raw_data: w,
              movement_time: new Date(w.applyTime || 0).getTime(),
              synced_at: new Date().toISOString(),
              exchange_account_id: EXCHANGE_ACCOUNT_ID,
            }));
            if (rows.length > 0) {
              const { error } = await sb.from("asset_movement_history").upsert(rows, { onConflict: "id" });
              if (error) console.error("Withdrawal upsert error:", error.message);
              else totalUpserted += rows.length;
            }
            console.info(`Synced ${rows.length} withdrawals`);
          }
        } catch (e) { console.error("Withdrawal sync error:", (e as Error).message); }

        // --- Transfers (MAIN_FUNDING + FUNDING_MAIN) ---
        for (const tType of ["MAIN_FUNDING", "FUNDING_MAIN"]) {
          try {
            const transferStartTime = Math.max(syncStartTime, now - 30 * 24 * 60 * 60 * 1000);
            const trParams: Record<string, string> = {
              type: tType,
              size: "100",
              startTime: String(transferStartTime),
            };
            const trData = await proxyGet("/sapi/v1/asset/transfer", trParams);
            const trRows = trData?.rows || [];
            if (Array.isArray(trRows) && trRows.length > 0) {
              const direction = tType === "FUNDING_MAIN" ? "Funding → Spot" : "Spot → Funding";
              const rows = trRows.map((t: any) => ({
                id: `tr-${ID_PFX}${t.tranId}`,
                movement_type: "transfer",
                asset: t.asset || "",
                amount: parseFloat(t.amount || "0"),
                fee: 0,
                status: t.status || "CONFIRMED",
                network: null,
                tx_id: null,
                address: null,
                transfer_direction: direction,
                raw_data: t,
                movement_time: t.timestamp || 0,
                synced_at: new Date().toISOString(),
                exchange_account_id: EXCHANGE_ACCOUNT_ID,
              }));
              const { error } = await sb.from("asset_movement_history").upsert(rows, { onConflict: "id" });
              if (error) console.error(`Transfer upsert error (${tType}):`, error.message);
              else totalUpserted += rows.length;
              console.info(`Synced ${rows.length} transfers (${tType})`);
            }
          } catch (e) { console.error(`Transfer sync error (${tType}):`, (e as Error).message); }
        }

        // --- Binance Pay Transactions ---
        const PAY_FEATURE_ACTIVATION_MS = 1739923200000; // 2026-02-19T00:00:00 UTC

        try {
          const { data: latestPay } = await sb
            .from("asset_movement_history")
            .select("movement_time")
            .like("id", "pay-%")
            .eq("exchange_account_id", EXCHANGE_ACCOUNT_ID)
            .order("movement_time", { ascending: false })
            .limit(1)
            .maybeSingle();

          const latestPayTime = latestPay?.movement_time
            ? latestPay.movement_time - 5 * 60 * 1000
            : null;
          const payStartTime = Math.max(
            PAY_FEATURE_ACTIVATION_MS,
            latestPayTime ?? PAY_FEATURE_ACTIVATION_MS
          );
          const payParams: Record<string, string> = {
            startTimestamp: String(payStartTime),
            endTimestamp: String(now),
            limit: "100",
          };
          const payData = await proxyGet("/sapi/v1/pay/transactions", payParams);
          const payList: any[] = Array.isArray(payData)
            ? payData
            : Array.isArray(payData?.data)
            ? payData.data
            : [];

          if (payList.length > 0) {
            const payRows = payList.map((p: any) => {
              const rawAmount = parseFloat(p.amount || "0");
              const isSent = rawAmount < 0;
              const txType = (p.transactionType || p.type || "").toUpperCase();
              const isSentByType =
                txType === "PAY" ||
                txType === "SEND" ||
                txType === "OUT" ||
                (txType.startsWith("PAY") && !txType.includes("REFUND") && !txType.includes("IN"));
              const finalIsSent = rawAmount !== 0 ? isSent : isSentByType;
              const movementType = finalIsSent ? "withdrawal" : "deposit";
              const absAmount = Math.abs(rawAmount);
              const status = isSent ? "6" : "1";
              const counterparty = isSent
                ? (p.receiverInfo?.name || p.receiverInfo?.nickName || p.receiverInfo?.binanceId || "")
                : (p.payerInfo?.name || p.payerInfo?.nickName || p.payerInfo?.binanceId || "");
              const orderId = p.orderId || p.transactionId || String(p.transactionTime);

              return {
                id: `pay-${ID_PFX}${orderId}`,
                movement_type: movementType,
                asset: p.currency || p.asset || "USDT",
                amount: absAmount,
                fee: 0,
                status,
                network: "Binance Pay",
                tx_id: orderId,
                address: counterparty || null,
                transfer_direction: null,
                raw_data: p,
                movement_time: p.transactionTime || 0,
                synced_at: new Date().toISOString(),
                exchange_account_id: EXCHANGE_ACCOUNT_ID,
              };
            });

            if (payRows.length > 0) {
              const { error } = await sb.from("asset_movement_history").upsert(payRows, { onConflict: "id" });
              if (error) console.error("Pay upsert error:", error.message);
              else totalUpserted += payRows.length;
            }
            console.info(`Synced ${payRows.length} Pay transactions`);
          }
        } catch (e) { console.error("Pay sync error:", (e as Error).message); }

        // Update sync metadata
        await sb.from("asset_movement_sync_metadata").upsert({
          id: movementMetaId,
          exchange_account_id: EXCHANGE_ACCOUNT_ID,
          last_sync_at: new Date().toISOString(),
          last_deposit_time: 0,
          last_withdraw_time: 0,
          last_transfer_time: 0,
        }, { onConflict: "id" });

        // Auto-queue new movements — resolve wallet per movement's OWN account
        const { data: allLinks2 } = await sb
          .from("terminal_wallet_links")
          .select("wallet_id, exchange_account_id")
          .eq("status", "active")
          .eq("platform_source", "terminal");

        // Map exchange_account_id -> wallet_id. Keep a fallback (account-less link)
        // only for legacy rows that have no exchange_account_id.
        const walletByAccount2 = new Map<string, string>();
        let fallbackWallet2: string | null = null;
        for (const l of (allLinks2 || [])) {
          if (l.exchange_account_id) walletByAccount2.set(l.exchange_account_id, l.wallet_id);
          else if (!fallbackWallet2) fallbackWallet2 = l.wallet_id;
        }
        const resolveWallet2 = (accId: string | null) =>
          (accId && walletByAccount2.get(accId)) || fallbackWallet2 || null;

        const { data: existingQ } = await sb.from("erp_action_queue").select("movement_id");
        const existingQIds = new Set((existingQ || []).map((q: any) => q.movement_id));

        const lookbackMs = now - 48 * 60 * 60 * 1000;
        const { data: newMovements } = await sb
          .from("asset_movement_history")
          .select("*")
          .in("movement_type", ["deposit", "withdrawal"])
          .gte("movement_time", lookbackMs)
          .order("movement_time", { ascending: false });

        const toQueue = (newMovements || []).filter((m: any) => {
          if (existingQIds.has(m.id)) return false;
          if (isBinancePayMovement(m)) return false;
          if (!isQueueEligibleMovement(m)) return false;
          return true;
        });

        if (toQueue.length > 0) {
          const queueRows2 = toQueue.map((m: any) => ({
            movement_id: m.id,
            movement_type: m.movement_type,
            asset: m.asset,
            amount: m.amount,
            tx_id: m.tx_id || null,
            network: m.network || null,
            exchange_account_id: m.exchange_account_id || null,
            wallet_id: resolveWallet2(m.exchange_account_id),
            movement_time: m.movement_time,
            status: "PENDING",
            raw_data: m.raw_data || m,
          }));
          const { error: autoQErr } = await sb
            .from("erp_action_queue")
            .upsert(queueRows2, { onConflict: "movement_id", ignoreDuplicates: true });
          if (autoQErr) console.error("Auto-queue error:", autoQErr.message);
        }

        console.info(`syncAssetMovements: done — upserted=${totalUpserted}, queued=${toQueue.length}`);
        result = { synced: true, totalUpserted, autoQueued: toQueue.length };
        break;
      }

      // ===== CHECK NEW MOVEMENTS FOR ERP ACTION QUEUE =====
      case "checkNewMovements": {
        const SUPABASE_URL = "https://vagiqbespusdxsbqpvbo.supabase.co";
        const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        const { data: allLinks } = await sb
          .from("terminal_wallet_links")
          .select("wallet_id, exchange_account_id")
          .eq("status", "active")
          .eq("platform_source", "terminal");

        const walletByAccount = new Map<string, string>();
        let fallbackWallet: string | null = null;
        for (const l of (allLinks || [])) {
          if (l.exchange_account_id) walletByAccount.set(l.exchange_account_id, l.wallet_id);
          else if (!fallbackWallet) fallbackWallet = l.wallet_id;
        }
        const resolveWallet = (accId: string | null) =>
          (accId && walletByAccount.get(accId)) || fallbackWallet || null;

        const { data: lastQueuedItem } = await sb
          .from("erp_action_queue")
          .select("movement_time")
          .in("status", ["PROCESSED", "REJECTED"])
          .order("movement_time", { ascending: false })
          .limit(1)
          .maybeSingle();

        const nowMs = Date.now();
        const fortyEightHoursAgo = nowMs - 48 * 60 * 60 * 1000;
        const dynamicCutoff = lastQueuedItem?.movement_time
          ? Math.min(lastQueuedItem.movement_time, fortyEightHoursAgo)
          : fortyEightHoursAgo;

        const { data: existingQueue } = await sb
          .from("erp_action_queue")
          .select("movement_id");

        const existingIds = new Set((existingQueue || []).map((q: any) => q.movement_id));

        const { data: allMovements } = await sb
          .from("asset_movement_history")
          .select("*")
          .in("movement_type", ["deposit", "withdrawal"])
          .gte("movement_time", dynamicCutoff)
          .order("movement_time", { ascending: false });

        const { data: p2pOrders } = await sb
          .from("binance_order_history")
          .select("order_number");
        const p2pOrderIds = new Set((p2pOrders || []).map((o: any) => String(o.order_number)));

        let movements: any[] = (allMovements || []).filter((m: any) => {
          if (existingIds.has(m.id)) return false;

          if (isBinancePayMovement(m)) {
            const payOrderId = String(m.tx_id || m.raw_data?.orderId || "");
            if (payOrderId && p2pOrderIds.has(payOrderId)) return false;
          }

          if (!isQueueEligibleMovement(m, p2pOrderIds)) return false;
          return true;
        });

        console.info(`checkNewMovements: ${allMovements?.length || 0} in window, ${movements.length} eligible`);

        if (movements.length === 0) {
          result = { inserted: 0 };
          break;
        }

        const queueRows = movements.map((m: any) => ({
          movement_id: m.id,
          movement_type: m.movement_type,
          asset: m.asset,
          amount: m.amount,
          tx_id: m.tx_id || null,
          network: m.network || null,
          exchange_account_id: m.exchange_account_id || null,
          wallet_id: resolveWallet(m.exchange_account_id),
          movement_time: m.movement_time,
          status: "PENDING",
          raw_data: m.raw_data || m,
        }));

        const { error: insertErr } = await sb
          .from("erp_action_queue")
          .upsert(queueRows, { onConflict: "movement_id", ignoreDuplicates: true });

        if (insertErr) {
          console.error("checkNewMovements insert error:", insertErr.message);
          throw new Error(`Failed to insert queue items: ${insertErr.message}`);
        }

        console.info(`checkNewMovements: queued ${queueRows.length} items`);
        result = { inserted: queueRows.length };
        break;
      }

      // ===== VERIFY ORDER OWNERSHIP (authoritative per-account re-stamp) =====
      // Pulls this account's REAL P2P order history from Binance and stamps the
      // matching binance_order_history rows with this account's id. Run once per
      // configured account; whichever account's API returns an order truly owns it.
      // Supports dryRun (report only) and paginated cursoring via { page, maxPages }.
      case "verifyOrderOwnership": {
        const SUPABASE_URL = "https://vagiqbespusdxsbqpvbo.supabase.co";
        const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        const startTimestamp = payload.startTimestamp ? Number(payload.startTimestamp) : (Date.now() - 365 * 24 * 60 * 60 * 1000);
        const endTimestamp = payload.endTimestamp ? Number(payload.endTimestamp) : Date.now();
        const maxPages = Math.min(Number(payload.maxPages || 20), 60);
        const rows = 100;
        const dryRun = payload.dryRun === true;

        const collected: string[] = [];
        let page = Number(payload.page || 1);
        let hasMore = true;
        let pagesFetched = 0;
        while (hasMore && pagesFetched < maxPages) {
          const data = await proxyGet("/sapi/v1/c2c/orderMatch/listUserOrderHistory", {
            page: String(page),
            rows: String(rows),
            startTimestamp: String(startTimestamp),
            endTimestamp: String(endTimestamp),
          });
          const list = Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.data?.data)
            ? data.data.data
            : [];
          for (const o of list) {
            const on = String(o.orderNumber || o.orderNo || o.adOrderNo || "");
            if (on) collected.push(on);
          }
          pagesFetched++;
          hasMore = list.length >= rows;
          page++;
        }

        const uniqueOrders = Array.from(new Set(collected));
        let updated = 0;
        let alreadyCorrect = 0;
        let reassignedFromOther = 0;
        let notInDb = 0;

        for (let i = 0; i < uniqueOrders.length; i += 200) {
          const batch = uniqueOrders.slice(i, i + 200);
          const { data: existing } = await sb
            .from("binance_order_history")
            .select("order_number, exchange_account_id")
            .in("order_number", batch);
          const found = new Set((existing || []).map((r: any) => String(r.order_number)));
          notInDb += batch.filter((on) => !found.has(on)).length;
          const toReassign = (existing || []).filter((r: any) => r.exchange_account_id !== EXCHANGE_ACCOUNT_ID);
          alreadyCorrect += (existing || []).length - toReassign.length;
          reassignedFromOther += toReassign.length;
          if (!dryRun && toReassign.length > 0) {
            const ids = toReassign.map((r: any) => String(r.order_number));
            const { error } = await sb
              .from("binance_order_history")
              .update({ exchange_account_id: EXCHANGE_ACCOUNT_ID })
              .in("order_number", ids);
            if (error) console.error("verifyOrderOwnership update error:", error.message);
            else updated += ids.length;
          }
        }

        result = {
          account: EXCHANGE_ACCOUNT_ID,
          dryRun,
          pagesFetched,
          ordersFetchedFromBinance: uniqueOrders.length,
          alreadyCorrect,
          reassignedFromOther,
          updated,
          notInDb,
          nextPage: hasMore ? page : null,
        };
        break;
      }


      // ===== DIAGNOSTIC: Probe all USDT locations (filtered) =====
      case "diagnoseUsdtLocations": {
        const out: any = {};
        const tryGet = async (label: string, path: string, params: Record<string, string> = {}) => {
          try { out[label] = await proxyGet(path, params); }
          catch (e) { out[label] = { error: (e as Error).message }; }
        };
        const tryPost = async (label: string, path: string, params: Record<string, string> = {}) => {
          try { out[label] = await proxyCall(path, params); }
          catch (e) { out[label] = { error: (e as Error).message }; }
        };
        await tryPost("funding", "/sapi/v1/asset/get-funding-asset", { asset: "USDT" });
        await tryPost("user_asset_all", "/sapi/v3/asset/getUserAsset", { asset: "USDT" });
        await tryGet("spot_full", "/api/v3/account");
        await tryGet("simple_earn_flexible", "/sapi/v1/simple-earn/flexible/position", { asset: "USDT" });
        await tryGet("simple_earn_locked", "/sapi/v1/simple-earn/locked/position", { asset: "USDT" });
        await tryGet("simple_earn_account", "/sapi/v1/simple-earn/account");
        await tryGet("margin_account", "/sapi/v1/margin/account");
        await tryGet("staking_positions", "/sapi/v1/staking/position", { product: "STAKING", asset: "USDT" });
        await tryGet("convert_history", "/sapi/v1/convert/tradeFlow", { startTime: String(Date.now() - 7*24*3600*1000), endTime: String(Date.now()) });

        // Filter spot_full to just non-zero balances + USDT
        if (out.spot_full?.balances) {
          out.spot_nonzero = out.spot_full.balances.filter((b: any) =>
            parseFloat(b.free) > 0 || parseFloat(b.locked) > 0 || b.asset === "USDT"
          );
          delete out.spot_full;
        }
        // Filter margin_account to just non-zero
        if (out.margin_account?.userAssets) {
          out.margin_nonzero = out.margin_account.userAssets.filter((a: any) =>
            parseFloat(a.netAsset) !== 0 || parseFloat(a.borrowed) !== 0 || a.asset === "USDT"
          );
          out.margin_totals = {
            totalAssetOfBtc: out.margin_account.totalAssetOfBtc,
            totalNetAssetOfBtc: out.margin_account.totalNetAssetOfBtc,
            totalCollateralValueInUSDT: out.margin_account.totalCollateralValueInUSDT,
          };
          delete out.margin_account;
        }
        result = out;
        break;
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, data: result, _resolvedExchangeAccountId: EXCHANGE_ACCOUNT_ID }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("binance-assets error:", error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
