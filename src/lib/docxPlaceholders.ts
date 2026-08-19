import { unzipSync, strFromU8 } from "fflate";
import { normaliseToken, splitInstance, type ParseResult } from "@/lib/docTemplate";

/**
 * Placeholder discovery for the "locked native Word" template lane.
 * Kept free of docxtemplater/pizzip so the template editor stays light.
 */

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

/** Adapt Word {{TOKEN}} placeholders to the shared ParseResult shape. */
export function parseDocxToResult(text: string): ParseResult {
  return {
    placeholders: parseDocxPlaceholders(text).map((p) => {
      const { base, instance } = splitInstance(p.token);
      return { raw: p.raw, token: p.token, base, instance, count: p.count };
    }),
    unparsed: [],
  };
}
