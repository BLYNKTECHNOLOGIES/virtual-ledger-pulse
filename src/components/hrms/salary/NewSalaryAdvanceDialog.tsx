import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { EmployeePicker } from "@/components/hrms/EmployeePicker";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employees: Array<{ id: string; first_name: string; last_name: string; badge_id: string }>;
}

/**
 * Salary Advance creator — RazorpayX doctrine.
 *
 * Flow:
 *  1. hr_create_salary_advance() records a hr_loans row (advance_type='advance',
 *     status='pending_push'), so payroll picks up the deduction next cycle.
 *  2. HR opens the RazorpayX dashboard, creates the mirror Salary Advance
 *     (RazorpayX API has no public endpoint for advance-salary create), and
 *     pastes the returned advance-id here.
 *  3. hr_apply_razorpay_advance_ack() promotes the row to status='active'
 *     with razorpay_advance_salary_id stamped — this is the "push_verified"
 *     gate the shadow-payroll engine reads.
 */
export function NewSalaryAdvanceDialog({ open, onOpenChange, employees }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"create" | "verify">("create");
  const [createdLoanId, setCreatedLoanId] = useState<string | null>(null);
  const [form, setForm] = useState({
    employee_id: "",
    amount: "",
    reason: "",
    recover_from_month: new Date().toISOString().slice(0, 7) + "-01",
    notes: "",
  });
  const [advanceId, setAdvanceId] = useState("");

  const reset = () => {
    setStep("create");
    setCreatedLoanId(null);
    setForm({ employee_id: "", amount: "", reason: "", recover_from_month: new Date().toISOString().slice(0, 7) + "-01", notes: "" });
    setAdvanceId("");
  };

  const create = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      if (!form.employee_id) throw new Error("Select an employee");
      if (!amount || amount <= 0) throw new Error("Enter a positive amount");
      if (!form.reason.trim()) throw new Error("Reason is required");

      const { data, error } = await (supabase as any).rpc("hr_create_salary_advance", {
        p_employee_id: form.employee_id,
        p_amount: amount,
        p_reason: form.reason,
        p_recover_from_month: form.recover_from_month,
        p_notes: form.notes || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      setCreatedLoanId(id);
      setStep("verify");
      qc.invalidateQueries({ queryKey: ["hr_loans"] });
      toast.success("Advance queued. Now mirror it in RazorpayX.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const verify = useMutation({
    mutationFn: async () => {
      if (!createdLoanId) throw new Error("No advance in flight");
      const asInt = parseInt(advanceId.trim(), 10);
      if (!Number.isFinite(asInt) || asInt <= 0) throw new Error("Paste the numeric RazorpayX advance-id");
      const { error } = await (supabase as any).rpc("hr_apply_razorpay_advance_ack", {
        p_loan_id: createdLoanId,
        p_razorpay_advance_salary_id: asInt,
        p_status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_loans"] });
      toast.success("Salary Advance activated");
      onOpenChange(false);
      reset();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Salary Advance</DialogTitle>
          <DialogDescription>
            {step === "create"
              ? "Records the advance in HRMS. Recovery happens automatically on the next payroll cycle."
              : "Mirror this advance in RazorpayX and paste the returned advance-id to lock the payroll gate."}
          </DialogDescription>
        </DialogHeader>

        {step === "create" ? (
          <div className="space-y-3">
            <div>
              <Label>Employee *</Label>
              <EmployeePicker employees={employees} value={form.employee_id} onChange={(v) => setForm({ ...form, employee_id: v })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (₹) *</Label>
                <Input type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <Label>Recover from *</Label>
                <Input type="month"
                  value={form.recover_from_month.slice(0, 7)}
                  onChange={(e) => setForm({ ...form, recover_from_month: e.target.value + "-01" })} />
              </div>
            </div>
            <div>
              <Label>Reason *</Label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g., medical emergency" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                RazorpayX API doesn't expose a public "create salary advance" endpoint. HRMS records
                the advance locally; the next step asks you to mirror it in the RazorpayX dashboard so
                the payroll gate can verify.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-3">
            <Alert>
              <AlertDescription className="text-xs space-y-2">
                <div>1. Open <a className="underline" href="https://x.razorpay.com/payroll/salary-advances" target="_blank" rel="noreferrer">RazorpayX → Salary Advances</a> and create the matching advance for this employee.</div>
                <div>2. Copy the advance-id from the RazorpayX URL / detail page and paste below.</div>
              </AlertDescription>
            </Alert>
            <div>
              <Label>RazorpayX advance-id *</Label>
              <Input value={advanceId} onChange={(e) => setAdvanceId(e.target.value)} placeholder="e.g., 12345678" inputMode="numeric" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {step === "create" ? (
            <Button onClick={() => create.mutate()} disabled={create.isPending} className="bg-[#E8604C] hover:bg-[#d4553f]">
              {create.isPending ? "Queuing…" : "Queue Advance"}
            </Button>
          ) : (
            <Button onClick={() => verify.mutate()} disabled={verify.isPending || !advanceId.trim()} className="bg-[#E8604C] hover:bg-[#d4553f]">
              {verify.isPending ? "Verifying…" : "Confirm & Activate"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
