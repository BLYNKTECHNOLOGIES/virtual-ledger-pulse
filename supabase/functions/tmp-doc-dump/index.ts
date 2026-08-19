// TEMPORARY maintenance function: read / replace / delete stored HR documents.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.searchParams.get("path") || "";
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (req.method === "POST") {
    const action = url.searchParams.get("action");
    if (action === "delete") {
      const { error } = await admin.storage.from("hr-doc-issued").remove([path]);
      return new Response(JSON.stringify({ ok: !error, error: error?.message }));
    }
    const body = new Uint8Array(await req.arrayBuffer());
    const { error } = await admin.storage.from("hr-doc-issued").upload(path, body, {
      contentType: req.headers.get("x-content-type") || "application/octet-stream",
      upsert: true,
    });
    return new Response(JSON.stringify({ ok: !error, error: error?.message, size: body.length }));
  }

  const { data, error } = await admin.storage.from("hr-doc-issued").download(path);
  if (error || !data) return new Response(JSON.stringify({ error: error?.message }), { status: 404 });
  return new Response(await data.arrayBuffer(), { headers: { "content-type": "application/octet-stream" } });
});
