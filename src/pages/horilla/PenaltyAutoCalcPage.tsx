import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Calculator, AlertTriangle, CheckCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { format } from "date-fns";

export default function PenaltyAutoCalcPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [results, setResults] = useState<any[]>([]);
  const [calculated, setCalculated] = useState(false);

  const [y, m] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${new Date(y, m, 0).getDate()}`;

  const { data: penaltyRules = [] } = useQuery({
    queryKey: ["hr_penalty_rules"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_penalty_rules").select("*").eq("is_active", true).order("min_late_count");
      return data || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active"],
    queryFn: async () => await fetchAllPaginated<any>(() => (supabase as any).from("hr_employees").select("id, first_name, last_name, badge_id, total_salary").eq("is_active", true)),
  });

  const calculateMutation = useMutation({
    mutationFn: async () => {
      // Get all attendance records for the month
      const attendance = await fetchAllPaginated<any>(() => (supabase as any)
        .from("hr_attendance")
        .select("employee_id, late_minutes")
        .gte("attendance_date", monthStart)
        .lte("attendance_date", monthEnd)
        .gt("late_minutes", 0));

      // Count lates per employee
      const lateCounts: Record<string, number> = {};
      for (const a of attendance || []) {
        lateCounts[a.employee_id] = (lateCounts[a.employee_id] || 0) + 1;
      }

      // Match against penalty rules
      const penaltyResults: any[] = [];
      for (const [empId, lateCount] of Object.entries(lateCounts)) {
        const rule = penaltyRules.find((r: any) => lateCount >= r.min_late_count && lateCount <= r.max_late_count);
        if (rule) {
          const emp = employees.find((e: any) => e.id === empId);
          const dailySalary = Number(emp?.total_salary || 0) / 30;
          const deduction = dailySalary * Number(rule.penalty_days || 0);
          penaltyResults.push({
            employee_id: empId,
            employee_name: emp ? `${emp.first_name} ${emp.last_name}` : empId,
            badge_id: emp?.badge_id || "",
            late_count: lateCount,
            rule_name: rule.name,
            penalty_days: rule.penalty_days,
            deduction_amount: Math.round(deduction),
          });
        }
      }

      setResults(penaltyResults);
      setCalculated(true);
      return penaltyResults;
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const rows = results.map((r) => ({
        employee_id: r.employee_id,
        penalty_month: monthStart,
        penalty_type: "late_attendance",
        late_count: r.late_count,
        penalty_days: r.penalty_days,
        deduction_amount: r.deduction_amount,
        rule_applied: r.rule_name,
        is_applied: false,
        notes: `Auto-calculated for ${format(new Date(monthStart), "MMMM yyyy")}`,
      }));
      const { error } = await (supabase as any).from("hr_penalties").upsert(rows, { onConflict: "employee_id,penalty_month,penalty_type" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_penalties"] });
      toast.success(`${results.length} penalty records created for ${format(new Date(monthStart), "MMMM yyyy")}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader title="Late Penalty Auto-Calculation" description="Calculate penalties based on monthly late attendance counts" />

      <Card>
        <CardContent className="p-4">
          <div className="flex items-end gap-4">
            <div>
              <Label>Month</Label>
              <Input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setCalculated(false); }} className="w-48" />
            </div>
            <Button onClick={() => calculateMutation.mutate()} disabled={calculateMutation.isPending} className="bg-[#E8604C] hover:bg-[#d4553f]">
              <Calculator className="h-4 w-4 mr-2" />
              {calculateMutation.isPending ? "Calculating..." : "Calculate Penalties"}
            </Button>
            {calculated && results.length > 0 && (
              <Button onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending} className="bg-success hover:bg-success">
                <CheckCircle className="h-4 w-4 mr-2" />
                {applyMutation.isPending ? "Applying..." : `Apply ${results.length} Penalties`}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {penaltyRules.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active Penalty Rules</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {penaltyRules.map((r: any) => (
                <div key={r.id} className="p-3 rounded-lg border bg-card text-sm">
                  <p className="font-medium text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.min_late_count}–{r.max_late_count} lates → {r.penalty_days} day(s) deduction
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {calculated && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Results for {format(new Date(monthStart), "MMMM yyyy")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <EmptyState icon={CheckCircle} title="No penalties to apply" description="All employees are within the attendance limits." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Employee</th>
                      <th className="text-right px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Late Count</th>
                      <th className="text-left px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Rule Applied</th>
                      <th className="text-right px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Penalty Days</th>
                      <th className="text-right px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Deduction (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">{r.employee_name} <span className="text-muted-foreground text-xs">({r.badge_id})</span></td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          <span className="text-warning font-semibold">{r.late_count}</span>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{r.rule_name}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{r.penalty_days}</td>
                        <td className="px-4 py-2 text-right text-destructive font-semibold tabular-nums">₹{r.deduction_amount.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
