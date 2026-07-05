import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "sonner";
import { format } from "date-fns";
import { Search, Clock, CalendarDays, AlertTriangle, TrendingUp, RefreshCw } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const toMonthValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
const formatMonthLabel = (monthValue: string) => format(new Date(`${monthValue}T00:00:00`), "MMM yyyy");

export default function MonthlyHoursSummaryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return toMonthValue(d);
  });

  const monthLabel = useMemo(() => formatMonthLabel(month), [month]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const d = new Date(`${month}T00:00:00`);
      const { error } = await (supabase as any).rpc("refresh_hour_accounts", {
        p_year: d.getFullYear(),
        p_month: d.getMonth() + 1,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["hr_monthly_hours_summary"] });
      toast.success(`Monthly hours refreshed for ${formatMonthLabel(month)}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  };


  const { data: summaries = [], isLoading } = useQuery({
    queryKey: ["hr_monthly_hours_summary", month],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_monthly_hours_summary")
        .select("*")
        .eq("month", month);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_for_hours"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employees")
        .select("id, badge_id, first_name, last_name")
        .eq("is_active", true);
      if (error) throw error;
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
    return toMonthValue(d);
  });

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Monthly Hours Summary"
        description="Aggregated attendance metrics per employee per month"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Total Worked Hours</div>
          <div className="text-2xl font-bold text-foreground flex items-center gap-2 tabular-nums"><Clock className="h-5 w-5 text-primary" />{totals.totalWorked.toFixed(1)}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Total Overtime</div>
          <div className="text-2xl font-bold text-foreground flex items-center gap-2 tabular-nums"><TrendingUp className="h-5 w-5 text-success" />{totals.totalOvertime.toFixed(1)}h</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Total Late Arrivals</div>
          <div className="text-2xl font-bold text-foreground flex items-center gap-2 tabular-nums"><AlertTriangle className="h-5 w-5 text-warning" />{totals.totalLate}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Total Absent Days</div>
          <div className="text-2xl font-bold text-foreground flex items-center gap-2 tabular-nums"><CalendarDays className="h-5 w-5 text-destructive" />{totals.totalAbsent}</div>
        </CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Select month" /></SelectTrigger>
          <SelectContent>{months.map((m) => <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>)}</SelectContent>
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
            {isLoading ? (
              <div className="p-4">
                <TableSkeleton rows={6} columns={9} />
              </div>
            ) : enriched.length === 0 ? (
              <EmptyState
                icon={Clock}
                title={`No data for ${monthLabel}`}
                description="No monthly hours summary found for the selected period."
              />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Employee</th>
                    <th className="text-center p-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Present</th>
                    <th className="text-center p-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Absent</th>
                    <th className="text-center p-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Worked (h)</th>
                    <th className="text-center p-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Overtime (h)</th>
                    <th className="text-center p-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Late</th>
                    <th className="text-center p-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Early Out</th>
                    <th className="text-center p-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Late Min</th>
                    <th className="text-center p-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Early Min</th>
                  </tr>
                </thead>
                <tbody>
                  {enriched.map((s: any, i: number) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{s.employee_name}<div className="text-xs text-muted-foreground">{s.badge_id}</div></td>
                      <td className="text-center p-3 tabular-nums">{s.present_days ?? 0}</td>
                      <td className="text-center p-3 text-destructive tabular-nums">{s.absent_days ?? 0}</td>
                      <td className="text-center p-3 tabular-nums">{(s.total_worked_hours ?? 0).toFixed(1)}</td>
                      <td className="text-center p-3 text-success tabular-nums">{(s.total_overtime_hours ?? 0).toFixed(1)}</td>
                      <td className="text-center p-3 text-warning tabular-nums">{s.late_count ?? 0}</td>
                      <td className="text-center p-3 text-warning tabular-nums">{s.early_out_count ?? 0}</td>
                      <td className="text-center p-3 tabular-nums">{s.total_late_minutes ?? 0}</td>
                      <td className="text-center p-3 tabular-nums">{s.total_early_minutes ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
