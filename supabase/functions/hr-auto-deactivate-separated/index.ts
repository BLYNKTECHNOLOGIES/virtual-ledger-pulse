// Daily cron: once an employee's last working day has elapsed (IST), flip them
// to inactive in HRMS, kill their ERP login, and dismiss them in RazorpayX with
// that exact last working day.
//
// Idempotent: only touches employees still is_active = true with a
// last_working_day strictly in the past. Razorpay dismissal is best-effort and
// logged to hr_razorpay_pushback_log — a provider failure never blocks the
// local separation.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const dryRun = !!body?.dry_run;
  const today = istToday();

  const { data: due, error } = await svc
    .from("hr_employees")
    .select("id, badge_id, first_name, last_name, email, user_id, last_working_day, resignation_status, separation_reason")
    .eq("is_active", true)
    .not("last_working_day", "is", null)
    .lt("last_working_day", today);

  if (error) return json({ ok: false, error: error.message }, 500);

  const results: any[] = [];
  for (const emp of due || []) {
    const name = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
    if (dryRun) {
      results.push({ id: emp.id, name, last_working_day: emp.last_working_day, action: "would_deactivate" });
      continue;
    }

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

    const erp = await deactivateErpLogin(svc, emp);
    const rzp = await dismissInRazorpay(svc, emp.id, emp.last_working_day);

    results.push({
      id: emp.id,
      name,
      last_working_day: emp.last_working_day,
      deactivated: true,
      erp_login_disabled: erp,
      razorpay: rzp.status,
      razorpay_error: rzp.ok ? undefined : rzp.message,
    });
  }

  return json({ ok: true, today, scanned: due?.length || 0, dry_run: dryRun, results });
});
