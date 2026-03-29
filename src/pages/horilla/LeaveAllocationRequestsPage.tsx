import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Search, CheckCircle, XCircle, Clock } from "lucide-react";

export default function LeaveAllocationRequestsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ employee_id: "", leave_type_id: "", requested_days: "1", description: "" });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["hr_leave_allocation_requests", statusFilter],
    queryFn: async () => {
      let query = (supabase as any).from("hr_leave_allocation_requests")
        .select("*, hr_employees!hr_leave_allocation_requests_employee_id_fkey(badge_id, first_name, last_name), hr_leave_types!hr_leave_allocation_requests_leave_type_id_fkey(name, color)")
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name").eq("is_active", true).order("first_name");
      return data || [];
    },
  });

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ["hr_leave_types_active"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_leave_types").select("id, name").eq("is_active", true);
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.employee_id || !form.leave_type_id) throw new Error("Employee and leave type are required");
      const { data: user } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("hr_leave_allocation_requests").insert({
        employee_id: form.employee_id,
        leave_type_id: form.leave_type_id,
        requested_days: parseInt(form.requested_days) || 1,
        description: form.description || null,
        status: "pending",
        created_by: user?.user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_leave_allocation_requests"] });
      setShowAdd(false);
      setForm({ employee_id: "", leave_type_id: "", requested_days: "1", description: "" });
      toast.success("Allocation request submitted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approved" | "rejected" }) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("hr_leave_allocation_requests")
        .update({ status: action, approved_by: user?.user?.id, approved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;

      // If approved, actually add to hr_leave_allocations
      if (action === "approved") {
        const req = requests.find((r: any) => r.id === id);
        if (req) {
          const year = new Date().getFullYear();
          const quarter = Math.ceil((new Date().getMonth() + 1) / 3);
          await (supabase as any).from("hr_leave_allocations").insert({
            employee_id: req.employee_id,
            leave_type_id: req.leave_type_id,
            year,
            quarter,
            allocated_days: req.requested_days,
            carry_forward_days: 0,
            used_days: 0,
          });
        }
      }
    },
    onSuccess: (_, { action }) => {
      qc.invalidateQueries({ queryKey: ["hr_leave_allocation_requests"] });
      qc.invalidateQueries({ queryKey: ["hr_leave_allocations_all"] });
      toast.success(`Request ${action}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "approved": return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case "rejected": return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
      default: return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
    }
  };

  const filtered = requests.filter((r: any) => {
    if (!search) return true;
    const name = r.hr_employees ? `${r.hr_employees.first_name} ${r.hr_employees.last_name}` : "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const pendingCount = requests.filter((r: any) => r.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Leave Allocation Requests</h1>
          <p className="text-sm text-muted-foreground">{pendingCount} pending approval{pendingCount !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" /> New Request</Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by employee..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Leave Type</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No allocation requests</TableCell></TableRow>
              ) : filtered.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{format(new Date(r.created_at), "dd MMM yyyy")}</TableCell>
                  <TableCell className="text-sm font-medium">
                    {r.hr_employees ? `${r.hr_employees.first_name} ${r.hr_employees.last_name} (${r.hr_employees.badge_id})` : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{r.hr_leave_types?.name || "—"}</TableCell>
                  <TableCell className="text-sm font-medium">{r.requested_days}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{r.description || "—"}</TableCell>
                  <TableCell>
                    {r.status === "pending" && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="text-green-600 h-7 px-2" onClick={() => approveMutation.mutate({ id: r.id, action: "approved" })}>
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600 h-7 px-2" onClick={() => approveMutation.mutate({ id: r.id, action: "rejected" })}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Leave Allocation</DialogTitle>
            <DialogDescription>Request additional leave days for an employee</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee *</Label>
              <Select value={form.employee_id} onValueChange={v => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee..." /></SelectTrigger>
                <SelectContent>
                  {employees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Leave Type *</Label>
              <Select value={form.leave_type_id} onValueChange={v => setForm({ ...form, leave_type_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select leave type..." /></SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((lt: any) => (
                    <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Requested Days</Label>
              <Input type="number" value={form.requested_days} onChange={e => setForm({ ...form, requested_days: e.target.value })} min="1" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Reason for extra allocation..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
