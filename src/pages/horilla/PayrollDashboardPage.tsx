import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Wallet, TrendingUp, TrendingDown, Users, PlayCircle, CheckCircle, FileText, Loader2 } from "lucide-react";

export default function PayrollDashboardPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", pay_period_start: "", pay_period_end: "", notes: "" });
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["hr_payroll_runs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_payroll_runs").select("*").order("run_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("hr_payroll_runs").insert({
        title: form.title,
        pay_period_start: form.pay_period_start,
        pay_period_end: form.pay_period_end,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_payroll_runs"] });
      setShowCreate(false);
      setForm({ title: "", pay_period_start: "", pay_period_end: "", notes: "" });
      toast.success("Payroll run created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any).from("hr_payroll_runs").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_payroll_runs"] });
      toast.success("Status updated");
    },
  });

  // Generate payslips for a payroll run
  const generatePayslips = async (run: any) => {
    setGeneratingId(run.id);
    try {
      // 1. Get all active employees
      const { data: employees, error: empErr } = await (supabase as any)
        .from("hr_employees")
        .select("id, first_name, last_name, basic_salary")
        .eq("is_active", true);
      if (empErr) throw empErr;

      // 2. Get salary structures for all employees
      const { data: structures, error: strErr } = await (supabase as any)
        .from("hr_employee_salary_structures")
        .select("*, hr_salary_components!hr_employee_salary_structures_component_id_fkey(id, name, code, component_type, calculation_type)")
        .eq("is_active", true);
      if (strErr) throw strErr;

      // 3. Get attendance for pay period
      const { data: attendance, error: attErr } = await (supabase as any)
        .from("hr_attendance")
        .select("employee_id, attendance_status, overtime_hours")
        .gte("attendance_date", run.pay_period_start)
        .lte("attendance_date", run.pay_period_end);
      if (attErr) throw attErr;

      // Build attendance map
      const attMap: Record<string, { present: number; total: number; ot: number }> = {};
      (attendance || []).forEach((a: any) => {
        if (!attMap[a.employee_id]) attMap[a.employee_id] = { present: 0, total: 0, ot: 0 };
        attMap[a.employee_id].total++;
        if (a.attendance_status === "present" || a.attendance_status === "late") attMap[a.employee_id].present++;
        attMap[a.employee_id].ot += Number(a.overtime_hours || 0);
      });

      // Build structure map
      const structMap: Record<string, any[]> = {};
      (structures || []).forEach((s: any) => {
        if (!structMap[s.employee_id]) structMap[s.employee_id] = [];
        structMap[s.employee_id].push(s);
      });

      // 4. Calculate payslips
      const payslips = (employees || []).map((emp: any) => {
        const empStructures = structMap[emp.id] || [];
        const empAtt = attMap[emp.id] || { present: 0, total: 0, ot: 0 };

        // Calculate working days (weekdays in period)
        const start = new Date(run.pay_period_start);
        const end = new Date(run.pay_period_end);
        let workingDays = 0;
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const day = d.getDay();
          if (day !== 0 && day !== 6) workingDays++;
        }

        const presentDays = empAtt.present || workingDays;
        const attendanceRatio = workingDays > 0 ? presentDays / workingDays : 1;

        // Earnings
        const earningsComponents = empStructures.filter((s: any) => s.hr_salary_components?.component_type === "allowance");
        const earningsBreakdown: Record<string, number> = {};
        let totalEarnings = 0;
        earningsComponents.forEach((s: any) => {
          const amount = Number(s.amount || 0) * attendanceRatio;
          earningsBreakdown[s.hr_salary_components?.name || "Unknown"] = Math.round(amount);
          totalEarnings += Math.round(amount);
        });

        // If no structure, use basic_salary
        if (earningsComponents.length === 0 && emp.basic_salary) {
          const basic = Number(emp.basic_salary) * attendanceRatio;
          earningsBreakdown["Basic Salary"] = Math.round(basic);
          totalEarnings = Math.round(basic);
        }

        // Deductions
        const deductionComponents = empStructures.filter((s: any) => s.hr_salary_components?.component_type === "deduction");
        const deductionsBreakdown: Record<string, number> = {};
        let totalDeductions = 0;
        deductionComponents.forEach((s: any) => {
          const amount = Number(s.amount || 0);
          deductionsBreakdown[s.hr_salary_components?.name || "Unknown"] = Math.round(amount);
          totalDeductions += Math.round(amount);
        });

        const grossSalary = totalEarnings;
        const netSalary = grossSalary - totalDeductions;

        return {
          payroll_run_id: run.id,
          employee_id: emp.id,
          gross_salary: grossSalary,
          total_earnings: totalEarnings,
          total_deductions: totalDeductions,
          net_salary: netSalary,
          earnings_breakdown: earningsBreakdown,
          deductions_breakdown: deductionsBreakdown,
          working_days: workingDays,
          present_days: presentDays,
          leave_days: workingDays - presentDays,
          overtime_hours: empAtt.ot,
          status: "draft",
        };
      });

      // 5. Delete existing payslips for this run and insert new ones
      await (supabase as any).from("hr_payslips").delete().eq("payroll_run_id", run.id);
      const { error: insertErr } = await (supabase as any).from("hr_payslips").insert(payslips);
      if (insertErr) throw insertErr;

      // 6. Update run totals
      const totalGross = payslips.reduce((s, p) => s + p.gross_salary, 0);
      const totalDed = payslips.reduce((s, p) => s + p.total_deductions, 0);
      const totalNet = payslips.reduce((s, p) => s + p.net_salary, 0);
      await (supabase as any).from("hr_payroll_runs").update({
        total_gross: totalGross,
        total_deductions: totalDed,
        total_net: totalNet,
        employee_count: payslips.length,
        status: "processing",
      }).eq("id", run.id);

      qc.invalidateQueries({ queryKey: ["hr_payroll_runs"] });
      qc.invalidateQueries({ queryKey: ["hr_payslips"] });
      toast.success(`Generated ${payslips.length} payslips`);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate payslips");
    } finally {
      setGeneratingId(null);
    }
  };

  const totalGross = runs.reduce((s: number, r: any) => s + (r.total_gross || 0), 0);
  const totalNet = runs.reduce((s: number, r: any) => s + (r.total_net || 0), 0);
  const totalDeductions = runs.reduce((s: number, r: any) => s + (r.total_deductions || 0), 0);

  const statusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-gray-100 text-gray-700";
      case "processing": return "bg-blue-100 text-blue-700";
      case "completed": return "bg-green-100 text-green-700";
      case "cancelled": return "bg-red-100 text-red-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll Dashboard</h1>
          <p className="text-sm text-gray-500">Manage payroll runs, generate payslips and process payments</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <Plus className="h-4 w-4 mr-2" /> New Payroll Run
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Runs", value: runs.length, icon: Wallet, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Total Gross", value: `₹${totalGross.toLocaleString()}`, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
          { label: "Total Deductions", value: `₹${totalDeductions.toLocaleString()}`, icon: TrendingDown, color: "text-red-600", bg: "bg-red-50" },
          { label: "Total Net Pay", value: `₹${totalNet.toLocaleString()}`, icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-gray-500">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Payroll Runs</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Title", "Period", "Run Date", "Employees", "Gross", "Deductions", "Net", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : runs.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">No payroll runs yet</td></tr>
              ) : (
                runs.map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.title}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{r.pay_period_start} — {r.pay_period_end}</td>
                    <td className="px-4 py-3">{r.run_date}</td>
                    <td className="px-4 py-3">{r.employee_count || 0}</td>
                    <td className="px-4 py-3 text-green-700 font-medium">₹{(r.total_gross || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-red-600">₹{(r.total_deductions || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold">₹{(r.total_net || 0).toLocaleString()}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(r.status)}`}>{r.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {r.status === "draft" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={generatingId === r.id}
                            onClick={() => generatePayslips(r)}
                          >
                            {generatingId === r.id ? (
                              <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Generating...</>
                            ) : (
                              <><FileText className="h-3 w-3 mr-1" /> Generate Payslips</>
                            )}
                          </Button>
                        )}
                        {r.status === "processing" && (
                          <Button size="sm" variant="ghost" className="text-green-600 h-7" onClick={() => statusMutation.mutate({ id: r.id, status: "completed" })}>
                            <CheckCircle className="h-4 w-4 mr-1" /> Complete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Payroll Run</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. February 2026 Salary" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Period Start</Label><Input type="date" value={form.pay_period_start} onChange={(e) => setForm({ ...form, pay_period_start: e.target.value })} /></div>
              <div><Label>Period End</Label><Input type="date" value={form.pay_period_end} onChange={(e) => setForm({ ...form, pay_period_end: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.title || !form.pay_period_start || !form.pay_period_end} className="bg-[#E8604C] hover:bg-[#d4553f]">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
