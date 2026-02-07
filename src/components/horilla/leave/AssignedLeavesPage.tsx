
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Plus, Edit, Trash2, Settings } from "lucide-react";
import { useLeaveAllocations, useLeaveTypes, useEmployees } from "./useLeaveData";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";

export function AssignedLeavesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();

  const { data: allocations = [] } = useLeaveAllocations();
  const { data: leaveTypes = [] } = useLeaveTypes();
  const { data: employees = [] } = useEmployees();

  // Form
  const [formEmp, setFormEmp] = useState("");
  const [formType, setFormType] = useState("");
  const [formDays, setFormDays] = useState("0");
  const [formCarryForward, setFormCarryForward] = useState("0");

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hr_leave_allocations").insert({
        employee_id: formEmp,
        leave_type_id: formType,
        allocated_days: parseFloat(formDays),
        carry_forward_days: parseFloat(formCarryForward),
        year: new Date().getFullYear(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_leave_allocations"] });
      setShowCreate(false);
      setFormEmp(""); setFormType(""); setFormDays("0"); setFormCarryForward("0");
      toast.success("Leave assigned");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_leave_allocations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_leave_allocations"] });
      toast.success("Allocation deleted");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const filtered = allocations.filter((a: any) => {
    const name = `${a.hr_employees?.first_name || ""} ${a.hr_employees?.last_name || ""}`.toLowerCase();
    return name.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">All Assigned Leaves</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-48" />
          </div>
          <Button variant="outline" size="sm"><Filter className="h-4 w-4 mr-1" /> Filter</Button>
          <Button variant="outline" size="sm"><Settings className="h-4 w-4 mr-1" /> Actions</Button>
          <Button className="bg-[#009C4A] hover:bg-[#008040] text-white" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Create
          </Button>
        </div>
      </div>

      <Badge className="bg-[#009C4A] text-white">Select ({filtered.length})</Badge>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-10"><input type="checkbox" className="rounded" /></TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Badge ID</TableHead>
                <TableHead>Leave Type</TableHead>
                <TableHead>Available Days</TableHead>
                <TableHead>Carryforward Days</TableHead>
                <TableHead>Total Leave Days</TableHead>
                <TableHead>Assigned Date</TableHead>
                <TableHead>Taken Leaves</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-gray-400">No assigned leaves found</TableCell>
                </TableRow>
              ) : (
                filtered.map((a: any) => {
                  const available = (a.allocated_days || 0) - (a.used_days || 0);
                  return (
                    <TableRow key={a.id}>
                      <TableCell><input type="checkbox" className="rounded" /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold">
                            {a.hr_employees?.first_name?.[0]}
                          </div>
                          <span className="font-medium text-sm">{a.hr_employees?.first_name} {a.hr_employees?.last_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{a.hr_employees?.badge_id || "None"}</TableCell>
                      <TableCell className="text-sm">{a.hr_leave_types?.name}</TableCell>
                      <TableCell className="text-sm">{available.toFixed(1)}</TableCell>
                      <TableCell className="text-sm">{(a.carry_forward_days || 0).toFixed(1)}</TableCell>
                      <TableCell className="text-sm">{(a.allocated_days || 0).toFixed(1)}</TableCell>
                      <TableCell className="text-sm">{format(new Date(a.created_at), "EEEE, MMMM dd...").slice(0, 22)}</TableCell>
                      <TableCell className="text-sm">{a.used_days || 0}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500"><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500" onClick={() => deleteMutation.mutate(a.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Leave</DialogTitle>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Allocated Days</Label>
                <Input type="number" value={formDays} onChange={(e) => setFormDays(e.target.value)} />
              </div>
              <div>
                <Label>Carryforward Days</Label>
                <Input type="number" value={formCarryForward} onChange={(e) => setFormCarryForward(e.target.value)} />
              </div>
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
