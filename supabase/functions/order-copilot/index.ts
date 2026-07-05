import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// EASILY-EDITABLE P2P MERCHANT PLAYBOOK — change wording here to tune behavior.
// ============================================================================
const SYSTEM_PROMPT = `You are an assistant to a P2P crypto desk operator trading INR <-> USDT. You suggest replies the OPERATOR will send to the counterparty. Be professional, brief, firm-but-polite.

LANGUAGE: Detect the counterparty's language from the transcript (English / Hindi / Hinglish) and write ALL suggestions in that same language and script.

HARD RULES (never break):
- Never promise or imply crypto release before payment is verified as received.
- Never invent, alter, or state payment details, UTRs, or amounts that are not present in the provided order data.
- Never suggest moving communication or payment off-platform.
- Never share personal contact info.
- Third-party payments (payer name != counterparty name) must be politely refused per policy, with clear refund-path phrasing.
- Never admit fault or make legal statements.
- De-escalate abuse; never mirror it.

SITUATIONS to handle when detected:
- Buyer claims paid but no UTR/proof -> politely request UTR + exact amount.
- Wrong amount received -> state expected vs received, ask for the difference or offer a refund path.
- Payment delayed / bank server down -> acknowledge, state the order timer, ask for an ETA.
- Release pressure / threats / appeal threats -> stay calm, restate the verification requirement, invite the appeal process.
- Seller side (our BUY orders) -> confirm payment-sent details and share the reference.
- Silent counterparty near expiry -> nudge with time remaining.
- Suspected fraud (rushed pressure + fresh account + mismatched name) -> set risk=high and suggest a cautious verification reply.

Ground EVERY suggestion ONLY in the provided order/chat/history data. Keep each suggestion under 220 characters.

OUTPUT: Respond with STRICT JSON only, no markdown, matching exactly:
{"situation":"one-line read of what's happening","risk":"none|caution|high","risk_reason":"short reason","suggestions":["reply 1","reply 2"],"next_action":"one line for the operator"}`;

