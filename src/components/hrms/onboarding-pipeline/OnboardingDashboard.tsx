import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Users, Clock, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";

type OnboardingRecord = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: string;
  current_stage: number;
  department_id: string | null;
  created_at: string;
  employee_id: string | null;
};

const STAGE_LABELS: Record<number, string> = {
  1: "Basic Details",
  2: "Salary Config",
  3: "Documents",
  4: "Offer & Policy",
  5: "Finalization",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  stage_1: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  stage_2: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  stage_3: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  stage_4: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  stage_5: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

interface OnboardingDashboardProps {
  onNewOnboarding: () => void;
  onSelectOnboarding: (id: string) => void;
}

export function OnboardingDashboard({ onNewOnboarding, onSelectOnboarding }: OnboardingDashboardProps) {
  const { data: records, isLoading } = useQuery({
    queryKey: ["onboarding-pipeline-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_employee_onboarding")
        .select("id, first_name, last_name, email, status, current_stage, department_id, created_at, employee_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as OnboardingRecord[];
    },
  });

  const inProgress = records?.filter(r => !["completed", "cancelled"].includes(r.status)) || [];
  const completed = records?.filter(r => r.status === "completed") || [];
  const cancelled = records?.filter(r => r.status === "cancelled") || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5" /> Employee Onboarding Pipeline
          </h2>
          <p className="text-sm text-muted-foreground">Track and manage new hire onboarding across all stages</p>
        </div>
        <Button onClick={onNewOnboarding}>
          <Plus className="h-4 w-4 mr-1" /> New Onboarding
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 mx-auto mb-1 text-blue-500" />
            <p className="text-2xl font-bold">{inProgress.length}</p>
            <p className="text-xs text-muted-foreground">In Progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-green-500" />
            <p className="text-2xl font-bold">{completed.length}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <XCircle className="h-5 w-5 mx-auto mb-1 text-red-500" />
            <p className="text-2xl font-bold">{cancelled.length}</p>
            <p className="text-xs text-muted-foreground">Cancelled</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{records?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
      </div>

      {/* Records Table */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">All Onboarding Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
          ) : !records?.length ? (
            <div className="p-8 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No onboarding records yet</p>
              <p className="text-sm">Click "New Onboarding" to start</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Email</th>
                    <th className="text-left p-3 font-medium">Stage</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Started</th>
                    <th className="text-left p-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => onSelectOnboarding(r.id)}>
                      <td className="p-3 font-medium">
                        {r.first_name || r.last_name
                          ? `${r.first_name || ""} ${r.last_name || ""}`.trim()
                          : "—"}
                      </td>
                      <td className="p-3 text-muted-foreground">{r.email || "—"}</td>
                      <td className="p-3">
                        {r.status === "completed" ? "✅ Done" : STAGE_LABELS[r.current_stage] || `Stage ${r.current_stage}`}
                      </td>
                      <td className="p-3">
                        <Badge className={`text-xs ${STATUS_COLORS[r.status] || ""}`}>
                          {r.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {format(new Date(r.created_at), "dd MMM yyyy")}
                      </td>
                      <td className="p-3">
                        <Button
                          size="sm"
                          variant={r.status === "completed" ? "outline" : "default"}
                          onClick={(e) => { e.stopPropagation(); onSelectOnboarding(r.id); }}
                        >
                          {r.status === "completed" ? "View" : "Continue"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
