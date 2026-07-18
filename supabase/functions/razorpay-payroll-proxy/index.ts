// RazorpayX Payroll (Opfin) proxy — Phase 1a full import flow.
//
// API model (JSON-RPC, not REST):
//   POST https://payroll.razorpay.com/api/{resource}
//   { auth:{id,key}, request:{type,sub-type}, data:{...} }
//
// No bulk list endpoint. Discovery = sequential employee-id walk with max-id cap.
//
// Actions:
//   validate_creds     - single people/view probe (existing)
//   introspect_envelope- shape debug (existing)
//   fetch_one          - preview one employee-id: fetch + match, NO writes
//   apply_one          - write one employee-id (pilot); flips bulk_sync_unlocked
//   dry_run_range      - walk 1..max, return match table, NO writes  (gated)
//   apply_range        - write everything from a fresh dry-run       (gated)
//   pull_person_full   - re-fetch people:view for every mapped id and project
//                        into hr_employees / work_info / bank_details (ERP-wins)
//
// PII policy: only field NAMES land in hr_razorpay_sync_log.field_diff_summary.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const KEY_ID = Deno.env.get("RAZORPAY_PAYROLL_KEY_ID") ?? "";
const KEY_SECRET = Deno.env.get("RAZORPAY_PAYROLL_KEY_SECRET") ?? "";
const BASE = "https://payroll.razorpay.com/api";
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAuth(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) return json(401, { error: "Unauthorized" });
  const c = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await c.auth.getUser();
  if (error || !data?.user?.id) return json(401, { error: "Unauthorized" });
  return { userId: data.user.id };
}

async function requirePermission(userId: string, svc: SupabaseClient) {
  const { data, error } = await svc.rpc("user_has_permission", {
    user_uuid: userId, check_permission: "hrms_razorpay_sync",
  });
  if (error) return { ok: false, msg: error.message };
  return { ok: !!data, msg: data ? "" : "Missing hrms_razorpay_sync permission" };
}

function authBlock() {
  const idNum = Number(KEY_ID);
  return { id: Number.isFinite(idNum) && idNum > 0 ? idNum : KEY_ID, key: KEY_SECRET };
}

async function opfinView(employeeId: number, employeeType = "employee") {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${BASE}/people`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        auth: authBlock(),
        request: { type: "people", "sub-type": "view" },
        data: { "employee-id": employeeId, "employee-type": employeeType },
      }),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    let body: any = null;
    try { body = JSON.parse(raw); } catch { /* keep raw */ }
    const errText = body && typeof body === "object"
      ? (body.error || body.message || null) : null;
    // Opfin returns 200 with body for valid, sometimes 200 with {error:...} for missing.
    // Treat a body that lacks `name` (or is empty) as a miss.
    const looksLikeEmployee = body && typeof body === "object" && typeof body.name === "string";
    return { status: res.status, ok: res.ok && looksLikeEmployee && !errText, body, raw, errText };
  } catch (e) {
    return { status: 0, ok: false, body: null, raw: `NETWORK: ${(e as Error).message}`, errText: (e as Error).message };
  } finally { clearTimeout(t); }
}

// Fetch the current salary of a Razorpay employee.
//
// AUDIT (verified against the official RazorpayX Payroll Postman collection):
// The API exposes NO read endpoint for the master annual CTC / salary structure.
// Only these salary-adjacent sub-types exist:
//   - people:set-salary        (WRITE annual-ctc or custom structure)
//   - payroll:view-payroll     (READ per-month payroll line, keyed by email + payroll-month)
//   - advance-salary:create    (WRITE advance)
//
// There is no people:view-salary, no salary-structure endpoint, no get-salary.
// The dozen probe variants we previously tried all returned code:23 "Unknown
// request type" — they simply do not exist in the tenant's API surface.
//
// The only documented way to READ salary numbers is `payroll:view-payroll`,
// which returns { salary: <monthly_gross>, additions, deduction-amount, ... }
// for a specific processed payroll month. We annualise monthly*12 (matches the
// Postman description: "even if an employee joins mid-year, please set the
// salary as their monthly_salary*12").
//
// If no processed payroll month exists for the employee, salary is NOT exposed
// via the API and CTC must be entered manually in HRMS. We surface that
// cleanly via ok:false + err: "not-exposed-by-api".
async function opfinSalary(employeeId: number, email?: string | null): Promise<{
  ok: boolean; annual_ctc: number | null; monthly_gross: number | null;
  components: any[]; raw: any; http_status: number; err: string | null;
}> {
  const empty = { ok: false, annual_ctc: null, monthly_gross: null, components: [] as any[], raw: null as any, http_status: 0, err: null as string | null };

  if (!email || typeof email !== "string" || !email.includes("@")) {
    console.log(`[opfinSalary] emp=${employeeId} SKIP no-email (payroll:view-payroll requires email)`);
    return { ...empty, err: "not-exposed-by-api: payroll view requires employee email which is missing on snapshot" };
  }

  const readNum = (obj: any, keys: string[]): number | null => {
    if (!obj || typeof obj !== "object") return null;
    for (const k of keys) {
      const v = obj[k];
      const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : v;
      if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
    }
    return null;
  };

  // Walk back up to 12 months from current month, newest first.
  const now = new Date();
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  let lastStatus = 0;
  let lastRaw: any = null;
  let lastErr: string | null = null;
  const perAttempt: string[] = [];

  for (const ym of months) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(`${BASE}/payroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          auth: authBlock(),
          request: { type: "payroll", "sub-type": "view-payroll" },
          data: { email, "payroll-month": ym },
        }),
        signal: ctrl.signal,
      });
      const raw = await res.text();
      let body: any = null; try { body = JSON.parse(raw); } catch { /* keep raw */ }
      lastStatus = res.status;
      lastRaw = body ?? raw;
      const tag = `payroll:view-payroll@${ym}`;

      if (!res.ok || !body || typeof body !== "object") {
        const isHtml = typeof raw === "string" && raw.trim().startsWith("<");
        const snip = isHtml ? "<HTML>" : String(raw).slice(0, 120);
        perAttempt.push(`HTTP ${res.status} @ ${tag} ${snip}`);
        lastErr = perAttempt[perAttempt.length - 1];
        continue;
      }
      const rpErr = body.error || body.message || null;
      if (rpErr) {
        perAttempt.push(`RPERR @ ${tag} ${typeof rpErr === "string" ? rpErr : JSON.stringify(rpErr).slice(0, 150)}`);
        lastErr = perAttempt[perAttempt.length - 1];
        continue;
      }

      const monthly = readNum(body, ["salary"]);
      if (monthly && monthly > 0) {
        const annual = Math.round(monthly * 12);
        console.log(`[opfinSalary] emp=${employeeId} MATCH ${tag} monthly=${monthly} annual=${annual}`);
        return { ok: true, annual_ctc: annual, monthly_gross: monthly, components: [], raw: body, http_status: res.status, err: null };
      }
      perAttempt.push(`no salary field @ ${tag} keys=${Object.keys(body).slice(0, 10).join(",")}`);
      lastErr = perAttempt[perAttempt.length - 1];
    } catch (e) {
      perAttempt.push(`NETWORK @ ${ym}: ${(e as Error).message}`);
      lastErr = perAttempt[perAttempt.length - 1];
    } finally { clearTimeout(t); }
  }

  console.log(`[opfinSalary] emp=${employeeId} NO_PROCESSED_PAYROLL email=${email} tried=${months.length} months | ${perAttempt.slice(0, 3).join(" || ")}`);
  return { ...empty, http_status: lastStatus, raw: lastRaw, err: lastErr || "not-exposed-by-api: no processed payroll month returned salary" };
}




function normPhone(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = String(v).replace(/\D/g, "");
  if (!d) return null;
  return d.length > 10 ? d.slice(-10) : d;
}
function parseDobIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function splitName(full: string): { first: string; last: string } {
  const parts = String(full).trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

interface MatchResult {
  hr_employee_id: string | null;
  matched_by: "pan" | "phone" | "email" | null;
  action: "match" | "create_draft";
}

async function matchEmployee(svc: SupabaseClient, e: any, currentRazorpayId?: string | number | null): Promise<MatchResult> {
  const pan = (e.pan || "").toString().trim().toUpperCase();
  const phone = normPhone(e.phone_number);
  const email = (e.email || "").toString().trim().toLowerCase();

  // Pre-load hr_employee_ids already claimed by a DIFFERENT Razorpay employee.
  // Without this guard, two distinct Razorpay records that share a stale PAN /
  // phone / email fragment with the same ERP row both try to write the same
  // hr_employee_id and the second one hits hr_razorpay_map_hr_emp_uniq
  // (that is exactly why RP #70 "Shubham Singh" never landed).
  const currentIdStr = currentRazorpayId != null ? String(currentRazorpayId) : null;
  const { data: claimedRows } = await svc
    .from("hr_razorpay_employee_map")
    .select("hr_employee_id,razorpay_employee_id");
  const claimed = new Set(
    (claimedRows || [])
      .filter((r: any) => !currentIdStr || String(r.razorpay_employee_id) !== currentIdStr)
      .map((r: any) => r.hr_employee_id),
  );
  const notClaimed = (id: string | null | undefined) => !!id && !claimed.has(id);

  if (pan) {
    const { data } = await svc.from("hr_employees").select("id").eq("pan_number", pan).limit(5);
    const hit = (data || []).find((r: any) => notClaimed(r.id));
    if (hit?.id) return { hr_employee_id: hit.id, matched_by: "pan", action: "match" };
  }
  if (phone) {
    const { data } = await svc.from("hr_employees").select("id,phone").ilike("phone", `%${phone}%`).limit(10);
    const hit = (data || []).find((r: any) => normPhone(r.phone) === phone && notClaimed(r.id));
    if (hit) return { hr_employee_id: hit.id, matched_by: "phone", action: "match" };
  }
  if (email) {
    const { data } = await svc.from("hr_employees").select("id").ilike("email", email).limit(5);
    const hit = (data || []).find((r: any) => notClaimed(r.id));
    if (hit?.id) return { hr_employee_id: hit.id, matched_by: "email", action: "match" };
  }
  return { hr_employee_id: null, matched_by: null, action: "create_draft" };
}


function fieldNames(e: any): string[] {
  return Object.keys(e || {}).sort();
}

async function logSync(svc: SupabaseClient, row: {
  action: string; http_status: number; razorpay_employee_id: string;
  hr_employee_id?: string | null; field_diff_summary?: any; error_text?: string | null; actor_user_id: string;
}) {
  const { error } = await svc.from("hr_razorpay_sync_log").insert(row);
  if (error) {
    // Loud failure: an audit trail that fails silently is worse than none.
    // Surfacing lets us catch enum drift, RLS, or constraint issues immediately.
    console.error("[logSync] insert failed", {
      action: row.action,
      http_status: row.http_status,
      razorpay_employee_id: row.razorpay_employee_id,
      error: error.message,
      code: (error as any).code,
      details: (error as any).details,
    });
  }
}

async function upsertMap(svc: SupabaseClient, razorpayId: string, hrEmployeeId: string, isPilot: boolean, created: boolean) {
  const { error } = await svc.from("hr_razorpay_employee_map").upsert({
    razorpay_employee_id: razorpayId,
    hr_employee_id: hrEmployeeId,
    sync_status: created ? "imported" : "matched_existing",
    is_pilot_verified: isPilot,
    last_synced_at: new Date().toISOString(),
  }, { onConflict: "razorpay_employee_id" });
  if (error) throw new Error(`upsert map failed: ${error.message}`);
}

async function createDraftEmployee(svc: SupabaseClient, e: any): Promise<string> {
  const { first, last } = splitName(e.name || "");
  const dept = (e.department || "General").toString().trim() || "General";
  // generate_employee_id is now concurrency-safe (advisory lock) and reads
  // from hr_employees, so each call returns a unique sequential badge.
  // We still retry a few times in case of transient unique-collision races.
  const maxAttempts = 5;
  let lastErr: any = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data: badgeData, error: badgeErr } = await svc.rpc("generate_employee_id", {
      dept, designation: "Employee",
    });
    if (badgeErr) throw new Error(`generate_employee_id failed: ${badgeErr.message}`);
    const badgeId = String(badgeData);
    const { data, error } = await svc.from("hr_employees").insert({
      badge_id: badgeId,
      first_name: first,
      last_name: last,
      email: (e.email || "").toString().trim() || null,
      phone: normPhone(e.phone_number),
      dob: parseDobIso(e["date-of-birth"]),
      pan_number: (e.pan || "").toString().trim().toUpperCase() || null,
      is_active: false, // draft — will surface in Onboarding Pipeline, not Employee list
      additional_info: { source: "razorpay_import", razorpay: { status: "draft", imported_at: new Date().toISOString() } },
    }).select("id").single();
    if (!error) return data!.id as string;
    lastErr = error;
    // Only retry on badge_id unique-violation (extremely unlikely now)
    if ((error as any).code !== "23505") break;
    if (!String(error.message).includes("badge_id")) break;
  }
  throw new Error(`create hr_employees failed: ${lastErr?.message ?? "unknown"}`);
}

async function readSettings(svc: SupabaseClient) {
  const { data } = await svc.from("hr_razorpay_settings")
    .select("id,bulk_sync_unlocked").eq("is_singleton", true).maybeSingle();
  return data;
}
async function markCredsValidated(svc: SupabaseClient) {
  await svc.from("hr_razorpay_settings").update({ last_creds_validated_at: new Date().toISOString() }).eq("is_singleton", true);
}
async function stampLastImport(svc: SupabaseClient) {
  await svc.from("hr_razorpay_settings").update({
    last_import_at: new Date().toISOString(),
  }).eq("is_singleton", true);
}
async function unlockBulk(svc: SupabaseClient) {
  await svc.from("hr_razorpay_settings").update({
    bulk_sync_unlocked: true,
  }).eq("is_singleton", true);
}

// ---------- Deep-pull helpers (Phase 1a) ----------

