import { z } from "https://esm.sh/zod@3.23.8";
import { admin, corsHeaders, fail, json, ipHash, rateLimit, randomToken, sha256Hex, buildState } from "../_shared/cbt.ts";

const Schema = z.object({
  code: z.string().length(6),
  full_name: z.string().min(2).max(100),
  mobile: z.string().regex(/^[6-9]\d{9}$/),
  email: z.string().email().max(255),
  city: z.string().min(1).max(60),
  job_role_id: z.string().uuid(),
  qualification: z.enum(["Class 12", "Diploma", "Graduate", "Post-graduate", "Other"]),
  experience_years: z.number().min(0).max(40),
  source: z.enum(["Indeed", "Walk-in", "Referral", "LinkedIn", "Company website", "Other"]),
  shift_availability: z.array(z.string()).min(1),
  consent: z.literal(true),
}).strict();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = admin();
    const ip = await ipHash(req);
    if (!(await rateLimit(db, `register:${ip}`, 10, 60))) {
      return fail("locked_out", "Too many tries. Try again in 15 minutes.", 429);
    }
    const parsed = Schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return fail("invalid", "Please check the details you entered.", 400, { fields: parsed.error.flatten().fieldErrors });
    const b = parsed.data;

    const { data: drive } = await db.from("cbt_drives").select("*").eq("access_code", b.code.toUpperCase()).maybeSingle();
    if (!drive || drive.status !== "live") {
      return fail("bad_code", "That code doesn't match an open test. Check the code and try again.", 404);
    }
    const now = Date.now();
    if (now < new Date(drive.starts_at).getTime() || now > new Date(drive.ends_at).getTime()) {
      return fail("window_closed", "This test isn't open right now.", 403, { starts_at: drive.starts_at, ends_at: drive.ends_at });
    }
    if (!(drive.job_role_ids ?? []).includes(b.job_role_id)) {
      return fail("bad_role", "That role is not part of this test.", 400);
    }
    const { data: role } = await db.from("cbt_job_roles").select("*").eq("id", b.job_role_id).single();
    const { data: settings } = await db.from("cbt_settings").select("*").eq("id", true).single();

    // F22 retake cooldown (ignoring sandbox and internal attempts)
    if (!drive.is_sandbox) {
      const { data: prior } = await db
        .from("cbt_attempts")
        .select("id, created_at, started_at, status, cbt_candidates!inner(mobile, is_internal)")
        .eq("job_role_id", b.job_role_id)
        .eq("is_sandbox", false)
        .eq("is_internal", false)
        .in("status", ["in_progress", "submitted", "auto_submitted", "abandoned", "invalidated"])
        .eq("cbt_candidates.mobile", b.mobile)
        .order("created_at", { ascending: false })
        .limit(1);
      const last = prior?.[0] as any;
      if (last) {
        const takenAt = new Date(last.started_at ?? last.created_at);
        const nextAllowed = new Date(takenAt.getTime() + (role!.retake_cooldown_days ?? 90) * 86_400_000);
        if (nextAllowed.getTime() > now) {
          return fail("retake_blocked", "Retake cooldown active.", 403, {
            role_name: role!.name, taken_at: takenAt.toISOString(),
            next_allowed_at: nextAllowed.toISOString(), hr_email: settings?.hr_email,
          });
        }
      }
    }

    // reuse a never-started registration for the same mobile + role in this drive
    const { data: candidateExisting } = await db.from("cbt_candidates").select("*").eq("mobile", b.mobile).order("created_at", { ascending: false }).limit(1);
    let candidateId = (candidateExisting?.[0] as any)?.id as string | undefined;
    const candidatePayload = {
      full_name: b.full_name, mobile: b.mobile, email: b.email, city: b.city,
      qualification: b.qualification, experience_years: b.experience_years, source: b.source,
      shift_availability: b.shift_availability, consent_at: new Date().toISOString(), consent_version: "2026-09",
    };
    if (candidateId) {
      await db.from("cbt_candidates").update(candidatePayload).eq("id", candidateId);
    } else {
      const { data: created, error } = await db.from("cbt_candidates").insert(candidatePayload).select("id").single();
      if (error) return fail("server_error", error.message, 500);
      candidateId = created!.id;
    }

    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const nonce = crypto.randomUUID();
    const expires = new Date(Date.now() + 3 * 3600_000).toISOString();

    const { data: reusable } = await db
      .from("cbt_attempts")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("drive_id", drive.id)
      .eq("job_role_id", b.job_role_id)
      .eq("status", "registered")
      .maybeSingle();

    let attemptId: string;
    if (reusable) {
      attemptId = reusable.id;
      await db.from("cbt_attempts").update({
        token_hash: tokenHash, session_nonce: nonce, token_expires_at: expires,
        user_agent: req.headers.get("user-agent"), ip_hash: ip,
      }).eq("id", attemptId);
    } else {
      const { data: refRow } = await db.rpc("cbt_next_attempt_ref");
      const { data: created, error } = await db.from("cbt_attempts").insert({
        public_ref: refRow as unknown as string,
        candidate_id: candidateId, drive_id: drive.id, job_role_id: b.job_role_id,
        token_hash: tokenHash, session_nonce: nonce, token_expires_at: expires,
        status: "registered", is_sandbox: drive.is_sandbox,
        is_internal: drive.is_internal_benchmark, user_agent: req.headers.get("user-agent"), ip_hash: ip,
      }).select("id").single();
      if (error) return fail("server_error", error.message, 500);
      attemptId = created!.id;
    }

    const state = await buildState(db, attemptId);
    return json({ ...state, token, session_nonce: nonce });
  } catch (e) {
    return fail("server_error", String((e as Error).message ?? e), 500);
  }
});
