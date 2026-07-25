import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TrendingUp, TrendingDown, Search, Plus, X, Clock, AlertTriangle, RefreshCw, Send, Loader2, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { ReviseSalaryDialog } from "@/components/hrms/ReviseSalaryDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { pushSalaryToRazorpay } from "@/lib/razorpayPushback";
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
  const [bulkAction, setBulkAction] = useState<null | "retry" | "backfill">(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; ok: number; fail: number } | null>(null);

  // Envelope verification status — governs whether pushes to Razorpay will succeed.
  const { data: envelope } = useQuery({
    queryKey: ["hr_razorpay_settings_envelope"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_razorpay_settings")
        .select("push_salary_endpoint_verified, push_salary_envelope_key, push_salary_envelope_verified_at")
        .maybeSingle();
      return data as { push_salary_endpoint_verified?: boolean; push_salary_envelope_key?: string | null; push_salary_envelope_verified_at?: string | null } | null;
    },
    staleTime: 30_000,
  });

  // Distinct employees with a currently-unresolved salary push failure.
  const { data: failedPushEmployees = [], refetch: refetchFailed } = useQuery({
    queryKey: ["hr_salary_push_failures"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_razorpay_pushback_log")
        .select("hr_employee_id, created_at, error_message")
        .eq("kind", "salary")
        .eq("status", "failure")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      // Dedup — keep only the latest failure per employee, and drop ones where a later success exists.
      const seen = new Set<string>();
      const latest: { hr_employee_id: string; created_at: string; error_message: string | null }[] = [];
      for (const r of (data || [])) {
        if (seen.has(r.hr_employee_id)) continue;
        seen.add(r.hr_employee_id);
        latest.push(r);
      }
      if (latest.length === 0) return [];
      const ids = latest.map(l => l.hr_employee_id);
      const { data: succ } = await (supabase as any)
        .from("hr_razorpay_pushback_log")
        .select("hr_employee_id, created_at")
        .eq("kind", "salary")
        .eq("status", "success")
        .in("hr_employee_id", ids);
      const lastSuccess = new Map<string, string>();
      for (const s of (succ || [])) {
        const prev = lastSuccess.get(s.hr_employee_id);
        if (!prev || s.created_at > prev) lastSuccess.set(s.hr_employee_id, s.created_at);
      }
      return latest.filter(l => {
        const s = lastSuccess.get(l.hr_employee_id);
        return !s || s < l.created_at;
      });
    },
    staleTime: 15_000,
  });

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
    // Exclude initial onboarding entries (no prior salary → not a revision)
    if (Number(r.previous_total || 0) <= 0) return false;
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    const name = `${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const envelopeVerified = !!envelope?.push_salary_endpoint_verified;
  const failedCount = failedPushEmployees.length;

  async function runBulkPush(mode: "retry" | "backfill") {
    // Build the target set of hr_employee_ids to push.
    let targetIds: string[] = [];
    if (mode === "retry") {
      targetIds = failedPushEmployees.map(f => f.hr_employee_id);
    } else {
      // Backfill: every distinct employee with at least one APPLIED revision (i.e. new CTC on record).
      const appliedIds = new Set<string>();
      for (const r of revisions as any[]) {
        if (r.status === "APPLIED" && r.employee_id) appliedIds.add(r.employee_id);
      }
      targetIds = Array.from(appliedIds);
    }
    if (targetIds.length === 0) {
      toast.info("Nothing to push.");
      setBulkAction(null);
      return;
    }
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: targetIds.length, ok: 0, fail: 0 });
    let ok = 0, fail = 0;
    // Sequential with small concurrency to be nice to the proxy + rate limits.
    const CONCURRENCY = 3;
    for (let i = 0; i < targetIds.length; i += CONCURRENCY) {
      const batch = targetIds.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(id => pushSalaryToRazorpay(id, { triggeredFrom: `salary_revisions_${mode}` }).catch(e => ({ ok: false, error: String(e) })) as any),
      );
      for (const r of results) {
        if (r?.ok) ok++; else fail++;
      }
      setBulkProgress({ done: Math.min(i + CONCURRENCY, targetIds.length), total: targetIds.length, ok, fail });
    }
    setBulkRunning(false);
    setBulkAction(null);
    await refetchFailed();
    if (fail === 0) toast.success(`Pushed ${ok} salary record${ok === 1 ? "" : "s"} to RazorpayX`);
    else toast.warning(`Pushed ${ok} · Failed ${fail}. Open Data Health for retry details.`);
  }


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

      {canManage && (
        <>
          {!envelopeVerified ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>RazorpayX salary push is disabled</AlertTitle>
              <AlertDescription className="space-y-2">
                <p className="text-sm">
                  Revisions applied here are saved in HRMS but <b>are not being mirrored to RazorpayX</b> because the
                  salary API endpoint hasn't been verified yet. Every payroll run after a revision will use the old CTC
                  until this is fixed.
                </p>
                <Button asChild size="sm" variant="secondary">
                  <Link to="/hrms/razorpay-sync">Open Payroll Sync · Step E →</Link>
                </Button>
              </AlertDescription>
            </Alert>
          ) : failedCount > 0 ? (
            <Alert className="border-amber-500/50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="flex items-center justify-between gap-2">
                <span>{failedCount} salary push{failedCount === 1 ? "" : "es"} to RazorpayX failed</span>
                <Badge variant="outline" className="text-amber-700 border-amber-500/50">action needed</Badge>
              </AlertTitle>
              <AlertDescription className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  These employees' new CTCs are saved in HRMS but weren't accepted by RazorpayX. Retry now, or open
                  Data Health for details.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setBulkAction("retry")} disabled={bulkRunning}>
                    {bulkRunning ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                    Retry {failedCount} failed push{failedCount === 1 ? "" : "es"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setBulkAction("backfill")} disabled={bulkRunning}>
                    <Send className="h-4 w-4 mr-1.5" />
                    Backfill all applied revisions
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-emerald-500/40">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertTitle>RazorpayX salary push is live</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Envelope <code className="px-1 rounded bg-muted">{envelope?.push_salary_envelope_key}</code> verified
                  {envelope?.push_salary_envelope_verified_at ? ` on ${format(new Date(envelope.push_salary_envelope_verified_at), "dd MMM yyyy")}` : ""}.
                </span>
                <Button size="sm" variant="ghost" onClick={() => setBulkAction("backfill")} disabled={bulkRunning}>
                  <Send className="h-4 w-4 mr-1.5" />
                  Backfill all applied revisions
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {bulkProgress && (
            <div className="text-xs text-muted-foreground">
              Pushing {bulkProgress.done}/{bulkProgress.total} · ✅ {bulkProgress.ok} · ⚠️ {bulkProgress.fail}
            </div>
          )}
        </>
      )}


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

      <AlertDialog open={!!bulkAction} onOpenChange={(o) => !o && !bulkRunning && setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === "retry" ? `Retry ${failedCount} failed salary push${failedCount === 1 ? "" : "es"}?` : "Backfill all applied revisions to RazorpayX?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === "retry"
                ? "We'll re-send the latest CTC from HRMS to RazorpayX for every employee whose last push failed. Employees not linked to RazorpayX are silently skipped."
                : "We'll re-send the current HRMS CTC to RazorpayX for every employee that has at least one applied revision. Safe to run — RazorpayX overwrites with the same value if unchanged."}
              {!envelopeVerified && (
                <span className="block mt-2 text-destructive text-sm">
                  ⚠️ The salary envelope isn't verified yet — every push will fail. Verify it on the Payroll Sync page first.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkRunning}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkAction && runBulkPush(bulkAction)} disabled={bulkRunning || !envelopeVerified}>
              {bulkRunning && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {bulkAction === "retry" ? "Retry now" : "Backfill now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
