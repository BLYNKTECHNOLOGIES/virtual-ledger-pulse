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
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
  const c = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await c.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (error || !data?.claims?.sub) return json(401, { error: "Unauthorized" });
  return { userId: data.claims.sub as string };
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

async function upsertMap(svc: SupabaseClient, razorpayId: string, hrEmployeeId: string, isPilot: boolean) {
  await svc.from("hr_razorpay_employee_map").upsert({
    razorpay_employee_id: razorpayId,
    hr_employee_id: hrEmployeeId,
    sync_status: "synced",
    is_pilot_verified: isPilot,
    last_synced_at: new Date().toISOString(),
  }, { onConflict: "razorpay_employee_id" });
}

async function createDraftEmployee(svc: SupabaseClient, e: any): Promise<string> {
  const { first, last } = splitName(e.name || "");
  const { data, error } = await svc.from("hr_employees").insert({
    first_name: first,
    last_name: last,
    email: (e.email || "").toString().trim() || null,
    phone: normPhone(e.phone_number),
    dob: parseDobIso(e["date-of-birth"]),
    pan_number: (e.pan || "").toString().trim().toUpperCase() || null,
    is_active: false, // draft
    additional_info: { source: "razorpay_import", razorpay: { status: "draft", imported_at: new Date().toISOString() } },
  }).select("id").single();
  if (error) throw new Error(`create hr_employees failed: ${error.message}`);
  return data!.id as string;
}

async function readSettings(svc: SupabaseClient) {
  const { data } = await svc.from("hr_razorpay_settings")
    .select("id,bulk_sync_unlocked").eq("is_singleton", true).maybeSingle();
  return data;
}
async function markCredsValidated(svc: SupabaseClient) {
  await svc.from("hr_razorpay_settings").update({ last_creds_validated_at: new Date().toISOString() }).eq("is_singleton", true);
}
async function unlockBulkAndStampImport(svc: SupabaseClient) {
  await svc.from("hr_razorpay_settings").update({
    bulk_sync_unlocked: true,
    last_import_at: new Date().toISOString(),
  }).eq("is_singleton", true);
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
      await upsertMap(svc, String(eid), hrId!, true);
      await logSync(svc, {
        action: created ? "create_draft" : "match",
        http_status: r.status,
        razorpay_employee_id: String(eid),
        hr_employee_id: hrId,
        field_diff_summary: { field_names: fieldNames(r.body), matched_by: match.matched_by, pilot: true },
        actor_user_id: authed.userId,
      });
      await unlockBulkAndStampImport(svc);
      return json(200, { ok: true, hr_employee_id: hrId, created, matched_by: match.matched_by });
    }

    const settings = await readSettings(svc);

    // ---------- dry_run_range ----------
    if (action === "dry_run_range" || action === "apply_range") {
      if (!settings?.bulk_sync_unlocked) {
        return json(403, { error: "Bulk sync locked. Run the pilot (apply_one) on one employee first." });
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
          let hrId = match.hr_employee_id;
          let created = false;
          if (!hrId) { hrId = await createDraftEmployee(svc, r.body); created = true; }
          await upsertMap(svc, String(i), hrId!, false);
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
        }
      }

      if (action === "apply_range") await unlockBulkAndStampImport(svc);

      const summary = {
        total: rows.length,
        hits: rows.filter((r) => r.status === "hit").length,
        matches: rows.filter((r) => r.action_planned === "match").length,
        creates: rows.filter((r) => r.action_planned === "create_draft").length,
        misses: rows.filter((r) => r.status === "miss").length,
        stopped: rows.some((r) => r.status === "stopped"),
      };
      return json(200, { ok: true, summary, rows });
    }

    return json(400, { error: `Unsupported action: ${action}` });
  } catch (e) {
    console.error("razorpay-payroll-proxy error", e);
    return json(500, { error: (e as Error).message });
  }
});
