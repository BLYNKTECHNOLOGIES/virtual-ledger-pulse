import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, CheckCircle, Clock, XCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export default function LeaveDashboardPage() {
  const { data: requests = [] } = useQuery({
    queryKey: ["hr_leave_requests_all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("hr_leave_requests")
        .select("*, hr_employees!hr_leave_requests_employee_id_fkey(first_name, last_name), hr_leave_types!hr_leave_requests_leave_type_id_fkey(name, color)")
        .order("created_at", { ascending: false });
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
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Leave Dashboard"
        description="Overview of leave requests and allocations"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Requests", value: stats.total, icon: CalendarDays, color: "text-info", bg: "bg-info/10" },
          { label: "Approved", value: stats.approved, icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
          { label: "Pending", value: stats.pending, icon: Clock, color: "text-warning", bg: "bg-warning/10" },
          { label: "Rejected", value: stats.rejected, icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-2xl font-bold tabular-nums">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Requests by Leave Type</CardTitle></CardHeader>
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
              <EmptyState icon={CalendarDays} title="No data yet" description="Leave requests will appear here once submitted." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Recent Leave Requests</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-[280px] overflow-y-auto">
              {requests.slice(0, 10).map((r: any) => (
                <div key={r.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{r.hr_employees?.first_name} {r.hr_employees?.last_name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{r.hr_leave_types?.name} • {r.start_date} to {r.end_date}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                    r.status === "approved" ? "bg-success/10 text-success border-success/20" :
                    r.status === "rejected" ? "bg-destructive/10 text-destructive border-destructive/20" :
                    "bg-warning/10 text-warning border-warning/20"
                  }`}>{r.status}</span>
                </div>
              ))}
              {requests.length === 0 && (
                <EmptyState icon={CalendarDays} title="No leave requests" description="Submitted requests will appear here." />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
