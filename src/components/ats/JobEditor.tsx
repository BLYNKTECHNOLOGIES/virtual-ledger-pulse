import { useEffect, useMemo, useRef, useState } from "react";
import { usePositionPlanningStatus, roleBlocksHiring, ROLE_NOT_PLANNED_MESSAGE } from "@/hooks/hrms/useWorkforcePlanning";
import { useForm, useWatch, Controller, type Control } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { FileText } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidatePlanning } from "@/hooks/hrms/useWorkforcePlanning";
import { requirementFitsJob } from "@/lib/ats/requirementOptions";
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
  type AtsJob, atsKeys, jobKeys, useAtsMutation, useAtsSettings, useCanManageAtsSettings, useDepartmentsLookup,
  useEmployeesLookup, usePositionsLookup, useRequirementsLookup, useShiftsLookup,
} from "@/lib/ats/api";
import { EMPLOYMENT_TYPES, humanize } from "@/lib/ats/format";
import { JobLineShiftNotice } from "./JobLineShiftNotice";
import { RequirementLinkEditor } from "./RequirementLinkEditor";
import { saveJobWithLinks, useJobRequirementLinks } from "@/lib/ats/jobRequirements";
import { ApplicationFormEditor } from "./ApplicationFormEditor";
import { type ApplicationForm, effectiveForm } from "@/lib/ats/forms";
import { HiringBrief, TemplateSourceLine } from "./JobTemplateBits";
import {
  type EffectiveJobTemplate, type TemplateFormKey, type TemplateFormValues, TEMPLATE_FIELD_LABELS, planTemplateFill, templateFormValues,
  textDiffersFromTemplate, useJobTemplates,
} from "@/lib/ats/jobTemplates";

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
    is_published: z.boolean(),
    experience_min_years: optNum(0, 50, "Experience").refine((v) => v === "" || Number(v) * 2 === Math.round(Number(v) * 2), "Use steps of 0.5"),
    experience_max_years: optNum(0, 50, "Experience").refine((v) => v === "" || Number(v) * 2 === Math.round(Number(v) * 2), "Use steps of 0.5"),
    summary: z.string().max(500),
    description: z.string().max(20000, "Keep this under 20,000 characters."),
    requirements: z.string().max(20000, "Keep this under 20,000 characters."),
    benefits: z.string().max(20000, "Keep this under 20,000 characters."),
    aliases: z.array(z.string()),
    requisition_id: z.string(),
    application_form: z.custom<ApplicationForm>(),
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
  is_published: j?.is_published ?? false,
  experience_min_years: s(j?.experience_min_years),
  experience_max_years: s(j?.experience_max_years),
  summary: j?.summary ?? "",
  description: j?.description ?? "",
  requirements: j?.requirements ?? "",
  benefits: j?.benefits ?? "",
  aliases: j?.aliases ?? [],
  requisition_id: j?.requisition_id ?? "",
  application_form: effectiveForm((j as any)?.application_form ?? null),
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
    is_published: v.is_published,
    experience_min_years: num(v.experience_min_years),
    experience_max_years: num(v.experience_max_years),
    summary: nn(v.summary),
    description: nn(v.description),
    requirements: nn(v.requirements),
    benefits: nn(v.benefits),
    aliases: v.aliases,
    requisition_id: nn(v.requisition_id),
    application_form: effectiveForm(v.application_form) as any,
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

