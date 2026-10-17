import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "./format";

/**
 * Job templates: the pre-filled job details for each designation.
 * Built-in defaults (written from the JD Compendium v4.2) ship in ./jobTemplateDefaults; a row in
 * ats_job_templates is HR's saved version and replaces the default for that designation. Deleting the
 * row brings the default back. hr_notes is for HR only and is never copied into ats_jobs.
 */

export type JobEmploymentType = "full_time" | "part_time" | "contract" | "internship" | "trainee";
export type JobSalaryPeriod = "monthly" | "annual";

export interface JobTemplateContent {
  summary: string;
  description: string;
  requirements: string;
  /** Shown to candidates; HR calls it "Notes" (kept as the careers-feed key `benefits`). */
  benefits: string;
  /** HR only: hiring standard and what to test in the interview. */
  hr_notes: string;
  employment_type: JobEmploymentType;
  experience_min_years: number | null;
  experience_max_years: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: JobSalaryPeriod;
  show_salary: boolean;
}

export interface JobTemplateDefault extends JobTemplateContent {
  position_id: string;
  /** The designation's title when the default was written (for reading the file; matching is by id). */
  title: string;
  jd_reference: string;
}

export interface JobTemplateRow {
  position_id: string;
  summary: string | null;
  description: string | null;
  requirements: string | null;
  benefits: string | null;
  hr_notes: string | null;
  employment_type: string;
  experience_min_years: number | null;
  experience_max_years: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string;
  show_salary: boolean;
  created_at: string;
  created_by_name: string | null;
  updated_at: string;
  updated_by_name: string | null;
}

export interface EffectiveJobTemplate extends JobTemplateContent {
  position_id: string;
  /** "edited" = HR's saved version; "default" = the built-in Compendium version. */
  source: "default" | "edited";
  hasDefault: boolean;
  jd_reference: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
}

const EMPLOYMENT_TYPES: JobEmploymentType[] = ["full_time", "part_time", "contract", "internship", "trainee"];
const toNum = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function rowToContent(r: JobTemplateRow): JobTemplateContent {
  return {
    summary: r.summary ?? "",
    description: r.description ?? "",
    requirements: r.requirements ?? "",
    benefits: r.benefits ?? "",
    hr_notes: r.hr_notes ?? "",
    employment_type: (EMPLOYMENT_TYPES as string[]).includes(r.employment_type) ? (r.employment_type as JobEmploymentType) : "full_time",
    experience_min_years: toNum(r.experience_min_years),
    experience_max_years: toNum(r.experience_max_years),
    salary_min: toNum(r.salary_min),
    salary_max: toNum(r.salary_max),
    salary_period: r.salary_period === "annual" ? "annual" : "monthly",
    show_salary: r.show_salary === true,
  };
}

const contentOf = (d: JobTemplateDefault): JobTemplateContent => ({
  summary: d.summary, description: d.description, requirements: d.requirements, benefits: d.benefits, hr_notes: d.hr_notes,
  employment_type: d.employment_type, experience_min_years: d.experience_min_years, experience_max_years: d.experience_max_years,
  salary_min: d.salary_min, salary_max: d.salary_max, salary_period: d.salary_period, show_salary: d.show_salary,
});

/** HR's saved version wins over the built-in default, designation by designation. */
export function buildTemplateMap(defaults: readonly JobTemplateDefault[], rows: readonly JobTemplateRow[]): Map<string, EffectiveJobTemplate> {
  const map = new Map<string, EffectiveJobTemplate>();
  for (const d of defaults) {
    map.set(d.position_id, { ...contentOf(d), position_id: d.position_id, source: "default", hasDefault: true, jd_reference: d.jd_reference, updated_at: null, updated_by_name: null });
  }
  for (const r of rows) {
    const d = map.get(r.position_id);
    map.set(r.position_id, {
      ...rowToContent(r), position_id: r.position_id, source: "edited", hasDefault: !!d, jd_reference: d?.jd_reference ?? null,
      updated_at: r.updated_at ?? null, updated_by_name: r.updated_by_name ?? null,
    });
  }
  return map;
}

