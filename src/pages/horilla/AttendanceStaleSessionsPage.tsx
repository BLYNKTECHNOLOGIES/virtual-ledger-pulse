import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { AlertTriangle, Clock, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

type StaleRow = {
  id: string;
  session_id: string;
  employee_id: string;
  attendance_date: string;
  in_time: string;
  hours_open: number;
  status: string;
  resolution_note: string | null;
  resolved_at: string | null;
  first_seen_at: string;
  employee?: { badge_id: string; first_name: string; last_name: string };
};

type Resolution = "set_out_time" | "confirm_long_shift" | "void";

export default function AttendanceStaleSessionsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"open" | "all">("open");
  const [dlg, setDlg] = useState<{ row: StaleRow; resolution: Resolution } | null>(null);
  const [outTime, setOutTime] = useState("");
  const [note, setNote] = useState("");

  const { data: rows = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["hr_stale_sessions", statusFilter],
    queryFn: async () => {
      const q = (supabase as any)
        .from("hr_attendance_stale_sessions")
        .select("*, employee:hr_employees(badge_id, first_name, last_name)")
        .order("in_time", { ascending: false })
        .limit(500);
      if (statusFilter === "open") q.eq("status", "open");
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as StaleRow[];
    },
  });

  const runWatchdog = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).functions.invoke("hr-attendance-watchdog");
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast.success(`Watchdog: +${d?.opened || 0} new, ${d?.refreshed || 0} refreshed, ${d?.closed || 0} closed`);
      qc.invalidateQueries({ queryKey: ["hr_stale_sessions"] });
    },
    onError: (e: any) => toast.error(e?.message || "Watchdog failed"),
  });

  const resolve = useMutation({
    mutationFn: async (args: { session_id: string; resolution: Resolution; out_time?: string; note?: string }) => {
      const { data, error } = await (supabase as any).rpc("hr_resolve_stale_session", {
        p_session_id: args.session_id,
        p_resolution: args.resolution,
        p_out_time: args.out_time || null,
        p_note: args.note || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Session resolved");
      setDlg(null);
      setOutTime("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["hr_stale_sessions"] });
      qc.invalidateQueries({ queryKey: ["hr_attendance_unified"] });
    },
    onError: (e: any) => toast.error(e?.message || "Resolution failed"),
  });

  const openCount = useMemo(() => rows.filter((r) => r.status === "open").length, [rows]);

  const openDialog = (row: StaleRow, resolution: Resolution) => {
    setDlg({ row, resolution });
    setNote("");
    if (resolution === "set_out_time") {
      // Default suggestion: in_time + 9h, formatted for datetime-local (IST).
      const suggested = new Date(new Date(row.in_time).getTime() + 9 * 60 * 60 * 1000);
      const istOffset = 5.5 * 60 * 60 * 1000;
      const local = new Date(suggested.getTime() + istOffset - suggested.getTimezoneOffset() * 60 * 1000);
      setOutTime(local.toISOString().slice(0, 16));
    } else {
      setOutTime("");
    }
  };

  const submitResolution = () => {
    if (!dlg) return;
    const args: any = { session_id: dlg.row.session_id, resolution: dlg.resolution, note };
    if (dlg.resolution === "set_out_time") {
      if (!outTime) return toast.error("Pick an out-time");
      // datetime-local is treated as IST; convert to UTC ISO.
      const asUtc = new Date(new Date(outTime).getTime() - 5.5 * 60 * 60 * 1000).toISOString();
      args.out_time = asUtc;
    }
    resolve.mutate(args);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stale Attendance Sessions"
        subtitle="Sessions open >12h — resolve to keep payroll fair."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatusFilter(statusFilter === "open" ? "all" : "open")}
            >
              {statusFilter === "open" ? "Show all" : "Show open only"}
            </Button>
            <Button size="sm" onClick={() => runWatchdog.mutate()} disabled={runWatchdog.isPending}>
              <RefreshCw className={`h-4 w-4 mr-2 ${runWatchdog.isPending ? "animate-spin" : ""}`} />
              Run watchdog
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          <div>
            <div className="text-2xl font-semibold">{openCount}</div>
            <div className="text-sm text-muted-foreground">open sessions awaiting resolution</div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground p-6">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No stale sessions"
          description="All attendance sessions have closed within 12 hours."
        />
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Card key={r.id} className={r.status === "open" ? "border-amber-500/60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {r.employee?.first_name} {r.employee?.last_name}{" "}
                    <span className="text-xs text-muted-foreground">({r.employee?.badge_id})</span>
                  </CardTitle>
                  <Badge variant={r.status === "open" ? "destructive" : "secondary"}>
                    {r.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <div className="text-muted-foreground text-xs">Window date</div>
                    <div>{r.attendance_date}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">In-time (IST)</div>
                    <div>{format(new Date(r.in_time), "dd MMM, HH:mm")}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Open for</div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {r.hours_open}h
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">First flagged</div>
                    <div>{formatDistanceToNow(new Date(r.first_seen_at), { addSuffix: true })}</div>
                  </div>
                </div>
                {r.resolution_note && (
                  <div className="text-xs text-muted-foreground border-l-2 pl-2">{r.resolution_note}</div>
                )}
                {r.status === "open" && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" onClick={() => openDialog(r, "set_out_time")}>
                      Set out-time
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => openDialog(r, "confirm_long_shift")}>
                      Confirm long shift
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => openDialog(r, "void")}>
                      <XCircle className="h-4 w-4 mr-1" /> Void
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ResponsiveDialog
        open={!!dlg}
        onOpenChange={(o) => !o && setDlg(null)}
        title={
          dlg?.resolution === "set_out_time"
            ? "Set out-time"
            : dlg?.resolution === "confirm_long_shift"
            ? "Confirm long shift"
            : "Void session"
        }
      >
        <div className="space-y-3">
          {dlg?.resolution === "set_out_time" && (
            <div className="space-y-1">
              <Label>Out-time (IST)</Label>
              <Input type="datetime-local" value={outTime} onChange={(e) => setOutTime(e.target.value)} />
            </div>
          )}
          {dlg?.resolution === "confirm_long_shift" && (
            <div className="text-sm text-muted-foreground">
              Confirms a genuine long shift. Out-time will be capped at <b>watchdog + 2h</b> from the in-time.
            </div>
          )}
          {dlg?.resolution === "void" && (
            <div className="text-sm text-destructive">
              This deletes the offending in-punch and rebuilds the day. Use only for forgotten punches.
            </div>
          )}
          <div className="space-y-1">
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button>
            <Button onClick={submitResolution} disabled={resolve.isPending}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Confirm
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
