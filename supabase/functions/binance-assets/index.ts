import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BINANCE_BASE = "https://api.binance.com";

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
    const BINANCE_PROXY_URL = Deno.env.get("BINANCE_PROXY_URL");
    const BINANCE_API_KEY = Deno.env.get("BINANCE_API_KEY");
    const BINANCE_API_SECRET = Deno.env.get("BINANCE_API_SECRET");
    const BINANCE_PROXY_TOKEN = Deno.env.get("BINANCE_PROXY_TOKEN");

    if (!BINANCE_PROXY_URL || !BINANCE_API_KEY || !BINANCE_API_SECRET || !BINANCE_PROXY_TOKEN) {
      throw new Error("Missing Binance configuration secrets");
    }

    const { action, ...payload } = await req.json();
    console.info(`binance-assets: action=${action}`);

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

      // ===== INTERNAL TRANSFER =====
      case "transfer": {
        const { asset, amount, type } = payload;
        if (!asset || !amount || !type) throw new Error("Missing required fields: asset, amount, type");
        result = await proxyCall("/sapi/v1/asset/transfer", { type, asset, amount: String(amount) });
        break;
      }

      // ===== SPOT MARKET ORDER =====
      case "spotOrder": {
        const { symbol, side, quantity, quoteOrderQty } = payload;
        if (!symbol || !side) throw new Error("Missing: symbol, side");
        const params: Record<string, string> = { symbol, side, type: "MARKET" };
        if (quoteOrderQty) params.quoteOrderQty = String(quoteOrderQty);
        else if (quantity) params.quantity = String(quantity);
        else throw new Error("Either quantity or quoteOrderQty required");

        const qs2 = new URLSearchParams(params).toString();
        const url2 = `${BINANCE_PROXY_URL}/api/api/v3/order?${qs2}`;
        const res2 = await fetchWithRetry(url2, { method: "POST", headers: proxyHeaders });
        result = JSON.parse(await res2.text());
        break;
      }

      // ===== AUTO-TRANSFER + SPOT ORDER =====
      case "executeTradeWithTransfer": {
        const { symbol, side, quantity, quoteOrderQty, transferAsset } = payload;

        let transferResult = null;
        let fundingTransferred = false;
        const assetToCheck = transferAsset;

        if (assetToCheck) {
          try {
            const fundCheckData = await proxyCall("/sapi/v1/asset/get-funding-asset", { asset: assetToCheck });
            const fundingBalance = Array.isArray(fundCheckData)
              ? fundCheckData.find((f: any) => f.asset === assetToCheck)
              : null;
            const fundingFree = parseFloat(fundingBalance?.free || "0");

            if (fundingFree > 0) {
              transferResult = await proxyCall("/sapi/v1/asset/transfer", {
                type: "FUNDING_MAIN",
                asset: assetToCheck,
                amount: String(fundingFree),
              });
              console.info(`Auto-transfer: ${assetToCheck} ${fundingFree} Funding→Spot`);
              fundingTransferred = true;
              await new Promise((r) => setTimeout(r, 500));
            }
          } catch (e) {
            console.error("Transfer failed:", (e as Error).message);
          }
        }

        if (!symbol || !side) throw new Error("Missing: symbol, side");
        const orderParams: Record<string, string> = { symbol, side, type: "MARKET" };
        if (quoteOrderQty) {
          orderParams.quoteOrderQty = String(quoteOrderQty);
        } else if (quantity) {
          const stepSizes: Record<string, number> = {
            BTCUSDT: 5, ETHUSDT: 4, BNBUSDT: 3, XRPUSDT: 1, SOLUSDT: 3,
            TRXUSDT: 0, SHIBUSDT: 0, TONUSDT: 2, USDCUSDT: 0, FDUSDUSDT: 0,
          };
          const decimals = stepSizes[symbol] ?? 5;
          const factor = Math.pow(10, decimals);
          const rounded = Math.floor(parseFloat(String(quantity)) * factor) / factor;
          orderParams.quantity = rounded.toFixed(decimals);
        } else {
          throw new Error("Either quantity or quoteOrderQty required");
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
          method: "SPOT",
        };
        break;
      }

      // ===== SPOT ORDER via proxy query params (api/v3) =====
      case "spotOrderDirect": {
        const { symbol, side, quantity, quoteOrderQty } = payload;
        if (!symbol || !side) throw new Error("Missing: symbol, side");
        const params: Record<string, string> = { symbol, side, type: "MARKET" };
        if (quoteOrderQty) params.quoteOrderQty = String(quoteOrderQty);
        else if (quantity) params.quantity = String(quantity);
        else throw new Error("Either quantity or quoteOrderQty required");

        const qs = new URLSearchParams(params).toString();
        const url = `${BINANCE_PROXY_URL}/api/api/v3/order?${qs}`;
        const res = await fetchWithRetry(url, { method: "POST", headers: proxyHeaders });
        result = JSON.parse(await res.text());
        break;
      }

      // ===== TICKER PRICE (public) =====
      case "getTickerPrice": {
        const { symbol } = payload;
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
        const tradingSymbols: string[] = symbols || [
          "BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "SOLUSDT",
          "TRXUSDT", "SHIBUSDT", "TONUSDT", "USDCUSDT", "FDUSDUSDT"
        ];
        const allTrades: any[] = [];

        for (const sym of tradingSymbols) {
          try {
            const tradeParams: Record<string, string> = { symbol: sym };
            if (tradeLimit) tradeParams.limit = String(tradeLimit);
            else tradeParams.limit = "100";
            if (startTime) tradeParams.startTime = String(startTime);

            const qs = new URLSearchParams(tradeParams).toString();
            const url = `${BINANCE_PROXY_URL}/api/api/v3/myTrades?${qs}`;
            const res = await fetchWithRetry(url, { method: "GET", headers: proxyHeaders });
            const text = await res.text();
            let trades: any[] = [];
            try { trades = JSON.parse(text); } catch { trades = []; }
            if (Array.isArray(trades)) {
              for (const t of trades) {
                allTrades.push({ ...t, symbol: sym });
              }
            }
          } catch (e) {
            console.warn(`Failed to fetch trades for ${sym}:`, (e as Error).message);
          }
        }

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

        const { data: syncMeta } = await sb
          .from("asset_movement_sync_metadata")
          .select("*")
          .eq("id", "default")
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
              id: `dep-${d.id || d.txId || d.insertTime}`,
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
              id: `wd-${w.id}`,
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
                id: `tr-${t.tranId}`,
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
                id: `pay-${orderId}`,
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
          id: "default",
          last_sync_at: new Date().toISOString(),
          last_deposit_time: 0,
          last_withdraw_time: 0,
          last_transfer_time: 0,
        }, { onConflict: "id" });

        // Auto-queue new movements
        const { data: activeLink2 } = await sb
          .from("terminal_wallet_links")
          .select("wallet_id")
          .eq("status", "active")
          .eq("platform_source", "terminal")
          .limit(1)
          .maybeSingle();

        const mappedWalletId2 = activeLink2?.wallet_id || null;

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
            wallet_id: mappedWalletId2,
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

        const { data: activeLink } = await sb
          .from("terminal_wallet_links")
          .select("wallet_id")
          .eq("status", "active")
          .eq("platform_source", "terminal")
          .limit(1)
          .maybeSingle();

        const mappedWalletId = activeLink?.wallet_id || null;

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
          wallet_id: mappedWalletId,
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

    return new Response(JSON.stringify({ success: true, data: result }), {
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
