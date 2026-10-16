// Per-job careers application form: definition, defaults and server-side validation.
// Pure TypeScript (no Deno/browser APIs) — imported by edge functions AND the ERP UI (src/lib/ats/forms.ts).

export type FieldMode = "required" | "optional" | "hidden";
export type StandardKey =
  | "phone" | "email" | "experience" | "current_ctc" | "expected_ctc" | "notice_period"
  | "current_location" | "skills" | "linkedin" | "cover_letter" | "resume";
export type QuestionType = "short_text" | "long_text" | "number" | "yes_no" | "single_choice" | "multi_choice" | "date" | "url";

export interface FormQuestion {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  help?: string | null;
  options?: string[];
  max_length?: number | null;
  min?: number | null;
  max?: number | null;
  /** Answers that flag the application as "Not a fit" for HR review (never auto-reject). */
  knockout?: string[];
}
export interface ApplicationForm { fields: Record<StandardKey, FieldMode>; questions: FormQuestion[] }

export const STANDARD_FIELDS: { key: StandardKey; label: string; payload: string }[] = [
  { key: "phone", label: "Phone", payload: "phone" },
  { key: "email", label: "Email", payload: "email" },
  { key: "experience", label: "Total experience", payload: "experience_text" },
  { key: "current_ctc", label: "Current CTC", payload: "current_ctc_text" },
  { key: "expected_ctc", label: "Expected CTC", payload: "expected_ctc_text" },
  { key: "notice_period", label: "Notice period", payload: "notice_period_text" },
  { key: "current_location", label: "Current location", payload: "current_location" },
  { key: "skills", label: "Skills", payload: "skills_text" },
  { key: "linkedin", label: "LinkedIn", payload: "linkedin" },
  { key: "cover_letter", label: "Cover letter", payload: "cover_letter" },
  { key: "resume", label: "Resume upload", payload: "resume" },
];
export const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "short_text", label: "Short text" }, { value: "long_text", label: "Long text" },
  { value: "number", label: "Number" }, { value: "yes_no", label: "Yes / No" },
  { value: "single_choice", label: "Single choice" }, { value: "multi_choice", label: "Multiple choice" },
  { value: "date", label: "Date" }, { value: "url", label: "Link" },
];

/** Today's website form (used when a job has no custom form). Phone/email: website already requires one of them. */
export const DEFAULT_FIELDS: Record<StandardKey, FieldMode> = {
  phone: "optional", email: "optional", experience: "optional", current_ctc: "hidden", expected_ctc: "optional",
  notice_period: "optional", current_location: "hidden", skills: "optional", linkedin: "optional",
  cover_letter: "optional", resume: "optional",
};
const MODES: FieldMode[] = ["required", "optional", "hidden"];
const TYPES = QUESTION_TYPES.map((t) => t.value);

/** Normalise any stored value (null, partial, stale) into a complete, safe form definition. */
export function effectiveForm(raw: unknown): ApplicationForm {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw as any : {};
  const fields = { ...DEFAULT_FIELDS };
  if (r.fields && typeof r.fields === "object") {
    for (const f of STANDARD_FIELDS) if (MODES.includes(r.fields[f.key])) fields[f.key] = r.fields[f.key];
  }
  if (fields.phone === "hidden" && fields.email === "hidden") fields.email = "optional";
  const questions: FormQuestion[] = [];
  const seen = new Set<string>();
  for (const q of Array.isArray(r.questions) ? r.questions.slice(0, 30) : []) {
    if (!q || typeof q.id !== "string" || !/^[a-z0-9_-]{1,40}$/i.test(q.id) || seen.has(q.id)) continue;
    if (typeof q.label !== "string" || !q.label.trim() || !TYPES.includes(q.type)) continue;
    seen.add(q.id);
    const choice = q.type === "single_choice" || q.type === "multi_choice";
    const options = choice ? (Array.isArray(q.options) ? q.options : []).map((o: unknown) => String(o).trim()).filter(Boolean).slice(0, 30) : undefined;
    if (choice && !options!.length) continue;
    const allowed = q.type === "yes_no" ? ["Yes", "No"] : options;
    const knockout = Array.isArray(q.knockout) && allowed ? q.knockout.map(String).filter((k: string) => allowed.includes(k)) : [];
    questions.push({
      id: q.id, label: q.label.trim().slice(0, 300), type: q.type, required: !!q.required,
      help: typeof q.help === "string" && q.help.trim() ? q.help.trim().slice(0, 500) : null,
      ...(options ? { options } : {}),
      max_length: Number.isFinite(q.max_length) && q.max_length > 0 ? Math.min(Number(q.max_length), 5000) : null,
      min: Number.isFinite(q.min) ? Number(q.min) : null,
      max: Number.isFinite(q.max) ? Number(q.max) : null,
      ...(knockout.length ? { knockout } : {}),
    });
  }
  return { fields, questions };
}

