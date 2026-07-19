import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DollarSign, Info } from "lucide-react";

interface Stage2Props {
  data: any;
  onSave: (data: any) => Promise<void>;
  onComplete: (data: any) => Promise<void>;
  onBack: () => void;
  readOnly?: boolean;
}

export function Stage2SalaryConfig({ data, onSave, onComplete, onBack, readOnly }: Stage2Props) {
  const [form, setForm] = useState({
    ctc: "",
    deposit_config: null as any,
  });

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

  // salary_template_id retained as null — RazorpayX is the payroll authority and owns the structure.
  const getPayload = () => ({
    ctc: Number(form.ctc) || null,
    salary_template_id: null,
    deposit_config: form.deposit_config,
  });

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Stage 2: Salary Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>CTC (Annual) *</Label>
            <Input
              type="number"
              placeholder="e.g. 600000"
              value={form.ctc}
              onChange={e => setForm(p => ({ ...p, ctc: e.target.value }))}
              disabled={readOnly}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Annual CTC only. Component split (Basic / HRA / PF / ESI etc.) is assigned inside RazorpayX.
            </p>
          </div>
        </div>

        <div className="rounded-lg border p-3 bg-primary/5 flex gap-2 items-start">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Salary structure is managed on RazorpayX.</span>{" "}
            HRMS only records the annual CTC input. Component breakdown, tax regime and statutory splits are picked from the salary structure assigned in RazorpayX after the employee is created there.
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
