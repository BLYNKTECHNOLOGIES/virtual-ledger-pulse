
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, Filter, Plus, Search, Check, X, FileText, PalmtreeIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  status: string;
  reason: string | null;
  created_at: string;
  hr_employees?: { first_name: string; last_name: string; badge_id: string };
  hr_leave_types?: { name: string; code: string; color: string };
}

interface LeaveType {
  id: string;
  name: string;
  code: string;
  color: string;
  max_days_per_year: number;
  is_paid: boolean;
  is_active: boolean;
}

export function LeaveDashboard() {
  const [activeTab, setActiveTab] = useState("requests");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const queryClient = useQueryClient();

  // Form state
  const [formEmployee, setFormEmployee] = useState("");
  const [formLeaveType, setFormLeaveType] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formReason, setFormReason] = useState("");

  const { data: leaveRequests = [] } = useQuery({
    queryKey: ["hr_leave_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_leave_requests")
        .select("*, hr_employees!hr_leave_requests_employee_id_fkey(first_name, last_name, badge_id), hr_leave_types(name, code, color)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as LeaveRequest[];
    },
  });

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ["hr_leave_types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_leave_types").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data as LeaveType[];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_leave"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_employees")
        .select("id, first_name, last_name, badge_id")
        .eq("is_active", true)
        .order("first_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: allocations = [] } = useQuery({
    queryKey: ["hr_leave_allocations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_leave_allocations")
        .select("*, hr_employees(first_name, last_name, badge_id), hr_leave_types(name, code, color)")
        .eq("year", new Date().getFullYear());
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const startD = new Date(formStartDate);
      const endD = new Date(formEndDate);
      const diffDays = Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const { error } = await supabase.from("hr_leave_requests").insert({
        employee_id: formEmployee,
        leave_type_id: formLeaveType,
        start_date: formStartDate,
        end_date: formEndDate,
        total_days: diffDays,
        reason: formReason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_leave_requests"] });
      setShowCreateDialog(false);
      resetForm();
      toast.success("Leave request created");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("hr_leave_requests")
        .update({ status, approved_at: status === "approved" ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_leave_requests"] });
      toast.success("Leave request updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const resetForm = () => {
    setFormEmployee("");
    setFormLeaveType("");
    setFormStartDate("");
    setFormEndDate("");
    setFormReason("");
  };

  const filteredRequests = leaveRequests.filter((r) => {
    const name = `${r.hr_employees?.first_name} ${r.hr_employees?.last_name}`.toLowerCase();
    const matchSearch = name.includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === "all" || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const statusCounts = {
    requested: leaveRequests.filter((r) => r.status === "requested").length,
    approved: leaveRequests.filter((r) => r.status === "approved").length,
    rejected: leaveRequests.filter((r) => r.status === "rejected").length,
  };

  const pieData = [
    { name: "Requested", value: statusCounts.requested, color: "#f59e0b" },
    { name: "Approved", value: statusCounts.approved, color: "#22c55e" },
    { name: "Rejected", value: statusCounts.rejected, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      requested: "bg-yellow-100 text-yellow-700",
      approved: "bg-green-100 text-green-700",
      rejected: "bg-red-100 text-red-700",
      cancelled: "bg-gray-100 text-gray-700",
    };
    return <Badge className={styles[status] || "bg-gray-100 text-gray-700"}>{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList className="bg-gray-100">
            <TabsTrigger value="requests" className="data-[state=active]:bg-[#009C4A] data-[state=active]:text-white">
              Leave Requests
            </TabsTrigger>
            <TabsTrigger value="types" className="data-[state=active]:bg-[#009C4A] data-[state=active]:text-white">
              Leave Types
            </TabsTrigger>
            <TabsTrigger value="allocations" className="data-[state=active]:bg-[#009C4A] data-[state=active]:text-white">
              Allocations
            </TabsTrigger>
            <TabsTrigger value="summary" className="data-[state=active]:bg-[#009C4A] data-[state=active]:text-white">
              Summary
            </TabsTrigger>
          </TabsList>
          <Button className="bg-[#009C4A] hover:bg-[#008040] text-white" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Request
          </Button>
        </div>

        <TabsContent value="requests">
          {/* Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="border-l-4 border-l-yellow-500">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Pending</p>
                  <p className="text-2xl font-bold text-yellow-600">{statusCounts.requested}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-400" />
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Approved</p>
                  <p className="text-2xl font-bold text-green-600">{statusCounts.approved}</p>
                </div>
                <Check className="h-8 w-8 text-green-400" />
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Rejected</p>
                  <p className="text-2xl font-bold text-red-600">{statusCounts.rejected}</p>
                </div>
                <X className="h-8 w-8 text-red-400" />
              </CardContent>
            </Card>
          </div>

          {/* Filter Bar */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">All Leave Requests</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56" />
                  </div>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="requested">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Leave Type</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                        <PalmtreeIcon className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        No leave requests found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRequests.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">
                          {req.hr_employees?.first_name} {req.hr_employees?.last_name}
                        </TableCell>
                        <TableCell>
                          <Badge style={{ backgroundColor: req.hr_leave_types?.color + "20", color: req.hr_leave_types?.color }}>
                            {req.hr_leave_types?.code}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(req.start_date), "MMM dd")}</TableCell>
                        <TableCell>{format(new Date(req.end_date), "MMM dd")}</TableCell>
                        <TableCell>{req.total_days}</TableCell>
                        <TableCell>{statusBadge(req.status)}</TableCell>
                        <TableCell className="max-w-[150px] truncate text-sm text-gray-500">{req.reason || "-"}</TableCell>
                        <TableCell>
                          {req.status === "requested" && (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-green-600 hover:bg-green-50 h-7 w-7 p-0"
                                onClick={() => updateStatusMutation.mutate({ id: req.id, status: "approved" })}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:bg-red-50 h-7 w-7 p-0"
                                onClick={() => updateStatusMutation.mutate({ id: req.id, status: "rejected" })}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="types">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#009C4A]" />
                Leave Types
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {leaveTypes.map((lt) => (
                  <div key={lt.id} className="p-4 border rounded-lg" style={{ borderLeftWidth: 4, borderLeftColor: lt.color }}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">{lt.name}</h3>
                      <Badge style={{ backgroundColor: lt.color + "20", color: lt.color }}>{lt.code}</Badge>
                    </div>
                    <div className="space-y-1 text-sm text-gray-500">
                      <p>Max days/year: <span className="font-medium text-gray-700">{lt.max_days_per_year}</span></p>
                      <p>Type: <span className="font-medium text-gray-700">{lt.is_paid ? "Paid" : "Unpaid"}</span></p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allocations">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Leave Allocations - {new Date().getFullYear()}</CardTitle>
            </CardHeader>
            <CardContent>
              {allocations.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Calendar className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p>No allocations configured yet</p>
                  <p className="text-sm">Allocate leave days to employees to track their balance</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Leave Type</TableHead>
                      <TableHead>Allocated</TableHead>
                      <TableHead>Used</TableHead>
                      <TableHead>Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocations.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.hr_employees?.first_name} {a.hr_employees?.last_name}</TableCell>
                        <TableCell>{a.hr_leave_types?.name}</TableCell>
                        <TableCell>{a.allocated_days}</TableCell>
                        <TableCell>{a.used_days}</TableCell>
                        <TableCell className="font-bold text-[#009C4A]">{a.allocated_days - a.used_days}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Leave Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Leave Types Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {leaveTypes.map((lt) => {
                    const count = leaveRequests.filter((r) => r.leave_type_id === lt.id).length;
                    return (
                      <div key={lt.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: lt.color }} />
                          <span className="text-sm">{lt.name}</span>
                        </div>
                        <span className="font-bold text-sm">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Leave Request Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Leave Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={formEmployee} onValueChange={setFormEmployee}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Leave Type</Label>
              <Select value={formLeaveType} onValueChange={setFormLeaveType}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((lt) => (
                    <SelectItem key={lt.id} value={lt.id}>{lt.name} ({lt.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea value={formReason} onChange={(e) => setFormReason(e.target.value)} placeholder="Optional reason..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetForm(); }}>Cancel</Button>
            <Button
              className="bg-[#009C4A] hover:bg-[#008040] text-white"
              onClick={() => createMutation.mutate()}
              disabled={!formEmployee || !formLeaveType || !formStartDate || !formEndDate}
            >
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
