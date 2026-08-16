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
import { Clock, AlertTriangle, Search, TrendingDown, ChevronRight, Download } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import EmployeeIncidentsDialog from "@/components/hrms/attendance/EmployeeIncidentsDialog";
import { useViewMode } from "@/hooks/useViewMode";
import { ViewToggle } from "@/components/hrms/ViewToggle";
import { Button } from "@/components/ui/button";

export default function LateComeEarlyOutPage() {
  const now = new Date();
  const [monthFilter, setMonthFilter] = useState(format(now, "yyyy-MM"));
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedEmp, setSelectedEmp] = useState<{ id: string; name: string; badge: string } | null>(null);
  const [viewMode, setViewMode] = useViewMode("late-early");
  const [activeTab, setActiveTab] = useState("summary");

  const monthStart = format(startOfMonth(new Date(monthFilter + "-01")), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date(monthFilter + "-01")), "yyyy-MM-dd");

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["hr_late_come_early_out", monthFilter, typeFilter],
    queryFn: async () => {
      // Self-heal: rebuild the register for this month from attendance truth
      // before reading, so trigger gaps never leave the page blank.
      await (supabase as any).rpc("hr_reconcile_late_early", {
        _from: monthStart,
        _to: monthEnd,
      });
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
  }).sort((a: any, b: any) => {
    const aName = `${a.hr_employees?.first_name || ""} ${a.hr_employees?.last_name || ""}`.trim();
    const bName = `${b.hr_employees?.first_name || ""} ${b.hr_employees?.last_name || ""}`.trim();
    return aName.localeCompare(bName, undefined, { sensitivity: "base" });
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
    .sort((a, b) => a.name.trim().localeCompare(b.name.trim(), undefined, { sensitivity: "base" }));

  const totalLateRecords = filtered.filter((r: any) => r.type === "late_come").length;
  const totalEarlyRecords = filtered.filter((r: any) => r.type === "early_out").length;

  // Generate month options
  const monthOptions: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthOptions.push(format(d, "yyyy-MM"));
  }

  const downloadCsv = (rows: (string | number)[][], filename: string) => {
    const csv = rows
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    if (activeTab === "summary") {
      downloadCsv(
        [
          ["Employee", "Badge ID", "Late Count", "Total Late (min)", "Early Out Count", "Total Early (min)", "Total Incidents"],
          ...summaryList.map((s) => [
            s.name.trim(), s.badge, s.lateCount, s.totalLateMins || 0, s.earlyCount, s.totalEarlyMins || 0, s.lateCount + s.earlyCount,
          ]),
        ],
        `late-early-summary-${monthFilter}.csv`
      );
    } else {
      downloadCsv(
        [
          ["Date", "Employee", "Badge ID", "Type", "Minutes"],
          ...filtered.map((r: any) => [
            r.attendance_date,
            `${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.trim(),
            r.hr_employees?.badge_id || "",
            r.type === "late_come" ? "Late Come" : "Early Out",
            (r.type === "late_come" ? r.late_minutes : r.early_minutes) || 0,
          ]),
        ],
        `late-early-records-${monthFilter}.csv`
      );
    }
  };

  const isTable = viewMode === "table";

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Late Come & Early Out"
        description="Track and report late arrivals and early departures with penalty linkage"
        actions={
          <div className="flex items-center gap-2">
            <ViewToggle value={viewMode} onChange={setViewMode} />
            <Button variant="outline" size="sm" className="h-9" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1.5" /> Export CSV
            </Button>
          </div>
        }
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
      {!isTable && (
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
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">

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
                <>
                  {/* Mobile */}
                  <div className={isTable ? "hidden" : "md:hidden divide-y"}>

                    {summaryList.map((s) => (
                      <div
                        key={s.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedEmp({ id: s.id, name: s.name, badge: s.badge })}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedEmp({ id: s.id, name: s.name, badge: s.badge }); } }}
                        className="p-3 space-y-2 cursor-pointer active:bg-muted/50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{s.name}</div>
                            <div className="text-xs text-muted-foreground">{s.badge}</div>
                          </div>
                          <span className="font-bold tabular-nums text-sm shrink-0">{s.lateCount + s.earlyCount}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center justify-between p-2 rounded bg-warning/5">
                            <span className="text-warning font-medium">Late</span>
                            <span className="tabular-nums">{s.lateCount} · {s.totalLateMins || 0}m</span>
                          </div>
                          <div className="flex items-center justify-between p-2 rounded bg-destructive/5">
                            <span className="text-destructive font-medium">Early</span>
                            <span className="tabular-nums">{s.earlyCount} · {s.totalEarlyMins || 0}m</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop */}
                  <table className={`${isTable ? "table" : "hidden md:table"} w-full text-sm min-w-[600px]`}>
                    <thead className="bg-card sticky top-0 z-10 border-b">

                      <tr>
                        {["Employee", "Badge ID", "Late Count", "Total Late (min)", "Early Out Count", "Total Early (min)", "Total Incidents", ""].map((h, i) => (
                          <th key={h || `col-${i}`} className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summaryList.map((s) => (
                        <tr
                          key={s.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedEmp({ id: s.id, name: s.name, badge: s.badge })}
                          onKeyDown={(e) => { if (e.key === "Enter") setSelectedEmp({ id: s.id, name: s.name, badge: s.badge }); }}
                          className={`border-b hover:bg-muted/50 cursor-pointer ${isTable ? "even:bg-muted/20" : ""}`}
                        >
                          <td className="px-4 py-3 font-medium">{s.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{s.badge}</td>
                          <td className="px-4 py-3 tabular-nums">
                            {isTable ? (
                              s.lateCount
                            ) : s.lateCount > 0 ? (
                              <span className="bg-warning/10 text-warning border border-warning/20 rounded-full px-2 py-0.5 text-[10px] font-medium">{s.lateCount}</span>
                            ) : <span className="text-muted-foreground">0</span>}
                          </td>
                          <td className={`px-4 py-3 font-medium tabular-nums ${isTable ? "" : "text-warning"}`}>{s.totalLateMins || (isTable ? 0 : "—")}</td>
                          <td className="px-4 py-3 tabular-nums">
                            {isTable ? (
                              s.earlyCount
                            ) : s.earlyCount > 0 ? (
                              <span className="bg-destructive/10 text-destructive border border-destructive/20 rounded-full px-2 py-0.5 text-[10px] font-medium">{s.earlyCount}</span>
                            ) : <span className="text-muted-foreground">0</span>}
                          </td>
                          <td className={`px-4 py-3 font-medium tabular-nums ${isTable ? "" : "text-destructive"}`}>{s.totalEarlyMins || (isTable ? 0 : "—")}</td>

                          <td className="px-4 py-3 font-bold tabular-nums">{s.lateCount + s.earlyCount}</td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setSelectedEmp({ id: s.id, name: s.name, badge: s.badge }); }}
                              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-primary hover:bg-muted"
                            >
                              View <ChevronRight className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
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
                <>
                  {/* Mobile */}
                  <div className={isTable ? "hidden" : "md:hidden divide-y"}>
                    {filtered.map((r: any) => (
                      <div key={r.id} className="p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{r.hr_employees?.first_name} {r.hr_employees?.last_name}</div>
                          <div className="text-xs text-muted-foreground tabular-nums">{r.hr_employees?.badge_id} · {r.attendance_date}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`border rounded-full px-2 py-0.5 text-[10px] font-medium ${r.type === "late_come" ? "bg-warning/10 text-warning border-warning/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
                            {r.type === "late_come" ? "Late" : "Early"}
                          </span>
                          <span className="font-medium tabular-nums text-xs">{r.type === "late_come" ? r.late_minutes : r.early_minutes}m</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop */}
                  <table className={`${isTable ? "table" : "hidden md:table"} w-full text-sm min-w-[600px]`}>
                    <thead className="bg-card sticky top-0 z-10 border-b">
                      <tr>
                        {["Date", "Employee", "Badge ID", "Type", "Minutes"].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r: any) => (
                        <tr key={r.id} className={`border-b hover:bg-muted/50 ${isTable ? "even:bg-muted/20" : ""}`}>
                          <td className="px-4 py-3 tabular-nums">{r.attendance_date}</td>
                          <td className="px-4 py-3 font-medium">{r.hr_employees?.first_name} {r.hr_employees?.last_name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{r.hr_employees?.badge_id}</td>
                          <td className="px-4 py-3">
                            {isTable ? (
                              r.type === "late_come" ? "Late Come" : "Early Out"
                            ) : (
                              <span className={`border rounded-full px-2 py-0.5 text-[10px] font-medium ${r.type === "late_come" ? "bg-warning/10 text-warning border-warning/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
                                {r.type === "late_come" ? "Late Come" : "Early Out"}
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 font-medium tabular-nums">
                            {r.type === "late_come" ? r.late_minutes : r.early_minutes} min
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <EmployeeIncidentsDialog
        open={!!selectedEmp}
        onOpenChange={(o) => { if (!o) setSelectedEmp(null); }}
        employeeId={selectedEmp?.id ?? null}
        employeeName={selectedEmp?.name ?? ""}
        badgeId={selectedEmp?.badge ?? ""}
        monthStart={monthStart}
        monthEnd={monthEnd}
        monthLabel={format(new Date(monthFilter + "-01"), "MMMM yyyy")}
        records={selectedEmp ? filtered.filter((r: any) => r.employee_id === selectedEmp.id) : []}
      />
    </div>
  );
}
