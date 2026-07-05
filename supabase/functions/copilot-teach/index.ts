// copilot-teach — trainer-only teach controls (item 3).
// Actions: pin (create a pinned golden exemplar), blacklist (ban a phrase),
// list (pinned exemplars + blacklist), remove_exemplar, remove_blacklist.
// JWT-gated; caller must be in copilot_settings.trainer_allowlist.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { classifySituation, detectLanguage, embedCopilot, toPgVector } from "../_shared/copilot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: settings } = await admin
      .from("copilot_settings").select("id, trainer_allowlist").limit(1).maybeSingle();
    const trainers: string[] = settings?.trainer_allowlist || [];
    if (!trainers.includes(caller.id)) return json({ error: "Not permitted" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "list") {
      const [{ data: pinned }, { data: blacklist }] = await Promise.all([
        admin.from("copilot_exemplars")
          .select("id, reply_text, situation_class, side, exchange_account_id, created_at")
          .eq("pinned", true).order("created_at", { ascending: false }).limit(200),
        admin.from("copilot_blacklist")
          .select("id, pattern_text, exchange_account_id, created_at")
          .order("created_at", { ascending: false }).limit(200),
      ]);
      return json({ pinned: pinned || [], blacklist: blacklist || [] });
    }

    if (action === "pin") {
      const replyText = String(body?.replyText || "").trim();
      if (!replyText) return json({ error: "replyText required" }, 400);
      const contextText = String(body?.contextText || "").trim();
      const situation_class = body?.situationClass
        ? String(body.situationClass)
        : classifySituation(body?.lastCounterpartyText || replyText);
      const side = body?.side ? String(body.side).toUpperCase() : null;
      const embedding = await embedCopilot(`${contextText}\n${replyText}`.trim());
      const { data: row, error } = await admin.from("copilot_exemplars").insert({
        situation_class,
        side,
        context_text: contextText || null,
        reply_text: replyText,
        language: detectLanguage(replyText),
        order_meta: {},
        source_operator: caller.id,
        source_order_number: body?.orderNumber || null,
        exchange_account_id: body?.exchangeAccountId || null,
        embedding: embedding ? toPgVector(embedding) : null,
        pinned: true,
        acceptance_score: 1.0,
        outcome_weight: 1.0,
      }).select("id").maybeSingle();
      if (error) throw error;
      const { count } = await admin.from("copilot_exemplars").select("id", { count: "exact", head: true });
      if (settings?.id) await admin.from("copilot_settings").update({ exemplar_count: count ?? 0 }).eq("id", settings.id);
      return json({ ok: true, id: row?.id });
    }

    if (action === "blacklist") {
      const patternText = String(body?.patternText || "").trim();
      if (!patternText) return json({ error: "patternText required" }, 400);
      const { data: row, error } = await admin.from("copilot_blacklist").insert({
        pattern_text: patternText,
        exchange_account_id: body?.exchangeAccountId || null,
        created_by: caller.id,
      }).select("id").maybeSingle();
      if (error) throw error;
      return json({ ok: true, id: row?.id });
    }

    if (action === "remove_exemplar") {
      const id = String(body?.id || "");
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await admin.from("copilot_exemplars").delete().eq("id", id).eq("pinned", true);
      if (error) throw error;
      const { count } = await admin.from("copilot_exemplars").select("id", { count: "exact", head: true });
      if (settings?.id) await admin.from("copilot_settings").update({ exemplar_count: count ?? 0 }).eq("id", settings.id);
      return json({ ok: true });
    }

    if (action === "remove_blacklist") {
      const id = String(body?.id || "");
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await admin.from("copilot_blacklist").delete().eq("id", id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
