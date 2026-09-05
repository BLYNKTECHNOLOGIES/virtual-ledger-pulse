import { Fragment, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Calculator, RefreshCw, ChevronDown, ChevronRight, Download } from "lucide-react";

/**
 * Auto-LOP generator.
 *
 * Calls the generate-lop-deductions edge function in dry-run mode to preview
 * Attendance Summary loss of pay for every RazorpayX-mapped active employee,
 * then stages the selected rows. Nothing is written until "Stage selected".
 */

type PreviewRow = {
  hr_employee_id: string;
  name: string;
  badge_id: string | null;
  working_days: number;
  present_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  half_days?: number;
  absent_days?: number;
  held_harmless_days?: number;
  unverified_days?: number;
  leave_breakdown?: LeaveSlice[];
  leave_paid_total?: number;
  leave_unpaid_total?: number;
  leave_compoff_total?: number;
  worked_off_days?: number;
  worked_off_dates?: string[];
  unprocessed_off_days?: number;
  unprocessed_off_dates?: string[];
  compoff_credit_days?: number;
  compoff_credits?: CompoffCredit[];
  leave_ledger?: LeaveLedger | null;
  raw_lop_days?: number;
  compoff_available?: number;
  compoff_earned?: number;
  compoff_opening?: number;
  compoff_taken?: number;
  compoff_offset_days?: number;
  cl_available?: number;
  cl_offset_days?: number;
  absence_lop_days?: number;
  proration_days?: number;
  employment_from?: string | null;
  employment_to?: string | null;
  formula?: string | null;
  lop_days: number;
  amount: number;
  monthly_base?: number;
  base_source_label?: string;
  employee_type?: string | null;
  status: "new" | "changed" | "unchanged" | "pushed" | "remove" | "no_lop" | "skipped" | "not_applicable";
  reason?: string;
  existing_amount?: number | null;
};

type CompoffCredit = {
  date: string;
  type: string;
  days: number;
  notes?: string | null;
  duplicate?: boolean;
};

/** Opening → credited → used → closing balance ledger per leave category. */
type LedgerLeg = {
  opening?: number;
  credited?: number;
  used?: number;
  closing?: number;
  offset_lop?: number;
  encashed?: number;
};
type LeaveLedger = { cl?: LedgerLeg; sl?: LedgerLeg; co?: LedgerLeg };

const EMPTY_LEG: LedgerLeg = { opening: 0, credited: 0, used: 0, closing: 0 };
const leg = (r: PreviewRow, k: "cl" | "sl" | "co"): LedgerLeg => r.leave_ledger?.[k] ?? EMPTY_LEG;


type LeaveSlice = {
  name: string;
  code: string;
  is_paid: boolean;
  is_compoff: boolean;
  days: number;
};

const STATUS_META: Record<PreviewRow["status"], { label: string; variant: any }> = {
  new: { label: "New", variant: "default" },
  changed: { label: "Amount changed", variant: "secondary" },
  unchanged: { label: "Unchanged", variant: "outline" },
  pushed: { label: "Already pushed", variant: "outline" },
  remove: { label: "Stale — will remove", variant: "destructive" },
  no_lop: { label: "No LOP", variant: "outline" },
  skipped: { label: "Skipped", variant: "destructive" },
  not_applicable: { label: "LOP not applicable", variant: "secondary" },
};

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const num = (n: number | undefined | null) => {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
};

/** Buckets the leave-type breakdown into the column shape the table shows. */
function leaveSlices(r: PreviewRow) {
  const out = { cl: 0, sl: 0, compoff: 0, otherPaid: 0, unpaid: 0 };
  for (const s of r.leave_breakdown ?? []) {
    const label = `${s.name ?? ""} ${s.code ?? ""}`.toLowerCase();
    if (!s.is_paid) out.unpaid += Number(s.days) || 0;
    else if (s.is_compoff || label.includes("comp")) out.compoff += Number(s.days) || 0;
    else if (label.includes("sick") || /\bsl\b/.test(label)) out.sl += Number(s.days) || 0;
    else if (label.includes("casual") || /\bcl\b/.test(label)) out.cl += Number(s.days) || 0;
    else out.otherPaid += Number(s.days) || 0;
  }
  return out;
}

