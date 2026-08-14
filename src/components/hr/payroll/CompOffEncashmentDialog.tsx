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
import { Loader2, Gift, RefreshCw } from "lucide-react";

/**
 * Comp-off encashment generator.
 *
 * Comp-off is a strictly monthly currency: earned in the month, first used to
 * cancel that month's LOP (handled by the Auto-LOP engine), and whatever is
 * left is encashed here at the same per-day rate (monthly gross / working
 * days). Nothing is written until "Stage".
 */

type PreviewRow = {
  hr_employee_id: string;
  name: string;
  badge_id: string | null;
  working_days: number;
  compoff_earned: number;
  compoff_opening: number;
  compoff_taken: number;
  compoff_available: number;
  lop_days: number;
  offset_days: number;
  encash_days: number;
  per_day_rate?: number;
  amount: number;
  monthly_base?: number;
  base_source_label?: string;
  status: "new" | "changed" | "unchanged" | "pushed" | "remove" | "none" | "skipped";
  reason?: string;
  existing_amount?: number | null;
};

const STATUS_META: Record<PreviewRow["status"], { label: string; variant: any }> = {
  new: { label: "New", variant: "default" },
  changed: { label: "Amount changed", variant: "secondary" },
  unchanged: { label: "Unchanged", variant: "outline" },
  pushed: { label: "Already pushed", variant: "outline" },
  remove: { label: "Stale — will remove", variant: "destructive" },
  none: { label: "Nothing to encash", variant: "outline" },
  skipped: { label: "Skipped", variant: "destructive" },
};

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export function CompOffEncashmentDialog({
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
      const { data, error } = await supabase.functions.invoke("generate-compoff-encashment", {
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
    onError: (e: any) => toast.error(e.message || "Could not compute comp-off encashment"),
  });

  const stage = useMutation({
    mutationFn: async () => {
      const ids = [...selectedIds, ...removable.map((r) => r.hr_employee_id)];
      if (!ids.length) throw new Error("Nothing selected to stage");
      const { data, error } = await supabase.functions.invoke("generate-compoff-encashment", {
        body: { period, dry_run: false, employee_ids: ids },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      return data as any;
    },
    onSuccess: (data) => {
      const s = data.summary ?? {};
      toast.success(`${s.staged ?? 0} encashment row(s) staged${s.removed ? `, ${s.removed} stale row(s) removed` : ""}.`);
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
            <Gift className="h-4 w-4" /> Comp-off encashment — {period}
          </DialogTitle>
          <DialogDescription>
            Comp-off does not carry forward. Days earned are first taken as leave, then used to cancel this month's loss
            of pay, and the remainder is encashed here at the same per-day rate the LOP engine uses (monthly base ÷
            working days). Run Auto-LOP first. Nothing is saved until you stage it; rows already pushed to RazorpayX are
            never overwritten.
          </DialogDescription>
        </DialogHeader>

        {preview.isPending && (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the comp-off ledger, attendance and salary bases…
          </div>
        )}

        {!preview.isPending && rows && (
          <>
            {summary && (
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{summary.employees} employees</Badge>
                <Badge variant="outline">{summary.with_encashment} with encashment</Badge>
                <Badge variant="outline">{Number(summary.offset_days_total ?? 0)} d offset against LOP</Badge>
                <Badge variant="outline">{Number(summary.encash_days_total ?? 0)} d to encash</Badge>
                {summary.to_remove > 0 && <Badge variant="destructive">{summary.to_remove} stale to remove</Badge>}
                {summary.pushed_locked > 0 && <Badge variant="secondary">{summary.pushed_locked} locked (pushed)</Badge>}
                {summary.skipped > 0 && <Badge variant="destructive">{summary.skipped} skipped</Badge>}
                <Badge>{inr(summary.total_amount)} total</Badge>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
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
                    <th className="p-2 text-right">CO earned</th>
                    <th className="p-2 text-right">CO taken</th>
                    <th className="p-2 text-right">LOP days</th>
                    <th className="p-2 text-right">Offset vs LOP</th>
                    <th className="p-2 text-right">To encash</th>
                    <th className="p-2 text-right">Per day</th>
                    <th className="p-2 text-right">Amount</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const meta = STATUS_META[r.status] ?? STATUS_META.skipped;
                    const canSelect = ["new", "changed", "unchanged"].includes(r.status);
                    return (
                      <tr key={r.hr_employee_id} className="border-t align-top">
                        <td className="p-2">
                          {canSelect && (
                            <Checkbox
                              checked={!!selected[r.hr_employee_id]}
                              onCheckedChange={(v) => setSelected((s) => ({ ...s, [r.hr_employee_id]: !!v }))}
                            />
                          )}
                        </td>
                        <td className="p-2">
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.badge_id ?? "—"}
                            {r.base_source_label ? ` · ${r.base_source_label}` : ""}
                            {r.compoff_opening ? ` · ${r.compoff_opening} d carried in` : ""}
                          </div>
                          {r.reason && <div className="text-xs text-muted-foreground mt-0.5">{r.reason}</div>}
                        </td>
                        <td className="p-2 text-right tabular-nums">{r.compoff_earned}</td>
                        <td className="p-2 text-right tabular-nums">{r.compoff_taken}</td>
                        <td className="p-2 text-right tabular-nums">{r.lop_days}</td>
                        <td className="p-2 text-right tabular-nums">{r.offset_days}</td>
                        <td className="p-2 text-right tabular-nums font-medium">{r.encash_days}</td>
                        <td className="p-2 text-right tabular-nums">{r.per_day_rate ? inr(r.per_day_rate) : "—"}</td>
                        <td className="p-2 text-right tabular-nums font-medium">
                          {r.amount ? inr(r.amount) : "—"}
                          {r.status === "changed" && r.existing_amount != null && (
                            <div className="text-xs text-muted-foreground">was {inr(r.existing_amount)}</div>
                          )}
                        </td>
                        <td className="p-2"><Badge variant={meta.variant} className="text-[11px]">{meta.label}</Badge></td>
                      </tr>
                    );
                  })}
                  {!rows.length && (
                    <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">No mapped employees for this period.</td></tr>
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
