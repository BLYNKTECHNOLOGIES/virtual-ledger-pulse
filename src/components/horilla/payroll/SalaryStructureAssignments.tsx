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
import { Search, Pencil } from "lucide-react";

export default function SalaryStructureAssignments() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showAssign, setShowAssign] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [assignForm, setAssignForm] = useState({ template_id: "", total_salary: 0 });

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["hr_employees_with_structure"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employees")
        .select("id, badge_id, first_name, last_name, basic_salary, total_salary, salary_structure_template_id")
        .eq("is_active", true)
        .order("first_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["hr_salary_structure_templates_active"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_salary_structure_templates")
        .select("*")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const { data: templateItemsMap = {} } = useQuery({
    queryKey: ["hr_salary_structure_template_items_all"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_salary_structure_template_items")
        .select("*, hr_salary_components!hr_salary_structure_template_items_component_id_fkey(id, name, code, component_type)");
      const map: Record<string, any[]> = {};
      (data || []).forEach((item: any) => {
        if (!map[item.template_id]) map[item.template_id] = [];
        map[item.template_id].push(item);
      });
      return map;
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("hr_employees")
        .update({
          salary_structure_template_id: assignForm.template_id || null,
          total_salary: assignForm.total_salary,
        })
        .eq("id", selectedEmp.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_employees_with_structure"] });
      setShowAssign(false);
      toast.success("Assignment updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openAssign = (emp: any) => {
    setSelectedEmp(emp);
    setAssignForm({
      template_id: emp.salary_structure_template_id || "",
      total_salary: Number(emp.total_salary) || 0,
    });
    setShowAssign(true);
  };

  const getTemplateName = (id: string) => templates.find((t: any) => t.id === id)?.name || "—";

  const evalFormula = (formula: string, vars: Record<string, number>): number => {
    try {
      let expr = formula.trim();
      // Replace variables longest-first to avoid partial matches
      Object.keys(vars).sort((a, b) => b.length - a.length).forEach(k => {
        expr = expr.replace(new RegExp(k, 'g'), String(vars[k]));
      });
      // Only allow numbers, operators, parentheses, dots, spaces
      if (/^[\d\s+\-*/().]+$/.test(expr)) {
        return new Function(`return (${expr})`)() as number;
      }
      return 0;
    } catch { return 0; }
  };

  // Build a vars map that includes component codes from the template
  const buildVarsMap = (
    items: any[],
    totalSalary: number,
    basicPay: number,
    excludeIndex?: number
  ): Record<string, number> => {
    // First compute all non-formula items to get their amounts by code
    const codeAmounts: Record<string, number> = {};
    let tempDeductions = 0;
    let tempAllowances = 0;

    items.forEach((i: any, idx: number) => {
      const comp = i.hr_salary_components;
      if (!comp || i.calculation_type === "formula") return;
      let amount = 0;
      if (i.calculation_type === "percentage") {
        const base = i.percentage_of === "basic_pay" ? basicPay : totalSalary;
        amount = (Number(i.value) / 100) * base;
      } else {
        amount = Number(i.value) || 0;
      }
      const code = comp.code?.toLowerCase();
      if (code) codeAmounts[code] = amount;
      if (comp.component_type === "deduction") tempDeductions += amount;
      else tempAllowances += amount;
    });

    const baseVars: Record<string, number> = {
      total_salary: totalSalary,
      basic_pay: basicPay,
      total_deductions: tempDeductions,
      total_allowances: tempAllowances,
      ...codeAmounts,
    };

    // Now resolve formula items iteratively (non-circular)
    items.forEach((i: any, idx: number) => {
      const comp = i.hr_salary_components;
      if (!comp || i.calculation_type !== "formula" || !i.formula) return;
      if (idx === excludeIndex) return; // skip self to avoid circular
      const amount = evalFormula(i.formula, baseVars);
      const code = comp.code?.toLowerCase();
      if (code) {
        baseVars[code] = amount;
        // Update totals
        if (comp.component_type === "deduction") {
          baseVars.total_deductions += amount;
        } else {
          baseVars.total_allowances += amount;
        }
      }
    });

    return baseVars;
  };

  const computeBreakdown = (emp: any) => {
    const tmplId = emp.salary_structure_template_id;
    if (!tmplId) return null;
    const items = (templateItemsMap as any)[tmplId] || [];
    const totalSalary = Number(emp.total_salary) || 0;

    // Compute basic_pay
    let basicPay = Number(emp.basic_salary) || 0;
    const basicItem = items.find((i: any) => i.hr_salary_components?.code === "BASIC" || i.hr_salary_components?.name?.toLowerCase().includes("basic"));
    if (basicItem) {
      if (basicItem.calculation_type === "percentage") {
        basicPay = (Number(basicItem.value) / 100) * totalSalary;
      } else if (basicItem.calculation_type === "fixed") {
        basicPay = Number(basicItem.value);
      }
    }

    const vars = buildVarsMap(items, totalSalary, basicPay);

    const earnings: { name: string; code: string; amount: number }[] = [];
    const deductionsList: { name: string; code: string; amount: number }[] = [];

    items.forEach((i: any) => {
      const comp = i.hr_salary_components;
      if (!comp) return;
      let amount: number;
      if (i.calculation_type === "formula" && i.formula) {
        amount = evalFormula(i.formula, vars);
      } else if (i.calculation_type === "percentage") {
        const base = i.percentage_of === "basic_pay" ? basicPay : totalSalary;
        amount = (Number(i.value) / 100) * base;
      } else {
        amount = Number(i.value) || 0;
      }
      const entry = { name: comp.name, code: comp.code, amount: Math.round(amount) };
      if (comp.component_type === "allowance") {
        earnings.push(entry);
      } else {
        deductionsList.push(entry);
      }
    });

    const totalEarnings = earnings.reduce((s, e) => s + e.amount, 0);
    const totalDeductions = deductionsList.reduce((s, d) => s + d.amount, 0);

    // Net = Earnings - Employee deductions only (exclude employer contributions)
    const employeeDeductions = deductionsList
      .filter(d => !d.code?.toLowerCase().includes("employer"))
      .reduce((s, d) => s + d.amount, 0);

    return { earnings, deductions: deductionsList, totalEarnings, totalDeductions, net: totalEarnings - employeeDeductions };
  };

  const filtered = employees.filter((e: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const n = `${e.first_name} ${e.last_name}`.toLowerCase();
    return n.includes(q) || e.badge_id?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 mt-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <p className="text-center text-gray-400 py-12">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-400">No employees found.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((emp: any) => {
            const breakdown = computeBreakdown(emp);
            const tmplName = emp.salary_structure_template_id ? getTemplateName(emp.salary_structure_template_id) : null;

            return (
              <Card key={emp.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#E8604C]/10 flex items-center justify-center text-[#E8604C] font-bold text-sm">
                        {emp.first_name?.[0]}{emp.last_name?.[0]}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{emp.first_name} {emp.last_name}</p>
                        <p className="text-xs text-gray-500">
                          {emp.badge_id}
                          {tmplName && <span className="ml-2 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs">{tmplName}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right text-sm">
                        <p className="text-gray-500">Total Salary: <span className="font-medium text-gray-900">₹{(Number(emp.total_salary) || 0).toLocaleString()}</span></p>
                        {breakdown && (
                          <>
                            <p className="text-green-700">Earnings: ₹{breakdown.totalEarnings.toLocaleString()}</p>
                            <p className="text-red-600">Deductions: ₹{breakdown.totalDeductions.toLocaleString()}</p>
                            <p className="font-bold text-gray-900">Net: ₹{breakdown.net.toLocaleString()}</p>
                          </>
                        )}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => openAssign(emp)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Assign
                      </Button>
                    </div>
                  </div>

                  {breakdown && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-3">
                      <div>
                        <p className="text-xs font-semibold text-green-700 mb-1.5">EARNINGS</p>
                        <div className="space-y-1">
                          {breakdown.earnings.length === 0 && <p className="text-xs text-gray-400">None</p>}
                          {breakdown.earnings.map((e, i) => (
                            <div key={i} className="flex justify-between text-sm bg-green-50 px-3 py-1.5 rounded">
                              <span>{e.name} <span className="text-xs text-gray-400">({e.code})</span></span>
                              <span className="font-medium">₹{e.amount.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-red-600 mb-1.5">DEDUCTIONS</p>
                        <div className="space-y-1">
                          {breakdown.deductions.length === 0 && <p className="text-xs text-gray-400">None</p>}
                          {breakdown.deductions.map((d, i) => (
                            <div key={i} className="flex justify-between text-sm bg-red-50 px-3 py-1.5 rounded">
                              <span>{d.name} <span className="text-xs text-gray-400">({d.code})</span></span>
                              <span className="font-medium">₹{d.amount.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {!breakdown && !tmplName && (
                    <p className="text-xs text-gray-400 border-t pt-2">No salary structure assigned. Click "Assign" to set one.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Assign Dialog */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Salary Structure — {selectedEmp?.first_name} {selectedEmp?.last_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Total Salary (₹)</Label>
              <Input
                type="number"
                value={assignForm.total_salary}
                onChange={(e) => setAssignForm({ ...assignForm, total_salary: parseFloat(e.target.value) || 0 })}
                placeholder="Enter employee's total salary / CTC"
              />
              <p className="text-xs text-gray-400 mt-1">This is the base amount used for percentage calculations</p>
            </div>
            <div>
              <Label>Salary Structure Template</Label>
              <Select value={assignForm.template_id} onValueChange={(v) => setAssignForm({ ...assignForm, template_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Preview */}
            {assignForm.template_id && assignForm.total_salary > 0 && (() => {
              const items = (templateItemsMap as any)[assignForm.template_id] || [];
              const totalSalary = assignForm.total_salary;
              let basicPay = 0;
              const basicItem = items.find((i: any) => i.hr_salary_components?.code === "BASIC" || i.hr_salary_components?.name?.toLowerCase().includes("basic"));
              if (basicItem) {
                basicPay = basicItem.calculation_type === "percentage" ? (Number(basicItem.value) / 100) * totalSalary : Number(basicItem.value);
              }

              const vars = buildVarsMap(items, totalSalary, basicPay);

              return (
                <div className="border rounded-lg p-3 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-600 mb-2">PREVIEW (for ₹{totalSalary.toLocaleString()} total salary)</p>
                  <div className="space-y-1 text-sm">
                    {items.map((i: any, idx: number) => {
                      const comp = i.hr_salary_components;
                      if (!comp) return null;
                      let amount: number;
                      if (i.calculation_type === "formula" && i.formula) {
                        amount = Math.round(evalFormula(i.formula, vars));
                      } else if (i.calculation_type === "percentage") {
                        const base = i.percentage_of === "basic_pay" ? basicPay : totalSalary;
                        amount = Math.round((Number(i.value) / 100) * base);
                      } else {
                        amount = Math.round(Number(i.value) || 0);
                      }
                      const typeLabel = i.calculation_type === "percentage" ? `${Number(i.value)}%` : i.calculation_type === "formula" ? "Formula" : "Fixed";
                      return (
                        <div key={idx} className={`flex justify-between px-2 py-1 rounded ${comp.component_type === "deduction" ? "text-red-700" : "text-green-700"}`}>
                          <span>{comp.name} ({typeLabel})</span>
                          <span className="font-medium">{comp.component_type === "deduction" ? "−" : "+"}₹{amount.toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(false)}>Cancel</Button>
            <Button onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending} className="bg-[#E8604C] hover:bg-[#d4553f]">
              {assignMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
