import { useQuery } from "@tanstack/react-query";
import { Activity, BookOpenCheck, BriefcaseBusiness, ClipboardCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CardSkeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

const countRows = async (table: "cbt_drives" | "cbt_candidates" | "cbt_attempts" | "cbt_questions") => {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
};

export default function QuizDashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["cbt", "dashboard-counts"],
    queryFn: async () => {
      const [drives, candidates, attempts, questions, liveDrives, inProgress] = await Promise.all([
        countRows("cbt_drives"),
        countRows("cbt_candidates"),
        countRows("cbt_attempts"),
        countRows("cbt_questions"),
        supabase.from("cbt_drives").select("id", { count: "exact", head: true }).eq("status", "live"),
        supabase.from("cbt_attempts").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
      ]);

      if (liveDrives.error) throw liveDrives.error;
      if (inProgress.error) throw inProgress.error;

      return {
        drives,
        candidates,
        attempts,
        questions,
        liveDrives: liveDrives.count ?? 0,
        inProgress: inProgress.count ?? 0,
      };
    },
  });

  const stats = [
    { label: "Assessment drives", value: data?.drives ?? 0, icon: BriefcaseBusiness, tone: "text-info bg-info/10" },
    { label: "Candidates", value: data?.candidates ?? 0, icon: Users, tone: "text-success bg-success/10" },
    { label: "Attempts", value: data?.attempts ?? 0, icon: ClipboardCheck, tone: "text-warning bg-warning/10" },
    { label: "Question bank", value: data?.questions ?? 0, icon: BookOpenCheck, tone: "text-primary bg-primary/10" },
  ];

  return (
    <div className="page-mount space-y-5 p-2 sm:p-3 md:p-0">
      <PageHeader
        title="Quiz"
        description="Manage screening drives, candidate attempts, evaluations, and the question bank."
        actions={<Badge variant={data?.liveDrives ? "success" : "muted"} dot>{data?.liveDrives ?? 0} live drives</Badge>}
      />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <CardSkeleton key={index} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${stat.tone}`}>
                  <stat.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-2xl font-semibold tabular-nums text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <section className="border-t border-border pt-5" aria-labelledby="quiz-activity-title">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <h2 id="quiz-activity-title" className="text-base font-semibold text-foreground">Current activity</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isError
                ? "Quiz totals could not be loaded. Refresh to try again."
                : `${data?.inProgress ?? 0} candidate attempts are currently in progress.`}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}