/** Stable short hash so the website can tell when a job's form changed. */
export function formVersion(f: ApplicationForm): string {
  const s = JSON.stringify(f);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const blank = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

export type FormCheck =
  | { ok: true; custom: Record<string, string | number | boolean | string[]>; knockout: string[]; drop: string[] }
  | { ok: false; field: string };

/** Validate a website payload against the form. `drop` lists payload keys of hidden fields to ignore. */
export function checkSubmission(form: ApplicationForm, payload: Record<string, unknown>, rawAnswers: unknown): FormCheck {
  const drop: string[] = [];
  for (const f of STANDARD_FIELDS) {
    const mode = form.fields[f.key];
    if (mode === "hidden") { drop.push(f.payload); continue; }
    if (mode === "required" && blank(payload[f.payload])) return { ok: false, field: `required:${f.key}` };
  }
  const a = (rawAnswers && typeof rawAnswers === "object" && !Array.isArray(rawAnswers)) ? rawAnswers as Record<string, unknown> : {};
  const custom: Record<string, string | number | boolean | string[]> = {};
  const knockout: string[] = [];
  for (const q of form.questions) {
    const v = a[q.id];
    if (blank(v)) { if (q.required) return { ok: false, field: `required:${q.id}` }; continue; }
    const bad = { ok: false as const, field: `answer:${q.id}` };
    let out: string | number | boolean | string[];
    switch (q.type) {
      case "short_text": case "long_text": {
        if (typeof v !== "string") return bad;
        const lim = q.max_length ?? (q.type === "short_text" ? 300 : 5000);
        if (v.trim().length > lim) return bad;
        out = v.trim(); break;
      }
      case "number": {
        const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
        if (!Number.isFinite(n) || (q.min != null && n < q.min) || (q.max != null && n > q.max)) return bad;
        out = n; break;
      }
      case "yes_no": {
        const s = v === true ? "Yes" : v === false ? "No" : String(v);
        if (s !== "Yes" && s !== "No") return bad;
        out = s; break;
      }
      case "single_choice":
        if (typeof v !== "string" || !q.options!.includes(v)) return bad;
        out = v; break;
      case "multi_choice": {
        const arr = Array.isArray(v) ? v.map(String) : null;
        if (!arr || arr.some((x) => !q.options!.includes(x))) return bad;
        out = [...new Set(arr)]; break;
      }
      case "date":
        if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) return bad;
        out = v; break;
      case "url":
        if (typeof v !== "string" || !/^https?:\/\/\S{3,}$/i.test(v.trim()) || v.length > 500) return bad;
        out = v.trim(); break;
    }
    custom[q.id] = out!;
    if (q.knockout?.length) {
      const vals = Array.isArray(out!) ? out as string[] : [String(out!)];
      if (vals.some((x) => q.knockout!.includes(x))) knockout.push(q.id);
    }
  }
  return { ok: true, custom, knockout, drop };
}
