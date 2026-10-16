// Server-to-server intake of careers-website applications into the ATS.
// Logs contain only codes, ids and timings — never personal data or URLs.
import { createClient } from "npm:@supabase/supabase-js@2";
import { parsePreferredShifts } from "./shifts.ts";

const MAX_BODY = 64 * 1024;
const MAX_FILE = 10 * 1024 * 1024;
const ALLOWED_EXT = ["pdf", "doc", "docx", "jpg", "jpeg", "png", "webp"];
const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf", "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};
const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ fn: "ats-intake", ...o }));

/* ---------------- parsing helpers ---------------- */
export function parseExperienceYears(raw?: string | null): number | null {
  if (!raw) return null;
  const t = raw.toLowerCase();
  if (/fresher/.test(t)) return 0;
  const m = t.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  let n = Number(m[0]);
  if (/month/.test(t)) n = Math.round((n / 12) * 10) / 10;
  return n >= 0 && n <= 60 ? n : null;
}

/** Annual figure typed on the website → monthly rupees (rounded), or null. */
export function parseExpectedCtcMonthly(raw?: string | null): number | null {
  if (!raw) return null;
  const t = raw.toLowerCase().replace(/[,\s]/g, "").replace(/₹|rs\.?|inr/g, "");
  const m = t.match(/(\d+(?:\.\d+)?)(lpa|lakhs?|lacs?|l|k|crores?|cr)?/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? "";
  let annual: number;
  if (/^(lpa|lakhs?|lacs?|l)$/.test(unit)) annual = n * 100000;
  else if (unit === "k") annual = n * 1000;
  else if (/^(crores?|cr)$/.test(unit)) annual = n * 10000000;
  else if (n < 100) annual = n * 100000;
  else if (n >= 1000) annual = n;
  else return null;
  if (annual < 10000 || annual > 100000000) return null;
  return Math.round(annual / 12);
}

export function parseNoticeDays(raw?: string | null): number | null {
  if (!raw) return null;
  const t = raw.toLowerCase();
  if (/immediate/.test(t)) return 0;
  const m = t.match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  const days = /month/.test(t) ? Math.round(n * 30) : /week/.test(t) ? Math.round(n * 7) : Math.round(n);
  return days >= 0 && days <= 365 ? days : null;
}

export function parseSkills(raw?: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw.split(/[,;/|\n\r]+/)) {
    const v = s.trim().slice(0, 60);
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
    if (out.length >= 25) break;
  }
  return out;
}

const normLinkedin = (v?: string | null) => {
  const t = v?.trim();
  if (!t) return null;
  return /^(linkedin\.com|www\.)/i.test(t) ? `https://${t}` : t;
};

/* ---------------- utils ---------------- */
async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
const pad = (n: number) => String(n).padStart(2, "0");
function istStamp(d = new Date()) {
  const i = new Date(d.getTime() + 330 * 60_000);
  return `${i.getUTCFullYear()}${pad(i.getUTCMonth() + 1)}${pad(i.getUTCDate())}-${pad(i.getUTCHours())}${pad(i.getUTCMinutes())}${pad(i.getUTCSeconds())}`;
}
const sanitise = (name: string) =>
  name.replace(/\.[^.]*$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "resume";
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? undefined : undefined);
const trunc = (v: unknown, n: number) => { const s = str(v)?.trim(); return s ? s.slice(0, n) : null; };

class Invalid extends Error { constructor(readonly field: string) { super("invalid"); } }
class ResumeRetry extends Error {}

