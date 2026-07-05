// copilot-train — hourly cron + manual invoke.
// Learns exemplar replies from operators in the trainer allowlist.
// Batched 2000 messages/run using copilot_settings.train_watermark.
// NO server-side "look up an order to answer" — this only mines historical
// operator replies to build a style/phrasing corpus.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  classifySituation,
  detectLanguage,
  embedCopilot,
  outcomeWeight,
  toPgVector,
  SITUATION_CLASSES,
} from "../_shared/copilot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH = 2000;
const CONTEXT_LIMIT = 6;
const DEDUPE_THRESHOLD = 0.9;

// Postgres pg_trgm-compatible trigram similarity (word-padded 3-grams, Jaccard).
function trigrams(input: string): Set<string> {
  const words = (input || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const set = new Set<string>();
  for (const w of words) {
    const padded = `  ${w} `;
    for (let i = 0; i + 3 <= padded.length; i++) set.add(padded.slice(i, i + 3));
  }
  return set;
}
function trgmSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const g of a) if (b.has(g)) inter++;
  return inter / (a.size + b.size - inter);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: settings } = await admin
      .from("copilot_settings").select("*").limit(1).maybeSingle();
    if (!settings) return json({ error: "no settings row" }, 500);

    const trainers: string[] = settings.trainer_allowlist || [];
    if (trainers.length === 0) return json({ processed: 0, skipped: 0, inserted: 0, note: "no trainers configured" });

    // Optional rebuild: exemplars are derived data — safe to truncate and re-tag.
    const reqBody = await req.json().catch(() => ({}));
    if (reqBody?.rebuild === true) {
      const { error: delErr } = await admin.from("copilot_exemplars").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (delErr) throw delErr;
      await admin.from("copilot_settings")
        .update({ train_watermark: "1970-01-01T00:00:00Z", exemplar_count: 0 }).eq("id", settings.id);
      settings.train_watermark = "1970-01-01T00:00:00Z";
    }

    const watermark: string = settings.train_watermark || "1970-01-01T00:00:00Z";

    // 1) Candidate operator replies newer than watermark (ascending, batched).
    const { data: replies, error: rErr } = await admin
      .from("binance_order_chat_messages")
      .select("id, order_number, message_text, binance_created_at, binance_create_time, exchange_account_id")
      .eq("sender_is_self", true)
      .eq("is_system_message", false)
      .eq("is_recall", false)
      .not("message_text", "is", null)
      .gt("binance_created_at", watermark)
      .order("binance_created_at", { ascending: true })
      .limit(BATCH);
    if (rErr) throw rErr;
    if (!replies || replies.length === 0) return json({ processed: 0, skipped: 0, inserted: 0 });

    const newWatermark = replies[replies.length - 1].binance_created_at;
    const orderNumbers = [...new Set(replies.map((r) => r.order_number))];

    // 2) Assignments → keep only orders handled by a trainer operator.
    const { data: assigns } = await admin
      .from("terminal_order_assignments")
      .select("order_number, assigned_to, trade_type")
      .in("order_number", orderNumbers);
    const orderOperator = new Map<string, { op: string; side: string | null }>();
    for (const a of assigns || []) {
      if (!orderOperator.has(a.order_number)) {
        orderOperator.set(a.order_number, { op: a.assigned_to, side: a.trade_type || null });
      }
    }
    const trainerSet = new Set(trainers);

    // 3) All messages for these orders (for role-tagged context).
    const { data: allMsgs } = await admin
      .from("binance_order_chat_messages")
      .select("id, order_number, sender_is_self, message_text, is_system_message, binance_create_time")
      .in("order_number", orderNumbers)
      .order("binance_create_time", { ascending: true });
    const byOrder = new Map<string, any[]>();
    for (const m of allMsgs || []) {
      if (!byOrder.has(m.order_number)) byOrder.set(m.order_number, []);
      byOrder.get(m.order_number)!.push(m);
    }

    // 4) Order meta (best-effort) from purchase/sales sync.
    const [{ data: buys }, { data: sells }] = await Promise.all([
      admin.from("terminal_purchase_sync").select("binance_order_number, counterparty_name, order_data").in("binance_order_number", orderNumbers),
      admin.from("terminal_sales_sync").select("binance_order_number, counterparty_name, contact_number, order_data").in("binance_order_number", orderNumbers),
    ]);
    const metaMap = new Map<string, any>();
    for (const b of buys || []) metaMap.set(b.binance_order_number, { name: b.counterparty_name, ...(b.order_data && typeof b.order_data === "object" ? b.order_data : {}) });
    for (const s of sells || []) if (!metaMap.has(s.binance_order_number)) metaMap.set(s.binance_order_number, { name: s.counterparty_name, contact: s.contact_number, ...(s.order_data && typeof s.order_data === "object" ? s.order_data : {}) });

    // 5) Existing exemplars grouped by class for trigram dedupe.
    const existingByClass = new Map<string, Set<string>[]>();
    {
      let from = 0;
      while (true) {
        const { data: ex } = await admin
          .from("copilot_exemplars").select("situation_class, reply_text")
          .range(from, from + 999);
        if (!ex || ex.length === 0) break;
        for (const e of ex) {
          if (!existingByClass.has(e.situation_class)) existingByClass.set(e.situation_class, []);
          existingByClass.get(e.situation_class)!.push(trigrams(e.reply_text));
        }
        if (ex.length < 1000) break;
        from += 1000;
      }
    }

    let processed = 0, skipped = 0, inserted = 0;
    const rows: any[] = [];
    // In-run dedupe buckets (so 2000 near-identical replies don't all insert).
    const runByClass = new Map<string, Set<string>[]>();

    for (const r of replies) {
      const reply = (r.message_text || "").trim();
      if (!reply) { skipped++; continue; }
      const info = orderOperator.get(r.order_number);
      if (!info || !trainerSet.has(info.op)) { skipped++; continue; }
      processed++;

      // context = previous <=6 non-system messages before this reply.
      const msgs = byOrder.get(r.order_number) || [];
      const idx = msgs.findIndex((m) => m.id === r.id);
      const preceding = (idx > 0 ? msgs.slice(0, idx) : [])
        .filter((m) => !m.is_system_message && m.message_text)
        .slice(-CONTEXT_LIMIT);
      const context_text = preceding
        .map((m) => `${m.sender_is_self ? "Operator" : "Counterparty"}: ${m.message_text}`)
        .join("\n");
      const lastCounterparty = [...preceding].reverse().find((m) => !m.sender_is_self);

      const situation_class = classifySituation(lastCounterparty?.message_text || reply);
      const language = detectLanguage(reply);
      const side = info.side;
      const rTri = trigrams(reply);

      // Dedupe vs existing + within-run.
      const dupIn = (buckets?: Set<string>[]) =>
        (buckets || []).some((t) => trgmSimilarity(rTri, t) > DEDUPE_THRESHOLD);
      if (dupIn(existingByClass.get(situation_class)) || dupIn(runByClass.get(situation_class))) {
        skipped++; continue;
      }
      if (!runByClass.has(situation_class)) runByClass.set(situation_class, []);
      runByClass.get(situation_class)!.push(rTri);

      const embedding = await embedCopilot(`${context_text}\n${reply}`.trim());
      rows.push({
        situation_class,
        side,
        context_text: context_text || null,
        reply_text: reply,
        language,
        order_meta: metaMap.get(r.order_number) || {},
        source_operator: info.op,
        exchange_account_id: r.exchange_account_id || null,
        embedding: embedding ? toPgVector(embedding) : null,
      });
      inserted++;
    }

    if (rows.length > 0) {
      const { error: insErr } = await admin.from("copilot_exemplars").insert(rows);
      if (insErr) throw insErr;
    }

    const { count } = await admin
      .from("copilot_exemplars").select("id", { count: "exact", head: true });

    await admin.from("copilot_settings").update({
      train_watermark: newWatermark,
      exemplar_count: count ?? (settings.exemplar_count + inserted),
    }).eq("id", settings.id);

    return json({ processed, skipped, inserted, watermark: newWatermark, exemplar_count: count });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
