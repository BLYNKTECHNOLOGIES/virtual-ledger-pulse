import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Laptop, CheckCircle, Wrench, Archive, Users, TrendingUp } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

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
    { label: "Available", value: statusCounts.available, icon: CheckCircle, color: "text-green-600" },
    { label: "Assigned", value: statusCounts.assigned, icon: Users, color: "text-blue-600" },
    { label: "Maintenance", value: statusCounts.maintenance, icon: Wrench, color: "text-yellow-600" },
    { label: "Retired", value: statusCounts.retired, icon: Archive, color: "text-gray-500" },
    { label: "Total Value", value: `₹${totalValue.toLocaleString()}`, icon: TrendingUp, color: "text-purple-600" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Asset Dashboard</h1>
        <p className="text-sm text-gray-500">Overview of company assets and equipment</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <s.icon className={`h-6 w-6 mx-auto mb-2 ${s.color}`} />
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Status Distribution</CardTitle></CardHeader>
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
          <CardHeader><CardTitle className="text-sm">Assets by Type</CardTitle></CardHeader>
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
        <CardHeader><CardTitle className="text-sm">Recent Assignments</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Asset", "Employee", "Date", "Status"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentAssignments.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-6 text-gray-400">No assignments yet</td></tr>
              ) : (
                recentAssignments.map((a: any) => (
                  <tr key={a.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{a.hr_assets?.name || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{a.hr_employees?.employee_name || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{a.assigned_date}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>
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
