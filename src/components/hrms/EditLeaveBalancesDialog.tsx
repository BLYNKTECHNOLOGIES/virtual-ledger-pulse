import { useState, useEffect } from "react";
import { useMutation, QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employeeId: string;
  leaveAllocations: any[];
  leaveTypes: any[];
  queryClient: QueryClient;
}

type Row = {
  id?: string;
  leave_type_id: string;
  year: number;
  quarter: number;
  allocated_days: number;
  used_days: number;
  _new?: boolean;
  _dirty?: boolean;
  _delete?: boolean;
};

export function EditLeaveBalancesDialog({
  open, onOpenChange, employeeId, leaveAllocations, leaveTypes, queryClient,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const currentYear = new Date().getFullYear();
  const currentQuarter = Math.floor(new Date().getMonth() / 3) + 1;

  useEffect(() => {
    if (open) {
      setRows(
        leaveAllocations.map((a) => ({
          id: a.id,
          leave_type_id: a.leave_type_id,
          year: a.year,
          quarter: a.quarter,
          allocated_days: Number(a.allocated_days || 0),
          used_days: Number(a.used_days || 0),
        }))
      );
    }
  }, [open, leaveAllocations]);

  const getLt = (id: string) => leaveTypes.find((t) => t.id === id);

  const updateRow = (idx: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch, _dirty: true } : r)));
  };

  const addRow = () => {
    const firstType = leaveTypes[0]?.id;
    if (!firstType) {
      toast.error("No leave types configured");
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        leave_type_id: firstType,
        year: currentYear,
        quarter: currentQuarter,
        allocated_days: 0,
        used_days: 0,
        _new: true,
        _dirty: true,
      },
    ]);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => {
      const r = prev[idx];
      if (r._new) return prev.filter((_, i) => i !== idx);
      return prev.map((row, i) => (i === idx ? { ...row, _delete: true } : row));
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const toDelete = rows.filter((r) => r._delete && r.id).map((r) => r.id!);
      const toInsert = rows.filter((r) => r._new && !r._delete).map((r) => ({
        employee_id: employeeId,
        leave_type_id: r.leave_type_id,
        year: r.year,
        quarter: r.quarter,
        allocated_days: Number(r.allocated_days) || 0,
        used_days: Number(r.used_days) || 0,
      }));
      const toUpdate = rows.filter((r) => !r._new && !r._delete && r._dirty && r.id);

      if (toDelete.length) {
        const { error } = await supabase.from("hr_leave_allocations").delete().in("id", toDelete);
        if (error) throw error;
      }
      for (const r of toUpdate) {
        const { error } = await supabase
          .from("hr_leave_allocations")
          .update({
            allocated_days: Number(r.allocated_days) || 0,
            used_days: Number(r.used_days) || 0,
            year: r.year,
            quarter: r.quarter,
            leave_type_id: r.leave_type_id,
          })
          .eq("id", r.id!);
        if (error) throw error;
      }
      if (toInsert.length) {
        const { error } = await supabase.from("hr_leave_allocations").insert(toInsert);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Leave balances saved");
      queryClient.invalidateQueries({ queryKey: ["hr_leave_allocations", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["hr_leave_allocations_all"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save"),
  });

  const visible = rows.map((r, i) => ({ r, i })).filter(({ r }) => !r._delete);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Leave Balances</DialogTitle>
          <DialogDescription>
            Adjust allocated and used days per leave type. Use this to seed migrated balances. Each row is a period (year/quarter); the profile shows the cumulative total across all rows.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground px-2">
              <div className="col-span-4">Leave Type</div>
              <div className="col-span-2">Year</div>
              <div className="col-span-2">Quarter</div>
              <div className="col-span-1.5">Allocated</div>
              <div className="col-span-1.5">Used</div>
              <div className="col-span-1"></div>
            </div>
            {visible.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No allocations yet. Click "Add Row" to seed one.</p>
            )}
            {visible.map(({ r, i }) => {
              const lt = getLt(r.leave_type_id);
              return (
                <div key={r.id ?? `new-${i}`} className="grid grid-cols-12 gap-2 items-center bg-muted/30 rounded-md p-2">
                  <div className="col-span-4">
                    <Select value={r.leave_type_id} onValueChange={(v) => updateRow(i, { leave_type_id: v })}>
                      <SelectTrigger className="text-foreground">
                        <SelectValue>
                          <span className="flex items-center gap-2">
                            <span
                              className="w-5 h-5 rounded-full text-primary-foreground text-[9px] font-bold flex items-center justify-center"
                              style={{ backgroundColor: lt?.color || "#888" }}
                            >
                              {lt?.code?.substring(0, 2) || "??"}
                            </span>
                            {lt?.name || "Select"}
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {leaveTypes.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} ({t.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      value={r.year}
                      onChange={(e) => updateRow(i, { year: parseInt(e.target.value) || currentYear })}
                      className="text-foreground"
                    />
                  </div>
                  <div className="col-span-2">
                    <Select value={String(r.quarter)} onValueChange={(v) => updateRow(i, { quarter: parseInt(v) })}>
                      <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map((q) => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1">
                    <Input
                      type="number"
                      step="0.5"
                      value={r.allocated_days}
                      onChange={(e) => updateRow(i, { allocated_days: parseFloat(e.target.value) || 0 })}
                      className="text-foreground"
                    />
                  </div>
                  <div className="col-span-1">
                    <Input
                      type="number"
                      step="0.5"
                      value={r.used_days}
                      onChange={(e) => updateRow(i, { used_days: parseFloat(e.target.value) || 0 })}
                      className="text-foreground"
                    />
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => removeRow(i)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <Button variant="outline" size="sm" onClick={addRow} className="mt-3">
            <Plus className="h-4 w-4 mr-1" /> Add Row
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save Balances"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
