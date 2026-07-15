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

async function matchEmployee(svc: SupabaseClient, e: any): Promise<MatchResult> {
  const pan = (e.pan || "").toString().trim().toUpperCase();
  const phone = normPhone(e.phone_number);
  const email = (e.email || "").toString().trim().toLowerCase();

  if (pan) {
    const { data } = await svc.from("hr_employees").select("id").eq("pan_number", pan).limit(1).maybeSingle();
    if (data?.id) return { hr_employee_id: data.id, matched_by: "pan", action: "match" };
  }
  if (phone) {
    const { data } = await svc.from("hr_employees").select("id,phone").ilike("phone", `%${phone}%`).limit(5);
    const hit = (data || []).find((r: any) => normPhone(r.phone) === phone);
    if (hit) return { hr_employee_id: hit.id, matched_by: "phone", action: "match" };
  }
  if (email) {
    const { data } = await svc.from("hr_employees").select("id").ilike("email", email).limit(1).maybeSingle();
    if (data?.id) return { hr_employee_id: data.id, matched_by: "email", action: "match" };
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
  await svc.from("hr_razorpay_sync_log").insert(row);
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
    const { data: d } = await svc.from("departments").select("id").ilike("name", deptName).limit(1).maybeSingle();
    if (d?.id) departmentId = d.id;
  }
  if (jobTitle) {
    const { data: p } = await svc.from("positions").select("id").ilike("title", jobTitle).limit(1).maybeSingle();
    if (p?.id) jobPositionId = p.id;
  }
  const wiIncoming: Record<string, any> = {
    joining_date: parseDobIso(snap?.["date-of-joining"] ?? snap?.date_of_joining ?? snap?.joining_date),
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
  // RazorpayX nests bank under bank_account / bank_details / bank_information; take widest reach.
  const b = snap?.bank_account ?? snap?.bank_details ?? snap?.bank_information ?? snap?.bank ?? {};
  const bankIncoming: Record<string, any> = {
    account_number: pickString(b?.account_number, snap?.account_number, snap?.bank_account_number),
    ifsc_code: normIfsc(b?.ifsc ?? b?.ifsc_code ?? snap?.ifsc ?? snap?.ifsc_code),
    bank_name: pickString(b?.bank_name, snap?.bank_name),
    branch: pickString(b?.branch, b?.branch_name, snap?.branch),
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

      let match = await matchEmployee(svc, r.body);
      let hrId = match.hr_employee_id;
      let created = false;
      if (!hrId) {
        hrId = await createDraftEmployee(svc, r.body);
        created = true;
      }
      await upsertMap(svc, String(eid), hrId!, true, created);
      await logSync(svc, {
        action: created ? "create_draft" : "match",
        http_status: r.status,
        razorpay_employee_id: String(eid),
        hr_employee_id: hrId,
        field_diff_summary: { field_names: fieldNames(r.body), matched_by: match.matched_by, pilot: true },
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
      const READONLY = new Set([
        // Phase 1 confirmed
        "people:view",
        // Phase 2 read probes — safe view/list variants of every write-capable resource
        "salary:view",
        "salary-structure:view",
        "salary-structure:list",
        "attendance:view",
        "attendance:list",
        "payslip:view",
        "payslip:list",
        "payslip:download",
        "payroll:view",
        "payroll:list",
        "payroll:status",
        "payroll:months",
        "payroll:runs",
        "tds:view",
        "tds:report",
        "tds:list",
        "bank-details:view",
        "webhook:view",
        "webhook:list",
        "people:list",
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
        status: "ok" | "fail" | "not_probed"; http_status: number | null;
        error: string | null; top_level_keys: string[] | null;
      };
      const CATALOGUE: Array<{ phase: string; key: string; mode: "read" | "write" }> = [
        { phase: "Phase 1 — Import", key: "people:view", mode: "read" },
        { phase: "Phase 1 — Import", key: "people:list", mode: "read" },
        { phase: "Phase 3 — Master push", key: "people:update", mode: "write" },
        { phase: "Phase 3 — Master push", key: "people:create", mode: "write" },
        { phase: "Phase 4 — Bank & PAN", key: "bank-details:view", mode: "read" },
        { phase: "Phase 5 — Salary structure", key: "salary:view", mode: "read" },
        { phase: "Phase 5 — Salary structure", key: "salary-structure:view", mode: "read" },
        { phase: "Phase 5 — Salary structure", key: "salary-structure:list", mode: "read" },
        { phase: "Phase 5 — Salary structure", key: "salary-structure:create", mode: "write" },
        { phase: "Phase 5 — Salary structure", key: "salary-structure:update", mode: "write" },
        { phase: "Phase 5 — Salary structure", key: "salary:update", mode: "write" },
        { phase: "Phase 6 — Attendance/LOP", key: "attendance:view", mode: "read" },
        { phase: "Phase 6 — Attendance/LOP", key: "attendance:list", mode: "read" },
        { phase: "Phase 6 — Attendance/LOP", key: "attendance:import", mode: "write" },
        { phase: "Phase 7 — Payroll orchestration", key: "payroll:view", mode: "read" },
        { phase: "Phase 7 — Payroll orchestration", key: "payroll:list", mode: "read" },
        { phase: "Phase 7 — Payroll orchestration", key: "payroll:status", mode: "read" },
        { phase: "Phase 7 — Payroll orchestration", key: "payroll:months", mode: "read" },
        { phase: "Phase 7 — Payroll orchestration", key: "payroll:runs", mode: "read" },
        { phase: "Phase 7 — Payroll orchestration", key: "payroll:execute", mode: "write" },
        { phase: "Phase 7 — Payroll orchestration", key: "payroll:finalize", mode: "write" },
        { phase: "Phase 8 — Payslip & TDS pull", key: "payslip:view", mode: "read" },
        { phase: "Phase 8 — Payslip & TDS pull", key: "payslip:list", mode: "read" },
        { phase: "Phase 8 — Payslip & TDS pull", key: "payslip:download", mode: "read" },
        { phase: "Phase 8 — Payslip & TDS pull", key: "tds:view", mode: "read" },
        { phase: "Phase 8 — Payslip & TDS pull", key: "tds:report", mode: "read" },
        { phase: "Phase 9 — Separation", key: "people:dismiss", mode: "write" },
        { phase: "Phase 10 — Webhooks", key: "webhook:view", mode: "read" },
        { phase: "Phase 10 — Webhooks", key: "webhook:list", mode: "read" },
      ];

      // Find a pilot-verified employee to attach to probes that require an ID.
      const { data: pilot } = await svc
        .from("hr_razorpay_employee_map")
        .select("razorpay_employee_id")
        .eq("is_pilot_verified", true)
        .limit(1).maybeSingle();
      const probeId = pilot?.razorpay_employee_id ?? null;

      const rows: Row[] = [];
      for (const item of CATALOGUE) {
        if (item.mode === "write") {
          rows.push({
            ...item, status: "not_probed", http_status: null, error: null, top_level_keys: null,
          });
          continue;
        }
        const [resource, subType] = item.key.split(":");
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        try {
          const body: any = { auth: authBlock(), request: { type: resource, "sub-type": subType } };
          if (probeId && ["people", "salary", "salary-structure", "attendance", "payslip", "bank-details", "tds"].includes(resource)) {
            body.data = { employee_id: probeId };
          }
          const res = await fetch(`${BASE}/${resource}`, {
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
          const errText = parsed && typeof parsed === "object" ? (parsed.error || parsed.message || null) : null;
          const looksMissing = res.status === 404
            || (typeof errText === "string" && /unknown|not\s*found|invalid\s*sub[-_ ]?type/i.test(errText));
          rows.push({
            ...item,
            status: !looksMissing && res.ok && !errText ? "ok" : (looksMissing ? "fail" : "fail"),
            http_status: res.status,
            error: errText ? String(errText).slice(0, 200) : null,
            top_level_keys: topKeys,
          });
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
            probe_id: probeId,
            results: rows.map((r) => ({ key: r.key, status: r.status, http: r.http_status })),
          },
          actor_user_id: authed.userId,
        });
      } catch { /* logging is best-effort */ }

      return json(200, { ok: true, probe_id: probeId, rows });
    }



    const settings = await readSettings(svc);

    // ---------- dry_run_range / apply_range ----------
    if (action === "dry_run_range" || action === "apply_range") {
      if (action === "apply_range" && !settings?.bulk_sync_unlocked) {
        return json(403, { error: "Bulk sync locked. Unlock after pilot verification." });
      }
      const start = Math.max(1, Number(payload?.start_id ?? 1));
      const end = Math.max(start, Number(payload?.max_id ?? start));
      const HARD_CAP = 1000;
      if (end - start + 1 > HARD_CAP) return json(400, { error: `Range too wide (max ${HARD_CAP})` });

      const rows: any[] = [];
      let consecutiveMisses = 0;
      const STOP_AFTER = 30;

      for (let i = start; i <= end; i++) {
        const r = await opfinView(i);
        if (!r.ok) {
          consecutiveMisses++;
          rows.push({ employee_id: i, status: "miss", http_status: r.status });
          if (consecutiveMisses >= STOP_AFTER) {
            rows.push({ employee_id: null, status: "stopped", note: `${STOP_AFTER} consecutive misses` });
            break;
          }
          continue;
        }
        consecutiveMisses = 0;
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
            await logSync(svc, {
              action: created ? "create_draft" : "match",
              http_status: r.status,
              razorpay_employee_id: String(i),
              hr_employee_id: hrId,
              field_diff_summary: { field_names: fieldNames(r.body), matched_by: match.matched_by, bulk: true },
              actor_user_id: authed.userId,
            });
            rows[rows.length - 1].applied = true;
            rows[rows.length - 1].created = created;
            rows[rows.length - 1].hr_employee_id = hrId;
          } catch (rowErr: any) {
            const msg = String(rowErr?.message ?? rowErr);
            rows[rows.length - 1].applied = false;
            rows[rows.length - 1].error = msg;
            await logSync(svc, {
              action: "apply_error",
              http_status: 500,
              razorpay_employee_id: String(i),
              field_diff_summary: { error: msg, bulk: true },
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
        try {
          const hash = await canonicalHash(r.body);
          const unchanged = m.last_payload_hash === hash;
          // Always refresh snapshot + last_pulled_at, but skip projection when unchanged.
          await svc.from("hr_razorpay_employee_map").update({
            last_pull_snapshot: r.body,
            last_pulled_at: new Date().toISOString(),
            last_payload_hash: hash,
          }).eq("razorpay_employee_id", m.razorpay_employee_id);

          let diff: any = null;
          if (!unchanged) {
            diff = await projectSnapshotIntoErp(svc, m.hr_employee_id, r.body);
            const wroteCount = diff.hr_employees.wrote.length + diff.work_info.wrote.length + diff.bank.wrote.length;
            if (wroteCount) wroteAny++;
          }

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
              } : null,
              conflicts: diff ? {
                hr_employees: diff.hr_employees.conflicts,
                work_info: diff.work_info.conflicts,
                bank: diff.bank.conflicts,
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
            } : null,
            conflicts: diff ? diff.hr_employees.conflicts.length + diff.work_info.conflicts.length + diff.bank.conflicts.length : 0,
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
              request: { type: "people", "sub-type": "update" },
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

    if (action === "unlock_bulk_push") {
      const s = await readSettings(svc);
      if (!s?.push_pilot_verified_at) return json(400, { error: "Cannot unlock bulk push — pilot not verified yet." });
      await svc.from("hr_razorpay_settings").update({ bulk_push_unlocked: true }).eq("is_singleton", true);
      return json(200, { ok: true });
    }

    return json(400, { error: `Unsupported action: ${action}` });
  } catch (e) {
    console.error("razorpay-payroll-proxy error", e);
    return json(500, { error: (e as Error).message });
  }
});
