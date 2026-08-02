// deno-lint-ignore-file no-explicit-any
// hr-razorpay-pull-apply
//
// Reverse of the "Push → Razorpay" action on the Data Health page: adopt the
// RazorpayX value for one or more drifted fields and WRITE IT INTO HRMS.
//
// Unlike `pull_person_full` on razorpay-payroll-proxy (ERP-wins: fills nulls
// only), this is an explicit, operator-confirmed OVERWRITE of the named fields.
//
// Body: {
//   hr_employee_id: uuid,
//   fields: string[],              // drift field keys, e.g. ["designation"]
//   confirm_sensitive?: boolean,   // required for bank / CTC / active_state
// }
//
// Flow: live people:view re-fetch (never the stale snapshot) → per-field write
// → audit row in hr_razorpay_pushback_log (kind 'pull') → per-employee drift
// re-scan so only genuinely-matching rows close.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

export const SENSITIVE_FIELDS = new Set(["bank_account", "bank_ifsc", "annual_ctc", "active_state"]);
export const BLOCKED_FIELDS = new Set(["employee_code"]);
export const PULLABLE_FIELDS = new Set([
  "full_name", "email", "phone", "dob", "gender", "pan", "date_of_joining",
  "department", "designation", "bank_account", "bank_ifsc", "annual_ctc", "active_state",
]);

