import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    salary_template_id: "" as string,
    deposit_config: null as any,
  });

  useEffect(() => {
    if (data) {
      setForm({
        ctc: data.ctc?.toString() || "",
        salary_template_id: data.salary_template_id || "",
        deposit_config: data.deposit_config || null,
      });
    }
  }, [data]);

  // Local templates are HRMS-owned and used *after* the employee is created in RazorpayX
  // to push a structured breakdown via people:set-salary. Selecting one here is optional —
  // it's a preference that later shortcuts the push flow from the Employee Profile.
  const { data: templates = [] } = useQuery({
    queryKey: ["hr_salary_structure_templates_picker"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_salary_structure_templates")
        .select("id,name,description")
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const validate = () => {
    if (!form.ctc || Number(form.ctc) <= 0) { toast.error("CTC is required and must be positive"); return false; }
    return true;
  };

  const getPayload = () => ({
    ctc: Number(form.ctc) || null,
    salary_template_id: form.salary_template_id || null,
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
              Annual CTC only. Component split (Basic / HRA / PF / ESI etc.) is either picked from the local template below (and pushed to RazorpayX after mapping) or assigned inside RazorpayX directly.
            </p>
          </div>
          <div>
            <Label>Salary Structure Template <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Select
              value={form.salary_template_id || "none"}
              onValueChange={(v) => setForm(p => ({ ...p, salary_template_id: v === "none" ? "" : v }))}
              disabled={readOnly}
            >
              <SelectTrigger><SelectValue placeholder="No template — assign in RazorpayX" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No template — assign in RazorpayX</SelectItem>
                {templates.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              If chosen, HRMS will push this breakdown to RazorpayX after the employee is created and mapped there.
            </p>
          </div>
        </div>

        <div className="rounded-lg border p-3 bg-primary/5 flex gap-2 items-start">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">RazorpayX is the payroll authority.</span>{" "}
            HRMS templates are pre-baked breakdowns that mirror RazorpayX's own component keys (basic, hra, employer-pf, custom allowances…) — they don't run payroll locally, they just shortcut the per-employee <code className="px-1 rounded bg-muted">set-salary</code> call.
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
