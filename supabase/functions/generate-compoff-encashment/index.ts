// generate-compoff-encashment
//
// Comp-off is a strictly monthly currency. Whatever comp-off remains after it
// has been taken as leave and after it has cancelled the month's loss of pay
// is ENCASHED in the same payroll month — nothing carries forward.
//
// Body: { period: "YYYY-MM", dry_run?: boolean, employee_ids?: string[] }
//  - dry_run true (default): preview only, writes nothing
//  - dry_run false: upserts auto addition rows, deletes stale un-pushed rows
//
// Rows already pushed to RazorpayX (pushed_at set) are never touched.
// Per-day value = monthly gross / working days — identical base and divisor to
// generate-lop-deductions, so a day offset and a day encashed are worth the
// same rupee amount.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveMonthlyGross, SALARY_BASE_LABELS } from "../_shared/salaryBase.ts";
import { fetchCompoffPool, splitCompoff } from "../_shared/compoff.ts";

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

    const { data: maps, error: mapErr } = await supabase
      .from("hr_razorpay_employee_map")
      .select("razorpay_employee_id, hr_employee_id, hr_employees:hr_employee_id(id, first_name, last_name, badge_id, is_active)")
      .not("hr_employee_id", "is", null)
      .not("razorpay_employee_id", "is", null);
    if (mapErr) throw mapErr;

    let roster = (maps ?? []).filter((r: any) => r.hr_employees && r.hr_employees.is_active !== false);
    if (filterIds) roster = roster.filter((r: any) => filterIds.includes(r.hr_employee_id));
    if (!roster.length) {
      return json({ period, dry_run: dryRun, rows: [], summary: { employees: 0, with_encashment: 0, staged: 0, removed: 0, skipped: 0, total_amount: 0 } });
    }

    const empIds = roster.map((r: any) => r.hr_employee_id);

    // Attendance summary supplies LOP days; comp-off cancels those first.
    const { data: lopRows, error: lopErr } = await supabase.rpc("hr_attendance_month_summary", {
      p_employee_ids: empIds,
      p_period_month: periodStr,
    });
    if (lopErr) throw lopErr;
    const lopByEmp = new Map<string, any>();
    for (const r of (lopRows ?? []) as any[]) lopByEmp.set(r.employee_id, r);

    const pools = await fetchCompoffPool(supabase, empIds, periodStr);

    const { data: existing, error: exErr } = await supabase
      .from("hr_payroll_input_additions")
      .select("id, hr_employee_id, amount, label, source, pushed_at")
      .eq("period_month", periodStr);
    if (exErr) throw exErr;
    const autoByEmp = new Map<string, any>();
    for (const r of (existing ?? []) as any[]) {
      if (r.source === "auto_compoff") autoByEmp.set(r.hr_employee_id, r);
    }

    const rows: any[] = [];
    const toUpsert: any[] = [];
    const toDelete: string[] = [];
    const settlements: any[] = [];

    for (const map of roster as any[]) {
      const emp = map.hr_employees;
      const name = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || emp.badge_id || "—";
      const lop = lopByEmp.get(map.hr_employee_id);
      const existingAuto = autoByEmp.get(map.hr_employee_id);
      const pool = pools.get(map.hr_employee_id) ?? { days_earned: 0, days_opening: 0, days_taken: 0, days_available: 0 };
      const rawLopDays = Number(lop?.lop_days ?? 0);
      const split = splitCompoff(pool.days_available, rawLopDays);
      const workingDays = Number(lop?.working_days ?? 0);

      const base: any = {
        hr_employee_id: map.hr_employee_id,
        razorpay_employee_id: map.razorpay_employee_id,
        name,
        badge_id: emp.badge_id ?? null,
        working_days: workingDays,
        compoff_earned: pool.days_earned,
        compoff_opening: pool.days_opening,
        compoff_taken: pool.days_taken,
        compoff_available: pool.days_available,
        lop_days: rawLopDays,
        offset_days: split.offset_days,
        encash_days: split.encash_days,
        existing_amount: existingAuto ? Number(existingAuto.amount) : null,
        existing_pushed: !!existingAuto?.pushed_at,
      };

      if (split.encash_days <= 0) {
        if (existingAuto?.pushed_at) {
          rows.push({ ...base, status: "pushed", reason: "Already pushed to RazorpayX — left untouched", amount: Number(existingAuto.amount) });
        } else if (existingAuto) {
          rows.push({ ...base, status: "remove", reason: "Nothing left to encash — stale auto row will be removed", amount: 0 });
          toDelete.push(existingAuto.id);
        } else {
          rows.push({
            ...base,
            status: "none",
            amount: 0,
            reason: pool.days_available > 0
              ? `All ${split.offset_days} comp-off day${split.offset_days === 1 ? "" : "s"} used to cancel LOP`
              : "No comp-off balance this month",
          });
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

      const divisor = workingDays > 0 ? workingDays : totalDays;
      const perDay = salary.monthlyGross / divisor;
      const amount = Math.round(perDay * split.encash_days);

      const row: any = {
        ...base,
        amount,
        per_day_rate: Math.round(perDay * 100) / 100,
        monthly_base: salary.monthlyGross,
        base_source: salary.source,
        base_source_label: SALARY_BASE_LABELS[salary.source],
        divisor,
        label: `Comp-off encashment — ${split.encash_days} day${split.encash_days === 1 ? "" : "s"}`,
      };

      if (existingAuto?.pushed_at) {
        row.status = "pushed";
        row.reason = "Already pushed to RazorpayX — left untouched";
        rows.push(row);
        continue;
      }

      row.status = existingAuto
        ? (Number(existingAuto.amount) === amount ? "unchanged" : "changed")
        : "new";
      rows.push(row);

      if (amount > 0) {
        toUpsert.push({
          ...(existingAuto ? { id: existingAuto.id } : {}),
          hr_employee_id: map.hr_employee_id,
          razorpay_employee_id: map.razorpay_employee_id,
          period_month: periodStr,
          label: row.label,
          amount,
          taxable: true,
          source: "auto_compoff",
          created_by: callerId,
        });
        settlements.push({
          employee_id: map.hr_employee_id,
          period_month: periodStr,
          days_earned: pool.days_earned,
          days_taken: pool.days_taken,
          days_offset_lop: split.offset_days,
          days_encashed: split.encash_days,
          per_day_rate: row.per_day_rate,
          amount,
          base_source: salary.source,
        });
      }
    }

    let staged = 0;
    let removed = 0;

    if (!dryRun) {
      if (toUpsert.length) {
        const { error: upErr } = await supabase
          .from("hr_payroll_input_additions")
          .upsert(toUpsert, { onConflict: "razorpay_employee_id,period_month,label", ignoreDuplicates: false });
        if (upErr) throw upErr;
        staged = toUpsert.length;
      }
      if (toDelete.length) {
        const { error: delErr } = await supabase
          .from("hr_payroll_input_additions")
          .delete()
          .in("id", toDelete)
          .is("pushed_at", null)
          .eq("source", "auto_compoff");
        if (delErr) throw delErr;
        removed = toDelete.length;
      }
      if (settlements.length) {
        const { error: setErr } = await supabase
          .from("hr_compoff_settlements")
          .upsert(settlements, { onConflict: "employee_id,period_month", ignoreDuplicates: false });
        if (setErr) throw setErr;
      }
    }

    const summary = {
      employees: roster.length,
      with_encashment: rows.filter((r) => Number(r.encash_days) > 0).length,
      offset_days_total: rows.reduce((s, r) => s + Number(r.offset_days ?? 0), 0),
      encash_days_total: rows.reduce((s, r) => s + Number(r.encash_days ?? 0), 0),
      to_stage: toUpsert.length,
      to_remove: toDelete.length,
      staged,
      removed,
      skipped: rows.filter((r) => r.status === "skipped").length,
      pushed_locked: rows.filter((r) => r.status === "pushed").length,
      total_amount: rows
        .filter((r) => ["new", "changed", "unchanged"].includes(r.status))
        .reduce((s, r) => s + Number(r.amount ?? 0), 0),
    };

    rows.sort((a, b) => Number(b.encash_days) - Number(a.encash_days) || String(a.name).localeCompare(String(b.name)));

    return json({ period, dry_run: dryRun, rows, summary });
  } catch (e) {
    console.error("generate-compoff-encashment failed", e);
    return json({ error: "internal_error", message: (e as Error).message }, 500);
  }
});
