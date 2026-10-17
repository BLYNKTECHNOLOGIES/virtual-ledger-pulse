import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, RotateCcw, Search } from "lucide-react";
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
import { QueryError, RowsSkeleton, SectionCard } from "./AtsBits";
import { JobDetailsInput, StatusPill } from "./AtsUi";
import { useAtsMutation, useCanManageAtsSettings, useDepartmentsLookup } from "@/lib/ats/api";
import { EMPLOYMENT_TYPES } from "@/lib/ats/format";
import {
  type EffectiveJobTemplate, type JobTemplateContent, type TemplateDesignation,
  deleteJobTemplate, gradeLabel, jobTemplateKeys, saveJobTemplate, templateSourceText, useJobTemplates, useTemplateDesignations,
} from "@/lib/ats/jobTemplates";

const optNum = (min: number, max: number, label: string) =>
  z.string().trim().refine((v) => v === "" || (!isNaN(Number(v)) && Number(v) >= min && Number(v) <= max), `${label} must be between ${min} and ${max}`);

const schema = z
  .object({
    summary: z.string().max(500, "Keep the summary to 500 characters or fewer."),
    description: z.string().max(20000, "Keep this under 20,000 characters."),
    requirements: z.string().max(20000, "Keep this under 20,000 characters."),
    benefits: z.string().max(20000, "Keep this under 20,000 characters."),
    hr_notes: z.string().max(20000, "Keep this under 20,000 characters."),
    employment_type: z.enum(["full_time", "part_time", "contract", "internship", "trainee"]),
    experience_min_years: optNum(0, 50, "Experience").refine((v) => v === "" || Number(v) * 2 === Math.round(Number(v) * 2), "Use steps of 0.5"),
    experience_max_years: optNum(0, 50, "Experience").refine((v) => v === "" || Number(v) * 2 === Math.round(Number(v) * 2), "Use steps of 0.5"),
    salary_min: optNum(0, 9999999999, "Salary"),
    salary_max: optNum(0, 9999999999, "Salary"),
    salary_period: z.enum(["monthly", "annual"]),
    show_salary: z.boolean(),
  })
  .refine((d) => d.salary_min === "" || d.salary_max === "" || Number(d.salary_max) >= Number(d.salary_min), { path: ["salary_max"], message: "Maximum must be at least the minimum" })
  .refine((d) => d.experience_min_years === "" || d.experience_max_years === "" || Number(d.experience_max_years) >= Number(d.experience_min_years), { path: ["experience_max_years"], message: "Maximum must be at least the minimum" });
type Values = z.infer<typeof schema>;

const s = (v: number | null | undefined) => (v == null ? "" : String(v));
const n = (v: string) => (v.trim() === "" ? null : Number(v));
const toValues = (t: EffectiveJobTemplate | null | undefined): Values => ({
  summary: t?.summary ?? "", description: t?.description ?? "", requirements: t?.requirements ?? "", benefits: t?.benefits ?? "",
  hr_notes: t?.hr_notes ?? "", employment_type: t?.employment_type ?? "full_time",
  experience_min_years: s(t?.experience_min_years), experience_max_years: s(t?.experience_max_years),
  salary_min: s(t?.salary_min), salary_max: s(t?.salary_max), salary_period: t?.salary_period ?? "monthly", show_salary: t?.show_salary ?? false,
});
const toContent = (v: Values): JobTemplateContent => ({
  summary: v.summary, description: v.description, requirements: v.requirements, benefits: v.benefits, hr_notes: v.hr_notes,
  employment_type: v.employment_type, experience_min_years: n(v.experience_min_years), experience_max_years: n(v.experience_max_years),
  salary_min: n(v.salary_min), salary_max: n(v.salary_max), salary_period: v.salary_period, show_salary: v.show_salary,
});

