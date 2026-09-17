// Shared helpers for the Blynk CBT (Quiz) candidate edge functions.
// Candidates never touch tables directly: every call here runs with the service role
// after the attempt token + session nonce have been verified.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-attempt-token, x-session-nonce",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function admin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify({ server_now: new Date().toISOString(), ...(body as object) }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function fail(code: string, message: string, status = 400, extra: Record<string, unknown> = {}) {
  return json({ ok: false, code, message, ...extra }, status);
}

// ---------- crypto ----------
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function randomAccessCode(len = 6): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export function randomDigits(len = 6): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => String(b % 10)).join("");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ba = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

export async function ipHash(req: Request): Promise<string> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const salt = Deno.env.get("CBT_IP_SALT") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "salt";
  return await sha256Hex(`${salt}:${ip}`);
}

// ---------- response sanitiser (S3) ----------
const FORBIDDEN = new Set([
  "correct_option_id", "numeric_answer", "numeric_tolerance", "sjt_scores", "red_flag_option_ids",
  "pair_is_match", "rubric", "explanation", "marks_awarded", "is_correct", "is_red_flag",
  "decision", "decision_reason", "token_hash", "ip_hash", "raw_score", "max_score", "gate_passed",
  "gate_min_score", "gate_min_net_wpm", "gate_min_accuracy",
]);

export function sanitize(value: unknown, allowSectionScores = false): unknown {
  if (Array.isArray(value)) return value.map((v) => sanitize(v, allowSectionScores));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN.has(k)) continue;
      if (k === "normalized_score" && !allowSectionScores) continue;
      if (k === "record" && v && typeof v === "object") {
        // data-entry: `record` is the source document the candidate must copy, not an answer key.
        // The graded key lives in cbt_question_keys, which candidate payloads never read.
        out[k] = v;
        continue;
      }
      out[k] = sanitize(v, allowSectionScores);
    }
    return out;
  }
  return value;
}

// ---------- rate limiting (S6) ----------
export async function rateLimit(
  db: SupabaseClient,
  key: string,
  limit: number,
  windowMinutes: number,
): Promise<boolean> {
  const now = new Date();
  const { data } = await db.from("cbt_rate_limits").select("*").eq("key", key).maybeSingle();
  if (!data) {
    await db.from("cbt_rate_limits").insert({ key, window_start: now.toISOString(), count: 1 });
    return true;
  }
  const started = new Date(data.window_start as string);
  if (now.getTime() - started.getTime() > windowMinutes * 60_000) {
    await db.from("cbt_rate_limits").update({ window_start: now.toISOString(), count: 1 }).eq("key", key);
    return true;
  }
  if ((data.count as number) >= limit) return false;
  await db.from("cbt_rate_limits").update({ count: (data.count as number) + 1 }).eq("key", key);
  return true;
}

// ---------- attempt authentication (S4) ----------
export type AuthedAttempt = { attempt: Record<string, any>; db: SupabaseClient };

export async function authAttempt(req: Request, db: SupabaseClient): Promise<
  { ok: true; attempt: Record<string, any> } | { ok: false; response: Response }
> {
  const token = req.headers.get("x-attempt-token") ?? "";
  const nonce = req.headers.get("x-session-nonce") ?? "";
  if (!token || !nonce) {
    return { ok: false, response: fail("no_token", "Your test session has ended. Please contact HR.", 401) };
  }
  const hash = await sha256Hex(token);
  const { data: attempt } = await db.from("cbt_attempts").select("*").eq("token_hash", hash).maybeSingle();
  if (!attempt) {
    return { ok: false, response: fail("no_token", "Your test session has ended. Please contact HR.", 401) };
  }
  if (attempt.session_nonce !== nonce) {
    await db.from("cbt_proctor_events").insert({
      attempt_id: attempt.id, event_type: "second_session", meta: { reason: "nonce mismatch" },
    });
    return {
      ok: false,
      response: fail(
        "second_session",
        "This test was opened in another window. This window is now locked.",
        409,
      ),
    };
  }
  if (attempt.token_expires_at && new Date(attempt.token_expires_at).getTime() < Date.now()) {
    return { ok: false, response: fail("expired", "Your test session has ended. Please contact HR.", 401) };
  }
  // F31: sweep before anything else, then re-read
  await db.rpc("cbt_sweep_attempt", { p_attempt_id: attempt.id });
  const { data: fresh } = await db.from("cbt_attempts").select("*").eq("id", attempt.id).single();
  return { ok: true, attempt: fresh as Record<string, any> };
}

