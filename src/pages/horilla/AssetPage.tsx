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
import { Plus, Search, Laptop, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";

export default function AssetPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", asset_type: "hardware", serial_number: "", status: "available", purchase_cost: 0, condition: "good", notes: "" });

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["hr_assets", statusFilter],
    queryFn: async () => {
      const query: any = (supabase as any).from("hr_assets").select("*").order("created_at", { ascending: false });
      const { data, error } = statusFilter !== "all" ? await query.eq("status", statusFilter) : await query;
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, purchase_cost: form.purchase_cost || 0 };
      if (editId) {
        const { error } = await (supabase as any).from("hr_assets").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("hr_assets").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_assets"] });
      setShowDialog(false); setEditId(null);
      setForm({ name: "", asset_type: "hardware", serial_number: "", status: "available", purchase_cost: 0, condition: "good", notes: "" });
      toast.success(editId ? "Asset updated" : "Asset created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase as any).from("hr_assets").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr_assets"] }); toast.success("Deleted"); },
  });

  const filtered = assets.filter((a: any) => a.name?.toLowerCase().includes(search.toLowerCase()) || a.serial_number?.toLowerCase().includes(search.toLowerCase()));

  const statusColor = (s: string) => s === "available" ? "bg-success/10 text-success border border-success/20" : s === "assigned" ? "bg-info/10 text-info border border-info/20" : s === "maintenance" ? "bg-warning/10 text-warning border border-warning/20" : "bg-muted text-foreground border border-border";

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Assets"
        description="Manage company assets and equipment"
        actions={
          <Button onClick={() => { setEditId(null); setForm({ name: "", asset_type: "hardware", serial_number: "", status: "available", purchase_cost: 0, condition: "good", notes: "" }); setShowDialog(true); }} className="bg-[#E8604C] hover:bg-[#d4553f] h-9">
            <Plus className="h-4 w-4 mr-2" /> Add Asset
          </Button>
        }
      />
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search assets..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="retired">Retired</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {["Asset", "Type", "Serial No.", "Status", "Condition", "Cost", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-4"><TableSkeleton rows={5} columns={7} /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7}>
                  <EmptyState icon={Laptop} title="No assets found" description="Add your first asset to get started." action={<Button onClick={() => setShowDialog(true)} className="bg-[#E8604C] hover:bg-[#d4553f] h-9"><Plus className="h-4 w-4 mr-2" />Add Asset</Button>} />
                </td></tr>
              ) : filtered.map((a: any) => (
                <tr key={a.id} className="border-b hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium flex items-center gap-2"><Laptop className="h-4 w-4 text-[#E8604C]" />{a.name}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{a.asset_type}</td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{a.serial_number || "—"}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor(a.status)}`}>{a.status}</span></td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{a.condition}</td>
                  <td className="px-4 py-3 tabular-nums text-right">₹{(a.purchase_cost || 0).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditId(a.id); setForm({ name: a.name, asset_type: a.asset_type, serial_number: a.serial_number || "", status: a.status, purchase_cost: a.purchase_cost || 0, condition: a.condition || "good", notes: a.notes || "" }); setShowDialog(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-sm font-semibold flex items-center gap-2"><Laptop className="h-4 w-4 text-[#E8604C]" />{editId ? "Edit" : "Add"} Asset</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Asset Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. MacBook Pro 16" className="h-9 mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label><Select value={form.asset_type} onValueChange={(v) => setForm({ ...form, asset_type: v })}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="hardware">Hardware</SelectItem><SelectItem value="software">Software</SelectItem><SelectItem value="furniture">Furniture</SelectItem><SelectItem value="vehicle">Vehicle</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
              <div><Label>Serial Number</Label><Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} className="h-9 mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="available">Available</SelectItem><SelectItem value="assigned">Assigned</SelectItem><SelectItem value="maintenance">Maintenance</SelectItem><SelectItem value="retired">Retired</SelectItem></SelectContent></Select></div>
              <div><Label>Condition</Label><Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="excellent">Excellent</SelectItem><SelectItem value="good">Good</SelectItem><SelectItem value="fair">Fair</SelectItem><SelectItem value="poor">Poor</SelectItem></SelectContent></Select></div>
            </div>
            <div><Label>Purchase Cost (₹)</Label><Input type="number" value={form.purchase_cost} onChange={(e) => setForm({ ...form, purchase_cost: parseFloat(e.target.value) || 0 })} className="h-9 mt-1" /></div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." className="h-9 mt-1" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowDialog(false)} className="h-9">Cancel</Button><Button onClick={() => saveMutation.mutate()} disabled={!form.name} className="bg-[#E8604C] hover:bg-[#d4553f] h-9">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
