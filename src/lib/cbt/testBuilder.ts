// Pure helpers for the Quiz test editor (catalogue, level meaning, live summary) — unit tested.
export type Level = "beginner" | "intermediate" | "advanced";
export type SectionType =
  | "typing" | "data_entry" | "match_pairs" | "mental_maths" | "memory_recall"
  | "logical_reasoning" | "problem_solving" | "pattern_recognition" | "grammar" | "vocabulary"
  | "objective" | "written";
export type ItemSource = "bank" | "generated" | "both";

export type SectionDraft = {
  key: string; id?: string; sectionCode: string; sectionType: SectionType; title: string; level: Level;
  minutes: string; items: string; weight: string; passMark: string; negativeMark: string;
  subjects: string[]; source: ItemSource;
  fullMarksWpm: string; gateMinNetWpm: string; gateMinAccuracy: string; practiceMinutes: string;
  minWords: string; maxWords: string;
};

export const LEVELS: Level[] = ["beginner", "intermediate", "advanced"];
export const GROUPS: { title: string; types: SectionType[] }[] = [
  { title: "Skill drills", types: ["typing", "data_entry", "match_pairs", "mental_maths", "memory_recall"] },
  { title: "Knowledge", types: ["logical_reasoning", "problem_solving", "pattern_recognition", "grammar", "vocabulary", "objective"] },
  { title: "Written", types: ["written"] },
];
export const TYPE_LABEL: Record<SectionType, string> = {
  typing: "Typing", data_entry: "Data entry", match_pairs: "Match pairs", mental_maths: "Mental maths", memory_recall: "Memory recall",
  logical_reasoning: "Logical reasoning", problem_solving: "Problem solving", pattern_recognition: "Pattern recognition",
  grammar: "Grammar", vocabulary: "Vocabulary", objective: "General questions by subject", written: "Written answer",
};
export const TYPE_BLURB: Record<SectionType, string> = {
  typing: "Net and gross words per minute and accuracy on a passage.",
  data_entry: "Copy banking-style records field by field; every field is marked.",
  match_pairs: "Decide whether two payment records are the same — attention to detail under time.",
  mental_maths: "Freshly generated sums for every attempt.",
  memory_recall: "A sequence flashes, the candidate types it back.",
  logical_reasoning: "Syllogisms, deduction, coding-decoding and seating logic.",
  problem_solving: "Percentages, ratios, work and speed.",
  pattern_recognition: "Number and letter sequences.",
  grammar: "Error spotting and sentence correction.",
  vocabulary: "Synonyms, antonyms and word usage.",
  objective: "MCQ / numeric questions from the subjects you choose.",
  written: "A short written answer, graded by AI with its marking guide; HR checks flagged answers.",
};
export const GENERATED_ONLY: SectionType[] = ["mental_maths", "memory_recall"];
export const HAS_SOURCE: SectionType[] = ["data_entry", "match_pairs"];
export const HAS_NEGATIVE: SectionType[] = ["match_pairs", "logical_reasoning", "problem_solving", "pattern_recognition", "grammar", "vocabulary", "objective"];
export const HAS_SUBJECTS: SectionType[] = ["logical_reasoning", "problem_solving", "pattern_recognition", "grammar", "vocabulary", "objective", "written", "typing", "data_entry", "match_pairs"];
export const KNOWLEDGE: SectionType[] = ["logical_reasoning", "problem_solving", "pattern_recognition", "grammar", "vocabulary"];

