import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { embedText, toPgVector } from "../_shared/embed.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Lightweight text extraction. PDFs and DOCX are extracted via the AI gateway
// using gemini's multimodal text understanding (avoids native parser deps).
async function extractTextFromFile(
  fileBytes: Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<string> {
  // Plain text / markdown — decode directly
  if (
    mimeType.startsWith("text/") ||
    /\.(txt|md|csv|json)$/i.test(fileName)
  ) {
    return new TextDecoder().decode(fileBytes);
  }

  // For PDF / DOCX — ask gemini to OCR + transcribe
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

  const b64 = btoa(String.fromCharCode(...fileBytes));
  const dataUrl = `data:${mimeType};base64,${b64}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Extract the full readable text from this document. Preserve headings, lists, and table contents. Output plain text only, no commentary.",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
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
    // try to break at paragraph
    const lastPara = slice.lastIndexOf("\n\n");
    if (lastPara > chunkSize * 0.5 && end < clean.length) {
      slice = slice.slice(0, lastPara);
    }
    chunks.push(slice.trim());
    i += slice.length - overlap;
    if (i <= 0) i = end;
  }
  return chunks.filter((c) => c.length > 20);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { documentId } = await req.json();
    if (!documentId) return json({ error: "documentId required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: doc, error: docErr } = await supabase
      .from("kb_documents")
      .select("*")
      .eq("id", documentId)
      .maybeSingle();
    if (docErr || !doc) return json({ error: "Document not found" }, 404);

    await supabase.from("kb_documents").update({ status: "processing", error_message: null })
      .eq("id", documentId);

    const { data: fileData, error: dlErr } = await supabase
      .storage.from("kb-documents").download(doc.file_path);
    if (dlErr || !fileData) {
      await supabase.from("kb_documents").update({
        status: "failed",
        error_message: dlErr?.message ?? "Download failed",
      }).eq("id", documentId);
      return json({ error: "Failed to download file" }, 500);
    }

    const bytes = new Uint8Array(await fileData.arrayBuffer());
    const text = await extractTextFromFile(bytes, doc.title, doc.file_type);
    if (!text || text.trim().length < 20) {
      await supabase.from("kb_documents").update({
        status: "failed",
        error_message: "No extractable text",
      }).eq("id", documentId);
      return json({ error: "No text extracted" }, 422);
    }

    // wipe existing chunks (re-ingest)
    await supabase.from("kb_document_chunks").delete().eq("document_id", documentId);

    const chunks = chunkText(text);
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
    }

    await supabase.from("kb_documents").update({
      status: saved > 0 ? "ready" : "failed",
      error_message: saved > 0 ? null : "Embedding failed for all chunks",
    }).eq("id", documentId);

    return json({ ok: true, chunks: saved });
  } catch (e) {
    console.error("kb-ingest-document error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
