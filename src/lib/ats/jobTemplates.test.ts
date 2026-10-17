import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import {
  BLANK_TEMPLATE_VALUES, buildTemplateMap, planTemplateFill, sameFormValue, templateFormValues, textDiffersFromTemplate,
  type JobTemplateDefault, type JobTemplateRow, type TemplateFormValues,
} from "./jobTemplates";
import { JOB_TEMPLATE_DEFAULTS } from "./jobTemplateDefaults";

const def = (over: Partial<JobTemplateDefault> = {}): JobTemplateDefault => ({
  position_id: "p-ops", title: "Operations Associate", jd_reference: "BVT/HR/JD/2026/009",
  summary: "Run the desk.", description: "About\n\nWhat you'll do\n• Price adverts", requirements: "• Graduate", benefits: "What we offer\n• Paid leave",
  hr_notes: "Standard terms\n• Fixed CTC", employment_type: "full_time", experience_min_years: 0, experience_max_years: 2,
  salary_min: 13600, salary_max: null, salary_period: "monthly", show_salary: true, ...over,
});
const row = (over: Partial<JobTemplateRow> = {}): JobTemplateRow => ({
  position_id: "p-ops", summary: "HR summary", description: null, requirements: "• HR req", benefits: null, hr_notes: null,
  employment_type: "contract", experience_min_years: 1, experience_max_years: null, salary_min: 14000, salary_max: 15000,
  salary_period: "monthly", show_salary: false, created_at: "2026-10-18T00:00:00Z", created_by_name: "HR", updated_at: "2026-10-18T01:00:00Z",
  updated_by_name: "Honey", ...over,
});
const form = (over: Partial<TemplateFormValues> = {}): TemplateFormValues => ({ ...BLANK_TEMPLATE_VALUES, ...over });

describe("buildTemplateMap", () => {
  it("uses the default when HR has not saved a version", () => {
    const m = buildTemplateMap([def()], []);
    expect(m.get("p-ops")).toMatchObject({ source: "default", hasDefault: true, salary_min: 13600, jd_reference: "BVT/HR/JD/2026/009" });
  });
  it("HR's saved version replaces the default, field for field (blank fields stay blank)", () => {
    const m = buildTemplateMap([def()], [row()]);
    const t = m.get("p-ops")!;
    expect(t).toMatchObject({ source: "edited", hasDefault: true, summary: "HR summary", description: "", employment_type: "contract", salary_max: 15000, show_salary: false, updated_by_name: "Honey" });
  });
  it("keeps HR templates for designations without a default", () => {
    const m = buildTemplateMap([], [row({ position_id: "p-new" })]);
    expect(m.get("p-new")).toMatchObject({ source: "edited", hasDefault: false, jd_reference: null });
  });
  it("normalises unexpected database values", () => {
    const t = buildTemplateMap([], [row({ employment_type: "weird", salary_period: "x", salary_min: "13600" as any })]).get("p-ops")!;
    expect(t.employment_type).toBe("full_time");
    expect(t.salary_period).toBe("monthly");
    expect(t.salary_min).toBe(13600);
  });
});

describe("templateFormValues", () => {
  it("turns numbers into the form's text values", () => {
    expect(templateFormValues(def())).toMatchObject({ experience_min_years: "0", experience_max_years: "2", salary_min: "13600", salary_max: "", show_salary: true });
  });
  it("gives the blank job values when there is no template", () => {
    expect(templateFormValues(null)).toEqual(BLANK_TEMPLATE_VALUES);
  });
});

