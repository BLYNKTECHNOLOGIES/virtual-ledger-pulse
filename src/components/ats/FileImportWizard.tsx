import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { atsKeys, useAtsJobs, useAtsSources } from "@/lib/ats/api";
import { candKeys } from "@/lib/ats/candidates";
import { atsErrorMessage } from "@/lib/ats/errors";
import {
  IMPORT_FIELDS, ROW_STATUS_FILTERS, SALARY_UNITS, buildRows, checkMapping, columnHasData, columnSamples, countStatuses,
  fieldLabel, guessSalaryUnit, guessSourceCode, initialMapping, notImportedRows, prepareSheet, rowStatus, sameAsEarlier,
  type CheckResult, type ImportField, type RowStatusKey, type SalaryUnit, type SheetData,
} from "@/lib/ats/importParse";
import {
  MAX_FILE_BYTES, MAX_ROWS, beginImport, checkRows, downloadBlob, finishImport, importKeys, lastMapping, readSheets,
  reasonLabel, rowPayload, sendRows, toCsv, type ImportSummary, type JobMode, type RowResult, type SheetRows,
} from "@/lib/ats/imports";

type Step = "file" | "columns" | "check" | "run" | "done";
type Book = { names: string[]; read: (name: string) => SheetRows };
const LAST_SOURCE = "ats.import.lastSource";
const PAGE = 100;
const SALARY_FIELDS: ImportField[] = ["current_ctc", "expected_ctc"];
const TONE: Record<string, string> = {
  green: "text-emerald-600 dark:text-emerald-400",
  blue: "text-sky-600 dark:text-sky-400",
  muted: "text-muted-foreground",
  amber: "text-amber-600 dark:text-amber-400",
  red: "text-destructive",
};
const fmtN = (n: number) => n.toLocaleString("en-IN");

