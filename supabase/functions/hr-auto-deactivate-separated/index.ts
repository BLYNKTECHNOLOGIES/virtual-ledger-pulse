// Daily cron: after last working day (IST), close ERP and biometric access
// independently of F&F. Never dismiss from RazorpayX until F&F is settled and
// this employee's final salary payout is confirmed by the provider.
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
  const { data: userRow, error: lookupError } = await svc.from("users").select("status").eq("id", userId).maybeSingle();
  if (lookupError || !userRow) return false;
  if (userRow.status === "INACTIVE") return true;
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

async function queueBiometricRemoval(svc: any, emp: any): Promise<{ ok: boolean; detail: string }> {
  if (!emp.badge_id) return { ok: true, detail: "No biometric PIN" };
  try {
    const { data: devices, error: deviceError } = await svc.from("hr_biometric_devices").select("device_serial");
    if (deviceError) return { ok: false, detail: deviceError.message };
    if (!devices?.length) return { ok: true, detail: "No registered devices" };
    const { data: prior, error: priorError } = await svc.from("hr_essl_pushback_log")
      .select("device_serial").eq("hr_employee_id", emp.id).eq("kind", "delete")
      .in("status", ["queued", "success"]);
    if (priorError) return { ok: false, detail: priorError.message };
    const queued = new Set((prior || []).map((row: any) => row.device_serial));
    let count = 0;
    for (const device of devices) {
      if (!device.device_serial || queued.has(device.device_serial)) continue;
      const response = await fetch(`${SUPABASE_URL}/functions/v1/hr-essl-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ hr_employee_id: emp.id, action: "delete", device_serial: device.device_serial, triggered_from: "auto_lwd_sweep" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) return { ok: false, detail: result.error || `Device queue failed (HTTP ${response.status})` };
      count++;
    }
    return { ok: true, detail: count ? `Queued on ${count} device(s)` : "Already queued on every device" };
  } catch (error) { return { ok: false, detail: String(error) }; }
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
    if (rows.length === 0) return { row: null, reason: "No Full & Final settlement exists — create and settle it before RazorpayX dismissal." };
    const settled = rows.find((r) => String(r.status).toLowerCase() === "paid");
    if (!settled) {
      const worst = rows[0];
      return { row: null, reason: `Full & Final is still '${worst.status}' — settle it before RazorpayX dismissal.` };
    }
    if (!["pushed", "nothing_to_push"].includes(String(settled.razorpay_push_status || ""))) {
      return { row: null, reason: "Full & Final is marked paid but its RazorpayX input has not been verified — clear the push first." };
    }
    return { row: settled, reason: null };
  }

  const results: any[] = [];
  for (const emp of due || []) {
    const name = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
    // Do not touch a withdrawn or pending-approval separation merely because a
    // tentative date passed. HR's approved notice/complete state is required.
    if (!["notice_period", "completed"].includes(String(emp.resignation_status))) continue;
    const access: any = { erp_login_disabled: false, biometric: "not_attempted" };
    if (dryRun) {
      access.action = "would_close_internal_access";
    } else {
      // Retry ERP on every sweep until it is inactive. Do not tie it to
      // hr_employees.is_active: a previously closed HR row can retain a live ERP login.
      const erp = await deactivateErpLogin(svc, emp);
      access.erp_login_disabled = erp;
      if (emp.is_active) {
        const { error: updErr } = await svc.from("hr_employees")
          .update({ is_active: false, resignation_status: "completed", account_deletion_date: emp.last_working_day })
          .eq("id", emp.id).eq("is_active", true);
        if (updErr) { results.push({ id: emp.id, name, action: "access_error", error: updErr.message }); continue; }
      }
      // Reconcile each registered device independently: partial queue failures
      // must not suppress retries for the remaining devices.
      const bio = await queueBiometricRemoval(svc, emp);
      access.biometric = bio.ok ? bio.detail : `retry_needed: ${bio.detail}`;
    }

    const settlement = settledFnf(emp.id);
    if (settlement.reason) {
      results.push({ id: emp.id, name, last_working_day: emp.last_working_day, ...access, action: "held_fnf_unsettled", reason: settlement.reason });
      continue;
    }
    const payrollMonth = settlement.row?.payroll_month || `${String(emp.last_working_day).slice(0, 7)}-01`;
    const { data: payout, error: payoutError } = await svc.from("hr_razorpay_payout_records")
      .select("id").eq("hr_employee_id", emp.id).eq("period_month", payrollMonth)
      .in("payout_status", ["paid", "success", "processed"])
      .gt("paid_amount", 0).not("paid_at", "is", null).limit(1).maybeSingle();
    if (payoutError || !payout) {
      results.push({
        id: emp.id,
        name,
        last_working_day: emp.last_working_day,
        ...access,
        action: "held_final_payroll_unpaid",
        payroll_month: payrollMonth,
        reason: payoutError?.message || `RazorpayX remains active until this employee's ${String(payrollMonth).slice(0, 7)} salary payout is verified.`,
      });
      continue;
    }
    if (dismissedIds.has(emp.id)) {
      results.push({ id: emp.id, name, ...access, action: "already_dismissed", payroll_month: payrollMonth });
      continue;
    }
    if (dryRun) {
      results.push({ id: emp.id, name, ...access, action: "would_dismiss_in_razorpay", payroll_month: payrollMonth });
      continue;
    }

    const rzp = await dismissInRazorpay(svc, emp.id, emp.last_working_day);

    results.push({
      id: emp.id,
      name,
      last_working_day: emp.last_working_day,
      ...access,
      razorpay: rzp.status,
      razorpay_error: rzp.ok ? undefined : rzp.message,
    });
  }

  const held = results.filter((r) => ["held_fnf_unsettled", "held_final_payroll_unpaid"].includes(r.action));
  return json({
    ok: true,
    today,
    scanned: due?.length || 0,
    dry_run: dryRun,
    held: held.length,
    results,
  });
});
