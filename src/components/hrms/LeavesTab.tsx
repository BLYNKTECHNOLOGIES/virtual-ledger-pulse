import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Calendar, Clock, BarChart3, Search, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

function getCurrentQuarter() {
  return Math.ceil((new Date().getMonth() + 1) / 3);
}

function getQuarterLabel(q: number) {
  return `Q${q} (${["Jan-Mar", "Apr-Jun", "Jul-Sep", "Oct-Dec"][q - 1]})`;
}

export function LeavesTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch leave requests with employee and leave type info
  const { data: leaveRequests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ["hrms_leave_requests", statusFilter],
    queryFn: async () => {
      let query = (supabase as any).from("hr_leave_requests")
        .select("*, hr_employees!hr_leave_requests_employee_id_fkey(badge_id, first_name, last_name), hr_leave_types!hr_leave_requests_leave_type_id_fkey(name, color, code)")
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  // Fetch all allocations for summary
  const { data: allocations = [] } = useQuery({
    queryKey: ["hrms_leave_allocations_summary"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_leave_allocations")
        .select("*, hr_leave_types!hr_leave_allocations_leave_type_id_fkey(name, color, code)");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  // Fetch leave types
  const { data: leaveTypes = [] } = useQuery({
    queryKey: ["hrms_leave_types"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_leave_types").select("*").eq("is_active", true);
      return data || [];
    },
  });

  // Approve/Reject mutation
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updateData: any = { status };
      if (status === "Approved") updateData.approved_at = new Date().toISOString();
      if (status === "Rejected") updateData.rejection_reason = "Rejected by admin";
      const { error } = await (supabase as any).from("hr_leave_requests").update(updateData).eq("id", id);
      if (error) throw error;

      // Update allocation used_days on approval
      if (status === "Approved") {
        const req = leaveRequests.find((r: any) => r.id === id);
        if (req) {
          const empAllocs = allocations.filter((a: any) => a.employee_id === req.employee_id && a.leave_type_id === req.leave_type_id);
          const latestAlloc = empAllocs.sort((a: any, b: any) => ((b.year || 0) * 10 + (b.quarter || 0)) - ((a.year || 0) * 10 + (a.quarter || 0)))[0];
          if (latestAlloc) {
            await (supabase as any).from("hr_leave_allocations")
              .update({ used_days: latestAlloc.used_days + req.total_days })
              .eq("id", latestAlloc.id);
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hrms_leave_requests"] });
      qc.invalidateQueries({ queryKey: ["hrms_leave_allocations_summary"] });
      toast.success("Status updated");
    },
    onError: () => toast.error("Failed to update"),
  });

  // Compute summary by leave type
  const summaryByType = leaveTypes.map((lt: any) => {
    const typeAllocs = allocations.filter((a: any) => a.leave_type_id === lt.id);
    const totalAllocated = typeAllocs.reduce((s: number, a: any) => s + Number(a.allocated_days || 0), 0);
    const totalUsed = typeAllocs.reduce((s: number, a: any) => s + Number(a.used_days || 0), 0);
    return { ...lt, totalAllocated, totalUsed, available: totalAllocated - totalUsed };
  });

  const filtered = leaveRequests.filter((r: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = `${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.toLowerCase();
    return name.includes(q) || r.hr_employees?.badge_id?.toLowerCase().includes(q);
  });

  const pendingCount = leaveRequests.filter((r: any) => r.status === "Requested" || r.status === "pending").length;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="requests">
            Leave Requests {pendingCount > 0 && <Badge variant="destructive" className="ml-2 text-[10px] px-1.5">{pendingCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="balances">Leave Balances</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-6">
            {/* Quarter-based summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {summaryByType.map((lt: any) => (
                <Card key={lt.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: lt.color || "#E8604C" }} />
                      <h3 className="font-semibold text-sm">{lt.name}</h3>
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{lt.code}</span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Per Quarter</span>
                        <span className="font-medium">{lt.max_days_per_year} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Total Allocated</span>
                        <span className="font-medium">{lt.totalAllocated} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Used</span>
                        <span className="font-medium text-orange-600">{lt.totalUsed} days</span>
                      </div>
                      <div className="flex justify-between border-t pt-1 mt-1">
                        <span className="text-gray-500 font-medium">Available</span>
                        <span className="font-bold text-green-600">{lt.available} days</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">{lt.is_paid ? "💰 Paid" : "📋 Unpaid"} • 🔄 Carries forward</p>
                  </CardContent>
                </Card>
              ))}
              {summaryByType.length === 0 && (
                <div className="col-span-full text-center py-8 text-gray-400">
                  <Calendar className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>No leave types configured. Set up leave types first.</p>
                </div>
              )}
            </div>

            {/* Recent requests */}
            {leaveRequests.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Recent Leave Requests
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {leaveRequests.slice(0, 5).map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{r.hr_employees?.first_name} {r.hr_employees?.last_name}</p>
                          <p className="text-xs text-gray-500">
                            {r.hr_leave_types?.name} • {r.total_days} day(s) • {r.start_date} to {r.end_date}
                          </p>
                        </div>
                        <Badge variant={
                          r.status === "Approved" ? "default" :
                          r.status === "Rejected" ? "destructive" :
                          r.status === "Cancelled" ? "outline" : "secondary"
                        }>
                          {r.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="requests">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  All Leave Requests
                </CardTitle>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input placeholder="Search employee..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 w-48" />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="Requested">Pending</SelectItem>
                      <SelectItem value="Approved">Approved</SelectItem>
                      <SelectItem value="Rejected">Rejected</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {["Employee", "Leave Type", "Start", "End", "Days", "Status", "Actions"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingRequests ? (
                    <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-gray-400">No leave requests found</td></tr>
                  ) : (
                    filtered.map((r: any) => {
                      const isPending = r.status === "Requested" || r.status === "pending";
                      return (
                        <tr key={r.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{r.hr_employees?.first_name} {r.hr_employees?.last_name}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${r.hr_leave_types?.color || "#E8604C"}20`, color: r.hr_leave_types?.color || "#E8604C" }}>
                              {r.hr_leave_types?.name}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{r.start_date}</td>
                          <td className="px-4 py-3 text-gray-500">{r.end_date}</td>
                          <td className="px-4 py-3 font-medium">
                            {r.total_days}
                            {r.is_half_day && <span className="ml-1 text-[10px] bg-blue-100 text-blue-700 px-1 rounded">half</span>}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={
                              r.status === "Approved" ? "default" :
                              r.status === "Rejected" ? "destructive" :
                              r.status === "Cancelled" ? "outline" : "secondary"
                            }>{r.status}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            {isPending && (
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" className="text-green-600 h-7" onClick={() => statusMutation.mutate({ id: r.id, status: "Approved" })}>
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="text-red-600 h-7" onClick={() => statusMutation.mutate({ id: r.id, status: "Rejected" })}>
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balances">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Company-wide Leave Balances (Cumulative — All Quarters Carry Forward)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {summaryByType.map((lt: any) => (
                  <div key={lt.id} className="text-center p-4 border rounded-lg">
                    <div className="w-3 h-3 rounded-full mx-auto mb-2" style={{ backgroundColor: lt.color || "#E8604C" }} />
                    <div className="text-2xl font-bold text-green-600">{lt.available}</div>
                    <div className="text-sm text-gray-600">{lt.name}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {lt.totalAllocated} allocated • {lt.totalUsed} used
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">{lt.max_days_per_year} days/quarter</div>
                  </div>
                ))}
                {summaryByType.length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-400">No leave data available</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
