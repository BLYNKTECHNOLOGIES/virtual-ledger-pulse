import { describe, expect, it } from "vitest";
import { buildStructure, compareDesignations, designationSubtree, flattenStructure, gradeLabel, gradeShort, type DesignationRow } from "./designations";

const row = (id: string, title: string, reports: string | null, grade: number | null = null, active = true): DesignationRow => ({
  id, title, department_id: null, hierarchy_level: grade, reports_to_position_id: reports, is_active: active,
});

describe("grades", () => {
  it("labels grades with the company names and leaves ungraded ones plain", () => {
    expect(gradeLabel(8)).toBe("L8 · Associate");
    expect(gradeLabel(5)).toBe("L5 · Head of Department");
    expect(gradeLabel(2)).toBe("L2");
    expect(gradeLabel(null)).toBe("Not graded");
    expect(gradeShort(7)).toBe("L7");
    expect(gradeShort(null)).toBe(null);
  });

  it("orders senior grades first, ungraded last, then by title", () => {
    const list = [row("a", "Office Help", null), row("b", "HR Executive", null, 7), row("c", "Accounts Manager", null, 6), row("d", "Banking Officer", null, 7)];
    expect([...list].sort(compareDesignations).map((r) => r.title)).toEqual(["Accounts Manager", "Banking Officer", "HR Executive", "Office Help"]);
  });
});

describe("buildStructure", () => {
  const rows = [
    row("md", "Managing Director", null),
    row("ceo", "Chief Executive Officer", "md"),
    row("gm", "General Manager", "ceo", 4),
    row("om", "Operations Manager", "oh", 6),
    row("oh", "Operations Head", "gm", 5),
    row("oe", "Operations Executive", "om", 7),
    row("oa", "Operations Associate", "oe", 8),
    row("hr", "HR Manager", "gm", 6),
    row("dir", "Director", null),
    row("old", "Purchase Executive", null, 7, false),
  ];

  it("nests active designations by reports-to with the main chart first", () => {
    const tree = buildStructure(rows);
    expect(tree.map((n) => n.row.id)).toEqual(["md", "dir"]);
    const flat = flattenStructure(tree).map((x) => `${"-".repeat(x.depth)}${x.node.row.id}`);
    expect(flat).toEqual(["md", "-ceo", "--gm", "---oh", "----om", "-----oe", "------oa", "---hr", "dir"]);
    expect(tree[0].size).toBe(8);
  });

  it("leaves out inactive designations and lifts their reports to the top", () => {
    const tree = buildStructure([...rows, row("x", "Purchase Associate", "old", 8)]);
    expect(tree.map((n) => n.row.id)).toContain("x");
    expect(flattenStructure(tree).some((x) => x.node.row.id === "old")).toBe(false);
  });

  it("never loses a designation caught in a loop", () => {
    const loop = [row("a", "A", "b"), row("b", "B", "a"), row("c", "C", "a")];
    const flat = flattenStructure(buildStructure(loop)).map((x) => x.node.row.id).sort();
    expect(flat).toEqual(["a", "b", "c"]);
    const tree = buildStructure(loop);
    const a = tree.find((n) => n.row.id === "a")!;
    expect(a.children.map((n) => n.row.id)).toEqual(["c"]);
  });
});

describe("designationSubtree", () => {
  it("returns the designation and everything below it", () => {
    const rows = [row("gm", "GM", null), row("oh", "OH", "gm"), row("om", "OM", "oh"), row("hr", "HR", "gm")];
    expect([...designationSubtree(rows, "oh")].sort()).toEqual(["oh", "om"]);
    expect([...designationSubtree(rows, "gm")].sort()).toEqual(["gm", "hr", "oh", "om"]);
  });
});
