// copilot-suggest — JWT-gated, 8s budget.
// ALL order context arrives from the CLIENT. This function performs ZERO
// database order lookups. It only: (1) gates on settings + operator allowlist,
// (2) retrieves style exemplars, (3) makes ONE Lovable-AI call for suggestions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { classifySituation, detectLanguage, embedCopilot } from "../_shared/copilot.ts";

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

// Trigram Jaccard similarity (same semantics as the trainer dedupe).
function trigrams(input: string): Set<string> {
  const words = (input || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const set = new Set<string>();
  for (const w of words) {
    const padded = `  ${w} `;
    for (let i = 0; i + 3 <= padded.length; i++) set.add(padded.slice(i, i + 3));
  }
  return set;
}
function sim(a: string, b: string): number {
  const ta = trigrams(a), tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return inter / (ta.size + tb.size - inter);
}

const SYSTEM_PROMPT = `You are a P2P crypto trading desk chat copilot. You draft short reply options an operator can send to a counterparty on Binance P2P.

You are given: the ORDER (from the client app), the CLIENT PROFILE, the last messages, and EXEMPLARS (real past replies from expert operators for this kind of situation).

LAWS — non-negotiable:
- Ground ONLY in the provided order, messages, profile, and exemplars. Never invent facts.
- The exemplars define TONE and PHRASING — mimic that expert style; do not copy verbatim.
- Match the counterparty's language exactly (English / Hindi / Hinglish as used in the messages).
- Each suggestion <= 220 characters.
- NEVER promise to release coins/crypto before payment is verified.
- NEVER invent payment details, UTR/reference numbers, amounts, or UPI IDs.
- NEVER move the conversation off-platform (no WhatsApp/Telegram/phone/email).
- Suggestions must be mutually distinct in wording and intent.
- Do not repeat what the operator already said.

Return STRICT JSON only, no prose:
{"situation":"<one of the situation classes>","suggestions":["...","..."]}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

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
      .from("copilot_settings").select("*").limit(1).maybeSingle();

    if (!settings?.enabled) return json({ error: "Copilot disabled" }, 403);
    const allow: string[] = settings.operator_allowlist || [];
    if (!allow.includes(caller.id)) return json({ error: "Not permitted" }, 403);

    const body = await req.json().catch(() => ({}));
    const order = body?.order || {};
    const clientProfile = body?.clientProfile || {};
    const messages: Array<{ isSelf: boolean; text: string; time?: string }> =
      Array.isArray(body?.messages) ? body.messages.slice(-10) : [];

    const lastCounterparty = [...messages].reverse().find((m) => !m.isSelf && m.text);
    const situation = classifySituation(lastCounterparty?.text || messages[messages.length - 1]?.text);
    const side = order?.side ? String(order.side).toUpperCase() : null;
    const cpLang = detectLanguage(lastCounterparty?.text || "");

    // Retrieve exemplars (embedding cosine when available; RPC falls back to
    // recency when embeddings are null). Best-effort — never fatal.
    const convoBlob = messages.map((m) => `${m.isSelf ? "Operator" : "Counterparty"}: ${m.text}`).join("\n");
    const qEmbed = await embedCopilot(convoBlob || situation);
    let exemplars: any[] = [];
    try {
      const { data: ex } = await admin.rpc("match_copilot_exemplars", {
        query_embedding: qEmbed ? `[${qEmbed.join(",")}]` : null,
        p_situation_class: situation,
        p_side: side,
        match_count: 5,
      });
      exemplars = ex || [];
    } catch { exemplars = []; }

    const exemplarText = exemplars.length
      ? exemplars.map((e, i) => `EX${i + 1} [${e.language || "en"}]: ${e.reply_text}`).join("\n")
      : "(no exemplars yet — rely on the laws and be concise/professional)";

    const userMsg = `ORDER: ${JSON.stringify(order)}
CLIENT PROFILE: ${JSON.stringify(clientProfile)}
COUNTERPARTY LANGUAGE: ${cpLang}
SITUATION: ${situation}

RECENT MESSAGES:
${convoBlob || "(none)"}

EXEMPLARS (expert style to mimic):
${exemplarText}

Produce up to ${settings.suggestion_count} distinct suggestion(s) as strict json.`;

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "AI unavailable" }, 500);

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Lovable-API-Key": key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
      }),
    });

    if (aiResp.status === 429) return json({ error: "Rate limited" }, 429);
    if (aiResp.status === 402) return json({ error: "AI credits exhausted" }, 402);
    if (!aiResp.ok) return json({ error: `AI error ${aiResp.status}` }, 502);

    const aiData = await aiResp.json();
    let parsed: any = {};
    try { parsed = JSON.parse(aiData?.choices?.[0]?.message?.content || "{}"); } catch { parsed = {}; }

    let suggestions: string[] = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.filter((s: any) => typeof s === "string" && s.trim()).map((s: string) => s.trim().slice(0, 220))
      : [];

    // Drop suggestions too similar to operator's last 3 sent messages (>85% similar = <15% different).
    const lastSent = messages.filter((m) => m.isSelf && m.text).slice(-3).map((m) => m.text);
    const distinct: string[] = [];
    for (const s of suggestions) {
      if (lastSent.some((prev) => sim(s, prev) > 0.85)) continue;      // too close to what op already sent
      if (distinct.some((d) => sim(s, d) > 0.85)) continue;            // near-duplicate of another suggestion
      distinct.push(s);
    }

    return json({
      situation: typeof parsed?.situation === "string" ? parsed.situation : situation,
      suggestions: distinct.slice(0, settings.suggestion_count),
    });
  } catch (e) {
    const msg = (e as Error)?.name === "AbortError" ? "timeout" : String((e as Error).message || e);
    return json({ error: msg }, msg === "timeout" ? 504 : 500);
  } finally {
    clearTimeout(timer);
  }
});
