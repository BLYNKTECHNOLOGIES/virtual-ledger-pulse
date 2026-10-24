import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

/**
 * Put the company letterhead behind every page of a Word letter.
 *
 * Templates authored as plain Word files (no header artwork of their own) are
 * printed on the same A4 letterhead the native lane uses: the image is anchored
 * in the page header, behind the text, at page position 0,0 and page size, so
 * Word, LibreOffice and Adobe's Word→PDF conversion all repeat it on every page.
 * Page margins are raised to the letterhead's safe area when the template's own
 * margins are smaller, so letter text never runs into the printed header/footer.
 * Nothing else in the document is touched.
 */

const NS = {
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  pic: "http://schemas.openxmlformats.org/drawingml/2006/picture",
  pkgRels: "http://schemas.openxmlformats.org/package/2006/relationships",
};
const REL_HEADER = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header";
const REL_IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const CT_HEADER = "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml";

const TWIPS_PER_MM = 1440 / 25.4;
const EMU_PER_TWIP = 635;

export interface LetterheadImage {
  bytes: Uint8Array;
  mime: "image/jpeg" | "image/png";
}

export interface LetterheadMarginsMm {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Sniff JPEG / PNG from the bytes — the URL's content type is not trusted. */
export function sniffImageMime(bytes: Uint8Array): LetterheadImage["mime"] | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export function dataUriToImage(dataUri: string | null | undefined): LetterheadImage | null {
  const m = /^data:[^;,]*(?:;[^;,]*)*;base64,(.+)$/i.exec(String(dataUri || "").trim());
  if (!m) return null;
  let bin: string;
  try {
    bin = atob(m[1]);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const mime = sniffImageMime(bytes);
  return mime ? { bytes, mime } : null;
}

/**
 * True when the Word file already carries its own letterhead or page furniture —
 * artwork or any text in a header or footer, or a behind-text image in the body.
 * Those files default to "no company letterhead" so nothing is printed twice or
 * on top of the letterhead's own header and footer bands.
 */
export function docxHasOwnLetterhead(docx: Uint8Array): boolean {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(docx);
  } catch {
    return false;
  }
  for (const [name, bytes] of Object.entries(files)) {
    const isHeaderFooter = /^word\/(header|footer)\d*\.xml$/.test(name);
    if (!isHeaderFooter && name !== "word/document.xml") continue;
    const xml = strFromU8(bytes);
    if (isHeaderFooter) {
      if (/<w:drawing\b|<w:pict\b|<v:imagedata\b/.test(xml)) return true;
      if ([...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].some((m) => m[1].trim())) return true;
    } else if (/<wp:anchor\b[^>]*\bbehindDoc="1"/.test(xml)) {
      return true;
    }
  }
  return false;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${escapeRe(name)}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
}

function setAttr(tag: string, name: string, value: string): string {
  const re = new RegExp(`(\\s${escapeRe(name)}=")[^"]*(")`);
  if (re.test(tag)) return tag.replace(re, `$1${value}$2`);
  return tag.replace(/\s*(\/?)>$/, ` ${name}="${value}"$1>`);
}

function relationshipIds(relsXml: string): Set<string> {
  return new Set([...relsXml.matchAll(/\sId="([^"]+)"/g)].map((m) => m[1]));
}

function uniqueId(prefix: string, taken: Set<string>): string {
  let i = 1;
  while (taken.has(`${prefix}${i}`)) i++;
  const id = `${prefix}${i}`;
  taken.add(id);
  return id;
}

function addRelationship(relsXml: string | undefined, id: string, type: string, target: string): string {
  const rel = `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`;
  if (!relsXml || !/<Relationships\b/.test(relsXml)) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${NS.pkgRels}">${rel}</Relationships>`;
  }
  if (/<Relationships\b[^>]*\/>/.test(relsXml)) {
    return relsXml.replace(/<Relationships\b([^>]*)\/>/, `<Relationships$1>${rel}</Relationships>`);
  }
  return relsXml.replace(/<\/Relationships>\s*$/, `${rel}</Relationships>`);
}

function ensureRootNamespaces(xml: string, rootTag: string, prefixes: Array<keyof typeof NS>): string {
  const re = new RegExp(`<${escapeRe(rootTag)}\\b[^>]*>`);
  const m = re.exec(xml);
  if (!m) return xml;
  let open = m[0];
  for (const p of prefixes) {
    if (!new RegExp(`\\sxmlns:${p}="`).test(open)) open = open.replace(/>$/, ` xmlns:${p}="${NS[p]}">`);
  }
  return xml.slice(0, m.index) + open + xml.slice(m.index + m[0].length);
}

function letterheadParagraph(relId: string, docPrId: number, cx: number, cy: number): string {
  return (
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr>` +
    `<w:r><w:rPr><w:noProof/><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr><w:drawing>` +
    `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1">` +
    `<wp:simplePos x="0" y="0"/>` +
    `<wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:wrapNone/>` +
    `<wp:docPr id="${docPrId}" name="Company letterhead"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${NS.a}" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="${NS.a}"><a:graphicData uri="${NS.pic}">` +
    `<pic:pic xmlns:pic="${NS.pic}">` +
    `<pic:nvPicPr><pic:cNvPr id="${docPrId}" name="Company letterhead"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`
  );
}

/** Raise each page margin to at least the letterhead's safe area (never lowers one). */
function raiseMargins(sectPr: string, margins: LetterheadMarginsMm | undefined): string {
  if (!margins) return sectPr;
  return sectPr.replace(/<w:pgMar\b[^>]*\/>/, (tag) => {
    let out = tag;
    for (const side of ["top", "bottom", "left", "right"] as const) {
      const needed = Math.ceil((Number(margins[side]) || 0) * TWIPS_PER_MM);
      const current = Number(attr(out, `w:${side}`) ?? "0");
      if (needed > 0 && Math.abs(current) < needed) out = setAttr(out, `w:${side}`, String(current < 0 ? -needed : needed));
    }
    return out;
  });
}

function isOn(xml: string, tag: string): boolean {
  const m = new RegExp(`<${escapeRe(tag)}\\b([^>]*)/?>`).exec(xml);
  if (!m) return false;
  const val = attr(m[0], "w:val");
  return val === null || !/^(0|false|off)$/i.test(val);
}

/**
 * Add the letterhead to a Word file. Returns new .docx bytes; throws only on a
 * file that is not a readable Word document.
 */
export function applyLetterheadToDocx(
  docx: Uint8Array,
  image: LetterheadImage,
  margins?: LetterheadMarginsMm,
): Uint8Array {
  const files = unzipSync(docx);
  const docPath = "word/document.xml";
  const docRelsPath = "word/_rels/document.xml.rels";
  if (!files[docPath]) throw new Error("Not a Word document (word/document.xml is missing)");

  let documentXml = strFromU8(files[docPath]);
  let docRels = files[docRelsPath] ? strFromU8(files[docRelsPath]) : undefined;
  let contentTypes = files["[Content_Types].xml"] ? strFromU8(files["[Content_Types].xml"]) : "";
  if (!contentTypes) throw new Error("Not a Word document ([Content_Types].xml is missing)");
  const settings = files["word/settings.xml"] ? strFromU8(files["word/settings.xml"]) : "";
  const evenAndOdd = isOn(settings, "w:evenAndOddHeaders");

  // 1. The image itself.
  const ext = image.mime === "image/png" ? "png" : "jpeg";
  let mediaName = `blynk_letterhead.${ext}`;
  for (let i = 2; files[`word/media/${mediaName}`]; i++) mediaName = `blynk_letterhead_${i}.${ext}`;
  files[`word/media/${mediaName}`] = image.bytes;
  if (!new RegExp(`<Default\\b[^>]*\\bExtension="${ext}"`, "i").test(contentTypes)) {
    contentTypes = contentTypes.replace(/<\/Types>\s*$/, `<Default Extension="${ext}" ContentType="${image.mime}"/></Types>`);
  }

  // 2. Unique drawing id across the whole document.
  let maxDocPr = 0;
  for (const [name, bytes] of Object.entries(files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
    for (const m of strFromU8(bytes).matchAll(/<wp:docPr\b[^>]*\sid="(\d+)"/g)) maxDocPr = Math.max(maxDocPr, Number(m[1]));
  }
  const docPrId = maxDocPr + 1;

  // Page size of the first section → full-page image extent.
  const firstSect = /<w:sectPr\b[\s\S]*?<\/w:sectPr>/.exec(documentXml)?.[0] || "";
  const pgSz = /<w:pgSz\b[^>]*\/>/.exec(firstSect)?.[0] || "";
  const pageW = Number(attr(pgSz, "w:w")) || 11906; // A4
  const pageH = Number(attr(pgSz, "w:h")) || 16838;
  const cx = Math.round(pageW * EMU_PER_TWIP);
  const cy = Math.round(pageH * EMU_PER_TWIP);

  const docRelIds = relationshipIds(docRels || "");
  const targetOf = (rid: string): string | null => {
    const m = new RegExp(`<Relationship\\b[^>]*\\sId="${escapeRe(rid)}"[^>]*>`).exec(docRels || "");
    return m ? attr(m[0], "Target") : null;
  };

  // 3. Existing header parts get the image prepended (once each).
  const decorated = new Set<string>();
  const decorateHeaderPart = (target: string) => {
    const part = `word/${target.replace(/^\/?word\//, "").replace(/^\.\//, "")}`;
    if (decorated.has(part) || !files[part]) return;
    decorated.add(part);
    const relsPath = part.replace(/^word\/(.+)$/, "word/_rels/$1.rels");
    let rels = files[relsPath] ? strFromU8(files[relsPath]) : undefined;
    const imgRel = uniqueId("rIdLetterhead", relationshipIds(rels || ""));
    rels = addRelationship(rels, imgRel, REL_IMAGE, `media/${mediaName}`);
    files[relsPath] = strToU8(rels);
    let xml = ensureRootNamespaces(strFromU8(files[part]), "w:hdr", ["w", "r", "wp"]);
    xml = xml.replace(/(<w:hdr\b[^>]*>)/, `$1${letterheadParagraph(imgRel, docPrId + decorated.size, cx, cy)}`);
    files[part] = strToU8(xml);
  };

  // 4. A new header part for sections that have no header of a needed type.
  let newHeaderRid: string | null = null;
  const newHeaderRef = (): string => {
    if (newHeaderRid) return newHeaderRid;
    let n = 1;
    while (files[`word/header${n}.xml`]) n++;
    const part = `header${n}.xml`;
    files[`word/${part}`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<w:hdr xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:wp="${NS.wp}">` +
        letterheadParagraph("rIdLetterheadImage", docPrId, cx, cy) +
        `</w:hdr>`,
    );
    files[`word/_rels/${part}.rels`] = strToU8(addRelationship(undefined, "rIdLetterheadImage", REL_IMAGE, `media/${mediaName}`));
    contentTypes = contentTypes.replace(/<\/Types>\s*$/, `<Override PartName="/word/${part}" ContentType="${CT_HEADER}"/></Types>`);
    newHeaderRid = uniqueId("rIdLetterheadHdr", docRelIds);
    docRels = addRelationship(docRels, newHeaderRid, REL_HEADER, part);
    return newHeaderRid;
  };

  // 5. Walk every section in order. A later section without its own header
  //    reference inherits the previous one, so only the first section gains one.
  let sectionIndex = 0;
  documentXml = documentXml.replace(/<w:sectPr\b[^>]*?(?:\/>|>[\s\S]*?<\/w:sectPr>)/g, (sect) => {
    const isFirst = sectionIndex === 0;
    sectionIndex++;
    let out = sect.endsWith("/>") ? sect.replace(/\s*\/>$/, "></w:sectPr>") : sect;
    const types = ["default"];
    if (isOn(out, "w:titlePg")) types.push("first");
    if (evenAndOdd) types.push("even");
    const added: string[] = [];
    for (const type of types) {
      const ref = new RegExp(`<w:headerReference\\b[^>]*w:type="${type}"[^>]*/>`).exec(out)?.[0];
      if (ref) {
        const rid = attr(ref, "r:id");
        const target = rid ? targetOf(rid) : null;
        if (target) decorateHeaderPart(target);
      } else if (isFirst) {
        added.push(`<w:headerReference w:type="${type}" r:id="${newHeaderRef()}"/>`);
      }
    }
    if (added.length) out = out.replace(/(<w:sectPr\b[^>]*>)/, `$1${added.join("")}`);
    return raiseMargins(out, margins);
  });
  if (sectionIndex === 0) throw new Error("This Word file has no page settings (sectPr) to attach the letterhead to");

  documentXml = ensureRootNamespaces(documentXml, "w:document", ["r"]);
  files[docPath] = strToU8(documentXml);
  if (docRels) files[docRelsPath] = strToU8(docRels);
  files["[Content_Types].xml"] = strToU8(contentTypes);
  return zipSync(files, { level: 6 });
}

export interface LetterheadSheet {
  imageDataUri: string | null;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
}

/** Re-encode any browser-decodable image (WebP, GIF…) as PNG, which Word accepts. */
async function toPng(dataUri: string): Promise<LetterheadImage | null> {
  if (typeof document === "undefined" || !/^data:image\//i.test(dataUri)) return null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = dataUri;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx || !canvas.width || !canvas.height) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return dataUriToImage(canvas.toDataURL("image/png"));
  } catch {
    return null;
  }
}

/**
 * The letterhead as an image Word can embed (JPEG/PNG as-is, anything else
 * converted to PNG). Throws a clear message when there is none — callers do this
 * before allocating a reference number so a missing letterhead never wastes one.
 */
export async function letterheadImage(sheet: LetterheadSheet | null | undefined): Promise<LetterheadImage> {
  const uri = sheet?.imageDataUri || "";
  const image = dataUriToImage(uri) || (await toPng(uri));
  if (!image) {
    throw new Error("The company letterhead image is not available — upload it under Company identity, or turn off “Print on company letterhead” for this template.");
  }
  return image;
}

/** Blob-level convenience for the generator: Word blob + letterhead → Word blob. */
export async function applyLetterheadToDocxBlob(
  docx: Blob,
  letterhead: LetterheadSheet,
  prepared?: LetterheadImage,
): Promise<Blob> {
  const image = prepared || (await letterheadImage(letterhead));
  const out = applyLetterheadToDocx(new Uint8Array(await docx.arrayBuffer()), image, {
    top: letterhead.marginTopMm,
    bottom: letterhead.marginBottomMm,
    left: letterhead.marginLeftMm,
    right: letterhead.marginRightMm,
  });
  return new Blob([out.slice().buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
