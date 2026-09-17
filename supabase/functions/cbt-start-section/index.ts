import { admin, authAttempt, buildState, corsHeaders, fail, json } from "../_shared/cbt.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = admin();
    const auth = await authAttempt(req, db);
    if (!auth.ok) return auth.response;
    const attempt = auth.attempt;
    if (attempt.status !== "in_progress") return fail("not_running", "This test is no longer running.", 409);

    const { section_id } = await req.json().catch(() => ({}));
    const { data: section } = await db.from("cbt_attempt_sections").select("*").eq("id", section_id).eq("attempt_id", attempt.id).maybeSingle();
    if (!section) return fail("not_found", "That section is not part of your test.", 404);
    if (section.status === "in_progress") return json(await buildState(db, attempt.id));
    if (section.status !== "pending") return fail("closed", "You can't come back to this section.", 409);

    const cfg = (attempt.blueprint_snapshot?.sections ?? []).find((s: any) => s.order_index === section.order_index) ?? {};
    const { data: ext } = await db.from("cbt_time_extensions").select("seconds").eq("attempt_section_id", section.id);
    const extra = (ext ?? []).reduce((n: number, r: any) => n + Number(r.seconds ?? 0), 0);
    const now = new Date();
    await db.from("cbt_attempt_sections").update({
      status: "in_progress",
      entered_at: section.entered_at ?? now.toISOString(),
      started_at: now.toISOString(),
      deadline_at: new Date(now.getTime() + ((cfg.duration_seconds ?? 300) + extra) * 1000).toISOString(),
    }).eq("id", section.id);
    await db.from("cbt_attempts").update({ current_section_index: section.order_index }).eq("id", attempt.id);

    return json(await buildState(db, attempt.id));
  } catch (e) {
    return fail("server_error", String((e as Error).message ?? e), 500);
  }
});
