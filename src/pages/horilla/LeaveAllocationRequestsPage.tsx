import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Search, CheckCircle, XCircle, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";

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
      const data = await fetchAllPaginated<any>(() => (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name").eq("is_active", true).order("first_name"));
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
        status: "requested",
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
    const cls = status === "approved"
      ? "bg-success/10 text-success border-success/20"
      : status === "rejected"
      ? "bg-destructive/10 text-destructive border-destructive/20"
      : "bg-warning/10 text-warning border-warning/20";
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${cls} capitalize`}>{status}</span>;
  };

  const filtered = requests.filter((r: any) => {
    if (!search) return true;
    const name = r.hr_employees ? `${r.hr_employees.first_name} ${r.hr_employees.last_name}` : "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const pendingCount = requests.filter((r: any) => r.status === "pending").length;

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Leave Allocation Requests"
        description={`${pendingCount} pending approval${pendingCount !== 1 ? "s" : ""}`}
        actions={
          <Button onClick={() => setShowAdd(true)} className="h-9"><Plus className="h-4 w-4 mr-1" /> New Request</Button>
        }
      />

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by employee..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="requested">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} columns={7} />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Clock}
              title="No allocation requests"
              description="Requests for additional leave days will appear here."
              action={
                <Button onClick={() => setShowAdd(true)} className="h-9"><Plus className="h-4 w-4 mr-1" /> New Request</Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Date</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Employee</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Leave Type</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Days</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Status</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Description</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm tabular-nums">{format(new Date(r.created_at), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-sm font-medium">
                      {r.hr_employees ? `${r.hr_employees.first_name} ${r.hr_employees.last_name} (${r.hr_employees.badge_id})` : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{r.hr_leave_types?.name || "—"}</TableCell>
                    <TableCell className="text-sm font-medium tabular-nums">{r.requested_days}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate text-muted-foreground">{r.description || "—"}</TableCell>
                    <TableCell>
                      {r.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="text-success h-7 px-2" onClick={() => approveMutation.mutate({ id: r.id, action: "approved" })}>
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive h-7 px-2" onClick={() => approveMutation.mutate({ id: r.id, action: "rejected" })}>
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
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Request Leave Allocation</DialogTitle>
            <DialogDescription>Request additional leave days for an employee</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee *</Label>
              <Select value={form.employee_id} onValueChange={v => setForm({ ...form, employee_id: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select employee..." /></SelectTrigger>
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
                <SelectTrigger className="h-9"><SelectValue placeholder="Select leave type..." /></SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((lt: any) => (
                    <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Requested Days</Label>
              <Input type="number" value={form.requested_days} onChange={e => setForm({ ...form, requested_days: e.target.value })} min="1" className="h-9" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Reason for extra allocation..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} className="h-9">Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="h-9">
              {createMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
