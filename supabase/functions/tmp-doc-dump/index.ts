// TEMPORARY debug function: streams a stored HR document for inspection.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.searchParams.get("path") || "";
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await admin.storage.from("hr-doc-issued").download(path);
  if (error || !data) return new Response(JSON.stringify({ error: error?.message }), { status: 404 });
  return new Response(await data.arrayBuffer(), { headers: { "content-type": "application/octet-stream" } });
});
