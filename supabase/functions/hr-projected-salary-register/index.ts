/**
 * Projected Salary Register — READ-ONLY pilot report.
 *
 * Mirrors the RazorpayX "Salary Register" layout, but every figure is INFERRED
 * from HRMS data (roster, salary base ladder, attendance/LOP, staged payroll
 * inputs, statutory profiles) so HR can tally mid-month against RazorpayX
 * BEFORE the month is processed and the real register exists.
 *
 * HARD CONSTRAINT: this function performs ZERO writes. No inserts, no updates,
 * no upserts, no deletes, no RPCs that mutate. It only selects and computes.
 * The math is a faithful mirror of compute-shadow-payroll (CTC-inclusive
 * doctrine), minus all persistence.
 *
 * POST { period_month: "YYYY-MM-01" }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveMonthlyGross, SALARY_BASE_LABELS } from "../_shared/salaryBase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function pfWageBase(basic: number, da: number, s: any, basisOverride?: string): number {
  const raw = s?.pf_wages_basic_only === false ? (basic || 0) + (da || 0) : (basic || 0);
  if (basisOverride === "actual") return raw;
  if (basisOverride === "capped") return Math.min(raw, 15000);
  if (!s) return Math.min(raw, 15000);
  return s.pf_wage_cap_15000 ? Math.min(raw, 15000) : raw;
}
function computeEpf(basic: number, da: number, s: any, enrolled: boolean, opts?: { basis?: string; vpfMode?: string; vpfValue?: number }) {
  if (!enrolled) return { employee: 0, employer: 0, admin_edli: 0, employer_earnings_side: 0, base: 0, vpf: 0 };
  const base = pfWageBase(basic, da, s, opts?.basis);
  const employee = Math.round(base * 0.12);
  const employer = Math.round(base * 0.12);
  const admin_edli = Math.round(base * 0.01);
  let vpf = 0;
  if (opts?.vpfMode === "percent") vpf = Math.round(base * (Number(opts.vpfValue || 0) / 100));
  else if (opts?.vpfMode === "fixed") vpf = Math.round(Number(opts.vpfValue || 0));
  return { employee, employer, admin_edli, employer_earnings_side: employer + admin_edli, base, vpf: Math.max(0, vpf) };
}
function computeEsi(fullGross: number, regularGross: number, s: any, enrolled: boolean) {
  if (!enrolled || regularGross > 21000) return { employee: 0, employer: 0, base: 0 };
  const base = s?.esi_include_additions_in_wages ? fullGross : regularGross;
  return { employee: Math.round(base * 0.0075), employer: Math.round(base * 0.0325), base };
}
function computePt(base: number, stateCode: string, slabs: any[], enrolled: boolean, periodMonth: Date): number {
  if (!enrolled || !slabs?.length || !stateCode) return 0;
  const stateSlabs = slabs.filter((sl) => sl.state_code === stateCode);
  if (!stateSlabs.length) return 0;
  const match = stateSlabs.find((sl) => base >= sl.slab_min && (sl.slab_max === null || base <= sl.slab_max));
  if (!match) return 0;
  if (match.special_month && (periodMonth.getUTCMonth() + 1) === match.special_month && match.special_amount) return match.special_amount;
  return match.monthly_amount;
}
function projectAnnualTax(annualGrossPreLop: number, regime: string): number {
  if (annualGrossPreLop <= 0) return 0;
  const taxable = Math.max(0, annualGrossPreLop - 75000);
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
  return Math.max(0, tax * 1.04);
}
function resolveStructurePct(customPct: any, components: any[] | null, useDefault: boolean) {
  if (customPct && typeof customPct === "object") {
    return {
      basic: Number(customPct.basic ?? 50), hra: Number(customPct.hra ?? 25),
      special: Number(customPct.special ?? 15), lta: Number(customPct.lta ?? 10),
    };
  }
  if (useDefault && components?.length) {
    const pick = (k: string, fb: number) => {
      const c = components.find((x: any) => x.key === k && x.mode === "percentage");
      return c ? Number(c.value) : fb;
    };
    return { basic: pick("basic", 50), hra: pick("hra", 25), special: pick("special_allowance", 15), lta: pick("lta", 10) };
  }
  return { basic: 50, hra: 25, special: 15, lta: 10 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const periodStr: string = body.period_month;
    if (!periodStr || !/^\d{4}-\d{2}-\d{2}$/.test(periodStr)) return json({ error: "period_month (YYYY-MM-01) required" }, 400);

    const period = new Date(periodStr + "T00:00:00Z");
    const monthEnd = new Date(period);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    monthEnd.setUTCDate(0);
    const monthEndStr = monthEnd.toISOString().slice(0, 10);
    const totalDays = monthEnd.getUTCDate();

    const [
      { data: settingsArr }, { data: ptSlabs }, { data: employees, error: empErr },
      { data: workInfos }, { data: departments }, { data: positions }, { data: banks },
      { data: profRows }, { data: adds }, { data: deds }, { data: recoveries },
      { data: revisions }, { data: filingStatuses }, { data: actualRegister },
    ] = await Promise.all([
      supabase.from("hr_razorpay_settings").select("*").eq("is_singleton", true).limit(1),
      supabase.from("hr_pt_slabs").select("*"),
      supabase.from("hr_employees").select("id, badge_id, first_name, last_name, email, dob, gender, state, is_active, filing_status_id, pf_enabled, esi_enabled, pt_enabled, custom_structure_pct, statutory_flags_source, pan_number, uan_number, esi_number, resignation_date, last_working_day, total_salary").eq("is_active", true),
      supabase.from("hr_employee_work_info").select("employee_id, department_id, job_position_id, joining_date, location, employee_type"),
      supabase.from("departments").select("id, name"),
      supabase.from("positions").select("id, name"),
      supabase.from("hr_employee_bank_details").select("employee_id, account_number, ifsc_code"),
      supabase.from("hr_employee_statutory_profiles").select("hr_employee_id,effective_from,pf_enabled,pf_wage_basis,vpf_mode,vpf_value,esi_enabled,pt_enabled").lte("effective_from", periodStr).order("effective_from", { ascending: true }),
      supabase.from("hr_payroll_input_additions").select("hr_employee_id, amount, label, addition_type, pushed_at").eq("period_month", periodStr),
      supabase.from("hr_payroll_input_deductions").select("hr_employee_id, amount, label, pushed_at").eq("period_month", periodStr),
      supabase.from("hr_payroll_auto_recoveries").select("employee_id, amount, label, source_kind, status").eq("period_month", periodStr),
      supabase.from("hr_salary_revisions").select("employee_id, revision_type, one_time_amount, payout_month, pay_head_label, status, payout_channel").eq("payout_month", periodStr),
      supabase.from("hr_filing_statuses").select("id, regime"),
      supabase.from("hr_payslips_v").select("employee_id, gross, regular_gross, net, pf_amount, esi_amount, professional_tax, tds_amount").eq("period_month", periodStr),
    ]);
    if (empErr) throw empErr;

    const settings = settingsArr?.[0];
    const defaultComps = settings?.default_structure_components ?? [];
    const useDefault = settings?.use_xpayroll_default_structure ?? true;

    const wiByEmp = new Map<string, any>((workInfos ?? []).map((w: any) => [w.employee_id, w]));
    const deptById = new Map<string, string>((departments ?? []).map((d: any) => [d.id, d.name]));
    const posById = new Map<string, string>((positions ?? []).map((p: any) => [p.id, p.name]));
    const bankByEmp = new Map<string, any>((banks ?? []).map((b: any) => [b.employee_id, b]));
    const regimeById = new Map<string, string>((filingStatuses ?? []).map((f: any) => [f.id, f.regime]));
    const statProfiles = new Map<string, any>();
    for (const r of profRows ?? []) statProfiles.set((r as any).hr_employee_id, r);
    const actualByEmp = new Map<string, any>();
    for (const r of actualRegister ?? []) if ((r as any).employee_id) actualByEmp.set((r as any).employee_id, r);

    const groupSum = <T extends Record<string, any>>(rows: T[] | null, key: string, pred?: (r: T) => boolean) => {
      const m = new Map<string, number>();
      for (const r of rows ?? []) {
        if (pred && !pred(r)) continue;
        const k = r[key];
        if (!k) continue;
        m.set(k, (m.get(k) ?? 0) + Number(r.amount ?? 0));
      }
      return m;
    };
    const isOneTime = (r: any) => /one[-_ ]?time|bonus|payout|incentive|arrear|correction/i.test(String(r.addition_type ?? "") + " " + String(r.label ?? ""));
    const oneTimeAddByEmp = groupSum(adds as any[], "hr_employee_id", isOneTime);
    const regularAddByEmp = groupSum(adds as any[], "hr_employee_id", (r: any) => !isOneTime(r));
    const dedByEmp = groupSum(deds as any[], "hr_employee_id");
    const kpiLossByEmp = groupSum(deds as any[], "hr_employee_id", (r: any) => /kpi/i.test(String(r.label ?? "")));
    const emiByEmp = groupSum(recoveries as any[], "employee_id", (r: any) => r.source_kind === "loan" || /emi|loan/i.test(String(r.label ?? "")));
    const otherRecoveryByEmp = groupSum(recoveries as any[], "employee_id", (r: any) => !(r.source_kind === "loan" || /emi|loan/i.test(String(r.label ?? ""))));
    // One-time payouts staged through the salary-revision flow (visible for the
    // upcoming month before payroll runs — same behaviour as RazorpayX).
    const revisionPayoutByEmp = new Map<string, { amount: number; labels: string[] }>();
    for (const r of (revisions ?? []) as any[]) {
      if (!r.employee_id) continue;
      const amt = Number(r.one_time_amount ?? 0);
      if (!amt) continue;
      const cur = revisionPayoutByEmp.get(r.employee_id) ?? { amount: 0, labels: [] };
      cur.amount += amt;
      cur.labels.push(String(r.pay_head_label || r.revision_type || "One-time payment"));
      revisionPayoutByEmp.set(r.employee_id, cur);
    }

    // LOP via the shared read-only SQL function (single source of truth).
    const lopByEmp = new Map<string, any>();
    if (employees?.length) {
      const { data: lopRows, error: lopErr } = await (supabase as any).rpc("hr_compute_lop_days", {
        p_employee_ids: employees.map((e: any) => e.id),
        p_period_month: periodStr,
      });
      if (lopErr) console.error("hr_compute_lop_days", lopErr);
      for (const r of (lopRows ?? []) as any[]) lopByEmp.set(r.employee_id, r);
    }

    // Do-not-pay register (mirrored from RazorpayX) — unpaid months show zeroes.
    const doNotPay = new Set<string>();
    {
      const { data: dnp } = await supabase.from("hr_razorpay_payslip_records")
        .select("hr_employee_id, do_not_pay").eq("period_month", periodStr).eq("do_not_pay", true);
      for (const r of (dnp ?? []) as any[]) if (r.hr_employee_id) doNotPay.add(r.hr_employee_id);
    }

    // YTD TDS paid this FY (for the remaining-months projection).
    const fyStart = new Date(Date.UTC(period.getUTCFullYear() - (period.getUTCMonth() < 3 ? 1 : 0), 3, 1));
    const fyStartStr = fyStart.toISOString().slice(0, 10);
    const ytdTdsByEmp = new Map<string, number>();
    {
      const { data: ytd } = await supabase.from("hr_payslips_v")
        .select("employee_id, tds_amount").gte("period_month", fyStartStr).lt("period_month", periodStr);
      for (const r of (ytd ?? []) as any[]) {
        if (!r.employee_id) continue;
        ytdTdsByEmp.set(r.employee_id, (ytdTdsByEmp.get(r.employee_id) ?? 0) + Number(r.tds_amount ?? 0));
      }
    }
    const monthsRemaining = Math.max(1, 12 - ((period.getUTCFullYear() * 12 + period.getUTCMonth()) - (fyStart.getUTCFullYear() * 12 + fyStart.getUTCMonth())));

    const rows: any[] = [];
    const notes: Array<{ employee_id: string; name: string; note: string }> = [];

    for (const emp of (employees ?? []) as any[]) {
      const name = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim();
      const wi = wiByEmp.get(emp.id);
      const bank = bankByEmp.get(emp.id);
      const lop = lopByEmp.get(emp.id);
      const workingDays = Number(lop?.working_days ?? 0) > 0 ? Number(lop.working_days) : totalDays;
      const base = {
        employee_id: emp.id,
        emp_code: emp.badge_id ?? "",
        name,
        dob: emp.dob ?? null,
        hire_date: wi?.joining_date ?? null,
        gender: emp.gender ?? "",
        department: wi?.department_id ? (deptById.get(wi.department_id) ?? "") : "",
        designation: wi?.job_position_id ? (posById.get(wi.job_position_id) ?? "") : "",
        location: wi?.location ?? "",
        pt_location: emp.state ?? "",
        email: emp.email ?? "",
        has_left: emp.last_working_day && emp.last_working_day <= monthEndStr ? "Yes" : "No",
        working_days: workingDays,
        relieving_date: emp.last_working_day ?? null,
        pan: emp.pan_number ?? "",
        uan: emp.uan_number ?? "",
        esi_number: emp.esi_number ?? "",
        bank_account: bank?.account_number ?? "",
        ifsc: bank?.ifsc_code ?? "",
      };

      if (doNotPay.has(emp.id)) {
        rows.push({
          ...base, do_not_pay: true,
          basic: 0, da: 0, hra: 0, sa: 0, lta: 0, employer_esi: 0, employer_pf: 0,
          one_time_payments: 0, one_time_labels: [], gross: 0, esi_ee: 0, esi_er: 0, pf_ee: 0, pf_er: 0,
          vpf: 0, pt: 0, tds: 0, loan_emi: 0, other_recovery: 0, lop_days: 0, lop_amount: 0,
          net_pay: 0, salary_base_source: "do_not_pay",
          actual: actualByEmp.get(emp.id) ?? null,
        });
        notes.push({ employee_id: emp.id, name, note: "Marked do-not-pay for this period — projected as zero." });
        continue;
      }

      const sb = await resolveMonthlyGross(supabase, emp.id, periodStr, monthEndStr);
      const monthlyCtc = sb.monthlyGross;
      if (!(monthlyCtc > 0)) {
        notes.push({ employee_id: emp.id, name, note: sb.error ? `Salary base error: ${sb.error}` : "No salary base could be resolved — excluded from projection." });
        continue;
      }

      const pct = resolveStructurePct(emp.custom_structure_pct, defaultComps, useDefault);
      const preBasic = Math.round(monthlyCtc * (pct.basic / 100));
      const preHra = Math.round(monthlyCtc * (pct.hra / 100));
      const preLta = Math.round(monthlyCtc * (pct.lta / 100));
      const regularBase = monthlyCtc;

      const lopDays = Number(lop?.lop_days ?? 0);
      const lopAmount = workingDays > 0 ? Math.round(regularBase * (lopDays / workingDays)) : 0;
      const kpiLoss = kpiLossByEmp.get(emp.id) ?? 0;
      const factor = regularBase > 0 ? Math.max(0, 1 - (lopAmount + kpiLoss) / regularBase) : 1;
      const ctcPost = Math.round(regularBase * factor);

      const prof = statProfiles.get(emp.id);
      const pfEnrolled = prof?.pf_enabled ?? emp.pf_enabled ?? settings?.compliance_files_pf ?? false;
      const esiEnrolled = prof?.esi_enabled ?? emp.esi_enabled ?? settings?.compliance_files_esi ?? false;
      const ptEnrolled = prof?.pt_enabled ?? emp.pt_enabled ?? settings?.compliance_files_pt ?? false;
      const pfOpts = { basis: prof?.pf_wage_basis ?? undefined, vpfMode: prof?.vpf_mode ?? "none", vpfValue: Number(prof?.vpf_value ?? 0) };

      const oneTime = (oneTimeAddByEmp.get(emp.id) ?? 0) + (revisionPayoutByEmp.get(emp.id)?.amount ?? 0);
      const regularAdds = regularAddByEmp.get(emp.id) ?? 0;
      const addPositive = Math.max(0, oneTime) + Math.max(0, regularAdds);
      const addNegative = Math.max(0, -(oneTime + regularAdds));

      // CTC-inclusive doctrine: employer PF/EDLI/ESI are carved OUT of the CTC.
      let grossEarnings = ctcPost;
      let epf = computeEpf(Math.round(grossEarnings * (pct.basic / 100)), 0, settings, pfEnrolled, pfOpts);
      let esi = computeEsi(grossEarnings + addPositive, grossEarnings, settings, esiEnrolled);
      for (let i = 0; i < 4; i++) {
        const next = Math.max(0, ctcPost - epf.employer_earnings_side - esi.employer);
        if (next === grossEarnings) break;
        grossEarnings = next;
        epf = computeEpf(Math.round(grossEarnings * (pct.basic / 100)), 0, settings, pfEnrolled, pfOpts);
        esi = computeEsi(grossEarnings + addPositive, grossEarnings, settings, esiEnrolled);
      }
      const vpf = Math.min(epf.vpf, Math.max(0, grossEarnings - epf.employee));

      const gBasic = Math.round(grossEarnings * (pct.basic / 100));
      const gHra = Math.round(grossEarnings * (pct.hra / 100));
      const gLta = Math.round(grossEarnings * (pct.lta / 100));
      const gSpecial = grossEarnings - gBasic - gHra - gLta;

      const pt = computePt(grossEarnings, emp.state ?? "", ptSlabs ?? [], ptEnrolled, period);

      const regime = emp.filing_status_id ? (regimeById.get(emp.filing_status_id) ?? "new") : "new";
      const annualTax = projectAnnualTax(regularBase * 12, regime);
      const tds = Math.round(Math.max(0, annualTax - (ytdTdsByEmp.get(emp.id) ?? 0)) / monthsRemaining);

      const loanEmi = emiByEmp.get(emp.id) ?? 0;
      const otherRecovery = (otherRecoveryByEmp.get(emp.id) ?? 0) + addNegative
        + Math.max(0, (dedByEmp.get(emp.id) ?? 0) - kpiLoss);

      const grossTotal = grossEarnings + addPositive;
      const netPay = grossTotal - (epf.employee + vpf + esi.employee + pt + tds + loanEmi + otherRecovery);

      rows.push({
        ...base,
        do_not_pay: false,
        monthly_ctc: monthlyCtc,
        salary_base_source: SALARY_BASE_LABELS[sb.source],
        basic: gBasic, da: 0, hra: gHra, sa: gSpecial, lta: gLta,
        employer_esi: esi.employer, employer_pf: epf.employer_earnings_side,
        one_time_payments: Math.max(0, oneTime),
        one_time_labels: revisionPayoutByEmp.get(emp.id)?.labels ?? [],
        regular_additions: Math.max(0, regularAdds),
        gross: grossTotal,
        regular_gross: grossEarnings,
        esi_ee: esi.employee, esi_er: esi.employer,
        pf_ee: epf.employee, pf_er: epf.employer,
        vpf, pt, tds, loan_emi: loanEmi, other_recovery: otherRecovery,
        lop_days: lopDays, lop_amount: lopAmount, kpi_loss: kpiLoss,
        net_pay: netPay,
        pf_enrolled: pfEnrolled, esi_enrolled: esiEnrolled, pt_enrolled: ptEnrolled,
        preview_split: { preBasic, preHra, preLta },
        actual: actualByEmp.get(emp.id) ?? null,
      });
    }

    rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    // Readiness signals so HR knows how much to trust a mid-month projection.
    let attendanceCoveragePct = 0;
    if (employees?.length) {
      const { data: attEmps } = await supabase.from("hr_attendance_daily")
        .select("employee_id").gte("attendance_date", periodStr).lte("attendance_date", monthEndStr)
        .in("employee_id", employees.map((e: any) => e.id));
      attendanceCoveragePct = Math.round((new Set((attEmps ?? []).map((r: any) => r.employee_id)).size / employees.length) * 100);
    }

    const sum = (k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);

    return json({
      period_month: periodStr,
      generated_at: new Date().toISOString(),
      read_only: true,
      rows,
      notes,
      totals: {
        employees: rows.length,
        gross: sum("gross"), net_pay: sum("net_pay"), one_time_payments: sum("one_time_payments"),
        pf_ee: sum("pf_ee"), pf_er: sum("pf_er"), esi_ee: sum("esi_ee"), esi_er: sum("esi_er"),
        pt: sum("pt"), tds: sum("tds"), loan_emi: sum("loan_emi"), lop_amount: sum("lop_amount"),
      },
      readiness: {
        attendance_coverage_pct: attendanceCoveragePct,
        actual_register_rows: actualByEmp.size,
        staged_additions: (adds ?? []).length,
        staged_deductions: (deds ?? []).length,
        month_ended: monthEndStr < new Date().toISOString().slice(0, 10),
      },
    });
  } catch (e) {
    console.error("hr-projected-salary-register", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
