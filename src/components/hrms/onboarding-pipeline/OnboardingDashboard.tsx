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
import { ResponsiveList } from "@/components/horilla/primitives/ResponsiveList";

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
      // Soft-cancel: preserve history under the Cancelled bucket instead of hard delete.
      // Any linked draft (inactive) employee row is deactivated but kept for audit.
      const { error } = await supabase
        .from("hr_employee_onboarding")
        .update({ status: "cancelled" })
        .eq("id", toDelete.id);
      if (error) throw error;
      toast({ title: "Onboarding cancelled", description: "Moved to the Cancelled list. History preserved." });
      setToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["onboarding-pipeline-records"] });
    } catch (e: any) {
      toast({ title: "Failed to cancel", description: e?.message || "Could not cancel record", variant: "destructive" });
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 min-w-0">
        <div className="min-w-0">
          <h2 className="text-xl font-bold flex items-center gap-2 break-words">
            <Users className="h-5 w-5" /> Employee Onboarding Pipeline
          </h2>
          <p className="text-sm text-muted-foreground">Track and manage new hire onboarding across all stages</p>
        </div>
        <Button onClick={onNewOnboarding} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-1" /> New Onboarding
        </Button>
      </div>

      {/* Summary Cards — tap to filter */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
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
      <Card className="border-0 bg-transparent shadow-none sm:border sm:bg-card">
        <CardHeader className="px-0 pb-3 pt-0 sm:py-3 sm:px-4 flex flex-row items-center justify-between gap-2">
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
            <ResponsiveList
              items={filteredRecords}
              tableMinWidth="min-w-[920px]"
              columns={[
                { key: "name", label: "Name" },
                { key: "email", label: "Email" },
                { key: "stage", label: "Stage" },
                { key: "status", label: "Status" },
                { key: "checklist", label: "Checklist" },
                { key: "started", label: "Started" },
                { key: "action", label: "Action" },
              ]}
              keyFor={(r) => r.id}
              renderRow={(r) => {
                const c = r.employee_id ? completeness?.[r.employee_id] : undefined;
                const item = (label: string, ok: boolean | undefined) => (
                  <span
                    key={label}
                    title={`${label}: ${ok ? "complete" : "missing"}`}
                    className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${ok ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
                  >
                    {ok ? "✓" : "○"} {label}
                  </span>
                );

                return (
                  <>
                    <td className="p-3 font-medium cursor-pointer" onClick={() => onSelectOnboarding(r.id)}>
                      {r.first_name || r.last_name ? `${r.first_name || ""} ${r.last_name || ""}`.trim() : "—"}
                    </td>
                    <td className="p-3 text-muted-foreground">{r.email || "—"}</td>
                    <td className="p-3">{r.status === "completed" ? "✅ Done" : STAGE_LABELS[r.current_stage] || `Stage ${r.current_stage}`}</td>
                    <td className="p-3"><Badge className={`text-xs ${STATUS_COLORS[r.status] || ""}`}>{r.status.replace("_", " ")}</Badge></td>
                    <td className="p-3"><div className="flex flex-wrap gap-1">{item("Bank", c?.has_bank)}{item("Salary", c?.has_salary)}{item("DOJ", c?.has_doj)}</div></td>
                    <td className="p-3 text-muted-foreground">{format(new Date(r.created_at), "dd MMM yyyy")}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {r.status === "cancelled" ? (
                          <Button size="sm" variant="outline" disabled title="This onboarding was cancelled">
                            Cancelled
                          </Button>
                        ) : (
                          <Button size="sm" variant={r.status === "completed" ? "outline" : "default"} onClick={() => onSelectOnboarding(r.id)}>
                            {r.status === "completed" ? "View" : "Continue"}
                          </Button>
                        )}
                        {r.status !== "completed" && (
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setToDelete(r)} title="Delete dropped onboarding">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </>
                );
              }}
              renderCard={(r) => {
                const c = r.employee_id ? completeness?.[r.employee_id] : undefined;
                const chip = (label: string, ok: boolean | undefined) => (
                  <span key={label} className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded ${ok ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                    {ok ? "✓" : "○"} {label}
                  </span>
                );

                return (
                  <div className="hrms-mobile-card space-y-3" onClick={() => onSelectOnboarding(r.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground break-words">
                          {r.first_name || r.last_name ? `${r.first_name || ""} ${r.last_name || ""}`.trim() : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground break-words">{r.email || "No email"}</p>
                      </div>
                      <Badge className={`shrink-0 text-xs ${STATUS_COLORS[r.status] || ""}`}>{r.status.replace("_", " ")}</Badge>
                    </div>
                    <div className="hrms-mobile-kv"><span>Stage</span><strong>{r.status === "completed" ? "Done" : STAGE_LABELS[r.current_stage] || `Stage ${r.current_stage}`}</strong></div>
                    <div className="hrms-mobile-kv"><span>Started</span><strong>{format(new Date(r.created_at), "dd MMM yyyy")}</strong></div>
                    <div className="flex flex-wrap gap-1">{chip("Bank", c?.has_bank)}{chip("Salary", c?.has_salary)}{chip("DOJ", c?.has_doj)}</div>
                    <div className="flex gap-2 pt-1">
                      {r.status === "cancelled" ? (
                        <Button size="sm" className="flex-1" variant="outline" disabled onClick={(e) => e.stopPropagation()}>
                          Cancelled
                        </Button>
                      ) : (
                        <Button size="sm" className="flex-1" variant={r.status === "completed" ? "outline" : "default"} onClick={(e) => { e.stopPropagation(); onSelectOnboarding(r.id); }}>
                          {r.status === "completed" ? "View" : "Continue"}
                        </Button>
                      )}
                      {r.status !== "completed" && (
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); setToDelete(r); }} title="Delete dropped onboarding">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              }}
            />
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this onboarding?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks the onboarding for{" "}
              <span className="font-medium">
                {toDelete ? `${toDelete.first_name || ""} ${toDelete.last_name || ""}`.trim() || toDelete.email || "this candidate" : ""}
              </span>
              {" "}as <span className="font-medium">Cancelled</span> and moves it out of In Progress. The record stays visible under the Cancelled filter so you keep a full history of dropped candidates.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Cancelling..." : "Cancel Onboarding"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
