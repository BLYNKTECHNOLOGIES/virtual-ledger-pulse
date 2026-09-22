// Server-side spot-trade → pending conversion sync.
//
// ROOT CAUSE this fixes: importing Binance spot trades (conversions) into
// spot_trade_history and then into erp_product_conversions used to happen ONLY
// in the browser (useSpotTradeSync / Sync All). If no operator had the ERP open,
// completed conversions never appeared as pending entries — stock kept showing
// an API-vs-ERP gap. This function does both steps with the service role and is
// driven by cron, so conversions always land.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PRIMARY_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";
const SYNC_OVERLAP_MS = 15 * 60 * 1000; // re-fetch window (same-ms / late fills)
const SETTLE_WINDOW_MS = 3 * 60 * 1000; // order must be quiet before booking
const CUTOFF_DATE = "2026-02-11T18:30:00Z"; // 12 Feb 2026 00:00 IST

const svc = createClient(SUPABASE_URL, SERVICE_ROLE);

async function importTradesForAccount(accountId: string): Promise<number> {
  const { data: latestTrade } = await svc
    .from("spot_trade_history")
    .select("trade_time")
    .eq("exchange_account_id", accountId)
    .not("binance_trade_id", "is", null)
    .order("trade_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  const startTime = latestTrade?.trade_time
    ? Math.max(0, Number(latestTrade.trade_time) - SYNC_OVERLAP_MS)
    : undefined;

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/binance-assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify({ action: "getMyTrades", startTime, exchange_account_id: accountId }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || !body?.success) {
    throw new Error(body?.error || `getMyTrades failed (${resp.status})`);
  }

  const resolvedAccountId: string = body._resolvedExchangeAccountId || accountId;
  const trades = (body.data || []) as any[];
  if (!trades.length) return 0;

  const rows = trades.map((t: any) => ({
    binance_trade_id: String(t.id),
    binance_order_id: String(t.orderId),
    symbol: t.symbol,
    side: t.isBuyer ? "BUY" : "SELL",
    quantity: parseFloat(t.qty || "0"),
    executed_price: parseFloat(t.price || "0"),
    quote_quantity: parseFloat(t.quoteQty || "0"),
    commission: parseFloat(t.commission || "0"),
    commission_asset: t.commissionAsset || null,
    is_buyer: t.isBuyer,
    is_maker: t.isMaker,
    trade_time: t.time,
    status: "FILLED" as const,
    execution_method: "SPOT" as const,
    source: "binance_app" as const,
    exchange_account_id: resolvedAccountId,
  }));

  // Enrich pre-existing terminal-placed trades with commission/ids instead of duplicating them.
  const orderIds = [...new Set(rows.map((r) => r.binance_order_id))];
  const { data: terminalTrades } = await svc
    .from("spot_trade_history")
    .select("binance_order_id")
    .eq("source", "terminal")
    .eq("exchange_account_id", resolvedAccountId)
    .in("binance_order_id", orderIds);

  const terminalOrderIds = new Set((terminalTrades || []).map((t: any) => t.binance_order_id));

  for (const oid of terminalOrderIds) {
    const matching = rows.filter((r) => r.binance_order_id === oid);
    if (!matching.length) continue;
    const totalCommission = matching.reduce((s, r) => s + (r.commission || 0), 0);
    const commissionAsset = matching.find((r) => r.commission_asset)?.commission_asset || null;
    await svc
      .from("spot_trade_history")
      .update({
        binance_trade_id: matching[0].binance_trade_id,
        commission: totalCommission,
        commission_asset: commissionAsset,
        is_buyer: matching[0].is_buyer,
        is_maker: matching[0].is_maker,
        trade_time: matching[0].trade_time,
      })
      .eq("binance_order_id", oid)
      .eq("source", "terminal");
  }

  const newRows = rows.filter((r) => !terminalOrderIds.has(r.binance_order_id));
  let imported = 0;
  for (let i = 0; i < newRows.length; i += 50) {
    const chunk = newRows.slice(i, i + 50);
    const { error } = await svc
      .from("spot_trade_history")
      .upsert(chunk, { onConflict: "binance_trade_id,symbol", ignoreDuplicates: true });
    if (error) throw new Error(`upsert failed: ${error.message}`);
    imported += chunk.length;
  }
  return imported;
}

async function bookPendingConversions(): Promise<number> {
  const { data: walletLinks } = await svc
    .from("terminal_wallet_links")
    .select("wallet_id, exchange_account_id")
    .eq("status", "active")
    .eq("platform_source", "terminal");

  const walletByAccount = new Map<string, string>();
  let fallbackWalletId: string | null = null;
  for (const l of (walletLinks || []) as any[]) {
    if (l.exchange_account_id) walletByAccount.set(l.exchange_account_id, l.wallet_id);
    if (!fallbackWalletId) fallbackWalletId = l.wallet_id;
  }
  if (!fallbackWalletId) throw new Error("No API-linked wallet found");
  const resolveWallet = (accId: string | null) => (accId && walletByAccount.get(accId)) || fallbackWalletId!;

  const { data: rawTrades, error: tradeErr } = await svc
    .from("spot_trade_history")
    .select(
      "id, symbol, side, quantity, executed_price, quote_quantity, commission, commission_asset, trade_time, source, status, is_buyer, created_at, binance_order_id, exchange_account_id",
    )
    .eq("status", "FILLED")
    .gte("created_at", CUTOFF_DATE)
    .order("trade_time", { ascending: false });
  if (tradeErr) throw tradeErr;

  // Aggregate fills per Binance order (a market order fills in many trades).
  const orderMap = new Map<string, any>();
  const now = Date.now();
  for (const t of (rawTrades || []) as any[]) {
    const key = t.binance_order_id || t.id;
    const fillTs = t.created_at ? new Date(t.created_at).getTime() : 0;
    const existing = orderMap.get(key);
    if (!existing) {
      orderMap.set(key, { ...t, _fill_ids: [t.id], _last_fill_ts: fillTs });
      continue;
    }
    existing.quantity = (Number(existing.quantity) || 0) + (Number(t.quantity) || 0);
    existing.quote_quantity = (Number(existing.quote_quantity) || 0) + (Number(t.quote_quantity) || 0);
    existing.commission = (Number(existing.commission) || 0) + (Number(t.commission) || 0);
    if (!existing.commission_asset && t.commission_asset) existing.commission_asset = t.commission_asset;
    if (existing.quantity > 0) existing.executed_price = existing.quote_quantity / existing.quantity;
    existing._fill_ids.push(t.id);
    if (fillTs > (existing._last_fill_ts || 0)) existing._last_fill_ts = fillTs;
    if (t.trade_time && (!existing.trade_time || t.trade_time < existing.trade_time)) {
      existing.trade_time = t.trade_time;
      existing.created_at = t.created_at;
    }
  }

  const { data: synced } = await svc
    .from("erp_product_conversions")
    .select("spot_trade_id")
    .not("spot_trade_id", "is", null);
  const syncedTradeIds = new Set((synced || []).map((s: any) => s.spot_trade_id));

  const syncedOrderIds = new Set<string>();
  if (syncedTradeIds.size > 0) {
    const ids = Array.from(syncedTradeIds);
    for (let i = 0; i < ids.length; i += 500) {
      const { data: st } = await svc
        .from("spot_trade_history")
        .select("binance_order_id")
        .in("id", ids.slice(i, i + 500))
        .not("binance_order_id", "is", null);
      for (const r of (st || []) as any[]) syncedOrderIds.add(r.binance_order_id);
    }
  }

  // Stale-fill guard: skip historical trades older than the newest APPROVED conversion of that symbol.
  const { data: approved } = await svc
    .from("erp_product_conversions")
    .select("metadata")
    .eq("status", "APPROVED");
  const maxApprovedBySymbol = new Map<string, number>();
  for (const a of (approved || []) as any[]) {
    const sym = a?.metadata?.binance_symbol;
    const tt = Number(a?.metadata?.trade_time);
    if (sym && Number.isFinite(tt)) {
      if (tt > (maxApprovedBySymbol.get(sym) ?? 0)) maxApprovedBySymbol.set(sym, tt);
    }
  }

  const eligible = Array.from(orderMap.values()).filter((t: any) => {
    const fillIds: string[] = t._fill_ids || [t.id];
    const already =
      fillIds.some((fid: string) => syncedTradeIds.has(fid)) ||
      (t.binance_order_id && syncedOrderIds.has(t.binance_order_id));
    if (already) return false;
    const lastFill = Number(t._last_fill_ts) || 0;
    if (lastFill > 0 && now - lastFill < SETTLE_WINDOW_MS) return false; // still filling
    const cutoff = maxApprovedBySymbol.get(t.symbol) ?? 0;
    if (Number(t.trade_time) > 0 && cutoff > 0 && Number(t.trade_time) < cutoff) return false; // stale
    return true;
  });

  if (!eligible.length) return 0;

  const rows = eligible.map((t: any) => {
    const assetCode = String(t.symbol).replace("USDT", "");
    const qty = Number(t.quantity) || 0;
    const price = Number(t.executed_price) || 0;
    const grossUsd = Number(t.quote_quantity) || qty * price;
    const commission = Number(t.commission) || 0;
    const side = t.is_buyer === true ? "BUY" : t.is_buyer === false ? "SELL" : t.side;
    const commissionAsset = t.commission_asset || (t.is_buyer === false ? "USDT" : assetCode);
    return {
      wallet_id: resolveWallet(t.exchange_account_id),
      exchange_account_id: t.exchange_account_id || null,
      side,
      asset_code: assetCode,
      quantity: qty,
      price_usd: price,
      gross_usd_value: grossUsd,
      fee_percentage: grossUsd > 0 ? (commission / (side === "BUY" ? qty : grossUsd)) * 100 : 0,
      fee_amount: commission,
      fee_asset: side === "BUY" ? assetCode : "USDT",
      net_asset_change: side === "BUY" ? qty - (commissionAsset === assetCode ? commission : 0) : qty,
      net_usdt_change: side === "SELL" ? grossUsd - (commissionAsset === "USDT" ? commission : 0) : grossUsd,
      status: "PENDING_APPROVAL",
      spot_trade_id: t.id,
      metadata: {
        source: "SPOT_TRADE_SYNC",
        synced_by: "sync-spot-trades-cron",
        binance_symbol: t.symbol,
        binance_order_id: t.binance_order_id || null,
        fill_ids: t._fill_ids || [t.id],
        trade_source: t.source,
        trade_time: t.trade_time,
      },
    };
  });

  const spotTradeIds = rows.map((r) => r.spot_trade_id).filter(Boolean);
  if (spotTradeIds.length) {
    await svc.from("erp_product_conversions").delete().in("spot_trade_id", spotTradeIds).eq("status", "REJECTED");
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error } = await svc.from("erp_product_conversions").insert(chunk);
    if (error) throw new Error(`conversion insert failed: ${error.message}`);
    inserted += chunk.length;
  }
  return inserted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const perAccount: any[] = [];
  try {
    const { data: accounts } = await svc
      .from("terminal_exchange_accounts")
      .select("id")
      .eq("is_active", true);
    const accountIds = (accounts || []).map((a: any) => a.id);
    if (!accountIds.length) accountIds.push(PRIMARY_ACCOUNT_ID);

    for (const accountId of accountIds) {
      try {
        const imported = await importTradesForAccount(accountId);
        perAccount.push({ accountId, imported });
      } catch (e) {
        perAccount.push({ accountId, error: (e as Error).message });
      }
    }

    const inserted = await bookPendingConversions();
    console.info(`sync-spot-trades: pending conversions created=${inserted}`);

    return new Response(JSON.stringify({ ok: true, accounts: perAccount, pending_conversions_created: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("sync-spot-trades error:", (error as Error).message);
    return new Response(JSON.stringify({ ok: false, accounts: perAccount, error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
