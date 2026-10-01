// Daily cron: once an employee's last working day has elapsed (IST), close their
// internal access when F&F is paid. Keep RazorpayX active until the employee's
// final payroll month is explicitly marked processed, then dismiss there.
//
// TWO GATES (money safety): F&F must be paid before internal access closes; the
// final payroll month's hr_payroll_month_meta.processed_on must also be set
// before RazorpayX people:dismiss is called. A zero-value F&F does not bypass
// the second gate because nothing_to_push says nothing about ordinary salary.
//
// Idempotent: successful dismissals are detected from the pushback audit log.


import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireHrCaller } from "../_shared/require-hr-caller.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

function istToday(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

function toDdMmYyyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

async function logPushback(svc: any, row: Record<string, unknown>) {
  try {
    await svc.from("hr_razorpay_pushback_log").insert(row);
  } catch (_) { /* logging must never break the sweep */ }
}

async function deactivateErpLogin(svc: any, emp: any): Promise<boolean> {
  let userId: string | null = emp.user_id || null;
  if (!userId && emp.badge_id) {
    const { data } = await svc.from("users").select("id").eq("badge_id", emp.badge_id).maybeSingle();
    userId = data?.id || null;
  }
  if (!userId && emp.email) {
    const { data } = await svc.from("users").select("id").ilike("email", emp.email).maybeSingle();
    userId = data?.id || null;
  }
  if (!userId) return false;
  const { error } = await svc
    .from("users")
    .update({
      status: "INACTIVE",
      force_logout_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  return !error;
}

async function dismissInRazorpay(
  svc: any,
  hrEmployeeId: string,
  lwdIso: string,
): Promise<{ ok: boolean; status: string; message?: string }> {
  const { data: mapRow } = await svc
    .from("hr_razorpay_employee_map")
    .select("razorpay_employee_id")
    .eq("hr_employee_id", hrEmployeeId)
    .maybeSingle();
  const rpEid = mapRow?.razorpay_employee_id;
  if (!rpEid) {
    await logPushback(svc, {
      hr_employee_id: hrEmployeeId,
      razorpay_employee_id: null,
      kind: "dismissal",
      action: "people_dismiss",
      status: "skipped",
      error_message: "Employee not linked to Razorpay",
      triggered_from: "auto_lwd_sweep",
    });
    return { ok: false, status: "skipped", message: "not linked" };
  }

  const payload = {
    action: "people_dismiss",
    ack: "CONFIRM_DISMISS",
    data: { "employee-id": Number(rpEid), dateOfDismissal: toDdMmYyyy(lwdIso) },
  };

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/razorpay-payroll-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify(payload),
    });
    const res: any = await resp.json().catch(() => ({}));
    const already = !!res?.already_dismissed;
    const manual = !!res?.manual_required;
    const ok = already || res?.ok === true;
    const status = ok ? "success" : manual ? "manual_required" : "failed";
    await logPushback(svc, {
      hr_employee_id: hrEmployeeId,
      razorpay_employee_id: String(rpEid),
      kind: "dismissal",
      action: "people_dismiss",
      status,
      request_snapshot: payload,
      response_snapshot: res,
      error_message: ok ? (already ? "Already dismissed in RazorpayX" : null) : (res?.error || `HTTP ${resp.status}`),
      triggered_from: "auto_lwd_sweep",
    });
    return { ok, status, message: res?.error };
  } catch (e) {
    await logPushback(svc, {
      hr_employee_id: hrEmployeeId,
      razorpay_employee_id: String(rpEid),
      kind: "dismissal",
      action: "people_dismiss",
      status: "failed",
      request_snapshot: payload,
      error_message: String((e as Error)?.message || e),
      triggered_from: "auto_lwd_sweep",
    });
    return { ok: false, status: "failed", message: String((e as Error)?.message || e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Cron/service/HR-staff only — this deactivates ERP logins and pushes RazorpayX dismissals.
  const caller = await requireHrCaller(req, corsHeaders);
  if (!caller.ok) return caller.response;

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const dryRun = !!body?.dry_run;
  const today = istToday();

  const { data: due, error } = await svc
    .from("hr_employees")
    .select("id, badge_id, first_name, last_name, email, user_id, last_working_day, resignation_status, separation_reason, is_active")
    .not("last_working_day", "is", null)
    .lt("last_working_day", today);

  if (error) return json({ ok: false, error: error.message }, 500);

  // F&F state for everyone in scope — one read, no per-employee round trips.
  const dueIds = (due || []).map((e: any) => e.id);
  const fnfByEmployee = new Map<string, any[]>();
  if (dueIds.length > 0) {
    const { data: fnfRows } = await svc
      .from("hr_fnf_settlements")
      .select("employee_id, status, razorpay_push_status, payroll_month")
      .in("employee_id", dueIds);
    for (const r of fnfRows || []) {
      const list = fnfByEmployee.get(r.employee_id) || [];
      list.push(r);
      fnfByEmployee.set(r.employee_id, list);
    }
  }

  const payrollMonths = [...new Set(
    [...fnfByEmployee.values()].flat().map((r: any) => r.payroll_month).filter(Boolean),
  )];
  const processedByMonth = new Map<string, string>();
  if (payrollMonths.length > 0) {
    const { data: monthRows } = await svc
      .from("hr_payroll_month_meta")
      .select("period_month, processed_on")
      .in("period_month", payrollMonths);
    for (const row of monthRows || []) {
      if (row.processed_on) processedByMonth.set(row.period_month, row.processed_on);
    }
  }

  const dismissedIds = new Set<string>();
  if (dueIds.length > 0) {
    const { data: priorDismissals } = await svc
      .from("hr_razorpay_pushback_log")
      .select("hr_employee_id")
      .eq("action", "people_dismiss")
      .eq("status", "success")
      .in("hr_employee_id", dueIds);
    for (const row of priorDismissals || []) dismissedIds.add(row.hr_employee_id);
  }

  /** Why this employee may NOT be dismissed yet, or null when they are clear. */
  function settledFnf(empId: string): { row: any | null; reason: string | null } {
    const rows = (fnfByEmployee.get(empId) || []).filter(
      (r) => String(r.status || "").toLowerCase() !== "cancelled",
    );
    if (rows.length === 0) return { row: null, reason: "No Full & Final settlement exists — create and settle it before closing access." };
    const settled = rows.find((r) => String(r.status).toLowerCase() === "paid");
    if (!settled) {
      const worst = rows[0];
      return { row: null, reason: `Full & Final is still '${worst.status}' — settle it before closing internal access.` };
    }
    if (!["pushed", "nothing_to_push"].includes(String(settled.razorpay_push_status || ""))) {
      return { row: null, reason: "Full & Final is marked paid but its RazorpayX input has not been verified — clear the push first." };
    }
    return { row: settled, reason: null };
  }

  const results: any[] = [];
  for (const emp of due || []) {
    const name = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
    const settlement = settledFnf(emp.id);
    if (settlement.reason) {
      results.push({
        id: emp.id,
        name,
        last_working_day: emp.last_working_day,
        action: "held_fnf_unsettled",
        reason: settlement.reason,
      });
      continue;
    }
    let erp = false;
    if (emp.is_active) {
      if (dryRun) {
        results.push({ id: emp.id, name, last_working_day: emp.last_working_day, action: "would_close_internal_access" });
      } else {
        const { error: updErr } = await svc
          .from("hr_employees")
          .update({
            is_active: false,
            resignation_status: emp.resignation_status || "completed",
            account_deletion_date: emp.last_working_day,
          })
          .eq("id", emp.id)
          .eq("is_active", true);
        if (updErr) {
          results.push({ id: emp.id, name, error: updErr.message });
          continue;
        }
        erp = await deactivateErpLogin(svc, emp);
      }
    }

    const payrollMonth = settlement.row?.payroll_month || `${String(emp.last_working_day).slice(0, 7)}-01`;
    const processedOn = processedByMonth.get(payrollMonth);
    if (!processedOn) {
      results.push({
        id: emp.id,
        name,
        last_working_day: emp.last_working_day,
        internal_access_closed: !dryRun,
        erp_login_disabled: erp,
        action: "held_final_payroll_unprocessed",
        payroll_month: payrollMonth,
        reason: `RazorpayX remains active until ${String(payrollMonth).slice(0, 7)} payroll is marked processed.`,
      });
      continue;
    }
    if (dismissedIds.has(emp.id)) {
      results.push({ id: emp.id, name, action: "already_dismissed", payroll_month: payrollMonth, processed_on: processedOn });
      continue;
    }
    if (dryRun) {
      results.push({ id: emp.id, name, action: "would_dismiss_in_razorpay", payroll_month: payrollMonth, processed_on: processedOn });
      continue;
    }

    const rzp = await dismissInRazorpay(svc, emp.id, emp.last_working_day);

    results.push({
      id: emp.id,
      name,
      last_working_day: emp.last_working_day,
      internal_access_closed: true,
      erp_login_disabled: erp,
      razorpay: rzp.status,
      razorpay_error: rzp.ok ? undefined : rzp.message,
    });
  }

  const held = results.filter((r) => ["held_fnf_unsettled", "held_final_payroll_unprocessed"].includes(r.action));
  return json({
    ok: true,
    today,
    scanned: due?.length || 0,
    dry_run: dryRun,
    held: held.length,
    results,
  });
});
