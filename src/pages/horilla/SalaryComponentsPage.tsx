import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, TrendingUp, TrendingDown } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";

type ComponentType = "allowance" | "deduction";

const defaultForm = {
  name: "",
  code: "",
  component_type: "allowance" as ComponentType,
  is_taxable: false,
  is_fixed: true,
  calculation_type: "fixed",
  default_amount: 0,
  percentage_of: "" as string,
};

const singular = (t: ComponentType) => (t === "allowance" ? "Allowance" : "Deduction");

export default function SalaryComponentsPage({ componentType }: { componentType?: ComponentType }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<ComponentType>(componentType ?? "allowance");
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [form, setForm] = useState({ ...defaultForm, component_type: componentType ?? "allowance" });

  const { data: allComponents = [], isLoading } = useQuery({
    queryKey: ["hr_salary_components"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_salary_components").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const buckets = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (c: any) => !q || `${c.name} ${c.code}`.toLowerCase().includes(q);
    return {
      allowance: allComponents.filter((c: any) => c.component_type === "allowance" && match(c)),
      deduction: allComponents.filter((c: any) => c.component_type === "deduction" && match(c)),
    };
  }, [allComponents, search]);

  const counts = useMemo(() => ({
    allowance: allComponents.filter((c: any) => c.component_type === "allowance"),
    deduction: allComponents.filter((c: any) => c.component_type === "deduction"),
  }), [allComponents]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, default_amount: form.default_amount || 0 };
      if (editId) {
        const { error } = await supabase.from("hr_salary_components").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hr_salary_components").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_salary_components"] });
      setShowDialog(false);
      setEditId(null);
      setForm({ ...defaultForm, component_type: tab });
      toast.success(editId ? "Component updated" : "Component created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("hr_salary_components").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr_salary_components"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_salary_components").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_salary_components"] });
      setDeleteTarget(null);
      toast.success("Component deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = (type: ComponentType) => {
    setEditId(null);
    setForm({ ...defaultForm, component_type: type });
    setShowDialog(true);
  };

  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({
      name: c.name,
      code: c.code,
      component_type: c.component_type,
      is_taxable: c.is_taxable ?? false,
      is_fixed: c.is_fixed ?? true,
      calculation_type: "fixed",
      default_amount: c.default_amount || 0,
      percentage_of: "",
    });
    setShowDialog(true);
  };

  const renderList = (type: ComponentType) => {
    const rows = buckets[type];
    const emptyTitle = search ? `No ${type}s match "${search}"` : `No ${type}s configured`;

    return (
      <>
        {/* Desktop table */}
        <Card className="hidden md:block">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  {["Name", "Code", "Taxable", "Recurrence", "Active", "Actions"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="p-0"><TableSkeleton rows={5} columns={6} /></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState icon={Plus} title={emptyTitle} description={`Add your first ${type} using the button above.`} /></td></tr>
                ) : (
                  rows.map((c: any) => (
                    <tr key={c.id} className={`border-b hover:bg-muted/50 ${!c.is_active ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3"><span className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{c.code}</span></td>
                      <td className="px-4 py-3">
                        {c.is_taxable
                          ? <span className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded-full">Taxable</span>
                          : <span className="text-xs text-muted-foreground">Non-taxable</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{c.is_fixed ? "Fixed monthly" : "Variable"}</td>
                      <td className="px-4 py-3">
                        <Switch checked={c.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, is_active: v })} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Mobile card list */}
        <div className="md:hidden space-y-2">
          {isLoading ? (
            <Card><CardContent className="p-0"><TableSkeleton rows={4} columns={2} /></CardContent></Card>
          ) : rows.length === 0 ? (
            <Card><CardContent><EmptyState icon={Plus} title={emptyTitle} description={`Add your first ${type} using the button above.`} /></CardContent></Card>
          ) : (
            rows.map((c: any) => (
              <Card key={c.id} className={!c.is_active ? "opacity-60" : ""}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{c.name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">{c.code}</span>
                        {c.is_taxable
                          ? <span className="text-[10px] bg-warning/10 text-warning px-2 py-0.5 rounded-full">Taxable</span>
                          : <span className="text-[10px] text-muted-foreground">Non-taxable</span>}
                        <span className="text-[10px] text-muted-foreground">{c.is_fixed ? "Fixed" : "Variable"}</span>
                      </div>
                    </div>
                    <Switch checked={c.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, is_active: v })} />
                  </div>
                  <div className="flex gap-2 pt-1 border-t">
                    <Button size="sm" variant="ghost" className="h-8 flex-1" onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 flex-1 text-destructive" onClick={() => setDeleteTarget(c)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Salary Components"
        description="Allowances and deductions used to build salary structures"
        actions={
          <Button onClick={() => openCreate(tab)} className="h-9 bg-[#E8604C] hover:bg-[#d4553f]">
            <Plus className="h-4 w-4 mr-2" /> Add {singular(tab)}
          </Button>
        }
      />

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3">
        {(["allowance", "deduction"] as ComponentType[]).map((type) => {
          const list = counts[type];
          const active = list.filter((c: any) => c.is_active).length;
          const Icon = type === "allowance" ? TrendingUp : TrendingDown;
          return (
            <Card
              key={type}
              role="button"
              onClick={() => setTab(type)}
              className={`cursor-pointer transition-colors ${tab === type ? "border-primary" : "hover:bg-muted/40"}`}
            >
              <CardContent className="p-3 md:p-4 flex items-center gap-3">
                <div className={`h-9 w-9 rounded-lg grid place-items-center shrink-0 ${type === "allowance" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{singular(type)}s</p>
                  <p className="text-lg font-semibold leading-tight">{list.length}</p>
                  <p className="text-[11px] text-muted-foreground">{active} active</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ComponentType)} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="allowance" className="flex-1 sm:flex-none">Allowances</TabsTrigger>
            <TabsTrigger value="deduction" className="flex-1 sm:flex-none">Deductions</TabsTrigger>
          </TabsList>
          <div className="relative sm:ml-auto sm:w-64">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or code"
              className="pl-8 h-9 text-foreground"
            />
          </div>
        </div>

        <TabsContent value="allowance" className="space-y-2 mt-0">{renderList("allowance")}</TabsContent>
        <TabsContent value="deduction" className="space-y-2 mt-0">{renderList("deduction")}</TabsContent>
      </Tabs>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit" : "Add"} {singular(form.component_type)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <Input className="text-foreground" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. HRA" />
              </div>
              <div>
                <Label>Code</Label>
                <Input className="text-foreground" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. HRA" />
              </div>
            </div>
            <div>
              <Label>Type</Label>
              <Tabs value={form.component_type} onValueChange={(v) => setForm({ ...form, component_type: v as ComponentType })}>
                <TabsList className="w-full mt-1">
                  <TabsTrigger value="allowance" className="flex-1">Allowance</TabsTrigger>
                  <TabsTrigger value="deduction" className="flex-1">Deduction</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_taxable} onCheckedChange={(v) => setForm({ ...form, is_taxable: v })} />
                <Label>Taxable</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_fixed} onCheckedChange={(v) => setForm({ ...form, is_fixed: v })} />
                <Label>Fixed (same every month)</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || !form.code || saveMutation.isPending} className="bg-[#E8604C] hover:bg-[#d4553f]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the component permanently. Salary structures already referencing it may be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteMutation.mutate(deleteTarget.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
