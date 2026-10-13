import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Lock, ArrowUp, ArrowDown, Trash2, Plus, Copy, Pencil, Check, X, Layers, Megaphone, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { QueryError, RowsSkeleton, SectionCard } from "@/components/ats/AtsBits";
import { CareersSettingsSection } from "@/components/ats/CareersSettingsSection";
import { EmailSettingsSection } from "@/components/ats/EmailSettingsSection";
import { InterviewSettingsSection } from "@/components/ats/InterviewSettingsSection";
import { useSearchParams } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusPill, stageDotClass } from "@/components/ats/AtsUi";
import { cn } from "@/lib/utils";
import {
  type AtsReason, type AtsStage, atsKeys, useAtsMutation, useCanManageAtsSettings, useAtsReasons, useAtsSettings, useAtsSources, useAtsStages,
} from "@/lib/ats/api";
import { SOURCE_KINDS, fmtDateTime, sourceKindLabel } from "@/lib/ats/format";

const chk = (r: { error: any }) => { if (r.error) throw r.error; };

/* ---------- inline rename ---------- */
function InlineName({ value, max, onSave, saving, disabled }: { value: string; max: number; onSave: (v: string) => void; saving?: boolean; disabled?: boolean }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  if (!edit) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1">
        <span className="truncate text-sm text-foreground">{value}</span>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={`Rename ${value}`} disabled={disabled} onClick={() => setEdit(true)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </span>
    );
  }
  const commit = () => {
    const t = v.trim();
    if (!t || t.length > max) { toast.error(`Name must be 1–${max} characters.`); return; }
    if (t !== value) onSave(t);
    setEdit(false);
  };
  return (
    <form className="flex min-w-0 items-center gap-1" onSubmit={(e) => { e.preventDefault(); commit(); }}>
      <Input autoFocus value={v} maxLength={max} onChange={(e) => setV(e.target.value)} className="h-8 text-foreground"
        onKeyDown={(e) => { if (e.key === "Escape") { setV(value); setEdit(false); } }} />
      <Button type="submit" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Save name" disabled={saving}><Check className="h-4 w-4" /></Button>
      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Cancel rename" onClick={() => { setV(value); setEdit(false); }}><X className="h-4 w-4" /></Button>
    </form>
  );
}

/* ---------- stage ordering ---------- */
/** Returns sort_order for the item placed after `afterId`, plus any renumbering updates for custom stages. */
export function placeAfter(stages: AtsStage[], afterId: string, movingId: string | null): { value: number; updates: { id: string; sort_order: number }[] } | null {
  const list = stages.filter((s) => s.id !== movingId).sort((a, b) => a.sort_order - b.sort_order);
  const i = list.findIndex((s) => s.id === afterId);
  if (i < 0 || list[i].kind === "hired") return null;
  const a = list[i].sort_order;
  const b = list[i + 1]?.sort_order ?? a + 20;
  if (b - a >= 2) return { value: Math.floor((a + b) / 2), updates: [] };
  let lo = i; while (lo > 0 && !list[lo].is_system) lo--;
  let hi = i + 1; while (hi < list.length && !list[hi].is_system) hi++;
  const loS = list[lo].sort_order;
  const segment = list.slice(lo + 1, hi);
  const pos = i - lo; // index in segment after which new goes
  const ordered: (string | null)[] = [...segment.slice(0, pos).map((s) => s.id), null, ...segment.slice(pos).map((s) => s.id)];
  const hiS = list[hi]?.sort_order ?? loS + 10 * (ordered.length + 1);
  const step = Math.floor((hiS - loS) / (ordered.length + 1));
  if (step < 1) return null;
  let value = 0;
  const updates: { id: string; sort_order: number }[] = [];
  ordered.forEach((id, k) => { const so = loS + step * (k + 1); if (id === null) value = so; else updates.push({ id, sort_order: so }); });
  return { value, updates };
}

