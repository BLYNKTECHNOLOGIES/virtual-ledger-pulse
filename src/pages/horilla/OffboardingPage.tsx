import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Search, LogOut, CheckCircle, Clock } from "lucide-react";

export default function OffboardingPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ employee_id: "", reason_for_leaving: "", last_working_day: "", notice_period_days: 30 });

  const { data: offboardings = [], isLoading } = useQuery({
    queryKey: ["employee_offboarding"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("employee_offboarding")
        .select("*, employees!employee_offboarding_employee_id_fkey(name, employee_id, department, designation)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Use hr_employees for creating new offboardings
  const { data: hrEmployees = [] } = useQuery({
    queryKey: ["hr_employees_active"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name").eq("is_active", true);
      return data || [];
    },
  });

  // Also fetch legacy employees for backward compat
  const { data: legacyEmployees = [] } = useQuery({
    queryKey: ["employees_for_offboard"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("employees").select("id, name, employee_id, department").eq("status", "active");
      return data || [];
    },
  });

  // Merge both employee lists for the dropdown
  const allEmployees = [
    ...hrEmployees.map((e: any) => ({ id: e.id, label: `${e.first_name} ${e.last_name} (${e.badge_id})` })),
    ...legacyEmployees.map((e: any) => ({ id: e.id, label: `${e.name} (${e.employee_id})` })),
  ];

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("employee_offboarding").insert({
        employee_id: form.employee_id,
        reason_for_leaving: form.reason_for_leaving || null,
        last_working_day: form.last_working_day || null,
        notice_period_days: form.notice_period_days,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee_offboarding"] });
      setShowDialog(false);
      setForm({ employee_id: "", reason_for_leaving: "", last_working_day: "", notice_period_days: 30 });
      toast.success("Offboarding initiated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status, employeeId }: { id: string; status: string; employeeId?: string }) => {
      const { error } = await (supabase as any).from("employee_offboarding").update({ status }).eq("id", id);
      if (error) throw error;

      // When offboarding is completed, deactivate the employee
      if (status === "completed" && employeeId) {
        // Try hr_employees first
        await (supabase as any).from("hr_employees").update({ is_active: false }).eq("id", employeeId);
        // Also try legacy employees table
        await (supabase as any).from("employees").update({ status: "inactive" }).eq("id", employeeId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee_offboarding"] });
      qc.invalidateQueries({ queryKey: ["hr_employees_active"] });
      toast.success("Updated");
    },
  });

  const filtered = offboardings.filter((o: any) => {
    const name = o.employees?.name || "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const statusColor = (s: string) =>
    s === "initiated" ? "bg-yellow-100 text-yellow-700" :
    s === "in_progress" ? "bg-blue-100 text-blue-700" :
    s === "completed" ? "bg-green-100 text-green-700" :
    "bg-gray-100 text-gray-700";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Offboarding</h1>
          <p className="text-sm text-gray-500">Manage employee exits</p>
        </div>
        <Button onClick={() => setShowDialog(true)} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <Plus className="h-4 w-4 mr-2" /> Initiate Offboarding
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Employee", "Department", "Reason", "Last Day", "Notice", "Status", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">No offboarding records</td></tr>
              ) : (
                filtered.map((o: any) => (
                  <tr key={o.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium flex items-center gap-2 whitespace-nowrap">
                      <LogOut className="h-4 w-4 text-gray-400" />{o.employees?.name || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{o.employees?.department || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[150px] truncate">{o.reason_for_leaving || "—"}</td>
                    <td className="px-4 py-3">{o.last_working_day || "—"}</td>
                    <td className="px-4 py-3">{o.notice_period_days || 0} days</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(o.status)}`}>{o.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {o.status === "initiated" && (
                          <Button size="sm" variant="ghost" className="text-blue-600 h-7" onClick={() => statusMutation.mutate({ id: o.id, status: "in_progress" })}>
                            <Clock className="h-4 w-4" />
                          </Button>
                        )}
                        {o.status === "in_progress" && (
                          <Button size="sm" variant="ghost" className="text-green-600 h-7" onClick={() => statusMutation.mutate({ id: o.id, status: "completed", employeeId: o.employee_id })}>
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Initiate Offboarding</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {allEmployees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reason for Leaving</Label><Textarea value={form.reason_for_leaving} onChange={(e) => setForm({ ...form, reason_for_leaving: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Last Working Day</Label><Input type="date" value={form.last_working_day} onChange={(e) => setForm({ ...form, last_working_day: e.target.value })} /></div>
              <div><Label>Notice Period (days)</Label><Input type="number" value={form.notice_period_days} onChange={(e) => setForm({ ...form, notice_period_days: parseInt(e.target.value) || 0 })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.employee_id} className="bg-[#E8604C] hover:bg-[#d4553f]">Initiate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
