import { embedText, toPgVector } from "../_shared/embed.ts";
import { requireAuth } from "../_shared/require-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAuth(req, { corsHeaders, permission: "help_assistant_manage" });
    if (!auth.ok) return auth.response;
    const supabase = auth.admin;

    const { type, id } = await req.json();
    if (!["faq", "document"].includes(type) || !id) {
      return json({ error: "type ('faq'|'document') and id required" }, 400);
    }

    if (type === "faq") {
      const { data: faq, error } = await supabase
        .from("kb_faqs")
        .select("id, question, answer")
        .eq("id", id)
        .maybeSingle();
      if (error || !faq) return json({ error: "FAQ not found" }, 404);

      const text = `Q: ${faq.question}\nA: ${faq.answer}`;
      const vec = await embedText(text);
      const { error: upErr } = await supabase
        .from("kb_faqs")
        .update({ embedding: toPgVector(vec) as any })
        .eq("id", id);
      if (upErr) throw upErr;
      return json({ ok: true });
    }

    // document: re-embed all chunks lacking an embedding
    const { data: chunks, error } = await supabase
      .from("kb_document_chunks")
      .select("id, chunk_text")
      .eq("document_id", id)
      .is("embedding", null);
    if (error) throw error;
    let updated = 0;
    for (const c of chunks ?? []) {
      try {
        const vec = await embedText(c.chunk_text);
        await supabase
          .from("kb_document_chunks")
          .update({ embedding: toPgVector(vec) as any })
          .eq("id", c.id);
        updated++;
      } catch (e) {
        console.error("chunk embed failed", c.id, e);
      }
    }
    await supabase.from("kb_documents").update({ status: "ready" }).eq("id", id);
    return json({ ok: true, embedded: updated });
  } catch (e) {
    console.error("kb-embed error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
