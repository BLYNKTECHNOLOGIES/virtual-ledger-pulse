// Terminal order collector — server-side fetch of Binance P2P active orders.
//
// Started once per minute by pg_cron (x-scheduler-secret auth). Each run stays
// awake up to ~52 seconds and polls Binance every ~4.5s while accounts have
// active orders. The idle/failure cadence is also ~4.5s so that newly arriving
// orders appear in the cache within the 5s appearance target.
// Results are upserted into public.terminal_active_orders_cache (raw payload
// preserved) and a heartbeat is written to public.terminal_collector_state so
// the UI can warn when data is stale.
//
// Binance endpoint: POST /sapi/v1/c2c/orderMatch/listOrders (official C2C API),
// reached through the same shared proxy + per-account credentials as binance-ads.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { resolveAccount, listActiveAccounts, proxyHeadersFor } from "../_shared/binance-account.ts";

const RUN_BUDGET_MS = 52_000;
const ACTIVE_TICK_MS = 4_500;
const IDLE_TICK_MS = 4_500;
const MAX_CONSECUTIVE_FAILURES = 5;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractOrders(result: any): any[] {
  const d = result?.data;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d)) return d;
  return [];
}

function orderNumberOf(order: any): string {
  return String(order?.orderNumber ?? order?.orderNo ?? order?.adOrderNo ?? "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return jsonResponse({ error: "Missing Supabase configuration" }, 500);

  // Auth: internal scheduler secret OR service-role bearer only. No user callers.
  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceRole = authHeader.replace(/^Bearer\s+/i, "").trim() === SERVICE_KEY;
  const schedulerSecret = req.headers.get("x-scheduler-secret") || "";
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let isScheduler = false;
  if (schedulerSecret) {
    const { data } = await admin
      .from("app_scheduler_secrets")
      .select("secret_value")
      .eq("name", "internal_cron")
      .maybeSingle();
    isScheduler = !!data?.secret_value && data.secret_value === schedulerSecret;
  }
  // Manual single-tick mode (used by the UI "refresh" path) skips the long loop.
  let singleTick = false;
  try {
    const body = await req.json();
    singleTick = body?.mode === "single";
  } catch { /* empty body is fine */ }

  // Signed-in terminal users may request ONE immediate tick (the Refresh button);
  // only the scheduler/service role may start the long polling loop.
  let isSignedInUser = false;
  if (!isServiceRole && !isScheduler && authHeader) {
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    isSignedInUser = !!userData?.user;
  }
  if (!isServiceRole && !isScheduler && !(isSignedInUser && singleTick)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const startedAt = Date.now();
  const heartbeat = async (status: string, detail: Record<string, unknown>) => {
    await admin.from("terminal_collector_state").upsert({
      id: "active_orders",
      last_tick_at: new Date().toISOString(),
      last_status: status,
      detail,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
  };

  let accounts;
  try {
    accounts = await listActiveAccounts();
  } catch (err) {
    await heartbeat("error", { error: String((err as Error)?.message || err) });
    return jsonResponse({ error: "Failed to list exchange accounts" }, 500);
  }
  if (!accounts || accounts.length === 0) {
    accounts = [{ id: "00000000-0000-0000-0000-000000000001", account_name: "Primary", credential_key: "default", is_default: true, is_active: true }];
  }

  let consecutiveFailures = 0;
  let tickCount = 0;
  let lastTotalOrders = 0;

  const runTick = async (): Promise<{ totalOrders: number; failed: boolean }> => {
    let totalOrders = 0;
    let anyFailure = false;

    for (const account of accounts) {
      try {
        const resolved = await resolveAccount(account.id);
        const headers = proxyHeadersFor(resolved);
        const url = `${resolved.proxyUrl}/api/sapi/v1/c2c/orderMatch/listOrders`;

        // Binance caps this endpoint's page size (20 rows in practice), so walk
        // a few pages to be sure recent orders are never crowded out by older
        // completed/cancelled rows on page 1.
        const PAGE_ROWS = 50;
        const MAX_PAGES = 3;
        const orders: any[] = [];
        let pageFailed = false;
        for (let page = 1; page <= MAX_PAGES; page++) {
          const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({ page, rows: PAGE_ROWS }),
          });
          const text = await response.text();
          let result: any;
          try { result = JSON.parse(text); } catch { result = { raw: text }; }

          if (!response.ok || (result?.code && result.code !== "000000")) {
            // 429 / 5xx: back off via the idle cadence on the next tick.
            if (page === 1) pageFailed = true;
            console.warn(`collector tick failed for ${resolved.accountName} page ${page}:`, response.status, text.substring(0, 300));
            break;
          }

          const pageOrders = extractOrders(result);
          orders.push(...pageOrders);
          if (pageOrders.length === 0) break;
        }
        if (pageFailed) {
          anyFailure = true;
          continue;
        }

        totalOrders += orders.length;

        const now = new Date().toISOString();
        const seenNumbers = new Set<string>();
        const rows = [];
        for (const order of orders) {
          const orderNumber = orderNumberOf(order);
          if (!orderNumber) continue;
          seenNumbers.add(orderNumber);
          rows.push({
            exchange_account_id: resolved.id,
            order_number: orderNumber,
            raw: order,
            order_status: order?.orderStatus != null ? String(order.orderStatus) : null,
            updated_at: now,
          });
        }

        if (rows.length > 0) {
          const { error } = await admin
            .from("terminal_active_orders_cache")
            .upsert(rows, { onConflict: "exchange_account_id,order_number" });
          if (error) throw error;
        }

        // Remove cached orders for this account that Binance no longer reports
        // as active (completed/cancelled since last tick).
        const { data: existing } = await admin
          .from("terminal_active_orders_cache")
          .select("order_number")
          .eq("exchange_account_id", resolved.id);
        const stale = (existing || [])
          .map((r: any) => r.order_number as string)
          .filter((n: string) => !seenNumbers.has(n));
        if (stale.length > 0) {
          await admin
            .from("terminal_active_orders_cache")
            .delete()
            .eq("exchange_account_id", resolved.id)
            .in("order_number", stale);
        }
      } catch (err) {
        anyFailure = true;
        console.warn(`collector tick error for account ${account.id}:`, err);
      }
    }
    return { totalOrders, failed: anyFailure };
  };

  try {
    while (true) {
      const { totalOrders, failed } = await runTick();
      tickCount += 1;
      lastTotalOrders = totalOrders;
      consecutiveFailures = failed ? consecutiveFailures + 1 : 0;
      await heartbeat(failed ? "degraded" : "ok", {
        ticks: tickCount,
        activeOrders: totalOrders,
        accounts: accounts.length,
        consecutiveFailures,
      });

      if (singleTick) break;
      if (Date.now() - startedAt > RUN_BUDGET_MS) break;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await heartbeat("error", { error: "5 consecutive tick failures — circuit open", ticks: tickCount });
        break;
      }

      const idle = totalOrders === 0 || failed;
      await sleep(idle ? IDLE_TICK_MS : ACTIVE_TICK_MS);
      if (Date.now() - startedAt > RUN_BUDGET_MS) break;
    }
  } catch (err) {
    await heartbeat("error", { error: String((err as Error)?.message || err), ticks: tickCount });
    return jsonResponse({ error: "Collector run failed" }, 500);
  }

  return jsonResponse({
    code: "000000",
    data: { ticks: tickCount, activeOrders: lastTotalOrders, durationMs: Date.now() - startedAt },
  });
});
