import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, CheckCircle, Clock, XCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function LeaveDashboardPage() {
  const { data: requests = [] } = useQuery({
    queryKey: ["hr_leave_requests_all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("hr_leave_requests")
        .select("*, hr_employees!hr_leave_requests_employee_id_fkey(first_name, last_name), hr_leave_types!hr_leave_requests_leave_type_id_fkey(name, color)")
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ["hr_leave_types"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_leave_types").select("*").order("name");
      return data || [];
    },
  });

  const stats = {
    total: requests.length,
    approved: requests.filter((r: any) => r.status === "approved").length,
    pending: requests.filter((r: any) => r.status === "pending").length,
    rejected: requests.filter((r: any) => r.status === "rejected").length,
  };

  const chartData = leaveTypes.map((lt: any) => ({
    name: lt.name,
    count: requests.filter((r: any) => r.leave_type_id === lt.id).length,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Leave Dashboard</h1>
        <p className="text-sm text-gray-500">Overview of leave requests and allocations</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Requests", value: stats.total, icon: CalendarDays, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Approved", value: stats.approved, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
          { label: "Pending", value: stats.pending, icon: Clock, color: "text-yellow-600", bg: "bg-yellow-50" },
          { label: "Rejected", value: stats.rejected, icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-gray-500">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Requests by Leave Type</CardTitle></CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#E8604C" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-gray-400 py-8">No data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Recent Leave Requests</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-[280px] overflow-y-auto">
              {requests.slice(0, 10).map((r: any) => (
                <div key={r.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{r.hr_employees?.first_name} {r.hr_employees?.last_name}</p>
                    <p className="text-xs text-gray-500">{r.hr_leave_types?.name} • {r.start_date} to {r.end_date}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    r.status === "approved" ? "bg-green-100 text-green-700" :
                    r.status === "rejected" ? "bg-red-100 text-red-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>{r.status}</span>
                </div>
              ))}
              {requests.length === 0 && <p className="text-center text-gray-400 py-8">No leave requests</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
