import { PLATFORM_MODULE_CODE } from "./constants";
import type { LmsKra, LmsModule, LmsModuleKra, LmsPlan, LmsPlanItem } from "./types";

/** KRA code → ids of the skill modules linked to it in the catalogue. */
export function linkedModulesByKra(links: LmsModuleKra[] | undefined): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const l of links ?? []) {
    if (!out.has(l.kra_code)) out.set(l.kra_code, new Set());
    out.get(l.kra_code)!.add(l.module_id);
  }
  return out;
}

/**
 * Does a module teach, or orient for, a KRA? Skill modules count through their
 * catalogue link; the company, department, sub-department and platform modules
 * count for every KRA in their area.
 */
export function moduleServesKra(m: Pick<LmsModule, "id" | "code" | "module_type">, kra: LmsKra | undefined, linkedIds: Set<string> | undefined): boolean {
  if (linkedIds?.has(m.id)) return true;
  if (m.module_type === "company") return true;
  if (!kra) return false;
  if (m.module_type === "department") return m.code === `${kra.department_code}-OR`;
  if (m.module_type === "subdepartment") return m.code === `${kra.subdepartment_code}-OR`;
  if (m.module_type === "platform") return !!kra.platform && m.code === PLATFORM_MODULE_CODE[kra.platform];
  return false;
}

/** Current versions of the active modules behind a KRA, used when a certificate is renewed after a refresher. */
export function currentVersionsForKra(
  kra: LmsKra | undefined,
  linkedIds: Set<string> | undefined,
  modules: LmsModule[] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of modules ?? []) {
    if (m.is_active && m.status !== "retired" && moduleServesKra(m, kra, linkedIds)) out[m.code] = m.version;
  }
  return out;
}

/**
 * Modules a person has completed in their other plans: taught ("done") and, when the module has a
 * practical checklist, signed off as passed. Cancelled plans and plans closed as "exit recommended"
 * don't count, so a second-chance plan teaches everything again.
 */
export function completedModuleIds(
  employeeId: string,
  plans: Pick<LmsPlan, "id" | "employee_id" | "status" | "outcome">[] | undefined,
  items: Pick<LmsPlanItem, "plan_id" | "item_type" | "status" | "module_id" | "signoff_result">[] | undefined,
  withChecklist: Set<string> | undefined,
  excludePlanId?: string,
): Set<string> {
  const counted = new Set(
    (plans ?? [])
      .filter((p) => p.employee_id === employeeId && p.id !== excludePlanId && p.status !== "cancelled" && p.outcome !== "exit_recommended")
      .map((p) => p.id),
  );
  const out = new Set<string>();
  for (const i of items ?? []) {
    if (!counted.has(i.plan_id) || i.item_type !== "module" || i.status !== "done" || !i.module_id) continue;
    if (withChecklist?.has(i.module_id) && i.signoff_result !== "passed") continue;
    out.add(i.module_id);
  }
  return out;
}
