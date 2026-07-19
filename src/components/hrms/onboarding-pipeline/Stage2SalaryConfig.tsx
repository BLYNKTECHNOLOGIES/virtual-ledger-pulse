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
    deposit_config: null as any,
  });
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (data) {
      setForm({
        ctc: data.ctc?.toString() || "",
        deposit_config: data.deposit_config || null,
      });
    }
  }, [data]);

  const validate = () => {
    if (!form.ctc || Number(form.ctc) <= 0) { toast.error("CTC is required and must be positive"); return false; }
    return true;
  };

  const getPayload = () => ({
    ctc: Number(form.ctc) || null,
    // salary_template_id intentionally removed — templates abolished.
    salary_template_id: null,
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

        <div className="rounded-lg border p-3 bg-primary/5 flex gap-2 items-start">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">RazorpayX is the payroll authority.</span>{" "}
            Local salary-structure templates have been retired because the RazorpayX API does not expose template CRUD, so HRMS could not reliably verify which structure was actually assigned. The breakdown is now managed exclusively on RazorpayX and mirrored read-only inside the employee's profile after the next sync.
          </div>
        </div>

        <div className="rounded-lg border p-4 bg-muted/30">
          <p className="text-sm font-medium mb-1">Salary Hold / Security Deposit</p>
          <p className="text-xs text-muted-foreground">
            Deposit templates will be applied after employee creation. You can configure this in the Deposit Management section after onboarding is complete.
          </p>
        </div>

        {!readOnly && (
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onBack}>← Back</Button>
            <Button variant="outline" onClick={() => onSave(getPayload())}>Save Draft</Button>
            <Button onClick={() => { if (validate()) onComplete(getPayload()); }}>Complete & Next →</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
