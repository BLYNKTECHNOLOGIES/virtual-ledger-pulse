/**
 * Designations (rows of public.positions) and the company grade ladder.
 *
 * positions.hierarchy_level holds the company grade number: 1 = most senior … 8 = Associate
 * (L8 Associate, L7 Executive, L6 Manager, L5 Head of Department, L4 General Manager); null = not graded.
 * positions.reports_to_position_id is the designed structure (JD Compendium); people's real managers
 * live on hr_employee_work_info.reporting_manager_id and are shown separately.
 */

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

/** Flatten a tree to rows with their depth, in display order. */
export function flattenStructure<T>(nodes: StructureNode<T>[], depth = 0, out: { node: StructureNode<T>; depth: number }[] = []) {
  nodes.forEach((n) => {
    out.push({ node: n, depth });
    flattenStructure(n.children, depth + 1, out);
  });
  return out;
}
