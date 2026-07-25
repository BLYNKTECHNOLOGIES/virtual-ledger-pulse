import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TrendingUp, TrendingDown, Search, Plus, X, Clock, AlertTriangle, Send, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";

type StatusFilter = "APPLIED" | "SCHEDULED" | "CANCELLED" | "ALL";

export default function SalaryRevisionsPage() {
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hrms_manage");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("APPLIED");
  const [showDialog, setShowDialog] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [pushingIds, setPushingIds] = useState<Set<string>>(new Set());

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

  // Envelope verification status — governs whether pushes to Razorpay can succeed.
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

  // Latest salary push per employee — used to badge each row as Synced / Failed / Not synced.
  const { data: pushByEmployee = {} as Record<string, { status: string; created_at: string; error_message: string | null; response_snapshot: any }> } = useQuery({
    queryKey: ["hr_salary_push_latest"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_razorpay_pushback_log")
        .select("hr_employee_id, status, created_at, error_message, response_snapshot")
        .eq("kind", "salary")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const map: Record<string, { status: string; created_at: string; error_message: string | null; response_snapshot: any }> = {};
      for (const r of (data || [])) {
        if (!map[r.hr_employee_id]) map[r.hr_employee_id] = { status: r.status, created_at: r.created_at, error_message: r.error_message, response_snapshot: r.response_snapshot };
      }
      return map;
    },
    staleTime: 15_000,
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

  const ONE_TIME_KINDS = new Set(["bonus", "performance_incentive", "retention_bonus", "special_allowance", "ad_hoc"]);
  const filtered = useMemo(() => revisions.filter((r: any) => {
    const isOneTime = ONE_TIME_KINDS.has(r.revision_type) || Number(r.one_time_amount || 0) > 0;
    // Exclude initial onboarding entries (no prior salary → not a revision),
    // but always keep one-time payouts (bonus/incentive/etc.) which have no previous_total.
    if (!isOneTime && Number(r.previous_total || 0) <= 0) return false;
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    const name = `${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.toLowerCase();
    return name.includes(search.toLowerCase());
  }), [revisions, statusFilter, search]);

  const envelopeVerified = !!envelope?.push_salary_endpoint_verified;

  function getRazorpayCtcPushState(pushInfo: any, expectedTotal: number): "verified" | "failed" | "none" {
    if (!pushInfo) return "none";
    if (pushInfo.status === "failure") return "failed";
    if (pushInfo.status !== "success") return "none";
    const snapshot = pushInfo.response_snapshot || {};
    const verify = snapshot.verify || snapshot;
    if (!Array.isArray(verify?.fields)) return "none";
    const ctcField = verify.fields.find((f: any) => f?.key === "annual_ctc");
    if (verify?.overall === "verified") {
      const actual = Number(ctcField?.actual);
      if (ctcField?.match === true && Number.isFinite(actual) && Math.abs(actual - expectedTotal) <= 1) return "verified";
    }
    return "none";
  }

  async function pushOne(employeeId: string, revisionId: string, expectedTotal: number) {
    setPushingIds(prev => new Set(prev).add(revisionId));
    try {
      const res = await pushSalaryToRazorpay(employeeId, {
        triggeredFrom: "salary_revisions_row",
        silent: true,
        expectedTotal,
      });
      if (res.ok && typeof res.verifiedTotal === "number" && Math.abs(res.verifiedTotal - expectedTotal) <= 1) {
        toast.success(`Verified in RazorpayX: ₹${res.verifiedTotal.toLocaleString("en-IN")}`);
      } else if (res.skipped) {
        toast.warning("Employee is not linked to RazorpayX — link them from Data Health first.");
      } else {
        toast.error("RazorpayX push NOT verified — revision not finalized.", {
          description: (res.error || "CTC mismatch or push rejected").slice(0, 220),
        });
      }
      await qc.invalidateQueries({ queryKey: ["hr_salary_push_latest"] });
    } finally {
      setPushingIds(prev => { const n = new Set(prev); n.delete(revisionId); return n; });
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Salary Revision History"
        description="Every applied revision is auto-pushed to RazorpayX on submit. Retry any that didn't sync directly on the row."
        actions={
          canManage ? (
            <Button onClick={() => setShowDialog(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Revise Salary
            </Button>
          ) : null
        }
      />

      {canManage && !envelopeVerified && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>RazorpayX salary push is disabled</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-sm">
              Revisions are saved locally but <b>cannot be mirrored to RazorpayX</b> until the salary API envelope is
              verified. Every payroll run after a revision will use the old CTC until this is fixed.
            </p>
              <Button asChild size="sm" variant="secondary">
                <Link to="/hrms/payroll/razorpay-sync">Open Payroll Sync · Step E →</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {canManage && envelopeVerified && (
        <Alert className="border-emerald-500/40">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertTitle>RazorpayX salary push is live</AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground">
            Envelope <code className="px-1 rounded bg-muted">{envelope?.push_salary_envelope_key}</code> verified
            {envelope?.push_salary_envelope_verified_at ? ` on ${format(new Date(envelope.push_salary_envelope_verified_at), "dd MMM yyyy")}` : ""}.
          </AlertDescription>
        </Alert>
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
            const isOneTime = ONE_TIME_KINDS.has(r.revision_type) || Number(r.one_time_amount || 0) > 0;
            const isIncrease = Number(r.new_total || 0) > Number(r.previous_total || 0);
            const diff = Number(r.new_total || 0) - Number(r.previous_total || 0);
            const isScheduled = r.status === "SCHEDULED";
            const isCancelled = r.status === "CANCELLED";
            const isApplied = r.status === "APPLIED";
            const pushInfo = pushByEmployee[r.employee_id];
            const expectedTotal = Number(r.new_total || 0);
            const pushState = pushInfo && pushInfo.created_at >= r.created_at ? getRazorpayCtcPushState(pushInfo, expectedTotal) : "none";
            const pushSyncedAfterRevision = pushState === "verified";
            const pushFailedAfterRevision = pushState === "failed";
            const pushing = pushingIds.has(r.id);

            let syncBadge: React.ReactNode = null;
            if (isOneTime) {
              // One-time payouts don't change CTC, so there is nothing to push to
              // RazorpayX from here — they must be recorded as an ad-hoc payout in
              // the RazorpayX payroll run itself. Show an informational chip only.
              syncBadge = (
                <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 gap-1">
                  Ad-hoc — add in RazorpayX payroll
                </Badge>
              );
            } else if (isApplied) {
              if (pushSyncedAfterRevision) {
                syncBadge = (
                  <Badge variant="outline" className="text-emerald-700 border-emerald-500/40 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Synced to RazorpayX
                  </Badge>
                );
              } else if (pushFailedAfterRevision) {
                syncBadge = (
                  <Badge variant="outline" className="text-destructive border-destructive/40 gap-1">
                    <XCircle className="h-3 w-3" /> Not synced
                  </Badge>
                );
              } else {
                syncBadge = (
                  <Badge variant="outline" className="text-amber-700 border-amber-500/40 gap-1">
                    <AlertTriangle className="h-3 w-3" /> Not synced
                  </Badge>
                );
              }
            }


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
                      {pushFailedAfterRevision && pushInfo?.error_message && (
                        <p className="text-[11px] text-destructive mt-0.5 truncate max-w-md" title={pushInfo.error_message}>
                          Last RazorpayX error: {pushInfo.error_message}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      {ONE_TIME_KINDS.has(r.revision_type) || Number(r.one_time_amount || 0) > 0 ? (
                        <div className="text-sm">
                          <span className="text-success font-semibold tabular-nums">+₹{Number(r.one_time_amount || 0).toLocaleString("en-IN")}</span>
                          {r.payout_month && (
                            <span className="text-xs text-muted-foreground ml-1.5">
                              · {format(new Date(r.payout_month), "MMM yyyy")}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground line-through tabular-nums">₹{Number(r.previous_total || 0).toLocaleString("en-IN")}</span>
                          <span className="text-foreground font-semibold tabular-nums">→ ₹{Number(r.new_total || 0).toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 justify-end mt-1 flex-wrap">
                        <Badge variant={isScheduled ? "outline" : isCancelled ? "secondary" : isIncrease ? "default" : "destructive"} className="text-xs">
                          {isScheduled ? "SCHEDULED" : isCancelled ? "CANCELLED" : (ONE_TIME_KINDS.has(r.revision_type) || Number(r.one_time_amount || 0) > 0) ? `+₹${Number(r.one_time_amount || 0).toLocaleString("en-IN")}` : `${diff >= 0 ? "+" : ""}₹${diff.toLocaleString("en-IN")}`}
                        </Badge>
                        <Badge variant="secondary" className="text-xs capitalize">{String(r.revision_type).replace(/_/g, " ")}</Badge>
                        {syncBadge}
                      </div>
                    </div>
                    {isApplied && !isOneTime && canManage && !pushSyncedAfterRevision && (
                      <Button
                        size="sm"
                        variant={pushFailedAfterRevision ? "default" : "outline"}
                        onClick={() => pushOne(r.employee_id, r.id, Number(r.new_total || 0))}
                        disabled={pushing || !envelopeVerified}
                        title={!envelopeVerified ? "Verify the salary envelope first" : "Push this CTC to RazorpayX"}
                      >
                        {pushing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                        {pushFailedAfterRevision ? "Retry push" : "Push to RazorpayX"}
                      </Button>
                    )}
                    {isScheduled && canManage && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelId(r.id)} title="Cancel scheduled revision">
                        <X className={cn("h-4 w-4 text-destructive")} />
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