/* ---------- job form values ---------- */

/** The job-form fields a template fills, in the shape the job form keeps them (numbers as text). */
export interface TemplateFormValues {
  summary: string;
  description: string;
  requirements: string;
  benefits: string;
  employment_type: JobEmploymentType;
  experience_min_years: string;
  experience_max_years: string;
  salary_min: string;
  salary_max: string;
  salary_period: JobSalaryPeriod;
  show_salary: boolean;
}
export type TemplateFormKey = keyof TemplateFormValues;

export const TEMPLATE_TEXT_KEYS = ["summary", "description", "requirements", "benefits"] as const satisfies readonly TemplateFormKey[];
export const TEMPLATE_META_KEYS = [
  "employment_type", "experience_min_years", "experience_max_years", "salary_min", "salary_max", "salary_period", "show_salary",
] as const satisfies readonly TemplateFormKey[];
export const TEMPLATE_FORM_KEYS: readonly TemplateFormKey[] = [...TEMPLATE_TEXT_KEYS, ...TEMPLATE_META_KEYS];

/** What a new job starts with before any template is applied. */
export const BLANK_TEMPLATE_VALUES: TemplateFormValues = {
  summary: "", description: "", requirements: "", benefits: "",
  employment_type: "full_time", experience_min_years: "", experience_max_years: "", salary_min: "", salary_max: "",
  salary_period: "monthly", show_salary: false,
};

const numText = (v: number | null) => (v == null ? "" : String(v));

/** Form values for a template; the blank values when there is no template. */
export function templateFormValues(t: JobTemplateContent | null | undefined): TemplateFormValues {
  if (!t) return { ...BLANK_TEMPLATE_VALUES };
  return {
    summary: t.summary ?? "", description: t.description ?? "", requirements: t.requirements ?? "", benefits: t.benefits ?? "",
    employment_type: t.employment_type ?? "full_time",
    experience_min_years: numText(t.experience_min_years), experience_max_years: numText(t.experience_max_years),
    salary_min: numText(t.salary_min), salary_max: numText(t.salary_max),
    salary_period: t.salary_period ?? "monthly", show_salary: !!t.show_salary,
  };
}

/** Same value for the purpose of "has HR changed this?" (surrounding spaces and line-ending style ignored). */
export function sameFormValue(a: unknown, b: unknown): boolean {
  if (typeof a === "string" || typeof b === "string") {
    const norm = (v: unknown) => String(v ?? "").replace(/\r\n?/g, "\n").trim();
    return norm(a) === norm(b);
  }
  return a === b;
}

/** Choices always hold a value, so they are never "empty": once a template has set one, a different value is HR's. */
const CHOICE_KEYS: readonly TemplateFormKey[] = ["employment_type", "salary_period", "show_salary"];
/**
 * Fields that belong together. A template fills a group whole or not at all, so a kept minimum never meets the
 * template's maximum, and HR's pay never ends up next to the template's Show salary choice.
 * `anchors` are the fields whose being kept holds the rest of the group.
 */
const FILL_GROUPS: readonly { keys: readonly TemplateFormKey[]; anchors: readonly TemplateFormKey[] }[] = [
  { keys: ["experience_min_years", "experience_max_years"], anchors: ["experience_min_years", "experience_max_years"] },
  { keys: ["salary_min", "salary_max", "salary_period", "show_salary"], anchors: ["salary_min", "salary_max"] },
];

export interface TemplateFillPlan {
  /** Fields to set, with their new values. */
  patch: Partial<TemplateFormValues>;
  /** Fields left as HR (or a hiring request) set them although the template has something else. */
  kept: TemplateFormKey[];
  /** Fields the template would have filled but left alone because another field of their group was kept. */
  held: TemplateFormKey[];
  /** What counts as "untouched" from now on: pass it back as `lastApplied` on the next fill. */
  applied: TemplateFormValues;
}

