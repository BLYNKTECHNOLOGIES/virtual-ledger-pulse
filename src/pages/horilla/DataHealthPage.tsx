import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Filter,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import {
  pushIdentityToRazorpay,
  pushBankToRazorpay,
  pushSalaryToRazorpay,
  pushEmploymentToRazorpay,
} from "@/lib/razorpayPushback";
import { pushIdentityToEssl, deleteFromEssl } from "@/lib/esslPushback";

type Drift = {
  id: string;
  hr_employee_id: string;
  field: string;
  systems_involved: string[];
  hrms_value: string | null;
  razorpay_value: string | null;
  essl_value: string | null;
  severity: "low" | "medium" | "high" | "critical";
  first_seen_at: string;
  last_seen_at: string;
  employee_name: string;
  badge_id: string | null;
  is_active: boolean;
};

const SEVERITY_STYLE: Record<Drift["severity"], string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning/10 text-warning",
  high: "bg-destructive/10 text-destructive",
  critical: "bg-destructive/20 text-destructive font-semibold",
};

const FIELD_LABEL: Record<string, string> = {
  full_name: "Full name",
  email: "Email",
  phone: "Phone",
  dob: "Date of birth",
  gender: "Gender",
  pan: "PAN",
  date_of_joining: "Date of joining",
  department: "Department",
  designation: "Designation",
  employee_code: "Employee code / badge",
  active_state: "Active / dismissed",
  bank_account: "Bank account #",
  bank_ifsc: "Bank IFSC",
  annual_ctc: "Annual CTC",
};

// Field → which Razorpay push to use when adopting the HRMS value.
const PUSH_BY_FIELD: Record<string, (id: string) => Promise<any>> = {
  full_name: (id) => pushIdentityToRazorpay(id, { triggeredFrom: "data_health" }),
  email: (id) => pushIdentityToRazorpay(id, { triggeredFrom: "data_health" }),
  phone: (id) => pushIdentityToRazorpay(id, { triggeredFrom: "data_health" }),
  dob: (id) => pushIdentityToRazorpay(id, { triggeredFrom: "data_health" }),
  gender: (id) => pushIdentityToRazorpay(id, { triggeredFrom: "data_health" }),
  pan: (id) => pushIdentityToRazorpay(id, { triggeredFrom: "data_health" }),
  date_of_joining: (id) => pushEmploymentToRazorpay(id, { triggeredFrom: "data_health" }),
  department: (id) => pushEmploymentToRazorpay(id, { triggeredFrom: "data_health" }),
  designation: (id) => pushEmploymentToRazorpay(id, { triggeredFrom: "data_health" }),
  employee_code: (id) => pushEmploymentToRazorpay(id, { triggeredFrom: "data_health" }),
  bank_account: (id) => pushBankToRazorpay(id, { triggeredFrom: "data_health" }),
  bank_ifsc: (id) => pushBankToRazorpay(id, { triggeredFrom: "data_health" }),
  annual_ctc: (id) => pushSalaryToRazorpay(id, { triggeredFrom: "data_health" }),
};

// Fields for which eSSL is a target — device holds only identity + roster.
const ESSL_PUSHABLE_FIELDS = new Set(["full_name", "employee_code", "active_state"]);

