/**
 * Compute Shadow Payroll — the local "second opinion" engine.
 *
 * Doctrine: RazorpayX is authoritative. This engine writes into a fully
 * isolated `hr_shadow_*` namespace so its output CAN NEVER leak into any
 * payout-facing surface. It exists to let HR A/B our computation against
 * Razorpay's for 2–3 months and catch drift on either side.
 *
 * Trigger: POST { period_month: "YYYY-MM-01", employee_ids?: string[] }
 * Response: { run_id, computed_count }
 *
 * Rules mirrored (2026-07-19, verified against 10 real payslips):
 *  - PF/ESI/PT enrollment is PER-EMPLOYEE (`hr_employees.pf_enabled` etc.);
 *    global compliance toggles are only a fallback.
 *  - Structure split can be overridden per-employee via `custom_structure_pct`
 *    (JSON of Basic/HRA/Special/LTA %). Grandfathered pre-2026 hires.
 *  - LOP + KPI-Loss shrink Basic/HRA/LTA proportionally; Special = residual.
 *  - PF (all three lines) recomputed on shrunk Basic: 12% ee / 12% er (contra)
 *    / 1% EDLI+Admin (deduction) / 13% employer earnings-side, all capped at
 *    min(Basic, 15 000).
 *  - ESI base = shrunk regular gross (Basic + HRA + Special + LTA), gate 21k.
 *  - LWF is INTENTIONALLY NOT COMPUTED (owner directive; deducted once in error
 *    on Jun-26 payslips and never to be re-enabled without approval).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---- inline statutory helpers (mirror of src/lib/hrms/statutoryCalculator.ts) ----
function pfWageBase(basic: number, da: number, s: any): number {
  if (!s) return Math.min(basic || 0, 15000);
  const raw = s.pf_wages_basic_only ? (basic || 0) : (basic || 0) + (da || 0);
  return s.pf_wage_cap_15000 ? Math.min(raw, 15000) : raw;
}
function computeEpf(basic: number, da: number, s: any, enrolled: boolean) {
  if (!enrolled) return { employee: 0, employer: 0, admin_edli: 0, employer_earnings_side: 0, base: 0 };
  const base = pfWageBase(basic, da, s);
  const employee = Math.round(base * 0.12);
  const employer = Math.round(base * 0.12);
  const admin_edli = Math.round(base * 0.01);           // flat 1% — verified vs Priya
  const employer_earnings_side = employer + admin_edli; // 13% line printed on payslip
  return { employee, employer, admin_edli, employer_earnings_side, base };
}
function computeEsi(fullGross: number, regularGross: number, s: any, enrolled: boolean) {
  if (!enrolled || regularGross > 21000) return { employee: 0, employer: 0, base: 0 };
  const base = s?.esi_include_additions_in_wages ? fullGross : regularGross;
  return {
    employee: Math.round(base * 0.0075),
    employer: Math.round(base * 0.0325),
    base,
  };
}
function computePt(base: number, stateCode: string, slabs: any[], enrolled: boolean, periodMonth: Date): number {
  if (!enrolled || !slabs?.length || !stateCode) return 0;
  const stateSlabs = slabs.filter((sl) => sl.state_code === stateCode);
  if (!stateSlabs.length) return 0;
  const match = stateSlabs.find(
    (sl) => base >= sl.slab_min && (sl.slab_max === null || base <= sl.slab_max),
  );
  if (!match) return 0;
  if (match.special_month && (periodMonth.getMonth() + 1) === match.special_month && match.special_amount) {
    return match.special_amount;
  }
  return match.monthly_amount;
}
function projectAnnualTax(annual: number, regime: string): number {
  if (annual <= 0) return 0;
  const slabs = regime === "old"
    ? [[250000, 0], [500000, 0.05], [1000000, 0.20], [Infinity, 0.30]]
    : [[400000, 0], [800000, 0.05], [1200000, 0.10], [1600000, 0.15], [2000000, 0.20], [2400000, 0.25], [Infinity, 0.30]];
  let tax = 0, prev = 0;
  for (const [ceiling, rate] of slabs as [number, number][]) {
    if (annual > ceiling) { tax += (ceiling - prev) * rate; prev = ceiling; }
    else { tax += (annual - prev) * rate; break; }
  }
  tax *= 1.04;
  if (regime === "new" && annual <= 700000) tax = 0;
  if (regime === "old" && annual <= 500000) tax = 0;
  return Math.max(0, tax);
}

// Resolve % split — per-employee override wins over Razorpay default.
function resolveStructurePct(
  customPct: any,
  components: any[] | null,
  useDefault: boolean,
): { basic: number; hra: number; special: number; lta: number } {
  if (customPct && typeof customPct === "object") {
    return {
      basic: Number(customPct.basic ?? 50),
      hra: Number(customPct.hra ?? 25),
      special: Number(customPct.special ?? 15),
      lta: Number(customPct.lta ?? 10),
    };
  }
  if (useDefault && components?.length) {
    const pick = (k: string, fb: number) => {
      const c = components.find((x: any) => x.key === k && x.mode === "percentage");
      return c ? Number(c.value) : fb;
    };
    return {
      basic: pick("basic", 50),
      hra: pick("hra", 25),
      special: pick("special_allowance", 15),
      lta: pick("lta", 10),
    };
  }
  return { basic: 50, hra: 25, special: 15, lta: 10 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const periodStr: string = body.period_month;
    if (!periodStr || !/^\d{4}-\d{2}-\d{2}$/.test(periodStr)) {
      return new Response(JSON.stringify({ error: "period_month (YYYY-MM-01) required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const period = new Date(periodStr + "T00:00:00Z");
    const employeeIds: string[] | undefined = body.employee_ids;

    // 1. Load compliance mirror + PT slabs
    const { data: settingsArr } = await supabase.from("hr_razorpay_settings").select("*").eq("is_singleton", true).limit(1);
    const settings = settingsArr?.[0];
    const { data: ptSlabs } = await supabase.from("hr_pt_slabs").select("*");

    // 2. Load active employees — include per-employee statutory flags + custom split
    let empQ: any = supabase.from("hr_employees")
      .select("id, first_name, last_name, badge_id, work_state, is_active, hr_filing_status_id, joining_date, pf_enabled, esi_enabled, pt_enabled, custom_structure_pct")
      .eq("is_active", true);
    if (employeeIds?.length) empQ = empQ.in("id", employeeIds);
    const { data: employees, error: empErr } = await empQ;
    if (empErr) throw empErr;

    // 3. Compute input readiness — this is what makes downstream drift trustworthy.
    const monthEndProbe = new Date(period);
    monthEndProbe.setUTCMonth(monthEndProbe.getUTCMonth() + 1);
    monthEndProbe.setUTCDate(0);
    const monthEndStr = monthEndProbe.toISOString().slice(0, 10);
    const activeCount = employees?.length ?? 0;

    // Attendance coverage — distinct employees with any daily row in the month
    let attendanceCoveragePct = 0;
    if (activeCount > 0) {
      const { data: attEmps } = await supabase
        .from("hr_attendance_daily")
        .select("hr_employee_id")
        .gte("attendance_date", periodStr)
        .lte("attendance_date", monthEndStr)
        .in("hr_employee_id", employees!.map((e: any) => e.id));
      const distinct = new Set((attEmps ?? []).map((r: any) => r.hr_employee_id));
      attendanceCoveragePct = Math.round((distinct.size / activeCount) * 100);
    }

    // Register imported — any Razorpay payslip records for this period
    const { data: regRows, count: regCount } = await supabase
      .from("hr_razorpay_payslip_records")
      .select("hr_employee_id", { count: "exact", head: false })
      .eq("period_month", periodStr);
    const registerEmployeeCount = new Set((regRows ?? []).map((r: any) => r.hr_employee_id)).size;
    const registerImported = (regCount ?? 0) > 0;

    // Payroll inputs staged (approved additions + deductions for the period)
    const [{ count: addCount }, { count: dedCount }] = await Promise.all([
      supabase.from("hr_payroll_input_additions").select("id", { count: "exact", head: true })
        .eq("period_month", periodStr).eq("status", "approved"),
      supabase.from("hr_payroll_input_deductions").select("id", { count: "exact", head: true })
        .eq("period_month", periodStr).eq("status", "approved"),
    ]);
    const inputsStagedCount = (addCount ?? 0) + (dedCount ?? 0);

    // Enrollment resolved — PF/ESI/PT all non-null on the employee
    const enrollmentResolvedCount = (employees ?? []).filter(
      (e: any) => e.pf_enabled !== null && e.esi_enabled !== null && e.pt_enabled !== null,
    ).length;
    const enrollmentResolvedPct = activeCount > 0
      ? Math.round((enrollmentResolvedCount / activeCount) * 100)
      : 0;

    // Readiness tier — attendance OR register must exist, else unusable
    let readinessTier: "trustworthy" | "approximate" | "unusable" = "unusable";
    if (attendanceCoveragePct >= 90 && registerImported && enrollmentResolvedPct >= 80) {
      readinessTier = "trustworthy";
    } else if (attendanceCoveragePct >= 50 || registerImported) {
      readinessTier = "approximate";
    }

    const inputCompleteness = {
      active_employees: activeCount,
      attendance_coverage_pct: attendanceCoveragePct,
      register_imported: registerImported,
      register_employee_count: registerEmployeeCount,
      inputs_staged_count: inputsStagedCount,
      enrollment_resolved_pct: enrollmentResolvedPct,
      computed_at: new Date().toISOString(),
    };

    if (readinessTier === "unusable" && !body.force) {
      return new Response(JSON.stringify({
        error: "insufficient_inputs",
        message: "Neither attendance nor a payroll register is available for this period. Import one of them before running a shadow calculation.",
        input_completeness: inputCompleteness,
      }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Create run
    const { data: existingRun } = await supabase
      .from("hr_shadow_payroll_runs")
      .select("*")
      .eq("period_month", periodStr)
      .order("run_no", { ascending: false })
      .limit(1);
    const runNo = (existingRun?.[0]?.run_no ?? 0) + 1;

    const { data: newRun, error: runErr } = await supabase
      .from("hr_shadow_payroll_runs")
      .insert({
        period_month: periodStr,
        run_no: runNo,
        status: "computed",
        computed_at: new Date().toISOString(),
        total_employees: activeCount,
        input_completeness: inputCompleteness,
        readiness_tier: readinessTier,
      })
      .select()
      .single();
    if (runErr) throw runErr;


    const defaultComps = settings?.default_structure_components ?? [];
    const useDefault = settings?.use_xpayroll_default_structure ?? true;
    let totalGross = 0, totalNet = 0;

    for (const emp of employees ?? []) {
      // Salary snapshot
      const { data: salaryAssignArr } = await supabase
        .from("hr_employee_salary_structure_assignments")
        .select("*")
        .eq("hr_employee_id", emp.id)
        .lte("effective_from", periodStr)
        .order("effective_from", { ascending: false })
        .limit(1);
      const monthlyGross = Number(salaryAssignArr?.[0]?.monthly_ctc ?? 0);
      if (monthlyGross <= 0) continue;

      // Resolve structure %
      const pct = resolveStructurePct(emp.custom_structure_pct, defaultComps, useDefault);
      const preBasic = Math.round(monthlyGross * (pct.basic / 100));
      const preHra = Math.round(monthlyGross * (pct.hra / 100));
      const preLta = Math.round(monthlyGross * (pct.lta / 100));
      // Special = residual so 4 components == monthlyGross
      const preSpecial = monthlyGross - preBasic - preHra - preLta;
      const regularBase = preBasic + preHra + preSpecial + preLta; // == monthlyGross

      // LOP from v4 attendance daily rollup
      const monthEnd = new Date(period);
      monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
      monthEnd.setUTCDate(0);
      const { data: attRows } = await supabase
        .from("hr_attendance_daily")
        .select("attendance_status, lop_days")
        .eq("hr_employee_id", emp.id)
        .gte("attendance_date", periodStr)
        .lte("attendance_date", monthEnd.toISOString().slice(0, 10));
      const lopDays = (attRows ?? []).reduce((s: number, r: any) => s + Number(r.lop_days ?? 0), 0);
      const totalDays = monthEnd.getUTCDate();
      // Razorpay uses calendar-day divisor (verified Priya Jun-26 LOP 3 350 = 3 days × 33 500 / 30)
      const lopAmount = totalDays > 0 ? Math.round(regularBase * (lopDays / totalDays)) : 0;

      // KPI-Loss / other gross-side recoveries (approved deductions this period)
      const { data: deds } = await supabase
        .from("hr_payroll_input_deductions")
        .select("amount, category")
        .eq("hr_employee_id", emp.id)
        .eq("period_month", periodStr)
        .eq("status", "approved");
      const kpiLossAmount = (deds ?? [])
        .filter((r: any) => (r.category ?? "").toUpperCase() === "KPI_LOSS")
        .reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

      // Per-component LOP + KPI shrink
      const totalReduction = lopAmount + kpiLossAmount;
      const factor = regularBase > 0 ? Math.max(0, 1 - totalReduction / regularBase) : 1;
      const basic = Math.round(preBasic * factor);
      const hra = Math.round(preHra * factor);
      const lta = Math.round(preLta * factor);
      const targetPost = Math.round(regularBase * factor);
      const special = targetPost - basic - hra - lta;
      const regularPost = basic + hra + special + lta;

      // Additions this period (OT / Perf Bonus / PLI) — NOT LOP-shrunk
      const { data: adds } = await supabase
        .from("hr_payroll_input_additions")
        .select("amount")
        .eq("hr_employee_id", emp.id)
        .eq("period_month", periodStr)
        .eq("status", "approved");
      const additions = (adds ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

      // Per-employee statutory enrollment (falls back to global compliance toggle)
      const pfEnrolled = emp.pf_enabled ?? settings?.compliance_files_pf ?? false;
      const esiEnrolled = emp.esi_enabled ?? settings?.compliance_files_esi ?? false;
      const ptEnrolled = emp.pt_enabled ?? settings?.compliance_files_pt ?? false;

      // Statutory — PF on shrunk basic, ESI on shrunk regular gross, PT on shrunk gross
      const epf = computeEpf(basic, 0, settings, pfEnrolled);
      const esi = computeEsi(regularPost + additions, regularPost, settings, esiEnrolled);
      const pt = computePt(regularPost, emp.work_state ?? "", ptSlabs ?? [], ptEnrolled, period);

      // TDS via projected annual
      const { data: fsArr } = emp.hr_filing_status_id
        ? await supabase.from("hr_filing_statuses").select("*").eq("id", emp.hr_filing_status_id).limit(1)
        : { data: [] };
      const regime = fsArr?.[0]?.regime ?? "new";
      const fyStart = new Date(period.getUTCFullYear(), period.getUTCMonth() >= 3 ? 3 : -9, 1);
      const monthsRemaining = 12 - Math.max(0, (period.getUTCFullYear() * 12 + period.getUTCMonth()) - (fyStart.getFullYear() * 12 + fyStart.getMonth()));
      const projectedAnnualTaxable = (regularPost - epf.employee - pt) * 12;
      const { data: ytdTds } = await supabase
        .from("hr_razorpay_payslip_records")
        .select("tds_amount")
        .eq("hr_employee_id", emp.id)
        .gte("period_month", fyStart.toISOString().slice(0, 10))
        .lt("period_month", periodStr);
      const ytdTdsPaid = (ytdTds ?? []).reduce((s: number, r: any) => s + Number(r.tds_amount ?? 0), 0);
      const annualTax = projectAnnualTax(projectedAnnualTaxable, regime);
      const tds = monthsRemaining > 0 ? Math.round(Math.max(0, annualTax - ytdTdsPaid) / monthsRemaining) : 0;

      // Totals — earnings side includes employer PF (RazorpayX prints it on the earnings column)
      const earningsTotal = regularPost + additions + epf.employer_earnings_side;
      const deductions = epf.employee + epf.employer + epf.admin_edli + esi.employee + pt + tds;
      const net = earningsTotal - deductions;

      // Razorpay comparison snapshot (if imported)
      const { data: rzArr } = await supabase
        .from("hr_razorpay_payslip_records")
        .select("gross_amount, net_pay, pf_amount, esi_amount, professional_tax, tds_amount")
        .eq("hr_employee_id", emp.id)
        .eq("period_month", periodStr)
        .limit(1);
      const rz = rzArr?.[0];

      const { data: line, error: lineErr } = await supabase
        .from("hr_shadow_payroll_lines")
        .upsert({
          run_id: newRun.id,
          hr_employee_id: emp.id,
          period_month: periodStr,
          monthly_ctc: monthlyGross,
          monthly_gross: earningsTotal,
          earnings_total: earningsTotal,
          additions_total: additions,
          lop_days: lopDays,
          lop_amount: lopAmount,
          pf_employee: epf.employee,
          pf_employer: epf.employer,
          esi_employee: esi.employee,
          esi_employer: esi.employer,
          pt_amount: pt,
          tds_amount: tds,
          deductions_total: deductions,
          net_pay: net,
          razorpay_gross: rz?.gross_amount ?? null,
          razorpay_net: rz?.net_pay ?? null,
          razorpay_pf: rz?.pf_amount ?? null,
          razorpay_esi: rz?.esi_amount ?? null,
          razorpay_pt: rz?.professional_tax ?? null,
          razorpay_tds: rz?.tds_amount ?? null,
          compute_notes: {
            regime, monthsRemaining, projectedAnnualTaxable, ytdTdsPaid, annualTax,
            pct, factor, kpiLossAmount, pfEnrolled, esiEnrolled, ptEnrolled,
          },
        }, { onConflict: "run_id,hr_employee_id" })
        .select()
        .single();
      if (lineErr) { console.error("line err", emp.id, lineErr); continue; }

      // Component breakdown — mirrors Razorpay payslip layout
      const comps = [
        { key: "basic", label: "Basic", type: "earning", amount: basic },
        { key: "hra", label: "HRA", type: "earning", amount: hra },
        { key: "special_allowance", label: "Special Allowance", type: "earning", amount: special },
        { key: "lta", label: "LTA", type: "earning", amount: lta },
        { key: "pf_employer_earnings", label: "Employer PF (Earnings)", type: "earning", amount: epf.employer_earnings_side },
        { key: "esi_employer_earnings", label: "Employer ESI (Earnings)", type: "earning", amount: esi.employer },
        { key: "additions", label: "Additions (OT / PLI / Bonus)", type: "earning", amount: additions },
        { key: "lop", label: "Loss of Pay (informational)", type: "info_deduction", amount: lopAmount },
        { key: "kpi_loss", label: "KPI Loss (informational)", type: "info_deduction", amount: kpiLossAmount },
        { key: "pf_employee", label: "PF (Employee)", type: "deduction", amount: epf.employee },
        { key: "pf_employer_contra", label: "PF (Employer contra)", type: "deduction", amount: epf.employer },
        { key: "pf_admin_edli", label: "EDLI + Admin (1%)", type: "deduction", amount: epf.admin_edli },
        { key: "esi_employee", label: "ESI (Employee)", type: "deduction", amount: esi.employee },
        { key: "esi_employer_contra", label: "ESI (Employer contra)", type: "deduction", amount: esi.employer },
        { key: "pt", label: "Professional Tax", type: "deduction", amount: pt },
        { key: "tds", label: "TDS", type: "deduction", amount: tds },
      ].filter((c) => c.amount !== 0);
      await supabase.from("hr_shadow_component_breakdown").delete().eq("line_id", line.id);
      await supabase.from("hr_shadow_component_breakdown").insert(comps.map((c) => ({
        line_id: line.id,
        component_key: c.key,
        component_label: c.label,
        component_type: c.type,
        amount: c.amount,
      })));

      totalGross += earningsTotal;
      totalNet += net;
    }

    await supabase.from("hr_shadow_payroll_runs").update({
      total_shadow_gross: totalGross,
      total_shadow_net: totalNet,
    }).eq("id", newRun.id);

    return new Response(JSON.stringify({
      run_id: newRun.id,
      period_month: periodStr,
      run_no: runNo,
      computed_count: employees?.length ?? 0,
      total_gross: totalGross,
      total_net: totalNet,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("compute-shadow-payroll error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
