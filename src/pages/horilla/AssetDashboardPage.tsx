import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Laptop, CheckCircle, Wrench, Archive, Users, TrendingUp } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { PageHeader } from "@/components/shared/PageHeader";

const COLORS = ["#22c55e", "#3b82f6", "#eab308", "#6b7280"];

export default function AssetDashboardPage() {
  const { data: assets = [] } = useQuery({
    queryKey: ["hr_assets_dashboard"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_assets").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: recentAssignments = [] } = useQuery({
    queryKey: ["hr_asset_assignments_recent"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_asset_assignments")
        .select("*, hr_assets(name), hr_employees(employee_name)")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
  });

  const statusCounts = {
    available: assets.filter((a: any) => a.status === "available").length,
    assigned: assets.filter((a: any) => a.status === "assigned").length,
    maintenance: assets.filter((a: any) => a.status === "maintenance").length,
    retired: assets.filter((a: any) => a.status === "retired").length,
  };

  const typeCounts = assets.reduce((acc: any, a: any) => {
    acc[a.asset_type] = (acc[a.asset_type] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  const barData = Object.entries(typeCounts).map(([name, value]) => ({ name, count: value }));
  const totalValue = assets.reduce((s: number, a: any) => s + (a.purchase_cost || 0), 0);

  const stats = [
    { label: "Total Assets", value: assets.length, icon: Laptop, color: "text-[#E8604C]" },
    { label: "Available", value: statusCounts.available, icon: CheckCircle, color: "text-success" },
    { label: "Assigned", value: statusCounts.assigned, icon: Users, color: "text-info" },
    { label: "Maintenance", value: statusCounts.maintenance, icon: Wrench, color: "text-warning" },
    { label: "Retired", value: statusCounts.retired, icon: Archive, color: "text-muted-foreground" },
    { label: "Total Value", value: `₹${totalValue.toLocaleString('en-IN')}`, icon: TrendingUp, color: "text-primary" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader title="Asset Dashboard" description="Overview of company assets and equipment" />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <s.icon className={`h-6 w-6 mx-auto mb-2 ${s.color}`} />
              <p className="text-2xl font-bold tabular-nums">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Status Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Assets by Type</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#E8604C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Recent Assignments</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {["Asset", "Employee", "Date", "Status"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentAssignments.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-6 text-muted-foreground text-sm">No assignments yet</td></tr>
              ) : (
                recentAssignments.map((a: any) => (
                  <tr key={a.id} className="border-b hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium">{a.hr_assets?.name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.hr_employees?.employee_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{a.assigned_date}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${a.status === "active" ? "bg-success/10 text-success border-success/20" : "bg-muted text-foreground border-border"}`}>
                        {a.status}
                      </span>
                    </td>
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
