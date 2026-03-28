import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Calculator, Star } from "lucide-react";

export default function TaxConfigPage() {
  const qc = useQueryClient();
  const [showFSForm, setShowFSForm] = useState(false);
  const [editFS, setEditFS] = useState<any>(null);
  const [fsForm, setFsForm] = useState({ name: "", based_on: "taxable_gross_pay", description: "", is_default: false, is_active: true });

  const [showBracketForm, setShowBracketForm] = useState(false);
  const [editBracket, setEditBracket] = useState<any>(null);
  const [bracketFSId, setBracketFSId] = useState("");
  const [bracketForm, setBracketForm] = useState({ min_income: 0, max_income: "", tax_rate: 0, description: "", sort_order: 0 });

  const [testIncome, setTestIncome] = useState("");
  const [testFSId, setTestFSId] = useState("");
  const [testResult, setTestResult] = useState<number | null>(null);

  const { data: filingStatuses = [], isLoading } = useQuery({
    queryKey: ["hr_filing_statuses"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_filing_statuses").select("*").order("created_at");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: taxBrackets = [] } = useQuery({
    queryKey: ["hr_tax_brackets"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_tax_brackets").select("*").order("filing_status_id").order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const bracketsByFS: Record<string, any[]> = {};
  taxBrackets.forEach((b: any) => {
    if (!bracketsByFS[b.filing_status_id]) bracketsByFS[b.filing_status_id] = [];
    bracketsByFS[b.filing_status_id].push(b);
  });

  // Filing Status mutations
  const saveFSMutation = useMutation({
    mutationFn: async () => {
      if (editFS) {
        const { error } = await (supabase as any).from("hr_filing_statuses").update(fsForm).eq("id", editFS.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("hr_filing_statuses").insert(fsForm);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_filing_statuses"] });
      setShowFSForm(false);
      toast.success(editFS ? "Updated" : "Created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteFSMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("hr_filing_statuses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr_filing_statuses"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  // Bracket mutations
  const saveBracketMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        filing_status_id: bracketFSId,
        min_income: Number(bracketForm.min_income),
        max_income: bracketForm.max_income ? Number(bracketForm.max_income) : null,
        tax_rate: Number(bracketForm.tax_rate),
        description: bracketForm.description,
        sort_order: Number(bracketForm.sort_order),
      };
      if (editBracket) {
        const { error } = await (supabase as any).from("hr_tax_brackets").update(payload).eq("id", editBracket.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("hr_tax_brackets").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_tax_brackets"] });
      setShowBracketForm(false);
      toast.success(editBracket ? "Bracket updated" : "Bracket added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteBracketMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("hr_tax_brackets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr_tax_brackets"] }); toast.success("Bracket deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const computeTax = async () => {
    if (!testIncome || !testFSId) return;
    const { data, error } = await (supabase as any).rpc("compute_annual_tax", {
      p_taxable_income: Number(testIncome),
      p_filing_status_id: testFSId,
    });
    if (error) { toast.error(error.message); return; }
    setTestResult(data);
  };

  const openEditFS = (fs: any) => {
    setEditFS(fs);
    setFsForm({ name: fs.name, based_on: fs.based_on, description: fs.description || "", is_default: fs.is_default, is_active: fs.is_active });
    setShowFSForm(true);
  };

  const openNewFS = () => {
    setEditFS(null);
    setFsForm({ name: "", based_on: "taxable_gross_pay", description: "", is_default: false, is_active: true });
    setShowFSForm(true);
  };

  const openNewBracket = (fsId: string) => {
    setEditBracket(null);
    setBracketFSId(fsId);
    const existing = bracketsByFS[fsId] || [];
    const nextSort = existing.length > 0 ? Math.max(...existing.map((b: any) => b.sort_order)) + 1 : 1;
    const lastMax = existing.length > 0 ? existing[existing.length - 1].max_income : 0;
    setBracketForm({ min_income: lastMax || 0, max_income: "", tax_rate: 0, description: "", sort_order: nextSort });
    setShowBracketForm(true);
  };

  const openEditBracket = (b: any) => {
    setEditBracket(b);
    setBracketFSId(b.filing_status_id);
    setBracketForm({
      min_income: b.min_income, max_income: b.max_income?.toString() || "",
      tax_rate: b.tax_rate, description: b.description || "", sort_order: b.sort_order,
    });
    setShowBracketForm(true);
  };

  const formatINR = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tax Configuration</h1>
          <p className="text-sm text-muted-foreground">Filing statuses & progressive tax brackets for payroll computation</p>
        </div>
        <Button onClick={openNewFS} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <Plus className="h-4 w-4 mr-1" /> New Filing Status
        </Button>
      </div>

      <Tabs defaultValue="regimes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="regimes">Filing Statuses & Brackets</TabsTrigger>
          <TabsTrigger value="calculator">Tax Calculator</TabsTrigger>
        </TabsList>

        <TabsContent value="regimes">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-12">Loading...</p>
          ) : filingStatuses.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No filing statuses configured.</CardContent></Card>
          ) : (
            <div className="space-y-4">
              {filingStatuses.map((fs: any) => (
                <Card key={fs.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{fs.name}</CardTitle>
                        {fs.is_default && <Badge className="bg-amber-100 text-amber-700 text-xs"><Star className="h-3 w-3 mr-0.5" /> Default</Badge>}
                        <Badge variant={fs.is_active ? "default" : "secondary"} className="text-xs">{fs.is_active ? "Active" : "Inactive"}</Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => openNewBracket(fs.id)}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add Bracket
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditFS(fs)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteFSMutation.mutate(fs.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                    {fs.description && <p className="text-xs text-muted-foreground">{fs.description}</p>}
                    <p className="text-xs text-muted-foreground">Based on: <span className="font-medium capitalize">{fs.based_on.replace(/_/g, " ")}</span></p>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          {["Slab", "Min Income", "Max Income", "Tax Rate", "Description", ""].map(h => (
                            <th key={h} className="text-left px-4 py-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(bracketsByFS[fs.id] || []).length === 0 ? (
                          <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">No brackets. Add one above.</td></tr>
                        ) : (
                          (bracketsByFS[fs.id] || []).map((b: any, idx: number) => (
                            <tr key={b.id} className="border-b hover:bg-muted/30">
                              <td className="px-4 py-2 font-medium">{idx + 1}</td>
                              <td className="px-4 py-2">{formatINR(b.min_income)}</td>
                              <td className="px-4 py-2">{b.max_income ? formatINR(b.max_income) : "∞"}</td>
                              <td className="px-4 py-2">
                                <Badge className={b.tax_rate === 0 ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}>
                                  {b.tax_rate}%
                                </Badge>
                              </td>
                              <td className="px-4 py-2 text-muted-foreground">{b.description || "—"}</td>
                              <td className="px-4 py-2">
                                <div className="flex gap-1">
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditBracket(b)}><Pencil className="h-3 w-3" /></Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteBracketMutation.mutate(b.id)}><Trash2 className="h-3 w-3" /></Button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="calculator">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calculator className="h-5 w-5" /> Tax Calculator</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Annual Taxable Income (₹)</Label>
                  <Input type="number" value={testIncome} onChange={e => setTestIncome(e.target.value)} placeholder="e.g. 1200000" />
                </div>
                <div>
                  <Label>Filing Status</Label>
                  <Select value={testFSId} onValueChange={setTestFSId}>
                    <SelectTrigger><SelectValue placeholder="Select regime" /></SelectTrigger>
                    <SelectContent>
                      {filingStatuses.filter((f: any) => f.is_active).map((fs: any) => (
                        <SelectItem key={fs.id} value={fs.id}>{fs.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={computeTax} disabled={!testIncome || !testFSId} className="bg-[#E8604C] hover:bg-[#d4553f]">
                    Calculate Tax
                  </Button>
                </div>
              </div>
              {testResult !== null && (
                <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Taxable Income:</span>
                    <span className="font-medium">{formatINR(Number(testIncome))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Annual Tax:</span>
                    <span className="font-bold text-destructive">{formatINR(testResult)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Monthly Tax:</span>
                    <span className="font-bold text-destructive">{formatINR(Math.round(testResult / 12))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Effective Rate:</span>
                    <span className="font-medium">{((testResult / Number(testIncome)) * 100).toFixed(2)}%</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Filing Status Form */}
      <Dialog open={showFSForm} onOpenChange={setShowFSForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editFS ? "Edit Filing Status" : "New Filing Status"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={fsForm.name} onChange={e => setFsForm({ ...fsForm, name: e.target.value })} placeholder="e.g. New Regime FY 2025-26" /></div>
            <div>
              <Label>Tax Computed On</Label>
              <Select value={fsForm.based_on} onValueChange={v => setFsForm({ ...fsForm, based_on: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic_pay">Basic Pay</SelectItem>
                  <SelectItem value="gross_pay">Gross Pay</SelectItem>
                  <SelectItem value="taxable_gross_pay">Taxable Gross Pay</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Description</Label><Input value={fsForm.description} onChange={e => setFsForm({ ...fsForm, description: e.target.value })} /></div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2"><Switch checked={fsForm.is_default} onCheckedChange={v => setFsForm({ ...fsForm, is_default: v })} /><Label>Default</Label></div>
              <div className="flex items-center gap-2"><Switch checked={fsForm.is_active} onCheckedChange={v => setFsForm({ ...fsForm, is_active: v })} /><Label>Active</Label></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFSForm(false)}>Cancel</Button>
            <Button onClick={() => saveFSMutation.mutate()} disabled={saveFSMutation.isPending || !fsForm.name} className="bg-[#E8604C] hover:bg-[#d4553f]">
              {saveFSMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bracket Form */}
      <Dialog open={showBracketForm} onOpenChange={setShowBracketForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editBracket ? "Edit Tax Bracket" : "Add Tax Bracket"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Min Income (₹)</Label><Input type="number" value={bracketForm.min_income} onChange={e => setBracketForm({ ...bracketForm, min_income: Number(e.target.value) })} /></div>
              <div><Label>Max Income (₹) — blank = ∞</Label><Input type="number" value={bracketForm.max_income} onChange={e => setBracketForm({ ...bracketForm, max_income: e.target.value })} placeholder="No limit" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tax Rate (%)</Label><Input type="number" min="0" max="100" step="0.5" value={bracketForm.tax_rate} onChange={e => setBracketForm({ ...bracketForm, tax_rate: Number(e.target.value) })} /></div>
              <div><Label>Sort Order</Label><Input type="number" value={bracketForm.sort_order} onChange={e => setBracketForm({ ...bracketForm, sort_order: Number(e.target.value) })} /></div>
            </div>
            <div><Label>Description</Label><Input value={bracketForm.description} onChange={e => setBracketForm({ ...bracketForm, description: e.target.value })} placeholder="e.g. 5% on ₹3-7L" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBracketForm(false)}>Cancel</Button>
            <Button onClick={() => saveBracketMutation.mutate()} disabled={saveBracketMutation.isPending} className="bg-[#E8604C] hover:bg-[#d4553f]">
              {saveBracketMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