type Preset = { items: number; minutes: number; wpm?: [number, number, number] };
export const PRESETS: Record<SectionType, Record<Level, Preset>> = {
  typing: { beginner: { items: 1, minutes: 2, wpm: [30, 20, 90] }, intermediate: { items: 1, minutes: 3, wpm: [40, 25, 90] }, advanced: { items: 1, minutes: 4, wpm: [55, 40, 95] } },
  mental_maths: { beginner: { items: 8, minutes: 4 }, intermediate: { items: 10, minutes: 4 }, advanced: { items: 12, minutes: 4 } },
  memory_recall: { beginner: { items: 5, minutes: 3.5 }, intermediate: { items: 6, minutes: 4 }, advanced: { items: 8, minutes: 4 } },
  data_entry: { beginner: { items: 3, minutes: 5 }, intermediate: { items: 4, minutes: 5 }, advanced: { items: 6, minutes: 5 } },
  match_pairs: { beginner: { items: 6, minutes: 3 }, intermediate: { items: 8, minutes: 4 }, advanced: { items: 10, minutes: 4 } },
  logical_reasoning: { beginner: { items: 6, minutes: 6 }, intermediate: { items: 6, minutes: 5 }, advanced: { items: 6, minutes: 4 } },
  problem_solving: { beginner: { items: 6, minutes: 6 }, intermediate: { items: 6, minutes: 5 }, advanced: { items: 6, minutes: 4 } },
  pattern_recognition: { beginner: { items: 6, minutes: 6 }, intermediate: { items: 6, minutes: 5 }, advanced: { items: 6, minutes: 4 } },
  grammar: { beginner: { items: 6, minutes: 6 }, intermediate: { items: 6, minutes: 5 }, advanced: { items: 6, minutes: 4 } },
  vocabulary: { beginner: { items: 6, minutes: 6 }, intermediate: { items: 6, minutes: 5 }, advanced: { items: 6, minutes: 4 } },
  objective: { beginner: { items: 10, minutes: 10 }, intermediate: { items: 10, minutes: 8 }, advanced: { items: 10, minutes: 6 } },
  written: { beginner: { items: 1, minutes: 8 }, intermediate: { items: 1, minutes: 6 }, advanced: { items: 1, minutes: 5 } },
};

const LEVEL_NAME: Record<Level, string> = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };

/** Plain words for what a level means for this section. */
export function levelMeaning(t: SectionType, level: Level, items: number, minutes: number): string {
  const L = LEVEL_NAME[level];
  const m = `${minutes} min`;
  switch (t) {
    case "mental_maths": return `${L}: ${items} sums, ${level === "beginner" ? "2-digit numbers" : level === "intermediate" ? "2–3 digit numbers" : "3-digit numbers, % and ÷"}, ${m}`;
    case "memory_recall": return `${L}: ${items} sequences of ${level === "beginner" ? "4–5" : level === "intermediate" ? "5–7" : "7–9"} characters, ${m}`;
    case "typing": return `${L}: a ${level} passage, ${m}`;
    case "data_entry": return `${L}: ${items} records, ${level === "beginner" ? "short numbers and common names" : level === "intermediate" ? "11–14 digit accounts, initials" : "14–18 digit accounts, look-alike characters, unusual names"}, ${m}`;
    case "match_pairs": return `${L}: ${items} pairs, about half match; a mismatch is ${level === "beginner" ? "an obviously different word or number" : level === "intermediate" ? "one digit changed, two digits swapped or a missing initial" : "a look-alike character (O/0, I/1, S/5, B/8), a moved decimal point or a near-identical spelling"}, ${m}`;
    case "written": return `${L}: ${items} written answer${items === 1 ? "" : "s"}, ${m}`;
    default: return `${L}: ${items} ${level === "beginner" ? "easy" : level === "intermediate" ? "medium" : "hard"} questions, ${m}`;
  }
}

export function newSection(t: SectionType, existingCodes: string[], level: Level = "intermediate"): SectionDraft {
  const p = PRESETS[t][level];
  const base = t.toUpperCase().slice(0, 12);
  let code = base; let n = 2;
  while (existingCodes.includes(code)) code = `${base}_${n++}`;
  return {
    key: `${t}-${Math.random().toString(36).slice(2, 9)}`, sectionCode: code, sectionType: t, title: TYPE_LABEL[t], level,
    minutes: String(p.minutes), items: String(p.items), weight: "10", passMark: "", negativeMark: "0",
    subjects: KNOWLEDGE.includes(t) ? [t] : [], source: HAS_SOURCE.includes(t) ? "generated" : "bank",
    fullMarksWpm: p.wpm ? String(p.wpm[0]) : "", gateMinNetWpm: p.wpm ? String(p.wpm[1]) : "", gateMinAccuracy: p.wpm ? String(p.wpm[2]) : "",
    practiceMinutes: t === "typing" ? "1" : "", minWords: t === "written" ? "60" : "", maxWords: t === "written" ? "200" : "",
  };
}