export default function DataHealthPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const empFilter = params.get("employee");
  const [severity, setSeverity] = useState<string>("all");
  const [systemPair, setSystemPair] = useState<string>("all");
  const [scanning, setScanning] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const { data: drifts, isLoading } = useQuery({
    queryKey: ["data_health_drifts", empFilter],
    queryFn: async () => {
      let q: any = (supabase as any)
        .from("hr_drift_open")
        .select("*")
        .order("severity", { ascending: false })
        .order("last_seen_at", { ascending: false })
        .limit(500);
      if (empFilter) q = q.eq("hr_employee_id", empFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Drift[];
    },
  });

  const filtered = useMemo(() => {
    if (!drifts) return [];
    return drifts.filter((d) => {
      if (severity !== "all" && d.severity !== severity) return false;
      if (systemPair !== "all") {
        const pair = systemPair.split("_"); // e.g. "hrms_razorpay"
        if (!pair.every((s) => d.systems_involved.includes(s))) return false;
      }
      return true;
    });
  }, [drifts, severity, systemPair]);

  const kpis = useMemo(() => {
    const all = drifts ?? [];
    return {
      total: all.length,
      critical: all.filter((d) => d.severity === "critical").length,
      high: all.filter((d) => d.severity === "high").length,
      medium: all.filter((d) => d.severity === "medium").length,
      employees: new Set(all.map((d) => d.hr_employee_id)).size,
    };
  }, [drifts]);

  async function runScan() {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("hr-drift-scan", {
        body: empFilter ? { employee_id: empFilter } : {},
      });
      if (error) throw error;
      toast.success(
        `Scan complete — ${data?.drifts_upserted ?? 0} new/updated, ${data?.resolved ?? 0} resolved`,
      );
      qc.invalidateQueries({ queryKey: ["data_health_drifts"] });
    } catch (e: any) {
      toast.error(`Scan failed: ${e?.message || e}`);
    } finally {
      setScanning(false);
    }
  }

  async function adoptHrms(drift: Drift) {
    const push = PUSH_BY_FIELD[drift.field];
    if (!push) {
      toast.info("This field has no automated push route — resolve manually in Razorpay.");
      return;
    }
    setResolvingId(drift.id);
    try {
      const res = await push(drift.hr_employee_id);
      if (res?.ok) {
        toast.success(`${FIELD_LABEL[drift.field] || drift.field} pushed to Razorpay`);
        await (supabase as any)
          .from("hr_drift_alerts")
          .update({ resolved_at: new Date().toISOString(), resolution_note: "Adopted HRMS value" })
          .eq("id", drift.id);
        qc.invalidateQueries({ queryKey: ["data_health_drifts"] });
      }
    } finally {
      setResolvingId(null);
    }
  }

  // Push HRMS value into eSSL biometric devices. Roster drift is closed only
  // after the device ACKs the command (webhook mirrors the change).
  async function adoptEssl(drift: Drift) {
    setResolvingId(drift.id);
    try {
      const isInactive = drift.field === "active_state" && !drift.is_active;
      const res = isInactive
        ? await deleteFromEssl(drift.hr_employee_id, { triggeredFrom: "data_health" })
        : await pushIdentityToEssl(drift.hr_employee_id, { triggeredFrom: "data_health" });
      if (res?.ok) {
        await (supabase as any)
          .from("hr_drift_alerts")
          .update({
            resolution_note: "Queued eSSL push — awaiting device ACK",
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", drift.id);
        qc.invalidateQueries({ queryKey: ["data_health_drifts"] });
      }
    } finally {
      setResolvingId(null);
    }
  }

  async function markResolved(drift: Drift, note: string) {
    setResolvingId(drift.id);
    try {
      await (supabase as any)
        .from("hr_drift_alerts")
        .update({ resolved_at: new Date().toISOString(), resolution_note: note })
        .eq("id", drift.id);
      toast.success("Marked resolved");
      qc.invalidateQueries({ queryKey: ["data_health_drifts"] });
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto page-mount">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-foreground flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-[#E8604C]" />
            Data Health
            {empFilter && (
              <span className="text-xs font-normal text-muted-foreground">
                • filtered to one employee
                <button
                  onClick={() => setParams({})}
                  className="ml-2 underline hover:text-foreground"
                >
                  clear
                </button>
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            3-way reconciliation across HRMS ↔ RazorpayX ↔ eSSL biometric. Adopt HRMS is
            the recommended default — ERP is the source of truth.
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="inline-flex items-center gap-2 rounded-lg bg-[#E8604C] px-4 py-2 text-sm font-medium text-white hover:bg-[#d04e3c] disabled:opacity-50"
        >
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Rescan now
        </button>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Open drifts", value: kpis.total, tone: "text-foreground" },
          { label: "Critical", value: kpis.critical, tone: "text-destructive" },
          { label: "High", value: kpis.high, tone: "text-destructive/80" },
          { label: "Medium", value: kpis.medium, tone: "text-warning" },
          { label: "Employees affected", value: kpis.employees, tone: "text-foreground" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className={`text-2xl font-semibold mt-0.5 ${k.tone}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
        >
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={systemPair}
          onChange={(e) => setSystemPair(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
        >
          <option value="all">All system pairs</option>
          <option value="hrms_razorpay">HRMS ↔ Razorpay</option>
          <option value="hrms_essl">HRMS ↔ eSSL</option>
          <option value="razorpay_essl">Razorpay ↔ eSSL</option>
        </select>
      </div>

      {/* Rows */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
            Loading drifts…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
            No open drifts. All three systems are in sync.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((d) => (
              <div key={d.id} className="p-3 md:p-4 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${SEVERITY_STYLE[d.severity]}`}>
                      {d.severity}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {FIELD_LABEL[d.field] || d.field}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {d.employee_name}
                      {d.badge_id ? ` · ${d.badge_id}` : ""}
                    </span>
                    {!d.is_active && (
                      <span className="text-[10px] uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        inactive
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <ValueCol label="HRMS" value={d.hrms_value} highlight />
                    <ValueCol label="Razorpay" value={d.razorpay_value} />
                    <ValueCol label="eSSL" value={d.essl_value} />
                  </div>
                </div>
                <div className="flex flex-wrap md:flex-col gap-2 md:justify-center">
                  <button
                    disabled={resolvingId === d.id || !PUSH_BY_FIELD[d.field]}
                    onClick={() => adoptHrms(d)}
                    className="inline-flex items-center gap-1 rounded-md bg-[#E8604C] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#d04e3c] disabled:opacity-50"
                  >
                    {resolvingId === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Adopt HRMS → push
                  </button>
                  <button
                    disabled={resolvingId === d.id}
                    onClick={() => markResolved(d, "Manually marked resolved")}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    Mark resolved
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Only intersecting fields that exist in at least two systems are compared. Bank
        account and IFSC pushes to Razorpay require the salary/bank-push endpoint gate to
        be enabled in Razorpay settings — otherwise the drift will re-appear at the next scan.
      </p>
    </div>
  );
}

function ValueCol({ label, value, highlight }: { label: string; value: string | null; highlight?: boolean }) {
  return (
    <div className={`rounded-md border px-2 py-1.5 ${highlight ? "border-[#E8604C]/30 bg-[#E8604C]/5" : "border-border bg-background"}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xs font-medium mt-0.5 truncate ${value ? "text-foreground" : "text-muted-foreground italic"}`}>
        {value ?? "—"}
      </div>
    </div>
  );
}
