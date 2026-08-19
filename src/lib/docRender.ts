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

const PROTECTED_REGION = /<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<!--[\s\S]*?-->/gi;

/**
 * Apply `fn` to the HTML while leaving <style>/<script>/comment blocks untouched —
 * a CSS rule such as `body { margin: 0 }` must never be treated as a placeholder.
 */
function mapContentRegions(html: string, fn: (chunk: string) => string): string {
  let out = "";
  let last = 0;
  PROTECTED_REGION.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PROTECTED_REGION.exec(html)) !== null) {
    out += fn(html.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + fn(html.slice(last));
}

/** Collapse tags that sit *inside* a {placeholder} so the token survives split runs. */
export function healSplitPlaceholders(html: string): string {
  return mapContentRegions(html, (chunk) =>
    chunk.replace(/\{[^{}]*\}/g, (m) =>
      m.includes("<") ? "{" + normaliseToken(htmlToText(m).replace(/[{}]/g, "")) + "}" : m
    )
  );
}

export function renderTemplateHtml(html: string, ctx: RenderContext): { html: string; unresolved: string[] } {
  const healed = healSplitPlaceholders(html);
  const byToken = new Map(ctx.mappings.map((m) => [m.token, m]));
  const unresolved: string[] = [];

  const out = mapContentRegions(healed, (chunk) =>
    chunk.replace(/\{([^{}]*)\}/g, (whole, rawToken: string) => {
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
    })
  );

  return { html: unescapeBraces(out), unresolved: [...new Set(unresolved)] };
}



function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface PrintLetterhead {
  /** Full-page A4 artwork (header, footer, watermark) as a data URI. */
  imageDataUri: string | null;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
}

/**
 * Wrap merged body HTML in a standalone, print-ready A4 document.
 *
 * When a letterhead is supplied it is painted as a fixed, full-page layer that
 * Chrome repeats on every printed page, and the page margins are set to the
 * letterhead's safe area — so the printed header and footer can never be
 * overwritten by letter content, however long the letter runs.
 */
export function buildPrintDocument(
  bodyHtml: string,
  title: string,
  referenceNo?: string,
  letterhead?: PrintLetterhead | null
): string {
  const mt = letterhead?.marginTopMm ?? 20;
  const mb = letterhead?.marginBottomMm ?? 20;
  const ml = letterhead?.marginLeftMm ?? 18;
  const mr = letterhead?.marginRightMm ?? 18;
  const art = letterhead?.imageDataUri || "";

  return `<!doctype html><html><head><meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  /* Zero page margins: the letterhead artwork is full-bleed A4 and the safe
     area is reserved per page by the repeating table head/foot spacers below
     (the only technique Chrome honours on every page of a flowing document). */
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #f2f2f2; }
  body { font-family: Georgia, "Times New Roman", serif; font-size: 12pt; line-height: 1.6; color: #111; }
  .letterhead {
    position: fixed; inset: 0; z-index: 0;
    background-image: url("${art}");
    background-repeat: no-repeat;
    background-size: 210mm 297mm;
    background-position: 0 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sheet { width: 210mm; min-height: 297mm; margin: 12px auto; background: #fff; box-sizing: border-box; position: relative; z-index: 1; }
  /* Safe-area frame — thead/tfoot repeat on every printed page. */
  table.page-frame { width: 100%; border-collapse: collapse; border: 0; }
  table.page-frame > thead > tr > td,
  table.page-frame > tfoot > tr > td,
  table.page-frame > tbody > tr > td { border: 0; padding: 0; }
  .band-top { height: ${mt}mm; }
  .band-bottom { height: ${mb}mm; }
  .page-body { padding: 0 ${mr}mm 0 ${ml}mm; }
  .ref { font-size: 9pt; color: #666; letter-spacing: .04em; margin-bottom: 8mm; }
  img { max-width: 100%; }
  .page-body table { border-collapse: collapse; width: 100%; }
  .page-body td, .page-body th { border: 1px solid #999; padding: 6px 8px; }
  @media print {
    html, body { background: #fff; }
    .sheet { width: auto; min-height: 0; margin: 0; box-shadow: none; background: transparent; }
  }
  @media screen {
    .letterhead { position: absolute; inset: auto; top: 12px; left: 50%; margin-left: -105mm; width: 210mm; height: 297mm; }
    .sheet { background: transparent; }
  }
</style></head>
<body>
${art ? `<div class="letterhead"></div>` : ""}
<div class="sheet">
<table class="page-frame">
<thead><tr><td><div class="band-top"></div></td></tr></thead>
<tfoot><tr><td><div class="band-bottom"></div></td></tr></tfoot>
<tbody><tr><td><div class="page-body">
${referenceNo ? `<div class="ref">Ref: ${escapeHtml(referenceNo)}</div>` : ""}
${bodyHtml}
</div></td></tr></tbody>
</table>
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
