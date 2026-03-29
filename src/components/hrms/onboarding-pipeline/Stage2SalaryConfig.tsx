import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { DollarSign } from "lucide-react";

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
    salary_template_id: "",
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

  const { data: salaryTemplates } = useQuery({
    queryKey: ["salary-templates-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_salary_structure_templates").select("id, name").order("name");
      if (error) throw error;
      return data;
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
          </div>
          <div>
            <Label>Salary Structure Template</Label>
            <Select
              value={form.salary_template_id}
              onValueChange={v => setForm(p => ({ ...p, salary_template_id: v }))}
              disabled={readOnly}
            >
              <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
              <SelectContent>
                {salaryTemplates?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
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
