
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Search, Filter, Plus, Check, Edit, Trash2, LayoutGrid, List } from "lucide-react";
import { useLeaveTypes } from "./useLeaveData";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function LeaveTypesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();
  const { data: leaveTypes = [] } = useLeaveTypes();

  // Form state
  const [formName, setFormName] = useState("");
  const [formIsPaid, setFormIsPaid] = useState("paid");
  const [formLimitDays, setFormLimitDays] = useState(true);
  const [formTotalDays, setFormTotalDays] = useState("1");
  const [formRequireApproval, setFormRequireApproval] = useState(true);
  const [formReset, setFormReset] = useState(false);
  const [formColor, setFormColor] = useState("#009C4A");
  const [formRequireAttachment, setFormRequireAttachment] = useState(false);
  const [formExcludeCompanyHolidays, setFormExcludeCompanyHolidays] = useState(false);
  const [formExcludeHolidays, setFormExcludeHolidays] = useState(false);
  const [formIsEncashable, setFormIsEncashable] = useState(false);
  const [formCarryForward, setFormCarryForward] = useState(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      const code = formName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 3);
      const { error } = await supabase.from("hr_leave_types").insert({
        name: formName,
        code,
        color: formColor,
        is_paid: formIsPaid === "paid",
        max_days_per_year: formLimitDays ? parseFloat(formTotalDays) : null,
        requires_approval: formRequireApproval,
        carry_forward: formCarryForward,
        require_attachment: formRequireAttachment,
        exclude_company_holidays: formExcludeCompanyHolidays,
        exclude_holidays: formExcludeHolidays,
        is_encashable: formIsEncashable,
        reset_period: formReset ? "yearly" : "none",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_leave_types"] });
      setShowCreate(false);
      resetForm();
      toast.success("Leave type created");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_leave_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_leave_types"] });
      toast.success("Leave type deleted");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const resetForm = () => {
    setFormName(""); setFormIsPaid("paid"); setFormLimitDays(true); setFormTotalDays("1");
    setFormRequireApproval(true); setFormReset(false); setFormColor("#009C4A");
    setFormRequireAttachment(false); setFormExcludeCompanyHolidays(false);
    setFormExcludeHolidays(false); setFormIsEncashable(false); setFormCarryForward(false);
  };

  const filtered = leaveTypes.filter((lt: any) =>
    lt.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Leave Types</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-48" />
          </div>
          <div className="flex border rounded-lg overflow-hidden">
            <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" className={viewMode === "list" ? "bg-gray-200 text-gray-800" : ""} onClick={() => setViewMode("list")}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "grid" ? "default" : "ghost"} size="sm" className={viewMode === "grid" ? "bg-gray-200 text-gray-800" : ""} onClick={() => setViewMode("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm"><Filter className="h-4 w-4 mr-1" /> Filter</Button>
          <Button className="bg-[#009C4A] hover:bg-[#008040] text-white" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Create
          </Button>
        </div>
      </div>

      {/* Paid/Unpaid legend */}
      <div className="flex items-center justify-between">
        <Badge className="bg-[#009C4A] text-white">Select ({filtered.length})</Badge>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Paid</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Unpaid</span>
        </div>
      </div>

      {viewMode === "list" ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-10"><input type="checkbox" className="rounded" /></TableHead>
                  <TableHead>Leave Type</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Total Days</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lt: any) => (
                  <TableRow key={lt.id}>
                    <TableCell><input type="checkbox" className="rounded" /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: lt.color || "#009C4A" }}
                        >
                          {lt.code}
                        </div>
                        <span className="font-medium">{lt.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{lt.is_paid ? "paid" : "unpaid"}</TableCell>
                    <TableCell className="text-sm">{lt.max_days_per_year ?? "No Limit"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-600"><Check className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500"><Edit className="h-4 w-4" /></Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-500"
                          onClick={() => deleteMutation.mutate(lt.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((lt: any) => (
            <Card key={lt.id} className="border-t-4" style={{ borderTopColor: lt.color || "#009C4A" }}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: lt.color || "#009C4A" }}>
                    {lt.code}
                  </div>
                  <h3 className="font-semibold">{lt.name}</h3>
                </div>
                <div className="text-sm space-y-1 text-gray-500">
                  <p>Payment: <span className="text-gray-700 font-medium">{lt.is_paid ? "Paid" : "Unpaid"}</span></p>
                  <p>Total Days: <span className="text-gray-700 font-medium">{lt.max_days_per_year ?? "No Limit"}</span></p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Leave Type Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Leave Type</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-6">
            {/* Left column */}
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Name" />
              </div>
              <div>
                <Label>Is paid</Label>
                <Select value={formIsPaid} onValueChange={setFormIsPaid}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Limit Leave Days</Label>
                <Switch checked={formLimitDays} onCheckedChange={setFormLimitDays} />
              </div>
              {formLimitDays && (
                <div>
                  <Label>Total Days</Label>
                  <Input type="number" value={formTotalDays} onChange={(e) => setFormTotalDays(e.target.value)} />
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label>Require Approval</Label>
                <Switch checked={formRequireApproval} onCheckedChange={setFormRequireApproval} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Reset</Label>
                <Switch checked={formReset} onCheckedChange={setFormReset} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Carry Forward</Label>
                <Switch checked={formCarryForward} onCheckedChange={setFormCarryForward} />
              </div>
            </div>
            {/* Right column */}
            <div className="space-y-4">
              <div>
                <Label>Color</Label>
                <Input type="color" value={formColor} onChange={(e) => setFormColor(e.target.value)} className="h-10" />
              </div>
              <div className="flex items-center justify-between">
                <Label>Require Attachment</Label>
                <Switch checked={formRequireAttachment} onCheckedChange={setFormRequireAttachment} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Exclude Company Holidays</Label>
                <Switch checked={formExcludeCompanyHolidays} onCheckedChange={setFormExcludeCompanyHolidays} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Exclude Holidays</Label>
                <Switch checked={formExcludeHolidays} onCheckedChange={setFormExcludeHolidays} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Is Encashable</Label>
                <Switch checked={formIsEncashable} onCheckedChange={setFormIsEncashable} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</Button>
            <Button className="bg-[#009C4A] hover:bg-[#008040] text-white" onClick={() => createMutation.mutate()} disabled={!formName}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