// ---------- state payload ----------
export async function buildState(db: SupabaseClient, attemptId: string) {
  const { data: attempt } = await db.from("cbt_attempts").select("*").eq("id", attemptId).single();
  const { data: candidate } = await db.from("cbt_candidates").select("full_name").eq("id", attempt!.candidate_id).single();
  const { data: drive } = await db.from("cbt_drives").select("name, mode, show_score_to_candidate").eq("id", attempt!.drive_id).single();
  const { data: role } = await db.from("cbt_job_roles").select("code, name").eq("id", attempt!.job_role_id).single();
  const { data: settings } = await db.from("cbt_settings").select("*").eq("id", true).single();
  const { data: sections } = await db.from("cbt_attempt_sections").select("*").eq("attempt_id", attemptId).order("order_index");

  const snapSections: any[] = (attempt!.blueprint_snapshot?.sections ?? []) as any[];
  const cfgFor = (orderIndex: number) => snapSections.find((s) => s.order_index === orderIndex) ?? {};

  const current = (sections ?? []).find((s) => s.status === "in_progress")
    ?? (sections ?? []).find((s) => s.status === "pending");

  let items: any[] = [];
  let stimulus: any = null;
  if (current) {
    const { data: rows } = await db
      .from("cbt_attempt_items")
      .select("id, display_order, option_order, response, visited, marked_for_review, question_version_id")
      .eq("attempt_section_id", current.id)
      .order("display_order");
    const versionIds = (rows ?? []).map((r) => r.question_version_id);
    const { data: versions } = versionIds.length
      ? await db.from("cbt_question_versions").select("id, content, question_id").in("id", versionIds)
      : { data: [] as any[] };
    const questionIds = (versions ?? []).map((v: any) => v.question_id);
    const { data: questions } = questionIds.length
      ? await db.from("cbt_questions").select("id, type, category_tag, stimulus_id").in("id", questionIds)
      : { data: [] as any[] };
    items = (rows ?? []).map((r) => {
      const v = (versions ?? []).find((x: any) => x.id === r.question_version_id);
      const q = (questions ?? []).find((x: any) => x.id === v?.question_id);
      const content = { ...(v?.content ?? {}) } as any;
      if (Array.isArray(content.options) && Array.isArray(r.option_order)) {
        const byId = new Map(content.options.map((o: any) => [o.id, o]));
        content.options = (r.option_order as string[]).map((id) => byId.get(id)).filter(Boolean);
      }
      return {
        id: r.id,
        display_order: r.display_order,
        type: q?.type ?? "mcq",
        category_tag: q?.category_tag ?? null,
        content: sanitize(content),
        response: r.response,
        visited: r.visited,
        marked_for_review: r.marked_for_review,
      };
    });
    const stimulusId = (questions ?? []).find((q: any) => q.stimulus_id)?.stimulus_id;
    if (stimulusId) {
      const { data: st } = await db.from("cbt_stimuli").select("title, body").eq("id", stimulusId).single();
      stimulus = st;
    }
  }

  const showScores = Boolean(drive?.show_score_to_candidate);

  return {
    ok: true,
    settings: {
      brand_name: settings?.brand_name, company_name: settings?.company_name, logo_url: settings?.logo_url,
      privacy_url: settings?.privacy_url, terms_url: settings?.terms_url, hr_email: settings?.hr_email,
      retention_days: settings?.retention_days, max_warnings: settings?.max_warnings,
      heartbeat_seconds: settings?.heartbeat_seconds, transition_seconds: settings?.transition_seconds,
      typing_practice_passage: settings?.typing_practice_passage,
    },
    attempt: {
      public_ref: attempt!.public_ref, status: attempt!.status, warning_count: attempt!.warning_count,
      current_section_index: attempt!.current_section_index,
      candidate_name: candidate?.full_name, drive_name: drive?.name, drive_mode: drive?.mode,
      show_score_to_candidate: showScores, role_name: role?.name, role_code: role?.code,
      total_sections: (sections ?? []).length,
    },
    sections: (sections ?? []).map((s) => {
      const cfg = cfgFor(s.order_index);
      return {
        id: s.id, order_index: s.order_index, section_code: s.section_code, section_type: s.section_type,
        title: cfg.title ?? s.section_code, status: s.status, entered_at: s.entered_at,
        started_at: s.started_at, deadline_at: s.deadline_at,
        item_count: cfg.item_count ?? null, duration_seconds: cfg.duration_seconds ?? null,
        practice_seconds: cfg.practice_seconds ?? 0, min_words: cfg.min_words ?? null,
        max_words: cfg.max_words ?? null, negative_mark: cfg.negative_mark ?? 0,
        ...(showScores && ["submitted", "auto_submitted"].includes(s.status)
          ? { score: s.normalized_score }
          : {}),
      };
    }),
    current_section: current
      ? {
        id: current.id, order_index: current.order_index, section_code: current.section_code,
        section_type: current.section_type, status: current.status, entered_at: current.entered_at,
        started_at: current.started_at, deadline_at: current.deadline_at,
        ...cfgFor(current.order_index),
        items, stimulus,
      }
      : null,
  };
}

