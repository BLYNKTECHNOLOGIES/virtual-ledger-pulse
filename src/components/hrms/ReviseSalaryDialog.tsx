import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";

const REVISION_TYPES = [
  { value: "increment", label: "Increment / Hike" },
  { value: "promotion", label: "Promotion" },
  { value: "correction", label: "Correction" },
  { value: "demotion", label: "Demotion / Decrease" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  presetEmployeeId?: string;
}

export function ReviseSalaryDialog({ open, onOpenChange, presetEmployeeId }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [employeeId, setEmployeeId] = useState<string>("");
  const [revisionType, setRevisionType] = useState<string>("increment");
  const [newTotal, setNewTotal] = useState<string>("");
  const [newBasic, setNewBasic] = useState<string>("");
  const [effectiveFrom, setEffectiveFrom] = useState<Date>(new Date());
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    if (open) {
      setEmployeeId(presetEmployeeId || "");
      setRevisionType("increment");
      setNewTotal("");
      setNewBasic("");
      setEffectiveFrom(new Date());
      setReason("");
    }
  }, [open, presetEmployeeId]);

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active_for_revision"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employees")
        .select("id, first_name, last_name, badge_id, basic_salary, total_salary, is_active")
        .eq("is_active", true)
        .order("first_name");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const employee = useMemo(
    () => employees.find((e: any) => e.id === employeeId),
    [employees, employeeId],
  );

  const currentBasic = Number(employee?.basic_salary || 0);
  const currentTotal = Number(employee?.total_salary || 0);
  const nT = parseFloat(newTotal) || 0;
  const nB = parseFloat(newBasic) || 0;
  const totalDelta = nT - currentTotal;
  const totalDeltaPct = currentTotal > 0 ? (totalDelta / currentTotal) * 100 : 0;

  const reasonRequired = revisionType === "promotion" || revisionType === "demotion";
  const isScheduled = effectiveFrom > new Date(new Date().setHours(23, 59, 59, 999));

  const mutation = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error("Select an employee");
      if (!newTotal) throw new Error("Enter the new total salary");
      if (reasonRequired && !reason.trim()) throw new Error("Reason is mandatory for Promotion / Demotion");

      const approvedBy =
        [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
        (user as any)?.email ||
        "System";

      const { data, error } = await (supabase as any).rpc("apply_salary_revision", {
        p_employee_id: employeeId,
        p_new_basic: nB || null,
        p_new_total: nT,
        p_revision_type: revisionType,
        p_reason: reason || null,
        p_effective_from: format(effectiveFrom, "yyyy-MM-dd"),
        p_approved_by: approvedBy,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["hr_salary_revisions"] });
      qc.invalidateQueries({ queryKey: ["hr_employees"] });
      toast.success(
        data?.status === "SCHEDULED"
          ? `Revision scheduled for ${data.effective_from}`
          : "Salary revision applied",
      );
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Revise Employee Salary</DialogTitle>
          <DialogDescription>
            Updates the employee's CTC and Basic. Future-dated revisions are scheduled and applied automatically on the effective date.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId} disabled={!!presetEmployeeId}>
              <SelectTrigger className="text-foreground">
                <SelectValue placeholder="Select employee..." />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {employees.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.first_name} {e.last_name} {e.badge_id ? `· ${e.badge_id}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {employee && (
              <p className="text-xs text-muted-foreground mt-1">
                Current CTC ₹{currentTotal.toLocaleString("en-IN")} · Basic ₹{currentBasic.toLocaleString("en-IN")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Revision type</Label>
              <Select value={revisionType} onValueChange={setRevisionType}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REVISION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Effective from</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-foreground", !effectiveFrom && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {format(effectiveFrom, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={effectiveFrom} onSelect={(d) => d && setEffectiveFrom(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>New Total (CTC) ₹</Label>
              <Input type="number" inputMode="decimal" value={newTotal} onChange={(e) => setNewTotal(e.target.value)} className="text-foreground" placeholder="e.g. 60000" />
              {nT > 0 && currentTotal > 0 && (
                <p className={cn("text-xs mt-1", totalDelta >= 0 ? "text-success" : "text-destructive")}>
                  {totalDelta >= 0 ? "+" : ""}₹{totalDelta.toLocaleString("en-IN")} ({totalDeltaPct.toFixed(1)}%)
                </p>
              )}
            </div>
            <div>
              <Label>New Basic ₹</Label>
              <Input type="number" inputMode="decimal" value={newBasic} onChange={(e) => setNewBasic(e.target.value)} className="text-foreground" placeholder="Optional" />
              <p className="text-xs text-muted-foreground mt-1">Leave blank to keep basic unchanged.</p>
            </div>
          </div>

          <div>
            <Label>Reason / notes {reasonRequired && <span className="text-destructive">*</span>}</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="text-foreground" placeholder={reasonRequired ? "Required for promotion/demotion" : "Optional"} rows={2} />
          </div>

          {isScheduled && (
            <div className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded p-2">
              Future-dated — will be scheduled and auto-applied on {format(effectiveFrom, "PPP")}.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !employeeId || !newTotal}>
            {isScheduled ? "Schedule revision" : "Apply revision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
