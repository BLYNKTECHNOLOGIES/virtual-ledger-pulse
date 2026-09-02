/**
 * Headless letter issuance — issues an HR letter for one employee without the
 * Document Studio UI, using exactly the same artefacts the Studio produces:
 * the frozen file in `hr-doc-issued`, an `hr_documents_issued` row, a filed copy
 * under the employee's own documents, and an audit-log entry.
 *
 * Used by the exit checklist so the relieving letter can be generated and filed
 * straight from the separation flow. Emailing stays a deliberate, separate act.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  fetchCatalog,
  resolveEmployeeValues,
  SYSTEM_FILLED_KEYS,
  type CatalogField,
} from "@/lib/docResolvers";
import { renderTemplateHtml, buildPrintDocument } from "@/lib/docRender";
import type { PlaceholderMapping } from "@/lib/docTemplate";
import { fetchCompanyIdentity, resolveLetterhead } from "@/lib/companyIdentity";
import { privateDocRef } from "@/lib/storedDoc";

export type IssuedLetter = {
  issuedId: string;
  referenceNo: string;
  templateName: string;
  /** true when the letter already existed and nothing new was issued. */
  existed: boolean;
};

/** The most recent live letter of a category already issued to this employee. */
export async function findIssuedLetter(employeeId: string, category: string) {
  const { data } = await (supabase as any)
    .from("hr_documents_issued")
    .select("id, reference_no, template_name, status, issued_at, pdf_path, file_path, file_mime, employee_id, employee_document_id, issued_by_name, delivered_at, delivered_to")
    .eq("employee_id", employeeId)
    .eq("category", category)
    .neq("status", "revoked")
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

const dataUrl = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });

/**
 * Issue the active template of `category` for `employeeId`.
 * Throws with a human-readable message when the letter cannot be issued
 * truthfully (missing template, missing signature, unresolved fields) — it never
 * issues a letter with blanks in it.
 */
