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

export function GenerateTab() {
  const qc = useQueryClient();
  const [templateId, setTemplateId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
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


  useEffect(() => { setOverrides({}); }, [employeeId, templateId]);

  /** Per-token signatory text (name / designation) so two signatories never collide. */
  const tokenValues = useMemo(() => {
    const out: Record<string, string> = {};
    for (const m of mappings) {
      if (!m.signatory_id) continue;
      const s = signatories.find((x: any) => x.id === m.signatory_id);
      if (!s) continue;
      if (m.field_key === "signatory_name" || /^signatory_name/.test(m.token)) out[m.token] = s.display_name || "";
      if (m.field_key === "signatory_designation" || /^signatory_designation/.test(m.token)) out[m.token] = s.designation || "";
    }
    return out;
  }, [mappings, signatories]);

  const values = useMemo(
    () => ({ ...(resolved?.values || {}), ...overrides }),
    [resolved, overrides]
  );

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

  /** Signature/seal placeholders whose signatory has no uploaded image. */
  const missingSignatures = useMemo(
    () => (rendered?.unresolved || []).filter((t) => imageTokens.has(t)),
    [rendered, imageTokens]
  );

  /** Fields the letter actually needs but which came back empty. */
  const promptFields = useMemo(() => {
    if (!rendered) return [] as CatalogField[];
    const byToken = new Map(mappings.map((m) => [m.token, m]));
    const keys = new Set<string>();
    for (const token of rendered.unresolved) {
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
  }, [rendered, mappings, catalog, imageTokens]);

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


  const preview = () => {
    if (!rendered) return toast.error("Pick a template with a saved version first");
    try {
      printDocument(buildPrintDocument(rendered.html, template?.name || "Draft", "DRAFT — not issued"));
    } catch (e: any) {
      toast.error(e?.message || "Could not open the print window");
    }
  };


  const issue = async () => {
    if (!rendered || !template || !version) return toast.error("Select a template");
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

      // Re-render with the real reference so {reference_no} prints correctly.
      const finalRender = renderWith(refNo);
      if (!finalRender) throw new Error("Template has no saved content");

      const fullHtml = buildPrintDocument(finalRender.html, template.name, refNo);
      const path = `${employeeId}/${refNo.replace(/[^\w.-]+/g, "_")}.html`;
      const { error: upErr } = await supabase.storage
        .from("hr-doc-issued")
        .upload(path, new Blob([fullHtml], { type: "text/html" }), { contentType: "text/html", upsert: false });
      if (upErr) throw upErr;

      const { data: auth } = await supabase.auth.getUser();
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
        file_mime: "text/html",
        values_snapshot: { ...values, reference_no: refNo },
        signatory_ids: mappings.map((m) => m.signatory_id).filter(Boolean),
        issued_by: auth?.user?.id || null,
        issued_by_name: auth?.user?.email || null,
        issued_at: new Date().toISOString(),
      }).select("id").maybeSingle();
      if (insErr) throw insErr;

      await (supabase as any).from("hr_doc_audit_log").insert({
        entity_type: "issued_document",
        entity_id: inserted?.id || null,
        action: "issued",
        actor_id: auth?.user?.id || null,
        actor_name: auth?.user?.email || null,
        details: { reference_no: refNo, template: template.name, employee_id: employeeId },
      });

      qc.invalidateQueries({ queryKey: ["hr_documents_issued"] });
      toast.success(`Issued ${refNo}`);
      try {
        printDocument(fullHtml);
      } catch {
        toast.warning("Letter saved. Pop-up blocked — re-print it from the Issued tab.");
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
          <Button variant="outline" className="h-9 flex-1" onClick={preview} disabled={!rendered}>
            <Printer className="h-4 w-4 mr-1.5" /> Preview
          </Button>
          <Button className="h-9 flex-1" onClick={issue} disabled={!rendered || !employeeId || issuing || promptFields.length > 0 || missingSignatures.length > 0}>
            <FileCheck2 className="h-4 w-4 mr-1.5" /> {issuing ? "Issuing…" : "Issue letter"}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Issuing allocates a reference number, freezes the merged letter and its values, then opens the browser print dialog — choose “Save as PDF”.
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {!rendered ? (
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

export default GenerateTab;