function LookupSelect({ value, onChange, options, placeholder, disabled }: { value: string; onChange: (v: string) => void; options: { id: string; label: string; disabled?: boolean; hint?: string }[]; placeholder: string; disabled?: boolean }) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)} disabled={disabled}>
      <SelectTrigger className="text-foreground"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {options.map((o) => <SelectItem key={o.id} value={o.id} disabled={o.disabled} title={o.hint}>{o.label}{o.disabled ? " · Plan first" : ""}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** What a template fill left alone, shown under "Job details". */
type FillNotice = { typed: TemplateFormKey[]; fromRequirement: TemplateFormKey[] };
const fieldList = (keys: TemplateFormKey[]) => keys.map((k) => TEMPLATE_FIELD_LABELS[k]).join(", ");
const inr = (v: string) => `₹${Number(v).toLocaleString("en-IN")}`;
/**
 * Notes that quote one pay figure next to a different salary would show candidates two salaries. Checked as HR types,
 * so it covers every route: a fill that kept HR's pay, "Fill from template" on an existing job, or a manual edit.
 */
function payMismatch(notes: string, min: string, max: string): string | null {
  const quoted = notes.match(/₹\s?[\d,]+/)?.[0]?.replace(/\s/g, "");
  const lo = min.trim(), hi = max.trim();
  if (!quoted || (lo === "" && hi === "") || [lo, hi].some((v) => v !== "" && !Number.isFinite(Number(v)))) return null;
  if (quoted === inr(lo !== "" ? lo : hi)) return null;
  const pay = [lo, hi].filter((v) => v !== "").map(inr).join("–");
  return `The Notes mention ${quoted}, but this job's salary is ${pay}. Check that they match before you publish.`;
}

/**
 * The "Job details" header: the template in use, what a fill left alone, and "Fill from template".
 * It watches the four text fields itself, so typing in them re-renders only this panel, not the whole editor.
 */
function TemplatePanel({ control, template, templatesReady, templatesFailed, onRetry, posId, posLabel, isEdit, notice, canEditTemplates, onReplace }: {
  control: Control<FormValues>; template: EffectiveJobTemplate | null; templatesReady: boolean; templatesFailed: boolean; onRetry: () => void;
  posId: string; posLabel: string | null; isEdit: boolean; notice: FillNotice | null; canEditTemplates: boolean; onReplace: () => void;
}) {
  const text = useWatch({ control, name: ["summary", "description", "requirements", "benefits", "salary_min", "salary_max"] });
  const [confirm, setConfirm] = useState(false);
  const current = { summary: text[0] ?? "", description: text[1] ?? "", requirements: text[2] ?? "", benefits: text[3] ?? "" };
  const differs = !!template && textDiffersFromTemplate(current, template);
  const hasOwnText = Object.values(current).some((v) => v.trim() !== "");
  const mismatch = payMismatch(current.benefits, text[4] ?? "", text[5] ?? "");
  const showNotice = !!template && !!notice && (notice.typed.length > 0 || notice.fromRequirement.length > 0);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground">Job details</h3>
        {template && differs && (
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => (hasOwnText ? setConfirm(true) : onReplace())}>
            <FileText className="h-3.5 w-3.5" aria-hidden /> Fill from template
          </Button>
        )}
      </div>
      <div role="status" aria-live="polite" className="space-y-2">
        {template ? (
          <>
            <TemplateSourceLine template={template} designation={posLabel} newTab canEdit={canEditTemplates} />
            {showNotice && (
              <div className="space-y-1 rounded-md border border-warning/40 bg-warning/5 px-2.5 py-1.5 text-xs text-foreground">
                {notice!.typed.length > 0 && <p>Kept what you had already entered in {fieldList(notice!.typed)}.</p>}
                {notice!.fromRequirement.length > 0 && <p>Kept the hiring request's {fieldList(notice!.fromRequirement)}.</p>}
                {differs && <p>Use “Fill from template” to replace the text.</p>}
              </div>
            )}
            {mismatch && <p className="rounded-md border border-warning/40 bg-warning/5 px-2.5 py-1.5 text-xs text-foreground">{mismatch}</p>}
          </>
        ) : templatesFailed ? (
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>Couldn't load the job templates, so nothing was filled in.</span>
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onRetry}>Try again</Button>
          </p>
        ) : posId && !templatesReady ? (
          <p className="text-xs text-muted-foreground">Loading the template…</p>
        ) : posId ? (
          <p className="text-xs text-muted-foreground">No template for this designation yet. HR admins can add one in Settings › Job templates.</p>
        ) : (
          <p className="text-xs text-muted-foreground">Pick a designation to fill these details from its template.</p>
        )}
      </div>
      {template && <HiringBrief template={template} designation={posLabel} />}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the job details?</AlertDialogTitle>
            <AlertDialogDescription>
              Summary, Description, Requirements and Notes are replaced with the {posLabel ?? "designation"} template's text.{" "}
              {isEdit ? "Pay, experience and employment type stay as they are." : "Pay, experience and employment type change only where you haven't set them."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my text</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirm(false); onReplace(); }}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function JobEditor({ open, job, onClose, initialRequirementId }: { open: boolean; job: AtsJob | null; onClose: () => void; initialRequirementId?: string | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = !!job;
  const settings = useAtsSettings();
  const depts = useDepartmentsLookup();
  const positions = usePositionsLookup();
  const shifts = useShiftsLookup();
  const employees = useEmployeesLookup();
  const reqs = useRequirementsLookup();
  const mode = useRef<"draft" | "open">("draft");
  const [confirmClose, setConfirmClose] = useState(false);
  const reqLinks = useJobRequirementLinks(job?.id);
  const [extraReqIds, setExtraReqIds] = useState<string[]>([]);
  useEffect(() => { if (open) setExtraReqIds(reqLinks.data ?? []); }, [open, job?.id, reqLinks.data]);

  const defLocation = settings.data?.default_location ?? "";
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toForm(job, defLocation) });
  const { register, control, handleSubmit, formState, watch, setValue, getValues, reset } = form;

  // Which fields a hiring request filled, and the title the form set itself; both start over when the editor opens.
  const reqFilled = useRef(new Set<string>());
  const autoTitle = useRef("");
  useEffect(() => {
    if (!open) return;
    reset(toForm(job, defLocation));
    reqFilled.current = new Set();
    autoTitle.current = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, job?.id]);
  useEffect(() => {
    if (open && !isEdit && !getValues("location") && defLocation && !formState.dirtyFields.location) setValue("location", defLocation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defLocation, open]);

  const deptId = watch("department_id");
  // Roles in workforce planning with no staffing line can't be hired for (the database refuses too).
  const planning = usePositionPlanningStatus(open);
  const posOptions = useMemo(
    () => (positions.data ?? []).filter((p) => !deptId || p.department_id === deptId).map((p) => {
      const blocked = roleBlocksHiring(planning.data?.get(p.id)?.status) && p.id !== job?.position_id;
      return { ...p, disabled: blocked, hint: blocked ? ROLE_NOT_PLANNED_MESSAGE(p.label) : undefined };
    }),
    [positions.data, deptId, planning.data, job?.position_id],
  );

  const posId = watch("position_id");
  const primaryWatch = watch("requisition_id");
  // Only requirements of this job's department and role (any role of the requirement's line);
  // requirements already linked stay listed so a picker never loses its value.
  const reqOptions = useMemo(
    () =>
      (reqs.data ?? []).filter((r: any) => requirementFitsJob(r, deptId, posId) || r.id === primaryWatch || extraReqIds.includes(r.id)).map((r: any) => {
        const pos = positions.data?.find((p) => p.id === r.position_id)?.label;
        return { id: r.id, raw: r, label: [r.requirement_no, pos, r.shift_label, `still to find ${r.still_needed ?? 0}`].filter(Boolean).join(" · "), status: humanize(String(r.status ?? "")) };
      }),
    [reqs.data, positions.data, deptId, posId, primaryWatch, extraReqIds],
  );

  const setIfEmpty = (k: keyof FormValues, v: any) => {
    const cur = getValues(k) as any;
    const empty = cur == null || cur === "" || (Array.isArray(cur) && cur.length === 0);
    if (!(empty && v != null && v !== "" && !(Array.isArray(v) && v.length === 0))) return false;
    setValue(k, v, { shouldDirty: true, shouldValidate: true });
    reqFilled.current.add(k);
    return true;
  };

  const applyRequirement = (id: string, setPrimary = true) => {
    if (setPrimary) setValue("requisition_id", id, { shouldDirty: true });
    const r = reqOptions.find((o) => o.id === id)?.raw;
    if (!r) return;
    setIfEmpty("department_id", r.department_id ?? "");
    setIfEmpty("position_id", r.position_id ?? "");
    setIfEmpty("location", r.location ?? "");
    const et = String(r.employment_type ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (EMPLOYMENT_TYPES.some((t) => t.value === et) && !formState.dirtyFields.employment_type && !isEdit) {
      setValue("employment_type", et as any, { shouldDirty: true });
      reqFilled.current.add("employment_type");
    }
    if (!isEdit || getValues("openings") === "1" || getValues("openings") === "") {
      setValue("openings", String(Math.max(r.still_needed ?? 0, 1)), { shouldDirty: true });
    }
    setIfEmpty("salary_min", r.salary_min != null ? String(r.salary_min) : "");
    setIfEmpty("salary_max", r.salary_max != null ? String(r.salary_max) : "");
    setIfEmpty("shift_ids", r.shift_id ? [r.shift_id] : []);
    const reqText = [r.required_skills?.trim(), r.experience_required?.trim() ? `Experience: ${r.experience_required.trim()}` : null].filter(Boolean).join("\n");
    setIfEmpty("requirements", reqText);
    const pos = positions.data?.find((p) => p.id === r.position_id);
    if (pos && setIfEmpty("title", pos.label)) autoTitle.current = pos.label;
  };

  // A requirement got picked in one of the per-shift slots: fill empty fields, and when several
  // requirements are linked set Openings to the total still needed (same untouched-openings guard).
  const pickLink = (id: string) => {
    applyRequirement(id, false);
    const ids = [...new Set([getValues("requisition_id"), ...extraReqIds, id].filter(Boolean))] as string[];
    if (ids.length > 1 && (!isEdit || getValues("openings") === "1" || getValues("openings") === "")) {
      const sum = ids.reduce((n, r) => n + (reqOptions.find((o) => o.id === r)?.raw?.still_needed ?? 0), 0);
      setValue("openings", String(Math.max(sum, 1)), { shouldDirty: true });
    }
  };

  // Opened from Workforce Planning ("Create ATS job"): pre-select the requirement once its options have loaded.
  const appliedReq = useRef<string | null>(null);
  useEffect(() => {
    if (!open) { appliedReq.current = null; return; }
    if (!initialRequirementId || appliedReq.current === initialRequirementId) return;
    if (!reqOptions.some((o) => o.id === initialRequirementId) || !positions.data) return;
    if (isEdit) {
      // "Link to JOB-000X" from Workforce Planning: add the requirement as this job's link for its shift.
      if (job?.id && reqLinks.isLoading) return;
      appliedReq.current = initialRequirementId;
      const cur = getValues("requisition_id");
      if (cur === initialRequirementId || (reqLinks.data ?? []).includes(initialRequirementId)) return;
      if (!cur) setValue("requisition_id", initialRequirementId, { shouldDirty: true });
      else setExtraReqIds((x) => [...new Set([...x, initialRequirementId])]);
      pickLink(initialRequirementId);
      return;
    }
    appliedReq.current = initialRequirementId;
    applyRequirement(initialRequirementId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, initialRequirementId, reqOptions, positions.data, reqLinks.isLoading]);

  // Job templates: a new job fills its details from the designation's template; HR's own text is never overwritten.
  const templates = useJobTemplates(open);
  const canEditTemplates = useCanManageAtsSettings().data === true;
  // A template shows or fills only once HR's saved versions have loaded, so a slow or failed load can't pass the
  // built-in default off as HR's version.
  const template = templates.ready && posId ? templates.map.get(posId) ?? null : null;
  const posLabel = posId ? positions.data?.find((p) => p.id === posId)?.label ?? null : null;
  const lastApplied = useRef<TemplateFormValues | null>(null);
  const lastTemplatePos = useRef<string>("");
  const lastTemplateText = useRef<string>("");
  const [fillNotice, setFillNotice] = useState<FillNotice | null>(null);
  useEffect(() => {
    if (!open) return;
    lastApplied.current = null;
    // An existing job's designation counts as already handled, so opening it never changes its text.
    lastTemplatePos.current = isEdit ? (job?.position_id ?? "") : "";
    lastTemplateText.current = "";
    setFillNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, job?.id]);
  const templateValuesNow = (): TemplateFormValues => {
    const v = getValues();
    return {
      summary: v.summary, description: v.description, requirements: v.requirements, benefits: v.benefits,
      employment_type: v.employment_type, experience_min_years: v.experience_min_years, experience_max_years: v.experience_max_years,
      salary_min: v.salary_min, salary_max: v.salary_max, salary_period: v.salary_period, show_salary: v.show_salary,
    };
  };
  const templateText = (t: EffectiveJobTemplate | null | undefined) => (t ? JSON.stringify(templateFormValues(t)) : "");
  const applyTemplate = (positionId: string, mode: "auto" | "replace") => {
    const t = positionId ? templates.map.get(positionId) ?? null : null;
    // An existing job only ever takes the template's text; its pay, experience and employment type stay as they are.
    const plan = planTemplateFill(templateValuesNow(), lastApplied.current, templateFormValues(t), mode, { textOnly: isEdit });
    for (const [k, v] of Object.entries(plan.patch)) setValue(k as TemplateFormKey, v as never, { shouldDirty: true, shouldValidate: true });
    lastApplied.current = plan.applied;
    lastTemplatePos.current = positionId;
    lastTemplateText.current = templateText(t);
    setFillNotice(t ? {
      typed: plan.kept.filter((k) => !reqFilled.current.has(k)),
      fromRequirement: plan.kept.filter((k) => reqFilled.current.has(k)),
    } : null);
  };
  // New jobs only: whenever the designation changes (picked by hand, from a hiring request or from Workforce
  // Planning), and when its template changes while the editor is open (HR edited it in another tab).
  useEffect(() => {
    if (!open || isEdit || !templates.ready) return;
    // Read the form, not this render's value: right after a reset the render can still hold the previous job's designation.
    const pos = getValues("position_id") ?? "";
    const text = templateText(pos ? templates.map.get(pos) : null);
    if (pos === lastTemplatePos.current && text === lastTemplateText.current) return;
    applyTemplate(pos, "auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, templates.ready, templates.map, posId]);

  const save = useAtsMutation(
    async (v: FormValues) => {
      const payload = toPayload(v);
      const patch = isEdit
        ? { ...payload, is_published: job!.status === "open" ? payload.is_published : false }
        : { ...payload, is_published: mode.current === "open" && payload.is_published, status: mode.current === "open" ? "open" : "draft" };
      const linked = [...new Set([v.requisition_id, ...extraReqIds].filter(Boolean))] as string[];
      // One server transaction: a refused link saves nothing, so "Save" can never create a duplicate posting.
      return (await saveJobWithLinks(isEdit ? job!.id : null, patch, linked)) as AtsJob;
    },
    {
      invalidate: () => [...jobKeys(job?.id), ["workforce_hiring_requirements"], ["workforce_staffing_matrix"], ["workforce_audit"], ["ats", "job-requirement-links"], ["ats", "active-job-requirement-links"], ["ats", "requirement-jobs"]],
      success: isEdit ? "Job updated" : () => (mode.current === "open" ? "Job created and opened" : "Draft saved"),
      onSuccess: (data) => {
        invalidatePlanning(qc);
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
        description={isEdit ? undefined : "Pick a designation and its template fills in the job details. You can change anything before saving."}
        contentClassName="md:w-[calc(100vw-3rem)] md:max-w-6xl"
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
              <Field label="Designation">
                <Controller control={control} name="position_id" render={({ field }) => (
                  <LookupSelect value={field.value} placeholder="No designation" options={posOptions}
                    onChange={(v) => {
                      const prevLabel = positions.data?.find((x) => x.id === field.value)?.label;
                      field.onChange(v);
                      const pos = positions.data?.find((x) => x.id === v);
                      const title = getValues("title").trim();
                      // The title follows the designation until HR writes their own.
                      if (pos && (!title || title === prevLabel || title === autoTitle.current)) {
                        setValue("title", pos.label, { shouldDirty: true, shouldValidate: true });
                        autoTitle.current = pos.label;
                      }
                      // The department follows the designation (one department per designation).
                      if (pos?.department_id && !getValues("department_id")) setValue("department_id", pos.department_id, { shouldDirty: true });
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
              <div className="rounded-md border border-border px-3 py-2 sm:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="ats-publish" className="font-normal">Publish on careers page</Label>
                  <Controller control={control} name="is_published" render={({ field }) => (
                    <Switch id="ats-publish" checked={field.value} disabled={isEdit && job!.status !== "open"} onCheckedChange={field.onChange} />
                  )} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isEdit
                    ? (job!.status === "open" ? "Shows on the careers page within about 5 minutes of saving." : "Only open jobs can be published. Open this job first.")
                    : "Applies when you create and open the job; drafts are never published."}
                </p>
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
            <TemplatePanel
              control={control} template={template} templatesReady={templates.ready} templatesFailed={templates.isError} onRetry={templates.refetch}
              posId={posId ?? ""} posLabel={posLabel} isEdit={isEdit} notice={fillNotice} canEditTemplates={canEditTemplates}
              onReplace={() => { if (posId) applyTemplate(posId, "replace"); }}
            />
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
            <h3 className="text-xs font-semibold text-muted-foreground">Hiring request{(watch("shift_ids") ?? []).length > 1 ? "s" : ""} (optional)</h3>
            <Controller control={control} name="requisition_id" render={({ field }) => (
              <RequirementLinkEditor
                jobId={job?.id}
                shiftIds={watch("shift_ids") ?? []}
                shiftOptions={shifts.data ?? []}
                reqOptions={reqOptions}
                primaryId={field.value}
                extraIds={extraReqIds}
                onChange={(primary, extras) => { if (primary !== field.value) field.onChange(primary); setExtraReqIds(extras); }}
                onPick={pickLink}
              />
            )} />
            <p className="text-xs text-muted-foreground">
              {(watch("shift_ids") ?? []).length > 1
                ? "Pick the hiring request each shift feeds — one job post covers every shift. Choosing one fills in the fields that are still empty; openings follow the total still to find. Hires are asked their shift and fill that shift's request."
                : "Choosing one fills in the fields that are still empty and sets Openings to the number still to find. Openings then follow the request automatically."}
            </p>
            <JobLineShiftNotice requirementId={watch("requisition_id") || null} jobShiftIds={watch("shift_ids") ?? []} />
          </section>

          <section className="min-w-0 space-y-3 border-t border-border pt-5 lg:col-span-2">
            <h3 className="text-xs font-semibold text-muted-foreground">Application form on careers page</h3>
            <p className="text-xs text-muted-foreground">Choose what candidates are asked when they apply for this job. The server checks every application against these rules.</p>
            {isEdit && <p className="text-xs text-muted-foreground">Changes apply to new applications only; earlier applicants keep the questions they answered.</p>}
            <Controller control={control} name="application_form" render={({ field }) => (
              <ApplicationFormEditor value={field.value} onChange={field.onChange} multiShift={(watch("shift_ids") ?? []).length > 1} />
            )} />
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