export async function issueLetterForEmployee(
  employeeId: string,
  category: string,
): Promise<IssuedLetter> {
  const existing = await findIssuedLetter(employeeId, category);
  if (existing) {
    return {
      issuedId: existing.id,
      referenceNo: existing.reference_no,
      templateName: existing.template_name,
      existed: true,
    };
  }

  const { data: template } = await (supabase as any)
    .from("hr_doc_templates")
    .select("*")
    .eq("category", category)
    .eq("status", "active")
    .order("name")
    .limit(1)
    .maybeSingle();
  if (!template) throw new Error(`No active "${category}" template in HR Document Studio`);
  if (!template.current_version_id) throw new Error(`The ${template.name} template has no published version`);

  const { data: version } = await (supabase as any)
    .from("hr_doc_template_versions")
    .select("*")
    .eq("id", template.current_version_id)
    .maybeSingle();
  if (!version) throw new Error("The template version could not be loaded");

  const [catalog, signatoriesRes, authRes] = await Promise.all([
    fetchCatalog(),
    (supabase as any).from("hr_doc_signatories").select("*").eq("is_active", true),
    supabase.auth.getUser(),
  ]);
  const signatories = signatoriesRes.data || [];
  const actorEmail = authRes.data?.user?.email || undefined;

  const resolved = await resolveEmployeeValues(employeeId, catalog as CatalogField[], actorEmail);

  const mappings: PlaceholderMapping[] = (version.placeholder_map as PlaceholderMapping[]) || [];
  const byKey = new Map((catalog as CatalogField[]).map((c) => [c.field_key, c]));
  const kindOf = (m: PlaceholderMapping): "text" | "signature" | "seal" => {
    if (m.kind) return m.kind;
    const dt = m.field_key ? byKey.get(m.field_key)?.data_type : undefined;
    if (dt === "signature") return "signature";
    if (dt === "image") return "seal";
    return "text";
  };
  const imageTokens = new Set(mappings.filter((m) => kindOf(m) !== "text").map((m) => m.token));

  // Signature / seal images, inlined so the frozen letter stays self-contained.
  const images: Record<string, string> = {};
  for (const m of mappings) {
    if (!m.signatory_id) continue;
    const s = signatories.find((x: any) => x.id === m.signatory_id);
    const path = kindOf(m) === "seal" ? s?.seal_path : s?.signature_path;
    if (!path) continue;
    const { data: blob } = await supabase.storage.from("hr-doc-signatures").download(path);
    if (blob) images[m.token] = await dataUrl(blob);
  }
  const missingSignature = mappings.filter((m) => imageTokens.has(m.token) && !images[m.token]);
  if (missingSignature.length) {
    throw new Error("The signatory for this letter has no signature image uploaded — add it in HR Document Studio first");
  }

  const signingSignatory =
    signatories.find((x: any) => x.id === mappings.find((m) => m.signatory_id)?.signatory_id) ||
    (signatories.length === 1 ? signatories[0] : null);

  const tokenValues: Record<string, string> = {};
  for (const m of mappings) {
    const isName = m.field_key === "signatory_name" || /^signatory_name|^hr_name|_signatory_name/.test(m.token);
    const isDesig = m.field_key === "signatory_designation" || /^signatory_designation|^hr_designation/.test(m.token);
    if (!isName && !isDesig && !m.signatory_id) continue;
    const s = m.signatory_id ? signatories.find((x: any) => x.id === m.signatory_id) : signingSignatory;
    if (!s) continue;
    if (isName) tokenValues[m.token] = s.display_name || "";
    if (isDesig) tokenValues[m.token] = s.designation || "";
  }

  const values: Record<string, any> = {
    ...(resolved.values || {}),
    ...(signingSignatory
      ? {
          signatory_name: (signingSignatory as any).display_name || "",
          signatory_designation: (signingSignatory as any).designation || "",
        }
      : {}),
  };

  const isDocx = version.lane === "docx" && !!version.source_file_path;

  const docxValues: Record<string, string> = {};
  for (const m of mappings) {
    const v = tokenValues[m.token] ?? (m.field_key ? values[m.field_key] : undefined);
    docxValues[m.token] = v ?? "";
  }

  // Never issue a letter with blanks — send the operator to the Studio instead.
  const missing = mappings
    .filter(
      (m) =>
        !imageTokens.has(m.token) &&
        !SYSTEM_FILLED_KEYS.has(m.field_key || m.token) &&
        !SYSTEM_FILLED_KEYS.has(m.token) &&
        !String(docxValues[m.token] || "").trim(),
    )
    .map((m) => (m.field_key || m.token).replace(/_/g, " "));
  if (missing.length) {
    throw new Error(
      `Missing details for this letter: ${[...new Set(missing)].join(", ")}. Fill them on the employee record, or issue it from HR Document Studio.`,
    );
  }

  const { data: refNo, error: refErr } = await (supabase as any).rpc("hr_doc_allocate_reference", {
    _scope_key: `${template.category || "doc"}`,
    _pattern: template.reference_pattern || null,
    _type_code: (template.category || "doc").slice(0, 6),
  });
  if (refErr) throw refErr;

  const safeRef = String(refNo).replace(/[^\w.-]+/g, "_");
  let path: string;
  let mime: string;
  let pdfPath: string | null = null;

  if (isDocx) {
    const { data: srcBlob, error: dlErr } = await supabase.storage
      .from("hr-doc-templates")
      .download(version.source_file_path);
    if (dlErr || !srcBlob) throw dlErr || new Error("The Word template file is missing");
    const { renderDocx, flattenDocxMedia } = await import("@/lib/docxTemplate");

    const systemValues: Record<string, string> = { reference_no: String(refNo), generated_by: actorEmail || "" };
    for (const m of mappings) {
      const key = m.field_key || m.token;
      if (key === "reference_no" || m.token === "reference_no") systemValues[m.token] = String(refNo);
      if (key === "generated_by" || m.token === "generated_by") systemValues[m.token] = actorEmail || "";
    }
    const merged = await flattenDocxMedia(
      renderDocx(await srcBlob.arrayBuffer(), { ...docxValues, ...systemValues }, images),
    );
    path = `${employeeId}/${safeRef}.docx`;
    mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const { error: upErr } = await supabase.storage
      .from("hr-doc-issued")
      .upload(path, merged, { contentType: mime, upsert: false });
    if (upErr) throw upErr;
  } else {
    if (!version.content_html) throw new Error("Template has no saved content");
    const render = renderTemplateHtml(version.content_html, {
      values: { ...values, reference_no: refNo, generated_by: actorEmail || "" },
      tokenValues,
      images,
      mappings,
    });
    const sheet = await resolveLetterhead(await fetchCompanyIdentity());
    const fullHtml = buildPrintDocument(render.html, template.name, String(refNo), sheet);
    path = `${employeeId}/${safeRef}.html`;
    mime = "text/html";
    const { error: upErr } = await supabase.storage
      .from("hr-doc-issued")
      .upload(path, new Blob([fullHtml], { type: "text/html" }), { contentType: "text/html", upsert: false });
    if (upErr) throw upErr;

    try {
      const { htmlToPdfBlob } = await import("@/lib/docPdf");
      const pdfBlob = await htmlToPdfBlob(fullHtml);
      pdfPath = `${employeeId}/${safeRef}.pdf`;
      const { error: pdfErr } = await supabase.storage
        .from("hr-doc-issued")
        .upload(pdfPath, pdfBlob, { contentType: "application/pdf", upsert: true });
      if (pdfErr) throw pdfErr;
    } catch (e) {
      console.warn("PDF archive failed (non-fatal):", e);
      pdfPath = null;
    }
  }

  // File it under the employee's own document section (private reference).
  let employeeDocumentId: string | null = null;
  try {
    const { data: docRow } = await (supabase as any)
      .from("hr_employee_documents")
      .insert({
        employee_id: employeeId,
        document_type: "hr_letter",
        document_name: `${refNo} — ${template.name}`,
        file_url: privateDocRef("hr-doc-issued", pdfPath || path),
        notes: `Issued from the exit checklist on ${new Date().toLocaleDateString("en-IN")}`,
        uploaded_by: actorEmail || null,
      })
      .select("id")
      .maybeSingle();
    employeeDocumentId = docRow?.id || null;
  } catch (e) {
    console.warn("Could not file the letter under the employee (non-fatal):", e);
  }

  const { data: inserted, error: insErr } = await (supabase as any)
    .from("hr_documents_issued")
    .insert({
      template_id: template.id,
      template_version_id: version.id,
      template_name: template.name,
      category: template.category,
      employee_id: employeeId,
      employee_name: resolved.employeeName || "",
      reference_no: refNo,
      status: "issued",
      contains_sensitive: !!template.contains_sensitive,
      file_path: path,
      file_mime: mime,
      pdf_path: pdfPath,
      employee_document_id: employeeDocumentId,
      values_snapshot: { ...(isDocx ? docxValues : values), reference_no: refNo },
      signatory_ids: mappings.map((m) => m.signatory_id).filter(Boolean),
      issued_by: authRes.data?.user?.id || null,
      issued_by_name: actorEmail || null,
      issued_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (insErr) throw insErr;

  // Word lane: the archived PDF is produced server-side from the exact merged file.
  if (isDocx && inserted?.id) {
    try {
      await supabase.functions.invoke("hr-doc-convert-pdf", { body: { issuedId: inserted.id } });
    } catch (e) {
      console.warn("PDF conversion failed (non-fatal):", e);
    }
  }

  await (supabase as any).from("hr_doc_audit_log").insert({
    entity_type: "issued_document",
    entity_id: inserted?.id || null,
    action: "issued",
    actor_id: authRes.data?.user?.id || null,
    actor_name: actorEmail || null,
    details: {
      reference_no: refNo,
      template: template.name,
      employee_id: employeeId,
      lane: isDocx ? "docx" : "native",
      source: "exit_checklist",
    },
  });

  return { issuedId: inserted!.id, referenceNo: String(refNo), templateName: template.name, existed: false };
}

/** Email an already-issued letter to the employee (PDF attached by the mailer). */
export async function emailIssuedLetter(issuedId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("hr-doc-email", { body: { issuedId } });
  if (error) throw new Error((await (error as any)?.context?.text?.()) || error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return (data as any)?.to || "the employee";
}
