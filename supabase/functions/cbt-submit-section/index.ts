import { admin, authAttempt, buildState, corsHeaders, fail, json } from "../_shared/cbt.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = admin();
    const auth = await authAttempt(req, db);
    if (!auth.ok) return auth.response;
    const attempt = auth.attempt;
    const { section_id } = await req.json().catch(() => ({}));

    const { data: section } = await db.from("cbt_attempt_sections").select("*").eq("id", section_id).eq("attempt_id", attempt.id).maybeSingle();
    if (!section) return fail("not_found", "That section is not part of your test.", 404);

    if (section.status === "in_progress") {
      await db.from("cbt_attempt_sections").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", section.id);
      await db.rpc("cbt_score_section", { p_section_id: section.id });
    }

    // enter the next section (transition screen); the timer starts on Start now or by sweep
    const { data: next } = await db.from("cbt_attempt_sections")
      .select("*").eq("attempt_id", attempt.id).eq("status", "pending")
      .order("order_index").limit(1).maybeSingle();
    if (next) {
      if (!next.entered_at) {
        await db.from("cbt_attempt_sections").update({ entered_at: new Date().toISOString() }).eq("id", next.id);
      }
      await db.from("cbt_attempts").update({ current_section_index: next.order_index }).eq("id", attempt.id);
    } else {
      await db.from("cbt_attempts").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", attempt.id);
    }
    await db.rpc("cbt_finalize_attempt", { p_attempt_id: attempt.id });

    return json(await buildState(db, attempt.id));
  } catch (e) {
    return fail("server_error", String((e as Error).message ?? e), 500);
  }
});
