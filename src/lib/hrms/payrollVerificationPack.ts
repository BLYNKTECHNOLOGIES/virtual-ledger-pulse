import { supabase } from "@/integrations/supabase/client";
import { invokeEngine } from "@/lib/hrms/invokeEngine";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import * as XLSX from "xlsx";

/**
 * Pre-payroll verification pack.
 *
 * Read-only export of everything this month's payroll is built on, in three
 * sheets:
 *   1. Leave & comp-off ledger  (opening → credited → used → closing)
 *   2. Additions & deductions   (line level, with push / verify state)
 *   3. Payroll summary          (attendance, LOP, money, exception flags)
 *
 * Nothing here writes: the LOP and comp-off engines are called in dry-run
 * mode, every other source is a plain table read.
 */

const IST = "Asia/Kolkata";

export const istNow = () =>
  new Date().toLocaleString("en-IN", { timeZone: IST, dateStyle: "medium", timeStyle: "short" }) + " IST";

const istStamp = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { timeZone: IST, dateStyle: "short", timeStyle: "short" }) + " IST"
    : "";

const dmy = (d: string | null | undefined) => {
  if (!d) return "";
  const dt = new Date(String(d).length <= 10 ? `${d}T00:00:00Z` : d);
  if (Number.isNaN(dt.getTime())) return String(d);
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: IST, day: "2-digit", month: "2-digit", year: "numeric" });
  return p.format(dt).replace(/\//g, "-");
};

const n2 = (v: any) => {
  const x = Number(v ?? 0);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
};

// ---------------------------------------------------------------- CSV helpers

