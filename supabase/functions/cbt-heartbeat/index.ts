import { admin, authAttempt, corsHeaders, fail, json, rateLimit } from "../_shared/cbt.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = admin();
    const auth = await authAttempt(req, db);
    if (!auth.ok) return auth.response;
    const attempt = auth.attempt;
    if (!(await rateLimit(db, `beat:${attempt.id}`, 120, 1))) {
      return fail("rate_limited", "Please slow down and try again.", 429);
    }
    await db.from("cbt_attempts").update({ last_heartbeat_at: new Date().toISOString() }).eq("id", attempt.id);

    const { data: sections } = await db.from("cbt_attempt_sections")
      .select("id, order_index, section_code, section_type, status, entered_at, started_at, deadline_at")
      .eq("attempt_id", attempt.id).order("order_index");
    const current = (sections ?? []).find((s) => s.status === "in_progress")
      ?? (sections ?? []).find((s) => s.status === "pending") ?? null;

    return json({
      ok: true,
      attempt_status: attempt.status,
      warning_count: attempt.warning_count,
      current_section: current,
      sections: (sections ?? []).map((s) => ({ id: s.id, order_index: s.order_index, status: s.status })),
    });
  } catch (e) {
    return fail("server_error", String((e as Error).message ?? e), 500);
  }
});
