import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  Loader2,
  ChevronDown,
  MoreHorizontal,
  ArrowRight,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  pushIdentityToRazorpay,
  pushBankToRazorpay,
  pushSalaryToRazorpay,
  pushEmploymentToRazorpay,
  dismissInRazorpay,
} from "@/lib/razorpayPushback";
import { pushIdentityToEssl, deleteFromEssl } from "@/lib/esslPushback";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useComplianceSettings, complianceDriftForPayslip } from "@/hooks/hrms/useComplianceSettings";
import { Link } from "react-router-dom";
import { PayslipParityTile, EmailDispatchHealthTile, RosterCompletenessTile } from "@/components/hrms/health/PayrollHealthTiles";
import { RazorpayOrphanPanel } from "@/components/hrms/health/RazorpayOrphanPanel";
import { ErpAccountHealthPanel } from "@/components/hrms/health/ErpAccountHealthPanel";

import { PullFromRazorpayDialog, type PullTarget } from "@/components/hr/governance/PullFromRazorpayDialog";

// Fields we can write back into HRMS from RazorpayX. Mirrors PULLABLE_FIELDS
// in the hr-razorpay-pull-apply edge function.
const PULLABLE_FIELDS = new Set([
  "full_name", "email", "phone", "dob", "gender", "pan", "date_of_joining",
  "department", "designation", "bank_account", "bank_ifsc", "annual_ctc", "active_state",
]);


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
  resolution_note?: string | null;
  employee_name: string;
  badge_id: string | null;
  is_active: boolean;
  auto_status?: "open" | "auto_dismissed" | "auto_labeled" | null;
  auto_reason?: string | null;
  merged_note?: string | null;
};



// Alerts raised by a FAILED push (not by the 3-way scanner) carry no
// hrms/razorpay/essl values — the failure detail lives in resolution_note.
// Rendering three empty boxes for these makes them look like phantom drifts.
const isPushFailureAlert = (d: Drift) =>
  !d.hrms_value && !d.razorpay_value && !d.essl_value;



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
  identity_bundle: "Identity details — push failure",
  bank_bundle: "Bank details — push failure",
  statutory_enrollment: "Statutory enrollment — push failure",
  razorpay_link: "RazorpayX link — push failure",
  employment_bundle: "Employment details — push failure",
  dismissal_state: "Dismissal — push failure",
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
  // Verification-failure bundles raised by the pushback layer — retry the same
  // push envelope that failed to verify.
  identity_bundle: (id) => pushIdentityToRazorpay(id, { triggeredFrom: "data_health" }),
  bank_bundle: (id) => pushBankToRazorpay(id, { triggeredFrom: "data_health" }),
  employment_bundle: (id) => pushEmploymentToRazorpay(id, { triggeredFrom: "data_health" }),
};

// Fields for which eSSL is a target — device holds only identity + roster.
const ESSL_PUSHABLE_FIELDS = new Set(["full_name", "employee_code", "active_state"]);

