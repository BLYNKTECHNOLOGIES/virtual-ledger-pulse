import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import manifest from "./manifest.json" with { type: "json" };

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) return new Response("Missing server configuration", { status: 500 });
  const auth = req.headers.get("Authorization") ?? "";
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: userData } = await caller.auth.getUser();
  if (!userData.user) return new Response("Unauthorized", { status: 401 });
  const { data: isHr } = await caller.rpc("hr_is_hr_staff", { _user_id: userData.user.id });
  if (!isHr) return new Response("HR permission required", { status: 403 });
  const supabase = createClient(supabaseUrl, serviceKey);
  const local = "Blynk_Job_Description_Compendium_v4.2.pdf";
  const remote = "v4.2-2026/Blynk_Job_Description_Compendium_v4.2.pdf";
  const bytes = await Deno.readFile(new URL(`./pdfs/${local}`, import.meta.url));
  const { error } = await supabase.storage.from("job-descriptions").upload(remote, bytes, { contentType: "application/pdf", upsert: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, version: "4.2", pages: 182, full_compendium: remote });
});
