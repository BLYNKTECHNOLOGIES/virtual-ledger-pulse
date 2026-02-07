
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, FileText, Play, Search, Filter, Plus, Eye, Download, CheckCircle, Clock, Ban, IndianRupee, TrendingUp, Users, Calculator } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

export function PayrollDashboard() {
  const [activeTab, setActiveTab] = useState("runs");
  const [showCreateRunDialog, setShowCreateRunDialog] = useState(false);
  const [showPayslipDialog, setShowPayslipDialog] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const queryClient = useQueryClient();

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");

  const { data: payrollRuns = [] } = useQuery({
    queryKey: ["hr_payroll_runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_payroll_runs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: salaryComponents = [] } = useQuery({
    queryKey: ["hr_salary_components"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_salary_components")
        .select("*")
        .eq("is_active", true)
        .order("component_type", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_payroll"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_employees")
        .select("id, first_name, last_name, badge_id")
        .eq("is_active", true)
        .order("first_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: payslips = [] } = useQuery({
    queryKey: ["hr_payslips", selectedRunId],
    queryFn: async () => {
      if (!selectedRunId) return [];
      const { data, error } = await supabase
        .from("hr_payslips")
        .select("*, hr_employees!hr_payslips_employee_id_fkey(first_name, last_name, badge_id)")
        .eq("payroll_run_id", selectedRunId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedRunId,
  });

  const createRunMutation = useMutation({
    mutationFn: async () => {
      // Create payroll run
      const { data: run, error: runError } = await supabase
        .from("hr_payroll_runs")
        .insert({
          title: formTitle,
          pay_period_start: formStartDate,
          pay_period_end: formEndDate,
          employee_count: employees.length,
        })
        .select()
        .single();
      if (runError) throw runError;

      // Generate payslips for all active employees
      const payslipData = employees.map((emp) => {
        const basicComponent = salaryComponents.find((c) => c.code === "BASIC");
        const basicAmount = basicComponent?.default_amount || 25000;

        let totalEarnings = 0;
        let totalDeductions = 0;
        const earningsBreakdown: Record<string, number> = {};
        const deductionsBreakdown: Record<string, number> = {};

        salaryComponents.forEach((comp) => {
          let amount = comp.default_amount || 0;
          if (comp.calculation_type === "percentage" && comp.percentage_of === "basic") {
            amount = (basicAmount * (comp.default_amount || 0)) / 100;
          }
          if (comp.code === "BASIC") amount = basicAmount;

          if (comp.component_type === "earning") {
            earningsBreakdown[comp.name] = amount;
            totalEarnings += amount;
          } else if (comp.component_type === "deduction") {
            deductionsBreakdown[comp.name] = amount;
            totalDeductions += amount;
          }
        });

        return {
          payroll_run_id: run.id,
          employee_id: emp.id,
          gross_salary: totalEarnings,
          total_earnings: totalEarnings,
          total_deductions: totalDeductions,
          net_salary: totalEarnings - totalDeductions,
          earnings_breakdown: earningsBreakdown,
          deductions_breakdown: deductionsBreakdown,
          working_days: 30,
          present_days: 26,
        };
      });

      if (payslipData.length > 0) {
        const { error: psError } = await supabase.from("hr_payslips").insert(payslipData);
        if (psError) throw psError;
      }

      // Update totals on the run
      const totalGross = payslipData.reduce((s, p) => s + p.total_earnings, 0);
      const totalDed = payslipData.reduce((s, p) => s + p.total_deductions, 0);
      const totalNet = payslipData.reduce((s, p) => s + p.net_salary, 0);

      await supabase
        .from("hr_payroll_runs")
        .update({ total_gross: totalGross, total_deductions: totalDed, total_net: totalNet })
        .eq("id", run.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_payroll_runs"] });
      setShowCreateRunDialog(false);
      setFormTitle("");
      setFormStartDate("");
      setFormEndDate("");
      toast.success("Payroll run created with payslips generated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateRunStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("hr_payroll_runs").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_payroll_runs"] });
      toast.success("Payroll run updated");
    },
  });

  const viewPayslips = (runId: string) => {
    setSelectedRunId(runId);
    setShowPayslipDialog(true);
  };

  const earnings = salaryComponents.filter((c) => c.component_type === "earning");
  const deductions = salaryComponents.filter((c) => c.component_type === "deduction");

  const totalPayrollAmount = payrollRuns
    .filter((r) => r.status === "completed")
    .reduce((s, r) => s + (r.total_net || 0), 0);

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: "bg-gray-100 text-gray-700",
      processing: "bg-blue-100 text-blue-700",
      completed: "bg-green-100 text-green-700",
      cancelled: "bg-red-100 text-red-700",
    };
    return <Badge className={styles[status] || "bg-gray-100 text-gray-700"}>{status}</Badge>;
  };

  const chartData = payrollRuns.slice(0, 6).reverse().map((r) => ({
    name: format(new Date(r.pay_period_start), "MMM yy"),
    gross: r.total_gross || 0,
    net: r.total_net || 0,
    deductions: r.total_deductions || 0,
  }));

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList className="bg-gray-100">
            <TabsTrigger value="runs" className="data-[state=active]:bg-[#009C4A] data-[state=active]:text-white">
              Payroll Runs
            </TabsTrigger>
            <TabsTrigger value="components" className="data-[state=active]:bg-[#009C4A] data-[state=active]:text-white">
              Salary Components
            </TabsTrigger>
            <TabsTrigger value="overview" className="data-[state=active]:bg-[#009C4A] data-[state=active]:text-white">
              Overview
            </TabsTrigger>
          </TabsList>
          <Button className="bg-[#009C4A] hover:bg-[#008040] text-white" onClick={() => setShowCreateRunDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> Run Payroll
          </Button>
        </div>

        {/* Payroll Runs */}
        <TabsContent value="runs">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card className="border-l-4 border-l-[#009C4A]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Total Runs</p>
                    <p className="text-2xl font-bold">{payrollRuns.length}</p>
                  </div>
                  <FileText className="h-8 w-8 text-[#009C4A]/40" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Completed</p>
                    <p className="text-2xl font-bold text-green-600">
                      {payrollRuns.filter((r) => r.status === "completed").length}
                    </p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-yellow-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Draft</p>
                    <p className="text-2xl font-bold text-yellow-600">
                      {payrollRuns.filter((r) => r.status === "draft").length}
                    </p>
                  </div>
                  <Clock className="h-8 w-8 text-yellow-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Total Disbursed</p>
                    <p className="text-xl font-bold text-blue-600">₹{totalPayrollAmount.toLocaleString()}</p>
                  </div>
                  <IndianRupee className="h-8 w-8 text-blue-400" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">All Payroll Runs</CardTitle>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Employees</TableHead>
                    <TableHead>Gross</TableHead>
                    <TableHead>Deductions</TableHead>
                    <TableHead>Net Pay</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollRuns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                        <Calculator className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        No payroll runs yet. Click "Run Payroll" to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    payrollRuns
                      .filter((r) => r.title.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map((run) => (
                        <TableRow key={run.id}>
                          <TableCell className="font-medium">{run.title}</TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {format(new Date(run.pay_period_start), "MMM dd")} - {format(new Date(run.pay_period_end), "MMM dd, yyyy")}
                          </TableCell>
                          <TableCell>{run.employee_count}</TableCell>
                          <TableCell>₹{(run.total_gross || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-red-600">₹{(run.total_deductions || 0).toLocaleString()}</TableCell>
                          <TableCell className="font-bold text-[#009C4A]">₹{(run.total_net || 0).toLocaleString()}</TableCell>
                          <TableCell>{statusBadge(run.status)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => viewPayslips(run.id)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              {run.status === "draft" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-green-600"
                                  onClick={() => updateRunStatus.mutate({ id: run.id, status: "completed" })}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Salary Components */}
        <TabsContent value="components">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  Earnings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {earnings.map((comp) => (
                    <div key={comp.id} className="flex items-center justify-between p-3 border rounded-lg border-l-4 border-l-green-400">
                      <div>
                        <p className="font-medium text-sm">{comp.name}</p>
                        <p className="text-xs text-gray-500">
                          {comp.calculation_type === "percentage"
                            ? `${comp.default_amount}% of ${comp.percentage_of}`
                            : `₹${(comp.default_amount || 0).toLocaleString()}`}
                        </p>
                      </div>
                      <Badge className="bg-green-100 text-green-700">{comp.code}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Ban className="h-5 w-5 text-red-600" />
                  Deductions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {deductions.map((comp) => (
                    <div key={comp.id} className="flex items-center justify-between p-3 border rounded-lg border-l-4 border-l-red-400">
                      <div>
                        <p className="font-medium text-sm">{comp.name}</p>
                        <p className="text-xs text-gray-500">
                          {comp.calculation_type === "percentage"
                            ? `${comp.default_amount}% of ${comp.percentage_of}`
                            : `₹${(comp.default_amount || 0).toLocaleString()}`}
                        </p>
                      </div>
                      <Badge className="bg-red-100 text-red-700">{comp.code}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Overview */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Payroll Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">No payroll data yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                      <Bar dataKey="gross" fill="#22c55e" name="Gross" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="net" fill="#3b82f6" name="Net" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="deductions" fill="#ef4444" name="Deductions" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Component Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {salaryComponents.map((comp) => (
                    <div key={comp.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: comp.component_type === "earning" ? "#22c55e" : comp.component_type === "deduction" ? "#ef4444" : "#3b82f6" }}
                        />
                        <span>{comp.name}</span>
                      </div>
                      <span className="text-gray-500">{comp.code}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Payroll Run Dialog */}
      <Dialog open={showCreateRunDialog} onOpenChange={setShowCreateRunDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Run Payroll</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g. January 2026 Payroll" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Period Start</Label>
                <Input type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} />
              </div>
              <div>
                <Label>Period End</Label>
                <Input type="date" value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)} />
              </div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-sm">
              <p className="font-medium">This will generate payslips for {employees.length} active employees</p>
              <p className="text-gray-500 text-xs mt-1">Using {salaryComponents.length} salary components</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateRunDialog(false)}>Cancel</Button>
            <Button
              className="bg-[#009C4A] hover:bg-[#008040] text-white"
              onClick={() => createRunMutation.mutate()}
              disabled={!formTitle || !formStartDate || !formEndDate || createRunMutation.isPending}
            >
              {createRunMutation.isPending ? "Processing..." : "Generate Payslips"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payslips Dialog */}
      <Dialog open={showPayslipDialog} onOpenChange={setShowPayslipDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payslips</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Badge ID</TableHead>
                <TableHead>Gross</TableHead>
                <TableHead>Deductions</TableHead>
                <TableHead>Net Pay</TableHead>
                <TableHead>Working Days</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payslips.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-gray-500">No payslips</TableCell>
                </TableRow>
              ) : (
                payslips.map((ps: any) => (
                  <TableRow key={ps.id}>
                    <TableCell className="font-medium">
                      {ps.hr_employees?.first_name} {ps.hr_employees?.last_name}
                    </TableCell>
                    <TableCell className="text-gray-500">{ps.hr_employees?.badge_id}</TableCell>
                    <TableCell>₹{(ps.total_earnings || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-red-600">₹{(ps.total_deductions || 0).toLocaleString()}</TableCell>
                    <TableCell className="font-bold text-[#009C4A]">₹{(ps.net_salary || 0).toLocaleString()}</TableCell>
                    <TableCell>{ps.present_days}/{ps.working_days}</TableCell>
                    <TableCell>
                      <Badge className="bg-green-100 text-green-700">{ps.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
