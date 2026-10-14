import { MODULE_TYPE_RANK, PLATFORM_MODULE_CODE } from "./constants";
import type { LmsItemType, LmsKra, LmsModule, LmsModuleKra, LmsPlanType, LmsTestKind } from "./types";

/**
 * Builds a day-by-day training plan from a set of KRAs.
 *
 * Modules are gathered in teaching order — company orientation, department and
 * sub-department orientation, platform modules, then each KRA's own skill module —
 * with shared modules listed once and anything the employee already completed left
 * out. They are then laid across the module days: orientation first, skill modules
 * spread evenly around the test days, practice days just before the final test, and
 * supervised live days after the module days.
 */

export interface PlanBuildOptions {
  kraCodes: string[];
  kras: Map<string, LmsKra>;
  modules: LmsModule[];
  moduleKras: LmsModuleKra[];
  /** Modules this employee already completed in an earlier plan. */
  completedModuleIds?: Set<string>;
  include: { company: boolean; department: boolean; subdepartment: boolean; platform: boolean };
  moduleDays: number;
  totalDays: number;
  testDays: number[];
  planType: LmsPlanType;
}

export interface DraftItem {
  key: string;
  day_no: number;
  item_type: LmsItemType;
  module_id: string | null;
  module_code: string | null;
  module_version: string | null;
  title: string;
  test_kind: LmsTestKind | null;
  minutes: number;
}

export interface PlanBuildResult {
  items: DraftItem[];
  /** Modules included, in teaching order. */
  modules: LmsModule[];
  /** Module codes a KRA needs but the library does not have (or has retired). */
  missing: string[];
  /** Modules left out because the employee already completed them. */
  skippedCompleted: LmsModule[];
  warnings: string[];
}

let keySeq = 0;
const nextKey = () => `d${Date.now().toString(36)}${(keySeq++).toString(36)}`;

/** Every module a KRA set needs, in teaching order, without duplicates. */
export function resolvePlanModules(opts: Pick<PlanBuildOptions, "kraCodes" | "kras" | "modules" | "moduleKras" | "include" | "completedModuleIds">) {
  const byCode = new Map(opts.modules.map((m) => [m.code, m]));
  const byId = new Map(opts.modules.map((m) => [m.id, m]));
  const skillByKra = new Map<string, LmsModule>();
  for (const link of opts.moduleKras) {
    const m = byId.get(link.module_id);
    if (!m) continue;
    const prev = skillByKra.get(link.kra_code);
    // a KRA has one skill module; prefer an active, non-retired one if data ever holds two
    if (!prev || (!prev.is_active && m.is_active)) skillByKra.set(link.kra_code, m);
  }

  const wanted: string[] = [];
  const missing = new Set<string>();
  const add = (code: string | null | undefined) => {
    if (!code) return;
    const m = byCode.get(code);
    if (!m || !m.is_active || m.status === "retired") { missing.add(code); return; }
    if (!wanted.includes(code)) wanted.push(code);
  };

  const kraList = opts.kraCodes
    .map((c) => opts.kras.get(c))
    .filter((k): k is LmsKra => Boolean(k))
    .sort((a, b) => a.sort_order - b.sort_order);

  if (opts.include.company && kraList.length > 0) add("BVT-OR");
  for (const k of kraList) {
    if (opts.include.department) add(`${k.department_code}-OR`);
    if (opts.include.subdepartment) add(`${k.subdepartment_code}-OR`);
    if (opts.include.platform && k.platform) add(PLATFORM_MODULE_CODE[k.platform]);
    const skill = skillByKra.get(k.code);
    if (!skill) missing.add(k.code);
    else add(skill.code);
  }
  for (const c of opts.kraCodes) if (!opts.kras.has(c)) missing.add(c);

  const completed = opts.completedModuleIds ?? new Set<string>();
  const all = wanted.map((c) => byCode.get(c)!) as LmsModule[];
  const skippedCompleted = all.filter((m) => completed.has(m.id));
  const modules = all
    .filter((m) => !completed.has(m.id))
    .sort((a, b) => MODULE_TYPE_RANK[a.module_type] - MODULE_TYPE_RANK[b.module_type] || a.sort_order - b.sort_order);
  return { modules, missing: Array.from(missing), skippedCompleted };
}

