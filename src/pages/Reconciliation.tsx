import { useState } from "react";
import { ShieldCheck, RefreshCw, AlertTriangle, ListChecks, PlayCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useReconciliationCockpit } from "@/hooks/useReconciliationCockpit";
import { useReconciliationActions } from "@/hooks/useReconciliationActions";
import { useErpReconciliationAccess } from "@/hooks/useErpReconciliationAccess";
import { ExceptionLane } from "@/components/reconciliation/ExceptionLane";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/shared/PageHeader";

export default function Reconciliation() {
  const { hasAccess, isLoading: accessLoading } = useErpReconciliationAccess();
  const { data, isLoading, isFetching, refetch } = useReconciliationCockpit();
  const { acknowledge, resolve, reopen } = useReconciliationActions();
  const { toast } = useToast();
  const [showResolved, setShowResolved] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);

  const runSnapshot = async () => {
    setSnapshotting(true);
    try {
      const { error } = await supabase.functions.invoke("erp-balance-snapshot", { body: {} });
      if (error) throw error;
      toast({ title: "Snapshot triggered", description: "Balances are being recalculated." });
      setTimeout(() => refetch(), 3000);
    } catch (err: any) {
      toast({
        title: "Snapshot failed",
        description: err?.message || "Could not trigger snapshot.",
        variant: "destructive",
      });
    } finally {
      setSnapshotting(false);
    }
  };

  if (accessLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <ShieldCheck className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Restricted area</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          The Reconciliation &amp; Exception Cockpit is only available to users with the
          reconciliation function.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 page-mount">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <ShieldCheck className="h-6 w-6" />
            </span>
            Reconciliation &amp; Exception Cockpit
          </span>
        }
        description="Every data-integrity anomaly across the ledger in one place."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={runSnapshot} disabled={snapshotting}>
              {snapshotting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="mr-1.5 h-4 w-4" />
              )}
              Run Snapshot
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </>
        }
      />


      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 stagger-children">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ListChecks className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold tabular-nums">{data?.totalOpen ?? "—"}</div>
              <div className="text-xs text-muted-foreground">Open exceptions</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <div className="text-2xl font-bold tabular-nums text-destructive">
                {data?.totalCritical ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground">Critical</div>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="flex h-full items-center justify-between gap-3 p-4">
            <Label htmlFor="show-resolved" className="text-sm">
              Show resolved
            </Label>
            <Switch id="show-resolved" checked={showResolved} onCheckedChange={setShowResolved} />
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {data?.lanes.map((lane) => (
            <ExceptionLane
              key={lane.key}
              lane={lane}
              stateByRef={data.stateByRef}
              showResolved={showResolved}
              canManage={hasAccess}
              onAcknowledge={acknowledge}
              onResolve={resolve}
              onReopen={reopen}
            />
          ))}
        </div>
      )}
    </div>
  );
}