describe("planTemplateFill", () => {
  const ops = templateFormValues(def());
  const kyc = templateFormValues(def({ position_id: "p-kyc", summary: "Verify clients.", requirements: "• KYC", salary_min: 13600, experience_max_years: 2 }));

  it("fills every field of a blank new job", () => {
    const p = planTemplateFill(form(), null, ops, "auto");
    expect(p.kept).toEqual([]);
    expect(p.patch).toMatchObject({ summary: "Run the desk.", requirements: "• Graduate", salary_min: "13600", show_salary: true, experience_max_years: "2" });
    expect(p.patch).not.toHaveProperty("employment_type"); // already full_time
  });
  it("never overwrites what HR typed", () => {
    const p = planTemplateFill(form({ summary: "My own words", salary_min: "12000" }), null, ops, "auto");
    expect(p.kept).toEqual(["summary", "salary_min"]);
    expect(p.patch).not.toHaveProperty("summary");
    expect(p.patch).not.toHaveProperty("salary_min");
    expect(p.patch.description).toBe(ops.description);
  });
  it("switching designation replaces what the previous template filled, but keeps HR's edits", () => {
    const afterOps = { ...ops, benefits: "HR rewrote the notes" };
    const p = planTemplateFill(afterOps, ops, kyc, "auto");
    expect(p.patch.summary).toBe("Verify clients.");
    expect(p.patch.requirements).toBe("• KYC");
    expect(p.kept).toEqual(["benefits"]);
  });
  it("switching to a designation without a template clears what the template filled", () => {
    const p = planTemplateFill(ops, ops, templateFormValues(null), "auto");
    expect(p.patch).toMatchObject({ summary: "", description: "", salary_min: "", show_salary: false });
    expect(p.kept).toEqual([]);
  });
  it("whitespace-only differences count as untouched", () => {
    const p = planTemplateFill(form({ summary: "  Run the desk.\r\n" }), ops, kyc, "auto");
    expect(p.patch.summary).toBe("Verify clients.");
  });
  it("Fill from template replaces the text but keeps HR's pay and experience", () => {
    const cur = form({ summary: "Old", description: "Old", requirements: "Old", benefits: "Old", salary_min: "15000", experience_min_years: "" });
    const p = planTemplateFill(cur, null, ops, "replace");
    expect(p.patch).toMatchObject({ summary: ops.summary, description: ops.description, requirements: ops.requirements, benefits: ops.benefits, experience_min_years: "0" });
    expect(p.kept).toEqual(["salary_min"]);
  });
  it("Fill from template clears text the template does not have", () => {
    const p = planTemplateFill(form({ benefits: "Old notes" }), null, templateFormValues(def({ benefits: "" })), "replace");
    expect(p.patch.benefits).toBe("");
  });

  it("a choice HR changed after a template filled the job survives the next designation", () => {
    // Operations Associate turned Show salary on; HR switched it off, then picked KYC Associate.
    const first = planTemplateFill(form(), null, ops, "auto");
    const now = { ...ops, show_salary: false };
    const p = planTemplateFill(now, first.applied, kyc, "auto");
    expect(p.patch).not.toHaveProperty("show_salary");
    expect(p.kept).toContain("show_salary");
    // Same for employment type.
    const contract = templateFormValues(def({ employment_type: "contract" }));
    const q = planTemplateFill({ ...contract, employment_type: "full_time" }, contract, templateFormValues(def({ employment_type: "contract", summary: "Other" })), "auto");
    expect(q.patch).not.toHaveProperty("employment_type");
    expect(q.kept).toContain("employment_type");
  });
  it("a choice HR made survives a detour through no designation (a Department change clears it)", () => {
    const first = planTemplateFill(form(), null, ops, "auto");
    const hrOff = { ...ops, show_salary: false };
    const cleared = planTemplateFill(hrOff, first.applied, templateFormValues(null), "auto");
    expect(cleared.patch).not.toHaveProperty("show_salary"); // already off
    const afterClear = { ...hrOff, ...cleared.patch } as TemplateFormValues;
    const p = planTemplateFill(afterClear, cleared.applied, kyc, "auto");
    expect(p.patch).not.toHaveProperty("show_salary");
    expect(p.kept).toContain("show_salary");
    expect(p.patch.summary).toBe("Verify clients."); // the cleared text fills again
  });
  it("an emptied text or number field takes the next template's value", () => {
    const first = planTemplateFill(form(), null, ops, "auto");
    const p = planTemplateFill({ ...ops, summary: "", experience_max_years: "" }, first.applied, kyc, "auto");
    expect(p.patch.summary).toBe("Verify clients.");
    expect(p.patch.experience_max_years).toBe("2"); // kyc has the same max; the field was empty, so it is filled again
  });
  it("on an existing job, Fill from template changes only the four text fields", () => {
    const job = form({ summary: "Old", description: "Old", requirements: "Old", benefits: "Old", salary_min: "", show_salary: false, experience_min_years: "" });
    const p = planTemplateFill(job, null, ops, "replace", { textOnly: true });
    expect(Object.keys(p.patch).sort()).toEqual(["benefits", "description", "requirements", "summary"]);
    expect(p.kept).toEqual([]);
  });
  it("a range is filled whole or not at all", () => {
    const p = planTemplateFill(form({ experience_min_years: "3" }), null, ops, "auto");
    expect(p.kept).toEqual(["experience_min_years"]);
    expect(p.held).toContain("experience_max_years");
    expect(p.patch).not.toHaveProperty("experience_max_years"); // no "max 2" under HR's "min 3"
  });
  it("kept pay holds the template's pay settings, including Show salary", () => {
    // A hiring requirement (or HR) set ₹15,000–18,000; the Associate template would show ₹13,600.
    const p = planTemplateFill(form({ salary_min: "15000", salary_max: "18000" }), null, ops, "auto");
    expect(p.kept).toEqual(["salary_min", "salary_max"]);
    expect(p.held).toEqual(["show_salary"]);
    expect(p.patch).not.toHaveProperty("show_salary");
    expect(p.patch.benefits).toBe(ops.benefits); // the text still fills; the editor warns when its pay differs
    // A Show salary choice on its own still lets the figures fill.
    const first = planTemplateFill(form(), null, ops, "auto");
    const q = planTemplateFill({ ...ops, show_salary: false }, first.applied, kyc, "auto");
    expect(q.kept).toEqual(["show_salary"]);
    expect(q.held).toEqual([]);
  });
  it("a field held back stays untouched for the next fill", () => {
    const first = planTemplateFill(form({ salary_min: "15000" }), null, ops, "auto");
    expect(first.held).toContain("show_salary");
    // HR clears the salary and picks another designation: its pay now fills, Show salary included.
    const p = planTemplateFill({ ...form({ salary_min: "" }), ...first.patch }, first.applied, kyc, "auto");
    expect(p.patch).toMatchObject({ salary_min: "13600", show_salary: true });
    expect(p.kept).toEqual([]);
  });
});

