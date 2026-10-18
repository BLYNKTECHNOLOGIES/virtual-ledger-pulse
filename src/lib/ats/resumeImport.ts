// ATS resumes (PDF or Word): the text is read in the browser to suggest the candidate's name, email and phone — for a
// folder of resumes, Add candidate and a candidate's page. HR checks the suggestions before anything is saved.
import { AtsFileError, uploadAtsFile } from "./files";
import { buildRows, guessFromResume, type ImportRow } from "./importParse";
import { rowPayload, sendRows, type RowResult } from "./imports";

export const MAX_RESUMES = 50;
export const RESUME_EXTS = ["pdf", "doc", "docx"];
export const resumeExt = (name: string) => (name.split(".").pop() ?? "").toLowerCase();

let pdfjsPromise: Promise<any> | null = null;
/** pdf.js "legacy" build: it carries the newer JavaScript features it needs, so PDFs made by Word read in every browser. */
function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const workerMod: any = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default ?? workerMod;
      return pdfjs;
    })().catch((e) => { pdfjsPromise = null; throw e; });
  }
  return pdfjsPromise;
}

const MAX_TEXT = 20000;
/** Markup read at most (resumes are far smaller; a web archive's pictures come after its page). */
const MAX_MARKUP = 2_000_000;
const MAILTO = /^\s*mailto:/i;
const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
/** The address of a mailto: link ("mailto:a@b.com?subject=Hi" → "a@b.com"), or "" for any other link. */
const mailtoAddress = (url: unknown) => {
  const u = String(url ?? "");
  return MAILTO.test(u) ? safeDecode(u.replace(MAILTO, "").split("?")[0]).trim() : "";
};
const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const unescapeEntities = (s: string) => s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, e: string) => {
  if (e[0] !== "#") return ENTITY[e.toLowerCase()] ?? m;
  const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
});

const BLOCKS = "p,div,h1,h2,h3,h4,h5,h6,li,tr,td,th,table,ul,ol,section,header,footer,blockquote,w\\:p";
/**
 * Text of an HTML page (also Word's HTML from mammoth): block ends become line breaks, scripts and styles are
 * dropped, and each mailto link's address is written on its own line before its words. The browser parses it,
 * so broken markup can't slow it down.
 */
function htmlText(html: string): string {
  const doc = new DOMParser().parseFromString(html.slice(0, MAX_MARKUP), "text/html");
  doc.querySelectorAll("script,style,noscript,template,title").forEach((n) => n.remove());
  doc.querySelectorAll("a[href]").forEach((a) => { const addr = mailtoAddress(a.getAttribute("href")); if (addr) a.prepend(`\n${addr}\n`); });
  doc.querySelectorAll("br,hr").forEach((n) => n.replaceWith("\n"));
  doc.querySelectorAll(BLOCKS).forEach((n) => n.append("\n"));
  return doc.body?.textContent ?? "";
}

/** Text of a Word XML part: paragraphs, tabs and the addresses of mailto links (rels: link id → target). Patterns stop at the next tag. */
function wordXmlText(xml: string, rels: Map<string, string>): string {
  const link = (target: string) => { const a = mailtoAddress(unescapeEntities(target)); return a ? `\n${a}\n` : ""; };
  return unescapeEntities(xml.slice(0, MAX_MARKUP)
    .replace(/<w:delText\b[^<>]*>[^<]*<\/w:delText>/g, "")
    .replace(/<w:hyperlink\b[^<>]*?\br:id="([^"<>]+)"[^<>]*>/g, (_m, id: string) => link(rels.get(id) ?? ""))
    .replace(/<w:fldSimple\b[^<>]*?\bw:instr="([^"<>]*)"[^<>]*>/g, (_m, instr: string) => link(unescapeEntities(instr).match(/mailto:[^\s"]+/i)?.[0] ?? ""))
    .replace(/<w:(?:tab|br|cr)\b[^<>]*\/>/g, " ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^<>]*>/g, ""));
}

const relTargets = (xml: string) => {
  const m = new Map<string, string>();
  for (const r of xml.matchAll(/<Relationship\b[^<>]*>/g)) {
    const id = r[0].match(/\bId="([^"<>]+)"/)?.[1];
    const target = r[0].match(/\bTarget="([^"<>]+)"/)?.[1];
    if (id && target) m.set(id, target);
  }
  return m;
};