function StagesSection() {
  const stages = useAtsStages();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [after, setAfter] = useState("");
  const [del, setDel] = useState<AtsStage | null>(null);
  const sorted = useMemo(() => [...(stages.data ?? [])].sort((a, b) => a.sort_order - b.sort_order), [stages.data]);
  const inv = () => [atsKeys.stages, atsKeys.jobSummary];

  const applyUpdates = async (updates: { id: string; sort_order: number }[]) => {
    for (const u of updates) chk(await supabase.from("ats_stages").update({ sort_order: u.sort_order }).eq("id", u.id));
  };
  const add = useAtsMutation(async () => {
    const p = placeAfter(sorted, after, null);
    if (!p) throw new Error("There is no room to place a stage there. Move another stage first.");
    await applyUpdates(p.updates);
    chk(await supabase.from("ats_stages").insert({ name: name.trim(), sort_order: p.value } as any));
  }, { invalidate: inv, pageErrors: true, success: "Stage added", onSuccess: () => { setAddOpen(false); setName(""); setAfter(""); } });
  const rename = useAtsMutation(async (v: { id: string; name: string }) => chk(await supabase.from("ats_stages").update({ name: v.name }).eq("id", v.id)), { invalidate: inv, success: "Stage renamed" });
  const toggle = useAtsMutation(async (v: { id: string; on: boolean }) => chk(await supabase.from("ats_stages").update({ is_active: v.on }).eq("id", v.id)), { invalidate: inv, refetchOnError: true });
  const move = useAtsMutation(async (v: { id: string; afterId: string }) => {
    const p = placeAfter(sorted, v.afterId, v.id);
    if (!p) throw new Error("This stage can't move there.");
    await applyUpdates([...p.updates, { id: v.id, sort_order: p.value }]);
  }, { invalidate: inv, pageErrors: true });
  const remove = useAtsMutation(async (id: string) => chk(await supabase.from("ats_stages").delete().eq("id", id)), {
    invalidate: inv, success: "Stage deleted", inUse: "This stage still has candidates. Move them first.", onSuccess: () => setDel(null),
  });

  if (stages.isLoading) return <RowsSkeleton rows={6} />;
  if (stages.isError) return <QueryError error={stages.error} onRetry={() => stages.refetch()} />;
  const afterOptions = sorted.filter((s) => s.kind !== "hired");
  const idx = (id: string) => sorted.findIndex((s) => s.id === id);
  const hiredIdx = sorted.findIndex((s) => s.kind === "hired");

  return (
    <SectionCard title="Stages" action={<Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Add stage</Button>}>
      {sorted.length === 0 ? <EmptyState icon={Layers} title="No stages" description="Add a stage to build your pipeline." className="py-8" /> : (
        <ul className="divide-y divide-border">
          {sorted.map((s) => {
            const i = idx(s.id);
            // up: place after the stage two above (must exist, i.e. never before New)
            const upAfter = i >= 2 ? sorted[i - 2] : null;
            // down: place after the next stage, never past Hired
            const downAfter = i + 1 < sorted.length && sorted[i + 1].kind !== "hired" && i + 1 < (hiredIdx < 0 ? sorted.length : hiredIdx) ? sorted[i + 1] : null;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${stageDotClass(s.kind)}`} />
                  <InlineName value={s.name} max={40} saving={rename.isPending} onSave={(n) => rename.mutate({ id: s.id, name: n })} />
                  {s.is_system ? (
                    <TooltipProvider delayDuration={150}><Tooltip><TooltipTrigger asChild><span tabIndex={0} className="inline-flex rounded"><Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Built-in stage" /></span></TooltipTrigger><TooltipContent>Built-in stage</TooltipContent></Tooltip></TooltipProvider>
                  ) : <StatusPill tone="neutral">Custom</StatusPill>}
                  {!s.is_active && <span className="text-xs text-muted-foreground">Inactive</span>}
                </div>
                {!s.is_system && (
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Move up" disabled={!upAfter || move.isPending} onClick={() => upAfter && move.mutate({ id: s.id, afterId: upAfter.id })}><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Move down" disabled={!downAfter || move.isPending} onClick={() => downAfter && move.mutate({ id: s.id, afterId: downAfter.id })}><ArrowDown className="h-4 w-4" /></Button>
                    <Switch checked={s.is_active} aria-label="Active" onCheckedChange={(on) => toggle.mutate({ id: s.id, on })} />
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Delete ${s.name}`} onClick={() => setDel(s)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ResponsiveDialog open={addOpen} onOpenChange={setAddOpen} title="Add stage"
        footer={<><Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button type="submit" form="ats-add-stage" disabled={!name.trim() || !after || add.isPending}>Add stage</Button></>}>
        <form id="ats-add-stage" className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (name.trim() && after) add.mutate(undefined as never); }}>
          <div className="space-y-1.5">
            <Label htmlFor="ats-stage-name">Name</Label>
            <Input id="ats-stage-name" autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className="text-foreground" />
          </div>
          <div className="space-y-1.5">
            <Label>Place after</Label>
            <Select value={after} onValueChange={setAfter}>
              <SelectTrigger className="text-foreground"><SelectValue placeholder="Choose a stage" /></SelectTrigger>
              <SelectContent>{afterOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </form>
      </ResponsiveDialog>

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete stage “{del?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. Stages that still hold candidates can't be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); del && remove.mutate(del.id); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}

function SourcesSection({ readOnly = false }: { readOnly?: boolean }) {
  const sources = useAtsSources();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("job_board");
  const inv = () => [atsKeys.sources];
  const add = useAtsMutation(async () => chk(await supabase.from("ats_sources").insert({ name: name.trim(), kind } as any)),
    { invalidate: inv, success: "Source added", onSuccess: () => { setOpen(false); setName(""); setKind("job_board"); } });
  const rename = useAtsMutation(async (v: { id: string; name: string }) => chk(await supabase.from("ats_sources").update({ name: v.name }).eq("id", v.id)), { invalidate: inv, success: "Source renamed" });
  const toggle = useAtsMutation(async (v: { id: string; on: boolean }) => chk(await supabase.from("ats_sources").update({ is_active: v.on }).eq("id", v.id)), { invalidate: inv });

  if (sources.isLoading) return <RowsSkeleton rows={6} />;
  if (sources.isError) return <QueryError error={sources.error} onRetry={() => sources.refetch()} />;
  return (
    <SectionCard title="Sources" action={<Button size="sm" disabled={readOnly} onClick={() => setOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Add source</Button>}>
      <p className="mb-2 text-xs text-muted-foreground">Sources are kept for reporting; deactivate instead.</p>
      {(sources.data ?? []).length === 0 ? <EmptyState icon={Megaphone} title="No sources" description="Add where applicants come from." className="py-8" /> : (
        <ul className="divide-y divide-border">
          {sources.data!.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <div className="min-w-0 flex-1"><InlineName value={s.name} max={60} disabled={readOnly} onSave={(n) => rename.mutate({ id: s.id, name: n })} /></div>
              <StatusPill tone="neutral">{sourceKindLabel(s.kind)}</StatusPill>
              <span className="inline-flex items-center gap-1">
                <span className="t-mono text-xs text-muted-foreground">{s.code}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Copy tracking code ${s.code}`}
                  onClick={() => navigator.clipboard.writeText(s.code).then(() => toast.success("Tracking code copied"), () => toast.error("Couldn't copy"))}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </span>
              <Switch checked={s.is_active} aria-label="Active" onCheckedChange={(on) => toggle.mutate({ id: s.id, on })} />
            </li>
          ))}
        </ul>
      )}
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Add source"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="ats-add-source" disabled={!name.trim() || add.isPending}>Add source</Button></>}>
        <form id="ats-add-source" className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(undefined as never); }}>
          <div className="space-y-1.5">
            <Label htmlFor="ats-source-name">Name</Label>
            <Input id="ats-source-name" autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className="text-foreground" />
          </div>
          <div className="space-y-1.5">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCE_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </form>
      </ResponsiveDialog>
    </SectionCard>
  );
}

function ReasonList({ title, rows }: { title: string; rows: AtsReason[] }) {
  const inv = () => [atsKeys.reasons];
  const rename = useAtsMutation(async (v: { id: string; label: string }) => chk(await supabase.from("ats_reject_reasons").update({ label: v.label }).eq("id", v.id)), { invalidate: inv, success: "Reason renamed" });
  const toggle = useAtsMutation(async (v: { id: string; on: boolean }) => chk(await supabase.from("ats_reject_reasons").update({ is_active: v.on }).eq("id", v.id)), { invalidate: inv });
  const move = useAtsMutation(async (v: { from: number; to: number }) => {
    const list = [...rows];
    const [it] = list.splice(v.from, 1);
    list.splice(v.to, 0, it);
    const distinct = new Set(rows.map((r) => r.sort_order)).size === rows.length;
    if (distinct) {
      const a = rows[v.from], b = rows[v.to];
      chk(await supabase.from("ats_reject_reasons").update({ sort_order: b.sort_order }).eq("id", a.id));
      chk(await supabase.from("ats_reject_reasons").update({ sort_order: a.sort_order }).eq("id", b.id));
    } else {
      for (let k = 0; k < list.length; k++) chk(await supabase.from("ats_reject_reasons").update({ sort_order: (k + 1) * 10 }).eq("id", list[k].id));
    }
  }, { invalidate: inv });
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{title}</h3>
      {rows.length === 0 ? <p className="py-3 text-sm text-muted-foreground">No reasons yet.</p> : (
        <ul className="divide-y divide-border">
          {rows.map((r, i) => (
            <li key={r.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1"><InlineName value={r.label} max={80} onSave={(l) => rename.mutate({ id: r.id, label: l })} /></div>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Move up" disabled={i === 0 || move.isPending} onClick={() => move.mutate({ from: i, to: i - 1 })}><ArrowUp className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Move down" disabled={i === rows.length - 1 || move.isPending} onClick={() => move.mutate({ from: i, to: i + 1 })}><ArrowDown className="h-4 w-4" /></Button>
              <Switch checked={r.is_active} aria-label="Active" onCheckedChange={(on) => toggle.mutate({ id: r.id, on })} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReasonsSection() {
  const reasons = useAtsReasons();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [applies, setApplies] = useState<"rejected" | "withdrawn">("rejected");
  const add = useAtsMutation(async () => {
    const same = (reasons.data ?? []).filter((r) => r.applies_to === applies && r.sort_order < 999);
    const next = same.reduce((m, r) => Math.max(m, r.sort_order), 0) + 10;
    chk(await supabase.from("ats_reject_reasons").insert({ label: label.trim(), applies_to: applies, sort_order: Math.min(next, 998) } as any));
  }, { invalidate: () => [atsKeys.reasons], success: "Reason added", onSuccess: () => { setOpen(false); setLabel(""); } });

  if (reasons.isLoading) return <RowsSkeleton rows={6} />;
  if (reasons.isError) return <QueryError error={reasons.error} onRetry={() => reasons.refetch()} />;
  const by = (k: string) => (reasons.data ?? []).filter((r) => r.applies_to === k).sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
  return (
    <SectionCard title="Rejection reasons" action={<Button size="sm" onClick={() => setOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Add reason</Button>}>
      {(reasons.data ?? []).length === 0 ? <EmptyState icon={Ban} title="No reasons" description="Add reasons used when rejecting or withdrawing." className="py-8" /> : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ReasonList title="Rejected by us" rows={by("rejected")} />
          <ReasonList title="Withdrawn by candidate" rows={by("withdrawn")} />
        </div>
      )}
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Add reason"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="ats-add-reason" disabled={!label.trim() || add.isPending}>Add reason</Button></>}>
        <form id="ats-add-reason" className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (label.trim()) add.mutate(undefined as never); }}>
          <div className="space-y-1.5">
            <Label htmlFor="ats-reason-label">Label</Label>
            <Input id="ats-reason-label" autoFocus maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} className="text-foreground" />
          </div>
          <div className="space-y-1.5">
            <Label>List</Label>
            <Select value={applies} onValueChange={(v) => setApplies(v as any)}>
              <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rejected">Rejected by us</SelectItem>
                <SelectItem value="withdrawn">Withdrawn by candidate</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </form>
      </ResponsiveDialog>
    </SectionCard>
  );
}

const generalSchema = z.object({
  default_location: z.string().trim().min(1, "Enter a location").max(200),
  idle_alert_days: z.coerce.number().int("Whole days only").min(1, "1–60 days").max(60, "1–60 days"),
  retention_months: z.coerce.number().int("Whole months only").min(1, "1–60 months").max(60, "1–60 months"),
});
type GeneralValues = z.infer<typeof generalSchema>;

function GeneralSection() {
  const settings = useAtsSettings();
  const form = useForm<GeneralValues>({ resolver: zodResolver(generalSchema) });
  useEffect(() => {
    if (settings.data) form.reset({
      default_location: settings.data.default_location, idle_alert_days: settings.data.idle_alert_days, retention_months: settings.data.retention_months,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data]);
  const save = useAtsMutation(async (v: GeneralValues) => chk(await supabase.from("ats_settings").update(v).eq("id", true)),
    { invalidate: () => [atsKeys.settings], success: "Settings saved" });

  if (settings.isLoading) return <RowsSkeleton rows={3} />;
  if (settings.isError) return <QueryError error={settings.error} onRetry={() => settings.refetch()} />;
  const e = form.formState.errors;
  return (
    <SectionCard title="General">
      <form noValidate className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ats-def-loc">Default job location</Label>
          <Input id="ats-def-loc" className="text-foreground" {...form.register("default_location")} />
          {e.default_location ? <p className="text-xs text-destructive">{e.default_location.message}</p> : <p className="text-xs text-muted-foreground">Filled in when you create a job.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ats-idle">Idle alert after (days)</Label>
          <Input id="ats-idle" type="number" min={1} max={60} className="text-foreground" {...form.register("idle_alert_days")} />
          {e.idle_alert_days ? <p className="text-xs text-destructive">{e.idle_alert_days.message}</p> : <p className="text-xs text-muted-foreground">Active applications with no movement for this many days show as idle.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ats-ret">Keep rejected applicants for (months)</Label>
          <Input id="ats-ret" type="number" min={1} max={60} className="text-foreground" {...form.register("retention_months")} />
          {e.retention_months ? <p className="text-xs text-destructive">{e.retention_months.message}</p> : <p className="text-xs text-muted-foreground">How long to keep applicants who weren't hired. Automatic clean-up isn't switched on yet.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={save.isPending}>Save</Button>
          {settings.data?.updated_by_name && (
            <span className="text-xs text-muted-foreground">Last updated by {settings.data.updated_by_name} on {fmtDateTime(settings.data.updated_at)}</span>
          )}
        </div>
      </form>
    </SectionCard>
  );
}

const TAB_META = [
  { v: "stages", l: "Stages", d: "The steps every application moves through" },
  { v: "sources", l: "Sources", d: "Where applicants come from" },
  { v: "reasons", l: "Rejection reasons", d: "Why applications end" },
  { v: "careers", l: "Careers page", d: "Website link and connection" },
  { v: "email", l: "Email", d: "Candidate email and templates" },
  { v: "interviews", l: "Interviews", d: "Defaults, office address and reminders" },
  { v: "general", l: "General", d: "Location, idle alert and how long to keep data" },
];
const SETTINGS_TABS = ["stages", "sources", "reasons", "careers", "email", "interviews", "general"];

export default function AtsSettingsPage() {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get("tab") ?? "stages";
  const tab = SETTINGS_TABS.includes(raw) ? raw : "stages";
  const onTab = (v: string) => {
    const next = new URLSearchParams(sp);
    if (v === "stages") next.delete("tab"); else next.set("tab", v);
    setSp(next, { replace: true });
  };
  const canManage = useCanManageAtsSettings().data === true;
  const lock = (node: JSX.Element) => <fieldset disabled={!canManage} className="m-0 min-w-0 border-0 p-0">{node}</fieldset>;
  return (
    <div className="space-y-4">
    {!canManage && <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">Only HR admins can change ATS settings. You can view them here.</p>}
    <Tabs value={tab} onValueChange={onTab} className="space-y-4 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="max-w-full overflow-x-auto lg:hidden">
        <TabsList className="flex-nowrap">
          {TAB_META.map((t) => <TabsTrigger key={t.v} value={t.v}>{t.l}</TabsTrigger>)}
        </TabsList>
      </div>
      <nav aria-label="Settings sections" className="hidden lg:sticky lg:top-0 lg:block">
        <ul className="space-y-1">
          {TAB_META.map((t) => (
            <li key={t.v}>
              <button type="button" onClick={() => onTab(t.v)} aria-current={tab === t.v ? "page" : undefined}
                className={cn("w-full rounded-lg px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === t.v ? "bg-primary/10" : "hover:bg-muted/60")}>
                <span className="block text-sm font-medium text-foreground">{t.l}</span>
                <span className="block text-xs text-muted-foreground">{t.d}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <TabsContent value="stages" className="mt-0">{lock(<StagesSection />)}</TabsContent>
        <TabsContent value="sources" className="mt-0"><SourcesSection readOnly={!canManage} /></TabsContent>
        <TabsContent value="reasons" className="mt-0">{lock(<ReasonsSection />)}</TabsContent>
        <TabsContent value="careers" className="mt-0"><CareersSettingsSection /></TabsContent>
        <TabsContent value="email" className="mt-0"><EmailSettingsSection /></TabsContent>
        <TabsContent value="interviews" className="mt-0">{lock(<InterviewSettingsSection />)}</TabsContent>
        <TabsContent value="general" className="mt-0">{lock(<GeneralSection />)}</TabsContent>
      </div>
    </Tabs>
    </div>
  );
}
