import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, ChevronDown, ChevronRight, Loader2, ExternalLink } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { additionTypeSlug } from "@/lib/hrms/additionType";

type Props = { period: string }; // YYYY-MM

const inr = (n: number) => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;

/**
 * Training-completion CTC transitions for the period.
 *
 * RazorpayX CTC is a month-level attribute: the month containing the training
 * completion date is paid entirely at the new CTC. These rows carry the exact
 * correction (recovery when the CTC went up, arrears when the push landed after
 * the month was processed), staged automatically on the effective date and
 * pushed only after HR approves it here.
 */
export function TrainingCtcAdjustmentsCard({ period }: Props) {
  const periodDate = `${period}-01`;
  const qc = useQueryClient();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<any | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["training_ctc_adjustments", periodDate],
    queryFn: async () => {
      const [ded, add] = await Promise.all([
        (supabase as any).from("hr_payroll_input_deductions").select("*")
          .eq("period_month", periodDate).eq("source", "training_ctc_adjustment"),
        (supabase as any).from("hr_payroll_input_additions").select("*")
          .eq("period_month", periodDate).eq("source", "training_ctc_adjustment"),
      ]);
      if (ded.error) throw ded.error;
      if (add.error) throw add.error;
      const all = [
        ...(ded.data || []).map((r: any) => ({ ...r, kind: "deduction" as const })),
        ...(add.data || []).map((r: any) => ({ ...r, kind: "addition" as const })),
      ];
      if (!all.length) return [];

      const empIds = [...new Set(all.map((r) => r.hr_employee_id))];
      const { data: emps } = await (supabase as any)
        .from("hr_employees").select("id, first_name, last_name, badge_id").in("id", empIds);
      const nameById = new Map((emps || []).map((e: any) => [e.id, {
        name: `${e.first_name || ""} ${e.last_name || ""}`.trim() || "Unknown",
        badge: e.badge_id,
      }]));

      // Full derivation straight from the single calculator — never recomputed here.
      const derivations = await Promise.all(all.map(async (r) => {
        if (!r.source_revision_id) return null;
        const { data } = await (supabase as any).rpc("hr_training_ctc_adjustment", {
          p_revision_id: r.source_revision_id,
        });
        return data;
      }));

      return all.map((r, i) => ({
        ...r,
        employee: nameById.get(r.hr_employee_id) || { name: "Unknown", badge: null },
        calc: derivations[i],
      }));
    },
  });

  const total = useMemo(
    () => (rows as any[]).reduce((s, r) => s + (r.kind === "deduction" ? 1 : -1) * Number(r.amount || 0), 0),
    [rows],
  );

  const push = useMutation({
    mutationFn: async (row: any) => {
      const table = row.kind === "addition" ? "hr_payroll_input_additions" : "hr_payroll_input_deductions";
      const items = row.kind === "addition"
        ? { additions: [{ label: row.label, amount: Number(row.amount), taxable: row.taxable !== false, type: additionTypeSlug(row.addition_type) }] }
        : { deductions: [{ label: row.label, amount: Number(row.amount) }] };
      const { data: res, error } = await (supabase as any).functions.invoke("razorpay-payroll-proxy", {
        body: {
          action: row.kind === "addition" ? "payroll_add_additions" : "payroll_add_deduction",
          payload: {
            data: {
              "employee-id": Number(row.razorpay_employee_id),
              "employee-type": "employee",
              "payroll-month": String(row.period_month).slice(0, 7),
              ...items,
            },
            readback_ids: [row.id],
            readback_table: row.kind === "addition" ? "additions" : "deductions",
          },
        },
      });
      if (error) throw new Error(error.message || "RazorpayX rejected the adjustment");
      if (!res?.ok) throw new Error(res?.error || `HTTP ${res?.http_status}`);
      const verified = res?.readback ? res.readback.verified_on_run !== false : true;
      if (!verified) {
        await (supabase as any).from(table).update({ push_response: res.body ?? {} }).eq("id", row.id);
        throw new Error(res.readback?.error || "Pushed, but not visible on the RazorpayX run — retry or verify in the dashboard.");
      }
      const { error: uErr } = await (supabase as any).from(table)
        .update({ pushed_at: new Date().toISOString(), push_response: res.body ?? {} })
        .eq("id", row.id);
      if (uErr) throw uErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training_ctc_adjustments", periodDate] });
      setConfirm(null);
      toast.success("Pushed and verified on the RazorpayX run");
    },
    onError: (e: any) => { setConfirm(null); toast.error(e.message); },
  });

  const dismiss = useMutation({
    mutationFn: async (row: any) => {
      const table = row.kind === "addition" ? "hr_payroll_input_additions" : "hr_payroll_input_deductions";
      const { error } = await (supabase as any).from(table).delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training_ctc_adjustments", periodDate] });
      toast.success("Adjustment dismissed for this period");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <GraduationCap className="h-4 w-4" /> Training CTC adjustments
          {rows.length > 0 && <Badge variant="secondary">{rows.length}</Badge>}
        </CardTitle>
        <CardDescription className="text-xs">
          One-time corrections for employees whose CTC changed mid-month on training completion.
          RazorpayX pays the whole month at the live CTC — these lines settle the difference on the
          days before the change. Never pushed automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No training-completion transitions land in this period.
          </p>
        ) : (
          <>
            <div className="text-xs text-muted-foreground mb-2">
              Net effect on this payroll: <span className="text-foreground font-medium">{inr(total)}</span> recovered
            </div>
            <div className="divide-y rounded-md border">
              {(rows as any[]).map((r) => {
                const d = r.calc?.derivation || {};
                const isOpen = !!open[r.id];
                return (
                  <div key={r.id} className="p-3 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        className="inline-flex items-center gap-1 text-foreground font-medium"
                        onClick={() => setOpen((p) => ({ ...p, [r.id]: !p[r.id] }))}
                      >
                        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        {r.employee.name}
                      </button>
                      {r.employee.badge && <span className="text-muted-foreground">#{r.employee.badge}</span>}
                      <Badge variant={r.kind === "deduction" ? "destructive" : "secondary"}>
                        {r.kind === "deduction" ? "Recovery" : "Arrears"} {inr(r.amount)}
                      </Badge>
                      {r.calc?.mode === "arrears" && (
                        <Badge variant="outline">Month already processed</Badge>
                      )}
                      <div className="ml-auto flex items-center gap-2">
                        {r.pushed_at ? (
                          <a className="underline text-muted-foreground inline-flex items-center gap-1"
                             href="https://x.razorpay.com/payroll" target="_blank" rel="noreferrer">
                            pushed · verify <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <>
                            <Button size="sm" className="h-7 text-xs" onClick={() => setConfirm(r)}>
                              Approve &amp; push
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                                    onClick={() => dismiss.mutate(r)}>
                              Dismiss
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {isOpen && (
                      <div className="mt-2 grid gap-1 sm:grid-cols-2 text-muted-foreground">
                        <div>Old CTC: <span className="text-foreground">{inr(d.old_ctc)}</span> ({inr(d.monthly_old)}/mo)</div>
                        <div>New CTC: <span className="text-foreground">{inr(d.new_ctc)}</span> ({inr(d.monthly_new)}/mo)</div>
                        <div>Effective from: <span className="text-foreground">{d.effective_from}</span></div>
                        <div>Calendar days (divisor): <span className="text-foreground">{d.divisor}</span></div>
                        <div>Days before change: <span className="text-foreground">{d.days_before}</span></div>
                        <div>Loss of pay before change: <span className="text-foreground">{d.lop_before}</span></div>
                        <div>Paid days recovered: <span className="text-foreground">{d.paid_days_before}</span></div>
                        <div>Employment window: <span className="text-foreground">{d.window_start} → {d.window_end}</span></div>
                        <div className="sm:col-span-2 pt-1 border-t">
                          CTC-level {r.kind === "deduction" ? "recovery" : "arrears"}:{" "}
                          <span className="text-foreground font-medium">{inr(r.amount)}</span>{" "}
                          — the take-home impact is smaller, because the CTC figure already contains
                          employer PF/ESI. Statutory bases stay untouched: this is a post-gross line.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Push this adjustment to RazorpayX?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && (
                <>
                  {confirm.kind === "deduction" ? "Recover" : "Pay"} {inr(confirm.amount)}{" "}
                  {confirm.kind === "deduction" ? "from" : "to"} {confirm.employee?.name} in the{" "}
                  {period} payroll run. This writes a live modification on the RazorpayX run and is
                  verified by read-back.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && push.mutate(confirm)} disabled={push.isPending}>
              {push.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Push
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
