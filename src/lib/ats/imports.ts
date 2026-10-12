// ATS imports: database calls, reading Excel and CSV files, and the chunked import runner.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { ATS_BUCKET } from "./files";
import { cellText, isImportField, type CheckResult, type ImportField, type ImportRow, type SalaryUnit } from "./importParse";

export type AtsImport = Tables<"ats_imports">;
export type ImportListRow = AtsImport & { ats_sources: { name: string } | null; ats_jobs: { title: string } | null };
export type ImportRowRecord = Tables<"ats_import_rows"> & { ats_candidates: { full_name: string; ref_no: string } | null };
export type JobMode = "one" | "match" | "general";
export type Outcome = "created" | "added" | "existing" | "skipped" | "error";

export const importKeys = {
  all: ["ats", "imports"] as const,
  list: ["ats", "imports", "list"] as const,
  rows: (id: string, page: number, outcome: string) => ["ats", "imports", "rows", id, page, outcome] as const,
  answers: (appId: string) => ["ats", "imports", "answers", appId] as const,
};

/** What is stored in ats_imports.mapping, so the next file from the same portal is matched the same way. */
export interface StoredMapping { headers: string[]; fields: ImportField[]; salary_unit?: SalaryUnit }

export const OUTCOME_LABEL: Record<Outcome, string> = {
  created: "New candidate", added: "Added to existing candidate", existing: "Already applied",
  skipped: "Skipped", error: "Not imported",
};
export const REASON_LABEL: Record<string, string> = {
  no_name: "No name", no_contact: "No email or phone",
  ambiguous: "Email and phone belong to two different candidates", job_not_found: "The job no longer exists",
  invalid: "Some values couldn't be saved", duplicate: "Duplicate", forbidden: "No access", failed: "Couldn't import",
};
export const reasonLabel = (e: string | null) => (e ? REASON_LABEL[e] ?? "Couldn't import" : "");

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 2000;
export const UNDO_DAYS = 7;
export const IMPORT_ROWS_PAGE = 100;

// ---------------------------------------------------------------- database

export interface RowResult {
  row_no: number; outcome: Outcome; error: string | null; candidate_id: string | null; application_id: string | null; repeat?: boolean;
}

/** Who is already in the ATS, and who already applied for the target job (500 rows per call). */
export async function checkRows(
  rows: Pick<ImportRow, "row_no" | "email" | "phone" | "position_text">[], jobMode: JobMode, jobId: string | null,
): Promise<Map<number, CheckResult>> {
  const out = new Map<number, CheckResult>();
  for (let i = 0; i < rows.length; i += 500) {
    const part = rows.slice(i, i + 500).map((r) => ({ row_no: r.row_no, email: r.email, phone: r.phone, position_text: r.position_text }));
    const { data, error } = await supabase.rpc("ats_import_check", { p: { job_mode: jobMode, job_id: jobId, rows: part } as any });
    if (error) throw error;
    for (const c of (data ?? []) as unknown as CheckResult[]) out.set(c.row_no, c);
  }
  return out;
}

export async function beginImport(p: {
  kind: "file" | "resumes"; source_id: string | null; job_mode: JobMode; job_id: string | null;
  file_name: string | null; mapping?: StoredMapping | Record<string, never>; total_rows: number;
}): Promise<string> {
  const { data, error } = await supabase.rpc("ats_import_begin", { p: p as any });
  if (error) throw error;
  return data as unknown as string;
}

export interface ImportSummary { id: string; status: string; created: number; added: number; existing: number; skipped: number; errors: number }

export async function finishImport(id: string): Promise<ImportSummary> {
  const { data, error } = await supabase.rpc("ats_import_finish", { p_import_id: id });
  if (error) throw error;
  return data as unknown as ImportSummary;
}

export interface UndoResult { deleted_applications: number; deleted_candidates: number; kept: number; storage_paths: string[] }

export async function undoImport(id: string): Promise<UndoResult> {
  const { data, error } = await supabase.rpc("ats_import_undo", { p_import_id: id });
  if (error) throw error;
  return data as unknown as UndoResult;
}

