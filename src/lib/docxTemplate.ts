import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { extractDocxText, parseDocxPlaceholders } from "@/lib/docxPlaceholders";

export { extractDocxText, parseDocxPlaceholders, parseDocxToResult } from "@/lib/docxPlaceholders";
export type { DocxPlaceholder } from "@/lib/docxPlaceholders";

export const DOCX_DELIMITERS = { start: "{{", end: "}}" };

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Merge values into the Word file and return the rendered .docx bytes.
 * `values` is keyed by normalised token; raw Word tags are matched case- and
 * spacing-insensitively so {{ Employee Name }} and {{EMPLOYEE_NAME}} both work.
 */
export function renderDocx(
  data: ArrayBuffer,
  values: Record<string, string>
): Blob {
  const zip = new PizZip(data);
  const doc = new Docxtemplater(zip, {
    delimiters: DOCX_DELIMITERS,
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });

  // Build a proxy-like data object covering every spelling variant.
  const data_: Record<string, string> = {};
  for (const [token, value] of Object.entries(values)) data_[token] = value ?? "";

  const placeholders = parseDocxPlaceholders(extractDocxText(data));
  for (const p of placeholders) data_[p.raw] = values[p.token] ?? "";

  doc.render(data_);
  return doc.getZip().generate({
    type: "blob",
    mimeType: DOCX_MIME,
    compression: "DEFLATE",
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
