/**
 * Compute Shadow Payroll — the local "second opinion" engine.
 *
 * Doctrine: RazorpayX is authoritative. This engine writes into a fully
 * isolated `hr_shadow_*` namespace so its output CAN NEVER leak into any
 * payout-facing surface. It exists to let HR A/B our computation against
 * Razorpay's for 2-3 months and catch drift on either side.
 *
 * Trigger: POST { period_month: "YYYY-MM-01", employee_ids?: string[] }
 * Response: { run_id, computed_count }
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
function computeEpf(basic: number, da: number, s: any) {
  if (!s?.compliance_files_pf) return { employee: 0, employer: 0, admin_edli: 0, base: 0 };
  const base = pfWageBase(basic, da, s);
  const employee = Math.round(base * 0.12);
  const employer = Math.round(base * 0.12);
  const admin_edli = s.pf_include_admin_edli_in_ctc ? Math.max(500, Math.round(base * 0.005)) : 0;
  return { employee, employer, admin_edli, base };
}
function computeEsi(fullGross: number, regularGross: number, s: any) {
  if (!s?.compliance_files_esi || regularGross > 21000) return { employee: 0, employer: 0, base: 0 };
  const base = s.esi_include_additions_in_wages ? fullGross : regularGross;
  return {
    employee: Math.round(base * 0.0075),
    employer: Math.round(base * 0.0325),
    base,
  };
}
function computePt(base: number, stateCode: string, slabs: any[], s: any, periodMonth: Date): number {
  if (!s?.compliance_files_pt || !slabs?.length || !stateCode) return 0;
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
function splitStructure(monthlyGross: number, components: any[]): Record<string, { label: string; amount: number }> {
  const out: Record<string, { label: string; amount: number }> = {};
  if (!components?.length || !monthlyGross) return out;
  let remaining = monthlyGross;
  const pct: any[] = [];
  for (const c of components) {
    if (c.mode === "fixed") {
      const amt = Math.min(c.value, remaining);
      out[c.key] = { label: c.label, amount: amt };
      remaining -= amt;
    } else pct.push(c);
  }
  for (const c of pct) {
    out[c.key] = { label: c.label, amount: Math.round(monthlyGross * (c.value / 100)) };
  }
  const special = out["special_allowance"];
  if (special) {
    const sum = Object.values(out).reduce((s: number, v: any) => s + v.amount, 0);
    special.amount += monthlyGross - sum;
  }
  return out;
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

    // 2. Load active employees
    let empQ: any = supabase.from("hr_employees")
      .select("id, first_name, last_name, badge_id, work_state, is_active, hr_filing_status_id, joining_date")
      .eq("is_active", true);
    if (employeeIds?.length) empQ = empQ.in("id", employeeIds);
    const { data: employees, error: empErr } = await empQ;
    if (empErr) throw empErr;

    // 3. Create/upsert run
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
        total_employees: employees?.length ?? 0,
      })
      .select()
      .single();
    if (runErr) throw runErr;

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

      // Structure split from mirror
      const components = settings?.default_structure_components ?? [];
      const useDefault = settings?.use_xpayroll_default_structure ?? true;
      const split = useDefault ? splitStructure(monthlyGross, components) : {};
      const basic = split["basic"]?.amount ?? Math.round(monthlyGross * 0.5);
      const hra = split["hra"]?.amount ?? Math.round(monthlyGross * 0.25);
      const special = split["special_allowance"]?.amount ?? 0;
      const lta = split["lta"]?.amount ?? 0;

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
      const lopAmount = totalDays > 0 ? Math.round(monthlyGross * (lopDays / totalDays)) : 0;

      // Additions this period
      const { data: adds } = await supabase
        .from("hr_payroll_input_additions")
        .select("amount")
        .eq("hr_employee_id", emp.id)
        .eq("period_month", periodStr)
        .eq("status", "approved");
      const additions = (adds ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

      // Statutory
      const epf = computeEpf(basic, 0, settings);
      const esi = computeEsi(monthlyGross + additions, monthlyGross, settings);
      const pt = computePt(monthlyGross - lopAmount, emp.work_state ?? "", ptSlabs ?? [], settings, period);

      // TDS via projected annual
      const { data: fsArr } = emp.hr_filing_status_id
        ? await supabase.from("hr_filing_statuses").select("*").eq("id", emp.hr_filing_status_id).limit(1)
        : { data: [] };
      const regime = fsArr?.[0]?.regime ?? "new";
      const fyStart = new Date(period.getUTCFullYear(), period.getUTCMonth() >= 3 ? 3 : -9, 1);
      const monthsRemaining = 12 - Math.max(0, (period.getUTCFullYear() * 12 + period.getUTCMonth()) - (fyStart.getFullYear() * 12 + fyStart.getMonth()));
      const projectedAnnualTaxable = (monthlyGross - epf.employee - pt) * 12;
      const { data: ytdTds } = await supabase
        .from("hr_razorpay_payslip_records")
        .select("tds_amount")
        .eq("hr_employee_id", emp.id)
        .gte("period_month", fyStart.toISOString().slice(0, 10))
        .lt("period_month", periodStr);
      const ytdTdsPaid = (ytdTds ?? []).reduce((s: number, r: any) => s + Number(r.tds_amount ?? 0), 0);
      const annualTax = projectAnnualTax(projectedAnnualTaxable, regime);
      const tds = monthsRemaining > 0 ? Math.round(Math.max(0, annualTax - ytdTdsPaid) / monthsRemaining) : 0;

      // Totals
      const grossEffective = monthlyGross + additions - lopAmount;
      const deductions = epf.employee + esi.employee + pt + tds;
      const net = grossEffective - deductions;

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
          monthly_gross: monthlyGross,
          earnings_total: monthlyGross,
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
          compute_notes: { regime, monthsRemaining, projectedAnnualTaxable, ytdTdsPaid, annualTax },
        }, { onConflict: "run_id,hr_employee_id" })
        .select()
        .single();
      if (lineErr) { console.error("line err", emp.id, lineErr); continue; }

      // Component breakdown
      const comps = [
        { key: "basic", label: "Basic", type: "earning", amount: basic },
        { key: "hra", label: "HRA", type: "earning", amount: hra },
        { key: "special_allowance", label: "Special Allowance", type: "earning", amount: special },
        { key: "lta", label: "LTA", type: "earning", amount: lta },
        { key: "additions", label: "Additions (approved)", type: "earning", amount: additions },
        { key: "lop", label: "Loss of Pay", type: "deduction", amount: lopAmount },
        { key: "pf_employee", label: "PF (Employee)", type: "deduction", amount: epf.employee },
        { key: "esi_employee", label: "ESI (Employee)", type: "deduction", amount: esi.employee },
        { key: "pt", label: "Professional Tax", type: "deduction", amount: pt },
        { key: "tds", label: "TDS", type: "deduction", amount: tds },
        { key: "pf_employer", label: "PF (Employer)", type: "employer_contribution", amount: epf.employer },
        { key: "pf_admin_edli", label: "PF Admin + EDLI", type: "employer_contribution", amount: epf.admin_edli },
        { key: "esi_employer", label: "ESI (Employer)", type: "employer_contribution", amount: esi.employer },
      ];
      await supabase.from("hr_shadow_component_breakdown").delete().eq("line_id", line.id);
      await supabase.from("hr_shadow_component_breakdown").insert(comps.map((c) => ({
        line_id: line.id,
        component_key: c.key,
        component_label: c.label,
        component_type: c.type,
        amount: c.amount,
      })));

      totalGross += grossEffective;
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