export default function DataHealthPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const empFilter = params.get("employee");
  const [severity, setSeverity] = useState<string>("all");
  const [systemPair, setSystemPair] = useState<string>("all");
  const [unexplainedOnly, setUnexplainedOnly] = useState<boolean>(
    params.get("unexplained") === "1",
  );
  const [scanning, setScanning] = useState(false);
  const [scanSignal, setScanSignal] = useState(0);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [pullTarget, setPullTarget] = useState<PullTarget | null>(null);
  const [esslDeleteTarget, setEsslDeleteTarget] = useState<Drift | null>(null);
  const [pulling, setPulling] = useState(false);


  const { data: ghostResidual } = useQuery({
    queryKey: ["data_health_ghost_residual"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_ghost_email_residual_v")
        .select("*")
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; recipient: string | null; subject: string | null; last_error: string | null; attempts: number | null }>;
    },
    staleTime: 60_000,
  });

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
      const rows = (data ?? []) as Drift[];

      // The drift view carries only the employee UUID — hydrate name / badge
      // so HR can tell whose record is out of sync.
      const ids = Array.from(new Set(rows.map((r) => r.hr_employee_id).filter(Boolean)));
      if (ids.length) {
        const { data: emps } = await (supabase as any)
          .from("hr_employees")
          .select("id, first_name, last_name, badge_id, is_active")
          .in("id", ids);
        const map = new Map<string, any>((emps ?? []).map((e: any) => [e.id, e]));
        for (const r of rows) {
          const e = map.get(r.hr_employee_id);
          r.employee_name =
            [e?.first_name, e?.last_name].filter(Boolean).join(" ").trim() || "Unknown employee";
          r.badge_id = e?.badge_id ?? null;
          r.is_active = e?.is_active ?? true;
        }
      }
      return rows;
    },
  });


  // Statutory rollup — scans recent imported Razorpay payslips against the
  // compliance mirror; a payslip shows an amount for a filing Razorpay says
  // it isn't handling → must be remitted manually. Rolled up here so HR sees
  // the count without opening every payslip cell.
  const { data: complianceSettings } = useComplianceSettings();
  const { data: statutoryRollup } = useQuery({
    queryKey: ["data_health_statutory_rollup"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_razorpay_payslip_records")
        .select("id, hr_employee_id, period_month, tds_amount, pf_amount, esi_amount, professional_tax")
        .order("period_month", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!complianceSettings,
    staleTime: 60_000,
  });
  const statutoryDrift = useMemo(() => {
    if (!complianceSettings || !statutoryRollup) return { count: 0, employees: 0, samples: [] as any[] };
    const affected = new Set<string>();
    let count = 0;
    const samples: any[] = [];
    for (const row of statutoryRollup) {
      const msgs = complianceDriftForPayslip(row, complianceSettings);
      if (msgs.length) {
        count += msgs.length;
        if (row.hr_employee_id) affected.add(row.hr_employee_id);
        if (samples.length < 5) samples.push({ ...row, msgs });
      }
    }
    return { count, employees: affected.size, samples };
  }, [complianceSettings, statutoryRollup]);

  // Unknown per-employee statutory enrollment — every active employee whose
  // pf/esi/pt flags are NULL. Shadow engine falls back to global compliance
  // for these, which is only correct if they truly follow the global default.
  const { data: unknownEnrollmentRows } = useQuery({
    queryKey: ["data_health_unknown_enrollment"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employees")
        .select("id, first_name, last_name, badge_id, pf_enabled, esi_enabled, pt_enabled")
        .eq("is_active", true)
        .or("pf_enabled.is.null,esi_enabled.is.null,pt_enabled.is.null")
        .order("badge_id", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
  });
  const [derivingEnrollment, setDerivingEnrollment] = useState(false);
  async function deriveAllEnrollment() {
    setDerivingEnrollment(true);
    try {
      const { data, error } = await (supabase as any).rpc("hr_derive_all_statutory_enrollments");
      if (error) throw error;
      const updated = (data as any)?.updated_from_history ?? 0;
      const remaining = (data as any)?.still_unknown_no_history ?? 0;
      toast.success(
        `Derived enrollment for ${updated} employee${updated === 1 ? "" : "s"} from register history. ${remaining} still unknown (no register imported yet).`,
      );
      qc.invalidateQueries({ queryKey: ["data_health_unknown_enrollment"] });
    } catch (e: any) {
      toast.error(`Derivation failed: ${e?.message || e}`);
    } finally {
      setDerivingEnrollment(false);
    }
  }


  // A failed dismissal push and the resulting HRMS-inactive / Razorpay-active
  // drift are the SAME problem for the same person. Collapse them once, and
  // drive BOTH the cards and the KPI counters off this deduped set so the
  // stats can never claim more open drifts than the list shows.
  const deduped = useMemo(() => {
    if (!drifts) return [];
    const activeStateByEmp = new Set(
      drifts.filter((d) => d.field === "active_state").map((d) => d.hr_employee_id),
    );
    const noteByEmp = new Map<string, { note: string; at: string }>();
    for (const d of drifts) {
      if (d.field === "dismissal_state" && activeStateByEmp.has(d.hr_employee_id)) {
        noteByEmp.set(d.hr_employee_id, {
          note: d.resolution_note || "Last dismissal push did not verify.",
          at: d.first_seen_at,
        });
      }
    }
    return drifts
      .filter((d) => !(d.field === "dismissal_state" && activeStateByEmp.has(d.hr_employee_id)))
      .map((d) =>
        d.field === "active_state" && noteByEmp.has(d.hr_employee_id)
          ? { ...d, merged_note: noteByEmp.get(d.hr_employee_id)!.note }
          : d,
      );
  }, [drifts]);

  const filtered = useMemo(() => {
    return deduped.filter((d) => {
      if (unexplainedOnly && (d.auto_status ?? "open") !== "open") return false;
      if (severity !== "all" && d.severity !== severity) return false;
      if (systemPair !== "all") {
        const pair = systemPair.split("_");
        if (!pair.every((s) => d.systems_involved.includes(s))) return false;
      }
      return true;
    });
  }, [deduped, severity, systemPair, unexplainedOnly]);


  const kpis = useMemo(() => {
    const all = deduped;
    const unexplained = all.filter((d) => (d.auto_status ?? "open") === "open");
    return {
      total: all.length,
      unexplained: unexplained.length,
      critical: all.filter((d) => d.severity === "critical").length,
      high: all.filter((d) => d.severity === "high").length,
      medium: all.filter((d) => d.severity === "medium").length,
      employees: new Set(all.map((d) => d.hr_employee_id)).size,
    };
  }, [deduped]);

  async function runScan() {
    setScanSignal((s) => s + 1);
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
    const push = drift.field === "active_state" && !drift.is_active
      ? async (id: string) => {
          const { data: employee, error } = await (supabase as any)
            .from("hr_employees")
            .select("last_working_day, termination_date, notice_period_end_date, separation_reason")
            .eq("id", id)
            .single();
          if (error) throw error;
          const dismissalDate = employee?.last_working_day
            || employee?.termination_date
            || employee?.notice_period_end_date;
          if (!dismissalDate) throw new Error("Set the employee's last working day before dismissing them in RazorpayX.");
          return dismissInRazorpay(id, {
            dateOfDismissal: dismissalDate,
            reason: employee?.separation_reason,
            triggeredFrom: "data_health",
          });
        }
      : PUSH_BY_FIELD[drift.field];
    if (!push) {
      toast.info("This field has no automated push route — resolve manually in Razorpay.");
      return;
    }
    setResolvingId(drift.id);
    try {
      const res = await push(drift.hr_employee_id);
      if (res?.ok) {
        // Never hide a card merely because the write helper returned success.
        // Force a live, employee-scoped scan; it alone resolves the alert after
        // comparing HRMS with the newly persisted RazorpayX read-back snapshot.
        const { data: scan, error: scanError } = await supabase.functions.invoke("hr-drift-scan", {
          body: { employee_id: drift.hr_employee_id, max_age_hours: 0 },
        });
        if (scanError || scan?.ok === false) {
          throw new Error(scan?.error || scanError?.message || "Post-push verification scan failed");
        }
        await qc.invalidateQueries({ queryKey: ["data_health_drifts"] });
        const { data: stillOpen, error: checkError } = await (supabase as any)
          .from("hr_drift_alerts")
          .select("id")
          .eq("id", drift.id)
          .is("resolved_at", null)
          .maybeSingle();
        if (checkError) throw checkError;
        if (stillOpen) {
          toast.error(`${FIELD_LABEL[drift.field] || drift.field} is still different in RazorpayX`);
        } else {
          toast.success(`${FIELD_LABEL[drift.field] || drift.field} verified in RazorpayX`);
        }
      }
    } catch (e: any) {
      toast.error(`Push verification failed: ${e?.message || e}`);
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

  // Operator says they applied the change by hand in the RazorpayX dashboard
  // (used for fields RazorpayX refuses over the API, e.g. work email).
  // We never trust the claim: re-read RazorpayX live and close the card only
  // when the fresh snapshot actually matches HRMS.
  async function verifyManualRazorpayUpdate(drift: Drift) {
    setResolvingId(drift.id);
    try {
      const { data: scan, error: scanError } = await supabase.functions.invoke("hr-drift-scan", {
        body: { employee_id: drift.hr_employee_id, max_age_hours: 0 },
      });
      if (scanError || scan?.ok === false) {
        throw new Error(scan?.error || scanError?.message || "Verification scan failed");
      }

      const { data: openRows, error: openError } = await (supabase as any)
        .from("hr_drift_alerts")
        .select("id, field, hrms_value, razorpay_value")
        .eq("hr_employee_id", drift.hr_employee_id)
        .is("resolved_at", null);
      if (openError) throw openError;

      const rows: Drift[] = (openRows || []) as Drift[];
      const stillOpen = rows.some((r) => r.id === drift.id);
      const fieldDriftsRemaining = rows.filter((r) => !isPushFailureAlert(r)).length;
      const bundleAlert = isPushFailureAlert(drift);

      if (bundleAlert && fieldDriftsRemaining === 0 && stillOpen) {
        // Push-failure cards are synthetic: the scanner cannot resolve them.
        // No real field difference left ⇒ the manual edit landed.
        const { error } = await (supabase as any)
          .from("hr_drift_alerts")
          .update({
            resolved_at: new Date().toISOString(),
            resolution_note: "Verified after manual RazorpayX dashboard update",
          })
          .eq("id", drift.id);
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ["data_health_drifts"] });
        toast.success("Verified against RazorpayX — difference closed");
        return;
      }

      await qc.invalidateQueries({ queryKey: ["data_health_drifts"] });
      if (stillOpen) {
        toast.error(
          `RazorpayX still shows the old ${FIELD_LABEL[drift.field] || drift.field} — no change detected`,
        );
      } else {
        toast.success("Verified against RazorpayX — difference closed");
      }
    } catch (e: any) {
      toast.error(`Verification failed: ${e?.message || e}`);
    } finally {
      setResolvingId(null);
    }
  }

  async function markResolved(drift: Drift, note: string) {

    setResolvingId(drift.id);
    try {
      const { error } = await (supabase as any)
        .from("hr_drift_alerts")
        .update({ resolved_at: new Date().toISOString(), resolution_note: note })
        .eq("id", drift.id);
      if (error) {
        toast.error(`Could not mark resolved: ${error.message}`);
        return;
      }
      toast.success("Marked resolved");
      qc.invalidateQueries({ queryKey: ["data_health_drifts"] });
    } finally {
      setResolvingId(null);
    }
  }

  // Reverse direction: adopt the RazorpayX value into HRMS.
  async function runPull(target: PullTarget, confirmSensitive: boolean) {
    setPulling(true);
    try {
      const { data, error } = await supabase.functions.invoke("hr-razorpay-pull-apply", {
        body: {
          hr_employee_id: target.hrEmployeeId,
          fields: [target.field],
          confirm_sensitive: confirmSensitive,
        },
      });
      if (error) throw error;
      const result = data?.results?.[0];
      if (data?.ok && result?.applied) {
        toast.success(
          `${target.fieldLabel} adopted into HRMS${result.reason ? ` — ${result.reason}` : ""}`,
        );
        setPullTarget(null);
        qc.invalidateQueries({ queryKey: ["data_health_drifts"] });
      } else {
        toast.error(result?.reason || data?.error || "Nothing was applied");
      }
    } catch (e: any) {
      toast.error(`Pull failed: ${e?.message || e}`);
    } finally {
      setPulling(false);
    }
  }

  // Group the worklist by person so one employee with several drifts reads as
  // a single block instead of N unrelated cards.
  const groups = useMemo(() => {
    const map = new Map<string, { empId: string; name: string; badge: string | null; isActive: boolean; rows: Drift[] }>();
    for (const d of filtered) {
      const g = map.get(d.hr_employee_id) ?? {
        empId: d.hr_employee_id,
        name: d.employee_name || "Unknown employee",
        badge: d.badge_id,
        isActive: d.is_active,
        rows: [],
      };
      g.rows.push(d);
      map.set(d.hr_employee_id, g);
    }
    return Array.from(map.values());
  }, [filtered]);

  const counters: Array<{ key: string; label: string; value: number; tone: string; onClick?: () => void; active?: boolean }> = [
    { key: "open", label: "Open", value: kpis.total, tone: "text-foreground", onClick: () => { setSeverity("all"); setUnexplainedOnly(false); }, active: severity === "all" && !unexplainedOnly },
    { key: "unexplained", label: "Unexplained", value: kpis.unexplained, tone: kpis.unexplained > 0 ? "text-destructive" : "text-success", onClick: () => toggleUnexplained(!unexplainedOnly), active: unexplainedOnly },
    { key: "critical", label: "Critical", value: kpis.critical, tone: kpis.critical > 0 ? "text-destructive" : "text-muted-foreground", onClick: () => setSeverity(severity === "critical" ? "all" : "critical"), active: severity === "critical" },
    { key: "high", label: "High", value: kpis.high, tone: kpis.high > 0 ? "text-destructive/80" : "text-muted-foreground", onClick: () => setSeverity(severity === "high" ? "all" : "high"), active: severity === "high" },
    { key: "medium", label: "Medium", value: kpis.medium, tone: kpis.medium > 0 ? "text-warning" : "text-muted-foreground", onClick: () => setSeverity(severity === "medium" ? "all" : "medium"), active: severity === "medium" },
    { key: "employees", label: "Employees", value: kpis.employees, tone: "text-foreground" },
  ];

  function toggleUnexplained(next: boolean) {
    setUnexplainedOnly(next);
    const p = new URLSearchParams(params);
    if (next) p.set("unexplained", "1"); else p.delete("unexplained");
    setParams(p, { replace: true });
  }

  return (
    <div className="w-full px-4 md:px-6 pb-6 space-y-4 page-mount">
      {/* Command bar — identity, scan, counters and filters in one block */}
      <header className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-background/90 backdrop-blur border-b border-border space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl md:text-2xl font-semibold text-foreground flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Data Health
            {empFilter && (
              <button
                onClick={() => setParams({})}
                className="text-[11px] font-normal rounded-full border border-border px-2 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                1 employee · clear
              </button>
            )}
          </h1>
          <button
            onClick={runScan}
            disabled={scanning}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Rescan now
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {counters.map((c) => {
            const content = (
              <>
                <span className={`text-sm font-semibold tabular-nums ${c.tone}`}>{c.value}</span>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</span>
              </>
            );
            return c.onClick ? (
              <button
                key={c.key}
                onClick={c.onClick}
                data-active={c.active}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 transition-colors hover:bg-muted data-[active=true]:border-primary/50 data-[active=true]:bg-primary/10"
              >
                {content}
              </button>
            ) : (
              <span key={c.key} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
                {content}
              </span>
            );
          })}

          <span className="mx-1 hidden h-5 w-px bg-border md:inline-block" />

          <label className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground cursor-pointer select-none hover:bg-muted">
            <Checkbox
              checked={unexplainedOnly}
              onCheckedChange={(v) => toggleUnexplained(v === true)}
              className="h-3.5 w-3.5"
            />
            Unexplained only
          </label>

          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="h-8 w-[150px] text-xs text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          <Select value={systemPair} onValueChange={setSystemPair}>
            <SelectTrigger className="h-8 w-[170px] text-xs text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All system pairs</SelectItem>
              <SelectItem value="hrms_razorpay">HRMS ↔ Razorpay</SelectItem>
              <SelectItem value="hrms_essl">HRMS ↔ eSSL</SelectItem>
              <SelectItem value="razorpay_essl">Razorpay ↔ eSSL</SelectItem>
            </SelectContent>
          </Select>

          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            showing {filtered.length}/{kpis.total}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start">
        {/* Worklist */}
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
              In sync
            </div>
          ) : (
            <div className="divide-y divide-border">
              {groups.map((g) => (
                <div key={g.empId}>
                  <div className="flex flex-wrap items-center gap-2 bg-muted/40 px-3 md:px-4 py-2 border-b border-border">
                    <Link
                      to={`/hrms/employee/${g.empId}`}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      {g.name}
                    </Link>
                    <span className="text-[11px] font-mono text-muted-foreground bg-background border border-border px-1.5 py-0.5 rounded">
                      ID: {g.badge || "—"}
                    </span>
                    {!g.isActive && (
                      <span className="text-[10px] uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        inactive
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                      {g.rows.length} issue{g.rows.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="divide-y divide-border/60">
                    {g.rows.map((d) => {
                      const canPush = !!PUSH_BY_FIELD[d.field] || (d.field === "active_state" && !d.is_active);
                      const canPull = PULLABLE_FIELDS.has(d.field) && (d.systems_involved || []).includes("razorpay");
                      const esslRemoval = d.field === "active_state" && !d.is_active;
                      const canEssl = ESSL_PUSHABLE_FIELDS.has(d.field);
                      const busy = resolvingId === d.id;

                      return (
                        <div
                          key={d.id}
                          className="px-3 md:px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-3 transition-colors hover:bg-muted/30"
                        >
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${SEVERITY_STYLE[d.severity]}`}>
                                {d.severity}
                              </span>
                              <span className="text-sm font-medium text-foreground">
                                {FIELD_LABEL[d.field] || d.field}
                              </span>
                              {d.field === "active_state" && d.razorpay_value === "inactive" && d.hrms_value === "active" && (
                                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-warning/15 text-warning">
                                  dismissal pending in HRMS
                                </span>
                              )}
                            </div>

                            {isPushFailureAlert(d) ? (
                              <div className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs space-y-1">
                                <div className="text-foreground">
                                  {d.resolution_note || "Last push did not verify."}
                                </div>
                                <div className="text-[11px] text-muted-foreground tabular-nums">
                                  {new Date(d.first_seen_at).toLocaleString("en-IN")}
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                                <ValuePill label="HRMS" value={d.hrms_value} highlight />
                                {d.razorpay_value !== null && d.razorpay_value !== undefined && (
                                  <>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <ValuePill label="Razorpay" value={d.razorpay_value} />
                                  </>
                                )}
                                {d.essl_value !== null && d.essl_value !== undefined && (
                                  <>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <ValuePill label="eSSL" value={d.essl_value} />
                                  </>
                                )}
                              </div>
                            )}

                            {d.merged_note && (
                              <div className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-foreground">
                                {d.merged_note}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              disabled={busy || !canPush}
                              onClick={() => adoptHrms(d)}
                              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
                            >
                              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                              {esslRemoval ? "Dismiss in RazorpayX" : "Push → Razorpay"}
                            </button>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  className="inline-flex items-center justify-center rounded-md border border-border h-[30px] w-8 text-muted-foreground hover:bg-muted"
                                  aria-label="More actions"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                {canPull && (
                                  <DropdownMenuItem
                                    disabled={pulling}
                                    onSelect={() =>
                                      setPullTarget({
                                        driftId: d.id,
                                        hrEmployeeId: d.hr_employee_id,
                                        employeeName: d.employee_name || "Unknown employee",
                                        field: d.field,
                                        fieldLabel: FIELD_LABEL[d.field] || d.field,
                                        hrmsValue: d.hrms_value,
                                        razorpayValue: d.razorpay_value,
                                      })
                                    }
                                  >
                                    Pull ← Razorpay
                                  </DropdownMenuItem>
                                )}
                                {canEssl && (
                                  <DropdownMenuItem
                                    disabled={busy}
                                    onSelect={() => (esslRemoval ? setEsslDeleteTarget(d) : adoptEssl(d))}
                                  >
                                    {esslRemoval ? "Remove from eSSL device" : "Push → eSSL device"}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  disabled={busy}
                                  onSelect={() => markResolved(d, "Manually marked resolved")}
                                >
                                  Mark resolved
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* System checks rail */}
        <aside className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-3">
            <PayslipParityTile />
            <EmailDispatchHealthTile />
            <RosterCompletenessTile />
          </div>

          {ghostResidual && ghostResidual.length > 0 && (
            <RailSection
              title={`Ghost email residual — ${ghostResidual.length} dead-lettered`}
              tone="destructive"
              defaultOpen
            >
              <ul className="space-y-0.5 text-[11px] text-muted-foreground list-disc list-inside">
                {ghostResidual.slice(0, 3).map((g) => (
                  <li key={g.id}>
                    <span className="font-mono">{g.recipient ?? "—"}</span> · {g.subject ?? "(no subject)"} · {g.last_error ?? "unknown"}
                  </li>
                ))}
              </ul>
            </RailSection>
          )}

          {statutoryDrift.count > 0 && (
            <RailSection
              title={`Statutory filing drift — ${statutoryDrift.count} mismatch${statutoryDrift.count === 1 ? "" : "es"} · ${statutoryDrift.employees} employee${statutoryDrift.employees === 1 ? "" : "s"}`}
              tone="warning"
              defaultOpen
            >
              <ul className="space-y-0.5 text-[11px] text-muted-foreground list-disc list-inside">
                {statutoryDrift.samples.slice(0, 3).map((s: any) => (
                  <li key={s.id}>
                    <span className="font-mono">{s.period_month}</span> · {s.msgs[0]}
                  </li>
                ))}
              </ul>
            </RailSection>
          )}

          {unknownEnrollmentRows && unknownEnrollmentRows.length > 0 && (
            <RailSection
              title={`Statutory enrollment unknown — ${unknownEnrollmentRows.length} employee${unknownEnrollmentRows.length === 1 ? "" : "s"}`}
              tone="muted"
              defaultOpen
            >
              <div className="text-[11px] text-muted-foreground">
                {unknownEnrollmentRows.slice(0, 6).map((r: any) => `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || `#${r.badge_id}`).join(", ")}
                {unknownEnrollmentRows.length > 6 ? ` … +${unknownEnrollmentRows.length - 6} more` : ""}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={deriveAllEnrollment}
                  disabled={derivingEnrollment}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted whitespace-nowrap disabled:opacity-50"
                >
                  {derivingEnrollment ? "Deriving…" : "Derive from history"}
                </button>
                <Link
                  to="/hrms/payroll/salary-register-import"
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted whitespace-nowrap"
                >
                  Import Register
                </Link>
              </div>
            </RailSection>
          )}

          <RailSection title="RazorpayX roster orphans" tone="muted">
            <RazorpayOrphanPanel scanSignal={scanSignal} />
          </RailSection>

          <RailSection title="ERP login accounts" tone="muted">
            <ErpAccountHealthPanel />
          </RailSection>
        </aside>
      </div>

      <PullFromRazorpayDialog
        target={pullTarget}
        busy={pulling}
        onCancel={() => setPullTarget(null)}
        onConfirm={({ confirmSensitive }) => pullTarget && runPull(pullTarget, confirmSensitive)}
      />

      <AlertDialog open={!!esslDeleteTarget} onOpenChange={(o) => !o && setEsslDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from eSSL devices?</AlertDialogTitle>
            <AlertDialogDescription>
              This queues <span className="font-mono">DATA DELETE USERINFO</span> on every registered
              device for {esslDeleteTarget?.employee_name}. Attendance history stays in HRMS — only the
              device roster entry is removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const t = esslDeleteTarget;
                setEsslDeleteTarget(null);
                if (t) adoptEssl(t);
              }}
            >
              Remove from devices
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const RAIL_TONE: Record<string, string> = {
  destructive: "border-destructive/40 bg-destructive/5",
  warning: "border-warning/40 bg-warning/5",
  muted: "border-border bg-card",
};

function RailSection({
  title,
  tone = "muted",
  defaultOpen = false,
  children,
}: {
  title: string;
  tone?: "destructive" | "warning" | "muted";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={`rounded-xl border ${RAIL_TONE[tone]}`}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        {tone === "muted" ? (
          <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <AlertTriangle className={`h-4 w-4 shrink-0 ${tone === "destructive" ? "text-destructive" : "text-warning"}`} />
        )}
        <span className="text-xs font-medium text-foreground min-w-0 flex-1">{title}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function ValuePill({ label, value, highlight }: { label: string; value: string | null; highlight?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 min-w-0 ${
        highlight ? "border-primary/30 bg-primary/5" : "border-border bg-background"
      }`}
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">{label}</span>
      <span className={`text-xs font-medium truncate ${value ? "text-foreground" : "text-muted-foreground italic"}`}>
        {value ?? "—"}
      </span>
    </span>
  );
}
