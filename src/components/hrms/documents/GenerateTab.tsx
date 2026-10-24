import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmployeeCombobox } from "@/components/hrms/EmployeePicker";
import { EmptyState } from "@/components/shared/EmptyState";
import { toast } from "sonner";
import { FilePlus2, Printer, AlertTriangle, ShieldAlert, FileCheck2, Info, Check } from "lucide-react";
import {
  fetchCatalog,
  resolveSubjectValues,
  type CatalogField,
  type SubjectKind,
} from "@/lib/docResolvers";
import { buildPrintDocument, printDocument } from "@/lib/docRender";
import type { PlaceholderMapping } from "@/lib/docTemplate";
import { fetchCompanyIdentity, resolveLetterhead } from "@/lib/companyIdentity";
import { safeFormat } from "@/lib/safe-date";
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
import { issuePlannedLetter, prepareDocxRenderer } from "@/lib/docIssue";

const OFFER_VIA_ONBOARDING =
  "This candidate's onboarding form carries their offer. Issue a new or revised offer from HRMS → Onboarding → Stage 1 → “Update and send again…”, so the form, E2 and email carry it too.";

/**
 * Does the candidate's open onboarding form carry their offer (a joining package)?
 * Then new offers come from Onboarding. After joining (or cancelling) Generate is free again.
 */
async function offerComesFromOnboarding(onboardingId: string): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .from("hr_employee_onboarding").select("prejoining, status").eq("id", onboardingId).maybeSingle();
  if (error) throw error;
  return !!data?.prejoining?.enabled && !["completed", "cancelled"].includes(String(data?.status || ""));
}

