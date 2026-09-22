import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import manifest from "./manifest.json" with { type: "json" };

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return new Response("Missing server configuration", { status: 500 });
  const auth = req.headers.get("Authorization") ?? "";
  const caller = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData } = await caller.auth.getUser();
  if (!userData.user) return new Response("Unauthorized", { status: 401 });
  const { data: isHr } = await caller.rpc("hr_is_hr_staff", { _user_id: userData.user.id });
  if (!isHr) return new Response("HR permission required", { status: 403 });
  const supabase = createClient(supabaseUrl, serviceKey);
  const uploads = [
    { local: "Blynk_Job_Description_Compendium_v4.2.pdf", remote: "v4.2-2026/Blynk_Job_Description_Compendium_v4.2.pdf" },
    ...manifest.map((row) => ({ local: row.storage_path.split("/").at(-1) ?? "", remote: row.storage_path })),
  ];
  for (const file of uploads) {
    const bytes = await Deno.readFile(new URL(`./pdfs/${file.local}`, import.meta.url));
    const { error } = await supabase.storage.from("job-descriptions").upload(file.remote, bytes, { contentType: "application/pdf", upsert: true });
    if (error) return Response.json({ error: `Upload failed for ${file.remote}: ${error.message}` }, { status: 500 });
  }
  for (const row of manifest) {
    const { data: existing, error: findError } = await supabase.from("hr_job_descriptions").select("id,position_id").eq("reference", row.reference).maybeSingle();
    if (findError) return Response.json({ error: findError.message }, { status: 500 });
    const payload = { ...row, source_document: "Blynk Job Description Compendium v4.2 (BVT/HR/JD/2026/COMP-01)", is_active: true, position_id: existing?.position_id ?? null };
    const result = existing
      ? await supabase.from("hr_job_descriptions").update(payload).eq("id", existing.id)
      : await supabase.from("hr_job_descriptions").insert(payload);
    if (result.error) return Response.json({ error: `Database update failed for ${row.reference}: ${result.error.message}` }, { status: 500 });
  }
  const refs = manifest.map((row) => row.reference);
  const { error: deactivateError } = await supabase.from("hr_job_descriptions").update({ is_active: false }).not("reference", "in", `(${refs.join(",")})`);
  if (deactivateError) return Response.json({ error: deactivateError.message }, { status: 500 });
  return Response.json({ ok: true, version: "4.2", pages: 182, roles: manifest.length, files: uploads.length });
});
