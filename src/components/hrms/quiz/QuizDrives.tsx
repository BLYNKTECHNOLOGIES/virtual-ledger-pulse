import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, BriefcaseBusiness, Clock, ExternalLink, KeyRound, Pencil, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { AttemptPanel } from "./AttemptPanel";
import {
  AddTimeDialog, CopyButton, ReasonDialog, ResumeCodeDialog, clock, fmtIst, fmtTime, isoToIstLocal, istLocalToIso,
  pretty, quizRpc, statusLabel, statusVariant, useInvalidateQuiz,
} from "./quizShared";

export type DriveRow = {
  id: string; name: string; access_code: string; mode: string; starts_at: string; ends_at: string; job_role_ids: string[];
  is_sandbox: boolean; show_score_to_candidate: boolean; status: "draft" | "live" | "closed"; created_at: string;
  tests: { id: string; name: string; code: string }[]; registered: number; testing: number; submitted: number;
};
type Test = { id: string; name: string; is_active: boolean };
type MonitorRow = {
  id: string; public_ref: string; person: string | null; mobile: string | null; test: string | null; status: string;
  warning_count: number; last_seen: string | null; started_at: string | null; created_at: string;
  section: { title: string; status: string; deadline_at: string | null; order_index: number; of: number } | null;
};

const CODE_RE = /^[A-Z0-9]{6}$/;
const testLink = (code: string) => `${window.location.origin}/test?code=${code}`;

