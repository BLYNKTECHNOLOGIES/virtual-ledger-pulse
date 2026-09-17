import { z } from "https://esm.sh/zod@3.23.8";
import { admin, authAttempt, corsHeaders, fail, json, rateLimit } from "../_shared/cbt.ts";

const Schema = z.object({
  section_id: z.string().uuid(),
  committed_words: z.array(z.string().max(80)).max(1000),
  keystrokes: z.number().int().min(0).optional(),
  backspaces: z.number().int().min(0).optional(),
  finished: z.boolean().optional(),
}).strict();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = admin();
    const auth = await authAttempt(req, db);
    if (!auth.ok) return auth.response;
    const attempt = auth.attempt;
    if (!(await rateLimit(db, `typing:${attempt.id}`, 120, 1))) {
      return fail("rate_limited", "Please slow down and try again.", 429);
    }
    const parsed = Schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return fail("invalid", "That sync could not be saved.", 400);
    const b = parsed.data;

    const { data: section } = await db.from("cbt_attempt_sections").select("*").eq("id", b.section_id).eq("attempt_id", attempt.id).maybeSingle();
    if (!section || section.section_type !== "typing") return fail("not_found", "That section is not part of your test.", 404);
    if (section.status !== "in_progress") {
      return fail("late", "Time is up for this section. Your answers were submitted.", 409);
    }
    const { data: settings } = await db.from("cbt_settings").select("deadline_grace_seconds").eq("id", true).single();
    const grace = (settings?.deadline_grace_seconds ?? 5) * 1000;
    if (section.deadline_at && Date.now() > new Date(section.deadline_at).getTime() + grace) {
      return fail("late", "Time is up for this section. Your answers were submitted.", 409);
    }

    const metrics = (section.metrics ?? {}) as Record<string, any>;
    const stored: string[] = Array.isArray(metrics.committed_words) ? metrics.committed_words : [];
    // the sync must EXTEND the stored array (prefix match) — never rewrite it
    if (b.committed_words.length < stored.length) {
      return fail("conflict", "Your typing has already been recorded up to a later word.", 409);
    }
    for (let i = 0; i < stored.length; i++) {
      if (stored[i] !== b.committed_words[i]) {
        return fail("conflict", "Your typing has already been recorded up to a later word.", 409);
      }
    }

    const startedAt = section.started_at ? new Date(section.started_at).getTime() : Date.now();
    const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const added = b.committed_words.slice(stored.length);
    const addedChars = added.reduce((n, w) => n + w.length + 1, 0);

    // burst detection (server view): more than 200 WPM implied by this sync
    const prevElapsed = Number(metrics.elapsed_seconds ?? 0);
    const deltaSeconds = Math.max(1, elapsed - prevElapsed);
    const impliedWpm = (addedChars / 5) / (deltaSeconds / 60);
    if (impliedWpm > 200) {
      await db.from("cbt_proctor_events").insert({
        attempt_id: attempt.id, event_type: "burst_input",
        meta: { implied_wpm: Math.round(impliedWpm), words: added.length, seconds: deltaSeconds },
      });
    }

    // net WPM per 15-second bucket, from the server receive time
    const timeline: any[] = Array.isArray(metrics.wpm_timeline) ? metrics.wpm_timeline : [];
    timeline.push({ at_second: elapsed, bucket: Math.floor(elapsed / 15), words: b.committed_words.length });

    await db.from("cbt_attempt_sections").update({
      metrics: {
        ...metrics,
        committed_words: b.committed_words,
        elapsed_seconds: elapsed,
        keystrokes: b.keystrokes ?? metrics.keystrokes ?? 0,
        backspaces: b.backspaces ?? metrics.backspaces ?? 0,
        wpm_timeline: timeline.slice(-400),
      },
    }).eq("id", section.id);

    return json({ ok: true, words_stored: b.committed_words.length, elapsed_seconds: elapsed });
  } catch (e) {
    return fail("server_error", String((e as Error).message ?? e), 500);
  }
});
