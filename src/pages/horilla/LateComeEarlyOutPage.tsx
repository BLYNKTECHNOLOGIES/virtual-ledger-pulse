import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Clock, AlertTriangle, Search, TrendingDown } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";

export default function LateComeEarlyOutPage() {
  const now = new Date();
  const [monthFilter, setMonthFilter] = useState(format(now, "yyyy-MM"));
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const monthStart = format(startOfMonth(new Date(monthFilter + "-01")), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date(monthFilter + "-01")), "yyyy-MM-dd");

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["hr_late_come_early_out", monthFilter, typeFilter],
    queryFn: async () => {
      return await fetchAllPaginated<any>(() => {
        let query = (supabase as any)
          .from("hr_late_come_early_out")
          .select("*, hr_employees!hr_late_come_early_out_employee_id_fkey(badge_id, first_name, last_name)")
          .gte("attendance_date", monthStart)
          .lte("attendance_date", monthEnd)
          .order("attendance_date", { ascending: false });
        if (typeFilter !== "all") query = query.eq("type", typeFilter);
        return query;
      });
    },
  });

  const filtered = records.filter((r: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = `${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.toLowerCase();
    return name.includes(q) || r.hr_employees?.badge_id?.toLowerCase().includes(q);
  });

  // Compute summary by employee
  const employeeSummary: Record<string, { name: string; badge: string; lateCount: number; earlyCount: number; totalLateMins: number; totalEarlyMins: number }> = {};
  filtered.forEach((r: any) => {
    const empId = r.employee_id;
    if (!employeeSummary[empId]) {
      employeeSummary[empId] = {
        name: `${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`,
        badge: r.hr_employees?.badge_id || "",
        lateCount: 0, earlyCount: 0, totalLateMins: 0, totalEarlyMins: 0,
      };
    }
    if (r.type === "late_come") {
      employeeSummary[empId].lateCount++;
      employeeSummary[empId].totalLateMins += r.late_minutes || 0;
    } else {
      employeeSummary[empId].earlyCount++;
      employeeSummary[empId].totalEarlyMins += r.early_minutes || 0;
    }
  });

  const summaryList = Object.entries(employeeSummary)
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => (b.lateCount + b.earlyCount) - (a.lateCount + a.earlyCount));

  const totalLateRecords = filtered.filter((r: any) => r.type === "late_come").length;
  const totalEarlyRecords = filtered.filter((r: any) => r.type === "early_out").length;

  // Generate month options
  const monthOptions: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthOptions.push(format(d, "yyyy-MM"));
  }

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Late Come & Early Out"
        description="Track and report late arrivals and early departures with penalty linkage"
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m} value={m}>{format(new Date(m + "-01"), "MMMM yyyy")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="late_come">Late Come</SelectItem>
            <SelectItem value="early_out">Early Out</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-warning/10 rounded-lg"><Clock className="h-5 w-5 text-warning" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Late Comes</p>
              <p className="text-xl font-bold text-warning tabular-nums">{totalLateRecords}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-destructive/10 rounded-lg"><TrendingDown className="h-5 w-5 text-destructive" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Early Outs</p>
              <p className="text-xl font-bold text-destructive tabular-nums">{totalEarlyRecords}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-warning/10 rounded-lg"><AlertTriangle className="h-5 w-5 text-warning" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Employees Affected</p>
              <p className="text-xl font-bold text-warning tabular-nums">{summaryList.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList>
          <TabsTrigger value="summary">Employee Summary</TabsTrigger>
          <TabsTrigger value="details">All Records</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly Summary — {format(new Date(monthFilter + "-01"), "MMMM yyyy")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {summaryList.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title="No records for this month"
                  description="No late come or early out incidents were recorded."
                />
              ) : (
                <table className="w-full text-sm min-w-[600px]">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      {["Employee", "Badge ID", "Late Count", "Total Late (min)", "Early Out Count", "Total Early (min)", "Total Incidents"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summaryList.map((s) => (
                      <tr key={s.id} className="border-b hover:bg-muted/50">
                        <td className="px-4 py-3 font-medium">{s.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{s.badge}</td>
                        <td className="px-4 py-3 tabular-nums">
                          {s.lateCount > 0 ? (
                            <span className="bg-warning/10 text-warning border border-warning/20 rounded-full px-2 py-0.5 text-[10px] font-medium">{s.lateCount}</span>
                          ) : <span className="text-muted-foreground">0</span>}
                        </td>
                        <td className="px-4 py-3 text-warning font-medium tabular-nums">{s.totalLateMins || "—"}</td>
                        <td className="px-4 py-3 tabular-nums">
                          {s.earlyCount > 0 ? (
                            <span className="bg-destructive/10 text-destructive border border-destructive/20 rounded-full px-2 py-0.5 text-[10px] font-medium">{s.earlyCount}</span>
                          ) : <span className="text-muted-foreground">0</span>}
                        </td>
                        <td className="px-4 py-3 text-destructive font-medium tabular-nums">{s.totalEarlyMins || "—"}</td>
                        <td className="px-4 py-3 font-bold tabular-nums">{s.lateCount + s.earlyCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Records — {filtered.length} entries</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {isLoading ? (
                <div className="p-4">
                  <TableSkeleton rows={6} columns={5} />
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={TrendingDown}
                  title="No records"
                  description="No attendance incidents found for the selected filters."
                />
              ) : (
                <table className="w-full text-sm min-w-[600px]">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      {["Date", "Employee", "Badge ID", "Type", "Minutes"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r: any) => (
                      <tr key={r.id} className="border-b hover:bg-muted/50">
                        <td className="px-4 py-3 tabular-nums">{r.attendance_date}</td>
                        <td className="px-4 py-3 font-medium">{r.hr_employees?.first_name} {r.hr_employees?.last_name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.hr_employees?.badge_id}</td>
                        <td className="px-4 py-3">
                          <span className={`border rounded-full px-2 py-0.5 text-[10px] font-medium ${r.type === "late_come" ? "bg-warning/10 text-warning border-warning/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
                            {r.type === "late_come" ? "Late Come" : "Early Out"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium tabular-nums">
                          {r.type === "late_come" ? r.late_minutes : r.early_minutes} min
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
