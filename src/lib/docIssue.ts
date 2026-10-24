/**
 * Issue one planned letter: allocate its reference, freeze the merged file and
 * its values, file it for the employee, archive the PDF and audit it. Shared by
 * Documents → Generate and the onboarding "Send onboarding form" dialog so both
 * produce identical artefacts.
 *
 * The letter is trial-built before a reference number is allocated, so a missing
 * template file, letterhead or merge error never uses one up.
 */
import { supabase } from "@/integrations/supabase/client";
import type { PlaceholderMapping } from "@/lib/docTemplate";
import type { ResolvedValues, SubjectKind } from "@/lib/docResolvers";
import { renderTemplateHtml, buildPrintDocument } from "@/lib/docRender";
import { fetchCompanyIdentity, resolveLetterhead, type LetterheadSpec } from "@/lib/companyIdentity";
import { privateDocRef } from "@/lib/storedDoc";
import { mappingValue } from "@/lib/docLetterPlan";

export type DocxRenderer = (referenceNo: string, draft?: boolean) => Promise<Blob>;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const CHECK_REFERENCE = "BLYNK/CHECK/0000";

/**
 * Load everything a Word letter needs (template file, signature images, the
 * letterhead) once and return a renderer. Anything missing fails here, before a
 * reference number is allocated.
 */
export async function prepareDocxRenderer(opts: {
  version: any;
  mappings: PlaceholderMapping[];
  imageTokens: Set<string>;
  images: Record<string, string>;
  docxValues: Record<string, string>;
  usesLetterhead: boolean;
  letterhead?: LetterheadSpec | null;
  actorEmail?: string | null;
}): Promise<DocxRenderer> {
  const { version, mappings, imageTokens, images, docxValues, usesLetterhead, letterhead, actorEmail } = opts;
  const { data: blob, error } = await supabase.storage.from("hr-doc-templates").download(version.source_file_path);
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
    const generatedBy = docxValues.generated_by || actorEmail || "";
    const systemValues: Record<string, string> = { reference_no: refText, generated_by: generatedBy };
    for (const m of mappings) {
      const key = m.field_key || m.token;
      if (key === "reference_no" || m.token === "reference_no") systemValues[m.token] = refText;
      if (key === "generated_by" || m.token === "generated_by") systemValues[m.token] = generatedBy;
    }
    let merged = renderDocx(source.slice(0), { ...docxValues, ...systemValues }, docImages);
    if (applyLetterhead) merged = await applyLetterhead(merged);
    // Flatten transparent media onto white so PDF conversion can never bake the
    // watermark's alpha into a grey rectangle (visible in mobile PDF readers).
    return flattenDocxMedia(merged);
  };
}

export interface IssueLetterInput {
  template: any;
  version: any;
  mappings: PlaceholderMapping[];
  /** Printable values by field key (what the letter prints). */
  values: Record<string, any>;
  /** Per-token signatory text. */
  tokenValues: Record<string, string>;
  /** Token → value for the Word lane. */
  docxValues: Record<string, string>;
  /** Token → signature/seal image (data URL). */
  images: Record<string, string>;
  imageTokens: Set<string>;
  resolved: ResolvedValues;
  subjectKind: SubjectKind;
  signatoryIds: string[];
  usesLetterhead: boolean;
  letterhead?: LetterheadSpec | null;
  actor: { id: string | null; email: string | null };
  /** Extra frozen facts stored with the values (e.g. the joining date as YYYY-MM-DD). */
  extraSnapshot?: Record<string, unknown>;
  /** What HR typed for this letter (field key → printed value), frozen so a resend can start from it. */
  typedFields?: Record<string, string>;
  /** The signatory the letter is signed by. */
  signedBy?: string | null;
  /**
   * A candidate's new offer replaces their older live offers. Default: straight
   * away. The send dialog passes false and replaces them only after the new offer
   * is attached to the joining package, so the candidate's link never breaks.
   */
  supersedePrevious?: boolean;
  /** Where the letter was issued from, for the audit trail. */
  source: string;
  /** Wait for the Word → PDF conversion (the joining package needs the PDF straight away). */
  awaitPdf?: boolean;
}

