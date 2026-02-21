import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Briefcase, User, ChevronDown, ChevronRight, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DeptNode {
  id: string;
  name: string;
  code: string;
  level: number | null;
  positions: PosNode[];
  employeeCount: number;
}

interface PosNode {
  id: string;
  title: string;
  level: number | null;
  employees: EmpNode[];
}

interface EmpNode {
  id: string;
  name: string;
  designation: string;
  department: string;
  reportingManagerId: string | null;
  children: EmpNode[];
}

function DeptCard({ dept }: { dept: DeptNode }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Building2 className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground">{dept.name}</p>
          <p className="text-xs text-muted-foreground">{dept.code} · Level {dept.level ?? "—"}</p>
        </div>
        <Badge variant="secondary" className="text-xs">{dept.employeeCount} employees</Badge>
        <Badge variant="outline" className="text-xs">{dept.positions.length} positions</Badge>
      </div>
      {expanded && dept.positions.length > 0 && (
        <div className="px-4 py-3 space-y-2 border-t border-border">
          {dept.positions.map(pos => (
            <div key={pos.id} className="ml-6 border-l-2 border-primary/20 pl-4 py-1.5">
              <div className="flex items-center gap-2">
                <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{pos.title}</span>
                {pos.level != null && <span className="text-xs text-muted-foreground">L{pos.level}</span>}
                <Badge variant="secondary" className="text-[10px] ml-auto">{pos.employees.length}</Badge>
              </div>
              {pos.employees.length > 0 && (
                <div className="mt-1.5 space-y-1 ml-5">
                  {pos.employees.map(emp => (
                    <div key={emp.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{emp.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {expanded && dept.positions.length === 0 && (
        <div className="px-4 py-4 text-xs text-muted-foreground text-center border-t border-border">No positions in this department</div>
      )}
    </div>
  );
}

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

export function OrgChartView() {
  const [deptNodes, setDeptNodes] = useState<DeptNode[]>([]);
  const [empTree, setEmpTree] = useState<EmpNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [deptRes, posRes, empRes] = await Promise.all([
        supabase.from("departments").select("*").eq("is_active", true).order("hierarchy_level"),
        supabase.from("positions").select("*").eq("is_active", true).order("hierarchy_level"),
        supabase.from("employees").select("id, name, designation, department, department_id, position_id, reporting_manager_id, status").eq("status", "active"),
      ]);

      const depts = deptRes.data || [];
      const positions = posRes.data || [];
      const employees = empRes.data || [];

      // Build dept chart
      const deptChart: DeptNode[] = depts.map(d => {
        const deptPositions = positions.filter(p => p.department_id === d.id);
        const posNodes: PosNode[] = deptPositions.map(p => ({
          id: p.id,
          title: p.title,
          level: p.hierarchy_level,
          employees: employees.filter(e => e.position_id === p.id).map(e => ({
            id: e.id, name: e.name, designation: e.designation, department: e.department,
            reportingManagerId: e.reporting_manager_id, children: [],
          })),
        }));
        const deptEmpCount = employees.filter(e => e.department_id === d.id).length;
        return { id: d.id, name: d.name, code: d.code, level: d.hierarchy_level, positions: posNodes, employeeCount: deptEmpCount };
      });
      setDeptNodes(deptChart);

      // Build employee hierarchy tree
      const empMap = new Map<string, EmpNode>();
      employees.forEach(e => {
        empMap.set(e.id, {
          id: e.id, name: e.name, designation: e.designation, department: e.department,
          reportingManagerId: e.reporting_manager_id, children: [],
        });
      });
      const roots: EmpNode[] = [];
      empMap.forEach(node => {
        if (node.reportingManagerId && empMap.has(node.reportingManagerId)) {
          empMap.get(node.reportingManagerId)!.children.push(node);
        } else {
          roots.push(node);
        }
      });
      const sortEmp = (nodes: EmpNode[]) => { nodes.sort((a, b) => a.name.localeCompare(b.name)); nodes.forEach(n => sortEmp(n.children)); };
      sortEmp(roots);
      setEmpTree(roots);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" /></div>;

  return (
    <Tabs defaultValue="department" className="space-y-4">
      <TabsList>
        <TabsTrigger value="department" className="gap-1.5"><Building2 className="h-3.5 w-3.5" />Department & Positions</TabsTrigger>
        <TabsTrigger value="employee" className="gap-1.5"><Users className="h-3.5 w-3.5" />Employee Hierarchy</TabsTrigger>
      </TabsList>

      <TabsContent value="department" className="space-y-3">
        {deptNodes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No departments found</div>
        ) : deptNodes.map(d => <DeptCard key={d.id} dept={d} />)}
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
