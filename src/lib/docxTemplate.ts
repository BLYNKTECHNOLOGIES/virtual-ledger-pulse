import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import { extractDocxText, parseDocxPlaceholders } from "@/lib/docxPlaceholders";

export { extractDocxText, parseDocxPlaceholders, parseDocxToResult } from "@/lib/docxPlaceholders";
export type { DocxPlaceholder } from "@/lib/docxPlaceholders";

export const DOCX_DELIMITERS = { start: "{{", end: "}}" };

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Word image tags are written {{%TOKEN}} — docxtemplater's image syntax. */
export function isImageTag(raw: string): boolean {
  return raw.trim().startsWith("%");
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Intrinsic pixel size for PNG / JPEG, so signatures keep their aspect ratio. */
function intrinsicSize(bytes: Uint8Array): { w: number; h: number } | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { w: view.getUint32(16), h: view.getUint32(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8] };
      }
      i += 2 + len;
    }
  }
  return null;
}

const SIGNATURE_HEIGHT_PX = 56;
const SIGNATURE_MAX_WIDTH_PX = 200;

function buildImageModule(images: Record<string, string>) {
  const lookup = (tag: string) => {
    const key = tag.replace(/^%/, "");
    return images[key] ?? images[key.toLowerCase()] ?? images[key.replace(/\s+/g, "_").toLowerCase()] ?? "";
  };
  return new (ImageModule as any)({
    centered: false,
    getImage: (value: string, tag: string) => {
      const src = value || lookup(tag);
      if (!src) throw new Error(`No image supplied for {{%${tag}}}`);
      return dataUrlToBytes(src).buffer;
    },
    getSize: (buf: ArrayBuffer) => {
      const size = intrinsicSize(new Uint8Array(buf));
      if (!size || !size.w || !size.h) return [160, SIGNATURE_HEIGHT_PX];
      const w = Math.min(Math.round((size.w / size.h) * SIGNATURE_HEIGHT_PX), SIGNATURE_MAX_WIDTH_PX);
      return [w, SIGNATURE_HEIGHT_PX];
    },
  });
}

function buildData(
  data: ArrayBuffer,
  values: Record<string, string>,
  images: Record<string, string>
) {
  const merged: Record<string, string> = {};
  for (const [token, value] of Object.entries(values)) merged[token] = value ?? "";
  const placeholders = parseDocxPlaceholders(extractDocxText(data));
  for (const p of placeholders) {
    const bare = p.raw.replace(/^%/, "");
    const src = images[p.token] ?? values[p.token] ?? "";
    merged[p.raw] = src;
    merged[bare] = src;
  }
  return { merged, placeholders };
}

/**
 * Merge values into the Word file and return the rendered .docx bytes.
 * Image tokens must be authored as {{%TOKEN}} in Word; a signature supplied for
 * a plain {{TOKEN}} throws rather than issuing a silently unsigned letter.
 */
export function renderDocx(
  data: ArrayBuffer,
  values: Record<string, string>,
  images: Record<string, string> = {}
): Blob {
  // Word files routinely carry plain {{SIGN}} tags. Rather than refusing to
  // issue, rewrite those tags to docxtemplater's image syntax {{%SIGN}} in the
  // XML itself whenever an image is actually supplied for the token.
  const prepared = upgradeImageTags(data, images);

  const { merged, placeholders } = buildData(prepared, values, images);

  const unsuppliedImages = placeholders
    .filter((p) => isImageTag(p.raw) && !images[p.token])
    .map((p) => p.token);
  if (unsuppliedImages.length) {
    throw new Error(
      `No signature image available for: ${unsuppliedImages.join(", ")}. Upload the image on the signatory before issuing.`
    );
  }

  const zip = new PizZip(prepared);
  const doc = new Docxtemplater(zip, {
    delimiters: DOCX_DELIMITERS,
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
    modules: [buildImageModule(images)],
  });


  doc.render(merged);
  return doc.getZip().generate({
    type: "blob",
    mimeType: DOCX_MIME,
    compression: "DEFLATE",
  });
}

export interface DocxValidation {
  errors: string[];
  warnings: string[];
  imageTokens: string[];
}

/**
 * Run the real docxtemplater parser at import time so a broken template is
 * rejected then, not at issue time after a reference has been burnt.
 */
export function validateDocxTemplate(data: ArrayBuffer): DocxValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let imageTokens: string[] = [];

  let placeholders: ReturnType<typeof parseDocxPlaceholders> = [];
  try {
    placeholders = parseDocxPlaceholders(extractDocxText(data));
  } catch (e: any) {
    return { errors: [e?.message || "Unreadable Word file"], warnings, imageTokens };
  }
  imageTokens = placeholders.filter((p) => isImageTag(p.raw)).map((p) => p.token);

  for (const p of placeholders) {
    const raw = p.raw.trim();
    if (/^[#/^]/.test(raw)) {
      warnings.push(`{{${raw}}} is Word/docxtemplater section syntax, not a value — it will not be filled.`);
    } else if (raw.includes(".") && !isImageTag(raw)) {
      warnings.push(`{{${raw}}} contains a dot, which the merge engine reads as a nested field — rename it, e.g. {{EMPLOYEE_NAME}}.`);
    }
  }

  // Dry render with dummy values — this is what actually catches unclosed tags.
  try {
    const dummy: Record<string, string> = {};
    const dummyImages: Record<string, string> = {};
    for (const p of placeholders) {
      if (isImageTag(p.raw)) dummyImages[p.token] = TRANSPARENT_PNG;
      else {
        dummy[p.token] = "x";
        dummy[p.raw] = "x";
      }
    }
    renderDocx(data, dummy, dummyImages);
  } catch (e: any) {
    const detail =
      (e?.properties?.errors || []).map((x: any) => x?.properties?.explanation || x?.message).filter(Boolean).join("; ") ||
      e?.message ||
      "Unknown template error";
    errors.push(detail);
  }

  return { errors, warnings, imageTokens };
}

const TRANSPARENT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Firefox ignores clicks on anchors that are not in the document.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
