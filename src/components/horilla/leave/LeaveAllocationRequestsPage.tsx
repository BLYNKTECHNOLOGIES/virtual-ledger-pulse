
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
import { Search, Filter, Plus, Check, X, Edit, Trash2, MessageSquare } from "lucide-react";
import { useLeaveAllocationRequests, useLeaveTypes, useEmployees } from "./useLeaveData";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function LeaveAllocationRequestsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<"my" | "all">("all");
  const queryClient = useQueryClient();

  const { data: allocRequests = [] } = useLeaveAllocationRequests();
  const { data: leaveTypes = [] } = useLeaveTypes();
  const { data: employees = [] } = useEmployees();

  // Form
  const [formEmp, setFormEmp] = useState("");
  const [formType, setFormType] = useState("");
  const [formDays, setFormDays] = useState("1");
  const [formDesc, setFormDesc] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hr_leave_allocation_requests").insert({
        employee_id: formEmp,
        leave_type_id: formType,
        requested_days: parseFloat(formDays),
        description: formDesc || null,
        created_by: "Admin",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_leave_allocation_requests"] });
      setShowCreate(false);
      setFormEmp(""); setFormType(""); setFormDays("1"); setFormDesc("");
      toast.success("Allocation request created");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "approved") updates.approved_at = new Date().toISOString();
      const { error } = await supabase.from("hr_leave_allocation_requests").update(updates).eq("id", id);
      if (error) throw error;

      // If approved, also create/update the actual allocation
      if (status === "approved") {
        const req = allocRequests.find((r: any) => r.id === id);
        if (req) {
          const { error: allocError } = await supabase.from("hr_leave_allocations").insert({
            employee_id: (req as any).employee_id,
            leave_type_id: (req as any).leave_type_id,
            allocated_days: (req as any).requested_days,
            year: new Date().getFullYear(),
          });
          if (allocError) console.error("Failed to create allocation:", allocError);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_leave_allocation_requests"] });
      queryClient.invalidateQueries({ queryKey: ["hr_leave_allocations"] });
      toast.success("Status updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_leave_allocation_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_leave_allocation_requests"] });
      toast.success("Request deleted");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const filtered = allocRequests.filter((r: any) => {
    const name = `${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.toLowerCase();
    return name.includes(searchTerm.toLowerCase());
  });

  const statusColor: Record<string, string> = {
    requested: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Leave Allocation Requests</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-48" />
          </div>
          <Button variant="outline" size="sm"><Filter className="h-4 w-4 mr-1" /> Filter</Button>
          <Button className="bg-[#009C4A] hover:bg-[#008040] text-white" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Create
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <Button
          variant={activeTab === "my" ? "default" : "outline"}
          size="sm"
          className={activeTab === "my" ? "bg-[#009C4A] text-white" : ""}
          onClick={() => setActiveTab("my")}
        >
          <Badge className="bg-white/20 text-current mr-1">0</Badge> My Leave allocation request
        </Button>
        <Button
          variant={activeTab === "all" ? "default" : "outline"}
          size="sm"
          className={activeTab === "all" ? "bg-[#009C4A] text-white" : ""}
          onClick={() => setActiveTab("all")}
        >
          <Badge className="bg-white/20 text-current mr-1">{filtered.length}</Badge> Leave allocation requests
        </Button>
      </div>

      {/* Status Legend */}
      <div className="flex items-center justify-between">
        <Badge className="bg-[#009C4A] text-white">Select ({filtered.length})</Badge>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Rejected</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Requested</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Approved</span>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-10"><input type="checkbox" className="rounded" /></TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Leave Type</TableHead>
                <TableHead>Requested Days</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Comment</TableHead>
                <TableHead>Options</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-gray-400">No allocation requests found</TableCell>
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
                    <TableCell className="text-sm">{req.requested_days}</TableCell>
                    <TableCell className="text-sm">{req.created_by || "Admin"}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${statusColor[req.status] || "bg-gray-100 text-gray-700"}`}>
                        {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-[150px] truncate">{req.description || "-"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400">
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400"><Edit className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => deleteMutation.mutate(req.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
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
                        {req.status !== "requested" && (
                          <Badge className={`text-xs ${statusColor[req.status]}`}>
                            {req.status === "approved" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          </Badge>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Leave Allocation Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((lt: any) => (
                    <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Requested Days</Label>
              <Input type="number" value={formDays} onChange={(e) => setFormDays(e.target.value)} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Description..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button className="bg-[#009C4A] hover:bg-[#008040] text-white" onClick={() => createMutation.mutate()} disabled={!formEmp || !formType}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
