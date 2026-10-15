import { admin, authAttempt, buildState, corsHeaders, fail, json, pickQuestions, shuffleOptions } from "../_shared/cbt.ts";
import { LEVEL_DIFFICULTY, LEVEL_ORDER, makeDataEntry, makeMatchPairs, splitSource, type Level } from "../_shared/cbtGenerate.ts";

const rnd = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

// Mental-maths drills get harder as the drill progresses; the answer never leaves the server.
function makeMathsDrill(idx: number, level = "intermediate"): { prompt: string; answer: number } {
  const bump = level === "advanced" ? 1 : level === "beginner" ? -1 : 0;
  const tier = Math.max(0, Math.min(2, (idx < 4 ? 0 : idx < 8 ? 1 : 2) + bump));
  if (tier === 2) return makeHardSum();
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

// QZ7b: the top tier is really harder — bigger numbers, two-step sums and awkward percentages.
function makeHardSum(): { prompt: string; answer: number } {
  const kind = rnd(0, 4);
  if (kind === 0) { const a = rnd(1200, 9800), b = rnd(1200, 9800); return { prompt: `${a} + ${b}`, answer: a + b }; }
  if (kind === 1) { const a = rnd(12, 39), b = rnd(12, 29), c = rnd(105, 899); return { prompt: `${a} × ${b} + ${c}`, answer: a * b + c }; }
  if (kind === 2) {
    const pct = [12.5, 15, 17.5, 35, 45, 65][rnd(0, 5)];
    const base = rnd(6, 96) * 80; // keeps the answer whole for every percentage above
    return { prompt: `${pct}% of ${base}`, answer: (base * pct) / 100 };
  }
  if (kind === 3) { const a = rnd(5200, 9900), b = rnd(1100, a - 900), c = rnd(120, 880); return { prompt: `${a} − ${b} − ${c}`, answer: a - b - c }; }
  const d = rnd(13, 39), q = rnd(21, 89); return { prompt: `${d * q} ÷ ${d}`, answer: q };
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

    // QZ7c: claim the start atomically — only one request builds the sections. A claim older than
    // 2 minutes belongs to a request that died and may be taken over.
    const claimAt = new Date().toISOString();
    const staleBefore = new Date(Date.now() - 120_000).toISOString();
    const { data: claimed } = await db.from("cbt_attempts").update({ start_claimed_at: claimAt })
      .eq("id", attempt.id).eq("status", "registered")
      .or(`start_claimed_at.is.null,start_claimed_at.lt.${staleBefore}`).select("id");
    if (!claimed?.length) {
      // another request is building this test: wait briefly for it, then answer with the running state
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const { data: a } = await db.from("cbt_attempts").select("status").eq("id", attempt.id).single();
        if (a?.status === "in_progress") return json(await buildState(db, attempt.id));
        if (a?.status !== "registered") return fail("not_startable", "This test has already been submitted.", 409);
      }
      return fail("preparing", "Your test is being prepared. Please wait a moment.", 409);
    }
    // our claim must still be ours when we flip (a takeover after 2 minutes changes it)
    const ownClaim = claimAt;

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
        min_words: s.min_words, max_words: s.max_words, skill_level: s.skill_level, item_source: s.item_source ?? "bank",
      })),
    };

    const totalSeconds = roleSections.reduce((n, s) => n + s.duration_seconds, 0);
    const tokenExpires = new Date(
      Date.now() + totalSeconds * 1000 + roleSections.length * (settings?.transition_seconds ?? 60) * 1000 + 60 * 60_000,
    ).toISOString();

    // QZ7b: retry-safe — a start that failed midway left sections behind while the attempt stayed
    // "registered"; clear them and build again. The attempt only becomes in_progress once every section exists.
    const { data: leftovers } = await db.from("cbt_attempt_sections").select("id").eq("attempt_id", attempt.id);
    if (leftovers?.length) {
      const ids = leftovers.map((x: any) => x.id);
      await db.from("cbt_attempt_items").delete().in("attempt_section_id", ids);
      await db.from("cbt_attempt_sections").delete().in("id", ids);
    }

    for (const rs of roleSections) {
      const { data: section, error: secErr } = await db.from("cbt_attempt_sections").insert({
        attempt_id: attempt.id, order_index: rs.order_index, section_code: rs.section_code,
        section_type: rs.section_type, status: "pending",
      }).select("id").single();
      if (secErr || !section) throw new Error("Could not prepare the test sections. Please try again.");

      // ---- select the items for this section ----
      let versionIds: string[] = [];
      const tags: string[] = rs.category_tags ?? [];
      const level = (rs.skill_level ?? "intermediate") as Level;
      const prefer = LEVEL_DIFFICULTY[level] ?? LEVEL_DIFFICULTY.intermediate;
      const levelMix = { [prefer[0]]: 100 };
      const common = { roleCode: role!.code, seenVersionIds: seen, sandbox: drive!.is_sandbox, pool: role!.pool ?? "hiring", prefer };
      let generated: { content: unknown; key: unknown }[] = [];
      let bankRows: any[] = [];

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
        { const { error } = await db.from("cbt_attempt_items").insert(rows as any); if (error) throw new Error("Could not prepare the test items. Please try again."); }
        continue;
      }

      if (rs.section_type === "typing") {
        // serve a passage of the section's level (nearest level if none)
        const ids = await pickQuestions(db, { ...common, types: ["typing_passage"], tags, count: 200, mix: {} });
        if (ids.length) {
          const { data: vs } = await db.from("cbt_question_versions").select("id, content").in("id", ids);
          const order = LEVEL_ORDER[level] ?? LEVEL_ORDER.intermediate;
          const rank = (v: any) => { const i = order.indexOf((v.content?.level ?? "intermediate") as Level); return i < 0 ? 9 : i; };
          const best = Math.min(...(vs ?? []).map(rank));
          const fit = (vs ?? []).filter((v: any) => rank(v) === best);
          const unseen = fit.filter((v: any) => !seen.includes(v.id));
          const from = unseen.length ? unseen : fit;
          versionIds = from.length ? [from[Math.floor(Math.random() * from.length)].id] : [];
        }
      } else if (rs.section_type === "data_entry" || rs.section_type === "match_pairs") {
        const split = splitSource(rs.item_source, Math.max(1, rs.item_count ?? 1));
        if (split.bank) {
          versionIds = await pickQuestions(db, { ...common, types: [rs.section_type === "data_entry" ? "data_entry_record" : "match_pair"], tags, count: split.bank, mix: levelMix });
        }
        // "Both" tops up any bank shortfall with generated items
        const genCount = rs.item_source === "bank" ? 0 : split.generated + (split.bank - versionIds.length);
        if (genCount > 0) {
          generated = rs.section_type === "data_entry"
            ? Array.from({ length: genCount }, () => makeDataEntry(Math.random, level))
            : makeMatchPairs(Math.random, level, genCount);
        }
      } else if (["logical_reasoning", "problem_solving", "pattern_recognition", "grammar", "vocabulary"].includes(rs.section_type)) {
        // Knowledge skills: MCQ bank by subject, difficulty driven by the section level.
        versionIds = await pickQuestions(db, { ...common, types: ["mcq"], tags: tags.length ? tags : [rs.section_type], count: rs.item_count, mix: levelMix });
      } else if (rs.section_type === "written") {
        versionIds = await pickQuestions(db, { ...common, types: ["written"], tags, count: rs.item_count, mix: role!.difficulty_mix ?? {} });
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
        versionIds = await pickQuestions(db, { ...common, types: ["mcq", "numeric", "sjt"], tags, count: rs.item_count, mix: rs.skill_level ? levelMix : (role!.difficulty_mix ?? {}) });
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
        if (!generated.length) { const { error } = await db.from("cbt_attempt_items").insert(rows as any); if (error) throw new Error("Could not prepare the test items. Please try again."); }
        else bankRows = rows;
        // try runs never mark a version as served (so HR rehearsals don't force a new version on edit)
        if (!drive!.is_try_run) {
          await db.from("cbt_question_versions").update({ first_served_at: new Date().toISOString() })
            .in("id", versionIds).is("first_served_at", null);
        }
        // try runs never count towards question statistics
        if (!drive!.is_try_run) await Promise.all((versions ?? []).map((v: any) => db.rpc("cbt_bump_served", { p_question_id: v.question_id })));
        seen.push(...versionIds);
      }
      if (generated.length) {
        // bank and generated items are shuffled together; the key stays server-side in generated_key
        const all: any[] = [...bankRows, ...generated.map((g) => ({
          attempt_section_id: section!.id, generated_content: g.content, generated_key: g.key,
        }))];
        for (let k = all.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [all[k], all[j]] = [all[j], all[k]]; }
        { const { error } = await db.from("cbt_attempt_items").insert(all.map((row, idx) => ({ ...row, display_order: idx + 1 })) as any); if (error) throw new Error("Could not prepare the test items. Please try again."); }
      }
    }

    // every section is in place: only now does the attempt start (a second start request finds it running)
    const { data: flipped } = await db.from("cbt_attempts").update({
      status: "in_progress", blueprint_snapshot: snapshot, started_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(), token_expires_at: tokenExpires, current_section_index: roleSections[0].order_index,
    }).eq("id", attempt.id).eq("status", "registered").eq("start_claimed_at", ownClaim).select("id");
    if (!flipped?.length) return json(await buildState(db, attempt.id));

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
