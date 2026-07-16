import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, ShieldAlert, Lock, Play, ListChecks, CheckCircle2, DownloadCloud, AlertTriangle } from "lucide-react";

interface Settings {
  base_url: string;
  bulk_sync_unlocked: boolean;
  last_creds_validated_at: string | null;
  last_import_at: string | null;
  push_pilot_verified_at?: string | null;
  push_pilot_hr_employee_id?: string | null;
  bulk_push_unlocked?: boolean;
  last_push_at?: string | null;
  push_bank_pilot_verified_at?: string | null;
  bulk_bank_push_unlocked?: boolean;
  last_bank_push_at?: string | null;
  push_salary_endpoint_verified?: boolean;
  push_salary_envelope_key?: string | null;
  push_salary_envelope_verified_at?: string | null;
  push_salary_pilot_verified_at?: string | null;
  bulk_salary_push_unlocked?: boolean;
  last_salary_push_at?: string | null;
  push_attendance_endpoint_verified?: boolean;
  push_attendance_envelope_key?: string | null;
  push_attendance_envelope_verified_at?: string | null;
  push_attendance_pilot_verified_at?: string | null;
  push_attendance_pilot_period?: string | null;
  bulk_attendance_push_unlocked?: boolean;
  last_attendance_push_at?: string | null;
}
interface AttendanceRow {
  razorpay_employee_id: string;
  hr_employee_id?: string;
  status: "planned" | "pushed" | "failed" | "skipped";
  period?: string;
  working_days?: number;
  present_days?: number;
  paid_leave_days?: number;
  unpaid_leave_days?: number;
  lop_days?: number;
  unpaid_matches_lop?: boolean;
  error?: string;
}
interface AttendanceResponse {
  ok: boolean;
  period: string;
  summary: { total: number; planned: number; pushed: number; failed: number; skipped: number; working_days: number };
  rows: AttendanceRow[];
  envelope: { verified: boolean; key: string | null };
  pilot: { verified_at: string | null; pilot_period: string | null; bulk_unlocked: boolean };
}

interface SalaryComponent { code: string | null; name: string; type: string | null; amount: number }
interface SalaryRow {
  razorpay_employee_id: string;
  hr_employee_id?: string;
  status: "planned" | "unchanged" | "pushed" | "failed" | "no_baseline" | "skipped_no_baseline" | "no_erp_structure";
  baseline_missing?: boolean;
  erp_total?: number;
  components_count?: number;
  erp_components?: SalaryComponent[];
  razorpay_snapshot?: any;
  error?: string;
}
interface SalaryResponse {
  ok: boolean;
  summary: { total: number; planned: number; unchanged: number; pushed: number; failed: number; skipped: number; no_baseline: number };
  rows: SalaryRow[];
  envelope: { verified: boolean; key: string | null };
  pilot: { verified_at: string | null; bulk_unlocked: boolean };
}

interface BankRow {
  razorpay_employee_id: string;
  hr_employee_id?: string;
  status: "planned" | "unchanged" | "pushed" | "failed" | "invalid" | "no_baseline" | "skipped_no_baseline";
  reasons?: string[];
  changed?: string[];
  holder_name?: string;
  patch_preview?: Record<string, any>;
  error?: string;
}
interface BankResponse {
  ok: boolean;
  summary: { total: number; planned: number; unchanged: number; pushed: number; failed: number; skipped: number; invalid: number; no_baseline: number };
  rows: BankRow[];
  pilot: { verified_at: string | null; bulk_unlocked: boolean };
}
interface PushRow {
  razorpay_employee_id: string;
  hr_employee_id?: string;
  status: "planned" | "unchanged" | "pushed" | "failed" | "no_baseline" | "skipped_no_baseline";
  baseline_missing?: boolean;
  changed: string[];
  conflicts?: string[];
  payload_field_names?: string[];
  error?: string;
}
interface PushResponse {
  ok: boolean;
  summary: { total: number; planned: number; unchanged: number; pushed: number; failed: number; skipped: number; no_baseline?: number };
  rows: PushRow[];
  pilot: { verified_at: string | null; bulk_unlocked: boolean };
}
interface FetchOneResponse {
  ok: boolean;
  http_status?: number;
  error?: string;
  employee_id?: number;
  preview?: { name: string; title: string; department: string; is_active: boolean };
  field_names?: string[];
  match?: { hr_employee_id: string | null; matched_by: "pan" | "phone" | "email" | null; action: "match" | "create_draft" };
}
interface DryRunRow {
  employee_id: number | null;
  status: "hit" | "miss" | "stopped";
  http_status?: number;
  name?: string; title?: string; department?: string; is_active?: boolean;
  matched_by?: "pan" | "phone" | "email" | null;
  action_planned?: "match" | "create_draft";
  hr_employee_id?: string | null;
  applied?: boolean; created?: boolean;
  note?: string;
}
interface DryRunResponse {
  ok: boolean;
  summary: { total: number; hits: number; matches: number; creates: number; misses: number; stopped: boolean };
  rows: DryRunRow[];
}

