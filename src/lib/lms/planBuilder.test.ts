import { describe, expect, it } from "vitest";
import { buildPlanItems, decidingTests, firstFinalTestDay, resolvePlanModules, suggestModuleDays } from "./planBuilder";
import type { LmsKra, LmsModule, LmsModuleKra } from "./types";

const mod = (code: string, type: LmsModule["module_type"], sort: number, minutes = 45, extra: Partial<LmsModule> = {}): LmsModule => ({
  id: `id-${code}`, code, title: code, module_type: type, department_code: code.slice(0, 3), subdepartment_code: null,
  platform: null, summary: null, content_md: null, trainer_notes: null, duration_minutes: minutes, sort_order: sort,
  status: "not_started", production: {}, version: "1.0", version_notes: null, version_published_at: null,
  quiz_tag: code, owner_name: null, is_active: true, updated_at: "", ...extra,
});
const kra = (code: string, sort: number, platform: LmsKra["platform"] = null): LmsKra => ({
  code, name: code, department_code: code.slice(0, 3), department_name: "", subdepartment_code: code.slice(0, 6),
  subdepartment_name: "", layer_code: code.slice(0, 9), layer_name: "", platform, catalogue_status: "live",
  description: null, description_url: null, sort_order: sort, is_active: true,
});

const modules: LmsModule[] = [
  mod("BVT-OR", "company", 1, 240),
  mod("OPS-OR", "department", 2, 120),
  mod("OPS-CO-OR", "subdepartment", 3, 90),
  mod("OPS-CO-PL1", "platform", 4, 180),
  mod("OPS-CO-CH-M03", "shared", 10),
  mod("OPS-CO-CH-M04", "shared", 11),
  mod("OPS-CO-CH-37", "kra", 12),
  mod("OPS-CO-CH-38", "kra", 13),
  mod("OPS-CO-CH-41", "kra", 14),
  mod("BVT-CM-01", "companywide", 50),
];
const links: LmsModuleKra[] = [
  { module_id: "id-OPS-CO-CH-M03", kra_code: "OPS-CO-CH-03" },
  { module_id: "id-OPS-CO-CH-M03", kra_code: "OPS-CO-CH-10" },
  { module_id: "id-OPS-CO-CH-M04", kra_code: "OPS-CO-CH-04" },
  { module_id: "id-OPS-CO-CH-37", kra_code: "OPS-CO-CH-37" },
  { module_id: "id-OPS-CO-CH-38", kra_code: "OPS-CO-CH-38" },
  { module_id: "id-OPS-CO-CH-41", kra_code: "OPS-CO-CH-41" },
];
const kras = new Map(
  [kra("OPS-CO-CH-03", 3, "Binance"), kra("OPS-CO-CH-04", 4, "Binance"), kra("OPS-CO-CH-10", 10, "Binance"),
   kra("OPS-CO-CH-37", 37), kra("OPS-CO-CH-38", 38), kra("OPS-CO-CH-41", 41)].map((k) => [k.code, k]),
);
const allOn = { company: true, department: true, subdepartment: true, platform: true };

describe("resolvePlanModules", () => {
  it("collects orientation, platform and skill modules once, in teaching order", () => {
    const r = resolvePlanModules({ kraCodes: ["OPS-CO-CH-38", "OPS-CO-CH-03", "OPS-CO-CH-10"], kras, modules, moduleKras: links, include: allOn });
    expect(r.modules.map((m) => m.code)).toEqual(["BVT-OR", "OPS-OR", "OPS-CO-OR", "OPS-CO-PL1", "OPS-CO-CH-M03", "OPS-CO-CH-38"]);
    expect(r.missing).toEqual([]);
  });

  it("leaves out completed modules and reports missing ones", () => {
    const r = resolvePlanModules({
      kraCodes: ["OPS-CO-CH-03", "OPS-CO-CH-99"], kras, modules, moduleKras: links, include: allOn,
      completedModuleIds: new Set(["id-BVT-OR", "id-OPS-OR"]),
    });
    expect(r.modules.map((m) => m.code)).toEqual(["OPS-CO-OR", "OPS-CO-PL1", "OPS-CO-CH-M03"]);
    expect(r.skippedCompleted.map((m) => m.code)).toEqual(["BVT-OR", "OPS-OR"]);
    expect(r.missing).toContain("OPS-CO-CH-99");
  });
});