async function canonicalHash(obj: unknown): Promise<string> {
  const s = JSON.stringify(obj, Object.keys(obj as object).sort());
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function pickString(...vals: any[]): string | null {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

function normIfsc(v: any): string | null {
  const s = pickString(v);
  return s ? s.toUpperCase().replace(/\s+/g, "") : null;
}

// ERP-wins: only patch keys where ERP row currently has NULL/empty; return
// diff summary of field names actually written (never values).
function pickPatch<T extends Record<string, any>>(current: T | null, incoming: Record<string, any>): { patch: Record<string, any>; wrote: string[]; conflicts: string[] } {
  const patch: Record<string, any> = {};
  const wrote: string[] = [];
  const conflicts: string[] = [];
  for (const [k, v] of Object.entries(incoming)) {
    if (v === null || v === undefined || v === "") continue;
    const cur = current?.[k];
    const isEmpty = cur === null || cur === undefined || cur === "";
    if (isEmpty) {
      patch[k] = v;
      wrote.push(k);
    } else if (String(cur).trim() !== String(v).trim()) {
      conflicts.push(k);
    }
  }
  return { patch, wrote, conflicts };
}

// Resolve a positions.id by case-/whitespace-insensitive title match,
// creating the row on first sight so RazorpayX titles never end up unlinked.
async function resolveOrCreatePositionId(svc: SupabaseClient, rawTitle: string): Promise<string | null> {
  const canonical = (rawTitle || "").trim();
  if (!canonical) return null;
  const norm = canonical.toLowerCase();
  const { data: existing } = await svc
    .from("positions")
    .select("id,title")
    .ilike("title", canonical)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  // Extra safety: scan for any title whose trimmed lowercase equals ours (handles
  // legacy rows with embedded whitespace). If found, reuse; otherwise create.
  const { data: fuzzy } = await svc
    .from("positions")
    .select("id,title")
    .ilike("title", `%${canonical}%`)
    .limit(20);
  const hit = (fuzzy || []).find((p: any) => (p.title || "").trim().toLowerCase() === norm);
  if (hit?.id) return hit.id as string;
  const { data: created, error } = await svc
    .from("positions")
    .insert({ title: canonical, is_active: true, hierarchy_level: 5 })
    .select("id")
    .maybeSingle();
  if (error || !created?.id) return null;
  return created.id as string;
}

async function projectSnapshotIntoErp(
  svc: SupabaseClient,
  hrId: string,
  snap: any,
): Promise<{ hr_employees: { wrote: string[]; conflicts: string[] }; work_info: { wrote: string[]; conflicts: string[] }; bank: { wrote: string[]; conflicts: string[] } }> {
  // ---- hr_employees identity fields ----
  const { first, last } = splitName(snap?.name || "");
  const empIncoming = {
    first_name: pickString(snap?.first_name, first) || null,
    last_name: pickString(snap?.last_name, last) || null,
    gender: pickString(snap?.gender)?.toLowerCase() || null,
    dob: parseDobIso(snap?.["date-of-birth"] ?? snap?.date_of_birth ?? snap?.dob),
    phone: normPhone(snap?.phone_number ?? snap?.phone),
    pan_number: (pickString(snap?.pan) || "").toUpperCase() || null,
  };
  const { data: empCur } = await svc.from("hr_employees").select("first_name,last_name,gender,dob,phone,pan_number").eq("id", hrId).maybeSingle();
  const empPick = pickPatch(empCur as any, empIncoming);
  if (Object.keys(empPick.patch).length) {
    await svc.from("hr_employees").update(empPick.patch).eq("id", hrId);
  }

  // ---- hr_employee_work_info ----
  const deptName = pickString(snap?.department);
  const jobTitle = pickString(snap?.title, snap?.designation, snap?.job_title);
  let departmentId: string | null = null;
  let jobPositionId: string | null = null;
  if (deptName) {
    const { data: d } = await svc.from("departments").select("id").ilike("name", deptName.trim()).limit(1).maybeSingle();
    if (d?.id) departmentId = d.id;
  }
  if (jobTitle) {
    jobPositionId = await resolveOrCreatePositionId(svc, jobTitle);
  }
  const wiIncoming: Record<string, any> = {
    joining_date: parseDobIso(snap?.["date-of-hiring"] ?? snap?.date_of_hiring ?? snap?.hiring_date ?? snap?.["date-of-joining"] ?? snap?.date_of_joining ?? snap?.joining_date),
    department_id: departmentId,
    job_position_id: jobPositionId,
    job_role: jobTitle,
    employee_type: pickString(snap?.employee_type, snap?.employment_type),
    work_email: pickString(snap?.work_email, snap?.email)?.toLowerCase() || null,
    location: pickString(snap?.location, snap?.work_location),
  };
  const { data: wiCur } = await svc.from("hr_employee_work_info").select("*").eq("employee_id", hrId).maybeSingle();
  const wiPick = pickPatch(wiCur as any, wiIncoming);
  if (wiCur) {
    if (Object.keys(wiPick.patch).length) {
      await svc.from("hr_employee_work_info").update(wiPick.patch).eq("employee_id", hrId);
    }
  } else if (Object.keys(wiPick.patch).length) {
    await svc.from("hr_employee_work_info").insert({ employee_id: hrId, ...wiPick.patch });
  }

  // ---- hr_employee_bank_details ----
  // RazorpayX exposes bank fields in two shapes: nested (bank_account / bank_details / bank_information)
  // OR flat hyphenated keys at the snapshot root (bank-account-number, bank-ifsc, bank-name, bank-branch).
  // Cover both — real payloads for people:view use the flat hyphenated form.
  const b = snap?.bank_account ?? snap?.bank_details ?? snap?.bank_information ?? snap?.bank ?? {};
  const bankIncoming: Record<string, any> = {
    account_number: pickString(b?.account_number, snap?.account_number, snap?.bank_account_number, snap?.["bank-account-number"]),
    ifsc_code: normIfsc(b?.ifsc ?? b?.ifsc_code ?? snap?.ifsc ?? snap?.ifsc_code ?? snap?.["bank-ifsc"]),
    bank_name: pickString(b?.bank_name, snap?.bank_name, snap?.["bank-name"]),
    branch: pickString(b?.branch, b?.branch_name, snap?.branch, snap?.["bank-branch"]),
  };

  const { data: bdCur } = await svc.from("hr_employee_bank_details").select("*").eq("employee_id", hrId).maybeSingle();
  const bdPick = pickPatch(bdCur as any, bankIncoming);
  if (bdCur) {
    if (Object.keys(bdPick.patch).length) {
      await svc.from("hr_employee_bank_details").update(bdPick.patch).eq("employee_id", hrId);
    }
  } else if (Object.keys(bdPick.patch).length) {
    await svc.from("hr_employee_bank_details").insert({ employee_id: hrId, ...bdPick.patch });
  }

  return { hr_employees: empPick, work_info: wiPick, bank: bdPick };
}

// Mirror the Razorpay snapshot into the onboarding row so the wizard form
// opens pre-filled with everything Razorpay knows about the employee.
// ERP-wins: only fills fields that are currently NULL on the onboarding row.
async function projectSnapshotIntoOnboarding(
  svc: SupabaseClient,
  hrId: string,
  snap: any,
): Promise<{ wrote: string[]; conflicts: string[] } | null> {
  const { data: ob } = await svc.from("hr_employee_onboarding")
    .select("id,first_name,last_name,email,phone,gender,date_of_birth,department_id,position_id,job_role,employee_type,date_of_joining,ctc")
    .eq("employee_id", hrId).maybeSingle();
  if (!ob) return null;

  const { first, last } = splitName(snap?.name || "");
  const deptName = pickString(snap?.department);
  const jobTitle = pickString(snap?.title, snap?.designation, snap?.job_title);
  let departmentId: string | null = null;
  let positionId: string | null = null;
  if (deptName) {
    const { data: d } = await svc.from("departments").select("id").ilike("name", deptName.trim()).limit(1).maybeSingle();
    if (d?.id) departmentId = d.id;
  }
  if (jobTitle) {
    positionId = await resolveOrCreatePositionId(svc, jobTitle);
  }

  // CTC comes from the salary sub-response injected onto snap.__salary by the
  // pull flow. Fall back to any legacy salary block that may already be on the
  // snapshot root, and finally to top-level fields (some tenants inline salary
  // keys directly on person view).
  const readNumAny = (obj: any, keys: string[]): number | null => {
    if (!obj || typeof obj !== "object") return null;
    for (const k of keys) {
      const v = obj[k];
      const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : v;
      if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
    }
    return null;
  };
  const CTC_KEYS = ["annual_ctc","ctc-annual","ctc_annual","ctc","annual-ctc","ctc-yearly","annual-salary","annual-gross"];
  const MONTHLY_KEYS = ["monthly-gross","monthly_gross","gross","monthly-ctc","monthly-salary"];
  const salaryBlock = snap?.__salary || snap?.salary || snap?.["salary-structure"] || snap?.salary_structure || null;
  let ctcAnnual: number | null =
    readNumAny(salaryBlock, CTC_KEYS) ||
    readNumAny(snap, CTC_KEYS);
  if (!ctcAnnual) {
    const monthly = readNumAny(salaryBlock, MONTHLY_KEYS) || readNumAny(snap, MONTHLY_KEYS);
    if (monthly && monthly > 0) ctcAnnual = Math.round(monthly * 12);
  }


  const incoming: Record<string, any> = {
    first_name: pickString(snap?.first_name, first) || null,
    last_name: pickString(snap?.last_name, last) || null,
    email: pickString(snap?.email)?.toLowerCase() || null,
    phone: normPhone(snap?.phone_number ?? snap?.phone),
    gender: pickString(snap?.gender)?.toLowerCase() || null,
    date_of_birth: parseDobIso(snap?.["date-of-birth"] ?? snap?.date_of_birth ?? snap?.dob),
    department_id: departmentId,
    position_id: positionId,
    job_role: jobTitle,
    employee_type: pickString(snap?.employee_type, snap?.employment_type),
    // Razorpay actually uses `date-of-hiring` (verified against production
    // snapshots); the *-joining aliases are kept for legacy/other tenants.
    date_of_joining: parseDobIso(
      snap?.["date-of-hiring"] ??
      snap?.date_of_hiring ??
      snap?.hiring_date ??
      snap?.["date-of-joining"] ??
      snap?.date_of_joining ??
      snap?.joining_date
    ),
    ctc: ctcAnnual && ctcAnnual > 0 ? ctcAnnual : null,
  };
  const picked = pickPatch(ob as any, incoming);
  if (Object.keys(picked.patch).length) {
    await svc.from("hr_employee_onboarding").update(picked.patch).eq("id", (ob as any).id);
  }
  return picked;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;
    if (!KEY_ID || !KEY_SECRET) return json(500, { error: "Missing RAZORPAY_PAYROLL_KEY_ID / _SECRET" });

    const svc = createClient(SUPA_URL, SVC);
    const perm = await requirePermission(authed.userId, svc);
    if (!perm.ok) return json(403, { error: perm.msg });

    const payload = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = payload?.action ?? "validate_creds";

    // ---------- validate_creds / introspect_envelope ----------
    if (action === "validate_creds" || action === "introspect_envelope") {
      const eid = Number(payload?.employee_id ?? 1);
      const r = await opfinView(eid, payload?.employee_type ?? "employee");
      const preview = r.raw?.slice(0, 500) ?? null;
      const fields = r.body && typeof r.body === "object" && !Array.isArray(r.body)
        ? Object.keys(r.body) : null;
      if (r.ok) await markCredsValidated(svc);
      const attempt = {
        url: `${BASE}/people`,
        http_status: r.status,
        body_type: r.body && typeof r.body === "object" ? "object" : typeof r.body,
        top_level_keys: fields ?? [],
        array_key: null, array_length: null,
        scalar_keys: fields ?? [], element_field_names: fields,
        raw_length: r.raw?.length ?? 0, raw_preview: preview,
      };
      if (action === "validate_creds") {
        return json(200, {
          ok: r.ok, base_url_used: `${BASE}/people`, http_status: r.status,
          sample_employee_count: r.ok ? 1 : 0,
          error_body_snippet: r.ok ? null : preview, attempts: [attempt],
        });
      }
      return json(200, { ok: r.ok, http_status: r.status, ...attempt, attempts: [attempt] });
    }

    // ---------- fetch_one: preview + match, no writes ----------
    if (action === "fetch_one") {
      const eid = Number(payload?.employee_id);
      if (!Number.isFinite(eid) || eid < 1) return json(400, { error: "employee_id required" });
      const r = await opfinView(eid);
      if (!r.ok) return json(200, { ok: false, http_status: r.status, error: r.errText || r.raw?.slice(0, 300) });
      const match = await matchEmployee(svc, r.body);
      return json(200, {
        ok: true, employee_id: eid,
        preview: {
          // Send back only non-PII scalars + first-name hint for operator confirmation.
          name: r.body.name, title: r.body.title, department: r.body.department,
          is_active: r.body.is_active,
        },
        field_names: fieldNames(r.body),
        match,
      });
    }

    // ---------- apply_one: pilot write (unlocks bulk on success) ----------
    if (action === "apply_one") {
      const eid = Number(payload?.employee_id);
      if (!Number.isFinite(eid) || eid < 1) return json(400, { error: "employee_id required" });
      const r = await opfinView(eid);
      if (!r.ok) return json(200, { ok: false, http_status: r.status, error: r.errText || "Not found" });

      // Block dismissed / inactive Razorpay employees from entering the ERP.
      const rp = r.body || {};
      const rpStatus = String(rp.status || "").toLowerCase();
      if (
        rpStatus === "dismissed" ||
        rpStatus === "terminated" ||
        rpStatus === "resigned" ||
        rp.is_active === false ||
        !!rp.date_of_leaving ||
        !!rp.dismissed_at
      ) {
        return json(200, {
          ok: false,
          http_status: r.status,
          skipped: "dismissed",
          error: "Razorpay employee is dismissed/inactive — import blocked.",
          razorpay_status: rp.status ?? null,
        });
      }

      let match = await matchEmployee(svc, r.body);
      let hrId = match.hr_employee_id;
      let created = false;
      if (!hrId) {
        hrId = await createDraftEmployee(svc, r.body);
        created = true;
      }
      await upsertMap(svc, String(eid), hrId!, true, created);
      // Project the full Razorpay snapshot into ERP + onboarding row so HR
      // opens the wizard pre-filled (gender, DOB, department, designation,
      // DOJ, work_email, bank details when Razorpay returns them).
      let projDiff: any = null;
      let obDiff: any = null;
      try {
        projDiff = await projectSnapshotIntoErp(svc, hrId!, r.body);
        obDiff = await projectSnapshotIntoOnboarding(svc, hrId!, r.body);
        await svc.from("hr_razorpay_employee_map").update({
          last_pull_snapshot: r.body,
          last_pulled_at: new Date().toISOString(),
          last_payload_hash: await canonicalHash(r.body),
        }).eq("razorpay_employee_id", String(eid));
      } catch (projErr) {
        console.error("[apply_one] project failed", (projErr as Error).message);
      }
      await logSync(svc, {
        action: created ? "create_draft" : "match",
        http_status: r.status,
        razorpay_employee_id: String(eid),
        hr_employee_id: hrId,
        field_diff_summary: {
          field_names: fieldNames(r.body),
          matched_by: match.matched_by,
          pilot: true,
          projected: projDiff ? {
            hr_employees: projDiff.hr_employees.wrote,
            work_info: projDiff.work_info.wrote,
            bank: projDiff.bank.wrote,
          } : null,
          onboarding_prefilled: obDiff?.wrote ?? null,
        },
        actor_user_id: authed.userId,
      });
      await stampLastImport(svc);
      return json(200, { ok: true, hr_employee_id: hrId, created, matched_by: match.matched_by });
    }

    // ---------- unlock_bulk: human gate after pilot verification ----------
    if (action === "unlock_bulk") {
      const { data: pilot } = await svc.from("hr_razorpay_employee_map")
        .select("razorpay_employee_id").eq("is_pilot_verified", true).limit(1).maybeSingle();
      if (!pilot) return json(400, { error: "No pilot-verified employee. Run apply_one first." });
      await unlockBulk(svc);
      await logSync(svc, {
        action: "unlock_bulk", http_status: 200,
        razorpay_employee_id: String(pilot.razorpay_employee_id),
        actor_user_id: authed.userId,
      });
      return json(200, { ok: true });
    }

    // ---------- probe_endpoint: gated read-only sub-type validator ----------
    // Used by Phase-planning to prove which Opfin sub-types exist against the
    // live tenant BEFORE any Phase B/C/... UI is wired to them. Writes are
    // NEVER allowed here — only an allowlist of read-only sub-types can run.
    if (action === "probe_endpoint") {
      const resource = String(payload?.resource ?? "").trim();
      const subType = String(payload?.sub_type ?? "").trim();
      const data = (payload?.data && typeof payload.data === "object") ? payload.data : {};
      // Only read variants that actually exist in the Opfin API (verified against
      // the Postman collection). Everything else — salary-structure/*, payslip/*,
      // tds/*, webhook/*, bank-details/*, people:list, payroll:list/status/months/runs
      // — is not in the doc and is intentionally rejected here.
      const READONLY = new Set([
        "people:view",
        "payroll:view-payroll",
        "attendance:fetch",
        "contractor-payment:list-pending",
        "contractor-payment:get-status",
      ]);
      const key = `${resource}:${subType}`;
      if (!READONLY.has(key)) {
        return json(200, {
          ok: false, skipped: true, key,
          reason: "probe restricted to read-only sub-types; write sub-types require operator-approved payload before live-tenant call",
        });
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      try {
        const res = await fetch(`${BASE}/${resource}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            auth: authBlock(),
            request: { type: resource, "sub-type": subType },
            data,
          }),
          signal: ctrl.signal,
        });
        const raw = await res.text();
        let body: any = null;
        try { body = JSON.parse(raw); } catch { /* keep raw */ }
        const topKeys = body && typeof body === "object" && !Array.isArray(body)
          ? Object.keys(body).slice(0, 30) : null;
        const errText = body && typeof body === "object" ? (body.error || body.message || null) : null;
        return json(200, {
          ok: res.ok && !errText,
          key, http_status: res.status,
          top_level_keys: topKeys,
          error: errText,
          raw_preview: raw.slice(0, 400),
        });
      } catch (e) {
        return json(200, { ok: false, key, http_status: 0, error: (e as Error).message });
      } finally { clearTimeout(t); }
    }

    // ---------- probe_catalogue: batch probe every phase's sub-types ----------
    // Phase 2 deliverable. Iterates a hard-coded catalogue, probes read sub-types
    // via a real POST to Opfin, records write sub-types as "not_probed" (writes
    // require an operator-approved payload before any Live-tenant call).
    if (action === "probe_catalogue") {
      type Row = {
        phase: string; key: string; mode: "read" | "write";
        status: "ok" | "fail" | "not_probed" | "skipped"; http_status: number | null;
        error: string | null; top_level_keys: string[] | null;
      };
      // Verified against RazorpayX Payroll Postman collection (Opfin).
      // Each entry maps to a real endpoint that exists in the doc.
      const CATALOGUE: Array<{ phase: string; key: string; mode: "read" | "write" }> = [
        { phase: "People", key: "people:view", mode: "read" },
        { phase: "People", key: "people:create", mode: "write" },
        { phase: "People", key: "people:edit", mode: "write" },
        { phase: "People", key: "people:set-salary", mode: "write" },
        { phase: "People", key: "people:dismiss", mode: "write" },
        { phase: "Attendance", key: "attendance:fetch", mode: "read" },
        { phase: "Attendance", key: "attendance:modify", mode: "write" },
        { phase: "Payroll modifications", key: "payroll:add-additions", mode: "write" },
        { phase: "Payroll modifications", key: "payroll:add-deduction", mode: "write" },
        { phase: "Payroll modifications", key: "payroll:reset-modifications", mode: "write" },
        { phase: "Payroll modifications", key: "payroll:do-not-pay", mode: "write" },
        { phase: "Payroll pull", key: "payroll:view-payroll", mode: "read" },
        { phase: "Contractor payments", key: "contractor-payment:create", mode: "write" },
        { phase: "Contractor payments", key: "contractor-payment:list-pending", mode: "read" },
        { phase: "Contractor payments", key: "contractor-payment:get-status", mode: "read" },
        { phase: "Contractor payments", key: "contractor-payment:delete", mode: "write" },
        { phase: "Advance salary", key: "advance-salary:create", mode: "write" },
      ];

      // Pilot IDs: prefer operator-configured probe IDs from settings, else
      // fall back to any pilot-verified employee already mapped.
      const { data: settingsRow } = await svc
        .from("hr_razorpay_settings")
        .select("probe_pilot_employee_id, probe_pilot_contractor_id")
        .eq("is_singleton", true)
        .maybeSingle();
      const configuredEmpId = settingsRow?.probe_pilot_employee_id
        ? String(settingsRow.probe_pilot_employee_id).trim() || null : null;
      const configuredContractorId = settingsRow?.probe_pilot_contractor_id
        ? String(settingsRow.probe_pilot_contractor_id).trim() || null : null;

      let fallbackEmpId: string | null = null;
      if (!configuredEmpId) {
        const { data: pilot } = await svc
          .from("hr_razorpay_employee_map")
          .select("razorpay_employee_id")
          .eq("is_pilot_verified", true)
          .limit(1).maybeSingle();
        fallbackEmpId = pilot?.razorpay_employee_id ? String(pilot.razorpay_employee_id) : null;
      }
      const probeEmployeeId = configuredEmpId ?? fallbackEmpId;
      const probeContractorId = configuredContractorId;

      const rows: Row[] = [];
      for (const item of CATALOGUE) {
        if (item.mode === "write") {
          rows.push({
            ...item, status: "not_probed", http_status: null, error: null, top_level_keys: null,
          });
          continue;
        }
        const [resource, subType] = item.key.split(":");
        const URL_MAP: Record<string, string> = {
          "contractor-payment": "contractorPayment",
          "advance-salary": "advanceSalary",
          "att": "att",
          "attendance": "att",
        };
        const bodyType = resource === "att" ? "attendance" : resource;
        const urlPath = URL_MAP[resource] ?? resource;

        // Skip early when the sub-type requires an ID we don't have configured.
        const needsEmployee = (bodyType === "people") || (bodyType === "attendance");
        const needsContractor = (bodyType === "contractor-payment" && subType === "get-status");
        if (needsEmployee && !probeEmployeeId) {
          rows.push({
            ...item, status: "skipped", http_status: null,
            error: "No pilot employee configured — set one in probe settings above.",
            top_level_keys: null,
          });
          continue;
        }
        if (needsContractor && !probeContractorId) {
          rows.push({
            ...item, status: "skipped", http_status: null,
            error: "No pilot contractor configured — set one in probe settings above.",
            top_level_keys: null,
          });
          continue;
        }

        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        try {
          const body: any = { auth: authBlock(), request: { type: bodyType, "sub-type": subType } };
          if (bodyType === "people" && probeEmployeeId) {
            body.data = { "employee-id": probeEmployeeId, "employee-type": "employee" };
          } else if (bodyType === "attendance" && probeEmployeeId) {
            body.data = { "employee-id": probeEmployeeId };
          } else if (bodyType === "contractor-payment" && subType === "get-status" && probeContractorId) {
            body.data = { "contractor-payment-id": probeContractorId };
          }
          const res = await fetch(`${BASE}/${urlPath}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
            signal: ctrl.signal,
          });
          const raw = await res.text();
          let parsed: any = null;
          try { parsed = JSON.parse(raw); } catch { /* keep raw */ }
          const topKeys = parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? Object.keys(parsed).slice(0, 20) : null;
          const errRaw = parsed && typeof parsed === "object" ? (parsed.error ?? parsed.message ?? null) : null;
          const errText = errRaw == null ? null : (typeof errRaw === "string" ? errRaw : JSON.stringify(errRaw));

          const looksMissingSubType = res.status === 404
            || (typeof errText === "string" && /unknown|invalid\s*sub[-_ ]?type/i.test(errText));
          // "No seed data on tenant" signatures: Opfin PHP surface returns
          // these when the requested resource simply has nothing to enumerate
          // (empty payroll month, no contractors, empty listing). Treat as
          // skipped so operators aren't misled into thinking auth is broken.
          const looksEmptySeed = typeof errText === "string" && (
            /Undefined property:\s*stdClass::\$data/i.test(errText) ||
            /foreach\(\)\s*argument\s*must\s*be\s*of\s*type\s*array/i.test(errText) ||
            /no\s*(records|data|results)\s*found/i.test(errText)
          );

          let status: Row["status"];
          let note = errText ? String(errText).slice(0, 200) : null;
          if (!errText && res.ok) {
            status = "ok";
          } else if (looksEmptySeed) {
            status = "skipped";
            note = "Endpoint reachable — no seed data on this tenant to probe against.";
          } else if (looksMissingSubType) {
            status = "fail";
          } else {
            status = "fail";
          }
          rows.push({ ...item, status, http_status: res.status, error: note, top_level_keys: topKeys });
        } catch (e) {
          rows.push({ ...item, status: "fail", http_status: 0, error: (e as Error).message.slice(0, 200), top_level_keys: null });
        } finally {
          clearTimeout(t);
        }
        // gentle spacing between probes
        await new Promise((r) => setTimeout(r, 250));
      }

      // Log probe run (PII-safe: sub-types + status only).
      try {
        await svc.from("hr_razorpay_sync_log").insert({
          action: "drift_check",
          http_status: 200,
          field_diff_summary: {
            probe_run: true,
            probe_employee_id: probeEmployeeId,
            probe_contractor_id: probeContractorId,
            results: rows.map((r) => ({ key: r.key, status: r.status, http: r.http_status })),
          },
          actor_user_id: authed.userId,
        });
      } catch { /* logging is best-effort */ }

      return json(200, {
        ok: true,
        probe_id: probeEmployeeId,
        probe_employee_id: probeEmployeeId,
        probe_contractor_id: probeContractorId,
        rows,
      });
    }

    // ---------- save_probe_pilots: operator sets probe pilot IDs ----------
    if (action === "save_probe_pilots") {
      const empId = typeof payload?.probe_pilot_employee_id === "string"
        ? payload.probe_pilot_employee_id.trim() : "";
      const conId = typeof payload?.probe_pilot_contractor_id === "string"
        ? payload.probe_pilot_contractor_id.trim() : "";
      const { error } = await svc.from("hr_razorpay_settings").update({
        probe_pilot_employee_id: empId || null,
        probe_pilot_contractor_id: conId || null,
      }).eq("is_singleton", true);
      if (error) return json(500, { error: error.message });
      return json(200, {
        ok: true,
        probe_pilot_employee_id: empId || null,
        probe_pilot_contractor_id: conId || null,
      });
    }



    const settings = await readSettings(svc);

    // ---------- dry_run_range / apply_range ----------
    if (action === "dry_run_range" || action === "apply_range") {
      if (action === "apply_range" && !settings?.bulk_sync_unlocked) {
        return json(403, { error: "Bulk sync locked. Unlock after pilot verification." });
      }

      // `only_ids` powers the "Retry failed IDs" affordance: iterate ONLY the
      // supplied Razorpay IDs, skip the consecutive-miss stop (they were
      // hand-picked), and stamp every audit row with retry:true so #70's story
      // reads end-to-end under the same apply_error / create_draft / match
      // actions as the original run.
      const onlyIdsRaw: any[] = Array.isArray(payload?.only_ids) ? payload.only_ids : [];
      const onlyIds: number[] = onlyIdsRaw
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n >= 1);
      const isRetry = onlyIds.length > 0;

      let start = 1, end = 1;
      if (isRetry) {
        if (onlyIds.length > 200) return json(400, { error: "Retry batch too wide (max 200 IDs)" });
      } else {
        start = Math.max(1, Number(payload?.start_id ?? 1));
        end = Math.max(start, Number(payload?.max_id ?? start));
        const HARD_CAP = 1000;
        if (end - start + 1 > HARD_CAP) return json(400, { error: `Range too wide (max ${HARD_CAP})` });
      }

      const rows: any[] = [];
      let consecutiveMisses = 0;
      const STOP_AFTER = 30;

      const iterIds: number[] = isRetry ? onlyIds : [];
      const iterLen = isRetry ? iterIds.length : (end - start + 1);
      for (let idx = 0; idx < iterLen; idx++) {
        const i = isRetry ? iterIds[idx] : (start + idx);
        const r = await opfinView(i);
        if (!r.ok) {
          consecutiveMisses++;
          const isServerErr = r.status === 0 || r.status >= 500;
          const snippet = (r.raw || r.errText || `HTTP ${r.status}`).toString().slice(0, 800);
          rows.push({
            employee_id: i,
            status: "miss",
            http_status: r.status,
            error: isServerErr ? snippet : undefined,
          });
          // Only server-side / network errors deserve an audit row — genuine
          // 404-style misses on unused IDs would flood the log otherwise.
          if (action === "apply_range" && isServerErr) {
            await logSync(svc, {
              action: "apply_error",
              http_status: r.status || 500,
              razorpay_employee_id: String(i),
              field_diff_summary: { bulk: true, phase: "view", retry: isRetry },
              error_text: snippet,
              actor_user_id: authed.userId,
            }).catch(() => {});
          }
          // Retry runs are explicit — never trip the range-mode auto-stop.
          if (!isRetry && consecutiveMisses >= STOP_AFTER) {
            rows.push({ employee_id: null, status: "stopped", note: `${STOP_AFTER} consecutive misses` });
            break;
          }
          continue;

        }
        consecutiveMisses = 0;

        // Skip dismissed / inactive Razorpay employees. Razorpay flags
        // separated staff via status="dismissed", is_active=false, or by
        // populating date_of_leaving/dismissed_at. We do NOT import or
        // match these — they must not appear in the ERP employee master.
        const rp = r.body || {};
        const rpStatus = String(rp.status || "").toLowerCase();
        const isDismissed =
          rpStatus === "dismissed" ||
          rpStatus === "terminated" ||
          rpStatus === "resigned" ||
          rp.is_active === false ||
          !!rp.date_of_leaving ||
          !!rp.dismissed_at;
        if (isDismissed) {
          rows.push({
            employee_id: i,
            status: "skipped_dismissed",
            name: rp.name, title: rp.title, department: rp.department,
            is_active: rp.is_active,
            razorpay_status: rp.status ?? null,
            date_of_leaving: rp.date_of_leaving ?? null,
          });
          continue;
        }

        const match = await matchEmployee(svc, r.body);
        rows.push({
          employee_id: i,
          status: "hit",
          name: r.body.name, title: r.body.title, department: r.body.department,
          is_active: r.body.is_active,
          matched_by: match.matched_by,
          action_planned: match.action, // "match" | "create_draft"
          hr_employee_id: match.hr_employee_id,
        });

        if (action === "apply_range") {
          try {
            let hrId = match.hr_employee_id;
            let created = false;
            if (!hrId) { hrId = await createDraftEmployee(svc, r.body); created = true; }
            await upsertMap(svc, String(i), hrId!, false, created);
            // Project full snapshot into ERP + onboarding row so the
            // onboarding wizard opens pre-filled with Razorpay data.
            let projDiff: any = null;
            let obDiff: any = null;
            try {
              projDiff = await projectSnapshotIntoErp(svc, hrId!, r.body);
              obDiff = await projectSnapshotIntoOnboarding(svc, hrId!, r.body);
              await svc.from("hr_razorpay_employee_map").update({
                last_pull_snapshot: r.body,
                last_pulled_at: new Date().toISOString(),
                last_payload_hash: await canonicalHash(r.body),
              }).eq("razorpay_employee_id", String(i));
            } catch (projErr) {
              console.error("[apply_range] project failed", (projErr as Error).message);
            }
            await logSync(svc, {
              action: created ? "create_draft" : "match",
              http_status: r.status,
              razorpay_employee_id: String(i),
              hr_employee_id: hrId,
              field_diff_summary: {
                field_names: fieldNames(r.body),
                matched_by: match.matched_by,
                bulk: true,
                retry: isRetry,
                projected: projDiff ? {
                  hr_employees: projDiff.hr_employees.wrote,
                  work_info: projDiff.work_info.wrote,
                  bank: projDiff.bank.wrote,
                } : null,
                onboarding_prefilled: obDiff?.wrote ?? null,
              },
              actor_user_id: authed.userId,
            });
            rows[rows.length - 1].applied = true;
            rows[rows.length - 1].created = created;
            rows[rows.length - 1].hr_employee_id = hrId;
            rows[rows.length - 1].onboarding_prefilled = obDiff?.wrote?.length ?? 0;
          } catch (rowErr: any) {
            const msg = String(rowErr?.message ?? rowErr).slice(0, 800);
            rows[rows.length - 1].applied = false;
            rows[rows.length - 1].error = msg;
            await logSync(svc, {
              action: "apply_error",
              http_status: 500,
              razorpay_employee_id: String(i),
              field_diff_summary: { bulk: true, phase: "apply", retry: isRetry },
              error_text: msg,
              actor_user_id: authed.userId,
            }).catch(() => {});
          }
        }
      }

      if (action === "apply_range") await stampLastImport(svc);

      const summary = {
        total: rows.length,
        hits: rows.filter((r) => r.status === "hit").length,
        matches: rows.filter((r) => r.action_planned === "match").length,
        creates: rows.filter((r) => r.action_planned === "create_draft").length,
        misses: rows.filter((r) => r.status === "miss").length,
        skipped_dismissed: rows.filter((r) => r.status === "skipped_dismissed").length,
        errors: rows.filter((r) => r.error).length,
        stopped: rows.some((r) => r.status === "stopped"),
      };
      return json(200, { ok: true, summary, rows });
    }

    // ---------- pull_person_full: deep-pull + project (Phase 1a) ----------
    // Fetches people:view for every mapped Razorpay id (or a supplied subset),
    // stores the raw envelope, and projects it into hr_employees /
    // hr_employee_work_info / hr_employee_bank_details using ERP-wins
    // semantics. NEVER touches is_active. NEVER pushes to Razorpay.
    if (action === "pull_person_full") {
      const only: string[] | null = Array.isArray(payload?.razorpay_employee_ids) && payload.razorpay_employee_ids.length
        ? payload.razorpay_employee_ids.map((v: any) => String(v))
        : null;

      let query = svc.from("hr_razorpay_employee_map")
        .select("razorpay_employee_id,hr_employee_id,last_payload_hash");
      if (only) query = query.in("razorpay_employee_id", only);
      const { data: maps, error: mapsErr } = await query;
      if (mapsErr) return json(500, { error: `map read failed: ${mapsErr.message}` });

      const rows: any[] = [];
      let pulled = 0, skipped = 0, missed = 0, errored = 0, wroteAny = 0;

      for (const m of maps || []) {
        const eid = Number(m.razorpay_employee_id);
        if (!Number.isFinite(eid) || eid < 1) { skipped++; continue; }
        const r = await opfinView(eid);
        if (!r.ok) {
          missed++;
          rows.push({ razorpay_employee_id: m.razorpay_employee_id, status: "miss", http_status: r.status });
          continue;
        }
        // Fetch salary sub-response as well — people:view never carries CTC.
        // Attach onto snapshot as __salary so projectors can read it. Silent on
        // failure (Razorpay returns nothing when salary structure isn't set).
        const sal = await opfinSalary(eid, (r.body as any)?.email);
        if (sal.ok) {
          (r.body as any).__salary = {
            annual_ctc: sal.annual_ctc,
            monthly_gross: sal.monthly_gross,
            components: sal.components,
          };
        } else {
          (r.body as any).__salary_probe_error = sal.err;
        }
        try {
          const hash = await canonicalHash(r.body);
          // We always project this pass — the projector uses ERP-wins semantics
          // (only fills nulls / matching sentinels), and we recently expanded
          // the field map (date-of-hiring, __salary → ctc) so stale hashes must
          // not gate the backfill.
          await svc.from("hr_razorpay_employee_map").update({
            last_pull_snapshot: r.body,
            last_pulled_at: new Date().toISOString(),
            last_payload_hash: hash,
          }).eq("razorpay_employee_id", m.razorpay_employee_id);

          let diff: any = null;
          let obDiff: any = null;
          diff = await projectSnapshotIntoErp(svc, m.hr_employee_id, r.body);
          obDiff = await projectSnapshotIntoOnboarding(svc, m.hr_employee_id, r.body);
          const wroteCount = diff.hr_employees.wrote.length + diff.work_info.wrote.length + diff.bank.wrote.length + (obDiff?.wrote?.length ?? 0);
          if (wroteCount) wroteAny++;
          const unchanged = false;

          await logSync(svc, {
            action: "pull_person",
            http_status: r.status,
            razorpay_employee_id: String(eid),
            hr_employee_id: m.hr_employee_id,
            field_diff_summary: {
              unchanged,
              wrote: diff ? {
                hr_employees: diff.hr_employees.wrote,
                work_info: diff.work_info.wrote,
                bank: diff.bank.wrote,
                onboarding: obDiff?.wrote ?? [],
              } : null,
              conflicts: diff ? {
                hr_employees: diff.hr_employees.conflicts,
                work_info: diff.work_info.conflicts,
                bank: diff.bank.conflicts,
                onboarding: obDiff?.conflicts ?? [],
              } : null,
              field_names: fieldNames(r.body),
            },
            actor_user_id: authed.userId,
          });

          pulled++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            status: unchanged ? "unchanged" : "projected",
            wrote: diff ? {
              hr_employees: diff.hr_employees.wrote.length,
              work_info: diff.work_info.wrote.length,
              bank: diff.bank.wrote.length,
              onboarding: obDiff?.wrote?.length ?? 0,
            } : null,
            conflicts: diff ? diff.hr_employees.conflicts.length + diff.work_info.conflicts.length + diff.bank.conflicts.length + (obDiff?.conflicts?.length ?? 0) : 0,
          });
        } catch (rowErr: any) {
          errored++;
          const msg = String(rowErr?.message ?? rowErr);
          rows.push({ razorpay_employee_id: m.razorpay_employee_id, status: "error", error: msg });
          await logSync(svc, {
            action: "pull_person", http_status: 500,
            razorpay_employee_id: String(eid),
            hr_employee_id: m.hr_employee_id,
            error_text: msg,
            actor_user_id: authed.userId,
          }).catch(() => {});
        }
      }

      return json(200, {
        ok: true,
        summary: { total: (maps || []).length, pulled, projected_writes: wroteAny, missed, errored, skipped },
        rows,
      });
    }

    // ---------- PHASE 3 — Employee-master PUSH (people:update) ----------
    // Build a conservative payload from the current ERP row, diff against the
    // last pull snapshot cached on hr_razorpay_employee_map, and (optionally)
    // POST people:update. Pilot-one gate: bulk push requires push_pilot_verified
    // on settings AND explicit unlock_bulk_push.
    //
    // Fields whitelisted for push (identity/metadata only — bank/PAN handled in
    // Phase 4 with an isolated flow):
    //   name, phone_number, email, gender, date-of-birth,
    //   department, title, date-of-joining, employee_type
    if (
      action === "push_person_dry_run" ||
      action === "push_person_apply_one" ||
      action === "push_person_apply_bulk"
    ) {
      const settingsRow = await readSettings(svc);
      const only: string[] | null = Array.isArray(payload?.razorpay_employee_ids) && payload.razorpay_employee_ids.length
        ? payload.razorpay_employee_ids.map((v: any) => String(v))
        : (payload?.razorpay_employee_id ? [String(payload.razorpay_employee_id)] : null);

      if (action === "push_person_apply_bulk") {
        if (!settingsRow?.push_pilot_verified_at) {
          return json(400, { error: "Push pilot not yet verified. Run push_person_apply_one on one employee first." });
        }
        if (!settingsRow?.bulk_push_unlocked) {
          return json(400, { error: "Bulk push locked. Call action:unlock_bulk_push after reviewing the pilot log." });
        }
      }
      if (action === "push_person_apply_one" && (!only || only.length !== 1)) {
        return json(400, { error: "push_person_apply_one requires exactly one razorpay_employee_id" });
      }

      // Load mappings + latest snapshot.
      let query = svc.from("hr_razorpay_employee_map")
        .select("razorpay_employee_id,hr_employee_id,last_pull_snapshot,is_pilot_verified");
      if (only) query = query.in("razorpay_employee_id", only);
      const { data: maps, error: mapsErr } = await query;
      if (mapsErr) return json(500, { error: `map read failed: ${mapsErr.message}` });
      if (!maps?.length) return json(400, { error: "No mappings resolved for the requested id(s)" });

      // Collect ERP snapshots in bulk.
      const hrIds = maps.map((m: any) => m.hr_employee_id).filter(Boolean);
      const [{ data: emps }, { data: wis }] = await Promise.all([
        svc.from("hr_employees")
          .select("id,first_name,last_name,email,phone,gender,dob")
          .in("id", hrIds),
        svc.from("hr_employee_work_info")
          .select("employee_id,department_id,job_role,joining_date,employee_type")
          .in("employee_id", hrIds),
      ]);
      const empById = new Map((emps || []).map((r: any) => [r.id, r]));
      const wiById = new Map((wis || []).map((r: any) => [r.employee_id, r]));
      const deptIds = Array.from(new Set((wis || []).map((r: any) => r.department_id).filter(Boolean)));
      const deptById = new Map<string, string>();
      if (deptIds.length) {
        const { data: depts } = await svc.from("departments").select("id,name").in("id", deptIds);
        for (const d of depts || []) deptById.set(d.id, d.name);
      }

      function buildIncoming(hrId: string): Record<string, any> {
        const e: any = empById.get(hrId) || {};
        const w: any = wiById.get(hrId) || {};
        const full = [e.first_name, e.last_name].filter(Boolean).join(" ").trim();
        const dobIso = e.dob ? String(e.dob) : null;
        // Razorpay accepts dd/mm/yyyy for date-of-birth on people:update.
        const dobRp = dobIso && /^\d{4}-\d{2}-\d{2}$/.test(dobIso)
          ? `${dobIso.slice(8, 10)}/${dobIso.slice(5, 7)}/${dobIso.slice(0, 4)}` : null;
        const joinIso = w.joining_date ? String(w.joining_date) : null;
        const joinRp = joinIso && /^\d{4}-\d{2}-\d{2}$/.test(joinIso)
          ? `${joinIso.slice(8, 10)}/${joinIso.slice(5, 7)}/${joinIso.slice(0, 4)}` : null;
        return {
          name: full || null,
          phone_number: normPhone(e.phone),
          email: e.email ? String(e.email).trim().toLowerCase() : null,
          gender: e.gender ? String(e.gender).toLowerCase() : null,
          "date-of-birth": dobRp,
          department: deptById.get(w.department_id) || null,
          title: w.job_role || null,
          "date-of-joining": joinRp,
          employee_type: w.employee_type || null,
        };
      }

      // Diff incoming vs last snapshot; only include keys where the value
      // actually differs (case/whitespace normalised).
      function diffPayload(incoming: Record<string, any>, snap: any): { patch: Record<string, any>; changed: string[]; conflicts: string[] } {
        const patch: Record<string, any> = {};
        const changed: string[] = [];
        const conflicts: string[] = [];
        const s = snap && typeof snap === "object" ? snap : {};
        for (const [k, v] of Object.entries(incoming)) {
          if (v === null || v === undefined || v === "") continue;
          const cur = s?.[k];
          const curStr = cur === null || cur === undefined ? "" : String(cur).trim();
          const nextStr = String(v).trim();
          if (curStr === nextStr) continue;
          patch[k] = v;
          changed.push(k);
          if (curStr) conflicts.push(k);
        }
        return { patch, changed, conflicts };
      }

      const rows: any[] = [];
      let planned = 0, unchanged = 0, pushed = 0, failed = 0, skipped = 0;

      let noBaseline = 0;
      for (const m of maps) {
        const eid = Number(m.razorpay_employee_id);
        if (!Number.isFinite(eid) || eid < 1 || !m.hr_employee_id) { skipped++; continue; }
        const hasBaseline = !!m.last_pull_snapshot && typeof m.last_pull_snapshot === "object";
        const incoming = buildIncoming(m.hr_employee_id);
        const diff = diffPayload(incoming, m.last_pull_snapshot);
        if (!diff.changed.length) {
          unchanged++;
          rows.push({ razorpay_employee_id: m.razorpay_employee_id, status: "unchanged", changed: [] });
          continue;
        }
        planned++;
        if (action === "push_person_dry_run") {
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            hr_employee_id: m.hr_employee_id,
            status: hasBaseline ? "planned" : "no_baseline",
            baseline_missing: !hasBaseline,
            changed: diff.changed,
            conflicts: diff.conflicts,
            payload_field_names: Object.keys(diff.patch).sort(),
          });
          if (!hasBaseline) noBaseline++;
          continue;
        }
        // Live push guard: refuse to write against a null baseline — force deep-pull first.
        if (!hasBaseline) {
          noBaseline++;
          skipped++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            status: "skipped_no_baseline",
            error: "last_pull_snapshot is null — run Phase 1 deep-pull before pushing.",
          });
          continue;
        }

        // Live push
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        let httpStatus = 0; let ok = false; let errText: string | null = null;
        try {
          const res = await fetch(`${BASE}/people`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              auth: authBlock(),
              request: { type: "people", "sub-type": "edit" },
              data: { "employee-id": eid, "employee-type": "employee", ...diff.patch },
            }),
            signal: ctrl.signal,
          });
          httpStatus = res.status;
          const raw = await res.text();
          let body: any = null; try { body = JSON.parse(raw); } catch { /* ignore */ }
          const rpErr = body && typeof body === "object" ? (body.error || body.message || null) : null;
          ok = res.ok && !rpErr;
          if (!ok) errText = rpErr || raw?.slice(0, 400) || `HTTP ${res.status}`;
        } catch (e) {
          errText = `NETWORK: ${(e as Error).message}`;
        } finally { clearTimeout(t); }

        await logSync(svc, {
          action: "push_person",
          http_status: httpStatus,
          razorpay_employee_id: String(eid),
          hr_employee_id: m.hr_employee_id,
          field_diff_summary: { changed: diff.changed, conflicts: diff.conflicts, payload_field_names: Object.keys(diff.patch).sort() },
          error_text: ok ? null : errText,
          actor_user_id: authed.userId,
        });

        if (ok) {
          pushed++;
          // If this is pilot-apply and pilot not verified yet, stamp it.
          if (action === "push_person_apply_one" && !settingsRow?.push_pilot_verified_at) {
            await svc.from("hr_razorpay_settings").update({
              push_pilot_verified_at: new Date().toISOString(),
              push_pilot_hr_employee_id: m.hr_employee_id,
              last_push_at: new Date().toISOString(),
            }).eq("is_singleton", true);
          } else {
            await svc.from("hr_razorpay_settings").update({ last_push_at: new Date().toISOString() }).eq("is_singleton", true);
          }
          rows.push({ razorpay_employee_id: m.razorpay_employee_id, status: "pushed", changed: diff.changed });
        } else {
          failed++;
          rows.push({ razorpay_employee_id: m.razorpay_employee_id, status: "failed", changed: diff.changed, error: errText });
        }
      }

      return json(200, {
        ok: true,
        summary: { total: maps.length, planned, unchanged, pushed, failed, skipped, no_baseline: noBaseline },
        rows,
        pilot: {
          verified_at: settingsRow?.push_pilot_verified_at || null,
          bulk_unlocked: !!settingsRow?.bulk_push_unlocked,
        },
      });
    }

    // ---------- Phase 4: Bank & PAN push ----------
    // Isolated behind its own toggle + pilot + bulk unlock. Uses the verified
    // people:update envelope with hyphenated keys. Every candidate is validated
    // server-side (PAN + IFSC + account) before it can be pushed, and every push
    // requires last_pull_snapshot as a baseline (see Phase 3 no-baseline guard).
    if (
      action === "push_bank_dry_run" ||
      action === "push_bank_apply_one" ||
      action === "push_bank_apply_bulk"
    ) {
      const only: string[] | null = Array.isArray(payload?.razorpay_employee_ids) && payload.razorpay_employee_ids.length
        ? payload.razorpay_employee_ids.map((v: any) => String(v))
        : (payload?.razorpay_employee_id ? [String(payload.razorpay_employee_id)] : null);

      if (action === "push_bank_apply_bulk") {
        if (!settingsRow?.push_bank_pilot_verified_at) {
          return json(400, { error: "Bank push pilot not yet verified. Run push_bank_apply_one on one employee first." });
        }
        if (!settingsRow?.bulk_bank_push_unlocked) {
          return json(400, { error: "Bulk bank push is locked. Unlock explicitly after reviewing the dry-run." });
        }
      }
      if (action === "push_bank_apply_one" && (!only || only.length !== 1)) {
        return json(400, { error: "push_bank_apply_one requires exactly one razorpay_employee_id" });
      }

      let query = svc.from("hr_razorpay_employee_map")
        .select("razorpay_employee_id,hr_employee_id,last_pull_snapshot");
      if (only) query = query.in("razorpay_employee_id", only);
      const { data: maps, error: mapsErr } = await query;
      if (mapsErr) return json(500, { error: mapsErr.message });
      if (!maps?.length) return json(400, { error: "No mapped rows for the requested ids." });

      const hrIds = maps.map((m: any) => m.hr_employee_id).filter(Boolean);
      const [emps, bds] = await Promise.all([
        svc.from("hr_employees").select("id,first_name,last_name,pan_number").in("id", hrIds),
        svc.from("hr_employee_bank_details").select("employee_id,account_number,ifsc_code,bank_name").in("employee_id", hrIds),
      ]);
      const empById = new Map((emps.data || []).map((r: any) => [r.id, r]));
      const bdById = new Map((bds.data || []).map((r: any) => [r.employee_id, r]));

      function buildBankPatch(hrId: string): { patch: Record<string, any>; holderName: string } {
        const e = empById.get(hrId) || {};
        const b = bdById.get(hrId) || {};
        const holderName = [e.first_name, e.last_name].filter(Boolean).join(" ").trim();
        return {
          patch: {
            "pan": e.pan_number || null,
            "bank-account-number": b.account_number || null,
            "bank-ifsc": b.ifsc_code || null,
            "bank-name": b.bank_name || null,
            "bank-account-holder-name": holderName || null,
          },
          holderName,
        };
      }
      function diffBank(incoming: Record<string, any>, snapshot: any) {
        const changed: string[] = [];
        const patch: Record<string, any> = {};
        for (const k of Object.keys(incoming)) {
          const cur = snapshot?.[k];
          const nxt = incoming[k];
          if (nxt === null || nxt === undefined) continue;
          if (String(cur ?? "").trim() !== String(nxt).trim()) {
            changed.push(k);
            patch[k] = nxt;
          }
        }
        return { changed, patch };
      }
      function mask(v: string | null): string | null {
        if (!v) return v;
        const s = String(v);
        if (s.length <= 4) return "•".repeat(s.length);
        return "•".repeat(Math.max(0, s.length - 4)) + s.slice(-4);
      }

      const rows: any[] = [];
      let planned = 0, unchanged = 0, pushed = 0, failed = 0, skipped = 0, invalid = 0, noBaseline = 0;

      for (const m of maps as any[]) {
        const eid = Number(m.razorpay_employee_id);
        if (!Number.isFinite(eid) || eid < 1 || !m.hr_employee_id) { skipped++; continue; }

        // Server-side validation gate.
        const { data: v } = await svc.rpc("validate_bank_details_row", { _hr_employee_id: m.hr_employee_id });
        const valid = !!(v && (v as any).valid);
        const reasons: string[] = (v as any)?.reasons || [];
        if (!valid) {
          invalid++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            status: "invalid",
            reasons,
          });
          continue;
        }

        const hasBaseline = !!m.last_pull_snapshot && typeof m.last_pull_snapshot === "object";
        const { patch: incoming, holderName } = buildBankPatch(m.hr_employee_id);
        const diff = diffBank(incoming, m.last_pull_snapshot);

        if (!diff.changed.length) {
          unchanged++;
          rows.push({ razorpay_employee_id: m.razorpay_employee_id, status: "unchanged", changed: [] });
          continue;
        }
        planned++;

        // Dry-run: return masked preview of the outbound patch (never leak full account numbers).
        if (action === "push_bank_dry_run") {
          const preview: Record<string, any> = { ...diff.patch };
          if (preview["bank-account-number"]) preview["bank-account-number"] = mask(preview["bank-account-number"]);
          if (preview["pan"]) preview["pan"] = mask(preview["pan"]);
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            hr_employee_id: m.hr_employee_id,
            status: hasBaseline ? "planned" : "no_baseline",
            baseline_missing: !hasBaseline,
            holder_name: holderName,
            changed: diff.changed,
            patch_preview: preview,
          });
          if (!hasBaseline) noBaseline++;
          continue;
        }

        // Live push guard: refuse to write against a null baseline.
        if (!hasBaseline) {
          noBaseline++;
          skipped++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            status: "skipped_no_baseline",
            error: "last_pull_snapshot is null — run Phase 1 deep-pull before pushing bank details.",
          });
          continue;
        }

        // Live push via the verified people:update envelope.
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        let httpStatus = 0; let ok = false; let errText: string | null = null;
        try {
          const res = await fetch(`${BASE}/people`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              auth: authBlock(),
              request: { type: "people", "sub-type": "edit" },
              data: { "employee-id": eid, "employee-type": "employee", ...diff.patch },
            }),
            signal: ctrl.signal,
          });
          httpStatus = res.status;
          const raw = await res.text();
          let body: any = null; try { body = JSON.parse(raw); } catch { /* ignore */ }
          const rpErr = body && typeof body === "object" ? (body.error || body.message || null) : null;
          ok = res.ok && !rpErr;
          if (!ok) errText = rpErr || raw?.slice(0, 400) || `HTTP ${res.status}`;
        } catch (e) {
          errText = `NETWORK: ${(e as Error).message}`;
        } finally { clearTimeout(t); }

        await logSync(svc, {
          action: "push_bank",
          http_status: httpStatus,
          razorpay_employee_id: String(eid),
          hr_employee_id: m.hr_employee_id,
          // PII-safe: field names only, no values.
          field_diff_summary: { changed: diff.changed, holder_name_present: !!holderName },
          error_text: ok ? null : errText,
          actor_user_id: authed.userId,
        });

        if (ok) {
          pushed++;
          if (action === "push_bank_apply_one" && !settingsRow?.push_bank_pilot_verified_at) {
            await svc.from("hr_razorpay_settings").update({
              push_bank_pilot_verified_at: new Date().toISOString(),
              push_bank_pilot_hr_employee_id: m.hr_employee_id,
              last_bank_push_at: new Date().toISOString(),
            }).eq("is_singleton", true);
          } else {
            await svc.from("hr_razorpay_settings").update({ last_bank_push_at: new Date().toISOString() }).eq("is_singleton", true);
          }
          rows.push({ razorpay_employee_id: m.razorpay_employee_id, status: "pushed", changed: diff.changed });
        } else {
          failed++;
          rows.push({ razorpay_employee_id: m.razorpay_employee_id, status: "failed", changed: diff.changed, error: errText });
        }
      }

      return json(200, {
        ok: true,
        summary: { total: maps.length, planned, unchanged, pushed, failed, skipped, invalid, no_baseline: noBaseline },
        rows,
        pilot: {
          verified_at: settingsRow?.push_bank_pilot_verified_at || null,
          bulk_unlocked: !!settingsRow?.bulk_bank_push_unlocked,
        },
      });
    }

    if (action === "unlock_bulk_bank_push") {
      const s = await readSettings(svc);
      if (!s?.push_bank_pilot_verified_at) return json(400, { error: "Cannot unlock bulk bank push — bank pilot not verified yet." });
      await svc.from("hr_razorpay_settings").update({ bulk_bank_push_unlocked: true }).eq("is_singleton", true);
      return json(200, { ok: true });
    }

    // ---- Phase 5: Salary structure sync ---------------------------------------------------
    // Discovery-first: writes are BLOCKED until the operator records a verified salary
    // envelope (Postman probe result). Dry-run works without verification so an operator
    // can review the ERP-derived structure vs Razorpay's last-known snapshot before
    // deciding whether to enable the write path.
    if (action === "record_salary_envelope_verified") {
      const key = String(payload?.envelope_key || "").trim();
      const verified = !!payload?.verified;
      if (verified && !key) return json(400, { error: "envelope_key is required when verified=true" });
      const patch: any = {
        push_salary_endpoint_verified: verified,
        push_salary_envelope_key: verified ? key : null,
        push_salary_envelope_verified_at: verified ? new Date().toISOString() : null,
        push_salary_envelope_verified_by: verified ? authed.userId : null,
      };
      // Any change to envelope verification RESETS pilot + bulk gates. This prevents a
      // stale pilot verification (against an old envelope) from re-enabling live pushes.
      if (!verified || (settingsRow?.push_salary_envelope_key && settingsRow.push_salary_envelope_key !== key)) {
        patch.push_salary_pilot_verified_at = null;
        patch.push_salary_pilot_hr_employee_id = null;
        patch.bulk_salary_push_unlocked = false;
      }
      const { error } = await svc.from("hr_razorpay_settings").update(patch).eq("is_singleton", true);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }

    if (action === "unlock_bulk_salary_push") {
      const s = await readSettings(svc);
      if (!s?.push_salary_endpoint_verified || !s?.push_salary_envelope_key) {
        return json(400, { error: "Cannot unlock — salary envelope not yet verified. Record a probe-verified envelope first." });
      }
      if (!s?.push_salary_pilot_verified_at) {
        return json(400, { error: "Cannot unlock bulk salary push — salary pilot not verified yet." });
      }
      await svc.from("hr_razorpay_settings").update({ bulk_salary_push_unlocked: true }).eq("is_singleton", true);
      return json(200, { ok: true });
    }

    if (
      action === "push_salary_dry_run" ||
      action === "push_salary_apply_one" ||
      action === "push_salary_apply_bulk"
    ) {
      const isWrite = action !== "push_salary_dry_run";
      const only: string[] | null = Array.isArray(payload?.razorpay_employee_ids) && payload.razorpay_employee_ids.length
        ? payload.razorpay_employee_ids.map((v: any) => String(v))
        : (payload?.razorpay_employee_id ? [String(payload.razorpay_employee_id)] : null);

      if (isWrite) {
        if (!settingsRow?.push_salary_endpoint_verified || !settingsRow?.push_salary_envelope_key) {
          return json(400, { error: "Salary write path is disabled — verify the Razorpay salary envelope via probe first, then record it." });
        }
        if (action === "push_salary_apply_bulk") {
          if (!settingsRow?.push_salary_pilot_verified_at) {
            return json(400, { error: "Salary pilot not yet verified. Run push_salary_apply_one first." });
          }
          if (!settingsRow?.bulk_salary_push_unlocked) {
            return json(400, { error: "Bulk salary push is locked. Unlock explicitly after reviewing the dry-run." });
          }
        }
        if (action === "push_salary_apply_one" && (!only || only.length !== 1)) {
          return json(400, { error: "push_salary_apply_one requires exactly one razorpay_employee_id" });
        }
      }

      let query = svc.from("hr_razorpay_employee_map")
        .select("razorpay_employee_id,hr_employee_id,last_pull_snapshot");
      if (only) query = query.in("razorpay_employee_id", only);
      const { data: maps, error: mapsErr } = await query;
      if (mapsErr) return json(500, { error: mapsErr.message });
      if (!maps?.length) return json(400, { error: "No mapped rows for the requested ids." });

      const hrIds = maps.map((m: any) => m.hr_employee_id).filter(Boolean);
      const [structs, comps] = await Promise.all([
        svc.from("hr_employee_salary_structures")
          .select("employee_id,component_id,amount,is_active")
          .in("employee_id", hrIds)
          .eq("is_active", true),
        svc.from("hr_salary_components").select("id,name,code,component_type,is_taxable"),
      ]);
      const compById = new Map((comps.data || []).map((c: any) => [c.id, c]));
      const byEmp = new Map<string, any[]>();
      for (const s of (structs.data || []) as any[]) {
        const arr = byEmp.get(s.employee_id) || [];
        arr.push(s);
        byEmp.set(s.employee_id, arr);
      }

      // Build normalized ERP salary structure for one employee. This is what we DIFF
      // against the last pulled Razorpay snapshot; the actual outbound envelope is
      // shaped only after the operator supplies a verified envelope key.
      function buildErpSalary(hrId: string) {
        const rows = byEmp.get(hrId) || [];
        const components = rows.map((r) => {
          const c = compById.get(r.component_id) || {};
          return {
            code: c.code || null,
            name: c.name || "Unknown",
            type: c.component_type || null,
            amount: Number(r.amount || 0),
          };
        }).sort((a, b) => (a.code || "").localeCompare(b.code || ""));
        const total = components.reduce((s, c) => s + (Number.isFinite(c.amount) ? c.amount : 0), 0);
        return { total, components };
      }

      function normalizeSnapshot(snap: any) {
        // Razorpay's people snapshot may expose salary under different keys depending
        // on tenant. We look at common shapes and expose whatever we find so the
        // operator can eyeball the diff without us guessing.
        if (!snap || typeof snap !== "object") return null;
        const s = snap.salary ?? snap["salary-structure"] ?? snap["salary_structure"] ?? null;
        if (!s) return null;
        return s;
      }

      const rows: any[] = [];
      let planned = 0, unchanged = 0, pushed = 0, failed = 0, skipped = 0, noBaseline = 0;

      for (const m of maps as any[]) {
        const eid = Number(m.razorpay_employee_id);
        if (!Number.isFinite(eid) || eid < 1 || !m.hr_employee_id) { skipped++; continue; }

        const erp = buildErpSalary(m.hr_employee_id);
        const hasBaseline = !!m.last_pull_snapshot && typeof m.last_pull_snapshot === "object";
        const rpSalary = normalizeSnapshot(m.last_pull_snapshot);

        if (!erp.components.length) {
          skipped++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            hr_employee_id: m.hr_employee_id,
            status: "no_erp_structure",
            error: "No active salary structure in ERP for this employee.",
          });
          continue;
        }

        // Structural diff: JSON-stringify both sides for a coarse comparison. This is
        // intentionally coarse — a granular per-field diff needs the verified envelope
        // shape which we don't have yet.
        const erpSig = JSON.stringify(erp);
        const rpSig = rpSalary ? JSON.stringify(rpSalary) : null;
        const differs = !rpSig || rpSig !== erpSig;

        if (!differs) {
          unchanged++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            hr_employee_id: m.hr_employee_id,
            status: "unchanged",
            erp_total: erp.total,
            components_count: erp.components.length,
          });
          continue;
        }
        planned++;

        if (action === "push_salary_dry_run") {
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            hr_employee_id: m.hr_employee_id,
            status: hasBaseline ? "planned" : "no_baseline",
            baseline_missing: !hasBaseline,
            erp_total: erp.total,
            components_count: erp.components.length,
            erp_components: erp.components,
            razorpay_snapshot: rpSalary,
          });
          if (!hasBaseline) noBaseline++;
          continue;
        }

        if (!hasBaseline) {
          noBaseline++; skipped++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            status: "skipped_no_baseline",
            error: "last_pull_snapshot is null — run Phase 1 deep-pull before pushing salary.",
          });
          continue;
        }

        // Live push using the operator-verified envelope key. Body shape follows the
        // hyphenated-keys convention shared with people:update / bank push.
        // Live push using the operator-verified envelope key. Documented endpoint
        // is POST /api/people with sub-type "set-salary" — normalize legacy
        // "salary:update" / "people:update" envelopes to that.
        const envelopeKey = String(settingsRow!.push_salary_envelope_key);
        let [type, subType] = envelopeKey.split(":");
        if (!type || type === "salary") type = "people";
        if (!subType || subType === "update") subType = "set-salary";
        const salaryPayload = {
          "ctc-annual": erp.total,
          components: erp.components.map((c) => ({
            code: c.code, name: c.name, type: c.type, amount: c.amount,
          })),
        };
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        let httpStatus = 0; let ok = false; let errText: string | null = null;
        try {
          const res = await fetch(`${BASE}/${type}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              auth: authBlock(),
              request: { type, "sub-type": subType },
              data: { "employee-id": eid, "employee-type": "employee", salary: salaryPayload },
            }),
            signal: ctrl.signal,
          });
          httpStatus = res.status;
          const raw = await res.text();
          let body: any = null; try { body = JSON.parse(raw); } catch { /* ignore */ }
          const rpErr = body && typeof body === "object" ? (body.error || body.message || null) : null;
          ok = res.ok && !rpErr;
          if (!ok) errText = rpErr || raw?.slice(0, 400) || `HTTP ${res.status}`;
        } catch (e) {
          errText = `NETWORK: ${(e as Error).message}`;
        } finally { clearTimeout(t); }

        await logSync(svc, {
          action: "push_salary",
          http_status: httpStatus,
          razorpay_employee_id: String(eid),
          hr_employee_id: m.hr_employee_id,
          field_diff_summary: { components_count: erp.components.length, erp_total: erp.total },
          error_text: ok ? null : errText,
          actor_user_id: authed.userId,
        });

        if (ok) {
          pushed++;
          if (action === "push_salary_apply_one" && !settingsRow?.push_salary_pilot_verified_at) {
            await svc.from("hr_razorpay_settings").update({
              push_salary_pilot_verified_at: new Date().toISOString(),
              push_salary_pilot_hr_employee_id: m.hr_employee_id,
              last_salary_push_at: new Date().toISOString(),
            }).eq("is_singleton", true);
          } else {
            await svc.from("hr_razorpay_settings").update({ last_salary_push_at: new Date().toISOString() }).eq("is_singleton", true);
          }
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            status: "pushed",
            erp_total: erp.total,
            components_count: erp.components.length,
          });
        } else {
          failed++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            status: "failed",
            erp_total: erp.total,
            components_count: erp.components.length,
            error: errText,
          });
        }
      }

      return json(200, {
        ok: true,
        summary: { total: maps.length, planned, unchanged, pushed, failed, skipped, no_baseline: noBaseline },
        rows,
        envelope: {
          verified: !!settingsRow?.push_salary_endpoint_verified,
          key: settingsRow?.push_salary_envelope_key || null,
        },
        pilot: {
          verified_at: settingsRow?.push_salary_pilot_verified_at || null,
          bulk_unlocked: !!settingsRow?.bulk_salary_push_unlocked,
        },
      });
    }

    // ---- Phase 6: Monthly attendance / LOP push -------------------------------------------
    // Discovery-first, same pattern as Phase 5. Live pushes are BLOCKED until an operator
    // records a probe-verified attendance envelope (e.g. `attendance:update` or
    // `people:attendance-update` — the correct sub-type has to come from Postman verification
    // against the Live tenant, not a guess). Dry-run computes an ERP-truth LOP breakdown per
    // employee for a given YYYY-MM period so the operator can eyeball it before enabling
    // the write path.
    if (action === "record_attendance_envelope_verified") {
      const key = String(payload?.envelope_key || "").trim();
      const verified = !!payload?.verified;
      if (verified && !key) return json(400, { error: "envelope_key is required when verified=true" });
      const patch: any = {
        push_attendance_endpoint_verified: verified,
        push_attendance_envelope_key: verified ? key : null,
        push_attendance_envelope_verified_at: verified ? new Date().toISOString() : null,
        push_attendance_envelope_verified_by: verified ? authed.userId : null,
      };
      if (!verified || (settingsRow?.push_attendance_envelope_key && settingsRow.push_attendance_envelope_key !== key)) {
        patch.push_attendance_pilot_verified_at = null;
        patch.push_attendance_pilot_hr_employee_id = null;
        patch.push_attendance_pilot_period = null;
        patch.bulk_attendance_push_unlocked = false;
      }
      const { error } = await svc.from("hr_razorpay_settings").update(patch).eq("is_singleton", true);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }

    // Auto-verify Step E (salary) + Step F (attendance) envelopes using the
    // Postman-verified constants. HR-facing simplification: they should never
    // have to type an API name. Gated on credentials being validated first so
    // we don't stamp against an unreachable tenant.
    if (action === "auto_verify_step_envelopes") {
      const s = settingsRow ?? {};
      if (!s.last_creds_validated_at) {
        return json(400, { error: "Validate the RazorpayX connection first (Step A)." });
      }
      const SALARY_KEY = "people:set-salary";
      const ATTENDANCE_KEY = "attendance:modify";
      const nowIso = new Date().toISOString();
      const patch: any = {};
      const verified: string[] = [];

      if (!s.push_salary_endpoint_verified || s.push_salary_envelope_key !== SALARY_KEY) {
        patch.push_salary_endpoint_verified = true;
        patch.push_salary_envelope_key = SALARY_KEY;
        patch.push_salary_envelope_verified_at = nowIso;
        patch.push_salary_envelope_verified_by = authed.userId;
        // If a different key was previously stored, reset pilot gates.
        if (s.push_salary_envelope_key && s.push_salary_envelope_key !== SALARY_KEY) {
          patch.push_salary_pilot_verified_at = null;
          patch.push_salary_pilot_hr_employee_id = null;
          patch.bulk_salary_push_unlocked = false;
        }
        verified.push("salary");
      }

      if (!s.push_attendance_endpoint_verified || s.push_attendance_envelope_key !== ATTENDANCE_KEY) {
        patch.push_attendance_endpoint_verified = true;
        patch.push_attendance_envelope_key = ATTENDANCE_KEY;
        patch.push_attendance_envelope_verified_at = nowIso;
        patch.push_attendance_envelope_verified_by = authed.userId;
        if (s.push_attendance_envelope_key && s.push_attendance_envelope_key !== ATTENDANCE_KEY) {
          patch.push_attendance_pilot_verified_at = null;
          patch.push_attendance_pilot_hr_employee_id = null;
          patch.push_attendance_pilot_period = null;
          patch.bulk_attendance_push_unlocked = false;
        }
        verified.push("attendance");
      }

      if (Object.keys(patch).length > 0) {
        const { error } = await svc.from("hr_razorpay_settings").update(patch).eq("is_singleton", true);
        if (error) return json(500, { error: error.message });
      }
      return json(200, {
        ok: true,
        verified,
        salary_envelope_key: SALARY_KEY,
        attendance_envelope_key: ATTENDANCE_KEY,
      });
    }

    if (action === "unlock_bulk_attendance_push") {
      const s = await readSettings(svc);
      if (!s?.push_attendance_endpoint_verified || !s?.push_attendance_envelope_key) {
        return json(400, { error: "Cannot unlock — attendance envelope not yet verified. Record a probe-verified envelope first." });
      }
      if (!s?.push_attendance_pilot_verified_at) {
        return json(400, { error: "Cannot unlock bulk attendance push — attendance pilot not verified yet." });
      }
      await svc.from("hr_razorpay_settings").update({ bulk_attendance_push_unlocked: true }).eq("is_singleton", true);
      return json(200, { ok: true });
    }

    // Recall: operator-audited override that re-opens a period for re-push. Every recall
    // requires a reason and is logged with the actor; a subsequent push is only allowed
    // when recall_count > successful_push_count for that (employee, period) pair.
    if (action === "recall_attendance_period") {
      const period = String(payload?.period || "").trim();
      const rid = String(payload?.razorpay_employee_id || "").trim();
      const reason = String(payload?.reason || "").trim();
      if (!/^(\d{4})-(\d{2})$/.test(period)) return json(400, { error: "period must be YYYY-MM" });
      if (!rid) return json(400, { error: "razorpay_employee_id required" });
      if (reason.length < 8) return json(400, { error: "reason (min 8 chars) is required for recall" });
      const { data: mrow } = await svc.from("hr_razorpay_employee_map")
        .select("hr_employee_id").eq("razorpay_employee_id", rid).maybeSingle();
      await logSync(svc, {
        action: "push_attendance_recall",
        http_status: 0,
        razorpay_employee_id: rid,
        hr_employee_id: mrow?.hr_employee_id || null,
        field_diff_summary: { period, reason_len: reason.length, recall: true },
        error_text: null,
        actor_user_id: authed.userId,
      });
      return json(200, { ok: true });
    }

    if (
      action === "push_attendance_dry_run" ||
      action === "push_attendance_apply_one" ||
      action === "push_attendance_apply_bulk"
    ) {
      const isWrite = action !== "push_attendance_dry_run";
      const period = String(payload?.period || "").trim(); // YYYY-MM
      const periodMatch = /^(\d{4})-(\d{2})$/.exec(period);
      if (!periodMatch) return json(400, { error: "period is required as YYYY-MM" });
      const year = Number(periodMatch[1]);
      const month = Number(periodMatch[2]);
      const monthStart = new Date(Date.UTC(year, month - 1, 1));
      const monthEnd = new Date(Date.UTC(year, month, 0)); // last day
      const daysInMonth = monthEnd.getUTCDate();
      const monthStartISO = monthStart.toISOString().slice(0, 10);
      const monthEndISO = monthEnd.toISOString().slice(0, 10);

      const only: string[] | null = Array.isArray(payload?.razorpay_employee_ids) && payload.razorpay_employee_ids.length
        ? payload.razorpay_employee_ids.map((v: any) => String(v))
        : (payload?.razorpay_employee_id ? [String(payload.razorpay_employee_id)] : null);

      if (isWrite) {
        if (!settingsRow?.push_attendance_endpoint_verified || !settingsRow?.push_attendance_envelope_key) {
          return json(400, { error: "Attendance write path is disabled — verify the Razorpay attendance envelope via probe first, then record it." });
        }
        if (action === "push_attendance_apply_bulk") {
          if (!settingsRow?.push_attendance_pilot_verified_at) {
            return json(400, { error: "Attendance pilot not yet verified. Run push_attendance_apply_one first." });
          }
          if (!settingsRow?.bulk_attendance_push_unlocked) {
            return json(400, { error: "Bulk attendance push is locked. Unlock explicitly after reviewing the dry-run." });
          }
        }
        if (action === "push_attendance_apply_one" && (!only || only.length !== 1)) {
          return json(400, { error: "push_attendance_apply_one requires exactly one razorpay_employee_id" });
        }
      }

      let query = svc.from("hr_razorpay_employee_map")
        .select("razorpay_employee_id,hr_employee_id");
      if (only) query = query.in("razorpay_employee_id", only);
      const { data: maps, error: mapsErr } = await query;
      if (mapsErr) return json(500, { error: mapsErr.message });
      if (!maps?.length) return json(400, { error: "No mapped rows for the requested ids." });

      const hrIds = maps.map((m: any) => m.hr_employee_id).filter(Boolean);

      // Load attendance daily rows, leave requests overlapping the month, leave types,
      // holidays (in-month + recurring across years), weekly-off patterns, and
      // per-employee weekly-off overrides. All are ERP-truth; we do not read any
      // Razorpay-side attendance.
      const [attRes, leaveRes, ltRes, holInMonthRes, holRecurRes, patRes, empOffRes] = await Promise.all([
        svc.from("hr_attendance_daily")
          .select("employee_id,attendance_date,total_hours,status")
          .in("employee_id", hrIds)
          .gte("attendance_date", monthStartISO)
          .lte("attendance_date", monthEndISO),
        svc.from("hr_leave_requests")
          .select("employee_id,start_date,end_date,total_days,status,leave_type_id,is_half_day")
          .in("employee_id", hrIds)
          .in("status", ["approved", "APPROVED"])
          .lte("start_date", monthEndISO)
          .gte("end_date", monthStartISO),
        svc.from("hr_leave_types").select("id,is_paid,name"),
        svc.from("hr_holidays").select("date,name,is_active,recurring").eq("is_active", true)
          .gte("date", monthStartISO).lte("date", monthEndISO),
        svc.from("hr_holidays").select("date,name,is_active,recurring").eq("is_active", true).eq("recurring", true),
        svc.from("hr_weekly_off_patterns").select("id,name,weekly_offs,is_active").eq("is_active", true),
        svc.from("hr_employee_weekly_off").select("employee_id,pattern_id,effective_from,is_current")
          .in("employee_id", hrIds).eq("is_current", true).lte("effective_from", monthEndISO),
      ]);
      if (attRes.error) return json(500, { error: attRes.error.message });
      if (leaveRes.error) return json(500, { error: leaveRes.error.message });
      if (ltRes.error) return json(500, { error: ltRes.error.message });
      if (holInMonthRes.error) return json(500, { error: holInMonthRes.error.message });
      if (holRecurRes.error) return json(500, { error: holRecurRes.error.message });
      if (patRes.error) return json(500, { error: patRes.error.message });
      if (empOffRes.error) return json(500, { error: empOffRes.error.message });

      const ltMap = new Map((ltRes.data || []).map((l: any) => [l.id, l]));
      // Holidays: in-month rows + recurring rows whose month-day falls in this month.
      const holidayDates = new Set<string>();
      const holidayNames = new Map<string, string>();
      for (const h of (holInMonthRes.data || []) as any[]) {
        holidayDates.add(h.date);
        holidayNames.set(h.date, h.name);
      }
      for (const h of (holRecurRes.data || []) as any[]) {
        if (!h.date) continue;
        const md = String(h.date).slice(5); // MM-DD
        const iso = `${year}-${md}`;
        // Ensure the recurring date is actually in this month
        if (iso >= monthStartISO && iso <= monthEndISO) {
          holidayDates.add(iso);
          if (!holidayNames.has(iso)) holidayNames.set(iso, h.name);
        }
      }

      // Pattern lookup. Default = Sunday-only off ([0]) if no active patterns exist.
      const patternMap = new Map<string, number[]>();
      let defaultPattern: number[] = [0];
      for (const p of (patRes.data || []) as any[]) {
        const arr = Array.isArray(p.weekly_offs) ? p.weekly_offs.map((n: any) => Number(n)).filter((n: number) => n >= 0 && n <= 6) : [];
        patternMap.set(p.id, arr);
        // First active pattern becomes the tenant default when no per-employee override exists.
        if (defaultPattern.length === 1 && defaultPattern[0] === 0 && arr.length) defaultPattern = arr;
      }
      const empPatternMap = new Map<string, number[]>();
      for (const r of (empOffRes.data || []) as any[]) {
        const arr = patternMap.get(r.pattern_id);
        if (arr && arr.length) empPatternMap.set(r.employee_id, arr);
      }

      const attByEmp = new Map<string, Set<string>>();
      for (const r of (attRes.data || []) as any[]) {
        const s = attByEmp.get(r.employee_id) || new Set<string>();
        const present = (r.total_hours && r.total_hours > 0) || (r.status && String(r.status).toLowerCase() === "present");
        if (present) s.add(r.attendance_date);
        attByEmp.set(r.employee_id, s);
      }

      // Per-employee working-day + leave computation (weekly-off pattern varies per emp).
      const workingDaysByEmp = new Map<string, number>();
      const paidByEmp = new Map<string, number>();
      const unpaidByEmp = new Map<string, number>();
      const configErrorsByEmp = new Map<string, string[]>();

      const leavesByEmp = new Map<string, any[]>();
      for (const lr of (leaveRes.data || []) as any[]) {
        const list = leavesByEmp.get(lr.employee_id) || [];
        list.push(lr);
        leavesByEmp.set(lr.employee_id, list);
      }

      for (const hrId of hrIds) {
        const offDays = new Set<number>(empPatternMap.get(hrId) || defaultPattern);
        // Working days for this employee
        let wd = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const dt = new Date(Date.UTC(year, month - 1, d));
          const iso = dt.toISOString().slice(0, 10);
          if (offDays.has(dt.getUTCDay())) continue;
          if (holidayDates.has(iso)) continue;
          wd++;
        }
        workingDaysByEmp.set(hrId, wd);

        // Leaves (working-day overlap only), split paid vs unpaid; unresolved is_paid = config error.
        let paid = 0, unpaid = 0;
        const errs: string[] = [];
        for (const lr of leavesByEmp.get(hrId) || []) {
          const lt = ltMap.get(lr.leave_type_id);
          if (!lt || lt.is_paid === null || lt.is_paid === undefined) {
            errs.push(`Leave type "${lt?.name || lr.leave_type_id}" has no paid/unpaid setting — fix it in Leave Types before payroll.`);
            continue;
          }
          const isPaid = !!lt.is_paid;
          const ls = new Date(lr.start_date + "T00:00:00Z");
          const le = new Date(lr.end_date + "T00:00:00Z");
          const os = ls < monthStart ? monthStart : ls;
          const oe = le > monthEnd ? monthEnd : le;
          if (oe < os) continue;
          let count = 0;
          for (let t = os.getTime(); t <= oe.getTime(); t += 86400000) {
            const dt = new Date(t);
            const iso = dt.toISOString().slice(0, 10);
            if (offDays.has(dt.getUTCDay())) continue;
            if (holidayDates.has(iso)) continue;
            count += lr.is_half_day ? 0.5 : 1;
          }
          if (isPaid) paid += count; else unpaid += count;
        }
        paidByEmp.set(hrId, paid);
        unpaidByEmp.set(hrId, unpaid);
        if (errs.length) configErrorsByEmp.set(hrId, Array.from(new Set(errs)));
      }

      // Tenant-level advisory flags surfaced in the summary so an operator can spot silent
      // config drift (0 holidays, no explicit weekly-off pattern, etc.) at a glance.
      const tenantWarnings: string[] = [];
      if (holidayDates.size === 0) {
        tenantWarnings.push(`No holidays configured for ${period}. LOP will treat every non-weekly-off day as a working day — verify hr_holidays before applying.`);
      }
      if (!empOffRes.data?.length && (!patRes.data?.length)) {
        tenantWarnings.push("No weekly-off patterns configured. Defaulting to Sunday-only off for every employee.");
      } else if (!empOffRes.data?.length) {
        tenantWarnings.push(`No per-employee weekly-off overrides — using tenant default pattern [${defaultPattern.join(",")}] (0=Sun … 6=Sat) for everyone.`);
      }

      const rows: any[] = [];
      let planned = 0, pushed = 0, failed = 0, skipped = 0;

      for (const m of maps as any[]) {
        const eid = Number(m.razorpay_employee_id);
        if (!Number.isFinite(eid) || eid < 1 || !m.hr_employee_id) { skipped++; continue; }
        const workingDays = workingDaysByEmp.get(m.hr_employee_id) || 0;
        const presentDays = (attByEmp.get(m.hr_employee_id) || new Set()).size;
        const paidLeave = Math.round(((paidByEmp.get(m.hr_employee_id) || 0)) * 2) / 2;
        const unpaidLeave = Math.round(((unpaidByEmp.get(m.hr_employee_id) || 0)) * 2) / 2;
        const cfgErrs = configErrorsByEmp.get(m.hr_employee_id) || [];
        // LOP = working days the employee neither showed up nor took paid leave for.
        // Includes unpaid approved leave and unexplained absences.
        // Cap attended+paid at workingDays so a half-day-paid-leave overlapping a punched
        // day cannot silently over-credit (present=1 + half-day=0.5 → 1.5 > working_day).
        const rawAttendedOrPaid = presentDays + paidLeave;
        const attendedOrPaid = Math.min(rawAttendedOrPaid, workingDays);
        const lopDays = Math.max(0, workingDays - attendedOrPaid);
        const unpaidCovered = Math.min(unpaidLeave, lopDays);
        const empPatternUsed = empPatternMap.get(m.hr_employee_id) || defaultPattern;
        const overCreditWarning = rawAttendedOrPaid > workingDays
          ? ` (capped from ${rawAttendedOrPaid} — overlap between attendance and half-day paid leave detected)`
          : "";
        const formula = `LOP = WD ${workingDays} − (present ${presentDays} + paid_leave ${paidLeave}) = ${lopDays}${overCreditWarning}`;

        const payload = {
          period,
          working_days: workingDays,
          present_days: presentDays,
          paid_leave_days: paidLeave,
          unpaid_leave_days: unpaidLeave,
          lop_days: lopDays,
          unpaid_matches_lop: Math.abs(unpaidCovered - unpaidLeave) < 0.01,
          formula,
          weekly_off_days: empPatternUsed,
          weekly_off_source: empPatternMap.has(m.hr_employee_id) ? "per_employee" : (patRes.data?.length ? "tenant_default_pattern" : "hardcoded_sunday"),
          holidays_in_month: holidayDates.size,
          config_errors: cfgErrs,
        };

        // Loud, non-silent guard: any leave type this employee touched had a NULL
        // is_paid setting. Block the row rather than pick a silent default in either
        // direction — money math must not paper over a configuration error.
        if (cfgErrs.length) {
          skipped++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            hr_employee_id: m.hr_employee_id,
            status: "blocked_config_error",
            ...payload,
            error: cfgErrs.join(" "),
          });
          continue;
        }

        // Explicit no-op class: zero ERP attendance AND zero leaves for the whole month
        // means we have NO source data for this employee — do not construct a "0 present /
        // full LOP" payload that would silently zero out their pay in Razorpay.
        if (presentDays === 0 && paidLeave === 0 && unpaidLeave === 0) {
          skipped++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            hr_employee_id: m.hr_employee_id,
            status: "no_erp_attendance",
            ...payload,
            error: "No ERP attendance or leave records for this employee in the period.",
          });
          continue;
        }

        // Period immutability guard on the write path only.
        if (isWrite && (pushedLocks.get(String(m.razorpay_employee_id)) || 0) > 0) {
          skipped++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            hr_employee_id: m.hr_employee_id,
            status: "blocked_period_locked",
            ...payload,
            error: "Period already pushed. File an audited recall (recall_attendance_period) before re-pushing.",
          });
          continue;
        }

        planned++;

        if (action === "push_attendance_dry_run") {
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            hr_employee_id: m.hr_employee_id,
            status: "planned",
            ...payload,
          });
          continue;
        }

        // Live push using the operator-verified attendance envelope key.
        // Documented endpoint is POST /api/att with body type "attendance",
        // sub-type "modify" (URL path and body type intentionally differ per
        // the Postman collection). Normalize legacy envelopes to that.
        const envelopeKey = String(settingsRow!.push_attendance_envelope_key);
        let [bodyType, subType] = envelopeKey.split(":");
        if (!bodyType || bodyType === "att") bodyType = "attendance";
        if (!subType || subType === "update") subType = "modify";
        const urlPath = "att"; // doc: URL is always /api/att for attendance ops
        const body = {
          auth: authBlock(),
          request: { type: bodyType, "sub-type": subType },
          data: {
            "employee-id": eid,
            "employee-type": "employee",
            period,
            "working-days": workingDays,
            "present-days": presentDays,
            "paid-leave-days": paidLeave,
            "lop-days": lopDays,
          },
        };
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        let httpStatus = 0; let ok = false; let errText: string | null = null;
        try {
          const res = await fetch(`${BASE}/${urlPath}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
            signal: ctrl.signal,
          });
          httpStatus = res.status;
          const raw = await res.text();
          let respBody: any = null; try { respBody = JSON.parse(raw); } catch { /* ignore */ }
          const rpErr = respBody && typeof respBody === "object" ? (respBody.error || respBody.message || null) : null;
          ok = res.ok && !rpErr;
          if (!ok) errText = rpErr || raw?.slice(0, 400) || `HTTP ${res.status}`;
        } catch (e) {
          errText = `NETWORK: ${(e as Error).message}`;
        } finally { clearTimeout(t); }

        await logSync(svc, {
          action: "push_attendance",
          http_status: httpStatus,
          razorpay_employee_id: String(eid),
          hr_employee_id: m.hr_employee_id,
          // PII-safe: only day counts + period, never per-day timestamps or leave reasons.
          field_diff_summary: {
            period,
            working_days: workingDays,
            present_days: presentDays,
            paid_leave_days: paidLeave,
            lop_days: lopDays,
          },
          error_text: ok ? null : errText,
          actor_user_id: authed.userId,
        });

        if (ok) {
          pushed++;
          if (action === "push_attendance_apply_one" && !settingsRow?.push_attendance_pilot_verified_at) {
            await svc.from("hr_razorpay_settings").update({
              push_attendance_pilot_verified_at: new Date().toISOString(),
              push_attendance_pilot_hr_employee_id: m.hr_employee_id,
              push_attendance_pilot_period: period,
              last_attendance_push_at: new Date().toISOString(),
            }).eq("is_singleton", true);
          } else {
            await svc.from("hr_razorpay_settings").update({ last_attendance_push_at: new Date().toISOString() }).eq("is_singleton", true);
          }
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            status: "pushed",
            ...payload,
          });
        } else {
          failed++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            status: "failed",
            ...payload,
            error: errText,
          });
        }
      }

      return json(200, {
        ok: true,
        period,
        summary: {
          total: maps.length, planned, pushed, failed, skipped,
          working_days_range: (() => {
            const vals = Array.from(workingDaysByEmp.values());
            if (!vals.length) return { min: 0, max: 0 };
            return { min: Math.min(...vals), max: Math.max(...vals) };
          })(),
          holidays_in_month: holidayDates.size,
        },
        tenant_warnings: tenantWarnings,
        rows,
        envelope: {
          verified: !!settingsRow?.push_attendance_endpoint_verified,
          key: settingsRow?.push_attendance_envelope_key || null,
        },
        pilot: {
          verified_at: settingsRow?.push_attendance_pilot_verified_at || null,
          pilot_period: settingsRow?.push_attendance_pilot_period || null,
          bulk_unlocked: !!settingsRow?.bulk_attendance_push_unlocked,
        },
      });
    }

    // ============================================================
    // Phase 7 — Payroll-run orchestration
    // Actions:
    //   record_payroll_envelope_verified
    //   unlock_bulk_payroll_push
    //   compute_payroll_run
    //   dry_run_payroll_run
    //   apply_payroll_pilot
    //   apply_payroll_bulk
    //   lock_payroll_period
    //   recall_payroll_period
    // Every write is server-gated on push_payroll_endpoint_verified=true.
    // Locked periods reject any compute / dry_run / apply until recalled.
    // ============================================================
    if (
      action === "record_payroll_envelope_verified" ||
      action === "unlock_bulk_payroll_push" ||
      action === "compute_payroll_run" ||
      action === "dry_run_payroll_run" ||
      action === "apply_payroll_pilot" ||
      action === "apply_payroll_bulk" ||
      action === "lock_payroll_period" ||
      action === "recall_payroll_period"
    ) {
      // Full settings row — readSettings() only pulls a couple of columns.
      const { data: pSettings } = await svc
        .from("hr_razorpay_settings").select("*").eq("is_singleton", true).maybeSingle();

      // ---- record_payroll_envelope_verified -----------------------------
      if (action === "record_payroll_envelope_verified") {
        const key = String(payload?.envelope_key || "").trim();
        const verified = !!payload?.verified;
        if (verified && !key) return json(400, { error: "envelope_key is required when verified=true" });
        const patch: any = {
          push_payroll_endpoint_verified: verified,
          push_payroll_envelope_key: verified ? key : null,
          push_payroll_envelope_verified_at: verified ? new Date().toISOString() : null,
          push_payroll_envelope_verified_by: verified ? authed.userId : null,
        };
        // Any change to envelope revokes all downstream unlocks.
        if (!verified || (pSettings?.push_payroll_envelope_key && pSettings.push_payroll_envelope_key !== key)) {
          patch.push_payroll_pilot_unlocked = false;
          patch.push_payroll_bulk_unlocked = false;
        }
        const { error } = await svc.from("hr_razorpay_settings").update(patch).eq("is_singleton", true);
        if (error) return json(500, { error: error.message });
        return json(200, { ok: true });
      }

      // ---- unlock_bulk_payroll_push -------------------------------------
      if (action === "unlock_bulk_payroll_push") {
        if (!pSettings?.push_payroll_endpoint_verified || !pSettings?.push_payroll_envelope_key) {
          return json(400, { error: "Cannot unlock — payroll envelope not yet verified." });
        }
        const scope = String(payload?.scope || "");
        const patch: any = {};
        if (scope === "pilot") patch.push_payroll_pilot_unlocked = true;
        else if (scope === "bulk") patch.push_payroll_bulk_unlocked = true;
        else return json(400, { error: "scope must be 'pilot' or 'bulk'" });
        await svc.from("hr_razorpay_settings").update(patch).eq("is_singleton", true);
        return json(200, { ok: true, scope });
      }

      // ---- period_month resolution & lock check -------------------------
      const periodMonthStr = String(payload?.period_month || "").trim();
      const pmMatch = /^(\d{4})-(\d{2})$/.exec(periodMonthStr);
      if (!pmMatch) return json(400, { error: "period_month must be YYYY-MM" });
      const pYear = parseInt(pmMatch[1], 10);
      const pMonth = parseInt(pmMatch[2], 10);
      const periodMonthISO = `${pmMatch[1]}-${pmMatch[2]}-01`;

      // Load or create the run row for this period.
      let { data: runRow } = await svc.from("hr_razorpay_payroll_runs")
        .select("*").eq("period_month", periodMonthISO).maybeSingle();

      // ---- lock_payroll_period ------------------------------------------
      if (action === "lock_payroll_period") {
        if (!runRow) return json(404, { error: "No payroll run for that period." });
        if (runRow.status === "locked") return json(400, { error: "Period is already locked." });
        if (runRow.status !== "bulk_applied" && runRow.status !== "pilot_applied") {
          return json(400, { error: "Only pilot_applied or bulk_applied runs can be locked." });
        }
        await svc.from("hr_razorpay_payroll_runs").update({
          status: "locked",
          locked_at: new Date().toISOString(),
          locked_by: authed.userId,
        }).eq("id", runRow.id);
        return json(200, { ok: true });
      }

      // ---- recall_payroll_period ----------------------------------------
      // Audited override that un-locks a period for re-push. Only meaningful for
      // runs that already reached the wire (pilot_applied / bulk_applied / locked).
      // Recall clears applied/failed line push_status so a subsequent apply can
      // legitimately re-push the affected employees; source_snapshot is preserved
      // for the audit trail. Also blocked if a Phase-10 ledger period is signed off
      // for the same month — reopen ledger first.
      if (action === "recall_payroll_period") {
        if (!runRow) return json(404, { error: "No payroll run for that period." });
        if (!["pilot_applied", "bulk_applied", "locked"].includes(runRow.status)) {
          return json(400, {
            error: `Recall is only valid for pilot_applied / bulk_applied / locked runs (current: ${runRow.status}). Use compute_payroll_run to redraft an earlier-stage run.`,
          });
        }
        const reason = String(payload?.reason || "").trim();
        if (reason.length < 12) return json(400, { error: "reason (min 12 chars) is required for recall" });

        // Refuse if ledger period for this month is signed off.
        const { data: ledgerPeriod } = await svc
          .from("hr_razorpay_ledger_periods").select("status")
          .eq("period_month", periodMonthISO).maybeSingle();
        if (ledgerPeriod?.status === "signed_off") {
          return json(400, {
            error: "Ledger period for this month is signed off. Reopen the ledger period before recalling payroll.",
          });
        }

        await svc.from("hr_razorpay_payroll_runs").update({
          status: "recalled",
          recall_reason: reason,
          recalled_by: authed.userId,
          recalled_at: new Date().toISOString(),
        }).eq("id", runRow.id);

        // Re-open applied/failed lines so a subsequent apply can re-push them.
        // Preserve the source_snapshot for audit; only clear volatile push state.
        await svc.from("hr_razorpay_payroll_run_lines")
          .update({ push_status: "dry_run_ok", push_response: null, applied_at: null })
          .eq("run_id", runRow.id)
          .in("push_status", ["applied", "failed"]);

        await logSync(svc, {
          action: "payroll_recall",
          http_status: 0,
          razorpay_employee_id: "",
          hr_employee_id: null,
          field_diff_summary: { period_month: periodMonthISO, reason_len: reason.length, run_id: runRow.id, prior_status: runRow.status },
          error_text: null,
          actor_user_id: authed.userId,
        });
        return json(200, { ok: true, prior_status: runRow.status });
      }

      // Every remaining action mutates the run. Reject on locked periods.
      if (runRow?.status === "locked") {
        return json(400, { error: "Period is locked. File a recall_payroll_period before further changes." });
      }

      // ---- compute_payroll_run ------------------------------------------
      if (action === "compute_payroll_run") {
        // Preflight: attendance envelope must be verified (Phase 6). If ops has not
        // wired attendance yet, compute is refused with a clear message — otherwise
        // LOP would silently be zero for everyone.
        if (!pSettings?.push_attendance_endpoint_verified) {
          return json(400, {
            error: "Attendance envelope not verified (Phase 6). Payroll compute requires attendance to be usable first.",
          });
        }

        // Create the run row if missing.
        if (!runRow) {
          const { data: ins, error: insErr } = await svc.from("hr_razorpay_payroll_runs").insert({
            period_month: periodMonthISO,
            status: "draft",
            created_by: authed.userId,
          }).select("*").single();
          if (insErr) return json(500, { error: insErr.message });
          runRow = ins;
        }

        // ---- Attendance window --------------------------------------------
        const daysInMonth = new Date(Date.UTC(pYear, pMonth, 0)).getUTCDate();
        const monthStart = new Date(Date.UTC(pYear, pMonth - 1, 1));
        const monthEnd = new Date(Date.UTC(pYear, pMonth - 1, daysInMonth, 23, 59, 59));
        const startIso = monthStart.toISOString().slice(0, 10);
        const endIso = monthEnd.toISOString().slice(0, 10);

        const [attRes, leaveRes, ltRes, holRes] = await Promise.all([
          svc.from("hr_attendance_daily")
            .select("employee_id,attendance_date,total_hours,status")
            .gte("attendance_date", startIso).lte("attendance_date", endIso),
          svc.from("hr_leave_requests")
            .select("employee_id,leave_type_id,start_date,end_date,is_half_day,status")
            .eq("status", "approved")
            .gte("end_date", startIso).lte("start_date", endIso),
          svc.from("hr_leave_types").select("id,is_paid"),
          svc.from("hr_holidays").select("date").eq("is_active", true).gte("date", startIso).lte("date", endIso),
        ]);
        if (attRes.error) return json(500, { error: attRes.error.message });

        const ltMap = new Map((ltRes.data || []).map((l: any) => [l.id, l]));
        const holidayDates = new Set((holRes.data || []).map((h: any) => h.date));

        // Working days = calendar - Sundays - active holidays (ERP standard, same as Phase 6).
        let workingDays = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const dt = new Date(Date.UTC(pYear, pMonth - 1, d));
          if (dt.getUTCDay() === 0) continue;
          if (holidayDates.has(dt.toISOString().slice(0, 10))) continue;
          workingDays++;
        }

        const attByEmp = new Map<string, Set<string>>();
        for (const r of (attRes.data || []) as any[]) {
          const s = attByEmp.get(r.employee_id) || new Set<string>();
          const present = (r.total_hours && r.total_hours > 0) || (r.status && String(r.status).toLowerCase() === "present");
          if (present) s.add(r.attendance_date);
          attByEmp.set(r.employee_id, s);
        }

        const paidByEmp = new Map<string, number>();
        const unpaidByEmp = new Map<string, number>();
        for (const lr of (leaveRes.data || []) as any[]) {
          const lt: any = ltMap.get(lr.leave_type_id);
          const isPaid = lt ? !!lt.is_paid : true;
          const ls = new Date(lr.start_date + "T00:00:00Z");
          const le = new Date(lr.end_date + "T00:00:00Z");
          const os = ls < monthStart ? monthStart : ls;
          const oe = le > monthEnd ? monthEnd : le;
          if (oe < os) continue;
          let count = 0;
          for (let t = os.getTime(); t <= oe.getTime(); t += 86400000) {
            const dt = new Date(t);
            if (dt.getUTCDay() === 0) continue;
            if (holidayDates.has(dt.toISOString().slice(0, 10))) continue;
            count += lr.is_half_day ? 0.5 : 1;
          }
          if (isPaid) paidByEmp.set(lr.employee_id, (paidByEmp.get(lr.employee_id) || 0) + count);
          else unpaidByEmp.set(lr.employee_id, (unpaidByEmp.get(lr.employee_id) || 0) + count);
        }

        // ---- Employees, structures, bank/pan, loans, one-offs --------------
        const { data: maps } = await svc.from("hr_razorpay_employee_map")
          .select("razorpay_employee_id,hr_employee_id");
        const hrIds = (maps || []).map((m: any) => m.hr_employee_id).filter(Boolean);
        if (!hrIds.length) return json(400, { error: "No mapped employees to compute." });

        const [empRes, structRes, bankRes, loanRes, oneOffRes] = await Promise.all([
          svc.from("hr_employees").select("id,badge_id,first_name,last_name,pan_number,is_active").in("id", hrIds),
          svc.from("hr_employee_salary_structures").select("employee_id,amount,is_active").in("employee_id", hrIds).eq("is_active", true),
          svc.from("hr_employee_bank_details").select("employee_id,account_number").in("employee_id", hrIds),
          svc.from("hr_loan_repayments").select("loan_id,employee_id,amount,due_date,status")
            .in("employee_id", hrIds).gte("due_date", startIso).lte("due_date", endIso),
          svc.from("hr_razorpay_payroll_run_one_offs").select("employee_id,kind,amount").eq("run_id", runRow.id),
        ]);

        const empById = new Map((empRes.data || []).map((e: any) => [e.id, e]));
        const grossByEmp = new Map<string, number>();
        for (const s of (structRes.data || []) as any[]) {
          grossByEmp.set(s.employee_id, (grossByEmp.get(s.employee_id) || 0) + Number(s.amount || 0));
        }
        const bankByEmp = new Map((bankRes.data || []).map((b: any) => [b.employee_id, b]));
        const loanByEmp = new Map<string, number>();
        for (const l of (loanRes.data || []) as any[]) {
          if (String(l.status || "").toLowerCase() === "paid") continue;
          loanByEmp.set(l.employee_id, (loanByEmp.get(l.employee_id) || 0) + Number(l.amount || 0));
        }
        const oneOffByEmp = new Map<string, { bonus: number; reimb: number; ded: number }>();
        for (const o of (oneOffRes.data || []) as any[]) {
          const cur = oneOffByEmp.get(o.employee_id) || { bonus: 0, reimb: 0, ded: 0 };
          if (o.kind === "bonus") cur.bonus += Number(o.amount || 0);
          else if (o.kind === "reimbursement") cur.reimb += Number(o.amount || 0);
          else if (o.kind === "deduction") cur.ded += Number(o.amount || 0);
          oneOffByEmp.set(o.employee_id, cur);
        }

        // ---- Build lines ---------------------------------------------------
        const lines: any[] = [];
        let totalsGross = 0, totalsDed = 0, totalsNet = 0, included = 0, skippedCount = 0;

        for (const m of (maps || []) as any[]) {
          if (!m.hr_employee_id) continue;
          const emp: any = empById.get(m.hr_employee_id);
          if (!emp) continue;

          const presentDays = (attByEmp.get(m.hr_employee_id) || new Set()).size;
          const paidLeave = paidByEmp.get(m.hr_employee_id) || 0;
          const unpaidLeave = unpaidByEmp.get(m.hr_employee_id) || 0;
          const lopDays = Math.max(0, workingDays - Math.min(presentDays + paidLeave, workingDays));
          const gross = Number((grossByEmp.get(m.hr_employee_id) || 0).toFixed(2));
          const loanEmi = Number((loanByEmp.get(m.hr_employee_id) || 0).toFixed(2));
          const oneOffs = oneOffByEmp.get(m.hr_employee_id) || { bonus: 0, reimb: 0, ded: 0 };

          const snapshot = {
            working_days: workingDays,
            present_days: presentDays,
            paid_leave_days: paidLeave,
            unpaid_leave_days: unpaidLeave,
            lop_days: lopDays,
            monthly_gross_from_structure: gross,
            one_offs: oneOffs,
          };

          // Skip-label rules (labeled no-op, never silent).
          let skipLabel: string | null = null;
          if (emp.is_active === false) skipLabel = "terminated";
          else if (!gross) skipLabel = "no_structure";
          else if (!bankByEmp.get(m.hr_employee_id)?.account_number) skipLabel = "no_bank";
          else if (!emp.pan_number) skipLabel = "no_pan";
          else if (presentDays === 0 && paidLeave === 0 && unpaidLeave === 0) skipLabel = "no_attendance";

          const lopAmount = workingDays > 0 ? Number(((lopDays / workingDays) * gross).toFixed(2)) : 0;
          const otherDed = Number(oneOffs.ded.toFixed(2));
          const netPay = Number((gross - lopAmount - loanEmi - otherDed + oneOffs.bonus + oneOffs.reimb).toFixed(2));

          const line = {
            run_id: runRow.id,
            employee_id: m.hr_employee_id,
            gross_earnings: gross,
            lop_amount: lopAmount,
            other_deductions: otherDed,
            loan_emi: loanEmi,
            net_pay: skipLabel ? 0 : netPay,
            skip_label: skipLabel,
            source_snapshot: snapshot,
            push_status: skipLabel ? "skipped" : "draft",
          };
          lines.push(line);

          if (skipLabel) skippedCount++;
          else {
            included++;
            totalsGross += gross;
            totalsDed += lopAmount + loanEmi + otherDed;
            totalsNet += netPay;
          }
        }

        // Upsert lines (idempotent per run_id, employee_id).
        // First wipe non-applied lines for a clean recompute, then insert.
        await svc.from("hr_razorpay_payroll_run_lines")
          .delete().eq("run_id", runRow.id).neq("push_status", "applied");
        if (lines.length) {
          // Chunk to avoid oversized payloads.
          for (let i = 0; i < lines.length; i += 200) {
            const chunk = lines.slice(i, i + 200);
            const { error: linesErr } = await svc.from("hr_razorpay_payroll_run_lines")
              .upsert(chunk, { onConflict: "run_id,employee_id", ignoreDuplicates: false });
            if (linesErr) return json(500, { error: linesErr.message });
          }
        }

        await svc.from("hr_razorpay_payroll_runs").update({
          status: "computed",
          totals_gross: Number(totalsGross.toFixed(2)),
          totals_deductions: Number(totalsDed.toFixed(2)),
          totals_net: Number(totalsNet.toFixed(2)),
          headcount_included: included,
          headcount_skipped: skippedCount,
        }).eq("id", runRow.id);

        return json(200, {
          ok: true,
          run_id: runRow.id,
          period_month: periodMonthISO,
          totals: { gross: totalsGross, deductions: totalsDed, net: totalsNet },
          headcount: { included, skipped: skippedCount, total: included + skippedCount },
          working_days: workingDays,
        });
      }

      // For the write actions below, the run must exist and be beyond compute.
      if (!runRow) return json(404, { error: "No payroll run for that period. Call compute_payroll_run first." });

      // Server-side hard-block: writes require verified envelope.
      const isWriteAction = action === "apply_payroll_pilot" || action === "apply_payroll_bulk";
      if ((action === "dry_run_payroll_run" || isWriteAction) && !pSettings?.push_payroll_endpoint_verified) {
        return json(400, {
          error: "Payroll envelope not verified. Record a probe-verified envelope before any dry-run or apply.",
        });
      }
      if (action === "apply_payroll_pilot" && !pSettings?.push_payroll_pilot_unlocked) {
        return json(400, { error: "Payroll pilot writes are locked. Unlock via unlock_bulk_payroll_push with scope=pilot." });
      }
      if (action === "apply_payroll_bulk") {
        if (!pSettings?.push_payroll_bulk_unlocked) return json(400, { error: "Payroll bulk writes are locked." });
        if (runRow.status !== "dry_run_ok" && runRow.status !== "pilot_applied") {
          return json(400, { error: "Bulk apply requires a successful dry-run first." });
        }
      }

      // Load lines for this run.
      const { data: allLines } = await svc.from("hr_razorpay_payroll_run_lines")
        .select("*").eq("run_id", runRow.id);
      const pushableLines = (allLines || []).filter((l: any) => l.push_status !== "skipped");

      // ---- dry_run_payroll_run ------------------------------------------
      if (action === "dry_run_payroll_run") {
        // Discovery-first: no external POST until an operator has explicitly named a
        // payroll envelope key AND we have a live payroll endpoint verified via Postman.
        // For now the dry-run is ERP-truth-only and marks the run as dry_run_ok so the
        // human pilot gate can proceed.
        await svc.from("hr_razorpay_payroll_runs").update({
          status: "dry_run_ok",
          dry_run_response: { at: new Date().toISOString(), pushable: pushableLines.length },
        }).eq("id", runRow.id);
        await svc.from("hr_razorpay_payroll_run_lines")
          .update({ push_status: "dry_run_ok" })
          .eq("run_id", runRow.id).eq("push_status", "draft");
        return json(200, { ok: true, run_id: runRow.id, dryable: pushableLines.length });
      }

      // ---- apply_payroll_pilot / apply_payroll_bulk ---------------------
      if (isWriteAction) {
        const envelopeKey = String(pSettings?.push_payroll_envelope_key || "").trim();
        if (!envelopeKey) return json(400, { error: "Missing verified payroll envelope key." });
        const [type, subType] = envelopeKey.split(":");

        let targetLines: any[] = [];
        if (action === "apply_payroll_pilot") {
          const ids: string[] = Array.isArray(payload?.employee_ids)
            ? payload.employee_ids.map((v: any) => String(v)) : [];
          if (ids.length < 1 || ids.length > 3) {
            return json(400, { error: "apply_payroll_pilot requires 1–3 employee_ids" });
          }
          targetLines = pushableLines.filter((l: any) => ids.includes(l.employee_id));
          if (!targetLines.length) return json(400, { error: "No pushable lines match the given employee_ids" });
        } else {
          // bulk: everything not yet applied
          targetLines = pushableLines.filter((l: any) => l.push_status !== "applied");
        }

        // Map hr_employee_id -> razorpay_employee_id
        const { data: mapRows } = await svc.from("hr_razorpay_employee_map")
          .select("hr_employee_id,razorpay_employee_id")
          .in("hr_employee_id", targetLines.map((l: any) => l.employee_id));
        const rpIdByHr = new Map((mapRows || []).map((r: any) => [r.hr_employee_id, r.razorpay_employee_id]));

        const results: any[] = [];
        let pushed = 0, failed = 0;

        for (const line of targetLines) {
          // Idempotency: already applied lines return cached response, no external call.
          if (line.push_status === "applied") {
            results.push({ employee_id: line.employee_id, status: "applied_cached", push_response: line.push_response });
            continue;
          }
          const rpId = rpIdByHr.get(line.employee_id);
          if (!rpId) {
            failed++;
            results.push({ employee_id: line.employee_id, status: "failed", error: "No Razorpay mapping for this employee." });
            continue;
          }

          const eid = Number(rpId);
          const runPayload = {
            "employee-id": eid,
            "employee-type": "employee",
            period: periodMonthISO,
            "gross-earnings": Number(line.gross_earnings || 0),
            "lop-amount": Number(line.lop_amount || 0),
            "other-deductions": Number(line.other_deductions || 0),
            "loan-emi": Number(line.loan_emi || 0),
            "net-pay": Number(line.net_pay || 0),
          };

          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 20000);
          let httpStatus = 0; let ok = false; let errText: string | null = null; let bodyOut: any = null;
          try {
            const res = await fetch(`${BASE}/${type || "payroll"}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({
                auth: authBlock(),
                request: { type: type || "payroll", "sub-type": subType || "run" },
                data: runPayload,
              }),
              signal: ctrl.signal,
            });
            httpStatus = res.status;
            const raw = await res.text();
            try { bodyOut = JSON.parse(raw); } catch { bodyOut = { raw: raw.slice(0, 500) }; }
            const rpErr = bodyOut && typeof bodyOut === "object" ? (bodyOut.error || bodyOut.message || null) : null;
            ok = res.ok && !rpErr;
            if (!ok) errText = rpErr || `HTTP ${res.status}`;
          } catch (e) {
            errText = `NETWORK: ${(e as Error).message}`;
          } finally { clearTimeout(t); }

          await logSync(svc, {
            action: action === "apply_payroll_pilot" ? "push_payroll_pilot" : "push_payroll_bulk",
            http_status: httpStatus,
            razorpay_employee_id: String(rpId),
            hr_employee_id: line.employee_id,
            field_diff_summary: { run_id: runRow.id, period_month: periodMonthISO, net_pay: line.net_pay },
            error_text: ok ? null : errText,
            actor_user_id: authed.userId,
          });

          if (ok) {
            pushed++;
            await svc.from("hr_razorpay_payroll_run_lines").update({
              push_status: "applied",
              push_response: bodyOut,
              applied_at: new Date().toISOString(),
            }).eq("id", line.id);
            results.push({ employee_id: line.employee_id, status: "applied" });
          } else {
            failed++;
            await svc.from("hr_razorpay_payroll_run_lines").update({
              push_status: "failed", push_response: bodyOut,
            }).eq("id", line.id);
            results.push({ employee_id: line.employee_id, status: "failed", error: errText });
          }
        }

        // Advance run status.
        const nextStatus = action === "apply_payroll_pilot" ? "pilot_applied" : "bulk_applied";
        await svc.from("hr_razorpay_payroll_runs").update({
          status: nextStatus,
          apply_response: { at: new Date().toISOString(), pushed, failed, scope: action },
        }).eq("id", runRow.id);

        return json(200, {
          ok: true, run_id: runRow.id,
          summary: { attempted: targetLines.length, pushed, failed },
          results,
        });
      }
    }

    // ============================================================
    // Phase 8 — Payout & Disbursement sync
    // Actions:
    //   probe_payouts_endpoint           — sniff a candidate GET endpoint, no writes
    //   record_payouts_envelope_verified — operator marks a verified GET envelope
    //   pull_payouts_for_period          — pull actuals, upsert reconciliation rows
    //   reconcile_payout                 — human sign-off on a row
    // Read-only against Razorpay; the only writes are into
    // hr_razorpay_payout_records inside this project.
    // ============================================================
    if (
      action === "probe_payouts_endpoint" ||
      action === "record_payouts_envelope_verified" ||
      action === "pull_payouts_for_period" ||
      action === "reconcile_payout"
    ) {
      const { data: poSettings } = await svc
        .from("hr_razorpay_settings").select("*").eq("is_singleton", true).maybeSingle();

      // ---- probe_payouts_endpoint ---------------------------------------
      if (action === "probe_payouts_endpoint") {
        const type = String(payload?.type || "payouts").trim();
        const subType = String(payload?.sub_type || "view").trim();
        const periodMonthStr = String(payload?.period_month || "").trim();
        const body = {
          auth: authBlock(),
          request: { type, "sub-type": subType },
          data: periodMonthStr ? { period: periodMonthStr } : {},
        };
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        let httpStatus = 0; let raw = ""; let parsed: any = null;
        try {
          const res = await fetch(`${BASE}/${type}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
            signal: ctrl.signal,
          });
          httpStatus = res.status;
          raw = await res.text();
          try { parsed = JSON.parse(raw); } catch { parsed = null; }
        } catch (e) {
          return json(200, { ok: false, error: `NETWORK: ${(e as Error).message}` });
        } finally { clearTimeout(t); }
        return json(200, {
          ok: httpStatus >= 200 && httpStatus < 300,
          http_status: httpStatus,
          envelope_key: `${type}:${subType}`,
          body_preview: parsed ?? { raw: raw.slice(0, 800) },
        });
      }

      // ---- record_payouts_envelope_verified -----------------------------
      if (action === "record_payouts_envelope_verified") {
        const key = String(payload?.envelope_key || "").trim();
        const verified = !!payload?.verified;
        if (verified && !key) return json(400, { error: "envelope_key is required when verified=true" });
        const patch: any = {
          pull_payouts_endpoint_verified: verified,
          pull_payouts_envelope_key: verified ? key : null,
          pull_payouts_envelope_verified_at: verified ? new Date().toISOString() : null,
          pull_payouts_envelope_verified_by: verified ? authed.userId : null,
        };
        const { error } = await svc.from("hr_razorpay_settings").update(patch).eq("is_singleton", true);
        if (error) return json(500, { error: error.message });
        return json(200, { ok: true });
      }

      // ---- pull_payouts_for_period --------------------------------------
      if (action === "pull_payouts_for_period") {
        if (!poSettings?.pull_payouts_endpoint_verified || !poSettings?.pull_payouts_envelope_key) {
          return json(400, { error: "Payouts envelope not verified. Record a probe-verified envelope first." });
        }
        const periodMonthStr = String(payload?.period_month || "").trim();
        const pmMatch = /^(\d{4})-(\d{2})$/.exec(periodMonthStr);
        if (!pmMatch) return json(400, { error: "period_month must be YYYY-MM" });
        const periodMonthISO = `${pmMatch[1]}-${pmMatch[2]}-01`;

        // Gap-fix: variance is meaningless against an unapplied run. Refuse the pull
        // unless the payroll run for this month has reached the wire.
        const { data: preRunRow } = await svc.from("hr_razorpay_payroll_runs")
          .select("status").eq("period_month", periodMonthISO).maybeSingle();
        if (!preRunRow) {
          return json(400, { error: "No payroll run found for this period. Compute and apply payroll first." });
        }
        if (!["bulk_applied", "locked", "recalled"].includes(preRunRow.status)) {
          return json(400, {
            error: `Payout pull requires the payroll run to be bulk_applied (or later). Current status: ${preRunRow.status}.`,
          });
        }

        // Documented endpoint for pulling payouts is POST /api/payroll with
        // sub-type "view-payroll" (Opfin) — normalize legacy "payouts:view"
        // envelopes, which target a ghost endpoint.
        const envelopeKey = String(poSettings.pull_payouts_envelope_key);
        let [type, subType] = envelopeKey.split(":");
        if (!type || type === "payouts") type = "payroll";
        if (!subType || subType === "view") subType = "view-payroll";

        // Pull payouts. Actual shape is Razorpay-tenant-specific; whatever comes
        // back is stored verbatim in source_payload and normalised best-effort.
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 30000);
        let httpStatus = 0; let bodyOut: any = null;
        try {
          const res = await fetch(`${BASE}/${type}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              auth: authBlock(),
              request: { type, "sub-type": subType },
              data: { period: periodMonthStr, "payroll-month": periodMonthStr },
            }),
            signal: ctrl.signal,
          });
          httpStatus = res.status;
          const raw = await res.text();
          try { bodyOut = JSON.parse(raw); } catch { bodyOut = { raw: raw.slice(0, 800) }; }
        } catch (e) {
          return json(502, { error: `NETWORK: ${(e as Error).message}` });
        } finally { clearTimeout(t); }

        if (httpStatus < 200 || httpStatus >= 300) {
          return json(502, { error: "Razorpay returned non-2xx", http_status: httpStatus, body: bodyOut });
        }

        // Try common list shapes: array | { data: [] } | { payouts: [] } | { list: [] }
        let rawList: any[] = [];
        if (Array.isArray(bodyOut)) rawList = bodyOut;
        else if (bodyOut && typeof bodyOut === "object") {
          rawList = bodyOut.data || bodyOut.payouts || bodyOut.list || bodyOut.result || [];
        }
        if (!Array.isArray(rawList)) rawList = [];

        // Load expected amounts from the payroll run for this period.
        const { data: runRow } = await svc.from("hr_razorpay_payroll_runs")
          .select("id").eq("period_month", periodMonthISO).maybeSingle();
        const runId = runRow?.id || null;

        let expectedByRpId = new Map<string, { hr_employee_id: string; net_pay: number }>();
        if (runId) {
          const { data: lineRows } = await svc.from("hr_razorpay_payroll_run_lines")
            .select("employee_id,net_pay,run_id").eq("run_id", runId);
          const hrIds = (lineRows || []).map((l: any) => l.employee_id);
          if (hrIds.length) {
            const { data: maps } = await svc.from("hr_razorpay_employee_map")
              .select("hr_employee_id,razorpay_employee_id").in("hr_employee_id", hrIds);
            const rpByHr = new Map((maps || []).map((m: any) => [m.hr_employee_id, String(m.razorpay_employee_id)]));
            for (const l of (lineRows || []) as any[]) {
              const rpId = rpByHr.get(l.employee_id);
              if (!rpId) continue;
              expectedByRpId.set(rpId, { hr_employee_id: l.employee_id, net_pay: Number(l.net_pay || 0) });
            }
          }
        }

        // Normalise each row best-effort. Unknown fields land in source_payload.
        function pickNum(o: any, keys: string[]) {
          for (const k of keys) { const v = o?.[k]; if (v != null && Number.isFinite(Number(v))) return Number(v); }
          return null;
        }
        function pickStr(o: any, keys: string[]) {
          for (const k of keys) { const v = o?.[k]; if (v != null && String(v).length) return String(v); }
          return null;
        }

        const upserts: any[] = [];
        for (const p of rawList) {
          const rpId = pickStr(p, ["employee-id", "employee_id", "employeeId", "id"]);
          if (!rpId) continue;
          const paid = pickNum(p, ["paid-amount", "paid_amount", "net-pay", "netPay", "amount", "paidAmount"]);
          const status = pickStr(p, ["payout-status", "payout_status", "status", "state"]) || "unknown";
          const utr = pickStr(p, ["utr", "UTR", "transaction-id", "transactionId"]);
          const paidAt = pickStr(p, ["paid-at", "paid_at", "paidAt", "processed-at", "processedAt"]);
          const exp = expectedByRpId.get(String(rpId));
          const expected = exp?.net_pay ?? null;
          const variance = (paid != null && expected != null) ? Number((paid - expected).toFixed(2)) : null;
          upserts.push({
            run_id: runId,
            period_month: periodMonthISO,
            razorpay_employee_id: String(rpId),
            hr_employee_id: exp?.hr_employee_id || null,
            payout_status: status,
            paid_amount: paid,
            expected_amount: expected,
            variance,
            utr,
            paid_at: paidAt ? new Date(paidAt).toISOString() : null,
            source_payload: p,
          });
        }

        if (upserts.length) {
          for (let i = 0; i < upserts.length; i += 200) {
            const chunk = upserts.slice(i, i + 200);
            const { error: upErr } = await svc.from("hr_razorpay_payout_records")
              .upsert(chunk, { onConflict: "period_month,razorpay_employee_id" });
            if (upErr) return json(500, { error: upErr.message });
          }
        }

        await svc.from("hr_razorpay_settings")
          .update({ last_payouts_pull_at: new Date().toISOString() })
          .eq("is_singleton", true);

        // Summary counters
        let paid = 0, processing = 0, failed = 0, mismatched = 0, unknown = 0, unexpected = 0;
        for (const r of upserts) {
          const s = String(r.payout_status || "").toLowerCase();
          if (s.includes("paid") || s.includes("success") || s.includes("processed")) paid++;
          else if (s.includes("processing") || s.includes("pending") || s.includes("initiated")) processing++;
          else if (s.includes("fail") || s.includes("reject") || s.includes("bounce")) failed++;
          else unknown++;
          if (r.variance != null && Math.abs(r.variance) >= 0.5) mismatched++;
          if (r.expected_amount == null) unexpected++;
        }

        await logSync(svc, {
          action: "pull_payouts",
          http_status: 200,
          razorpay_employee_id: "",
          hr_employee_id: null,
          field_diff_summary: {
            period_month: periodMonthISO,
            total: upserts.length,
            paid, processing, failed, unknown, mismatched, unexpected,
          },
          error_text: null,
          actor_user_id: authed.userId,
        });

        return json(200, {
          ok: true,
          period_month: periodMonthISO,
          summary: { total: upserts.length, paid, processing, failed, unknown, mismatched, unexpected },
        });
      }

      // ---- reconcile_payout --------------------------------------------
      if (action === "reconcile_payout") {
        const id = String(payload?.id || "").trim();
        if (!id) return json(400, { error: "id is required" });
        const { error } = await svc.from("hr_razorpay_payout_records").update({
          reconciled_at: new Date().toISOString(),
          reconciled_by: authed.userId,
        }).eq("id", id);
        if (error) return json(500, { error: error.message });
        return json(200, { ok: true });
      }
    }

    // ============================================================
    // Phase 9 — Payslip & Tax-document ingestion
    // Actions:
    //   probe_payslips_endpoint             — sniff a candidate GET envelope for payslips
    //   record_payslips_envelope_verified   — operator marks verified envelope
    //   pull_payslips_for_period            — pull per-employee payslips for a YYYY-MM
    //   probe_taxdocs_endpoint              — sniff Form-16 / TDS report envelope
    //   record_taxdocs_envelope_verified    — operator marks verified envelope
    //   pull_taxdocs_for_year               — pull yearly tax docs for a fiscal year
    // Read-only against Razorpay; writes are into
    // hr_razorpay_payslip_records / hr_razorpay_taxdoc_records only.
    // ============================================================
    if (
      action === "probe_payslips_endpoint" ||
      action === "record_payslips_envelope_verified" ||
      action === "pull_payslips_for_period" ||
      action === "probe_taxdocs_endpoint" ||
      action === "record_taxdocs_envelope_verified" ||
      action === "pull_taxdocs_for_year"
    ) {
      const { data: p9Settings } = await svc
        .from("hr_razorpay_settings").select("*").eq("is_singleton", true).maybeSingle();

      // Shared probe helper
      async function razorpayPost(type: string, subType: string, data: any) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 30000);
        let httpStatus = 0; let raw = ""; let parsed: any = null;
        try {
          const res = await fetch(`${BASE}/${type}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ auth: authBlock(), request: { type, "sub-type": subType }, data }),
            signal: ctrl.signal,
          });
          httpStatus = res.status;
          raw = await res.text();
          try { parsed = JSON.parse(raw); } catch { parsed = null; }
        } catch (e) {
          return { networkError: (e as Error).message, httpStatus: 0, parsed: null, raw: "" };
        } finally { clearTimeout(t); }
        return { httpStatus, parsed, raw };
      }

      function pickNum(o: any, keys: string[]) {
        for (const k of keys) { const v = o?.[k]; if (v != null && Number.isFinite(Number(v))) return Number(v); }
        return null;
      }
      function pickStr(o: any, keys: string[]) {
        for (const k of keys) { const v = o?.[k]; if (v != null && String(v).length) return String(v); }
        return null;
      }
      function extractList(bodyOut: any): any[] {
        if (Array.isArray(bodyOut)) return bodyOut;
        if (bodyOut && typeof bodyOut === "object") {
          return bodyOut.data || bodyOut.payslips || bodyOut.documents ||
                 bodyOut.list || bodyOut.result || bodyOut.records || [];
        }
        return [];
      }

      // ---- probe_payslips_endpoint / probe_taxdocs_endpoint ----
      if (action === "probe_payslips_endpoint" || action === "probe_taxdocs_endpoint") {
        const isPayslip = action === "probe_payslips_endpoint";
        const type = String(payload?.type || (isPayslip ? "payslip" : "form16")).trim();
        const subType = String(payload?.sub_type || "view").trim();
        const periodMonth = String(payload?.period_month || "").trim();
        const fiscalYear = String(payload?.fiscal_year || "").trim();
        const data: any = {};
        if (periodMonth) data.period = periodMonth;
        if (fiscalYear) data["fiscal-year"] = fiscalYear;
        if (payload?.employee_id) data["employee-id"] = payload.employee_id;

        const r = await razorpayPost(type, subType, data);
        if ((r as any).networkError) {
          return json(200, { ok: false, error: `NETWORK: ${(r as any).networkError}` });
        }
        return json(200, {
          ok: r.httpStatus >= 200 && r.httpStatus < 300,
          http_status: r.httpStatus,
          envelope_key: `${type}:${subType}`,
          body_preview: r.parsed ?? { raw: (r.raw || "").slice(0, 800) },
        });
      }

      // ---- record_payslips_envelope_verified / record_taxdocs_envelope_verified ----
      if (action === "record_payslips_envelope_verified" || action === "record_taxdocs_envelope_verified") {
        const isPayslip = action === "record_payslips_envelope_verified";
        const key = String(payload?.envelope_key || "").trim();
        const verified = !!payload?.verified;
        if (verified && !key) return json(400, { error: "envelope_key is required when verified=true" });
        const prefix = isPayslip ? "pull_payslips" : "pull_taxdocs";
        const patch: any = {
          [`${prefix}_endpoint_verified`]: verified,
          [`${prefix}_envelope_key`]: verified ? key : null,
          [`${prefix}_envelope_verified_at`]: verified ? new Date().toISOString() : null,
          [`${prefix}_envelope_verified_by`]: verified ? authed.userId : null,
        };
        const { error } = await svc.from("hr_razorpay_settings").update(patch).eq("is_singleton", true);
        if (error) return json(500, { error: error.message });
        return json(200, { ok: true });
      }

      // ---- pull_payslips_for_period ----
      if (action === "pull_payslips_for_period") {
        if (!p9Settings?.pull_payslips_endpoint_verified || !p9Settings?.pull_payslips_envelope_key) {
          return json(400, { error: "Payslip envelope not verified. Record a probe-verified envelope first." });
        }
        const periodMonthStr = String(payload?.period_month || "").trim();
        const pmMatch = /^(\d{4})-(\d{2})$/.exec(periodMonthStr);
        if (!pmMatch) return json(400, { error: "period_month must be YYYY-MM" });
        const periodMonthISO = `${pmMatch[1]}-${pmMatch[2]}-01`;
        const [type, subType] = String(p9Settings.pull_payslips_envelope_key).split(":");

        const r = await razorpayPost(type || "payslip", subType || "view", { period: periodMonthStr });
        if ((r as any).networkError) return json(502, { error: `NETWORK: ${(r as any).networkError}` });
        if (r.httpStatus < 200 || r.httpStatus >= 300) {
          return json(502, { error: "Razorpay returned non-2xx", http_status: r.httpStatus, body: r.parsed });
        }
        const rawList = extractList(r.parsed);

        // Load expected net from the payroll run for the same period, for variance.
        const { data: runRow } = await svc.from("hr_razorpay_payroll_runs")
          .select("id").eq("period_month", periodMonthISO).maybeSingle();
        const runId = runRow?.id || null;
        const expectedByRpId = new Map<string, { hr_employee_id: string; net_pay: number }>();
        if (runId) {
          const { data: lineRows } = await svc.from("hr_razorpay_payroll_run_lines")
            .select("employee_id,net_pay").eq("run_id", runId);
          const hrIds = (lineRows || []).map((l: any) => l.employee_id);
          if (hrIds.length) {
            const { data: maps } = await svc.from("hr_razorpay_employee_map")
              .select("hr_employee_id,razorpay_employee_id").in("hr_employee_id", hrIds);
            const rpByHr = new Map((maps || []).map((m: any) => [m.hr_employee_id, String(m.razorpay_employee_id)]));
            for (const l of (lineRows || []) as any[]) {
              const rpId = rpByHr.get(l.employee_id);
              if (rpId) expectedByRpId.set(rpId, { hr_employee_id: l.employee_id, net_pay: Number(l.net_pay || 0) });
            }
          }
        }

        const upserts: any[] = [];
        for (const p of rawList) {
          const rpId = pickStr(p, ["employee-id", "employee_id", "employeeId", "emp-id"]);
          if (!rpId) continue;
          const gross = pickNum(p, ["gross-earnings", "gross_earnings", "gross", "total-earnings"]);
          const deductions = pickNum(p, ["total-deductions", "total_deductions", "deductions"]);
          const net = pickNum(p, ["net-pay", "net_pay", "netPay", "net-amount", "net"]);
          const tds = pickNum(p, ["tds", "tds-amount", "tds_amount", "income-tax", "incomeTax"]);
          const psId = pickStr(p, ["payslip-id", "payslip_id", "id"]);
          const pdf = pickStr(p, ["pdf-url", "pdf_url", "download-url", "url"]);
          const exp = expectedByRpId.get(String(rpId));
          const expNet = exp?.net_pay ?? null;
          const variance = (net != null && expNet != null) ? Number((net - expNet).toFixed(2)) : null;
          upserts.push({
            run_id: runId,
            period_month: periodMonthISO,
            razorpay_employee_id: String(rpId),
            hr_employee_id: exp?.hr_employee_id || null,
            gross_earnings: gross,
            total_deductions: deductions,
            net_pay: net,
            tds_amount: tds,
            expected_net: expNet,
            variance,
            razorpay_payslip_id: psId,
            pdf_url: pdf,
            source_payload: p,
            pulled_by: authed.userId,
          });
        }

        if (upserts.length) {
          for (let i = 0; i < upserts.length; i += 200) {
            const chunk = upserts.slice(i, i + 200);
            const { error: upErr } = await svc.from("hr_razorpay_payslip_records")
              .upsert(chunk, { onConflict: "period_month,razorpay_employee_id" });
            if (upErr) return json(500, { error: upErr.message });
          }
        }
        await svc.from("hr_razorpay_settings")
          .update({ last_payslips_pull_at: new Date().toISOString() }).eq("is_singleton", true);

        let withPdf = 0, mismatched = 0, missingExpected = 0;
        for (const u of upserts) {
          if (u.pdf_url) withPdf++;
          if (u.variance != null && Math.abs(u.variance) >= 0.5) mismatched++;
          if (u.expected_net == null) missingExpected++;
        }

        await logSync(svc, {
          action: "pull_payslips",
          http_status: 200,
          razorpay_employee_id: "",
          hr_employee_id: null,
          field_diff_summary: {
            period_month: periodMonthISO,
            total: upserts.length, withPdf, mismatched, missingExpected,
          },
          error_text: null,
          actor_user_id: authed.userId,
        });

        return json(200, {
          ok: true,
          period_month: periodMonthISO,
          summary: { total: upserts.length, withPdf, mismatched, missingExpected },
        });
      }

      // ---- pull_taxdocs_for_year ----
      if (action === "pull_taxdocs_for_year") {
        if (!p9Settings?.pull_taxdocs_endpoint_verified || !p9Settings?.pull_taxdocs_envelope_key) {
          return json(400, { error: "Tax-docs envelope not verified. Record a probe-verified envelope first." });
        }
        const fiscalYear = String(payload?.fiscal_year || "").trim();
        if (!/^\d{4}-\d{2}$/.test(fiscalYear)) return json(400, { error: "fiscal_year must be YYYY-YY (e.g. 2025-26)" });
        const docType = String(payload?.doc_type || "form16").trim();
        const [type, subType] = String(p9Settings.pull_taxdocs_envelope_key).split(":");

        const r = await razorpayPost(type || docType, subType || "view", { "fiscal-year": fiscalYear });
        if ((r as any).networkError) return json(502, { error: `NETWORK: ${(r as any).networkError}` });
        if (r.httpStatus < 200 || r.httpStatus >= 300) {
          return json(502, { error: "Razorpay returned non-2xx", http_status: r.httpStatus, body: r.parsed });
        }
        const rawList = extractList(r.parsed);

        // Load hr_employee mapping for enrichment.
        const { data: maps } = await svc.from("hr_razorpay_employee_map")
          .select("hr_employee_id,razorpay_employee_id");
        const hrByRp = new Map((maps || []).map((m: any) => [String(m.razorpay_employee_id), m.hr_employee_id]));

        const upserts: any[] = [];
        for (const p of rawList) {
          const rpId = pickStr(p, ["employee-id", "employee_id", "employeeId"]);
          if (!rpId) continue;
          const docId = pickStr(p, ["document-id", "document_id", "id", "form16-id"]);
          const pdf = pickStr(p, ["pdf-url", "pdf_url", "download-url", "url"]);
          const gross = pickNum(p, ["gross-annual", "gross_annual", "gross", "total-earnings"]);
          const tds = pickNum(p, ["total-tds", "total_tds", "tds", "tds-deducted"]);
          upserts.push({
            fiscal_year: fiscalYear,
            doc_type: docType,
            razorpay_employee_id: String(rpId),
            hr_employee_id: hrByRp.get(String(rpId)) || null,
            razorpay_document_id: docId,
            pdf_url: pdf,
            gross_annual: gross,
            total_tds: tds,
            source_payload: p,
            pulled_by: authed.userId,
          });
        }

        if (upserts.length) {
          for (let i = 0; i < upserts.length; i += 200) {
            const chunk = upserts.slice(i, i + 200);
            const { error: upErr } = await svc.from("hr_razorpay_taxdoc_records")
              .upsert(chunk, { onConflict: "fiscal_year,razorpay_employee_id,doc_type" });
            if (upErr) return json(500, { error: upErr.message });
          }
        }
        await svc.from("hr_razorpay_settings")
          .update({ last_taxdocs_pull_at: new Date().toISOString() }).eq("is_singleton", true);

        await logSync(svc, {
          action: "pull_taxdocs",
          http_status: 200,
          razorpay_employee_id: "",
          hr_employee_id: null,
          field_diff_summary: { fiscal_year: fiscalYear, doc_type: docType, total: upserts.length },
          error_text: null,
          actor_user_id: authed.userId,
        });

        return json(200, {
          ok: true,
          fiscal_year: fiscalYear,
          doc_type: docType,
          summary: { total: upserts.length, withPdf: upserts.filter((u) => u.pdf_url).length },
        });
      }
    }

    // ============================================================
    // Phase 10 — Ledger Reconciliation
    // Actions:
    //   probe_ledger_scope           — dry count of payouts vs candidate bank txns
    //   auto_match_ledger_period     — match by UTR first, then amount+date window
    //   manual_link_ledger           — link a payout to a specific bank txn
    //   waive_ledger_match           — record a waiver for a payout row
    //   unlink_ledger                — remove a link (blocked once signed off)
    //   review_ledger_period         — flag period as reviewed (pre-signoff)
    //   signoff_ledger_period        — hard-lock the period; requires Super Admin flag
    //   reopen_ledger_period         — audited reopen with reason
    //   recompute_ledger_totals      — refresh the period totals row
    // No external Razorpay calls — purely internal cross-referencing.
    // ============================================================
    if (
      action === "probe_ledger_scope" ||
      action === "auto_match_ledger_period" ||
      action === "manual_link_ledger" ||
      action === "waive_ledger_match" ||
      action === "unlink_ledger" ||
      action === "review_ledger_period" ||
      action === "signoff_ledger_period" ||
      action === "reopen_ledger_period" ||
      action === "recompute_ledger_totals"
    ) {
      const periodMonthStr = String(payload?.period_month || "").trim();
      const pmMatch = /^(\d{4})-(\d{2})$/.exec(periodMonthStr);
      if (!pmMatch) return json(400, { error: "period_month must be YYYY-MM" });
      const periodMonthISO = `${pmMatch[1]}-${pmMatch[2]}-01`;

      // Helper: current period status.
      async function loadPeriod() {
        const { data } = await svc.from("hr_razorpay_ledger_periods")
          .select("*").eq("period_month", periodMonthISO).maybeSingle();
        return data;
      }
      async function ensurePeriod() {
        let p = await loadPeriod();
        if (!p) {
          const { data: ins } = await svc.from("hr_razorpay_ledger_periods")
            .insert({ period_month: periodMonthISO, status: "draft" })
            .select("*").single();
          p = ins;
        }
        return p;
      }
      async function refreshTotals(): Promise<{
        total_paid: number; total_matched: number; total_unmatched: number; total_waived: number;
      }> {
        const { data: payouts } = await svc.from("hr_razorpay_payout_records")
          .select("id, paid_amount").eq("period_month", periodMonthISO);
        const { data: matches } = await svc.from("hr_razorpay_ledger_matches")
          .select("payout_record_id, match_method, matched_amount")
          .eq("period_month", periodMonthISO);
        const matchedIds = new Set((matches || []).filter((m: any) => m.match_method !== "waived").map((m: any) => m.payout_record_id));
        const waivedIds = new Set((matches || []).filter((m: any) => m.match_method === "waived").map((m: any) => m.payout_record_id));

        let total_paid = 0, total_matched = 0, total_unmatched = 0, total_waived = 0;
        for (const p of (payouts || []) as any[]) {
          const amt = Number(p.paid_amount || 0);
          total_paid += amt;
          if (matchedIds.has(p.id)) total_matched += amt;
          else if (waivedIds.has(p.id)) total_waived += amt;
          else total_unmatched += amt;
        }
        const round = (n: number) => Number(n.toFixed(2));
        const totals = {
          total_paid: round(total_paid),
          total_matched: round(total_matched),
          total_unmatched: round(total_unmatched),
          total_waived: round(total_waived),
        };
        await svc.from("hr_razorpay_ledger_periods")
          .update(totals).eq("period_month", periodMonthISO);
        return totals;
      }

      async function assertMutableOrThrow(): Promise<{ ok: true } | { ok: false; err: string }> {
        const p = await loadPeriod();
        if (p?.status === "signed_off") {
          return { ok: false, err: "Ledger period is signed off. File a reopen_ledger_period first." };
        }
        return { ok: true };
      }

      // ---- probe_ledger_scope -------------------------------------------
      if (action === "probe_ledger_scope") {
        const { data: payouts } = await svc.from("hr_razorpay_payout_records")
          .select("id, utr, paid_amount, paid_at, hr_employee_id, razorpay_employee_id")
          .eq("period_month", periodMonthISO);
        const { data: matches } = await svc.from("hr_razorpay_ledger_matches")
          .select("payout_record_id, match_method").eq("period_month", periodMonthISO);
        const matchedIds = new Set((matches || []).map((m: any) => m.payout_record_id));

        // Candidate bank txns: DEBIT / EXPENSE / TRANSFER_OUT during ±3 days around period.
        const startIso = periodMonthISO;
        const endDate = new Date(periodMonthISO);
        endDate.setUTCMonth(endDate.getUTCMonth() + 1);
        const endIso = endDate.toISOString().slice(0, 10);
        const { data: bankTxns } = await svc.from("bank_transactions")
          .select("id, reference_number, amount, transaction_date, transaction_type")
          .in("transaction_type", ["DEBIT", "EXPENSE", "TRANSFER_OUT"])
          .gte("transaction_date", startIso)
          .lt("transaction_date", endIso);

        const utrIndex = new Map<string, number>();
        for (const t of (bankTxns || []) as any[]) {
          const utr = String(t.reference_number || "").trim().toUpperCase();
          if (utr) utrIndex.set(utr, (utrIndex.get(utr) || 0) + 1);
        }
        let matchableByUtr = 0;
        for (const p of (payouts || []) as any[]) {
          const utr = String(p.utr || "").trim().toUpperCase();
          if (utr && utrIndex.has(utr)) matchableByUtr++;
        }

        return json(200, {
          ok: true,
          period_month: periodMonthISO,
          payouts_total: (payouts || []).length,
          already_matched: matchedIds.size,
          candidate_bank_txns: (bankTxns || []).length,
          projected_auto_match_by_utr: matchableByUtr,
        });
      }

      // ---- auto_match_ledger_period -------------------------------------
      if (action === "auto_match_ledger_period") {
        const gate = await assertMutableOrThrow();
        if (!gate.ok) return json(400, { error: gate.err });
        await ensurePeriod();

        const { data: payouts } = await svc.from("hr_razorpay_payout_records")
          .select("id, utr, paid_amount, paid_at, hr_employee_id")
          .eq("period_month", periodMonthISO);
        const { data: existingMatches } = await svc.from("hr_razorpay_ledger_matches")
          .select("payout_record_id, bank_transaction_id")
          .eq("period_month", periodMonthISO);
        const matchedPayoutIds = new Set((existingMatches || []).map((m: any) => m.payout_record_id));
        const claimedBankIds = new Set((existingMatches || []).filter((m: any) => m.bank_transaction_id).map((m: any) => m.bank_transaction_id));

        const startIso = periodMonthISO;
        const endDate = new Date(periodMonthISO);
        endDate.setUTCMonth(endDate.getUTCMonth() + 1);
        const endIso = endDate.toISOString().slice(0, 10);
        const { data: bankTxns } = await svc.from("bank_transactions")
          .select("id, reference_number, amount, transaction_date, transaction_type")
          .in("transaction_type", ["DEBIT", "EXPENSE", "TRANSFER_OUT"])
          .gte("transaction_date", startIso)
          .lt("transaction_date", endIso);

        // Index by UTR and by (amount, date).
        const byUtr = new Map<string, any>();
        for (const t of (bankTxns || []) as any[]) {
          const utr = String(t.reference_number || "").trim().toUpperCase();
          if (utr && !byUtr.has(utr)) byUtr.set(utr, t);
        }

        const inserts: any[] = [];
        const actorName = String(payload?.actor_name || "").trim() || null;
        for (const p of (payouts || []) as any[]) {
          if (matchedPayoutIds.has(p.id)) continue;
          if (!p.paid_amount || Number(p.paid_amount) <= 0) continue;
          const utr = String(p.utr || "").trim().toUpperCase();
          let hit: any = null;
          let method: "auto_utr" | "auto_amount" | null = null;

          if (utr && byUtr.has(utr) && !claimedBankIds.has(byUtr.get(utr).id)) {
            hit = byUtr.get(utr);
            method = "auto_utr";
          }
          if (!hit) {
            // Fallback: single-amount match within ±3 days of paid_at.
            const paidAt = p.paid_at ? new Date(p.paid_at) : null;
            const candidates = (bankTxns || []).filter((t: any) =>
              !claimedBankIds.has(t.id) &&
              Math.abs(Number(t.amount) - Number(p.paid_amount)) < 0.5 &&
              (!paidAt || Math.abs(new Date(t.transaction_date).getTime() - paidAt.getTime()) <= 3 * 86400000)
            );
            if (candidates.length === 1) { hit = candidates[0]; method = "auto_amount"; }
          }
          if (!hit || !method) continue;

          claimedBankIds.add(hit.id);
          inserts.push({
            period_month: periodMonthISO,
            payout_record_id: p.id,
            bank_transaction_id: hit.id,
            match_method: method,
            matched_amount: Number(hit.amount),
            variance: Number((Number(hit.amount) - Number(p.paid_amount)).toFixed(2)),
            matched_by: authed.userId,
            matched_by_name: actorName,
          });
        }

        if (inserts.length) {
          const { error } = await svc.from("hr_razorpay_ledger_matches").insert(inserts);
          if (error) return json(500, { error: error.message });
        }
        const totals = await refreshTotals();
        await logSync(svc, {
          action: "ledger_auto_match",
          http_status: 0, razorpay_employee_id: "", hr_employee_id: null,
          field_diff_summary: { period_month: periodMonthISO, matched: inserts.length, ...totals },
          error_text: null, actor_user_id: authed.userId,
        });
        return json(200, { ok: true, matched: inserts.length, totals });
      }

      // ---- manual_link_ledger -------------------------------------------
      if (action === "manual_link_ledger") {
        const gate = await assertMutableOrThrow();
        if (!gate.ok) return json(400, { error: gate.err });
        await ensurePeriod();

        const payoutRecordId = String(payload?.payout_record_id || "").trim();
        const bankTxnId = String(payload?.bank_transaction_id || "").trim();
        const note = String(payload?.note || "").trim() || null;
        const actorName = String(payload?.actor_name || "").trim() || null;
        if (!payoutRecordId || !bankTxnId) return json(400, { error: "payout_record_id and bank_transaction_id are required" });

        const [{ data: pRow }, { data: bRow }] = await Promise.all([
          svc.from("hr_razorpay_payout_records").select("id, paid_amount, period_month").eq("id", payoutRecordId).maybeSingle(),
          svc.from("bank_transactions").select("id, amount").eq("id", bankTxnId).maybeSingle(),
        ]);
        if (!pRow) return json(404, { error: "Payout record not found" });
        if (!bRow) return json(404, { error: "Bank transaction not found" });
        if (pRow.period_month !== periodMonthISO) {
          return json(400, { error: "Payout does not belong to the given period_month" });
        }

        const variance = Number((Number(bRow.amount) - Number(pRow.paid_amount || 0)).toFixed(2));
        const { error } = await svc.from("hr_razorpay_ledger_matches").upsert({
          period_month: periodMonthISO,
          payout_record_id: payoutRecordId,
          bank_transaction_id: bankTxnId,
          match_method: "manual",
          matched_amount: Number(bRow.amount),
          variance,
          note,
          matched_by: authed.userId,
          matched_by_name: actorName,
          matched_at: new Date().toISOString(),
        }, { onConflict: "payout_record_id" });
        if (error) return json(500, { error: error.message });

        const totals = await refreshTotals();
        return json(200, { ok: true, variance, totals });
      }

      // ---- waive_ledger_match -------------------------------------------
      if (action === "waive_ledger_match") {
        const gate = await assertMutableOrThrow();
        if (!gate.ok) return json(400, { error: gate.err });
        await ensurePeriod();

        const payoutRecordId = String(payload?.payout_record_id || "").trim();
        const reason = String(payload?.reason || "").trim();
        const actorName = String(payload?.actor_name || "").trim() || null;
        if (!payoutRecordId) return json(400, { error: "payout_record_id is required" });
        if (reason.length < 8) return json(400, { error: "reason (min 8 chars) is required for a waiver" });

        const { error } = await svc.from("hr_razorpay_ledger_matches").upsert({
          period_month: periodMonthISO,
          payout_record_id: payoutRecordId,
          bank_transaction_id: null,
          match_method: "waived",
          matched_amount: 0,
          variance: null,
          note: reason,
          matched_by: authed.userId,
          matched_by_name: actorName,
          matched_at: new Date().toISOString(),
        }, { onConflict: "payout_record_id" });
        if (error) return json(500, { error: error.message });

        const totals = await refreshTotals();
        return json(200, { ok: true, totals });
      }

      // ---- unlink_ledger -----------------------------------------------
      if (action === "unlink_ledger") {
        const gate = await assertMutableOrThrow();
        if (!gate.ok) return json(400, { error: gate.err });

        const payoutRecordId = String(payload?.payout_record_id || "").trim();
        if (!payoutRecordId) return json(400, { error: "payout_record_id is required" });
        const { error } = await svc.from("hr_razorpay_ledger_matches")
          .delete().eq("payout_record_id", payoutRecordId);
        if (error) return json(500, { error: error.message });

        const totals = await refreshTotals();
        return json(200, { ok: true, totals });
      }

      // ---- review_ledger_period ----------------------------------------
      if (action === "review_ledger_period") {
        const gate = await assertMutableOrThrow();
        if (!gate.ok) return json(400, { error: gate.err });
        await ensurePeriod();

        const totals = await refreshTotals();
        const actorName = String(payload?.actor_name || "").trim() || null;
        await svc.from("hr_razorpay_ledger_periods").update({
          status: "reviewed",
          reviewed_by: authed.userId,
          reviewed_by_name: actorName,
          reviewed_at: new Date().toISOString(),
        }).eq("period_month", periodMonthISO);
        return json(200, { ok: true, totals });
      }

      // ---- signoff_ledger_period ---------------------------------------
      if (action === "signoff_ledger_period") {
        const p = await ensurePeriod();
        if (p.status === "signed_off") return json(400, { error: "Period already signed off." });
        if (p.status !== "reviewed") {
          return json(400, { error: "Period must be reviewed before sign-off." });
        }

        // Every payout must be either matched or explicitly waived — no bare unmatched rows.
        const totals = await refreshTotals();
        if (Number(totals.total_unmatched) > 0) {
          return json(400, {
            error: `Cannot sign off — ${Number(totals.total_unmatched).toFixed(2)} still unmatched. Match, waive, or unlink to zero.`,
          });
        }

        const actorName = String(payload?.actor_name || "").trim() || null;
        await svc.from("hr_razorpay_ledger_periods").update({
          status: "signed_off",
          signed_off_by: authed.userId,
          signed_off_by_name: actorName,
          signed_off_at: new Date().toISOString(),
        }).eq("period_month", periodMonthISO);

        await logSync(svc, {
          action: "ledger_signoff",
          http_status: 0, razorpay_employee_id: "", hr_employee_id: null,
          field_diff_summary: { period_month: periodMonthISO, ...totals },
          error_text: null, actor_user_id: authed.userId,
        });
        return json(200, { ok: true, totals });
      }

      // ---- reopen_ledger_period ----------------------------------------
      if (action === "reopen_ledger_period") {
        const p = await loadPeriod();
        if (!p) return json(404, { error: "No ledger period for this month." });
        if (p.status !== "signed_off") return json(400, { error: "Only signed-off periods can be reopened." });
        const reason = String(payload?.reason || "").trim();
        if (reason.length < 12) return json(400, { error: "reason (min 12 chars) is required for reopen" });

        const actorName = String(payload?.actor_name || "").trim() || null;
        await svc.from("hr_razorpay_ledger_periods").update({
          status: "reopened",
          reopen_reason: reason,
          reopened_by: authed.userId,
          reopened_by_name: actorName,
          reopened_at: new Date().toISOString(),
        }).eq("period_month", periodMonthISO);

        await logSync(svc, {
          action: "ledger_reopen",
          http_status: 0, razorpay_employee_id: "", hr_employee_id: null,
          field_diff_summary: { period_month: periodMonthISO, reason_len: reason.length },
          error_text: null, actor_user_id: authed.userId,
        });
        return json(200, { ok: true });
      }

      // ---- recompute_ledger_totals -------------------------------------
      if (action === "recompute_ledger_totals") {
        await ensurePeriod();
        const totals = await refreshTotals();
        return json(200, { ok: true, totals });
      }
    }

    // ---------------------------------------------------------------------
    // create_person — create a brand-new employee in RazorpayX Payroll from
    // an ERP hr_employees row. Used by the Stage-5 onboarding wizard so HR
    // can spin up a Razorpay record without leaving the ERP.
    //
    // Contract:
    //   payload: { action:"create_person", hr_employee_id: uuid, dry_run?: bool }
    //   returns:
    //     { ok:false, missing:[...], reason }   — validation gaps
    //     { ok:true,  dry_run:true, payload }   — dry-run
    //     { ok:true,  razorpay_employee_id }    — live create success
    //     { ok:false, http_status, error }      — live create failure
    //
    // Guardrails:
    //   - hr_employee_id must not already be in hr_razorpay_employee_map
    //   - PAN, name, DOJ, department, CTC, bank details are all mandatory
    //   - Baseline (last_pull_snapshot) is populated from the outbound
    //     payload so future push_person diffs work out of the box.
    // ---------------------------------------------------------------------
    if (action === "create_person") {
      const hrId = payload?.hr_employee_id ? String(payload.hr_employee_id) : "";
      if (!hrId) return json(400, { error: "hr_employee_id required" });
      const dryRun = payload?.dry_run === true;

      // Guard: already mapped?
      const { data: existingMap } = await svc
        .from("hr_razorpay_employee_map")
        .select("razorpay_employee_id")
        .eq("hr_employee_id", hrId)
        .maybeSingle();
      if (existingMap?.razorpay_employee_id) {
        return json(409, {
          ok: false,
          reason: "already_mapped",
          razorpay_employee_id: existingMap.razorpay_employee_id,
          error: `Already linked to Razorpay employee ${existingMap.razorpay_employee_id}.`,
        });
      }

      // Load employee + related rows.
      const [{ data: emp }, { data: wi }, { data: bank }, { data: structs }] = await Promise.all([
        svc.from("hr_employees")
          .select("id,first_name,last_name,email,phone,gender,dob,pan_number,badge_id")
          .eq("id", hrId).maybeSingle(),
        svc.from("hr_employee_work_info")
          .select("department_id,job_role,joining_date,employee_type")
          .eq("employee_id", hrId).maybeSingle(),
        svc.from("hr_employee_bank_details")
          .select("account_number,ifsc_code,additional_info")
          .eq("employee_id", hrId).maybeSingle(),
        svc.from("hr_employee_salary_structures")
          .select("amount,is_active").eq("employee_id", hrId).eq("is_active", true),
      ]);
      if (!emp) return json(404, { error: "hr_employee not found" });

      const deptName = wi?.department_id
        ? (await svc.from("departments").select("name").eq("id", wi.department_id).maybeSingle()).data?.name || null
        : null;

      const fullName = [emp.first_name, emp.last_name].filter(Boolean).join(" ").trim();
      const pan = (emp.pan_number || "").toString().trim().toUpperCase();
      const dojIso = wi?.joining_date ? String(wi.joining_date) : null;
      const dobIso = emp.dob ? String(emp.dob) : null;
      const toDdMmYyyy = (iso: string | null) =>
        iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null;
      const dojRp = toDdMmYyyy(dojIso);
      const dobRp = toDdMmYyyy(dobIso);
      const accountHolder = (bank?.additional_info as any)?.account_holder || fullName || null;
      // hr_employee_salary_structures.amount holds MONTHLY component amounts (see
      // monthly_gross_from_structure usage elsewhere in this file). Razorpay's
      // /people (add) expects annual_ctc = monthly_salary * 12. Prefer the annual
      // CTC captured during onboarding (hr_employee_onboarding.ctc) when present,
      // otherwise derive it from the monthly structure sum × 12.
      const monthlyStructureSum = (structs || []).reduce(
        (s: number, r: any) => s + Number(r.amount || 0),
        0,
      );
      const { data: onboardingRow } = await svc
        .from("hr_employee_onboarding")
        .select("ctc")
        .eq("employee_id", hrId)
        .maybeSingle();
      const onboardingCtc = Number(onboardingRow?.ctc || 0);
      const ctcAnnual = onboardingCtc > 0 ? onboardingCtc : monthlyStructureSum * 12;

      // Validate.
      const missing: string[] = [];
      if (!fullName) missing.push("name");
      if (!emp.email) missing.push("email");
      if (!emp.phone) missing.push("phone");
      if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) missing.push("pan");
      if (!dojRp) missing.push("date_of_joining");
      if (!deptName) missing.push("department");
      if (!wi?.job_role) missing.push("job_title");
      if (!ctcAnnual || ctcAnnual <= 0) missing.push("ctc_annual");
      if (!bank?.account_number) missing.push("bank_account_number");
      if (!bank?.ifsc_code || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bank.ifsc_code)) missing.push("bank_ifsc");
      if (!accountHolder) missing.push("bank_account_holder_name");

      if (missing.length) {
        return json(400, { ok: false, reason: "missing_fields", missing });
      }

      const outboundData: Record<string, any> = {
        "employee-type": "employee",
        name: fullName,
        email: String(emp.email).trim().toLowerCase(),
        phone_number: normPhone(emp.phone),
        gender: emp.gender ? String(emp.gender).toLowerCase() : null,
        "date-of-birth": dobRp,
        "date-of-joining": dojRp,
        department: deptName,
        title: wi!.job_role,
        pan,
        annual_ctc: ctcAnnual,
        bank_account_number: bank!.account_number,
        bank_ifsc: (bank!.ifsc_code || "").toUpperCase(),
        bank_account_holder_name: accountHolder,
      };
      // Remove null/empty optional keys.
      for (const k of Object.keys(outboundData)) {
        if (outboundData[k] === null || outboundData[k] === "") delete outboundData[k];
      }

      if (dryRun) {
        return json(200, { ok: true, dry_run: true, payload: outboundData });
      }

      // Live create.
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);
      let httpStatus = 0; let bodyOut: any = null; let errText: string | null = null;
      let rpId: string | null = null;
      try {
        const res = await fetch(`${BASE}/people`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            auth: authBlock(),
            request: { type: "people", "sub-type": "add" },
            data: outboundData,
          }),
          signal: ctrl.signal,
        });
        httpStatus = res.status;
        const raw = await res.text();
        try { bodyOut = JSON.parse(raw); } catch { bodyOut = { raw: raw.slice(0, 800) }; }
        const rpErr = bodyOut && typeof bodyOut === "object" ? (bodyOut.error ?? bodyOut.message ?? null) : null;
        if (!res.ok || rpErr) {
          errText = typeof rpErr === "string" ? rpErr : (rpErr ? JSON.stringify(rpErr) : `HTTP ${res.status}`);
        } else {
          // Extract new employee id from common response shapes.
          const cand = bodyOut?.["employee-id"] ?? bodyOut?.employee_id ?? bodyOut?.id ?? bodyOut?.data?.["employee-id"] ?? bodyOut?.data?.id;
          rpId = cand !== undefined && cand !== null ? String(cand) : null;
          if (!rpId) errText = "Razorpay accepted the request but returned no employee-id";
        }
      } catch (e) {
        errText = `NETWORK: ${(e as Error).message}`;
      } finally { clearTimeout(t); }

      // Log every attempt.
      await logSync(svc, {
        action: "create_person",
        http_status: httpStatus,
        razorpay_employee_id: rpId || "",
        hr_employee_id: hrId,
        field_diff_summary: { payload_field_names: Object.keys(outboundData).sort() },
        error_text: errText,
        actor_user_id: authed.userId,
      });

      if (errText || !rpId) {
        return json(errText ? 502 : 500, { ok: false, http_status: httpStatus, error: errText || "no_id_returned", body: bodyOut });
      }

      // Wire up the map — baseline snapshot equals outbound payload so future
      // push_person diffs land cleanly without needing a re-pull.
      const { error: mapErr } = await svc.from("hr_razorpay_employee_map").upsert({
        razorpay_employee_id: rpId,
        hr_employee_id: hrId,
        sync_status: "created_via_erp",
        is_pilot_verified: false,
        last_synced_at: new Date().toISOString(),
        last_pull_snapshot: outboundData,
      }, { onConflict: "razorpay_employee_id" });
      if (mapErr) {
        return json(207, {
          ok: true, razorpay_employee_id: rpId, http_status: httpStatus,
          warning: `Employee created in Razorpay but ERP mapping failed: ${mapErr.message}`,
        });
      }

      return json(200, { ok: true, razorpay_employee_id: rpId, http_status: httpStatus });
    }

    // ---------------------------------------------------------------------
    // Direct action bridge for RazorpayX Payroll endpoints that don't need a
    // dedicated phase workflow. Verified against the Postman collection:
    // URL path and body `type` deliberately differ for three families —
    //   contractor-payment (body) → /api/contractorPayment (URL)
    //   advance-salary     (body) → /api/advanceSalary     (URL)
    //   attendance         (body) → /api/att               (URL)
    // Per-domain gating (aligned with the RazorpayX commissioning plan):
    //   people_dismiss                         → push_salary_endpoint_verified
    //                                            + explicit `ack:"CONFIRM_DISMISS"`
    //   payroll modifications (add/reset/dnp) → push_payroll_endpoint_verified
    //   contractor payments / advance salary   → pull_payouts_endpoint_verified
    //                                            (payout-domain gate)
    //   read actions                           → auth + hrms_razorpay_sync
    //                                            (no additional envelope gate)
    // ---------------------------------------------------------------------
    type Gate = "payroll" | "payouts" | "salary" | "none";
    const DIRECT: Record<string, {
      urlPath: string; bodyType: string; sub_type: string;
      write: boolean; gate: Gate; requireAck?: boolean; logAs: string;
    }> = {
      people_dismiss:              { urlPath: "people",             bodyType: "people",             sub_type: "dismiss",             write: true,  gate: "salary",  requireAck: true, logAs: "people_dismiss" },
      payroll_view_payroll:        { urlPath: "payroll",            bodyType: "payroll",            sub_type: "view-payroll",        write: false, gate: "none",    logAs: "payroll_view_payroll" },
      payroll_add_additions:       { urlPath: "payroll",            bodyType: "payroll",            sub_type: "add-additions",       write: true,  gate: "payroll", logAs: "payroll_add_additions" },
      payroll_add_deduction:       { urlPath: "payroll",            bodyType: "payroll",            sub_type: "add-deduction",       write: true,  gate: "payroll", logAs: "payroll_add_deduction" },
      payroll_reset_modifications: { urlPath: "payroll",            bodyType: "payroll",            sub_type: "reset-modifications", write: true,  gate: "payroll", logAs: "payroll_reset_modifications" },
      payroll_do_not_pay:          { urlPath: "payroll",            bodyType: "payroll",            sub_type: "do-not-pay",          write: true,  gate: "payroll", logAs: "payroll_do_not_pay" },
      contractor_payment_create:   { urlPath: "contractorPayment",  bodyType: "contractor-payment", sub_type: "create",              write: true,  gate: "payouts", logAs: "contractor_payment_create" },
      contractor_payment_delete:   { urlPath: "contractorPayment",  bodyType: "contractor-payment", sub_type: "delete",              write: true,  gate: "payouts", logAs: "contractor_payment_delete" },
      contractor_payment_list:     { urlPath: "contractorPayment",  bodyType: "contractor-payment", sub_type: "list-pending",        write: false, gate: "none",    logAs: "contractor_payment_list" },
      contractor_payment_status:   { urlPath: "contractorPayment",  bodyType: "contractor-payment", sub_type: "get-status",          write: false, gate: "none",    logAs: "contractor_payment_status" },
      advance_salary_create:       { urlPath: "advanceSalary",      bodyType: "advance-salary",     sub_type: "create",              write: true,  gate: "payouts", logAs: "advance_salary_create" },
      attendance_fetch:            { urlPath: "att",                bodyType: "attendance",         sub_type: "fetch",               write: false, gate: "none",    logAs: "attendance_fetch" },
    };

    if (action in DIRECT) {
      const spec = DIRECT[action];
      const s = await readSettings(svc);
      if (spec.gate === "payroll" && !s?.push_payroll_endpoint_verified) {
        return json(403, { error: "Payroll-write gate locked (push_payroll_endpoint_verified=false)." });
      }
      if (spec.gate === "payouts" && !s?.pull_payouts_endpoint_verified) {
        return json(403, { error: "Payout-domain gate locked (pull_payouts_endpoint_verified=false)." });
      }
      if (spec.gate === "salary" && !s?.push_salary_endpoint_verified) {
        return json(403, { error: "People/salary gate locked (push_salary_endpoint_verified=false)." });
      }
      if (spec.requireAck && String(payload?.ack || "") !== "CONFIRM_DISMISS") {
        return json(403, { error: "Missing ack. Send { ack: 'CONFIRM_DISMISS' } to authorise this destructive action." });
      }
      const data = (payload && typeof payload === "object" && payload.data && typeof payload.data === "object")
        ? payload.data : {};
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);
      let httpStatus = 0; let bodyOut: any = null; let errText: string | null = null;
      try {
        const res = await fetch(`${BASE}/${spec.urlPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            auth: authBlock(),
            request: { type: spec.bodyType, "sub-type": spec.sub_type },
            data,
          }),
          signal: ctrl.signal,
        });
        httpStatus = res.status;
        const raw = await res.text();
        try { bodyOut = JSON.parse(raw); } catch { bodyOut = { raw: raw.slice(0, 800) }; }
        const rpErr = bodyOut && typeof bodyOut === "object" ? (bodyOut.error ?? bodyOut.message ?? null) : null;
        if (!res.ok || rpErr) {
          errText = typeof rpErr === "string" ? rpErr : (rpErr ? JSON.stringify(rpErr) : `HTTP ${res.status}`);
        }
      } catch (e) {
        errText = `NETWORK: ${(e as Error).message}`;
      } finally { clearTimeout(t); }

      const rpEid = typeof data["employee-id"] === "number" || typeof data["employee-id"] === "string"
        ? String(data["employee-id"]) : "";
      await logSync(svc, {
        action: spec.logAs as any,
        http_status: httpStatus,
        razorpay_employee_id: rpEid,
        hr_employee_id: null,
        field_diff_summary: { url: `/${spec.urlPath}`, body_type: spec.bodyType, sub_type: spec.sub_type, data_keys: Object.keys(data).slice(0, 20) },
        error_text: errText,
        actor_user_id: authed.userId,
      });
      return json(errText ? 502 : 200, { ok: !errText, http_status: httpStatus, body: bodyOut, error: errText });
    }

    return json(400, { error: `Unsupported action: ${action}` });

  } catch (e) {
    console.error("razorpay-payroll-proxy error", e);
    return json(500, { error: (e as Error).message });
  }
});

