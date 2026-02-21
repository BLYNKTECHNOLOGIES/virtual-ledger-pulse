import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Users, Briefcase, MapPin, Plus, Pencil, Trash2 } from "lucide-react";
import { DepartmentFormDialog } from "@/components/hrms/DepartmentFormDialog";
import { OrgChartView } from "@/components/hrms/OrgChartView";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function OrganizationPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDept, setEditDept] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: departments = [] } = useQuery({
    queryKey: ["org_departments"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("*").eq("is_active", true).order("hierarchy_level");
      return data || [];
    },
  });

  const { data: positions = [] } = useQuery({
    queryKey: ["org_positions"],
    queryFn: async () => {
      const { data } = await supabase.from("positions").select("*").eq("is_active", true).order("title");
      return data || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["org_employees"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_employees").select("id, is_active");
      return data || [];
    },
  });

  const { data: workInfos = [] } = useQuery({
    queryKey: ["org_work_infos"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_employee_work_info").select("department_id, location");
      return data || [];
    },
  });

  const deptCounts: Record<string, number> = {};
  workInfos.forEach((w: any) => { if (w.department_id) deptCounts[w.department_id] = (deptCounts[w.department_id] || 0) + 1; });
  const locations = new Set(workInfos.map((w: any) => w.location).filter(Boolean));

  const refresh = () => qc.invalidateQueries({ queryKey: ["org_departments"] });

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("departments").update({ is_active: false }).eq("id", deleteId);
    if (error) toast.error("Failed to delete"); else { toast.success("Department removed"); refresh(); }
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Organization</h1>
          <p className="text-sm text-muted-foreground">Company structure and overview</p>
        </div>
        <Button onClick={() => { setEditDept(null); setDialogOpen(true); }} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add Department
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Departments", value: departments.length, icon: Building2, bg: "bg-violet-50 dark:bg-violet-500/10", color: "text-violet-600 dark:text-violet-400" },
          { label: "Positions", value: positions.length, icon: Briefcase, bg: "bg-blue-50 dark:bg-blue-500/10", color: "text-blue-600 dark:text-blue-400" },
          { label: "Employees", value: employees.length, icon: Users, bg: "bg-emerald-50 dark:bg-emerald-500/10", color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Locations", value: locations.size, icon: MapPin, bg: "bg-amber-50 dark:bg-amber-500/10", color: "text-amber-600 dark:text-amber-400" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Department table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Departments</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {["Department", "Code", "Employees", "Level", ""].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {departments.map((d: any) => (
                <tr key={d.id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />{d.name}
                  </td>
                  <td className="px-4 py-3"><span className="bg-muted px-1.5 py-0.5 rounded text-xs">{d.code}</span></td>
                  <td className="px-4 py-3">{deptCounts[d.id] || 0}</td>
                  <td className="px-4 py-3 text-muted-foreground">{d.hierarchy_level ?? "—"}</td>
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
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">No departments yet. Add one above.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Org Chart */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Organization Chart</CardTitle></CardHeader>
        <CardContent><OrgChartView /></CardContent>
      </Card>

      <DepartmentFormDialog open={dialogOpen} onOpenChange={setDialogOpen} department={editDept} onSuccess={refresh} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Department?</AlertDialogTitle>
            <AlertDialogDescription>This will deactivate the department. It can be reactivated later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
