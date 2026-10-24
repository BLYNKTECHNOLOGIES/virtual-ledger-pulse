import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Copy, Download, Info, Loader2, X } from "lucide-react";
import { invalidatePlanning, useWorkforceLookups } from "@/hooks/hrms/useWorkforcePlanning";
import { CANDIDATE_LETTER_FIELDS, fetchCatalog, resolveSubjectValues, type CatalogField } from "@/lib/docResolvers";
import { LIVE_OFFER_COLUMNS, fetchLiveOffer } from "@/lib/hrms/offerFreshness";
import {
  catalogIndex,
  fixedSignatoryIdOf,
  isSystemMapping,
  letterSignatoryIds,
  parseFieldInput,
  placeholderKind,
  planLetter,
  signingSignatoryOf,
  templateSubject,
} from "@/lib/docLetterPlan";
import { issuePlannedLetter, prepareDocxRenderer, supersedeOlderOffers } from "@/lib/docIssue";
import { ensureIssuedPdf } from "@/lib/ensureIssuedPdf";
import type { PlaceholderMapping } from "@/lib/docTemplate";
import { joiningChoices } from "@/lib/hrms/prejoining";
import { joiningSendDateIST } from "@/lib/hrms/joiningBatch";
import {
  CUSTOM_JOINING,
  EMPLOYEE_TYPES,
  SEND_DIALOG_KEYS,
  changeLabels,
  describeOfferChanges,
  recordChangedSince,
  recordFieldWords,
  detailsFromRecord,
  draftFromDetails,
  joiningDateOf,
  offerChanges,
  offerPrefill,
  onboardingPatch,
  packageNeedsPublish,
  sendDetailProblems,
  showsShiftAfterTraining,
  SIGNED_BY_KEY,
  type LiveOffer,
  type SendDetails,
  type SendMode,
} from "@/lib/hrms/selfServiceSend";

type StepKey = "save" | "check" | "offer" | "package" | "deliver";
type Step = { key: StepKey; label: string; state: "pending" | "running" | "done" | "error"; detail?: string };

/** Select value for "no separate shift after training". */
const SAME_SHIFT = "__same__";

/** Call the onboarding-invite function and surface its own error message. */
async function invokeInvite(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("onboarding-invite", { body });
  let res = data as any;
  if (error && (error as any)?.context?.json) {
    try { res = await (error as any).context.json(); } catch { /* ignore */ }
  }
  if (error || res?.error) throw new Error(res?.error || error?.message || "The onboarding service did not respond");
  return res;
}

const fmtDay = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : iso;

/**
 * After a revision is issued and before it is sent, the candidate's form holds back the
 * offer it carries (only the newest offer is ever served): say how to undo that.
 */
function heldBack(previous: { id: string; reference_no: string } | null | undefined, revisionRef: string, carriedId: string | null): string {
  return previous?.reference_no && previous.id === carriedId
    ? ` Until ${revisionRef} is sent, the candidate's form holds back ${previous.reference_no}; to keep ${previous.reference_no} instead, revoke ${revisionRef} in Documents → Issued.`
    : "";
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export interface SendOnboardingFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onboardingId: string;
  /** The candidate already submitted the current form. */
  submitted?: boolean;
}

/**
 * HRMS → Onboarding → Stage 1 → "Send onboarding form".
 *
 * Asks once for everything the self-service form, the offer letter and E2 need,
 * saves it to the onboarding record (the fields Stage 1 and Stage 2 edit), issues
 * the offer from the active Offer Letter template (or reuses the live one when it
 * already says the same), publishes the joining package with that offer, and
 * emails the link with the offer attached.
 */