// ----------------------------------------------------------------------------
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller & resolve user id (for per-user quick-reply style reference)
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    let body: any = {};
    try { body = await req.json(); } catch { /* noop */ }
    const orderId = String(body?.orderId || "").trim();
    const orderNumber = String(body?.orderNumber || "").trim();
    if (!orderId && !orderNumber) return json({ error: "orderId is required" }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);

    // Resolve the order. `orderId` from the client is the display record id, which
    // for LIVE (unsynced) Binance orders is the numeric Binance order number, not
    // a UUID. Querying a uuid column with that value errors, so we look up by
    // binance_order_number whenever we have one, and only use `id` when it is a
    // real UUID.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const byNumber = orderNumber || (!UUID_RE.test(orderId) ? orderId : "");
    const byId = UUID_RE.test(orderId) ? orderId : "";

    // 1) Order
    const orderSelect = "id, binance_order_number, counterparty_id, counterparty_nickname, trade_type, asset, fiat_unit, amount, total_price, unit_price, order_status, pay_method_name, binance_create_time, synced_at, completed_at, cancelled_at, additional_kyc_verify, appeal_status, exchange_account_id";
    const orderQuery = supabase.from("p2p_order_records").select(orderSelect);
    const { data: order, error: orderErr } = await (
      byNumber ? orderQuery.eq("binance_order_number", byNumber) : orderQuery.eq("id", byId)
    ).maybeSingle();
    if (orderErr) { console.error("order-copilot order lookup error", orderErr); return json({ error: "Order lookup failed" }, 500); }
    if (!order) return json({ error: "Order not found" }, 404);


    // 2) Last 25 chat messages of this order
    const { data: chatRows } = await supabase
      .from("binance_order_chat_messages")
      .select("sender_is_self, sender_nickname, message_text, message_type, is_system_message, binance_create_time")
      .eq("order_number", order.binance_order_number)
      .order("binance_create_time", { ascending: false })
      .limit(25);
    const messages = (chatRows || []).slice().reverse();

    // 3) Counterparty history (reuse PastInteractionsPanel query source)
    let pastCount = 0;
    let completedCount = 0;
    let appealCount = 0;
    let recent: any[] = [];
    if (order.counterparty_id) {
      const { data: pastOrders } = await supabase
        .from("p2p_order_records")
        .select("trade_type, asset, amount, total_price, order_status, appeal_status, binance_create_time")
        .eq("counterparty_id", order.counterparty_id)
        .neq("id", orderId)
        .order("binance_create_time", { ascending: false })
        .limit(50);
      const rows = pastOrders || [];
      pastCount = rows.length;
      for (const r of rows) {
        const st = String(r.order_status || "").toUpperCase();
        if (st.includes("COMPLETE")) completedCount++;
        if (r.appeal_status || st.includes("APPEAL")) appealCount++;
      }
      recent = rows
        .filter((r) => {
          const st = String(r.order_status || "").toUpperCase();
          return st.includes("COMPLETE") || st.includes("CANCEL") || st.includes("APPEAL");
        })
        .slice(0, 5)
        .map((r) => ({
          side: r.trade_type,
          amount: r.amount,
          asset: r.asset,
          inr: r.total_price,
          status: r.order_status,
        }));
    }

    // 4) Requesting operator's per-user quick replies (style reference only)
    const { data: quickReplies } = await supabase
      .from("p2p_quick_replies")
      .select("label, message_text")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("sort_order")
      .limit(15);

    // ---- Build one prompt ----
    const nowMs = Date.now();
    const createdMs = order.binance_create_time ? Number(order.binance_create_time) : null;
    const ageMin = createdMs ? Math.round((nowMs - createdMs) / 60000) : null;

    const orderSummary = {
      side: order.trade_type,
      status: order.order_status,
      appeal_status: order.appeal_status || null,
      asset: order.asset,
      fiat: order.fiat_unit,
      fiat_amount: order.total_price,
      asset_qty: order.amount,
      rate: order.unit_price,
      payment_method: order.pay_method_name,
      kyc_state: order.additional_kyc_verify ?? 0,
      order_age_minutes: ageMin,
    };
    const transcript = messages
      .map((m) => {
        const who = m.is_system_message ? "SYSTEM" : m.sender_is_self ? "OPERATOR" : "COUNTERPARTY";
        const txt = (m.message_text || (m.message_type && m.message_type !== "text" ? `[${m.message_type}]` : "")) || "";
        return `${who}: ${txt}`;
      })
      .filter((l) => l.trim().length > 5)
      .join("\n");

    const userPrompt = `ORDER:\n${JSON.stringify(orderSummary, null, 2)}\n\nCOUNTERPARTY HISTORY:\n- total past orders: ${pastCount}\n- completed: ${completedCount}\n- appeals: ${appealCount}\n- recent resolved: ${JSON.stringify(recent)}\n\nOPERATOR QUICK-REPLY STYLE (reference only, do not copy verbatim):\n${(quickReplies || []).map((q) => `- ${q.label}: ${q.message_text}`).join("\n") || "(none)"}\n\nCHAT TRANSCRIPT (oldest->newest):\n${transcript || "(no messages yet)"}`;

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ error: "AI not configured" }, 500);

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("order-copilot AI error", aiResp.status, txt);
      if (aiResp.status === 429) return json({ error: "AI rate limit. Try again in a minute." }, 429);
      if (aiResp.status === 402) return json({ error: "AI credits exhausted. Contact admin." }, 402);
      return json({ error: "AI gateway error" }, 500);
    }

    const aiJson = await aiResp.json();
    const raw = aiJson?.choices?.[0]?.message?.content || "";

    // Defensive parse
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* noop */ } }
    }

    const validRisk = ["none", "caution", "high"];
    const risk = validRisk.includes(parsed?.risk) ? parsed.risk : "none";
    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.filter((s: unknown) => typeof s === "string" && s.trim()).slice(0, 3).map((s: string) => s.slice(0, 220))
      : [];

    return json({
      situation: typeof parsed?.situation === "string" ? parsed.situation : "",
      risk,
      risk_reason: typeof parsed?.risk_reason === "string" ? parsed.risk_reason : "",
      suggestions,
      next_action: typeof parsed?.next_action === "string" ? parsed.next_action : "",
    });
  } catch (error) {
    console.error("order-copilot error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