interface PdfLink { email: string; box: [number, number, number, number] }

/**
 * One PDF page's text in content order (pdf.js marks the gaps between words itself, so pieces are joined as they
 * are: an email whose halves use different fonts stays whole). Each mailto link's address is written on its own
 * line right after the words it sits on, so it never joins the name or the contact line; a link on an icon (no
 * words under it) is written after the page's text, so an address that is visible on the page comes first.
 */
function pdfPageText(items: any[], links: PdfLink[]): string {
  const placed = new Set<string>();
  let out = "";
  let lastY: number | null = null;
  let lastH = 0;
  let open = false;
  for (const it of items) {
    const s = typeof it?.str === "string" ? it.str : "";
    const t = Array.isArray(it?.transform) ? it.transform : null;
    const x = t ? Number(t[4]) : NaN;
    const y = t ? Number(t[5]) : NaN;
    const h = Math.abs(Number(it?.height) || 0);
    const w = Math.abs(Number(it?.width) || 0);
    const real = !!s.trim() && Number.isFinite(x) && Number.isFinite(y);
    // A new line pdf.js didn't mark: keep the two lines apart.
    if (open && real && lastY != null && Math.abs(y - lastY) > Math.max(lastH, 1) / 2) out += "\n";
    out += s;
    if (real) {
      for (const l of links) {
        if (placed.has(l.email)) continue;
        const [x1, y1, x2, y2] = l.box;
        if (x <= x2 + 1 && x + w >= x1 - 1 && y <= y2 + 1 && y + Math.max(h, 1) >= y1 - 1) { out += `\n${l.email}\n`; placed.add(l.email); }
      }
      lastY = y;
      lastH = h || lastH;
    }
    if (it?.hasEOL) { out += "\n"; open = false; } else if (s) open = true;
  }
  const rest = [...new Set(links.map((l) => l.email).filter((e) => !placed.has(e)))];
  return `${out}\n${rest.length ? `${rest.join("\n")}\n` : ""}`;
}

async function pdfText(data: Uint8Array): Promise<string> {
  const pdfjs = await getPdfjs();
  // pdf.js 6: only the loading task can be destroyed, and destroying it ends the document's worker.
  const task = pdfjs.getDocument({ data });
  let out = "";
  try {
    const doc = await task.promise;
    for (let p = 1; p <= Math.min(doc.numPages, 5) && out.length < MAX_TEXT; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      let links: PdfLink[] = [];
      try {
        const ann: any[] = await page.getAnnotations();
        links = ann.flatMap((a) => {
          const email = mailtoAddress(a?.url ?? a?.unsafeUrl);
          const r = Array.isArray(a?.rect) ? a.rect.map(Number) : [];
          if (!email || r.length !== 4 || r.some((n: number) => !Number.isFinite(n))) return [];
          return [{ email, box: [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])] as PdfLink["box"] }];
        });
      } catch { /* links are a bonus */ }
      out += pdfPageText(tc.items, links);
    }
  } finally {
    try { await task.destroy(); } catch { /* ignore */ }
  }
  return out;
}

/**
 * Word .docx: the body (each mailto link's address next to its words), then the page headers, then the footers —
 * so the candidate's own details come before a letterhead or an agency's footer.
 */
