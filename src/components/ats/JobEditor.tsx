import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChipInput, MultiSelect } from "./AtsBits";
import { JobDetailsInput, Req } from "./AtsUi";
import {
  type AtsJob, atsKeys, createJob, jobKeys, updateJob, useAtsMutation, useAtsSettings, useDepartmentsLookup,
  useEmployeesLookup, usePositionsLookup, useRequirementsLookup, useShiftsLookup,
} from "@/lib/ats/api";
import { EMPLOYMENT_TYPES, humanize } from "@/lib/ats/format";

const NONE = "__none";
const optNum = (min: number, max: number, label: string) =>
  z.string().trim().refine((v) => v === "" || (!isNaN(Number(v)) && Number(v) >= min && Number(v) <= max), `${label} must be between ${min} and ${max}`);

const schema = z
  .object({
    title: z.string().trim().min(2, "Title must be at least 2 characters").max(120, "Title must be 120 characters or fewer"),
    department_id: z.string(),
    position_id: z.string(),
    employment_type: z.enum(["full_time", "part_time", "contract", "internship", "trainee"]),
    location: z.string().max(200),
    openings: z.string().trim().refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 500, "Openings must be a whole number from 1 to 500"),
    shift_ids: z.array(z.string()),
    hiring_manager_employee_id: z.string(),
    target_close_date: z.string(),
    salary_min: optNum(0, 9999999999, "Salary"),
    salary_max: optNum(0, 9999999999, "Salary"),
    salary_period: z.enum(["monthly", "annual"]),
    show_salary: z.boolean(),
    experience_min_years: optNum(0, 50, "Experience").refine((v) => v === "" || Number(v) * 2 === Math.round(Number(v) * 2), "Use steps of 0.5"),
    experience_max_years: optNum(0, 50, "Experience").refine((v) => v === "" || Number(v) * 2 === Math.round(Number(v) * 2), "Use steps of 0.5"),
    summary: z.string().max(500),
    description: z.string().max(20000, "Keep this under 20,000 characters."),
    requirements: z.string().max(20000, "Keep this under 20,000 characters."),
    benefits: z.string().max(20000, "Keep this under 20,000 characters."),
    aliases: z.array(z.string()),
    requisition_id: z.string(),
  })
  .refine((d) => d.salary_min === "" || d.salary_max === "" || Number(d.salary_max) >= Number(d.salary_min), {
    path: ["salary_max"], message: "Maximum must be at least the minimum",
  })
  .refine((d) => d.experience_min_years === "" || d.experience_max_years === "" || Number(d.experience_max_years) >= Number(d.experience_min_years), {
    path: ["experience_max_years"], message: "Maximum must be at least the minimum",
  });
type FormValues = z.infer<typeof schema>;

const s = (v: unknown) => (v == null ? "" : String(v));
const toForm = (j: AtsJob | null | undefined, defLocation: string): FormValues => ({
  title: j?.title ?? "",
  department_id: j?.department_id ?? "",
  position_id: j?.position_id ?? "",
  employment_type: (j?.employment_type as FormValues["employment_type"]) ?? "full_time",
  location: j ? j.location ?? "" : defLocation,
  openings: s(j?.openings ?? 1),
  shift_ids: j?.shift_ids ?? [],
  hiring_manager_employee_id: j?.hiring_manager_employee_id ?? "",
  target_close_date: j?.target_close_date ?? "",
  salary_min: s(j?.salary_min),
  salary_max: s(j?.salary_max),
  salary_period: (j?.salary_period as "monthly" | "annual") ?? "monthly",
  show_salary: j?.show_salary ?? false,
  experience_min_years: s(j?.experience_min_years),
  experience_max_years: s(j?.experience_max_years),
  summary: j?.summary ?? "",
  description: j?.description ?? "",
  requirements: j?.requirements ?? "",
  benefits: j?.benefits ?? "",
  aliases: j?.aliases ?? [],
  requisition_id: j?.requisition_id ?? "",
});

const nn = (v: string) => (v.trim() === "" ? null : v.trim());
const num = (v: string) => (v.trim() === "" ? null : Number(v));