describe("buildPlanItems", () => {
  const seat = ["OPS-CO-CH-03", "OPS-CO-CH-04", "OPS-CO-CH-37", "OPS-CO-CH-38", "OPS-CO-CH-41"];

  it("lays a 30-day induction across the frame", () => {
    const r = buildPlanItems({ kraCodes: seat, kras, modules, moduleKras: links, include: allOn, moduleDays: 15, totalDays: 30, testDays: [8, 15], planType: "induction" });
    const day = (n: number) => r.items.filter((i) => i.day_no === n);
    expect(day(1).map((i) => i.module_code)).toEqual(["BVT-OR"]);
    expect(day(2).map((i) => i.module_code)).toEqual(["OPS-OR", "OPS-CO-OR"]);
    expect(day(3).map((i) => i.module_code)).toEqual(["OPS-CO-PL1"]);
    expect(day(8).some((i) => i.item_type === "test" && i.test_kind === "mid")).toBe(true);
    expect(day(15).map((i) => i.item_type)).toEqual(["test"]);
    expect(day(15)[0].test_kind).toBe("final");
    expect(day(13).every((i) => i.item_type === "practice")).toBe(true);
    expect(day(14).every((i) => i.item_type === "practice")).toBe(true);
    // every skill module lands on a teaching day, before the final test, never on a test day
    const skill = r.items.filter((i) => i.item_type === "module" && i.day_no > 3);
    expect(skill.map((i) => i.module_code).sort()).toEqual(["OPS-CO-CH-37", "OPS-CO-CH-38", "OPS-CO-CH-41", "OPS-CO-CH-M03", "OPS-CO-CH-M04"]);
    skill.forEach((i) => expect([8, 13, 14, 15]).not.toContain(i.day_no));
    // every module day has something, live days follow
    for (let d = 1; d <= 15; d++) expect(day(d).length).toBeGreaterThan(0);
    for (let d = 16; d <= 30; d++) expect(day(d).map((i) => i.item_type)).toEqual(["live"]);
    expect(r.items.some((i) => i.day_no > 30)).toBe(false);
  });

  it("packs many modules into the available days without leaving any empty", () => {
    const many: LmsModule[] = [...modules];
    const manyLinks: LmsModuleKra[] = [...links];
    const manyKras = new Map(kras);
    for (let i = 0; i < 20; i++) {
      const code = `OPS-PY-PO-${String(i).padStart(2, "0")}`;
      many.push(mod(code, "kra", 100 + i, 60));
      manyLinks.push({ module_id: `id-${code}`, kra_code: code });
      manyKras.set(code, kra(code, 100 + i));
    }
    const r = buildPlanItems({ kraCodes: Array.from(manyKras.keys()), kras: manyKras, modules: many, moduleKras: manyLinks, include: allOn, moduleDays: 15, totalDays: 15, testDays: [8, 15], planType: "induction" });
    const skillDays = new Set(r.items.filter((i) => i.item_type === "module" && i.module_code?.startsWith("OPS-PY")).map((i) => i.day_no));
    expect(skillDays.size).toBeGreaterThan(5);
    expect(r.items.filter((i) => i.item_type === "module").length).toBe(4 + 5 + 20);
  });

  it("spreads extra modules evenly instead of piling them on the last day", () => {
    const many: LmsModule[] = modules.filter((m) => m.module_type !== "kra" && m.module_type !== "shared");
    const manyLinks: LmsModuleKra[] = [];
    const manyKras = new Map<string, LmsKra>();
    for (let i = 0; i < 12; i++) {
      const code = `OPS-CO-CH-${String(60 + i)}`;
      many.push(mod(code, "kra", 200 + i, 90));
      manyLinks.push({ module_id: `id-${code}`, kra_code: code });
      manyKras.set(code, kra(code, 200 + i));
    }
    const r = buildPlanItems({ kraCodes: Array.from(manyKras.keys()), kras: manyKras, modules: many, moduleKras: manyLinks, include: allOn, moduleDays: 15, totalDays: 30, testDays: [8, 15], planType: "induction" });
    const perDay = new Map<number, number>();
    r.items.filter((i) => i.module_code?.startsWith("OPS-CO-CH-6") || i.module_code?.startsWith("OPS-CO-CH-7")).forEach((i) => perDay.set(i.day_no, (perDay.get(i.day_no) ?? 0) + 1));
    expect(Array.from(perDay.values()).reduce((a, b) => a + b, 0)).toBe(12);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(2);
    expect(r.warnings.some((w) => w.includes("heavy"))).toBe(false);
  });

  it("explains when every module was already completed", () => {
    const r = buildPlanItems({ kraCodes: ["OPS-CO-CH-38"], kras, modules, moduleKras: links, include: { company: false, department: false, subdepartment: false, platform: false }, completedModuleIds: new Set(["id-OPS-CO-CH-38"]), moduleDays: 2, totalDays: 2, testDays: [2], planType: "refresher" });
    expect(r.modules).toEqual([]);
    expect(r.warnings.join(" ")).toContain("already completed every module");
  });

  it("builds a short re-skilling plan without orientation or live days", () => {
    const r = buildPlanItems({ kraCodes: ["OPS-CO-CH-38"], kras, modules, moduleKras: links, include: { company: false, department: false, subdepartment: false, platform: false }, moduleDays: 2, totalDays: 2, testDays: [8, 15], planType: "reskilling" });
    expect(r.items.map((i) => [i.day_no, i.item_type])).toEqual([[1, "module"], [2, "test"]]);
  });

  it("suggests module days from teaching minutes", () => {
    expect(suggestModuleDays(0)).toBe(2);
    expect(suggestModuleDays(600)).toBe(3);
    expect(suggestModuleDays(1500)).toBe(6);
  });
});

describe("decidingTests", () => {
  const t = (id: string, day: number, kind: "mid" | "final" | "retest", sort = 10) => ({ id, item_type: "test", test_kind: kind, day_no: day, sort_order: sort });
  it("counts the final test and later retests only, in day order", () => {
    const items = [t("r20", 20, "retest"), t("m8", 8, "mid"), t("x10", 10, "retest"), t("f15", 15, "final"), { id: "p", item_type: "practice", test_kind: null, day_no: 15, sort_order: 5 }];
    expect(decidingTests(items).map((i) => i.id)).toEqual(["f15", "r20"]);
    expect(firstFinalTestDay(items)).toBe(15);
  });
  it("uses every retest when a plan has no final test", () => {
    const items = [t("r3", 3, "retest"), t("m1", 1, "mid")];
    expect(decidingTests(items).map((i) => i.id)).toEqual(["r3"]);
    expect(firstFinalTestDay(items)).toBeNull();
  });
});
