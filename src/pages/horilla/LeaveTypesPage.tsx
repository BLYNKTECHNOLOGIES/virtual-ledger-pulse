import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Calendar, Shield, ArrowRightLeft,
  Banknote, Zap, Paperclip, Umbrella, Loader2, MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const defaultForm = {
  name: "", code: "", max_days_per_year: 12, is_paid: true, requires_approval: true, color: "#6C63FF",
  reset: false, reset_based: "" as string, reset_month: "", reset_day: "",
  is_encashable: false, exclude_company_leave: false, exclude_holiday: false, is_compensatory_leave: false,
  carryforward_type: "carryforward", carryforward_expire_in: null as number | null, carryforward_expire_period: "",
  require_attachment: false,
};

const RESET_PERIODS = [
  { value: "yearly", label: "Yearly" },
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
];

const CARRYFORWARD_TYPES = [
  { value: "no carryforward", label: "No Carry Forward" },
  { value: "carryforward", label: "Carry Forward" },
  { value: "carryforward expire", label: "Carry Forward with Expiry" },
];

const EXPIRE_PERIODS = [
  { value: "day", label: "Days" },
  { value: "month", label: "Months" },
  { value: "year", label: "Years" },
];

const MONTHS_LIST = [
  { value: "1", label: "January" }, { value: "2", label: "February" }, { value: "3", label: "March" },
  { value: "4", label: "April" }, { value: "5", label: "May" }, { value: "6", label: "June" },
  { value: "7", label: "July" }, { value: "8", label: "August" }, { value: "9", label: "September" },
  { value: "10", label: "October" }, { value: "11", label: "November" }, { value: "12", label: "December" },
];

