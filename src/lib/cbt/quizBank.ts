// Pure Quiz bank helpers (Excel import rows, settings bounds) — unit tested.
export const TEMPLATE_HEADERS = ["type", "question", "option_a", "option_b", "option_c", "option_d", "option_e", "option_f", "correct_option", "numeric_answer", "tolerance", "difficulty", "marks", "explanation"];

/** One sheet row → the payload cbt_import_questions validates. Pure so it can be tested. */
export function rowToItem(r: Record<string, unknown>) {
  const s = (k: string) => String(r[k] ?? "").trim();
  const type = s("type").toLowerCase();
  const options = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, text: s(`option_${id}`) })).filter((o) => o.text);
  return {
    type, difficulty: s("difficulty").toLowerCase() || "medium",
    content: type === "mcq" ? { prompt: s("question"), marks: s("marks") || "1", options } : { prompt: s("question"), marks: s("marks") || "1" },
    key: type === "mcq" ? { correct_option_id: s("correct_option").toLowerCase(), explanation: s("explanation") }
      : { numeric_answer: s("numeric_answer"), numeric_tolerance: s("tolerance") || "0", explanation: s("explanation") },
  };
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Settings = Record<string, any>;
export const NUMBERS = [
  { key: "retention_days", label: "Keep candidate details for", unit: "days", min: 30, max: 1095 },
  { key: "max_warnings", label: "Warning limit", unit: "warnings", min: 1, max: 20 },
  { key: "heartbeat_seconds", label: "Heartbeat", unit: "seconds", min: 5, max: 60 },
  { key: "abandon_after_minutes", label: "Mark abandoned after no contact for", unit: "minutes", min: 5, max: 240 },
  { key: "transition_seconds", label: "Time between sections", unit: "seconds", min: 10, max: 600 },
  { key: "deadline_grace_seconds", label: "Deadline grace", unit: "seconds", min: 0, max: 60 },
] as const;
export const TEXTS = [
  { key: "company_name", label: "Company name" }, { key: "brand_name", label: "Brand name" },
  { key: "logo_url", label: "Logo link (https://)" }, { key: "hr_email", label: "HR contact email" },
  { key: "privacy_url", label: "Privacy link" }, { key: "terms_url", label: "Terms link" },
] as const;

export const AI_NUMBERS = [
  { key: "ai_confidence_threshold", label: "Apply AI grades at confidence of at least", unit: "0.5–1", min: 0.5, max: 1, decimal: true },
  { key: "ai_borderline_margin", label: "Borderline margin around cut-offs", unit: "points", min: 0, max: 20, decimal: true },
  { key: "ai_daily_cap", label: "Daily limit on AI gradings", unit: "answers", min: 0, max: 5000, decimal: false },
] as const;

/** Client-side bounds mirror the server's; the server is the authority. */
export function settingsProblems(f: Settings): string[] {
  const out: string[] = [];
  for (const n of AI_NUMBERS) {
    const raw = f[n.key];
    const v = Number(raw);
    if (raw === "" || raw == null || !Number.isFinite(v) || v < n.min || v > n.max || (!n.decimal && !Number.isInteger(v))) out.push(`${n.label}: ${n.min}–${n.max}`);
  }
  for (const n of NUMBERS) {
    const v = Number(f[n.key]);
    if (!Number.isInteger(v) || v < n.min || v > n.max) out.push(`${n.label}: ${n.min}–${n.max} ${n.unit}`);
  }
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(f.hr_email ?? ""))) out.push("Enter a valid HR contact email");
  for (const k of ["logo_url", "privacy_url", "terms_url"]) if (f[k] && !/^https:\/\/\S+$/.test(String(f[k]))) out.push(`${k.replace("_url", "")} link must start with https://`);
  return out;
}