const trim = (v: any): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};
const pick = (snap: any, ...keys: string[]): any => {
  if (!snap) return null;
  for (const k of keys) {
    const v = snap[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
};
const toIsoDate = (v: any): string | null => {
  const s = trim(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const digits = (v: any): string | null => {
  const s = trim(v);
  if (!s) return null;
  const d = s.replace(/\D+/g, "");
  return d || null;
};

/** RazorpayX value for a drift field, read off a live people:view snapshot. */
function razorpayValueFor(field: string, snap: any, dismissed: boolean): string | null {
  switch (field) {
    case "full_name": {
      const n = trim(pick(snap, "name", "full-name"));
      if (n) return n;
      const f = trim(pick(snap, "first_name", "first-name"));
      const l = trim(pick(snap, "last_name", "last-name"));
      return [f, l].filter(Boolean).join(" ") || null;
    }
    case "email": return trim(pick(snap, "email", "work-email", "personal-email"))?.toLowerCase() ?? null;
    case "phone": return digits(pick(snap, "phone-number", "contact-number", "phone", "mobile-number"))?.slice(-10) ?? null;
    case "dob": return toIsoDate(pick(snap, "date-of-birth", "date_of_birth", "dob"));
    case "gender": return trim(pick(snap, "gender", "sex"))?.toLowerCase() ?? null;
    case "pan": return trim(pick(snap, "pan", "pan-number", "pan_number"))?.toUpperCase() ?? null;
    case "date_of_joining": return toIsoDate(pick(snap, "date-of-hiring", "date-of-joining", "date_of_hiring", "date_of_joining", "hire_date"));
    case "department": return trim(pick(snap, "department"));
    case "designation": return trim(pick(snap, "title", "designation", "job-title"));
    case "bank_account": return digits(pick(snap, "bank-account-number", "account_number") ?? snap?.bank_account?.account_number);
    case "bank_ifsc": return trim(pick(snap, "bank-ifsc", "ifsc") ?? snap?.bank_account?.ifsc)?.toUpperCase() ?? null;
    case "annual_ctc": {
      const sal = snap?.__salary ?? null;
      const raw = sal?.annual_ctc ?? sal?.["annual-ctc"] ?? null;
      const n = typeof raw === "string" ? Number(raw.replace(/,/g, "")) : raw;
      if (typeof n === "number" && Number.isFinite(n) && n > 0) return String(Math.round(n));
      const monthly = Number(sal?.monthly_gross ?? 0);
      return monthly > 0 ? String(Math.round(monthly * 12)) : null;
    }
    case "active_state": {
      if (dismissed) return "inactive";
      if (!snap) return null;
      return pick(snap, "date-of-dismissal", "date_of_dismissal") ? "inactive" : "active";
    }
    default: return null;
  }
}

async function resolveDepartmentId(svc: any, name: string): Promise<{ id: string | null; created: boolean }> {
  const { data: found } = await svc.from("departments").select("id").ilike("name", name).limit(1).maybeSingle();
  if (found?.id) return { id: found.id, created: false };
  const { data: made, error } = await svc.from("departments").insert({ name }).select("id").maybeSingle();
  if (error) throw new Error(`Could not create department "${name}": ${error.message}`);
  return { id: made?.id ?? null, created: true };
}

async function resolvePositionId(svc: any, title: string): Promise<{ id: string | null; created: boolean }> {
  const { data: found } = await svc.from("positions").select("id").ilike("title", title).limit(1).maybeSingle();
  if (found?.id) return { id: found.id, created: false };
  const { data: made, error } = await svc.from("positions").insert({ title }).select("id").maybeSingle();
  if (error) throw new Error(`Could not create position "${title}": ${error.message}`);
  return { id: made?.id ?? null, created: true };
}

async function upsertWorkInfo(svc: any, employeeId: string, patch: Record<string, any>) {
  const { data: existing } = await svc
    .from("hr_employee_work_info").select("id").eq("employee_id", employeeId).limit(1).maybeSingle();
  if (existing?.id) {
    const { error } = await svc.from("hr_employee_work_info").update(patch).eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await svc.from("hr_employee_work_info").insert({ employee_id: employeeId, ...patch });
    if (error) throw new Error(error.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const authClient = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userRes?.user) return json(401, { error: "Unauthorized" });
    const actorId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const hrEmployeeId = String(body?.hr_employee_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(hrEmployeeId)) return json(400, { error: "hr_employee_id (uuid) required" });
    const requested: string[] = Array.isArray(body?.fields) ? body.fields.map((f: any) => String(f)) : [];
    if (!requested.length) return json(400, { error: "fields[] required" });
    const confirmSensitive = body?.confirm_sensitive === true;

    const svc = createClient(SUPA_URL, SVC);

    const { data: mapRow } = await svc
      .from("hr_razorpay_employee_map")
      .select("razorpay_employee_id")
      .eq("hr_employee_id", hrEmployeeId)
      .maybeSingle();
    const rzpId = mapRow?.razorpay_employee_id ?? null;
    if (!rzpId) return json(200, { ok: false, code: "NOT_LINKED", error: "Employee is not linked to RazorpayX." });

    // --- live re-fetch through the proxy (never the stored snapshot) ---
    const proxyRes = await fetch(`${SUPA_URL}/functions/v1/razorpay-payroll-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: ANON },
      body: JSON.stringify({ action: "read_person_by_id", razorpay_employee_id: rzpId }),
    });
    const proxyBody = await proxyRes.json().catch(() => ({}));
    let snapshot: any = null;
    let dismissed = false;
    if (proxyBody?.ok) {
      snapshot = proxyBody.snapshot ?? null;
    } else if (proxyBody?.code === "RAZORPAY_EMPLOYEE_DISMISSED") {
      dismissed = true;
    } else {
      return json(proxyRes.ok ? 502 : proxyRes.status, {
        ok: false,
        code: proxyBody?.code ?? "RAZORPAY_READ_FAILED",
        error: proxyBody?.error || `RazorpayX read failed (HTTP ${proxyRes.status})`,
      });
    }

    if (snapshot) {
      await svc.from("hr_razorpay_employee_map").update({
        last_pull_snapshot: snapshot,
        last_pulled_at: new Date().toISOString(),
      }).eq("hr_employee_id", hrEmployeeId);
    }

    const { data: emp } = await svc
      .from("hr_employees")
      .select("id, first_name, last_name, email, phone, dob, gender, pan_number, is_active, badge_id")
      .eq("id", hrEmployeeId)
      .maybeSingle();
    if (!emp) return json(404, { error: "HRMS employee not found" });

    const results: any[] = [];
    const empPatch: Record<string, any> = {};

    for (const field of requested) {
      const base = { field, applied: false as boolean, new_value: null as string | null, reason: null as string | null };

      if (BLOCKED_FIELDS.has(field)) {
        results.push({ ...base, reason: "Badge ID is the HRMS identity anchor (biometric mapping) — pull is blocked. Push to RazorpayX instead." });
        continue;
      }
      if (!PULLABLE_FIELDS.has(field)) {
        results.push({ ...base, reason: "No HRMS write target for this field." });
        continue;
      }
      if (SENSITIVE_FIELDS.has(field) && !confirmSensitive) {
        results.push({ ...base, reason: "Sensitive field — explicit confirmation required." });
        continue;
      }

      const value = razorpayValueFor(field, snapshot, dismissed);
      if (value === null) {
        results.push({ ...base, reason: "RazorpayX holds no value for this field right now." });
        continue;
      }
      base.new_value = value;

      try {
        switch (field) {
          case "full_name": {
            const parts = value.split(/\s+/);
            empPatch.first_name = parts[0] ?? value;
            empPatch.last_name = parts.slice(1).join(" ") || null;
            break;
          }
          case "email": empPatch.email = value; break;
          case "phone": empPatch.phone = value; break;
          case "dob": empPatch.dob = value; break;
          case "gender": empPatch.gender = value; break;
          case "pan": empPatch.pan_number = value; break;
          case "active_state": empPatch.is_active = value !== "inactive"; break;
          case "date_of_joining":
            await upsertWorkInfo(svc, hrEmployeeId, { joining_date: value });
            break;
          case "department": {
            const { id, created } = await resolveDepartmentId(svc, value);
            if (!id) throw new Error("Department could not be resolved");
            await upsertWorkInfo(svc, hrEmployeeId, { department_id: id });
            if (created) base.reason = `Created HRMS department "${value}"`;
            break;
          }
          case "designation": {
            const { id, created } = await resolvePositionId(svc, value);
            if (!id) throw new Error("Position could not be resolved");
            await upsertWorkInfo(svc, hrEmployeeId, { job_position_id: id, job_role: value });
            if (created) base.reason = `Created HRMS position "${value}"`;
            break;
          }
          case "bank_account":
          case "bank_ifsc": {
            const { data: bank } = await svc
              .from("hr_employee_bank_details").select("id").eq("employee_id", hrEmployeeId).limit(1).maybeSingle();
            const patch = field === "bank_account" ? { account_number: value } : { ifsc_code: value };
            if (bank?.id) {
              const { error } = await svc.from("hr_employee_bank_details").update(patch).eq("id", bank.id);
              if (error) throw new Error(error.message);
            } else {
              const { error } = await svc.from("hr_employee_bank_details").insert({ employee_id: hrEmployeeId, ...patch });
              if (error) throw new Error(error.message);
            }
            break;
          }
          case "annual_ctc": {
            const monthly = Math.round(Number(value) / 12);
            if (!(monthly > 0)) throw new Error("RazorpayX CTC is not a usable number");
            const { error } = await svc.rpc("reconcile_employee_salary_structure_to_total", {
              p_employee_id: hrEmployeeId,
              p_expected_total: monthly,
            });
            if (error) throw new Error(error.message);
            base.reason = `Salary structure rescaled to ₹${monthly.toLocaleString("en-IN")}/month`;
            break;
          }
        }
        base.applied = true;
      } catch (e) {
        base.reason = (e as Error).message;
      }
      results.push(base);
    }

    if (Object.keys(empPatch).length) {
      const { error } = await svc.from("hr_employees").update(empPatch).eq("id", hrEmployeeId);
      if (error) {
        for (const r of results) {
          if (r.applied && ["full_name", "email", "phone", "dob", "gender", "pan", "active_state"].includes(r.field)) {
            r.applied = false;
            r.reason = error.message;
          }
        }
      }
    }

    const appliedFields = results.filter((r) => r.applied).map((r) => r.field);

    // --- audit ---
    await svc.from("hr_razorpay_pushback_log").insert({
      hr_employee_id: hrEmployeeId,
      razorpay_employee_id: String(rzpId),
      kind: "pull",
      action: "pull_apply_fields",
      status: appliedFields.length ? "success" : "failure",
      request_snapshot: {
        direction: "razorpay_to_hrms",
        fields: requested,
        before: {
          full_name: [emp.first_name, emp.last_name].filter(Boolean).join(" ") || null,
          email: emp.email, phone: emp.phone, dob: emp.dob, gender: emp.gender,
          pan: emp.pan_number, active_state: emp.is_active === false ? "inactive" : "active",
        },
      },
      response_snapshot: { results, razorpay_dismissed: dismissed },
      error_message: appliedFields.length ? null : (results[0]?.reason ?? "Nothing applied"),
      triggered_by: actorId,
      triggered_from: "data_health_pull",
    });

    // --- re-scan this employee so only genuinely-matching drifts close ---
    let rescan: any = null;
    if (appliedFields.length) {
      for (const f of appliedFields) {
        await svc.from("hr_drift_alerts")
          .update({
            resolution_direction: "razorpay_wins",
            resolution_note: "Adopted RazorpayX value into HRMS",
            resolved_by: actorId,
          })
          .eq("hr_employee_id", hrEmployeeId)
          .eq("field", f)
          .is("resolved_at", null);
      }
      try {
        const r = await fetch(
          `${SUPA_URL}/functions/v1/hr-drift-scan?employee_id=${encodeURIComponent(hrEmployeeId)}`,
          { headers: { Authorization: `Bearer ${SVC}`, apikey: ANON } },
        );
        rescan = await r.json().catch(() => null);
      } catch { /* best-effort */ }
    }

    return json(200, {
      ok: appliedFields.length > 0,
      hr_employee_id: hrEmployeeId,
      razorpay_employee_id: String(rzpId),
      razorpay_dismissed: dismissed,
      applied: appliedFields,
      results,
      rescan,
    });
  } catch (e) {
    console.error("hr-razorpay-pull-apply failed", e);
    return json(500, { error: "internal_error", message: (e as Error).message });
  }
});
