import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import manifest from "./manifest.json" with { type: "json" };

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) return new Response("Missing server configuration", { status: 500 });
  const token = req.headers.get("x-update-token") ?? "";
  if (token !== "JD42-182P-41R-SEP22") return new Response("Unauthorized", { status: 401 });
  const supabase = createClient(supabaseUrl, serviceKey);
  for (const row of manifest) {
    const local = row.storage_path.split("/").at(-1) ?? "";
    const bytes = await Deno.readFile(new URL(`./pdfs/${local}`, import.meta.url));
    const { error: uploadError } = await supabase.storage.from("job-descriptions").upload(row.storage_path, bytes, { contentType: "application/pdf", upsert: true });
    if (uploadError) return Response.json({ error: `Upload failed for ${row.reference}: ${uploadError.message}` }, { status: 500 });
    const { data: existing, error: findError } = await supabase.from("hr_job_descriptions").select("id,position_id").eq("reference", row.reference).maybeSingle();
    if (findError) return Response.json({ error: findError.message }, { status: 500 });
    const payload = { ...row, source_document: "Blynk Job Description Compendium v4.2 (BVT/HR/JD/2026/COMP-01)", is_active: true, position_id: existing?.position_id ?? null };
    const result = existing ? await supabase.from("hr_job_descriptions").update(payload).eq("id", existing.id) : await supabase.from("hr_job_descriptions").insert(payload);
    if (result.error) return Response.json({ error: `Database update failed for ${row.reference}: ${result.error.message}` }, { status: 500 });
  }
  return Response.json({ ok: true, version: "4.2", roles: manifest.length });
});