export default function RazorpaySyncPage() {
  const { hasPermission, isLoading: permLoading } = usePermissions();
  const canAccess = hasPermission("hrms_razorpay_sync");

  const [settings, setSettings] = useState<Settings | null>(null);

  // Step 1: validation
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);

  // Step 2: pilot
  const [pilotId, setPilotId] = useState("1");
  const [fetching, setFetching] = useState(false);
  const [applyingPilot, setApplyingPilot] = useState(false);
  const [pilotPreview, setPilotPreview] = useState<FetchOneResponse | null>(null);
  const [pilotApplied, setPilotApplied] = useState<{ hr_employee_id: string; created: boolean; matched_by: string | null; employee_id: number } | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  // Step 3: bulk import
  const [startId, setStartId] = useState("1");
  const [maxId, setMaxId] = useState("100");
  const [dryRunning, setDryRunning] = useState(false);
  const [applyingBulk, setApplyingBulk] = useState(false);
  const [dryRun, setDryRun] = useState<DryRunResponse | null>(null);
  const [applied, setApplied] = useState<DryRunResponse | null>(null);

  // Phase 1a — Deep pull
  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState<{ total: number; pulled: number; projected_writes: number; missed: number; errored: number } | null>(null);
  const [gaps, setGaps] = useState<{ total: number; missing_pan: number; missing_doj: number; missing_dept: number; missing_designation: number; missing_bank: number; not_pulled: number } | null>(null);

  // Phase 2 — Probe catalogue
  type ProbeRow = {
    phase: string; key: string; mode: "read" | "write";
    status: "ok" | "fail" | "not_probed"; http_status: number | null; error: string | null;
  };
  const [probing, setProbing] = useState(false);
  const [probeRows, setProbeRows] = useState<ProbeRow[] | null>(null);
  const [probeId, setProbeId] = useState<number | null>(null);

  // Phase 3 — Push people:update
  const [pushRpId, setPushRpId] = useState<string>("");
  const [pushDrying, setPushDrying] = useState(false);
  const [pushApplyingOne, setPushApplyingOne] = useState(false);
  const [pushApplyingBulk, setPushApplyingBulk] = useState(false);
  const [pushUnlocking, setPushUnlocking] = useState(false);
  const [pushDryResult, setPushDryResult] = useState<PushResponse | null>(null);
  const [pushApplyResult, setPushApplyResult] = useState<PushResponse | null>(null);

  // Phase 4 — Bank & PAN push (isolated toggle, diff-and-confirm mandatory)
  const [bankRpId, setBankRpId] = useState<string>("");
  const [bankDrying, setBankDrying] = useState(false);
  const [bankApplyingOne, setBankApplyingOne] = useState(false);
  const [bankApplyingBulk, setBankApplyingBulk] = useState(false);
  const [bankUnlocking, setBankUnlocking] = useState(false);
  const [bankDryResult, setBankDryResult] = useState<BankResponse | null>(null);
  const [bankApplyResult, setBankApplyResult] = useState<BankResponse | null>(null);
  const [bankConfirm, setBankConfirm] = useState<{ mode: "one" | "bulk"; row?: BankRow } | null>(null);

  // Phase 5 — Salary structure sync (write path gated behind operator-recorded envelope)
  const [salaryRpId, setSalaryRpId] = useState<string>("");
  const [salaryEnvelopeInput, setSalaryEnvelopeInput] = useState<string>("");
  const [salaryDrying, setSalaryDrying] = useState(false);
  const [salaryApplyingOne, setSalaryApplyingOne] = useState(false);
  const [salaryApplyingBulk, setSalaryApplyingBulk] = useState(false);
  const [salaryUnlocking, setSalaryUnlocking] = useState(false);
  const [salaryRecording, setSalaryRecording] = useState(false);
  const [salaryDryResult, setSalaryDryResult] = useState<SalaryResponse | null>(null);
  const [salaryApplyResult, setSalaryApplyResult] = useState<SalaryResponse | null>(null);
  const [salaryConfirm, setSalaryConfirm] = useState<{ mode: "one" | "bulk"; row?: SalaryRow } | null>(null);

  // Phase 6 — Monthly attendance / LOP push (discovery-first, envelope-gated)
  const [attRpId, setAttRpId] = useState<string>("");
  const [attPeriod, setAttPeriod] = useState<string>(() => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const [attEnvelopeInput, setAttEnvelopeInput] = useState<string>("");
  const [attDrying, setAttDrying] = useState(false);
  const [attApplyingOne, setAttApplyingOne] = useState(false);
  const [attApplyingBulk, setAttApplyingBulk] = useState(false);
  const [attUnlocking, setAttUnlocking] = useState(false);
  const [attRecording, setAttRecording] = useState(false);
  const [attDryResult, setAttDryResult] = useState<AttendanceResponse | null>(null);
  const [attApplyResult, setAttApplyResult] = useState<AttendanceResponse | null>(null);
  const [attConfirm, setAttConfirm] = useState<{ mode: "one" | "bulk"; row?: AttendanceRow } | null>(null);

  const reloadSettings = async () => {
    const { data } = await supabase
      .from("hr_razorpay_settings")
      .select("base_url,bulk_sync_unlocked,last_creds_validated_at,last_import_at,push_pilot_verified_at,push_pilot_hr_employee_id,bulk_push_unlocked,last_push_at,push_bank_pilot_verified_at,bulk_bank_push_unlocked,last_bank_push_at,push_salary_endpoint_verified,push_salary_envelope_key,push_salary_envelope_verified_at,push_salary_pilot_verified_at,bulk_salary_push_unlocked,last_salary_push_at,push_attendance_endpoint_verified,push_attendance_envelope_key,push_attendance_envelope_verified_at,push_attendance_pilot_verified_at,push_attendance_pilot_period,bulk_attendance_push_unlocked,last_attendance_push_at")
      .maybeSingle();
    setSettings(data as Settings | null);
  };


  useEffect(() => { if (canAccess) { reloadSettings(); reloadGaps(); } }, [canAccess]);

  const reloadGaps = async () => {
    const { data, error } = await supabase.from("v_razorpay_import_gaps").select("*");
    if (error || !data) { setGaps(null); return; }
    setGaps({
      total: data.length,
      missing_pan: data.filter((r: any) => r.missing_pan).length,
      missing_doj: data.filter((r: any) => r.missing_doj).length,
      missing_dept: data.filter((r: any) => r.missing_department).length,
      missing_designation: data.filter((r: any) => r.missing_designation).length,
      missing_bank: data.filter((r: any) => r.missing_bank).length,
      not_pulled: data.filter((r: any) => !r.last_pulled_at).length,
    });
  };

  const invoke = async <T,>(body: object): Promise<T> => {
    const { data, error } = await supabase.functions.invoke("razorpay-payroll-proxy", { body });
    if (error) throw error;
    return data as T;
  };

  const runValidate = async () => {
    setValidating(true);
    try {
      const d = await invoke<{ ok: boolean; http_status: number; error_body_snippet?: string }>({
        action: "validate_creds", employee_id: Number(pilotId) || 1,
      });
      setValidated(!!d.ok);
      toast({
        title: d.ok ? "Credentials valid" : "Validation failed",
        description: d.ok ? `HTTP ${d.http_status}` : (d.error_body_snippet ?? "See console"),
        variant: d.ok ? "default" : "destructive",
      });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Request failed", description: e?.message, variant: "destructive" });
    } finally { setValidating(false); }
  };

  const runFetchOne = async () => {
    setFetching(true); setPilotPreview(null);
    try {
      const d = await invoke<FetchOneResponse>({ action: "fetch_one", employee_id: Number(pilotId) });
      setPilotPreview(d);
      if (!d.ok) toast({ title: "Fetch failed", description: d.error, variant: "destructive" });
    } catch (e: any) {
      toast({ title: "Request failed", description: e?.message, variant: "destructive" });
    } finally { setFetching(false); }
  };

  const runApplyPilot = async () => {
    setApplyingPilot(true);
    try {
      const d = await invoke<{ ok: boolean; hr_employee_id: string; created: boolean; matched_by: string | null }>({
        action: "apply_one", employee_id: Number(pilotId),
      });
      if (d.ok) setPilotApplied({ ...d, employee_id: Number(pilotId) });
      toast({
        title: d.ok ? "Pilot applied — please verify" : "Apply failed",
        description: d.ok ? `${d.created ? "Created draft" : "Matched"} (${d.matched_by ?? "new"}). Bulk sync stays LOCKED until you unlock.` : undefined,
        variant: d.ok ? "default" : "destructive",
      });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Request failed", description: e?.message, variant: "destructive" });
    } finally { setApplyingPilot(false); }
  };

  const runUnlockBulk = async () => {
    if (!confirm("Confirm this Razorpay employee has been verified on the Razorpay dashboard AND in HRMS. Unlock bulk sync?")) return;
    setUnlocking(true);
    try {
      const d = await invoke<{ ok: boolean; error?: string }>({ action: "unlock_bulk" });
      toast({
        title: d.ok ? "Bulk sync unlocked" : "Unlock failed",
        description: d.ok ? "You can now run apply_range." : d.error,
        variant: d.ok ? "default" : "destructive",
      });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Request failed", description: e?.message, variant: "destructive" });
    } finally { setUnlocking(false); }
  };

  // Deep pull: iterate mapped ids in chunks to stay within edge fn timeout.
  const runDeepPull = async () => {
    if (!confirm("Deep-pull people:view for every mapped Razorpay employee and project into HRMS?\n\nERP-authored fields are never overwritten; only empty fields are filled.")) return;
    setPulling(true); setPullResult(null);
    try {
      const { data: maps, error } = await supabase
        .from("hr_razorpay_employee_map")
        .select("razorpay_employee_id")
        .order("razorpay_employee_id");
      if (error) throw error;
      const ids = (maps || []).map((r: any) => r.razorpay_employee_id);
      const CHUNK = 15;
      const agg = { total: 0, pulled: 0, projected_writes: 0, missed: 0, errored: 0 };
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const d = await invoke<{ ok: boolean; summary: typeof agg }>({
          action: "pull_person_full",
          razorpay_employee_ids: slice,
        });
        agg.total += d.summary.total;
        agg.pulled += d.summary.pulled;
        agg.projected_writes += d.summary.projected_writes;
        agg.missed += d.summary.missed;
        agg.errored += d.summary.errored;
      }
      setPullResult(agg);
      toast({ title: "Deep pull complete", description: `${agg.pulled} pulled · ${agg.projected_writes} employees updated · ${agg.missed} missed` });
      await reloadGaps();
    } catch (e: any) {
      toast({ title: "Deep pull failed", description: e?.message, variant: "destructive" });
    } finally { setPulling(false); }
  };

  const runProbeCatalogue = async () => {
    setProbing(true); setProbeRows(null);
    try {
      const d = await invoke<{ ok: boolean; probe_id: number | null; rows: ProbeRow[] }>({ action: "probe_catalogue" });
      setProbeRows(d.rows || []);
      setProbeId(d.probe_id ?? null);
      const okCount = (d.rows || []).filter((r) => r.status === "ok").length;
      const failCount = (d.rows || []).filter((r) => r.status === "fail").length;
      toast({ title: "Probe catalogue complete", description: `${okCount} confirmed · ${failCount} failed · ${(d.rows || []).length - okCount - failCount} pending (write)` });
    } catch (e: any) {
      toast({ title: "Probe run failed", description: e?.message, variant: "destructive" });
    } finally { setProbing(false); }
  };

  // ---- Phase 3 handlers ----
  const runPushDryRun = async () => {
    setPushDrying(true); setPushDryResult(null);
    try {
      const body: any = { action: "push_person_dry_run" };
      if (pushRpId.trim()) body.razorpay_employee_id = pushRpId.trim();
      const d = await invoke<PushResponse>(body);
      setPushDryResult(d);
      toast({ title: "Push dry-run complete", description: `${d.summary.planned} would change · ${d.summary.unchanged} unchanged` });
    } catch (e: any) {
      toast({ title: "Push dry-run failed", description: e?.message, variant: "destructive" });
    } finally { setPushDrying(false); }
  };
  const runPushApplyOne = async () => {
    const id = pushRpId.trim();
    if (!id) { toast({ title: "Enter a Razorpay employee ID first", variant: "destructive" }); return; }
    if (!confirm(`Push ERP → Razorpay for employee ${id}?\n\nThis writes to Live RazorpayX Payroll.`)) return;
    setPushApplyingOne(true); setPushApplyResult(null);
    try {
      const d = await invoke<PushResponse>({ action: "push_person_apply_one", razorpay_employee_id: id });
      setPushApplyResult(d);
      toast({ title: "Pilot push complete", description: `${d.summary.pushed} pushed · ${d.summary.failed} failed` });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Pilot push failed", description: e?.message, variant: "destructive" });
    } finally { setPushApplyingOne(false); }
  };
  const runPushUnlockBulk = async () => {
    if (!confirm("Unlock bulk push to Razorpay?\n\nAfter this, apply-bulk will POST people:update for every mapped employee whose ERP state has diverged.")) return;
    setPushUnlocking(true);
    try {
      await invoke({ action: "unlock_bulk_push" });
      toast({ title: "Bulk push unlocked" });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Unlock failed", description: e?.message, variant: "destructive" });
    } finally { setPushUnlocking(false); }
  };
  const runPushApplyBulk = async () => {
    if (!confirm("Apply bulk push to Razorpay for ALL mapped employees with divergent identity fields?")) return;
    setPushApplyingBulk(true); setPushApplyResult(null);
    try {
      const d = await invoke<PushResponse>({ action: "push_person_apply_bulk" });
      setPushApplyResult(d);
      toast({ title: "Bulk push complete", description: `${d.summary.pushed} pushed · ${d.summary.failed} failed · ${d.summary.unchanged} unchanged` });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Bulk push failed", description: e?.message, variant: "destructive" });
    } finally { setPushApplyingBulk(false); }
  };

  // ---- Phase 4 handlers (Bank & PAN) ----
  const runBankDryRun = async () => {
    setBankDrying(true); setBankDryResult(null);
    try {
      const body: any = { action: "push_bank_dry_run" };
      if (bankRpId.trim()) body.razorpay_employee_id = bankRpId.trim();
      const d = await invoke<BankResponse>(body);
      setBankDryResult(d);
      toast({
        title: "Bank dry-run complete",
        description: `${d.summary.planned} would change · ${d.summary.invalid} invalid · ${d.summary.no_baseline} no baseline`,
      });
    } catch (e: any) {
      toast({ title: "Bank dry-run failed", description: e?.message, variant: "destructive" });
    } finally { setBankDrying(false); }
  };
  const requestBankApplyOne = () => {
    const id = bankRpId.trim();
    if (!id) { toast({ title: "Enter a Razorpay employee ID first", variant: "destructive" }); return; }
    const row = (bankDryResult?.rows || []).find((r) => r.razorpay_employee_id === id);
    if (!row || row.status !== "planned") {
      toast({ title: "Run dry-run first", description: "Only rows with status 'planned' can be pushed.", variant: "destructive" });
      return;
    }
    setBankConfirm({ mode: "one", row });
  };
  const confirmBankApplyOne = async () => {
    const row = bankConfirm?.row; if (!row) return;
    setBankConfirm(null);
    setBankApplyingOne(true); setBankApplyResult(null);
    try {
      const d = await invoke<BankResponse>({ action: "push_bank_apply_one", razorpay_employee_id: row.razorpay_employee_id });
      setBankApplyResult(d);
      toast({ title: "Bank pilot push complete", description: `${d.summary.pushed} pushed · ${d.summary.failed} failed` });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Bank pilot push failed", description: e?.message, variant: "destructive" });
    } finally { setBankApplyingOne(false); }
  };
  const runBankUnlockBulk = async () => {
    if (!confirm("Unlock bulk bank push? After this, apply-bulk will POST bank+PAN updates for every valid row with divergence.")) return;
    setBankUnlocking(true);
    try {
      await invoke({ action: "unlock_bulk_bank_push" });
      toast({ title: "Bulk bank push unlocked" });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Unlock failed", description: e?.message, variant: "destructive" });
    } finally { setBankUnlocking(false); }
  };
  const requestBankApplyBulk = () => setBankConfirm({ mode: "bulk" });
  const confirmBankApplyBulk = async () => {
    setBankConfirm(null);
    setBankApplyingBulk(true); setBankApplyResult(null);
    try {
      const d = await invoke<BankResponse>({ action: "push_bank_apply_bulk" });
      setBankApplyResult(d);
      toast({ title: "Bulk bank push complete", description: `${d.summary.pushed} pushed · ${d.summary.failed} failed · ${d.summary.invalid} invalid` });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Bulk bank push failed", description: e?.message, variant: "destructive" });
    } finally { setBankApplyingBulk(false); }
  };

  // ---- Phase 5 handlers (Salary structure) ----
  const runSalaryDryRun = async () => {
    setSalaryDrying(true); setSalaryDryResult(null);
    try {
      const body: any = { action: "push_salary_dry_run" };
      if (salaryRpId.trim()) body.razorpay_employee_id = salaryRpId.trim();
      const d = await invoke<SalaryResponse>(body);
      setSalaryDryResult(d);
      toast({
        title: "Salary dry-run complete",
        description: `${d.summary.planned} would change · ${d.summary.unchanged} unchanged · ${d.summary.no_baseline} no baseline`,
      });
    } catch (e: any) {
      toast({ title: "Salary dry-run failed", description: e?.message, variant: "destructive" });
    } finally { setSalaryDrying(false); }
  };
  const runRecordSalaryEnvelope = async (verified: boolean) => {
    if (verified && !salaryEnvelopeInput.trim()) {
      toast({ title: "Enter the verified envelope key first (e.g. people:update)", variant: "destructive" });
      return;
    }
    setSalaryRecording(true);
    try {
      await invoke({
        action: "record_salary_envelope_verified",
        verified,
        envelope_key: salaryEnvelopeInput.trim(),
      });
      toast({
        title: verified ? "Salary envelope recorded as verified" : "Salary envelope verification cleared",
        description: verified ? "Live salary pushes are now permitted, gated by pilot + bulk unlock." : "Live salary pushes are disabled.",
      });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Failed to record envelope", description: e?.message, variant: "destructive" });
    } finally { setSalaryRecording(false); }
  };
  const requestSalaryApplyOne = () => {
    const id = salaryRpId.trim();
    if (!id) { toast({ title: "Enter a Razorpay employee ID first", variant: "destructive" }); return; }
    const row = (salaryDryResult?.rows || []).find((r) => r.razorpay_employee_id === id);
    if (!row || row.status !== "planned") {
      toast({ title: "Run dry-run first", description: "Only rows with status 'planned' can be pushed.", variant: "destructive" });
      return;
    }
    setSalaryConfirm({ mode: "one", row });
  };
  const confirmSalaryApplyOne = async () => {
    const row = salaryConfirm?.row; if (!row) return;
    setSalaryConfirm(null);
    setSalaryApplyingOne(true); setSalaryApplyResult(null);
    try {
      const d = await invoke<SalaryResponse>({ action: "push_salary_apply_one", razorpay_employee_id: row.razorpay_employee_id });
      setSalaryApplyResult(d);
      toast({ title: "Salary pilot push complete", description: `${d.summary.pushed} pushed · ${d.summary.failed} failed` });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Salary pilot push failed", description: e?.message, variant: "destructive" });
    } finally { setSalaryApplyingOne(false); }
  };
  const runSalaryUnlockBulk = async () => {
    if (!confirm("Unlock bulk salary push? After this, apply-bulk will POST salary structure updates for every divergent baselined row.")) return;
    setSalaryUnlocking(true);
    try {
      await invoke({ action: "unlock_bulk_salary_push" });
      toast({ title: "Bulk salary push unlocked" });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Unlock failed", description: e?.message, variant: "destructive" });
    } finally { setSalaryUnlocking(false); }
  };
  const requestSalaryApplyBulk = () => setSalaryConfirm({ mode: "bulk" });
  const confirmSalaryApplyBulk = async () => {
    setSalaryConfirm(null);
    setSalaryApplyingBulk(true); setSalaryApplyResult(null);
    try {
      const d = await invoke<SalaryResponse>({ action: "push_salary_apply_bulk" });
      setSalaryApplyResult(d);
      toast({ title: "Bulk salary push complete", description: `${d.summary.pushed} pushed · ${d.summary.failed} failed` });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Bulk salary push failed", description: e?.message, variant: "destructive" });
    } finally { setSalaryApplyingBulk(false); }
  };

  // ---- Phase 6 handlers ----
  const runAttendanceDryRun = async () => {
    if (!/^\d{4}-\d{2}$/.test(attPeriod)) {
      toast({ title: "Enter period as YYYY-MM", variant: "destructive" }); return;
    }
    setAttDrying(true); setAttDryResult(null);
    try {
      const body: any = { action: "push_attendance_dry_run", period: attPeriod };
      if (attRpId.trim()) body.razorpay_employee_id = attRpId.trim();
      const d = await invoke<AttendanceResponse>(body);
      setAttDryResult(d);
      toast({
        title: "Attendance dry-run complete",
        description: `${d.summary.planned} rows · working days: ${d.summary.working_days}`,
      });
    } catch (e: any) {
      toast({ title: "Attendance dry-run failed", description: e?.message, variant: "destructive" });
    } finally { setAttDrying(false); }
  };
  const runRecordAttendanceEnvelope = async (verified: boolean) => {
    if (verified && !attEnvelopeInput.trim()) {
      toast({ title: "Enter the verified envelope key first (e.g. attendance:update)", variant: "destructive" });
      return;
    }
    setAttRecording(true);
    try {
      await invoke({
        action: "record_attendance_envelope_verified",
        verified, envelope_key: attEnvelopeInput.trim(),
      });
      toast({
        title: verified ? "Attendance envelope recorded as verified" : "Attendance envelope verification cleared",
      });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Failed to record envelope", description: e?.message, variant: "destructive" });
    } finally { setAttRecording(false); }
  };
  const requestAttendanceApplyOne = () => {
    const id = attRpId.trim();
    if (!id) { toast({ title: "Enter a Razorpay employee ID first", variant: "destructive" }); return; }
    const row = (attDryResult?.rows || []).find((r) => r.razorpay_employee_id === id);
    if (!row || row.status !== "planned") {
      toast({ title: "Run dry-run first", description: "Only planned rows can be pushed.", variant: "destructive" });
      return;
    }
    setAttConfirm({ mode: "one", row });
  };
  const confirmAttendanceApplyOne = async () => {
    const row = attConfirm?.row; if (!row) return;
    setAttConfirm(null);
    setAttApplyingOne(true); setAttApplyResult(null);
    try {
      const d = await invoke<AttendanceResponse>({
        action: "push_attendance_apply_one",
        razorpay_employee_id: row.razorpay_employee_id,
        period: attPeriod,
      });
      setAttApplyResult(d);
      toast({ title: "Attendance pilot push complete", description: `${d.summary.pushed} pushed · ${d.summary.failed} failed` });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Attendance pilot push failed", description: e?.message, variant: "destructive" });
    } finally { setAttApplyingOne(false); }
  };
  const runAttendanceUnlockBulk = async () => {
    if (!confirm("Unlock bulk attendance push? After this, apply-bulk will POST LOP/attendance for every mapped employee for the selected period.")) return;
    setAttUnlocking(true);
    try {
      await invoke({ action: "unlock_bulk_attendance_push" });
      toast({ title: "Bulk attendance push unlocked" });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Unlock failed", description: e?.message, variant: "destructive" });
    } finally { setAttUnlocking(false); }
  };
  const requestAttendanceApplyBulk = () => setAttConfirm({ mode: "bulk" });
  const confirmAttendanceApplyBulk = async () => {
    setAttConfirm(null);
    setAttApplyingBulk(true); setAttApplyResult(null);
    try {
      const d = await invoke<AttendanceResponse>({ action: "push_attendance_apply_bulk", period: attPeriod });
      setAttApplyResult(d);
      toast({ title: "Bulk attendance push complete", description: `${d.summary.pushed} pushed · ${d.summary.failed} failed` });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Bulk attendance push failed", description: e?.message, variant: "destructive" });
    } finally { setAttApplyingBulk(false); }
  };





  // fetch timeout (see src/integrations/supabase/client.ts). Each chunk stays
  // well under the timeout while the overall run can cover 100s of IDs.
  const CHUNK_SIZE = 20;
  const runChunked = async (
    action: "dry_run_range" | "apply_range",
    from: number,
    to: number,
  ): Promise<DryRunResponse> => {
    const agg: DryRunResponse = {
      ok: true,
      summary: { total: 0, hits: 0, matches: 0, creates: 0, misses: 0, stopped: false },
      rows: [],
    };
    let consecutiveMisses = 0;
    for (let s = from; s <= to; s += CHUNK_SIZE) {
      const e = Math.min(s + CHUNK_SIZE - 1, to);
      const d = await invoke<DryRunResponse>({ action, start_id: s, max_id: e });
      agg.rows.push(...d.rows);
      agg.summary.total += d.summary.total;
      agg.summary.hits += d.summary.hits;
      agg.summary.matches += d.summary.matches;
      agg.summary.creates += d.summary.creates;
      agg.summary.misses += d.summary.misses;
      // Emulate server-side consecutive-miss stop across chunks.
      for (const r of d.rows) {
        if (r.status === "miss") consecutiveMisses++;
        else if (r.status === "hit") consecutiveMisses = 0;
      }
      if (d.summary.stopped || consecutiveMisses >= 30) {
        agg.summary.stopped = true;
        break;
      }
    }
    return agg;
  };

  const runDryRun = async () => {
    setDryRunning(true); setDryRun(null); setApplied(null);
    try {
      const d = await runChunked("dry_run_range", Number(startId), Number(maxId));
      setDryRun(d);
      toast({ title: "Dry-run complete", description: `${d.summary.hits} hits · ${d.summary.matches} matches · ${d.summary.creates} new drafts` });
    } catch (e: any) {
      toast({ title: "Dry-run failed", description: e?.message, variant: "destructive" });
    } finally { setDryRunning(false); }
  };

  const runApplyBulk = async () => {
    if (!confirm(`Apply import for employees ${startId}..${maxId}?\n\nThis will create draft rows for unmatched employees.`)) return;
    setApplyingBulk(true);
    try {
      const d = await runChunked("apply_range", Number(startId), Number(maxId));
      setApplied(d);
      toast({ title: "Import applied", description: `${d.summary.hits} employees written.` });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Apply failed", description: e?.message, variant: "destructive" });
    } finally { setApplyingBulk(false); }
  };

  if (permLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!canAccess) {
    return (
      <Alert variant="destructive" className="m-6">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Access denied</AlertTitle>
        <AlertDescription>You need the <code>hrms_razorpay_sync</code> permission.</AlertDescription>
      </Alert>
    );
  }

  const canPilot = validated || !!settings?.last_creds_validated_at;
  const canBulk = !!settings?.bulk_sync_unlocked;
  const rowsToShow = applied?.rows ?? dryRun?.rows ?? [];

  return (
    <div className="space-y-6 p-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">RazorpayX Payroll Sync</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Phase 1a — pilot-gated import from Opfin. One employee first, then bulk range with dry-run preview.
        </p>
      </div>

      <Alert>
        <AlertTitle>API scope</AlertTitle>
        <AlertDescription className="text-xs">
          RazorpayX Payroll (Opfin) has no bulk list endpoint — only <code>people/view</code> by <code>employee-id</code>.
          The importer walks IDs sequentially with a max-id cap and stops after 30 consecutive misses.
          Bank / work-info fields are logged as field-names only; only <code>first_name, last_name, email, phone, dob, pan_number</code> are written to <code>hr_employees</code>.
          Unmatched Razorpay employees are created as <b>draft</b> (<code>is_active=false</code>).
        </AlertDescription>
      </Alert>

      {settings && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4" /> Integration status</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs uppercase">Bulk sync</div>
              <Badge variant={settings.bulk_sync_unlocked ? "default" : "secondary"}>
                {settings.bulk_sync_unlocked ? "Unlocked" : "Locked (pilot required)"}
              </Badge>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase">Creds validated</div>
              <div className="text-xs">{settings.last_creds_validated_at ? new Date(settings.last_creds_validated_at).toLocaleString() : "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase">Last import</div>
              <div className="text-xs">{settings.last_import_at ? new Date(settings.last_import_at).toLocaleString() : "—"}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 1 — Validate */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Step 1 — Validate credentials</CardTitle>
          <CardDescription>Confirms <code>auth.id</code> / <code>auth.key</code> against a single <code>people/view</code>.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={runValidate} disabled={validating}>
            {validating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Validate credentials
          </Button>
        </CardContent>
      </Card>

      {/* STEP 2 — Pilot */}
      <Card className={canPilot ? "" : "opacity-50 pointer-events-none"}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Play className="h-4 w-4" /> Step 2 — Pilot (one employee)</CardTitle>
          <CardDescription>Fetch a single Razorpay employee-id, preview the match, then apply. Unlocks bulk import.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-muted-foreground">Razorpay employee-id:</label>
            <input type="number" min={1} value={pilotId} onChange={(e) => setPilotId(e.target.value)}
              className="h-8 w-24 rounded border bg-background px-2 text-sm text-foreground" />
            <Button size="sm" variant="secondary" onClick={runFetchOne} disabled={fetching}>
              {fetching && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Fetch & preview
            </Button>
            <Button size="sm" onClick={runApplyPilot} disabled={applyingPilot || !pilotPreview?.ok}>
              {applyingPilot && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Apply pilot
            </Button>
          </div>
          {pilotPreview && pilotPreview.ok && (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">Name:</span> {pilotPreview.preview?.name} · <span className="text-muted-foreground">Title:</span> {pilotPreview.preview?.title} · <span className="text-muted-foreground">Dept:</span> {pilotPreview.preview?.department}</div>
              <div>
                <span className="text-muted-foreground">Match:</span>{" "}
                {pilotPreview.match?.action === "match"
                  ? <Badge>Matched by {pilotPreview.match.matched_by}</Badge>
                  : <Badge variant="secondary">Will create draft</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">Fields returned: {pilotPreview.field_names?.join(", ")}</div>
            </div>
          )}
          {pilotPreview && !pilotPreview.ok && (
            <div className="text-destructive text-xs">Not found or error: {pilotPreview.error}</div>
          )}
        </CardContent>
      </Card>

      {/* PILOT CONFIRMATION — human gate */}
      {pilotApplied && !canBulk && (
        <Card className="border-amber-500/60 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <CheckCircle2 className="h-4 w-4" /> Pilot imported — verify before unlocking bulk
            </CardTitle>
            <CardDescription>
              Razorpay employee-id <code>{pilotApplied.employee_id}</code> → HR employee <code className="text-[11px]">{pilotApplied.hr_employee_id}</code>
              {" "}({pilotApplied.created ? "created as draft" : `matched by ${pilotApplied.matched_by ?? "n/a"}`}).
              Verify this employee on the <b>Razorpay dashboard</b> and in <b>HRMS</b>, then unlock bulk sync.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" onClick={runUnlockBulk} disabled={unlocking}>
              {unlocking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Lock className="h-4 w-4 mr-2" /> Unlock bulk sync
            </Button>
          </CardContent>
        </Card>
      )}

      {/* PHASE 1a — Deep pull + Completion readiness */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><DownloadCloud className="h-4 w-4" /> Phase 1a — Deep pull &amp; completion readiness</CardTitle>
          <CardDescription>
            Re-fetch <code>people:view</code> for every mapped Razorpay employee and project the payload
            into <code>hr_employees</code> / <code>hr_employee_work_info</code> / <code>hr_employee_bank_details</code>.
            ERP-authored values are never overwritten — only NULL/empty fields are filled.
            Nothing is pushed back to Razorpay.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={runDeepPull} disabled={pulling}>
              {pulling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Run deep pull for all mapped IDs
            </Button>
            {pullResult && (
              <span className="text-xs text-muted-foreground">
                {pullResult.pulled} pulled · {pullResult.projected_writes} employees updated · {pullResult.missed} missed · {pullResult.errored} errored
              </span>
            )}
          </div>
          {gaps && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2">
              <GapChip label="Mapped drafts" value={gaps.total} tone="neutral" />
              <GapChip label="Not yet pulled" value={gaps.not_pulled} tone={gaps.not_pulled ? "warn" : "ok"} />
              <GapChip label="Missing PAN" value={gaps.missing_pan} tone={gaps.missing_pan ? "warn" : "ok"} />
              <GapChip label="Missing bank" value={gaps.missing_bank} tone={gaps.missing_bank ? "warn" : "ok"} />
              <GapChip label="Missing DOJ" value={gaps.missing_doj} tone={gaps.missing_doj ? "warn" : "ok"} />
              <GapChip label="Missing dept/role" value={gaps.missing_dept + gaps.missing_designation} tone={(gaps.missing_dept + gaps.missing_designation) ? "warn" : "ok"} />
            </div>
          )}
          {gaps && (gaps.missing_pan || gaps.missing_bank || gaps.missing_doj || gaps.missing_dept || gaps.missing_designation) > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-xs">Onboarding gaps remain</AlertTitle>
              <AlertDescription className="text-xs">
                RazorpayX did not supply every required field. HR must complete these in the Onboarding Pipeline before activating drafts. Bulk ERP→Razorpay push does not open until zero drafts have missing bank / PAN / DOJ / department fields.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* PHASE 2 — Probe & envelope catalogue */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4" /> Phase 2 — Probe catalogue</CardTitle>
          <CardDescription>
            Discover which Opfin sub-types this Live tenant supports before any push work is designed.
            Read sub-types are probed live against a pilot-verified employee. Write sub-types are listed
            as <span className="font-medium">pending</span> — they require an operator-approved payload before Lovable calls them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={runProbeCatalogue} disabled={probing}>
              {probing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Run probe catalogue
            </Button>
            {probeId && (
              <span className="text-xs text-muted-foreground">
                Probing against Razorpay employee ID <code>{probeId}</code>
              </span>
            )}
          </div>
          {probeRows && probeRows.length > 0 && (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-2">Phase</th>
                    <th className="p-2">Sub-type</th>
                    <th className="p-2">Mode</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">HTTP</th>
                    <th className="p-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {probeRows.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 text-muted-foreground">{r.phase}</td>
                      <td className="p-2 font-mono">{r.key}</td>
                      <td className="p-2">
                        {r.mode === "read"
                          ? <Badge variant="outline" className="text-[10px]">read</Badge>
                          : <Badge variant="secondary" className="text-[10px]">write</Badge>}
                      </td>
                      <td className="p-2">
                        {r.status === "ok" && <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">ok</Badge>}
                        {r.status === "fail" && <Badge variant="destructive" className="text-[10px]">fail</Badge>}
                        {r.status === "not_probed" && <Badge variant="outline" className="text-[10px]">pending</Badge>}
                      </td>
                      <td className="p-2 tabular-nums">{r.http_status ?? "—"}</td>
                      <td className="p-2 text-muted-foreground truncate max-w-[280px]">{r.error ?? (r.status === "not_probed" ? "write sub-type — needs operator payload" : "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {probeRows && !probeRows.length && (
            <p className="text-xs text-muted-foreground">No probes returned. Verify credentials and pilot-verified employee.</p>
          )}
        </CardContent>
      </Card>

      {/* PHASE 3 — Employee-master push (ERP → Razorpay) */}
      <Card className={canPilot ? "" : "opacity-50 pointer-events-none"}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><DownloadCloud className="h-4 w-4 rotate-180" /> Phase 3 — Push identity to Razorpay</CardTitle>
          <CardDescription>
            Push ERP identity/metadata diffs back to RazorpayX via <code>people:update</code>.
            Only <em>name, phone, email, gender, DOB, department, title, DOJ, employee-type</em> are pushed
            (bank &amp; PAN are handled in Phase 4). Requires a dry-run, then a single pilot push, then explicit bulk unlock.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Push pilot:</span>
              <Badge variant={settings?.push_pilot_verified_at ? "default" : "secondary"}>
                {settings?.push_pilot_verified_at ? "Verified" : "Not verified"}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Bulk push:</span>
              <Badge variant={settings?.bulk_push_unlocked ? "default" : "secondary"}>
                {settings?.bulk_push_unlocked ? "Unlocked" : "Locked"}
              </Badge>
            </div>
            {settings?.last_push_at && (
              <div className="text-muted-foreground">Last push: {new Date(settings.last_push_at).toLocaleString()}</div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground">Razorpay employee ID (optional — leave blank for all mapped):</label>
            <input
              type="number" min={1} value={pushRpId} onChange={(e) => setPushRpId(e.target.value)}
              className="h-8 w-28 rounded border bg-background px-2 text-sm text-foreground"
              placeholder="e.g. 1"
            />
            <Button size="sm" variant="outline" onClick={runPushDryRun} disabled={pushDrying}>
              {pushDrying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Dry-run diff
            </Button>
            <Button size="sm" onClick={runPushApplyOne} disabled={pushApplyingOne || !pushRpId.trim()}>
              {pushApplyingOne && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Push pilot (one)
            </Button>
            {settings?.push_pilot_verified_at && !settings?.bulk_push_unlocked && (
              <Button size="sm" variant="secondary" onClick={runPushUnlockBulk} disabled={pushUnlocking}>
                {pushUnlocking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Unlock bulk push
              </Button>
            )}
            {settings?.bulk_push_unlocked && (
              <Button size="sm" variant="destructive" onClick={runPushApplyBulk} disabled={pushApplyingBulk}>
                {pushApplyingBulk && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Apply bulk push
              </Button>
            )}
          </div>

          {(pushDryResult || pushApplyResult) && (() => {
            const r = pushApplyResult || pushDryResult!;
            return (
              <div className="rounded-md border overflow-x-auto">
                <div className="p-2 text-xs bg-muted/50 flex flex-wrap gap-3">
                  <span>Total: <b>{r.summary.total}</b></span>
                  <span>Planned: <b>{r.summary.planned}</b></span>
                  <span>Unchanged: <b>{r.summary.unchanged}</b></span>
                  <span>Pushed: <b className="text-emerald-600">{r.summary.pushed}</b></span>
                  <span>Failed: <b className="text-destructive">{r.summary.failed}</b></span>
                  {!!r.summary.no_baseline && (
                    <span className="text-amber-600">No baseline: <b>{r.summary.no_baseline}</b> — run Phase 1 deep-pull first</span>
                  )}
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-muted/30">
                    <tr className="text-left">
                      <th className="p-2">Razorpay ID</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Fields changed</th>
                      <th className="p-2">Conflicts</th>
                      <th className="p-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 font-mono">{row.razorpay_employee_id}</td>
                        <td className="p-2">
                          {row.status === "pushed" && <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">pushed</Badge>}
                          {row.status === "planned" && <Badge variant="outline" className="text-[10px]">planned</Badge>}
                          {row.status === "unchanged" && <Badge variant="secondary" className="text-[10px]">unchanged</Badge>}
                          {row.status === "failed" && <Badge variant="destructive" className="text-[10px]">failed</Badge>}
                          {row.status === "no_baseline" && <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">no baseline</Badge>}
                          {row.status === "skipped_no_baseline" && <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">skipped</Badge>}
                        </td>
                        <td className="p-2 text-muted-foreground">{row.changed.join(", ") || "—"}</td>
                        <td className="p-2 text-amber-600">{row.conflicts?.join(", ") || "—"}</td>
                        <td className="p-2 text-destructive truncate max-w-[240px]">{row.error || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Phase 4 — Bank & PAN push (isolated behind own toggle + pilot + bulk unlock + diff-and-confirm) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Phase 4 — Bank & PAN push to Razorpay
          </CardTitle>
          <CardDescription>
            Isolated write path for account number, IFSC, bank name, PAN and holder name. Every row is validated server-side (PAN pattern, IFSC pattern, non-empty account). Every apply requires the diff-and-confirm dialog — no silent flush.
            {settings?.push_bank_pilot_verified_at
              ? <> · <span className="text-emerald-600">Bank pilot verified</span></>
              : <> · <span className="text-amber-600">Bank pilot not yet verified</span></>}
            {settings?.bulk_bank_push_unlocked
              ? <> · <span className="text-emerald-600">Bulk bank unlocked</span></>
              : <> · <span className="text-muted-foreground">Bulk bank locked</span></>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="default" className="border-amber-500/50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-sm">High-blast-radius domain</AlertTitle>
            <AlertDescription className="text-xs">
              Wrong account = wrong payout. This card intentionally does not batch silently — you must review the masked patch preview and confirm each apply.
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Razorpay employee ID (for pilot)"
              value={bankRpId}
              onChange={(e) => setBankRpId(e.target.value.replace(/[^\d]/g, ""))}
              className="h-9 rounded-md border bg-background px-3 text-sm text-foreground w-56"
            />
            <Button size="sm" variant="secondary" onClick={runBankDryRun} disabled={bankDrying}>
              {bankDrying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Dry-run preview
            </Button>
            <Button size="sm" onClick={requestBankApplyOne} disabled={bankApplyingOne || !bankDryResult?.ok}>
              {bankApplyingOne && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Apply pilot (one)
            </Button>
            <Button size="sm" variant="outline" onClick={runBankUnlockBulk}
              disabled={bankUnlocking || !settings?.push_bank_pilot_verified_at || settings?.bulk_bank_push_unlocked}>
              {bankUnlocking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Unlock bulk bank
            </Button>
            <Button size="sm" variant="destructive" onClick={requestBankApplyBulk}
              disabled={bankApplyingBulk || !settings?.bulk_bank_push_unlocked}>
              {bankApplyingBulk && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Apply bulk bank
            </Button>
          </div>

          {(bankDryResult || bankApplyResult) && (() => {
            const r = bankApplyResult || bankDryResult!;
            return (
              <div className="rounded-md border overflow-x-auto">
                <div className="p-2 text-xs bg-muted/50 flex flex-wrap gap-3">
                  <span>Total: <b>{r.summary.total}</b></span>
                  <span>Planned: <b>{r.summary.planned}</b></span>
                  <span>Unchanged: <b>{r.summary.unchanged}</b></span>
                  <span>Pushed: <b className="text-emerald-600">{r.summary.pushed}</b></span>
                  <span>Failed: <b className="text-destructive">{r.summary.failed}</b></span>
                  <span className="text-destructive">Invalid: <b>{r.summary.invalid}</b></span>
                  {!!r.summary.no_baseline && (
                    <span className="text-amber-600">No baseline: <b>{r.summary.no_baseline}</b> — run Phase 1 deep-pull first</span>
                  )}
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-muted/30">
                    <tr className="text-left">
                      <th className="p-2">Razorpay ID</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Holder</th>
                      <th className="p-2">Fields changed / reasons</th>
                      <th className="p-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 font-mono">{row.razorpay_employee_id}</td>
                        <td className="p-2">
                          {row.status === "pushed" && <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">pushed</Badge>}
                          {row.status === "planned" && <Badge variant="outline" className="text-[10px]">planned</Badge>}
                          {row.status === "unchanged" && <Badge variant="secondary" className="text-[10px]">unchanged</Badge>}
                          {row.status === "failed" && <Badge variant="destructive" className="text-[10px]">failed</Badge>}
                          {row.status === "invalid" && <Badge variant="destructive" className="text-[10px]">invalid</Badge>}
                          {row.status === "no_baseline" && <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">no baseline</Badge>}
                          {row.status === "skipped_no_baseline" && <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">skipped</Badge>}
                        </td>
                        <td className="p-2 text-muted-foreground">{row.holder_name || "—"}</td>
                        <td className="p-2 text-muted-foreground">
                          {row.status === "invalid"
                            ? <span className="text-destructive">{(row.reasons || []).join(", ")}</span>
                            : (row.changed || []).join(", ") || "—"}
                        </td>
                        <td className="p-2 text-destructive truncate max-w-[240px]">{row.error || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Bank diff-and-confirm dialog (mandatory per plan) */}
      {bankConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-background rounded-lg shadow-xl border max-w-lg w-full p-4 space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Confirm bank push to RazorpayX (Live)
            </div>
            {bankConfirm.mode === "one" && bankConfirm.row && (
              <div className="space-y-2 text-sm">
                <div>Razorpay employee: <b className="font-mono">{bankConfirm.row.razorpay_employee_id}</b></div>
                <div>Holder: <b>{bankConfirm.row.holder_name || "—"}</b></div>
                <div className="rounded-md border bg-muted/40 p-2 text-xs font-mono whitespace-pre-wrap">
                  {JSON.stringify(bankConfirm.row.patch_preview || {}, null, 2)}
                </div>
                <div className="text-xs text-muted-foreground">Account number and PAN are shown masked (only the last 4 characters). The full values are transmitted directly to Razorpay from the server.</div>
              </div>
            )}
            {bankConfirm.mode === "bulk" && (
              <div className="text-sm">
                This will apply bank + PAN updates to <b>every valid, changed, baselined</b> mapped employee. Review the dry-run table before proceeding — you cannot undo a payout-route change from here.
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => setBankConfirm(null)}>Cancel</Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={bankConfirm.mode === "one" ? confirmBankApplyOne : confirmBankApplyBulk}
              >
                Yes, push to Razorpay
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 5 — Salary structure sync (discovery-first: writes blocked until envelope verified) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4" /> Phase 5 — Salary structure sync to Razorpay
          </CardTitle>
          <CardDescription>
            Pushes ERP's active salary structure (components + total) to Razorpay. Dry-run compares ERP components against Razorpay's last-known snapshot; live pushes are blocked until an operator records a probe-verified envelope key (e.g. <code className="text-xs px-1 rounded bg-muted">people:update</code>).
            {settings?.push_salary_endpoint_verified
              ? <> · <span className="text-emerald-600">Envelope verified ({settings?.push_salary_envelope_key})</span></>
              : <> · <span className="text-amber-600">Envelope not verified</span></>}
            {settings?.push_salary_pilot_verified_at
              ? <> · <span className="text-emerald-600">Salary pilot verified</span></>
              : <> · <span className="text-muted-foreground">Salary pilot pending</span></>}
            {settings?.bulk_salary_push_unlocked
              ? <> · <span className="text-emerald-600">Bulk salary unlocked</span></>
              : <> · <span className="text-muted-foreground">Bulk salary locked</span></>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="default" className="border-amber-500/50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-sm">Discovery-first write path</AlertTitle>
            <AlertDescription className="text-xs">
              The live salary envelope has not been auto-verified. Probe candidate endpoints (Phase 2) with a pilot employee, and once you confirm which sub-type is accepted by Razorpay Live, record it here. Only then will apply buttons unlock.
            </AlertDescription>
          </Alert>

          <div className="rounded-md border p-3 bg-muted/20 space-y-2">
            <div className="text-xs font-medium">Envelope verification</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="e.g. people:update"
                value={salaryEnvelopeInput}
                onChange={(e) => setSalaryEnvelopeInput(e.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm text-foreground w-56"
              />
              <Button size="sm" variant="secondary" onClick={() => runRecordSalaryEnvelope(true)} disabled={salaryRecording}>
                {salaryRecording && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Record as verified
              </Button>
              <Button size="sm" variant="ghost" onClick={() => runRecordSalaryEnvelope(false)} disabled={salaryRecording || !settings?.push_salary_endpoint_verified}>
                Clear verification
              </Button>
              {settings?.push_salary_envelope_verified_at && (
                <span className="text-xs text-muted-foreground">
                  Verified at {new Date(settings.push_salary_envelope_verified_at).toLocaleString()}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Changing this value automatically resets the pilot + bulk-unlock gates so a stale verification cannot re-enable pushes against a new envelope.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Razorpay employee ID (for pilot)"
              value={salaryRpId}
              onChange={(e) => setSalaryRpId(e.target.value.replace(/[^\d]/g, ""))}
              className="h-9 rounded-md border bg-background px-3 text-sm text-foreground w-56"
            />
            <Button size="sm" variant="secondary" onClick={runSalaryDryRun} disabled={salaryDrying}>
              {salaryDrying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Dry-run preview
            </Button>
            <Button size="sm" onClick={requestSalaryApplyOne}
              disabled={salaryApplyingOne || !salaryDryResult?.ok || !settings?.push_salary_endpoint_verified}>
              {salaryApplyingOne && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Apply pilot (one)
            </Button>
            <Button size="sm" variant="outline" onClick={runSalaryUnlockBulk}
              disabled={salaryUnlocking || !settings?.push_salary_pilot_verified_at || settings?.bulk_salary_push_unlocked}>
              {salaryUnlocking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Unlock bulk salary
            </Button>
            <Button size="sm" variant="destructive" onClick={requestSalaryApplyBulk}
              disabled={salaryApplyingBulk || !settings?.bulk_salary_push_unlocked}>
              {salaryApplyingBulk && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Apply bulk salary
            </Button>
          </div>

          {(salaryDryResult || salaryApplyResult) && (() => {
            const r = salaryApplyResult || salaryDryResult!;
            return (
              <div className="rounded-md border overflow-x-auto">
                <div className="p-2 text-xs bg-muted/50 flex flex-wrap gap-3">
                  <span>Total: <b>{r.summary.total}</b></span>
                  <span>Planned: <b>{r.summary.planned}</b></span>
                  <span>Unchanged: <b>{r.summary.unchanged}</b></span>
                  <span>Pushed: <b className="text-emerald-600">{r.summary.pushed}</b></span>
                  <span>Failed: <b className="text-destructive">{r.summary.failed}</b></span>
                  <span>Skipped: <b>{r.summary.skipped}</b></span>
                  {!!r.summary.no_baseline && (
                    <span className="text-amber-600">No baseline: <b>{r.summary.no_baseline}</b> — run Phase 1 deep-pull first</span>
                  )}
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-muted/30">
                    <tr className="text-left">
                      <th className="p-2">Razorpay ID</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">ERP total</th>
                      <th className="p-2">Components</th>
                      <th className="p-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 font-mono">{row.razorpay_employee_id}</td>
                        <td className="p-2">
                          {row.status === "pushed" && <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">pushed</Badge>}
                          {row.status === "planned" && <Badge variant="outline" className="text-[10px]">planned</Badge>}
                          {row.status === "unchanged" && <Badge variant="secondary" className="text-[10px]">unchanged</Badge>}
                          {row.status === "failed" && <Badge variant="destructive" className="text-[10px]">failed</Badge>}
                          {row.status === "no_baseline" && <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">no baseline</Badge>}
                          {row.status === "skipped_no_baseline" && <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">skipped</Badge>}
                          {row.status === "no_erp_structure" && <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">no ERP structure</Badge>}
                        </td>
                        <td className="p-2 font-mono">{row.erp_total !== undefined ? row.erp_total.toLocaleString() : "—"}</td>
                        <td className="p-2 text-muted-foreground">{row.components_count ?? "—"}</td>
                        <td className="p-2 text-destructive truncate max-w-[240px]">{row.error || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Salary diff-and-confirm dialog */}
      {salaryConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-background rounded-lg shadow-xl border max-w-2xl w-full p-4 space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Confirm salary push to RazorpayX (Live)
            </div>
            {salaryConfirm.mode === "one" && salaryConfirm.row && (
              <div className="space-y-2 text-sm">
                <div>Razorpay employee: <b className="font-mono">{salaryConfirm.row.razorpay_employee_id}</b></div>
                <div>Envelope: <b className="font-mono">{settings?.push_salary_envelope_key}</b></div>
                <div>ERP total: <b>{salaryConfirm.row.erp_total?.toLocaleString()}</b> · {salaryConfirm.row.components_count} components</div>
                <div className="rounded-md border bg-muted/40 p-2 text-xs font-mono whitespace-pre-wrap max-h-64 overflow-auto">
                  {JSON.stringify(salaryConfirm.row.erp_components || [], null, 2)}
                </div>
                <div className="text-xs text-muted-foreground">This ERP structure will be sent as the salary block in the recorded envelope. Razorpay's response will validate the shape.</div>
              </div>
            )}
            {salaryConfirm.mode === "bulk" && (
              <div className="text-sm">
                This will POST salary updates to <b>every mapped employee with a divergent baseline</b> using envelope <b className="font-mono">{settings?.push_salary_envelope_key}</b>. Confirm only after the pilot response looked correct in Razorpay's UI.
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => setSalaryConfirm(null)}>Cancel</Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={salaryConfirm.mode === "one" ? confirmSalaryApplyOne : confirmSalaryApplyBulk}
              >
                Yes, push to Razorpay
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 6 — Monthly attendance / LOP push (discovery-first: writes blocked until envelope verified) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4" /> Phase 6 — Monthly attendance / LOP push
          </CardTitle>
          <CardDescription>
            Computes working days, present days, paid leave, and LOP from ERP (attendance + approved leave + holidays), and pushes it to Razorpay for the selected month. Dry-run works pre-verification; live pushes are blocked until an operator records a probe-verified envelope key (e.g. <code className="text-xs px-1 rounded bg-muted">attendance:update</code>).
            {settings?.push_attendance_endpoint_verified
              ? <> · <span className="text-emerald-600">Envelope verified ({settings?.push_attendance_envelope_key})</span></>
              : <> · <span className="text-amber-600">Envelope not verified</span></>}
            {settings?.push_attendance_pilot_verified_at
              ? <> · <span className="text-emerald-600">Attendance pilot verified{settings?.push_attendance_pilot_period ? ` (${settings.push_attendance_pilot_period})` : ""}</span></>
              : <> · <span className="text-muted-foreground">Attendance pilot pending</span></>}
            {settings?.bulk_attendance_push_unlocked
              ? <> · <span className="text-emerald-600">Bulk attendance unlocked</span></>
              : <> · <span className="text-muted-foreground">Bulk attendance locked</span></>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="default" className="border-amber-500/50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-sm">Discovery-first write path</AlertTitle>
            <AlertDescription className="text-xs">
              The attendance envelope has not been auto-verified against Razorpay Live. Probe candidate sub-types (Phase 2), confirm which one Razorpay accepts, then record it here. LOP is computed as <code>working_days − present_days − paid_leave_days</code> using ERP truth (Sunday + active holidays excluded from working days). Half-day leaves count as 0.5 days.
            </AlertDescription>
          </Alert>

          <div className="rounded-md border p-3 bg-muted/20 space-y-2">
            <div className="text-xs font-medium">Envelope verification</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="e.g. attendance:update"
                value={attEnvelopeInput}
                onChange={(e) => setAttEnvelopeInput(e.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm text-foreground w-56"
              />
              <Button size="sm" variant="secondary" onClick={() => runRecordAttendanceEnvelope(true)} disabled={attRecording}>
                {attRecording && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Record as verified
              </Button>
              <Button size="sm" variant="ghost" onClick={() => runRecordAttendanceEnvelope(false)} disabled={attRecording || !settings?.push_attendance_endpoint_verified}>
                Clear verification
              </Button>
              {settings?.push_attendance_envelope_verified_at && (
                <span className="text-xs text-muted-foreground">
                  Verified at {new Date(settings.push_attendance_envelope_verified_at).toLocaleString()}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Changing this value resets the pilot + bulk-unlock gates.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground">Period:</label>
            <input
              type="month"
              value={attPeriod}
              onChange={(e) => setAttPeriod(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"
            />
            <input
              type="text"
              inputMode="numeric"
              placeholder="Razorpay employee ID (for pilot)"
              value={attRpId}
              onChange={(e) => setAttRpId(e.target.value.replace(/[^\d]/g, ""))}
              className="h-9 rounded-md border bg-background px-3 text-sm text-foreground w-56"
            />
            <Button size="sm" variant="secondary" onClick={runAttendanceDryRun} disabled={attDrying}>
              {attDrying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Dry-run preview
            </Button>
            <Button size="sm" onClick={requestAttendanceApplyOne}
              disabled={attApplyingOne || !attDryResult?.ok || !settings?.push_attendance_endpoint_verified}>
              {attApplyingOne && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Apply pilot (one)
            </Button>
            <Button size="sm" variant="outline" onClick={runAttendanceUnlockBulk}
              disabled={attUnlocking || !settings?.push_attendance_pilot_verified_at || settings?.bulk_attendance_push_unlocked}>
              {attUnlocking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Unlock bulk attendance
            </Button>
            <Button size="sm" variant="destructive" onClick={requestAttendanceApplyBulk}
              disabled={attApplyingBulk || !settings?.bulk_attendance_push_unlocked}>
              {attApplyingBulk && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Apply bulk attendance
            </Button>
          </div>

          {(attDryResult || attApplyResult) && (() => {
            const r = attApplyResult || attDryResult!;
            return (
              <div className="rounded-md border overflow-x-auto">
                <div className="p-2 text-xs bg-muted/50 flex flex-wrap gap-3">
                  <span>Period: <b>{r.period}</b></span>
                  <span>Working days (ERP): <b>{r.summary.working_days}</b></span>
                  <span>Total rows: <b>{r.summary.total}</b></span>
                  <span>Planned: <b>{r.summary.planned}</b></span>
                  <span>Pushed: <b className="text-emerald-600">{r.summary.pushed}</b></span>
                  <span>Failed: <b className="text-destructive">{r.summary.failed}</b></span>
                  <span>Skipped: <b>{r.summary.skipped}</b></span>
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-muted/30">
                    <tr className="text-left">
                      <th className="p-2">Razorpay ID</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Present</th>
                      <th className="p-2">Paid leave</th>
                      <th className="p-2">Unpaid leave</th>
                      <th className="p-2">LOP</th>
                      <th className="p-2">Sanity</th>
                      <th className="p-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 font-mono">{row.razorpay_employee_id}</td>
                        <td className="p-2">
                          {row.status === "pushed" && <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">pushed</Badge>}
                          {row.status === "planned" && <Badge variant="outline" className="text-[10px]">planned</Badge>}
                          {row.status === "failed" && <Badge variant="destructive" className="text-[10px]">failed</Badge>}
                          {row.status === "skipped" && <Badge variant="outline" className="text-[10px]">skipped</Badge>}
                        </td>
                        <td className="p-2 font-mono">{row.present_days ?? "—"}</td>
                        <td className="p-2 font-mono">{row.paid_leave_days ?? "—"}</td>
                        <td className="p-2 font-mono">{row.unpaid_leave_days ?? "—"}</td>
                        <td className="p-2 font-mono">{row.lop_days ?? "—"}</td>
                        <td className="p-2">
                          {row.unpaid_matches_lop === false
                            ? <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">unpaid mismatch</Badge>
                            : <span className="text-muted-foreground">ok</span>}
                        </td>
                        <td className="p-2 text-destructive truncate max-w-[200px]">{row.error || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Attendance diff-and-confirm dialog */}
      {attConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-background rounded-lg shadow-xl border max-w-lg w-full p-4 space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Confirm attendance push to RazorpayX (Live)
            </div>
            {attConfirm.mode === "one" && attConfirm.row && (
              <div className="space-y-2 text-sm">
                <div>Razorpay employee: <b className="font-mono">{attConfirm.row.razorpay_employee_id}</b></div>
                <div>Envelope: <b className="font-mono">{settings?.push_attendance_envelope_key}</b></div>
                <div>Period: <b>{attPeriod}</b></div>
                <div className="rounded-md border bg-muted/40 p-2 text-xs font-mono whitespace-pre-wrap">
                  {JSON.stringify({
                    working_days: attConfirm.row.working_days,
                    present_days: attConfirm.row.present_days,
                    paid_leave_days: attConfirm.row.paid_leave_days,
                    unpaid_leave_days: attConfirm.row.unpaid_leave_days,
                    lop_days: attConfirm.row.lop_days,
                  }, null, 2)}
                </div>
                {attConfirm.row.unpaid_matches_lop === false && (
                  <div className="text-xs text-amber-600">Warning: unpaid leave doesn't equal LOP. There are unexplained absences or a leave-type is-paid flag mismatch. Proceed only if that's expected.</div>
                )}
              </div>
            )}
            {attConfirm.mode === "bulk" && (
              <div className="text-sm">
                This will POST attendance/LOP for <b>every mapped employee</b> for <b>{attPeriod}</b> using envelope <b className="font-mono">{settings?.push_attendance_envelope_key}</b>. Confirm only after the pilot push looked correct in Razorpay's UI.
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => setAttConfirm(null)}>Cancel</Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={attConfirm.mode === "one" ? confirmAttendanceApplyOne : confirmAttendanceApplyBulk}
              >
                Yes, push to Razorpay
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3 — Bulk */}



      <Card className={canPilot ? "" : "opacity-50 pointer-events-none"}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4" /> Step 3 — Bulk import (range)</CardTitle>
          <CardDescription>
            Walk <code>start-id</code> → <code>max-id</code>, dry-run first (available pre-pilot), then apply (requires unlock). Stops after 30 consecutive misses; hard cap 1000 IDs per run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-muted-foreground">From:</label>
            <input type="number" min={1} value={startId} onChange={(e) => setStartId(e.target.value)}
              className="h-8 w-24 rounded border bg-background px-2 text-sm text-foreground" />
            <label className="text-xs text-muted-foreground">To:</label>
            <input type="number" min={1} value={maxId} onChange={(e) => setMaxId(e.target.value)}
              className="h-8 w-24 rounded border bg-background px-2 text-sm text-foreground" />
            <Button size="sm" variant="secondary" onClick={runDryRun} disabled={dryRunning}>
              {dryRunning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Dry-run preview
            </Button>
            <Button size="sm" onClick={runApplyBulk} disabled={applyingBulk || !dryRun?.ok || !canBulk} title={!canBulk ? "Unlock bulk sync after pilot verification" : undefined}>
              {applyingBulk && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <CheckCircle2 className="h-4 w-4 mr-2" /> Apply import {!canBulk && "(locked)"}
            </Button>
          </div>


          {(dryRun || applied) && (
            <div className="text-xs text-muted-foreground">
              {applied ? "Applied · " : "Dry-run · "}
              hits: {(applied ?? dryRun)!.summary.hits} ·
              matches: {(applied ?? dryRun)!.summary.matches} ·
              new drafts: {(applied ?? dryRun)!.summary.creates} ·
              misses: {(applied ?? dryRun)!.summary.misses}
              {(applied ?? dryRun)!.summary.stopped && " · stopped early"}
            </div>
          )}

          {rowsToShow.length > 0 && (
            <div className="rounded-md border overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2">ID</th><th className="p-2">Status</th><th className="p-2">Name</th>
                    <th className="p-2">Title</th><th className="p-2">Dept</th>
                    <th className="p-2">Match</th><th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsToShow.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 font-mono">{r.employee_id ?? "—"}</td>
                      <td className="p-2">
                        {r.status === "hit" && <Badge variant="default" className="text-[10px]">hit</Badge>}
                        {r.status === "miss" && <Badge variant="outline" className="text-[10px]">miss {r.http_status}</Badge>}
                        {r.status === "stopped" && <Badge variant="secondary" className="text-[10px]">stopped</Badge>}
                      </td>
                      <td className="p-2">{r.name ?? r.note ?? "—"}</td>
                      <td className="p-2">{r.title ?? "—"}</td>
                      <td className="p-2">{r.department ?? "—"}</td>
                      <td className="p-2">{r.matched_by ?? "—"}</td>
                      <td className="p-2">
                        {r.action_planned === "match" && <span className="text-emerald-600">Match</span>}
                        {r.action_planned === "create_draft" && <span className="text-amber-600">Create draft</span>}
                        {r.applied && <span className="ml-1 text-muted-foreground">✓ written</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <PayrollRunSection invoke={invoke} />
    </div>
  );
}

function GapChip({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" | "neutral" }) {
  const cls =
    tone === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : tone === "warn" ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    : "border-border bg-muted/40 text-foreground";
  return (
    <div className={`rounded-md border px-2 py-1.5 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}
