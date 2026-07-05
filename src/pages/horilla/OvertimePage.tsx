import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";

export default function OvertimePage() {
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["hr_overtime", month],
    queryFn: async () => {
      const startDate = `${month}-01`;
      const endDate = `${month}-31`;
      return await fetchAllPaginated<any>(() => supabase
        .from("hr_attendance")
        .select("*, hr_employees!hr_attendance_employee_id_fkey(badge_id, first_name, last_name)")
        .gte("attendance_date", startDate)
        .lte("attendance_date", endDate)
        .gt("overtime_hours", 0)
        .order("attendance_date", { ascending: false }));
    },
  });

  const filtered = records.filter((r: any) => {
    const q = search.toLowerCase();
    const fullName = `${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.toLowerCase();
    return fullName.includes(q) || r.hr_employees?.badge_id?.toLowerCase().includes(q);
  });

  const totalOT = filtered.reduce((sum: number, r: any) => sum + (r.overtime_hours || 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-6 page-mount">
      <PageHeader title="Overtime Records" description="Track employee overtime hours" />

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/10"><Clock className="h-5 w-5 text-warning" /></div>
            <div><p className="text-2xl font-bold tabular-nums">{totalOT.toFixed(1)}h</p><p className="text-xs text-muted-foreground uppercase tracking-wide">Total OT Hours</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-info/10"><Clock className="h-5 w-5 text-info" /></div>
            <div><p className="text-2xl font-bold tabular-nums">{filtered.length}</p><p className="text-xs text-muted-foreground uppercase tracking-wide">OT Records</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44 h-9" />
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} columns={7} />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  {["Employee", "ID", "Department", "Date", "OT Hours", "Check In", "Check Out"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState icon={Clock} title="No overtime records" description="No overtime found for the selected month." /></td></tr>
                ) : (
                  filtered.map((r: any) => (
                    <tr key={r.id} className="border-b hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">{r.hr_employees?.first_name} {r.hr_employees?.last_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.hr_employees?.badge_id}</td>
                      <td className="px-4 py-3 text-muted-foreground">—</td>
                      <td className="px-4 py-3 tabular-nums">{r.attendance_date}</td>
                      <td className="px-4 py-3 tabular-nums"><span className="font-semibold text-warning">{r.overtime_hours}h</span></td>
                      <td className="px-4 py-3 tabular-nums">{r.check_in || "—"}</td>
                      <td className="px-4 py-3 tabular-nums">{r.check_out || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