/**
 * Decide which job-form fields a template may change.
 * - "auto" (a designation was picked for a new job): a field changes only while it is untouched: blank on a job no
 *   template has filled yet, otherwise still holding what the previous template put there (an emptied text or number
 *   field counts as untouched too). Anything HR typed or chose is kept.
 * - "replace" (HR pressed "Fill from template"): the four text fields always take the template's text; the other
 *   fields follow the "auto" rule. With `textOnly` (an existing job) only the four text fields are considered.
 */
export function planTemplateFill(
  current: TemplateFormValues,
  lastApplied: TemplateFormValues | null,
  next: TemplateFormValues,
  mode: "auto" | "replace",
  opts: { textOnly?: boolean } = {},
): TemplateFillPlan {
  const consider: readonly TemplateFormKey[] = opts.textOnly ? TEMPLATE_TEXT_KEYS : TEMPLATE_FORM_KEYS;
  const untouched = (key: TemplateFormKey) => {
    const cur = current[key];
    if (lastApplied) {
      if (sameFormValue(cur, lastApplied[key])) return true;
      return !CHOICE_KEYS.includes(key) && String(cur ?? "").trim() === "";
    }
    return sameFormValue(cur, BLANK_TEMPLATE_VALUES[key]);
  };
  const decision = new Map<TemplateFormKey, "same" | "set" | "keep" | "hold">();
  for (const key of consider) {
    if (sameFormValue(current[key], next[key])) decision.set(key, "same");
    else if ((mode === "replace" && (TEMPLATE_TEXT_KEYS as readonly string[]).includes(key)) || untouched(key)) decision.set(key, "set");
    else decision.set(key, "keep");
  }
  for (const g of FILL_GROUPS) {
    if (!g.anchors.some((k) => decision.get(k) === "keep")) continue;
    for (const k of g.keys) if (decision.get(k) === "set") decision.set(k, "hold");
  }
  const patch: Partial<TemplateFormValues> = {};
  const kept: TemplateFormKey[] = [];
  const held: TemplateFormKey[] = [];
  const applied = { ...(lastApplied ?? BLANK_TEMPLATE_VALUES) } as Record<TemplateFormKey, unknown>;
  for (const key of TEMPLATE_FORM_KEYS) {
    const d = decision.get(key);
    if (d === "set") { (patch as Record<string, unknown>)[key] = next[key]; applied[key] = next[key]; }
    // Already equal: only an untouched field takes the template's value as its new reference. A value HR set keeps
    // counting as HR's, even when this template happens to match it (a cleared designation, a blank template).
    else if (d === "same") { if (untouched(key)) applied[key] = next[key]; }
    else if (d === "keep") { kept.push(key); applied[key] = next[key]; } // HR's value stays HR's next time too
    else { if (d === "hold") held.push(key); applied[key] = current[key]; } // left as it was, still not HR's
  }
  return { patch, kept, held, applied: applied as unknown as TemplateFormValues };
}

/** Text fields where the job's text differs from the template's. */
export function textDiffersFromTemplate(current: Pick<TemplateFormValues, (typeof TEMPLATE_TEXT_KEYS)[number]>, t: JobTemplateContent | null | undefined): boolean {
  if (!t) return false;
  const v = templateFormValues(t);
  return TEMPLATE_TEXT_KEYS.some((k) => !sameFormValue(current[k], v[k]));
}

export const TEMPLATE_FIELD_LABELS: Record<TemplateFormKey, string> = {
  summary: "Summary", description: "Description", requirements: "Requirements", benefits: "Notes",
  employment_type: "Employment type", experience_min_years: "Experience min", experience_max_years: "Experience max",
  salary_min: "Salary min", salary_max: "Salary max", salary_period: "Salary period", show_salary: "Show salary",
};

/* ---------- data ---------- */

export const jobTemplateKeys = {
  rows: ["ats", "job-templates"] as const,
  defaults: ["ats", "job-template-defaults"] as const,
  designations: ["ats", "job-template-designations"] as const,
};

/** The built-in defaults load on demand so they never weigh on other pages. */
export const useJobTemplateDefaults = (enabled = true) =>
  useQuery({
    queryKey: jobTemplateKeys.defaults,
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => (await import("./jobTemplateDefaults")).JOB_TEMPLATE_DEFAULTS as readonly JobTemplateDefault[],
  });

