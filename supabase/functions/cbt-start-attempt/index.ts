import { admin, authAttempt, buildState, corsHeaders, fail, json, pickQuestions, shuffleOptions } from "../_shared/cbt.ts";

const rnd = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

// Mental-maths drills get harder as the drill progresses; the answer never leaves the server.
function makeMathsDrill(idx: number, level = "intermediate"): { prompt: string; answer: number } {
  const bump = level === "advanced" ? 1 : level === "beginner" ? -1 : 0;
  const tier = Math.max(0, Math.min(2, (idx < 4 ? 0 : idx < 8 ? 1 : 2) + bump));
  const kind = rnd(0, tier === 0 ? 2 : 4);
  if (kind === 0) {
    const a = rnd(tier === 0 ? 11 : 120, tier === 0 ? 99 : 980);
    const b = rnd(tier === 0 ? 11 : 120, tier === 0 ? 99 : 980);
    return { prompt: `${a} + ${b}`, answer: a + b };
  }
  if (kind === 1) {
    const a = rnd(tier === 0 ? 30 : 320, tier === 0 ? 99 : 990);
    const b = rnd(10, a - 1);
    return { prompt: `${a} − ${b}`, answer: a - b };
  }
  if (kind === 2) {
    const a = rnd(tier === 0 ? 3 : 12, tier === 0 ? 12 : 29);
    const b = rnd(tier === 0 ? 3 : 11, tier === 0 ? 12 : 19);
    return { prompt: `${a} × ${b}`, answer: a * b };
  }
  if (kind === 3) {
    const pct = [5, 10, 12, 15, 20, 25][rnd(0, 5)];
    const base = rnd(4, 40) * 100;
    return { prompt: `${pct}% of ${base}`, answer: (base * pct) / 100 };
  }
  const b = rnd(3, 19);
  const q = rnd(4, 40);
  return { prompt: `${b * q} ÷ ${b}`, answer: q };
}

