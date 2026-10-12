import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { atsKeys, useAtsJobs, useAtsSources } from "@/lib/ats/api";
import { candKeys } from "@/lib/ats/candidates";
import { atsErrorMessage } from "@/lib/ats/errors";
import { fmtBytes } from "@/lib/ats/files";
import {
  ROW_STATUS_FILTERS, countStatuses, rowStatus, sameAsEarlier, type CheckResult, type RowStatusKey,
} from "@/lib/ats/importParse";
import {
  MAX_FILE_BYTES, beginImport, checkRows, finishImport, importKeys, type ImportSummary, type JobMode, type RowResult,
} from "@/lib/ats/imports";
import {
  MAX_RESUMES, attachResume, importResumes, newDrafts, readDrafts, resumeRows, sortResumeFiles,
  type AttachState, type ResumeDraft,
} from "@/lib/ats/resumeImport";

type Step = "resumes" | "check" | "run" | "done";
type Rejected = { name: string; reason: string };
const LAST_SOURCE = "ats.import.lastResumeSource";
const TONE: Record<string, string> = {
  green: "text-success",
  blue: "text-primary",
  muted: "text-muted-foreground",
  amber: "text-warning",
  red: "text-destructive",
};

function Stepper({ step }: { step: Step }) {
  const idx = { resumes: 0, check: 1, run: 2, done: 2 }[step];
  const labels = ["Resumes", "Check", "Import"];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {labels.map((l, i) => {
        const done = i < idx || step === "done";
        return (
          <li key={l} className="flex items-center gap-2">
            <span className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
              i === idx && step !== "done" ? "bg-primary text-primary-foreground" : done ? "bg-primary/15 text-foreground" : "bg-muted text-muted-foreground",
            )}>{done ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
            <span className={cn(i === idx ? "font-medium text-foreground" : "text-muted-foreground")}>{l}</span>
            {i < labels.length - 1 && <span aria-hidden className="h-px w-5 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

function viewFile(file: File) {
  const url = URL.createObjectURL(file);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function ResumeImportWizard({ files, presetJobId, onClose }: { files: File[]; presetJobId: string | null; onClose: () => void }) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sourcesQ = useAtsSources();
  const jobsQ = useAtsJobs();
  const sources = useMemo(() => (sourcesQ.data ?? []).filter((s) => s.is_active), [sourcesQ.data]);
  const jobs = useMemo(() => (jobsQ.data ?? []).filter((j) => j.status === "open" || j.status === "paused" || (j.status === "draft" && j.id === presetJobId)), [jobsQ.data, presetJobId]);

  const [step, setStep] = useState<Step>("resumes");
  const initial = useMemo(() => sortResumeFiles(files, [], MAX_RESUMES, MAX_FILE_BYTES), [files]);
  const [drafts, setDrafts] = useState<ResumeDraft[]>(() => newDrafts(initial.ok));
  const [rejected, setRejected] = useState<Rejected[]>(initial.rejected);
  const readControl = useRef({ cancelled: false });
  const [reading, setReading] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);
  const emptyRef = useRef<HTMLInputElement>(null);

  const passRef = useRef(false);
  // Reset on mount and cancel on unmount (React StrictMode mounts twice in development).
  useEffect(() => {
    readControl.current.cancelled = false;
    return () => { readControl.current.cancelled = true; };
  }, []);
  useEffect(() => {
    if (passRef.current || !drafts.some((d) => d.state === "reading")) return;
    passRef.current = true;
    setReading(true);
    readDrafts(drafts, readControl.current, (key, p) =>
      setDrafts((prev) => prev.map((d) => (d.key === key && d.state === "reading" ? { ...d, ...p } : d))),
    ).finally(() => { passRef.current = false; setReading(false); });
  }, [drafts, reading]);

  const addFiles = (list: File[]) => {
    const r = sortResumeFiles(list, drafts.map((d) => d.file), MAX_RESUMES - drafts.length, MAX_FILE_BYTES);
    if (r.ok.length) setDrafts((prev) => [...prev, ...newDrafts(r.ok)]);
    if (r.rejected.length) setRejected((prev) => [...prev, ...r.rejected]);
  };
  const patch = (key: string, p: Partial<ResumeDraft>) => setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...p } : d)));

  // ---- source / job
  const [sourceId, setSourceId] = useState("");
  const srcDefaulted = useRef(false);
  useEffect(() => {
    if (srcDefaulted.current || !sources.length) return;
    srcDefaulted.current = true;
    let last: string | null = null;
    try { last = localStorage.getItem(LAST_SOURCE); } catch { /* ignore */ }
    if (last && sources.some((s) => s.id === last)) setSourceId(last);
  }, [sources]);
  const [jobChoice, setJobChoice] = useState("");
  const jobDefaulted = useRef(false);
  useEffect(() => {
    if (jobDefaulted.current || jobsQ.isLoading) return;
    jobDefaulted.current = true;
    if (presetJobId && jobs.some((j) => j.id === presetJobId)) setJobChoice(presetJobId);
  }, [jobs, jobsQ.isLoading, presetJobId]);
  const jobMode: JobMode = jobChoice === "general" ? "general" : "one";
  const jobId = jobMode === "one" && jobChoice ? jobChoice : null;

  const rows = useMemo(() => resumeRows(drafts), [drafts]);
  const problemCount = rows.filter((r) => r.problems.length > 0).length;
  const readCount = drafts.filter((d) => d.state !== "reading").length;

  // ---- check
  const [check, setCheck] = useState<Map<number, CheckResult> | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<unknown>(null);
  const reqNo = useRef(0);
  const runCheck = useCallback(async () => {
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
  }, [rows, jobMode, jobId]);
  useEffect(() => { if (step === "check") void runCheck(); }, [step, runCheck]);

  const same = useMemo(() => sameAsEarlier(rows), [rows]);
  const statuses = useMemo(() => rows.map((r) => rowStatus(r, check?.get(r.row_no), same.get(r.row_no))), [rows, check, same]);
  const counts = useMemo(() => countStatuses(statuses), [statuses]);
  const importable = rows.length - counts.skip - counts.conflict;
  const [filter, setFilter] = useState<RowStatusKey | "all">("all");

  // ---- run
  const [importId, setImportId] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<Map<number, RowResult>>(new Map());
  const [attach, setAttach] = useState<Map<number, AttachState>>(new Map());
  const [phase, setPhase] = useState<"idle" | "running" | "stopping" | "failed" | "attachFailed">("idle");
  const [runError, setRunError] = useState<unknown>(null);
  const [beginError, setBeginError] = useState<unknown>(null);
  const [stopped, setStopped] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [retrying, setRetrying] = useState(false);
  const control = useRef({ cancelled: false });
  const wasCancelled = useRef(false);

  const finish = async (id: string, isStopped: boolean) => {
    try { setSummary(await finishImport(id)); } catch (e) { setRunError(e); }
    setStopped(isStopped);
    setPhase("idle");
    setStep("done");
  };

  const run = async (startAt: number) => {
    setPhase("running"); setRunError(null); setBeginError(null);
    control.current.cancelled = false;
    let id = importId;
    if (!id) {
      try {
        id = await beginImport({ kind: "resumes", source_id: sourceId, job_mode: jobMode, job_id: jobId, file_name: null, mapping: {}, total_rows: rows.length });
        setImportId(id);
      } catch (e) {
        setBeginError(e); setPhase("idle");
        return;
      }
    }
    const localAttach = new Map(attach);
    try {
      const r = await importResumes(id, drafts, rows, {
        startAt, control: control.current,
        onRow: (i, result, a) => {
          setDone(i + 1);
          const no = rows[i].row_no;
          localAttach.set(no, a);
          setResults((prev) => new Map(prev).set(no, result));
          setAttach((prev) => new Map(prev).set(no, a));
        },
      });
      wasCancelled.current = r.cancelled;
      if ([...localAttach.values()].includes("failed")) { setPhase("attachFailed"); return; }
      await finish(id, r.cancelled);
    } catch (e) {
      const d = (e as { done?: unknown })?.done;
      if (typeof d === "number") setDone(d);
      setRunError(e);
      setPhase("failed");
    }
  };

  const retryAttach = async () => {
    if (!importId) return;
    setRetrying(true);
    const next = new Map(attach);
    for (let i = 0; i < rows.length; i++) {
      const no = rows[i].row_no;
      if (next.get(no) !== "failed") continue;
      next.set(no, await attachResume(drafts[i].file, results.get(no)!));
      setAttach(new Map(next));
    }
    setRetrying(false);
    if (![...next.values()].includes("failed")) await finish(importId, wasCancelled.current);
  };

  const finishWithoutRest = () => { if (importId) void finish(importId, true); };

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
  const attachedN = [...attach.values()].filter((a) => a === "attached").length;
  const dupN = [...attach.values()].filter((a) => a === "duplicate").length;
  const failedIdx = rows.map((r, i) => (attach.get(r.row_no) === "failed" ? i : -1)).filter((i) => i >= 0);

  const showCancel = step === "resumes" || step === "check";
  const hidden = (ref: React.RefObject<HTMLInputElement>) => (
    <input ref={ref} type="file" multiple accept=".pdf,.doc,.docx" className="hidden"
      onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ""; if (l.length) addFiles(l); }} />
  );

  const fields = (d: ResumeDraft, i: number) => {
    const pr = rows[i]?.problems ?? [];
    const dis = d.state === "reading";
    const badEmail = !!d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim());
    const noContact = pr.includes("no_contact");
    const inp = (k: "name" | "email" | "phone", ph: string, bad: boolean) => (
      <div className="relative">
        <Input value={d[k]} disabled={dis} placeholder={ph} aria-label={ph}
          onChange={(e) => patch(d.key, { [k]: e.target.value })}
          className={cn("text-foreground", bad && "border-destructive")} />
        {dis && <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
    );
    return {
      name: <>{inp("name", "Name", pr.includes("no_name"))}{pr.includes("no_name") && <p className="mt-1 text-xs text-destructive">Add the name</p>}</>,
      email: <>{inp("email", "Email", noContact || badEmail)}{badEmail && <p className="mt-1 text-xs text-destructive">Check the email</p>}</>,
      phone: <>{inp("phone", "Phone", noContact)}{noContact && !badEmail && <p className="mt-1 text-xs text-destructive">Add an email or phone</p>}</>,
    };
  };
  const resumeCell = (d: ResumeDraft) => (
    <div className="min-w-0">
      <div className="truncate text-foreground" title={d.file.name}>{d.file.name}</div>
      <div className="text-xs text-muted-foreground">
        {fmtBytes(d.file.size)} · <button type="button" className="text-primary hover:underline" onClick={() => viewFile(d.file)}>View</button>
      </div>
      {d.state === "unreadable" && <p className="mt-1 text-xs text-muted-foreground">Couldn't read this resume (scanned or old Word file). Type the details.</p>}
    </div>
  );
  const removeBtn = (d: ResumeDraft) => (
    <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setDrafts((prev) => prev.filter((x) => x.key !== d.key))}>
      <Trash2 className="h-4 w-4" />
    </Button>
  );

  const viewUrl = () => {
    let url = `/hrms/ats/candidates?source=${sourceId}`;
    if (jobMode === "one" && jobId) url += `&job=${jobId}`;
    else if (jobMode === "general") url += "&job=general";
    navigate(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Stepper step={step} />
        {showCancel && <Button variant="ghost" onClick={onClose}>Cancel</Button>}
      </div>

      {step === "resumes" && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-foreground">
              {drafts.length} {drafts.length === 1 ? "resume" : "resumes"}
              {reading && <span className="ml-2 text-muted-foreground">Reading resumes… {readCount} of {drafts.length}</span>}
            </div>
            {drafts.length > 0 && drafts.length < MAX_RESUMES && (
              <Button size="sm" variant="outline" onClick={() => addRef.current?.click()}>Add more resumes</Button>
            )}
            {hidden(addRef)}
          </div>
          {rejected.length > 0 && (
            <Alert><AlertDescription>
              <div className="flex items-start justify-between gap-2">
                <div className="text-muted-foreground">
                  <div>Not added:</div>
                  {rejected.map((r, i) => <div key={i}>{r.name}: {r.reason}</div>)}
                </div>
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setRejected([])}>Dismiss</button>
              </div>
            </AlertDescription></Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Where are these resumes from?</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger className="text-foreground"><SelectValue placeholder="Choose a source" /></SelectTrigger>
                <SelectContent>{sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Which job are these applicants for?</Label>
              <Select value={jobChoice} onValueChange={(v) => { setJobChoice(v); setFilter("all"); }}>
                <SelectTrigger className="text-foreground"><SelectValue placeholder="Choose a job" /></SelectTrigger>
                <SelectContent>
                  {jobs.map((j) => <SelectItem key={j.id} value={j.id}>{j.title}{j.status === "paused" ? " · Paused" : j.status === "draft" ? " · Draft" : ""}</SelectItem>)}
                  <SelectItem value="general">No specific job (general applications)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {drafts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-sm text-muted-foreground">
              No resumes left.
              <Button variant="outline" onClick={() => emptyRef.current?.click()}>Choose resumes</Button>
              {hidden(emptyRef)}
            </div>
          ) : (
            <>
              {problemCount > 0 && (
                <p className="text-sm text-warning">{problemCount === 1 ? "1 resume is" : `${problemCount} resumes are`} missing a name or contact details and will be skipped unless you add them.</p>
              )}
              {isMobile ? (
                <div className="space-y-3">
                  {drafts.map((d, i) => {
                    const f = fields(d, i);
                    return (
                      <div key={d.key} className="space-y-2 rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between gap-2">{resumeCell(d)}{removeBtn(d)}</div>
                        {f.name}{f.email}{f.phone}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="w-[26%] px-2 py-2">Resume</th><th className="px-2 py-2">Name</th><th className="px-2 py-2">Email</th><th className="px-2 py-2">Phone</th><th className="w-12" />
                      </tr>
                    </thead>
                    <tbody>
                      {drafts.map((d, i) => {
                        const f = fields(d, i);
                        return (
                          <tr key={d.key} className="border-b border-border last:border-0 align-top">
                            <td className="px-2 py-2">{resumeCell(d)}</td>
                            <td className="px-2 py-2">{f.name}</td>
                            <td className="px-2 py-2">{f.email}</td>
                            <td className="px-2 py-2">{f.phone}</td>
                            <td className="px-1 py-2">{removeBtn(d)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          <div className="flex justify-end">
            <Button
              disabled={reading || !drafts.length || !sourceId || !jobChoice || problemCount === rows.length}
              onClick={() => { try { localStorage.setItem(LAST_SOURCE, sourceId); } catch { /* ignore */ } setFilter("all"); setStep("check"); }}
            >Next: check</Button>
          </div>
        </div>
      )}

      {step === "check" && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
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
                    <button key={f.value} type="button" onClick={() => setFilter(f.value)}
                      className={cn("rounded-full border px-3 py-1 text-xs transition-colors",
                        filter === f.value ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground")}
                    >{f.label} · {n}</button>
                  );
                })}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-2 py-2">Resume</th><th className="px-2 py-2">Name</th><th className="px-2 py-2">Email</th><th className="px-2 py-2">Phone</th><th className="px-2 py-2">What happens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const s = statuses[i];
                      if (filter !== "all" && s.key !== filter) return null;
                      const c = check.get(r.row_no);
                      return (
                        <tr key={r.row_no} className="border-b border-border last:border-0 align-top">
                          <td className="max-w-[200px] truncate px-2 py-2" title={drafts[i]?.file.name}>{drafts[i]?.file.name}</td>
                          <td className="px-2 py-2">{r.name || <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-2 py-2 break-all">{r.email ?? "—"}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{r.phone ?? "—"}</td>
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
            </>
          )}
          <p className="text-xs text-muted-foreground">Nobody is emailed. Each resume is attached to its candidate. For candidates already in the ATS, only their empty fields are filled in.</p>
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => setStep("resumes")}>Back</Button>
            <Button disabled={checking || !!checkError || !check || importable === 0} onClick={() => { setStep("run"); void run(0); }}>
              Import {Math.max(0, importable)} {Math.max(0, importable) === 1 ? "resume" : "resumes"}
            </Button>
          </div>
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
              <p className="text-sm text-foreground">Processed {done} of {rows.length} resumes</p>
              <p className="text-xs text-muted-foreground">
                {live.created} new · {live.added} added to existing · {live.existing} already applied · {live.skipped} skipped · {live.error} not imported · {attachedN} resumes attached
              </p>
              {phase === "failed" ? (
                <>
                  <Alert variant="destructive"><AlertDescription>
                    The import stopped after {done} of {rows.length} resumes: {atsErrorMessage(runError)}
                  </AlertDescription></Alert>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void run(done)}>Try again</Button>
                    <Button variant="outline" onClick={finishWithoutRest}>Finish without the rest</Button>
                  </div>
                </>
              ) : phase === "attachFailed" ? (
                <>
                  <Alert><AlertDescription>
                    <div className="font-medium text-warning">{failedIdx.length} resumes couldn't be attached.</div>
                    {failedIdx.map((i) => <div key={i} className="text-muted-foreground">{drafts[i].file.name}</div>)}
                  </AlertDescription></Alert>
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={retrying} onClick={() => void retryAttach()}>{retrying && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Try again</Button>
                    <Button variant="outline" disabled={retrying} onClick={() => importId && void finish(importId, wasCancelled.current)}>Finish without them</Button>
                  </div>
                </>
              ) : (
                <>
                  <Button variant="outline" disabled={phase === "stopping"}
                    onClick={() => { control.current.cancelled = true; setPhase("stopping"); }}
                  >{phase === "stopping" ? "Stopping after this resume…" : "Stop"}</Button>
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {([
              ["New candidates", summary?.created], ["Added to existing candidates", summary?.added], ["Already applied", summary?.existing],
              ["Skipped", summary?.skipped], ["Not imported", summary?.errors], ["Resumes attached", attachedN],
              ...(dupN > 0 ? [["Already attached", dupN]] : []),
            ] as [string, number | undefined][]).map(([l, n]) => (
              <div key={l} className="rounded-lg border border-border p-3">
                <div className="text-xl font-semibold text-foreground">{n ?? 0}</div>
                <div className="text-xs text-muted-foreground">{l}</div>
              </div>
            ))}
          </div>
          {stopped && <p className="text-sm text-muted-foreground">{rows.length - done} resumes weren't imported.</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={viewUrl}>View candidates</Button>
            <Button variant="outline" onClick={onClose}>Import more resumes</Button>
          </div>
        </div>
      )}
    </div>
  );
}
