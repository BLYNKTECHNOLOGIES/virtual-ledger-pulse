import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { Search, Fingerprint } from "lucide-react";

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

  const totalIn = punches.filter((p: any) => p.punch_type === "check_in" || p.raw_status === 0).length;
  const totalOut = punches.filter((p: any) => p.punch_type === "check_out" || p.raw_status === 1).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Fingerprint className="h-5 w-5" /> Raw Biometric Punches</h1>
        <p className="text-sm text-muted-foreground">View raw punch data from biometric devices</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Card className="flex-1 min-w-[100px]">
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold">{punches.length}</div>
            <div className="text-xs text-muted-foreground">Total Punches</div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[100px]">
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-green-600">{totalIn}</div>
            <div className="text-xs text-muted-foreground">Check-Ins</div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[100px]">
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-orange-600">{totalOut}</div>
            <div className="text-xs text-muted-foreground">Check-Outs</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="w-[180px]" />
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by employee or badge..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Badge</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Verified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No punches for {dateFilter}</TableCell></TableRow>
              ) : filtered.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm font-mono">{formatInTimeZone(new Date(p.punch_time), BUSINESS_TIMEZONE, "HH:mm:ss")}</TableCell>
                  <TableCell className="text-sm font-medium">{p.badge_id}</TableCell>
                  <TableCell className="text-sm">
                    {p.hr_employees ? `${p.hr_employees.first_name} ${p.hr_employees.last_name}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.punch_type === "check_in" || p.raw_status === 0 ? "default" : "secondary"} className="text-xs">
                      {p.punch_type || (p.raw_status === 0 ? "Check-In" : p.raw_status === 1 ? "Check-Out" : `Status ${p.raw_status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.device_name || p.device_serial || "—"}</TableCell>
                  <TableCell>{p.verified ? "✓" : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