/* ---------------- resume ---------------- */
async function copyResume(db: any, host: string, resume: any, candidateId: string, applicationId: string): Promise<string> {
  const url = str(resume?.url);
  if (!url) return "none";
  let u: URL;
  try { u = new URL(url); } catch { return "skipped"; }
  if (u.protocol !== "https:" || u.hostname !== host || !u.pathname.startsWith("/storage/v1/object/sign/")) return "skipped";

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  let bytes: Uint8Array;
  let contentType = "";
  try {
    let res: Response;
    try { res = await fetch(u.toString(), { signal: ctl.signal }); } catch { throw new ResumeRetry(); }
    if (res.status >= 500) throw new ResumeRetry();
    if (!res.ok || !res.body) return "skipped";
    contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_FILE) { await res.body.cancel().catch(() => {}); return "skipped"; }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_FILE) { await reader.cancel().catch(() => {}); return "skipped"; }
        chunks.push(value);
      }
    } catch { throw new ResumeRetry(); }
    bytes = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { bytes.set(c, off); off += c.byteLength; }
  } finally { clearTimeout(timer); }
  if (!bytes.byteLength) return "skipped";

  const name = (str(resume?.name) ?? "").trim().slice(0, 255) || "resume";
  let ext = (name.includes(".") ? name.split(".").pop()! : "").toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) ext = MIME_EXT[contentType] ?? "";
  if (!ALLOWED_EXT.includes(ext)) return "skipped";

  const hash = await sha256Hex(bytes);
  const { data: dup, error: dupErr } = await db.from("ats_files").select("id").eq("candidate_id", candidateId).eq("sha256", hash).limit(1);
  if (dupErr) throw new Error("dup_check");
  if (dup?.length) return "already_attached";

  const mime = EXT_MIME[ext];
  const path = `candidates/${candidateId}/${istStamp()}-${sanitise(name)}.${ext}`.toLowerCase();
  const up = await db.storage.from("ats-files").upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) throw new Error("upload");
  const fileName = name.includes(".") ? name : `${name}.${ext}`;
  const ins = await db.from("ats_files").insert({
    candidate_id: candidateId, application_id: applicationId, kind: "resume", source: "careers_form",
    uploaded_by_name: "Careers page", file_name: fileName.slice(0, 255), storage_path: path,
    mime_type: mime, size_bytes: bytes.byteLength, sha256: hash,
  });
  if (ins.error) {
    await db.storage.from("ats-files").remove([path]).catch(() => {});
    throw new Error("file_row");
  }
  return "attached";
}

