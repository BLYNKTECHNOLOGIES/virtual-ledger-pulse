import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, ShieldAlert, Lock, Play, ListChecks, CheckCircle2, DownloadCloud, AlertTriangle } from "lucide-react";
import { Station, type StationStatus } from "./RoadmapStation";
import { RoadmapJourneyNav } from "./RoadmapJourneyNav";
import { TodaysFocusHero } from "./TodaysFocusHero";
import { cn } from "@/lib/utils";

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
  probe_pilot_employee_id?: string | null;
  probe_pilot_contractor_id?: string | null;
}
interface AttendanceRow {
  razorpay_employee_id: string;
  hr_employee_id?: string;
  status: "planned" | "pushed" | "failed" | "skipped" | "blocked_config_error" | "no_erp_attendance" | "blocked_period_locked";
  period?: string;
  working_days?: number;
  present_days?: number;
  paid_leave_days?: number;
  unpaid_leave_days?: number;
  lop_days?: number;
  unpaid_matches_lop?: boolean;
  formula?: string;
  weekly_off_days?: number[];
  weekly_off_source?: "per_employee" | "tenant_default_pattern" | "hardcoded_sunday";
  holidays_in_month?: number;
  config_errors?: string[];
  error?: string;
}
interface AttendanceResponse {
  ok: boolean;
  period: string;
  summary: {
    total: number; planned: number; pushed: number; failed: number; skipped: number;
    working_days_range?: { min: number; max: number };
    holidays_in_month?: number;
    // legacy
    working_days?: number;
  };
  tenant_warnings?: string[];
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
  /** Populated by the edge fn on server errors / apply exceptions. */
  error?: string;
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
  const [simpleMode, setSimpleMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("razorpay_sync_simple_mode") !== "false";
  });
  const toggleSimpleMode = (v: boolean) => {
    setSimpleMode(v);
    try { localStorage.setItem("razorpay_sync_simple_mode", v ? "true" : "false"); } catch {}
  };

  // Two-rail split: one-time setup (A–E) vs monthly cycle (F–J).
  // The setup rail auto-collapses into a green strip once every setup station is done,
  // so post-commissioning HR sees the monthly rhythm as the daily home.
  const SETUP_LETTERS = ["A", "B", "C", "D", "E"] as const;
  const MONTHLY_LETTERS = ["F", "G", "H", "I", "J"] as const;
  const [setupCollapsedManual, setSetupCollapsedManual] = useState<boolean | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem("razorpay_sync_setup_collapsed");
    return raw === null ? null : raw === "true";
  });
  const persistSetupCollapsed = (v: boolean) => {
    setSetupCollapsedManual(v);
    try { localStorage.setItem("razorpay_sync_setup_collapsed", v ? "true" : "false"); } catch {}
  };

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

  // Step B · Check which RazorpayX features are available
  type ProbeRow = {
    phase: string; key: string; mode: "read" | "write";
    status: "ok" | "fail" | "not_probed" | "skipped"; http_status: number | null; error: string | null;
  };
  const [probing, setProbing] = useState(false);
  const [probeRows, setProbeRows] = useState<ProbeRow[] | null>(null);
  const [probeId, setProbeId] = useState<string | number | null>(null);
  const [probePilotEmpId, setProbePilotEmpId] = useState("");
  const [probePilotContractorId, setProbePilotContractorId] = useState("");
  const [savingProbePilots, setSavingProbePilots] = useState(false);

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

  // Step F · Send monthly attendance & LOP to RazorpayX (discovery-first, envelope-gated)
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
      .select("base_url,bulk_sync_unlocked,last_creds_validated_at,last_import_at,push_pilot_verified_at,push_pilot_hr_employee_id,bulk_push_unlocked,last_push_at,push_bank_pilot_verified_at,bulk_bank_push_unlocked,last_bank_push_at,push_salary_endpoint_verified,push_salary_envelope_key,push_salary_envelope_verified_at,push_salary_pilot_verified_at,bulk_salary_push_unlocked,last_salary_push_at,push_attendance_endpoint_verified,push_attendance_envelope_key,push_attendance_envelope_verified_at,push_attendance_pilot_verified_at,push_attendance_pilot_period,bulk_attendance_push_unlocked,last_attendance_push_at,probe_pilot_employee_id,probe_pilot_contractor_id")
      .maybeSingle();
    const s = data as Settings | null;
    setSettings(s);
    setProbePilotEmpId(s?.probe_pilot_employee_id ?? "");
    setProbePilotContractorId(s?.probe_pilot_contractor_id ?? "");
  };


  useEffect(() => { if (canAccess) { reloadSettings(); reloadGaps(); } }, [canAccess]);

  // Auto-verify Step E (salary) + Step F (attendance) API names once creds are
  // validated. HR should never need to type an envelope key — the correct
  // values are Postman-verified constants baked into the proxy.
  useEffect(() => {
    if (!canAccess || !settings) return;
    if (!settings.last_creds_validated_at) return;
    const needsSalary = !settings.push_salary_endpoint_verified;
    const needsAttendance = !settings.push_attendance_endpoint_verified;
    if (!needsSalary && !needsAttendance) return;
    (async () => {
      try {
        await invoke({ action: "auto_verify_step_envelopes" });
        await reloadSettings();
      } catch {
        // Silent — Advanced view still exposes the manual override.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, settings?.last_creds_validated_at, settings?.push_salary_endpoint_verified, settings?.push_attendance_endpoint_verified]);

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
      const d = await invoke<{ ok: boolean; probe_id: string | number | null; rows: ProbeRow[] }>({ action: "probe_catalogue" });
      setProbeRows(d.rows || []);
      setProbeId(d.probe_id ?? null);
      const rowsArr = d.rows || [];
      const okCount = rowsArr.filter((r) => r.status === "ok").length;
      const failCount = rowsArr.filter((r) => r.status === "fail").length;
      const skipCount = rowsArr.filter((r) => r.status === "skipped").length;
      const pendingCount = rowsArr.filter((r) => r.status === "not_probed").length;
      toast({ title: "Probe catalogue complete", description: `${okCount} confirmed · ${failCount} failed · ${skipCount} skipped · ${pendingCount} pending (write)` });
    } catch (e: any) {
      toast({ title: "Probe run failed", description: e?.message, variant: "destructive" });
    } finally { setProbing(false); }
  };

  const saveProbePilots = async () => {
    setSavingProbePilots(true);
    try {
      await invoke({
        action: "save_probe_pilots",
        probe_pilot_employee_id: probePilotEmpId.trim(),
        probe_pilot_contractor_id: probePilotContractorId.trim(),
      });
      await reloadSettings();
      toast({ title: "Probe pilots saved", description: "Run the probe catalogue again to re-check the read endpoints." });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    } finally { setSavingProbePilots(false); }
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
        description: `${d.summary.planned} rows · working days: ${d.summary.working_days_range ? `${d.summary.working_days_range.min}–${d.summary.working_days_range.max}` : (d.summary.working_days ?? "—")}${d.tenant_warnings?.length ? ` · ${d.tenant_warnings.length} warning(s)` : ""}`,
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

  // Retry-failed chip: re-runs apply_range for the exact IDs that errored on
  // the last apply run OR historical apply_error rows that were never
  // recovered by a later create_draft/match. Logged under the same
  // apply_error / create_draft / match actions with retry:true so the audit
  // trail reads end-to-end across sessions.
  const sessionFailedIds: number[] = (applied?.rows ?? [])
    .filter(r => r.employee_id != null && !!r.error)
    .map(r => r.employee_id as number);
  const [historicalFailedIds, setHistoricalFailedIds] = useState<number[]>([]);
  const failedApplyIds: number[] = Array.from(
    new Set<number>([...sessionFailedIds, ...historicalFailedIds])
  ).sort((a, b) => a - b);

  const reloadHistoricalFailedIds = async () => {
    // Pull recent sync-log rows and derive: apply_error IDs with no later
    // create_draft/match for the same razorpay_employee_id.
    const { data, error } = await supabase
      .from("hr_razorpay_sync_log")
      .select("action, razorpay_employee_id, created_at")
      .in("action", ["apply_error", "create_draft", "match"])
      .order("created_at", { ascending: true })
      .limit(2000);
    if (error || !data) { setHistoricalFailedIds([]); return; }
    const lastByAction = new Map<string, { action: string; at: string }>();
    for (const r of data as any[]) {
      const id = String(r.razorpay_employee_id ?? "");
      if (!id) continue;
      const prev = lastByAction.get(id);
      if (!prev || r.created_at > prev.at) lastByAction.set(id, { action: r.action, at: r.created_at });
    }
    const unresolved: number[] = [];
    for (const [id, v] of lastByAction) {
      if (v.action === "apply_error") {
        const n = Number(id);
        if (Number.isFinite(n)) unresolved.push(n);
      }
    }
    setHistoricalFailedIds(unresolved.sort((a, b) => a - b));
  };
  useEffect(() => { if (canAccess) void reloadHistoricalFailedIds(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [canAccess]);

  const [retryingFailed, setRetryingFailed] = useState(false);
  const runRetryFailed = async () => {
    if (failedApplyIds.length === 0) return;
    setRetryingFailed(true);
    try {
      const d = await invoke<DryRunResponse>({ action: "apply_range", only_ids: failedApplyIds });
      // Merge: replace rows for retried IDs with the new outcome, keep the rest.
      setApplied(prev => {
        const base = prev ?? { ok: true, summary: { total: 0, hits: 0, matches: 0, creates: 0, misses: 0, stopped: false }, rows: [] as any[] };
        const retried = new Set(failedApplyIds);
        const kept = base.rows.filter(r => !(r.employee_id != null && retried.has(r.employee_id as number)));
        const mergedRows = [...kept, ...d.rows];
        return {
          ok: base.ok && d.ok,
          summary: {
            total: mergedRows.length,
            hits: mergedRows.filter(r => r.status === "hit").length,
            matches: mergedRows.filter(r => r.action_planned === "match").length,
            creates: mergedRows.filter(r => r.action_planned === "create_draft").length,
            misses: mergedRows.filter(r => r.status === "miss").length,
            stopped: base.summary.stopped,
          },
          rows: mergedRows,
        };
      });
      const stillFailing = d.rows.filter(r => r.error).length;
      toast({
        title: "Retry complete",
        description: `${failedApplyIds.length - stillFailing} recovered · ${stillFailing} still failing`,
      });
      // Refresh historical list so recovered IDs drop off the chip.
      void reloadHistoricalFailedIds();
    } catch (e: any) {
      toast({ title: "Retry failed", description: e?.message, variant: "destructive" });
    } finally { setRetryingFailed(false); }
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

  // Roadmap step statuses — derived from settings/pilot/unlock flags.
  const stationSteps: { letter: string; title: string; status: StationStatus }[] = (() => {
    const s = settings || ({} as any);
    const done = (v: any) => !!v;
    const arr: { letter: string; title: string; status: StationStatus }[] = [
      { letter: "A", title: "Refresh from RazorpayX",   status: done(s.last_import_at) ? "done" : (canPilot ? "active" : "ready") },
      { letter: "B", title: "Check available features", status: done(s.last_creds_validated_at) ? "done" : (canPilot ? "active" : "ready") },
      { letter: "C", title: "Send name & contact",      status: done(s.bulk_push_unlocked) ? "done" : (done(s.push_pilot_verified_at) ? "active" : (canPilot ? "ready" : "locked")) },
      { letter: "D", title: "Send bank & PAN",          status: done(s.bulk_bank_push_unlocked) ? "done" : (done(s.push_bank_pilot_verified_at) ? "active" : (canPilot ? "ready" : "locked")) },
      { letter: "E", title: "Send salary structures",   status: done(s.bulk_salary_push_unlocked) ? "done" : (done(s.push_salary_pilot_verified_at) ? "active" : (canPilot ? "ready" : "locked")) },
      { letter: "F", title: "Send attendance & LOP",    status: done(s.bulk_attendance_push_unlocked) ? "done" : (done(s.push_attendance_pilot_verified_at) ? "active" : (canPilot ? "ready" : "locked")) },
      { letter: "G", title: "Run monthly payroll",      status: canBulk ? "ready" : "locked" },
      { letter: "H", title: "Match payouts",            status: canBulk ? "ready" : "locked" },
      { letter: "I", title: "Payslips & tax docs",      status: canBulk ? "ready" : "locked" },
      { letter: "J", title: "Reconcile with ledger",    status: canBulk ? "ready" : "locked" },
    ];
    // Promote the first non-done step to "active" if no explicit active exists.
    if (!arr.some(x => x.status === "active")) {
      const idx = arr.findIndex(x => x.status !== "done" && x.status !== "locked");
      if (idx >= 0) arr[idx].status = "active";
    }
    return arr;
  })();
  const stationStatus = (letter: string): StationStatus =>
    stationSteps.find(s => s.letter === letter)?.status ?? "ready";


  return (
    <div className="space-y-6 p-6 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">RazorpayX Payroll Sync</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {simpleMode
              ? "Import your employees from RazorpayX into HRMS. Follow the three steps below."
              : "Advanced view — every phase, probe, and envelope-gated push is visible."}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-1 text-xs">
          <button
            type="button"
            onClick={() => toggleSimpleMode(true)}
            className={`px-3 py-1.5 rounded-md transition ${simpleMode ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            Simple view
          </button>
          <button
            type="button"
            onClick={() => toggleSimpleMode(false)}
            className={`px-3 py-1.5 rounded-md transition ${!simpleMode ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            Advanced view
          </button>
        </div>
      </div>

      {/* Today's Focus — the one thing HR should do right now. Simple mode only. */}
      {simpleMode && (
        <>
          <TodaysFocusHero
            steps={stationSteps}
            onJumpToStation={(letter) => {
              setShowJourney(true);
              setTimeout(() => {
                document.getElementById(`station-${letter}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 60);
            }}
          />
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="text-[11px] text-muted-foreground">
              {showJourney ? "Showing the full payroll journey below." : "Everything else is neatly tucked below."}
            </div>
            <button
              type="button"
              onClick={() => setShowJourney((v) => !v)}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted transition"
            >
              {showJourney ? "Hide all payroll steps" : "See all payroll steps"}
            </button>
          </div>
        </>
      )}

      {/* Two-Rail Overview — recurring monthly cycle on top of one-time setup. */}
      {(!simpleMode || showJourney) && (
      <>
      {(() => {
        const setup = stationSteps.filter((s) => (SETUP_LETTERS as readonly string[]).includes(s.letter));
        const monthly = stationSteps.filter((s) => (MONTHLY_LETTERS as readonly string[]).includes(s.letter));
        const setupDone = setup.filter((s) => s.status === "done").length;
        const monthlyDone = monthly.filter((s) => s.status === "done").length;
        const setupNext = setup.find((s) => s.status === "active") ?? setup.find((s) => s.status === "ready");
        const monthlyNext = monthly.find((s) => s.status === "active") ?? monthly.find((s) => s.status === "ready");
        const setupPct = Math.round((setupDone / setup.length) * 100);
        const monthlyPct = Math.round((monthlyDone / monthly.length) * 100);
        const setupFullyDone = setupDone === setup.length;
        const period = (() => {
          const d = new Date();
          d.setDate(1);
          d.setMonth(d.getMonth() - 1);
          return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
        })();
        const scrollToStation = (letter: string) => {
          document.getElementById(`station-${letter}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        };
        const RailCard = ({
          eyebrow, title, subtitle, done, total, pct, next, tone, cta,
        }: {
          eyebrow: string; title: string; subtitle: string;
          done: number; total: number; pct: number;
          next?: { letter: string; title: string };
          tone: "setup" | "monthly";
          cta: string;
        }) => (
          <Card className={cn(
            "relative overflow-hidden border transition",
            tone === "setup"
              ? "border-amber-500/25 bg-gradient-to-br from-amber-500/[0.05] to-transparent"
              : "border-primary/25 bg-gradient-to-br from-primary/[0.06] to-transparent"
          )}>
            <CardContent className="py-4 px-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className={cn(
                    "text-[10px] font-bold uppercase tracking-[0.14em]",
                    tone === "setup" ? "text-amber-700 dark:text-amber-400" : "text-primary"
                  )}>{eyebrow}</div>
                  <div className="text-base font-semibold mt-0.5 truncate">{title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold tabular-nums leading-none">{done}<span className="text-muted-foreground font-normal">/{total}</span></div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{pct}%</div>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-500",
                    tone === "setup"
                      ? "bg-gradient-to-r from-amber-400 to-amber-500"
                      : "bg-gradient-to-r from-emerald-400 to-emerald-500"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {next ? (
                <button
                  type="button"
                  onClick={() => scrollToStation(next.letter)}
                  className={cn(
                    "w-full text-left text-xs rounded-md px-3 py-2 border transition",
                    tone === "setup"
                      ? "bg-background hover:bg-amber-500/10 border-amber-500/30"
                      : "bg-background hover:bg-primary/10 border-primary/30"
                  )}
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Up next</div>
                  <div className="font-medium mt-0.5">Step {next.letter} — {next.title}</div>
                  <div className={cn(
                    "text-[11px] mt-1",
                    tone === "setup" ? "text-amber-700 dark:text-amber-400" : "text-primary"
                  )}>{cta} →</div>
                </button>
              ) : (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  ✅ All done — no action needed
                </div>
              )}
            </CardContent>
          </Card>
        );
        return (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <RailCard
                eyebrow="Monthly cycle"
                title={period}
                subtitle="Runs every payroll period — attendance → compute → approve → pay → reconcile."
                done={monthlyDone}
                total={monthly.length}
                pct={monthlyPct}
                next={monthlyNext}
                tone="monthly"
                cta="Open this month's payroll"
              />
              <RailCard
                eyebrow="One-time setup"
                title={setupFullyDone ? "Setup complete" : "Company setup"}
                subtitle={setupFullyDone
                  ? "All setup steps done. This rail collapses below."
                  : "Do these once. They'll fold away when finished."}
                done={setupDone}
                total={setup.length}
                pct={setupPct}
                next={setupNext}
                tone="setup"
                cta="Continue setup"
              />
            </div>
            {setupFullyDone && setupCollapsedManual !== false && (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs flex items-center justify-between gap-2">
                <div className="text-emerald-700 dark:text-emerald-400">
                  ✅ One-time setup is complete — steps A–E are hidden by default.
                </div>
                <button
                  type="button"
                  onClick={() => persistSetupCollapsed(false)}
                  className="text-[11px] font-medium underline underline-offset-2 hover:opacity-80"
                >
                  Show setup steps
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {simpleMode ? (
        <Alert>
          <AlertTitle>How this works</AlertTitle>
          <AlertDescription className="text-xs leading-relaxed">
            RazorpayX only lets us look up one employee at a time by their Razorpay ID. So the tool walks through IDs one by one to bring everyone into HRMS.
            <br /><br />
            <b>Step 1</b> — check the RazorpayX connection is healthy. <b>Step 2</b> — import a single test employee so you can verify it looks right. <b>Step 3</b> — import everyone else in one go.
            <br /><br />
            Employees who don't match anyone in HRMS are saved as <b>drafts</b> (inactive) so you can review them before they go live. Dismissed / resigned employees on RazorpayX are automatically skipped.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertTitle>API scope</AlertTitle>
          <AlertDescription className="text-xs">
            RazorpayX Payroll (Opfin) has no bulk list endpoint — only <code>people/view</code> by <code>employee-id</code>.
            The importer walks IDs sequentially with a max-id cap and stops after 30 consecutive misses.
            Bank / work-info fields are logged as field-names only; only <code>first_name, last_name, email, phone, dob, pan_number</code> are written to <code>hr_employees</code>.
            Unmatched Razorpay employees are created as <b>draft</b> (<code>is_active=false</code>).
          </AlertDescription>
        </Alert>
      )}

      {settings && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4" />
              {simpleMode ? "Connection status" : "Integration status"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs uppercase">{simpleMode ? "Import mode" : "Bulk sync"}</div>
              <Badge variant={settings.bulk_sync_unlocked ? "default" : "secondary"}>
                {settings.bulk_sync_unlocked
                  ? (simpleMode ? "Ready for everyone" : "Unlocked")
                  : (simpleMode ? "Test one first" : "Locked (pilot required)")}
              </Badge>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase">{simpleMode ? "Connection checked" : "Creds validated"}</div>
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
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            {simpleMode ? "Step 1 — Check RazorpayX connection" : "Step 1 — Validate credentials"}
          </CardTitle>
          <CardDescription>
            {simpleMode
              ? "Confirms the RazorpayX keys are working. Run this first."
              : <>Confirms <code>auth.id</code> / <code>auth.key</code> against a single <code>people/view</code>.</>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={runValidate} disabled={validating}>
            {validating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {simpleMode ? "Check connection" : "Validate credentials"}
          </Button>
        </CardContent>
      </Card>


      {/* STEP 2 — Pilot */}
      <Card className={canPilot ? "" : "opacity-50 pointer-events-none"}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Play className="h-4 w-4" /> {simpleMode ? "Step 2 — Import one test employee" : "Step 2 — Pilot (one employee)"}</CardTitle>
          <CardDescription>{simpleMode ? "Enter any RazorpayX employee ID (start with 1), preview them, then import. This unlocks the full import." : "Fetch a single Razorpay employee-id, preview the match, then apply. Unlocks bulk import."}</CardDescription>
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

      {!simpleMode && (<>
      {/* Plain-English guide for HR — persistent glossary so jargon in the phase cards has a friendly reference */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            How this page works (read me first)
          </CardTitle>
          <CardDescription>
            This page is a checklist. Steps A → J run in order — finish one before starting the next. Every step uses the same 4-stage safety pattern so you can never accidentally send wrong data to RazorpayX.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border bg-background p-3">
              <div className="font-medium mb-1">1️⃣ Preview</div>
              <div className="text-muted-foreground">See what <em>would</em> change. Nothing is sent yet — totally safe to click.</div>
            </div>
            <div className="rounded-md border bg-background p-3">
              <div className="font-medium mb-1">2️⃣ Test one</div>
              <div className="text-muted-foreground">Send the change for a single employee. You confirm it looks correct on RazorpayX before doing everyone.</div>
            </div>
            <div className="rounded-md border bg-background p-3">
              <div className="font-medium mb-1">3️⃣ Turn on for everyone</div>
              <div className="text-muted-foreground">A one-time switch that unlocks the "send to all" button. Only appears after test one succeeds.</div>
            </div>
            <div className="rounded-md border bg-background p-3">
              <div className="font-medium mb-1">4️⃣ Send to all</div>
              <div className="text-muted-foreground">Applies the confirmed change to every matched employee.</div>
            </div>
          </div>

          <div className="rounded-md border bg-background p-3">
            <div className="font-medium mb-2">Words you'll see, in plain English</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div><b>Dry-run</b> — same as "Preview". Try it fearlessly.</div>
              <div><b>Pilot</b> — same as "Test one employee".</div>
              <div><b>Bulk unlock</b> — the switch that turns on "Send to all".</div>
              <div><b>Apply</b> — actually send the change to RazorpayX.</div>
              <div><b>Baseline</b> — the last copy of the employee we pulled from RazorpayX. If a row says <em>"no baseline"</em>, run <b>Step A</b> first — it fetches fresh data.</div>
              <div><b>Drift</b> — HRMS and RazorpayX disagree on a value. That row is ready to push.</div>
              <div><b>Endpoint / envelope</b> — the exact API name RazorpayX expects (e.g. <code>people:update</code>). You confirm it once per step. Buttons stay <em>locked</em> until you do — that's a safety catch, not a bug.</div>
              <div><b>Locked</b> — the previous safety check hasn't been done yet. Read the hint next to the button and complete that first.</div>
            </div>
          </div>

          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
            <div className="font-medium mb-1">✅ Rule of thumb for HR</div>
            <div className="text-muted-foreground">If a button feels scary, hit <b>Preview / Dry-run</b> first. It <em>never</em> changes data on RazorpayX. Everything that actually sends is clearly labelled <b>Apply</b>, <b>Push</b>, or <b>Send</b> and asks for confirmation.</div>
          </div>
        </CardContent>
      </Card>

      {/* ▼ Payroll Sync Journey — sticky roadmap navigator (two rails: A–E setup, F–J monthly) */}
      <RoadmapJourneyNav steps={stationSteps} railBreakAfter="E" />

      {(() => {
        const setupFullyDone = (SETUP_LETTERS as readonly string[]).every(
          (l) => stationSteps.find((s) => s.letter === l)?.status === "done"
        );
        const collapsed = setupCollapsedManual === null ? setupFullyDone : setupCollapsedManual;
        return (
          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="flex items-center gap-2">
              <div className="h-px w-6 bg-amber-500/40" />
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400">
                One-time setup · Steps A–E
              </div>
            </div>
            {setupFullyDone && (
              <button
                type="button"
                onClick={() => persistSetupCollapsed(!collapsed)}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                {collapsed ? "Show setup steps" : "Hide setup steps"}
              </button>
            )}
          </div>
        );
      })()}
      {(setupCollapsedManual === null
        ? !(SETUP_LETTERS as readonly string[]).every((l) => stationSteps.find((s) => s.letter === l)?.status === "done")
        : !setupCollapsedManual) && (
      <>
      {/* Step A — Deep pull + Completion readiness */}
      <Station letter="A" title="Get latest employee info from RazorpayX" subtitle="Copies employee details into HRMS. Only fills empty fields. Nothing is sent out." status={stationStatus("A")} />
      <Card>

        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><DownloadCloud className="h-4 w-4" /> Step A · Refresh employee details from RazorpayX</CardTitle>
          <CardDescription>
            <b>What this does:</b> re-downloads the latest details of every mapped employee from RazorpayX (name, phone, email, department, bank, etc.) and fills any <em>blank</em> fields in HRMS.
            <br />
            <b>Is it safe?</b> Yes — it never overwrites values that HR has already entered, and it does not send anything to RazorpayX.
            <br />
            <b>When to run:</b> after adding new employees on RazorpayX, or when a later step complains about "no baseline".
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
      <Station letter="B" title="Check what your RazorpayX account can do" subtitle="Tests which actions your account is allowed to use. Only reads — makes no changes." status={stationStatus("B")} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4" /> Step B · Check which RazorpayX features are available</CardTitle>
          <CardDescription>
            <b>What this does:</b> checks which RazorpayX features your account is allowed to use — so we know in advance which of the next steps will work.
            <br />
            <b>Is it safe?</b> Yes — this only <em>reads</em> from RazorpayX. Write features are listed as <b>pending</b> and will never be called on their own.
            <br />
            <b>Tip:</b> if a row shows <b>skipped</b>, it just means RazorpayX has no sample data to check against (e.g. no payroll run yet). That's not an error.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Probe pilot IDs — operator-provided seed IDs so read endpoints can resolve. */}
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div className="text-xs font-medium">Probe pilot IDs (optional)</div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Read endpoints like <code>people:view</code>, <code>attendance:fetch</code> and <code>contractor-payment:get-status</code> need a real ID on this tenant to probe against.
              If left blank, those rows will be marked <span className="font-medium">skipped</span> instead of <span className="font-medium">failed</span>.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground">Pilot Razorpay employee ID</label>
                <Input
                  value={probePilotEmpId}
                  onChange={(e) => setProbePilotEmpId(e.target.value)}
                  placeholder="e.g. 39412345"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Pilot contractor-payment ID</label>
                <Input
                  value={probePilotContractorId}
                  onChange={(e) => setProbePilotContractorId(e.target.value)}
                  placeholder="e.g. 987654"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={saveProbePilots} disabled={savingProbePilots}>
                {savingProbePilots && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save pilot IDs
              </Button>
              {(settings?.probe_pilot_employee_id || settings?.probe_pilot_contractor_id) && (
                <span className="text-[11px] text-muted-foreground">
                  Saved: emp <code>{settings?.probe_pilot_employee_id ?? "—"}</code> · contractor <code>{settings?.probe_pilot_contractor_id ?? "—"}</code>
                </span>
              )}
            </div>
          </div>

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
                        {r.status === "skipped" && <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">skipped</Badge>}
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
      <Station letter="C" title="Update employee name & contact on RazorpayX" subtitle="Send changes to name, phone, email, date of birth and department. Preview, then try one, then send all." status={stationStatus("C")} />
      <Card className={canPilot ? "" : "opacity-50 pointer-events-none"}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><DownloadCloud className="h-4 w-4 rotate-180" /> Step C · Send name & contact updates to RazorpayX</CardTitle>
          <CardDescription>
            <b>What this does:</b> sends employee <em>identity</em> updates you've made in HRMS back to RazorpayX — name, phone, work email, gender, DOB, department, designation, joining date, employment type.
            <br />
            <b>Not included here:</b> bank account and PAN (those live in Step D, on their own switch, because a wrong bank = wrong payout).
            <br />
            <b>Flow:</b> Preview → Test one employee → Turn on for everyone → Send to all.
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
      <Station letter="D" title="Update bank account & PAN on RazorpayX" subtitle="Sent separately for safety. Account numbers stay masked, and every send needs your confirmation. PAN and IFSC are checked first." status={stationStatus("D")} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Step D · Send bank & PAN updates to RazorpayX
          </CardTitle>
          <CardDescription>
            <b>What this does:</b> updates account number, IFSC, bank name, PAN and account holder name on RazorpayX. Kept separate from Step C because a wrong bank means salary lands in the wrong account.
            <br />
            <b>Safety catches:</b> PAN and IFSC formats are validated, empty account numbers are rejected, and every send shows a masked before/after preview that you must confirm — nothing goes out silently.
            <br />
            <b>Status:</b>{" "}
            {settings?.push_bank_pilot_verified_at
              ? <span className="text-emerald-600">Test employee verified ✅</span>
              : <span className="text-amber-600">Test employee not yet run</span>}
            {" · "}
            {settings?.bulk_bank_push_unlocked
              ? <span className="text-emerald-600">"Send to all" is ON</span>
              : <span className="text-muted-foreground">"Send to all" is OFF</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="default" className="border-amber-500/50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-sm">⚠ This one changes where salary lands</AlertTitle>
            <AlertDescription className="text-xs">
              Wrong account number = salary in wrong hands. For that reason this step never sends changes silently — you'll always see a masked preview and have to click "Confirm" for each apply.
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
      <Station letter="E" title="Update salary break-up on RazorpayX" subtitle="Set the salary structure name once, then preview, try one employee, and send to everyone." status={stationStatus("E")} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4" /> Step E · Send salary structures to RazorpayX
          </CardTitle>
          <CardDescription>
            <b>What this does:</b> sends each employee's salary break-up (Basic, HRA, allowances, etc. and the total CTC) from HRMS to RazorpayX.
            <br />
            <b>One-time setup:</b> we need you to confirm the exact API name RazorpayX expects. Until you do that, the "Send" buttons stay locked — Preview / dry-run still works.
            <br />
            <b>Status:</b>{" "}
            {settings?.push_salary_endpoint_verified
              ? <span className="text-emerald-600">API name confirmed ({settings?.push_salary_envelope_key}) ✅</span>
              : <span className="text-amber-600">API name not confirmed yet</span>}
            {" · "}
            {settings?.push_salary_pilot_verified_at
              ? <span className="text-emerald-600">Test employee verified ✅</span>
              : <span className="text-muted-foreground">Test employee not run yet</span>}
            {" · "}
            {settings?.bulk_salary_push_unlocked
              ? <span className="text-emerald-600">"Send to all" is ON</span>
              : <span className="text-muted-foreground">"Send to all" is OFF</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="default" className="border-amber-500/50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-sm">One-time setup needed</AlertTitle>
            <AlertDescription className="text-xs">
              {settings?.push_salary_endpoint_verified
                ? <>API name for salary updates is set up automatically ✅ — no action needed. Preview and "Send pilot" are ready.</>
                : <>API name for salary updates will be set up automatically once you finish <b>Step A</b> (validate connection). Preview works either way.</>}
            </AlertDescription>
          </Alert>

          {!simpleMode && (
            <div className="rounded-md border p-3 bg-muted/20 space-y-2">
              <div className="text-xs font-medium">Override API endpoint (advanced)</div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. people:set-salary"
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
          )}

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
      </>
      )}

      {/* ── Monthly cycle rail (Stations F–J) ── */}
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px w-6 bg-primary/40" />
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
          Monthly cycle · Steps F–J
        </div>
      </div>

      {/* Step F · Send monthly attendance & LOP to RazorpayX (discovery-first: writes blocked until envelope verified) */}
      <Station letter="F" title="Send monthly attendance & unpaid leaves" subtitle="HRMS adds up working days, present days, paid leave and unpaid leave (LOP) — then sends them for salary calculation." status={stationStatus("F")} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4" /> Step F · Send monthly attendance & LOP to RazorpayX
          </CardTitle>
          <CardDescription>
            <b>What this does:</b> for a chosen month, HRMS totals up working days, days present, paid leave, and loss-of-pay (LOP) days from your attendance and approved leaves — then sends those numbers to RazorpayX so payroll uses the correct amounts.
            <br />
            <b>How LOP is calculated:</b> working days minus present days minus paid leave. Sundays and active holidays are excluded from working days. Half-day leaves count as 0.5.
            <br />
            <b>One-time setup:</b> confirm the API name RazorpayX expects (e.g. <code>attendance:update</code>) before "Send" unlocks. Preview works without it.
            <br />
            <b>Status:</b>{" "}
            {settings?.push_attendance_endpoint_verified
              ? <span className="text-emerald-600">API name confirmed ({settings?.push_attendance_envelope_key}) ✅</span>
              : <span className="text-amber-600">API name not confirmed yet</span>}
            {" · "}
            {settings?.push_attendance_pilot_verified_at
              ? <span className="text-emerald-600">Test employee verified{settings?.push_attendance_pilot_period ? ` (${settings.push_attendance_pilot_period})` : ""} ✅</span>
              : <span className="text-muted-foreground">Test employee not run yet</span>}
            {" · "}
            {settings?.bulk_attendance_push_unlocked
              ? <span className="text-emerald-600">"Send to all" is ON</span>
              : <span className="text-muted-foreground">"Send to all" is OFF</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="default" className="border-amber-500/50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-sm">One-time setup needed</AlertTitle>
            <AlertDescription className="text-xs">
              {settings?.push_attendance_endpoint_verified
                ? <>API name for attendance/LOP updates is set up automatically ✅ — no action needed. Preview and "Send pilot" are ready.</>
                : <>API name for attendance/LOP updates will be set up automatically once you finish <b>Step A</b> (validate connection). Preview works either way.</>}
            </AlertDescription>
          </Alert>

          {!simpleMode && (
            <div className="rounded-md border p-3 bg-muted/20 space-y-2">
              <div className="text-xs font-medium">Override API endpoint (advanced)</div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. attendance:modify"
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
          )}

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
                {!!r.tenant_warnings?.length && (
                  <div className="p-2 text-xs bg-amber-500/10 border-b border-amber-500/30 text-amber-700 dark:text-amber-400 space-y-1">
                    {r.tenant_warnings.map((w, i) => (
                      <div key={i} className="flex gap-2"><ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{w}</span></div>
                    ))}
                  </div>
                )}
                <div className="p-2 text-xs bg-muted/50 flex flex-wrap gap-3">
                  <span>Period: <b>{r.period}</b></span>
                  <span>
                    Working days (ERP): <b>
                      {r.summary.working_days_range
                        ? (r.summary.working_days_range.min === r.summary.working_days_range.max
                            ? r.summary.working_days_range.min
                            : `${r.summary.working_days_range.min}–${r.summary.working_days_range.max}`)
                        : (r.summary.working_days ?? "—")}
                    </b>
                  </span>
                  <span>Holidays in month: <b className={r.summary.holidays_in_month === 0 ? "text-amber-600" : ""}>{r.summary.holidays_in_month ?? "—"}</b></span>
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
                      <th className="p-2">WD</th>
                      <th className="p-2">Present</th>
                      <th className="p-2">Paid leave</th>
                      <th className="p-2">Unpaid leave</th>
                      <th className="p-2">LOP</th>
                      <th className="p-2">Formula</th>
                      <th className="p-2">Sanity / Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((row, i) => (
                      <tr key={i} className="border-t align-top">
                        <td className="p-2 font-mono">{row.razorpay_employee_id}</td>
                        <td className="p-2">
                          {row.status === "pushed" && <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">pushed</Badge>}
                          {row.status === "planned" && <Badge variant="outline" className="text-[10px]">planned</Badge>}
                          {row.status === "failed" && <Badge variant="destructive" className="text-[10px]">failed</Badge>}
                          {row.status === "skipped" && <Badge variant="outline" className="text-[10px]">skipped</Badge>}
                          {row.status === "blocked_config_error" && <Badge variant="destructive" className="text-[10px]">config error</Badge>}
                          {row.status === "no_erp_attendance" && <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">no ERP data</Badge>}
                          {row.status === "blocked_period_locked" && <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">period locked</Badge>}
                        </td>
                        <td className="p-2 font-mono">{row.working_days ?? "—"}</td>
                        <td className="p-2 font-mono">{row.present_days ?? "—"}</td>
                        <td className="p-2 font-mono">{row.paid_leave_days ?? "—"}</td>
                        <td className="p-2 font-mono">{row.unpaid_leave_days ?? "—"}</td>
                        <td className="p-2 font-mono">{row.lop_days ?? "—"}</td>
                        <td className="p-2 font-mono text-muted-foreground whitespace-nowrap">{row.formula || "—"}</td>
                        <td className="p-2 max-w-[260px]">
                          {row.status === "blocked_config_error"
                            ? <span className="text-destructive">{row.error}</span>
                            : row.unpaid_matches_lop === false
                              ? <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">unpaid mismatch</Badge>
                              : row.error
                                ? <span className="text-destructive truncate block">{row.error}</span>
                                : <span className="text-muted-foreground">ok</span>}
                        </td>
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
      </>)}

      {/* STEP 3 — Bulk */}



      <Card className={canPilot ? "" : "opacity-50 pointer-events-none"}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4" /> {simpleMode ? "Step 3 — Import everyone" : "Step 3 — Bulk import (range)"}</CardTitle>
          <CardDescription>
            {simpleMode
              ? <>Pick a range of RazorpayX employee IDs (e.g. From <b>1</b> To <b>100</b>). Preview first, then click <b>Apply import</b>. The tool automatically stops after 30 empty IDs in a row and imports up to 1,000 at a time.</>
              : <>Walk <code>start-id</code> → <code>max-id</code>, dry-run first (available pre-pilot), then apply (requires unlock). Stops after 30 consecutive misses; hard cap 1000 IDs per run.</>}
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


          {(dryRun || applied || failedApplyIds.length > 0) && (
            <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
              {(dryRun || applied) && (
                <span>
                  {applied ? "Applied · " : "Dry-run · "}
                  hits: {(applied ?? dryRun)!.summary.hits} ·
                  matches: {(applied ?? dryRun)!.summary.matches} ·
                  new drafts: {(applied ?? dryRun)!.summary.creates} ·
                  misses: {(applied ?? dryRun)!.summary.misses}
                  {(applied ?? dryRun)!.summary.stopped && " · stopped early"}
                </span>
              )}
              {failedApplyIds.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-destructive/40 text-destructive hover:bg-destructive/10"
                  disabled={retryingFailed || !canBulk}
                  onClick={runRetryFailed}
                  title={`IDs: ${failedApplyIds.slice(0, 10).join(", ")}${failedApplyIds.length > 10 ? "…" : ""}${!applied && historicalFailedIds.length > 0 ? " (from earlier runs)" : ""}`}
                >
                  {retryingFailed ? "Retrying…" : `Retry failed IDs (${failedApplyIds.length})`}
                </Button>
              )}
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
                    <tr key={i} className={`border-t ${r.error ? "bg-destructive/5" : ""}`}>
                      <td className="p-2 font-mono">{r.employee_id ?? "—"}</td>
                      <td className="p-2">
                        {r.status === "hit" && <Badge variant="default" className="text-[10px]">hit</Badge>}
                        {r.status === "miss" && <Badge variant={r.error ? "destructive" : "outline"} className="text-[10px]">{r.error ? "failed" : "miss"} {r.http_status}</Badge>}
                        {r.status === "stopped" && <Badge variant="secondary" className="text-[10px]">stopped</Badge>}
                      </td>
                      <td className="p-2">
                        {r.name ?? r.note ?? "—"}
                        {r.error && (
                          <div className="mt-0.5 text-[10px] text-destructive/90 font-mono line-clamp-2" title={r.error}>
                            {r.error}
                          </div>
                        )}
                      </td>
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

      {!simpleMode && (<>
        <Station letter="G" title="Run this month's salary" subtitle="Calculate → practice run → try one employee → run for everyone. HRMS attendance decides unpaid days." status={stationStatus("G")} />
        <PayrollRunSection invoke={invoke} />
        <Station letter="H" title="Check that salaries were paid (read-only)" subtitle="Compares each payout in RazorpayX with the record in HRMS. Never changes any payment." status={stationStatus("H")} />
        <PayoutReconciliationSection invoke={invoke} />
        <Station letter="I" title="Download payslips & tax papers" subtitle="Get payslips, Form 16 and TDS statements once RazorpayX has prepared them." status={stationStatus("I")} />
        <PayslipTaxDocSection invoke={invoke} />
        <Station letter="J" title="Match with accounting books" subtitle="Compare salary expense with your accounting ledger and bank statement, and flag anything that doesn't match." status={stationStatus("J")} />

        <LedgerReconciliationSection invoke={invoke} />
      </>)}
      </>
      )}
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

// ---------------------------------------------------------------------------
// Phase 7 — Payroll-run orchestration
// Sits on top of Phase 6 attendance/LOP. Compute → dry-run → pilot → bulk.
// Every write is server-gated on push_payroll_endpoint_verified.
// ---------------------------------------------------------------------------
interface PayrollLine {
  id: string;
  employee_id: string;
  gross_earnings: number;
  lop_amount: number;
  other_deductions: number;
  loan_emi: number;
  net_pay: number;
  skip_label: string | null;
  push_status: string;
  source_snapshot?: any;
}
interface PayrollRun {
  id: string;
  period_month: string;
  status: string;
  totals_gross: number | null;
  totals_deductions: number | null;
  totals_net: number | null;
  headcount_included: number | null;
  headcount_skipped: number | null;
}

function PayrollRunSection({ invoke }: { invoke: <T,>(body: object) => Promise<T> }) {
  const [period, setPeriod] = useState<string>(() => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const [envelopeKey, setEnvelopeKey] = useState("");
  const [settings, setSettings] = useState<any>(null);
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [pilotIds, setPilotIds] = useState("");
  const [recallReason, setRecallReason] = useState("");

  const reload = async () => {
    const { data: s } = await supabase.from("hr_razorpay_settings")
      .select("push_payroll_endpoint_verified,push_payroll_envelope_key,push_payroll_envelope_verified_at,push_payroll_pilot_unlocked,push_payroll_bulk_unlocked")
      .maybeSingle();
    setSettings(s);
    const iso = `${period}-01`;
    const { data: r } = await supabase.from("hr_razorpay_payroll_runs")
      .select("*").eq("period_month", iso).maybeSingle();
    setRun(r as PayrollRun | null);
    if (r) {
      const { data: ls } = await supabase.from("hr_razorpay_payroll_run_lines")
        .select("*").eq("run_id", (r as any).id).order("skip_label", { ascending: true });
      setLines((ls || []) as PayrollLine[]);
    } else {
      setLines([]);
    }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [period]);

  const call = async (action: string, body: any = {}) => {
    setBusy(action);
    try {
      const d = await invoke<any>({ action, period_month: period, ...body });
      toast({ title: `${action} · ok`, description: d?.summary
        ? `pushed ${d.summary.pushed} · failed ${d.summary.failed}`
        : d?.totals ? `net ₹${Math.round(d.totals.net).toLocaleString()}` : "done" });
      await reload();
    } catch (e: any) {
      toast({ title: `${action} failed`, description: e?.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const envelopeVerified = !!settings?.push_payroll_endpoint_verified;
  const pilotUnlocked = !!settings?.push_payroll_pilot_unlocked;
  const bulkUnlocked = !!settings?.push_payroll_bulk_unlocked;
  const locked = run?.status === "locked";
  const canDry = !!run && envelopeVerified && !locked;
  const canPilot = canDry && pilotUnlocked && (run?.status === "dry_run_ok" || run?.status === "pilot_applied");
  const canBulk = canDry && bulkUnlocked && (run?.status === "dry_run_ok" || run?.status === "pilot_applied");

  const skips = lines.filter((l) => l.skip_label);
  const pushable = lines.filter((l) => !l.skip_label);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-4 w-4" /> Step G · Run monthly payroll
        </CardTitle>
        <CardDescription>
          <b>What this does:</b> calculates the full monthly payroll (gross, deductions, net pay) using HRMS as the source of truth, then pushes it to RazorpayX for actual disbursement.
          <br />
          <b>Flow:</b> Compute → Preview → Test one employee → Send to all. The "Send" buttons stay locked until the API name is confirmed (same one-time setup as Step E/F).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Period (YYYY-MM)</label>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="block h-9 rounded-md border bg-background px-2 text-sm"
            />
          </div>
          <Button size="sm" onClick={() => call("compute_payroll_run")} disabled={!!busy}>
            {busy === "compute_payroll_run" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Compute
          </Button>
          <div className="text-xs text-muted-foreground">
            Envelope: {envelopeVerified
              ? <Badge variant="default">verified · {settings?.push_payroll_envelope_key}</Badge>
              : <Badge variant="outline">not verified</Badge>}
          </div>
        </div>

        {run && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
            <div className="rounded-md border px-2 py-1.5 border-border bg-muted/40">

              <div className="text-[10px] uppercase tracking-wide opacity-70">Status</div>
              <div className="text-base font-semibold">{run.status}</div>
            </div>
            <div className="rounded-md border px-2 py-1.5 border-border bg-muted/40">
              <div className="text-[10px] uppercase tracking-wide opacity-70">Included</div>
              <div className="text-base font-semibold tabular-nums">{run.headcount_included ?? 0}</div>
            </div>
            <div className="rounded-md border px-2 py-1.5 border-border bg-muted/40">
              <div className="text-[10px] uppercase tracking-wide opacity-70">Skipped</div>
              <div className="text-base font-semibold tabular-nums">{run.headcount_skipped ?? 0}</div>
            </div>
            <div className="rounded-md border px-2 py-1.5 border-border bg-muted/40">
              <div className="text-[10px] uppercase tracking-wide opacity-70">Gross</div>
              <div className="text-base font-semibold tabular-nums">₹{Math.round(run.totals_gross ?? 0).toLocaleString()}</div>
            </div>
            <div className="rounded-md border px-2 py-1.5 border-border bg-muted/40">
              <div className="text-[10px] uppercase tracking-wide opacity-70">Net</div>
              <div className="text-base font-semibold tabular-nums">₹{Math.round(run.totals_net ?? 0).toLocaleString()}</div>
            </div>
          </div>
        )}

        {/* Envelope verification */}
        <div className="rounded-md border p-3 space-y-2">
          <div className="text-sm font-medium flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Payroll envelope
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <input
              placeholder="e.g. payroll:run"
              value={envelopeKey}
              onChange={(e) => setEnvelopeKey(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm flex-1 min-w-[200px]"
            />
            <Button size="sm" variant="outline"
              onClick={() => call("record_payroll_envelope_verified", { envelope_key: envelopeKey, verified: true })}
              disabled={!!busy || !envelopeKey.trim()}
            >Record verified</Button>
            <Button size="sm" variant="ghost"
              onClick={() => call("record_payroll_envelope_verified", { verified: false })}
              disabled={!!busy || !envelopeVerified}
            >Revoke</Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline"
              onClick={() => call("unlock_bulk_payroll_push", { scope: "pilot" })}
              disabled={!!busy || !envelopeVerified || pilotUnlocked}
            >Unlock pilot</Button>
            <Button size="sm" variant="outline"
              onClick={() => call("unlock_bulk_payroll_push", { scope: "bulk" })}
              disabled={!!busy || !envelopeVerified || bulkUnlocked}
            >Unlock bulk</Button>
            <Badge variant={pilotUnlocked ? "default" : "outline"}>pilot {pilotUnlocked ? "unlocked" : "locked"}</Badge>
            <Badge variant={bulkUnlocked ? "default" : "outline"}>bulk {bulkUnlocked ? "unlocked" : "locked"}</Badge>
          </div>
        </div>

        {/* Dry-run + apply */}
        {run && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="text-sm font-medium">Push controls</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => call("dry_run_payroll_run")} disabled={!!busy || !canDry}>Dry-run</Button>
              <input
                placeholder="pilot: employee UUIDs, comma-separated (1–3)"
                value={pilotIds}
                onChange={(e) => setPilotIds(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm flex-1 min-w-[280px]"
              />
              <Button size="sm" variant="secondary"
                onClick={() => {
                  const ids = pilotIds.split(",").map((s) => s.trim()).filter(Boolean);
                  if (ids.length < 1 || ids.length > 3) {
                    toast({ title: "Pilot needs 1–3 employee IDs", variant: "destructive" });
                    return;
                  }
                  if (!confirm(`Push pilot for ${ids.length} employee(s)? This POSTs to Razorpay.`)) return;
                  call("apply_payroll_pilot", { employee_ids: ids });
                }}
                disabled={!!busy || !canPilot}
              >Apply pilot</Button>
              <Button size="sm" variant="destructive"
                onClick={() => {
                  if (!confirm("Bulk-apply payroll for ALL non-skipped employees? This POSTs each line to Razorpay.")) return;
                  call("apply_payroll_bulk");
                }}
                disabled={!!busy || !canBulk}
              >Apply bulk</Button>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button size="sm" variant="outline"
                onClick={() => confirm("Lock this period against further changes?") && call("lock_payroll_period")}
                disabled={!!busy || !run || locked || (run.status !== "pilot_applied" && run.status !== "bulk_applied")}
              >Lock period</Button>
              <input
                placeholder="Recall reason (min 12 chars)"
                value={recallReason}
                onChange={(e) => setRecallReason(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm flex-1 min-w-[240px]"
              />
              <Button size="sm" variant="ghost"
                onClick={() => {
                  if (recallReason.trim().length < 12) {
                    toast({ title: "Recall reason must be ≥12 characters", variant: "destructive" });
                    return;
                  }
                  if (!confirm("File an audited recall for this period?")) return;
                  call("recall_payroll_period", { reason: recallReason });
                }}
                disabled={!!busy || !run}
              >Recall</Button>
            </div>
          </div>
        )}

        {/* Lines table */}
        {lines.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm">
              Pushable: <strong>{pushable.length}</strong> · Skipped: <strong>{skips.length}</strong>
            </div>
            <div className="rounded-md border overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2">Employee</th>
                    <th className="p-2">Gross</th>
                    <th className="p-2">LOP</th>
                    <th className="p-2">EMI</th>
                    <th className="p-2">Other −</th>
                    <th className="p-2">Net</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.slice(0, 300).map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="p-2 font-mono">{l.employee_id.slice(0, 8)}</td>
                      <td className="p-2 tabular-nums">₹{Math.round(l.gross_earnings).toLocaleString()}</td>
                      <td className="p-2 tabular-nums">₹{Math.round(l.lop_amount).toLocaleString()}</td>
                      <td className="p-2 tabular-nums">₹{Math.round(l.loan_emi).toLocaleString()}</td>
                      <td className="p-2 tabular-nums">₹{Math.round(l.other_deductions).toLocaleString()}</td>
                      <td className="p-2 tabular-nums font-semibold">₹{Math.round(l.net_pay).toLocaleString()}</td>
                      <td className="p-2">
                        {l.skip_label
                          ? <Badge variant="outline" className="text-[10px]">{l.skip_label}</Badge>
                          : <Badge variant={l.push_status === "applied" ? "default" : "secondary"} className="text-[10px]">{l.push_status}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Phase 8 — Payout & Disbursement sync
// Pulls actuals from Razorpay for a period and reconciles them against the
// Phase 7 payroll_run_lines. Read-only against Razorpay; envelope-gated.
// ---------------------------------------------------------------------------
interface PayoutRow {
  id: string;
  run_id: string | null;
  period_month: string;
  razorpay_employee_id: string;
  hr_employee_id: string | null;
  payout_status: string | null;
  paid_amount: number | null;
  expected_amount: number | null;
  variance: number | null;
  utr: string | null;
  paid_at: string | null;
  reconciled_at: string | null;
}

function PayoutReconciliationSection({ invoke }: { invoke: <T,>(body: object) => Promise<T> }) {
  const [period, setPeriod] = useState<string>(() => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const [envelopeKey, setEnvelopeKey] = useState("");
  const [probeType, setProbeType] = useState("payouts");
  const [probeSubType, setProbeSubType] = useState("view");
  const [settings, setSettings] = useState<any>(null);
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<any>(null);
  const [filter, setFilter] = useState<"all" | "mismatched" | "failed" | "unreconciled">("all");

  const reload = async () => {
    const { data: s } = await supabase.from("hr_razorpay_settings")
      .select("pull_payouts_endpoint_verified,pull_payouts_envelope_key,pull_payouts_envelope_verified_at,last_payouts_pull_at")
      .maybeSingle();
    setSettings(s);
    const iso = `${period}-01`;
    const { data: r } = await supabase.from("hr_razorpay_payout_records")
      .select("id,run_id,period_month,razorpay_employee_id,hr_employee_id,payout_status,paid_amount,expected_amount,variance,utr,paid_at,reconciled_at")
      .eq("period_month", iso).order("variance", { ascending: false, nullsFirst: false });
    setRows((r || []) as PayoutRow[]);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [period]);

  const call = async (action: string, body: any = {}) => {
    setBusy(action);
    try {
      const d = await invoke<any>({ action, ...body });
      if (action === "probe_payouts_endpoint") {
        setProbeResult(d);
        toast({
          title: d?.ok ? `Probe ok · HTTP ${d.http_status}` : `Probe failed · HTTP ${d?.http_status ?? 0}`,
          variant: d?.ok ? "default" : "destructive",
        });
      } else if (action === "pull_payouts_for_period") {
        const s = d?.summary;
        toast({
          title: "Pull complete",
          description: s ? `total ${s.total} · paid ${s.paid} · mismatched ${s.mismatched} · failed ${s.failed}` : "done",
        });
      } else {
        toast({ title: `${action} · ok` });
      }
      await reload();
    } catch (e: any) {
      toast({ title: `${action} failed`, description: e?.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const verified = !!settings?.pull_payouts_endpoint_verified;
  const shown = rows.filter((r) => {
    if (filter === "mismatched") return r.variance != null && Math.abs(r.variance) >= 0.5;
    if (filter === "failed") return /fail|reject|bounce/i.test(r.payout_status || "");
    if (filter === "unreconciled") return !r.reconciled_at;
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DownloadCloud className="h-4 w-4" /> Step H · Match payouts (read-only)
        </CardTitle>
        <CardDescription>
          <b>What this does:</b> pulls the actual salary payouts RazorpayX made for the chosen month and compares them against what HRMS expected to pay. Flags any mismatches (missing, extra, or wrong amount).
          <br />
          <b>Is it safe?</b> Yes — this step only reads from RazorpayX. Nothing is sent or changed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Period (YYYY-MM)</label>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="block h-9 rounded-md border bg-background px-2 text-sm"
            />
          </div>
          <Button size="sm"
            onClick={() => call("pull_payouts_for_period", { period_month: period })}
            disabled={!!busy || !verified}
          >
            {busy === "pull_payouts_for_period" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Pull actuals
          </Button>
          <div className="text-xs text-muted-foreground">
            Envelope: {verified
              ? <Badge variant="default">verified · {settings?.pull_payouts_envelope_key}</Badge>
              : <Badge variant="outline">not verified</Badge>}
            {settings?.last_payouts_pull_at && (
              <span className="ml-2">Last pull: {new Date(settings.last_payouts_pull_at).toLocaleString()}</span>
            )}
          </div>
        </div>

        {/* Probe + verify */}
        <div className="rounded-md border p-3 space-y-2">
          <div className="text-sm font-medium flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Discovery
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <input placeholder="type (e.g. payouts)"
              value={probeType} onChange={(e) => setProbeType(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm w-40" />
            <input placeholder="sub-type (e.g. view)"
              value={probeSubType} onChange={(e) => setProbeSubType(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm w-40" />
            <Button size="sm" variant="outline"
              onClick={() => call("probe_payouts_endpoint", { type: probeType, sub_type: probeSubType, period_month: period })}
              disabled={!!busy}>Probe</Button>
            <input placeholder="verified envelope key (e.g. payouts:view)"
              value={envelopeKey} onChange={(e) => setEnvelopeKey(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm flex-1 min-w-[220px]" />
            <Button size="sm" variant="outline"
              onClick={() => call("record_payouts_envelope_verified", { envelope_key: envelopeKey, verified: true })}
              disabled={!!busy || !envelopeKey.trim()}>Record verified</Button>
            <Button size="sm" variant="ghost"
              onClick={() => call("record_payouts_envelope_verified", { verified: false })}
              disabled={!!busy || !verified}>Revoke</Button>
          </div>
          {probeResult && (
            <pre className="text-[10px] bg-muted/40 p-2 rounded max-h-48 overflow-auto">
              {JSON.stringify(probeResult, null, 2)}
            </pre>
          )}
        </div>

        {rows.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="text-sm">Records: <strong>{rows.length}</strong></div>
              <div className="ml-auto flex gap-1">
                {(["all", "mismatched", "failed", "unreconciled"] as const).map((f) => (
                  <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                    {f}
                  </Button>
                ))}
              </div>
            </div>
            <div className="rounded-md border overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2">RP ID</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Expected</th>
                    <th className="p-2">Paid</th>
                    <th className="p-2">Variance</th>
                    <th className="p-2">UTR</th>
                    <th className="p-2">Paid at</th>
                    <th className="p-2">Reconciled</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, 500).map((r) => {
                    const bad = r.variance != null && Math.abs(r.variance) >= 0.5;
                    const failed = /fail|reject|bounce/i.test(r.payout_status || "");
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="p-2 font-mono">{r.razorpay_employee_id}</td>
                        <td className="p-2">
                          <Badge variant={failed ? "destructive" : /paid|success|processed/i.test(r.payout_status || "") ? "default" : "outline"} className="text-[10px]">
                            {r.payout_status || "—"}
                          </Badge>
                        </td>
                        <td className="p-2 tabular-nums">{r.expected_amount != null ? `₹${Math.round(r.expected_amount).toLocaleString()}` : "—"}</td>
                        <td className="p-2 tabular-nums">{r.paid_amount != null ? `₹${Math.round(r.paid_amount).toLocaleString()}` : "—"}</td>
                        <td className={`p-2 tabular-nums ${bad ? "text-destructive font-semibold" : ""}`}>
                          {r.variance != null ? `₹${Math.round(r.variance).toLocaleString()}` : "—"}
                        </td>
                        <td className="p-2 font-mono">{r.utr || "—"}</td>
                        <td className="p-2">{r.paid_at ? new Date(r.paid_at).toLocaleDateString() : "—"}</td>
                        <td className="p-2">
                          {r.reconciled_at
                            ? <Badge variant="default" className="text-[10px]">✓</Badge>
                            : <Button size="sm" variant="ghost" className="h-6 text-[10px]"
                                onClick={() => call("reconcile_payout", { id: r.id })}
                                disabled={!!busy}>Reconcile</Button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Phase 9 — Payslip & Tax-document ingestion
// Pulls per-employee payslips (monthly) and yearly tax documents (Form 16 etc.)
// from Razorpay. Read-only against Razorpay; envelope-gated.
// ---------------------------------------------------------------------------
interface PayslipRow {
  id: string;
  period_month: string;
  razorpay_employee_id: string;
  hr_employee_id: string | null;
  gross_earnings: number | null;
  total_deductions: number | null;
  net_pay: number | null;
  tds_amount: number | null;
  expected_net: number | null;
  variance: number | null;
  pdf_url: string | null;
  razorpay_payslip_id: string | null;
  pulled_at: string;
}
interface TaxDocRow {
  id: string;
  fiscal_year: string;
  doc_type: string;
  razorpay_employee_id: string;
  hr_employee_id: string | null;
  razorpay_document_id: string | null;
  pdf_url: string | null;
  gross_annual: number | null;
  total_tds: number | null;
  pulled_at: string;
}

function PayslipTaxDocSection({ invoke }: { invoke: <T,>(body: object) => Promise<T> }) {
  const [period, setPeriod] = useState<string>(() => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const [fiscalYear, setFiscalYear] = useState<string>(() => {
    const d = new Date();
    const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  });
  const [docType, setDocType] = useState("form16");
  const [settings, setSettings] = useState<any>(null);
  const [payslips, setPayslips] = useState<PayslipRow[]>([]);
  const [taxDocs, setTaxDocs] = useState<TaxDocRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Payslip envelope discovery
  const [psProbeType, setPsProbeType] = useState("payslip");
  const [psProbeSub, setPsProbeSub] = useState("view");
  const [psEnvelope, setPsEnvelope] = useState("");
  const [psProbeResult, setPsProbeResult] = useState<any>(null);

  // Tax-doc envelope discovery
  const [tdProbeType, setTdProbeType] = useState("form16");
  const [tdProbeSub, setTdProbeSub] = useState("view");
  const [tdEnvelope, setTdEnvelope] = useState("");
  const [tdProbeResult, setTdProbeResult] = useState<any>(null);

  const [filter, setFilter] = useState<"all" | "mismatched" | "no_pdf">("all");

  const reload = async () => {
    const { data: s } = await supabase.from("hr_razorpay_settings")
      .select("pull_payslips_endpoint_verified,pull_payslips_envelope_key,last_payslips_pull_at,pull_taxdocs_endpoint_verified,pull_taxdocs_envelope_key,last_taxdocs_pull_at")
      .maybeSingle();
    setSettings(s);
    const iso = `${period}-01`;
    const { data: ps } = await (supabase.from("hr_razorpay_payslip_records") as any)
      .select("id,period_month,razorpay_employee_id,hr_employee_id,gross_earnings,total_deductions,net_pay,tds_amount,expected_net,variance,pdf_url,razorpay_payslip_id,pulled_at")
      .eq("period_month", iso)
      .order("variance", { ascending: false, nullsFirst: false });
    setPayslips((ps || []) as PayslipRow[]);
    const { data: td } = await (supabase.from("hr_razorpay_taxdoc_records") as any)
      .select("id,fiscal_year,doc_type,razorpay_employee_id,hr_employee_id,razorpay_document_id,pdf_url,gross_annual,total_tds,pulled_at")
      .eq("fiscal_year", fiscalYear)
      .eq("doc_type", docType);
    setTaxDocs((td || []) as TaxDocRow[]);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [period, fiscalYear, docType]);

  const call = async (action: string, body: any = {}) => {
    setBusy(action);
    try {
      const d = await invoke<any>({ action, ...body });
      if (action === "probe_payslips_endpoint") {
        setPsProbeResult(d);
        toast({ title: d?.ok ? `Probe ok · HTTP ${d.http_status}` : `Probe failed · HTTP ${d?.http_status ?? 0}`, variant: d?.ok ? "default" : "destructive" });
      } else if (action === "probe_taxdocs_endpoint") {
        setTdProbeResult(d);
        toast({ title: d?.ok ? `Probe ok · HTTP ${d.http_status}` : `Probe failed · HTTP ${d?.http_status ?? 0}`, variant: d?.ok ? "default" : "destructive" });
      } else if (action === "pull_payslips_for_period") {
        const s = d?.summary;
        toast({ title: "Payslip pull complete", description: s ? `total ${s.total} · with PDF ${s.withPdf} · mismatched ${s.mismatched}` : "done" });
      } else if (action === "pull_taxdocs_for_year") {
        const s = d?.summary;
        toast({ title: "Tax-doc pull complete", description: s ? `total ${s.total} · with PDF ${s.withPdf}` : "done" });
      } else {
        toast({ title: `${action} · ok` });
      }
      await reload();
    } catch (e: any) {
      toast({ title: `${action} failed`, description: e?.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const psVerified = !!settings?.pull_payslips_endpoint_verified;
  const tdVerified = !!settings?.pull_taxdocs_endpoint_verified;

  const shownPs = payslips.filter((r) => {
    if (filter === "mismatched") return r.variance != null && Math.abs(r.variance) >= 0.5;
    if (filter === "no_pdf") return !r.pdf_url;
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DownloadCloud className="h-4 w-4" /> Step I · Download payslips & tax documents
        </CardTitle>
        <CardDescription>
          <b>What this does:</b> downloads monthly payslips and yearly tax documents (Form 16, Form 12BA) that RazorpayX has generated, and saves them into HRMS for employees to access.
          <br />
          <b>Is it safe?</b> Yes — read-only. Payslips and tax documents each have their own switch, so you can enable one without the other.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* --------------------------- Payslips --------------------------- */}
        <div className="space-y-3">
          <div className="text-sm font-semibold">Monthly payslips</div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Period (YYYY-MM)</label>
              <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
                className="block h-9 rounded-md border bg-background px-2 text-sm" />
            </div>
            <Button size="sm"
              onClick={() => call("pull_payslips_for_period", { period_month: period })}
              disabled={!!busy || !psVerified}>
              {busy === "pull_payslips_for_period" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Pull payslips
            </Button>
            <div className="text-xs text-muted-foreground">
              Envelope: {psVerified
                ? <Badge variant="default">verified · {settings?.pull_payslips_envelope_key}</Badge>
                : <Badge variant="outline">not verified</Badge>}
              {settings?.last_payslips_pull_at && (
                <span className="ml-2">Last pull: {new Date(settings.last_payslips_pull_at).toLocaleString()}</span>
              )}
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <div className="text-sm font-medium flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Payslip envelope discovery</div>
            <div className="flex flex-wrap items-end gap-2">
              <input placeholder="type (e.g. payslip)" value={psProbeType} onChange={(e) => setPsProbeType(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm w-40" />
              <input placeholder="sub-type (e.g. view)" value={psProbeSub} onChange={(e) => setPsProbeSub(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm w-40" />
              <Button size="sm" variant="outline"
                onClick={() => call("probe_payslips_endpoint", { type: psProbeType, sub_type: psProbeSub, period_month: period })}
                disabled={!!busy}>Probe</Button>
              <input placeholder="verified envelope key (e.g. payslip:view)" value={psEnvelope}
                onChange={(e) => setPsEnvelope(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm flex-1 min-w-[220px]" />
              <Button size="sm" variant="outline"
                onClick={() => call("record_payslips_envelope_verified", { envelope_key: psEnvelope, verified: true })}
                disabled={!!busy || !psEnvelope.trim()}>Record verified</Button>
              <Button size="sm" variant="ghost"
                onClick={() => call("record_payslips_envelope_verified", { verified: false })}
                disabled={!!busy || !psVerified}>Revoke</Button>
            </div>
            {psProbeResult && (
              <pre className="text-[10px] bg-muted/40 p-2 rounded max-h-48 overflow-auto">
                {JSON.stringify(psProbeResult, null, 2)}
              </pre>
            )}
          </div>

          {payslips.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="text-sm">Payslips: <strong>{payslips.length}</strong></div>
                <div className="ml-auto flex gap-1">
                  {(["all", "mismatched", "no_pdf"] as const).map((f) => (
                    <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                      {f.replace("_", " ")}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="rounded-md border overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left">
                      <th className="p-2">RP ID</th>
                      <th className="p-2">Gross</th>
                      <th className="p-2">Deductions</th>
                      <th className="p-2">Net</th>
                      <th className="p-2">TDS</th>
                      <th className="p-2">Expected</th>
                      <th className="p-2">Variance</th>
                      <th className="p-2">PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownPs.slice(0, 500).map((r) => {
                      const bad = r.variance != null && Math.abs(r.variance) >= 0.5;
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="p-2 font-mono">{r.razorpay_employee_id}</td>
                          <td className="p-2 tabular-nums">{r.gross_earnings != null ? `₹${Math.round(r.gross_earnings).toLocaleString()}` : "—"}</td>
                          <td className="p-2 tabular-nums">{r.total_deductions != null ? `₹${Math.round(r.total_deductions).toLocaleString()}` : "—"}</td>
                          <td className="p-2 tabular-nums">{r.net_pay != null ? `₹${Math.round(r.net_pay).toLocaleString()}` : "—"}</td>
                          <td className="p-2 tabular-nums">{r.tds_amount != null ? `₹${Math.round(r.tds_amount).toLocaleString()}` : "—"}</td>
                          <td className="p-2 tabular-nums">{r.expected_net != null ? `₹${Math.round(r.expected_net).toLocaleString()}` : "—"}</td>
                          <td className={`p-2 tabular-nums ${bad ? "text-destructive font-semibold" : ""}`}>
                            {r.variance != null ? `₹${Math.round(r.variance).toLocaleString()}` : "—"}
                          </td>
                          <td className="p-2">
                            {r.pdf_url
                              ? <a href={r.pdf_url} target="_blank" rel="noreferrer" className="text-primary underline">open</a>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* --------------------------- Tax documents ---------------------- */}
        <div className="space-y-3 pt-2 border-t">
          <div className="text-sm font-semibold">Yearly tax documents</div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Fiscal year (YYYY-YY)</label>
              <input type="text" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)}
                placeholder="2025-26"
                className="block h-9 rounded-md border bg-background px-2 text-sm w-32" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Document type</label>
              <select value={docType} onChange={(e) => setDocType(e.target.value)}
                className="block h-9 rounded-md border bg-background px-2 text-sm">
                <option value="form16">Form 16</option>
                <option value="form12ba">Form 12BA</option>
                <option value="tds_report">TDS report</option>
                <option value="other">Other</option>
              </select>
            </div>
            <Button size="sm"
              onClick={() => call("pull_taxdocs_for_year", { fiscal_year: fiscalYear, doc_type: docType })}
              disabled={!!busy || !tdVerified}>
              {busy === "pull_taxdocs_for_year" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Pull tax docs
            </Button>
            <div className="text-xs text-muted-foreground">
              Envelope: {tdVerified
                ? <Badge variant="default">verified · {settings?.pull_taxdocs_envelope_key}</Badge>
                : <Badge variant="outline">not verified</Badge>}
              {settings?.last_taxdocs_pull_at && (
                <span className="ml-2">Last pull: {new Date(settings.last_taxdocs_pull_at).toLocaleString()}</span>
              )}
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <div className="text-sm font-medium flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Tax-doc envelope discovery</div>
            <div className="flex flex-wrap items-end gap-2">
              <input placeholder="type (e.g. form16)" value={tdProbeType} onChange={(e) => setTdProbeType(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm w-40" />
              <input placeholder="sub-type (e.g. view)" value={tdProbeSub} onChange={(e) => setTdProbeSub(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm w-40" />
              <Button size="sm" variant="outline"
                onClick={() => call("probe_taxdocs_endpoint", { type: tdProbeType, sub_type: tdProbeSub, fiscal_year: fiscalYear })}
                disabled={!!busy}>Probe</Button>
              <input placeholder="verified envelope key (e.g. form16:view)" value={tdEnvelope}
                onChange={(e) => setTdEnvelope(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm flex-1 min-w-[220px]" />
              <Button size="sm" variant="outline"
                onClick={() => call("record_taxdocs_envelope_verified", { envelope_key: tdEnvelope, verified: true })}
                disabled={!!busy || !tdEnvelope.trim()}>Record verified</Button>
              <Button size="sm" variant="ghost"
                onClick={() => call("record_taxdocs_envelope_verified", { verified: false })}
                disabled={!!busy || !tdVerified}>Revoke</Button>
            </div>
            {tdProbeResult && (
              <pre className="text-[10px] bg-muted/40 p-2 rounded max-h-48 overflow-auto">
                {JSON.stringify(tdProbeResult, null, 2)}
              </pre>
            )}
          </div>

          {taxDocs.length > 0 && (
            <div className="rounded-md border overflow-x-auto max-h-[360px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2">RP ID</th>
                    <th className="p-2">Doc ID</th>
                    <th className="p-2">Gross annual</th>
                    <th className="p-2">Total TDS</th>
                    <th className="p-2">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {taxDocs.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2 font-mono">{r.razorpay_employee_id}</td>
                      <td className="p-2 font-mono">{r.razorpay_document_id || "—"}</td>
                      <td className="p-2 tabular-nums">{r.gross_annual != null ? `₹${Math.round(r.gross_annual).toLocaleString()}` : "—"}</td>
                      <td className="p-2 tabular-nums">{r.total_tds != null ? `₹${Math.round(r.total_tds).toLocaleString()}` : "—"}</td>
                      <td className="p-2">
                        {r.pdf_url
                          ? <a href={r.pdf_url} target="_blank" rel="noreferrer" className="text-primary underline">open</a>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Phase 10 — Ledger Reconciliation
// Cross-references hr_razorpay_payout_records against bank_transactions.
// Draft → reviewed → signed_off, with reopen for audited re-work.
// ============================================================
interface PayoutLedgerRow {
  id: string;
  hr_employee_id: string | null;
  razorpay_employee_id: string | null;
  paid_amount: number | null;
  utr: string | null;
  paid_at: string | null;
  match?: {
    match_method: string;
    matched_amount: number | null;
    variance: number | null;
    note: string | null;
    matched_by_name: string | null;
    bank_transaction_id: string | null;
  } | null;
}
interface LedgerPeriodRow {
  status: "draft" | "reviewed" | "signed_off" | "reopened";
  total_paid: number | null;
  total_matched: number | null;
  total_unmatched: number | null;
  total_waived: number | null;
  signed_off_by_name: string | null;
  signed_off_at: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  reopen_reason: string | null;
}

function LedgerReconciliationSection({ invoke }: { invoke: <T,>(body: object) => Promise<T> }) {
  const [periodMonth, setPeriodMonth] = useState<string>(() => {
    const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<PayoutLedgerRow[]>([]);
  const [period, setPeriod] = useState<LedgerPeriodRow | null>(null);
  const periodISO = `${periodMonth}-01`;
  const locked = period?.status === "signed_off";

  async function loadPeriod() {
    const { data: p } = await supabase.from("hr_razorpay_ledger_periods")
      .select("status,total_paid,total_matched,total_unmatched,total_waived,signed_off_by_name,signed_off_at,reviewed_by_name,reviewed_at,reopen_reason")
      .eq("period_month", periodISO).maybeSingle();
    setPeriod((p as unknown as LedgerPeriodRow) || null);
  }
  async function loadRows() {
    const { data: payouts } = await supabase.from("hr_razorpay_payout_records")
      .select("id,hr_employee_id,razorpay_employee_id,paid_amount,utr,paid_at")
      .eq("period_month", periodISO)
      .order("paid_at", { ascending: true });
    const { data: matches } = await supabase.from("hr_razorpay_ledger_matches")
      .select("payout_record_id,match_method,matched_amount,variance,note,matched_by_name,bank_transaction_id")
      .eq("period_month", periodISO);
    const mapByPayout = new Map<string, PayoutLedgerRow["match"]>();
    for (const m of (matches || []) as { payout_record_id: string; match_method: string; matched_amount: number | null; variance: number | null; note: string | null; matched_by_name: string | null; bank_transaction_id: string | null }[]) {
      mapByPayout.set(m.payout_record_id, {
        match_method: m.match_method,
        matched_amount: m.matched_amount,
        variance: m.variance,
        note: m.note,
        matched_by_name: m.matched_by_name,
        bank_transaction_id: m.bank_transaction_id,
      });
    }
    setRows(((payouts || []) as PayoutLedgerRow[]).map((r) => ({ ...r, match: mapByPayout.get(r.id) || null })));
  }
  async function refreshAll() { await Promise.all([loadPeriod(), loadRows()]); }
  useEffect(() => { void refreshAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [periodMonth]);

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const r = await invoke<{ ok?: boolean; error?: string; matched?: number; totals?: { total_matched: number; total_unmatched: number } }>({ action, period_month: periodMonth, ...extra });
      if (r?.error) throw new Error(r.error);
      toast({ title: action.replace(/_/g, " "), description: r?.matched != null ? `Auto-matched ${r.matched}` : "OK" });
      await refreshAll();
    } catch (e) {
      toast({ variant: "destructive", title: action, description: (e as Error).message });
    } finally { setBusy(false); }
  }

  async function manualLink(payoutId: string) {
    const bank = window.prompt("Bank transaction ID (UUID) to link to this payout:");
    if (!bank) return;
    const note = window.prompt("Optional note:") || "";
    await run("manual_link_ledger", { payout_record_id: payoutId, bank_transaction_id: bank.trim(), note });
  }
  async function waive(payoutId: string) {
    const reason = window.prompt("Waiver reason (min 8 chars):") || "";
    if (reason.trim().length < 8) { toast({ variant: "destructive", title: "Reason too short" }); return; }
    await run("waive_ledger_match", { payout_record_id: payoutId, reason });
  }
  async function unlink(payoutId: string) {
    if (!window.confirm("Remove existing match/waiver for this payout?")) return;
    await run("unlink_ledger", { payout_record_id: payoutId });
  }
  async function signOff() {
    if (!window.confirm("Sign off this period? This hard-locks payouts, payslips and payroll for the month.")) return;
    await run("signoff_ledger_period");
  }
  async function reopen() {
    const reason = window.prompt("Reopen reason (min 12 chars):") || "";
    if (reason.trim().length < 12) { toast({ variant: "destructive", title: "Reason too short" }); return; }
    await run("reopen_ledger_period", { reason });
  }

  const money = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
  const statusTone = period?.status === "signed_off" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : period?.status === "reviewed" ? "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300"
    : period?.status === "reopened" ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    : "border-border bg-muted/40 text-foreground";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-4 w-4" /> Step J · Reconcile with accounting ledger
        </CardTitle>
        <CardDescription>
          <b>What this does:</b> matches each RazorpayX payout against the corresponding entry in your bank statement (accounting ledger). If something can't be matched, you can waive it with a written reason. Once everything is clean, you can lock the month so no further edits happen.
          <br />
          <b>Is it safe?</b> Yes — reconciliation only reads. Waiving and locking are audit-logged with your reason and user.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted-foreground">Period</label>
          <input
            type="month"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={periodMonth}
            onChange={(e) => setPeriodMonth(e.target.value)}
          />
          <Badge variant="outline" className={statusTone}>{period?.status || "draft"}</Badge>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run("probe_ledger_scope")}>Probe scope</Button>
          <Button size="sm" disabled={busy || locked} onClick={() => run("auto_match_ledger_period")}>Auto-match</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run("recompute_ledger_totals")}>Recompute totals</Button>
          {period?.status !== "signed_off" && (
            <Button size="sm" variant="outline" disabled={busy || locked} onClick={() => run("review_ledger_period")}>Mark reviewed</Button>
          )}
          {period?.status === "reviewed" && (
            <Button size="sm" disabled={busy} onClick={signOff}>Sign off</Button>
          )}
          {period?.status === "signed_off" && (
            <Button size="sm" variant="destructive" disabled={busy} onClick={reopen}>Reopen</Button>
          )}
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <GapChip label="Paid" value={Number(period?.total_paid || 0)} tone="neutral" />
          <GapChip label="Matched" value={Number(period?.total_matched || 0)} tone="ok" />
          <GapChip label="Unmatched" value={Number(period?.total_unmatched || 0)} tone={Number(period?.total_unmatched || 0) > 0 ? "warn" : "ok"} />
          <GapChip label="Waived" value={Number(period?.total_waived || 0)} tone="neutral" />
        </div>

        {locked && (
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Period signed off</AlertTitle>
            <AlertDescription>
              Locked by {period?.signed_off_by_name || "—"} on {period?.signed_off_at ? new Date(period.signed_off_at).toLocaleString() : "—"}.
              Reopen (with reason) to make further changes.
            </AlertDescription>
          </Alert>
        )}

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Employee</th>
                <th className="p-2 text-right">Paid</th>
                <th className="p-2 text-left">UTR</th>
                <th className="p-2 text-left">Paid at</th>
                <th className="p-2 text-left">Match</th>
                <th className="p-2 text-right">Variance</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">No payouts for this period.</td></tr>
              )}
              {rows.map((r) => {
                const m = r.match;
                const tone = !m ? "text-amber-600 dark:text-amber-400"
                  : m.match_method === "waived" ? "text-muted-foreground"
                  : "text-emerald-600 dark:text-emerald-400";
                return (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 font-mono text-xs">{r.hr_employee_id?.slice(0, 8) || r.razorpay_employee_id || "—"}</td>
                    <td className="p-2 text-right font-medium">₹{money(r.paid_amount)}</td>
                    <td className="p-2 font-mono text-xs">{r.utr || "—"}</td>
                    <td className="p-2 text-xs text-muted-foreground">{r.paid_at ? new Date(r.paid_at).toLocaleDateString() : "—"}</td>
                    <td className={`p-2 text-xs ${tone}`}>{m ? `${m.match_method}${m.matched_by_name ? ` · ${m.matched_by_name}` : ""}` : "unmatched"}</td>
                    <td className="p-2 text-right font-mono text-xs">{m?.variance != null ? money(m.variance) : "—"}</td>
                    <td className="p-2 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="outline" disabled={busy || locked} onClick={() => manualLink(r.id)}>Link</Button>
                        <Button size="sm" variant="outline" disabled={busy || locked} onClick={() => waive(r.id)}>Waive</Button>
                        {m && <Button size="sm" variant="ghost" disabled={busy || locked} onClick={() => unlink(r.id)}>Unlink</Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
