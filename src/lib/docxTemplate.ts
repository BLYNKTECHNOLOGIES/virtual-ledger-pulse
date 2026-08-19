import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { unzipSync, strFromU8 } from "fflate";
import { normaliseToken } from "@/lib/docTemplate";

/**
 * "Locked native Word" template lane.
 *
 * The uploaded .docx is kept byte-for-byte and never converted to HTML — the
 * only thing HRMS does is find its {{PLACEHOLDERS}} and swap them at issue
 * time. Formatting, letterhead, fonts and spacing therefore come out exactly
 * as authored in Word.
 */

export const DOCX_DELIMITERS = { start: "{{", end: "}}" };

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Plain text of the document body, with runs of the same paragraph joined. */
export function extractDocxText(data: ArrayBuffer): string {
  const files = unzipSync(new Uint8Array(data));
  const parts = Object.keys(files).filter(
    (n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n)
  );
  if (!parts.length) throw new Error("That file is not a valid .docx document.");
  return parts
    .map((name) =>
      strFromU8(files[name])
        .replace(/<w:p[ >]/g, "\n<w:p ")
        .replace(/<w:tab\s*\/>/g, "\t")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
    )
    .join("\n");
}

export interface DocxPlaceholder {
  /** Exactly as written in Word, e.g. "EMPLOYEE_NAME" */
  raw: string;
  /** Normalised token used for mapping, e.g. "employee_name" */
  token: string;
  count: number;
}

export function parseDocxPlaceholders(text: string): DocxPlaceholder[] {
  const found = new Map<string, DocxPlaceholder>();
  for (const m of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const raw = m[1].trim();
    const token = normaliseToken(raw);
    if (!token) continue;
    const hit = found.get(token);
    if (hit) hit.count += 1;
    else found.set(token, { raw, token, count: 1 });
  }
  return [...found.values()];
}

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

  const tags = Object.keys(doc.getFullText ? {} : {});
  void tags;

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
