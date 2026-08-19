import { htmlToText, normaliseToken, unescapeBraces } from "@/lib/docTemplate";
import type { PlaceholderMapping } from "@/lib/docTemplate";

/**
 * Merge template HTML with resolved values.
 * Placeholders may be split across formatting runs in the editor, so we first
 * normalise the HTML by re-joining brace pairs that got separated by tags.
 */

export interface RenderContext {
  /** field_key -> printable value */
  values: Record<string, string>;
  /** token -> value; wins over `values`, used for per-instance signatory text */
  tokenValues?: Record<string, string>;
  /** token -> signature image data/url, used for signature & seal placeholders */
  images?: Record<string, string>;
  mappings: PlaceholderMapping[];
}

/** Collapse tags that sit *inside* a {placeholder} so the token survives split runs. */
export function healSplitPlaceholders(html: string): string {
  return html.replace(/\{[^{}]*\}/g, (chunk) =>
    chunk.includes("<") ? "{" + normaliseToken(htmlToText(chunk).replace(/[{}]/g, "")) + "}" : chunk
  );
}

export function renderTemplateHtml(html: string, ctx: RenderContext): { html: string; unresolved: string[] } {
  const healed = healSplitPlaceholders(html);
  const byToken = new Map(ctx.mappings.map((m) => [m.token, m]));
  const unresolved: string[] = [];

  const out = healed.replace(/\{([^{}]*)\}/g, (whole, rawToken: string) => {
    const token = normaliseToken(rawToken);
    if (!token) return whole;
    const mapping = byToken.get(token);

    const image = ctx.images?.[token];
    if (image) {
      return `<img src="${image}" alt="signature" style="height:60px;object-fit:contain;display:inline-block;vertical-align:middle" />`;
    }

    const key = mapping?.field_key || token;
    const value = ctx.tokenValues?.[token] ?? ctx.values[key] ?? ctx.values[token];
    if (value === undefined || value === "") {
      unresolved.push(token);
      return `<span style="background:#fff3cd;color:#7a5b00;padding:0 2px">{${token}}</span>`;
    }
    return escapeHtml(value);
  });

  return { html: unescapeBraces(out), unresolved: [...new Set(unresolved)] };
}


function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Wrap merged body HTML in a standalone, print-ready A4 document. */
export function buildPrintDocument(bodyHtml: string, title: string, referenceNo?: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  html, body { margin: 0; padding: 0; background: #f2f2f2; }
  body { font-family: Georgia, "Times New Roman", serif; font-size: 12pt; line-height: 1.6; color: #111; }
  .sheet { width: 210mm; min-height: 297mm; padding: 20mm 18mm; margin: 12px auto; background: #fff; box-sizing: border-box; }
  .ref { font-size: 9pt; color: #666; letter-spacing: .04em; margin-bottom: 10mm; }
  img { max-width: 100%; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #999; padding: 6px 8px; }
  @media print {
    html, body { background: #fff; }
    .sheet { width: auto; min-height: 0; padding: 0; margin: 0; box-shadow: none; }
  }
</style></head>
<body><div class="sheet">
${referenceNo ? `<div class="ref">Ref: ${escapeHtml(referenceNo)}</div>` : ""}
${bodyHtml}
</div></body></html>`;
}

/** Open the merged document in a new window and trigger the browser print dialog. */
export function printDocument(fullHtml: string) {
  const win = window.open("", "_blank");
  if (!win) throw new Error("Pop-up blocked. Allow pop-ups to print this letter.");
  win.document.open();
  win.document.write(fullHtml);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}
