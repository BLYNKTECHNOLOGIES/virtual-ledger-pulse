import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Clock, CalendarDays, AlertTriangle, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function MonthlyHoursSummaryPage() {
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: summaries = [], isLoading } = useQuery({
    queryKey: ["hr_monthly_hours_summary", month],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_monthly_hours_summary")
        .select("*")
        .eq("month", month);
      return (data as any[]) || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_for_hours"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_employees")
        .select("id, badge_id, first_name, last_name")
        .eq("is_active", true);
      return (data as any[]) || [];
    },
  });

  const enriched = useMemo(() => {
    return summaries.map((s: any) => {
      const emp = employees.find((e: any) => e.id === s.employee_id);
      return { ...s, employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "Unknown", badge_id: emp?.badge_id };
    }).filter((s: any) =>
      !search || s.employee_name.toLowerCase().includes(search.toLowerCase()) || s.badge_id?.toLowerCase().includes(search.toLowerCase())
    );
  }, [summaries, employees, search]);

  const totals = useMemo(() => ({
    totalWorked: enriched.reduce((a: number, s: any) => a + (s.total_worked_hours || 0), 0),
    totalOvertime: enriched.reduce((a: number, s: any) => a + (s.total_overtime_hours || 0), 0),
    totalLate: enriched.reduce((a: number, s: any) => a + (s.late_count || 0), 0),
    totalAbsent: enriched.reduce((a: number, s: any) => a + (s.absent_days || 0), 0),
  }), [enriched]);

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Monthly Hours Summary</h1>
        <p className="text-sm text-muted-foreground">Aggregated attendance metrics per employee per month</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Total Worked Hours</div>
          <div className="text-2xl font-bold text-foreground flex items-center gap-2"><Clock className="h-5 w-5 text-primary" />{totals.totalWorked.toFixed(1)}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Total Overtime</div>
          <div className="text-2xl font-bold text-foreground flex items-center gap-2"><TrendingUp className="h-5 w-5 text-green-500" />{totals.totalOvertime.toFixed(1)}h</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Total Late Arrivals</div>
          <div className="text-2xl font-bold text-foreground flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-yellow-500" />{totals.totalLate}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Total Absent Days</div>
          <div className="text-2xl font-bold text-foreground flex items-center gap-2"><CalendarDays className="h-5 w-5 text-red-500" />{totals.totalAbsent}</div>
        </CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {enriched.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Hours Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={enriched.slice(0, 20)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="employee_name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total_worked_hours" fill="hsl(var(--primary))" name="Worked" />
                <Bar dataKey="total_overtime_hours" fill="#22c55e" name="Overtime" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Employee</th>
                  <th className="text-center p-3 font-medium">Present</th>
                  <th className="text-center p-3 font-medium">Absent</th>
                  <th className="text-center p-3 font-medium">Worked (h)</th>
                  <th className="text-center p-3 font-medium">Overtime (h)</th>
                  <th className="text-center p-3 font-medium">Late</th>
                  <th className="text-center p-3 font-medium">Early Out</th>
                  <th className="text-center p-3 font-medium">Late Min</th>
                  <th className="text-center p-3 font-medium">Early Min</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : enriched.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No data for {month}</td></tr>
                ) : (
                  enriched.map((s: any, i: number) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{s.employee_name}<div className="text-xs text-muted-foreground">{s.badge_id}</div></td>
                      <td className="text-center p-3">{s.present_days ?? 0}</td>
                      <td className="text-center p-3 text-red-600">{s.absent_days ?? 0}</td>
                      <td className="text-center p-3">{(s.total_worked_hours ?? 0).toFixed(1)}</td>
                      <td className="text-center p-3 text-green-600">{(s.total_overtime_hours ?? 0).toFixed(1)}</td>
                      <td className="text-center p-3 text-yellow-600">{s.late_count ?? 0}</td>
                      <td className="text-center p-3 text-orange-600">{s.early_out_count ?? 0}</td>
                      <td className="text-center p-3">{s.total_late_minutes ?? 0}</td>
                      <td className="text-center p-3">{s.total_early_minutes ?? 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