/** Removes stored files (after an undo), 100 at a time. Returns how many could not be removed. */
export async function removeStoredFiles(paths: string[]): Promise<number> {
  let failed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const part = paths.slice(i, i + 100);
    const { error } = await supabase.storage.from(ATS_BUCKET).remove(part);
    if (error) failed += part.length;
  }
  return failed;
}

/** The row as the database wants it (the check-screen fields are left out). */
export const rowPayload = (r: ImportRow) => ({
  row_no: r.row_no, candidate: r.candidate, position_text: r.position_text, applied_at: r.applied_at,
  external_ref: r.external_ref, answers: r.answers,
});
export type RowPayload = ReturnType<typeof rowPayload>;

const errText = (e: unknown) => String((e as { message?: string })?.message ?? e ?? "");
const isTimeout = (e: unknown) =>
  (e as { code?: string })?.code === "57014" || /statement timeout|canceling statement/i.test(errText(e));
const isNetworkError = (e: unknown) =>
  /fetch|network|timed out|timeout|load failed|gateway|503|504/i.test(errText(e)) && !/ATS_/.test(errText(e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends rows to the database in chunks (50 by default). When the database takes too long, the chunk is made smaller
 * and sent again; a network error is tried again after a pause. Sending a row twice is safe: the database returns
 * the first result. Stops before the next chunk when `control.cancelled` is set. If a chunk still fails, the error
 * is thrown with `done` = how many rows were imported before it.
 */
export async function sendRows(
  importId: string, rows: RowPayload[],
  opts: { chunk?: number; startAt?: number; control: { cancelled: boolean }; onChunk: (done: number, results: RowResult[]) => void },
): Promise<{ done: number; cancelled: boolean }> {
  let size = opts.chunk ?? 50;
  let i = opts.startAt ?? 0;
  while (i < rows.length) {
    if (opts.control.cancelled) return { done: i, cancelled: true };
    let results: RowResult[] | null = null;
    let sent = 0;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 4 && !results; attempt++) {
      const part = rows.slice(i, i + size);
      const { data, error } = await supabase.rpc("ats_import_add_rows", { p_import_id: importId, p_rows: part as any });
      if (!error) {
        results = ((data as any)?.results ?? []) as RowResult[];
        sent = part.length;
        break;
      }
      lastErr = error;
      if (isTimeout(error) && size > 5) { size = Math.max(5, Math.floor(size / 2)); continue; }
      if (!isNetworkError(error) && !isTimeout(error)) throw Object.assign(error, { done: i });
      await sleep(attempt === 0 ? 1000 : 3000);
    }
    if (!results) throw Object.assign((lastErr as object) ?? new Error("network"), { done: i });
    i += sent;
    opts.onChunk(i, results);
  }
  return { done: i, cancelled: false };
}

/** The last 50 imports, newest first. */
export const useImports = () =>
  useQuery({
    queryKey: importKeys.list,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_imports").select("*, ats_sources(name), ats_jobs(title)")
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as ImportListRow[];
    },
  });

/** One page (100) of an import's rows, optionally only one outcome. */
export const useImportRows = (importId: string | null, page: number, outcome: Outcome | "all") =>
  useQuery({
    queryKey: importKeys.rows(importId ?? "", page, outcome),
    enabled: !!importId,
    queryFn: async () => {
      let q = supabase.from("ats_import_rows").select("*, ats_candidates(full_name, ref_no)", { count: "exact" })
        .eq("import_id", importId!).order("row_no")
        .range(page * IMPORT_ROWS_PAGE, page * IMPORT_ROWS_PAGE + IMPORT_ROWS_PAGE - 1);
      if (outcome !== "all") q = q.eq("outcome", outcome);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as ImportRowRecord[], total: count ?? 0 };
    },
  });

/** The extra details an import saved on an application, as [name, value] pairs sorted by name. */
export const useApplicationAnswers = (appId?: string | null) =>
  useQuery({
    queryKey: importKeys.answers(appId ?? ""),
    enabled: !!appId,
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_applications").select("answers").eq("id", appId!).maybeSingle();
      if (error) throw error;
      const a = (data?.answers ?? {}) as Record<string, unknown>;
      return Object.entries(a)
        .filter(([, v]) => v != null && String(v).trim() !== "")
        .map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)] as [string, string])
        .sort((x, y) => x[0].localeCompare(y[0]));
    },
  });