/** Days a set of module minutes needs at about five teaching hours a day, plus a test day. */
export function suggestModuleDays(totalMinutes: number): number {
  return Math.max(2, Math.ceil(totalMinutes / 300) + 1);
}

export function buildPlanItems(opts: PlanBuildOptions): PlanBuildResult {
  const warnings: string[] = [];
  const { modules, missing, skippedCompleted } = resolvePlanModules(opts);
  const moduleDays = Math.max(1, Math.floor(opts.moduleDays));
  const totalDays = Math.max(moduleDays, Math.floor(opts.totalDays));
  const items: DraftItem[] = [];

  const moduleItem = (m: LmsModule, day: number): DraftItem => ({
    key: nextKey(), day_no: day, item_type: "module", module_id: m.id, module_code: m.code,
    module_version: m.version, title: m.title, test_kind: null, minutes: m.duration_minutes,
  });
  const simpleItem = (type: LmsItemType, title: string, day: number, testKind: LmsTestKind | null = null, minutes = 0): DraftItem => ({
    key: nextKey(), day_no: day, item_type: type, module_id: null, module_code: null, module_version: null,
    title, test_kind: testKind, minutes,
  });

  // Test days inside the module days; the last module day always carries the final test.
  let tests = Array.from(new Set(opts.testDays.filter((d) => d >= 1 && d <= moduleDays))).sort((a, b) => a - b);
  if (tests.length === 0 || tests[tests.length - 1] !== moduleDays) tests.push(moduleDays);
  if (moduleDays <= 2) tests = [moduleDays];
  const finalDay = tests[tests.length - 1];
  const midTests = tests.slice(0, -1);

  // Orientation blocks take a day each, in order.
  const companyMods = modules.filter((m) => m.module_type === "company");
  const deptMods = modules.filter((m) => m.module_type === "department" || m.module_type === "subdepartment");
  const platformMods = modules.filter((m) => m.module_type === "platform");
  const skillMods = modules.filter((m) => MODULE_TYPE_RANK[m.module_type] >= 4);

  const blocked = new Set<number>([...tests]);
  let day = 1;
  const nextFreeDay = () => {
    while (blocked.has(day) && day < finalDay) day++;
    return day;
  };
  for (const block of [companyMods, deptMods, platformMods]) {
    if (block.length === 0) continue;
    const d = Math.min(nextFreeDay(), Math.max(1, finalDay - 1));
    block.forEach((m) => items.push(moduleItem(m, d)));
    blocked.add(d);
    day = d + 1;
  }

  // Practice days right before the final test (two on longer plans, one on medium ones).
  const practiceCount = opts.planType === "induction" ? (finalDay >= 10 ? 2 : finalDay >= 6 ? 1 : 0) : finalDay >= 8 ? 1 : 0;
  const practiceDays: number[] = [];
  for (let d = finalDay - 1; d >= day && practiceDays.length < practiceCount; d--) {
    if (!blocked.has(d)) practiceDays.unshift(d);
  }
  practiceDays.forEach((d) => blocked.add(d));

  const skillDays: number[] = [];
  for (let d = day; d < finalDay; d++) if (!blocked.has(d)) skillDays.push(d);

  if (skillMods.length > 0) {
    if (skillDays.length === 0) {
      const fallback = Math.max(1, finalDay - 1);
      warnings.push(`No free day was left for skill modules, so they were all put on day ${fallback}. Add module days.`);
      skillMods.forEach((m) => items.push(moduleItem(m, fallback)));
    } else if (skillMods.length <= skillDays.length) {
      // Fewer modules than days: one module a day, spread across the range; the gaps become practice.
      const n = skillMods.length;
      skillMods.forEach((m, i) => {
        const slot = n === 1 ? 0 : Math.round((i * (skillDays.length - 1)) / (n - 1));
        items.push(moduleItem(m, skillDays[slot]));
      });
    } else {
      // More modules than days: fill the days in teaching order. Each day aims at an equal share of the
      // teaching time still left, takes a module while its midpoint fits that share, always takes at
      // least one, and leaves at least one module for every day after it.
      let idx = 0;
      for (let d = 0; d < skillDays.length && idx < skillMods.length; d++) {
        const daysLeft = skillDays.length - d;
        const remaining = skillMods.slice(idx).reduce((s, m) => s + m.duration_minutes, 0);
        const target = remaining / daysLeft;
        const maxTake = Math.max(1, skillMods.length - idx - (daysLeft - 1));
        let load = 0;
        let take = 0;
        while (idx < skillMods.length && take < maxTake) {
          const m = skillMods[idx];
          if (take > 0 && load + m.duration_minutes / 2 > target) break;
          items.push(moduleItem(m, skillDays[d]));
          load += m.duration_minutes;
          take++;
          idx++;
        }
      }
    }
  }

  // Days left without modules become practice / shadowing days.
  const usedDays = new Set(items.map((i) => i.day_no));
  for (const d of skillDays) if (!usedDays.has(d)) items.push(simpleItem("practice", "Practice and shadowing on the live desk", d));
  for (const d of practiceDays) items.push(simpleItem("practice", "Supervised practice and mock cases", d));

  midTests.forEach((d, i) => {
    items.push(simpleItem("practice", "Revision before the test", d));
    items.push(simpleItem("test", midTests.length > 1 ? `Test ${i + 1}` : "Test 1", d, "mid"));
  });
  items.push(simpleItem("test", "Final test", finalDay, "final"));

  // Any module day still empty (for example when orientation is off) gets revision.
  const filled = new Set(items.map((i) => i.day_no));
  for (let d = 1; d <= moduleDays; d++) if (!filled.has(d)) items.push(simpleItem("practice", "Revision and shadowing", d));

  for (let d = moduleDays + 1; d <= totalDays; d++) items.push(simpleItem("live", "Supervised live orders", d));

  if (missing.length > 0) warnings.push(`${missing.length} module(s) the KRAs need are not in the library yet: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}.`);
  if (modules.length === 0 && opts.kraCodes.length > 0) {
    warnings.push(
      skippedCompleted.length > 0
        ? "This person already completed every module for these KRAs. To teach them again (for a refresher), untick \"Leave out modules this person already completed\"."
        : "No modules were found for these KRAs. Import the KRA catalogue in LMS Settings first.",
    );
  }

  return { items: orderItems(items), modules, missing, skippedCompleted, warnings };
}

