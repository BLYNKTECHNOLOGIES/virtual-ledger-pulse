import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Plus, Pencil, Trash2 } from "lucide-react";
import { DepartmentFormDialog } from "@/components/hrms/DepartmentFormDialog";
import { OrgChartView } from "@/components/hrms/OrgChartView";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";

export default function OrganizationPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDept, setEditDept] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["org_departments"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("*").eq("is_active", true).order("hierarchy_level");
      return data || [];
    },
  });

  const { data: positions = [] } = useQuery({
    queryKey: ["org_positions"],
    queryFn: async () => {
      const { data } = await supabase.from("positions").select("id, department_id").eq("is_active", true);
      return data || [];
    },
  });

  const { data: workInfos = [] } = useQuery({
    queryKey: ["org_work_infos"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_employee_work_info").select("department_id");
      return data || [];
    },
  });

  // Count employees and positions per department
  const deptEmpCounts: Record<string, number> = {};
  workInfos.forEach((w: any) => { if (w.department_id) deptEmpCounts[w.department_id] = (deptEmpCounts[w.department_id] || 0) + 1; });

  const deptPosCounts: Record<string, number> = {};
  positions.forEach((p: any) => { if (p.department_id) deptPosCounts[p.department_id] = (deptPosCounts[p.department_id] || 0) + 1; });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["org_departments"] });
    qc.invalidateQueries({ queryKey: ["org_positions"] });
    qc.invalidateQueries({ queryKey: ["org_work_infos"] });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("departments").update({ is_active: false }).eq("id", deleteId);
    if (error) toast.error("Failed to delete"); else { toast.success("Department removed"); refresh(); }
    setDeleteId(null);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Organization"
        description="Manage departments and view your organizational structure"
        actions={
          <Button onClick={() => { setEditDept(null); setDialogOpen(true); }} className="h-9 gap-1.5">
            <Plus className="h-4 w-4" /> Add Department
          </Button>
        }
      />

      {/* Department table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Departments</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={4} cols={6} /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Department</th>
                  <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Code</th>
                  <th className="text-center px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Hierarchy Level</th>
                  <th className="text-center px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Employees</th>
                  <th className="text-center px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Positions</th>
                  <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d: any) => (
                  <tr key={d.id} className="border-b hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />{d.name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-muted/10 border border-muted/20 rounded-full px-2 py-0.5 text-[10px] font-medium font-mono">{d.code}</span>
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-muted-foreground">{d.hierarchy_level ?? "—"}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{deptEmpCounts[d.id] || 0}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{deptPosCounts[d.id] || 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditDept(d); setDialogOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(d.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {departments.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon={Building2}
                        title="No departments yet"
                        description="Add your first department to start building your organization."
                        action={
                          <Button onClick={() => { setEditDept(null); setDialogOpen(true); }} className="h-9 gap-1.5">
                            <Plus className="h-4 w-4" /> Add Department
                          </Button>
                        }
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Org Chart */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Organization Chart</CardTitle></CardHeader>
        <CardContent><OrgChartView /></CardContent>
      </Card>

      <DepartmentFormDialog open={dialogOpen} onOpenChange={setDialogOpen} department={editDept} onSuccess={refresh} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" /> Delete Department?
            </AlertDialogTitle>
            <AlertDialogDescription>This will deactivate the department. It can be reactivated later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="h-9">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