export const useJobTemplateRows = (enabled = true) =>
  useQuery({
    queryKey: jobTemplateKeys.rows,
    enabled,
    staleTime: 60_000,
    // A small table: re-read it whenever HR comes back to the tab, so a template edited in another tab
    // (the job editor's "Edit template" link opens one) reaches the open editor.
    refetchOnWindowFocus: "always",
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_job_templates").select("*");
      if (error) throw error;
      return (data ?? []) as JobTemplateRow[];
    },
  });

/** The template each designation uses (HR's saved version, else the built-in default). */
export function useJobTemplates(enabled = true) {
  const defaults = useJobTemplateDefaults(enabled);
  const rows = useJobTemplateRows(enabled);
  const map = useMemo(() => buildTemplateMap(defaults.data ?? [], rows.data ?? []), [defaults.data, rows.data]);
  // Judged by the data held, not the last request: a failed background refetch keeps the cached rows usable.
  const haveDefaults = defaults.data !== undefined;
  const haveRows = rows.data !== undefined;
  return {
    map,
    /** Both sources loaded: only then may a template show or fill (a failed load must not pass the default off as HR's version). */
    ready: haveDefaults && haveRows,
    isLoading: (!haveDefaults && defaults.isLoading) || (!haveRows && rows.isLoading),
    isError: (!haveDefaults && defaults.isError) || (!haveRows && rows.isError),
    error: ((!haveDefaults ? defaults.error : null) ?? (!haveRows ? rows.error : null)) as unknown,
    refetch: () => { void defaults.refetch(); void rows.refetch(); },
  };
}

export interface TemplateDesignation { id: string; title: string; department_id: string | null; hierarchy_level: number | null }

/** Active designations with their grade, for the templates list. */
export const useTemplateDesignations = (enabled = true) =>
  useQuery({
    queryKey: jobTemplateKeys.designations,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("positions").select("id,title,department_id,hierarchy_level,is_active").eq("is_active", true).order("title");
      if (error) throw error;
      return (data ?? []).map((r): TemplateDesignation => ({ id: r.id, title: r.title, department_id: r.department_id ?? null, hierarchy_level: r.hierarchy_level ?? null }));
    },
  });

export const gradeLabel = (level: number | null | undefined) => (level == null ? null : `L${level}`);

export const templateSettingsHref = (positionId: string) => `/hrms/ats/settings?tab=templates&designation=${positionId}`;

/** Where a template comes from, in a few words. */
export function templateSourceText(t: EffectiveJobTemplate): string {
  if (t.source === "edited") {
    const by = t.updated_by_name ? ` by ${t.updated_by_name}` : "";
    const on = t.updated_at ? ` on ${fmtDate(t.updated_at)}` : "";
    return `Edited${by}${on}`;
  }
  return t.jd_reference ? `Compendium default · ${t.jd_reference}` : "Compendium default";
}

/** Save HR's version of a designation's template (insert or replace). */
export async function saveJobTemplate(positionId: string, t: JobTemplateContent) {
  const blank = (s: string) => (s.trim() === "" ? null : s.trim());
  const row = {
    position_id: positionId,
    summary: blank(t.summary), description: blank(t.description), requirements: blank(t.requirements), benefits: blank(t.benefits),
    hr_notes: blank(t.hr_notes), employment_type: t.employment_type,
    experience_min_years: t.experience_min_years, experience_max_years: t.experience_max_years,
    salary_min: t.salary_min, salary_max: t.salary_max, salary_period: t.salary_period, show_salary: t.show_salary,
  };
  const { error } = await supabase.from("ats_job_templates").upsert(row, { onConflict: "position_id" });
  if (error) throw error;
}

/** Remove HR's version: the designation goes back to the built-in default (or to no template). */
export async function deleteJobTemplate(positionId: string) {
  const { error } = await supabase.from("ats_job_templates").delete().eq("position_id", positionId);
  if (error) throw error;
}
