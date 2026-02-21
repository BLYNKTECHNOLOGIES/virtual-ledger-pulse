import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Building2, Briefcase, User, ChevronDown, ChevronRight, Users,
  ZoomIn, ZoomOut, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Search,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* ── Types ── */

interface PosTreeNode {
  id: string;
  title: string;
  level: number | null;
  deptName: string;
  deptCode: string;
  employeeCount: number;
  children: PosTreeNode[];
}

interface EmpChartNode {
  id: string;
  name: string;
  designation: string;
  department: string;
  profileUrl: string | null;
  children: EmpChartNode[];
  collapsed?: boolean;
}

/* ── Position Tree Item (tree/list view) ── */

function PosTreeItem({ node, depth = 0 }: { node: PosTreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 3);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
        style={{ paddingLeft: `${depth * 28 + 12}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : <span className="w-3.5 shrink-0" />}
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Briefcase className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-sm font-medium text-foreground truncate">{node.title}</span>
        <Badge variant="outline" className="text-[10px] shrink-0">{node.deptCode}</Badge>
        {node.level != null && <span className="text-[10px] text-muted-foreground shrink-0">L{node.level}</span>}
        <span className="text-[10px] text-muted-foreground font-mono shrink-0 ml-auto">
          {hasChildren ? `${node.children.length} sub` : ""}
        </span>
      </div>
      {expanded && hasChildren && (
        <div className="border-l-2 border-primary/10" style={{ marginLeft: `${depth * 28 + 26}px` }}>
          {node.children.map(c => <PosTreeItem key={c.id} node={c} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

/* ── Visual Org Chart Card ── */

function OrgChartCard({
  node,
  onToggle,
  highlightId,
}: {
  node: EmpChartNode;
  onToggle: (id: string) => void;
  highlightId: string | null;
}) {
  const hasChildren = node.children.length > 0;
  const isHighlighted = highlightId === node.id;
  const isCollapsed = node.collapsed;

  return (
    <div className="flex flex-col items-center">
      {/* Card */}
      <div
        className={`relative border rounded-lg px-5 py-3 min-w-[160px] max-w-[200px] text-center transition-all cursor-pointer
          ${isHighlighted
            ? "border-primary bg-primary/10 ring-2 ring-primary/40 shadow-lg"
            : "border-border bg-[hsl(20,80%,95%)] dark:bg-accent/30 hover:shadow-md"
          }`}
        onClick={() => hasChildren && onToggle(node.id)}
      >
        <p className="text-sm font-semibold text-foreground truncate">{node.name}</p>
        <p className="text-xs text-muted-foreground truncate">{node.designation || "Not set"}</p>
        {hasChildren && (
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-10">
            <div className="h-4 w-4 rounded-full bg-background border border-border flex items-center justify-center">
              {isCollapsed ? (
                <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Connector line down */}
      {hasChildren && !isCollapsed && (
        <>
          <div className="w-px h-6 bg-border" />
          {/* Horizontal line + children */}
          <div className="relative flex items-start">
            {/* Horizontal connector */}
            {/* spacer */}
            <div className="flex gap-0 items-start relative">
              {/* Full-width horizontal line across all children */}
              {node.children.length > 1 && (
                <div className="absolute top-0 left-[calc(50%/var(--child-count))] right-[calc(50%/var(--child-count))] h-px bg-border"
                  style={{
                    // We position from first child center to last child center
                    left: `${100 / (2 * node.children.length)}%`,
                    right: `${100 / (2 * node.children.length)}%`,
                  }}
                />
              )}
              {node.children.map((child) => (
                <div key={child.id} className="flex flex-col items-center px-2">
                  {/* Vertical line from horizontal connector to child card */}
                  <div className="w-px h-6 bg-border" />
                  <OrgChartCard
                    node={child}
                    onToggle={onToggle}
                    highlightId={highlightId}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main Component ── */

export function OrgChartView() {
  const [posTree, setPosTree] = useState<PosTreeNode[]>([]);
  const [empNodes, setEmpNodes] = useState<EmpChartNode[]>([]);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Employee chart controls
  const [search, setSearch] = useState("");
  const [managerFilter, setManagerFilter] = useState<string>("all");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const chartRef = useRef<HTMLDivElement>(null);

  // Raw data for building trees
  const [rawEmployees, setRawEmployees] = useState<any[]>([]);
  const [rawWorkInfos, setRawWorkInfos] = useState<any[]>([]);
  const [rawPositions, setRawPositions] = useState<any[]>([]);
  const [rawDepts, setRawDepts] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [posRes, deptRes, empRes, wiRes] = await Promise.all([
        supabase.from("positions").select("id, title, department_id, hierarchy_level, reports_to_position_id").eq("is_active", true),
        supabase.from("departments").select("id, name, code").eq("is_active", true),
        supabase.from("hr_employees").select("id, first_name, last_name, badge_id, profile_image_url, is_active").eq("is_active", true),
        supabase.from("hr_employee_work_info").select("employee_id, department_id, job_position_id, reporting_manager_id, job_role"),
      ]);

      const positions = posRes.data || [];
      const depts = deptRes.data || [];
      const employees = empRes.data || [];
      const workInfos = wiRes.data || [];

      setRawEmployees(employees);
      setRawWorkInfos(workInfos);
      setRawPositions(positions);
      setRawDepts(depts);

      const deptMap = new Map(depts.map(d => [d.id, d]));

      // Build position hierarchy tree
      const posMap = new Map<string, PosTreeNode>();
      positions.forEach(p => {
        const dept = deptMap.get(p.department_id) || { name: "Unknown", code: "?" };
        posMap.set(p.id, {
          id: p.id, title: p.title, level: p.hierarchy_level,
          deptName: dept.name, deptCode: dept.code,
          employeeCount: workInfos.filter(w => w.job_position_id === p.id).length,
          children: [],
        });
      });
      const posRoots: PosTreeNode[] = [];
      positions.forEach(p => {
        const node = posMap.get(p.id)!;
        if (p.reports_to_position_id && posMap.has(p.reports_to_position_id)) {
          posMap.get(p.reports_to_position_id)!.children.push(node);
        } else {
          posRoots.push(node);
        }
      });
      const sortPos = (nodes: PosTreeNode[]) => {
        nodes.sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || a.title.localeCompare(b.title));
        nodes.forEach(n => sortPos(n.children));
      };
      sortPos(posRoots);
      setPosTree(posRoots);

      setLoading(false);
    }
    load();
  }, []);

  // Build employee chart tree based on reporting_manager_id from work_info
  const { empTree, managers } = useMemo(() => {
    const posMap = new Map(rawPositions.map(p => [p.id, p]));
    const deptMap = new Map(rawDepts.map(d => [d.id, d]));
    const wiByEmp = new Map(rawWorkInfos.map(w => [w.employee_id, w]));

    const nodeMap = new Map<string, EmpChartNode>();
    rawEmployees.forEach(e => {
      const wi = wiByEmp.get(e.id);
      const pos = wi?.job_position_id ? posMap.get(wi.job_position_id) : null;
      const dept = wi?.department_id ? deptMap.get(wi.department_id) : null;
      nodeMap.set(e.id, {
        id: e.id,
        name: `${e.first_name} ${e.last_name}`.trim(),
        designation: pos?.title || wi?.job_role || "Not set",
        department: dept?.name || "",
        profileUrl: e.profile_image_url,
        children: [],
        collapsed: collapsedIds.has(e.id),
      });
    });

    // Identify managers (employees who have someone reporting to them)
    const managerIds = new Set<string>();
    rawWorkInfos.forEach(w => {
      if (w.reporting_manager_id) managerIds.add(w.reporting_manager_id);
    });
    const managerList = rawEmployees
      .filter(e => managerIds.has(e.id))
      .map(e => ({ id: e.id, name: `${e.first_name} ${e.last_name}`.trim() }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Build tree
    const roots: EmpChartNode[] = [];
    nodeMap.forEach((node, id) => {
      const wi = wiByEmp.get(id);
      const managerId = wi?.reporting_manager_id;
      if (managerId && nodeMap.has(managerId)) {
        nodeMap.get(managerId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    // Sort children
    const sortChildren = (nodes: EmpChartNode[]) => {
      nodes.sort((a, b) => a.name.localeCompare(b.name));
      nodes.forEach(n => sortChildren(n.children));
    };
    sortChildren(roots);

    return { empTree: roots, managers: managerList };
  }, [rawEmployees, rawWorkInfos, rawPositions, rawDepts, collapsedIds]);

  // Filter tree by manager
  const filteredTree = useMemo(() => {
    if (managerFilter === "all") return empTree;
    // Find the selected manager node and show their subtree
    const findNode = (nodes: EmpChartNode[]): EmpChartNode | null => {
      for (const n of nodes) {
        if (n.id === managerFilter) return n;
        const found = findNode(n.children);
        if (found) return found;
      }
      return null;
    };
    const root = findNode(empTree);
    return root ? [root] : empTree;
  }, [empTree, managerFilter]);

  // Search highlight
  const highlightId = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const findMatch = (nodes: EmpChartNode[]): string | null => {
      for (const n of nodes) {
        if (n.name.toLowerCase().includes(q) || n.designation.toLowerCase().includes(q)) return n.id;
        const found = findMatch(n.children);
        if (found) return found;
      }
      return null;
    };
    return findMatch(filteredTree);
  }, [search, filteredTree]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleZoom = (dir: "in" | "out") => {
    setZoom(z => dir === "in" ? Math.min(z + 0.15, 2) : Math.max(z - 0.15, 0.3));
  };

  const handlePan = (dir: "up" | "down" | "left" | "right") => {
    const step = 80;
    setPan(p => ({
      x: p.x + (dir === "left" ? step : dir === "right" ? -step : 0),
      y: p.y + (dir === "up" ? step : dir === "down" ? -step : 0),
    }));
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" /></div>;

  return (
    <Tabs defaultValue="position" className="space-y-4">
      <TabsList>
        <TabsTrigger value="position" className="gap-1.5"><Briefcase className="h-3.5 w-3.5" />Position Hierarchy</TabsTrigger>
        <TabsTrigger value="employee" className="gap-1.5"><Users className="h-3.5 w-3.5" />Employee Hierarchy</TabsTrigger>
      </TabsList>

      {/* Position Hierarchy - tree/list view */}
      <TabsContent value="position">
        {posTree.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <Building2 className="h-10 w-10 mx-auto opacity-20 mb-2" />
            No positions found
          </div>
        ) : (
          <div className="border border-border rounded-lg p-3 bg-muted/5">
            {posTree.map(n => <PosTreeItem key={n.id} node={n} />)}
          </div>
        )}
      </TabsContent>

      {/* Employee Hierarchy - visual org chart */}
      <TabsContent value="employee">
        {/* Controls bar */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">Reporting Managers :</span>
            <Select value={managerFilter} onValueChange={setManagerFilter}>
              <SelectTrigger className="w-[200px] h-8 text-sm">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {managers.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1" />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 w-[200px] text-sm"
            />
          </div>
        </div>

        {/* Chart area */}
        <div className="relative border border-border rounded-lg bg-muted/5 overflow-hidden" style={{ minHeight: "500px" }}>
          {/* Zoom & pan controls */}
          <div className="absolute top-3 right-3 z-20 flex flex-col gap-1">
            <div className="flex gap-0.5">
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleZoom("in")}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleZoom("out")}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-0.5 mt-1">
              <Button variant="outline" size="icon" className="h-7 w-7 col-span-2 mx-auto" onClick={() => handlePan("up")}>
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handlePan("left")}>
                <ArrowLeft className="h-3 w-3" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handlePan("right")}>
                <ArrowRight className="h-3 w-3" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7 col-span-2 mx-auto" onClick={() => handlePan("down")}>
                <ArrowDown className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Chart canvas */}
          <div
            ref={chartRef}
            className="overflow-auto p-8"
            style={{ maxHeight: "70vh" }}
          >
            <div
              className="inline-flex flex-col items-center transition-transform duration-200 origin-top-left"
              style={{
                transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
                minWidth: "max-content",
              }}
            >
              {filteredTree.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  <Users className="h-10 w-10 mx-auto opacity-20 mb-2" />
                  No active employees found
                </div>
              ) : (
                filteredTree.map(root => (
                  <OrgChartCard
                    key={root.id}
                    node={root}
                    onToggle={toggleCollapse}
                    highlightId={highlightId}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