export function SendOnboardingFormDialog({ open, onOpenChange, onboardingId, submitted }: SendOnboardingFormDialogProps) {
  const qc = useQueryClient();
  const [session, setSession] = useState(0);
  useEffect(() => { if (open) setSession((s) => s + 1); }, [open]);

  const [mode, setMode] = useState<SendMode>("offer");
  const [details, setDetails] = useState<SendDetails | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [signerId, setSignerId] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [rawOverrides, setRawOverrides] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [emailIt, setEmailIt] = useState(true);
  const [attempted, setAttempted] = useState(false);
  const [showValues, setShowValues] = useState(false);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<{ link: string; sentTo?: string; offerReference?: string | null } | null>(null);
  const initialised = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLElement>(null);
  const prefilledFromOffer = useRef("");
  /**
   * The record as this dialog loaded it (then as it saved it). If a field a letter
   * reads changes elsewhere meanwhile, the send stops — it never overwrites someone
   * else's change or issues an offer from values HR has not seen.
   */
  const loaded = useRef<Record<string, any> | null>(null);

  const { data: record, error: recordError } = useQuery({
    queryKey: ["send_form_record", onboardingId, session],
    enabled: open && !!onboardingId,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_employee_onboarding").select("*").eq("id", onboardingId).single();
      if (error) throw error;
      return data as Record<string, any>;
    },
  });
  const { data: lookups } = useWorkforceLookups();
  const departments = useMemo(() => lookups?.departments ?? [], [lookups]);
  const positions = useMemo(
    () => (lookups?.positions ?? []) as Array<{ id: string; title: string; department_id: string | null }>,
    [lookups],
  );
  const shifts = useMemo(
    () => (lookups?.shifts ?? []) as Array<{ id: string; name: string; start_time?: string | null; end_time?: string | null; is_training_shift?: boolean | null }>,
    [lookups],
  );

  const { data: templates = [], isFetched: templatesLoaded } = useQuery({
    queryKey: ["hr_doc_templates", "active"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_doc_templates").select("*").eq("status", "active").order("name");
      if (error) throw error;
      return data || [];
    },
  });
  const offerTemplates = useMemo(
    () => (templates as any[]).filter((t) => t.category === "offer" && templateSubject(t) !== "employee" && t.current_version_id),
    [templates],
  );
  const { data: liveOffer } = useQuery({
    queryKey: ["send_form_live_offer", onboardingId, session],
    enabled: open && !!onboardingId,
    staleTime: 0,
    queryFn: () => fetchLiveOffer(onboardingId),
  });
  // The live offer's template stays the default, so sending again compares like with like.
  const template =
    offerTemplates.find((t) => t.id === templateId) ||
    offerTemplates.find((t) => t.id === liveOffer?.template_id) ||
    offerTemplates[0] ||
    null;

  const { data: version } = useQuery({
    queryKey: ["hr_doc_template_version", template?.current_version_id],
    enabled: open && !!template?.current_version_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_doc_template_versions").select("*").eq("id", template.current_version_id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: catalog = [] } = useQuery({ queryKey: ["hr_doc_field_catalog"], enabled: open, queryFn: fetchCatalog });
  const { data: signatories = [] } = useQuery({
    queryKey: ["hr_doc_signatories", "active"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_doc_signatories").select("*").eq("is_active", true).order("display_name");
      if (error) throw error;
      return data || [];
    },
  });
  const { data: me } = useQuery({ queryKey: ["hr_doc_actor"], queryFn: async () => (await supabase.auth.getUser()).data.user || null });
  const prejoining = (record?.prejoining || {}) as Record<string, any>;
  const packageEnabled = !!prejoining.enabled;
  const today = joiningSendDateIST(new Date());
  // Only upcoming batches can be offered (a resend never states a joining date that has passed).
  const choices = useMemo(() => joiningChoices(today), [today]);
  const hasTraining = !!(record?.post_training_ctc || record?.training_completion_date);
  const offerAvailable = !!template && !!version;
  const offerLoading = !!template && !version;

  // Prefill once per opening, from the record as it is now.
  useEffect(() => {
    if (!open || !record || initialised.current === session) return;
    initialised.current = session;
    loaded.current = { ...record };
    setDetails(detailsFromRecord(record, choices));
    setMode("offer");
    setOverrides({}); setRawOverrides({}); setFieldErrors({}); setSignerId(""); setTemplateId("");
    setAttempted(false); setShowValues(false); setSteps([]); setResult(null); setEmailIt(true);
  }, [open, record, session, choices]);
  // A joining package always carries an offer; without a template only the form can go.
  useEffect(() => {
    if (!open || !record) return;
    if (packageEnabled) setMode("offer");
    else if (templatesLoaded && !offerTemplates.length) setMode("form");
  }, [open, record, session, packageEnabled, templatesLoaded, offerTemplates.length]);

  const set = <K extends keyof SendDetails>(key: K, value: SendDetails[K]) =>
    setDetails((d) => {
      if (!d) return d;
      const next = { ...d, [key]: value };
      if (key === "department_id" && value !== d.department_id) next.position_id = "";
      if (key === "position_id") {
        const dept = positions.find((p) => p.id === value)?.department_id;
        if (dept) next.department_id = dept;
      }
      return next;
    });

  const trainingShift = !!details && !!shifts.find((s) => s.id === details.shift_id)?.is_training_shift;
  const afterTrainingShown = !!details && showsShiftAfterTraining(record, details.shift_id, shifts);
  const draft = useMemo(
    () => (details ? draftFromDetails(details, mode, positions, hasTraining, afterTrainingShown) : null),
    [details, mode, positions, hasTraining, afterTrainingShown],
  );
  const draftKey = JSON.stringify(draft);
  const settledKey = useDebounced(draftKey, 450);
  const settled = settledKey === draftKey;

  const { data: resolved, isFetching: resolving, error: resolveError } = useQuery({
    queryKey: ["send_form_resolved", onboardingId, session, settledKey, catalog.length, me?.email],
    enabled: open && settled && mode === "offer" && !!record && !!draft && offerAvailable && catalog.length > 0,
    placeholderData: (prev) => prev,
    queryFn: () =>
      resolveSubjectValues({ kind: "candidate", id: onboardingId, draft: JSON.parse(settledKey) }, catalog as CatalogField[], me?.email || undefined),
  });

  const mappings: PlaceholderMapping[] = useMemo(() => (version?.placeholder_map as PlaceholderMapping[]) || [], [version]);
  const byKey = useMemo(() => catalogIndex(catalog as CatalogField[]), [catalog]);
  const fixedSignatoryId = fixedSignatoryIdOf(mappings, byKey);
  const signingSignatory = useMemo(
    () => signingSignatoryOf(fixedSignatoryId, signerId, signatories as any[]),
    [fixedSignatoryId, signerId, signatories],
  );
  const isDocx = version?.lane === "docx" && !!version?.source_file_path;
  const usesLetterhead = isDocx && !!(version?.page_setup as any)?.letterhead;

  const { data: images = {} } = useQuery({
    queryKey: ["hr_doc_signature_urls", version?.id, signatories.length, catalog.length, (signingSignatory as any)?.id || null],
    enabled: open && mappings.some((m) => placeholderKind(m, byKey) !== "text" && (m.signatory_id || signingSignatory)),
    queryFn: async () => {
      const out: Record<string, string> = {};
      for (const m of mappings) {
        const kind = placeholderKind(m, byKey);
        if (kind === "text") continue;
        const s = m.signatory_id ? (signatories as any[]).find((x) => x.id === m.signatory_id) : signingSignatory;
        const path = kind === "seal" ? s?.seal_path : s?.signature_path;
        if (!path) continue;
        const { data: blob } = await supabase.storage.from("hr-doc-signatures").download(path);
        if (!blob) continue;
        out[m.token] = await new Promise<string>((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result));
          fr.onerror = () => rej(fr.error);
          fr.readAsDataURL(blob);
        });
      }
      return out;
    },
  });

  const planFor = (r: typeof resolved) =>
    planLetter({
      mappings,
      catalog: catalog as CatalogField[],
      signatories: signatories as any[],
      signerId,
      resolved: r,
      overrides,
      rawOverrides,
      isDocx,
      native: { html: version?.content_html, images, generatedBy: me?.email || "" },
      exclude: SEND_DIALOG_KEYS,
    });
  const plan = useMemo(
    () => planFor(resolved),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mappings, catalog, signatories, signerId, resolved, overrides, rawOverrides, isDocx, version, images, me?.email],
  );
  const missingSignatures = mappings.filter((m) => plan.imageTokens.has(m.token) && !images[m.token]).map((m) => m.token);

  /**
   * Terms HR typed for the live offer (probation extension, signatory designation,
   * an adjusted work location…) live only in that offer. Start from them, so sending
   * again keeps the same offer unless something really changed.
   */
  useEffect(() => {
    if (!open || !resolved || !liveOffer || !version) return;
    const key = `${session}:${liveOffer.id}:${version.id}`;
    if (prefilledFromOffer.current === key) return;
    prefilledFromOffer.current = key;
    if (liveOffer.template_version_id !== version.id) return;
    const snap = (liveOffer.values_snapshot || {}) as Record<string, unknown>;
    const typed = offerPrefill(snap, mappings, plan.promptFields, plan.editableFields);
    if (Object.keys(typed).length) {
      setRawOverrides((o) => ({ ...typed, ...o }));
      setOverrides((o) => ({ ...typed, ...o }));
    }
    const signer = String(snap[SIGNED_BY_KEY] || "");
    if (signer && !fixedSignatoryId && (signatories as any[]).some((s) => s.id === signer)) setSignerId((current) => current || signer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resolved, liveOffer, version, session]);

  const changes = useMemo(
    () => (liveOffer && resolved ? offerChanges(liveOffer, plan.docxValues, mappings, version?.id, overrides, (plan.signingSignatory as any)?.id) : []),
    [liveOffer, resolved, plan.docxValues, plan.signingSignatory, mappings, version?.id, overrides],
  );
  const joiningDate = details ? joiningDateOf(details) : "";
  const liveDateDiffers = !!liveOffer?.values_snapshot?.joining_date_iso && liveOffer.values_snapshot.joining_date_iso !== joiningDate;
  const offerAction: "issue" | "revise" | "reuse" = !liveOffer ? "issue" : changes.length || liveDateDiffers ? "revise" : "reuse";
  // A revision issued but not sent (a failed or concurrent send) leaves the form on an older offer.
  const carriedOffer = prejoining.enabled && prejoining.offer_file?.issued_id && liveOffer && prejoining.offer_file.issued_id !== liveOffer.id
    ? String(prejoining.offer_file.reference_no || prejoining.offer_reference || "an older offer")
    : null;
  const labelOf = (token: string) => {
    const m = mappings.find((x) => x.token === token);
    return (m?.field_key && byKey.get(m.field_key)?.label) || undefined;
  };
  /** What differs from the live offer, in words (salary figures read as one change). */
  const describeChanges = (tokens: string[]) => describeOfferChanges(tokens, mappings, byKey);

  const problems = details
    ? sendDetailProblems(details, { mode, shifts, today, choices, hasTraining })
    : {};
  const err = (k: keyof SendDetails) => (attempted ? problems[k] : undefined);
  const requirementWillClear = !!record?.hiring_requirement_id && !!details &&
    (details.position_id !== String(record.position_id || "") || details.department_id !== String(record.department_id || ""));

  /** Excluded keys are filled by the inputs above; what remains empty is listed for HR. */
  const offerBlockers = useMemo(() => {
    if (mode !== "offer") return [] as string[];
    if (!offerAvailable) return ["No active Offer Letter template"];
    const out: string[] = [];
    if (plan.needsSignerChoice) out.push("Choose who signs the offer");
    if (missingSignatures.length) out.push("The signatory has no signature image uploaded");
    if (Object.keys(fieldErrors).length) out.push("Correct the highlighted offer fields");
    const pendingInputs = plan.unresolvedTokens.filter((t) => {
      const key = mappings.find((m) => m.token === t)?.field_key || t;
      return !SEND_DIALOG_KEYS.has(key);
    });
    if (pendingInputs.length) out.push(`Fill: ${changeLabels(pendingInputs, labelOf).join(", ")}`);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, offerAvailable, plan, missingSignatures.length, fieldErrors, mappings]);

  const setFieldValue = (field: CatalogField, raw: string) => {
    const key = field.field_key;
    const { printable, error } = parseFieldInput(field, raw);
    const put = (o: Record<string, string>, v: string) => {
      const next = { ...o };
      if (v) next[key] = v; else delete next[key];
      return next;
    };
    setRawOverrides((o) => put(o, raw));
    setOverrides((o) => put(o, printable));
    setFieldErrors((o) => put(o, error));
  };

  const downloadDraft = async () => {
    if (!isDocx) return toast.error("Draft download is available for Word templates");
    try {
      const render = await prepareDocxRenderer({
        version, mappings, imageTokens: plan.imageTokens, images, docxValues: plan.docxValues, usesLetterhead, actorEmail: me?.email || null,
      });
      const blob = await render("BLY-DRAFT", true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DRAFT-DO-NOT-ISSUE-${String(template?.name || "offer").replace(/[^\w.-]+/g, "_")}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e: any) {
      toast.error(e?.message || "Could not build the draft");
    }
  };

  const markStep = (key: StepKey, state: Step["state"], detail?: string) =>
    setSteps((list) => list.map((s) => (s.key === key ? { ...s, state, detail: detail ?? s.detail } : s)));

  const run = async () => {
    if (!details || !record) return;
    setAttempted(true);
    if (Object.keys(problems).length) {
      setTimeout(() => bodyRef.current?.querySelector("[data-field-error]")?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
      return toast.error("Correct the highlighted details first");
    }
    if (offerBlockers.length) return toast.error(offerBlockers[0]);
    setBusy(true);
    setResult(null);
    const plannedSteps: Step[] = [
      { key: "save", label: "Save details to the onboarding record", state: "pending" },
      ...(mode === "offer"
        ? ([
            { key: "check", label: "Check the joining package", state: "pending" },
            { key: "offer", label: "Offer letter", state: "pending" },
            { key: "package", label: "Attach the offer and E2 to the form", state: "pending" },
          ] as Step[])
        : []),
      { key: "deliver", label: emailIt ? `Email the form to ${details.email.trim()}` : "Create the form link", state: "pending" },
    ];
    setSteps(plannedSteps);
    setTimeout(() => stepsRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    let current: StepKey = "save";
    const step = (key: StepKey) => { current = key; markStep(key, "running"); };
    try {
      const { data: auth } = await supabase.auth.getUser();
      const actor = { id: auth?.user?.id || null, email: auth?.user?.email || null };

      // 1. The record first: the offer is resolved from what is saved.
      step("save");
      const { data: fresh, error: freshErr } = await (supabase as any).from("hr_employee_onboarding").select("*").eq("id", onboardingId).single();
      if (freshErr) throw freshErr;
      if (["completed", "cancelled"].includes(fresh.status)) throw new Error("This onboarding is closed");
      const elsewhere = loaded.current ? recordChangedSince(loaded.current, fresh, CANDIDATE_LETTER_FIELDS) : [];
      if (elsewhere.length) {
        throw new Error(`This onboarding record was changed elsewhere while this dialog was open (${recordFieldWords(elsewhere).join(", ")}). Close and reopen it to send with the latest details.`);
      }
      const { patch, requirementCleared } = onboardingPatch(fresh, draftFromDetails(details, mode, positions, hasTraining, afterTrainingShown));
      const fields = Object.keys(patch);
      if (fields.length) {
        const { data: saved, error } = await (supabase as any).from("hr_employee_onboarding")
          .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", onboardingId).eq("updated_at", fresh.updated_at)
          .select("*").maybeSingle();
        if (error) throw error;
        if (!saved) throw new Error("This onboarding record was changed elsewhere just now. Close and reopen the dialog to send with the latest details.");
        // This dialog's own writes (and what the designation trigger derives from them) become its baseline.
        for (const k of [...fields, "job_role", "department_id"]) if (loaded.current) loaded.current[k] = saved[k];
        await (supabase as any).from("hr_onboarding_audit_log").insert({
          onboarding_id: onboardingId, stage: 1, action: "self_service_details_saved",
          changed_fields: { fields, source: "send_onboarding_form" }, performed_by: actor.id,
        }).then(() => {}, () => {});
      }
      markStep("save", "done", fields.length
        ? `${fields.length} field${fields.length === 1 ? "" : "s"} updated${requirementCleared ? " · hiring requirement link cleared — re-link it in Stage 1" : ""}`
        : "No changes");

      if (mode === "offer") {
        const doj = joiningDateOf(details);
        const customReason = details.joining_choice === CUSTOM_JOINING ? details.custom_reason.trim() : undefined;

        // 2. Refusals come before a reference number is used.
        step("check");
        await invokeInvite({ action: "publish-package", onboardingId, dryRun: true, joiningDate: doj, customReason });
        markStep("check", "done", `Joining ${fmtDay(doj)}`);

        // 3. The offer, from the saved record.
        step("offer");
        const resolvedNow = await resolveSubjectValues({ kind: "candidate", id: onboardingId }, catalog as CatalogField[], actor.email || undefined);
        const finalPlan = planFor(resolvedNow);
        if (finalPlan.unresolvedTokens.length) {
          throw new Error(`The offer letter still has empty values: ${changeLabels(finalPlan.unresolvedTokens, labelOf).join(", ")}`);
        }
        const liveNow = await fetchLiveOffer(onboardingId);
        const signedBy = (finalPlan.signingSignatory as any)?.id || null;
        const diff = liveNow ? offerChanges(liveNow, finalPlan.docxValues, mappings, version?.id, overrides, signedBy) : [];
        const dateDiffers = !!liveNow?.values_snapshot?.joining_date_iso && liveNow.values_snapshot.joining_date_iso !== doj;
        let offerId: string;
        let offerRef: string;
        // Set once a revision is issued and until the package carries it: the form holds the older offer back meanwhile.
        let pendingRevision: { ref: string; previous: LiveOffer | null } | null = null;
        const carriedId: string | null = fresh?.prejoining?.enabled ? String(fresh.prejoining.offer_file?.issued_id || "") || null : null;
        if (liveNow && !diff.length && !dateDiffers) {
          offerId = liveNow.id;
          offerRef = liveNow.reference_no;
          if (!liveNow.pdf_path) await ensureIssuedPdf(liveNow);
          markStep("offer", "done", `${offerRef} — unchanged, sent again`);
        } else {
          const issued = await issuePlannedLetter({
            template, version, mappings,
            values: finalPlan.values, tokenValues: finalPlan.tokenValues, docxValues: finalPlan.docxValues,
            images, imageTokens: finalPlan.imageTokens, resolved: resolvedNow, subjectKind: "candidate",
            signatoryIds: letterSignatoryIds(finalPlan, mappings), usesLetterhead, actor,
            extraSnapshot: { joining_date_iso: doj }, typedFields: overrides, signedBy,
            // Older offers are replaced only once this one is attached to the package.
            supersedePrevious: false,
            source: "onboarding_send", awaitPdf: true,
          });
          offerId = issued.issuedId;
          offerRef = issued.referenceNo;
          pendingRevision = { ref: offerRef, previous: liveNow };
          qc.invalidateQueries({ queryKey: ["hr_documents_issued"] });
          if (!issued.pdfPath) {
            try {
              const { data: row } = await (supabase as any).from("hr_documents_issued").select(LIVE_OFFER_COLUMNS).eq("id", offerId).single();
              await ensureIssuedPdf(row);
            } catch (e: any) {
              throw new Error(`Offer ${offerRef} was issued, but its PDF could not be made (${issued.pdfError || e?.message || "conversion failed"}). Send again to retry — the same offer is reused.${heldBack(liveNow, offerRef, carriedId)}`);
            }
          }
          markStep("offer", "done", liveNow ? `${offerRef} issued — revises ${liveNow.reference_no}` : `${offerRef} issued`);
        }

        // 4. The joining package carries this offer and date; republish only when it changed.
        step("package");
        const { data: pj } = await (supabase as any).from("hr_employee_onboarding").select("prejoining").eq("id", onboardingId).single();
        if (packageNeedsPublish(pj?.prejoining, offerId, doj)) {
          let published: any;
          try {
            published = await invokeInvite({ action: "publish-package", onboardingId, offerIssuedId: offerId, joiningDate: doj, customReason });
          } catch (e: any) {
            throw new Error(`${e?.message || "The joining package could not be updated"}${pendingRevision ? heldBack(pendingRevision.previous, pendingRevision.ref, carriedId) : ""}`);
          }
          if (loaded.current) loaded.current.date_of_joining = doj;
          markStep("package", "done", `Package version ${published?.prejoining?.version ?? ""}`.trim());
        } else {
          markStep("package", "done", "Already attached");
        }
        // Now the package carries this offer, older ones stop being valid (one live offer per candidate).
        const { replaced, failed } = await supersedeOlderOffers(onboardingId, { id: offerId, referenceNo: offerRef }, actor);
        if (replaced.length) markStep("offer", "done", `${offerRef} issued — replaces ${replaced.join(", ")}`);
        if (failed.length) toast.warning(`${failed.join(", ")} could not be marked as replaced — revoke it in Documents → Issued so only ${offerRef} stays valid.`);
        qc.invalidateQueries({ queryKey: ["prejoining-review", onboardingId] });
        qc.invalidateQueries({ queryKey: ["hr_documents_issued"] });
      }

      // 5. Deliver.
      step("deliver");
      const delivered = await invokeInvite(
        emailIt
          ? { action: "send", onboardingId, recipientEmail: details.email.trim() }
          : { action: "issue", onboardingId },
      );
      markStep("deliver", "done", emailIt
        ? `Sent to ${delivered.sentTo}${delivered.offerAttached ? " with the offer attached" : ""}`
        : "Link ready to share");
      setResult({ link: delivered.link, sentTo: delivered.sentTo, offerReference: delivered.offerReference || null });
      toast.success(emailIt ? `Onboarding form sent to ${delivered.sentTo}` : "Onboarding form link ready");
    } catch (e: any) {
      markStep(current, "error", e?.message || "Something went wrong");
      toast.error(e?.message || "Could not send the onboarding form");
    } finally {
      setBusy(false);
      // The dialog's own copy too (package state), without re-filling what HR typed.
      qc.invalidateQueries({ queryKey: ["send_form_record", onboardingId] });
      qc.invalidateQueries({ queryKey: ["onboarding-record", onboardingId] });
      qc.invalidateQueries({ queryKey: ["onboarding_invite", onboardingId] });
      qc.invalidateQueries({ queryKey: ["prejoining-review", onboardingId] });
      qc.invalidateQueries({ queryKey: ["onboarding_package_summary", onboardingId] });
      qc.invalidateQueries({ queryKey: ["onboarding-pipeline-records"] });
      qc.invalidateQueries({ queryKey: ["send_form_live_offer", onboardingId] });
      invalidatePlanning(qc);
    }
  };

  const loading = open && (!record || !details);
  const waitingForOffer = mode === "offer" && (offerLoading || (offerAvailable && (!settled || resolving || !resolved)));
  const sendLabel = mode === "offer"
    ? offerAction === "reuse" ? (emailIt ? "Send form and offer" : "Create link") : offerAction === "revise" ? (emailIt ? "Issue revised offer and send" : "Issue revised offer") : (emailIt ? "Issue offer and send" : "Issue offer and create link")
    : emailIt ? "Send form" : "Create link";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="md:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send onboarding form</DialogTitle>
          <DialogDescription>
            Everything the form, the offer letter and E2 need is asked here once and saved to this onboarding record.
          </DialogDescription>
        </DialogHeader>

        {recordError ? (
          <p className="text-sm text-destructive">{(recordError as any)?.message || "Could not load this onboarding record"}</p>
        ) : loading || !details ? (
          <div className="py-10 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div ref={bodyRef} className="space-y-6 min-w-0">
            <section className="space-y-2">
              <SectionTitle>What to send</SectionTitle>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as SendMode)} className="grid gap-2" disabled={busy}>
                <ModeOption
                  value="offer"
                  disabled={!offerAvailable}
                  title="Onboarding form with offer letter and E2"
                  description="The candidate downloads the offer letter and E2, signs both and uploads them with their documents. HR reviews the package before joining."
                />
                <ModeOption
                  value="form"
                  disabled={packageEnabled}
                  title="Onboarding form only"
                  description={packageEnabled ? "This candidate's joining package is already sent — send the offer again or a revised one instead." : "Personal, statutory and bank details with documents. No offer is attached."}
                />
              </RadioGroup>
              {!offerAvailable && (
                <p className="text-xs text-muted-foreground">To attach an offer, activate an Offer Letter template issued to candidates in HRMS → Documents.</p>
              )}
            </section>

            <section className="space-y-3">
              <SectionTitle>Candidate</SectionTitle>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="First name" required error={err("first_name")}>
                  <Input value={details.first_name} disabled={busy} onChange={(e) => set("first_name", e.target.value)} />
                </Field>
                <Field label="Last name">
                  <Input value={details.last_name} disabled={busy} onChange={(e) => set("last_name", e.target.value)} />
                </Field>
                <Field label="Personal email" required error={err("email")}>
                  <Input type="email" value={details.email} disabled={busy} onChange={(e) => set("email", e.target.value)} />
                </Field>
                <Field label="Mobile" required error={err("phone")}>
                  <Input inputMode="tel" value={details.phone} disabled={busy} onChange={(e) => set("phone", e.target.value)} />
                </Field>
              </div>
            </section>

            {mode === "offer" && (
              <section className="space-y-3">
                <SectionTitle>Role and pay</SectionTitle>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Department" required error={err("department_id")}>
                    <Select value={details.department_id} onValueChange={(v) => set("department_id", v)} disabled={busy}>
                      <SelectTrigger className="text-foreground"><SelectValue placeholder="Select department" /></SelectTrigger>
                      <SelectContent>{departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Designation" required error={err("position_id")}>
                    <Select value={details.position_id} onValueChange={(v) => set("position_id", v)} disabled={busy}>
                      <SelectTrigger className="text-foreground"><SelectValue placeholder="Select designation" /></SelectTrigger>
                      <SelectContent>
                        {positions.filter((p) => !details.department_id || p.department_id === details.department_id)
                          .map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Employee type" required error={err("employee_type")}>
                    <Select value={details.employee_type} onValueChange={(v) => set("employee_type", v)} disabled={busy}>
                      <SelectTrigger className="text-foreground"><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>{EMPLOYEE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Shift" required error={err("shift_id")}>
                    <Select value={details.shift_id} onValueChange={(v) => set("shift_id", v)} disabled={busy}>
                      <SelectTrigger className="text-foreground"><SelectValue placeholder="Select shift" /></SelectTrigger>
                      <SelectContent>
                        {shifts.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.is_training_shift ? " (training)" : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  {afterTrainingShown && (
                    <Field
                      label="Shift after training"
                      required={trainingShift}
                      error={err("post_training_shift_id")}
                      hint={details.post_training_shift_id ? "The offer states this shift." : "The offer states the shift on the left."}
                    >
                      <Select
                        value={details.post_training_shift_id || (trainingShift ? "" : SAME_SHIFT)}
                        onValueChange={(v) => set("post_training_shift_id", v === SAME_SHIFT ? "" : v)}
                        disabled={busy}
                      >
                        <SelectTrigger className="text-foreground"><SelectValue placeholder="Select shift" /></SelectTrigger>
                        <SelectContent>
                          {!trainingShift && <SelectItem value={SAME_SHIFT}>Same as shift</SelectItem>}
                          {shifts.filter((s) => !s.is_training_shift).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                  <Field
                    label={hasTraining ? "Annual CTC during training" : "Annual CTC"}
                    required
                    error={err("ctc")}
                    hint={hasTraining ? undefined : "Monthly CTC, the CTC in words and the salary break-up on the offer are worked out from this."}
                  >
                    <Input inputMode="decimal" placeholder="e.g. 1,63,200" value={details.ctc} disabled={busy} onChange={(e) => set("ctc", e.target.value)} />
                  </Field>
                  {hasTraining && (
                    <Field label="Annual CTC after training" required error={err("post_training_ctc")} hint="The offer states this CTC and its break-up. Training dates are set in Stage 2.">
                      <Input inputMode="decimal" value={details.post_training_ctc} disabled={busy} onChange={(e) => set("post_training_ctc", e.target.value)} />
                    </Field>
                  )}
                  <Field label="Date of joining" required error={err("joining_choice")}>
                    <Select value={details.joining_choice} onValueChange={(v) => set("joining_choice", v)} disabled={busy}>
                      <SelectTrigger className="text-foreground"><SelectValue placeholder="Select joining date" /></SelectTrigger>
                      <SelectContent>
                        {choices.map((d, i) => <SelectItem key={d} value={d}>{fmtDay(d)}{i === 0 ? " · next batch" : ""}</SelectItem>)}
                        <SelectItem value={CUSTOM_JOINING}>Custom date (uncommon cases)…</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {details.joining_choice === CUSTOM_JOINING && (
                    <>
                      <Field label="Custom joining date" required error={err("custom_date")}>
                        <Input type="date" className="text-foreground" min={today} value={details.custom_date} disabled={busy} onChange={(e) => set("custom_date", e.target.value)} />
                      </Field>
                      <Field label="Reason for the custom date" required error={err("custom_reason")}>
                        <Input value={details.custom_reason} placeholder="e.g. notice period ends on this date" disabled={busy} onChange={(e) => set("custom_reason", e.target.value)} />
                      </Field>
                    </>
                  )}
                  <Field label="Probation end date" error={err("probation_end_date")} hint="Optional — leave blank for the standard probation.">
                    <Input type="date" className="text-foreground" value={details.probation_end_date} disabled={busy} onChange={(e) => set("probation_end_date", e.target.value)} />
                  </Field>
                </div>
                {requirementWillClear && (
                  <Note tone="warn">Changing the department or designation clears the linked hiring requirement — re-link it in Stage 1 after sending.</Note>
                )}
              </section>
            )}

            {mode === "offer" && offerAvailable && (
              <section className="space-y-3">
                <div>
                  <SectionTitle>Offer letter</SectionTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">From the “{template?.name}” template{version?.source_file_name ? ` (${version.source_file_name})` : ""}.</p>
                </div>
                {offerTemplates.length > 1 && (
                  <Field label="Template">
                    <Select value={template?.id || ""} onValueChange={(v) => { setTemplateId(v); setOverrides({}); setRawOverrides({}); setFieldErrors({}); }} disabled={busy}>
                      <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent>{offerTemplates.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                )}

                <Note tone={offerAction === "revise" ? "warn" : "info"}>
                  {offerAction === "issue" && "A new offer letter is issued from this template when you send, and attached to the form and the email."}
                  {offerAction === "reuse" && (carriedOffer
                    ? `Offer ${liveOffer!.reference_no} already says this. The form still carries ${carriedOffer}; sending attaches ${liveOffer!.reference_no} instead and replaces ${carriedOffer}.`
                    : `Offer ${liveOffer!.reference_no} already says this — it is sent again as it is.`)}
                  {offerAction === "revise" && (
                    <>
                      Offer {liveOffer!.reference_no} differs
                      {changes.length ? ` in ${describeChanges(changes).slice(0, 6).join(", ")}` : " in the joining date"}
                      . A revised offer replaces it{submitted ? "; the candidate has already submitted and will be asked to sign the new offer and E2 again" : ""}.
                    </>
                  )}
                </Note>

                {plan.usesSignatory && (
                  <Field label="Signed by">
                    {fixedSignatoryId ? (
                      <p className="text-sm text-foreground">
                        {signingSignatory ? `${(signingSignatory as any).display_name}${(signingSignatory as any).designation ? ` — ${(signingSignatory as any).designation}` : ""}` : "The template's signatory is inactive — reactivate it in Documents."}
                      </p>
                    ) : (
                      <Select value={(signingSignatory as any)?.id || ""} onValueChange={setSignerId} disabled={busy}>
                        <SelectTrigger className="text-foreground"><SelectValue placeholder="Who signs the offer?" /></SelectTrigger>
                        <SelectContent>
                          {(signatories as any[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.display_name}{s.designation ? ` — ${s.designation}` : ""}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </Field>
                )}

                {resolveError && <p className="text-xs text-destructive">{(resolveError as any)?.message || "Could not read the offer values"}</p>}

                {plan.promptFields.length > 0 && (
                  <div className="space-y-3 rounded-md border border-amber-500/40 p-3">
                    <p className={`text-xs font-medium flex items-center gap-1.5 ${plan.stillToFill ? "text-amber-600" : "text-emerald-600"}`}>
                      {plan.stillToFill ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                      {plan.stillToFill ? `The offer needs ${plan.stillToFill} more detail${plan.stillToFill > 1 ? "s" : ""}` : "All offer details entered"}
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {plan.promptFields.map((f) => (
                        <LetterField
                          key={f.field_key}
                          field={f}
                          raw={rawOverrides[f.field_key] || ""}
                          error={fieldErrors[f.field_key]}
                          disabled={busy}
                          hint={f.field_key === "signatory_designation" ? "Add it to the signatory in Documents → Signatories to stop being asked." : undefined}
                          setValue={setFieldValue}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {plan.editableFields.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">Adjust if this offer differs</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {plan.editableFields.map((f) => (
                        <LetterField
                          key={f.field_key}
                          field={f}
                          raw={rawOverrides[f.field_key] || ""}
                          error={fieldErrors[f.field_key]}
                          disabled={busy}
                          current={plan.baseValues[f.field_key]}
                          setValue={setFieldValue}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {plan.notes.length > 0 && (
                  <div className="space-y-1">
                    {plan.notes.map((n) => (
                      <p key={n} className="text-[11px] text-muted-foreground flex gap-1.5"><Info className="h-3.5 w-3.5 shrink-0 text-sky-600 mt-px" />{n}</p>
                    ))}
                  </div>
                )}
                {missingSignatures.length > 0 && (
                  <Note tone="warn">The signatory for this offer has no signature image — upload it in Documents → Signatories.</Note>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => setShowValues((v) => !v)}>
                    {showValues ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
                    All {mappings.length} values on the offer
                  </Button>
                  {isDocx && (
                    <Button type="button" variant="outline" size="sm" className="h-8" disabled={busy || !resolved} onClick={downloadDraft}>
                      <Download className="h-3.5 w-3.5 mr-1.5" /> Draft .docx
                    </Button>
                  )}
                  {waitingForOffer && !resolveError && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Updating offer…</span>}
                </div>
                {showValues && (
                  <div className="rounded-md border border-border divide-y divide-border">
                    {mappings.map((m) => {
                      const system = isSystemMapping(m);
                      const image = plan.imageTokens.has(m.token);
                      const value = system ? "Allocated when issued" : image ? (images[m.token] ? "Signature image" : "") : plan.docxValues[m.token];
                      const label = (m.field_key && byKey.get(m.field_key)?.label) || m.token;
                      return (
                        <div key={m.token} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 px-3 py-1.5">
                          <p className="text-[11px] text-muted-foreground break-words">{label}</p>
                          <p className={`text-xs break-words ${value ? "text-foreground" : "text-amber-600"}`}>{value || "Needs input"}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {mode === "offer" && (
              <section className="space-y-2">
                <SectionTitle>E2 declaration</SectionTitle>
                <p className="text-xs text-muted-foreground">
                  Filled automatically — from the offer: reference, position, department, joining date and company; from the
                  candidate's form: name, date of birth, mobile, email, address, PAN and the four disclosures. The candidate
                  signs it by hand and uploads it with the signed offer.
                </p>
              </section>
            )}

            <section className="space-y-1.5">
              <label className="flex items-start gap-2 text-sm text-foreground">
                <Checkbox checked={emailIt} disabled={busy} onCheckedChange={(v) => setEmailIt(v === true)} className="mt-0.5" />
                <span>Email the link to {details.email.trim() || "the candidate"}{mode === "offer" ? ", with the offer letter attached" : ""}</span>
              </label>
              <p className="text-[11px] text-muted-foreground pl-6">Untick to only create the link and share it yourself. The link stays valid for 14 days.</p>
            </section>

            {steps.length > 0 && (
              <section ref={stepsRef} className="rounded-md border border-border p-3 space-y-2">
                {steps.map((s) => (
                  <div key={s.key} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5">
                      {s.state === "done" ? <Check className="h-4 w-4 text-emerald-600" /> : s.state === "running" ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : s.state === "error" ? <X className="h-4 w-4 text-destructive" /> : <span className="block h-4 w-4 rounded-full border border-border" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-foreground">{s.label}</p>
                      {s.detail && <p className={`text-xs break-words ${s.state === "error" ? "text-destructive" : "text-muted-foreground"}`}>{s.detail}</p>}
                    </div>
                  </div>
                ))}
                {result?.link && (
                  <div className="flex items-center gap-2 pt-1">
                    <Input readOnly value={result.link} className="text-xs" />
                    <Button type="button" variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(result.link); toast.success("Link copied"); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{result ? "Close" : "Cancel"}</Button>
          {!result && (
            <Button disabled={busy || loading || !details || waitingForOffer} onClick={run}>
              {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</> : sendLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>;
}

function ModeOption({ value, title, description, disabled }: { value: SendMode; title: string; description: string; disabled?: boolean }) {
  return (
    <Label htmlFor={`send-mode-${value}`} className={`flex items-start gap-3 rounded-md border border-border p-3 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <RadioGroupItem id={`send-mode-${value}`} value={value} disabled={disabled} className="mt-0.5" />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs font-normal text-muted-foreground">{description}</span>
      </span>
    </Label>
  );
}

function Field({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Label className="text-xs">{label}{required && <span className="text-destructive"> *</span>}</Label>
      <div className="mt-1">{children}</div>
      {error ? <p data-field-error className="text-[11px] text-destructive mt-1">{error}</p> : hint ? <p className="text-[11px] text-muted-foreground mt-1">{hint}</p> : null}
    </div>
  );
}

function Note({ tone, children }: { tone: "info" | "warn"; children: React.ReactNode }) {
  return (
    <p className={`text-xs rounded-md border p-2.5 flex gap-2 ${tone === "warn" ? "border-amber-500/40 text-amber-700 dark:text-amber-400" : "border-sky-500/30 text-muted-foreground"}`}>
      {tone === "warn" ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" /> : <Info className="h-3.5 w-3.5 shrink-0 mt-px text-sky-600" />}
      <span>{children}</span>
    </p>
  );
}

function LetterField({
  field, raw, current, hint, error, disabled, setValue,
}: {
  field: CatalogField;
  raw: string;
  current?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  setValue: (f: CatalogField, raw: string) => void;
}) {
  return (
    <div className="min-w-0">
      <Label className="text-xs">{field.label}</Label>
      <Input
        type={field.data_type === "date" ? "date" : "text"}
        inputMode={field.data_type === "currency" ? "decimal" : undefined}
        className={`mt-1 text-foreground ${error ? "border-destructive" : ""}`}
        aria-invalid={!!error}
        value={raw}
        disabled={disabled}
        placeholder={current || `Enter ${field.label.toLowerCase()}`}
        onChange={(e) => setValue(field, e.target.value)}
      />
      {current && !raw && <p className="text-[10px] text-muted-foreground mt-1">Currently: {current}</p>}
      {current && raw && raw.trim() !== current.trim() && (
        <p className="text-[10px] text-muted-foreground mt-1">The records say {current} — clear this field to use it.</p>
      )}
      {error && <p className="text-[10px] text-destructive mt-1">{error}</p>}
      {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
