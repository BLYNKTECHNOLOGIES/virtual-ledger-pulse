import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";

interface TemplateItem {
  id?: string;
  component_id: string;
  calculation_type: "fixed" | "percentage" | "formula";
  value: number;
  percentage_of: "total_salary" | "basic_pay";
  formula: string;
}

const FORMULA_VARIABLES = [
  { label: "Total Salary", value: "total_salary" },
  { label: "Basic Pay", value: "basic_pay" },
  { label: "Total Deductions", value: "total_deductions" },
  { label: "Total Allowances", value: "total_allowances" },
];

export default function SalaryStructureTemplates() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["hr_salary_structure_templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_salary_structure_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: components = [] } = useQuery({
    queryKey: ["hr_salary_components_active"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_salary_components")
        .select("*")
        .eq("is_active", true)
        .order("component_type, name");
      return data || [];
    },
  });

  const { data: templateItemsMap = {} } = useQuery({
    queryKey: ["hr_salary_structure_template_items_all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_salary_structure_template_items")
        .select("*, hr_salary_components!hr_salary_structure_template_items_component_id_fkey(id, name, code, component_type)");
      if (error) throw error;
      const map: Record<string, any[]> = {};
      (data || []).forEach((item: any) => {
        if (!map[item.template_id]) map[item.template_id] = [];
        map[item.template_id].push(item);
      });
      return map;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await (supabase as any)
          .from("hr_salary_structure_templates")
          .update({ name, description })
          .eq("id", editId);
        if (error) throw error;

        // Delete old items and re-insert
        await (supabase as any)
          .from("hr_salary_structure_template_items")
          .delete()
          .eq("template_id", editId);

        if (items.length > 0) {
          const { error: itemErr } = await (supabase as any)
            .from("hr_salary_structure_template_items")
            .insert(items.map((i) => ({
              template_id: editId,
              component_id: i.component_id,
              calculation_type: i.calculation_type,
              value: i.calculation_type === "formula" ? 0 : i.value,
              percentage_of: i.calculation_type === "percentage" ? i.percentage_of : null,
              formula: i.calculation_type === "formula" ? i.formula : null,
            })));
          if (itemErr) throw itemErr;
        }
      } else {
        const { data: tmpl, error } = await (supabase as any)
          .from("hr_salary_structure_templates")
          .insert({ name, description })
          .select()
          .single();
        if (error) throw error;

        if (items.length > 0) {
          const { error: itemErr } = await (supabase as any)
            .from("hr_salary_structure_template_items")
            .insert(items.map((i) => ({
              template_id: tmpl.id,
              component_id: i.component_id,
              calculation_type: i.calculation_type,
              value: i.calculation_type === "formula" ? 0 : i.value,
              percentage_of: i.calculation_type === "percentage" ? i.percentage_of : null,
              formula: i.calculation_type === "formula" ? i.formula : null,
            })));
          if (itemErr) throw itemErr;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_salary_structure_templates"] });
      qc.invalidateQueries({ queryKey: ["hr_salary_structure_template_items_all"] });
      resetForm();
      toast.success(editId ? "Template updated" : "Template created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("hr_salary_structure_templates")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_salary_structure_templates"] });
      qc.invalidateQueries({ queryKey: ["hr_salary_structure_template_items_all"] });
      toast.success("Template deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditId(null);
    setName("");
    setDescription("");
    setItems([]);
  };

  const openEdit = (t: any) => {
    setEditId(t.id);
    setName(t.name);
    setDescription(t.description || "");
    const existingItems = (templateItemsMap as any)[t.id] || [];
    setItems(existingItems.map((i: any) => ({
      id: i.id,
      component_id: i.component_id,
      calculation_type: i.calculation_type,
      value: Number(i.value),
      percentage_of: i.percentage_of || "total_salary",
      formula: i.formula || "",
    })));
    setShowForm(true);
  };

  const addItem = () => {
    setItems([...items, { component_id: "", calculation_type: "percentage", value: 0, percentage_of: "total_salary", formula: "" }]);
  };

  const updateItem = (idx: number, field: string, val: any) => {
    const updated = [...items];
    (updated[idx] as any)[field] = val;
    setItems(updated);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const getComponent = (id: string) => components.find((c: any) => c.id === id);

  const allowances = components.filter((c: any) => c.component_type === "allowance");
  const deductions = components.filter((c: any) => c.component_type === "deduction");

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Button onClick={() => { resetForm(); setShowForm(true); }} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <Plus className="h-4 w-4 mr-2" /> Create Template
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center text-gray-400 py-12">Loading...</p>
      ) : templates.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-400">No salary structure templates yet. Create one to get started.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {templates.map((t: any) => {
            const tItems = (templateItemsMap as any)[t.id] || [];
            const earningItems = tItems.filter((i: any) => i.hr_salary_components?.component_type === "allowance");
            const deductionItems = tItems.filter((i: any) => i.hr_salary_components?.component_type === "deduction");
            const isExpanded = expandedId === t.id;

            return (
              <Card key={t.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedId(isExpanded ? null : t.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#E8604C]/10 flex items-center justify-center text-[#E8604C] font-bold text-sm">
                        SS
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{t.name}</p>
                        <p className="text-xs text-gray-500">{t.description || "No description"} • {tItems.length} components</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(t); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(t.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t px-4 pb-4 pt-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-semibold text-green-700 mb-2">EARNINGS / ALLOWANCES</p>
                          <div className="space-y-1">
                            {earningItems.length === 0 && <p className="text-xs text-gray-400">None</p>}
                            {earningItems.map((i: any) => (
                              <div key={i.id} className="flex justify-between text-sm bg-green-50 px-3 py-1.5 rounded">
                                <span>{i.hr_salary_components?.name} <span className="text-xs text-gray-400">({i.hr_salary_components?.code})</span></span>
                                <span className="font-medium">
                                  {i.calculation_type === "formula"
                                    ? <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{i.formula}</code>
                                    : i.calculation_type === "percentage"
                                    ? `${Number(i.value)}% of ${i.percentage_of === "basic_pay" ? "Basic Pay" : "Total Salary"}`
                                    : `₹${Number(i.value).toLocaleString()} (Fixed)`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-red-600 mb-2">DEDUCTIONS</p>
                          <div className="space-y-1">
                            {deductionItems.length === 0 && <p className="text-xs text-gray-400">None</p>}
                            {deductionItems.map((i: any) => (
                              <div key={i.id} className="flex justify-between text-sm bg-red-50 px-3 py-1.5 rounded">
                                <span>{i.hr_salary_components?.name} <span className="text-xs text-gray-400">({i.hr_salary_components?.code})</span></span>
                                <span className="font-medium">
                                  {i.calculation_type === "formula"
                                    ? <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{i.formula}</code>
                                    : i.calculation_type === "percentage"
                                    ? `${Number(i.value)}% of ${i.percentage_of === "basic_pay" ? "Basic Pay" : "Total Salary"}`
                                    : `₹${Number(i.value).toLocaleString()} (Fixed)`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Template Dialog */}
      <Dialog open={showForm} onOpenChange={(v) => { if (!v) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit" : "Create"} Salary Structure Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Template Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Under 15,000" />
              </div>
              <div>
                <Label>Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Components</Label>
                <Button size="sm" variant="outline" onClick={addItem}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Component
                </Button>
              </div>

              {items.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No components added. Click "Add Component" to start building the structure.</p>
              )}

              <div className="space-y-3">
                {items.map((item, idx) => {
                  const comp = getComponent(item.component_id);
                  return (
                    <div key={idx} className={`p-3 rounded-lg border ${comp?.component_type === "deduction" ? "bg-red-50/50 border-red-100" : "bg-green-50/50 border-green-100"}`}>
                      <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-4">
                          <Label className="text-xs">Component</Label>
                          <Select value={item.component_id} onValueChange={(v) => updateItem(idx, "component_id", v)}>
                            <SelectTrigger className="bg-white"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              {allowances.length > 0 && (
                                <>
                                  <SelectItem value="__header_allowances" disabled>— Allowances —</SelectItem>
                                  {allowances.map((c: any) => (
                                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>
                                  ))}
                                </>
                              )}
                              {deductions.length > 0 && (
                                <>
                                  <SelectItem value="__header_deductions" disabled>— Deductions —</SelectItem>
                                  {deductions.map((c: any) => (
                                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>
                                  ))}
                                </>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs">Type</Label>
                          <Select value={item.calculation_type} onValueChange={(v) => updateItem(idx, "calculation_type", v)}>
                            <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percentage">Percentage</SelectItem>
                              <SelectItem value="fixed">Fixed Amount</SelectItem>
                              <SelectItem value="formula">Formula</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {item.calculation_type === "formula" ? (
                          <div className="col-span-5">
                            <Label className="text-xs">Formula</Label>
                            <Input 
                              className="bg-white font-mono text-xs" 
                              value={item.formula} 
                              onChange={(e) => updateItem(idx, "formula", e.target.value)} 
                              placeholder="e.g. total_salary - total_deductions" 
                            />
                            <p className="text-[10px] text-gray-400 mt-1">
                              Variables: {FORMULA_VARIABLES.map(v => v.value).join(", ")}. Operators: + - * /
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="col-span-2">
                              <Label className="text-xs">{item.calculation_type === "percentage" ? "%" : "₹ Amount"}</Label>
                              <Input type="number" className="bg-white" value={item.value} onChange={(e) => updateItem(idx, "value", parseFloat(e.target.value) || 0)} />
                            </div>
                            {item.calculation_type === "percentage" && (
                              <div className="col-span-3">
                                <Label className="text-xs">% Of</Label>
                                <Select value={item.percentage_of} onValueChange={(v) => updateItem(idx, "percentage_of", v)}>
                                  <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="total_salary">Total Salary</SelectItem>
                                    <SelectItem value="basic_pay">Basic Pay</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </>
                        )}
                        <div className={item.calculation_type === "percentage" ? "col-span-1" : "col-span-4"}>
                          <Button size="sm" variant="ghost" className="text-red-500 mt-4" onClick={() => removeItem(idx)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!name || saveMutation.isPending} className="bg-[#E8604C] hover:bg-[#d4553f]">
              {saveMutation.isPending ? "Saving..." : editId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