/** Last mapping used for files from this source with the same columns, or null. */
export async function lastMapping(sourceId: string, headers: string[]): Promise<StoredMapping | null> {
  const { data, error } = await supabase.from("ats_imports").select("mapping")
    .eq("source_id", sourceId).eq("kind", "file").order("created_at", { ascending: false }).limit(10);
  if (error) return null;
  const key = JSON.stringify(headers.map((h) => h.trim().toLowerCase()));
  for (const r of data ?? []) {
    const m = r.mapping as unknown as StoredMapping;
    if (m && Array.isArray(m.headers) && Array.isArray(m.fields) && m.fields.length === headers.length
      && m.fields.every(isImportField)
      && JSON.stringify(m.headers.map((h) => String(h).trim().toLowerCase())) === key) return m;
  }
  return null;
}

// ---------------------------------------------------------------- files

const BOM = String.fromCharCode(0xfeff);

/** Text of a CSV file: UTF-8 (with or without BOM), UTF-16 with BOM, or Windows-1252 when it isn't valid UTF-8. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    const s = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return s.startsWith(BOM) ? s.slice(1) : s;
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export interface SheetRows {
  rows: unknown[][];
  /** Row number (as Excel shows it) of rows[0]. */
  firstRow: number;
  /** True when the sheet has more rows than were read. */
  moreRows: boolean;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Reads an Excel (.xlsx, .xls) or CSV file. Only the first MAX_ROWS + 60 rows and the first 100 columns of a sheet
 * are read. Text is kept as written (leading zeros, dates as typed); Excel date cells become "YYYY-MM-DD" (with
 * " HH:MM" when there is a time), worked out from the cell value so no time-zone shift can change the day.
 */
export async function readSheets(file: File): Promise<{ names: string[]; read: (name: string) => SheetRows }> {
  const mod: any = await import("xlsx");
  const X: any = mod.SSF ? mod : mod.default ?? mod;
  const limit = MAX_ROWS + 60;
  const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const wb = isCsv
    ? X.read(decodeText(bytes), { type: "string", raw: true, sheetRows: limit })
    : X.read(bytes, { type: "array", raw: true, cellNF: true, sheetRows: limit });
  return {
    names: (wb.SheetNames as string[]).filter((n) => !!wb.Sheets[n]?.["!ref"]),
    read: (name: string) => {
      const ws = wb.Sheets[name];
      if (!ws?.["!ref"]) return { rows: [], firstRow: 1, moreRows: false };
      for (const key of Object.keys(ws)) {
        if (key.charAt(0) === "!") continue;
        const c = ws[key];
        if (!c || c.t !== "n" || typeof c.v !== "number" || !c.z || !X.SSF.is_date(c.z)) continue;
        const p = X.SSF.parse_date_code(c.v);
        if (!p) continue;
        const time = p.H || p.M ? `${pad2(p.H)}:${pad2(p.M)}` : "";
        c.t = "s";
        c.v = c.v < 1 ? time : `${p.y}-${pad2(p.m)}-${pad2(p.d)}${time ? ` ${time}` : ""}`;
      }
      const range = X.utils.decode_range(ws["!ref"]);
      range.e.c = Math.min(range.e.c, range.s.c + 99);
      const rows = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "", blankrows: true, range }) as unknown[][];
      const full = ws["!fullref"] ? X.utils.decode_range(ws["!fullref"]) : null;
      const moreRows = (full != null && full.e.r > range.e.r) || rows.length >= limit;
      return { rows, firstRow: range.s.r + 1, moreRows };
    },
  };
}

/**
 * A CSV file (UTF-8 with BOM, so Excel opens it correctly) from rows of cells. A value that Excel would run as a
 * formula (starting with =, @, or + / - followed by something other than a number) gets a ' in front.
 */
export function toCsv(rows: unknown[][]): Blob {
  const esc = (v: unknown) => {
    let s = v == null ? "" : typeof v === "number" || v instanceof Date ? cellText(v) : String(v);
    if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-]?[\d\s().,-]+$/.test(s))) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return new Blob([BOM + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
