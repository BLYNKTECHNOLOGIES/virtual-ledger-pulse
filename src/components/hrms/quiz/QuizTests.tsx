import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ExternalLink, FlaskConical, Gauge, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { AttemptPanel } from "@/components/hrms/quiz/AttemptPanel";
import { fmtIst, pretty, quizRpc } from "@/components/hrms/quiz/quizShared";
import {
  GENERATED_ONLY, GROUPS, HAS_NEGATIVE, HAS_SOURCE, HAS_SUBJECTS, LEVELS, PRESETS, TYPE_BLURB, TYPE_LABEL,
  fromRow, levelMeaning, newSection, summarise, toPayload, type Level, type SectionDraft, type SectionType,
  minutesWithBreaks,
} from "@/lib/cbt/testBuilder";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ready = { order_index: number; title: string; need: number; have: number; ready: boolean; generated: boolean; note: string | null };

function useReadiness(pool: string, code: string | null, sections: unknown[], enabled = true) {
  const payload = JSON.stringify(sections);
  return useQuery({
    queryKey: ["cbt", "readiness", pool, code, payload],
    enabled: enabled && sections.length > 0,
    staleTime: 10_000,
    queryFn: () => quizRpc<Ready[]>("cbt_blueprint_readiness", { p_pool: pool, p_role_code: code, p_sections: JSON.parse(payload), p_is_sandbox: false }),
  });
}

function ReadinessCell({ role, sections }: { role: any; sections: any[] }) {
  const { data, isLoading } = useReadiness(role.pool ?? "hiring", role.code, sections);
  if (!sections.length) return <Badge variant="warning">No sections</Badge>;
  if (isLoading || !data) return <span className="text-xs text-muted-foreground">Checking…</span>;
  const missing = data.filter((r) => !r.ready);
  if (!missing.length) return <Badge variant="success">Ready</Badge>;
  return (
    <div className="space-y-0.5">
      <Badge variant="warning">Missing items</Badge>
      {missing.map((m) => <p key={m.order_index} className="text-xs text-muted-foreground">{m.title}: {m.have}/{m.need}</p>)}
    </div>
  );
}