function DriveDialog({ drive, tests, open, onOpenChange, onSaved }: {
  drive: DriveRow | null; tests: Test[]; open: boolean; onOpenChange: (o: boolean) => void; onSaved: (id: string) => void;
}) {
  const { toast } = useToast();
  const invalidate = useInvalidateQuiz();
  const blank = { name: "", testIds: [] as string[], startsAt: "", endsAt: "", mode: "on_site", showScores: false, sandbox: false, code: "" };
  const [form, setForm] = useState(blank);
  useEffect(() => {
    if (!open) return;
    if (drive) {
      setForm({ name: drive.name, testIds: drive.job_role_ids ?? [], startsAt: isoToIstLocal(drive.starts_at), endsAt: isoToIstLocal(drive.ends_at),
        mode: drive.mode, showScores: drive.show_score_to_candidate, sandbox: drive.is_sandbox, code: drive.access_code });
    } else {
      setForm(blank);
      quizRpc<string>("cbt_new_access_code").then((code) => setForm((f) => ({ ...f, code: f.code || code }))).catch(() => undefined);
    }
    // Fill only when the dialog opens (or a different drive is opened) — the drives list
    // re-fetches every 15 s and must not overwrite what HR is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, drive?.id]);

  const regenerate = async () => {
    try { const code = await quizRpc<string>("cbt_new_access_code"); setForm((f) => ({ ...f, code })); }
    catch (e) { toast({ title: "No code", description: (e as Error).message, variant: "destructive" }); }
  };

  const save = useMutation({
    mutationFn: () => quizRpc<{ id: string }>("cbt_save_drive", {
      p_drive_id: drive?.id ?? null, p_name: form.name, p_job_role_ids: form.testIds,
      p_starts_at: istLocalToIso(form.startsAt), p_ends_at: istLocalToIso(form.endsAt), p_mode: form.mode,
      p_show_scores: form.showScores, p_is_sandbox: form.sandbox, p_access_code: form.code.trim().toUpperCase() || null,
    }),
    onSuccess: (res) => { toast({ title: drive ? "Drive saved" : "Draft drive created" }); onOpenChange(false); void invalidate(); onSaved(res.id); },
    onError: (e: Error) => toast({ title: "Drive not saved", description: e.message, variant: "destructive" }),
  });

  const activeTests = tests.filter((t) => t.is_active || form.testIds.includes(t.id));
  const valid = form.name.trim() && form.testIds.length && form.startsAt && form.endsAt && CODE_RE.test(form.code.trim().toUpperCase());
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{drive ? "Edit drive" : "New drive"}</DialogTitle>
          <DialogDescription>{drive ? "Changes apply to people who register from now on." : "Saved as a draft. Make it live from the drive page when you are ready."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div><Label htmlFor="dn">Drive name</Label><Input id="dn" className="text-foreground" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Walk-in, 20 Oct" /></div>
          <div>
            <Label>Tests offered</Label>
            <div className="mt-1 grid gap-2 rounded-md border border-border p-3">
              {!activeTests.length && <p className="text-sm text-muted-foreground">No active hiring tests. Create one under Tests first.</p>}
              {activeTests.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.testIds.includes(t.id)} onCheckedChange={(v) => setForm((f) => ({ ...f, testIds: v ? [...f.testIds, t.id] : f.testIds.filter((x) => x !== t.id) }))} />
                  {t.name}{!t.is_active && <Badge variant="muted">Inactive</Badge>}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="ds">Opens (IST)</Label><Input id="ds" type="datetime-local" className="text-foreground" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} /></div>
            <div><Label htmlFor="de">Closes (IST)</Label><Input id="de" type="datetime-local" className="text-foreground" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Where</Label>
              <Select value={form.mode} onValueChange={(mode) => setForm((f) => ({ ...f, mode }))}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="on_site">On-site (office PCs)</SelectItem><SelectItem value="remote">Remote</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dc">Access code</Label>
              <div className="flex gap-2">
                <Input id="dc" maxLength={6} className="font-mono uppercase text-foreground" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
                <Button type="button" variant="outline" size="icon" title="Regenerate code" aria-label="Regenerate code" onClick={regenerate}><RefreshCw className="h-4 w-4" /></Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Generated for you; you can type your own 6 letters/digits.</p>
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm"><span>Show scores to candidates at the end</span><Switch checked={form.showScores} onCheckedChange={(v) => setForm((f) => ({ ...f, showScores: v }))} /></label>
          <label className="flex items-center justify-between gap-3 text-sm"><span>Sandbox (for trying it out — not counted in statistics, phones allowed)</span><Switch checked={form.sandbox} onCheckedChange={(v) => setForm((f) => ({ ...f, sandbox: v }))} /></label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>{drive ? "Save" : "Create draft"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Monitor({ drive, canManage }: { drive: DriveRow; canManage: boolean }) {
  const { toast } = useToast();
  const invalidate = useInvalidateQuiz();
  const [openId, setOpenId] = useState<string | null>(null);
  const [action, setAction] = useState<{ kind: "resume" | "time" | "invalidate"; id: string } | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);

  const { data, dataUpdatedAt } = useQuery({
    queryKey: ["cbt", "monitor", drive.id],
    queryFn: () => quizRpc<{ server_now: string; rows: MonitorRow[] }>("cbt_drive_monitor", { p_drive_id: drive.id }),
    // Closed drives keep refreshing while anyone is still registered or testing.
    refetchInterval: (query) => {
      const active = (query.state.data?.rows ?? []).some((r) => r.status === "registered" || r.status === "in_progress");
      return drive.status === "live" || active || drive.testing > 0 ? 5000 : false;
    },
  });
  // Server clock: offset measured at fetch time, so countdowns don't trust this PC's clock.
  const offset = data ? new Date(data.server_now).getTime() - dataUpdatedAt : 0;
  const now = Date.now() + offset;
  const left = (deadline: string | null) => (deadline ? Math.max(0, (new Date(deadline).getTime() - now) / 1000) : null);

  const invalidateAttempt = useMutation({
    mutationFn: (v: { id: string; reason: string }) => quizRpc("cbt_invalidate_attempt", { p_attempt_id: v.id, p_reason: v.reason }),
    onSuccess: () => { toast({ title: "Attempt invalidated" }); setAction(null); void invalidate(); },
    onError: (e: Error) => toast({ title: "Not invalidated", description: e.message, variant: "destructive" }),
  });

  const rows = data?.rows ?? [];
  const running = (s: string) => s === "registered" || s === "in_progress";
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Live monitor</h3>
        <span className="text-xs text-muted-foreground">{drive.status === "live" ? "Refreshes every 5 seconds" : rows.some((r) => running(r.status)) ? "Drive closed · refreshing while people finish" : "Drive is not live"}</span>
      </div>
      {!rows.length ? <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nobody has registered for this drive yet.</p> : (
        <>
          <div className="hidden lg:block">
            <Table>
              <TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Test</TableHead><TableHead>Status</TableHead><TableHead>Section · time left</TableHead><TableHead numeric>Warnings</TableHead><TableHead>Last seen</TableHead><TableHead>Started</TableHead>{canManage && <TableHead><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><button className="text-left font-medium hover:underline" onClick={() => setOpenId(r.id)}>{r.person ?? "Anonymized"}</button><p className="font-mono text-xs text-muted-foreground">{r.public_ref}</p></TableCell>
                    <TableCell>{r.test}</TableCell>
                    <TableCell><Badge variant={statusVariant(r.status)}>{statusLabel(r.status)}</Badge></TableCell>
                    <TableCell className="text-sm">{r.section ? <>{r.section.order_index}/{r.section.of} {r.section.title}<span className="ml-2 font-mono tabular-nums">{r.section.status === "in_progress" ? clock(left(r.section.deadline_at)) : "between sections"}</span></> : "—"}</TableCell>
                    <TableCell numeric>{r.warning_count > 0 ? <Badge variant="warning">{r.warning_count}</Badge> : 0}</TableCell>
                    <TableCell className="text-xs">{r.last_seen ? `${clock((now - new Date(r.last_seen).getTime()) / 1000)} ago` : "—"}</TableCell>
                    <TableCell className="text-xs">{fmtTime(r.started_at)}</TableCell>
                    {canManage && (
                      <TableCell>
                        {running(r.status) && (
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" title="Resume code" aria-label="Resume code" onClick={() => setAction({ kind: "resume", id: r.id })}><KeyRound className="h-4 w-4" /></Button>
                            {r.status === "in_progress" && <Button size="icon" variant="ghost" title="Add time" aria-label="Add time" onClick={() => setAction({ kind: "time", id: r.id })}><Clock className="h-4 w-4" /></Button>}
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setAction({ kind: "invalidate", id: r.id })}>Invalidate</Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="grid gap-2 lg:hidden">
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <button className="text-left font-medium" onClick={() => setOpenId(r.id)}>{r.person ?? "Anonymized"}</button>
                  <Badge variant={statusVariant(r.status)}>{statusLabel(r.status)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{r.test}{r.section ? ` · ${r.section.title} · ${r.section.status === "in_progress" ? clock(left(r.section.deadline_at)) + " left" : "between sections"}` : ""} · {r.warning_count} warnings</p>
                {canManage && running(r.status) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setAction({ kind: "resume", id: r.id })}>Resume code</Button>
                    {r.status === "in_progress" && <Button size="sm" variant="outline" onClick={() => setAction({ kind: "time", id: r.id })}>Add time</Button>}
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => setAction({ kind: "invalidate", id: r.id })}>Invalidate</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <ResumeCodeDialog attemptId={action?.id ?? null} open={action?.kind === "resume"} onOpenChange={(o) => !o && setAction(null)} />
      <AddTimeDialog attemptId={action?.id ?? null} open={action?.kind === "time"} onOpenChange={(o) => !o && setAction(null)} />
      <ReasonDialog open={action?.kind === "invalidate"} onOpenChange={(o) => !o && setAction(null)} title="Invalidate this attempt"
        description="Ends the test now and sets the decision to Incomplete. This cannot be undone." confirmLabel="Invalidate" destructive
        pending={invalidateAttempt.isPending} onConfirm={(reason) => action && invalidateAttempt.mutate({ id: action.id, reason })} />
      <AttemptPanel attemptId={openId} onClose={() => setOpenId(null)} canManage={canManage} />
    </section>
  );
}

function DrivePage({ drive, tests, canManage, onBack }: { drive: DriveRow; tests: Test[]; canManage: boolean; onBack: () => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidateQuiz();
  const [editing, setEditing] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const setStatus = useMutation({
    mutationFn: (status: "live" | "closed") => quizRpc<{ ok: boolean; problems: string[] }>("cbt_set_drive_status", { p_drive_id: drive.id, p_status: status }),
    onSuccess: (res, status) => {
      setProblems(res.ok ? [] : res.problems);
      if (res.ok) toast({ title: status === "closed" ? "Drive closed" : "Drive is live" });
      void invalidate();
    },
    onError: (e: Error) => toast({ title: "Status not changed", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" />All drives</Button>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{drive.name}</h2>
            <Badge variant={statusVariant(drive.status)}>{pretty(drive.status)}</Badge>
            {drive.is_sandbox && <Badge variant="muted">Sandbox</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{fmtIst(drive.starts_at)} – {fmtIst(drive.ends_at)} · {drive.mode === "on_site" ? "On-site" : "Remote"} · {drive.tests.map((t) => t.name).join(", ") || "No tests"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{drive.registered} registered · {drive.testing} testing now · {drive.submitted} submitted</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-xs uppercase text-muted-foreground">Access code</p>
          <p className="font-mono text-4xl font-semibold tracking-[0.25em] text-foreground">{drive.access_code}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <CopyButton text={drive.access_code} />
            <Button asChild variant="outline" size="sm"><a href={testLink(drive.access_code)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Open on this PC</a></Button>
            <CopyButton text={testLink(drive.access_code)} label="Copy link" />
          </div>
        </div>
      </div>

      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Edit</Button>
          {drive.status !== "live" && <Button loading={setStatus.isPending} onClick={() => setStatus.mutate("live")}>{drive.status === "closed" ? "Reopen" : "Go live"}</Button>}
          {drive.status === "live" && <Button variant="outline" loading={setStatus.isPending} onClick={() => setStatus.mutate("closed")}>Close drive</Button>}
        </div>
      )}
      {drive.status === "live" && <p className="text-xs text-muted-foreground">Closing stops new registrations; people already testing can finish.</p>}
      {problems.length > 0 && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p className="font-medium text-destructive">This drive can't go live yet:</p>
          <ul className="mt-1 list-disc pl-5 text-foreground">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      <Monitor drive={drive} canManage={canManage} />
      <DriveDialog drive={drive} tests={tests} open={editing} onOpenChange={setEditing} onSaved={() => undefined} />
    </div>
  );
}

export function QuizDrives({ tests, canManage, driveId, onOpenDrive }: {
  tests: Test[]; canManage: boolean; driveId: string | null; onOpenDrive: (id: string | null) => void;
}) {
  const [creating, setCreating] = useState(false);
  const { data: drives = [], isLoading, isError } = useQuery({
    queryKey: ["cbt", "drives"],
    queryFn: () => quizRpc<DriveRow[]>("cbt_drives_list"),
    refetchInterval: 15_000,
  });
  const open = drives.find((d) => d.id === driveId);
  if (driveId && open) return <DrivePage drive={open} tests={tests} canManage={canManage} onBack={() => onOpenDrive(null)} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Drives</h2><p className="text-sm text-muted-foreground">A drive is one test session with its own code and time window.</p></div>
        {canManage && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New drive</Button>}
      </div>
      {isError ? <p className="text-sm text-destructive">Drives could not be loaded.</p> : !isLoading && !drives.length ? (
        <div className="rounded-lg border border-border bg-card"><EmptyState icon={BriefcaseBusiness} title="No drives yet" description="Create a drive, pick its tests, then make it live." /></div>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader><TableRow><TableHead>Drive</TableHead><TableHead>Code</TableHead><TableHead>Tests</TableHead><TableHead>Window (IST)</TableHead><TableHead>Status</TableHead><TableHead numeric>Registered</TableHead><TableHead numeric>Testing</TableHead><TableHead numeric>Submitted</TableHead></TableRow></TableHeader>
              <TableBody>
                {drives.map((d) => (
                  <TableRow key={d.id} className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0} onClick={() => onOpenDrive(d.id)} onKeyDown={(e) => { if (e.key === "Enter") onOpenDrive(d.id); }}>
                    <TableCell className="font-medium">{d.name}{d.is_sandbox && <Badge variant="muted" className="ml-2">Sandbox</Badge>}</TableCell>
                    <TableCell className="font-mono">{d.access_code}</TableCell>
                    <TableCell className="text-sm">{d.tests.map((t) => t.name).join(", ") || "—"}</TableCell>
                    <TableCell className="text-xs">{fmtIst(d.starts_at)} –<br />{fmtIst(d.ends_at)}</TableCell>
                    <TableCell><Badge variant={statusVariant(d.status)}>{pretty(d.status)}</Badge></TableCell>
                    <TableCell numeric>{d.registered}</TableCell><TableCell numeric>{d.testing}</TableCell><TableCell numeric>{d.submitted}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="grid gap-2 md:hidden">
            {drives.map((d) => (
              <button key={d.id} className="rounded-lg border border-border bg-card p-3 text-left" onClick={() => onOpenDrive(d.id)}>
                <div className="flex items-center justify-between gap-2"><p className="font-medium">{d.name}</p><Badge variant={statusVariant(d.status)}>{pretty(d.status)}</Badge></div>
                <p className="mt-1 text-xs text-muted-foreground"><span className="font-mono">{d.access_code}</span> · {d.registered} registered · {d.testing} testing · {d.submitted} submitted</p>
              </button>
            ))}
          </div>
        </>
      )}
      <DriveDialog drive={null} tests={tests} open={creating} onOpenChange={setCreating} onSaved={(id) => onOpenDrive(id)} />
    </div>
  );
}
