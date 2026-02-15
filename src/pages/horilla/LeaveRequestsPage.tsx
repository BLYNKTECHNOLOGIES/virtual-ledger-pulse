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
import { Plus, Search, CheckCircle, XCircle } from "lucide-react";

export default function LeaveRequestsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ employee_id: "", leave_type_id: "", start_date: "", end_date: "", reason: "" });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["hr_leave_requests", statusFilter],
    queryFn: async () => {
      const query: any = supabase.from("hr_leave_requests")
        .select("*, hr_employees!hr_leave_requests_employee_id_fkey(employee_id, name, department), hr_leave_types!hr_leave_requests_leave_type_id_fkey(name, color)")
        .order("created_at", { ascending: false });
      const { data, error } = statusFilter !== "all"
        ? await query.eq("status", statusFilter)
        : await query;
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_list"],
    queryFn: async () => {
      const result = await (supabase as any).from("hr_employees").select("id, employee_id, name").eq("status", "active");
      return result.data || [];
    },
  });

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ["hr_leave_types"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_leave_types").select("id, name").eq("is_active", true);
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const start = new Date(form.start_date);
      const end = new Date(form.end_date);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const { error } = await supabase.from("hr_leave_requests").insert({
        employee_id: form.employee_id,
        leave_type_id: form.leave_type_id,
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason || null,
        total_days: days,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_leave_requests"] });
      setShowAdd(false);
      setForm({ employee_id: "", leave_type_id: "", start_date: "", end_date: "", reason: "" });
      toast.success("Leave request created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("hr_leave_requests").update({
        status,
        ...(status === "approved" ? { approved_at: new Date().toISOString() } : {}),
        ...(status === "rejected" ? { rejection_reason: "Rejected by admin" } : {}),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_leave_requests"] });
      toast.success("Status updated");
    },
  });

  const filtered = requests.filter((r: any) => {
    const q = search.toLowerCase();
    return r.hr_employees?.name?.toLowerCase().includes(q) || r.hr_employees?.employee_id?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Requests</h1>
          <p className="text-sm text-gray-500">Manage employee leave requests</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <Plus className="h-4 w-4 mr-2" /> New Request
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Employee", "Leave Type", "Start", "End", "Days", "Status", "Reason", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">No leave requests</td></tr>
              ) : (
                filtered.map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.hr_employees?.name}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#E8604C]/10 text-[#E8604C]">
                        {r.hr_leave_types?.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">{r.start_date}</td>
                    <td className="px-4 py-3">{r.end_date}</td>
                    <td className="px-4 py-3 font-medium">{r.total_days}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === "approved" ? "bg-green-100 text-green-700" :
                        r.status === "rejected" ? "bg-red-100 text-red-700" :
                        "bg-yellow-100 text-yellow-700"
                      }`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[120px] truncate">{r.reason || "—"}</td>
                    <td className="px-4 py-3">
                      {r.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="text-green-600 h-7" onClick={() => statusMutation.mutate({ id: r.id, status: "approved" })}>
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-600 h-7" onClick={() => statusMutation.mutate({ id: r.id, status: "rejected" })}>
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Leave Request</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name} ({e.employee_id})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Leave Type</Label>
              <Select value={form.leave_type_id} onValueChange={(v) => setForm({ ...form, leave_type_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{leaveTypes.map((lt: any) => <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><Label>End Date</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            </div>
            <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Reason for leave..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.employee_id || !form.leave_type_id || !form.start_date || !form.end_date} className="bg-[#E8604C] hover:bg-[#d4553f]">Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
