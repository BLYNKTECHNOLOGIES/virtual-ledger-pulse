// generate-lop-deductions
//
// Derives Loss-of-Pay deduction rows for a payroll month straight from
// the maintained Attendance Summary (public.hr_attendance_month_summary),
// so payroll always uses the exact figures operators review in HRMS.
//
// Body: { period: "YYYY-MM", dry_run?: boolean, employee_ids?: string[] }
//  - dry_run true (default): returns the preview only, writes nothing
//  - dry_run false: upserts auto rows, deletes stale un-pushed auto rows
//
// Rows already pushed to RazorpayX (pushed_at set) are never touched.
// Manually staged rows (source = 'manual') are never touched.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveMonthlyGross, SALARY_BASE_LABELS } from "../_shared/salaryBase.ts";
import { fetchCompoffPool, absorbLop } from "../_shared/compoff.ts";


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

    // Employment type — contract staff are paid per contract, not via the
    // attendance LOP engine, so they are surfaced as "LOP not applicable".
    const { data: workInfo } = await supabase
      .from("hr_employee_work_info")
      .select("employee_id, employee_type")
      .in("employee_id", roster.map((r: any) => r.hr_employee_id));
    const empTypeByEmp = new Map<string, string>();
    for (const w of (workInfo ?? []) as any[]) {
      if (w.employee_type) empTypeByEmp.set(w.employee_id, String(w.employee_type).toLowerCase());
    }
    const isContract = (id: string) =>
      ["contract", "contractor", "contractual", "consultant"].includes(empTypeByEmp.get(id) ?? "");

    // Attendance Summary is the payroll source of truth. Do not bypass this
    // RPC with raw punches, sessions, or the lower-level LOP helper.
    const { data: lopRows, error: lopErr } = await supabase.rpc("hr_attendance_month_summary", {
      p_employee_ids: roster.map((r: any) => r.hr_employee_id),
      p_period_month: periodStr,
    });
    if (lopErr) throw lopErr;
    const lopByEmp = new Map<string, any>();
    for (const r of (lopRows ?? []) as any[]) lopByEmp.set(r.employee_id, r);

    // Employment-window proration (Model B).
    //
    // RazorpayX pays the FULL monthly salary in the joining/relieving month
    // (payroll:view-payroll returns isProRated: false), so the working days a
    // person was not employed for must be charged back as LOP days — otherwise
    // a 13th-of-the-month joiner is paid a whole month. The canonical LOP
    // engine deliberately clips to the employment window, so those days are
    // counted here and added on top.
    const { data: gapRows, error: gapErr } = await supabase.rpc("hr_employment_gap_working_days", {
      p_employee_ids: roster.map((r: any) => r.hr_employee_id),
      p_period_month: periodStr,
    });
    if (gapErr) throw gapErr;
    const gapByEmp = new Map<string, any>();
    for (const r of (gapRows ?? []) as any[]) gapByEmp.set(r.employee_id, r);

    // Reporting-only leave-type breakdown (CL / SL / comp-off / unpaid) and
    // days worked on a weekly off or holiday. Never feeds the LOP maths.
    const breakdownByEmp = new Map<string, any>();
    {
      const { data: bd, error: bdErr } = await supabase.rpc("hr_leave_month_breakdown", {
        p_employee_ids: roster.map((r: any) => r.hr_employee_id),
        p_period_month: periodStr,
      });
      if (bdErr) console.error("hr_leave_month_breakdown failed", bdErr);
      for (const r of ((bd ?? []) as any[])) breakdownByEmp.set(r.employee_id, r);
    }


    // Comp-off pool — LOP is cancelled by available comp-off before any
    // deduction is computed (the remainder is encashed by
    // generate-compoff-encashment). Both engines share this math.
    const compoffPool = await fetchCompoffPool(supabase, roster.map((r: any) => r.hr_employee_id), periodStr);

    // Casual-leave balance available to absorb LOP (owner policy: CL is applied
    // automatically, no request needed). Already-booked auto absorption for this
    // month is added back by the RPC so previews stay stable.
    const clByEmp = new Map<string, { available: number; booked: number }>();
    {
      const { data: clRows, error: clErr } = await supabase.rpc("hr_cl_available", {
        p_employee_ids: roster.map((r: any) => r.hr_employee_id),
        p_period_month: periodStr,
      });
      if (clErr) throw clErr;
      for (const r of ((clRows ?? []) as any[])) {
        clByEmp.set(r.employee_id, {
          available: Number(r.cl_available ?? 0),
          booked: Number(r.cl_auto_booked ?? 0),
        });
      }
    }
    const absorptions: { employee_id: string; days: number }[] = [];
    const creditSettlements: { employee_id: string; offset_days: number; encash_days: number }[] = [];



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
    const toInsert: any[] = [];
    const toUpdate: any[] = [];
    const toDelete: string[] = [];

    for (const map of roster as any[]) {
      const emp = map.hr_employees;
      const name = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || emp.badge_id || "—";
      const lop = lopByEmp.get(map.hr_employee_id);
      const existingAuto = autoByEmp.get(map.hr_employee_id);
      const bd = breakdownByEmp.get(map.hr_employee_id);

      const pool = compoffPool.get(map.hr_employee_id) ?? { days_earned: 0, days_opening: 0, days_taken: 0, days_available: 0 };
      const rawLopDays = Number(lop?.lop_days ?? 0);
      const clPool = clByEmp.get(map.hr_employee_id) ?? { available: 0, booked: 0 };
      // Comp-off first, then casual leave — both applied automatically.
      const split = absorbLop(pool.days_available, clPool.available, rawLopDays);

      const gap = gapByEmp.get(map.hr_employee_id);
      const monthWorkingDays = Number(gap?.month_working_days ?? 0);
      const monthCalendarDays = Number(gap?.month_calendar_days ?? totalDays) || totalDays;
      // Proration is CALENDAR-based (Sept 2026 owner ruling): the day rate is
      // salary ÷ calendar days, so the un-served part of a joining/relieving
      // month must be counted in calendar days too. The joining day itself is
      // always payable (the SQL helper only counts days strictly before DOJ).
      const gapDays = Number(gap?.gap_calendar_days ?? 0);
      const gapWorkingDays = Number(gap?.gap_working_days ?? 0);
      // Charge days = genuine absence (after comp-off + CL) + days not employed.
      const chargeDays = Math.min(
        Math.round((split.lop_after_offset + gapDays) * 100) / 100,
        monthCalendarDays,
      );



      const base: any = {
        hr_employee_id: map.hr_employee_id,
        razorpay_employee_id: map.razorpay_employee_id,
        name,
        badge_id: emp.badge_id ?? null,
        working_days: Number(lop?.working_days ?? 0),
        month_working_days: monthWorkingDays,
        present_days: Number(lop?.present_days ?? 0),
        paid_leave_days: Number(lop?.paid_leave_days ?? 0),
        unpaid_leave_days: Number(lop?.unpaid_leave_days ?? 0),
        half_days: Number(lop?.half_days ?? 0),
        absent_days: Number(lop?.absent_days ?? 0),
        held_harmless_days: Number(lop?.held_harmless_days ?? 0),
        unverified_days: Number(lop?.unverified_days ?? 0),
        leave_breakdown: bd?.leave_breakdown ?? [],
        leave_paid_total: Number(bd?.paid_leave_total ?? 0),
        leave_unpaid_total: Number(bd?.unpaid_leave_total ?? 0),
        leave_compoff_total: Number(bd?.compoff_leave_total ?? 0),
        worked_off_days: Number(bd?.worked_off_days ?? 0),
        worked_off_dates: bd?.worked_off_dates ?? [],
        unprocessed_off_days: Number(bd?.unprocessed_off_days ?? 0),
        unprocessed_off_dates: bd?.unprocessed_off_dates ?? [],
        compoff_credit_days: Number(bd?.compoff_credit_days ?? 0),
        compoff_credits: bd?.compoff_credits ?? [],
        // Ledger reflects the automatic set-offs this run applies, so the
        // preview/CSV closing balances match what payroll will actually book
        // (the RPC only sees absorption that is already committed).
        leave_ledger: (() => {
          const led = bd?.leave_ledger ? JSON.parse(JSON.stringify(bd.leave_ledger)) : null;
          if (!led) return null;
          const clExtra = Math.max(0, split.cl_offset_days - (clPool.booked ?? 0));
          if (led.cl && clExtra > 0) {
            led.cl.used = Number(((led.cl.used ?? 0) + clExtra).toFixed(2));
            led.cl.closing = Number(((led.cl.closing ?? 0) - clExtra).toFixed(2));
          }
          if (led.co && split.compoff_offset_days > 0) {
            led.co.offset_lop = split.compoff_offset_days;
            led.co.closing = Number(
              Math.max(0, (led.co.closing ?? 0) - split.compoff_offset_days).toFixed(2),
            );
          }
          return led;
        })(),

        raw_lop_days: rawLopDays,
        compoff_available: pool.days_available,
        compoff_earned: pool.days_earned,
        compoff_opening: pool.days_opening,
        compoff_taken: pool.days_taken,
        compoff_offset_days: split.compoff_offset_days,
        cl_available: clPool.available,
        cl_offset_days: split.cl_offset_days,
        absence_lop_days: split.lop_after_offset,
        proration_days: gapDays,
        employment_from: gap?.emp_from ?? null,
        employment_to: gap?.emp_to ?? null,
        lop_days: chargeDays,
        formula: lop?.formula ?? null,
        existing_amount: existingAuto ? Number(existingAuto.amount) : null,
        existing_pushed: !!existingAuto?.pushed_at,
        employee_type: empTypeByEmp.get(map.hr_employee_id) ?? null,
      };

      // Contract staff: LOP does not apply — mark clearly, and clean up any
      // stale un-pushed auto row that may exist from before.
      if (isContract(map.hr_employee_id)) {
        // lop_days zeroed so summaries/sorting treat them as no deduction.
        if (existingAuto && !existingAuto.pushed_at) {
          rows.push({ ...base, lop_days: 0, status: "remove", reason: "LOP not applicable — contract employee; stale auto row will be removed", amount: 0, base_source: null });
          toDelete.push(existingAuto.id);
        } else {
          rows.push({ ...base, lop_days: 0, status: "not_applicable", reason: "LOP not applicable — contract employee (paid per contract, not attendance)", amount: 0, base_source: null });
        }
        continue;
      }

      if (monthWorkingDays > 0 && gapDays >= monthWorkingDays) {
        rows.push({ ...base, status: "skipped", reason: "Not employed during this period — no payroll expected", amount: 0, base_source: null });
        continue;
      }
      if (!lop) {
        rows.push({ ...base, status: "skipped", reason: "No attendance computation for this employee", amount: 0, base_source: null });
        continue;
      }
      if (Array.isArray(lop.config_errors) && lop.config_errors.length) {
        rows.push({ ...base, status: "skipped", reason: `Leave config error: ${lop.config_errors.join(" ")}`, amount: 0, base_source: null });
        continue;
      }

      if (split.cl_offset_days > 0) {
        absorptions.push({ employee_id: map.hr_employee_id, days: split.cl_offset_days });
      }

      // Comp-off spent on this month's LOP (and whatever is left for the
      // encashment engine) is marked settled so those credits can never come
      // back as an opening balance and be paid a second time.
      if (split.compoff_offset_days > 0 || split.compoff_encash_days > 0) {
        creditSettlements.push({
          employee_id: map.hr_employee_id,
          offset_days: split.compoff_offset_days,
          encash_days: split.compoff_encash_days,
        });
      }


      // Absence LOP (after comp-off) + employment-window proration days.
      const absenceDays = split.lop_after_offset;
      const lopDays = chargeDays;

      // The salary base is resolved for EVERY payable employee, including the
      // zero-LOP ones, so the exported audit sheet always shows what the
      // deduction would have been computed against.
      const salary = await resolveMonthlyGross(supabase, map.hr_employee_id, periodStr, monthEndStr);
      // Day rate = full-month salary ÷ CALENDAR days in the month (Sept 2026
      // owner ruling, matching the HR reconciliation sheet): RazorpayX pays the
      // whole month, and one day of pay is 1/31st of it in a 31-day month.
      const divisor = monthCalendarDays > 0 ? monthCalendarDays : totalDays;
      if (salary.monthlyGross > 0) {
        base.monthly_base = salary.monthlyGross;
        base.base_source = salary.source;
        base.base_source_label = SALARY_BASE_LABELS[salary.source];
        base.base_mismatch = !!salary.mismatch;
        base.base_note = salary.revisionNote ?? null;
        base.divisor = divisor;
      }

      if (lopDays <= 0) {
        const offsetBits: string[] = [];
        if (split.compoff_offset_days > 0) offsetBits.push(`${split.compoff_offset_days} by comp-off`);
        if (split.cl_offset_days > 0) offsetBits.push(`${split.cl_offset_days} by casual leave`);
        const offsetNote = offsetBits.length ? `LOP cancelled: ${offsetBits.join(", ")}` : null;
        if (existingAuto && !existingAuto.pushed_at) {
          rows.push({ ...base, status: "remove", reason: offsetNote ? `${offsetNote} — stale auto row will be removed` : "No LOP days — stale auto row will be removed", amount: 0 });
          toDelete.push(existingAuto.id);
        } else if (existingAuto?.pushed_at) {
          // Attendance now says no LOP but a row is already pushed — flag it,
          // never silently rewrite a pushed row.
          rows.push({
            ...base,
            status: "pushed",
            stale_pushed: Number(existingAuto.amount) !== 0,
            pushed_amount: Number(existingAuto.amount),
            pushed_lop_days: existingAuto.lop_days === null ? null : Number(existingAuto.lop_days),
            reason: Number(existingAuto.amount) !== 0
              ? `Pushed row (₹${Number(existingAuto.amount)}) disagrees with current attendance (no LOP) — correct it in RazorpayX`
              : "Already pushed to RazorpayX — left untouched",
            amount: Number(existingAuto.amount),
          });
        } else {
          rows.push({ ...base, status: "no_lop", reason: offsetNote ?? "No loss of pay this month", amount: 0 });
        }
        continue;
      }

      if (salary.error) {
        rows.push({ ...base, status: "skipped", reason: salary.error, amount: 0 });
        continue;
      }
      if (!(salary.monthlyGross > 0)) {
        rows.push({ ...base, status: "skipped", reason: "No salary base could be resolved", amount: 0 });
        continue;
      }

      const dayRate = salary.monthlyGross / divisor;
      // Compliant split: attendance loss vs. days not employed (proration).
      const attendanceAmount = Math.round(dayRate * Math.min(absenceDays, lopDays));
      const amount = Math.round(dayRate * lopDays);
      const prorationAmount = Math.max(0, amount - attendanceAmount);

      const dayWord = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
      const labelParts: string[] = [];
      if (absenceDays > 0) labelParts.push(`${dayWord(absenceDays)} absence`);
      if (gapDays > 0) labelParts.push(`${dayWord(gapDays)} pre-joining/post-exit proration`);
      if (split.compoff_offset_days > 0) labelParts.push(`${dayWord(split.compoff_offset_days)} offset by comp-off`);
      if (split.cl_offset_days > 0) labelParts.push(`${dayWord(split.cl_offset_days)} offset by casual leave`);

      // RazorpayX accepts one deduction line per employee per cycle for this
      // input; the statutory heading names both components so the payslip and
      // the register stay self-explanatory.
      const heading = absenceDays > 0 && gapDays > 0
        ? "Loss of Pay - Attendance & Proration"
        : gapDays > 0
          ? "Loss of Pay - Pre-joining days (proration)"
          : "Loss of Pay - Attendance";

      const row: any = {
        ...base,
        amount,
        attendance_amount: attendanceAmount,
        proration_amount: prorationAmount,
        proration_working_days: gapWorkingDays,
        monthly_base: salary.monthlyGross,
        base_source: salary.source,
        base_source_label: SALARY_BASE_LABELS[salary.source],
        base_mismatch: !!salary.mismatch,
        base_note: salary.revisionNote ?? null,
        divisor,
        label: `${heading} — ${dayWord(lopDays)}${labelParts.length ? ` (${labelParts.join(", ")})` : ""}`,
      };



      if (existingAuto?.pushed_at) {
        const pushedAmount = Number(existingAuto.amount);
        const stale = pushedAmount !== amount;
        row.status = "pushed";
        row.stale_pushed = stale;
        row.pushed_amount = pushedAmount;
        row.pushed_lop_days = existingAuto.lop_days === null ? null : Number(existingAuto.lop_days);
        row.reason = stale
          ? `Pushed row (₹${pushedAmount}) disagrees with current attendance (₹${amount} / ${lopDays} day${lopDays === 1 ? "" : "s"}) — correct it in RazorpayX`
          : "Already pushed to RazorpayX — left untouched";
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
        // Identity of an auto row is (hr_employee_id, period_month) — the label
        // carries the day count and must never be part of the write key.
        if (existingAuto) {
          toUpdate.push({
            id: existingAuto.id,
            label: row.label,
            amount,
            lop_days: lopDays,
          });
        } else {
          toInsert.push({
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
    }

    let staged = 0;
    let removed = 0;

    let clBooked = 0;
    if (!dryRun) {
      // Book the automatic casual-leave consumption FIRST. The RPC reverses any
      // previous auto booking for this month, so re-running never double-spends.
      const { data: absData, error: absErr } = await supabase.rpc("hr_apply_cl_lop_absorption", {
        p_absorptions: absorptions,
        p_period_month: periodStr,
      });
      if (absErr) throw absErr;
      clBooked = ((absData ?? []) as any[]).reduce((s, r) => s + Number(r.days_booked ?? 0), 0);

      if (creditSettlements.length) {
        const { error: credErr } = await supabase.rpc("hr_settle_compoff_credits", {
          p_period_month: periodStr,
          p_rows: creditSettlements,
        });
        if (credErr) throw credErr;
      }

      for (const upd of toUpdate) {
        const { id, ...patch } = upd;
        const { error: updErr } = await supabase
          .from("hr_payroll_input_deductions")
          .update(patch)
          .eq("id", id)
          .is("pushed_at", null)
          .eq("source", "auto_lop");
        if (updErr) throw updErr;
        staged += 1;
      }
      if (toInsert.length) {
        const { error: insErr } = await supabase
          .from("hr_payroll_input_deductions")
          .insert(toInsert);
        if (insErr) throw insErr;
        staged += toInsert.length;
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
      to_stage: toUpdate.length + toInsert.length,
      to_remove: toDelete.length,
      staged,
      removed,
      skipped: rows.filter((r) => r.status === "skipped").length,
      not_applicable: rows.filter((r) => r.status === "not_applicable").length,
      pushed_locked: rows.filter((r) => r.status === "pushed").length,
      pushed_stale: rows.filter((r) => r.stale_pushed === true).length,
      cl_offset_days: Number(rows.reduce((s, r) => s + Number(r.cl_offset_days ?? 0), 0).toFixed(2)),
      cl_booked_days: Number(clBooked.toFixed(2)),
      compoff_offset_days: Number(rows.reduce((s, r) => s + Number(r.compoff_offset_days ?? 0), 0).toFixed(2)),
      total_amount: rows.filter((r) => ["new", "changed", "unchanged"].includes(r.status)).reduce((s, r) => s + Number(r.amount ?? 0), 0),
    };

    rows.sort((a, b) => Number(b.lop_days) - Number(a.lop_days) || String(a.name).localeCompare(String(b.name)));

    return json({ period, dry_run: dryRun, rows, summary });
  } catch (e) {
    console.error("generate-lop-deductions failed", e);
    return json({ error: "internal_error", message: (e as Error).message }, 500);
  }
});
