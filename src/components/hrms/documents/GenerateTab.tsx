import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmployeeCombobox } from "@/components/hrms/EmployeePicker";
import { EmptyState } from "@/components/shared/EmptyState";
import { toast } from "sonner";
import { FilePlus2, Printer, AlertTriangle, ShieldAlert, FileCheck2 } from "lucide-react";
import { fetchCatalog, resolveEmployeeValues, formatValue, SYSTEM_FILLED_KEYS, ALWAYS_EDITABLE_KEYS, type CatalogField } from "@/lib/docResolvers";
import { renderTemplateHtml, buildPrintDocument, printDocument } from "@/lib/docRender";
import type { PlaceholderMapping } from "@/lib/docTemplate";
import { fetchCompanyIdentity, resolveLetterhead } from "@/lib/companyIdentity";

export function GenerateTab() {
  const qc = useQueryClient();
  const [templateId, setTemplateId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  /** Raw (unformatted) operator input, kept so date pickers stay controlled. */
  const [rawOverrides, setRawOverrides] = useState<Record<string, string>>({});
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

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_doc_generate_employees"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employees").select("id,first_name,last_name,badge_id,is_active").order("first_name");
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

  const template = templates.find((t: any) => t.id === templateId);

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

  const { data: resolved } = useQuery({
    queryKey: ["hr_doc_resolved", employeeId, catalog.length, me?.email],
    enabled: !!employeeId && catalog.length > 0,
    queryFn: () => resolveEmployeeValues(employeeId, catalog as CatalogField[], me?.email || undefined),
  });

  // Signed URLs for every signatory image used by this template's mappings.
  const mappings: PlaceholderMapping[] = useMemo(
    () => (version?.placeholder_map as PlaceholderMapping[]) || [],
    [version]
  );

  /**
   * Placeholder kind comes from the mapping (explicit `kind`, else the mapped
   * catalog field's data_type) — never from how the token happens to be spelled,
   * so {gm_signature} or {authorised_signatory} behave correctly.
   */
  const kindOf = useMemo(() => {
    const byKey = new Map((catalog as CatalogField[]).map((c) => [c.field_key, c]));
    return (m: PlaceholderMapping): "text" | "signature" | "seal" => {
      if (m.kind) return m.kind;
      const dt = m.field_key ? byKey.get(m.field_key)?.data_type : undefined;
      if (dt === "signature") return "signature";
      if (dt === "image") return "seal";
      return "text";
    };
  }, [catalog]);

  const imageTokens = useMemo(
    () => new Set(mappings.filter((m) => kindOf(m) !== "text").map((m) => m.token)),
    [mappings, kindOf]
  );


  const { data: images = {} } = useQuery({
    queryKey: ["hr_doc_signature_urls", version?.id, signatories.length, catalog.length],
    enabled: mappings.some((m) => m.signatory_id),
    queryFn: async () => {
      const out: Record<string, string> = {};
      for (const m of mappings) {
        if (!m.signatory_id) continue;
        const s = signatories.find((x: any) => x.id === m.signatory_id);
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


  useEffect(() => { setOverrides({}); setRawOverrides({}); }, [employeeId, templateId]);

  /** Store both the raw input and its printable, formatted counterpart. */
  const setFieldValue = (field: CatalogField, raw: string) => {
    setRawOverrides((o) => ({ ...o, [field.field_key]: raw }));
    setOverrides((o) => ({
      ...o,
      [field.field_key]: raw ? formatValue(raw, field.data_type, field.formatter) : "",
    }));
  };

  /** The signatory this template signs with — every signatory token follows it. */
  const signingSignatory = useMemo(() => {
    const id =
      mappings.find((m) => m.signatory_id)?.signatory_id ||
      (signatories.length === 1 ? (signatories[0] as any).id : null);
    return signatories.find((x: any) => x.id === id) || null;
  }, [mappings, signatories]);

  /** Per-token signatory text (name / designation) so two signatories never collide. */
  const tokenValues = useMemo(() => {
    const out: Record<string, string> = {};
    // A signatory token without an explicit signatory falls back to the one this
    // template already signs with (or the only active signatory), so the name
    // never has to be re-typed when the letter already names the signer.
    for (const m of mappings) {
      const isName = m.field_key === "signatory_name" || /^signatory_name|^hr_name|_signatory_name/.test(m.token);
      const isDesig = m.field_key === "signatory_designation" || /^signatory_designation|^hr_designation/.test(m.token);
      if (!isName && !isDesig && !m.signatory_id) continue;
      const s = m.signatory_id ? signatories.find((x: any) => x.id === m.signatory_id) : signingSignatory;
      if (!s) continue;
      if (isName) out[m.token] = s.display_name || "";
      if (isDesig) out[m.token] = s.designation || "";
    }
    return out;
  }, [mappings, signatories, signingSignatory]);


  const values = useMemo<Record<string, any>>(
    () => ({
      ...(resolved?.values || {}),
      // Signatory identity always comes from the signature block, never re-typed.
      ...(signingSignatory
        ? {
            signatory_name: (signingSignatory as any).display_name || "",
            signatory_designation: (signingSignatory as any).designation || "",
          }
        : {}),
      ...overrides,
    }),
    [resolved, overrides, signingSignatory]
  );


  /** Locked Word lane: the .docx is merged as-is, never converted to HTML. */
  const isDocx = version?.lane === "docx" && !!version?.source_file_path;

  /** Token -> merged value, used by the locked Word lane. */
  const docxValues = useMemo(() => {
    const out: Record<string, string> = {};
    for (const m of mappings) {
      const v = tokenValues[m.token] ?? (m.field_key ? values[m.field_key] : undefined);
      out[m.token] = v ?? "";
    }
    return out;
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

  /** Unresolved tokens, whichever lane the template uses. */
  const unresolvedTokens = useMemo(() => {
    if (isDocx) {
      return mappings
        .filter(
          (m) =>
            // System-filled values (reference number, generated_by) are injected at issue time,
            // whatever token name the Word file uses for them.
            !SYSTEM_FILLED_KEYS.has(m.field_key || m.token) &&
            !SYSTEM_FILLED_KEYS.has(m.token) &&
            !imageTokens.has(m.token) &&
            !docxValues[m.token],
        )
        .map((m) => m.token);
    }
    return rendered?.unresolved || [];
  }, [isDocx, mappings, docxValues, rendered, imageTokens]);

  /**
   * Signature/seal placeholders whose signatory has no uploaded image.
   * The Word lane merges real images too, so an unsigned letter must never issue.
   */
  const missingSignatures = useMemo(() => {
    if (isDocx) {
      return mappings
        .filter((m) => imageTokens.has(m.token) && !images[m.token])
        .map((m) => m.token);
    }
    return unresolvedTokens.filter((t) => imageTokens.has(t));
  }, [isDocx, mappings, images, unresolvedTokens, imageTokens]);

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

  /** Merge values into the stored .docx and return the finished Word bytes. */
  const buildDocx = async (referenceNo: string, draft = false) => {
    const { data: blob, error } = await supabase.storage
      .from("hr-doc-templates")
      .download(version.source_file_path);
    if (error || !blob) throw error || new Error("The Word template file is missing");
    const { renderDocx } = await import("@/lib/docxTemplate");
    const docImages: Record<string, string> = {};
    for (const m of mappings) if (imageTokens.has(m.token) && images[m.token]) docImages[m.token] = images[m.token];

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

    return renderDocx(await blob.arrayBuffer(), { ...docxValues, ...systemValues }, docImages);
  };


  /** Fields the letter actually needs but which came back empty. */
  const promptFields = useMemo(() => {
    if (!rendered && !isDocx) return [] as CatalogField[];
    const byToken = new Map(mappings.map((m) => [m.token, m]));
    const keys = new Set<string>();
    for (const token of unresolvedTokens) {
      if (imageTokens.has(token)) continue;
      const key = byToken.get(token)?.field_key || token;
      if (SYSTEM_FILLED_KEYS.has(key)) continue;
      keys.add(key);
    }
    return [...keys].map(
      (key) =>
        (catalog as CatalogField[]).find((c) => c.field_key === key) ||
        ({ field_key: key, label: key.replace(/_/g, " "), field_group: "custom", data_type: "text", formatter: null, resolver_id: null, is_sensitive: false, default_value: null } as CatalogField)
    );
  }, [rendered, isDocx, unresolvedTokens, mappings, catalog, imageTokens]);


  /**
   * Resolved-but-adjustable fields used by this template (letter date, last
   * working day, conduct) — letters are routinely dated in the past.
   */
  const editableFields = useMemo(() => {
    const promptKeys = new Set(promptFields.map((f) => f.field_key));
    const used = new Set(
      mappings.map((m) => m.field_key).filter((k): k is string => !!k && ALWAYS_EDITABLE_KEYS.has(k))
    );
    return [...used]
      .filter((k) => !promptKeys.has(k))
      .map((k) => (catalog as CatalogField[]).find((c) => c.field_key === k))
      .filter(Boolean) as CatalogField[];
  }, [mappings, catalog, promptFields]);


  const preview = async () => {
    if (isDocx) {
      try {
        const blob = await buildDocx("BLY-DRAFT", true);
        saveBlob(blob, `DRAFT-DO-NOT-ISSUE-${(template?.name || "letter").replace(/[^\w.-]+/g, "_")}.docx`);
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
    if (!employeeId) return toast.error("Select an employee");
    if (promptFields.length > 0) return toast.error("Fill the remaining fields before issuing");
    if (missingSignatures.length > 0) return toast.error("Upload the signature image for this template's signatory first");
    setIssuing(true);
    try {
      const { data: refNo, error: refErr } = await (supabase as any).rpc("hr_doc_allocate_reference", {
        _scope_key: `${template.category || "doc"}`,
        _pattern: template.reference_pattern || null,
        _type_code: (template.category || "doc").slice(0, 6),
      });
      if (refErr) throw refErr;

      const safeRef = refNo.replace(/[^\w.-]+/g, "_");
      let path: string;
      let mime: string;
      let docxBlob: Blob | null = null;
      let fullHtml = "";

      if (isDocx) {
        // Locked Word lane: merge into the original .docx, byte-identical layout.
        docxBlob = await buildDocx(refNo);
        path = `${employeeId}/${safeRef}.docx`;
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
        path = `${employeeId}/${safeRef}.html`;
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
          pdfPath = `${employeeId}/${safeRef}.pdf`;
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

      // File the letter in the employee's own document section (private reference —
      // it is signed on demand, never a public URL). If the PDF could not be
      // rasterised we still file the issued artefact itself, so the employee's
      // Documents tab is never silently empty.
      let employeeDocumentId: string | null = null;
      {
        const filedPath = pdfPath || path;
        try {
          const { privateDocRef } = await import("@/lib/storedDoc");
          const { data: docRow, error: docErr } = await (supabase as any).from("hr_employee_documents").insert({
            employee_id: employeeId,
            document_type: "hr_letter",
            document_name: `${refNo} — ${template.name}`,
            file_url: privateDocRef("hr-doc-issued", filedPath),
            notes: `Issued from HR Document Studio on ${new Date().toLocaleDateString()}`,
            uploaded_by: auth?.user?.email || null,
          }).select("id").maybeSingle();
          if (docErr) throw docErr;
          employeeDocumentId = docRow?.id || null;
        } catch (e) {
          console.warn("Could not file the letter against the employee (non-fatal):", e);
          toast.warning("Letter issued, but it could not be filed under the employee's documents.");
        }
      }


      const { data: inserted, error: insErr } = await (supabase as any).from("hr_documents_issued").insert({
        template_id: template.id,
        template_version_id: version.id,
        template_name: template.name,
        category: template.category,
        employee_id: employeeId,
        employee_name: resolved?.employeeName || "",
        reference_no: refNo,
        status: "issued",
        contains_sensitive: !!template.contains_sensitive,
        file_path: path,
        file_mime: mime,
        pdf_path: pdfPath,
        employee_document_id: employeeDocumentId,
        values_snapshot: { ...(isDocx ? docxValues : values), reference_no: refNo },
        signatory_ids: mappings.map((m) => m.signatory_id).filter(Boolean),
        issued_by: auth?.user?.id || null,
        issued_by_name: auth?.user?.email || null,
        issued_at: new Date().toISOString(),
      }).select("id").maybeSingle();
      if (insErr) throw insErr;

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
            qc.invalidateQueries({ queryKey: ["hr_employee_documents", employeeId] });
          });
      }

      await (supabase as any).from("hr_doc_audit_log").insert({
        entity_type: "issued_document",
        entity_id: inserted?.id || null,
        action: "issued",
        actor_id: auth?.user?.id || null,
        actor_name: auth?.user?.email || null,
        details: { reference_no: refNo, template: template.name, employee_id: employeeId, lane: isDocx ? "docx" : "native", pdf: !!pdfPath },
      });

      qc.invalidateQueries({ queryKey: ["hr_documents_issued"] });
      qc.invalidateQueries({ queryKey: ["hr_employee_documents", employeeId] });
      toast.success(`Issued ${refNo}`);
      if (pdfBlob) {
        saveBlob(pdfBlob, `${safeRef}.pdf`);
        toast.info("PDF archived and filed under the employee's documents");
      } else {
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

  if (templates.length === 0) {
    return <EmptyState icon={FilePlus2} title="No active templates" description="Create a template first, then come back here to generate letters." />;
  }

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
            <div>
              <Label className="text-xs">Employee</Label>
              <div className="mt-1">
                <EmployeeCombobox options={employeeOptions} value={employeeId} onChange={setEmployeeId} />
              </div>
            </div>
          </CardContent>
        </Card>

        {promptFields.length > 0 && (
          <Card className="border-amber-500/40">
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-medium flex items-center gap-1.5 text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" /> {promptFields.length} field{promptFields.length > 1 ? "s" : ""} need your input
              </p>
              {promptFields.map((f) => (
                <FieldInput key={f.field_key} field={f} raw={rawOverrides[f.field_key] || ""} setValue={setFieldValue} />
              ))}
            </CardContent>
          </Card>
        )}

        {editableFields.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-medium text-foreground">Adjust before issuing</p>
              <p className="text-[11px] text-muted-foreground -mt-1.5">
                Resolved automatically — change them if this letter should carry a different date or wording.
              </p>
              {editableFields.map((f) => (
                <FieldInput
                  key={f.field_key}
                  field={f}
                  raw={rawOverrides[f.field_key] || ""}
                  placeholderText={values[f.field_key]}
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
          <Button variant="outline" className="h-9 flex-1" onClick={preview} disabled={!rendered && !isDocx}>
            <Printer className="h-4 w-4 mr-1.5" /> {isDocx ? "Draft .docx" : "Preview"}
          </Button>
          <Button className="h-9 flex-1" onClick={issue} disabled={(!rendered && !isDocx) || !employeeId || issuing || promptFields.length > 0 || missingSignatures.length > 0}>
            <FileCheck2 className="h-4 w-4 mr-1.5" /> {issuing ? "Issuing…" : "Issue letter"}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {isDocx
            ? "Issuing allocates a reference number, merges the values into the original Word file and downloads it — open it in Word and print to PDF."
            : "Issuing allocates a reference number, freezes the merged letter and its values, then opens the browser print dialog — choose “Save as PDF”."}
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {isDocx ? (
            <div className="p-10">
              <EmptyState
                icon={FileCheck2}
                title="Locked Word template"
                description={`${version?.source_file_name || "This template"} is merged inside the original Word file, so there is no on-screen preview. Use “Draft .docx” to check it before issuing.`}
              />
            </div>
          ) : !rendered ? (
            <div className="p-10">
              <EmptyState icon={FilePlus2} title="Nothing to preview yet" description="Select a template and an employee." />
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

function FieldInput({
  field, raw, placeholderText, setValue,
}: {
  field: CatalogField;
  raw: string;
  placeholderText?: string;
  setValue: (f: CatalogField, raw: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs capitalize">{field.label}</Label>
      <Input
        type={field.data_type === "date" ? "date" : "text"}
        className="h-9 mt-1 text-foreground"
        value={raw}
        placeholder={placeholderText || `Enter ${field.label.toLowerCase()}`}
        onChange={(e) => setValue(field, e.target.value)}
      />
      {placeholderText && !raw && (
        <p className="text-[10px] text-muted-foreground mt-1">Currently: {placeholderText}</p>
      )}
    </div>
  );
}

export default GenerateTab;
