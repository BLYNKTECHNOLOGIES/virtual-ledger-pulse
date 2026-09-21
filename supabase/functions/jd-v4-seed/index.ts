// TEMPORARY seeding function: uploads job-description PDFs into the private
// `job-descriptions` bucket with the service role. Delete after seeding.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SEED_TOKEN = "jdv4-8f3a1c-seed-2026";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  if (req.headers.get("x-jd-token") !== SEED_TOKEN) {
    return new Response("forbidden", { status: 403 });
  }
  const path = req.headers.get("x-jd-path");
  if (!path) return new Response("missing x-jd-path", { status: 400 });

  const bytes = new Uint8Array(await req.arrayBuffer());
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error } = await admin.storage
    .from("job-descriptions")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true, path, size: bytes.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
