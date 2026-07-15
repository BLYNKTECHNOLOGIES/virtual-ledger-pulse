import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Search, Plus, X, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ReviseSalaryDialog } from "@/components/hrms/ReviseSalaryDialog";
import { usePermissions } from "@/hooks/usePermissions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type StatusFilter = "APPLIED" | "SCHEDULED" | "CANCELLED" | "ALL";

export default function SalaryRevisionsPage() {
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hrms_manage");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("APPLIED");
  const [showDialog, setShowDialog] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const { data: revisions = [], isLoading } = useQuery({
    queryKey: ["hr_salary_revisions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_salary_revisions")
        .select("*, hr_employees!hr_salary_revisions_employee_id_fkey(first_name, last_name, badge_id)")
        .neq("status", "NOOP")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("cancel_scheduled_salary_revision", {
        p_revision_id: id,
        p_reason: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_salary_revisions"] });
      toast.success("Scheduled revision cancelled");
      setCancelId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = revisions.filter((r: any) => {
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    const name = `${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Salary Revision History"
        description="Apply and review revisions. Future-dated revisions are auto-applied on their effective date."
        actions={
          canManage ? (
            <Button onClick={() => setShowDialog(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Revise Salary
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="APPLIED">Applied</TabsTrigger>
            <TabsTrigger value="SCHEDULED">Scheduled</TabsTrigger>
            <TabsTrigger value="CANCELLED">Cancelled</TabsTrigger>
            <TabsTrigger value="ALL">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by employee name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} columns={4} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No salary revisions" description={canManage ? "Click 'Revise Salary' to create one." : "Revisions will appear here once created."} />
      ) : (
        <div className="space-y-3">
          {filtered.map((r: any) => {
            const isIncrease = Number(r.new_total || 0) > Number(r.previous_total || 0);
            const diff = Number(r.new_total || 0) - Number(r.previous_total || 0);
            const isScheduled = r.status === "SCHEDULED";
            const isCancelled = r.status === "CANCELLED";
            return (
              <Card key={r.id} className={isCancelled ? "opacity-60" : ""}>
                <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    {isScheduled ? (
                      <Clock className="h-5 w-5 text-amber-500 shrink-0" />
                    ) : isIncrease ? (
                      <TrendingUp className="h-5 w-5 text-success shrink-0" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-destructive shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {r.hr_employees?.first_name} {r.hr_employees?.last_name}
                        {r.hr_employees?.badge_id && <span className="text-xs text-muted-foreground ml-1.5">· {r.hr_employees.badge_id}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(r.created_at), "dd MMM yyyy, hh:mm a")} · Effective: {r.effective_from}
                        {r.approved_by && <> · By {r.approved_by}</>}
                      </p>
                      {r.revision_reason && (
                        <p className="text-xs text-muted-foreground italic mt-0.5 truncate max-w-md">{r.revision_reason}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground line-through tabular-nums">₹{Number(r.previous_total || 0).toLocaleString("en-IN")}</span>
                        <span className="text-foreground font-semibold tabular-nums">→ ₹{Number(r.new_total || 0).toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex items-center gap-1.5 justify-end mt-1">
                        <Badge variant={isScheduled ? "outline" : isCancelled ? "secondary" : isIncrease ? "default" : "destructive"} className="text-xs">
                          {isScheduled ? "SCHEDULED" : isCancelled ? "CANCELLED" : `${diff >= 0 ? "+" : ""}₹${diff.toLocaleString("en-IN")}`}
                        </Badge>
                        <Badge variant="secondary" className="text-xs capitalize">{r.revision_type}</Badge>
                      </div>
                    </div>
                    {isScheduled && canManage && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelId(r.id)} title="Cancel scheduled revision">
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ReviseSalaryDialog open={showDialog} onOpenChange={setShowDialog} />

      <AlertDialog open={!!cancelId} onOpenChange={(o) => !o && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel scheduled revision?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the pending salary revision. The employee's salary will remain unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancelId && cancelMutation.mutate(cancelId)}>
              Cancel revision
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
