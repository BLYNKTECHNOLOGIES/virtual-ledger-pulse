import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { embedText, toPgVector } from "../_shared/embed.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LANG_DIRECTIVE: Record<string, string> = {
  en: "Respond in clear professional English.",
  hi: "हिन्दी (Devanagari script) में स्पष्ट और सरल भाषा में उत्तर दें।",
  hinglish:
    "Reply in Hinglish — Roman-script Hindi mixed naturally with English, like an Indian office colleague would speak. Keep technical terms in English.",
};

const SYSTEM_PROMPT_BASE = `You are the Help Assistant for Blynkex ERP staff. You answer internal questions about company processes, SOPs, ERP workflows, compliance procedures, and tools.

STRICT RULES:
- Answer ONLY from the "KNOWLEDGE BASE CONTEXT" below.
- If the context does not cover the question, say so honestly and suggest the staff contact the relevant team (Compliance, Operations, HR, etc.).
- NEVER invent procedures, SOPs, financial figures, or policies.
- Cite sources inline like [1], [2] referring to the numbered context items.
- Keep answers concise, structured (bullet points, steps, headings), and practical.
- If an image is attached, describe what you see and tie it back to the question.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const {
      conversationId,
      message,
      imageUrls = [] as string[],
      language = "en",
    } = body ?? {};

    if (!message && (!Array.isArray(imageUrls) || imageUrls.length === 0)) {
      return json({ error: "message or images required" }, 400);
    }
    const lang = ["en", "hi", "hinglish"].includes(language) ? language : "en";

    // ----- Rate limit: 30 / hour -----
    const windowStart = new Date();
    windowStart.setMinutes(0, 0, 0);
    const { data: rl } = await admin
      .from("staff_chat_rate_limit")
      .select("message_count")
      .eq("user_id", user.id)
      .eq("window_start", windowStart.toISOString())
      .maybeSingle();
    if ((rl?.message_count ?? 0) >= 30) {
      return json({ error: "Hourly limit reached. Try again later." }, 429);
    }

    // ----- Conversation -----
    let convId = conversationId as string | undefined;
    if (!convId) {
      const title = (message ?? "Image question").slice(0, 60);
      const { data: conv, error: convErr } = await admin
        .from("staff_chat_conversations")
        .insert({ user_id: user.id, title, language: lang })
        .select("id").single();
      if (convErr) throw convErr;
      convId = conv.id;
    } else {
      await admin.from("staff_chat_conversations")
        .update({ updated_at: new Date().toISOString(), language: lang })
        .eq("id", convId).eq("user_id", user.id);
    }

    // Persist user message
    await admin.from("staff_chat_messages").insert({
      conversation_id: convId,
      user_id: user.id,
      role: "user",
      content: message ?? "",
      image_urls: imageUrls,
    });

    // ----- Retrieve KB context -----
    let contextItems: Array<{ n: number; title: string; content: string; sourceType: string; parentId: string }> = [];
    let contextBlock = "(No knowledge base entries matched this question.)";
    try {
      if (message && message.trim().length > 0) {
        const qVec = await embedText(message);
        const { data: matches } = await admin.rpc("match_kb", {
          query_embedding: toPgVector(qVec) as any,
          match_count: 6,
          similarity_threshold: 0.45,
        });
        if (Array.isArray(matches) && matches.length > 0) {
          contextItems = matches.map((m: any, i: number) => ({
            n: i + 1,
            title: m.title,
            content: m.content,
            sourceType: m.source_type,
            parentId: m.parent_id,
          }));
          contextBlock = contextItems
            .map((c) => `[${c.n}] (${c.sourceType}) ${c.title}\n${c.content}`)
            .join("\n\n---\n\n");
        }
      }
    } catch (e) {
      console.error("KB retrieval failed", e);
    }

    // ----- Recent history -----
    const { data: history } = await admin
      .from("staff_chat_messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(20);

    const systemPrompt =
      `${SYSTEM_PROMPT_BASE}\n\n${LANG_DIRECTIVE[lang]}\n\nKNOWLEDGE BASE CONTEXT:\n${contextBlock}`;

    const messages: any[] = [{ role: "system", content: systemPrompt }];
    for (const h of history ?? []) {
      if (h.role === "system") continue;
      messages.push({ role: h.role, content: h.content });
    }
    // current user turn — multimodal if images
    if (Array.isArray(imageUrls) && imageUrls.length > 0) {
      const parts: any[] = [{ type: "text", text: message || "Please analyse the attached image(s)." }];
      for (const url of imageUrls.slice(0, 3)) {
        parts.push({ type: "image_url", image_url: { url } });
      }
      // replace last user message (already added) with multimodal version
      messages.push({ role: "user", content: parts });
    }

    // ----- Call Lovable AI (streaming) -----
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        stream: true,
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI gateway error", aiResp.status, txt);
      if (aiResp.status === 429) return json({ error: "AI rate limit. Try again in a minute." }, 429);
      if (aiResp.status === 402) return json({ error: "AI credits exhausted. Please contact admin." }, 402);
      return json({ error: "AI gateway error" }, 500);
    }

    // Bump rate limit
    await admin.from("staff_chat_rate_limit").upsert({
      user_id: user.id,
      window_start: windowStart.toISOString(),
      message_count: (rl?.message_count ?? 0) + 1,
    }, { onConflict: "user_id,window_start" });

    // Stream + capture
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let assistantText = "";

    const stream = new ReadableStream({
      async start(controller) {
        // emit metadata first
        controller.enqueue(encoder.encode(
          `event: meta\ndata: ${JSON.stringify({ conversationId: convId, sources: contextItems })}\n\n`
        ));

        const reader = aiResp.body!.getReader();
        let buf = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let nl;
            while ((nl = buf.indexOf("\n")) !== -1) {
              let line = buf.slice(0, nl);
              buf = buf.slice(nl + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) continue;
              const json = line.slice(6).trim();
              if (json === "[DONE]") continue;
              try {
                const parsed = JSON.parse(json);
                const delta = parsed?.choices?.[0]?.delta?.content;
                if (delta) {
                  assistantText += delta;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
                }
              } catch {
                buf = line + "\n" + buf;
                break;
              }
            }
          }
        } catch (e) {
          console.error("stream read error", e);
        } finally {
          // Persist assistant message
          await admin.from("staff_chat_messages").insert({
            conversation_id: convId,
            user_id: user.id,
            role: "assistant",
            content: assistantText,
            sources: contextItems as any,
          });
          controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    console.error("staff-chat error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