const ITEM_RANK: Record<LmsItemType, number> = { note: 0, module: 1, practice: 2, test: 3, live: 4 };

/** Sorts items by day, then modules (teaching order), practice, tests, live work. */
export function orderItems<T extends { day_no: number; item_type: LmsItemType }>(items: T[]): T[] {
  return items
    .map((it, idx) => ({ it, idx }))
    .sort((a, b) => a.it.day_no - b.it.day_no || ITEM_RANK[a.it.item_type] - ITEM_RANK[b.it.item_type] || a.idx - b.idx)
    .map(({ it }) => it);
}

/** Minutes of module work per day, for overload warnings. */
export function minutesByDay(items: { day_no: number; minutes: number }[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const it of items) out.set(it.day_no, (out.get(it.day_no) ?? 0) + (it.minutes || 0));
  return out;
}

/**
 * The tests that decide the outcome, in order: the final test and every retest on or after the
 * final test's day. A test added earlier (for example after a failed mid test) doesn't decide.
 */
export function decidingTests<T extends { item_type: string; test_kind: string | null; day_no: number; sort_order: number }>(items: T[]): T[] {
  const tests = items.filter((i) => i.item_type === "test");
  const finals = tests.filter((i) => i.test_kind === "final");
  const firstFinalDay = finals.length ? Math.min(...finals.map((i) => i.day_no)) : -Infinity;
  return tests
    .filter((i) => (i.test_kind === "final" || i.test_kind === "retest") && i.day_no >= firstFinalDay)
    .sort((a, b) => a.day_no - b.day_no || a.sort_order - b.sort_order);
}

/** Day of the first final test, or null when the plan has none. */
export function firstFinalTestDay(items: { item_type: string; test_kind: string | null; day_no: number }[]): number | null {
  const days = items.filter((i) => i.item_type === "test" && i.test_kind === "final").map((i) => i.day_no);
  return days.length ? Math.min(...days) : null;
}
