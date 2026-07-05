import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { Search, Fingerprint } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";

const BUSINESS_TIMEZONE = "Asia/Kolkata";

const getBusinessDayBounds = (dateValue: string) => {
  const [year, month, day] = dateValue.split("-").map(Number);
  return {
    startOfDay: fromZonedTime(new Date(year, month - 1, day, 0, 0, 0, 0), BUSINESS_TIMEZONE).toISOString(),
    endOfDay: fromZonedTime(new Date(year, month - 1, day, 23, 59, 59, 999), BUSINESS_TIMEZONE).toISOString(),
  };
};

export default function AttendancePunchesPage() {
  const [dateFilter, setDateFilter] = useState(format(new Date(), "yyyy-MM-dd"));
  const [search, setSearch] = useState("");

  const { data: punches = [], isLoading } = useQuery({
    queryKey: ["hr_attendance_punches", dateFilter],
    queryFn: async () => {
      const { startOfDay, endOfDay } = getBusinessDayBounds(dateFilter);
      const { data, error } = await (supabase as any).from("hr_attendance_punches")
        .select("*, hr_employees!hr_attendance_punches_employee_id_fkey(badge_id, first_name, last_name)")
        .gte("punch_time", startOfDay)
        .lte("punch_time", endOfDay)
        .order("punch_time", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const filtered = punches.filter((p: any) => {
    if (!search) return true;
    const name = p.hr_employees ? `${p.hr_employees.first_name} ${p.hr_employees.last_name} ${p.hr_employees.badge_id}` : p.badge_id;
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const punchPositions = useMemo(() => {
    const byEmployee = new Map<string, any[]>();
    for (const p of punches) {
      const key = p.employee_id || p.badge_id;
      if (!byEmployee.has(key)) byEmployee.set(key, []);
      byEmployee.get(key)!.push(p);
    }
    const map = new Map<string, "check_in" | "check_out" | "intermediate">();
    for (const [, empPunches] of byEmployee) {
      empPunches.sort((a: any, b: any) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime());
      empPunches.forEach((p: any, i: number) => {
        if (i === 0) map.set(p.id, "check_in");
        else if (i === empPunches.length - 1) map.set(p.id, "check_out");
        else map.set(p.id, "intermediate");
      });
    }
    return map;
  }, [punches]);

  const totalIn = [...punchPositions.values()].filter(v => v === "check_in").length;
  const totalOut = [...punchPositions.values()].filter(v => v === "check_out").length;

  return (
    <div className="p-4 md:p-6 space-y-6 page-mount">
      <PageHeader
        title={<span className="flex items-center gap-2"><Fingerprint className="h-5 w-5" /> Raw Biometric Punches</span>}
        description="View raw punch data from biometric devices"
      />

      <div className="flex gap-3 flex-wrap">
        <Card className="flex-1 min-w-[100px]">
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold tabular-nums">{punches.length}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Punches</div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[100px]">
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-success tabular-nums">{totalIn}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Check-Ins</div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[100px]">
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-warning tabular-nums">{totalOut}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Check-Outs</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="w-44 h-9" />
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by employee or badge..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} columns={6} />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  {["Time", "Badge", "Employee", "Type", "Device", "Verified"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState icon={Fingerprint} title={`No punches for ${dateFilter}`} description="No biometric punch data found for the selected date." /></td></tr>
                ) : filtered.map((p: any) => {
                  const pos = punchPositions.get(p.id);
                  return (
                    <tr key={p.id} className="border-b hover:bg-muted/50">
                      <td className="px-4 py-3 font-mono tabular-nums text-sm">{formatInTimeZone(new Date(p.punch_time), BUSINESS_TIMEZONE, "HH:mm:ss")}</td>
                      <td className="px-4 py-3 font-medium">{p.badge_id}</td>
                      <td className="px-4 py-3">
                        {p.hr_employees ? `${p.hr_employees.first_name} ${p.hr_employees.last_name}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                          pos === "check_in" ? "bg-success/10 text-success border-success/20" :
                          pos === "check_out" ? "bg-muted text-muted-foreground border-border" :
                          "bg-info/10 text-info border-info/20"
                        }`}>
                          {pos === "check_in" ? "Check-In" : pos === "check_out" ? "Check-Out" : "Intermediate"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{p.device_name || p.device_serial || "—"}</td>
                      <td className="px-4 py-3">{p.verified ? "✓" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