export interface IssuedLetterResult {
  issuedId: string;
  referenceNo: string;
  path: string;
  mime: string;
  isDocx: boolean;
  /** Archived PDF: the native lane's, or the Word lane's when `awaitPdf` was set and it succeeded. */
  pdfPath: string | null;
  /** Native lane PDF, for downloading straight away. */
  pdfBlob: Blob | null;
  docxBlob: Blob | null;
  fullHtml: string;
  linkedEmployeeId: string | null;
  /** The letter could not be filed under the employee's documents (non-fatal). */
  filingFailed: boolean;
  /** Word lane conversion still running in the background (when not awaited). */
  pdfConversion: Promise<string | null> | null;
  /** Why the awaited Word → PDF conversion failed, if it did. */
  pdfError: string | null;
  /** References of older live offers this one replaced. */
  replaced: string[];
  /** References that could not be marked as replaced (revoke them in the Issued tab). */
  replaceFailed: string[];
}

/** Convert an issued Word letter to PDF server-side (Adobe) — reused when it already exists. */
export async function convertIssuedLetterPdf(issuedId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("hr-doc-convert-pdf", { body: { issuedId } });
  const pdfPath = (data as any)?.pdfPath as string | undefined;
  if (error || !pdfPath) {
    let message = (data as any)?.error as string | undefined;
    if (!message && (error as any)?.context?.json) {
      try { message = (await (error as any).context.json())?.error; } catch { /* ignore */ }
    }
    throw new Error(message || error?.message || "Word to PDF conversion failed");
  }
  return pdfPath;
}

