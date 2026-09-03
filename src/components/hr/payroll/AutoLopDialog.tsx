import { useMemo, useState } from "react";
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
  raw_lop_days?: number;
  compoff_available?: number;
  compoff_earned?: number;
  compoff_opening?: number;
  compoff_taken?: number;
  compoff_offset_days?: number;
  absence_lop_days?: number;
  proration_days?: number;
  employment_from?: string | null;
  employment_to?: string | null;
  formula?: string | null;
  lop_days: number;
  amount: number;
  monthly_base?: number;
  base_source_label?: string;
  status: "new" | "changed" | "unchanged" | "pushed" | "remove" | "no_lop" | "skipped";
  reason?: string;
  existing_amount?: number | null;
};

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
    const head = [
      "Employee", "Badge", "Working days", "Present", "Half days", "Absent", "Held harmless", "Unverified",
      "CL", "SL", "Comp-off leave", "Other paid leave", "Unpaid leave", "Worked on off/holiday",
      "Raw LOP", "Comp-off set-off", "Proration days", "Charged LOP days",
      "Monthly base", "LOP amount", "Status",
    ];
    const lines = [head.join(",")];
    for (const r of rows ?? []) {
      const s = leaveSlices(r);
      lines.push([
        `"${(r.name || "").replace(/"/g, "'")}"`, `"${r.badge_id ?? ""}"`,
        num(r.working_days), num(r.present_days), num(r.half_days), num(r.absent_days),
        num(r.held_harmless_days), num(r.unverified_days),
        num(s.cl), num(s.sl), num(s.compoff), num(s.otherPaid), num(s.unpaid), num(r.worked_off_days),
        num(r.raw_lop_days), num(r.compoff_offset_days), num(r.proration_days), num(r.lop_days),
        num(r.monthly_base), num(r.amount), STATUS_META[r.status]?.label ?? r.status,
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
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
            Loss of pay uses the exact maintained figures shown in Attendance Summary (working days minus
            present, half-day credit and paid leave) and the same monthly base the shadow payroll uses. Nothing is saved
            until you stage it. Rows already pushed to RazorpayX are never overwritten.
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
                <Badge>{inr(summary.total_amount)} total</Badge>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 pt-2" colSpan={2} />
                    <th className="px-2 pt-2 text-center border-l" colSpan={4}>Attendance</th>
                    <th className="px-2 pt-2 text-center border-l" colSpan={5}>Leave (days)</th>
                    <th className="px-2 pt-2 text-center border-l" colSpan={4}>Loss of pay</th>
                    <th className="px-2 pt-2 text-center border-l" colSpan={2}>Amount</th>
                    <th className="px-2 pt-2 border-l" />
                  </tr>
                  <tr className="text-left">
                    <th className="p-2 w-8">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(v) => {
                          const next: Record<string, boolean> = {};
                          for (const r of stageable) next[r.hr_employee_id] = !!v;
                          setSelected(next);
                        }}
                      />
                    </th>
                    <th className="p-2">Employee</th>
                    <th className="p-2 text-right border-l">Working</th>
                    <th className="p-2 text-right">Present</th>
                    <th className="p-2 text-right">Half</th>
                    <th className="p-2 text-right">Absent</th>
                    <th className="p-2 text-right border-l">CL</th>
                    <th className="p-2 text-right">SL</th>
                    <th className="p-2 text-right">Comp-off</th>
                    <th className="p-2 text-right">Other paid</th>
                    <th className="p-2 text-right">Unpaid</th>
                    <th className="p-2 text-right border-l">Raw</th>
                    <th className="p-2 text-right">C/off set-off</th>
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
                    const isOpen = !!expanded[r.hr_employee_id];
                    const mismatch =
                      Math.abs((r.leave_paid_total ?? 0) - (r.paid_leave_days ?? 0)) > 0.01;
                    return (
                      <>
                        <tr
                          key={r.hr_employee_id}
                          className="border-t align-top cursor-pointer hover:bg-muted/30"
                          onClick={() => setExpanded((s) => ({ ...s, [r.hr_employee_id]: !s[r.hr_employee_id] }))}
                        >
                          <td className="p-2" onClick={(e) => e.stopPropagation()}>
                            {canSelect && (
                              <Checkbox
                                checked={!!selected[r.hr_employee_id]}
                                onCheckedChange={(v) => setSelected((s) => ({ ...s, [r.hr_employee_id]: !!v }))}
                              />
                            )}
                          </td>
                          <td className="p-2 min-w-[190px]">
                            <div className="font-medium flex items-center gap-1">
                              {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                              {r.name}
                            </div>
                            <div className="text-xs text-muted-foreground pl-4.5">
                              {r.badge_id ?? "—"}
                              {r.base_source_label ? ` · ${r.base_source_label}` : ""}
                            </div>
                            {r.reason && <div className="text-xs text-muted-foreground mt-0.5">{r.reason}</div>}
                            {mismatch && (
                              <div className="text-[11px] text-destructive mt-0.5">
                                Leave breakdown ({num(r.leave_paid_total)}) ≠ engine paid leave ({num(r.paid_leave_days)})
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
                          <td className="p-2 text-right tabular-nums border-l">{num(slices.cl)}</td>
                          <td className="p-2 text-right tabular-nums">{num(slices.sl)}</td>
                          <td className="p-2 text-right tabular-nums">{num(slices.compoff)}</td>
                          <td className="p-2 text-right tabular-nums">{num(slices.otherPaid)}</td>
                          <td className="p-2 text-right tabular-nums">{num(slices.unpaid)}</td>
                          <td className="p-2 text-right tabular-nums border-l">{num(r.raw_lop_days)}</td>
                          <td className="p-2 text-right tabular-nums">{num(r.compoff_offset_days)}</td>
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
                          <tr key={`${r.hr_employee_id}-detail`} className="bg-muted/20 border-t">
                            <td />
                            <td colSpan={17} className="p-3">
                              <div className="grid gap-4 md:grid-cols-3 text-xs">
                                <div>
                                  <p className="font-semibold mb-1">Leave consumed this month</p>
                                  {(r.leave_breakdown ?? []).length === 0 ? (
                                    <p className="text-muted-foreground">No leave consumed.</p>
                                  ) : (
                                    <table className="w-full">
                                      <thead>
                                        <tr className="text-muted-foreground text-left">
                                          <th className="pr-2 font-medium">Type</th>
                                          <th className="pr-2 font-medium">Paid?</th>
                                          <th className="font-medium text-right">Days</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(r.leave_breakdown ?? []).map((s, i) => (
                                          <tr key={i}>
                                            <td className="pr-2 py-0.5">{s.name}{s.code && s.code !== "—" ? ` (${s.code})` : ""}</td>
                                            <td className="pr-2 py-0.5">{s.is_paid ? "Paid" : "Unpaid"}</td>
                                            <td className="py-0.5 text-right tabular-nums">{num(s.days)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                                <div className="space-y-1">
                                  <p className="font-semibold">Comp-off pool</p>
                                  <p className="text-muted-foreground">
                                    Opening {num(r.compoff_opening)} · Earned {num(r.compoff_earned)} · Taken {num(r.compoff_taken)}
                                  </p>
                                  <p className="text-muted-foreground">
                                    Available {num(r.compoff_available)} · Used to cancel LOP {num(r.compoff_offset_days)}
                                  </p>
                                  <p className="font-semibold pt-1">Worked on weekly off / holiday</p>
                                  <p className="text-muted-foreground">
                                    {num(r.worked_off_days)} day{r.worked_off_days === 1 ? "" : "s"}
                                    {(r.worked_off_dates ?? []).length ? ` — ${(r.worked_off_dates ?? []).join(", ")}` : ""}
                                  </p>
                                </div>
                                <div className="space-y-1">
                                  <p className="font-semibold">Employment window</p>
                                  <p className="text-muted-foreground">
                                    {r.employment_from ?? "—"} → {r.employment_to ?? "—"} · proration {num(r.proration_days)} day(s)
                                  </p>
                                  <p className="font-semibold pt-1">Engine formula</p>
                                  <p className="text-muted-foreground break-words">{r.formula ?? "—"}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
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
