import { useEffect, useMemo, useState } from "react";
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
  formatValue,
  salaryValues,
  isCtcDerivedResolver,
  SYSTEM_FILLED_KEYS,
  ALWAYS_EDITABLE_KEYS,
  type CatalogField,
  type SubjectKind,
} from "@/lib/docResolvers";
import { MIN_ANNUAL_CTC, componentFieldStem, parseAmount } from "@/lib/docCtcBreakdown";
import { renderTemplateHtml, buildPrintDocument, printDocument } from "@/lib/docRender";
import type { PlaceholderMapping } from "@/lib/docTemplate";
import { fetchCompanyIdentity, resolveLetterhead } from "@/lib/companyIdentity";
import { safeFormat } from "@/lib/safe-date";

type TemplateSubject = "employee" | "candidate" | "any";

/** Who a template is issued to — offer letters go to candidates by default. */
export function templateSubject(t: any): TemplateSubject {
  if (t?.subject === "employee" || t?.subject === "candidate" || t?.subject === "any") return t.subject;
  return t?.category === "offer" ? "candidate" : "employee";
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

  const catalogByKey = useMemo(
    () => new Map((catalog as CatalogField[]).map((c) => [c.field_key, c])),
    [catalog]
  );

  /**
   * Placeholder kind comes from the mapping (explicit `kind`, else the mapped
   * catalog field's data_type) — never from how the token happens to be spelled,
   * so {gm_signature} or {authorised_signatory} behave correctly.
   */
  const kindOf = useMemo(() => {
    return (m: PlaceholderMapping): "text" | "signature" | "seal" => {
      if (m.kind) return m.kind;
      const dt = m.field_key ? catalogByKey.get(m.field_key)?.data_type : undefined;
      if (dt === "signature") return "signature";
      if (dt === "image") return "seal";
      return "text";
    };
  }, [catalogByKey]);

  const imageTokens = useMemo(
    () => new Set(mappings.filter((m) => kindOf(m) !== "text").map((m) => m.token)),
    [mappings, kindOf]
  );

  /** A signature image bound to a signatory fixes the signer; otherwise HR picks who signs. */
  const fixedSignatoryId =
    mappings.find((m) => m.signatory_id && kindOf(m) !== "text")?.signatory_id || null;
  const usesSignatory = mappings.some(
    (m) => kindOf(m) !== "text" || m.field_key === "signatory_name" || m.field_key === "signatory_designation" ||
      /^signatory_name|^hr_name|_signatory_name|^signatory_designation|^hr_designation/.test(m.token)
  );

  /** The signatory this letter is signed by — every signatory token follows it. */
  const signingSignatory = useMemo(() => {
    const id = fixedSignatoryId || signerId || (signatories.length === 1 ? (signatories[0] as any).id : null);
    return signatories.find((x: any) => x.id === id) || null;
  }, [fixedSignatoryId, signerId, signatories]);

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
    let error = "";
    let printable = "";
    if (raw.trim()) {
      if (field.data_type === "currency") {
        const n = parseAmount(raw);
        if (n === null) error = "Enter the amount in rupees, e.g. 1,63,200";
        else if (key === "annual_ctc" && n < MIN_ANNUAL_CTC) error = "That looks too small for an annual CTC — enter the yearly figure in rupees";
      }
      if (!error) printable = formatValue(raw, field.data_type, field.formatter);
    }
    const put = (o: Record<string, string>, v: string) => {
      const next = { ...o };
      if (v) next[key] = v; else delete next[key];
      return next;
    };
    setRawOverrides((o) => put(o, raw));
    setOverrides((o) => put(o, printable));
    setFieldErrors((o) => put(o, error));
  };

  /** Per-token signatory text (name / designation) so two signatories never collide. */
  const tokenValues = useMemo(() => {
    const out: Record<string, string> = {};
    for (const m of mappings) {
      const isName = m.field_key === "signatory_name" || /^signatory_name|^hr_name|_signatory_name/.test(m.token);
      const isDesig = m.field_key === "signatory_designation" || /^signatory_designation|^hr_designation/.test(m.token);
      if (!isName && !isDesig) continue;
      const s = m.signatory_id ? signatories.find((x: any) => x.id === m.signatory_id) : signingSignatory;
      if (!s) continue;
      // Only real values here — an empty designation must fall through to what HR types.
      const v = isName ? s.display_name : s.designation;
      if (v) out[m.token] = v;
    }
    return out;
  }, [mappings, signatories, signingSignatory]);

  /** Salary variables follow the annual CTC — HR's typed CTC when the record had none. */
  const typedCtc = parseAmount(rawOverrides.annual_ctc);
  const effectiveCtc = typedCtc && typedCtc >= MIN_ANNUAL_CTC ? typedCtc : resolved?.annualCtc ?? null;
  const ctcValues = useMemo(
    () => (resolved ? salaryValues(effectiveCtc, resolved.structure, catalog as CatalogField[]) : {}),
    [resolved, effectiveCtc, catalog]
  );

  const signatoryValues = useMemo(
    () =>
      signingSignatory
        ? {
            signatory_name: (signingSignatory as any).display_name || "",
            signatory_designation: (signingSignatory as any).designation || "",
          }
        : {},
    [signingSignatory]
  );

  /** What the records give, before anything HR types — decides which fields to ask for. */
  const baseValues = useMemo<Record<string, string>>(
    () => ({
      ...(resolved?.values || {}),
      ...(resolved ? salaryValues(resolved.annualCtc, resolved.structure, catalog as CatalogField[]) : {}),
      ...signatoryValues,
    }),
    [resolved, catalog, signatoryValues]
  );

  const values = useMemo<Record<string, any>>(
    () => ({ ...(resolved?.values || {}), ...ctcValues, ...signatoryValues, ...overrides }),
    [resolved, ctcValues, signatoryValues, overrides]
  );

  /** Locked Word lane: the .docx is merged as-is, never converted to HTML. */
  const isDocx = version?.lane === "docx" && !!version?.source_file_path;
  const usesLetterhead = isDocx && !!(version?.page_setup as any)?.letterhead;

  const isSystemToken = (m: PlaceholderMapping) =>
    SYSTEM_FILLED_KEYS.has(m.field_key || m.token) || SYSTEM_FILLED_KEYS.has(m.token);

  const valueOf = (m: PlaceholderMapping, vals: Record<string, any>): string =>
    String(tokenValues[m.token] ?? (m.field_key ? vals[m.field_key] : undefined) ?? vals[m.token] ?? "");

  /** Token -> merged value, used by the locked Word lane. */
  const docxValues = useMemo(() => {
    const out: Record<string, string> = {};
    for (const m of mappings) out[m.token] = valueOf(m, values);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappings, tokenValues, values]);

  /** Reference is allocated at issue time; the preview shows a dummy so it never blocks. */
  const renderWith = (referenceNo: string) => {
    if (!version?.content_html) return null;
    return renderTemplateHtml(version.content_html, {
      values: { ...values, reference_no: referenceNo, generated_by: values.generated_by || me?.email || "" },
      tokenValues,
      images,
      mappings,
    });
  };

  const rendered = useMemo(
    () => renderWith("BLY-DRAFT"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, values, images, mappings, tokenValues, me?.email]
  );

  /** Tokens without a value for a given value set (images and system values never count). */
  const pendingTokens = (vals: Record<string, any>) =>
    mappings.filter((m) => !imageTokens.has(m.token) && !isSystemToken(m) && !valueOf(m, vals)).map((m) => m.token);

  /** Unresolved tokens right now, whichever lane the template uses — this gates issuing. */
  const unresolvedTokens = useMemo(() => {
    const out = new Set(pendingTokens(values));
    if (!isDocx) for (const t of rendered?.unresolved || []) if (!imageTokens.has(t) && !SYSTEM_FILLED_KEYS.has(t)) out.add(t);
    return [...out];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDocx, mappings, values, tokenValues, rendered, imageTokens]);

  /**
   * Signature/seal placeholders whose signatory has no uploaded image.
   * The Word lane merges real images too, so an unsigned letter must never issue.
   */
  const missingSignatures = useMemo(
    () => mappings.filter((m) => imageTokens.has(m.token) && !images[m.token]).map((m) => m.token),
    [mappings, images, imageTokens]
  );

  /**
   * Fields the letter needs that the records could not fill. Decided from the
   * records alone, so an input stays on screen while HR types into it. Salary
   * variables are never asked one by one: they follow from the annual CTC.
   */
  const promptFields = useMemo(() => {
    if (!resolved) return [] as CatalogField[];
    const byToken = new Map(mappings.map((m) => [m.token, m]));
    const keys = new Set<string>();
    for (const token of pendingTokens(baseValues)) {
      const key = byToken.get(token)?.field_key || token;
      if (isCtcDerivedResolver(catalogByKey.get(key)?.resolver_id)) keys.add("annual_ctc");
      else keys.add(key);
    }
    if (!isDocx) {
      // Native letters may hold tokens the editor never mapped.
      for (const t of rendered?.unresolved || []) {
        if (imageTokens.has(t) || SYSTEM_FILLED_KEYS.has(t) || byToken.has(t)) continue;
        keys.add(t);
      }
    }
    return [...keys].map(
      (key) =>
        catalogByKey.get(key) ||
        ({ field_key: key, label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), field_group: "custom", data_type: "text", formatter: null, resolver_id: null, is_sensitive: false, default_value: null } as CatalogField)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, mappings, baseValues, catalogByKey, isDocx, rendered, imageTokens, tokenValues]);

  const stillToFill = promptFields.filter((f) => !String(values[f.field_key] ?? "").trim()).length;

  /**
   * Resolved-but-adjustable fields used by this template (letter date, last
   * working day, probation and notice terms) — letters are routinely dated in
   * the past and offer terms are agreed per person.
   */
  const editableFields = useMemo(() => {
    const promptKeys = new Set(promptFields.map((f) => f.field_key));
    const used = new Set(
      mappings.map((m) => m.field_key).filter((k): k is string => !!k && ALWAYS_EDITABLE_KEYS.has(k))
    );
    return [...used]
      .filter((k) => !promptKeys.has(k))
      .map((k) => catalogByKey.get(k))
      .filter(Boolean) as CatalogField[];
  }, [mappings, catalogByKey, promptFields]);

  /** Does this template print any salary figure? Salary notes only matter then. */
  const printsSalary = useMemo(
    () => mappings.some((m) => {
      const rid = m.field_key ? catalogByKey.get(m.field_key)?.resolver_id : null;
      return !!rid && (rid === "salary.annual_ctc" || isCtcDerivedResolver(rid));
    }),
    [mappings, catalogByKey]
  );

  /** Non-blocking things to check before issuing. */
  const notes = useMemo(() => {
    const out = [...(resolved?.notes || []), ...(printsSalary ? resolved?.salaryNotes || [] : [])];
    // A salary component in the standard structure that this template never prints
    // means its annexure rows will not add up to the CTC printed beside them.
    const printed = new Set<string>();
    for (const m of mappings) {
      const rid = m.field_key ? catalogByKey.get(m.field_key)?.resolver_id : null;
      const hit = rid ? /^salary\.([a-z0-9_]+)_(monthly|annual)$/.exec(rid) : null;
      if (hit && hit[1] !== "monthly_ctc") printed.add(hit[1]);
    }
    if (printed.size && resolved) {
      for (const c of resolved.structure) {
        const stem = componentFieldStem(c.key);
        if (Number(c.value) > 0 && !printed.has(stem)) {
          out.push(`The standard structure includes ${c.label || c.key} (${c.mode === "fixed" ? "fixed" : `${c.value}%`}) but this template does not print it — its break-up will not add up to the CTC.`);
        }
      }
    }
    if (usesSignatory && !fixedSignatoryId && !signingSignatory && signatories.length > 1) {
      out.push("Choose who signs this letter.");
    }
    return out;
  }, [resolved, printsSalary, mappings, catalogByKey, usesSignatory, fixedSignatoryId, signingSignatory, signatories.length]);

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
  const prepareDocx = async () => {
    const { data: blob, error } = await supabase.storage
      .from("hr-doc-templates")
      .download(version.source_file_path);
    if (error || !blob) throw error || new Error("The Word template file is missing");
    const source = await blob.arrayBuffer();
    const { renderDocx, flattenDocxMedia } = await import("@/lib/docxTemplate");
    const docImages: Record<string, string> = {};
    for (const m of mappings) if (imageTokens.has(m.token) && images[m.token]) docImages[m.token] = images[m.token];

    // Plain Word templates are printed on the company letterhead, like native letters.
    let applyLetterhead: ((b: Blob) => Promise<Blob>) | null = null;
    if (usesLetterhead) {
      const sheet = letterhead || (await resolveLetterhead(await fetchCompanyIdentity()));
      const { letterheadImage, applyLetterheadToDocxBlob } = await import("@/lib/docxLetterhead");
      const image = await letterheadImage(sheet);
      applyLetterhead = (b) => applyLetterheadToDocxBlob(b, sheet, image);
    }

    return async (referenceNo: string, draft = false) => {
      // The Word file may name the reference token anything (ref_no, reference_no, ref…);
      // inject the issued reference into every token mapped to the system reference field.
      const refText = draft ? `${referenceNo} — DRAFT, NOT ISSUED` : referenceNo;
      const systemValues: Record<string, string> = {
        reference_no: refText,
        generated_by: docxValues.generated_by || me?.email || "",
      };
      for (const m of mappings) {
        const key = m.field_key || m.token;
        if (key === "reference_no" || m.token === "reference_no") systemValues[m.token] = refText;
        if (key === "generated_by" || m.token === "generated_by")
          systemValues[m.token] = docxValues.generated_by || me?.email || "";
      }
      let merged = renderDocx(source.slice(0), { ...docxValues, ...systemValues }, docImages);
      if (applyLetterhead) merged = await applyLetterhead(merged);
      // Flatten transparent media onto white so PDF conversion can never bake the
      // watermark's alpha into a grey rectangle (visible in mobile PDF readers).
      return flattenDocxMedia(merged);
    };
  };

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
    setIssuing(true);
    try {
      // Build the letter once before allocating a reference number: a missing
      // template file, letterhead or merge error must never use one up.
      let renderDocxLetter: ((ref: string, draft?: boolean) => Promise<Blob>) | null = null;
      if (isDocx) {
        renderDocxLetter = await prepareDocx();
        await renderDocxLetter("BLYNK/CHECK/0000");
      } else if (!renderWith("BLYNK/CHECK/0000")) {
        throw new Error("Template has no saved content");
      }

      const { data: refNo, error: refErr } = await (supabase as any).rpc("hr_doc_allocate_reference", {
        _scope_key: `${template.category || "doc"}`,
        _pattern: template.reference_pattern || null,
        _type_code: (template.category || "doc").slice(0, 6),
      });
      if (refErr) throw refErr;

      // A candidate who has not joined yet has no employee folder: their letters
      // live under the onboarding record and move to the employee on joining.
      const ownerEmployeeId: string | null = resolved.employeeId;
      const folder = ownerEmployeeId || `candidates/${resolved.onboardingId}`;
      const safeRef = refNo.replace(/[^\w.-]+/g, "_");
      let path: string;
      let mime: string;
      let docxBlob: Blob | null = null;
      let fullHtml = "";

      if (isDocx) {
        // Locked Word lane: merge into the original .docx, byte-identical layout.
        docxBlob = await renderDocxLetter!(refNo);
        path = `${folder}/${safeRef}.docx`;
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        const { error: upErr } = await supabase.storage
          .from("hr-doc-issued").upload(path, docxBlob, { contentType: mime, upsert: false });
        if (upErr) throw upErr;
      } else {
        // Re-render with the real reference so {reference_no} prints correctly.
        const finalRender = renderWith(refNo);
        if (!finalRender) throw new Error("Template has no saved content");
        // Inline the letterhead into the frozen artefact so a re-print is byte-identical.
        const sheet = letterhead || (await resolveLetterhead(await fetchCompanyIdentity()));
        fullHtml = buildPrintDocument(finalRender.html, template.name, refNo, sheet);
        path = `${folder}/${safeRef}.html`;
        mime = "text/html";
        const { error: upErr } = await supabase.storage
          .from("hr-doc-issued")
          .upload(path, new Blob([fullHtml], { type: "text/html" }), { contentType: "text/html", upsert: false });
        if (upErr) throw upErr;
      }

      // Archive a PDF of exactly what was issued. Word letters are converted
      // server-side by Adobe PDF Services after the row exists (see below), so
      // the archived PDF is byte-faithful to the Word file.
      let pdfPath: string | null = null;
      let pdfBlob: Blob | null = null;
      if (!isDocx) {
        try {
          const { htmlToPdfBlob } = await import("@/lib/docPdf");
          pdfBlob = await htmlToPdfBlob(fullHtml);
          pdfPath = `${folder}/${safeRef}.pdf`;
          const { error: pdfErr } = await supabase.storage
            .from("hr-doc-issued")
            .upload(pdfPath, pdfBlob, { contentType: "application/pdf", upsert: true });
          if (pdfErr) throw pdfErr;
        } catch (e) {
          console.warn("PDF archive failed (non-fatal):", e);
          pdfPath = null;
          pdfBlob = null;
        }
      }

      const { data: auth } = await supabase.auth.getUser();

      const signatoryIds = [
        ...new Set([...mappings.map((m) => m.signatory_id), usesSignatory ? (signingSignatory as any)?.id : null].filter(Boolean)),
      ];

      // Frozen values: by template token (what was printed) plus the shared variable
      // name, so later readers (emails, reports) never depend on a template's spelling.
      const snapshot: Record<string, unknown> = { ...(isDocx ? docxValues : values) };
      for (const m of mappings) {
        if (m.field_key && !(m.field_key in snapshot)) snapshot[m.field_key] = isDocx ? docxValues[m.token] : values[m.field_key];
      }
      if (!("recipient_email" in snapshot) && resolved.email) snapshot.recipient_email = resolved.email;

      const row: Record<string, unknown> = {
        template_id: template.id,
        template_version_id: version.id,
        template_name: template.name,
        category: template.category,
        employee_id: ownerEmployeeId,
        employee_name: resolved.employeeName || "",
        reference_no: refNo,
        status: "issued",
        contains_sensitive: !!template.contains_sensitive,
        file_path: path,
        file_mime: mime,
        pdf_path: pdfPath,
        values_snapshot: {
          ...snapshot,
          ...Object.fromEntries(
            mappings
              .filter((m) => (m.field_key || m.token) === "reference_no" || m.token === "reference_no")
              .map((m) => [m.token, refNo]),
          ),
          reference_no: refNo,
        },
        signatory_ids: signatoryIds,
        issued_by: auth?.user?.id || null,
        issued_by_name: auth?.user?.email || null,
        issued_at: new Date().toISOString(),
      };
      if (resolved.onboardingId) row.onboarding_id = resolved.onboardingId;

      const { data: inserted, error: insErr } = await (supabase as any)
        .from("hr_documents_issued").insert(row).select("id, employee_id").maybeSingle();
      if (insErr) throw insErr;
      // The record may have been linked to an employee while this screen was open;
      // the database then files the letter under that employee.
      const linkedEmployeeId: string | null = inserted?.employee_id || ownerEmployeeId;

      // File the letter in the employee's own document section (private reference —
      // it is signed on demand, never a public URL). A candidate's letter is filed
      // when they join. If the PDF could not be rasterised we still file the issued
      // artefact itself, so the employee's Documents tab is never silently empty.
      if (linkedEmployeeId && inserted?.id) {
        try {
          const { privateDocRef } = await import("@/lib/storedDoc");
          const { data: docRow, error: docErr } = await (supabase as any).from("hr_employee_documents").insert({
            employee_id: linkedEmployeeId,
            document_type: "hr_letter",
            document_name: `${refNo} — ${template.name}`,
            file_url: privateDocRef("hr-doc-issued", pdfPath || path),
            notes: `Issued from HR Document Studio on ${new Date().toLocaleDateString()}`,
            uploaded_by: auth?.user?.email || null,
            source: "issued",
            source_ref: `issued:${inserted.id}`,
          }).select("id").maybeSingle();
          if (docErr) throw docErr;
          if (docRow?.id) {
            await (supabase as any).from("hr_documents_issued")
              .update({ employee_document_id: docRow.id }).eq("id", inserted.id);
          }
        } catch (e) {
          console.warn("Could not file the letter against the employee (non-fatal):", e);
          toast.warning("Letter issued, but it could not be filed under the employee's documents.");
        }
      }

      // Word lane: convert the exact merged DOCX to PDF server-side (Adobe).
      if (isDocx && inserted?.id) {
        supabase.functions
          .invoke("hr-doc-convert-pdf", { body: { issuedId: inserted.id } })
          .then(({ data, error }: any) => {
            if (error || !data?.pdfPath) {
              console.warn("Adobe PDF conversion failed (non-fatal):", data?.error || error?.message);
              return;
            }
            qc.invalidateQueries({ queryKey: ["hr_documents_issued"] });
            if (linkedEmployeeId) qc.invalidateQueries({ queryKey: ["hr_employee_documents", linkedEmployeeId] });
          });
      }

      await (supabase as any).from("hr_doc_audit_log").insert({
        entity_type: "issued_document",
        entity_id: inserted?.id || null,
        action: "issued",
        actor_id: auth?.user?.id || null,
        actor_name: auth?.user?.email || null,
        details: {
          reference_no: refNo,
          template: template.name,
          subject: subjectKind,
          employee_id: linkedEmployeeId,
          onboarding_id: resolved.onboardingId,
          lane: isDocx ? "docx" : "native",
          pdf: !!pdfPath,
          letterhead: usesLetterhead,
        },
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
    missingSignatures.length === 0 && Object.keys(fieldErrors).length === 0;

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