export default function LeaveTypesPage() {
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["hr_leave_types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_leave_types").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: form.name, code: form.code, max_days_per_year: form.max_days_per_year,
        is_paid: form.is_paid, requires_approval: form.requires_approval, color: form.color,
        reset: form.reset, reset_based: form.reset ? form.reset_based || null : null,
        reset_month: form.reset && form.reset_based === "yearly" ? form.reset_month || null : null,
        reset_day: form.reset ? form.reset_day || null : null,
        is_encashable: form.is_encashable, exclude_company_leave: form.exclude_company_leave,
        exclude_holiday: form.exclude_holiday, is_compensatory_leave: form.is_compensatory_leave,
        carryforward_type: form.carryforward_type,
        carry_forward: form.carryforward_type !== "no carryforward",
        carryforward_expire_in: form.carryforward_type === "carryforward expire" ? form.carryforward_expire_in : null,
        carryforward_expire_period: form.carryforward_type === "carryforward expire" ? form.carryforward_expire_period || null : null,
        max_carry_forward_days: form.carryforward_type === "carryforward" ? form.max_days_per_year : null,
        require_attachment: form.require_attachment,
      };
      if (editId) {
        const { error } = await (supabase as any).from("hr_leave_types").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("hr_leave_types").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_leave_types"] });
      setShowDialog(false); setEditId(null); setForm(defaultForm);
      toast.success(editId ? "Leave type updated" : "Leave type created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("hr_leave_types").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr_leave_types"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_leave_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr_leave_types"] }); toast.success("Leave type deleted"); setDeleteId(null); },
    onError: (e: any) => { toast.error(e.message); setDeleteId(null); },
  });

  const openEdit = (t: any) => {
    setEditId(t.id);
    setForm({
      name: t.name, code: t.code, max_days_per_year: t.max_days_per_year || 12,
      is_paid: t.is_paid ?? true, requires_approval: t.requires_approval ?? true, color: t.color || "#6C63FF",
      reset: t.reset ?? false, reset_based: t.reset_based || "", reset_month: t.reset_month || "", reset_day: t.reset_day || "",
      is_encashable: t.is_encashable ?? false, exclude_company_leave: t.exclude_company_leave ?? false,
      exclude_holiday: t.exclude_holiday ?? false, is_compensatory_leave: t.is_compensatory_leave ?? false,
      carryforward_type: t.carryforward_type || "carryforward",
      carryforward_expire_in: t.carryforward_expire_in ?? null,
      carryforward_expire_period: t.carryforward_expire_period || "",
      require_attachment: t.require_attachment ?? false,
    });
    setShowDialog(true);
  };

  const getCarryForwardLabel = (t: any) => {
    if (t.carryforward_type === "no carryforward") return "None";
    if (t.carryforward_type === "carryforward expire") return `${t.carryforward_expire_in || "?"} ${t.carryforward_expire_period || "?"}`;
    return "Unlimited";
  };

  const getTags = (t: any) => {
    const tags: { label: string; icon: React.ElementType; variant: "default" | "secondary" | "outline" }[] = [];
    tags.push({ label: t.is_paid ? "Paid" : "Unpaid", icon: Banknote, variant: t.is_paid ? "default" : "outline" });
    if (t.requires_approval) tags.push({ label: "Approval", icon: Shield, variant: "secondary" });
    if (t.is_compensatory_leave) tags.push({ label: "Comp-Off", icon: Zap, variant: "secondary" });
    if (t.is_encashable) tags.push({ label: "Encashable", icon: Banknote, variant: "secondary" });
    if (t.require_attachment) tags.push({ label: "Attachment", icon: Paperclip, variant: "outline" });
    if (t.exclude_holiday) tags.push({ label: "Excl. Holidays", icon: Umbrella, variant: "outline" });
    return tags;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Leave Types</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure leave policies, carry-forward rules & entitlements</p>
        </div>
        <Button onClick={() => { setEditId(null); setForm(defaultForm); setShowDialog(true); }} size="sm">
          <Plus className="h-4 w-4 mr-1.5" /> New Leave Type
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Leave Type</th>
              <th className="text-center font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">Quota / Qtr</th>
              <th className="text-center font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Carry Forward</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3 hidden lg:table-cell">Properties</th>
              <th className="text-center font-medium text-muted-foreground px-4 py-3">Status</th>
              <th className="text-right font-medium text-muted-foreground px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
                </td>
              </tr>
            ) : types.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-16 text-muted-foreground">
                  No leave types configured. Click "New Leave Type" to get started.
                </td>
              </tr>
            ) : (
              types.map((t: any) => (
                <tr key={t.id} className={`hover:bg-muted/30 transition-colors ${!t.is_active ? "opacity-50" : ""}`}>
                  {/* Name + Code */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-offset-2 ring-offset-card"
                        style={{ backgroundColor: t.color || "#6C63FF", boxShadow: `0 0 6px ${t.color || "#6C63FF"}40` }}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{t.name}</span>
                          <span className="text-[10px] font-mono tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {t.code}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Quota */}
                  <td className="px-4 py-3.5 text-center hidden sm:table-cell">
                    <div className="inline-flex items-center gap-1.5 text-foreground">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{t.max_days_per_year}</span>
                      <span className="text-muted-foreground text-xs">days</span>
                    </div>
                  </td>

                  {/* Carry Forward */}
                  <td className="px-4 py-3.5 text-center hidden md:table-cell">
                    <div className="inline-flex items-center gap-1.5">
                      <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className={`text-xs ${t.carryforward_type === "no carryforward" ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                        {getCarryForwardLabel(t)}
                      </span>
                    </div>
                  </td>

                  {/* Properties */}
                  <td className="px-4 py-3.5 hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {getTags(t).map((tag, i) => (
                        <Badge key={i} variant={tag.variant} className="text-[10px] font-normal gap-1 px-1.5 py-0">
                          <tag.icon className="h-2.5 w-2.5" />
                          {tag.label}
                        </Badge>
                      ))}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3.5 text-center">
                    <Switch
                      checked={t.is_active}
                      onCheckedChange={(v) => toggleMutation.mutate({ id: t.id, is_active: v })}
                    />
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteId(t.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Leave Type</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this leave type. Any existing allocations or requests using this type may be affected. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Leave Type" : "New Leave Type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Basic Info */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Basic Information</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Casual Leave" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Code</Label>
                  <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. CL" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Max Days / Quarter</Label>
                  <Input type="number" value={form.max_days_per_year} onChange={(e) => setForm({ ...form, max_days_per_year: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Color</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-8 h-8 rounded border border-border cursor-pointer" />
                    <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="font-mono text-xs" />
                  </div>
                </div>
              </div>
            </div>

            {/* Payment & Approval */}
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment & Approval</p>
              <div className="grid grid-cols-1 gap-2.5">
                <label className="flex items-center justify-between p-2.5 rounded-md border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                  <span className="text-sm text-foreground">Paid Leave</span>
                  <Switch checked={form.is_paid} onCheckedChange={(v) => setForm({ ...form, is_paid: v })} />
                </label>
                <label className="flex items-center justify-between p-2.5 rounded-md border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                  <span className="text-sm text-foreground">Requires Approval</span>
                  <Switch checked={form.requires_approval} onCheckedChange={(v) => setForm({ ...form, requires_approval: v })} />
                </label>
                <label className="flex items-center justify-between p-2.5 rounded-md border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                  <span className="text-sm text-foreground">Require Attachment</span>
                  <Switch checked={form.require_attachment} onCheckedChange={(v) => setForm({ ...form, require_attachment: v })} />
                </label>
              </div>
            </div>

            {/* Carry Forward */}
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Carry Forward</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select value={form.carryforward_type} onValueChange={(v) => setForm({ ...form, carryforward_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CARRYFORWARD_TYPES.map((cf) => <SelectItem key={cf.value} value={cf.value}>{cf.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.carryforward_type === "carryforward expire" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Expire In</Label>
                    <Input type="number" value={form.carryforward_expire_in ?? ""} onChange={(e) => setForm({ ...form, carryforward_expire_in: parseInt(e.target.value) || null })} placeholder="e.g. 3" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Period</Label>
                    <Select value={form.carryforward_expire_period} onValueChange={(v) => setForm({ ...form, carryforward_expire_period: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {EXPIRE_PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Reset */}
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reset Configuration</p>
              <label className="flex items-center justify-between p-2.5 rounded-md border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                <span className="text-sm text-foreground">Enable Reset</span>
                <Switch checked={form.reset} onCheckedChange={(v) => setForm({ ...form, reset: v })} />
              </label>
              {form.reset && (
                <div className="space-y-3 pl-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Reset Period</Label>
                    <Select value={form.reset_based} onValueChange={(v) => setForm({ ...form, reset_based: v })}>
                      <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
                      <SelectContent>
                        {RESET_PERIODS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {form.reset_based === "yearly" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Reset Month</Label>
                      <Select value={form.reset_month} onValueChange={(v) => setForm({ ...form, reset_month: v })}>
                        <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
                        <SelectContent>
                          {MONTHS_LIST.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {(form.reset_based === "yearly" || form.reset_based === "monthly") && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Reset Day</Label>
                      <Input value={form.reset_day} onChange={(e) => setForm({ ...form, reset_day: e.target.value })} placeholder="e.g. 1, 15, or 'last day'" />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Special Options */}
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Special Options</p>
              <div className="grid grid-cols-1 gap-2.5">
                <label className="flex items-center justify-between p-2.5 rounded-md border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                  <span className="text-sm text-foreground">Encashable</span>
                  <Switch checked={form.is_encashable} onCheckedChange={(v) => setForm({ ...form, is_encashable: v })} />
                </label>
                <label className="flex items-center justify-between p-2.5 rounded-md border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                  <span className="text-sm text-foreground">Compensatory Leave</span>
                  <Switch checked={form.is_compensatory_leave} onCheckedChange={(v) => setForm({ ...form, is_compensatory_leave: v })} />
                </label>
                <label className="flex items-center justify-between p-2.5 rounded-md border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                  <span className="text-sm text-foreground">Exclude Company Holidays</span>
                  <Switch checked={form.exclude_company_leave} onCheckedChange={(v) => setForm({ ...form, exclude_company_leave: v })} />
                </label>
                <label className="flex items-center justify-between p-2.5 rounded-md border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                  <span className="text-sm text-foreground">Exclude Public Holidays</span>
                  <Switch checked={form.exclude_holiday} onCheckedChange={(v) => setForm({ ...form, exclude_holiday: v })} />
                </label>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || !form.code || saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {editId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}