/* ---------------- handler ---------------- */
Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const t0 = Date.now();
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const setError = (code: string) =>
    db.from("ats_integrations").update({ last_error: code, last_error_at: new Date().toISOString() }).eq("id", "careers_site").then(() => {}, () => {});

  let stage = "start";
  try {
    // body size
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > MAX_BODY) return json(413, { error: "too_large" });
    const raw = new Uint8Array(await req.arrayBuffer());
    if (raw.byteLength > MAX_BODY) return json(413, { error: "too_large" });

    // auth
    stage = "auth";
    const { data: integ, error: iErr } = await db.from("ats_integrations").select("key_hash,allowed_resume_host").eq("id", "careers_site").maybeSingle();
    if (iErr) throw iErr;
    if (!integ?.key_hash) { log({ status: 503, code: "not_configured" }); return json(503, { error: "not_configured" }); }
    const provided = req.headers.get("x-ats-key") ?? "";
    const hash = await sha256Hex(provided);
    if (!provided || !constantTimeEqual(hash, integ.key_hash)) {
      await setError("Rejected a request with a wrong key");
      log({ status: 401, code: "unauthorized" });
      return json(401, { error: "unauthorized" });
    }

    // validate
    stage = "validate";
    let p: any;
    try { p = JSON.parse(new TextDecoder().decode(raw)); } catch { throw new Invalid("body"); }
    if (!p || typeof p !== "object" || Array.isArray(p)) throw new Invalid("body");
    const ref = str(p.external_ref)?.trim() ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) throw new Invalid("external_ref");
    const appliedAt = new Date(str(p.applied_at) ?? "");
    if (isNaN(appliedAt.getTime()) || appliedAt < new Date("2020-01-01T00:00:00Z") || appliedAt.getTime() > Date.now() + 86400_000) throw new Invalid("applied_at");
    const name = str(p.name)?.trim() ?? "";
    if (name.length < 1 || name.length > 120) throw new Invalid("name");
    const position = str(p.position_text)?.trim() ?? "";
    if (position.length < 1 || position.length > 200) throw new Invalid("position_text");
    const email = str(p.email)?.trim() || null;
    const phone = str(p.phone)?.trim() || null;
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Invalid("email");
    if (phone && phone.length > 32) throw new Invalid("phone");
    if (!email && !phone) throw new Invalid("email");
    const slug = str(p.job_slug)?.trim() || null;
    if (slug && !/^[a-z0-9-]{1,80}$/.test(slug)) throw new Invalid("job_slug");
    if (p.resume != null && (typeof p.resume !== "object" || Array.isArray(p.resume))) throw new Invalid("resume");

    const experience_text = trunc(p.experience_text, 40);
    const expected_ctc_text = trunc(p.expected_ctc_text, 40);
    const notice_period_text = trunc(p.notice_period_text, 40);
    const linkedin = trunc(p.linkedin, 300);
    const skills_text = trunc(p.skills_text, 1000);
    const cover_letter = trunc(p.cover_letter, 5000);

    const ctcMonthly = parseExpectedCtcMonthly(expected_ctc_text);
    const candidate: Record<string, unknown> = {
      full_name: name, email, phone,
      total_experience_years: parseExperienceYears(experience_text),
      expected_ctc_monthly: ctcMonthly,
      ctc_note: expected_ctc_text ? `Expected per year (as typed): ${expected_ctc_text}` : null,
      notice_period_days: parseNoticeDays(notice_period_text),
      skills: parseSkills(skills_text),
      linkedin_url: normLinkedin(linkedin),
      consent: true, consent_version: "website-apply-form",
    };
    const answers = { experience_text, expected_ctc_text, notice_period_text, skills_text, linkedin };

    // shift preference is mandatory when the matched job offers multiple shifts
    const shifts = parsePreferredShifts(p.preferred_shifts);
    if (slug) {
      const { data: job } = await db.from("ats_jobs").select("shift_ids").eq("slug", slug).eq("status", "open").maybeSingle();
      if (job && Array.isArray(job.shift_ids) && job.shift_ids.length > 1 && !shifts) throw new Invalid("preferred_shifts");
    }

    // create (idempotent)
    stage = "create";
    const { data: res, error: rErr } = await db.rpc("ats_intake_application", {
      p: {
        external_ref: ref, applied_at: appliedAt.toISOString(), position_text: position, job_slug: slug,
        cover_letter, candidate, answers, source_detail: "blynkex.com/apply",
      },
    });
    if (rErr) throw rErr;
    const r = res as { candidate_id: string; application_id: string; duplicate: boolean; job_matched: boolean | null };

    // preferred shifts (validated above; storing never fails the application)
    if (shifts) {
      try {
        const { data: cur } = await db.from("ats_applications").select("preferred_shifts").eq("id", r.application_id).maybeSingle();
        const prev = (cur?.preferred_shifts ?? []) as string[];
        if (prev.length !== shifts.length || prev.some((s, i) => s !== shifts[i])) {
          const { error: sErr } = await db.from("ats_applications").update({ preferred_shifts: shifts }).eq("id", r.application_id);
          if (sErr) log({ code: "shifts_store_failed", application_id: r.application_id });
        }
      } catch { log({ code: "shifts_store_failed", application_id: r.application_id }); }
    }

    // resume
    stage = "resume";
    let resume = "none";
    try {
      resume = await copyResume(db, integ.allowed_resume_host, p.resume, r.candidate_id, r.application_id);
    } catch (e) {
      if (e instanceof ResumeRetry) {
        await setError("resume_fetch_failed");
        log({ status: 502, code: "resume_fetch_failed", application_id: r.application_id, ms: Date.now() - t0 });
        return json(502, { error: "resume_fetch_failed", application_id: r.application_id });
      }
      throw e;
    }

    const { data: cand } = await db.from("ats_candidates").select("ref_no").eq("id", r.candidate_id).maybeSingle();
    await db.from("ats_integrations").update({ last_seen_at: new Date().toISOString(), last_error: null, last_error_at: null }).eq("id", "careers_site");
    log({ status: 200, duplicate: r.duplicate, job_matched: r.job_matched, application_id: r.application_id, resume, ms: Date.now() - t0 });
    return json(200, {
      ok: true, duplicate: r.duplicate, job_matched: r.job_matched, candidate_ref: cand?.ref_no ?? null,
      application_id: r.application_id, resume,
    });
  } catch (e) {
    if (e instanceof Invalid) { log({ status: 400, code: "invalid", field: e.field }); return json(400, { error: "invalid", field: e.field }); }
    const code = `internal_${stage}`;
    await setError(code);
    log({ status: 500, code, pg: (e as any)?.code ?? null, ms: Date.now() - t0 });
    return json(500, { error: "internal" });
  }
});
