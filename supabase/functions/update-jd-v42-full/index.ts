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
  const local = "Blynk_Job_Description_Compendium_v4.2.pdf";
  const remote = "v4.2-2026/Blynk_Job_Description_Compendium_v4.2.pdf";
  const bytes = await Deno.readFile(new URL(`./pdfs/${local}`, import.meta.url));
  const { error } = await supabase.storage.from("job-descriptions").upload(remote, bytes, { contentType: "application/pdf", upsert: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, version: "4.2", pages: 182, full_compendium: remote });
});