async function docxText(buf: ArrayBuffer): Promise<string> {
  const mod: any = await import("mammoth");
  const mammoth = mod.convertToHtml ? mod : mod.default;
  const r = await mammoth.convertToHtml({ arrayBuffer: buf }, { convertImage: mammoth.images.imgElement(async () => ({ src: "" })) });
  const body = htmlText(String(r?.value ?? ""));
  let simple = "";
  let heads = "";
  let feet = "";
  try {
    const { unzipSync, strFromU8 } = await import("fflate");
    const parts = unzipSync(new Uint8Array(buf), {
      filter: (f) => f.name === "word/document.xml" || /^word\/(?:_rels\/)?(?:header|footer)\d*\.xml(?:\.rels)?$/.test(f.name),
    });
    // mammoth leaves out simple fields, so a link written as one (HYPERLINK "mailto:…") is read from the XML.
    const docXml = parts["word/document.xml"] ? strFromU8(parts["word/document.xml"]).slice(0, 4 * MAX_MARKUP) : "";
    for (const m of docXml.matchAll(/<w:fldSimple\b[^<>]*?\bw:instr="([^"<>]*)"/g)) {
      const a = mailtoAddress(unescapeEntities(m[1]).match(/mailto:[^\s"]+/i)?.[0] ?? "");
      if (a) simple += `${a}\n`;
    }
    for (const name of Object.keys(parts).sort()) {
      const m = name.match(/^word\/(header|footer)\d*\.xml$/);
      if (!m) continue;
      const rels = parts[`word/_rels/${name.slice(5)}.rels`];
      const text = `${wordXmlText(strFromU8(parts[name]), rels ? relTargets(strFromU8(rels)) : new Map())}\n`;
      if (m[1] === "header") heads += text; else feet += text;
    }
  } catch { /* fields, headers and footers are a bonus */ }
  return `${body}\n${simple}${heads}${feet}`;
}

/**
 * Old Word 97–2003 .doc: the text pieces listed in the table stream. The body and its text boxes come first, then
 * the page headers, then the footers (split with the header/footer table), then notes. "" when encrypted or older
 * than Word 97.
 */
async function docText(bytes: Uint8Array): Promise<string> {
  const XLSX: any = await import("xlsx");
  const CFB = XLSX.CFB ?? XLSX.default?.CFB;
  const cfb = CFB.read(bytes, { type: "array" });
  const stream = (name: string): Uint8Array | null => {
    const c = CFB.find(cfb, name)?.content;
    return c ? (c instanceof Uint8Array ? c : Uint8Array.from(c as ArrayLike<number>)) : null;
  };
  const wd = stream("WordDocument");
  if (!wd || wd.length < 0x1aa) return "";
  const dv = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);
  const flags = dv.getUint16(0x0a, true);
  if (dv.getUint16(0, true) !== 0xa5ec || dv.getUint16(2, true) < 0xc1 || flags & 0x0100) return "";
  const table = stream(flags & 0x0200 ? "1Table" : "0Table");
  const fcClx = dv.getUint32(0x1a2, true);
  const lcbClx = dv.getUint32(0x1a6, true);
  if (!table || !lcbClx || fcClx + lcbClx > table.length) return "";
  const tv = new DataView(table.buffer, table.byteOffset, table.byteLength);
  let i = fcClx;
  while (i < fcClx + lcbClx && table[i] === 0x01) i += 3 + tv.getUint16(i + 1, true);
  if (table[i] !== 0x02 || i + 5 > table.length) return "";
  const lcb = tv.getUint32(i + 1, true);
  const plc = i + 5;
  const n = Math.floor((lcb - 4) / 12);
  if (n < 1 || plc + lcb > table.length) return "";
  const ansi = new TextDecoder("windows-1252");
  const utf16 = new TextDecoder("utf-16le");
  let text = "";
  for (let k = 0; k < n && text.length < 4 * MAX_TEXT; k++) {
    const cp0 = tv.getUint32(plc + 4 * k, true);
    const cp1 = tv.getUint32(plc + 4 * (k + 1), true);
    if (cp1 <= cp0) continue;
    const raw = tv.getUint32(plc + 4 * (n + 1) + 8 * k + 2, true);
    const fc = raw & 0x3fffffff;
    text += raw & 0x40000000 ? ansi.decode(wd.subarray(fc / 2, fc / 2 + (cp1 - cp0))) : utf16.decode(wd.subarray(fc, fc + 2 * (cp1 - cp0)));
  }
  // Story lengths in order: main text, footnotes, headers and footers, (unused), comments, endnotes, text boxes, header text boxes.
  const len = [0x4c, 0x50, 0x54, 0x58, 0x5c, 0x60, 0x64, 0x68].map((o) => Math.max(0, dv.getInt32(o, true)));
  const story: string[] = [];
  let at = 0;
  for (const l of len) { story.push(text.slice(at, at + l)); at += l; }
  const [main, ftn, hdd, , atn, edn, txbx, hdrTxbx] = story;
  // One story holds every header and footer. The header/footer table (PlcfHdd) says where each starts: 6 note
  // separators, then per section: even header, odd header, even footer, odd footer, first-page header, first-page footer.
  let heads = "";
  let feet = hdd;
  const fcHdd = dv.getUint32(0xf2, true);
  const lcbHdd = dv.getUint32(0xf6, true);
  if (hdd && lcbHdd >= 4 * 9 && fcHdd + lcbHdd <= table.length) {
    const cps: number[] = [];
    for (let o = fcHdd; o + 4 <= fcHdd + lcbHdd; o += 4) cps.push(tv.getUint32(o, true));
    feet = "";
    for (let k = 6; k + 2 < cps.length; k++) {
      const part = hdd.slice(cps[k], cps[k + 1]);
      if ((k - 6) % 6 === 2 || (k - 6) % 6 === 3 || (k - 6) % 6 === 5) feet += `${part}\n`; else heads += `${part}\n`;
    }
  }
  return [main || text, txbx, heads, hdrTxbx, feet, ftn, edn, atn].join("\n")
    .replace(/[\r\x07\x0b\x0c]/g, "\n").replace(/\x1e/g, "-").replace(/[\x13\x14\x15]/g, " ").replace(/[\x00-\x08\x0e-\x1f]/g, "");
}

/**
 * Text of an RTF file: the body, then page headers, then footers (as for Word files). Font, colour and style
 * tables, pictures, shape settings and document info are skipped; a text box's text is kept; of a field's
 * instruction only a mailto link's address is kept.
 */
function rtfText(rtf: string): string {
  const SKIP = new Set(["fonttbl", "colortbl", "stylesheet", "info", "pict", "themedata", "colorschememapping", "latentstyles", "datastore",
    "xmlnstbl", "listtable", "listoverridetable", "rsidtbl", "generator", "pgdsctbl", "filetbl", "revtbl", "object", "nonshppict", "sp", "shprslt"]);
  // "\*" groups hold no document text, except a field's instruction (a link's target) and a shape (its text box).
  const KEEP_STARRED = new Set(["fldinst", "shpinst"]);
  interface Sink { s: string }
  interface Group { skip: boolean; sink: Sink; field: boolean; nl: boolean }
  const body: Sink = { s: "" };
  const heads: Sink = { s: "" };
  const feet: Sink = { s: "" };
  const root = (): Group => ({ skip: false, sink: body, field: false, nl: false });
  const stack: Group[] = [];
  let g = root();
  let star = false;
  let fresh = false;
  let ucSkip = 1;
  let pending = 0;
  const ansi = new TextDecoder("windows-1252");
  const emit = (t: string) => { g.sink.s += t; };
  const re = /\\([a-z]{1,32})(-?\d{1,10})? ?|\\'([0-9a-f]{2})|\\([^a-z])|([{}])|[\r\n]+|([^\\{}\r\n]+)/gi;
  for (const m of rtf.matchAll(re)) {
    const [, word, arg, hex, sym, brace, plain] = m;
    if (brace === "{") { stack.push(g); g = { skip: g.skip, sink: g.sink, field: false, nl: false }; fresh = true; star = false; continue; }
    if (brace === "}") {
      const closing = g;
      g = stack.pop() ?? root();
      if (!closing.skip && closing.field) { const a = closing.sink.s.match(/mailto:\s*([^\s"\\}]+)/i)?.[1]; if (a) emit(`\n${a}\n`); }
      else if (!closing.skip && closing.nl) closing.sink.s += "\n";
      fresh = false;
      pending = 0;
      continue;
    }
    if (sym === "*") { star = true; continue; }
    if (word) {
      const w = word.toLowerCase();
      if (fresh) {
        if (SKIP.has(w) || (star && !KEEP_STARRED.has(w))) g.skip = true;
        else if (w === "fldinst") { g.sink = { s: "" }; g.field = true; }
        else if (/^header[lrf]?$/.test(w)) { g.sink = heads; g.nl = true; }
        else if (/^footer[lrf]?$/.test(w)) { g.sink = feet; g.nl = true; }
        else if (w === "shptxt") { emit("\n"); g.nl = true; }
      }
      fresh = false;
      star = false;
      if (g.skip) continue;
      if (w === "par" || w === "line" || w === "row" || w === "cell" || w === "sect" || w === "page") emit("\n");
      else if (w === "tab") emit(" ");
      else if (w === "uc") ucSkip = Math.max(0, Number(arg) || 0);
      else if (w === "u" && arg) { const c = Number(arg); emit(String.fromCharCode(c < 0 ? c + 65536 : c)); pending = ucSkip; }
      continue;
    }
    fresh = false;
    if (g.skip) continue;
    if (hex) { if (pending > 0) { pending--; continue; } emit(ansi.decode(new Uint8Array([parseInt(hex, 16)]))); continue; }
    // "\" at a line end is a paragraph mark (TextEdit writes every line break this way).
    if (sym) { emit(sym === "\n" || sym === "\r" ? "\n" : sym === "~" ? " " : sym === "_" ? "-" : sym === "\\" || sym === "{" || sym === "}" ? sym : ""); continue; }
    if (plain) {
      const k = Math.min(pending, plain.length);
      pending -= k;
      emit(plain.slice(k));
    }
  }
  return `${body.s}\n${heads.s}\n${feet.s}`;
}

type ResumeKind = "pdf" | "docx" | "doc" | "rtf" | "html" | null;
/** What a resume file really is, from its first bytes: job sites often give a .doc name to Word, RTF or web-page files. */
function sniffResume(bytes: Uint8Array): ResumeKind {
  const head = String.fromCharCode(...bytes.subarray(0, 1024));
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "docx";
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return "doc";
  if (head.includes("%PDF-")) return "pdf";
  const start = head.replace(/^(?:\xef\xbb\xbf|\uFEFF)/, "").trimStart();
  if (start.startsWith("{\\rtf")) return "rtf";
  if (/^(?:<|mime-version\s*:)/i.test(start)) return "html";
  return null;
}

/**
 * Text of a resume, or "" when it can't be read (a scanned or photographed resume has no text; an image needs OCR).
 * PDF: pages 1–5. Word .docx and old .doc: the body, then page headers, then footers. RTF and web pages saved as
 * .doc too. The address of every mailto link is written into the text (many resumes only link the word "Email").
 */
export async function readResumeText(file: File): Promise<string> {
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const kind = sniffResume(bytes);
    let text = "";
    if (kind === "pdf") text = await pdfText(bytes);
    else if (kind === "docx") text = await docxText(buf);
    else if (kind === "doc") text = await docText(bytes);
    else if (kind === "rtf") text = rtfText(new TextDecoder("windows-1252").decode(bytes));
    else if (kind === "html") {
      let s = new TextDecoder("utf-8").decode(bytes.subarray(0, MAX_MARKUP));
      // A web archive (.mht saved as .doc): undo quoted-printable line wrapping first.
      if (/^\s*mime-version\s*:/i.test(s)) s = s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
      text = htmlText(s);
    }
    return text.slice(0, MAX_TEXT);
  } catch {
    /* unreadable: the name comes from the file name */
  }
  return "";
}

/** One resume in the list HR checks: the suggested details can be changed before importing. */
export interface ResumeDraft {
  key: string;
  file: File;
  name: string;
  email: string;
  phone: string;
  /** reading → done; "unreadable" when no text could be read (the name then comes from the file name). */
  state: "reading" | "done" | "unreadable";
}

let seq = 0;
/** Drafts for new files, in "reading" state, with the name from the file name until the text is read. */
export function newDrafts(files: File[]): ResumeDraft[] {
  return files.map((file) => ({
    key: `r${++seq}`, file, name: guessFromResume("", file.name).name, email: "", phone: "", state: "reading",
  }));
}

/**
 * Splits newly chosen files into those that can be added (at most `room` of them) and those that can't, with the
 * reason. A file with the same name and size as one already in the list (`existing`) is left out.
 */
export function sortResumeFiles(
  files: File[], existing: File[], room: number, maxBytes: number,
): { ok: File[]; rejected: { name: string; reason: string }[] } {
  const ok: File[] = [];
  const rejected: { name: string; reason: string }[] = [];
  const seen = new Set(existing.map((f) => `${f.name}|${f.size}`));
  for (const f of files) {
    const id = `${f.name}|${f.size}`;
    if (seen.has(id)) rejected.push({ name: f.name, reason: "Already in the list" });
    else if (!RESUME_EXTS.includes(resumeExt(f.name))) rejected.push({ name: f.name, reason: "Not a PDF or Word file" });
    else if (f.size > maxBytes) rejected.push({ name: f.name, reason: "Larger than 10 MB" });
    else if (f.size === 0) rejected.push({ name: f.name, reason: "Empty file" });
    else if (ok.length >= room) rejected.push({ name: f.name, reason: `Only ${MAX_RESUMES} resumes at a time` });
    else { ok.push(f); seen.add(id); }
  }
  return { ok, rejected };
}

/**
 * Reads the resumes of drafts still in "reading" state, one after another, and reports the suggested name, email and
 * phone for each. Stops when `control.cancelled` is set.
 */
export async function readDrafts(
  drafts: ResumeDraft[], control: { cancelled: boolean },
  onRead: (key: string, patch: Partial<ResumeDraft>) => void,
): Promise<void> {
  for (const d of drafts) {
    if (control.cancelled) return;
    if (d.state !== "reading") continue;
    const text = await readResumeText(d.file);
    if (control.cancelled) return;
    const g = guessFromResume(text, d.file.name);
    onRead(d.key, { name: g.name, email: g.email ?? "", phone: g.phone ?? "", state: text.trim() ? "done" : "unreadable" });
  }
}

/** Import rows for the drafts (row_no = position in the list, from 1), read the same way as a file's rows. */
export function resumeRows(drafts: Pick<ResumeDraft, "name" | "email" | "phone">[]): ImportRow[] {
  return buildRows(["Name", "Email", "Phone"], drafts.map((d) => [d.name, d.email, d.phone]),
    ["full_name", "email", "phone"], { salaryUnit: "month", rowNumbers: drafts.map((_, i) => i + 1) });
}

/** What happened to a resume file: attached to the candidate, already there, failed, or not attached (row skipped). */
export type AttachState = "attached" | "duplicate" | "failed" | "none";

/**
 * Imports the rows one at a time and attaches each resume right after its row, so an import that is left
 * unfinished can still be undone cleanly. Stops before the next resume when `control.cancelled` is set. A failed
 * attachment doesn't stop the import (it is reported as "failed"); a failed row throws with `done` = how many
 * resumes were handled before it.
 */
export async function importResumes(
  importId: string, drafts: Pick<ResumeDraft, "file">[], rows: ImportRow[],
  opts: { startAt?: number; control: { cancelled: boolean }; onRow: (index: number, result: RowResult, attach: AttachState) => void },
): Promise<{ done: number; cancelled: boolean }> {
  let i = opts.startAt ?? 0;
  for (; i < rows.length; i++) {
    if (opts.control.cancelled) return { done: i, cancelled: true };
    let result: RowResult | null = null;
    try {
      await sendRows(importId, [rowPayload(rows[i])], {
        control: { cancelled: false },
        onChunk: (_n, res) => { result = res[0] ?? null; },
      });
    } catch (e) {
      throw Object.assign(e as object, { done: i });
    }
    const r = result as RowResult | null;
    if (!r) throw Object.assign(new Error("No result"), { done: i });
    opts.onRow(i, r, await attachResume(drafts[i].file, r));
  }
  return { done: i, cancelled: false };
}

/** Attaches a resume to the candidate of an imported row (only when the row was imported). */
export async function attachResume(file: File, r: Pick<RowResult, "outcome" | "candidate_id" | "application_id">): Promise<AttachState> {
  if (!r.candidate_id || !["created", "added", "existing"].includes(r.outcome)) return "none";
  try {
    await uploadAtsFile({ file, candidateId: r.candidate_id, applicationId: r.application_id, kind: "resume", source: "import" });
    return "attached";
  } catch (e) {
    return e instanceof AtsFileError && e.reason === "duplicate" ? "duplicate" : "failed";
  }
}
