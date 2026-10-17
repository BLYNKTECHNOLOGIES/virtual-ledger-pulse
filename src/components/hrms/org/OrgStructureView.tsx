import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Network, Pencil, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCell, MetricStrip } from "@/components/ats/AtsUi";
import { usePositionPlanningStatus, type PositionPlanningStatus } from "@/hooks/hrms/useWorkforcePlanning";
import { buildStructure, flattenStructure, gradeLabel, gradeShort, type DesignationRow, type StructureNode } from "@/lib/hrms/designations";
import { cn } from "@/lib/utils";

const PLANNING_TEXT: Record<PositionPlanningStatus, string> = {
  planned: "Planned",
  no_staff_needed: "No staff needed",
  undecided: "Not decided",
  outside: "Outside planning",
};
const PLANNING_TONE: Record<PositionPlanningStatus, string> = {
  planned: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  no_staff_needed: "border-border bg-muted text-muted-foreground",
  undecided: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  outside: "border-border bg-muted text-muted-foreground",
};

type Row = DesignationRow & { title: string };

/**
 * The designed structure: every active designation under the one it reports to (JD Compendium),
 * with its grade, department, the people holding it and its workforce-planning decision.
 * People's actual managers are shown on the Reporting lines tab.
 */
export function OrgStructureView({ onEditDesignations }: { onEditDesignations?: () => void }) {
  const positions = useQuery({
    queryKey: ["hr_positions", "structure"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("id, title, department_id, hierarchy_level, reports_to_position_id, is_active, in_workforce_planning")
        .order("title");
      if (error) throw error;
      return (data || []) as Row[];
    },
  });
  const departments = useQuery({
    queryKey: ["hr_departments", "structure"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name, code, is_active").order("name");
      if (error) throw error;
      return data || [];
    },
  });
  // Active employees only (security-definer directory, so everyone sees the same chart).
  const people = useQuery({
    queryKey: ["org_directory"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("hr_org_chart_directory");
      if (error) throw error;
      return (data || []) as { id: string; first_name: string | null; last_name: string | null; job_position_id: string | null }[];
    },
  });
  const planning = usePositionPlanningStatus();

  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const deptName = useMemo(() => new Map((departments.data || []).map((d: any) => [d.id, d.name as string])), [departments.data]);
  const holders = useMemo(() => {
    const m = new Map<string, string[]>();
    (people.data || []).forEach((p) => {
      if (!p.job_position_id) return;
      const list = m.get(p.job_position_id) || [];
      list.push([p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Unnamed");
      m.set(p.job_position_id, list);
    });
    return m;
  }, [people.data]);

  const tree = useMemo(() => buildStructure(positions.data || []), [positions.data]);
  const all = useMemo(() => flattenStructure(tree), [tree]);

  // Search / department filter: matching designations plus the chain above them.
  const q = search.trim().toLowerCase();
  const filtering = q.length > 0 || dept !== "all";
  const { visible, matches } = useMemo(() => {
    const matches = new Set<string>();
    const visible = new Set<string>();
    if (!filtering) return { visible, matches };
    const walk = (n: StructureNode<Row>, chain: string[]) => {
      const hit = (!q || n.row.title.toLowerCase().includes(q)) && (dept === "all" || n.row.department_id === dept);
      if (hit) {
        matches.add(n.row.id);
        [...chain, n.row.id].forEach((id) => visible.add(id));
      }
      n.children.forEach((c) => walk(c, [...chain, n.row.id]));
    };
    tree.forEach((n) => walk(n, []));
    return { visible, matches };
  }, [tree, q, dept, filtering]);

  // Rows to draw: hidden under a collapsed designation (only when not filtering).
  const rows = useMemo(() => {
    if (filtering) return all.filter((x) => visible.has(x.node.row.id));
    const out: typeof all = [];
    let hideBelow: number | null = null;
    all.forEach((x) => {
      if (hideBelow !== null && x.depth > hideBelow) return;
      hideBelow = collapsed.has(x.node.row.id) && x.node.children.length > 0 ? x.depth : null;
      out.push(x);
    });
    return out;
  }, [all, collapsed, filtering, visible]);

  const active = all.map((x) => x.node.row);
  const filled = active.filter((r) => (holders.get(r.id)?.length ?? 0) > 0).length;
  const ungraded = active.filter((r) => !r.hierarchy_level).length;
  const peopleState = people.isError && !people.data ? "error" : people.isLoading ? "loading" : "ready";

  const toggle = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (positions.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }
  if (positions.isError && !positions.data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        The structure couldn't load.{" "}
        <button className="font-medium underline underline-offset-2" onClick={() => positions.refetch()}>Try again</button>
      </div>
    );
  }
  if (active.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        <Network className="mx-auto mb-2 h-8 w-8 opacity-30" aria-hidden />
        No designations yet. Add them on the Designations tab.
      </div>
    );
  }

  const num = (n: number) => (peopleState === "loading" ? "…" : peopleState === "error" ? "—" : n);

  return (
    <div className="space-y-4">
      <MetricStrip className="sm:grid-cols-4 xl:grid-cols-4">
        <MetricCell label="Designations" value={active.length} helper="active, in the structure" />
        <MetricCell label="With people" value={num(filled)} helper={peopleState === "error" ? "people couldn't load" : "at least one person on roll"} />
        <MetricCell label="Vacant" value={num(active.length - filled)} helper="nobody holds it yet" />
        <MetricCell label="Not graded" value={ungraded} helper={ungraded ? "set a grade on the Designations tab" : "every designation has a grade"} />
      </MetricStrip>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search designations" aria-label="Search designations" className="h-9 pl-8 text-foreground" />
        </div>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="h-9 text-foreground" aria-label="Department"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {(departments.data || []).filter((d: any) => d.is_active !== false).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {!filtering && (
            collapsed.size > 0
              ? <Button variant="outline" className="h-9" onClick={() => setCollapsed(new Set())}><ChevronsUpDown className="h-4 w-4" />Expand all</Button>
              : <Button variant="outline" className="h-9" onClick={() => setCollapsed(new Set(all.filter((x) => x.depth >= 1 && x.node.children.length > 0).map((x) => x.node.row.id)))}><ChevronsDownUp className="h-4 w-4" />Collapse</Button>
          )}
          {onEditDesignations && <Button variant="outline" className="h-9" onClick={onEditDesignations}><Pencil className="h-4 w-4" />Edit designations</Button>}
        </div>
      </div>

      {filtering && matches.size === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No designation matches.</p>
      ) : (
        <div role="list" aria-label="Designed structure" className="overflow-hidden rounded-lg border border-border bg-card">
          {rows.map(({ node, depth }) => {
            const r = node.row;
            const names = holders.get(r.id) || [];
            const hasKids = node.children.length > 0;
            const isCollapsed = !filtering && collapsed.has(r.id);
            const st = planning.data?.get(r.id)?.status;
            const dim = filtering && !matches.has(r.id);
            return (
              <div
                key={r.id}
                role="listitem"
                aria-level={depth + 1}
                style={{ ["--d" as any]: Math.min(depth, 8) }}
                className={cn(
                  "grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-2 border-b border-border py-2.5 pr-3 last:border-b-0",
                  "pl-[calc(0.75rem+var(--d)*0.75rem)] sm:pl-[calc(0.75rem+var(--d)*1.5rem)]",
                  dim && "opacity-60",
                )}
              >
                {hasKids ? (
                  <button
                    type="button"
                    disabled={filtering}
                    onClick={() => toggle(r.id)}
                    aria-expanded={!isCollapsed}
                    aria-label={isCollapsed ? `Show designations under ${r.title}` : `Hide designations under ${r.title}`}
                    className="mt-0.5 flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                  >
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                ) : <span aria-hidden className="mt-2 ml-1.5 h-1.5 w-1.5 rounded-full bg-border" />}
                <div className="min-w-0">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
                    <p className={cn("break-words text-sm font-medium text-foreground", matches.has(r.id) && q && "text-primary")}>{r.title}</p>
                    <span
                      className={cn("whitespace-nowrap text-xs tabular-nums", names.length ? "font-medium text-foreground" : "text-muted-foreground")}
                      title={names.length ? names.join(", ") : undefined}
                    >
                      {peopleState === "loading" ? "…" : peopleState === "error" ? "—" : names.length
                        ? <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />{names.length} on roll</span>
                        : "Vacant"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span title={gradeLabel(r.hierarchy_level)}
                      className={cn("rounded border px-1.5 py-px font-medium tabular-nums", r.hierarchy_level ? "border-border text-foreground" : "border-dashed border-border")}>
                      {gradeShort(r.hierarchy_level) ?? "No grade"}
                    </span>
                    <span>{r.department_id ? deptName.get(r.department_id) ?? "Department" : "No department"}</span>
                    {st && <span className={cn("rounded-full border px-1.5 py-px font-medium", PLANNING_TONE[st])}>{PLANNING_TEXT[st]}</span>}
                    {isCollapsed && <span>· {node.size - 1} below</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Who each designation reports to, from the JD Compendium — set it on the Designations tab. People's actual managers are on Reporting lines.
      </p>
    </div>
  );
}
