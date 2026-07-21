import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Fingerprint, Landmark, Cloud, XCircle, RotateCcw, ArrowRight } from "lucide-react";
import { reconcileOnboarding, isReconciled, unresolvedCount, type ReconcileDiff } from "@/lib/hrms/razorpayReconcile";
import { Checkbox } from "@/components/ui/checkbox";

interface Stage5Props {
  onboardingRecord: any;
  onFinalize: (data: any) => Promise<void>;
  onSave?: (data: any, options?: { silent?: boolean }) => Promise<void>;
  onBack: () => void;
  readOnly?: boolean;
}

const pickRazorpayString = (...vals: unknown[]) =>
  vals
    .map((v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim()))
    .find(Boolean) || "";

const splitRazorpayName = (value: unknown) => {
  const name = pickRazorpayString(value).replace(/\s+/g, " ");
  if (!name) return { first: "", last: "" };
  const parts = name.split(" ");
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
};

const readRazorpayIdentity = (snap: any) => {
  const fromName = splitRazorpayName(snap?.name);
  return {
    first_name: pickRazorpayString(snap?.first_name, snap?.firstName, snap?.["first-name"], fromName.first),
    last_name: pickRazorpayString(snap?.last_name, snap?.lastName, snap?.["last-name"], fromName.last),
    email: pickRazorpayString(snap?.email, snap?.work_email, snap?.personal_email, snap?.["work-email"], snap?.["personal-email"]),
  };
};