export function AutoLopDialog({
  open,
  onOpenChange,
  period,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  period: string;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function exportCsv() {
    const src = rows ?? [];
    // Escaped cell — quotes everything textual so Excel never mangles a value.
    const cell = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const line = (arr: unknown[]) => arr.map(cell).join(",");
    const dmy = (d?: string | null) =>
      d ? `${String(d).slice(8, 10)}-${String(d).slice(5, 7)}-${String(d).slice(0, 4)}` : "";
    const monthLabel = new Date(`${period}-01T00:00:00`).toLocaleString("en-IN", {
      month: "long", year: "numeric",
    });
    const generatedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) + " IST";

    // Grouped two-row header so the arithmetic reads left to right.
    const groups: [string, string[]][] = [
      ["", ["Badge", "Employee", "Employee type", "Employment from", "Employment to", "Status", "Note"]],
      ["ATTENDANCE (days)", ["Working", "Present", "Half day", "Absent", "Held harmless", "Unverified", "Worked on off/holiday", "Punched but unprocessed"]],
      ["LEAVE USED (days)", ["Casual", "Sick", "Comp-off", "Other paid", "Unpaid"]],
      ["CASUAL LEAVE BALANCE", ["Opening", "Credited", "Used", "Set-off against LOP", "Closing"]],
      ["SICK LEAVE BALANCE", ["Opening", "Credited", "Used", "Closing"]],
      ["COMP-OFF BALANCE", ["Opening", "Earned", "Used as leave", "Set-off against LOP", "Encashed", "Closing"]],
      ["LOSS OF PAY (days)", ["Raw", "Comp-off set-off", "Casual leave set-off", "Proration", "Chargeable"]],
      ["MONEY", ["Monthly base", "Per-day rate", "LOP amount"]],
      ["AUDIT", ["Formula applied", "Worked off/holiday dates", "Leave detail"]],
    ];
    const groupRow: string[] = [];
    const headRow: string[] = [];
    for (const [g, cols] of groups) cols.forEach((c, i) => { groupRow.push(i === 0 ? g : ""); headRow.push(c); });

    const out: string[] = [
      line(["Blynk HRMS — Loss of pay breakdown"]),
      line(["Cycle month", monthLabel]),
      line(["Generated on", generatedAt]),
      line(["Employees", src.length, "With LOP", src.filter((r) => Number(r.lop_days) > 0).length]),
      line(["Source", "Step 5 auto-LOP engine (dry run) — nothing here is staged or pushed"]),
      line(["Note", "Amounts in rupees, no symbol. Dates DD-MM-YYYY. LOP per-day rate = monthly base ÷ calendar days of the month."]),
      "",
      line(groupRow),
      line(headRow),
    ];

    const sorted = [...src].sort(
      (a, b) => Number(b.lop_days || 0) - Number(a.lop_days || 0) || (a.name || "").localeCompare(b.name || ""),
    );

    let tDays = 0, tAmt = 0, tCoOff = 0, tClOff = 0;
    for (const r of sorted) {
      const s = leaveSlices(r);
      const cl = leg(r, "cl"), sl = leg(r, "sl"), co = leg(r, "co");
      const days = Number(r.lop_days) || 0;
      const amt = Number(r.amount) || 0;
      tDays += days; tAmt += amt;
      tCoOff += Number(r.compoff_offset_days) || 0;
      tClOff += Number(r.cl_offset_days) || 0;
      const perDay = days > 0 && amt > 0 ? Math.round((amt / days) * 100) / 100 : "";
      const leaveDetail = (r.leave_breakdown ?? [])
        .filter((x) => Number(x.days) > 0)
        .map((x) => `${x.name || x.code}: ${num(x.days)}${x.is_paid ? "" : " (unpaid)"}`)
        .join(" | ");

      out.push(line([
        r.badge_id ?? "", r.name ?? "", r.employee_type ?? "",
        dmy(r.employment_from), dmy(r.employment_to),
        STATUS_META[r.status]?.label ?? r.status, r.reason ?? "",
        num(r.working_days), num(r.present_days), num(r.half_days), num(r.absent_days),
        num(r.held_harmless_days), num(r.unverified_days), num(r.worked_off_days), num(r.unprocessed_off_days),
        num(s.cl), num(s.sl), num(s.compoff), num(s.otherPaid), num(s.unpaid),
        num(cl.opening), num(cl.credited), num(cl.used), num(r.cl_offset_days), num(cl.closing),
        num(sl.opening), num(sl.credited), num(sl.used), num(sl.closing),
        num(co.opening), num(co.credited), num(co.used), num(co.offset_lop), num(co.encashed), num(co.closing),
        num(r.raw_lop_days), num(r.compoff_offset_days), num(r.cl_offset_days), num(r.proration_days), num(r.lop_days),
        num(r.monthly_base), perDay, num(r.amount),
        r.formula ?? "", (r.worked_off_dates ?? []).map(dmy).join(" | "), leaveDetail,
      ]));
    }

    // Totals row aligned to the same columns.
    const blanks = (n: number) => Array(n).fill("");
    out.push("");
    out.push(line([
      "", `TOTAL — ${sorted.length} employees`, ...blanks(5),
      ...blanks(8), ...blanks(5), ...blanks(5), ...blanks(4), ...blanks(6),
      "", num(tCoOff), num(tClOff), "", num(tDays),
      "", "", num(tAmt),
    ]));

    const blob = new Blob([`\uFEFF${out.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lop_breakdown_${period}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }


  const stageable = useMemo(
    () => (rows ?? []).filter((r) => ["new", "changed", "unchanged"].includes(r.status)),
    [rows],
  );
  const removable = useMemo(() => (rows ?? []).filter((r) => r.status === "remove"), [rows]);
  const selectedIds = useMemo(
    () => stageable.filter((r) => selected[r.hr_employee_id]).map((r) => r.hr_employee_id),
    [stageable, selected],
  );

  const preview = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-lop-deductions", {
        body: { period, dry_run: true },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      return data as any;
    },
    onSuccess: (data) => {
      const r = (data.rows ?? []) as PreviewRow[];
      setRows(r);
      setSummary(data.summary ?? null);
      const sel: Record<string, boolean> = {};
      for (const row of r) if (["new", "changed", "unchanged"].includes(row.status)) sel[row.hr_employee_id] = true;
      setSelected(sel);
    },
    onError: (e: any) => toast.error(e.message || "Could not compute LOP"),
  });

  const stage = useMutation({
    mutationFn: async () => {
      const ids = [...selectedIds, ...removable.map((r) => r.hr_employee_id)];
      if (!ids.length) throw new Error("Nothing selected to stage");
      const { data, error } = await supabase.functions.invoke("generate-lop-deductions", {
        body: { period, dry_run: false, employee_ids: ids },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      return data as any;
    },
    onSuccess: (data) => {
      const s = data.summary ?? {};
      toast.success(`${s.staged ?? 0} LOP row(s) staged${s.removed ? `, ${s.removed} stale row(s) removed` : ""}.`);
      qc.invalidateQueries({ queryKey: ["payroll_inputs"] });
      qc.invalidateQueries({ queryKey: ["cockpit_month"] });
      onOpenChange(false);
      setRows(null);
      setSummary(null);
    },
    onError: (e: any) => toast.error(e.message || "Staging failed"),
  });

  function handleOpenChange(o: boolean) {
    onOpenChange(o);
    if (!o) { setRows(null); setSummary(null); setSelected({}); }
    if (o && !rows && !preview.isPending) preview.mutate();
  }

  const allSelected = stageable.length > 0 && stageable.every((r) => selected[r.hr_employee_id]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[97vw] max-w-[97vw] md:w-[95vw] md:max-w-[1500px] max-h-[92dvh] md:max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Auto-calculate LOP from attendance — {period}
          </DialogTitle>
          <DialogDescription>
            Nothing is saved until you stage it. Rows already pushed to RazorpayX are never overwritten.
          </DialogDescription>

        </DialogHeader>

        {preview.isPending && (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading Attendance Summary and salary bases…
          </div>
        )}

        {!preview.isPending && rows && (
          <>
            {summary && (
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{summary.employees} employees</Badge>
                <Badge variant="outline">{summary.with_lop} with LOP</Badge>
                <Badge variant="outline">{summary.to_stage} to stage</Badge>
                {summary.to_remove > 0 && <Badge variant="destructive">{summary.to_remove} stale to remove</Badge>}
                {summary.pushed_locked > 0 && <Badge variant="secondary">{summary.pushed_locked} locked (pushed)</Badge>}
                {summary.skipped > 0 && <Badge variant="destructive">{summary.skipped} skipped</Badge>}
                {summary.not_applicable > 0 && <Badge variant="secondary">{summary.not_applicable} LOP not applicable (contract)</Badge>}
                <Badge>{inr(summary.total_amount)} total</Badge>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-auto rounded-md border">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 pt-2 sticky left-0 z-20 bg-muted/50 border-r border-border" colSpan={2} />
                    <th className="px-2 pt-2 text-center border-l" colSpan={4}>Attendance</th>
                    <th className="px-2 pt-2 text-center border-l" colSpan={2}>Leave used (days)</th>
                    <th className="px-2 pt-2 text-center border-l" colSpan={4}>Casual leave balance</th>
                    <th className="px-2 pt-2 text-center border-l" colSpan={4}>Sick leave balance</th>
                    <th className="px-2 pt-2 text-center border-l" colSpan={6}>Comp-off balance</th>
                    <th className="px-2 pt-2 text-center border-l" colSpan={5}>Loss of pay</th>

                    <th className="px-2 pt-2 text-center border-l" colSpan={2}>Amount</th>
                    <th className="px-2 pt-2 border-l" />
                  </tr>
                  <tr className="text-left">
                    <th className="p-2 w-8 sticky left-0 z-20 bg-muted/50 border-r border-border">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(v) => {
                          const next: Record<string, boolean> = {};
                          for (const r of stageable) next[r.hr_employee_id] = !!v;
                          setSelected(next);
                        }}
                      />
                    </th>
                    <th className="p-2 sticky left-[48px] z-20 bg-muted/50 border-r border-border">Employee</th>
                    <th className="p-2 text-right border-l">Working</th>
                    <th className="p-2 text-right">Present</th>
                    <th className="p-2 text-right">Half</th>
                    <th className="p-2 text-right">Absent</th>
                    <th className="p-2 text-right border-l">Other paid</th>
                    <th className="p-2 text-right">Unpaid</th>
                    <th className="p-2 text-right border-l">Open</th>
                    <th className="p-2 text-right">Cr</th>
                    <th className="p-2 text-right">Used</th>
                    <th className="p-2 text-right">Bal</th>
                    <th className="p-2 text-right border-l">Open</th>
                    <th className="p-2 text-right">Cr</th>
                    <th className="p-2 text-right">Used</th>
                    <th className="p-2 text-right">Bal</th>
                    <th className="p-2 text-right border-l">Open</th>
                    <th className="p-2 text-right">Cr</th>
                    <th className="p-2 text-right">Used</th>
                    <th className="p-2 text-right">LOP set-off</th>
                    <th className="p-2 text-right">Encashed</th>
                    <th className="p-2 text-right">Bal</th>
                    <th className="p-2 text-right border-l">Raw</th>

                    <th className="p-2 text-right">C/off set-off</th>
                    <th className="p-2 text-right">CL set-off</th>
                    <th className="p-2 text-right">Proration</th>
                    <th className="p-2 text-right">Charged</th>
                    <th className="p-2 text-right border-l">Monthly base</th>
                    <th className="p-2 text-right">LOP amount</th>
                    <th className="p-2 border-l">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const meta = STATUS_META[r.status] ?? STATUS_META.skipped;
                    const canSelect = ["new", "changed", "unchanged"].includes(r.status);
                    const slices = leaveSlices(r);
                    const clL = leg(r, "cl"), slL = leg(r, "sl"), coL = leg(r, "co");

                    const isOpen = !!expanded[r.hr_employee_id];
                    const mismatch =
                      Math.abs((r.leave_paid_total ?? 0) - (r.paid_leave_days ?? 0)) > 0.01;
                    return (
                      <Fragment key={r.hr_employee_id}>
                        <tr
                          className="border-t align-top cursor-pointer hover:bg-muted/30"
                          onClick={() => setExpanded((s) => ({ ...s, [r.hr_employee_id]: !s[r.hr_employee_id] }))}
                        >
                          <td className="p-2 sticky left-0 z-10 bg-background border-r border-border" onClick={(e) => e.stopPropagation()}>
                            {canSelect && (
                              <Checkbox
                                checked={!!selected[r.hr_employee_id]}
                                onCheckedChange={(v) => setSelected((s) => ({ ...s, [r.hr_employee_id]: !!v }))}
                              />
                            )}
                          </td>
                          <td className="p-2 min-w-[190px] sticky left-[48px] z-10 bg-background border-r border-border">
                            <div className="font-medium flex items-center gap-1">
                              {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                              {r.name}
                            </div>
                            <div className="text-xs text-muted-foreground pl-[18px] flex items-center gap-1.5 flex-wrap">
                              <span>
                                {r.badge_id ?? "—"}
                                {r.base_source_label ? ` · ${r.base_source_label}` : ""}
                              </span>
                              {r.employee_type === "contract" && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Contract — LOP not applicable</Badge>
                              )}
                            </div>
                            {r.reason && <div className="text-xs text-muted-foreground mt-0.5">{r.reason}</div>}
                            {mismatch && (
                              <div
                                className="text-[11px] text-warning mt-0.5"
                                title={`Leave register: ${num(r.leave_paid_total)} paid leave day(s) approved in this month. Attendance: only ${num(r.paid_leave_days)} of them fall on working days — the rest land on a weekly off or holiday, or on a day already credited as attended. LOP is charged on working days only, so this does not change the deduction.`}
                              >
                                {num((r.leave_paid_total ?? 0) - (r.paid_leave_days ?? 0))} paid-leave day(s) on a
                                non-working day — no effect on LOP
                              </div>
                            )}

                          </td>
                          <td className="p-2 text-right tabular-nums border-l">{num(r.working_days)}</td>
                          <td className="p-2 text-right tabular-nums">{num(r.present_days)}</td>
                          <td className="p-2 text-right tabular-nums">{num(r.half_days)}</td>
                          <td className="p-2 text-right tabular-nums">
                            {num(r.absent_days)}
                            {(r.held_harmless_days || r.unverified_days) ? (
                              <div className="text-[11px] text-muted-foreground">
                                {r.held_harmless_days ? `${num(r.held_harmless_days)} held` : ""}
                                {r.held_harmless_days && r.unverified_days ? " · " : ""}
                                {r.unverified_days ? `${num(r.unverified_days)} unverified` : ""}
                              </div>
                            ) : null}
                          </td>
                          <td className="p-2 text-right tabular-nums border-l">{num(slices.otherPaid)}</td>
                          <td className="p-2 text-right tabular-nums">{num(slices.unpaid)}</td>
                          <td className="p-2 text-right tabular-nums border-l">{num(clL.opening)}</td>
                          <td className="p-2 text-right tabular-nums">{num(clL.credited)}</td>
                          <td className="p-2 text-right tabular-nums">{num(clL.used)}</td>
                          <td className="p-2 text-right tabular-nums font-medium">{num(clL.closing)}</td>
                          <td className="p-2 text-right tabular-nums border-l">{num(slL.opening)}</td>
                          <td className="p-2 text-right tabular-nums">{num(slL.credited)}</td>
                          <td className="p-2 text-right tabular-nums">{num(slL.used)}</td>
                          <td className="p-2 text-right tabular-nums font-medium">{num(slL.closing)}</td>
                          <td className="p-2 text-right tabular-nums border-l">{num(coL.opening)}</td>
                          <td className="p-2 text-right tabular-nums">{num(coL.credited)}</td>
                          <td className="p-2 text-right tabular-nums">{num(coL.used)}</td>
                          <td className="p-2 text-right tabular-nums">{num(coL.offset_lop)}</td>
                          <td className="p-2 text-right tabular-nums">{num(coL.encashed)}</td>
                          <td className="p-2 text-right tabular-nums font-medium">{num(coL.closing)}</td>

                          <td className="p-2 text-right tabular-nums border-l">{num(r.raw_lop_days)}</td>
                          <td className="p-2 text-right tabular-nums">{num(r.compoff_offset_days)}</td>
                          <td className="p-2 text-right tabular-nums">{num(r.cl_offset_days)}</td>
                          <td className="p-2 text-right tabular-nums">{num(r.proration_days)}</td>
                          <td className="p-2 text-right tabular-nums font-medium">{num(r.lop_days)}</td>
                          <td className="p-2 text-right tabular-nums border-l">{r.monthly_base ? inr(r.monthly_base) : "—"}</td>
                          <td className="p-2 text-right tabular-nums font-medium">
                            {r.amount ? inr(r.amount) : "—"}
                            {r.status === "changed" && r.existing_amount != null && (
                              <div className="text-xs text-muted-foreground">was {inr(r.existing_amount)}</div>
                            )}
                          </td>
                          <td className="p-2 border-l"><Badge variant={meta.variant} className="text-[11px]">{meta.label}</Badge></td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-muted/20 border-t">
                            <td />
                            <td colSpan={29} className="p-0">
                              <div className="p-4 space-y-4 text-xs">
                                {/* How the charged LOP was arrived at */}
                                <section className="rounded-lg border bg-background">
                                  <header className="px-3 py-2 border-b bg-muted/40 font-semibold text-[11px] uppercase tracking-wide">
                                    How the charged LOP was arrived at
                                  </header>
                                  <div className="p-3 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      {([
                                        ["Raw LOP", r.raw_lop_days, ""],
                                        ["− Comp-off set-off", r.compoff_offset_days, "text-success"],
                                        ["− Casual-leave set-off", r.cl_offset_days, "text-success"],
                                        ["+ Proration (pre-joining)", r.proration_days, "text-warning"],
                                      ] as const).map(([label, val, tone]) => (
                                        <span key={label} className="rounded-md border px-2 py-1 bg-muted/30">
                                          <span className="text-muted-foreground">{label} </span>
                                          <span className={`font-semibold tabular-nums ${tone}`}>{num(val)}</span>
                                        </span>
                                      ))}
                                      <span className="rounded-md border border-primary/40 bg-primary/5 px-2 py-1">
                                        <span className="text-muted-foreground">= Charged </span>
                                        <span className="font-semibold tabular-nums">{num(r.lop_days)} day(s)</span>
                                      </span>
                                    </div>
                                    <p className="text-muted-foreground">
                                      Monthly base {r.monthly_base ? inr(r.monthly_base) : "—"}
                                      {r.base_source_label ? ` (${r.base_source_label})` : ""} ·
                                      {" "}Deduction <span className="font-semibold text-foreground">{r.amount ? inr(r.amount) : "₹0"}</span>
                                    </p>
                                    {mismatch && (
                                      <p className="text-warning">
                                        Leave register shows {num(r.leave_paid_total)} approved paid-leave day(s) this
                                        month, but only {num(r.paid_leave_days)} fall on working days — the rest sit on a
                                        weekly off, a holiday, or a day already credited as attended. LOP counts working
                                        days only, so the deduction is unaffected.
                                      </p>
                                    )}
                                    {r.formula && (
                                      <p className="text-[11px] text-muted-foreground break-words font-mono">{r.formula}</p>
                                    )}
                                  </div>
                                </section>

                                <div className="grid gap-4 lg:grid-cols-3">
                                  {/* Leave consumed */}
                                  <section className="rounded-lg border bg-background">
                                    <header className="px-3 py-2 border-b bg-muted/40 font-semibold text-[11px] uppercase tracking-wide">
                                      Leave consumed this month
                                    </header>
                                    <div className="p-3">
                                      {(r.leave_breakdown ?? []).length === 0 ? (
                                        <p className="text-muted-foreground">No leave consumed.</p>
                                      ) : (
                                        <table className="w-full">
                                          <thead>
                                            <tr className="text-muted-foreground text-left border-b">
                                              <th className="pr-2 pb-1 font-medium">Type</th>
                                              <th className="pr-2 pb-1 font-medium">Paid?</th>
                                              <th className="pb-1 font-medium text-right">Days</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {(r.leave_breakdown ?? []).map((s, i) => (
                                              <tr key={i} className="border-b last:border-0">
                                                <td className="pr-2 py-1">{s.name}{s.code && s.code !== "—" ? ` (${s.code})` : ""}</td>
                                                <td className="pr-2 py-1">
                                                  <Badge variant={s.is_paid ? "outline" : "secondary"} className="text-[10px] px-1.5 py-0">
                                                    {s.is_paid ? "Paid" : "Unpaid"}
                                                  </Badge>
                                                </td>
                                                <td className="py-1 text-right tabular-nums font-medium">{num(s.days)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                    </div>
                                  </section>

                                  {/* Leave balance ledger */}
                                  <section className="rounded-lg border bg-background">
                                    <header className="px-3 py-2 border-b bg-muted/40 font-semibold text-[11px] uppercase tracking-wide">
                                      Leave balance ledger
                                    </header>
                                    <div className="p-3 space-y-2">
                                      <table className="w-full">
                                        <thead>
                                          <tr className="text-muted-foreground text-left border-b">
                                            <th className="pr-2 pb-1 font-medium">Type</th>
                                            <th className="pb-1 font-medium text-right">Open</th>
                                            <th className="pb-1 font-medium text-right">Cr</th>
                                            <th className="pb-1 font-medium text-right">Used</th>
                                            <th className="pb-1 font-medium text-right">Bal</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {([["Casual (CL)", clL], ["Sick (SL)", slL], ["Comp-off (CO)", coL]] as const).map(([label, l]) => (
                                            <tr key={label} className="border-b last:border-0">
                                              <td className="pr-2 py-1">{label}</td>
                                              <td className="py-1 text-right tabular-nums">{num(l.opening)}</td>
                                              <td className="py-1 text-right tabular-nums">{num(l.credited)}</td>
                                              <td className="py-1 text-right tabular-nums">{num(l.used)}</td>
                                              <td className="py-1 text-right tabular-nums font-semibold">{num(l.closing)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                      <p className="text-muted-foreground">
                                        Comp-off set off against LOP {num(coL.offset_lop)} · encashed {num(coL.encashed)}
                                      </p>
                                      <p className="text-muted-foreground">
                                        Casual leave available {num(r.cl_available)} · auto-applied to cancel LOP{" "}
                                        {num(r.cl_offset_days)}
                                        {(r.cl_offset_days ?? 0) > 0 ? " (booked as approved casual leave on staging)" : ""}
                                      </p>
                                    </div>
                                  </section>

                                  {/* Attendance evidence */}
                                  <section className="rounded-lg border bg-background">
                                    <header className="px-3 py-2 border-b bg-muted/40 font-semibold text-[11px] uppercase tracking-wide">
                                      Attendance evidence &amp; employment
                                    </header>
                                    <div className="p-3 space-y-2">
                                      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
                                        <dt className="text-muted-foreground">Worked on weekly off / holiday</dt>
                                        <dd className="text-right tabular-nums font-medium">{num(r.worked_off_days)}</dd>
                                        <dt className="text-muted-foreground">Comp-off credits earned</dt>
                                        <dd className="text-right tabular-nums font-medium">{num(r.compoff_credit_days)}</dd>
                                        <dt className="text-muted-foreground">Employment window</dt>
                                        <dd className="text-right">{r.employment_from ?? "—"} → {r.employment_to ?? "—"}</dd>
                                        <dt className="text-muted-foreground">Proration days</dt>
                                        <dd className="text-right tabular-nums font-medium">{num(r.proration_days)}</dd>
                                      </dl>
                                      {(r.worked_off_dates ?? []).length > 0 && (
                                        <p className="text-muted-foreground">
                                          Off-day work: {(r.worked_off_dates ?? []).join(", ")}
                                        </p>
                                      )}
                                      {(r.compoff_credits ?? []).length > 0 && (
                                        <ul className="text-muted-foreground space-y-0.5">
                                          {(r.compoff_credits ?? []).map((c, i) => (
                                            <li key={`${c.date}-${i}`}>
                                              {c.date} · {c.type} · {num(c.days)}d
                                              {c.duplicate ? <span className="ml-1 text-warning">(same-day duplicate)</span> : null}
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                      {(r.unprocessed_off_days ?? 0) > 0 && (
                                        <p className="text-warning">
                                          Punched on an off day but below the half-day credit threshold:{" "}
                                          {num(r.unprocessed_off_days)} day(s)
                                          {(r.unprocessed_off_dates ?? []).length ? ` — ${(r.unprocessed_off_dates ?? []).join(", ")}` : ""}
                                        </p>
                                      )}
                                    </div>
                                  </section>
                                </div>
                              </div>
                            </td>

                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {!rows.length && (
                    <tr><td colSpan={18} className="p-6 text-center text-muted-foreground">No mapped employees for this period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!rows?.length}>
            <Download className="h-4 w-4 mr-1.5" /> Export breakdown CSV
          </Button>
          <Button variant="outline" onClick={() => preview.mutate()} disabled={preview.isPending || stage.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${preview.isPending ? "animate-spin" : ""}`} /> Recalculate
          </Button>
          <Button
            onClick={() => stage.mutate()}
            disabled={stage.isPending || preview.isPending || (selectedIds.length === 0 && removable.length === 0)}
          >
            {stage.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Stage {selectedIds.length} row{selectedIds.length === 1 ? "" : "s"}
            {removable.length ? ` · remove ${removable.length}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
