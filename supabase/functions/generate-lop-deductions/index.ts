// generate-lop-deductions
//
// Derives Loss-of-Pay deduction rows for a payroll month straight from
// attendance (public.hr_compute_lop_days — the same function the shadow
// payroll engine uses) so operators never have to type LOP per employee.
//
// Body: { period: "YYYY-MM", dry_run?: boolean, employee_ids?: string[] }
//  - dry_run true (default): returns the preview only, writes nothing
//  - dry_run false: upserts auto rows, deletes stale un-pushed auto rows
//
// Rows already pushed to RazorpayX (pushed_at set) are never touched.
// Manually staged rows (source = 'manual') are never touched.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveMonthlyGross, SALARY_BASE_LABELS } from "../_shared/salaryBase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Caller must be an authenticated ERP user.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthorized" }, 401);
    const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userRes?.user) return json({ error: "unauthorized" }, 401);
    const callerId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const period = String(body?.period ?? "");
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return json({ error: "invalid_period", message: "period must be YYYY-MM" }, 400);
    }
    const dryRun = body?.dry_run !== false;
    const filterIds: string[] | null = Array.isArray(body?.employee_ids) && body.employee_ids.length
      ? body.employee_ids.map((x: unknown) => String(x))
      : null;

    const [y, m] = period.split("-").map(Number);
    const periodStr = `${period}-01`;
    const monthEnd = new Date(Date.UTC(y, m, 0));
    const monthEndStr = monthEnd.toISOString().slice(0, 10);
    const totalDays = monthEnd.getUTCDate();

    const supabase = createClient(supabaseUrl, serviceKey);

    // Roster — active employees mapped to RazorpayX (only those are pushable).
    const { data: maps, error: mapErr } = await supabase
      .from("hr_razorpay_employee_map")
      .select("razorpay_employee_id, hr_employee_id, hr_employees:hr_employee_id(id, first_name, last_name, badge_id, is_active)")
      .not("hr_employee_id", "is", null)
      .not("razorpay_employee_id", "is", null);
    if (mapErr) throw mapErr;

    let roster = (maps ?? []).filter((r: any) => r.hr_employees && r.hr_employees.is_active !== false);
    if (filterIds) roster = roster.filter((r: any) => filterIds.includes(r.hr_employee_id));
    if (!roster.length) {
      return json({ period, dry_run: dryRun, rows: [], summary: { employees: 0, with_lop: 0, staged: 0, removed: 0, skipped: 0 } });
    }

    // Attendance-derived LOP for the whole roster in one batch call.
    const { data: lopRows, error: lopErr } = await supabase.rpc("hr_compute_lop_days", {
      p_employee_ids: roster.map((r: any) => r.hr_employee_id),
      p_period_month: periodStr,
    });
    if (lopErr) throw lopErr;
    const lopByEmp = new Map<string, any>();
    for (const r of (lopRows ?? []) as any[]) lopByEmp.set(r.employee_id, r);

    // Existing staged deductions for the period.
    const { data: existing, error: exErr } = await supabase
      .from("hr_payroll_input_deductions")
      .select("id, hr_employee_id, amount, label, source, pushed_at, lop_days")
      .eq("period_month", periodStr);
    if (exErr) throw exErr;
    const autoByEmp = new Map<string, any>();
    for (const r of (existing ?? []) as any[]) {
      if (r.source === "auto_lop") autoByEmp.set(r.hr_employee_id, r);
    }

    const rows: any[] = [];
    const toUpsert: any[] = [];
    const toDelete: string[] = [];

    for (const map of roster as any[]) {
      const emp = map.hr_employees;
      const name = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || emp.badge_id || "—";
      const lop = lopByEmp.get(map.hr_employee_id);
      const existingAuto = autoByEmp.get(map.hr_employee_id);

      const base: any = {
        hr_employee_id: map.hr_employee_id,
        razorpay_employee_id: map.razorpay_employee_id,
        name,
        badge_id: emp.badge_id ?? null,
        working_days: Number(lop?.working_days ?? 0),
        present_days: Number(lop?.present_days ?? 0),
        paid_leave_days: Number(lop?.paid_leave_days ?? 0),
        unpaid_leave_days: Number(lop?.unpaid_leave_days ?? 0),
        lop_days: Number(lop?.lop_days ?? 0),
        formula: lop?.formula ?? null,
        existing_amount: existingAuto ? Number(existingAuto.amount) : null,
        existing_pushed: !!existingAuto?.pushed_at,
      };

      if (!lop) {
        rows.push({ ...base, status: "skipped", reason: "No attendance computation for this employee", amount: 0, base_source: null });
        continue;
      }
      if (Array.isArray(lop.config_errors) && lop.config_errors.length) {
        rows.push({ ...base, status: "skipped", reason: `Leave config error: ${lop.config_errors.join(" ")}`, amount: 0, base_source: null });
        continue;
      }

      const lopDays = Number(lop.lop_days ?? 0);

      if (lopDays <= 0) {
        if (existingAuto && !existingAuto.pushed_at) {
          rows.push({ ...base, status: "remove", reason: "No LOP days — stale auto row will be removed", amount: 0, base_source: null });
          toDelete.push(existingAuto.id);
        } else if (existingAuto?.pushed_at) {
          rows.push({ ...base, status: "pushed", reason: "Already pushed to RazorpayX — left untouched", amount: Number(existingAuto.amount), base_source: null });
        } else {
          rows.push({ ...base, status: "no_lop", reason: "No loss of pay this month", amount: 0, base_source: null });
        }
        continue;
      }

      const salary = await resolveMonthlyGross(supabase, map.hr_employee_id, periodStr, monthEndStr);
      if (salary.error) {
        rows.push({ ...base, status: "skipped", reason: salary.error, amount: 0, base_source: null });
        continue;
      }
      if (!(salary.monthlyGross > 0)) {
        rows.push({ ...base, status: "skipped", reason: "No salary base could be resolved", amount: 0, base_source: null });
        continue;
      }

      const divisor = base.working_days > 0 ? base.working_days : totalDays;
      const amount = Math.round(salary.monthlyGross * (lopDays / divisor));

      const row: any = {
        ...base,
        amount,
        monthly_base: salary.monthlyGross,
        base_source: salary.source,
        base_source_label: SALARY_BASE_LABELS[salary.source],
        divisor,
        label: `LOP — ${lopDays} day${lopDays === 1 ? "" : "s"}`,
      };

      if (existingAuto?.pushed_at) {
        row.status = "pushed";
        row.reason = "Already pushed to RazorpayX — left untouched";
        rows.push(row);
        continue;
      }

      if (existingAuto) {
        row.status = Number(existingAuto.amount) === amount ? "unchanged" : "changed";
      } else {
        row.status = "new";
      }
      rows.push(row);

      if (amount > 0) {
        toUpsert.push({
          ...(existingAuto ? { id: existingAuto.id } : {}),
          hr_employee_id: map.hr_employee_id,
          razorpay_employee_id: map.razorpay_employee_id,
          period_month: periodStr,
          label: row.label,
          amount,
          source: "auto_lop",
          lop_days: lopDays,
          created_by: callerId,
        });
      }
    }

    let staged = 0;
    let removed = 0;

    if (!dryRun) {
      if (toUpsert.length) {
        const { error: upErr } = await supabase
          .from("hr_payroll_input_deductions")
          .upsert(toUpsert, { onConflict: "hr_employee_id,period_month", ignoreDuplicates: false });
        if (upErr) throw upErr;
        staged = toUpsert.length;
      }
      if (toDelete.length) {
        const { error: delErr } = await supabase
          .from("hr_payroll_input_deductions")
          .delete()
          .in("id", toDelete)
          .is("pushed_at", null)
          .eq("source", "auto_lop");
        if (delErr) throw delErr;
        removed = toDelete.length;
      }
    }

    const summary = {
      employees: roster.length,
      with_lop: rows.filter((r) => r.lop_days > 0).length,
      to_stage: toUpsert.length,
      to_remove: toDelete.length,
      staged,
      removed,
      skipped: rows.filter((r) => r.status === "skipped").length,
      pushed_locked: rows.filter((r) => r.status === "pushed").length,
      total_amount: rows.filter((r) => ["new", "changed", "unchanged"].includes(r.status)).reduce((s, r) => s + Number(r.amount ?? 0), 0),
    };

    rows.sort((a, b) => Number(b.lop_days) - Number(a.lop_days) || String(a.name).localeCompare(String(b.name)));

    return json({ period, dry_run: dryRun, rows, summary });
  } catch (e) {
    console.error("generate-lop-deductions failed", e);
    return json({ error: "internal_error", message: (e as Error).message }, 500);
  }
});