function Field({ label, error, hint, htmlFor, children }: { label: string; error?: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function TemplateStatus({ t }: { t: EffectiveJobTemplate | undefined }) {
  if (!t) return <StatusPill tone="warning">No template</StatusPill>;
  return t.source === "edited" ? <StatusPill tone="primary">Edited</StatusPill> : <StatusPill tone="neutral">Default</StatusPill>;
}

function TemplateEditor({ designation, template, canManage, onClose }: {
  designation: TemplateDesignation; template: EffectiveJobTemplate | undefined; canManage: boolean; onClose: () => void;
}) {
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(template) });
  const { register, control, handleSubmit, formState, reset } = form;

  const save = useAtsMutation(async (v: Values) => saveJobTemplate(designation.id, toContent(v)), {
    invalidate: () => [jobTemplateKeys.rows], success: "Template saved", onSuccess: () => { reset(form.getValues()); onClose(); },
  });
  const restore = useAtsMutation(async () => deleteJobTemplate(designation.id), {
    invalidate: () => [jobTemplateKeys.rows], success: template?.hasDefault ? "Default restored" : "Template removed",
    onSuccess: () => { setConfirmReset(false); onClose(); },
  });

  const e = formState.errors;
  const busy = save.isPending || restore.isPending;
  const requestClose = () => (formState.isDirty && !busy ? setConfirmClose(true) : onClose());
  const edited = template?.source === "edited";

  return (
    <>
      <ResponsiveDialog
        open
        onOpenChange={(o) => (!o ? requestClose() : undefined)}
        title={`${designation.title} template`}
        description={canManage ? "Fills in new jobs for this designation. HR can still change anything in a job, and existing jobs keep their own text." : "Only HR admins can change job templates."}
        contentClassName="md:w-[calc(100vw-3rem)] md:max-w-6xl"
        focusContainer
        footer={
          <>
            {canManage && edited && (
              <Button type="button" variant="ghost" className="gap-1.5 sm:mr-auto" disabled={busy} onClick={() => setConfirmReset(true)}>
                <RotateCcw className="h-4 w-4" aria-hidden /> {template?.hasDefault ? "Restore default" : "Remove template"}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={requestClose}>{canManage ? "Cancel" : "Close"}</Button>
            {canManage && <Button type="submit" form="ats-template-form" disabled={busy || !formState.isDirty}>Save template</Button>}
          </>
        }
      >
        <form id="ats-template-form" noValidate onSubmit={handleSubmit((v) => save.mutate(v))}>
          <fieldset disabled={busy} className="m-0 grid min-w-0 grid-cols-1 gap-6 border-0 p-0 pb-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-x-8">
            <section className="min-w-0 space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground">Pay and experience</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Employment type">
                    <Controller control={control} name="employment_type" render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange} disabled={!canManage}>
                        <SelectTrigger className="text-foreground" aria-label="Employment type"><SelectValue /></SelectTrigger>
                        <SelectContent>{EMPLOYMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                      </Select>
                    )} />
                  </Field>
                </div>
                <Field label="Salary min (₹)" error={e.salary_min?.message} htmlFor="tpl-salary-min">
                  <Input id="tpl-salary-min" type="number" inputMode="decimal" min={0} readOnly={!canManage} className="text-foreground" {...register("salary_min")} />
                </Field>
                <Field label="Salary max (₹)" error={e.salary_max?.message} htmlFor="tpl-salary-max">
                  <Input id="tpl-salary-max" type="number" inputMode="decimal" min={0} readOnly={!canManage} className="text-foreground" {...register("salary_max")} />
                </Field>
                <Field label="Salary period">
                  <Controller control={control} name="salary_period" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={!canManage}>
                      <SelectTrigger className="text-foreground" aria-label="Salary period"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="annual">Annual</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </Field>
                <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 sm:mt-6">
                  <Label htmlFor="tpl-show-salary" className="font-normal">Show salary on careers page</Label>
                  <Controller control={control} name="show_salary" render={({ field }) => (
                    <Switch id="tpl-show-salary" checked={field.value} onCheckedChange={field.onChange} disabled={!canManage} />
                  )} />
                </div>
                <Field label="Experience min (years)" error={e.experience_min_years?.message} htmlFor="tpl-exp-min">
                  <Input id="tpl-exp-min" type="number" inputMode="decimal" min={0} max={50} step={0.5} readOnly={!canManage} className="text-foreground" {...register("experience_min_years")} />
                </Field>
                <Field label="Experience max (years)" error={e.experience_max_years?.message} htmlFor="tpl-exp-max">
                  <Input id="tpl-exp-max" type="number" inputMode="decimal" min={0} max={50} step={0.5} readOnly={!canManage} className="text-foreground" {...register("experience_max_years")} />
                </Field>
              </div>
              <div className="border-t border-border pt-4">
                <Field label="Hiring brief (HR only)" error={e.hr_notes?.message} htmlFor="tpl-hr-notes" hint="Shown to HR when they create or open a job for this designation. Never shown to candidates.">
                  <Controller control={control} name="hr_notes" render={({ field }) => <JobDetailsInput {...field} readOnly={!canManage} id="tpl-hr-notes" label="Hiring brief" rows={12} invalid={!!e.hr_notes} />} />
                </Field>
              </div>
            </section>

            <section className="min-w-0 space-y-3 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <h3 className="text-xs font-semibold text-muted-foreground">Job details (shown on the careers page)</h3>
              <div className="grid min-w-0 grid-cols-1 gap-5">
                <Field label="Summary" error={e.summary?.message} htmlFor="tpl-summary" hint="One or two sentences at the top of the job page. Up to 500 characters.">
                  <Controller control={control} name="summary" render={({ field }) => <JobDetailsInput {...field} readOnly={!canManage} id="tpl-summary" label="Summary" rows={3} invalid={!!e.summary} />} />
                </Field>
                <Field label="Description" error={e.description?.message} htmlFor="tpl-description" hint="Shown as “About the role”. A short line on its own above bullets becomes a heading.">
                  <Controller control={control} name="description" render={({ field }) => <JobDetailsInput {...field} readOnly={!canManage} id="tpl-description" label="Description" rows={12} invalid={!!e.description} />} />
                </Field>
                <Field label="Requirements" error={e.requirements?.message} htmlFor="tpl-requirements" hint="The first three points also appear on the job's card on the careers page.">
                  <Controller control={control} name="requirements" render={({ field }) => <JobDetailsInput {...field} readOnly={!canManage} id="tpl-requirements" label="Requirements" rows={10} invalid={!!e.requirements} />} />
                </Field>
                <Field label="Notes" error={e.benefits?.message} htmlFor="tpl-benefits" hint="Pay, benefits and joining terms candidates should know. Shown as “Good to know”.">
                  <Controller control={control} name="benefits" render={({ field }) => <JobDetailsInput {...field} readOnly={!canManage} id="tpl-benefits" label="Notes" rows={8} invalid={!!e.benefits} />} />
                </Field>
              </div>
            </section>
          </fieldset>
        </form>
      </ResponsiveDialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>Your unsaved changes to this template will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmClose(false); onClose(); }}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{template?.hasDefault ? "Restore the default template?" : "Remove this template?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {template?.hasDefault
                ? `HR's version of the ${designation.title} template is deleted and new jobs fill from the Compendium default again. Existing jobs keep their text.`
                : `New ${designation.title} jobs will no longer be filled in. Existing jobs keep their text.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(ev) => { ev.preventDefault(); restore.mutate(undefined); }} disabled={restore.isPending}>
              {template?.hasDefault ? "Restore default" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** ATS › Settings › Job templates: the pre-filled job details per designation. */
export function JobTemplatesSection() {
  const [sp, setSp] = useSearchParams();
  const canManage = useCanManageAtsSettings().data === true;
  const designations = useTemplateDesignations();
  const depts = useDepartmentsLookup();
  const templates = useJobTemplates();
  const [q, setQ] = useState("");
  const openId = sp.get("designation");
  const setOpenId = (id: string | null) => {
    const next = new URLSearchParams(sp);
    if (id) next.set("designation", id); else next.delete("designation");
    setSp(next, { replace: true });
  };

  const groups = useMemo(() => {
    const deptName = new Map((depts.data ?? []).map((d) => [d.id, d.label] as const));
    const needle = q.trim().toLowerCase();
    const list = (designations.data ?? []).filter((d) => !needle || d.title.toLowerCase().includes(needle));
    const by = new Map<string, TemplateDesignation[]>();
    for (const d of list) {
      const key = (d.department_id && deptName.get(d.department_id)) || "No department";
      by.set(key, [...(by.get(key) ?? []), d]);
    }
    return [...by.entries()]
      .sort(([a], [b]) => (a === "No department" ? 1 : b === "No department" ? -1 : a.localeCompare(b)))
      .map(([name, rows]) => ({ name, rows: rows.sort((a, b) => (a.hierarchy_level ?? 99) - (b.hierarchy_level ?? 99) || a.title.localeCompare(b.title)) }));
  }, [designations.data, depts.data, q]);

  const counts = useMemo(() => {
    const all = designations.data ?? [];
    const edited = all.filter((d) => templates.map.get(d.id)?.source === "edited").length;
    const withTemplate = all.filter((d) => templates.map.has(d.id)).length;
    return { total: all.length, edited, missing: all.length - withTemplate };
  }, [designations.data, templates.map]);

  const loading = designations.isLoading || templates.isLoading || depts.isLoading;
  // Only a failure with nothing loaded hides the list; a failed background refresh keeps showing what is cached.
  const error = designations.isError && !designations.data ? designations.error
    : templates.isError ? templates.error
    : depts.isError && !depts.data ? depts.error : null;
  const editing = openId ? (designations.data ?? []).find((d) => d.id === openId) : undefined;

  return (
    <SectionCard
      title="Job templates"
      description="When HR picks a designation for a new job, its summary, description, requirements, notes, pay and experience fill in from here. Templates start from the JD Compendium v4.2."
    >
      {loading ? <RowsSkeleton rows={8} /> : error ? (
        <QueryError error={error} onRetry={() => { void designations.refetch(); templates.refetch(); void depts.refetch(); }} />
      ) : !(designations.data ?? []).length ? (
        <EmptyState icon={FileText} title="No designations yet" description="Add designations in HRMS › Organization first." className="py-8" />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Search designations" aria-label="Search designations" className="pl-8 text-foreground" />
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {counts.total} designations · {counts.edited} edited by HR · {counts.missing} without a template
            </p>
          </div>
          {!groups.length && <p className="py-6 text-center text-sm text-muted-foreground">No designation matches “{q.trim()}”.</p>}
          {groups.map((g) => (
            <div key={g.name}>
              <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">{g.name}</h3>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {g.rows.map((d) => {
                  const t = templates.map.get(d.id);
                  return (
                    <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                          <span className="min-w-0 break-words">{d.title}</span>
                          {gradeLabel(d.hierarchy_level) && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{gradeLabel(d.hierarchy_level)}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{t ? templateSourceText(t) : "No template yet: new jobs for this designation start blank."}</p>
                      </div>
                      <TemplateStatus t={t} />
                      <Button type="button" size="sm" variant="outline" onClick={() => setOpenId(d.id)} aria-label={`${canManage ? (t ? "Edit" : "Create") : "View"} the ${d.title} template`}>
                        {canManage ? (t ? "Edit" : "Create") : "View"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      {editing && templates.ready && (
        <TemplateEditor key={editing.id} designation={editing} template={templates.map.get(editing.id)} canManage={canManage} onClose={() => setOpenId(null)} />
      )}
    </SectionCard>
  );
}
