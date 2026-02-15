import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

export default function PayslipsPage() {
  const [search, setSearch] = useState("");
  const [runFilter, setRunFilter] = useState("all");

  const { data: runs = [] } = useQuery({
    queryKey: ["hr_payroll_runs_list"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_payroll_runs").select("id, title").order("run_date", { ascending: false });
      return data || [];
    },
  });

  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ["hr_payslips", runFilter],
    queryFn: async () => {
      const query: any = supabase.from("hr_payslips")
        .select("*, hr_employees!hr_payslips_employee_id_fkey(employee_id, name, department), hr_payroll_runs!hr_payslips_payroll_run_id_fkey(title)")
        .order("created_at", { ascending: false });
      const { data, error } = runFilter !== "all" ? await query.eq("payroll_run_id", runFilter) : await query;
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const filtered = payslips.filter((p: any) => {
    const q = search.toLowerCase();
    return p.hr_employees?.name?.toLowerCase().includes(q) || p.hr_employees?.employee_id?.toLowerCase().includes(q);
  });

  const statusColor = (s: string) => {
    if (s === "paid") return "bg-green-100 text-green-700";
    if (s === "pending") return "bg-yellow-100 text-yellow-700";
    return "bg-gray-100 text-gray-700";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payslips</h1>
        <p className="text-sm text-gray-500">View individual employee payslips</p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={runFilter} onValueChange={setRunFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All Payroll Runs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payroll Runs</SelectItem>
            {runs.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Employee", "ID", "Department", "Payroll Run", "Gross", "Deductions", "Net Salary", "Days", "Status"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">No payslips found</td></tr>
              ) : (
                filtered.map((p: any) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{p.hr_employees?.name}</td>
                    <td className="px-4 py-3 text-gray-500">{p.hr_employees?.employee_id}</td>
                    <td className="px-4 py-3 text-gray-500">{p.hr_employees?.department}</td>
                    <td className="px-4 py-3 text-xs">{p.hr_payroll_runs?.title}</td>
                    <td className="px-4 py-3 text-green-700">₹{p.gross_salary?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-red-600">₹{p.total_deductions?.toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold">₹{p.net_salary?.toLocaleString()}</td>
                    <td className="px-4 py-3">{p.present_days || 0}/{p.working_days || 0}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(p.status || "draft")}`}>{p.status || "draft"}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
