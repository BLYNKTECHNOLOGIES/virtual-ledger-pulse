import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { listActiveAccounts, proxyHeadersFor, resolveAccount } from "../_shared/binance-account.ts";
import { persistChatMessages } from "../_shared/binance-chat.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RUN_BUDGET_MS = 55_000;
const TICK_MS = 5_000;
const ORDERS_PER_ACCOUNT_PER_TICK = 3;
const MAX_PAGES = 2;
const ROWS = 50;
const MIN_RESYNC_GAP_MS = 15_000;
const RECENT_ORDER_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function explicitOrderNumberFromObject(value: any): string | null {
  if (!value || typeof value !== "object") return null;
  // For chat frames topicId is the authoritative order-scoped thread. Some
  // frames retain a stale orderNo from an earlier order with the same person.
  const direct =
    value.topicId ?? value.orderNumber ?? value.orderNo ?? value.adOrderNo ?? value.order_number ?? value.order?.orderNo ?? null;
  return direct === null || direct === undefined || direct === "" ? null : String(direct);
}

function payloadMatchesOrder(value: any, expectedOrderNo: string): boolean {
  const explicitOrderNo = explicitOrderNumberFromObject(value);
  return !explicitOrderNo || explicitOrderNo === expectedOrderNo;
}

function extractChatMessages(result: any): any[] {
  const outer = result?.data ?? result;
  if (Array.isArray(outer)) return outer;
  if (Array.isArray(outer?.messages)) return outer.messages;
  if (Array.isArray(outer?.list)) return outer.list;
  if (Array.isArray(outer?.data)) return outer.data;
  return [];
}