export function GenerateTab() {
  const qc = useQueryClient();
  const [templateId, setTemplateId] = useState("");
  const [subjectKind, setSubjectKind] = useState<SubjectKind>("employee");
  const [personId, setPersonId] = useState("");
  const [signerId, setSignerId] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  /** Raw (unformatted) operator input, kept so date pickers stay controlled. */
  const [rawOverrides, setRawOverrides] = useState<Record<string, string>>({});
  /** Inputs HR typed that cannot be used as they are (e.g. an amount that is not a number). */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [issuing, setIssuing] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["hr_doc_templates", "active"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_doc_templates").select("*").eq("status", "active").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const template = templates.find((t: any) => t.id === templateId);
  const allowed = templateSubject(template);

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_doc_generate_employees"],
    enabled: subjectKind === "employee",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employees").select("id,first_name,last_name,badge_id,is_active").order("first_name");
      if (error) throw error;
      return data || [];
    },
  });

  /** Candidates come from their onboarding record — the same form the self-service link fills. */
  const { data: candidates = [] } = useQuery({
    queryKey: ["hr_doc_generate_candidates"],
    enabled: subjectKind === "candidate",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employee_onboarding")
        .select("id,first_name,last_name,email,status,employee_id,date_of_joining,job_role")
        .or("status.is.null,status.neq.cancelled")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: catalog = [] } = useQuery({ queryKey: ["hr_doc_field_catalog"], queryFn: fetchCatalog });

  /** Offers for a candidate with a joining package are issued from Onboarding, so the form, E2 and email follow. */
  const { data: candidatePackaged } = useQuery({
    queryKey: ["hr_doc_candidate_package", personId],
    enabled: subjectKind === "candidate" && !!personId,
    staleTime: 0,
    queryFn: () => offerComesFromOnboarding(personId),
  });
  const offerViaOnboarding = template?.category === "offer" && subjectKind === "candidate" && !!candidatePackaged;
  /** One issue at a time: a second click while the first is checking or issuing does nothing. */
  const issuingRef = useRef(false);

  /** Universal letterhead every letter is printed on — header/footer are never overwritten. */
  const { data: letterhead } = useQuery({
    queryKey: ["hr_company_letterhead"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => resolveLetterhead(await fetchCompanyIdentity()),
  });

  const { data: version } = useQuery({
    queryKey: ["hr_doc_template_version", template?.current_version_id],
    enabled: !!template?.current_version_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_doc_template_versions").select("*").eq("id", template.current_version_id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: signatories = [] } = useQuery({
    queryKey: ["hr_doc_signatories", "active"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_doc_signatories").select("*").eq("is_active", true).order("display_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: me } = useQuery({
    queryKey: ["hr_doc_actor"],
    queryFn: async () => (await supabase.auth.getUser()).data.user || null,
  });

  const { data: resolved, error: resolveError } = useQuery({
    queryKey: ["hr_doc_resolved", subjectKind, personId, catalog.length, me?.email],
    enabled: !!personId && catalog.length > 0,
    queryFn: () => resolveSubjectValues({ kind: subjectKind, id: personId }, catalog as CatalogField[], me?.email || undefined),
  });

  // Signed URLs for every signatory image used by this template's mappings.
  const mappings: PlaceholderMapping[] = useMemo(
    () => (version?.placeholder_map as PlaceholderMapping[]) || [],
    [version]
  );

  const catalogByKey = useMemo(() => catalogIndex(catalog as CatalogField[]), [catalog]);

  /** Kind comes from the mapping, never from how the token happens to be spelled. */
  const kindOf = useMemo(
    () => (m: PlaceholderMapping) => placeholderKind(m, catalogByKey),
    [catalogByKey]
  );

  /** A signature image bound to a signatory fixes the signer; otherwise HR picks who signs. */
  const fixedSignatoryId = fixedSignatoryIdOf(mappings, catalogByKey);

  /** The signatory this letter is signed by — every signatory token follows it. */
  const signingSignatory = useMemo(
    () => signingSignatoryOf(fixedSignatoryId, signerId, signatories as any[]),
    [fixedSignatoryId, signerId, signatories]
  );

  const { data: images = {} } = useQuery({
    queryKey: ["hr_doc_signature_urls", version?.id, signatories.length, catalog.length, (signingSignatory as any)?.id || null],
    enabled: mappings.some((m) => kindOf(m) !== "text" && (m.signatory_id || signingSignatory)),
    queryFn: async () => {
      const out: Record<string, string> = {};
      for (const m of mappings) {
        if (kindOf(m) === "text") continue;
        // A slot bound to a signatory uses theirs; an unbound slot signs as the chosen signer.
        const s = m.signatory_id ? signatories.find((x: any) => x.id === m.signatory_id) : signingSignatory;
        const path = kindOf(m) === "seal" ? s?.seal_path : s?.signature_path;
        if (!path) continue;

        // Inline as a data URL so the frozen letter still renders after the
        // signed URL expires (issued artefacts must be self-contained).
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

  // A new template decides who it can be issued to.
  useEffect(() => {
    if (!template) return;
    if (allowed !== "any") setSubjectKind(allowed);
    setPersonId("");
    setSignerId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  useEffect(() => { setOverrides({}); setRawOverrides({}); setFieldErrors({}); }, [personId, templateId, subjectKind]);

  /**
   * Store both the raw input and its printable, formatted counterpart. An empty
   * input means "use the value from the records" again; an amount that cannot be
   * read exactly is refused with a message instead of being guessed.
   */
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

  /** Locked Word lane: the .docx is merged as-is, never converted to HTML. */
  const isDocx = version?.lane === "docx" && !!version?.source_file_path;
  const usesLetterhead = isDocx && !!(version?.page_setup as any)?.letterhead;

  /**
   * Everything about this letter for this person: the value of every variable,
   * what HR still has to type (decided from the records alone, so an input stays
   * on screen while HR types), what may be adjusted, and the notes to check.
   * Shared with the onboarding "Send onboarding form" dialog.
   */
  const plan = useMemo(
    () =>
      planLetter({
        mappings,
        catalog: catalog as CatalogField[],
        signatories: signatories as any[],
        signerId,
        resolved,
        overrides,
        rawOverrides,
        isDocx,
        native: { html: version?.content_html, images, generatedBy: me?.email || "" },
      }),
    [mappings, catalog, signatories, signerId, resolved, overrides, rawOverrides, isDocx, version, images, me?.email]
  );
  const {
    imageTokens, usesSignatory, tokenValues, baseValues, values, docxValues, rendered,
    promptFields, editableFields, stillToFill, unresolvedTokens, notes,
  } = plan;

  const isSystemToken = isSystemMapping;

  /**
   * Signature/seal placeholders whose signatory has no uploaded image.
   * The Word lane merges real images too, so an unsigned letter must never issue.
   */
  const missingSignatures = useMemo(
    () => mappings.filter((m) => imageTokens.has(m.token) && !images[m.token]).map((m) => m.token),
    [mappings, images, imageTokens]
  );

  /** Download a generated Word file (anchor must be in the DOM for Firefox). */
  const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  /**
   * Load everything a Word letter needs (template file, signature images, the
   * letterhead) once and return a renderer. Anything missing fails here, before
   * a reference number is allocated.
   */
  const prepareDocx = () =>
    prepareDocxRenderer({
      version, mappings, imageTokens, images, docxValues, usesLetterhead, letterhead, actorEmail: me?.email || null,
    });

  const fileStem = (s: string) => s.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

  const preview = async () => {
    if (isDocx) {
      try {
        const render = await prepareDocx();
        const blob = await render("BLY-DRAFT", true);
        saveBlob(blob, `DRAFT-DO-NOT-ISSUE-${fileStem(template?.name || "letter")}${resolved?.employeeName ? `-${fileStem(resolved.employeeName)}` : ""}.docx`);
        toast.success("Draft Word file downloaded — open it to check, then Issue");
      } catch (e: any) {
        toast.error(e?.message || "Could not build the draft Word file");
      }
      return;
    }
    if (!rendered) return toast.error("Pick a template with a saved version first");
    try {
      printDocument(buildPrintDocument(rendered.html, template?.name || "Draft", "DRAFT — not issued", letterhead));
    } catch (e: any) {
      toast.error(e?.message || "Could not open the print window");
    }
  };

  const issue = async () => {
    if ((!rendered && !isDocx) || !template || !version) return toast.error("Select a template");
    if (!personId || !resolved) return toast.error(subjectKind === "candidate" ? "Select a candidate" : "Select an employee");
    if (unresolvedTokens.length > 0) return toast.error("Fill the remaining fields before issuing");
    if (missingSignatures.length > 0) return toast.error("Upload the signature image for this template's signatory first");
    if (Object.keys(fieldErrors).length > 0) return toast.error("Correct the highlighted fields before issuing");
    if (issuingRef.current) return;
    issuingRef.current = true;
    setIssuing(true);
    try {
      if (template.category === "offer" && subjectKind === "candidate") {
        let viaOnboarding = false;
        try {
          viaOnboarding = await offerComesFromOnboarding(personId);
        } catch (e: any) {
          toast.error(e?.message || "Could not check the candidate's onboarding form");
          return;
        }
        if (viaOnboarding) {
          qc.invalidateQueries({ queryKey: ["hr_doc_candidate_package", personId] });
          toast.error(OFFER_VIA_ONBOARDING);
          return;
        }
      }
      const { data: auth } = await supabase.auth.getUser();
      const result = await issuePlannedLetter({
        template,
        version,
        mappings,
        values,
        tokenValues,
        docxValues,
        images,
        imageTokens,
        resolved,
        subjectKind,
        signatoryIds: letterSignatoryIds(plan, mappings),
        usesLetterhead,
        letterhead,
        actor: { id: auth?.user?.id || null, email: auth?.user?.email || null },
        typedFields: overrides,
        signedBy: (plan.signingSignatory as any)?.id || null,
        source: "documents_generate",
      });
      const { referenceNo: refNo, linkedEmployeeId, pdfBlob, docxBlob, fullHtml } = result;
      const safeRef = refNo.replace(/[^\w.-]+/g, "_");

      if (result.filingFailed) toast.warning("Letter issued, but it could not be filed under the employee's documents.");
      if (result.replaced.length) {
        toast.info(`Replaces ${result.replaced.join(", ")}, which is no longer valid.`);
      }
      if (result.replaceFailed.length) {
        toast.warning(`${result.replaceFailed.join(", ")} could not be marked as replaced — revoke it in the Issued tab so only one offer stays valid.`);
      }
      // Word lane: the PDF is converted server-side in the background.
      result.pdfConversion?.then((pdfPath) => {
        if (!pdfPath) return;
        qc.invalidateQueries({ queryKey: ["hr_documents_issued"] });
        if (linkedEmployeeId) qc.invalidateQueries({ queryKey: ["hr_employee_documents", linkedEmployeeId] });
      });

      qc.invalidateQueries({ queryKey: ["hr_documents_issued"] });
      if (linkedEmployeeId) qc.invalidateQueries({ queryKey: ["hr_employee_documents", linkedEmployeeId] });
      toast.success(`Issued ${refNo}`);
      if (pdfBlob) {
        saveBlob(pdfBlob, `${safeRef}.pdf`);
        toast.info(linkedEmployeeId ? "PDF archived and filed under the employee's documents" : "PDF archived — it moves to the employee's documents when they join");
      } else if (!isDocx) {
        toast.warning("Letter issued, but the PDF could not be generated — download it from the Issued tab.");
      }
      if (isDocx && docxBlob) {
        saveBlob(docxBlob, `${safeRef}.docx`);
      } else if (!pdfBlob) {
        try {
          printDocument(fullHtml);
        } catch {
          toast.warning("Letter saved. Pop-up blocked — re-print it from the Issued tab.");
        }
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not issue the letter");
    } finally {
      issuingRef.current = false;
      setIssuing(false);
    }
  };

  const employeeOptions = employees.map((e: any) => ({
    value: e.id,
    label: [e.first_name, e.last_name].filter(Boolean).join(" ") + (e.is_active ? "" : " (inactive)"),
    keywords: e.badge_id || "",
  }));

  const candidateOptions = candidates.map((c: any) => {
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Unnamed candidate";
    const when = c.status === "completed"
      ? " (joined)"
      : c.employee_id
        ? " (employee record created)"
        : c.date_of_joining ? ` · joins ${safeFormat(c.date_of_joining, "dd MMM yyyy", "")}` : "";
    return {
      value: c.id,
      label: `${name}${c.job_role ? ` — ${c.job_role}` : ""}${when}`,
      keywords: [c.email, c.job_role].filter(Boolean).join(" "),
    };
  });

  if (templates.length === 0) {
    return <EmptyState icon={FilePlus2} title="No active templates" description="Create a template first, then come back here to generate letters." />;
  }

  const ready = !!personId && !!resolved;
  const canIssue = ready && (!!rendered || isDocx) && !issuing && unresolvedTokens.length === 0 &&
    missingSignatures.length === 0 && Object.keys(fieldErrors).length === 0 && !offerViaOnboarding;

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <Label className="text-xs">Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="h-9 mt-1 text-foreground"><SelectValue placeholder="Select template" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {template?.contains_sensitive && (
                <p className="text-[11px] text-amber-600 mt-1.5 flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" /> Contains salary figures
                </p>
              )}
            </div>

            {allowed === "any" && (
              <div>
                <Label className="text-xs">Issue to</Label>
                <div className="mt-1">
                  <SegmentedControl
                    size="sm"
                    aria-label="Issue to"
                    value={subjectKind}
                    onValueChange={(v) => { setSubjectKind(v as SubjectKind); setPersonId(""); }}
                    options={[{ value: "employee", label: "Employee" }, { value: "candidate", label: "Candidate" }]}
                  />
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs">{subjectKind === "candidate" ? "Candidate (onboarding record)" : "Employee"}</Label>
              <div className="mt-1">
                {subjectKind === "candidate" ? (
                  <EmployeeCombobox
                    options={candidateOptions}
                    value={personId}
                    onChange={setPersonId}
                    placeholder="Candidate"
                    searchPlaceholder="Search name, email or role…"
                    emptyText="No onboarding record found."
                  />
                ) : (
                  <EmployeeCombobox options={employeeOptions} value={personId} onChange={setPersonId} />
                )}
              </div>
              {subjectKind === "candidate" && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Details come from the candidate's onboarding form; salary from its CTC with the standard structure.
                </p>
              )}
              {offerViaOnboarding && (
                <p role="status" className="text-[11px] text-amber-600 mt-1.5 flex gap-1.5">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
                  <span>{OFFER_VIA_ONBOARDING}</span>
                </p>
              )}
            </div>

            {usesSignatory && (
              <div>
                <Label className="text-xs">Signed by</Label>
                {fixedSignatoryId ? (
                  <p className="text-xs text-foreground mt-1">
                    {signingSignatory
                      ? `${(signingSignatory as any).display_name}${(signingSignatory as any).designation ? ` — ${(signingSignatory as any).designation}` : ""}`
                      : "The template's signatory is inactive — reactivate it or remap the signature."}
                    <span className="block text-[10px] text-muted-foreground">Set by the signature on this template.</span>
                  </p>
                ) : (
                  <Select value={(signingSignatory as any)?.id || ""} onValueChange={setSignerId}>
                    <SelectTrigger className="h-9 mt-1 text-foreground"><SelectValue placeholder="Who signs this letter?" /></SelectTrigger>
                    <SelectContent>
                      {signatories.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.display_name}{s.designation ? ` — ${s.designation}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {resolveError && personId && (
          <Card className="border-destructive/40">
            <CardContent className="p-4 text-xs text-destructive">
              {(resolveError as any)?.message || "Could not read this person's details"}
            </CardContent>
          </Card>
        )}

        {ready && notes.length > 0 && (
          <Card className="border-sky-500/30">
            <CardContent className="p-4 space-y-1.5">
              <p className="text-xs font-medium flex items-center gap-1.5 text-sky-600">
                <Info className="h-3.5 w-3.5" /> Check before issuing
              </p>
              {notes.map((n) => (
                <p key={n} className="text-[11px] text-muted-foreground">{n}</p>
              ))}
            </CardContent>
          </Card>
        )}

        {ready && promptFields.length > 0 && (
          <Card className={stillToFill > 0 ? "border-amber-500/40" : ""}>
            <CardContent className="p-4 space-y-3">
              <p className={`text-xs font-medium flex items-center gap-1.5 ${stillToFill > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {stillToFill > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                {stillToFill > 0
                  ? `${stillToFill} field${stillToFill > 1 ? "s" : ""} need your input`
                  : "All missing details entered"}
              </p>
              {promptFields.map((f) => (
                <FieldInput
                  key={f.field_key}
                  field={f}
                  raw={rawOverrides[f.field_key] || ""}
                  error={fieldErrors[f.field_key]}
                  hint={
                    f.field_key === "annual_ctc"
                      ? "Monthly CTC, CTC in words and the salary break-up are worked out from this. It is used for this letter only — put the same CTC on the onboarding record so payroll matches."
                      : f.field_key === "signatory_designation"
                        ? "Add it to the signatory in the Signatories tab to stop being asked."
                        : undefined
                  }
                  setValue={setFieldValue}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {ready && editableFields.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-medium text-foreground">Adjust before issuing</p>
              <p className="text-[11px] text-muted-foreground -mt-1.5">
                Resolved automatically — change them if this letter should carry a different date or term.
              </p>
              {editableFields.map((f) => (
                <FieldInput
                  key={f.field_key}
                  field={f}
                  raw={rawOverrides[f.field_key] || ""}
                  error={fieldErrors[f.field_key]}
                  placeholderText={baseValues[f.field_key]}
                  setValue={setFieldValue}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {missingSignatures.length > 0 && (
          <Card className="border-destructive/40">
            <CardContent className="p-4">
              <p className="text-xs font-medium flex items-center gap-1.5 text-destructive">
                <ShieldAlert className="h-3.5 w-3.5" /> No signature image for {missingSignatures.join(", ")}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Map the placeholder to a signatory and upload their signature in the Signatories tab.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="h-9 flex-1" onClick={preview} disabled={!ready || (!rendered && !isDocx)}>
            <Printer className="h-4 w-4 mr-1.5" /> {isDocx ? "Draft .docx" : "Preview"}
          </Button>
          <Button className="h-9 flex-1" onClick={issue} disabled={!canIssue}>
            <FileCheck2 className="h-4 w-4 mr-1.5" /> {issuing ? "Issuing…" : "Issue letter"}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {isDocx
            ? `Issuing allocates a reference number, merges the values into the original Word file${usesLetterhead ? " on the company letterhead" : ""}, archives a PDF and downloads the Word file.`
            : "Issuing allocates a reference number, freezes the merged letter and its values, then opens the browser print dialog — choose “Save as PDF”."}
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {isDocx ? (
            !ready ? (
              <div className="p-10">
                <EmptyState
                  icon={FileCheck2}
                  title="Locked Word template"
                  description={`${version?.source_file_name || "This template"} is merged inside the original Word file. Pick ${subjectKind === "candidate" ? "a candidate" : "an employee"} to see every value that will go into it; use “Draft .docx” to check the finished file.`}
                />
              </div>
            ) : (
              <ValuesTable
                mappings={mappings}
                catalogByKey={catalogByKey}
                docxValues={docxValues}
                imageTokens={imageTokens}
                images={images}
                overrides={overrides}
                isSystem={isSystemToken}
                fileName={version?.source_file_name}
                letterhead={usesLetterhead}
              />
            )
          ) : !rendered || !ready ? (
            <div className="p-10">
              <EmptyState icon={FilePlus2} title="Nothing to preview yet" description={`Select a template and ${subjectKind === "candidate" ? "a candidate" : "an employee"}.`} />
            </div>
          ) : (
            <div className="bg-muted/40 p-4 overflow-auto max-h-[70vh]">
              <div className="mx-auto bg-white text-black shadow-sm" style={{ width: "210mm", minHeight: "297mm", padding: "20mm 18mm", boxSizing: "border-box", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "12pt", lineHeight: 1.6 }}>
                <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Every variable of a Word template with the value it will receive — the check before issuing. */
function ValuesTable({
  mappings, catalogByKey, docxValues, imageTokens, images, overrides, isSystem, fileName, letterhead,
}: {
  mappings: PlaceholderMapping[];
  catalogByKey: Map<string, CatalogField>;
  docxValues: Record<string, string>;
  imageTokens: Set<string>;
  images: Record<string, string>;
  overrides: Record<string, string>;
  isSystem: (m: PlaceholderMapping) => boolean;
  fileName?: string | null;
  letterhead: boolean;
}) {
  const filled = mappings.filter((m) => isSystem(m) || (imageTokens.has(m.token) ? !!images[m.token] : !!docxValues[m.token])).length;
  return (
    <div className="p-4 space-y-3 overflow-auto max-h-[75vh]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{fileName || "Word template"}</p>
        <div className="flex gap-1.5">
          {letterhead && <Badge variant="outline" className="text-[10px]">On company letterhead</Badge>}
          <Badge variant="outline" className={`text-[10px] ${filled === mappings.length ? "text-emerald-600 border-emerald-500/40" : "text-amber-600 border-amber-500/40"}`}>
            {filled} / {mappings.length} variables filled
          </Badge>
        </div>
      </div>
      <div className="rounded-md border border-border divide-y divide-border">
        {mappings.map((m) => {
          const field = m.field_key ? catalogByKey.get(m.field_key) : undefined;
          const system = isSystem(m);
          const image = imageTokens.has(m.token);
          const value = system ? "Allocated when issued" : image ? (images[m.token] ? "Signature image" : "") : docxValues[m.token];
          const typed = !!(m.field_key && overrides[m.field_key]);
          return (
            <div key={m.token} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-start gap-3 px-3 py-2">
              <div className="min-w-0">
                <code className="text-[11px] text-foreground break-all">{`{{${m.token.toUpperCase()}}}`}</code>
                <p className="text-[10px] text-muted-foreground truncate">{field?.label || "Not mapped"}</p>
              </div>
              <p className={`text-xs break-words ${value ? "text-foreground" : "text-amber-600"}`}>{value || "Needs input"}</p>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {system ? "system" : !value ? "—" : typed ? "entered" : "auto"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FieldInput({
  field, raw, placeholderText, hint, error, setValue,
}: {
  field: CatalogField;
  raw: string;
  placeholderText?: string;
  hint?: string;
  error?: string;
  setValue: (f: CatalogField, raw: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{field.label}</Label>
      <Input
        type={field.data_type === "date" ? "date" : "text"}
        inputMode={field.data_type === "currency" ? "decimal" : undefined}
        className={`h-9 mt-1 text-foreground ${error ? "border-destructive" : ""}`}
        aria-invalid={!!error}
        value={raw}
        placeholder={placeholderText || `Enter ${field.label.toLowerCase()}`}
        onChange={(e) => setValue(field, e.target.value)}
      />
      {placeholderText && !raw && (
        <p className="text-[10px] text-muted-foreground mt-1">Currently: {placeholderText}</p>
      )}
      {error && <p className="text-[10px] text-destructive mt-1">{error}</p>}
      {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export default GenerateTab;
