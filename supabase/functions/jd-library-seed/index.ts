// One-off maintenance function: uploads split Job Description PDFs into the
// private "job-descriptions" bucket and registers them in hr_job_descriptions.
// Protected by the JD_SEED_KEY secret (no public JWT auth).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-seed-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const key = req.headers.get("x-seed-key");
  if (!key || key !== Deno.env.get("JD_SEED_KEY")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { path, contentBase64, meta } = body as {
      path: string;
      contentBase64: string;
      meta?: Record<string, unknown> | null;
    };
    if (!path || !contentBase64) throw new Error("path and contentBase64 required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const bin = Uint8Array.from(atob(contentBase64), (c) => c.charCodeAt(0));
    const { error: upErr } = await supabase.storage
      .from("job-descriptions")
      .upload(path, bin, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

    let row: unknown = null;
    if (meta) {
      const { data, error } = await supabase
        .from("hr_job_descriptions")
        .upsert({ ...meta, storage_path: path }, { onConflict: "reference" })
        .select("id, role_title, reference, position_id")
        .single();
      if (error) throw error;
      row = data;
    }

    return new Response(JSON.stringify({ ok: true, path, row }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
