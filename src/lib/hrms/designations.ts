/**
 * Designations (rows of public.positions) and the company grade ladder.
 *
 * positions.hierarchy_level holds the company grade number: 1 = most senior … 8 = Associate
 * (L8 Associate, L7 Executive, L6 Manager, L5 Head of Department, L4 General Manager); null = not graded.
 * positions.reports_to_position_id is the designed structure (JD Compendium); people's real managers
 * live on hr_employee_work_info.reporting_manager_id and are shown separately.
 */
import type { QueryClient } from "@tanstack/react-query";

export const GRADE_NAMES: Record<number, string> = {
  8: "Associate",
  7: "Executive",
  6: "Manager",
  5: "Head of Department",
  4: "General Manager",
};

/** Grades offered in pickers, most junior first. */
export const GRADE_OPTIONS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

export const gradeShort = (g?: number | null): string | null => (g ? `L${g}` : null);

export const gradeLabel = (g?: number | null): string =>
  g ? `L${g}${GRADE_NAMES[g] ? ` · ${GRADE_NAMES[g]}` : ""}` : "Not graded";

export interface DesignationRow {
  id: string;
  title: string;
  department_id: string | null;
  hierarchy_level: number | null;
  reports_to_position_id: string | null;
  is_active: boolean | null;
  in_workforce_planning?: boolean | null;
}

/** The designation and everything below it in the designed structure — it can't report to any of these. */
export function designationSubtree(rows: Pick<DesignationRow, "id" | "reports_to_position_id">[], id: string): Set<string> {
  const kids = new Map<string, string[]>();
  rows.forEach((r) => {
    if (!r.reports_to_position_id) return;
    const list = kids.get(r.reports_to_position_id) || [];
    list.push(r.id);
    kids.set(r.reports_to_position_id, list);
  });
  const out = new Set<string>();
  const walk = (x: string) => {
    if (out.has(x)) return;
    out.add(x);
    (kids.get(x) || []).forEach(walk);
  };
  walk(id);
  return out;
}

export interface StructureNode<T> {
  row: T;
  children: StructureNode<T>[];
  /** Number of designations in this node's tree, itself included. */
  size: number;
}

/** Senior first (L1 … L8), ungraded after graded, then by title. */
export function compareDesignations(a: Pick<DesignationRow, "hierarchy_level" | "title">, b: Pick<DesignationRow, "hierarchy_level" | "title">): number {
  const ga = a.hierarchy_level ?? 99;
  const gb = b.hierarchy_level ?? 99;
  return ga - gb || a.title.localeCompare(b.title);
}

/**
 * The designed structure as a tree of active designations. A designation whose "reports to" is missing,
 * inactive or part of a loop becomes a top-level entry, so nothing is ever hidden. Top-level entries are
 * ordered by the size of their tree (the main chart first), then like siblings.
 */
export function buildStructure<T extends DesignationRow>(rows: T[]): StructureNode<T>[] {
  const active = rows.filter((r) => r.is_active !== false);
  const byId = new Map(active.map((r) => [r.id, r]));
  const nodes = new Map<string, StructureNode<T>>(active.map((r) => [r.id, { row: r, children: [], size: 1 }]));

  // A parent counts only if following "reports to" from it never comes back round to the row itself.
  const parentOf = (r: T): string | null => {
    const p = r.reports_to_position_id;
    if (!p || p === r.id || !byId.has(p)) return null;
    const seen = new Set<string>();
    let cur: string | null = p;
    while (cur && !seen.has(cur)) {
      if (cur === r.id) return null;
      seen.add(cur);
      const next = byId.get(cur)?.reports_to_position_id ?? null;
      cur = next && byId.has(next) ? next : null;
    }
    return p;
  };

  const roots: StructureNode<T>[] = [];
  active.forEach((r) => {
    const node = nodes.get(r.id)!;
    const p = parentOf(r);
    if (p) nodes.get(p)!.children.push(node);
    else roots.push(node);
  });

  const finish = (n: StructureNode<T>): number => {
    n.children.sort((a, b) => compareDesignations(a.row, b.row));
    n.size = 1 + n.children.reduce((s, c) => s + finish(c), 0);
    return n.size;
  };
  roots.forEach(finish);
  roots.sort((a, b) => b.size - a.size || compareDesignations(a.row, b.row));
  return roots;
}

/**
 * The designation a title points to (e.g. RazorpayX's): same title with case and spacing ignored, in the first
 * preferred department that has one, else any. Pass active designations only. Null when none has that title.
 */
export function designationByTitle<T extends { id: string; title: string; department_id: string | null }>(
  rows: readonly T[],
  title: string,
  preferDepartments: (string | null | undefined)[] = [],
): T | null {
  const norm = (s: string) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const want = norm(title);
  if (!want) return null;
  const named = rows.filter((r) => norm(r.title) === want);
  for (const d of preferDepartments) {
    const hit = d ? named.find((r) => r.department_id === d) : undefined;
    if (hit) return hit;
  }
  return named[0] ?? null;
}

/** Plain words for a refused delete of a designation or a department (foreign-key errors otherwise show raw). */
export function deleteRefusalText(e: { code?: string; message?: string } | null | undefined, what: "designation" | "department"): string {
  const msg = String(e?.message || "");
  if (e?.code === "23503" && msg.includes("reports_to_position_id")) {
    return what === "designation"
      ? "Other designations report to this one. Change their Reports to on the Designations tab first."
      : "A designation in another department reports to one of this department's designations. Change its Reports to on the Designations tab first.";
  }
  if (e?.code === "23503") {
    return what === "designation"
      ? "This designation is still used elsewhere (past employees, onboarding or a quiz test), so it can't be deleted. Mark it tentative instead."
      : "This department is still used elsewhere (past employees, onboarding or other records), so it can't be deleted. Switch it to Inactive instead.";
  }
  return `Failed to delete the ${what}: ${msg || "unknown error"}`;
}

/**
 * Designation and department edits spread through database triggers (holders' title, grade and department,
 * JDs, RACI roles, ERP logins). Refresh every screen that shows one of those copies.
 */
export function invalidateDesignationCopies(qc: QueryClient) {
  const keys = [
    ["hr_positions"], ["positions_list"], ["designations-list-stage5"], ["hr_departments"], ["departments_list"],
    ["hr_job_descriptions"], ["raci-roles"], ["hr_employee_work_info"], ["hr_employee_work_infos"],
    ["pos_for_emp"], ["dept_for_emp"], ["org_directory"],
  ];
  keys.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
}

/** Flatten a tree to rows with their depth, in display order. */
export function flattenStructure<T>(nodes: StructureNode<T>[], depth = 0, out: { node: StructureNode<T>; depth: number }[] = []) {
  nodes.forEach((n) => {
    out.push({ node: n, depth });
    flattenStructure(n.children, depth + 1, out);
  });
  return out;
}
