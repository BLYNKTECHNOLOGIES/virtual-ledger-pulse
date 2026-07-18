import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Users, Clock, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { BulkCompletionPanel } from "./BulkCompletionPanel";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

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
  stage_1: "bg-info/10 text-info dark:bg-info dark:text-info",
  stage_2: "bg-primary/10 text-primary dark:bg-primary dark:text-primary",
  stage_3: "bg-primary/10 text-primary dark:bg-primary dark:text-primary",
  stage_4: "bg-warning/10 text-warning dark:bg-warning dark:text-warning",
  stage_5: "bg-warning/10 text-warning dark:bg-warning dark:text-warning",
  completed: "bg-success/10 text-success dark:bg-success dark:text-success",
  cancelled: "bg-destructive/10 text-destructive dark:bg-destructive dark:text-destructive",
};

interface OnboardingDashboardProps {
  onNewOnboarding: () => void;
  onSelectOnboarding: (id: string) => void;
}

export function OnboardingDashboard({ onNewOnboarding, onSelectOnboarding }: OnboardingDashboardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [toDelete, setToDelete] = useState<OnboardingRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: records, isLoading } = useQuery({
    queryKey: ["onboarding-pipeline-records"],
    queryFn: async () => {
      // Self-heal: create draft onboarding rows for any inactive employees that lack one
      try { await supabase.rpc("ensure_onboarding_for_orphans" as any); } catch {}
      const { data, error } = await supabase
        .from("hr_employee_onboarding")
        .select("id, first_name, last_name, email, status, current_stage, department_id, created_at, employee_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data as OnboardingRecord[]) || [];
      // Push completed onboardings to the bottom; keep created_at ordering within each group
      return [...rows].sort((a, b) => {
        const aDone = a.status === "completed" ? 1 : 0;
        const bDone = b.status === "completed" ? 1 : 0;
        return aDone - bDone;
      });
    },
  });

  const employeeIds = (records || []).map(r => r.employee_id).filter(Boolean) as string[];
  const { data: completeness } = useQuery({
    queryKey: ["onboarding-completeness", employeeIds.sort().join(",")],
    enabled: employeeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_employee_completeness" as any)
        .select("employee_id, has_bank, has_salary, has_doj, has_designation")
        .in("employee_id", employeeIds);
      if (error) throw error;
      const map: Record<string, { has_bank: boolean; has_salary: boolean; has_doj: boolean; has_designation: boolean }> = {};
      for (const row of (data || []) as any[]) map[row.employee_id] = row;
      return map;
    },
  });

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      // If a draft employee row was linked, remove it too when still inactive
      if (toDelete.employee_id) {
        const { data: emp } = await supabase
          .from("hr_employees")
          .select("id, is_active")
          .eq("id", toDelete.employee_id)
          .maybeSingle();
        if (emp && emp.is_active === false) {
          await supabase.from("hr_employees").delete().eq("id", emp.id);
        }
      }
      const { error } = await supabase
        .from("hr_employee_onboarding")
        .delete()
        .eq("id", toDelete.id);
      if (error) throw error;
      toast({ title: "Onboarding deleted", description: "The dropped onboarding record has been removed." });
      setToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["onboarding-pipeline-records"] });
    } catch (e: any) {
      toast({ title: "Failed to delete", description: e?.message || "Could not delete record", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };


  const inProgress = records?.filter(r => !["completed", "cancelled"].includes(r.status)) || [];
  const completed = records?.filter(r => r.status === "completed") || [];
  const cancelled = records?.filter(r => r.status === "cancelled") || [];

  type FilterKey = "all" | "in_progress" | "completed" | "cancelled";
  const [filter, setFilter] = useState<FilterKey>("all");

  const filteredRecords = (records || []).filter(r => {
    if (filter === "all") return true;
    if (filter === "completed") return r.status === "completed";
    if (filter === "cancelled") return r.status === "cancelled";
    return !["completed", "cancelled"].includes(r.status);
  });

  const cardCls = (key: FilterKey) =>
    `cursor-pointer transition-all ${filter === key ? "ring-2 ring-primary border-primary" : "hover:border-primary/40"}`;

  const filterLabel: Record<FilterKey, string> = {
    all: "All",
    in_progress: "In Progress",
    completed: "Completed",
    cancelled: "Cancelled",
  };

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

      {/* Summary Cards — tap to filter */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className={cardCls("in_progress")} onClick={() => setFilter(f => f === "in_progress" ? "all" : "in_progress")}>
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 mx-auto mb-1 text-info" />
            <p className="text-2xl font-bold">{inProgress.length}</p>
            <p className="text-xs text-muted-foreground">In Progress</p>
          </CardContent>
        </Card>
        <Card className={cardCls("completed")} onClick={() => setFilter(f => f === "completed" ? "all" : "completed")}>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-success" />
            <p className="text-2xl font-bold">{completed.length}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card className={cardCls("cancelled")} onClick={() => setFilter(f => f === "cancelled" ? "all" : "cancelled")}>
          <CardContent className="p-4 text-center">
            <XCircle className="h-5 w-5 mx-auto mb-1 text-destructive" />
            <p className="text-2xl font-bold">{cancelled.length}</p>
            <p className="text-xs text-muted-foreground">Cancelled</p>
          </CardContent>
        </Card>
        <Card className={cardCls("all")} onClick={() => setFilter("all")}>
          <CardContent className="p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{records?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
      </div>


      {/* Bulk Completion fast-lane (fills data only, never activates) */}
      <BulkCompletionPanel />

      {/* Records Table */}
      <Card>
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm">
            {filter === "all" ? "All Onboarding Records" : `${filterLabel[filter]} Onboardings`}
            <span className="ml-2 text-xs font-normal text-muted-foreground">({filteredRecords.length})</span>
          </CardTitle>
          {filter !== "all" && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setFilter("all")}>
              Clear filter
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
          ) : !filteredRecords.length ? (
            <div className="p-8 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>{records?.length ? `No ${filterLabel[filter].toLowerCase()} records` : "No onboarding records yet"}</p>
              {!records?.length && <p className="text-sm">Click "New Onboarding" to start</p>}
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
                    <th className="text-left p-3 font-medium">Checklist</th>
                    <th className="text-left p-3 font-medium">Started</th>
                    <th className="text-left p-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map(r => (
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
                      <td className="p-3">
                        {(() => {
                          const c = r.employee_id ? completeness?.[r.employee_id] : undefined;
                          const item = (label: string, ok: boolean | undefined) => (
                            <span
                              key={label}
                              title={`${label}: ${ok ? "complete" : "missing"}`}
                              className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${
                                ok ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {ok ? "✓" : "○"} {label}
                            </span>
                          );
                          return (
                            <div className="flex flex-wrap gap-1">
                              {item("Bank", c?.has_bank)}
                              {item("Salary", c?.has_salary)}
                              {item("DOJ", c?.has_doj)}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {format(new Date(r.created_at), "dd MMM yyyy")}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant={r.status === "completed" ? "outline" : "default"}
                            onClick={(e) => { e.stopPropagation(); onSelectOnboarding(r.id); }}
                          >
                            {r.status === "completed" ? "View" : "Continue"}
                          </Button>
                          {r.status !== "completed" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => { e.stopPropagation(); setToDelete(r); }}
                              title="Delete dropped onboarding"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this onboarding record?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the onboarding for{" "}
              <span className="font-medium">
                {toDelete ? `${toDelete.first_name || ""} ${toDelete.last_name || ""}`.trim() || toDelete.email || "this candidate" : ""}
              </span>
              . Use this when the candidate dropped mid-onboarding. Any linked draft (inactive) employee record will also be removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
