import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RefreshCw, UserX, EyeOff, Undo2 } from "lucide-react";
import { Link } from "react-router-dom";

type Orphan = {
  id: string;
  razorpay_employee_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  pan: string | null;
  department: string | null;
  designation: string | null;
  date_of_joining: string | null;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  resolution_note: string | null;
};

/**
 * Roster drift — people who exist in RazorpayX payroll but have NO matching
 * employee in HRMS. Same class of violation as a field mismatch: the three
 * systems (HRMS / RazorpayX / eSSL) must hold the same roster.
 */
export function RazorpayOrphanPanel({ scanSignal = 0 }: { scanSignal?: number }) {
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["razorpay_orphans", showIgnored],
    queryFn: async () => {
      const statuses = showIgnored ? ["open", "ignored"] : ["open"];
      const { data, error } = await (supabase as any)
        .from("hr_razorpay_orphans")
        .select("*")
        .in("status", statuses)
        .order("razorpay_employee_id", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Orphan[];
    },
    staleTime: 30_000,
  });

  async function runScan() {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("razorpay-payroll-proxy", {
        body: { action: "scan_orphans", start_id: 1, max_id: 300 },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const d = data as any;
      toast.success(
        `Scanned ${d.scanned} RazorpayX people — ${d.orphans} not in HRMS, ${d.matched} linked, ${d.dismissed} dismissed.`,
      );
      qc.invalidateQueries({ queryKey: ["razorpay_orphans"] });
    } catch (e: any) {
      toast.error(`Roster scan failed: ${e?.message || e}`);
    } finally {
      setScanning(false);
    }
  }

  // The page owns the single "Rescan now" control; it bumps scanSignal to run
  // the roster scan alongside the field-drift scan.
  const lastSignal = useRef(scanSignal);
  useEffect(() => {
    if (scanSignal !== lastSignal.current) {
      lastSignal.current = scanSignal;
      if (!scanning) runScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanSignal]);

  async function setStatus(row: Orphan, status: "ignored" | "open") {
    setBusyId(row.id);
    try {
      const { error } = await (supabase as any)
        .from("hr_razorpay_orphans")
        .update({
          status,
          resolved_at: null,
          resolution_note:
            status === "ignored" ? "Manually ignored by HR — not expected in HRMS" : null,
        })
        .eq("id", row.id);
      if (error) throw error;
      toast.success(status === "ignored" ? "Marked as ignored" : "Restored to open");
      qc.invalidateQueries({ queryKey: ["razorpay_orphans"] });
    } catch (e: any) {
      toast.error(`Update failed: ${e?.message || e}`);
    } finally {
      setBusyId(null);
    }
  }

  const open = (rows ?? []).filter((r) => r.status === "open");

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="p-4 flex flex-wrap items-start justify-between gap-3 border-b border-border">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <UserX className={`h-4 w-4 ${open.length ? "text-destructive" : "text-muted-foreground"}`} />
            <span className="text-sm font-medium text-foreground">
              In RazorpayX but not in HRMS — {open.length} person{open.length === 1 ? "" : "s"}
            </span>
            {scanning && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowIgnored((v) => !v)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted"
          >
            {showIgnored ? "Hide ignored" : "Show ignored"}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-4 text-xs text-muted-foreground">Loading…</div>
      ) : (rows ?? []).length === 0 ? (
        <div className="p-4 text-xs text-muted-foreground">
          None detected.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {(rows ?? []).map((r) => (
            <div key={r.id} className="p-3 md:p-4 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {r.name || "Unnamed RazorpayX person"}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    RZP ID {r.razorpay_employee_id}
                  </span>
                  {r.status === "ignored" ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      ignored
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium inline-flex items-center gap-1">
                      <AlertTriangle className="h-2.5 w-2.5" /> roster drift
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 mt-2 text-xs text-muted-foreground">
                  <div className="truncate">Email: {r.email || "—"}</div>
                  <div className="truncate">Phone: {r.phone || "—"}</div>
                  <div className="truncate">PAN: {r.pan || "—"}</div>
                  <div className="truncate">Dept: {r.department || "—"}</div>
                  <div className="truncate">Designation: {r.designation || "—"}</div>
                  <div className="truncate">Joined: {r.date_of_joining || "—"}</div>
                </div>
              </div>
              <div className="flex md:flex-col gap-2 md:items-end">
                <Link
                  to="/hrms/onboarding/pipeline"
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted whitespace-nowrap"
                >
                  Onboard in HRMS
                </Link>
                {r.status === "open" ? (
                  <button
                    disabled={busyId === r.id}
                    onClick={() => setStatus(r, "ignored")}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <EyeOff className="h-3.5 w-3.5" /> Ignore
                  </button>
                ) : (
                  <button
                    disabled={busyId === r.id}
                    onClick={() => setStatus(r, "open")}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <Undo2 className="h-3.5 w-3.5" /> Restore
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