// ---------- question selection (F24) ----------
type MixKey = "easy" | "medium" | "hard";

export async function pickQuestions(
  db: SupabaseClient,
  opts: {
    types: string[];
    tags: string[];
    count: number;
    mix: Record<string, number>;
    roleCode: string;
    seenVersionIds: string[];
    sandbox: boolean;
  },
): Promise<string[]> {
  const statuses = opts.sandbox ? ["approved", "needs_review", "draft"] : ["approved"];
  let query = db
    .from("cbt_questions")
    .select("id, difficulty, category_tag, current_version_id, applicable_role_codes")
    .in("type", opts.types)
    .in("status", statuses)
    .not("current_version_id", "is", null);
  if (opts.tags.length) query = query.in("category_tag", opts.tags);
  const { data } = await query.limit(2000);
  let pool = (data ?? []).filter((q: any) =>
    !q.applicable_role_codes || q.applicable_role_codes.includes(opts.roleCode)
  );
  const unseen = pool.filter((q: any) => !opts.seenVersionIds.includes(q.current_version_id));
  if (unseen.length >= opts.count) pool = unseen;

  const shuffle = <T,>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map((p) => p[1]);
  const tags = opts.tags.length ? opts.tags : [null];
  const perTag = Math.floor(opts.count / tags.length);
  const chosen: string[] = [];

  const takeFromBucket = (candidates: any[], n: number) => {
    const picked: any[] = [];
    // difficulty mix
    const mix: Record<MixKey, number> = { easy: 0, medium: 0, hard: 0 };
    let assigned = 0;
    (["easy", "medium", "hard"] as MixKey[]).forEach((k) => {
      mix[k] = Math.round((Number(opts.mix?.[k] ?? 0) / 100) * n);
      assigned += mix[k];
    });
    mix.medium += n - assigned; // remainder to medium
    (["easy", "medium", "hard"] as MixKey[]).forEach((k) => {
      let want = Math.max(0, mix[k]);
      const bucket = shuffle(candidates.filter((q) => q.difficulty === k && !picked.includes(q)));
      while (want > 0 && bucket.length) { picked.push(bucket.shift()); want--; }
      mix[k] = want; // shortfall
    });
    const shortfall = mix.easy + mix.medium + mix.hard;
    if (shortfall > 0) {
      const rest = shuffle(candidates.filter((q) => !picked.includes(q)));
      for (let i = 0; i < shortfall && rest.length; i++) picked.push(rest.shift());
    }
    return picked.slice(0, n);
  };

  tags.forEach((tag, idx) => {
    const n = idx === tags.length - 1 ? opts.count - chosen.length : perTag;
    const candidates = pool.filter((q: any) =>
      (tag === null || q.category_tag === tag) && !chosen.includes(q.current_version_id)
    );
    takeFromBucket(candidates, n).forEach((q: any) => chosen.push(q.current_version_id));
  });

  if (chosen.length < opts.count) {
    const rest = shuffle(pool.filter((q: any) => !chosen.includes(q.current_version_id)));
    for (const q of rest) { if (chosen.length >= opts.count) break; chosen.push((q as any).current_version_id); }
  }
  return chosen.slice(0, opts.count);
}

export function shuffleOptions(content: any): string[] | null {
  const options = content?.options;
  if (!Array.isArray(options) || !options.length) return null;
  const ids = options.map((o: any) => o.id);
  if (content?.lock_option_order) return ids;
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

export async function logAudit(
  db: SupabaseClient,
  row: { actor_id?: string | null; entity: string; entity_id?: string | null; action: string; before?: unknown; after?: unknown; reason?: string },
) {
  await db.from("cbt_audit_log").insert(row as any);
}