/** Time as candidates experience it: section minutes + each transition screen + the typing warm-up wait. */
export function minutesWithBreaks(sections: { duration_seconds: number; section_type: string; practice_seconds?: number | null }[], transitionSeconds = 60): number {
  const secs = sections.reduce((n, s, i) => n + s.duration_seconds
    + (s.section_type === "typing" ? Number(s.practice_seconds ?? 0) + 60 : i > 0 ? transitionSeconds : 0), 0);
  return Math.round(secs / 60);
}

export function summarise(sections: SectionDraft[]) {
  const totalMinutes = sections.reduce((n, s) => n + (Number(s.minutes) || 0), 0);
  const totalItems = sections.reduce((n, s) => n + (s.sectionType === "typing" ? 1 : Number(s.items) || 0), 0);
  const weightSum = sections.reduce((n, s) => n + (Number(s.weight) || 0), 0);
  const shares = sections.map((s) => (weightSum > 0 ? Math.round(((Number(s.weight) || 0) / weightSum) * 1000) / 10 : 0));
  return { totalMinutes: Math.round(totalMinutes * 10) / 10, totalItems, weightSum, shares, overHour: totalMinutes > 60 };
}

/** Editor draft → the payload cbt_save_role_blueprint validates. */
export function toPayload(sections: SectionDraft[]) {
  return sections.map((s, i) => {
    const typing = s.sectionType === "typing";
    return {
      order_index: i + 1, section_code: s.sectionCode, section_type: s.sectionType, title: s.title.trim(),
      category_tags: HAS_SUBJECTS.includes(s.sectionType) ? s.subjects : [],
      item_count: typing ? 1 : Number(s.items), duration_seconds: Math.round(Number(s.minutes) * 60),
      weight: Number(s.weight), negative_mark: HAS_NEGATIVE.includes(s.sectionType) ? Number(s.negativeMark || 0) : 0,
      gate_min_score: typing ? null : s.passMark.trim() || null,
      full_marks_wpm: typing ? s.fullMarksWpm || null : null, gate_min_net_wpm: typing ? s.gateMinNetWpm || null : null,
      gate_min_accuracy: typing ? s.gateMinAccuracy || null : null,
      practice_seconds: typing && s.practiceMinutes ? Math.round(Number(s.practiceMinutes) * 60) : 0,
      min_words: s.sectionType === "written" ? s.minWords || null : null, max_words: s.sectionType === "written" ? s.maxWords || null : null,
      skill_level: s.level, item_source: HAS_SOURCE.includes(s.sectionType) ? s.source : "bank",
    };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromRow(r: any): SectionDraft {
  const t = r.section_type as SectionType;
  const n = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    key: r.id, id: r.id, sectionCode: r.section_code, sectionType: t, title: r.title, level: (r.skill_level ?? "intermediate") as Level,
    minutes: String(r.duration_seconds / 60), items: String(r.item_count), weight: String(r.weight), passMark: n(r.gate_min_score),
    negativeMark: String(r.negative_mark ?? 0), subjects: r.category_tags ?? [], source: (r.item_source ?? "bank") as ItemSource,
    fullMarksWpm: n(r.full_marks_wpm), gateMinNetWpm: n(r.gate_min_net_wpm), gateMinAccuracy: n(r.gate_min_accuracy),
    practiceMinutes: r.practice_seconds ? String(r.practice_seconds / 60) : "", minWords: n(r.min_words), maxWords: n(r.max_words),
  };
}