export function Stage5Finalization({ onboardingRecord, onFinalize, onSave, onBack, readOnly }: Stage5Props) {
  const [form, setForm] = useState({
    date_of_joining: "",
    essl_badge_id: "",
    create_erp_account: false,
    erp_role_id: "",
    reporting_manager_id: "",
    bank_account_number: "",
    bank_ifsc_code: "",
    bank_name: "",
    bank_branch: "",
    bank_account_holder: "",
    // Operator enters the RazorpayX-issued Employee ID here once the new hire
    // completes self-registration on RazorpayX. This same integer becomes the
    // HRMS badge_id, the ESSL device PIN, and the RazorpayX employee_id.
    razorpay_employee_id: "",
  });
  const [finalizing, setFinalizing] = useState(false);
  const [pushingToDevices, setPushingToDevices] = useState(false);
  const [verifyingRpId, setVerifyingRpId] = useState(false);
  const [creatingRazorpayInvite, setCreatingRazorpayInvite] = useState(false);
  const [rpVerification, setRpVerification] = useState<null | {
    ok: boolean;
    message: string;
    razorpay_employee_id?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
  }>(null);
  // RazorpayX ↔ ERP field-level reconciliation state. `diffs` is what the panel
  // renders; `overrides` records which mismatched rows the operator explicitly
  // acknowledged. Finalize stays disabled until every non-match row is either
  // resolved (Use RazorpayX value) or overridden. `snapshot` is the raw RP body
  // kept in memory for the "Use RazorpayX value" click handlers.
  const [reconcileDiffs, setReconcileDiffs] = useState<ReconcileDiff[] | null>(null);
  const [reconcileOverrides, setReconcileOverrides] = useState<Record<string, 'hrms' | 'razorpay'>>({});
  const [rpSnapshot, setRpSnapshot] = useState<any>(null);
  const [finalizeFeedback, setFinalizeFeedback] = useState<null | { kind: "success" | "error"; message: string }>(null);
  const [pushFeedback, setPushFeedback] = useState<null | { pin: string; deviceCount: number; at: string }>(null);
  const pushingRef = useRef(false);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRecordIdRef = useRef<string | null>(null);

  // Build the ERP-side reconcile input from the current onboarding record + form.
  // Kept as a helper so we can re-run reconcile after every "Use RazorpayX value"
  // click without having to re-fetch the snapshot.
  const buildErpInput = () => {
    const mgr = (managers || []).find((m: any) => m.id === form.reporting_manager_id);
    const mgrName = mgr ? `${mgr.first_name || ""} ${mgr.last_name || ""}`.trim() : "";
    return {
      first_name: onboardingRecord?.first_name,
      last_name: onboardingRecord?.last_name,
      email: onboardingRecord?.email,
      phone: onboardingRecord?.phone,
      gender: onboardingRecord?.gender,
      date_of_birth: onboardingRecord?.date_of_birth,
      date_of_joining: form.date_of_joining || onboardingRecord?.date_of_joining,
      probation_end_date: onboardingRecord?.probation_end_date,
      employee_type: onboardingRecord?.employee_type,
      job_role: onboardingRecord?.job_role,
      
      ctc: onboardingRecord?.ctc,
      documents: onboardingRecord?.documents,
      bank: {
        account_number: form.bank_account_number,
        ifsc_code: form.bank_ifsc_code,
        account_holder: form.bank_account_holder,
      },
      reporting_manager_badge_id: mgr?.badge_id || null,
      reporting_manager_label: mgrName,
    };
  };



  // Persist the reconciliation snapshot + overrides on the draft so a reload
  // restores the exact state (green ticks, remaining amber rows, override
  // checkboxes) without re-hitting RazorpayX.
  const persistReconciliation = async (
    diffs: ReconcileDiff[] | null,
    overrides: Record<string, 'hrms' | 'razorpay'>,
    snapshot: any,
  ) => {
    if (!onboardingRecord?.id) return;
    try {
      const { error } = await supabase
        .from("hr_employee_onboarding")
        .update({
          razorpay_reconciliation: diffs
            ? { diffs, overrides, snapshot, last_checked_at: new Date().toISOString() }
            : null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", onboardingRecord.id);
      if (error) throw error;
      // Keep react-query cache in sync so re-mount / navigation replays the
      // exact same override selections without a stale window.
      await queryClient.invalidateQueries({ queryKey: ["onboarding-record", onboardingRecord.id] });
    } catch (e: any) {
      console.warn("Failed to persist Razorpay reconciliation:", e);
      toast.error(`Could not save reconciliation choice: ${e?.message || e}`);
    }
  };

  // Verify the operator-entered RazorpayX Employee ID against the RazorpayX API
  // via the proxy's read-only `read_person_by_id` action, then reconcile the
  // returned people:view snapshot against the ERP onboarding draft field by
  // field. Finalize stays disabled until every row matches or is overridden.
  const handleVerifyRazorpayId = async () => {
    const idStr = form.razorpay_employee_id.trim();
    if (!/^\d+$/.test(idStr)) {
      toast.error("RazorpayX Employee ID must be numeric.");
      return;
    }
    setVerifyingRpId(true);
    const t = toast.loading(`Verifying Employee ID ${idStr} with RazorpayX…`);
    try {
      const { data, error } = await supabase.functions.invoke("razorpay-payroll-proxy", {
        body: {
          action: "read_person_by_id",
          razorpay_employee_id: Number(idStr),
        },
      });
      if (error) throw error;
      const resp = (data || {}) as any;
      if (!resp.ok) {
        const msg = resp.error || "RazorpayX verification failed";
        setRpVerification({ ok: false, message: msg });
        setReconcileDiffs(null);
        setReconcileOverrides({});
        setRpSnapshot(null);
        toast.error(msg, { id: t });
        return;
      }
      const snap = resp.snapshot || {};
      const rpIdentity = readRazorpayIdentity(snap);
      // Hard block: if this draft has an email and RazorpayX shows a different
      // one, refuse to link (Unified ID doctrine — identity must not diverge).
      const erpEmail = String(onboardingRecord?.email || "").trim().toLowerCase();
      const rpEmail = rpIdentity.email.trim().toLowerCase();
      if (erpEmail && rpEmail && erpEmail !== rpEmail) {
        const msg = `Email mismatch: RazorpayX employee ${idStr} belongs to ${rpEmail}, not ${erpEmail}. Refusing to link — pick the correct Employee ID.`;
        setRpVerification({ ok: false, message: msg });
        setReconcileDiffs(null);
        setReconcileOverrides({});
        setRpSnapshot(null);
        toast.error(msg, { id: t });
        return;
      }

      const diffs = reconcileOnboarding(buildErpInput(), snap);
      // Preserve prior "Keep HRMS" overrides for fields that are STILL
      // mismatched after re-verification. Only drop overrides for fields that
      // are now matching or no longer present in the new diff set.
      const priorOverrides = (onboardingRecord as any)?.razorpay_reconciliation?.overrides || {};
      const stillMismatched = new Set(
        diffs
          .filter(d => d.status !== "match")
          .map(d => d.field),
      );
      const preservedOverrides: Record<string, 'hrms' | 'razorpay'> = {};
      Object.entries(priorOverrides).forEach(([field, val]) => {
        if (val && stillMismatched.has(field)) {
          preservedOverrides[field] = val === 'razorpay' ? 'razorpay' : 'hrms';
        }
      });
      setRpSnapshot(snap);
      setReconcileDiffs(diffs);
      setReconcileOverrides(preservedOverrides);
      setRpVerification({
        ok: true,
        message: `Verified. Comparing RazorpayX employee ${idStr} against this onboarding record.`,
        razorpay_employee_id: idStr,
        first_name: rpIdentity.first_name,
        last_name: rpIdentity.last_name,
        email: rpIdentity.email,
      });
      updateForm({ essl_badge_id: idStr });
      // Persist verified state + reconciliation for reload durability.
      if (onboardingRecord?.id) {
        try {
          await supabase
            .from("hr_employee_onboarding")
            .update({
              razorpay_employee_id: idStr,
              razorpay_verified_at: new Date().toISOString(),
              essl_badge_id: idStr,
              razorpay_reconciliation: {
                diffs,
                overrides: preservedOverrides,
                snapshot: snap,
                last_checked_at: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", onboardingRecord.id);
          await queryClient.invalidateQueries({ queryKey: ["onboarding-record", onboardingRecord.id] });
        } catch (e) {
          console.warn("Failed to persist Razorpay verification:", e);
        }
      }
      const remaining = unresolvedCount(diffs, preservedOverrides);
      if (remaining === 0) {
        toast.success(`Verified — all fields match. You can finalize now.`, { id: t });
      } else {
        toast.warning(`Verified — ${remaining} field${remaining === 1 ? "" : "s"} need reconciliation before Finalize.`, { id: t });
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      setRpVerification({ ok: false, message: msg });
      toast.error(`Verify failed: ${msg}`, { id: t });
    } finally {
      setVerifyingRpId(false);
    }
  };

  // Copy the RazorpayX value for a specific field back into the ERP draft, then
  // re-run reconcile so the row flips to green. Only the fields we know how to
  // write into the current draft/form are actionable here; PAN/UAN come from
  // Stage 3 documents and are shown read-only in the panel (the operator must
  // go back to Stage 3 to fix those, or override them).
  // Compute the concrete write the "Use RazorpayX" choice implies for a diff row.
  // Returns a patch describing what to write to form / hr_employee_onboarding.
  // NOTE: this is invoked at Finalize time only — button clicks just record the choice.
  const buildRazorpayPatch = (diff: ReconcileDiff): {
    formPatch?: Partial<typeof form>;
    onboardingPatch?: Record<string, any>;
    docsPatch?: Record<string, any>;
  } => {
    const rpVal = diff.rpRawValue ?? null;
    const rpStr = rpVal == null ? "" : String(rpVal);
    switch (diff.field) {
      case "date_of_joining":
        return { formPatch: { date_of_joining: rpStr } };
      case "bank_account_number":
        return { formPatch: { bank_account_number: rpStr } };
      case "bank_ifsc_code":
        return { formPatch: { bank_ifsc_code: rpStr.toUpperCase() } };
      case "bank_account_holder":
        return { formPatch: { bank_account_holder: rpStr } };
      case "first_name":
      case "last_name":
      case "email":
      case "phone":
      case "gender":
      case "date_of_birth":
      case "ctc":
      case "probation_end_date":
      case "employee_type":
      case "job_role":
        return { onboardingPatch: { [diff.field]: rpVal } };
      case "pan":
        return { docsPatch: { pan: { value: rpStr.toUpperCase() } } };
      case "uan":
        return { docsPatch: { uan: { value: rpStr } } };
      case "reporting_manager": {
        const mgr = (managers || []).find((m: any) => String(m.badge_id) === rpStr);
        return mgr ? { formPatch: { reporting_manager_id: mgr.id } as any } : {};
      }
      default:
        return {};
    }
  };


  const setChoice = (field: string, choice: 'hrms' | 'razorpay' | null) => {
    setReconcileOverrides(prev => {
      const next: Record<string, 'hrms' | 'razorpay'> = { ...prev };
      if (choice) next[field] = choice;
      else delete next[field];
      persistReconciliation(reconcileDiffs, next, rpSnapshot);
      return next;
    });
  };



  const handlePushToBiometric = async () => {
    const pin = form.essl_badge_id.trim();
    const name = `${onboardingRecord?.first_name || ""} ${onboardingRecord?.last_name || ""}`.trim();
    if (!alreadyInRazorpay && !rpVerification?.ok) {
      toast.error("Verify the RazorpayX Employee ID first — ESSL Badge ID must equal that verified ID.");
      return;
    }
    if (!pin) {
      toast.error("Enter an ESSL Badge ID first.");
      return;
    }
    if (!name) {
      toast.error("Employee name is missing on this onboarding record.");
      return;
    }
    // Synchronous re-entry guard — blocks rapid double-taps that would
    // otherwise queue duplicate USERINFO commands to the devices.
    if (pushingRef.current || pushingToDevices) {
      toast.info("Already queuing this PIN — please wait.");
      return;
    }
    // Idempotency guard — if this PIN is already registered on a device with
    // a name, or we've already queued a create for it from this onboarding,
    // do not re-queue.
    if (pinStatus?.kind === "conflict") {
      toast.error(pinStatus.msg);
      return;
    }
    if (pushLogBelongsToThisOnboarding) {
      toast.info(`PIN ${pin} was already queued from this onboarding. Skipping duplicate create.`);
      return;
    }
    pushingRef.current = true;
    setPushingToDevices(true);
    const t = toast.loading(`Queuing ${name} (PIN ${pin}) to both biometric devices…`);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase.functions.invoke("hr-essl-push", {
        body: {
          pin,
          name,
          action: "upsert",
          triggered_by: userData?.user?.id ?? null,
          triggered_from: "onboarding_stage5",
          onboarding_id: onboardingRecord?.id ?? null,
        },
      });
      if (error) throw error;
      const payload = (data ?? {}) as any;
      toast.dismiss(t);
      if (payload.ok) {
        setPushFeedback({ pin, deviceCount: payload.queued_count || 0, at: new Date().toISOString() });
        toast.success(`✓ Biometric identity created for ${name} on ${payload.queued_count} device(s). Devices apply it on the next poll (30–60s).`);
        queryClient.invalidateQueries({ queryKey: ["hr_essl_pushback_log_stage5", pin] });
        queryClient.invalidateQueries({ queryKey: ["hr_biometric_device_users_for_stage5"] });
      } else if (payload.skipped) {
        toast.warning(
          payload.reason === "no_devices"
            ? "No biometric devices registered."
            : "Skipped — missing PIN.",
        );
      } else {
        throw new Error(payload.error || "Push failed");
      }
    } catch (e: any) {
      toast.dismiss(t);
      toast.error(`Push failed: ${e?.message || String(e)}`);
    } finally {
      pushingRef.current = false;
      setPushingToDevices(false);
    }
  };

  const getFinalizeErrorMessage = (err: any) => {
    const base = err?.message || err?.error_description || err?.error || "Finalize failed";
    const hint = err?.hint ? ` Hint: ${err.hint}` : "";
    const details = err?.details ? ` Details: ${err.details}` : "";
    return `${base}${hint}${details}`;
  };

  // Pre-fill bank details from hr_employee_bank_details when this onboarding
  // was auto-created from a Razorpay import (linked hr_employees row exists).
  const linkedEmpId = onboardingRecord?.employee_id as string | null;
  const { data: existingBank } = useQuery({
    queryKey: ["stage5-bank", linkedEmpId],
    queryFn: async () => {
      if (!linkedEmpId) return null;
      const { data } = await supabase
        .from("hr_employee_bank_details")
        .select("account_number, ifsc_code, bank_name, branch, additional_info")
        .eq("employee_id", linkedEmpId)
        .maybeSingle();
      return data;
    },
    enabled: !!linkedEmpId,
  });

  // Is this employee already linked to a Razorpay employee record? If so, the
  // "Also create in Razorpay" toggle is hidden — no double-provisioning.
  const { data: razorpayMap } = useQuery({
    queryKey: ["stage5-rzp-map", linkedEmpId],
    queryFn: async () => {
      if (!linkedEmpId) return null;
      const { data } = await supabase
        .from("hr_razorpay_employee_map")
        .select("razorpay_employee_id")
        .eq("hr_employee_id", linkedEmpId)
        .maybeSingle();
      return data;
    },
    enabled: !!linkedEmpId,
  });
  const alreadyInRazorpay = !!(razorpayMap as any)?.razorpay_employee_id;

  useEffect(() => {
    const mappedId = String((razorpayMap as any)?.razorpay_employee_id || "").trim();
    if (!mappedId) return;
    setForm(prev => ({
      ...prev,
      razorpay_employee_id: mappedId,
      essl_badge_id: mappedId,
    }));
    setRpVerification(prev => prev ?? {
      ok: true,
      message: `Already linked to RazorpayX Employee ID ${mappedId}.`,
      razorpay_employee_id: mappedId,
    });
  }, [razorpayMap]);

  // Auto-pull bank/IFSC from Razorpay for pending onboardings that were imported
  // from Razorpay but haven't had their bank details projected yet. Runs once
  // per open of the wizard, silently — if it fails (permissions, offline
  // employee, or no Razorpay bank block) the operator can still type manually.
  const queryClient = useQueryClient();
  const pulledRef = useRef(false);
  useEffect(() => {
    if (pulledRef.current) return;
    if (!linkedEmpId) return;
    if (existingBank?.account_number) return; // already have it
    let cancelled = false;
    (async () => {
      const { data: mapRow } = await supabase
        .from("hr_razorpay_employee_map")
        .select("razorpay_employee_id")
        .eq("hr_employee_id", linkedEmpId)
        .maybeSingle();
      const rpId = (mapRow as any)?.razorpay_employee_id;
      if (!rpId || cancelled) return;
      pulledRef.current = true;
      try {
        await supabase.functions.invoke("razorpay-payroll-proxy", {
          body: { action: "pull_person_full", razorpay_employee_ids: [String(rpId)] },
        });
        if (!cancelled) {
          queryClient.invalidateQueries({ queryKey: ["stage5-bank", linkedEmpId] });
        }
      } catch {
        // Silent — form still lets operator enter bank details manually.
      }
    })();
    return () => { cancelled = true; };
  }, [linkedEmpId, existingBank, queryClient]);

  useEffect(() => {
    if (onboardingRecord && hydratedRecordIdRef.current !== onboardingRecord.id) {
      const bd = (onboardingRecord.bank_details as any) || {};
      const empName = `${onboardingRecord.first_name || ""} ${onboardingRecord.last_name || ""}`.trim();
      const existingBadge = (onboardingRecord.essl_badge_id || "").toString().trim();
      const savedRpId = String((onboardingRecord as any).razorpay_employee_id || "").trim();
      const savedRpVerifiedAt = (onboardingRecord as any).razorpay_verified_at;
      const hasStaleUnverifiedBadge = !!existingBadge && !(savedRpId && savedRpVerifiedAt);
      // Only seed the badge from Razorpay ID when it was actually verified.
      // Otherwise leave it blank so ESSL cannot be created pre-verification.
      setForm({
        date_of_joining: onboardingRecord.date_of_joining || "",
        essl_badge_id: savedRpId && savedRpVerifiedAt ? savedRpId : "",
        create_erp_account: onboardingRecord.create_erp_account || false,
        erp_role_id: onboardingRecord.erp_role_id || "",
        reporting_manager_id: onboardingRecord.reporting_manager_id || "",
        bank_account_number: bd.account_number || existingBank?.account_number || "",
        bank_ifsc_code: bd.ifsc_code || existingBank?.ifsc_code || "",
        bank_name: bd.bank_name || existingBank?.bank_name || "",
        bank_branch: bd.branch || (existingBank as any)?.branch || "",
        bank_account_holder: empName,
        razorpay_employee_id: savedRpId,
      });
      if (hasStaleUnverifiedBadge && onSave && !readOnly) {
        onSave({ essl_badge_id: null }, { silent: true }).catch((err: any) => {
          console.warn("Failed to clear stale unverified ESSL badge ID:", err);
        });
      }
      if (savedRpId && (onboardingRecord as any).razorpay_verified_at) {
        setRpVerification({
          ok: true,
          message: `Previously verified. RazorpayX Employee ID ${savedRpId} is linked to this record.`,
          razorpay_employee_id: savedRpId,
        });
      }
      // Restore field-level reconciliation state so a reload keeps the panel.
      const rec = (onboardingRecord as any).razorpay_reconciliation;
      if (rec && Array.isArray(rec.diffs)) {
        const restoredSnapshot = rec.snapshot ?? null;
        const hydratedMgr = (managers || []).find((m: any) => m.id === onboardingRecord.reporting_manager_id);
        const hydratedMgrName = hydratedMgr ? `${hydratedMgr.first_name || ""} ${hydratedMgr.last_name || ""}`.trim() : "";
        setReconcileDiffs(restoredSnapshot
          ? reconcileOnboarding({
              first_name: onboardingRecord?.first_name,
              last_name: onboardingRecord?.last_name,
              email: onboardingRecord?.email,
              phone: onboardingRecord?.phone,
              gender: onboardingRecord?.gender,
              date_of_birth: onboardingRecord?.date_of_birth,
              date_of_joining: onboardingRecord?.date_of_joining,
              probation_end_date: (onboardingRecord as any)?.probation_end_date,
              employee_type: (onboardingRecord as any)?.employee_type,
              job_role: (onboardingRecord as any)?.job_role,
              ctc: onboardingRecord?.ctc,
              documents: onboardingRecord?.documents,
              bank: {
                account_number: bd.account_number || existingBank?.account_number || "",
                ifsc_code: bd.ifsc_code || existingBank?.ifsc_code || "",
                account_holder: empName,
              },
              reporting_manager_badge_id: hydratedMgr?.badge_id || null,
              reporting_manager_label: hydratedMgrName,
            }, restoredSnapshot)
          : rec.diffs as ReconcileDiff[]);
        {
          const raw = (rec.overrides as Record<string, unknown>) || {};
          const norm: Record<string, 'hrms' | 'razorpay'> = {};
          Object.entries(raw).forEach(([k, v]) => {
            if (v === 'razorpay') norm[k] = 'razorpay';
            else if (v) norm[k] = 'hrms';
          });
          setReconcileOverrides(norm);
        }
        setRpSnapshot(restoredSnapshot);
      } else {
        setReconcileDiffs(null);
        setReconcileOverrides({});
        setRpSnapshot(null);
      }
      hydratedRecordIdRef.current = onboardingRecord.id;
    }
  }, [onboardingRecord]);

  useEffect(() => {
    if (!existingBank) return;
    setForm(prev => ({
      ...prev,
      bank_account_number: prev.bank_account_number || existingBank.account_number || "",
      bank_ifsc_code: prev.bank_ifsc_code || existingBank.ifsc_code || "",
      bank_name: prev.bank_name || existingBank.bank_name || "",
      bank_branch: prev.bank_branch || (existingBank as any).branch || "",
    }));
  }, [existingBank]);

  const { data: roles } = useQuery({
    queryKey: ["erp-roles-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data?.filter(r => !["admin", "super_admin", "Admin", "Super Admin"].includes(r.name)) || [];
    },
    enabled: form.create_erp_account,
  });

  const { data: managers } = useQuery({
    queryKey: ["managers-list-stage5"],
    queryFn: async () => {
      const data = await fetchAllPaginated<any>(() => supabase.from("hr_employees").select("id, first_name, last_name, badge_id").eq("is_active", true).order("first_name"));
      return data;
    },
  });

  // Re-run reconciliation when managers list finishes loading or the
  // reporting-manager selection changes, so the "Reporting manager" row
  // reflects the correct ERP-side badge/name rather than a stale blank.
  useEffect(() => {
    if (!rpSnapshot) return;
    if (!managers) return;
    const diffs = reconcileOnboarding(buildErpInput(), rpSnapshot);
    setReconcileDiffs(diffs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managers, form.reporting_manager_id, rpSnapshot]);

  // Live eSSL device-user roster: only PINs actually seen by a device.
  const { data: devicePins = [] } = useQuery({
    queryKey: ["hr_biometric_device_users_for_stage5"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_biometric_device_users")
        .select("pin, name, device_serial, matched_employee_id, last_seen_at")
        .order("last_seen_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const canonicalDevicePins = useMemo(() => {
    const byPin = new Map<string, any>();

    for (const row of devicePins || []) {
      const pin = String((row as any)?.pin || "").trim();
      if (!pin) continue;

      const existing = byPin.get(pin);
      const merged = existing || { pin, names: new Set<string>(), deviceSerials: new Set<string>(), rows: [] as any[] };
      if ((row as any).name) merged.names.add(String((row as any).name));
      if ((row as any).device_serial) merged.deviceSerials.add(String((row as any).device_serial));
      merged.rows.push(row);

      const rowMatched = (row as any).matched_employee_id || null;
      const rowSeen = (row as any).last_seen_at ? new Date((row as any).last_seen_at).getTime() : 0;
      const existingSeen = merged.last_seen_at ? new Date(merged.last_seen_at).getTime() : 0;

      if (!merged.matched_employee_id && rowMatched) merged.matched_employee_id = rowMatched;
      if (!merged.name && (row as any).name) merged.name = (row as any).name;
      if (rowSeen > existingSeen) merged.last_seen_at = (row as any).last_seen_at;

      byPin.set(pin, merged);
    }

    return Array.from(byPin.values()).map((entry) => ({
      ...entry,
      names: Array.from(entry.names),
      deviceSerials: Array.from(entry.deviceSerials),
      deviceCount: entry.deviceSerials.size,
    }));
  }, [devicePins]);

  // A PIN is "assigned" only when a finalized hr_employees row already carries
  // it as badge_id. matched_employee_id alone isn't enough — the identity link
  // can be pre-seeded before finalization and would otherwise hide the PIN.
  const { data: usedBadgeIds = [] } = useQuery({
    queryKey: ["hr_employees_badge_ids_for_stage5"],
    queryFn: async () => {
      const rows = await fetchAllPaginated<any>(() =>
        supabase.from("hr_employees").select("badge_id").not("badge_id", "is", null)
      );
      return rows.map((r: any) => String(r.badge_id).trim()).filter(Boolean);
    },
    refetchInterval: 30_000,
  });

  // Idempotency lookup — has this PIN already been queued to biometric devices
  // from an onboarding flow? Any successful/queued/ack row here means we
  // must NOT push again, and the "Create" action should lock itself.
  const currentPinTrim = (form.essl_badge_id || "").trim();
  const { data: existingPushLog } = useQuery({
    queryKey: ["hr_essl_pushback_log_stage5", currentPinTrim],
    queryFn: async () => {
      if (!currentPinTrim) return null;
      const { data } = await (supabase as any)
        .from("hr_essl_pushback_log")
        .select("id, status, device_serial, created_at, triggered_from, request_snapshot, hr_employee_id")
        .eq("pin", currentPinTrim)
        .eq("kind", "identity")
        .in("status", ["queued", "ack", "acknowledged", "applied", "success"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!currentPinTrim,
    refetchInterval: 30_000,
  });

  const pinStatus = useMemo(() => {
    const val = (form.essl_badge_id || "").trim();
    if (!val) return null as null | { kind: "empty" | "unknown" | "queued" | "conflict" | "ok"; msg: string; matches?: any[] };
    const matches = (devicePins || []).filter((p: any) => (p.pin || "").trim() === val);
    if (matches.length === 0) {
      // If we've already queued an identity for this PIN (or just created one this session),
      // downgrade the scary "unknown" warning to a friendlier "queued — awaiting device sync".
      if (existingPushLog || pushFeedback) {
        return { kind: "queued", msg: `Identity queued for PIN ${val}. Waiting for the eSSL device to poll (usually 30–60s) and report the user back before punches are accepted.`, matches };
      }
      return { kind: "unknown", msg: "PIN not seen on any active eSSL device yet — punches from this ID will be rejected until the device syncs.", matches };
    }
    const usedByOther = new Set(usedBadgeIds.filter((b: string) => b !== (onboardingRecord?.essl_badge_id || "")));
    if (usedByOther.has(val)) return { kind: "conflict", msg: `PIN ${val} is already the badge ID of another finalized employee.`, matches };
    const canonical = canonicalDevicePins.find((p: any) => p.pin === val);
    const deviceCount = canonical?.deviceCount || matches.length;
    const deviceName = canonical?.name || matches.find((m: any) => m.name)?.name;
    return { kind: "ok", msg: `Found on ${deviceCount} device${deviceCount === 1 ? "" : "s"}${deviceName ? ` — device name: ${deviceName}` : ""}.`, matches };
  }, [form.essl_badge_id, devicePins, canonicalDevicePins, usedBadgeIds, onboardingRecord?.essl_badge_id, existingPushLog, pushFeedback]);


  const pushLogBelongsToThisOnboarding = !!existingPushLog && (
    (existingPushLog as any)?.request_snapshot?.onboarding_id === onboardingRecord?.id ||
    (!!(existingPushLog as any)?.hr_employee_id && (existingPushLog as any).hr_employee_id === onboardingRecord?.employee_id)
  );

  // Only a create/update queued by THIS onboarding locks the action. A live roster
  // PIN by itself is not treated as "done" because old device users can be
  // overwritten with the verified RazorpayX/HRMS identity after confirmation.
  const bioAlreadyCreated = !!(pushLogBelongsToThisOnboarding || pushFeedback);

  // Finalize gate: unless this record was already linked in Razorpay (legacy
  // imports), the operator must have run Verify and either matched or overridden
  // every mismatched field on the reconciliation panel.
  const onboardingReconciliationMeta = (onboardingRecord as any)?.razorpay_reconciliation && typeof (onboardingRecord as any).razorpay_reconciliation === "object"
    ? (onboardingRecord as any).razorpay_reconciliation
    : null;
  const razorpayCreateRequest = onboardingReconciliationMeta?.create_request || null;

  const reconcileUnresolved = reconcileDiffs ? unresolvedCount(reconcileDiffs, reconcileOverrides) : 0;
  const reconcileReady = alreadyInRazorpay
    ? true
    : !!(rpVerification?.ok && reconcileDiffs && isReconciled(reconcileDiffs, reconcileOverrides));
  const reconcileBlockReason = alreadyInRazorpay
    ? ""
    : !rpVerification?.ok
      ? "Verify the RazorpayX Employee ID before finalizing."
      : !reconcileDiffs
        ? "Run RazorpayX verification to compare the fields."
        : reconcileUnresolved > 0
          ? (() => {
              const names = (reconcileDiffs || [])
                .filter(d => d.status !== "match" && !reconcileOverrides[d.field])
                .map(d => d.label);
              return `${reconcileUnresolved} field${reconcileUnresolved === 1 ? "" : "s"} still differ between RazorpayX and ERP: ${names.join(", ")}. Choose "Use HRMS" or "Use RazorpayX" on each row before finalizing.`;
            })()
          : "";





  const ifscValid = !form.bank_ifsc_code || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.bank_ifsc_code.trim().toUpperCase());

  // Checklist for the "Also create in RazorpayX Payroll" toggle. Razorpay's
  // POST /people (sub-type: add) requires all of these — surface gaps in the
  // UI so HR can't attempt a create that will fail validation server-side.
  const docs = (onboardingRecord?.documents as any) || {};
  const panFromDocs = String(docs.pan?.value || "").toUpperCase().trim();
  const razorpayChecklist = useMemo(() => {
    const items = [
      { key: "name", label: "Full name", ok: !!(onboardingRecord?.first_name) },
      { key: "email", label: "Email", ok: !!onboardingRecord?.email },
      { key: "phone", label: "Phone", ok: !!onboardingRecord?.phone },
      { key: "pan", label: "PAN (from Stage 3)", ok: /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panFromDocs) },
      { key: "doj", label: "Date of Joining", ok: !!form.date_of_joining },
      { key: "dept", label: "Department", ok: !!onboardingRecord?.department_id },
      { key: "title", label: "Job Role / Title", ok: !!onboardingRecord?.job_role },
      { key: "ctc", label: "Annual CTC", ok: Number(onboardingRecord?.ctc) > 0 },
      { key: "acct", label: "Bank Account Number", ok: !!form.bank_account_number.trim() },
      { key: "ifsc", label: "Bank IFSC", ok: !!form.bank_ifsc_code.trim() && ifscValid },
    ];
    return { items, allOk: items.every(i => i.ok), missing: items.filter(i => !i.ok).map(i => i.label) };
  }, [onboardingRecord, form.date_of_joining, form.bank_account_number, form.bank_ifsc_code, ifscValid, panFromDocs]);

  const hasBankInput = !!(form.bank_account_number.trim() && form.bank_ifsc_code.trim());

  const handleCreateRazorpayInvite = async () => {
    if (!onboardingRecord?.id) {
      toast.error("Save the onboarding draft before creating it in RazorpayX.");
      return;
    }
    if (!razorpayChecklist.allOk) {
      toast.error(`Complete these fields first: ${razorpayChecklist.missing.join(", ")}`);
      return;
    }
    setCreatingRazorpayInvite(true);
    const t = toast.loading("Creating RazorpayX employee invite…");
    try {
      if (onSave) {
        await onSave(getDraftPayload(), { silent: true });
      }
      const { data, error } = await supabase.functions.invoke("razorpay-payroll-proxy", {
        body: {
          action: "create_onboarding_invite",
          onboarding_id: onboardingRecord.id,
        },
      });
      if (error) throw error;
      const resp = (data || {}) as any;
      if (!resp.ok) throw new Error(resp.error || "RazorpayX create failed");
      await queryClient.invalidateQueries({ queryKey: ["onboarding-record", onboardingRecord.id] });
      toast.success(
        resp.already_exists
          ? "RazorpayX already has this employee email. Paste and verify the Employee ID from RazorpayX."
          : "RazorpayX employee invite created. Paste and verify the Employee ID once RazorpayX shows it.",
        { id: t },
      );
    } catch (e: any) {
      toast.error(`RazorpayX create failed: ${e?.message || e}`, { id: t });
    } finally {
      setCreatingRazorpayInvite(false);
    }
  };

  const getDraftPayloadFrom = (source: typeof form) => ({
    date_of_joining: source.date_of_joining || null,
    essl_badge_id: source.essl_badge_id || null,
    create_erp_account: source.create_erp_account,
    erp_role_id: source.erp_role_id || null,
    reporting_manager_id: source.reporting_manager_id || null,
    bank_details: {
      account_number: source.bank_account_number.trim(),
      ifsc_code: source.bank_ifsc_code.trim().toUpperCase(),
      bank_name: source.bank_name.trim(),
      branch: source.bank_branch.trim(),
      account_holder: source.bank_account_holder.trim(),
    },
  });

  const getDraftPayload = () => getDraftPayloadFrom(form);

  useEffect(() => {
    if (!dirtyRef.current || readOnly || !onSave) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      dirtyRef.current = false;
      onSave(getDraftPayload(), { silent: true }).catch((err: any) => console.warn("Stage 5 autosave failed:", err));
    }, 700);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [form, onSave, readOnly]);

  const updateForm = (updates: Partial<typeof form>) => {
    setForm(prev => {
      const next = { ...prev, ...updates };
      dirtyRef.current = false;
      onSave?.(getDraftPayloadFrom(next), { silent: true }).catch((err: any) => console.warn("Stage 5 immediate save failed:", err));
      return next;
    });
  };

  const handleBack = async () => {
    if (!readOnly && onSave) {
      try {
        await onSave(getDraftPayload(), { silent: true });
      } catch (err) {
        console.warn("Stage 5 back-save failed:", err);
      }
    }
    onBack();
  };

  const validate = () => {
    if (!form.date_of_joining) { toast.error("Date of Joining is mandatory"); return false; }
    const rpId = form.razorpay_employee_id.trim();
    if (!alreadyInRazorpay) {
      if (!rpId) {
        toast.error("Enter the RazorpayX Employee ID (issued after the new hire completes RazorpayX self-registration).");
        return false;
      }
      if (!/^\d+$/.test(rpId)) {
        toast.error("RazorpayX Employee ID must be numeric.");
        return false;
      }
    }
    if (!form.essl_badge_id.trim()) { toast.error("ESSL Badge ID is mandatory"); return false; }
    if (!alreadyInRazorpay && form.essl_badge_id.trim() !== rpId) {
      toast.error("ESSL Badge ID must equal the RazorpayX Employee ID (unified ID doctrine).");
      return false;
    }
    if (pinStatus?.kind === "conflict") { toast.error(pinStatus.msg); return false; }
    if (pinStatus?.kind === "unknown") {
      if (!window.confirm(`${pinStatus.msg}\n\nSave this PIN anyway?`)) {
        toast.message("Finalize cancelled — PIN not confirmed.");
        return false;
      }
    }
    if (form.create_erp_account && !form.erp_role_id) { toast.error("Please select a role for ERP account"); return false; }
    const anyBank = form.bank_account_number.trim() || form.bank_ifsc_code.trim();
    if (anyBank && !hasBankInput) {
      toast.error("Enter both Account Number and IFSC, or leave both blank");
      return false;
    }
    if (form.bank_ifsc_code && !ifscValid) {
      toast.error("IFSC must be 11 characters (e.g. HDFC0001234)");
      return false;
    }
    const docs = (onboardingRecord?.documents as any) || {};
    const hasBank = hasBankInput || !!docs.bank_details?.value;
    const hasSalary = Number(onboardingRecord?.ctc) > 0;
    if (!hasBank || !hasSalary) {
      const missing = [!hasBank && "Bank details", !hasSalary && "Salary/CTC"].filter(Boolean).join(" & ");
      if (!window.confirm(`${missing} missing. Activate anyway? Payroll will fail until these are filled.`)) {
        toast.message(`Finalize cancelled — ${missing} missing.`);
        return false;
      }
    }
    return true;
  };

  const handleFinalize = async () => {
    setFinalizeFeedback(null);
    console.log("[Stage5] Finalize clicked", { form, pinStatus, hasBankInput, ifscValid, ctc: onboardingRecord?.ctc });
    if (!validate()) {
      console.warn("[Stage5] Finalize validation blocked");
      return;
    }
    if (!reconcileReady) {
      toast.error(reconcileBlockReason || "Resolve RazorpayX ↔ ERP field differences before finalizing.");
      setFinalizeFeedback({ kind: "error", message: reconcileBlockReason || "Reconciliation incomplete." });
      return;
    }
    setFinalizing(true);
    const toastId = toast.loading("Creating employee…");
    try {
      // Bi-directional reconcile write-back:
      //   • "Use RazorpayX"  → already wrote RazorpayX value into HRMS on click.
      //   • "Keep HRMS"      → push HRMS value into RazorpayX right now, before
      //                        finalize, so both systems end up identical.
      const rpId = (form.razorpay_employee_id || (razorpayMap as any)?.razorpay_employee_id || "").toString().trim();
      const overrideFields: Record<string, any> = {};
      if (reconcileDiffs && rpId) {
        for (const d of reconcileDiffs) {
          if (reconcileOverrides[d.field] !== 'hrms') continue;
          if (d.status === "match") continue;
          // Use the ERP-side value from the diff row (already normalized).
          if (d.erp) overrideFields[d.field] = d.erp;
        }
      }
      if (Object.keys(overrideFields).length > 0) {
        toast.loading(`Pushing ${Object.keys(overrideFields).length} HRMS field(s) to RazorpayX…`, { id: toastId });
        const { data: editData, error: editErr } = await supabase.functions.invoke("razorpay-payroll-proxy", {
          body: { action: "edit_person_by_id", razorpay_employee_id: Number(rpId), fields: overrideFields },
        });
        if (editErr) throw new Error(`RazorpayX write-back failed: ${editErr.message || editErr}`);
        const resp = (editData || {}) as any;
        if (!resp.ok) throw new Error(`RazorpayX write-back rejected: ${resp.error || "unknown"}`);
      }
      // "Use RazorpayX" write-back: apply RP → HRMS now (deferred from click time).
      let effectiveForm = form;
      const onboardingPatchAgg: Record<string, any> = {};
      if (reconcileDiffs) {
        for (const d of reconcileDiffs) {
          if (reconcileOverrides[d.field] !== 'razorpay') continue;
          if (d.status === "match") continue;
          const { formPatch, onboardingPatch } = buildRazorpayPatch(d);
          if (formPatch) effectiveForm = { ...effectiveForm, ...formPatch };
          if (onboardingPatch) Object.assign(onboardingPatchAgg, onboardingPatch);
        }
      }
      if (Object.keys(onboardingPatchAgg).length > 0 && onboardingRecord?.id) {
        toast.loading(`Pulling ${Object.keys(onboardingPatchAgg).length} RazorpayX field(s) into HRMS…`, { id: toastId });
        const { error: pullErr } = await supabase
          .from("hr_employee_onboarding")
          .update({ ...onboardingPatchAgg, updated_at: new Date().toISOString() } as any)
          .eq("id", onboardingRecord.id);
        if (pullErr) throw new Error(`HRMS write-back failed: ${pullErr.message || pullErr}`);
        await queryClient.invalidateQueries({ queryKey: ["onboarding-record", onboardingRecord.id] });
      }
      // Persist form-level patches so subsequent stages see them.
      if (effectiveForm !== form) {
        setForm(effectiveForm);
      }

      const payload: any = {
        date_of_joining: effectiveForm.date_of_joining,
        essl_badge_id: effectiveForm.essl_badge_id,
        create_erp_account: effectiveForm.create_erp_account,
        erp_role_id: effectiveForm.erp_role_id,
        reporting_manager_id: effectiveForm.reporting_manager_id,
        razorpay_employee_id: effectiveForm.razorpay_employee_id.trim() || null,
        razorpay_hrms_overrides: reconcileOverrides,
        razorpay_reconciliation: reconcileDiffs
          ? { diffs: reconcileDiffs, overrides: reconcileOverrides, snapshot: rpSnapshot, finalized_at: new Date().toISOString() }
          : null,
      };
      const hasBankInputEff = !!(effectiveForm.bank_account_number.trim() && effectiveForm.bank_ifsc_code.trim());
      if (hasBankInputEff) {
        payload.bank_details = {
          account_number: effectiveForm.bank_account_number.trim(),
          ifsc_code: effectiveForm.bank_ifsc_code.trim().toUpperCase(),
          bank_name: effectiveForm.bank_name.trim() || null,
          branch: effectiveForm.bank_branch.trim() || null,
          account_holder: effectiveForm.bank_account_holder.trim() || null,
        };
      }
      console.log("[Stage5] Calling onFinalize with payload", payload);
      await onFinalize(payload);
      console.log("[Stage5] onFinalize resolved");

      // Post-finalize tally: re-fetch RazorpayX and diff against HRMS. Data
      // consistency across HRMS ↔ RazorpayX ↔ ESSL is a core rule, so we do
      // NOT trust the write-back responses alone — we read RazorpayX back and
      // confirm every field matches (or is explicitly overridden). If not,
      // revert the onboarding status so the operator can fix it.
      if (rpId) {
        toast.loading("Verifying RazorpayX ↔ HRMS tally…", { id: toastId });
        const { data: verifyData, error: verifyErr } = await supabase.functions.invoke(
          "razorpay-payroll-proxy",
          { body: { action: "read_person_by_id", razorpay_employee_id: Number(rpId) } },
        );
        if (verifyErr || !(verifyData as any)?.ok) {
          const msg = verifyErr?.message || (verifyData as any)?.error || "Could not re-read RazorpayX for tally.";
          if (onboardingRecord?.id) {
            await supabase.from("hr_employee_onboarding")
              .update({ status: "stage_4", updated_at: new Date().toISOString() } as any)
              .eq("id", onboardingRecord.id);
          }
          throw new Error(`Post-finalize verification failed: ${msg}`);
        }
        const snap = (verifyData as any).snapshot || {};
        const erpInputAfter = { ...buildErpInput(), ...(effectiveForm !== form ? {
          bank: {
            account_number: effectiveForm.bank_account_number,
            ifsc_code: effectiveForm.bank_ifsc_code,
            account_holder: effectiveForm.bank_account_holder,
          },
          date_of_joining: effectiveForm.date_of_joining || onboardingRecord?.date_of_joining,
        } : {}) };
        const verifyDiffs = reconcileOnboarding(erpInputAfter as any, snap);
        const unresolved = verifyDiffs.filter(d => d.status !== "match" && reconcileOverrides[d.field] !== 'hrms' && reconcileOverrides[d.field] !== 'razorpay');
        // Persist the fresh snapshot for the audit trail regardless of outcome.
        if (onboardingRecord?.id) {
          await supabase.from("hr_employee_onboarding")
            .update({
              razorpay_reconciliation: {
                diffs: verifyDiffs,
                overrides: reconcileOverrides,
                snapshot: snap,
                verified_at: new Date().toISOString(),
                verification_ok: unresolved.length === 0,
              },
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", onboardingRecord.id);
        }
        if (unresolved.length > 0) {
          // Roll status back so Completed list doesn't misrepresent state.
          if (onboardingRecord?.id) {
            await supabase.from("hr_employee_onboarding")
              .update({ status: "stage_4", updated_at: new Date().toISOString() } as any)
              .eq("id", onboardingRecord.id);
          }
          setReconcileDiffs(verifyDiffs);
          const names = unresolved.map(d => d.label).join(", ");
          throw new Error(
            `RazorpayX did not accept the following field(s) after Finalize: ${names}. ` +
            `Status kept at "In Progress" — retry Finalize after resolving.`,
          );
        }
      }

      const successMessage = `${firstName || "Employee"} ${lastName || ""}`.trim()
        ? `${`${firstName || "Employee"} ${lastName || ""}`.trim()} has been created and verified against RazorpayX.`
        : "Employee has been created and verified against RazorpayX.";
      setFinalizeFeedback({ kind: "success", message: successMessage });
      toast.success(successMessage, { id: toastId, description: "HRMS ↔ RazorpayX tally confirmed." });
    } catch (err: any) {
      console.error("[Stage5] onFinalize threw", err);
      const message = getFinalizeErrorMessage(err);
      setFinalizeFeedback({ kind: "error", message });
      toast.error("Employee creation failed", { id: toastId, description: message });
    } finally {
      setFinalizing(false);
    }
  };


  const firstName = onboardingRecord?.first_name || "";
  const lastName = onboardingRecord?.last_name || "";
  const generatedUsername = `${firstName.toLowerCase()}${lastName.toLowerCase()}`.replace(/\s/g, "");

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Stage 5: Finalization & System Activation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
          <p className="text-sm font-medium">Onboarding Summary</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Name:</span>
            <span>{firstName} {lastName}</span>
            <span className="text-muted-foreground">Email:</span>
            <span>{onboardingRecord?.email || "—"}</span>
            <span className="text-muted-foreground">CTC:</span>
            <span>{onboardingRecord?.ctc ? `₹${Number(onboardingRecord.ctc).toLocaleString()}` : "—"}</span>
            <span className="text-muted-foreground">Documents:</span>
            <Badge variant={onboardingRecord?.document_collection_status === "completed" ? "default" : "destructive"}>
              {onboardingRecord?.document_collection_status || "pending"}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Date of Joining *</Label>
            <Input
              type="date"
              value={form.date_of_joining}
              onChange={e => updateForm({ date_of_joining: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="sm:col-span-2">
            {/* Step 1 — create/verify RazorpayX identity first. */}
            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Cloud className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Step 1 — Create / Verify RazorpayX Employee ID</p>
                  <p className="text-xs text-muted-foreground">
                    {alreadyInRazorpay
                      ? `Already linked to RazorpayX Employee ID ${(razorpayMap as any)?.razorpay_employee_id}. Reuse this ID as the ESSL PIN below.`
                      : rpVerification?.ok
                        ? "Verified. This ID will be the HRMS badge, ESSL PIN, and RazorpayX employee ID."
                        : "First create the employee invite in RazorpayX. After the hire self-registers and RazorpayX shows the Employee ID, paste and verify that ID here. ESSL stays locked until verification."}
                  </p>
                </div>
                {(rpVerification?.ok || alreadyInRazorpay) && (
                  <Badge variant="default" className="font-mono shrink-0">
                    ID {form.razorpay_employee_id || (razorpayMap as any)?.razorpay_employee_id}
                  </Badge>
                )}
              </div>
              {!alreadyInRazorpay && (
                <div className="space-y-2">
                  <div className="rounded-md border bg-background/60 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium">Create RazorpayX employee invite</p>
                        <p className="text-[11px] text-muted-foreground">Uses this HRMS onboarding data to create the RazorpayX employee record first.</p>
                      </div>
                      {(() => {
                        const createStatus = razorpayCreateRequest?.status;
                        const alreadyCreated = createStatus === "created" || createStatus === "email_exists" || rpVerification?.ok;
                        return (
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleCreateRazorpayInvite}
                            disabled={readOnly || creatingRazorpayInvite || !razorpayChecklist.allOk || alreadyCreated}
                            title={alreadyCreated ? "Already created in RazorpayX — creating again would produce a duplicate." : undefined}
                          >
                            <Cloud className="h-3.5 w-3.5 mr-1.5" />
                            {creatingRazorpayInvite
                              ? "Creating…"
                              : alreadyCreated
                                ? "Already created in RazorpayX"
                                : createStatus
                                  ? "Retry RazorpayX create"
                                  : "Create in RazorpayX"}
                          </Button>
                        );
                      })()}
                    </div>
                    {!razorpayChecklist.allOk && (
                      <p className="text-[11px] text-warning flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>Complete before create: {razorpayChecklist.missing.join(", ")}</span>
                      </p>
                    )}
                    {razorpayCreateRequest?.status && (
                      <p className="text-[11px] text-muted-foreground">
                        Last RazorpayX create status: <span className="font-mono">{razorpayCreateRequest.status}</span>
                        {(razorpayCreateRequest.status === "created" || razorpayCreateRequest.status === "email_exists") && (
                          <> — paste and verify the Employee ID from the RazorpayX dashboard below.</>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[180px]">
                      <Label className="text-xs">RazorpayX Employee ID (from Razorpay dashboard)</Label>
                      <Input
                        placeholder="e.g. 77"
                        value={form.razorpay_employee_id}
                        onChange={e => {
                          const v = e.target.value.replace(/\D/g, "");
                          setRpVerification(null);
                          // Do NOT mirror into essl_badge_id here. The Badge ID
                          // stays empty until Verify with RazorpayX succeeds,
                          // so an unverified typed number can never create an
                          // ESSL PIN.
                          updateForm({ razorpay_employee_id: v, essl_badge_id: "" });
                        }}
                        disabled={readOnly}
                        className="font-mono"
                        inputMode="numeric"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleVerifyRazorpayId}
                      disabled={readOnly || verifyingRpId || !form.razorpay_employee_id.trim()}
                    >
                      <Cloud className="h-3.5 w-3.5 mr-1.5" />
                      {verifyingRpId ? "Verifying…" : "Verify with RazorpayX"}
                    </Button>
                  </div>
                  {rpVerification && (
                    <div className={`rounded-md border px-3 py-2 text-xs flex items-start gap-2 ${
                      rpVerification.ok
                        ? "border-success/40 bg-success/10 text-success"
                        : "border-destructive/40 bg-destructive/10 text-destructive"
                    }`}>
                      {rpVerification.ok
                        ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        : <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                      <div className="min-w-0">
                        <div className="font-medium">{rpVerification.message}</div>
                        {rpVerification.ok && (rpVerification.first_name || rpVerification.email) && (
                          <div className="text-[11px] opacity-80 mt-0.5">
                            RazorpayX profile:{" "}
                            <span className="font-mono">
                              {`${rpVerification.first_name || ""} ${rpVerification.last_name || ""}`.trim()}
                              {rpVerification.email ? ` · ${rpVerification.email}` : ""}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {reconcileDiffs && reconcileDiffs.length > 0 && (() => {
                    const mismatchDiffs = reconcileDiffs.filter(d => d.status !== "match");
                    return (
                    <div className="rounded-md border border-border bg-background/60 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium">
                          Field reconciliation — RazorpayX vs ERP draft
                        </div>
                        <Badge variant={reconcileReady ? "default" : "destructive"} className="text-[10px]">
                          {reconcileReady
                            ? "All fields reconciled"
                            : `${reconcileUnresolved} unresolved`}
                        </Badge>
                      </div>
                      {mismatchDiffs.length === 0 ? (
                        <div className="text-[11px] text-success flex items-center gap-1.5">
                          <CheckCircle2 className="h-3 w-3" />
                          All {reconcileDiffs.length} fields match RazorpayX — nothing to reconcile.
                        </div>
                      ) : (
                        <>
                          <div className="text-[11px] text-muted-foreground">
                            Only mismatched fields are shown. For each, pick one side. "Use HRMS" pushes the ERP draft value into RazorpayX on Finalize; "Use RazorpayX" copies the RazorpayX value into HRMS on Finalize.
                          </div>
                          <div className="divide-y divide-border">
                            {mismatchDiffs.map((d) => {
                              const choice = reconcileOverrides[d.field];
                              const rowOk = !!choice;
                              let rpDisplay = d.razorpay;
                              let erpDisplay = d.erp;
                              if (d.field === "reporting_manager") {
                                const rpBadge = String(d.rpRawValue || "").trim();
                                const erpBadgeMatch = /#(\d+)/.exec(d.erp || "");
                                const erpBadge = erpBadgeMatch ? erpBadgeMatch[1] : "";
                                const rpMgr = rpBadge ? (managers || []).find((m: any) => String(m.badge_id) === rpBadge) : null;
                                const erpMgr = erpBadge ? (managers || []).find((m: any) => String(m.badge_id) === erpBadge) : null;
                                const rpName = rpMgr ? `${rpMgr.first_name || ""} ${rpMgr.last_name || ""}`.trim() : "";
                                const erpName = erpMgr ? `${erpMgr.first_name || ""} ${erpMgr.last_name || ""}`.trim() : "";
                                rpDisplay = rpBadge ? (rpName ? `${rpName} (#${rpBadge})` : `Unknown employee (#${rpBadge})`) : "";
                                erpDisplay = erpBadge ? (erpName ? `${erpName} (#${erpBadge})` : d.erp) : "";
                              }
                              const hrmsActive = choice === 'hrms';
                              const rpActive = choice === 'razorpay';
                              return (
                                <div key={d.field} className="py-2 grid grid-cols-1 sm:grid-cols-[140px_1fr_1fr_auto] gap-2 items-start text-xs">
                                  <div className="flex items-center gap-1.5">
                                    {rowOk
                                      ? <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                                      : <AlertTriangle className="h-3 w-3 text-warning shrink-0" />}
                                    <span className="font-medium">{d.label}</span>
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">RazorpayX</div>
                                    <div className="font-mono break-all">{rpDisplay || <span className="opacity-50">—</span>}</div>
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">ERP draft</div>
                                    <div className="font-mono break-all text-warning">
                                      {erpDisplay || <span className="opacity-50">—</span>}
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-start sm:items-end gap-1">
                                    <div className="inline-flex rounded-md border border-border overflow-hidden">
                                      <button
                                        type="button"
                                        disabled={readOnly}
                                        onClick={() => setChoice(d.field, 'hrms')}
                                        className={`h-6 px-2 text-[11px] transition-colors ${hrmsActive ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                                      >
                                        Use HRMS
                                      </button>
                                      <button
                                        type="button"
                                        disabled={readOnly}
                                        onClick={() => setChoice(d.field, 'razorpay')}
                                        className={`h-6 px-2 text-[11px] border-l border-border transition-colors ${rpActive ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                                      >
                                        Use RazorpayX
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                    );
                  })()}
                  <p className="text-[11px] text-muted-foreground">
                    Tip: create the RazorpayX invite here first. The Employee ID appears on their RazorpayX profile only after they submit the self-registration form.
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label className="flex items-center gap-1.5">
              <Fingerprint className="h-3.5 w-3.5" /> Step 2 — ESSL Badge ID (device PIN) *
            </Label>
            <div className="mt-1">
              <Input
                placeholder={
                  alreadyInRazorpay || rpVerification?.ok
                    ? "Auto-filled from verified RazorpayX Employee ID"
                    : "Locked until RazorpayX Employee ID is verified"
                }
                value={form.essl_badge_id}
                readOnly
                disabled={readOnly || (!alreadyInRazorpay && !rpVerification?.ok)}
                className="font-mono"
              />
            </div>
            {!alreadyInRazorpay && !rpVerification?.ok && (
              <p className="text-[11px] text-muted-foreground mt-1.5 flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span>Send the RazorpayX invite, wait for the hire to self-register, then paste and verify the issued Employee ID above. The ESSL Badge ID unlocks only after successful verification.</span>
              </p>
            )}
            {pinStatus && !(bioAlreadyCreated && pinStatus.kind !== "conflict") && (
              <p className={`text-xs mt-1.5 flex items-start gap-1 ${
                pinStatus.kind === "ok" ? "text-success" :
                pinStatus.kind === "conflict" ? "text-destructive" :
                pinStatus.kind === "queued" ? "text-muted-foreground" :
                "text-warning"
              }`}>
                {pinStatus.kind === "ok"
                  ? <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" />
                  : <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />}
                <span>{pinStatus.msg}</span>
              </p>
            )}
            {bioAlreadyCreated && (
              <div className="mt-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <div className="font-medium">
                    Biometric identity created for {firstName} {lastName} (PIN {currentPinTrim}).
                  </div>
                  <div className="text-success/80">
                    Queued to IN + OUT devices. They will apply it on the next poll (30–60s). This action is locked to prevent duplicate identities from this onboarding.
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={readOnly || pushingToDevices || !form.essl_badge_id.trim() || bioAlreadyCreated || (!alreadyInRazorpay && !rpVerification?.ok)}
                onClick={handlePushToBiometric}
              >
                <Fingerprint className="h-3.5 w-3.5 mr-1.5" />
                {bioAlreadyCreated
                  ? "Already created on devices"
                  : pushingToDevices
                    ? "Queuing…"
                    : pinStatus?.kind === "ok"
                      ? "Update IN + OUT biometric devices"
                      : "Create on IN + OUT biometric devices"}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {bioAlreadyCreated
                  ? "Locked — this PIN is already registered. Delete the device user first if you need to re-create."
                  : "Queues a verified RazorpayX Employee ID as the eSSL PIN on both devices."}
              </span>
            </div>

          </div>
          <div>
            <Label>Reporting Manager</Label>
            <Select value={form.reporting_manager_id} onValueChange={v => updateForm({ reporting_manager_id: v })} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Select Manager" /></SelectTrigger>
              <SelectContent>
                {managers?.map(m => <SelectItem key={m.id} value={m.id}>{`${m.first_name} ${m.last_name || ''}`.trim()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Bank Details */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            <p className="text-sm font-medium">Bank Details (for salary payout)</p>
            <span className="text-xs text-muted-foreground ml-auto">Required for payroll</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>Account Holder Name</Label>
              <Input
                value={form.bank_account_holder}
                disabled
                readOnly
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Auto-filled from employee name — must match bank records.
              </p>
            </div>
            <div>
              <Label>Account Number</Label>
              <Input
                placeholder="e.g. 123456789012"
                value={form.bank_account_number}
                onChange={e => updateForm({ bank_account_number: e.target.value.replace(/\s/g, "") })}
                disabled={readOnly}
                className="font-mono"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label>IFSC Code</Label>
              <Input
                placeholder="e.g. HDFC0001234"
                value={form.bank_ifsc_code}
                onChange={e => updateForm({ bank_ifsc_code: e.target.value.toUpperCase().replace(/\s/g, "") })}
                disabled={readOnly}
                className="font-mono uppercase"
                maxLength={11}
              />
              {form.bank_ifsc_code && !ifscValid && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Invalid IFSC format
                </p>
              )}
            </div>
          </div>
        </div>




        {/* ERP Account */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Switch
              checked={form.create_erp_account}
              onCheckedChange={v => updateForm({ create_erp_account: v, erp_role_id: v ? form.erp_role_id : "" })}
              disabled={readOnly}
            />
            <Label>Create ERP Account & Send Credentials</Label>
          </div>
          {form.create_erp_account && (
            <div className="space-y-3 pl-2 border-l-2 ml-4">
              <div>
                <Label className="text-xs text-muted-foreground">Auto-generated Username</Label>
                <p className="text-sm font-mono bg-muted px-2 py-1 rounded">{generatedUsername || "—"}</p>
              </div>
              <div>
                <Label>Role *</Label>
                <Select
                  value={form.erp_role_id}
                  onValueChange={v => updateForm({ erp_role_id: v })}
                  disabled={readOnly}
                >
                  <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    {roles?.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="h-3 w-3 mt-0.5 text-warning" />
                <span>A system-generated password will be emailed. User will be forced to change it on first login.</span>
              </div>
            </div>
          )}
        </div>

        {!readOnly && (
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={handleBack}>← Back</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onSave?.(getDraftPayload()).then(() => toast.success("Draft saved"))}
            >
              Save Draft
            </Button>
            <Button
              onClick={handleFinalize}
              disabled={finalizing || !reconcileReady}
              className="bg-success hover:bg-success text-primary-foreground"
              title={reconcileReady ? undefined : reconcileBlockReason}
            >
              {finalizing ? "Creating Employee..." : "✅ Finalize & Create Employee"}
            </Button>
          </div>
        )}
        {!readOnly && !reconcileReady && reconcileBlockReason && (
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{reconcileBlockReason}</span>
          </div>
        )}

        {finalizeFeedback && (
          <div
            className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${
              finalizeFeedback.kind === "success"
                ? "border-success/30 bg-success/10 text-success"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {finalizeFeedback.kind === "success" ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <span className="whitespace-pre-line">{finalizeFeedback.message}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
