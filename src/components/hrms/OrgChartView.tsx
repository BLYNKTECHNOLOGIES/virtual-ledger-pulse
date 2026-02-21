import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Building2, Briefcase, User, ChevronDown, ChevronRight, Users } from "lucide-react";
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

interface EmpNode {
  id: string;
  name: string;
  designation: string;
  department: string;
  children: EmpNode[];
}

/* ── Position Tree Node ── */

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
        {node.employeeCount > 0 && (
          <Badge variant="secondary" className="text-[10px] shrink-0 ml-auto gap-1">
            <User className="h-2.5 w-2.5" />{node.employeeCount}
          </Badge>
        )}
        {hasChildren && node.employeeCount === 0 && (
          <span className="text-[10px] text-muted-foreground font-mono shrink-0 ml-auto">{node.children.length} sub</span>
        )}
      </div>
      {expanded && hasChildren && (
        <div className="border-l-2 border-primary/10" style={{ marginLeft: `${depth * 28 + 26}px` }}>
          {node.children.map(c => <PosTreeItem key={c.id} node={c} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

/* ── Employee Tree Node ── */

function EmpTreeNode({ node, depth = 0 }: { node: EmpNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/20 transition-colors cursor-pointer"
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : <span className="w-3 shrink-0" />}
        <div className="h-6 w-6 rounded-full bg-muted/30 border border-border flex items-center justify-center shrink-0">
          <User className="h-3 w-3 text-muted-foreground" />
        </div>
        <span className="text-sm font-medium truncate text-foreground">{node.name}</span>
        <Badge variant="outline" className="text-[10px] shrink-0">{node.designation}</Badge>
        <span className="text-[10px] text-muted-foreground shrink-0">{node.department}</span>
        {hasChildren && <span className="text-[10px] text-muted-foreground font-mono shrink-0 ml-auto">{node.children.length}</span>}
      </div>
      {expanded && hasChildren && (
        <div className="border-l border-border/30" style={{ marginLeft: `${depth * 24 + 20}px` }}>
          {node.children.map(c => <EmpTreeNode key={c.id} node={c} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

/* ── Main Component ── */

export function OrgChartView() {
  const [posTree, setPosTree] = useState<PosTreeNode[]>([]);
  const [empTree, setEmpTree] = useState<EmpNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [posRes, deptRes, empRes] = await Promise.all([
        supabase.from("positions").select("id, title, department_id, hierarchy_level, reports_to_position_id").eq("is_active", true),
        supabase.from("departments").select("id, name, code").eq("is_active", true),
        supabase.from("employees").select("id, name, designation, department, department_id, position_id, reporting_manager_id, status").eq("status", "active"),
      ]);

      const positions = posRes.data || [];
      const depts = deptRes.data || [];
      const employees = empRes.data || [];

      const deptMap = new Map(depts.map(d => [d.id, d]));

      // Build position hierarchy tree
      const posMap = new Map<string, PosTreeNode>();
      positions.forEach(p => {
        const dept = deptMap.get(p.department_id) || { name: "Unknown", code: "?" };
        const empCount = employees.filter(e => e.position_id === p.id).length;
        posMap.set(p.id, {
          id: p.id,
          title: p.title,
          level: p.hierarchy_level,
          deptName: dept.name,
          deptCode: dept.code,
          employeeCount: empCount,
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

      // Build employee hierarchy tree
      const empMap = new Map<string, EmpNode>();
      employees.forEach(e => {
        empMap.set(e.id, {
          id: e.id, name: e.name, designation: e.designation, department: e.department,
          children: [],
        });
      });
      const empRoots: EmpNode[] = [];
      empMap.forEach((node, id) => {
        const emp = employees.find(e => e.id === id)!;
        if (emp.reporting_manager_id && empMap.has(emp.reporting_manager_id)) {
          empMap.get(emp.reporting_manager_id)!.children.push(node);
        } else {
          empRoots.push(node);
        }
      });
      const sortEmp = (nodes: EmpNode[]) => { nodes.sort((a, b) => a.name.localeCompare(b.name)); nodes.forEach(n => sortEmp(n.children)); };
      sortEmp(empRoots);
      setEmpTree(empRoots);

      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" /></div>;

  return (
    <Tabs defaultValue="position" className="space-y-4">
      <TabsList>
        <TabsTrigger value="position" className="gap-1.5"><Briefcase className="h-3.5 w-3.5" />Position Hierarchy</TabsTrigger>
        <TabsTrigger value="employee" className="gap-1.5"><Users className="h-3.5 w-3.5" />Employee Hierarchy</TabsTrigger>
      </TabsList>

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

      <TabsContent value="employee">
        {empTree.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <Users className="h-10 w-10 mx-auto opacity-20 mb-2" />
            No active employees found
          </div>
        ) : (
          <div className="border border-border rounded-lg p-3 bg-muted/5">
            {empTree.map(n => <EmpTreeNode key={n.id} node={n} />)}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
