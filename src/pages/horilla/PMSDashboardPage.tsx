import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Target, TrendingUp, Users, Star, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const PIE_COLORS = ["#6366f1", "#3b82f6", "#22c55e", "#ef4444"];

export default function PMSDashboardPage() {
  const [objectives, setObjectives] = useState<any[]>([]);
  const [feedbackStats, setFeedbackStats] = useState({ total: 0, pending: 0, submitted: 0, avgRating: 0 });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const [objRes, fbRes] = await Promise.all([
      (supabase as any).from("hr_objectives").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("hr_feedback_360").select("*"),
    ]);
    if (objRes.data) setObjectives(objRes.data);
    if (fbRes.data) {
      const fb = fbRes.data as any[];
      const rated = fb.filter((f: any) => f.rating);
      setFeedbackStats({
        total: fb.length,
        pending: fb.filter((f: any) => f.status === "pending").length,
        submitted: fb.filter((f: any) => f.status === "submitted").length,
        avgRating: rated.length ? +(rated.reduce((s: number, f: any) => s + f.rating, 0) / rated.length).toFixed(1) : 0,
      });
    }
    setLoading(false);
  }

  const statusCounts = objectives.reduce((acc: any, o: any) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {} as Record<string, number>);
  const pieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  const avgProgress = objectives.length ? Math.round(objectives.reduce((s: number, o: any) => s + o.progress, 0) / objectives.length) : 0;
  const typeCounts = objectives.reduce((acc: any, o: any) => { acc[o.objective_type] = (acc[o.objective_type] || 0) + 1; return acc; }, {} as Record<string, number>);
  const barData = Object.entries(typeCounts).map(([name, count]) => ({ name, count }));

  const stats = [
    { label: "Total Objectives", value: objectives.length, icon: Target, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "Avg Progress", value: `${avgProgress}%`, icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Feedback Reviews", value: feedbackStats.total, icon: Users, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Avg Rating", value: feedbackStats.avgRating || "–", icon: Star, color: "text-amber-600", bg: "bg-amber-50" },
  ];

  if (loading) return <div className="flex items-center justify-center py-24 text-gray-500">Loading PMS data...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance Management</h1>
          <p className="text-gray-500 text-sm">OKRs, objectives, and 360° feedback</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/hrms/pms/feedback")}>360° Feedback</Button>
          <Button className="bg-[#E8604C] hover:bg-[#d4553f] text-white" onClick={() => navigate("/hrms/pms/objectives")}>
            <Plus className="h-4 w-4 mr-1" /> Manage Objectives
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-2xl font-bold text-gray-900">{s.value}</p><p className="text-xs text-gray-500">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Objectives by Status</CardTitle></CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }: any) => `${name} (${value})`}>
                    {pieData.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-400 text-center py-12">No objectives yet</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Objectives by Type</CardTitle></CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#E8604C" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-400 text-center py-12">No objectives yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Recent Objectives</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate("/hrms/pms/objectives")}>View All</Button>
        </CardHeader>
        <CardContent>
          {objectives.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No objectives created yet</p>
          ) : (
            <div className="space-y-3">
              {objectives.slice(0, 5).map((obj: any) => (
                <div key={obj.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">{obj.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className={STATUS_COLORS[obj.status]}>{obj.status}</Badge>
                      <span className="text-xs text-gray-500 capitalize">{obj.objective_type}</span>
                      {obj.review_cycle && <span className="text-xs text-gray-400">{obj.review_cycle}</span>}
                    </div>
                  </div>
                  <div className="w-32 ml-4">
                    <div className="flex items-center gap-2">
                      <Progress value={obj.progress} className="h-2" />
                      <span className="text-xs font-medium text-gray-600 w-8">{obj.progress}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