async function fetchWithRetry(url: string, init: RequestInit, retries = 2): Promise<Response> {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status >= 500 && i < retries) {
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (i < retries) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

async function syncOrderChat(
  supabase: ReturnType<typeof createClient>,
  accountId: string,
  orderNo: string,
  proxyHeaders: Record<string, string>,
  proxyUrl: string,
) {
  const allMessages: any[] = [];
  let page = 1;
  while (page <= MAX_PAGES) {
    const chatParams = new URLSearchParams({ orderNo, page: String(page), rows: String(ROWS), sort: "desc" });
    const chatUrl = `${proxyUrl}/api/sapi/v1/c2c/chat/retrieveChatMessagesWithPagination?${chatParams.toString()}`;
    const response = await fetchWithRetry(chatUrl, { method: "GET", headers: proxyHeaders });
    const text = await response.text();
    let pageResult: any;
    try {
      pageResult = JSON.parse(text);
    } catch {
      pageResult = { raw: text, status: response.status };
    }
    const pageMessages = extractChatMessages(pageResult).filter((msg) => payloadMatchesOrder(msg, orderNo));
    allMessages.push(...pageMessages);
    if (pageMessages.length < ROWS) break;
    page++;
  }

  const seen = new Set<string>();
  const deduped = allMessages.filter((msg) => {
    const key = String(
      msg?.id || msg?.uuid || `${msg?.createTime}-${msg?.type}-${msg?.content || msg?.message || ""}`,
    );
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const archive = await persistChatMessages(supabase, orderNo, deduped, accountId, "sweep_backstop");
  return { orderNo, ...archive };
}

async function updateHeartbeat(supabase: ReturnType<typeof createClient>, payload: any) {
  try {
    const { error } = await supabase
      .from("terminal_collector_state")
      .upsert({
        id: "chat_sweep",
        last_tick_at: new Date().toISOString(),
        last_status: String(payload.status || "unknown"),
        detail: payload,
        updated_at: new Date().toISOString(),
      });
    if (error) throw error;
  } catch (err) {
    console.warn("chat sweep heartbeat failed:", err);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Missing Supabase configuration" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Single-order mode: called by the terminal_active_orders_cache trigger
  // when a chatUnreadCount increases. Sync just that order and return.
  let singleOrderNo: string | null = null;
  let singleAccountId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.orderNo) singleOrderNo = String(body.orderNo);
    if (body?.exchangeAccountId) singleAccountId = String(body.exchangeAccountId);
  } catch {
    // ignore body parse errors; fall back to full sweep
  }

  if (singleOrderNo && singleAccountId) {
    try {
      const account = await resolveAccount(singleAccountId);
      const result = await syncOrderChat(supabase, account.id, singleOrderNo, proxyHeadersFor(account), account.proxyUrl);
      return new Response(JSON.stringify({ ok: true, mode: "single", orderNo: singleOrderNo, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err: any) {
      console.warn("single-order chat sweep failed", singleOrderNo, err);
      return new Response(JSON.stringify({ error: String(err?.message || err) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const startedAt = Date.now();
  const lastSyncByOrder = new Map<string, number>();
  const cursorByAccount = new Map<string, number>();
  let ticks = 0;
  let totalSynced = 0;
  let totalErrors = 0;

  try {
    await updateHeartbeat(supabase, { status: "running", started_at: new Date().toISOString() });

    while (Date.now() - startedAt < RUN_BUDGET_MS) {
      ticks++;
      const tickStartedAt = Date.now();
      const accounts = await listActiveAccounts();

      for (const accountRow of accounts) {
        let account: Awaited<ReturnType<typeof resolveAccount>>;
        try {
          account = await resolveAccount(accountRow.id);
        } catch (err) {
          console.warn("chat sweep skipping account", accountRow.id, err);
          totalErrors++;
          continue;
        }

        // Binance's chatUnreadCount is unreliable and commonly returns zero
        // while human messages are waiting. Rotate through every recent active
        // order instead, one order per account per five-second tick. This keeps
        // the persistent listener as the primary path while guaranteeing a
        // bounded recovery path without trusting the broken unread flag.
        const { data: recentRows, error: cacheErr } = await supabase
          .from("terminal_active_orders_cache")
          .select("order_number, raw")
          .eq("exchange_account_id", account.id)
          .order("updated_at", { ascending: false })
          .limit(250);

        if (cacheErr) {
          console.warn("chat sweep cache query failed:", cacheErr);
          totalErrors++;
          continue;
        }

        const recentCutoff = Date.now() - RECENT_ORDER_WINDOW_MS;
        const eligibleOrders = (recentRows || [])
          .filter((row: any) => {
            // Counterparties routinely keep chatting on completed/older orders,
            // so only drop rows we can prove are outside the window. Rows with
            // no usable createTime stay eligible.
            const createTime = Number(row.raw?.createTime || row.raw?.create_time || 0);
            if (!Number.isFinite(createTime) || createTime <= 0) return true;
            return createTime >= recentCutoff;
          })
          .map((r: any) => String(r.order_number || ''))
          .filter((orderNo) => /^\d{8,32}$/.test(orderNo))
          .filter((orderNo) => {
            const last = lastSyncByOrder.get(orderNo) || 0;
            return Date.now() - last >= MIN_RESYNC_GAP_MS;
          });

        const startIndex = eligibleOrders.length > 0
          ? (cursorByAccount.get(account.id) || 0) % eligibleOrders.length
          : 0;
        const selectedOrders = eligibleOrders.length > 0
          ? Array.from({ length: Math.min(ORDERS_PER_ACCOUNT_PER_TICK, eligibleOrders.length) }, (_, offset) =>
              eligibleOrders[(startIndex + offset) % eligibleOrders.length]
            )
          : [];
        if (eligibleOrders.length > 0) {
          cursorByAccount.set(account.id, (startIndex + selectedOrders.length) % eligibleOrders.length);
        }

        for (const orderNo of selectedOrders) {
          try {
            const result = await syncOrderChat(supabase, account.id, orderNo, proxyHeadersFor(account), account.proxyUrl);
            lastSyncByOrder.set(orderNo, Date.now());
            totalSynced++;
            if (result.inserted > 0) {
              console.log("chat sweep backfilled", orderNo, result);
            }
          } catch (err) {
            console.warn("chat sweep failed for", orderNo, err);
            totalErrors++;
          }
        }
      }

      await updateHeartbeat(supabase, {
        status: "running",
        ticks,
        total_synced: totalSynced,
        total_errors: totalErrors,
        last_tick_at: new Date().toISOString(),
      });

      const elapsed = Date.now() - tickStartedAt;
      const sleepMs = Math.max(500, TICK_MS - elapsed);
      await new Promise((r) => setTimeout(r, sleepMs));
    }

    await updateHeartbeat(supabase, {
      status: "completed",
      ticks,
      total_synced: totalSynced,
      total_errors: totalErrors,
      finished_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ ok: true, ticks, totalSynced, totalErrors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    await updateHeartbeat(supabase, { status: "error", error: String(err?.message || err) });
    return new Response(
      JSON.stringify({ error: String(err?.message || err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