export function QuizTests({ roles, roleSections, positions, canManage, transitionSeconds = 60 }: { roles: any[]; roleSections: any[]; positions: any[]; canManage: boolean; transitionSeconds?: number }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<any | "new" | null>(null);
  const [tryRole, setTryRole] = useState<any | null>(null);
  const sectionsOf = (id: string) => roleSections.filter((s) => s.job_role_id === id).sort((a, b) => a.order_index - b.order_index);

  const tryIt = useMutation({
    mutationFn: (roleId: string) => quizRpc<{ access_code: string }>("cbt_try_test", { p_role_id: roleId }),
    onSuccess: (res) => {
      window.open(`/test?code=${res.access_code}`, "_blank", "noopener");
      toast({ title: "Try run opened in a new tab", description: `Code ${res.access_code}. It never counts and is removed after 3 days.` });
    },
    onError: (e: Error) => toast({ title: "Could not start a try run", description: e.message, variant: "destructive" }),
  });

  const drills = useMemo(() => GROUPS[0].types.map((t) => ({
    type: t, used: roles.filter((r) => sectionsOf(r.id).some((s) => s.section_type === t)).map((r) => r.name),
  })), [roles, roleSections]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Tests</h2><p className="text-sm text-muted-foreground">One hiring test per company position. Scores are a weighted average of section scores.</p></div>
          {canManage && <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" />New test</Button>}
        </div>
        <div className="space-y-2 sm:hidden">
          {roles.map((r) => {
            const secs = sectionsOf(r.id);
            return (
              <Card key={r.id}><CardContent className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.positions?.departments?.name ?? r.department_code} · <span className="font-mono">{r.code}</span></p></div>
                  <Badge variant={r.is_active ? "success" : "muted"}>{r.is_active ? "Active" : "Inactive"}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{secs.length} sections · {Math.round(secs.reduce((n, s) => n + s.duration_seconds, 0) / 6) / 10} min (about {minutesWithBreaks(secs, transitionSeconds)} with breaks) · Shortlist ≥ {r.shortlist_cutoff}% · Hold ≥ {r.hold_cutoff}%</p>
                <ReadinessCell role={r} sections={secs} />
                <div className="flex flex-wrap gap-1">
                  {canManage && <Button variant="outline" size="sm" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" />Edit</Button>}
                  {canManage && <Button variant="outline" size="sm" disabled={tryIt.isPending} onClick={() => tryIt.mutate(r.id)}><FlaskConical className="h-4 w-4" />Try it</Button>}
                  <Button variant="ghost" size="sm" onClick={() => setTryRole(r)}>Try runs</Button>
                </div>
              </CardContent></Card>
            );
          })}
          {!roles.length && <p className="text-center text-sm text-muted-foreground">No tests yet.</p>}
        </div>
        <Table className="hidden sm:table">
          <TableHeader><TableRow>
            <TableHead>Position</TableHead><TableHead>Department</TableHead><TableHead numeric>Sections</TableHead><TableHead numeric>Minutes</TableHead>
            <TableHead>Cut-offs</TableHead><TableHead>Status</TableHead><TableHead>Readiness</TableHead><TableHead className="w-28"><span className="sr-only">Actions</span></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {roles.map((r) => {
              const secs = sectionsOf(r.id);
              const minutes = Math.round(secs.reduce((n, s) => n + s.duration_seconds, 0) / 6) / 10;
              const withBreaks = minutesWithBreaks(secs, transitionSeconds);
              return (
                <TableRow key={r.id}>
                  <TableCell><p className="font-medium">{r.name}</p><p className="font-mono text-xs text-muted-foreground">{r.code}</p></TableCell>
                  <TableCell>{r.positions?.departments?.name ?? r.department_code}</TableCell>
                  <TableCell numeric>{secs.length}</TableCell>
                  <TableCell numeric><p>{minutes}</p><p className="text-xs text-muted-foreground">about {withBreaks} with breaks</p></TableCell>
                  <TableCell className="text-xs">Shortlist ≥ {r.shortlist_cutoff}% · Hold ≥ {r.hold_cutoff}%</TableCell>
                  <TableCell><Badge variant={r.is_active ? "success" : "muted"}>{r.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell><ReadinessCell role={r} sections={secs} /></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {canManage && <Button variant="ghost" size="icon" aria-label={`Edit ${r.name}`} title="Edit" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>}
                      {canManage && <Button variant="ghost" size="icon" aria-label={`Try ${r.name}`} title="Try it as a candidate" disabled={tryIt.isPending} onClick={() => tryIt.mutate(r.id)}><FlaskConical className="h-4 w-4" /></Button>}
                      <Button variant="ghost" size="sm" onClick={() => setTryRole(r)}>Try runs</Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!roles.length && <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">No tests yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-4 border-t border-border pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Skill drills</h2><p className="text-sm text-muted-foreground">Practical drills that measure ability. Add them to a test as sections; marking happens on the server.</p></div>
          <Button asChild variant="outline" size="sm"><a href="/test/practice" target="_blank" rel="noopener"><Gauge className="h-4 w-4" />Open the practice run</a></Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {drills.map((d) => (
            <Card key={d.type}><CardContent className="space-y-1 p-4">
              <div className="flex items-center justify-between gap-2"><p className="font-semibold">{TYPE_LABEL[d.type]}</p><Badge variant={d.used.length ? "success" : "muted"}>{d.used.length ? `In ${d.used.length} test${d.used.length > 1 ? "s" : ""}` : "Not in use"}</Badge></div>
              <p className="text-sm text-muted-foreground">{TYPE_BLURB[d.type]}</p>
              <p className="text-xs text-muted-foreground">{GENERATED_ONLY.includes(d.type) ? "Generated per attempt." : HAS_SOURCE.includes(d.type) ? "Generated per attempt, from the bank, or both." : "Passage from the question bank, matched to the level."}{d.used.length ? ` Used in: ${d.used.join(", ")}.` : ""}</p>
            </CardContent></Card>
          ))}
        </div>
      </div>

      {editing && <TestEditor transitionSeconds={transitionSeconds} role={editing === "new" ? null : editing} sections={editing === "new" ? [] : sectionsOf(editing.id)} positions={positions} roles={roles} onClose={() => setEditing(null)} />}
      <TryRuns role={tryRole} onClose={() => setTryRole(null)} />
    </div>
  );
}

function TryRuns({ role, onClose }: { role: any | null; onClose: () => void }) {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["cbt", "try-runs", role?.id], enabled: Boolean(role), queryFn: () => quizRpc<any[]>("cbt_try_runs", { p_role_id: role.id }) });
  return (
    <>
      <Dialog open={Boolean(role)} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Try runs · {role?.name}</DialogTitle><DialogDescription>Sandbox runs by HR. They never count, are hidden from Results and statistics, and are removed 3 days after they start.</DialogDescription></DialogHeader>
          {!data?.length ? <p className="text-sm text-muted-foreground">No try runs yet.</p> : (
            <Table><TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Status</TableHead><TableHead numeric>Score</TableHead><TableHead>Removed after</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.public_ref}</TableCell><TableCell>{pretty(a.status)}</TableCell>
                  <TableCell numeric>{a.total_score ?? "—"}</TableCell><TableCell className="text-xs">{fmtIst(a.removed_after)}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => setAttemptId(a.id)}>How it was scored</Button></TableCell>
                </TableRow>))}
              </TableBody></Table>
          )}
          {data?.some((a) => a.written?.length) && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Written answers · AI grading</p>
              {data.flatMap((a) => (a.written ?? []).map((w: any, i: number) => (
                <div key={`${a.id}-${i}`} className="space-y-1.5 rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{a.public_ref}</span>
                    <span className="text-xs">{w.total != null ? `${w.total}/20 · ${w.graded_by_kind === "ai" ? "AI grade applied" : "graded by HR"}`
                      : w.ai_suggested_total != null ? `AI suggestion ${w.ai_suggested_total}/20 · not applied`
                      : w.ai_status === "queued" || w.ai_status === "processing" ? "With the AI…" : "No AI grade"}</span>
                  </div>
                  <p className="font-medium">{w.prompt ?? "Written question"}</p>
                  <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">{w.answer || "No answer"}</p>
                  {(w.ai_route_reason || w.ai_last_error) && <p className="text-xs text-warning">{w.ai_route_reason ?? w.ai_last_error}</p>}
                  {Array.isArray(w.flags) && w.flags.length > 0 && <div className="flex flex-wrap gap-1">{w.flags.map((f: string) => <Badge key={f} variant="outline">{pretty(f)}</Badge>)}</div>}
                  {Array.isArray(w.points) && w.points.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-xs">{w.points.map((pt: any, j: number) => <li key={j}>{pt.point}: {pt.score}/{pt.max} — {pt.reason}</li>)}</ul>}
                  {w.summary && <p className="text-xs text-muted-foreground">{w.summary}{w.confidence != null ? ` · confidence ${w.confidence}` : ""}</p>}
                </div>
              )))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AttemptPanel attemptId={attemptId} onClose={() => setAttemptId(null)} canManage={false} />
    </>
  );
}

function TestEditor({ role, sections: initial, positions, roles, onClose, transitionSeconds = 60 }: { role: any | null; sections: any[]; positions: any[]; roles: any[]; onClose: () => void; transitionSeconds?: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [positionId, setPositionId] = useState<string>(role?.position_id ?? "");
  const [active, setActive] = useState<boolean>(role?.is_active ?? true);
  const [shortlist, setShortlist] = useState(String(role?.shortlist_cutoff ?? 65));
  const [hold, setHold] = useState(String(role?.hold_cutoff ?? 50));
  const [retake, setRetake] = useState(String(role?.retake_cooldown_days ?? 0));
  const [sections, setSections] = useState<SectionDraft[]>(() => initial.map(fromRow));
  // fill once per opened test, never on re-fetch
  useEffect(() => { setSections(initial.map(fromRow)); }, [role?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pool = role?.pool ?? "hiring";
  const { data: subjects } = useQuery({
    queryKey: ["cbt", "subjects-for-tests", pool],
    queryFn: async () => {
      const { data, error } = await supabase.from("cbt_subjects" as never).select("key, display_name, pool, is_retired").in("pool" as never, [pool, "shared"] as never);
      if (error) throw error;
      return ((data ?? []) as any[]).filter((s) => !s.is_retired);
    },
  });
  const taken = new Set(roles.map((r) => r.position_id));
  const available = positions.filter((p) => !taken.has(p.id));
  const position = positions.find((p) => p.id === positionId);

  const payload = useMemo(() => toPayload(sections), [sections]);
  const summary = summarise(sections);
  const { data: ready } = useReadiness(pool, role?.code ?? null, payload);

  const update = (key: string, patch: Partial<SectionDraft>) => setSections((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => setSections((all) => { const a = [...all]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const setLevel = (s: SectionDraft, level: Level) => {
    const p = PRESETS[s.sectionType][level];
    update(s.key, { level, items: String(p.items), minutes: String(p.minutes), ...(p.wpm ? { fullMarksWpm: String(p.wpm[0]), gateMinNetWpm: String(p.wpm[1]), gateMinAccuracy: String(p.wpm[2]) } : {}) });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!role && !position) throw new Error("Choose the company position this test is for.");
      const dept = position?.departments?.code;
      if (!role && !dept) throw new Error("This position has no department. Set its department first.");
      const code = role?.code ?? `${dept}_${position.title}`.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
      return quizRpc("cbt_save_role_blueprint", {
        p_role_id: role?.id ?? null, p_position_id: role ? role.position_id : positionId, p_code: code,
        p_shortlist_cutoff: Number(shortlist), p_hold_cutoff: Number(hold), p_is_active: active, p_sections: payload,
        p_retake_cooldown_days: Number(retake || 0),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["cbt"] });
      toast({ title: role ? "Test saved" : "Test created" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Test not saved", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader><DialogTitle>{role ? `Edit test · ${role.name}` : "New test"}</DialogTitle><DialogDescription>Running attempts keep the version they started with.</DialogDescription></DialogHeader>
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="sm:col-span-2">
                <Label>Position</Label>
                {role ? <p className="mt-2 text-sm font-medium">{role.name}</p> : (
                  <Select value={positionId} onValueChange={setPositionId}><SelectTrigger className="text-foreground"><SelectValue placeholder="Choose a position" /></SelectTrigger>
                    <SelectContent>{available.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}{p.departments?.code ? ` — ${p.departments.code}` : ""}</SelectItem>)}</SelectContent></Select>
                )}
              </div>
              <div><Label htmlFor="sl">Shortlist at or above %</Label><Input id="sl" type="number" className="text-foreground" value={shortlist} onChange={(e) => setShortlist(e.target.value)} /></div>
              <div><Label htmlFor="hd">Hold at or above %</Label><Input id="hd" type="number" className="text-foreground" value={hold} onChange={(e) => setHold(e.target.value)} /></div>
              <div><Label htmlFor="rt">Retake wait (days)</Label><Input id="rt" type="number" min={0} className="text-foreground" value={retake} onChange={(e) => setRetake(e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">0 = no limit</p></div>
            </div>
            <div className="flex items-center gap-2"><Switch id="act" checked={active} onCheckedChange={setActive} /><Label htmlFor="act">Active</Label></div>

            <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
              <div><h3 className="font-semibold">Sections</h3><p className="text-xs text-muted-foreground">Candidates take them in this order.</p></div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Plus className="h-4 w-4" />Add section</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {GROUPS.map((g, gi) => (
                    <div key={g.title}>{gi > 0 && <DropdownMenuSeparator />}<DropdownMenuLabel>{g.title}</DropdownMenuLabel>
                      {g.types.map((t) => <DropdownMenuItem key={t} onSelect={() => setSections((a) => [...a, newSection(t, a.map((s) => s.sectionCode))])}>{TYPE_LABEL[t]}</DropdownMenuItem>)}
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {!sections.length && <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Add the first section from the catalogue.</p>}
            {sections.map((s, i) => {
              const r = ready?.find((x) => Number(x.order_index) === i + 1);
              const subjectOptions = (subjects ?? []).filter((sj) => !s.subjects.includes(sj.key));
              return (
                <Card key={s.key}><CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                    <Input aria-label="Section title" className="h-8 max-w-xs text-foreground" value={s.title} onChange={(e) => update(s.key, { title: e.target.value })} />
                    <Badge variant="muted">{TYPE_LABEL[s.sectionType]}</Badge>
                    <Badge variant="outline">{summary.shares[i]}% of score</Badge>
                    {r && (r.ready ? <Badge variant="success">{r.generated ? "Generated · ready" : `${r.have} available`}</Badge> : <Badge variant="warning">{r.have}/{r.need} available</Badge>)}
                    <div className="ml-auto flex gap-1">
                      <Button variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label="Move down" disabled={i === sections.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label="Remove section" onClick={() => setSections((a) => a.filter((x) => x.key !== s.key))}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{levelMeaning(s.sectionType, s.level, s.sectionType === "typing" ? 1 : Number(s.items) || 0, Number(s.minutes) || 0)}</p>
                  <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                    <div><Label className="text-xs">Level</Label><Select value={s.level} onValueChange={(v) => setLevel(s, v as Level)}><SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger><SelectContent>{LEVELS.map((l) => <SelectItem key={l} value={l}>{pretty(l)}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label className="text-xs">Minutes</Label><Input className="h-9 text-foreground" inputMode="decimal" value={s.minutes} onChange={(e) => update(s.key, { minutes: e.target.value })} /></div>
                    {s.sectionType !== "typing" && <div><Label className="text-xs">Items</Label><Input className="h-9 text-foreground" inputMode="numeric" value={s.items} onChange={(e) => update(s.key, { items: e.target.value })} /></div>}
                    <div><Label className="text-xs">Weight</Label><Input className="h-9 text-foreground" inputMode="decimal" value={s.weight} onChange={(e) => update(s.key, { weight: e.target.value })} /></div>
                    {s.sectionType !== "typing" && <div><Label className="text-xs">Pass mark % (optional)</Label><Input className="h-9 text-foreground" inputMode="decimal" value={s.passMark} onChange={(e) => update(s.key, { passMark: e.target.value })} /></div>}
                    {HAS_NEGATIVE.includes(s.sectionType) && <div><Label className="text-xs">Minus per wrong (points)</Label><Input className="h-9 text-foreground" inputMode="decimal" value={s.negativeMark} onChange={(e) => update(s.key, { negativeMark: e.target.value })} /></div>}
                    {HAS_SOURCE.includes(s.sectionType) && <div><Label className="text-xs">Items come from</Label><Select value={s.source} onValueChange={(v) => update(s.key, { source: v as SectionDraft["source"] })}><SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="generated">Generated</SelectItem><SelectItem value="bank">Bank</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent></Select></div>}
                    {s.sectionType === "typing" && <>
                      <div><Label className="text-xs">Full marks at WPM</Label><Input className="h-9 text-foreground" value={s.fullMarksWpm} onChange={(e) => update(s.key, { fullMarksWpm: e.target.value })} /></div>
                      <div><Label className="text-xs">Pass: net WPM</Label><Input className="h-9 text-foreground" value={s.gateMinNetWpm} onChange={(e) => update(s.key, { gateMinNetWpm: e.target.value })} /></div>
                      <div><Label className="text-xs">Pass: accuracy %</Label><Input className="h-9 text-foreground" value={s.gateMinAccuracy} onChange={(e) => update(s.key, { gateMinAccuracy: e.target.value })} /></div>
                      <div><Label className="text-xs">Practice minutes</Label><Input className="h-9 text-foreground" value={s.practiceMinutes} onChange={(e) => update(s.key, { practiceMinutes: e.target.value })} /></div>
                    </>}
                    {s.sectionType === "written" && <>
                      <div><Label className="text-xs">Min words</Label><Input className="h-9 text-foreground" value={s.minWords} onChange={(e) => update(s.key, { minWords: e.target.value })} /></div>
                      <div><Label className="text-xs">Max words</Label><Input className="h-9 text-foreground" value={s.maxWords} onChange={(e) => update(s.key, { maxWords: e.target.value })} /></div>
                    </>}
                  </div>
                  {HAS_SUBJECTS.includes(s.sectionType) && !(HAS_SOURCE.includes(s.sectionType) && s.source === "generated") && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Subjects:</span>
                      {!s.subjects.length && <span className="text-xs text-muted-foreground">any</span>}
                      {s.subjects.map((k) => (
                        <Badge key={k} variant="outline" className="gap-1">{subjects?.find((x) => x.key === k)?.display_name ?? k}
                          <button type="button" aria-label={`Remove ${k}`} onClick={() => update(s.key, { subjects: s.subjects.filter((x) => x !== k) })}>×</button></Badge>
                      ))}
                      {subjectOptions.length > 0 && (
                        <Select value="" onValueChange={(v) => update(s.key, { subjects: [...s.subjects, v] })}>
                          <SelectTrigger className="h-8 w-44 text-foreground"><SelectValue placeholder="Add subject" /></SelectTrigger>
                          <SelectContent>{subjectOptions.map((sj) => <SelectItem key={sj.key} value={sj.key}>{sj.display_name}{sj.pool === "shared" ? " (Shared)" : ""}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                </CardContent></Card>
              );
            })}
          </div>

          <aside className="space-y-3 lg:sticky lg:top-0 lg:self-start">
            <Card><CardContent className="space-y-3 p-4">
              <p className="font-semibold">Summary</p>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total time</span><span className={summary.overHour ? "font-semibold text-destructive" : "font-semibold"}>{summary.totalMinutes} min</span></div>
              <p className="text-right text-xs text-muted-foreground">about {minutesWithBreaks(sections.map((s) => ({ duration_seconds: (Number(s.minutes) || 0) * 60, section_type: s.sectionType, practice_seconds: s.sectionType === "typing" ? (Number(s.practiceMinutes) || 0) * 60 : 0 })), transitionSeconds)} min with breaks, as candidates experience it</p>
              {summary.overHour && <p className="flex items-start gap-1 text-xs text-destructive"><AlertTriangle className="mt-0.5 h-3 w-3" />Over 60 minutes. A standard hiring test is about 45.</p>}
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total items</span><span className="font-semibold">{summary.totalItems}</span></div>
              <div className="space-y-1 border-t border-border pt-2">
                {sections.map((s, i) => {
                  const r = ready?.find((x) => Number(x.order_index) === i + 1);
                  return (
                    <div key={s.key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{i + 1}. {s.title}</span>
                      <span className="flex shrink-0 items-center gap-1">{summary.shares[i]}%
                        {r && (r.ready ? <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-label="Ready" /> : <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-label={`${r.have} of ${r.need}`} />)}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Readiness counts approved items in this test's pool plus Shared, its subjects and level the same way the test picks them; generated sections are always ready.</p>
            </CardContent></Card>
            {role && <p className="flex items-center gap-1 text-xs text-muted-foreground"><ExternalLink className="h-3 w-3" />Save, then use “Try it” in the list to take this test in a sandbox.</p>}
          </aside>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={save.isPending || !sections.length} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save test"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { SectionType };
