// copilot-suggest — JWT-gated, current-order context only.
// ALL order context arrives from the CLIENT. This function performs ZERO
// database order lookups. It gates access, retrieves style exemplars, and calls Lovable AI.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createResponsesCall } from "../_shared/copilot-responses.ts";
import { classifySituation, detectLanguage, goalForStatus } from "../_shared/copilot.ts";

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

You are given: the current ORDER, current-order messages, an optional UNSENT DRAFT, and EXEMPLARS (real past replies from expert operators for this kind of situation).

LAWS — non-negotiable:
- Ground factual claims ONLY in the provided current order and its messages. Never invent facts.
- The exemplars define TONE and PHRASING only — mimic that expert style; never treat them as facts about this order or copy verbatim.
- Match the counterparty's language (English / Hindi / Hinglish); when refining an unsent draft, preserve the operator's intended language.
- Each suggestion <= 220 characters.
- NEVER promise to release coins/crypto before payment is verified.
- NEVER invent payment details, UTR/reference numbers, amounts, or UPI IDs.
- NEVER move the conversation off-platform (no WhatsApp/Telegram/phone/email).
- Suggestions must be mutually distinct in wording and intent.
- Do not repeat what the operator already said.
- When there is an unsent draft, refine or complete THAT draft instead of composing an unrelated reply. Never treat it as a sent message.
- Interpret BUY as our purchase and SELL as our sale. Never imply a Binance payment, release, or verification occurred unless the order or chat confirms it.

Return STRICT JSON only, no prose:
{"situation":"<one of the situation classes>","suggestions":["...","..."]}`;

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
      .from("copilot_settings").select("*").limit(1).maybeSingle();

    if (!settings?.enabled) return json({ error: "Copilot disabled" }, 403);
    const allow: string[] = settings.operator_allowlist || [];
    if (!allow.includes(caller.id)) return json({ error: "Not permitted" }, 403);

    const body = await req.json().catch(() => ({}));
    const order = body?.order && typeof body.order === "object" && !Array.isArray(body.order) ? body.order : {};
    // Only use current-order facts. Names and nickname-based history are not
    // identity-safe here; the chat is already scoped to an order and account.
    const messages: Array<{ isSelf: boolean; text: string }> = Array.isArray(body?.messages)
      ? body.messages.slice(-40).filter((m: unknown) => m && typeof m === "object" && typeof (m as { text?: unknown }).text === "string")
        .map((m: { isSelf?: unknown; text: string }) => ({ isSelf: m.isSelf === true, text: m.text.slice(0, 1000) }))
      : [];
    const draftText = typeof body?.draftText === "string" ? body.draftText.trim().slice(0, 1500) : "";
    if (!order.number || typeof order.number !== "string" || order.number.length > 100) {
      return json({ error: "A valid order is required" }, 400);
    }

    const lastCounterparty = [...messages].reverse().find((m) => !m.isSelf && m.text);
    const situation = classifySituation(lastCounterparty?.text || messages[messages.length - 1]?.text);
    const side = order?.side ? String(order.side).toUpperCase().slice(0, 10) : null;
    const cpLang = detectLanguage(lastCounterparty?.text || "");
    const exchangeAccountId: string | null = typeof body?.exchangeAccountId === "string" ? body.exchangeAccountId : null;
    const accountLabel: string | null = typeof body?.accountLabel === "string" ? body.accountLabel.slice(0, 100) : null;
    const goal = goalForStatus(order?.status);
    const safeOrder = {
      number: order.number,
      side,
      status: typeof order.status === "string" ? order.status.slice(0, 40) : null,
      orderType: typeof order.orderType === "string" ? order.orderType.slice(0, 40) : null,
      asset: typeof order.asset === "string" ? order.asset.slice(0, 15) : null,
      fiat: typeof order.fiat === "string" ? order.fiat.slice(0, 15) : null,
      quantity: typeof order.quantity === "number" || typeof order.quantity === "string" ? String(order.quantity).slice(0, 30) : null,
      amount: typeof order.amount === "number" || typeof order.amount === "string" ? String(order.amount).slice(0, 30) : null,
      price: typeof order.price === "number" || typeof order.price === "string" ? String(order.price).slice(0, 30) : null,
      paymentMethod: typeof order.paymentMethod === "string" ? order.paymentMethod.slice(0, 80) : null,
    };

    // No nickname-based lookup: a masked nickname may belong to unrelated people.
    // Fetch matching style and the blacklist in parallel, without an embedding
    // network call or an all-account fallback before generating the reply.
    const accountId = typeof exchangeAccountId === "string" && /^[0-9a-f-]{36}$/i.test(exchangeAccountId)
      ? exchangeAccountId : null;
    const [blacklistResult, exemplarResult] = await Promise.all([
      admin.from("copilot_blacklist").select("pattern_text, exchange_account_id"),
      admin.rpc("match_copilot_exemplars", {
        query_embedding: null,
        p_situation_class: situation,
        p_side: side,
        match_count: 5,
        p_exchange_account_id: accountId,
      }),
    ]);
    const blacklist: string[] = (blacklistResult.data || [])
      .filter((b: { exchange_account_id: string | null }) => !b.exchange_account_id || b.exchange_account_id === accountId)
      .map((b: { pattern_text: string }) => b.pattern_text).filter(Boolean);
    const exemplars = exemplarResult.data || [];
    const exemplarIds: string[] = exemplars.map((e: any) => e.id).filter(Boolean);
    const convoBlob = messages.map((m) => `${m.isSelf ? "Operations Associate" : "Counterparty"}: ${m.text}`).join("\n");

    const exemplarText = exemplars.length
      ? exemplars.map((e, i) => `EX${i + 1} [${e.language || "en"}]: ${e.reply_text}`).join("\n")
      : "(no exemplars yet — rely on the laws and be concise/professional)";

    const userMsg = `Return a JSON object with situation and suggestions. Keep each suggestion short.\nORDER: ${JSON.stringify(safeOrder)}
