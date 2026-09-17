import { z } from "https://esm.sh/zod@3.23.8";
import { admin, authAttempt, corsHeaders, fail, json } from "../_shared/cbt.ts";

const WARNING_EVENTS = new Set(["fullscreen_exit", "tab_hidden", "window_blur"]);

const Schema = z.object({
  event_type: z.enum([
    "fullscreen_exit", "tab_hidden", "window_blur", "paste_blocked", "copy_blocked",
    "shortcut_blocked", "burst_input", "resume", "second_session",
  ]),
  meta: z.record(z.any()).optional(),
}).strict();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = admin();
    const auth = await authAttempt(req, db);
    if (!auth.ok) return auth.response;
    const attempt = auth.attempt;
    const parsed = Schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return fail("invalid", "That event could not be recorded.", 400);
    const { event_type, meta } = parsed.data;

    await db.from("cbt_proctor_events").insert({ attempt_id: attempt.id, event_type, meta: meta ?? {} });

    let warningCount = attempt.warning_count as number;
    let autoSubmitted = false;
    if (WARNING_EVENTS.has(event_type) && attempt.status === "in_progress") {
      warningCount = warningCount + 1;
      const { data: settings } = await db.from("cbt_settings").select("max_warnings, on_warning_limit").eq("id", true).single();
      await db.from("cbt_attempts").update({ warning_count: warningCount }).eq("id", attempt.id);
      if (settings?.on_warning_limit === "auto_submit" && warningCount > (settings?.max_warnings ?? 3)) {
        await db.from("cbt_attempt_sections").update({ status: "auto_submitted", submitted_at: new Date().toISOString() })
          .eq("attempt_id", attempt.id).in("status", ["pending", "in_progress"]);
        const { data: secs } = await db.from("cbt_attempt_sections").select("id").eq("attempt_id", attempt.id).order("order_index");
        for (const s of secs ?? []) await db.rpc("cbt_score_section", { p_section_id: s.id });
        await db.from("cbt_attempts").update({
          status: "auto_submitted", auto_submit_reason: "warning_limit", submitted_at: new Date().toISOString(),
        }).eq("id", attempt.id);
        await db.rpc("cbt_finalize_attempt", { p_attempt_id: attempt.id });
        autoSubmitted = true;
      }
    }

    return json({
      ok: true, warning_count: warningCount, auto_submitted: autoSubmitted,
      is_warning: WARNING_EVENTS.has(event_type),
    });
  } catch (e) {
    return fail("server_error", String((e as Error).message ?? e), 500);
  }
});
