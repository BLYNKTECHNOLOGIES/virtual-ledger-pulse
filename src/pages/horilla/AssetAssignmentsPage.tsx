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
import { Plus, Search, RotateCcw } from "lucide-react";

export default function AssetAssignmentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAssign, setShowAssign] = useState(false);
  const [showReturn, setShowReturn] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [form, setForm] = useState({ asset_id: "", employee_id: "", notes: "" });

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["hr_asset_assignments", statusFilter],
    queryFn: async () => {
      let query = (supabase as any)
        .from("hr_asset_assignments")
        .select("*, hr_assets(name, serial_number, asset_type), hr_employees(employee_name, employee_id)")
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: availableAssets = [] } = useQuery({
    queryKey: ["hr_assets_available"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_assets").select("id, name, serial_number").eq("status", "available");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_list"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_employees").select("id, employee_name, employee_id").eq("status", "active");
      if (error) throw error;
      return data || [];
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const { error: aErr } = await (supabase as any).from("hr_asset_assignments").insert({
        asset_id: form.asset_id,
        employee_id: form.employee_id,
        notes: form.notes || null,
      });
      if (aErr) throw aErr;
      // Update asset status
      const emp = employees.find((e: any) => e.id === form.employee_id);
      const { error: uErr } = await (supabase as any).from("hr_assets").update({
        status: "assigned",
        assigned_to: form.employee_id,
      }).eq("id", form.asset_id);
      if (uErr) throw uErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_asset_assignments"] });
      qc.invalidateQueries({ queryKey: ["hr_assets"] });
      setShowAssign(false);
      setForm({ asset_id: "", employee_id: "", notes: "" });
      toast.success("Asset assigned successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const returnMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const assignment = assignments.find((a: any) => a.id === assignmentId);
      const { error: aErr } = await (supabase as any).from("hr_asset_assignments").update({
        status: "returned",
        return_date: new Date().toISOString().split("T")[0],
        return_reason: returnReason || null,
      }).eq("id", assignmentId);
      if (aErr) throw aErr;
      if (assignment?.asset_id) {
        const { error: uErr } = await (supabase as any).from("hr_assets").update({
          status: "available",
          assigned_to: null,
        }).eq("id", assignment.asset_id);
        if (uErr) throw uErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_asset_assignments"] });
      qc.invalidateQueries({ queryKey: ["hr_assets"] });
      setShowReturn(null);
      setReturnReason("");
      toast.success("Asset returned successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = assignments.filter((a: any) =>
    (a.hr_assets?.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (a.hr_employees?.employee_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asset Assignments</h1>
          <p className="text-sm text-gray-500">Track asset assignments and returns</p>
        </div>
        <Button onClick={() => setShowAssign(true)} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <Plus className="h-4 w-4 mr-2" /> Assign Asset
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search by asset or employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="returned">Returned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Asset", "Type", "Employee", "Assigned Date", "Return Date", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">No assignments found</td></tr>
              ) : filtered.map((a: any) => (
                <tr key={a.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{a.hr_assets?.name || "—"}</td>
                  <td className="px-4 py-3 text-gray-500 capitalize">{a.hr_assets?.asset_type || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{a.hr_employees?.employee_name || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{a.assigned_date}</td>
                  <td className="px-4 py-3 text-gray-500">{a.return_date || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {a.status === "active" && (
                      <Button size="sm" variant="outline" onClick={() => setShowReturn(a.id)}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Return
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Assign Dialog */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Asset</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Asset</Label>
              <Select value={form.asset_id} onValueChange={(v) => setForm({ ...form, asset_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select available asset" /></SelectTrigger>
                <SelectContent>
                  {availableAssets.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} {a.serial_number ? `(${a.serial_number})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.employee_name} ({e.employee_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(false)}>Cancel</Button>
            <Button onClick={() => assignMutation.mutate()} disabled={!form.asset_id || !form.employee_id} className="bg-[#E8604C] hover:bg-[#d4553f]">Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Dialog */}
      <Dialog open={!!showReturn} onOpenChange={() => setShowReturn(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Return Asset</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Return Reason</Label>
              <Input value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="e.g. Employee resignation, upgrade..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReturn(null)}>Cancel</Button>
            <Button onClick={() => showReturn && returnMutation.mutate(showReturn)} className="bg-[#E8604C] hover:bg-[#d4553f]">Confirm Return</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