describe("helpers", () => {
  it("sameFormValue ignores surrounding spaces and line-ending style only", () => {
    expect(sameFormValue("a\r\nb ", "a\nb")).toBe(true);
    expect(sameFormValue("a b", "a  b")).toBe(false);
    expect(sameFormValue(true, false)).toBe(false);
  });
  it("textDiffersFromTemplate", () => {
    const t = def();
    expect(textDiffersFromTemplate(templateFormValues(t), t)).toBe(false);
    expect(textDiffersFromTemplate({ ...templateFormValues(t), benefits: "x" }, t)).toBe(true);
    expect(textDiffersFromTemplate(templateFormValues(t), null)).toBe(false);
  });
});

/* ---------- the shipped defaults ---------- */
const HEADINGS = new Set([
  "What you'll do", "Who you'll work with", "Good to have", "You'll do well here if you", "What we offer", "Before you join",
  "Standard terms", "What to test in the interview", "Keep in mind",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("JOB_TEMPLATE_DEFAULTS", () => {
  it("has one template per designation", () => {
    const ids = JOB_TEMPLATE_DEFAULTS.map((t) => t.position_id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(UUID);
    // Every JD in the Compendium except the three Board roles (Managing Director, Deputy Managing Director, Director).
    expect(ids.length).toBe(38);
  });

  for (const t of JOB_TEMPLATE_DEFAULTS) {
    describe(t.title, () => {
      it("fits the job form's limits", () => {
        expect(t.summary.length).toBeGreaterThan(80);
        expect(t.summary.length).toBeLessThanOrEqual(500);
        for (const k of ["description", "requirements", "benefits", "hr_notes"] as const) {
          expect(t[k].length, k).toBeGreaterThan(100);
          expect(t[k].length, k).toBeLessThanOrEqual(20000);
        }
        if (t.experience_min_years != null && t.experience_max_years != null) expect(t.experience_max_years).toBeGreaterThanOrEqual(t.experience_min_years);
        if (t.salary_min != null) expect(t.salary_min).toBeGreaterThan(0);
        expect(t.salary_period).toBe("monthly");
        expect(t.jd_reference).toMatch(/^BVT\/HR\/JD\/2026\/\d{3}$/);
      });
      it("is plain text in the careers format", () => {
        expect(t.summary).not.toMatch(/[•\n]/);
        for (const k of ["description", "requirements", "benefits", "hr_notes"] as const) {
          const text = t[k];
          expect(text, k).not.toMatch(/\*\*|^#|<\/?[a-z]/m);
          expect(text, k).not.toMatch(/^\s*[-*]\s/m); // bullets use "• "
          expect(text, k).not.toMatch(/___/);
          expect(text, k).not.toMatch(/\n{3,}/);
          expect(text, k).toBe(text.trim());
          const lines = text.split("\n");
          lines.forEach((line, i) => {
            if (line.startsWith("•")) expect(line, `${k} bullet`).toMatch(/^• \S/);
            const next = lines[i + 1] ?? "";
            // A short line without end punctuation followed directly by content is a heading: only the agreed ones.
            if (line && !line.startsWith("•") && next && line.length <= 40 && !/[.!?:;,)]$/.test(line)) expect(HEADINGS.has(line), `${k} heading "${line}"`).toBe(true);
          });
        }
      });
      it("keeps internal content out of the public fields", () => {
        for (const k of ["summary", "description", "requirements", "benefits"] as const) {
          // "gate" as in a KPI gate; the security guard's "gate pass" is the right public term.
          expect(t[k], k).not.toMatch(/Authority and Limits|Notes for HR|Performance Standards|Balwant Arcade|Binance|\bgate\b(?!\s+pass)/i);
          expect(t[k], k).not.toMatch(/Women are rostered|security deposit|hiring standard/i);
        }
        expect(t.hr_notes.startsWith("Standard terms\n")).toBe(true);
        expect(t.hr_notes).toMatch(/Source: JD Compendium v4\.2, BVT\/HR\/JD\/2026\/\d{3}$/);
      });
      it("shows pay on the careers page only where the hiring standard fixes it", () => {
        if (t.show_salary) expect(t.salary_min).not.toBeNull();
        if (t.salary_min != null && t.show_salary) expect(t.benefits).toContain(`₹${t.salary_min.toLocaleString("en-IN")} a month (CTC)`);
        if (!t.show_salary) expect(t.benefits).not.toMatch(/₹\d/);
      });
    });
  }
});
