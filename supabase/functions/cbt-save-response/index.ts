import { z } from "https://esm.sh/zod@3.23.8";
import { admin, authAttempt, corsHeaders, fail, json, rateLimit } from "../_shared/cbt.ts";

const Schema = z.object({
  item_id: z.string().uuid(),
  response: z.record(z.any()).nullable().optional(),
  marked_for_review: z.boolean().optional(),
  visited: z.boolean().optional(),
}).strict();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = admin();
    const auth = await authAttempt(req, db);
    if (!auth.ok) return auth.response;
    const attempt = auth.attempt;
    if (!(await rateLimit(db, `save:${attempt.id}`, 120, 1))) {
      return fail("rate_limited", "Please slow down and try again.", 429);
    }
    if (attempt.status !== "in_progress") {
      return fail("late", "Time is up for this section. Your answers were submitted.", 409);
    }
    const parsed = Schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return fail("invalid", "That answer could not be saved.", 400);
    const b = parsed.data;

    const { data: item } = await db
      .from("cbt_attempt_items")
      .select("id, attempt_section_id, cbt_attempt_sections!inner(id, attempt_id, status, deadline_at, section_type)")
      .eq("id", b.item_id)
      .maybeSingle();
    const section = (item as any)?.cbt_attempt_sections;
    if (!item || section?.attempt_id !== attempt.id) {
      return fail("not_found", "That question is not part of your test.", 404);
    }
    if (section.status !== "in_progress") {
      return fail("late", "Time is up for this section. Your answers were submitted.", 409);
    }
    const { data: settings } = await db.from("cbt_settings").select("deadline_grace_seconds").eq("id", true).single();
    const grace = (settings?.deadline_grace_seconds ?? 5) * 1000;
    if (section.deadline_at && Date.now() > new Date(section.deadline_at).getTime() + grace) {
      return fail("late", "Time is up for this section. Your answers were submitted.", 409);
    }

    // written answers are capped at 2000 characters (S8)
    let response = b.response ?? null;
    if (response && typeof (response as any).text === "string") {
      response = { ...(response as any), text: String((response as any).text).slice(0, 2000) };
    }

    const patch: Record<string, unknown> = { visited: true };
    if (b.response !== undefined) {
      patch.response = response;
      patch.answered_at = response ? new Date().toISOString() : null;
    }
    if (b.marked_for_review !== undefined) patch.marked_for_review = b.marked_for_review;
    await db.from("cbt_attempt_items").update(patch).eq("id", b.item_id);

    return json({ ok: true, saved_item_id: b.item_id });
  } catch (e) {
    return fail("server_error", String((e as Error).message ?? e), 500);
  }
});