function Stepper({ step }: { step: Step }) {
  const idx = { file: 0, columns: 1, check: 2, run: 3, done: 3 }[step];
  const labels = ["File", "Columns", "Check", "Import"];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {labels.map((l, i) => {
        const done = i < idx || step === "done";
        return (
          <li key={l} className="flex items-center gap-2">
            <span className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border text-xs",
              i === idx && step !== "done" ? "border-primary bg-primary text-primary-foreground" : done ? "border-primary text-primary" : "border-border text-muted-foreground",
            )}>{done ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
            <span className={cn(i === idx ? "font-medium text-foreground" : "text-muted-foreground")}>{l}</span>
            {i < labels.length - 1 && <span className="text-muted-foreground">·</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function FileImportWizard({ file, presetJobId, onClose }: { file: File; presetJobId: string | null; onClose: () => void }) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sourcesQ = useAtsSources();
  const jobsQ = useAtsJobs();
  const sources = useMemo(() => (sourcesQ.data ?? []).filter((s) => s.is_active), [sourcesQ.data]);
  const jobs = useMemo(() => (jobsQ.data ?? []).filter((j) => j.status === "open" || j.status === "paused" || (j.status === "draft" && j.id === presetJobId)), [jobsQ.data, presetJobId]);

  const [step, setStep] = useState<Step>("file");
  const badExt = !/\.(xlsx|xls|csv)$/i.test(file.name);
  const tooBig = file.size > MAX_FILE_BYTES;

  // ---- book
  const [book, setBook] = useState<Book | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState(false);
  useEffect(() => {
    if (badExt || tooBig) return;
    let live = true;
    setReading(true); setReadError(false); setBook(null);
    readSheets(file).then((b) => {
      if (!live) return;
      setBook(b);
      const first = b.names.find((n) => { const s = b.read(n); return prepareSheet(s.rows, s.firstRow).body.length > 0; }) ?? b.names[0] ?? "";
      setSheetName(first);
    }).catch(() => { if (live) setReadError(true); }).finally(() => { if (live) setReading(false); });
    return () => { live = false; };
  }, [file, badExt, tooBig]);

  const raw = useMemo(() => (book && sheetName ? book.read(sheetName) : null), [book, sheetName]);
  const sheet: SheetData | null = useMemo(() => (raw ? prepareSheet(raw.rows, raw.firstRow) : null), [raw]);
  const moreRows = raw?.moreRows ?? false;

  // ---- source
  const [sourceId, setSourceId] = useState("");
  useEffect(() => {
    if (sourceId || !sources.length) return;
    const code = guessSourceCode(file.name);
    const byCode = code ? sources.find((s) => s.code === code) : undefined;
    let last: string | null = null;
    try { last = localStorage.getItem(LAST_SOURCE); } catch { /* ignore */ }
    const byLast = last ? sources.find((s) => s.id === last) : undefined;
    const pick = byCode ?? byLast;
    if (pick) setSourceId(pick.id);
  }, [sources, file.name, sourceId]);

  // ---- columns
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [salaryUnit, setSalaryUnit] = useState<SalaryUnit>("month");
  const [remembered, setRemembered] = useState(false);
  const matchedFor = useRef<{ sheet: SheetData | null; source: string } | null>(null);
  const [matching, setMatching] = useState(false);

  const guessUnitFor = (m: ImportField[], s: SheetData) => {
    const vals: unknown[] = [];
    m.forEach((f, j) => { if (SALARY_FIELDS.includes(f)) for (const r of s.body) vals.push(r[j]); });
    return guessSalaryUnit(vals);
  };

  const blocking = !sheet ? null
    : moreRows || sheet.body.length > MAX_ROWS ? "This file has more than 2,000 rows. Import up to 2,000 rows at a time: split the file in Excel and import each part."
      : sheet.body.length === 0 ? "No applicants found under the column headings." : null;

  const goColumns = async () => {
    if (!sheet || !sourceId) return;
    try { localStorage.setItem(LAST_SOURCE, sourceId); } catch { /* ignore */ }
    if (!matchedFor.current || matchedFor.current.sheet !== sheet || matchedFor.current.source !== sourceId) {
      setMatching(true);
      try {
        const m = await lastMapping(sourceId, sheet.headers);
        if (m) {
          setMapping(m.fields); setSalaryUnit(m.salary_unit ?? guessUnitFor(m.fields, sheet)); setRemembered(true);
        } else {
          const im = initialMapping(sheet.headers, sheet.body);
          setMapping(im); setSalaryUnit(guessUnitFor(im, sheet)); setRemembered(false);
        }
        matchedFor.current = { sheet, source: sourceId };
      } finally {
        setMatching(false);
      }
    }
    setStep("columns");
  };

  const setField = (j: number, f: ImportField) => {
    setMapping((prev) => {
      const next = [...prev];
      const hadSalary = prev.some((x) => SALARY_FIELDS.includes(x));
      next[j] = f;
      if (!hadSalary && SALARY_FIELDS.includes(f) && sheet) setSalaryUnit(guessUnitFor(next, sheet));
      return next;
    });
  };

  const mapCheck = useMemo(() => checkMapping(mapping), [mapping]);
  const hasSalary = mapping.some((f) => SALARY_FIELDS.includes(f));
  const hasPosition = mapping.includes("position_text");

  // ---- rows / job
  const rows = useMemo(
    () => (sheet && mapping.length ? buildRows(sheet.headers, sheet.body, mapping, { salaryUnit, rowNumbers: sheet.rowNumbers }) : []),
    [sheet, mapping, salaryUnit],
  );
  const [jobChoice, setJobChoice] = useState("");
  const jobMode: JobMode = jobChoice === "match" ? "match" : jobChoice === "general" ? "general" : "one";
  const jobId = jobMode === "one" && jobChoice ? jobChoice : null;
  const jobDefaulted = useRef(false);
  useEffect(() => {
    if (step !== "check" || jobDefaulted.current || jobsQ.isLoading) return;
    jobDefaulted.current = true;
    if (presetJobId && jobs.some((j) => j.id === presetJobId)) setJobChoice(presetJobId);
    else if (hasPosition) setJobChoice("match");
  }, [step, jobs, jobsQ.isLoading, presetJobId, hasPosition]);
  useEffect(() => { if (jobChoice === "match" && !hasPosition) setJobChoice(""); }, [hasPosition, jobChoice]);

  // ---- check
  const [check, setCheck] = useState<Map<number, CheckResult> | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<unknown>(null);
  const reqNo = useRef(0);
  const runCheck = useCallback(async () => {
    if (!jobChoice) return;
    const n = ++reqNo.current;
    setChecking(true); setCheckError(null); setCheck(null);
    try {
      const res = await checkRows(rows, jobMode, jobId);
      if (n === reqNo.current) setCheck(res);
    } catch (e) {
      if (n === reqNo.current) setCheckError(e);
    } finally {
      if (n === reqNo.current) setChecking(false);
    }
  }, [rows, jobMode, jobId, jobChoice]);
  useEffect(() => { if (step === "check" && jobChoice) void runCheck(); }, [step, jobChoice, runCheck]);

  const same = useMemo(() => sameAsEarlier(rows), [rows]);
  const statuses = useMemo(
    () => rows.map((r) => rowStatus(r, check?.get(r.row_no), same.get(r.row_no))),
    [rows, check, same],
  );
  const counts = useMemo(() => countStatuses(statuses), [statuses]);
  const importable = rows.length - counts.skip - counts.conflict;
  const [filter, setFilter] = useState<RowStatusKey | "all">("all");
  const [page, setPage] = useState(0);
  const filtered = useMemo(
    () => rows.map((r, i) => ({ r, s: statuses[i] })).filter((x) => filter === "all" || x.s.key === filter),
    [rows, statuses, filter],
  );
  const jobTitle = useMemo(() => new Map((jobsQ.data ?? []).map((j) => [j.id, j.title])), [jobsQ.data]);

  // ---- run
  const [importId, setImportId] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<Map<number, RowResult>>(new Map());
  const [phase, setPhase] = useState<"idle" | "running" | "stopping" | "failed">("idle");
  const [runError, setRunError] = useState<unknown>(null);
  const [beginError, setBeginError] = useState<unknown>(null);
  const [stopped, setStopped] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const control = useRef({ cancelled: false });

  const finishTo = async (id: string, wasStopped: boolean) => {
    try {
      const s = await finishImport(id);
      setSummary(s);
    } catch (e) {
      setRunError(e);
    }
    setStopped(wasStopped);
    setPhase("idle");
    setStep("done");
  };

  const run = async (startAt: number) => {
    if (!sheet) return;
    setPhase("running"); setRunError(null); setBeginError(null);
    control.current.cancelled = false;
    let id = importId;
    if (!id) {
      try {
        id = await beginImport({
          kind: "file", source_id: sourceId, job_mode: jobMode, job_id: jobId, file_name: file.name.slice(0, 255),
          mapping: { headers: sheet.headers, fields: mapping, salary_unit: salaryUnit }, total_rows: rows.length,
        });
        setImportId(id);
      } catch (e) {
        setBeginError(e); setPhase("idle");
        return;
      }
    }
    try {
      const r = await sendRows(id, rows.map(rowPayload), {
        startAt, control: control.current,
        onChunk: (n, res) => {
          setDone(n);
          setResults((prev) => { const m = new Map(prev); for (const x of res) m.set(x.row_no, x); return m; });
        },
      });
      await finishTo(id, r.cancelled);
    } catch (e) {
      const d = (e as { done?: unknown })?.done;
      if (typeof d === "number") setDone(d);
      setRunError(e);
      setPhase("failed");
    }
  };

  useEffect(() => {
    if (phase !== "running" && phase !== "stopping") return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [phase]);

  useEffect(() => {
    if (step !== "done") return;
    for (const k of [candKeys.all, atsKeys.overview, atsKeys.jobSummary, importKeys.all]) qc.invalidateQueries({ queryKey: k });
  }, [step, qc]);

  const live = useMemo(() => {
    const c = { created: 0, added: 0, existing: 0, skipped: 0, error: 0 };
    for (const r of results.values()) c[r.outcome] = (c[r.outcome] ?? 0) + 1;
    return c;
  }, [results]);

  const baseName = file.name.replace(/\.[^.]+$/, "");
  const sourceName = sources.find((s) => s.id === sourceId)?.name ?? "";

  // ---------------------------------------------------------------- render
  const showCancel = step === "file" || step === "columns" || step === "check";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Stepper step={step} />
        {showCancel && <Button variant="ghost" onClick={onClose}>Cancel</Button>}
      </div>

      {step === "file" && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          {badExt || tooBig ? (
            <>
              <Alert variant="destructive"><AlertDescription>
                {badExt ? "Choose an Excel (.xlsx, .xls) or CSV file." : "This file is larger than 10 MB. Split it into smaller files and import each one."}
              </AlertDescription></Alert>
              <Button variant="outline" onClick={onClose}>Choose another file</Button>
            </>
          ) : reading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Reading the file…</div>
          ) : readError ? (
            <>
              <Alert variant="destructive"><AlertDescription>This file couldn't be read. If it's password-protected, open it in Excel, save a copy without a password and try again.</AlertDescription></Alert>
              <Button variant="outline" onClick={onClose}>Choose another file</Button>
            </>
          ) : book && !book.names.length ? (
            <>
              <Alert variant="destructive"><AlertDescription>This file is empty.</AlertDescription></Alert>
              <Button variant="outline" onClick={onClose}>Choose another file</Button>
            </>
          ) : book && sheet ? (
            <>
              {book.names.length > 1 && (
                <div className="space-y-1.5">
                  <Label>Sheet</Label>
                  <Select value={sheetName} onValueChange={setSheetName}>
                    <SelectTrigger className="w-full max-w-sm text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent>{book.names.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <p className="text-sm text-foreground">
                {file.name} · {fmtN(sheet.body.length)} applicants · headings on row {sheet.headerRowNo}
                {book.names.length > 1 ? ` · sheet ${sheetName}` : ""}
              </p>
              {blocking && <Alert variant="destructive"><AlertDescription>{blocking}</AlertDescription></Alert>}
              <div className="space-y-1.5">
                <Label>Where are these applicants from?</Label>
                <Select value={sourceId} onValueChange={setSourceId}>
                  <SelectTrigger className="w-full max-w-sm text-foreground"><SelectValue placeholder="Choose a source" /></SelectTrigger>
                  <SelectContent>{sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Used in reports, and to remember how the columns of this portal's files are matched.</p>
              </div>
              <div className="flex justify-end">
                <Button disabled={!sourceId || !!blocking || matching} onClick={() => void goColumns()}>
                  {matching && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Next: columns
                </Button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {step === "columns" && sheet && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-foreground">Check what each column holds. Columns we recognise are already matched.</p>
          {remembered && <Alert><AlertDescription>Matched the same way as your last {sourceName} file.</AlertDescription></Alert>}
          {(() => {
            const cols = sheet.headers.map((h, j) => j).filter((j) => sheet.headers[j] || columnHasData(sheet.body, j));
            const sel = (j: number) => (
              <Select value={mapping[j]} onValueChange={(v) => setField(j, v as ImportField)}>
                <SelectTrigger className={cn("w-full text-foreground sm:w-56", mapCheck.repeated.includes(j) && "border-destructive")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IMPORT_FIELDS.map((f) => {
                    const used = f.value !== "extra" && f.value !== "skip" && mapping.some((x, k) => k !== j && x === f.value);
                    return <SelectItem key={f.value} value={f.value}>{f.label}{used ? " (already used)" : ""}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            );
            const head = (j: number) => sheet.headers[j] || `(no heading) Column ${j + 1}`;
            return isMobile ? (
              <div className="space-y-3">
                {cols.map((j) => {
                  const ex = columnSamples(sheet.body, j).join(" · ");
                  return (
                    <div key={j} className="space-y-2 rounded-lg border border-border p-3">
                      <div className="text-sm font-medium text-foreground break-words">{head(j)}</div>
                      <div className="truncate text-xs text-muted-foreground" title={ex}>{ex}</div>
                      {sel(j)}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b border-border"><th className="px-2 py-2">Column in the file</th><th className="px-2 py-2">Examples</th><th className="px-2 py-2">Import as</th></tr>
                  </thead>
                  <tbody>
                    {cols.map((j) => {
                      const ex = columnSamples(sheet.body, j).join(" · ");
                      return (
                        <tr key={j} className="border-b border-border last:border-0">
                          <td className="px-2 py-2 text-foreground">{head(j)}</td>
                          <td className="max-w-[320px] truncate px-2 py-2 text-muted-foreground" title={ex}>{ex}</td>
                          <td className="px-2 py-2">{sel(j)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
          {hasSalary && (
            <div className="space-y-1.5">
              <Label>Salary in this file is</Label>
              <Select value={salaryUnit} onValueChange={(v) => setSalaryUnit(v as SalaryUnit)}>
                <SelectTrigger className="w-full max-w-xs text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>{SALARY_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Values with words like LPA, lakh or 25k are read correctly whatever you choose.</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Keep as extra detail: saved with the application and shown on the candidate page under “From the import file”. Don't import: left out.</p>
          {(!mapCheck.hasName || !mapCheck.hasContact || mapCheck.repeated.length > 0) && (
            <Alert variant="destructive"><AlertDescription className="space-y-1">
              {!mapCheck.hasName && <div>Choose the column with the candidate's name (Full name, or First name and Last name).</div>}
              {!mapCheck.hasContact && <div>Choose the column with the email or the phone number. Each row needs at least one.</div>}
              {[...new Set(mapCheck.repeated.map((j) => mapping[j]))].map((f) => (
                <div key={f}>{fieldLabel(f)} is chosen for more than one column. Keep it on one column and set the others to Keep as extra detail.</div>
              ))}
            </AlertDescription></Alert>
          )}
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => setStep("file")}>Back</Button>
            <Button
              disabled={!mapCheck.hasName || !mapCheck.hasContact || mapCheck.repeated.length > 0}
              onClick={() => { setPage(0); setFilter("all"); setStep("check"); }}
            >Next: check</Button>
          </div>
        </div>
      )}

      {step === "check" && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="space-y-1.5">
            <Label>Which job are these applicants for?</Label>
            <Select value={jobChoice} onValueChange={(v) => { setJobChoice(v); setFilter("all"); setPage(0); }}>
              <SelectTrigger className="w-full max-w-md text-foreground"><SelectValue placeholder="Choose a job" /></SelectTrigger>
              <SelectContent>
                {hasPosition && <SelectItem value="match">Match each row by the “Job applied for” column</SelectItem>}
                {jobs.map((j) => <SelectItem key={j.id} value={j.id}>{j.title}{j.status === "paused" ? " · Paused" : j.status === "draft" ? " · Draft" : ""}</SelectItem>)}
                <SelectItem value="general">No specific job (general applications)</SelectItem>
              </SelectContent>
            </Select>
            {jobChoice === "match" && <p className="text-xs text-muted-foreground">Each row goes to the open job with the same title or one of its alternative titles. Rows that don't match become general applications.</p>}
            {!jobChoice && <p className="text-xs text-muted-foreground">Choose a job to see who is new.</p>}
          </div>

          {checking && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking who is already in the ATS…</div>}
          {!!checkError && !checking && (
            <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">
              {atsErrorMessage(checkError)}
              <Button size="sm" variant="outline" onClick={() => void runCheck()}>Try again</Button>
            </AlertDescription></Alert>
          )}

          {check && !checking && (
            <>
              <div className="flex flex-wrap gap-2">
                {ROW_STATUS_FILTERS.map((f) => {
                  const n = f.value === "all" ? rows.length : counts[f.value];
                  if (f.value !== "all" && n === 0) return null;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => { setFilter(f.value); setPage(0); }}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        filter === f.value ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >{f.label} · {fmtN(n)}</button>
                  );
                })}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-2 py-2">Row</th><th className="px-2 py-2">Name</th><th className="px-2 py-2">Email</th><th className="px-2 py-2">Phone</th>
                      {jobMode === "match" && <th className="px-2 py-2">Job</th>}
                      <th className="px-2 py-2">What happens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(page * PAGE, page * PAGE + PAGE).map(({ r, s }) => {
                      const c = check.get(r.row_no);
                      return (
                        <tr key={r.row_no} className="border-b border-border last:border-0 align-top">
                          <td className="px-2 py-2 text-muted-foreground">{r.row_no}</td>
                          <td className="px-2 py-2">{r.name || <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-2 py-2 break-all">{r.email ?? "—"}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{r.phone ?? "—"}</td>
                          {jobMode === "match" && <td className="px-2 py-2">{c?.job_id ? jobTitle.get(c.job_id) ?? "—" : "General"}</td>}
                          <td className="px-2 py-2">
                            <span className={cn("inline-flex items-center gap-1.5", TONE[s.tone])}>
                              <span className="h-2 w-2 shrink-0 rounded-full bg-current" />{s.label}
                            </span>
                            {c?.candidate_id && (
                              <Link to={`/hrms/ats/candidates/${c.candidate_id}`} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-primary hover:underline">
                                Open {c.ref_no}
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Rows {filtered.length ? fmtN(page * PAGE + 1) : 0}–{fmtN(Math.min(filtered.length, (page + 1) * PAGE))} of {fmtN(filtered.length)}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}

          <p className="text-xs text-muted-foreground">Nobody is emailed. New applications start in the first stage and are marked as not reviewed. For candidates already in the ATS, only their empty fields are filled from the file.</p>
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => setStep("columns")}>Back</Button>
            <Button
              disabled={checking || !!checkError || !check || !jobChoice || importable === 0}
              onClick={() => { setStep("run"); void run(0); }}
            >Import {fmtN(Math.max(0, importable))} {Math.max(0, importable) === 1 ? "row" : "rows"}</Button>
          </div>
          {rows.length - Math.max(0, importable) > 0 && (
            <p className="text-right text-xs text-muted-foreground">{fmtN(rows.length - Math.max(0, importable))} {rows.length - Math.max(0, importable) === 1 ? "row" : "rows"} won't be imported. They'll be in the file you can download at the end.</p>
          )}
        </div>
      )}

      {step === "run" && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          {beginError ? (
            <>
              <Alert variant="destructive"><AlertDescription>{atsErrorMessage(beginError)}</AlertDescription></Alert>
              <Button variant="outline" onClick={() => { setBeginError(null); setStep("check"); }}>Back</Button>
            </>
          ) : (
            <>
              <Progress value={rows.length ? (done / rows.length) * 100 : 0} />
              <p className="text-sm text-foreground">Processed {fmtN(done)} of {fmtN(rows.length)} rows</p>
              <p className="text-xs text-muted-foreground">
                {live.created} new · {live.added} added to existing · {live.existing} already applied · {live.skipped} skipped · {live.error} not imported
              </p>
              {phase === "failed" ? (
                <>
                  <Alert variant="destructive"><AlertDescription>
                    The import stopped after {fmtN(done)} of {fmtN(rows.length)} rows: {atsErrorMessage(runError)}
                  </AlertDescription></Alert>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void run(done)}>Try again</Button>
                    <Button variant="outline" onClick={() => importId && void finishTo(importId, true)}>Finish without the rest</Button>
                  </div>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    disabled={phase === "stopping"}
                    onClick={() => { control.current.cancelled = true; setPhase("stopping"); }}
                  >{phase === "stopping" ? "Stopping after this batch…" : "Stop"}</Button>
                  <p className="text-xs text-muted-foreground">Keep this page open until the import finishes.</p>
                </>
              )}
            </>
          )}
        </div>
      )}

      {step === "done" && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <h3 className="text-base font-semibold text-foreground">{stopped ? "Import stopped" : "Import finished"}</h3>
          {!summary && !!runError && <Alert variant="destructive"><AlertDescription>{atsErrorMessage(runError)}</AlertDescription></Alert>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {([
              ["New candidates", summary?.created], ["Added to existing candidates", summary?.added], ["Already applied", summary?.existing],
              ["Skipped", summary?.skipped], ["Not imported", summary?.errors],
            ] as [string, number | undefined][]).map(([l, n]) => (
              <div key={l} className="rounded-lg border border-border p-3">
                <div className="text-xl font-semibold text-foreground">{fmtN(n ?? 0)}</div>
                <div className="text-xs text-muted-foreground">{l}</div>
              </div>
            ))}
          </div>
          {stopped && <p className="text-sm text-muted-foreground">{rows.length - done === 1 ? "1 row wasn't sent. It is in the file below." : `${fmtN(rows.length - done)} rows weren't sent. They are in the file below.`}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => {
              let url = `/hrms/ats/candidates?source=${sourceId}`;
              if (jobMode === "one" && jobId) url += `&job=${jobId}`;
              else if (jobMode === "general") url += "&job=general";
              navigate(url);
            }}>View candidates</Button>
            {(((summary?.skipped ?? 0) + (summary?.errors ?? 0)) > 0 || stopped) && sheet && (
              <Button variant="outline" onClick={() => downloadBlob(toCsv(notImportedRows(sheet, results, reasonLabel)), `${baseName}-not-imported.csv`)}>
                Download rows not imported (CSV)
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>Import another file</Button>
          </div>
        </div>
      )}
    </div>
  );
}
