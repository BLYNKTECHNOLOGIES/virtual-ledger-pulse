// ATS imports: a folder of resumes (PDF or Word). The text of each resume is read in the browser to suggest the
// candidate's name, email and phone; HR checks them before anything is imported.
import { AtsFileError, uploadAtsFile } from "./files";
import { buildRows, guessFromResume, type ImportRow } from "./importParse";
import { rowPayload, sendRows, type RowResult } from "./imports";

export const MAX_RESUMES = 50;
export const RESUME_EXTS = ["pdf", "doc", "docx"];
export const resumeExt = (name: string) => (name.split(".").pop() ?? "").toLowerCase();

let pdfjsPromise: Promise<any> | null = null;
function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs: any = await import("pdfjs-dist");
      const workerMod: any = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default ?? workerMod;
      return pdfjs;
    })().catch((e) => { pdfjsPromise = null; throw e; });
  }
  return pdfjsPromise;
}

/** Text of a resume (PDF: first 2 pages; Word .docx), or "" when it can't be read (old .doc, scanned PDF). */
export async function readResumeText(file: File): Promise<string> {
  const ext = resumeExt(file.name);
  try {
    if (ext === "pdf") {
      const pdfjs = await getPdfjs();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      let text = "";
      try {
        for (let p = 1; p <= Math.min(doc.numPages, 2); p++) {
          const page = await doc.getPage(p);
          const tc = await page.getTextContent();
          text += tc.items.map((it: any) => `${it.str ?? ""}${it.hasEOL ? "\n" : " "}`).join("") + "\n";
        }
      } finally {
        try { await doc.destroy(); } catch { /* ignore */ }
      }
      return text.slice(0, 20000);
    }
    if (ext === "docx") {
      const mod: any = await import("mammoth");
      const mammoth = mod.extractRawText ? mod : mod.default;
      const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return String(r?.value ?? "").slice(0, 20000);
    }
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
