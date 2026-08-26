import { supabase } from "@/integrations/supabase/client";

export const CASE_DOCUMENT_BUCKET = "investigation-documents";

export const CASE_DOCUMENT_FIELD_LABELS = {
  screenshots: "Screenshots",
  proof_of_debit: "Proof of Debit",
  supporting_proof: "Supporting Proof",
  supporting_document: "Supporting Document",
  statement_proof: "Statement Proof",
} as const;

export type CaseDocumentField = keyof typeof CASE_DOCUMENT_FIELD_LABELS;

export const CASE_DOCUMENT_FIELDS = Object.keys(CASE_DOCUMENT_FIELD_LABELS) as CaseDocumentField[];

const sanitizeFileName = (name: string) => name.replace(/[^\w.\-]+/g, "_").slice(-120) || "document";

export async function uploadCaseDocumentFiles(
  files: File[],
  fieldName: CaseDocumentField,
  caseNumber: string,
): Promise<string[]> {
  const uploadedUrls: string[] = [];
  const safeCaseNumber = sanitizeFileName(caseNumber || "case");

  for (const file of files) {
    const safeName = sanitizeFileName(file.name);
    const filePath = `case-documents/${safeCaseNumber}/${fieldName}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(CASE_DOCUMENT_BUCKET)
      .upload(filePath, file, { contentType: file.type || "application/octet-stream" });

    if (uploadError) {
      throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);
    }

    const { data } = supabase.storage.from(CASE_DOCUMENT_BUCKET).getPublicUrl(filePath);
    uploadedUrls.push(data.publicUrl);
  }

  return uploadedUrls;
}

export function uniqueCaseDocumentUrls(urls: Array<string | null | undefined>): string[] {
  return Array.from(new Set(urls.filter((url): url is string => Boolean(url))));
}

export function getCaseDocumentFileName(url: string, fallback = "document") {
  const withoutQuery = url.split("?")[0];
  const name = withoutQuery.split("/").pop();
  return name ? decodeURIComponent(name) : fallback;
}