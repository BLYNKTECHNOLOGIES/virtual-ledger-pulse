import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Clock } from "lucide-react";

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
      const { data, error } = await supabase
        .from("hr_attendance")
        .select("*, hr_employees!hr_attendance_employee_id_fkey(employee_id, name, department)")
        .gte("attendance_date", startDate)
        .lte("attendance_date", endDate)
        .gt("overtime_hours", 0)
        .order("attendance_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = records.filter((r: any) => {
    const q = search.toLowerCase();
    return r.hr_employees?.name?.toLowerCase().includes(q) || r.hr_employees?.employee_id?.toLowerCase().includes(q);
  });

  const totalOT = filtered.reduce((sum: number, r: any) => sum + (r.overtime_hours || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Overtime Records</h1>
        <p className="text-sm text-gray-500">Track employee overtime hours</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-50"><Clock className="h-5 w-5 text-orange-600" /></div>
            <div><p className="text-2xl font-bold">{totalOT.toFixed(1)}h</p><p className="text-xs text-gray-500">Total OT Hours</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50"><Clock className="h-5 w-5 text-blue-600" /></div>
            <div><p className="text-2xl font-bold">{filtered.length}</p><p className="text-xs text-gray-500">OT Records</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Employee", "ID", "Department", "Date", "OT Hours", "Check In", "Check Out"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">No overtime records</td></tr>
              ) : (
                filtered.map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.hr_employees?.name}</td>
                    <td className="px-4 py-3 text-gray-500">{r.hr_employees?.employee_id}</td>
                    <td className="px-4 py-3 text-gray-500">{r.hr_employees?.department}</td>
                    <td className="px-4 py-3">{r.attendance_date}</td>
                    <td className="px-4 py-3"><span className="font-semibold text-orange-600">{r.overtime_hours}h</span></td>
                    <td className="px-4 py-3">{r.check_in || "—"}</td>
                    <td className="px-4 py-3">{r.check_out || "—"}</td>
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
