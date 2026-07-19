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
import { CheckCircle2, AlertTriangle, Fingerprint, Landmark, Cloud, XCircle } from "lucide-react";

interface Stage5Props {
  onboardingRecord: any;
  onFinalize: (data: any) => Promise<void>;
  onBack: () => void;
  readOnly?: boolean;
}

export function Stage5Finalization({ onboardingRecord, onFinalize, onBack, readOnly }: Stage5Props) {
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
    create_in_razorpay: false,
  });
  const [finalizing, setFinalizing] = useState(false);
  const [pushingToDevices, setPushingToDevices] = useState(false);
  const [reservingRpId, setReservingRpId] = useState(false);
  const [reservedRpId, setReservedRpId] = useState<string | null>(null);
  const [finalizeFeedback, setFinalizeFeedback] = useState<null | { kind: "success" | "error"; message: string }>(null);
  const [pushFeedback, setPushFeedback] = useState<null | { pin: string; deviceCount: number; at: string }>(null);
  const pushingRef = useRef(false);
  const reservingRef = useRef(false);

  // Reserve the next RazorpayX employee ID (per Unified ID doctrine: this same
  // integer becomes the HRMS badge_id, ESSL device PIN, and Razorpay employee_id).
  // Auto-fills the ESSL badge field and flips the "create in Razorpay" toggle on
  // so the actual /people POST happens automatically at Finalize.
  const handleReserveRazorpayId = async () => {
    if (reservingRef.current || reservingRpId) return;
    reservingRef.current = true;
    setReservingRpId(true);
    const t = toast.loading("Reserving next RazorpayX employee ID…");
    try {
      const { data: nextId, error } = await supabase.rpc("hr_next_razorpay_employee_id");
      if (error) throw error;
      const id = String(nextId);
      setReservedRpId(id);
      setForm(p => ({ ...p, essl_badge_id: id, create_in_razorpay: true }));
      toast.success(`Reserved RazorpayX ID ${id} — same number will be the ESSL PIN.`, { id: t });
    } catch (e: any) {
      toast.error(`Reserve failed: ${e?.message || String(e)}`, { id: t });
    } finally {
      reservingRef.current = false;
      setReservingRpId(false);
    }
  };

  const handlePushToBiometric = async () => {
    const pin = form.essl_badge_id.trim();
    const name = `${onboardingRecord?.first_name || ""} ${onboardingRecord?.last_name || ""}`.trim();
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
    if (pinStatus?.kind === "ok" || existingPushLog) {
      toast.info(`PIN ${pin} is already registered on the biometric device(s). Skipping duplicate create.`);
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
    if (onboardingRecord) {
      const bd = (onboardingRecord.bank_details as any) || {};
      const empName = `${onboardingRecord.first_name || ""} ${onboardingRecord.last_name || ""}`.trim();
      setForm({
        date_of_joining: onboardingRecord.date_of_joining || "",
        essl_badge_id: onboardingRecord.essl_badge_id || "",
        create_erp_account: onboardingRecord.create_erp_account || false,
        erp_role_id: onboardingRecord.erp_role_id || "",
        reporting_manager_id: onboardingRecord.reporting_manager_id || "",
        bank_account_number: bd.account_number || existingBank?.account_number || "",
        bank_ifsc_code: bd.ifsc_code || existingBank?.ifsc_code || "",
        bank_name: "",
        bank_branch: "",
        bank_account_holder: empName,
        create_in_razorpay: false,
      });
    }
  }, [onboardingRecord, existingBank]);

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
      const data = await fetchAllPaginated<any>(() => supabase.from("hr_employees").select("id, first_name, last_name").eq("is_active", true).order("first_name"));
      return data;
    },
  });

  // Live eSSL device-user roster: only PINs actually seen by a device.
  const { data: devicePins = [], isLoading: pinsLoading } = useQuery({
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

  const pinStatus = useMemo(() => {
    const val = (form.essl_badge_id || "").trim();
    if (!val) return null as null | { kind: "empty" | "unknown" | "conflict" | "ok"; msg: string; matches?: any[] };
    const matches = (devicePins || []).filter((p: any) => (p.pin || "").trim() === val);
    if (matches.length === 0) return { kind: "unknown", msg: "PIN not seen on any active eSSL device yet — punches from this ID will be rejected until the device syncs.", matches };
    const usedByOther = new Set(usedBadgeIds.filter((b: string) => b !== (onboardingRecord?.essl_badge_id || "")));
    if (usedByOther.has(val)) return { kind: "conflict", msg: `PIN ${val} is already the badge ID of another finalized employee.`, matches };
    const canonical = canonicalDevicePins.find((p: any) => p.pin === val);
    const deviceCount = canonical?.deviceCount || matches.length;
    const deviceName = canonical?.name || matches.find((m: any) => m.name)?.name;
    return { kind: "ok", msg: `Found on ${deviceCount} device${deviceCount === 1 ? "" : "s"}${deviceName ? ` — device name: ${deviceName}` : ""}.`, matches };
  }, [form.essl_badge_id, devicePins, canonicalDevicePins, usedBadgeIds, onboardingRecord?.essl_badge_id]);

  const unassignedPins = useMemo(() => {
    const used = new Set(usedBadgeIds);
    // Keep the PIN currently on this onboarding record visible so HR can re-pick it.
    const currentPin = (form.essl_badge_id || "").trim();
    return canonicalDevicePins
      .filter((p: any) => !used.has(String(p.pin).trim()) || p.pin === currentPin)
      .sort((a: any, b: any) => Number(a.pin) - Number(b.pin));
  }, [canonicalDevicePins, usedBadgeIds, form.essl_badge_id]);

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
        .select("id, status, device_serial, created_at, triggered_from")
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

  // The identity is "already created" on devices when EITHER a live device
  // roster row exists for this PIN with a name (pinStatus.kind === "ok"),
  // OR we have a queued/ack pushback-log entry for this PIN.
  const bioAlreadyCreated = !!(pinStatus?.kind === "ok" || existingPushLog || pushFeedback);




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

  const validate = () => {
    if (!form.date_of_joining) { toast.error("Date of Joining is mandatory"); return false; }
    if (!form.essl_badge_id.trim()) { toast.error("ESSL Badge ID is mandatory"); return false; }
    if (pinStatus?.kind === "conflict") { toast.error(pinStatus.msg); return false; }
    if (form.create_in_razorpay && !razorpayChecklist.allOk) {
      toast.error(`Cannot create in Razorpay — missing: ${razorpayChecklist.missing.join(", ")}`);
      return false;
    }
    if (pinStatus?.kind === "unknown") {
      if (!window.confirm(`${pinStatus.msg}\n\nSave this PIN anyway?`)) {
        toast.message("Finalize cancelled — PIN not confirmed.");
        return false;
      }
    }
    if (form.create_erp_account && !form.erp_role_id) { toast.error("Please select a role for ERP account"); return false; }
    // Bank details: partial entry is invalid — either fully entered or fully blank
    const anyBank = form.bank_account_number.trim() || form.bank_ifsc_code.trim();
    if (anyBank && !hasBankInput) {
      toast.error("Enter both Account Number and IFSC, or leave both blank");
      return false;
    }
    if (form.bank_ifsc_code && !ifscValid) {
      toast.error("IFSC must be 11 characters (e.g. HDFC0001234)");
      return false;
    }
    // Payability warning (S2): confirm activation of an employee who can't be paid yet
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
    console.log("[Stage5] Finalize clicked", {
      form,
      pinStatus,
      hasBankInput,
      ifscValid,
      ctc: onboardingRecord?.ctc,
    });
    if (!validate()) {
      console.warn("[Stage5] Finalize validation blocked");
      return;
    }
    setFinalizing(true);
    const toastId = toast.loading("Creating employee…");
    try {
      const payload: any = {
        date_of_joining: form.date_of_joining,
        essl_badge_id: form.essl_badge_id,
        create_erp_account: form.create_erp_account,
        erp_role_id: form.erp_role_id,
        reporting_manager_id: form.reporting_manager_id,
        create_in_razorpay: form.create_in_razorpay && !alreadyInRazorpay,
      };
      if (hasBankInput) {
        payload.bank_details = {
          account_number: form.bank_account_number.trim(),
          ifsc_code: form.bank_ifsc_code.trim().toUpperCase(),
          bank_name: form.bank_name.trim() || null,
          branch: form.bank_branch.trim() || null,
          account_holder: form.bank_account_holder.trim() || null,
        };
      }
      console.log("[Stage5] Calling onFinalize with payload", payload);
      await onFinalize(payload);
      console.log("[Stage5] onFinalize resolved");
      const successMessage = `${firstName || "Employee"} ${lastName || ""}`.trim()
        ? `${`${firstName || "Employee"} ${lastName || ""}`.trim()} has been created successfully.`
        : "Employee has been created successfully.";
      setFinalizeFeedback({ kind: "success", message: successMessage });
      toast.success(successMessage, { id: toastId, description: "Onboarding is now marked as completed." });
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
              onChange={e => setForm(p => ({ ...p, date_of_joining: e.target.value }))}
              disabled={readOnly}
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="flex items-center gap-1.5">
              <Fingerprint className="h-3.5 w-3.5" /> ESSL Badge ID (device PIN) *
            </Label>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="e.g. 26012"
                value={form.essl_badge_id}
                onChange={e => setForm(p => ({ ...p, essl_badge_id: e.target.value }))}
                disabled={readOnly}
                className="font-mono"
              />
              <Select
                value=""
                onValueChange={v => setForm(p => ({ ...p, essl_badge_id: v }))}
                disabled={readOnly || pinsLoading || bioAlreadyCreated}
              >
                <SelectTrigger className="w-[190px] shrink-0">
                  <SelectValue placeholder={
                    bioAlreadyCreated
                      ? "Locked — already created"
                      : pinsLoading
                        ? "Loading…"
                        : `Pick unassigned (${unassignedPins.length})`
                  } />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {unassignedPins.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No unassigned PINs on any device.</div>
                  ) : unassignedPins.map((p: any) => (
                    <SelectItem key={p.pin} value={p.pin}>
                      <span className="font-mono">{p.pin}</span>
                      {p.name && <span className="text-muted-foreground"> · {p.name}</span>}
                      <span className="text-[10px] text-muted-foreground">
                        · {p.deviceCount} device{p.deviceCount === 1 ? "" : "s"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {pinStatus && (
              <p className={`text-xs mt-1.5 flex items-start gap-1 ${
                pinStatus.kind === "ok" ? "text-success" :
                pinStatus.kind === "conflict" ? "text-destructive" :
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
                    {pinStatus?.kind === "ok"
                      ? "Confirmed live on device roster — punches from this PIN will match this employee."
                      : "Queued to IN + OUT devices. They will apply it on the next poll (30–60s). This action is locked to prevent duplicate identities."}
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={readOnly || pushingToDevices || !form.essl_badge_id.trim() || bioAlreadyCreated}
                onClick={handlePushToBiometric}
              >
                <Fingerprint className="h-3.5 w-3.5 mr-1.5" />
                {bioAlreadyCreated
                  ? "Already created on devices"
                  : pushingToDevices
                    ? "Queuing…"
                    : "Create on IN + OUT biometric devices"}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {bioAlreadyCreated
                  ? "Locked — this PIN is already registered. Delete the device user first if you need to re-create."
                  : "Queues a name/PIN write to both eSSL devices. They apply it on the next poll (30–60s)."}
              </span>
            </div>

          </div>
          <div>
            <Label>Reporting Manager</Label>
            <Select value={form.reporting_manager_id} onValueChange={v => setForm(p => ({ ...p, reporting_manager_id: v }))} disabled={readOnly}>
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
                onChange={e => setForm(p => ({ ...p, bank_account_number: e.target.value.replace(/\s/g, "") }))}
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
                onChange={e => setForm(p => ({ ...p, bank_ifsc_code: e.target.value.toUpperCase().replace(/\s/g, "") }))}
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





        {/* RazorpayX Payroll — create employee record */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Cloud className="h-4 w-4 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">Also create in RazorpayX Payroll</p>
              <p className="text-xs text-muted-foreground">
                {alreadyInRazorpay
                  ? "Already linked to a Razorpay employee — no action needed."
                  : "Provisions this employee directly in Razorpay Payroll so they show up in the next payroll run."}
              </p>
            </div>
            <Switch
              checked={form.create_in_razorpay}
              onCheckedChange={v => setForm(p => ({ ...p, create_in_razorpay: v }))}
              disabled={readOnly || alreadyInRazorpay}
            />
          </div>
          {form.create_in_razorpay && !alreadyInRazorpay && (
            <div className="pl-2 border-l-2 ml-1 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Razorpay create checklist</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {razorpayChecklist.items.map(it => (
                  <li key={it.key} className="flex items-center gap-1.5">
                    {it.ok
                      ? <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                      : <XCircle className="h-3 w-3 text-destructive shrink-0" />}
                    <span className={it.ok ? "" : "text-destructive"}>{it.label}</span>
                  </li>
                ))}
              </ul>
              {!razorpayChecklist.allOk && (
                <p className="text-xs text-destructive flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>Fill the missing fields above (Stage 3 for PAN, Stage 1 for department, this stage for DOJ/bank) before enabling.</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Razorpay will trigger a penny-drop verification on the bank account; payouts remain blocked until it clears.
              </p>
            </div>
          )}
        </div>

        {/* ERP Account */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Switch
              checked={form.create_erp_account}
              onCheckedChange={v => setForm(p => ({ ...p, create_erp_account: v }))}
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
                  onValueChange={v => setForm(p => ({ ...p, erp_role_id: v }))}
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
            <Button variant="outline" onClick={onBack}>← Back</Button>
            <Button
              onClick={handleFinalize}
              disabled={finalizing}
              className="bg-success hover:bg-success text-primary-foreground"
            >
              {finalizing ? "Creating Employee..." : "✅ Finalize & Create Employee"}
            </Button>
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
            <span>{finalizeFeedback.message}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
