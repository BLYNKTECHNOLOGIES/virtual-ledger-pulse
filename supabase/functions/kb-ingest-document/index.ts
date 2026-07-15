import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { embedText, toPgVector } from "../_shared/embed.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Stage = "queued" | "downloading" | "extracting" | "chunking" | "embedding" | "saving" | "ready" | "failed";

async function extractTextFromFile(
  fileBytes: Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<string> {
  if (mimeType.startsWith("text/") || /\.(txt|md|csv|json)$/i.test(fileName)) {
    return new TextDecoder().decode(fileBytes);
  }
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

  const b64 = btoa(String.fromCharCode(...fileBytes));
  const dataUrl = `data:${mimeType};base64,${b64}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Extract the full readable text from this document. Preserve headings, lists, and table contents. Output plain text only, no commentary." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Document extraction failed [${resp.status}]: ${t}`);
  }
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

function chunkText(text: string, chunkSize = 1500, overlap = 200): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= chunkSize) return [clean];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(i + chunkSize, clean.length);
    let slice = clean.slice(i, end);
    const lastPara = slice.lastIndexOf("\n\n");
    if (lastPara > chunkSize * 0.5 && end < clean.length) slice = slice.slice(0, lastPara);
    chunks.push(slice.trim());
    i += slice.length - overlap;
    if (i <= 0) i = end;
  }
  return chunks.filter((c) => c.length > 20);
}

async function runIngestion(documentId: string) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const updateProgress = async (
    stage: Stage,
    progress: number,
    detail?: string,
    extra: Record<string, unknown> = {},
  ) => {
    await supabase.from("kb_documents").update({
      ingest_stage: stage,
      ingest_progress: Math.max(0, Math.min(100, Math.round(progress))),
      ingest_stage_detail: detail ?? null,
      ingest_updated_at: new Date().toISOString(),
      ...extra,
    }).eq("id", documentId);
  };

  try {
    const { data: doc, error: docErr } = await supabase
      .from("kb_documents").select("*").eq("id", documentId).maybeSingle();
    if (docErr || !doc) throw new Error("Document not found");

    await supabase.from("kb_documents").update({
      status: "processing",
      error_message: null,
      ingest_stage: "queued",
      ingest_progress: 0,
      ingest_stage_detail: "Starting…",
      ingest_total_chunks: 0,
      ingest_done_chunks: 0,
      ingest_started_at: new Date().toISOString(),
      ingest_updated_at: new Date().toISOString(),
    }).eq("id", documentId);

    await updateProgress("downloading", 5, "Fetching file from storage…");
    const { data: fileData, error: dlErr } = await supabase
      .storage.from("kb-documents").download(doc.file_path);
    if (dlErr || !fileData) {
      await supabase.from("kb_documents").update({
        status: "failed", ingest_stage: "failed",
        error_message: dlErr?.message ?? "Download failed",
      }).eq("id", documentId);
      return;
    }
    const bytes = new Uint8Array(await fileData.arrayBuffer());
    await updateProgress("downloading", 15, `Downloaded ${Math.round(bytes.length / 1024)} KB`);

    await updateProgress("extracting", 20, "Extracting text from document…");
    const text = await extractTextFromFile(bytes, doc.title, doc.file_type);
    if (!text || text.trim().length < 20) {
      await supabase.from("kb_documents").update({
        status: "failed", ingest_stage: "failed",
        error_message: "No extractable text",
      }).eq("id", documentId);
      return;
    }
    await updateProgress("extracting", 50, `Extracted ${text.length.toLocaleString()} characters`);

    await updateProgress("chunking", 52, "Splitting into chunks…");
    await supabase.from("kb_document_chunks").delete().eq("document_id", documentId);
    const chunks = chunkText(text);
    await updateProgress("chunking", 55, `Created ${chunks.length} chunks`, {
      ingest_total_chunks: chunks.length,
      ingest_done_chunks: 0,
    });

    let saved = 0;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      try {
        const vec = await embedText(c);
        const { error: insErr } = await supabase.from("kb_document_chunks").insert({
          document_id: documentId,
          chunk_index: i,
          chunk_text: c,
          embedding: toPgVector(vec) as any,
        });
        if (!insErr) saved++;
      } catch (e) {
        console.error("chunk failed", i, e);
      }
      const pct = 55 + Math.round(((i + 1) / chunks.length) * 44);
      if (chunks.length <= 20 || i % 2 === 0 || i === chunks.length - 1) {
        await updateProgress(
          i === chunks.length - 1 ? "saving" : "embedding",
          pct,
          `Embedding chunk ${i + 1} / ${chunks.length}`,
          { ingest_done_chunks: saved },
        );
      }
    }

    await supabase.from("kb_documents").update({
      status: saved > 0 ? "ready" : "failed",
      ingest_stage: saved > 0 ? "ready" : "failed",
      ingest_progress: 100,
      ingest_stage_detail: saved > 0 ? `Indexed ${saved} chunks` : "Embedding failed for all chunks",
      ingest_done_chunks: saved,
      ingest_updated_at: new Date().toISOString(),
      error_message: saved > 0 ? null : "Embedding failed for all chunks",
    }).eq("id", documentId);
  } catch (e) {
    console.error("kb-ingest-document error", e);
    await supabase.from("kb_documents").update({
      status: "failed", ingest_stage: "failed",
      ingest_stage_detail: "Failed",
      ingest_updated_at: new Date().toISOString(),
      error_message: e instanceof Error ? e.message : "Unknown",
    }).eq("id", documentId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { requireAuth } = await import("../_shared/require-auth.ts");
    const auth = await requireAuth(req, { corsHeaders, permission: "help_assistant_manage" });
    if (!auth.ok) return auth.response;

    const { documentId } = await req.json();
    if (!documentId) return json({ error: "documentId required" }, 400);

    // Mark as queued immediately so UI shows progress instantly
    const supabase = auth.admin;
    await supabase.from("kb_documents").update({
      status: "processing",
      ingest_stage: "queued",
      ingest_progress: 1,
      ingest_stage_detail: "Queued…",
      ingest_started_at: new Date().toISOString(),
      ingest_updated_at: new Date().toISOString(),
      error_message: null,
    }).eq("id", documentId);

    // Run ingestion in background — survives past the response
    // @ts-ignore EdgeRuntime is provided by Supabase
    EdgeRuntime.waitUntil(runIngestion(documentId));

    return json({ ok: true, queued: true, documentId }, 202);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