// Memory-recall sequences start at 4 characters and grow one character every two items.
function makeMemorySequence(idx: number, level = "intermediate"): string[] {
  const base = level === "advanced" ? 7 : level === "beginner" ? 4 : 5;
  const cap = level === "advanced" ? 9 : level === "beginner" ? 5 : 7;
  const len = Math.min(cap, base + Math.floor(idx / 2));
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length: len }, () => alphabet[rnd(0, alphabet.length - 1)]);
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = admin();
    const auth = await authAttempt(req, db);
    if (!auth.ok) return auth.response;
    const attempt = auth.attempt;

    if (attempt.status === "in_progress") return json(await buildState(db, attempt.id));
    if (attempt.status !== "registered") {
      return fail("not_startable", "This test has already been submitted.", 409);
    }

    const { data: drive } = await db.from("cbt_drives").select("*").eq("id", attempt.drive_id).single();
    const { data: role } = await db.from("cbt_job_roles").select("*").eq("id", attempt.job_role_id).single();
    const { data: settings } = await db.from("cbt_settings").select("*").eq("id", true).single();
    const { data: roleSections } = await db.from("cbt_role_sections").select("*").eq("job_role_id", role!.id).order("order_index");
    if (!roleSections?.length) return fail("no_blueprint", "This test isn't ready yet. Please contact HR.", 409);

    // questions this mobile number has already seen
    const { data: candidate } = await db.from("cbt_candidates").select("mobile").eq("id", attempt.candidate_id).single();
    const { data: seenRows } = await db
      .from("cbt_attempt_items")
      .select("question_version_id, cbt_attempt_sections!inner(attempt_id, cbt_attempts!inner(candidate_id, cbt_candidates!inner(mobile)))")
      .eq("cbt_attempt_sections.cbt_attempts.cbt_candidates.mobile", candidate?.mobile ?? "")
      .limit(2000);
    const seen = (seenRows ?? []).map((r: any) => r.question_version_id);

    const snapshot = {
      role: { id: role!.id, code: role!.code, name: role!.name, shortlist_cutoff: role!.shortlist_cutoff, hold_cutoff: role!.hold_cutoff, difficulty_mix: role!.difficulty_mix },
      captured_at: new Date().toISOString(),
      sections: roleSections.map((s) => ({
        order_index: s.order_index, section_code: s.section_code, section_type: s.section_type,
        title: s.title, category_tags: s.category_tags, item_count: s.item_count,
        duration_seconds: s.duration_seconds, weight: Number(s.weight), negative_mark: Number(s.negative_mark),
        gate_min_score: s.gate_min_score, gate_min_net_wpm: s.gate_min_net_wpm, gate_min_accuracy: s.gate_min_accuracy,
        full_marks_wpm: s.full_marks_wpm, practice_seconds: s.practice_seconds,
        min_words: s.min_words, max_words: s.max_words,
      })),
    };

    const totalSeconds = roleSections.reduce((n, s) => n + s.duration_seconds, 0);
    const tokenExpires = new Date(
      Date.now() + totalSeconds * 1000 + roleSections.length * (settings?.transition_seconds ?? 60) * 1000 + 60 * 60_000,
    ).toISOString();

    await db.from("cbt_attempts").update({
      status: "in_progress", blueprint_snapshot: snapshot, started_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(), token_expires_at: tokenExpires, current_section_index: roleSections[0].order_index,
    }).eq("id", attempt.id);

    for (const rs of roleSections) {
      const { data: section } = await db.from("cbt_attempt_sections").insert({
        attempt_id: attempt.id, order_index: rs.order_index, section_code: rs.section_code,
        section_type: rs.section_type, status: "pending",
      }).select("id").single();

      // ---- select the items for this section ----
      let versionIds: string[] = [];
      const tags: string[] = rs.category_tags ?? [];

      // Skill Box drills: generated fresh per attempt, key stored server-side only
      if (rs.section_type === "mental_maths" || rs.section_type === "memory_recall") {
        const count = Math.max(1, rs.item_count ?? 10);
        const rows = Array.from({ length: count }, (_, idx) => {
          if (rs.section_type === "mental_maths") {
            const drill = makeMathsDrill(idx, rs.skill_level ?? "intermediate");
            return {
              attempt_section_id: section!.id,
              display_order: idx + 1,
              generated_content: { prompt: drill.prompt },
              generated_key: { answer: drill.answer },
            };
          }
          const seq = makeMemorySequence(idx, rs.skill_level ?? "intermediate");
          return {
            attempt_section_id: section!.id,
            display_order: idx + 1,
            generated_content: { sequence: seq, show_seconds: Math.min(12, 3 + Math.floor(seq.length / 2)) },
            generated_key: { sequence: seq },
          };
        });
        await db.from("cbt_attempt_items").insert(rows as any);
        continue;
      }

      if (rs.section_type === "typing") {
        versionIds = await pickQuestions(db, { types: ["typing_passage"], tags: tags.length ? tags : ["typing_passage"], count: 1, mix: role!.difficulty_mix ?? {}, roleCode: role!.code, seenVersionIds: seen, sandbox: drive!.is_sandbox });
      } else if (rs.section_type === "data_entry") {
        versionIds = await pickQuestions(db, { types: ["data_entry_record"], tags: [], count: rs.item_count, mix: role!.difficulty_mix ?? {}, roleCode: role!.code, seenVersionIds: seen, sandbox: drive!.is_sandbox });
      } else if (rs.section_type === "match_pairs") {
        versionIds = await pickQuestions(db, { types: ["match_pair"], tags: [], count: rs.item_count, mix: role!.difficulty_mix ?? {}, roleCode: role!.code, seenVersionIds: seen, sandbox: drive!.is_sandbox });
      } else if (rs.section_type === "written") {
        versionIds = await pickQuestions(db, { types: ["written"], tags, count: rs.item_count, mix: role!.difficulty_mix ?? {}, roleCode: role!.code, seenVersionIds: seen, sandbox: drive!.is_sandbox });
      } else if (tags.includes("reading")) {
        const statuses = drive!.is_sandbox ? ["approved", "needs_review", "draft"] : ["approved"];
        const { data: stimuli } = await db.from("cbt_stimuli").select("id").in("status", statuses).limit(50);
        const stimulus = (stimuli ?? [])[Math.floor(Math.random() * Math.max(1, (stimuli ?? []).length))];
        if (stimulus) {
          const { data: qs } = await db.from("cbt_questions").select("current_version_id")
            .eq("stimulus_id", stimulus.id).in("status", statuses).not("current_version_id", "is", null);
          versionIds = (qs ?? []).map((q: any) => q.current_version_id).slice(0, Math.max(rs.item_count, 5));
        }
      } else {
        versionIds = await pickQuestions(db, { types: ["mcq", "numeric", "sjt"], tags, count: rs.item_count, mix: role!.difficulty_mix ?? {}, roleCode: role!.code, seenVersionIds: seen, sandbox: drive!.is_sandbox });
      }

      if (versionIds.length) {
        const { data: versions } = await db.from("cbt_question_versions").select("id, content, question_id").in("id", versionIds);
        const rows = versionIds.map((vid, idx) => {
          const v = (versions ?? []).find((x: any) => x.id === vid);
          return {
            attempt_section_id: section!.id, question_version_id: vid, display_order: idx + 1,
            option_order: shuffleOptions(v?.content),
          };
        });
        await db.from("cbt_attempt_items").insert(rows as any);
        await db.from("cbt_question_versions").update({ first_served_at: new Date().toISOString() })
          .in("id", versionIds).is("first_served_at", null);
        await Promise.all((versions ?? []).map((v: any) => db.rpc("cbt_bump_served", { p_question_id: v.question_id })));
        seen.push(...versionIds);
      }
    }

    // enter the first section
    const first = roleSections[0];
    const { data: firstSection } = await db.from("cbt_attempt_sections").select("*").eq("attempt_id", attempt.id).eq("order_index", first.order_index).single();
    const nowIso = new Date().toISOString();
    if (first.section_type === "typing") {
      await db.from("cbt_attempt_sections").update({ entered_at: nowIso }).eq("id", firstSection!.id);
    } else {
      await db.from("cbt_attempt_sections").update({
        entered_at: nowIso, started_at: nowIso, status: "in_progress",
        deadline_at: new Date(Date.now() + first.duration_seconds * 1000).toISOString(),
      }).eq("id", firstSection!.id);
    }

    return json(await buildState(db, attempt.id));
  } catch (e) {
    return fail("server_error", String((e as Error).message ?? e), 500);
  }
});
