
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Plus, Check, X, MessageSquare, Eye, Edit, Users } from "lucide-react";
import { useLeaveRequests, useLeaveTypes, useEmployees } from "./useLeaveData";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";

export function LeaveRequestsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();

  const { data: requests = [] } = useLeaveRequests();
  const { data: leaveTypes = [] } = useLeaveTypes();
  const { data: employees = [] } = useEmployees();

  // Form state
  const [formEmp, setFormEmp] = useState("");
  const [formType, setFormType] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formStartBreak, setFormStartBreak] = useState("full_day");
  const [formEndBreak, setFormEndBreak] = useState("full_day");
  const [formDesc, setFormDesc] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const startD = new Date(formStart);
      const endD = new Date(formEnd);
      let diffDays = Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (formStartBreak === "half_day") diffDays -= 0.5;
      if (formEndBreak === "half_day") diffDays -= 0.5;
      const { error } = await supabase.from("hr_leave_requests").insert({
        employee_id: formEmp,
        leave_type_id: formType,
        start_date: formStart,
        end_date: formEnd,
        start_date_breakdown: formStartBreak,
        end_date_breakdown: formEndBreak,
        total_days: Math.max(diffDays, 0),
        reason: formDesc || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_leave_requests"] });
      setShowCreate(false);
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
      toast.success("Status updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const resetForm = () => {
    setFormEmp(""); setFormType(""); setFormStart(""); setFormEnd("");
    setFormStartBreak("full_day"); setFormEndBreak("full_day"); setFormDesc("");
  };

  const filtered = requests.filter((r: any) => {
    const name = `${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.toLowerCase();
    return name.includes(searchTerm.toLowerCase());
  });

  const statusColor: Record<string, string> = {
    requested: "bg-yellow-100 text-yellow-700 border-yellow-300",
    approved: "bg-green-100 text-green-700 border-green-300",
    rejected: "bg-red-100 text-red-700 border-red-300",
    cancelled: "bg-gray-100 text-gray-700 border-gray-300",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Leave Requests</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-48" />
          </div>
          <Button variant="outline" size="sm"><Filter className="h-4 w-4 mr-1" /> Filter</Button>
          <Button variant="outline" size="sm">Actions</Button>
          <Button className="bg-[#009C4A] hover:bg-[#008040] text-white" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Create
          </Button>
        </div>
      </div>

      {/* Status Legend */}
      <div className="flex items-center justify-between">
        <Badge className="bg-[#009C4A] text-white">Select ({filtered.length})</Badge>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Rejected</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-500" /> Cancelled</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Approved</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Requested</span>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-10"><input type="checkbox" className="rounded" /></TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Leave Type</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Requested Days</TableHead>
                <TableHead>Leave Clash</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Comment</TableHead>
                <TableHead>Penalties</TableHead>
                <TableHead>Options</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-12 text-gray-400">No leave requests found</TableCell>
                </TableRow>
              ) : (
                filtered.map((req: any) => (
                  <TableRow key={req.id}>
                    <TableCell><input type="checkbox" className="rounded" /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold">
                          {req.hr_employees?.first_name?.[0]}
                        </div>
                        <span className="font-medium text-sm">
                          {req.hr_employees?.first_name} {req.hr_employees?.last_name} ({req.hr_employees?.badge_id})
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{req.hr_leave_types?.name}</TableCell>
                    <TableCell className="text-sm">{format(new Date(req.start_date), "EEEE, MMMM d...").slice(0, 20)}</TableCell>
                    <TableCell className="text-sm">{format(new Date(req.end_date), "EEEE, MMMM d...").slice(0, 20)}</TableCell>
                    <TableCell className="text-sm">{req.total_days}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-gray-400">
                        <Users className="h-4 w-4" />
                        <span className="text-xs">0</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${statusColor[req.status] || "bg-gray-100 text-gray-700"}`}>
                        {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400">
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">No Penalties</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400"><X className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400"><Edit className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {req.status === "requested" && (
                          <>
                            <Button
                              size="sm"
                              className="h-8 bg-green-100 hover:bg-green-200 text-green-700 border-0"
                              onClick={() => updateStatusMutation.mutate({ id: req.id, status: "approved" })}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 bg-red-100 hover:bg-red-200 text-red-700 border-0"
                              onClick={() => updateStatusMutation.mutate({ id: req.id, status: "rejected" })}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {req.status === "approved" && (
                          <div className="flex gap-1">
                            <Button size="sm" className="h-8 bg-green-100 text-green-700 border-0"><Check className="h-4 w-4" /></Button>
                            <Button
                              size="sm"
                              className="h-8 bg-red-100 hover:bg-red-200 text-red-700 border-0"
                              onClick={() => updateStatusMutation.mutate({ id: req.id, status: "rejected" })}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        {req.status === "cancelled" && (
                          <Button size="sm" variant="ghost" className="h-8 text-gray-400"><Check className="h-4 w-4" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Leave Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Employee *</Label>
                <Select value={formEmp} onValueChange={setFormEmp}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Leave Type *</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger><SelectValue placeholder="Choose Leave Type" /></SelectTrigger>
                  <SelectContent>
                    {leaveTypes.map((lt: any) => (
                      <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start date *</Label>
                <Input type="date" value={formStart} onChange={(e) => setFormStart(e.target.value)} />
              </div>
              <div>
                <Label>Start Date Breakdown *</Label>
                <Select value={formStartBreak} onValueChange={setFormStartBreak}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_day">Full Day</SelectItem>
                    <SelectItem value="half_day">Half Day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>End date *</Label>
                <Input type="date" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} />
              </div>
              <div>
                <Label>End Date Breakdown *</Label>
                <Select value={formEndBreak} onValueChange={setFormEndBreak}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_day">Full Day</SelectItem>
                    <SelectItem value="half_day">Half Day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Attachment</Label>
              <Input type="file" />
            </div>
            <div>
              <Label>Description *</Label>
              <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Description" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="bg-[#009C4A] hover:bg-[#008040] text-white"
              onClick={() => createMutation.mutate()}
              disabled={!formEmp || !formType || !formStart || !formEnd}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