/** A candidate's live offers (issued or delivered), newest first. */
export async function liveOffersFor(onboardingId: string): Promise<Array<{ id: string; reference_no: string; created_at: string }>> {
  const { data, error } = await (supabase as any)
    .from("hr_documents_issued")
    .select("id, reference_no, created_at")
    .eq("onboarding_id", onboardingId)
    .eq("category", "offer")
    .in("status", ["issued", "delivered"])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Keep one live offer per candidate: `keep` replaces every live offer created
 * before it. The newest always wins, so two sends at the same moment still leave
 * exactly one; if `keep` itself was already replaced, nothing changes.
 */
export async function supersedeOlderOffers(
  onboardingId: string,
  keep: { id: string; referenceNo: string },
  actor: { id: string | null; email: string | null },
): Promise<{ replaced: string[]; failed: string[] }> {
  const live = await liveOffersFor(onboardingId);
  const self = live.find((o) => o.id === keep.id);
  if (!self) return { replaced: [], failed: [] };
  const older = live.filter(
    (o) => o.id !== keep.id && (o.created_at < self.created_at || (o.created_at === self.created_at && o.id < self.id)),
  );
  const replaced: string[] = [];
  const failed: string[] = [];
  for (const o of older) {
    try {
      if (await supersedeLetter(o.id, keep, actor)) replaced.push(o.reference_no);
    } catch (e) {
      console.warn("Could not mark the replaced offer as superseded:", e);
      failed.push(o.reference_no);
    }
  }
  return { replaced, failed };
}

/** Mark a live letter as replaced by a revised one and hide its filed copy. */
export async function supersedeLetter(
  oldId: string,
  next: { id: string; referenceNo: string },
  actor: { id: string | null; email: string | null },
): Promise<boolean> {
  const { data: old, error } = await (supabase as any)
    .from("hr_documents_issued")
    .update({ status: "superseded", superseded_by_id: next.id })
    .eq("id", oldId)
    .in("status", ["issued", "delivered"])
    .select("id, reference_no, employee_document_id")
    .maybeSingle();
  if (error) throw error;
  if (!old) return false;
  if (old.employee_document_id) {
    await (supabase as any)
      .from("hr_employee_documents")
      .update({ is_hidden: true, hidden_reason: `Replaced by ${next.referenceNo}` })
      .eq("id", old.employee_document_id);
  }
  await (supabase as any).from("hr_doc_audit_log").insert({
    entity_type: "issued_document",
    entity_id: oldId,
    action: "superseded",
    actor_id: actor.id,
    actor_name: actor.email,
    details: { reference_no: old.reference_no, superseded_by: next.id, superseded_by_reference: next.referenceNo },
  });
  return true;
}

/** Issue a letter whose values are final (nothing unresolved, signatures present). */
export async function issuePlannedLetter(input: IssueLetterInput): Promise<IssuedLetterResult> {
  const {
    template, version, mappings, values, tokenValues, docxValues, images, imageTokens, resolved,
    subjectKind, signatoryIds, usesLetterhead, letterhead, actor, extraSnapshot, typedFields, signedBy,
    supersedePrevious, source, awaitPdf,
  } = input;
  const isDocx = version?.lane === "docx" && !!version?.source_file_path;
  // An offer to a candidate: one live offer per onboarding record.
  const candidateOffer = String(template?.category || "").toLowerCase() === "offer" && !!resolved.onboardingId;

  const renderNative = (referenceNo: string) =>
    version?.content_html
      ? renderTemplateHtml(version.content_html, {
          values: { ...values, reference_no: referenceNo, generated_by: values.generated_by || actor.email || "" },
          tokenValues,
          images,
          mappings,
        })
      : null;

  // Build the letter once before allocating a reference number.
  let renderDocxLetter: DocxRenderer | null = null;
  if (isDocx) {
    renderDocxLetter = await prepareDocxRenderer({
      version, mappings, imageTokens, images, docxValues, usesLetterhead, letterhead, actorEmail: actor.email,
    });
    await renderDocxLetter(CHECK_REFERENCE);
  } else if (!renderNative(CHECK_REFERENCE)) {
    throw new Error("Template has no saved content");
  }

  // A candidate who has not joined yet has no employee folder: their letters
  // live under the onboarding record and move to the employee on joining.
  const ownerEmployeeId: string | null = resolved.employeeId;
  if (!ownerEmployeeId && !resolved.onboardingId) throw new Error("The letter has no employee or onboarding record to belong to");
  const folder = ownerEmployeeId || `candidates/${resolved.onboardingId}`;

  // The live offer this one revises (recorded on the new letter).
  const previousOffer = candidateOffer ? (await liveOffersFor(resolved.onboardingId!))[0] || null : null;

  const { data: refNo, error: refErr } = await (supabase as any).rpc("hr_doc_allocate_reference", {
    _scope_key: `${template.category || "doc"}`,
    _pattern: template.reference_pattern || null,
    _type_code: (template.category || "doc").slice(0, 6),
  });
  if (refErr) throw refErr;
  const referenceNo = String(refNo);
  const safeRef = referenceNo.replace(/[^\w.-]+/g, "_");

  let path: string;
  let mime: string;
  let docxBlob: Blob | null = null;
  let fullHtml = "";

  if (isDocx) {
    // Locked Word lane: merge into the original .docx, byte-identical layout.
    docxBlob = await renderDocxLetter!(referenceNo);
    path = `${folder}/${safeRef}.docx`;
    mime = DOCX_MIME;
    const { error: upErr } = await supabase.storage.from("hr-doc-issued").upload(path, docxBlob, { contentType: mime, upsert: false });
    if (upErr) throw upErr;
  } else {
    // Re-render with the real reference so {reference_no} prints correctly.
    const finalRender = renderNative(referenceNo);
    if (!finalRender) throw new Error("Template has no saved content");
    // Inline the letterhead into the frozen artefact so a re-print is byte-identical.
    const sheet = letterhead || (await resolveLetterhead(await fetchCompanyIdentity()));
    fullHtml = buildPrintDocument(finalRender.html, template.name, referenceNo, sheet);
    path = `${folder}/${safeRef}.html`;
    mime = "text/html";
    const { error: upErr } = await supabase.storage
      .from("hr-doc-issued")
      .upload(path, new Blob([fullHtml], { type: "text/html" }), { contentType: "text/html", upsert: false });
    if (upErr) throw upErr;
  }

  // Archive a PDF of exactly what was issued. Word letters are converted
  // server-side by Adobe PDF Services after the row exists (below), so the
  // archived PDF is byte-faithful to the Word file.
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

  // Frozen values: by template token (what was printed) plus the shared variable
  // name, so later readers (emails, reports, the joining package) never depend on
  // a template's spelling.
  const snapshot: Record<string, unknown> = { ...(isDocx ? docxValues : values) };
  for (const m of mappings) {
    if (m.field_key && !(m.field_key in snapshot)) snapshot[m.field_key] = isDocx ? docxValues[m.token] : values[m.field_key];
  }
  // Native letters also keep what each token printed, in their own map (Word letters are token-keyed).
  if (!isDocx) snapshot.printed = Object.fromEntries(mappings.map((m) => [m.token, mappingValue(m, tokenValues, values)]));
  if (!("recipient_email" in snapshot) && resolved.email) snapshot.recipient_email = resolved.email;
  if (typedFields && Object.keys(typedFields).length) snapshot.typed_fields = { ...typedFields };
  if (signedBy) snapshot.signed_by = signedBy;
  for (const [k, v] of Object.entries(extraSnapshot || {})) if (!(k in snapshot)) snapshot[k] = v;

  const row: Record<string, unknown> = {
    template_id: template.id,
    template_version_id: version.id,
    template_name: template.name,
    category: template.category,
    employee_id: ownerEmployeeId,
    employee_name: resolved.employeeName || "",
    reference_no: referenceNo,
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
          .map((m) => [m.token, referenceNo]),
      ),
      reference_no: referenceNo,
    },
    signatory_ids: signatoryIds,
    issued_by: actor.id,
    issued_by_name: actor.email,
    issued_at: new Date().toISOString(),
  };
  if (resolved.onboardingId) row.onboarding_id = resolved.onboardingId;
  if (previousOffer) row.supersedes_id = previousOffer.id;

  const { data: inserted, error: insErr } = await (supabase as any)
    .from("hr_documents_issued").insert(row).select("id, employee_id").maybeSingle();
  if (insErr) throw insErr;
  if (!inserted?.id) throw new Error("The letter was not saved");
  const issuedId = inserted.id as string;
  // The record may have been linked to an employee while the screen was open;
  // the database then files the letter under that employee.
  const linkedEmployeeId: string | null = inserted.employee_id || ownerEmployeeId;

  // File the letter in the employee's own document section (private reference —
  // it is signed on demand, never a public URL). A candidate's letter is filed
  // when they join. If the PDF could not be made we still file the issued
  // artefact itself, so the employee's Documents tab is never silently empty.
  let filingFailed = false;
  if (linkedEmployeeId) {
    try {
      const { data: docRow, error: docErr } = await (supabase as any).from("hr_employee_documents").insert({
        employee_id: linkedEmployeeId,
        document_type: "hr_letter",
        document_name: `${referenceNo} — ${template.name}`,
        file_url: privateDocRef("hr-doc-issued", pdfPath || path),
        notes: `Issued from HR Document Studio on ${new Date().toLocaleDateString()}`,
        uploaded_by: actor.email,
        source: "issued",
        source_ref: `issued:${issuedId}`,
      }).select("id").maybeSingle();
      if (docErr) throw docErr;
      if (docRow?.id) {
        await (supabase as any).from("hr_documents_issued").update({ employee_document_id: docRow.id }).eq("id", issuedId);
      }
    } catch (e) {
      console.warn("Could not file the letter against the employee (non-fatal):", e);
      filingFailed = true;
    }
  }

  // A new offer replaces the candidate's older ones, so there are never two valid offers.
  let replaced: string[] = [];
  let replaceFailed: string[] = [];
  if (candidateOffer && supersedePrevious !== false) {
    try {
      ({ replaced, failed: replaceFailed } = await supersedeOlderOffers(resolved.onboardingId!, { id: issuedId, referenceNo }, actor));
    } catch (e) {
      console.warn("Could not check the candidate's older offers:", e);
      if (previousOffer) replaceFailed = [previousOffer.reference_no];
    }
  }

  // Word lane: convert the exact merged DOCX to PDF server-side (Adobe).
  let pdfConversion: Promise<string | null> | null = null;
  let pdfError: string | null = null;
  if (isDocx) {
    if (awaitPdf) {
      try {
        pdfPath = await convertIssuedLetterPdf(issuedId);
      } catch (e: any) {
        pdfError = e?.message || "Word to PDF conversion failed";
      }
    } else {
      pdfConversion = convertIssuedLetterPdf(issuedId).catch((e) => {
        console.warn("Adobe PDF conversion failed (non-fatal):", e?.message || e);
        return null;
      });
    }
  }

  await (supabase as any).from("hr_doc_audit_log").insert({
    entity_type: "issued_document",
    entity_id: issuedId,
    action: "issued",
    actor_id: actor.id,
    actor_name: actor.email,
    details: {
      reference_no: referenceNo,
      template: template.name,
      subject: subjectKind,
      employee_id: linkedEmployeeId,
      onboarding_id: resolved.onboardingId,
      lane: isDocx ? "docx" : "native",
      pdf: !!pdfPath,
      letterhead: usesLetterhead,
      source,
      ...(previousOffer ? { supersedes: previousOffer.id } : {}),
    },
  });

  return {
    issuedId, referenceNo, path, mime, isDocx, pdfPath, pdfBlob, docxBlob, fullHtml,
    linkedEmployeeId, filingFailed, pdfConversion, pdfError, replaced, replaceFailed,
  };
}
