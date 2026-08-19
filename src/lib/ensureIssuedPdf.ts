import { supabase } from "@/integrations/supabase/client";
import { privateDocRef } from "@/lib/storedDoc";

/**
 * Guarantees an issued letter has a readable PDF archived against it.
 *
 * Letters issued through the locked-Word lane are stored as .docx. If the PDF
 * rasterisation failed (or the row predates PDF archiving), this rebuilds the
 * PDF on demand from the frozen artefact, files it and links it to the
 * employee's document record so the ERP copy is always a PDF.
 */
export async function ensureIssuedPdf(doc: any): Promise<{ path: string; blob: Blob | null }> {
  const isDocx = String(doc.file_mime || "").includes("wordprocessingml") || /\.docx$/i.test(doc.file_path || "");

  // Word letters are converted by Adobe PDF Services server-side, so the PDF is
  // byte-faithful to the Word file (letterhead, fonts, geometry). Converted once,
  // then reused forever.
  if (isDocx) {
    if (doc.pdf_path && /\.adobe\.pdf$/i.test(doc.pdf_path)) return { path: doc.pdf_path, blob: null };
    const { data, error } = await supabase.functions.invoke("hr-doc-convert-pdf", {
      body: { issuedId: doc.id },
    });
    const pdfPath = (data as any)?.pdfPath;
    if (error || !pdfPath) {
      throw new Error((data as any)?.error || error?.message || "Word to PDF conversion failed");
    }
    return { path: pdfPath, blob: null };
  }

  if (doc.pdf_path) return { path: doc.pdf_path, blob: null };
  if (!doc.file_path) throw new Error("This letter has no stored file");

  const { data: signed, error: sErr } = await supabase.storage
    .from("hr-doc-issued").createSignedUrl(doc.file_path, 300);
  if (sErr || !signed?.signedUrl) throw sErr || new Error("Could not read the stored letter");
  const res = await fetch(signed.signedUrl);
  if (!res.ok) throw new Error("Could not read the stored letter");

  const { htmlToPdfBlob } = await import("@/lib/docPdf");

  const blob = await htmlToPdfBlob(await res.text());

  const pdfPath = doc.file_path.replace(/\.[^.]+$/, "") + ".pdf";

  const { error: upErr } = await supabase.storage
    .from("hr-doc-issued").upload(pdfPath, blob, { contentType: "application/pdf", upsert: true });
  if (upErr) throw upErr;

  await (supabase as any).from("hr_documents_issued").update({ pdf_path: pdfPath }).eq("id", doc.id);

  // Keep the employee's filed copy pointing at the PDF, not the Word file.
  const fileUrl = privateDocRef("hr-doc-issued", pdfPath);
  if (doc.employee_document_id) {
    await (supabase as any).from("hr_employee_documents")
      .update({ file_url: fileUrl }).eq("id", doc.employee_document_id);
  } else if (doc.employee_id) {
    const { data: row } = await (supabase as any).from("hr_employee_documents").insert({
      employee_id: doc.employee_id,
      document_type: "hr_letter",
      document_name: `${doc.reference_no} — ${doc.template_name}`,
      file_url: fileUrl,
      notes: "Issued from HR Document Studio",
      uploaded_by: doc.issued_by_name || null,
    }).select("id").maybeSingle();
    if (row?.id) {
      await (supabase as any).from("hr_documents_issued")
        .update({ employee_document_id: row.id }).eq("id", doc.id);
    }
  }

  return { path: pdfPath, blob };
}