function toPayload(v: FormValues) {
  return {
    title: v.title.trim(),
    department_id: nn(v.department_id),
    position_id: nn(v.position_id),
    employment_type: v.employment_type,
    location: nn(v.location),
    openings: Number(v.openings),
    shift_ids: v.shift_ids,
    hiring_manager_employee_id: nn(v.hiring_manager_employee_id),
    target_close_date: nn(v.target_close_date),
    salary_min: num(v.salary_min),
    salary_max: num(v.salary_max),
    salary_period: v.salary_period,
    show_salary: v.show_salary,
    experience_min_years: num(v.experience_min_years),
    experience_max_years: num(v.experience_max_years),
    summary: nn(v.summary),
    description: nn(v.description),
    requirements: nn(v.requirements),
    benefits: nn(v.benefits),
    aliases: v.aliases,
    requisition_id: nn(v.requisition_id),
  };
}

function Field({ label, error, children, hint, htmlFor }: { label: React.ReactNode; error?: string; children: React.ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function LookupSelect({ value, onChange, options, placeholder, disabled }: { value: string; onChange: (v: string) => void; options: { id: string; label: string }[]; placeholder: string; disabled?: boolean }) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)} disabled={disabled}>
      <SelectTrigger className="text-foreground"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function JobEditor({ open, job, onClose, initialRequirementId }: { open: boolean; job: AtsJob | null; onClose: () => void; initialRequirementId?: string | null }) {
  const navigate = useNavigate();
  const isEdit = !!job;
  const settings = useAtsSettings();
  const depts = useDepartmentsLookup();
  const positions = usePositionsLookup();
  const shifts = useShiftsLookup();
  const employees = useEmployeesLookup();
  const reqs = useRequirementsLookup();
  const mode = useRef<"draft" | "open">("draft");
  const [confirmClose, setConfirmClose] = useState(false);

  const defLocation = settings.data?.default_location ?? "";
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toForm(job, defLocation) });
  const { register, control, handleSubmit, formState, watch, setValue, getValues, reset } = form;

  useEffect(() => {
    if (open) reset(toForm(job, defLocation));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, job?.id]);
  useEffect(() => {
    if (open && !isEdit && !getValues("location") && defLocation && !formState.dirtyFields.location) setValue("location", defLocation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defLocation, open]);

  const deptId = watch("department_id");
  const posOptions = useMemo(
    () => (positions.data ?? []).filter((p) => !deptId || p.department_id === deptId),
    [positions.data, deptId],
  );

  const reqOptions = useMemo(
    () =>
      (reqs.data ?? []).map((r: any) => {
        const pos = positions.data?.find((p) => p.id === r.position_id)?.label;
        return { id: r.id, raw: r, label: [r.requirement_no, pos, `${r.number_required ?? 0} needed`].filter(Boolean).join(" · "), status: humanize(String(r.status ?? "")) };
      }),
    [reqs.data, positions.data],
  );

  const setIfEmpty = (k: keyof FormValues, v: any) => {
    const cur = getValues(k) as any;
    const empty = cur == null || cur === "" || (Array.isArray(cur) && cur.length === 0);
    if (empty && v != null && v !== "" && !(Array.isArray(v) && v.length === 0)) setValue(k, v, { shouldDirty: true, shouldValidate: true });
  };

  const applyRequirement = (id: string) => {
    setValue("requisition_id", id, { shouldDirty: true });
    const r = reqOptions.find((o) => o.id === id)?.raw;
    if (!r) return;
    setIfEmpty("department_id", r.department_id ?? "");
    setIfEmpty("position_id", r.position_id ?? "");
    setIfEmpty("location", r.location ?? "");
    const et = String(r.employment_type ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (EMPLOYMENT_TYPES.some((t) => t.value === et) && !formState.dirtyFields.employment_type && !isEdit) setValue("employment_type", et as any, { shouldDirty: true });
    if (getValues("openings") === "1" || getValues("openings") === "") {
      setValue("openings", String(Math.max((r.number_required ?? 0) - (r.positions_filled ?? 0), 1)), { shouldDirty: true });
    }
    setIfEmpty("salary_min", r.salary_min != null ? String(r.salary_min) : "");
    setIfEmpty("salary_max", r.salary_max != null ? String(r.salary_max) : "");
    setIfEmpty("shift_ids", r.shift_id ? [r.shift_id] : []);
    const reqText = [r.required_skills?.trim(), r.experience_required?.trim() ? `Experience: ${r.experience_required.trim()}` : null].filter(Boolean).join("\n");
    setIfEmpty("requirements", reqText);
    const pos = positions.data?.find((p) => p.id === r.position_id);
    if (pos) setIfEmpty("title", pos.label);
  };

  // Opened from Workforce Planning ("Create ATS job"): pre-select the requirement once its options have loaded.
  const appliedReq = useRef<string | null>(null);
  useEffect(() => {
    if (!open) { appliedReq.current = null; return; }
    if (isEdit || !initialRequirementId || appliedReq.current === initialRequirementId) return;
    if (!reqOptions.some((o) => o.id === initialRequirementId) || !positions.data) return;
    appliedReq.current = initialRequirementId;
    applyRequirement(initialRequirementId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, initialRequirementId, reqOptions, positions.data]);

  const save = useAtsMutation(
    async (v: FormValues) => {
      const payload = toPayload(v);
      if (isEdit) return updateJob({ id: job!.id, patch: payload });
      return createJob({ ...payload, status: mode.current === "open" ? "open" : "draft" });
    },
    {
      invalidate: () => jobKeys(job?.id),
      success: isEdit ? "Job updated" : () => (mode.current === "open" ? "Job created and opened" : "Draft saved"),
      onSuccess: (data) => {
        reset(getValues());
        onClose();
        if (!isEdit && data?.id) navigate(`/hrms/ats/jobs/${data.id}`);
      },
    },
  );

  const requestClose = () => (formState.isDirty && !save.isPending ? setConfirmClose(true) : onClose());
  const e = formState.errors;

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={(o) => (!o ? requestClose() : undefined)}
        title={isEdit ? "Edit job" : "New job"}
        description={isEdit ? undefined : "Fill in the basics now; you can add the rest later."}
        contentClassName="md:max-w-6xl"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={requestClose}>Cancel</Button>
            {isEdit ? (
              <Button type="submit" form="ats-job-form" disabled={save.isPending}>Save changes</Button>
            ) : (
              <>
                <Button type="submit" form="ats-job-form" variant="outline" disabled={save.isPending} onClick={() => (mode.current = "draft")}>Save as draft</Button>
                <Button type="submit" form="ats-job-form" disabled={save.isPending} onClick={() => (mode.current = "open")}>Save and open</Button>
              </>
            )}
          </>
        }
      >
        <form id="ats-job-form" noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="grid min-w-0 grid-cols-1 gap-6 pb-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-x-8">
          <section className="min-w-0 space-y-3 lg:col-start-1">
            <h3 className="text-xs font-semibold text-muted-foreground">Basics</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label={<>Title<Req /></>} error={e.title?.message} htmlFor="ats-title">
                  <Input id="ats-title" autoFocus className="text-foreground" {...register("title")} />
                </Field>
              </div>
              <Field label="Department">
                <Controller control={control} name="department_id" render={({ field }) => (
                  <LookupSelect value={field.value} placeholder="No department" options={depts.data ?? []}
                    onChange={(v) => {
                      field.onChange(v);
                      const p = getValues("position_id");
                      if (v && p && positions.data?.find((x) => x.id === p)?.department_id !== v) setValue("position_id", "", { shouldDirty: true });
                    }} />
                )} />
              </Field>
              <Field label="Position">
                <Controller control={control} name="position_id" render={({ field }) => (
                  <LookupSelect value={field.value} placeholder="No position" options={posOptions}
                    onChange={(v) => {
                      field.onChange(v);
                      const pos = positions.data?.find((x) => x.id === v);
                      if (pos && !getValues("title").trim()) setValue("title", pos.label, { shouldDirty: true, shouldValidate: true });
                    }} />
                )} />
              </Field>
              <Field label="Employment type">
                <Controller control={control} name="employment_type" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent>{EMPLOYMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </Field>
              <Field label="Location" error={e.location?.message}>
                <Input className="text-foreground" {...register("location")} />
              </Field>
              <Field label={<>Openings<Req /></>} error={e.openings?.message}>
                <Input type="number" inputMode="numeric" min={1} max={500} step={1} className="text-foreground" {...register("openings")} />
              </Field>
              <Field label="Target close date">
                <Input type="date" className="text-foreground" {...register("target_close_date")} />
              </Field>
              <Field label="Shifts">
                <Controller control={control} name="shift_ids" render={({ field }) => (
                  <MultiSelect value={field.value} onChange={field.onChange} options={shifts.data ?? []} placeholder="Any shift" />
                )} />
              </Field>
              <Field label="Hiring manager">
                <Controller control={control} name="hiring_manager_employee_id" render={({ field }) => (
                  <LookupSelect value={field.value} onChange={field.onChange} options={employees.data ?? []} placeholder="No hiring manager" />
                )} />
              </Field>
            </div>
          </section>

          <section className="min-w-0 space-y-3 border-t border-border pt-5 lg:col-start-1">
            <h3 className="text-xs font-semibold text-muted-foreground">Pay and experience</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Salary min (₹)" error={e.salary_min?.message}>
                <Input type="number" inputMode="decimal" min={0} className="text-foreground" {...register("salary_min")} />
              </Field>
              <Field label="Salary max (₹)" error={e.salary_max?.message}>
                <Input type="number" inputMode="decimal" min={0} className="text-foreground" {...register("salary_max")} />
              </Field>
              <Field label="Salary period">
                <Controller control={control} name="salary_period" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </Field>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 sm:mt-6">
                <Label htmlFor="ats-show-salary" className="font-normal">Show salary on careers page</Label>
                <Controller control={control} name="show_salary" render={({ field }) => (
                  <Switch id="ats-show-salary" checked={field.value} onCheckedChange={field.onChange} />
                )} />
              </div>
              <Field label="Experience min (years)" error={e.experience_min_years?.message}>
                <Input type="number" inputMode="decimal" min={0} max={50} step={0.5} className="text-foreground" {...register("experience_min_years")} />
              </Field>
              <Field label="Experience max (years)" error={e.experience_max_years?.message}>
                <Input type="number" inputMode="decimal" min={0} max={50} step={0.5} className="text-foreground" {...register("experience_max_years")} />
              </Field>
            </div>
          </section>

          <section className="min-w-0 space-y-3 border-t border-border pt-5 lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <h3 className="text-xs font-semibold text-muted-foreground">Job details</h3>
            <div className="grid min-w-0 grid-cols-1 gap-5">
              <div>
                <Field label="Summary" error={e.summary?.message} htmlFor="ats-summary">
                  <Controller control={control} name="summary" render={({ field }) => <JobDetailsInput {...field} id="ats-summary" label="Summary" rows={3} invalid={!!e.summary} />} />
                </Field>
              </div>
              {(["description", "requirements", "benefits"] as const).map((key) => {
                const label = key === "benefits" ? "Notes" : key[0].toUpperCase() + key.slice(1);
                return <Field key={key} label={label} error={e[key]?.message} htmlFor={`ats-${key}`}>
                  <Controller control={control} name={key} render={({ field }) => <JobDetailsInput {...field} id={`ats-${key}`} label={label} rows={key === "benefits" ? 5 : 8} invalid={!!e[key]} />} />
                </Field>;
              })}
              <Field label="Alternative titles" hint="Other names candidates may use for this job. Careers-page applications and imported rows with one of these names are filed under this job.">
                <Controller control={control} name="aliases" render={({ field }) => (
                  <ChipInput value={field.value} onChange={(v) => field.onChange(v)} placeholder="Type and press Enter" />
                )} />
              </Field>
            </div>
          </section>

          <section className="min-w-0 space-y-3 border-t border-border pt-5 lg:col-start-1">
            <h3 className="text-xs font-semibold text-muted-foreground">Hiring requirement (optional)</h3>
            <Controller control={control} name="requisition_id" render={({ field }) => (
              <Select value={field.value || NONE} onValueChange={(v) => (v === NONE ? field.onChange("") : applyRequirement(v))}>
                <SelectTrigger className="text-foreground"><SelectValue placeholder="Not linked" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not linked</SelectItem>
                  {reqOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      <span>{o.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{o.status}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )} />
            <p className="text-xs text-muted-foreground">Choosing one fills in the fields that are still empty and sets Openings to the number still needed.</p>
          </section>
        </form>
      </ResponsiveDialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>Your unsaved changes to this job will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmClose(false); reset(toForm(job, defLocation)); onClose(); }}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export { atsKeys };