function csvCell(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type Sheet = { name: string; fileName: string; meta: string[][]; header: string[]; rows: any[][] };

export function sheetToCsv(s: Sheet): string {
  const lines: string[] = [];
  for (const m of s.meta) lines.push(m.map(csvCell).join(","));
  lines.push("");
  lines.push(s.header.map(csvCell).join(","));
  for (const r of s.rows) lines.push(r.map(csvCell).join(","));
  return lines.join("\r\n");
}

export function downloadCsv(s: Sheet) {
  const blob = new Blob(["\uFEFF" + sheetToCsv(s)], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, s.fileName + ".csv");
}

export function downloadWorkbook(sheets: Sheet[], fileName: string) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const aoa = [...s.meta, [], s.header, ...s.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = s.header.map((h, i) => ({
      wch: Math.min(
        34,
        Math.max(10, h.length + 2, ...s.rows.slice(0, 200).map((r) => String(r[i] ?? "").length + 2)),
      ),
    }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  triggerDownload(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName + ".xlsx");
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------------------------------------------------------------- data types

type Ledger = { opening?: number; credited?: number; used?: number; closing?: number; offset_lop?: number; encashed?: number };

type LopRow = {
  hr_employee_id: string;
  name: string;
  badge_id?: string | null;
  working_days?: number;
  present_days?: number;
  half_days?: number;
  absent_days?: number;
  paid_leave_days?: number;
  unpaid_leave_days?: number;
  unverified_days?: number;
  worked_off_days?: number;
  compoff_earned?: number;
  compoff_opening?: number;
  compoff_taken?: number;
  compoff_available?: number;
  compoff_offset_days?: number;
  cl_available?: number;
  cl_offset_days?: number;
  raw_lop_days?: number;
  lop_days?: number;
  amount?: number;
  monthly_base?: number;
  base_source_label?: string;
  employment_from?: string | null;
  employment_to?: string | null;
  employee_type?: string | null;
  leave_ledger?: { cl?: Ledger; sl?: Ledger; co?: Ledger } | null;
  leave_breakdown?: { name: string; code: string; is_paid: boolean; is_compoff: boolean; days: number }[];
  status?: string;
  reason?: string;
};

type CoRow = {
  hr_employee_id: string;
  name: string;
  badge_id?: string | null;
  compoff_earned?: number;
  compoff_opening?: number;
  compoff_taken?: number;
  compoff_available?: number;
  offset_days?: number;
  encash_days?: number;
  per_day_rate?: number;
  amount?: number;
  status?: string;
  reason?: string;
};

export type VerificationPack = {
  period: string;
  monthLabel: string;
  generatedAt: string;
  sheets: [Sheet, Sheet, Sheet];
  counts: { employees: number; leaveRows: number; moneyLines: number; flagged: number };
  warnings: string[];
};

// ---------------------------------------------------------------- builder

export async function buildVerificationPack(period: string): Promise<VerificationPack> {
  const monthLabel = new Date(period + "T00:00:00Z").toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const generatedAt = istNow();
  const warnings: string[] = [];

  // Engines expect YYYY-MM; DB rows are keyed by the YYYY-MM-01 date.
  const dry = async (fn: string) => invokeEngine<any>(fn, { period: period.slice(0, 7), dry_run: true });

  // Every money figure below comes from exactly what the cockpit steps hold:
  //   Step 5/6 engines (dry-run) → day-level detail
  //   hr_payroll_input_additions / _deductions → the money that will be pushed
  //   hr_payroll_auto_recoveries → recoveries (own push channel, not payroll inputs)
  // F&F and deposits are deliberately NOT read from their own tables: whatever is
  // payable in this cycle already exists as a payroll input row (source
  // 'fnf_settlement' / deposit rows), so reading them again would double count.
  const [lopRes, coRes, additions, deductions, recoveries, employees, workInfo, depts, rzpMap, me] =
    await Promise.all([
      dry("generate-lop-deductions"),
      dry("generate-compoff-encashment"),
      fetchAllPaginated<any>(() =>
        (supabase as any).from("hr_payroll_input_additions").select("*").eq("period_month", period).order("id"),
      ),
      fetchAllPaginated<any>(() =>
        (supabase as any).from("hr_payroll_input_deductions").select("*").eq("period_month", period).order("id"),
      ),
      fetchAllPaginated<any>(() =>
        (supabase as any).from("hr_payroll_auto_recoveries").select("*").eq("period_month", period).order("id"),
      ),
      fetchAllPaginated<any>(() =>
        (supabase as any)
          .from("hr_employees")
          .select("id,badge_id,first_name,last_name,is_active,last_working_day,resignation_date")
          .order("id"),
      ),
      fetchAllPaginated<any>(() =>
        (supabase as any).from("hr_employee_work_info").select("employee_id,department_id,joining_date,employee_type").order("id"),
      ),
      fetchAllPaginated<any>(() => (supabase as any).from("departments").select("id,name").order("id")),
      fetchAllPaginated<any>(() =>
        (supabase as any).from("hr_razorpay_employee_map").select("hr_employee_id,razorpay_employee_id,sync_status").order("hr_employee_id"),
      ),
      supabase.auth.getUser(),
    ]);


  const lopRows: LopRow[] = (lopRes?.rows ?? []) as LopRow[];
  const coRows: CoRow[] = (coRes?.rows ?? []) as CoRow[];
  const coBy = new Map(coRows.map((r) => [r.hr_employee_id, r]));
  const lopBy = new Map(lopRows.map((r) => [r.hr_employee_id, r]));

  const deptName = new Map(depts.map((d: any) => [d.id, d.name]));
  const wi = new Map(workInfo.map((w: any) => [w.employee_id, w]));
  const emp = new Map(employees.map((e: any) => [e.id, e]));
  const mapped = new Map(rzpMap.map((m: any) => [m.hr_employee_id, m]));

  // Staged rows — the figures payroll will actually pay. The engines only supply
  // day-level detail; wherever both exist the staged row is the payroll truth and
  // any difference is flagged rather than silently overwritten.
  const stagedLop = new Map<string, any>();
  for (const d of deductions) if (String(d.source) === "auto_lop") stagedLop.set(d.hr_employee_id, d);
  const stagedCo = new Map<string, any>();
  for (const a of additions) if (String(a.source) === "auto_compoff") stagedCo.set(a.hr_employee_id, a);


  const empName = (id: string) => {
    const e: any = emp.get(id);
    return e ? `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() : lopBy.get(id)?.name || "";
  };
  const empBadge = (id: string) => (emp.get(id) as any)?.badge_id ?? lopBy.get(id)?.badge_id ?? "";

  const generatedBy = (me as any)?.data?.user?.email ?? "HR user";

  const metaFor = (title: string, extra: string[][] = []): string[][] => [
    ["Blynk HRMS — pre-payroll verification pack"],
    [title],
    ["Cycle month", monthLabel],
    ["Generated on", generatedAt],
    ["Generated by", generatedBy],
    ["Employees in roster", String(lopRows.length)],
    ...extra,
    ["Source of figures", "Step 5 loss-of-pay engine, Step 6 comp-off encashment engine and the staged Step 6 payroll inputs / auto-recoveries of this cycle — nothing is recomputed outside those steps."],
    ["Note", "Read-only snapshot. Amounts shown as 'staged' are exactly what will be pushed to RazorpayX; differences against the current calculation are flagged."],

  ];

  // ------------------------------------------------ Sheet 1 — leave ledger
  const leaveHeader = [
    "Badge ID", "Employee", "Department", "Date of joining", "Last working day",
    "CL opening", "CL credited", "CL taken (paid)", "CL used against LOP", "CL closing",
    "SL opening", "SL credited", "SL taken (paid)", "SL used against LOP", "SL closing",
    "Comp-off opening", "Comp-off earned", "Comp-off taken as leave", "Comp-off used against LOP",
    "Comp-off encashed (days)", "Comp-off encashment amount (staged)", "Comp-off closing",
    "Unpaid leave days (LOP)", "Other paid leave days", "Balance check",
  ];

  const leaveRows: any[][] = [];
  for (const r of lopRows) {
    const cl = r.leave_ledger?.cl ?? {};
    const sl = r.leave_ledger?.sl ?? {};
    const co = r.leave_ledger?.co ?? {};
    const e: any = emp.get(r.hr_employee_id) ?? {};
    const w: any = wi.get(r.hr_employee_id) ?? {};
    const cor = coBy.get(r.hr_employee_id);

    const otherPaid = (r.leave_breakdown ?? [])
      .filter((s) => s.is_paid && !s.is_compoff && !/^(cl|sl)$/i.test(s.code ?? ""))
      .reduce((a, s) => a + (Number(s.days) || 0), 0);

    const coOpening = n2(co.opening ?? r.compoff_opening);
    const coEarned = n2(co.credited ?? r.compoff_earned);
    const coTaken = n2(co.used ?? r.compoff_taken);
    const coOffset = n2(co.offset_lop ?? r.compoff_offset_days);
    const coEncashDays = n2(cor?.encash_days ?? co.encashed);
    const coClosing = n2(coOpening + coEarned - coTaken - coOffset - coEncashDays);

    // Money shown is the staged Step 6 row (what payroll pays); the engine value
    // is only used when nothing is staged yet, and any gap is called out.
    const stagedCoRow = stagedCo.get(r.hr_employee_id);
    const coAmount = stagedCoRow ? n2(stagedCoRow.amount) : n2(cor?.amount);

    const clCheck = n2(n2(cl.opening) + n2(cl.credited) - n2(cl.used) - n2(cl.offset_lop) - n2(cl.closing));
    const checks: string[] = [];
    if (Math.abs(clCheck) > 0.01) checks.push("CL ledger mismatch");
    if (Math.abs(coClosing) > 0.01) checks.push(`Comp-off ${coClosing} day(s) unsettled`);
    if (!stagedCoRow && n2(cor?.amount) > 0) checks.push("Comp-off encashment calculated but not staged in Step 6");
    if (stagedCoRow && Math.abs(n2(stagedCoRow.amount) - n2(cor?.amount)) > 0.01 && cor?.status !== "pushed")
      checks.push(`Staged ₹${n2(stagedCoRow.amount)} differs from current calculation ₹${n2(cor?.amount)}`);

    leaveRows.push([
      empBadge(r.hr_employee_id), r.name, deptName.get(w.department_id) ?? "", dmy(w.joining_date), dmy(e.last_working_day),
      n2(cl.opening), n2(cl.credited), n2(cl.used), n2(cl.offset_lop), n2(cl.closing),
      n2(sl.opening), n2(sl.credited), n2(sl.used), n2(sl.offset_lop), n2(sl.closing),
      coOpening, coEarned, coTaken, coOffset, coEncashDays, coAmount, coClosing,
      n2(r.unpaid_leave_days), n2(otherPaid),
      checks.length ? checks.join("; ") : "OK",
    ]);

  }
  leaveRows.sort((a, b) => String(a[1]).localeCompare(String(b[1])));

  // ------------------------------------------- Sheet 2 — additions/deductions
  const moneyHeader = [
    "Badge ID", "Employee", "Direction", "Category", "Description", "Amount",
    "Origin", "Provisional", "Payable in this run", "Pushed to RazorpayX", "Pushed at (IST)", "Verified in RazorpayX", "Notes",
  ];

  type Line = { badge: string; name: string; dir: "Addition" | "Deduction"; cat: string; label: string; amt: number; origin: string; prov: string; payable: boolean; pushed: string; pushedAt: string; verified: string; notes: string };
  const lines: Line[] = [];

  const categoryOf = (src: string | null | undefined, label: string): string => {
    const s = String(src ?? "").toLowerCase();
    const l = String(label ?? "").toLowerCase();
    if (s === "auto_lop" || /lop|loss of pay/.test(l)) return "Loss of pay";
    if (s === "auto_compoff" || /comp[- ]?off/.test(l)) return "Comp-off encashment";
    if (/training|part[- ]month|ctc adjust/.test(l)) return "Training / part-month CTC adjustment";
    if (/deposit/.test(l)) return "Deposit";
    if (/recovery|recover/.test(l)) return "Recovery";
    if (/f&f|full and final|settlement/.test(l)) return "F&F settlement";
    if (s === "one_time" || /one[- ]time|bonus|incentive|arrear/.test(l)) return "One-time payment";
    return s ? `Other (${s})` : "Manual entry";
  };

  const outsidePayroll = (row: any) =>
    /outside payroll|paid outside|recorded only/i.test(String(row.label ?? "")) ||
    String(row.source ?? "").toLowerCase() === "outside_payroll";

  for (const row of additions) {
    lines.push({
      badge: empBadge(row.hr_employee_id), name: empName(row.hr_employee_id),
      dir: "Addition", cat: categoryOf(row.source, row.label), label: row.label ?? "",
      amt: n2(row.amount), origin: row.source ? "Automatic" : "Manual",
      prov: row.provisional ? "Provisional" : "Final",
      payable: !outsidePayroll(row),
      pushed: row.pushed_at ? "Yes" : "No", pushedAt: istStamp(row.pushed_at),
      verified: row.readback_verified_at ? "Verified" : row.pushed_at ? "Not verified" : "—",
      notes: outsidePayroll(row) ? "Recorded only — already paid outside payroll" : (row.readback_diff ? `Read-back difference: ${JSON.stringify(row.readback_diff)}` : ""),
    });
  }
  for (const row of deductions) {
    lines.push({
      badge: empBadge(row.hr_employee_id), name: empName(row.hr_employee_id),
      dir: "Deduction", cat: categoryOf(row.source, row.label), label: row.label ?? "",
      amt: n2(row.amount), origin: row.source ? "Automatic" : "Manual",
      prov: row.provisional ? "Provisional" : "Final",
      payable: !outsidePayroll(row),
      pushed: row.pushed_at ? "Yes" : "No", pushedAt: istStamp(row.pushed_at),
      verified: row.readback_verified_at ? "Verified" : row.pushed_at ? "Not verified" : "—",
      notes: [row.lop_days ? `${n2(row.lop_days)} LOP day(s)` : "", row.readback_diff ? `Read-back difference: ${JSON.stringify(row.readback_diff)}` : ""].filter(Boolean).join("; "),
    });
  }
  for (const row of recoveries) {
    lines.push({
      badge: row.badge_id ?? empBadge(row.employee_id), name: row.employee_name ?? empName(row.employee_id),
      dir: "Deduction", cat: "Recovery instalment",
      label: `${row.label ?? row.source_kind ?? "Recovery"} — instalment ${row.installment_no ?? "?"}/${row.total_installments ?? "?"}`,
      amt: n2(row.amount), origin: "Automatic", prov: "Final", payable: true,
      pushed: row.razorpay_pushed_at ? "Yes" : "No", pushedAt: istStamp(row.razorpay_pushed_at),
      verified: row.status === "pushed" ? "Pushed" : String(row.status ?? ""),
      notes: [
        row.remaining_after !== null && row.remaining_after !== undefined ? `Remaining after this instalment: ${n2(row.remaining_after)}` : "",
        row.failure_reason ? `Failure: ${row.failure_reason}` : "",
      ].filter(Boolean).join("; "),
    });
  }
  // Deposits and F&F are intentionally not read from their own tables: whatever is
  // payable this cycle is already a staged payroll input row above.


  lines.sort((a, b) => (a.name || "").localeCompare(b.name || "") || a.dir.localeCompare(b.dir) || a.cat.localeCompare(b.cat));

  const moneyRows: any[][] = lines.map((l) => [
    l.badge, l.name, l.dir, l.cat, l.label, l.amt, l.origin, l.prov,
    l.payable ? "Yes" : "No — recorded only", l.pushed, l.pushedAt, l.verified, l.notes,
  ]);

  const payable = lines.filter((l) => l.payable);
  const totalAdd = n2(payable.filter((l) => l.dir === "Addition").reduce((a, l) => a + l.amt, 0));
  const totalDed = n2(payable.filter((l) => l.dir === "Deduction").reduce((a, l) => a + l.amt, 0));
  const pushedCount = lines.filter((l) => l.pushed === "Yes").length;
  const notPushed = lines.filter((l) => l.pushed === "No").length;
  const unverified = lines.filter((l) => l.pushed === "Yes" && l.verified !== "Verified" && l.verified !== "Pushed").length;

  moneyRows.push([]);
  moneyRows.push(["", "TOTALS (payable in this run)", "", "", "Total additions", totalAdd]);
  moneyRows.push(["", "", "", "", "Total deductions", totalDed]);
  moneyRows.push(["", "", "", "", "Net effect (additions − deductions)", n2(totalAdd - totalDed)]);
  moneyRows.push(["", "", "", "", "Lines pushed / not pushed / pushed-but-unverified", `${pushedCount} / ${notPushed} / ${unverified}`]);

  // --------------------------------------------- Sheet 3 — payroll summary
  const addByEmp = new Map<string, number>();
  const dedByEmp = new Map<string, number>();
  const stagedUnpushed = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string, v: number) => m.set(k, n2((m.get(k) ?? 0) + v));
  for (const row of additions) {
    if (!outsidePayroll(row)) bump(addByEmp, row.hr_employee_id, n2(row.amount));
    if (!row.pushed_at) bump(stagedUnpushed, row.hr_employee_id, 1);
  }
  for (const row of deductions) {
    if (!outsidePayroll(row)) bump(dedByEmp, row.hr_employee_id, n2(row.amount));
    if (!row.pushed_at) bump(stagedUnpushed, row.hr_employee_id, 1);
  }
  for (const row of recoveries) bump(dedByEmp, row.employee_id, n2(row.amount));

  const daysInMonth = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).getUTCDate();

  const summaryHeader = [
    "Badge ID", "Employee", "Department", "Employee type", "RazorpayX mapping",
    "Calendar days", "Working days", "Present days", "Half days", "Absent days",
    "Paid leave days", "Unpaid leave days", "Weekly-off / holiday worked", "Unverified days",
    "Employment from", "Employment to",
    "Raw LOP days", "Absorbed by comp-off", "Absorbed by casual leave", "Chargeable LOP days",
    "Per-day rate (LOP engine)", "Divisor (calendar days)", "LOP amount (staged)", "LOP amount (current calculation)",
    "Monthly gross base", "Base source", "Total additions (staged)", "Total deductions (staged)",
    "Expected net pay (gross + additions − deductions)",
    "Flags",
  ];

  const summaryRows: any[][] = [];
  let flagged = 0;
  for (const r of lopRows) {
    const w: any = wi.get(r.hr_employee_id) ?? {};
    const cor = coBy.get(r.hr_employee_id);
    const base = n2(r.monthly_base);
    const lopDays = n2(r.lop_days);
    const engineLop = n2(r.amount);
    const stagedLopRow = stagedLop.get(r.hr_employee_id);
    const stagedLopAmt = stagedLopRow ? n2(stagedLopRow.amount) : 0;
    // Rate as the engine itself applied it (amount ÷ chargeable days); falls back
    // to base ÷ calendar days only when there is no LOP to divide by.
    const perDay = lopDays > 0 && engineLop > 0 ? n2(engineLop / lopDays) : base ? n2(base / daysInMonth) : 0;
    const add = n2((addByEmp.get(r.hr_employee_id) ?? 0));
    const ded = n2((dedByEmp.get(r.hr_employee_id) ?? 0));
    const net = n2(base + add - ded);
    const map = mapped.get(r.hr_employee_id) as any;

    const flags: string[] = [];
    if (!map?.razorpay_employee_id) flags.push("No RazorpayX mapping");
    if (!base) flags.push("No salary base resolved");
    if (n2(r.unverified_days) > 0) flags.push(`${n2(r.unverified_days)} unverified attendance day(s)`);
    if (net < 0) flags.push("Negative net");
    if ((stagedUnpushed.get(r.hr_employee_id) ?? 0) > 0) flags.push(`${stagedUnpushed.get(r.hr_employee_id)} staged line(s) not pushed`);
    if (!stagedLopRow && engineLop > 0) flags.push("LOP calculated but not staged in Step 5");
    if (stagedLopRow && Math.abs(stagedLopAmt - engineLop) > 0.01 && r.status !== "pushed")
      flags.push(`Staged LOP ₹${stagedLopAmt} differs from current calculation ₹${engineLop}`);
    if (r.status === "skipped") flags.push(`LOP skipped: ${r.reason ?? "see Step 5"}`);
    if (cor?.status === "skipped") flags.push(`Comp-off skipped: ${cor.reason ?? "see Step 6"}`);
    if (flags.length) flagged++;

    summaryRows.push([
      empBadge(r.hr_employee_id), r.name, deptName.get(w.department_id) ?? "", r.employee_type ?? w.employee_type ?? "",
      map?.razorpay_employee_id ? `Mapped (${map.sync_status ?? "ok"})` : "Not mapped",
      daysInMonth, n2(r.working_days), n2(r.present_days), n2(r.half_days), n2(r.absent_days),
      n2(r.paid_leave_days), n2(r.unpaid_leave_days), n2(r.worked_off_days), n2(r.unverified_days),
      dmy(r.employment_from), dmy(r.employment_to),
      n2(r.raw_lop_days), n2(r.compoff_offset_days), n2(r.cl_offset_days), lopDays,
      perDay, daysInMonth, stagedLopAmt, engineLop,
      base, r.base_source_label ?? "", add, ded, net,
      flags.length ? flags.join("; ") : "",
    ]);
  }

  summaryRows.sort((a, b) => String(a[1]).localeCompare(String(b[1])));

  // Grand totals — the expected net pay column is what should be credited in
  // total to all employees for this payroll run.
  const colSum = (idx: number) => n2(summaryRows.reduce((a, row) => a + (Number(row[idx]) || 0), 0));
  const totalBase = colSum(24), totalAddAll = colSum(26), totalDedAll = colSum(27), totalNet = colSum(28);
  summaryRows.push([]);
  summaryRows.push([
    "", "TOTAL — all employees", "", "", "",
    "", "", "", "", "",
    "", "", "", "",
    "", "",
    "", "", "", "",
    "", "", colSum(22), colSum(23),
    totalBase, "", totalAddAll, totalDedAll, totalNet,
    `${summaryRows.length - 1} employees`,
  ]);

  const staleLop = lopRows.filter((r) => ["new", "changed", "remove"].includes(String(r.status))).length;
  const staleCo = coRows.filter((r) => ["new", "changed", "remove"].includes(String(r.status))).length;
  if (staleLop) warnings.push(`${staleLop} loss-of-pay row(s) in Step 5 are not staged with the current attendance — recalculate and stage before running payroll.`);
  if (staleCo) warnings.push(`${staleCo} comp-off encashment row(s) in Step 6 are not staged with the current calculation.`);
  if (unverified) warnings.push(`${unverified} pushed line(s) have not been read back and verified in RazorpayX.`);

  const warnMeta: string[][] = warnings.length
    ? [["Attention"], ...warnings.map((w) => ["", w])]
    : [["Attention", "None — staged figures match the live calculation."]];

  const sheets: [Sheet, Sheet, Sheet] = [
    {
      name: "1 Leave & comp-off",
      fileName: `payroll_${period.slice(0, 7)}_1_leave_and_compoff`,
      meta: metaFor("Sheet 1 of 3 — Leave and comp-off ledger (opening → credited → used → closing)", warnMeta),
      header: leaveHeader,
      rows: leaveRows,
    },
    {
      name: "2 Additions & deductions",
      fileName: `payroll_${period.slice(0, 7)}_2_additions_deductions`,
      meta: metaFor("Sheet 2 of 3 — Additions and deductions, line by line", [
        ["Total additions (payable)", String(totalAdd)],
        ["Total deductions (payable)", String(totalDed)],
        ...warnMeta,
      ]),
      header: moneyHeader,
      rows: moneyRows,
    },
    {
      name: "3 Payroll summary",
      fileName: `payroll_${period.slice(0, 7)}_3_payroll_summary`,
      meta: metaFor("Sheet 3 of 3 — Per-employee attendance, loss of pay and money summary", [
        ["Employees flagged for review", String(flagged)],
        ["Expected net pay — TOTAL to be credited", String(totalNet)],
        ...warnMeta,
      ]),
      header: summaryHeader,
      rows: summaryRows,
    },
  ];

  return {
    period,
    monthLabel,
    generatedAt,
    sheets,
    counts: { employees: lopRows.length, leaveRows: leaveRows.length, moneyLines: lines.length, flagged },
    warnings,
  };
}
