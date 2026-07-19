import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Send } from "lucide-react";
import { expandTemplate, RESERVED_RAZORPAY_KEYS, type TemplateItemInput } from "@/lib/hrms/salaryStructureExpansion";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateId: string;
  templateName?: string;
  /** Optional pre-selected employee. When null the user must pick one. */
  employeeId?: string | null;
  /** Optional preset CTC (annual). When null the operator fills it in. */
  initialAnnualCtc?: number | null;
}

const rupees = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function PushStructureDialog({
  open, onOpenChange, templateId, templateName, employeeId, initialAnnualCtc,
}: Props) {
  const qc = useQueryClient();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(employeeId ?? "");
  const [annualCtc, setAnnualCtc] = useState<string>(initialAnnualCtc ? String(initialAnnualCtc) : "");

  // Employees eligible for a push must be mapped to RazorpayX.
  const { data: mappedEmployees = [] } = useQuery({
    enabled: open && !employeeId,
    queryKey: ["hr_employees_mapped_for_push"],
    queryFn: async () => {
      const { data: maps } = await (supabase as any)
        .from("hr_razorpay_employee_map")
        .select("hr_employee_id, razorpay_employee_id");
      const ids = (maps || []).map((m: any) => m.hr_employee_id);
      if (!ids.length) return [];
      const { data: emps } = await (supabase as any)
        .from("hr_employees")
        .select("id, first_name, last_name, badge_id, is_active")
        .in("id", ids)
        .eq("is_active", true);
      return (emps || []).map((e: any) => ({
        id: e.id,
        label: `${e.badge_id ?? "—"} · ${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(),
      }));

    },
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    enabled: open && !!templateId,
    queryKey: ["hr_salary_structure_template_items_for_push", templateId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_salary_structure_template_items")
        .select("*, hr_salary_components!hr_salary_structure_template_items_component_id_fkey(id, name, code, component_type, razorpay_key)")
        .eq("template_id", templateId);
      if (error) throw error;
      return (data || []) as TemplateItemInput[];
    },
  });

  const ctcNum = Number(annualCtc);
  const expansion = useMemo(() => {
    if (!items.length || !Number.isFinite(ctcNum) || ctcNum <= 0) return null;
    return expandTemplate(items, ctcNum);
  }, [items, ctcNum]);

  const pushMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEmployeeId) throw new Error("Select an employee.");
      if (!expansion) throw new Error("Enter a valid annual CTC.");
      if (expansion.errors.length) throw new Error(expansion.errors.join(" "));
      const { data, error } = await supabase.functions.invoke("razorpay-payroll-proxy", {
        body: {
          action: "push_salary_from_template",
          hr_employee_id: selectedEmployeeId,
          template_id: templateId,
          annual_ctc: ctcNum,
          breakdown: expansion.breakdown,
        },
      });
      if (error) throw error;
      if (data && (data as any).ok === false) throw new Error((data as any).error || "RazorpayX rejected the push.");
      return data;
    },
    onSuccess: () => {
      toast.success("Salary structure pushed to RazorpayX.");
      qc.invalidateQueries({ queryKey: ["hr_employee_salary_structure_assignments"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Push failed."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Push salary structure → RazorpayX</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Template: <span className="font-medium text-foreground">{templateName ?? "…"}</span>. HRMS expands this into RazorpayX component keys and calls <code className="px-1 rounded bg-muted">people:set-salary</code>.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {!employeeId && (
              <div>
                <Label>Employee (must be mapped to RazorpayX)</Label>
                <select
                  className="mt-1 w-full h-9 rounded-md border bg-background px-2 text-sm"
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {mappedEmployees.map((e: any) => (
                    <option key={e.id} value={e.id}>{e.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <Label>Annual CTC (₹)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={annualCtc}
                onChange={(e) => setAnnualCtc(e.target.value)}
                placeholder="e.g. 600000"
              />
            </div>
          </div>

          {itemsLoading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading template…</p>
          ) : !expansion ? (
            <Alert>
              <AlertDescription className="text-xs">Enter a valid annual CTC to see the RazorpayX breakdown preview.</AlertDescription>
            </Alert>
          ) : (
            <>
              {expansion.errors.map((e, i) => (
                <Alert key={`err-${i}`} variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{e}</AlertDescription>
                </Alert>
              ))}
              {expansion.warnings.map((w, i) => (
                <Alert key={`warn-${i}`}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{w}</AlertDescription>
                </Alert>
              ))}

              <div className="rounded-md border">
                <div className="px-3 py-2 border-b bg-muted/40 flex items-center justify-between">
                  <div className="text-xs">
                    <span className="text-muted-foreground">Monthly CTC</span> <span className="font-medium text-foreground">{rupees(expansion.monthlyCtc)}</span>
                    <span className="text-muted-foreground ml-3">Earnings total</span> <span className="font-medium text-foreground">{rupees(expansion.totalCredited)}</span>
                  </div>
                  {expansion.residualComponentName && (
                    <Badge variant="secondary" className="text-[10px]">
                      Residual → {expansion.residualComponentName} = {rupees(expansion.residualAmount)}
                    </Badge>
                  )}
                </div>
                <div className="divide-y text-sm">
                  {RESERVED_RAZORPAY_KEYS.map((k) => {
                    const v = (expansion.breakdown as any)[k] as number;
                    if (!v) return null;
                    return (
                      <div key={k} className="flex justify-between px-3 py-1.5">
                        <span className="font-mono text-xs text-muted-foreground">{k}</span>
                        <span>{rupees(v)}</span>
                      </div>
                    );
                  })}
                  {expansion.breakdown["custom-allowances"].map((c, i) => (
                    <div key={`c-${i}`} className="flex justify-between px-3 py-1.5">
                      <span>
                        <span className="text-xs">{c.name}</span>
                        <span className="ml-2 text-[10px] text-muted-foreground">custom · taxable={c.taxable}</span>
                      </span>
                      <span>{rupees(c.amount)}</span>
                    </div>
                  ))}
                  {expansion.breakdown.deductions.map((d, i) => (
                    <div key={`d-${i}`} className="flex justify-between px-3 py-1.5 bg-destructive/5">
                      <span>
                        <span className="text-xs">{d.name}</span>
                        <span className="ml-2 text-[10px] text-muted-foreground">deduction</span>
                      </span>
                      <span>−{rupees(d.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {!expansion.errors.length && !expansion.warnings.length && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Breakdown balances to the monthly CTC. Ready to push.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => pushMutation.mutate()}
            disabled={
              pushMutation.isPending ||
              !selectedEmployeeId ||
              !expansion ||
              expansion.errors.length > 0
            }
          >
            {pushMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Push to RazorpayX
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
