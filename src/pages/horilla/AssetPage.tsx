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

  const statusColor = (s: string) => s === "available" ? "bg-green-100 text-green-700" : s === "assigned" ? "bg-blue-100 text-blue-700" : s === "maintenance" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Assets</h1><p className="text-sm text-gray-500">Manage company assets and equipment</p></div>
        <Button onClick={() => { setEditId(null); setForm({ name: "", asset_type: "hardware", serial_number: "", status: "available", purchase_cost: 0, condition: "good", notes: "" }); setShowDialog(true); }} className="bg-[#E8604C] hover:bg-[#d4553f]"><Plus className="h-4 w-4 mr-2" /> Add Asset</Button>
      </div>
      <div className="flex gap-3">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><Input placeholder="Search assets..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="available">Available</SelectItem><SelectItem value="assigned">Assigned</SelectItem><SelectItem value="maintenance">Maintenance</SelectItem><SelectItem value="retired">Retired</SelectItem></SelectContent></Select>
      </div>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr>{["Asset", "Type", "Serial No.", "Status", "Condition", "Cost", "Actions"].map(h => <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>)}</tr></thead>
        <tbody>{isLoading ? <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading...</td></tr> : filtered.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-gray-400">No assets</td></tr> : filtered.map((a: any) => (
          <tr key={a.id} className="border-b hover:bg-gray-50">
            <td className="px-4 py-3 font-medium flex items-center gap-2"><Laptop className="h-4 w-4 text-[#E8604C]" />{a.name}</td>
            <td className="px-4 py-3 text-gray-500 capitalize">{a.asset_type}</td>
            <td className="px-4 py-3 text-gray-500">{a.serial_number || "—"}</td>
            <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(a.status)}`}>{a.status}</span></td>
            <td className="px-4 py-3 text-gray-500 capitalize">{a.condition}</td>
            <td className="px-4 py-3">₹{(a.purchase_cost || 0).toLocaleString()}</td>
            <td className="px-4 py-3"><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => { setEditId(a.id); setForm({ name: a.name, asset_type: a.asset_type, serial_number: a.serial_number || "", status: a.status, purchase_cost: a.purchase_cost || 0, condition: a.condition || "good", notes: a.notes || "" }); setShowDialog(true); }}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteMutation.mutate(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div></td>
          </tr>
        ))}</tbody></table>
      </CardContent></Card>
      <Dialog open={showDialog} onOpenChange={setShowDialog}><DialogContent><DialogHeader><DialogTitle>{editId ? "Edit" : "Add"} Asset</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Asset Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. MacBook Pro 16" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Type</Label><Select value={form.asset_type} onValueChange={(v) => setForm({ ...form, asset_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="hardware">Hardware</SelectItem><SelectItem value="software">Software</SelectItem><SelectItem value="furniture">Furniture</SelectItem><SelectItem value="vehicle">Vehicle</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
            <div><Label>Serial Number</Label><Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="available">Available</SelectItem><SelectItem value="assigned">Assigned</SelectItem><SelectItem value="maintenance">Maintenance</SelectItem><SelectItem value="retired">Retired</SelectItem></SelectContent></Select></div>
            <div><Label>Condition</Label><Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="excellent">Excellent</SelectItem><SelectItem value="good">Good</SelectItem><SelectItem value="fair">Fair</SelectItem><SelectItem value="poor">Poor</SelectItem></SelectContent></Select></div>
          </div>
          <div><Label>Purchase Cost (₹)</Label><Input type="number" value={form.purchase_cost} onChange={(e) => setForm({ ...form, purchase_cost: parseFloat(e.target.value) || 0 })} /></div>
          <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button><Button onClick={() => saveMutation.mutate()} disabled={!form.name} className="bg-[#E8604C] hover:bg-[#d4553f]">Save</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
}
