import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Target, TrendingUp, Users, Star, Plus, BarChart2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useMemo } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { CardSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-foreground border border-muted-foreground/20",
  active: "bg-info/10 text-info border border-info/20",
  completed: "bg-success/10 text-success border border-success/20",
  cancelled: "bg-destructive/10 text-destructive border border-destructive/20",
};

const PIE_COLORS = ["#6366f1", "#3b82f6", "#22c55e", "#ef4444"];

export default function PMSDashboardPage() {
  const navigate = useNavigate();

  const { data: objectives = [], isLoading: objLoading } = useQuery({
    queryKey: ['hr_objectives'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_objectives").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: feedbackStats, isLoading: fbLoading } = useQuery({
    queryKey: ['hr_feedback_360_stats'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_feedback_360").select("*");
      if (error) throw error;
      const fb = data as any[];
      const rated = fb.filter((f: any) => f.rating);
      return {
        total: fb.length,
        pending: fb.filter((f: any) => f.status === "pending").length,
        submitted: fb.filter((f: any) => f.status === "submitted").length,
        avgRating: rated.length ? +(rated.reduce((s: number, f: any) => s + f.rating, 0) / rated.length).toFixed(1) : 0,
      };
    },
  });

  const loading = objLoading || fbLoading;
  const safeStats = feedbackStats ?? { total: 0, pending: 0, submitted: 0, avgRating: 0 };

  const { statusCounts, pieData, avgProgress, barData } = useMemo(() => {
    const sc = objectives.reduce((acc: any, o: any) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {} as Record<string, number>);
    const pd = Object.entries(sc).map(([name, value]) => ({ name, value }));
    const ap = objectives.length ? Math.round(objectives.reduce((s: number, o: any) => s + o.progress, 0) / objectives.length) : 0;
    const tc = objectives.reduce((acc: any, o: any) => { acc[o.objective_type] = (acc[o.objective_type] || 0) + 1; return acc; }, {} as Record<string, number>);
    const bd = Object.entries(tc).map(([name, count]) => ({ name, count }));
    return { statusCounts: sc, pieData: pd, avgProgress: ap, barData: bd };
  }, [objectives]);

  const stats = [
    { label: "Total Objectives", value: objectives.length, icon: Target, color: "text-primary", bg: "bg-primary/10" },
    { label: "Avg Progress", value: `${avgProgress}%`, icon: TrendingUp, color: "text-info", bg: "bg-info/10" },
    { label: "Feedback Reviews", value: safeStats.total, icon: Users, color: "text-success", bg: "bg-success/10" },
    { label: "Avg Rating", value: safeStats.avgRating || "–", icon: Star, color: "text-warning", bg: "bg-warning/10" },
  ];

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CardSkeleton /><CardSkeleton />
        </div>
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Performance Management"
        description="OKRs, objectives, and 360° feedback"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="h-9" onClick={() => navigate("/hrms/pms/feedback")}>360° Feedback</Button>
            <Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f] text-primary-foreground" onClick={() => navigate("/hrms/pms/objectives")}>
              <Plus className="h-4 w-4 mr-1" /> Manage Objectives
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-2xl font-bold text-foreground tabular-nums">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Objectives by Status</CardTitle></CardHeader>
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
              <EmptyState icon={BarChart2} title="No objectives yet" className="py-8" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Objectives by Type</CardTitle></CardHeader>
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
              <EmptyState icon={BarChart2} title="No objectives yet" className="py-8" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Recent Objectives</CardTitle>
          <Button variant="ghost" size="sm" className="h-8" onClick={() => navigate("/hrms/pms/objectives")}>View All</Button>
        </CardHeader>
        <CardContent>
          {objectives.length === 0 ? (
            <EmptyState icon={Target} title="No objectives created yet" description="Create your first objective to get started." className="py-8" />
          ) : (
            <div className="space-y-3">
              {objectives.slice(0, 5).map((obj: any) => (
                <div key={obj.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{obj.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${STATUS_COLORS[obj.status]}`}>{obj.status}</span>
                      <span className="text-xs text-muted-foreground capitalize">{obj.objective_type}</span>
                      {obj.review_cycle && <span className="text-xs text-muted-foreground">{obj.review_cycle}</span>}
                    </div>
                  </div>
                  <div className="w-32 ml-4">
                    <div className="flex items-center gap-2">
                      <Progress value={obj.progress} className="h-2" />
                      <span className="text-xs font-medium text-muted-foreground tabular-nums w-8">{obj.progress}%</span>
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
