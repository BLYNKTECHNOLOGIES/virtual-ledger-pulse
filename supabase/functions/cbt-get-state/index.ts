import { admin, authAttempt, buildState, corsHeaders, fail } from "../_shared/cbt.ts";
import { json } from "../_shared/cbt.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = admin();
    const auth = await authAttempt(req, db);
    if (!auth.ok) return auth.response;
    return json(await buildState(db, auth.attempt.id));
  } catch (e) {
    return fail("server_error", String((e as Error).message ?? e), 500);
  }
});
