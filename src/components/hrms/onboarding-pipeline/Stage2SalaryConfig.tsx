import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DollarSign, Info } from "lucide-react";

interface Stage2Props {
  data: any;
  onSave: (data: any, options?: { silent?: boolean }) => Promise<void>;
  onComplete: (data: any) => Promise<void>;
  onBack: () => void;
  readOnly?: boolean;
}

/**
 * Stage 2 — Salary Configuration
 *
 * HRMS-side salary structure templates were retired to avoid mismatches with
 * RazorpayX. RazorpayX is the payroll authority and its API does NOT expose
 * template CRUD (docs/PAYROLL_DOCTRINE.md, razorpay-payroll-proxy:119), so
 * we cannot verify which template was assigned there. Instead, we capture
 * only the Annual CTC on this stage; the component breakdown is assigned
 * on the RazorpayX dashboard and later mirrored read-only in the employee
 * profile (EmployeeSalaryStructure).
 */
export function Stage2SalaryConfig({ data, onSave, onComplete, onBack, readOnly }: Stage2Props) {
  const [form, setForm] = useState({
    ctc: "",
    training_completion_date: "",
    post_training_ctc: "",
    deposit_config: null as any,
  });
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (dirtyRef.current) return;
    if (data) {
      setForm({
        ctc: data.ctc?.toString() || "",
        training_completion_date: data.training_completion_date || "",
        post_training_ctc: data.post_training_ctc?.toString() || "",
        deposit_config: data.deposit_config || null,
      });
    }
  }, [data]);

  const doj: string | null = data?.date_of_joining || null;

  const validate = () => {
    if (!form.ctc || Number(form.ctc) <= 0) { toast.error("CTC is required and must be positive"); return false; }
    const hasDate = !!form.training_completion_date;
    const hasCtc = !!form.post_training_ctc && Number(form.post_training_ctc) > 0;
    if (hasDate !== hasCtc) {
      toast.error("Enter both the training completion date and the post-training CTC, or leave both blank");
      return false;
    }
    if (hasDate && doj && form.training_completion_date <= doj) {
      toast.error("Training completion date must be after the date of joining");
      return false;
    }
    if (hasDate && Number(form.post_training_ctc) === Number(form.ctc)) {
      toast.error("Post-training CTC must differ from the training CTC");
      return false;
    }
    return true;
  };

  // Approximate recovery preview. LOP is unknown at onboarding time, so this
  // assumes a clean month; the exact figure is recomputed on the effective date.
  const preview = (() => {
    const c1 = Number(form.ctc);
    const c2 = Number(form.post_training_ctc);
    if (!form.training_completion_date || !c1 || !c2 || c1 === c2) return null;
    const t = new Date(`${form.training_completion_date}T00:00:00`);
    if (Number.isNaN(t.getTime())) return null;
    const n = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    const dOld = t.getDate() - 1;
    const amount = ((c2 - c1) / 12) * (dOld / n);
    return {
      monthLabel: t.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      dateLabel: t.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
      amount,
      dOld,
      n,
    };
  })();

  const getPayload = () => ({
    ctc: Number(form.ctc) || null,
    // salary_template_id intentionally removed — templates abolished.
    salary_template_id: null,
    training_completion_date: form.training_completion_date || null,
    post_training_ctc: form.post_training_ctc ? Number(form.post_training_ctc) : null,
    deposit_config: form.deposit_config,
  });


  useEffect(() => {
    if (!dirtyRef.current || readOnly) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      dirtyRef.current = false;
      onSave(getPayload(), { silent: true }).catch((err: any) => console.warn("Stage 2 autosave failed:", err));
    }, 900);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [form, onSave, readOnly]);

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Stage 2: Salary Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Annual CTC *</Label>
          <Input
            type="number"
            placeholder="e.g. 600000"
            value={form.ctc}
            onChange={e => {
              dirtyRef.current = true;
              setForm(p => ({ ...p, ctc: e.target.value }));
            }}
            disabled={readOnly}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Enter the annual CTC only. The component split (Basic / HRA / PF / ESI etc.) is assigned inside RazorpayX after the employee is created there.
          </p>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-medium">Training period (optional)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Training completion date</Label>
              <Input
                type="date"
                value={form.training_completion_date}
                min={doj || undefined}
                onChange={e => {
                  dirtyRef.current = true;
                  setForm(p => ({ ...p, training_completion_date: e.target.value }));
                }}
                disabled={readOnly}
                className="text-foreground"
              />
            </div>
            <div>
              <Label>Post-training annual CTC</Label>
              <Input
                type="number"
                placeholder="e.g. 900000"
                value={form.post_training_ctc}
                onChange={e => {
                  dirtyRef.current = true;
                  setForm(p => ({ ...p, post_training_ctc: e.target.value }));
                }}
                disabled={readOnly}
                className="text-foreground"
              />
            </div>
          </div>
          {preview && (
            <div className="rounded-md bg-primary/5 border p-3 text-xs text-muted-foreground">
              On <span className="text-foreground font-medium">{preview.dateLabel}</span> the CTC changes from ₹
              {Number(form.ctc).toLocaleString("en-IN")} to ₹{Number(form.post_training_ctc).toLocaleString("en-IN")}.
              RazorpayX pays {preview.monthLabel} fully at the new CTC, so a one-time{" "}
              {preview.amount >= 0 ? "recovery" : "addition"} of about{" "}
              <span className="text-foreground font-medium">
                ₹{Math.abs(Math.round(preview.amount)).toLocaleString("en-IN")}
              </span>{" "}
              ({preview.dOld} day{preview.dOld === 1 ? "" : "s"} of {preview.n}) will be staged in the {preview.monthLabel} payroll for HR approval. Loss of pay is applied to the exact figure on the effective date.
            </div>
          )}
        </div>




        {!readOnly && (
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onBack}>← Back</Button>
            <Button onClick={() => { if (validate()) onComplete(getPayload()); }}>Complete & Next →</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
