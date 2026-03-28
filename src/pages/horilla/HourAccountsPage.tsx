import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, RefreshCw, Search, Timer, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const MONTHS = [
  { value: 1, label: "January" }, { value: 2, label: "February" }, { value: 3, label: "March" },
  { value: 4, label: "April" }, { value: 5, label: "May" }, { value: 6, label: "June" },
  { value: 7, label: "July" }, { value: 8, label: "August" }, { value: 9, label: "September" },
  { value: 10, label: "October" }, { value: 11, label: "November" }, { value: 12, label: "December" },
];

function formatHHMM(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function HourAccountsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const { data: accounts = [], isLoading, refetch } = useQuery({
    queryKey: ["hr_hour_accounts", year, month],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_hour_accounts")
        .select("*, hr_employees!hr_hour_accounts_employee_id_fkey(id, badge_id, first_name, last_name, department)")
        .eq("year", year)
        .eq("month_sequence", month)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { error } = await (supabase as any).rpc("refresh_hour_accounts", {
        p_year: year,
        p_month: month,
      });
      if (error) throw error;
      await refetch();
      toast.success(`Hour accounts refreshed for ${MONTHS[month - 1].label} ${year}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  };

  const filtered = accounts.filter((a: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = `${a.hr_employees?.first_name || ""} ${a.hr_employees?.last_name || ""}`.toLowerCase();
    return name.includes(q) || a.hr_employees?.badge_id?.toLowerCase().includes(q);
  });

  // Summary stats
  const totalWorked = filtered.reduce((s: number, a: any) => s + (a.hour_account_second || 0), 0);
  const totalPending = filtered.reduce((s: number, a: any) => s + (a.hour_pending_second || 0), 0);
  const totalOvertime = filtered.reduce((s: number, a: any) => s + (a.overtime_second || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hour Accounts</h1>
          <p className="text-sm text-gray-500">Monthly worked hours, pending hours & overtime tracking</p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh Data"}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MONTHS.map((m) => (
              <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[year - 1, year, year + 1].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg"><Clock className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Total Worked</p>
              <p className="text-xl font-bold text-green-700">{formatHHMM(totalWorked)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-orange-50 rounded-lg"><AlertTriangle className="h-5 w-5 text-orange-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Total Pending</p>
              <p className="text-xl font-bold text-orange-700">{formatHHMM(totalPending)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg"><Timer className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Total Overtime</p>
              <p className="text-xl font-bold text-blue-700">{formatHHMM(totalOvertime)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {MONTHS[month - 1].label} {year} — {filtered.length} Employee(s)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Employee", "Badge ID", "Worked Hours", "Pending Hours", "Overtime", "Status"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">
                  No hour account data. Click "Refresh Data" to compute from attendance records.
                </td></tr>
              ) : (
                filtered.map((a: any) => {
                  const hasPending = (a.hour_pending_second || 0) > 0;
                  const hasOT = (a.overtime_second || 0) > 0;
                  return (
                    <tr key={a.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">
                        {a.hr_employees?.first_name} {a.hr_employees?.last_name}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{a.hr_employees?.badge_id}</td>
                      <td className="px-4 py-3 font-medium text-green-700">{a.worked_hours || "00:00"}</td>
                      <td className="px-4 py-3">
                        <span className={hasPending ? "text-orange-600 font-medium" : "text-gray-400"}>
                          {a.pending_hours || "00:00"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={hasOT ? "text-blue-600 font-medium" : "text-gray-400"}>
                          {a.overtime || "00:00"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {hasPending ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Deficit</span>
                        ) : hasOT ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Overtime</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">On Track</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
