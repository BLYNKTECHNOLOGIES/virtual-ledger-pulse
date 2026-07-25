import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Star, BarChart2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { CardSkeleton } from "@/components/ui/skeleton";

export default function PMSDashboardPage() {
  const navigate = useNavigate();

  const { data: feedbackStats, isLoading } = useQuery({
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

  const safeStats = feedbackStats ?? { total: 0, pending: 0, submitted: 0, avgRating: 0 };

  const stats = [
    { label: "Feedback Reviews", value: safeStats.total, icon: Users, color: "text-success", bg: "bg-success/10" },
    { label: "Pending", value: safeStats.pending, icon: BarChart2, color: "text-warning", bg: "bg-warning/10" },
    { label: "Submitted", value: safeStats.submitted, icon: BarChart2, color: "text-info", bg: "bg-info/10" },
    { label: "Avg Rating", value: safeStats.avgRating || "–", icon: Star, color: "text-warning", bg: "bg-warning/10" },
  ];

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Performance Management"
        description="360° feedback and MPI scoring"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="h-9" onClick={() => navigate("/hrms/pms/feedback")}>360° Feedback</Button>
            <Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f] text-primary-foreground" onClick={() => navigate("/hrms/pms/mpi")}>Open MPI</Button>
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
    </div>
  );
}
