/**
 * Compute Shadow Payroll — the local "second opinion" engine.
 *
 * Doctrine: RazorpayX is authoritative. This engine writes into a fully
 * isolated `hr_shadow_*` namespace so its output CAN NEVER leak into any
 * payout-facing surface. It exists to let HR A/B our computation against
 * Razorpay's for 2–3 months and catch drift on either side.
 *
 * Trigger: POST { period_month: "YYYY-MM-01", employee_ids?: string[], force?: boolean }
 * Response: { run_id, computed_count, skipped_count, ... }
 *
 * 2026-07-19 hardening (P0/P1/P2, per Claude audit review):
 *  - Fixed schema mismatches that silently zeroed every employee's line:
 *      * hr_attendance_daily      : hr_employee_id → employee_id,
 *                                   attendance_status → status,
 *                                   lop_days derived from status (no such column exists).
 *      * hr_employee_salary_structure_assignments : hr_employee_id → employee_id.
 *      * hr_employees.filing_status_id (was hr_filing_status_id).
 *      * hr_employees.state           (was work_state — no such column).
 *      * hr_payroll_input_additions/deductions : dropped .eq('status','approved')
 *        (column does not exist); KPI-Loss now matched on label (no category col).
 *  - Every select in the per-employee loop now checks `.error` and pushes into
 *    `skipped_lines` instead of silently continuing.
 *  - TDS math refreshed to FY26-27 (₹75k standard deduction, rebate ₹12L on new
 *    regime, ₹5L on old) and is annualised on the PRE-LOP regular base to avoid
 *    monthly LOP artificially pulling the projection down.
 *  - TDS is written to shadow lines but the run defaults `include_tds_in_drift=false`
 *    so drift alerts don't churn on the still-simplified projection.
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
  const admin_edli = Math.round(base * 0.01);
  const employer_earnings_side = employer + admin_edli;
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

// FY26-27 TDS projection (owner directive):
//  - Standard deduction ₹75 000 (both regimes)
//  - New regime rebate u/s 87A: tax = 0 if taxable ≤ ₹12 00 000
//  - Old regime rebate: tax = 0 if taxable ≤ ₹5 00 000
//  - Cess 4% on tax
//  - Slabs updated for FY26-27 new regime; old regime unchanged.
function projectAnnualTax(annualGrossPreLop: number, regime: string): number {
  if (annualGrossPreLop <= 0) return 0;
  const stdDeduction = 75000;
  const taxable = Math.max(0, annualGrossPreLop - stdDeduction);
  const slabs = regime === "old"
    ? [[250000, 0], [500000, 0.05], [1000000, 0.20], [Infinity, 0.30]]
    : [[400000, 0], [800000, 0.05], [1200000, 0.10], [1600000, 0.15], [2000000, 0.20], [2400000, 0.25], [Infinity, 0.30]];
  let tax = 0, prev = 0;
  for (const [ceiling, rate] of slabs as [number, number][]) {
    if (taxable > ceiling) { tax += (ceiling - prev) * rate; prev = ceiling; }
    else { tax += (taxable - prev) * rate; break; }
  }
  if (regime === "new" && taxable <= 1200000) tax = 0;
  if (regime === "old" && taxable <= 500000) tax = 0;
  tax *= 1.04;
  return Math.max(0, tax);
}

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

    // 1. Compliance mirror + PT slabs
    const { data: settingsArr, error: settingsErr } = await supabase
      .from("hr_razorpay_settings").select("*").eq("is_singleton", true).limit(1);
    if (settingsErr) throw settingsErr;
    const settings = settingsArr?.[0];
    const { data: ptSlabs, error: ptErr } = await supabase.from("hr_pt_slabs").select("*");
    if (ptErr) throw ptErr;

    // 2. Active employees + per-employee statutory flags + custom split + provenance
    let empQ: any = supabase.from("hr_employees")
      .select("id, first_name, last_name, badge_id, state, is_active, filing_status_id, pf_enabled, esi_enabled, pt_enabled, custom_structure_pct, statutory_flags_source")
      .eq("is_active", true);
    if (employeeIds?.length) empQ = empQ.in("id", employeeIds);
    const { data: employees, error: empErr } = await empQ;
    if (empErr) throw empErr;

    // 3. Input readiness
    const monthEnd = new Date(period);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    monthEnd.setUTCDate(0);
    const monthEndStr = monthEnd.toISOString().slice(0, 10);
    const totalDays = monthEnd.getUTCDate();
    const activeCount = employees?.length ?? 0;

    let attendanceCoveragePct = 0;
    if (activeCount > 0) {
      const { data: attEmps, error: attErr } = await supabase
        .from("hr_attendance_daily")
        .select("employee_id")
        .gte("attendance_date", periodStr)
        .lte("attendance_date", monthEndStr)
        .in("employee_id", employees!.map((e: any) => e.id));
      if (attErr) console.error("readiness attendance err", attErr);
      const distinct = new Set((attEmps ?? []).map((r: any) => r.employee_id));
      attendanceCoveragePct = Math.round((distinct.size / activeCount) * 100);
    }

    const { data: regRows, count: regCount, error: regErr } = await supabase
      .from("hr_razorpay_payslip_records")
      .select("hr_employee_id", { count: "exact", head: false })
      .eq("period_month", periodStr);
    if (regErr) console.error("readiness register err", regErr);
    const registerEmployeeCount = new Set((regRows ?? []).map((r: any) => r.hr_employee_id)).size;
    const registerImported = (regCount ?? 0) > 0;

    const [{ count: addCount }, { count: dedCount }] = await Promise.all([
      supabase.from("hr_payroll_input_additions").select("id", { count: "exact", head: true })
        .eq("period_month", periodStr),
      supabase.from("hr_payroll_input_deductions").select("id", { count: "exact", head: true })
        .eq("period_month", periodStr),
    ]);
    const inputsStagedCount = (addCount ?? 0) + (dedCount ?? 0);

    const enrollmentResolvedCount = (employees ?? []).filter(
      (e: any) => e.pf_enabled !== null && e.esi_enabled !== null && e.pt_enabled !== null,
    ).length;
    const enrollmentResolvedPct = activeCount > 0
      ? Math.round((enrollmentResolvedCount / activeCount) * 100) : 0;

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
        include_tds_in_drift: false,
        skipped_lines: [],
      })
      .select()
      .single();
    if (runErr) throw runErr;

    const defaultComps = settings?.default_structure_components ?? [];
    const useDefault = settings?.use_xpayroll_default_structure ?? true;
    const skipped: Array<{ employee_id: string; name?: string; reason: string; detail?: string }> = [];
    let totalGross = 0, totalNet = 0, computedCount = 0;

    // Batch-compute LOP for every active employee via the shared SQL function
    // (single source of truth — same function feeds the razorpay-payroll-proxy attendance push).
    const lopByEmp = new Map<string, { lop_days: number; working_days: number; formula: string; config_errors: string[] }>();
    if (employees && employees.length) {
      const { data: lopRows, error: lopErr } = await (supabase as any).rpc("hr_compute_lop_days", {
        p_employee_ids: employees.map((e: any) => e.id),
        p_period_month: periodStr,
      });
      if (lopErr) {
        console.error("hr_compute_lop_days failed", lopErr);
      } else {
        for (const r of (lopRows ?? []) as any[]) {
          lopByEmp.set(r.employee_id, {
            lop_days: Number(r.lop_days ?? 0),
            working_days: Number(r.working_days ?? 0),
            formula: String(r.formula ?? ""),
            config_errors: Array.isArray(r.config_errors) ? r.config_errors : [],
          });
        }
      }
    }


    for (const emp of employees ?? []) {
      const empName = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim();

      // Salary snapshot — schema-correct column name.
      const { data: salaryAssignArr, error: saErr } = await supabase
        .from("hr_employee_salary_structure_assignments")
        .select("*")
        .eq("employee_id", emp.id)
        .lte("effective_from", periodStr)
        .order("effective_from", { ascending: false })
        .limit(1);
      if (saErr) {
        skipped.push({ employee_id: emp.id, name: empName, reason: "fetch_error", detail: `salary_assignment: ${saErr.message}` });
        continue;
      }
      if (!salaryAssignArr?.length) {
        skipped.push({ employee_id: emp.id, name: empName, reason: "no_salary_assignment" });
        continue;
      }
      const monthlyGross = Number(salaryAssignArr[0]?.monthly_ctc ?? 0);
      if (monthlyGross <= 0) {
        skipped.push({ employee_id: emp.id, name: empName, reason: "zero_ctc" });
        continue;
      }

      const pct = resolveStructurePct(emp.custom_structure_pct, defaultComps, useDefault);
      const preBasic = Math.round(monthlyGross * (pct.basic / 100));
      const preHra = Math.round(monthlyGross * (pct.hra / 100));
      const preLta = Math.round(monthlyGross * (pct.lta / 100));
      const preSpecial = monthlyGross - preBasic - preHra - preLta;
      const regularBase = preBasic + preHra + preSpecial + preLta;

      // LOP — from the shared hr_compute_lop_days SQL function (single source of truth).
      // Uses Razorpay-parity formula: LOP = working_days − (present + paid_leave + incomplete_held).
      // Incomplete-punch days are held harmless (0 LOP) until an approved regularization exists.
      const lop = lopByEmp.get(emp.id);
      if (lop?.config_errors?.length) {
        skipped.push({ employee_id: emp.id, name: empName, reason: "leave_config_error", detail: lop.config_errors.join(" ") });
        continue;
      }
      const lopDays = Number(lop?.lop_days ?? 0);
      const lopDivisor = Number(lop?.working_days ?? 0) > 0 ? Number(lop!.working_days) : totalDays;
      const lopAmount = lopDivisor > 0 ? Math.round(regularBase * (lopDays / lopDivisor)) : 0;


      // KPI-Loss / other gross-side recoveries — matched on label since the
      // hr_payroll_input_deductions table has no category column.
      const { data: deds, error: dedsErr } = await supabase
        .from("hr_payroll_input_deductions")
        .select("amount, label")
        .eq("hr_employee_id", emp.id)
        .eq("period_month", periodStr);
      if (dedsErr) {
        skipped.push({ employee_id: emp.id, name: empName, reason: "fetch_error", detail: `deductions: ${dedsErr.message}` });
        continue;
      }
      const kpiLossAmount = (deds ?? [])
        .filter((r: any) => /kpi/i.test(String(r.label ?? "")))
        .reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

      const totalReduction = lopAmount + kpiLossAmount;
      const factor = regularBase > 0 ? Math.max(0, 1 - totalReduction / regularBase) : 1;
      const basic = Math.round(preBasic * factor);
      const hra = Math.round(preHra * factor);
      const lta = Math.round(preLta * factor);
      const targetPost = Math.round(regularBase * factor);
      const special = targetPost - basic - hra - lta;
      const regularPost = basic + hra + special + lta;

      const { data: adds, error: addsErr } = await supabase
        .from("hr_payroll_input_additions")
        .select("amount")
        .eq("hr_employee_id", emp.id)
        .eq("period_month", periodStr);
      if (addsErr) {
        skipped.push({ employee_id: emp.id, name: empName, reason: "fetch_error", detail: `additions: ${addsErr.message}` });
        continue;
      }
      const additions = (adds ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

      // Per-employee statutory enrollment (falls back to global compliance toggle)
      const pfEnrolled = emp.pf_enabled ?? settings?.compliance_files_pf ?? false;
      const esiEnrolled = emp.esi_enabled ?? settings?.compliance_files_esi ?? false;
      const ptEnrolled = emp.pt_enabled ?? settings?.compliance_files_pt ?? false;
      const flagsSource = emp.statutory_flags_source
        ?? ((emp.pf_enabled === null && emp.esi_enabled === null && emp.pt_enabled === null)
            ? "assumed_from_global" : "assumed_from_global");

      const epf = computeEpf(basic, 0, settings, pfEnrolled);
      const esi = computeEsi(regularPost + additions, regularPost, settings, esiEnrolled);
      const pt = computePt(regularPost, emp.state ?? "", ptSlabs ?? [], ptEnrolled, period);

      // TDS — projected on PRE-LOP annual base (owner directive P2).
      let regime = "new";
      if (emp.filing_status_id) {
        const { data: fsArr } = await supabase.from("hr_filing_statuses")
          .select("regime").eq("id", emp.filing_status_id).limit(1);
        regime = fsArr?.[0]?.regime ?? "new";
      }
      const fyStart = new Date(Date.UTC(
        period.getUTCFullYear() - (period.getUTCMonth() < 3 ? 1 : 0),
        3, 1,
      ));
      const monthsRemaining = Math.max(1, 12 - (
        (period.getUTCFullYear() * 12 + period.getUTCMonth())
        - (fyStart.getUTCFullYear() * 12 + fyStart.getUTCMonth())
      ));
      const annualBasePreLop = regularBase * 12;
      const { data: ytdTds } = await supabase
        .from("hr_razorpay_payslip_records")
        .select("tds_amount")
        .eq("hr_employee_id", emp.id)
        .gte("period_month", fyStart.toISOString().slice(0, 10))
        .lt("period_month", periodStr);
      const ytdTdsPaid = (ytdTds ?? []).reduce((s: number, r: any) => s + Number(r.tds_amount ?? 0), 0);
      const annualTax = projectAnnualTax(annualBasePreLop, regime);
      const tds = monthsRemaining > 0 ? Math.round(Math.max(0, annualTax - ytdTdsPaid) / monthsRemaining) : 0;

      const earningsTotal = regularPost + additions + epf.employer_earnings_side;
      const deductions = epf.employee + epf.employer + epf.admin_edli + esi.employee + pt + tds;
      const net = earningsTotal - deductions;

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
            regime, monthsRemaining, annualBasePreLop, ytdTdsPaid, annualTax,
            pct, factor, kpiLossAmount, pfEnrolled, esiEnrolled, ptEnrolled,
            statutory_flags_source: flagsSource,
            tds_fy: "FY26-27",
          },
        }, { onConflict: "run_id,hr_employee_id" })
        .select()
        .single();
      if (lineErr) {
        skipped.push({ employee_id: emp.id, name: empName, reason: "fetch_error", detail: `line_upsert: ${lineErr.message}` });
        continue;
      }

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
      computedCount += 1;
    }

    await supabase.from("hr_shadow_payroll_runs").update({
      total_shadow_gross: totalGross,
      total_shadow_net: totalNet,
      skipped_lines: skipped,
    }).eq("id", newRun.id);

    return new Response(JSON.stringify({
      run_id: newRun.id,
      period_month: periodStr,
      run_no: runNo,
      computed_count: computedCount,
      skipped_count: skipped.length,
      skipped_lines: skipped,
      total_gross: totalGross,
      total_net: totalNet,
      input_completeness: inputCompleteness,
      readiness_tier: readinessTier,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("compute-shadow-payroll error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
