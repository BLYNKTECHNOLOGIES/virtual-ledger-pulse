import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Search, CheckCircle, XCircle, AlertTriangle, CalendarDays } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { ResponsiveList } from "@/components/horilla/primitives/ResponsiveList";

export default function LeaveRequestsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ employee_id: "", leave_type_id: "", start_date: "", end_date: "", reason: "", is_half_day: false, half_day_period: "morning" });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["hr_leave_requests", statusFilter],
    queryFn: async () => {
      let query = (supabase as any).from("hr_leave_requests")
        .select("*, hr_employees!hr_leave_requests_employee_id_fkey(badge_id, first_name, last_name), hr_leave_types!hr_leave_requests_leave_type_id_fkey(name, color)")
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
      const data = await fetchAllPaginated<any>(() => (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name").eq("is_active", true));
      return data || [];
    },
  });

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ["hr_leave_types"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_leave_types").select("id, name").eq("is_active", true);
      return data || [];
    },
  });

  // Fetch weekly off patterns for all employees
  const { data: weeklyOffPatterns = [] } = useQuery({
    queryKey: ["hr_employee_weekly_off_patterns"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_employee_weekly_off").select("employee_id, day_of_week");
      return data || [];
    },
  });

  // Calculate working days using employee-specific weekly off pattern
  const countWorkingDays = (startStr: string, endStr: string, employeeId?: string) => {
    const start = new Date(startStr + "T00:00:00");
    const end = new Date(endStr + "T00:00:00");
    
    // Get this employee's weekly off days (0=Sun, 1=Mon, ..., 6=Sat)
    const empOffDays = (weeklyOffPatterns as any[])
      .filter((p: any) => p.employee_id === employeeId)
      .map((p: any) => Number(p.day_of_week));
    
    // Default to Sunday only if no pattern configured
    const offDays = empOffDays.length > 0 ? empOffDays : [0];
    
    let count = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (!offDays.includes(d.getDay())) count++;
    }
    return count;
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const days = form.is_half_day ? 0.5 : countWorkingDays(form.start_date, form.end_date, form.employee_id);
      const { error } = await (supabase as any).from("hr_leave_requests").insert({
        employee_id: form.employee_id,
        leave_type_id: form.leave_type_id,
        start_date: form.start_date,
        end_date: form.is_half_day ? form.start_date : form.end_date,
        reason: form.reason || null,
        total_days: days,
        is_half_day: form.is_half_day,
        half_day_period: form.is_half_day ? form.half_day_period : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_leave_requests"] });
      setShowAdd(false);
      setForm({ employee_id: "", leave_type_id: "", start_date: "", end_date: "", reason: "", is_half_day: false, half_day_period: "morning" });
      toast.success("Leave request created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status, request }: { id: string; status: string; request?: any }) => {
      // Validate balance before approving
      if (status === "approved" && request) {
        const totalDays = Number(request.total_days || 0);

        // Get all allocations for this employee+leave type (cumulative balance)
        const { data: allocations } = await (supabase as any)
          .from("hr_leave_allocations")
          .select("allocated_days, used_days, available_days")
          .eq("employee_id", request.employee_id)
          .eq("leave_type_id", request.leave_type_id);

        if (allocations && allocations.length > 0) {
          const totalAllocated = allocations.reduce((s: number, a: any) => s + Number(a.allocated_days || 0), 0);
          const totalUsed = allocations.reduce((s: number, a: any) => s + Number(a.used_days || 0), 0);
          const available = totalAllocated - totalUsed;

          if (totalDays > available) {
            throw new Error(`Insufficient leave balance. Available: ${available} days, Requested: ${totalDays} days`);
          }
        }
      }

      // Update status — DB trigger handles balance deduction/restoration automatically
      const { error } = await (supabase as any).from("hr_leave_requests").update({
        status,
        ...(status === "approved" ? { approved_at: new Date().toISOString() } : {}),
        ...(status === "rejected" ? { rejection_reason: "Rejected by admin" } : {}),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_leave_requests"] });
      qc.invalidateQueries({ queryKey: ["hr_leave_allocations_all"] });
      toast.success("Status updated");
    },
  });

  const filtered = requests.filter((r: any) => {
    const q = search.toLowerCase();
    const name = `${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.toLowerCase();
    return name.includes(q) || r.hr_employees?.badge_id?.toLowerCase().includes(q);
  });

  return (
    <div className="hrms-page space-y-4 p-3 md:p-6 page-mount">
      <PageHeader
        title="Leave Requests"
        description="Manage employee leave requests"
        actions={
          <Button onClick={() => setShowAdd(true)} className="bg-[#E8604C] hover:bg-[#d4553f] h-9">
            <Plus className="h-4 w-4 mr-2" /> New Request
          </Button>
        }
      />

      <div className="hrms-toolbar">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="requested">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} columns={9} />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={CalendarDays}
              title="No leave requests found"
              description={search || statusFilter !== "all" ? "Try adjusting your filters." : "New requests will appear here once submitted."}
            />
          </CardContent>
        </Card>
      ) : (
        <ResponsiveList
          items={filtered}
          columns={["Employee", "Leave Type", "Start", "End", "Days", "Clashes", "Status", "Reason", "Actions"].map((h) => ({ key: h, label: h }))}
          keyFor={(r: any) => r.id}
          tableMinWidth="min-w-[860px]"
          renderRow={(r: any) => (
            <>
              <td className="px-4 py-3 font-medium whitespace-nowrap">{r.hr_employees?.first_name} {r.hr_employees?.last_name}</td>
              <td className="px-4 py-3"><LeaveTypeBadge name={r.hr_leave_types?.name} /></td>
              <td className="px-4 py-3 tabular-nums">{r.start_date}</td>
              <td className="px-4 py-3 tabular-nums">{r.end_date}</td>
              <td className="px-4 py-3 font-medium tabular-nums"><LeaveDays request={r} /></td>
              <td className="px-4 py-3"><ClashBadge request={r} /></td>
              <td className="px-4 py-3"><LeaveStatusBadge status={r.status} /></td>
              <td className="px-4 py-3 text-muted-foreground text-xs max-w-[120px] truncate">{r.reason || "—"}</td>
              <td className="px-4 py-3"><LeaveActions request={r} statusMutation={statusMutation} /></td>
            </>
          )}
          renderCard={(r: any) => (
            <div className="hrms-mobile-card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{r.hr_employees?.first_name} {r.hr_employees?.last_name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{r.hr_employees?.badge_id}</p>
                </div>
                <LeaveStatusBadge status={r.status} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <LeaveTypeBadge name={r.hr_leave_types?.name} />
                <LeaveDays request={r} />
              </div>
              <div className="hrms-mobile-kv">
                <span>Start</span><span>{r.start_date}</span>
                <span>End</span><span>{r.end_date}</span>
                <span>Clashes</span><span>{(r.leave_clashes_count || 0) > 0 ? r.leave_clashes_count : "None"}</span>
                <span>Reason</span><span>{r.reason || "—"}</span>
              </div>
              <LeaveActions request={r} statusMutation={statusMutation} mobile />
            </div>
          )}
        />
      )}

      <ResponsiveDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        title={<span className="text-sm font-semibold flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#E8604C]" /> New Leave Request</span>}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAdd(false)} className="h-9">Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.employee_id || !form.leave_type_id || !form.start_date || (!form.is_half_day && !form.end_date)} className="bg-[#E8604C] hover:bg-[#d4553f] h-9">Submit</Button>
          </>
        }
      >
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Leave Type</Label>
              <Select value={form.leave_type_id} onValueChange={(v) => setForm({ ...form, leave_type_id: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{leaveTypes.map((lt: any) => <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_half_day} onChange={(e) => setForm({ ...form, is_half_day: e.target.checked })} className="rounded border-border" />
              <Label>Half Day Leave</Label>
            </div>
            {form.is_half_day && (
              <div>
                <Label>Period</Label>
                <Select value={form.half_day_period} onValueChange={(v) => setForm({ ...form, half_day_period: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning">Morning</SelectItem>
                    <SelectItem value="afternoon">Afternoon</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="h-9" /></div>
              {!form.is_half_day && <div><Label>End Date</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="h-9" /></div>}
            </div>
            <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Reason for leave..." /></div>
          </div>
      </ResponsiveDialog>
    </div>
  );
}

function LeaveTypeBadge({ name }: { name?: string }) {
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border bg-primary/10 text-primary border-primary/20">{name || "Leave"}</span>;
}

function LeaveDays({ request }: { request: any }) {
  return (
    <span className="font-medium tabular-nums">
      {request.total_days}
      {request.is_half_day && <span className="ml-1 text-[10px] bg-info/10 text-info border border-info/20 px-1.5 py-0.5 rounded-full">{request.half_day_period || "half"}</span>}
    </span>
  );
}

function ClashBadge({ request }: { request: any }) {
  return (request.leave_clashes_count || 0) > 0 ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border bg-warning/10 text-warning border-warning/20">
            <AlertTriangle className="h-3 w-3" />
            {request.leave_clashes_count}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{request.leave_clashes_count} employee(s) in the same department have overlapping leave</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : <span className="text-muted-foreground text-xs">None</span>;
}

function LeaveStatusBadge({ status }: { status?: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
      status === "approved" ? "bg-success/10 text-success border-success/20" :
      status === "rejected" ? "bg-destructive/10 text-destructive border-destructive/20" :
      "bg-warning/10 text-warning border-warning/20"
    }`}>{status || "requested"}</span>
  );
}

function LeaveActions({ request, statusMutation, mobile = false }: { request: any; statusMutation: any; mobile?: boolean }) {
  if (request.status === "requested") {
    return (
      <div className={mobile ? "grid grid-cols-2 gap-2" : "flex gap-1"}>
        <Button size="sm" variant="ghost" className="text-success h-8" onClick={() => statusMutation.mutate({ id: request.id, status: "approved", request })}>
          <CheckCircle className="h-4 w-4" />{mobile ? <span className="ml-1">Approve</span> : null}
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive h-8" onClick={() => statusMutation.mutate({ id: request.id, status: "rejected" })}>
          <XCircle className="h-4 w-4" />{mobile ? <span className="ml-1">Reject</span> : null}
        </Button>
      </div>
    );
  }
  if (request.status === "approved") {
    return <Button size="sm" variant="ghost" className="text-warning h-8 text-xs" onClick={() => statusMutation.mutate({ id: request.id, status: "cancelled", request })}>Cancel</Button>;
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}