UNSENT OPERATOR DRAFT (not delivered to counterparty): ${draftText || "(none)"}
COUNTERPARTY LANGUAGE: ${cpLang}
SITUATION: ${situation}
Current goal: ${goal}

RECENT MESSAGES:
${convoBlob || "(none)"}

EXEMPLARS (expert style to mimic):
${exemplarText}

Produce up to ${settings.suggestion_count} distinct suggestion(s) as strict json.`;

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "AI unavailable" }, 500);

    // Per-account handling context appended to the system prompt.
    const accountNotes = (settings.account_notes && typeof settings.account_notes === "object")
      ? settings.account_notes[exchangeAccountId || ""] : null;
    const accountLines = [
      accountLabel ? `You are replying from the ${accountLabel} account.` : "",
      accountNotes ? `Account handling notes: ${accountNotes}` : "",
    ].filter(Boolean).join("\n");
    const systemContent = accountLines ? `${SYSTEM_PROMPT}\n\n${accountLines}` : SYSTEM_PROMPT;

    const call = createResponsesCall(req, {
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: key,
      model: "openai/gpt-6-astra",
    }, [
      { role: "system", content: systemContent },
      { role: "user", content: userMsg },
    ]);
    const outputText = await call.result.text;
    let parsed: any = {};
    try {
      const clean = outputText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      parsed = JSON.parse(clean);
    } catch { return json({ error: "AI returned an unreadable suggestion" }, 502); }

    let suggestions: string[] = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.filter((s: any) => typeof s === "string" && s.trim()).map((s: string) => s.trim().slice(0, 220))
      : [];

    // Drop suggestions too similar to operator's last 3 sent messages (>85% similar = <15% different).
    const lastSent = messages.filter((m) => m.isSelf && m.text).slice(-3).map((m) => m.text);
    const distinct: string[] = [];
    for (const s of suggestions) {
      if (blacklist.some((p) => sim(s, p) >= 0.8)) continue;           // banned pattern
      if (lastSent.some((prev) => sim(s, prev) > 0.85)) continue;      // too close to what op already sent
      if (distinct.some((d) => sim(s, d) > 0.85)) continue;            // near-duplicate of another suggestion
      distinct.push(s);
    }

    return json({
      situation: typeof parsed?.situation === "string" ? parsed.situation : situation,
      suggestions: distinct.slice(0, settings.suggestion_count),
      exemplarIds,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return new Response(null, { status: 499, headers: corsHeaders });
    const status = Number((e as { statusCode?: number; status?: number })?.statusCode || (e as { status?: number })?.status);
    const safeStatus = [400, 401, 402, 403, 404, 429].includes(status) ? status : 500;
    const message = (e as Error)?.message || "Copilot unavailable";
    console.error("Copilot suggestion failed:", safeStatus, message);
    return json({ error: message }, safeStatus);
  }
});
