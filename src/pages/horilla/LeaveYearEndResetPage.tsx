import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, CalendarDays, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function LeaveYearEndResetPage() {
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ["hr_leave_types_reset"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_leave_types").select("*").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const { data: allocations = [] } = useQuery({
    queryKey: ["hr_leave_allocations_reset", selectedYear],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_leave_allocations")
        .select("*, hr_leave_types!hr_leave_allocations_leave_type_id_fkey(name, code, carryforward_type, carryforward_expire_in, carryforward_expire_period, max_days_per_year, max_carry_forward_days)")
        .eq("year", Number(selectedYear));
      return data || [];
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const newYear = Number(selectedYear) + 1;
      const results: any[] = [];

      for (const alloc of allocations) {
        const lt = alloc.hr_leave_types;
        if (!lt) continue;

        const remaining = Math.max(0, Number(alloc.available_days || 0));
        let carryForward = 0;

        if (lt.carryforward_type === "carryforward") {
          carryForward = lt.max_carry_forward_days ? Math.min(remaining, lt.max_carry_forward_days) : remaining;
        } else if (lt.carryforward_type === "carryforward expire") {
          carryForward = lt.max_carry_forward_days ? Math.min(remaining, lt.max_carry_forward_days) : remaining;
        }
        // "no carryforward" = 0

        const lapsed = remaining - carryForward;
        const newAllocation = lt.max_days_per_year || 0;

        results.push({
          employee_id: alloc.employee_id,
          leave_type_id: alloc.leave_type_id,
          leave_type_name: lt.name,
          leave_type_code: lt.code,
          carryforward_type: lt.carryforward_type,
          old_year: Number(selectedYear),
          new_year: newYear,
          old_available: remaining,
          old_used: Number(alloc.used_days || 0),
          carry_forward: carryForward,
          lapsed: lapsed,
          new_allocated: newAllocation,
          new_total: newAllocation + carryForward,
          expire_in: lt.carryforward_expire_in,
          expire_period: lt.carryforward_expire_period,
        });
      }
      return results;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      if (data.length === 0) toast.info("No allocations found for this year");
    },
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!previewData || previewData.length === 0) throw new Error("No preview data");

      const newYear = Number(selectedYear) + 1;

      for (const item of previewData) {
        // Check if next year allocation already exists
        const { data: existing } = await (supabase as any).from("hr_leave_allocations")
          .select("id")
          .eq("employee_id", item.employee_id)
          .eq("leave_type_id", item.leave_type_id)
          .eq("year", newYear)
          .maybeSingle();

        const expiredDate = item.expire_in && item.expire_period && item.carry_forward > 0
          ? calculateExpiry(newYear, item.expire_in, item.expire_period)
          : null;

        if (existing) {
          await (supabase as any).from("hr_leave_allocations").update({
            allocated_days: item.new_allocated,
            carry_forward_days: item.carry_forward,
            available_days: item.new_total,
            used_days: 0,
            expired_date: expiredDate,
            reset_date: new Date().toISOString().slice(0, 10),
          }).eq("id", existing.id);
        } else {
          await (supabase as any).from("hr_leave_allocations").insert({
            employee_id: item.employee_id,
            leave_type_id: item.leave_type_id,
            year: newYear,
            allocated_days: item.new_allocated,
            carry_forward_days: item.carry_forward,
            available_days: item.new_total,
            used_days: 0,
            expired_date: expiredDate,
            reset_date: new Date().toISOString().slice(0, 10),
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_leave_allocations_reset"] });
      toast.success(`Year-end reset executed. ${previewData?.length || 0} allocations processed for ${Number(selectedYear) + 1}.`);
      setPreviewData(null);
      setConfirmReset(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  function calculateExpiry(year: number, amount: number, period: string): string {
    const d = new Date(year, 0, 1);
    if (period === "day") d.setDate(d.getDate() + amount);
    else if (period === "month") d.setMonth(d.getMonth() + amount);
    else if (period === "year") d.setFullYear(d.getFullYear() + amount);
    return d.toISOString().slice(0, 10);
  }

  // Group preview by leave type for summary
  const summaryByType = previewData ? Object.values(
    previewData.reduce((acc: any, item) => {
      const key = item.leave_type_id;
      if (!acc[key]) acc[key] = { name: item.leave_type_name, code: item.leave_type_code, carryforward_type: item.carryforward_type, count: 0, totalCarry: 0, totalLapsed: 0 };
      acc[key].count++;
      acc[key].totalCarry += item.carry_forward;
      acc[key].totalLapsed += item.lapsed;
      return acc;
    }, {})
  ) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leave Year-End Reset</h1>
          <p className="text-sm text-muted-foreground">Reset leave balances & carry forward unused leave to the next year</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <Label className="mb-1 block">Reset Year</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
              {previewMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarDays className="h-4 w-4 mr-2" />}
              Preview Reset ({selectedYear} → {Number(selectedYear) + 1})
            </Button>
          </div>

          <div className="mt-4 text-sm text-muted-foreground">
            <p><strong>Leave Types configured:</strong> {leaveTypes.length} active types</p>
            <p><strong>Allocations for {selectedYear}:</strong> {allocations.length} records</p>
          </div>
        </CardContent>
      </Card>

      {previewData && previewData.length > 0 && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-sm">Reset Summary by Leave Type</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    {["Leave Type", "Carryforward Rule", "Employees", "Total Carry Forward", "Total Lapsed"].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summaryByType.map((s: any, i: number) => (
                    <tr key={i} className="border-b">
                      <td className="px-4 py-3 font-medium">{s.name} <span className="text-muted-foreground text-xs">({s.code})</span></td>
                      <td className="px-4 py-3 capitalize">{s.carryforward_type?.replace(/_/g, " ") || "—"}</td>
                      <td className="px-4 py-3">{s.count}</td>
                      <td className="px-4 py-3 text-green-600 font-medium">{s.totalCarry} days</td>
                      <td className="px-4 py-3 text-red-600 font-medium">{s.totalLapsed} days</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button className="bg-[#E8604C] hover:bg-[#d4553f]" onClick={() => setConfirmReset(true)}>
              <RefreshCw className="h-4 w-4 mr-2" /> Execute Year-End Reset
            </Button>
          </div>
        </>
      )}

      {previewData && previewData.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <p className="text-muted-foreground">No leave allocations found for {selectedYear}. Nothing to reset.</p>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /> Confirm Year-End Reset</AlertDialogTitle>
            <AlertDialogDescription>
              This will create/update <strong>{previewData?.length || 0} leave allocations</strong> for <strong>{Number(selectedYear) + 1}</strong>. 
              Carry forwards and lapsed amounts will be finalized. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-[#E8604C] hover:bg-[#d4553f]" onClick={() => executeMutation.mutate()} disabled={executeMutation.isPending}>
              {executeMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Processing...</> : <><CheckCircle className="h-4 w-4 mr-1" /> Execute Reset</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
