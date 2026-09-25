import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employeeId: string;
  currentCtc: number | null | undefined;
  dateOfJoining?: string | null;
}

/**
 * Set / change the post-training CTC for an employee who is already onboarded
 * and still in training. Mirrors the onboarding Stage 2 "Training period"
 * block exactly: writes a SCHEDULED hr_salary_revisions row with
 * revision_reason = 'training_completion', which the daily scheduler promotes
 * and pushes to RazorpayX on the completion date and stages the mid-month
 * training CTC adjustment for HR approval.
 */
export function TrainingCompletionCtcDialog({ open, onOpenChange, employeeId, currentCtc, dateOfJoining }: Props) {
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [ctc, setCtc] = useState("");

  const { data: existing } = useQuery({
    queryKey: ["training_completion_revision", employeeId],
    enabled: open && !!employeeId,
    queryFn: async () => {
      const { data } = await supabase
        .from("hr_salary_revisions")
        .select("id, status, effective_from, new_total, previous_total")
        .eq("employee_id", employeeId)
        .eq("revision_reason", "training_completion")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
  });

  useEffect(() => {
    if (!open) return;
    if (existing?.status === "SCHEDULED") {
      setDate(existing.effective_from || "");
      setCtc(existing.new_total ? String(existing.new_total) : "");
    } else {
      setDate("");
      setCtc("");
    }
  }, [open, existing]);

  const trainingCtc = Number(existing?.status === "SCHEDULED" ? existing.previous_total : currentCtc) || 0;
  const alreadyApplied = existing?.status === "APPLIED";
  const today = new Date().toISOString().slice(0, 10);

  const preview = useMemo(() => {
    const c2 = Number(ctc);
    if (!date || !trainingCtc || !c2 || c2 === trainingCtc) return null;
    const t = new Date(`${date}T00:00:00`);
    if (Number.isNaN(t.getTime())) return null;
    const n = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    const dOld = t.getDate() - 1;
    return {
      monthLabel: t.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      dateLabel: t.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
      amount: ((c2 - trainingCtc) / 12) * (dOld / n),
      dOld, n,
    };
  }, [date, ctc, trainingCtc]);

  const save = useMutation({
    mutationFn: async () => {
      const postCtc = Number(ctc);
      if (!trainingCtc) throw new Error("This employee has no current CTC recorded — set it first");
      if (!date) throw new Error("Training completion date is required");
      if (!postCtc || postCtc <= 0) throw new Error("Post-training CTC must be positive");
      if (dateOfJoining && date <= dateOfJoining) throw new Error("Completion date must be after the date of joining");
      if (date < today) throw new Error("Completion date must be today or later — for a past date use Salary Revision");
      if (postCtc === trainingCtc) throw new Error("Post-training CTC must differ from the training CTC");

      const row = {
        employee_id: employeeId,
        previous_total: trainingCtc,
        new_total: postCtc,
        effective_from: date,
        revision_type: postCtc > trainingCtc ? "increment" : "demotion",
        revision_reason: "training_completion",
        status: "SCHEDULED",
        notes: "Scheduled from employee profile — training completion CTC",
      };
      const write = existing?.status === "SCHEDULED"
        ? await supabase.from("hr_salary_revisions").update(row as any).eq("id", existing.id)
        : await supabase.from("hr_salary_revisions").insert(row as any);
      if (write.error) throw write.error;

      // Keep the onboarding record in step so both places show the same plan.
      await (supabase as any)
        .from("hr_employee_onboarding")
        .update({ training_completion_date: date, post_training_ctc: postCtc })
        .eq("employee_id", employeeId);
    },
    onSuccess: () => {
      toast.success("Training completion CTC scheduled");
      qc.invalidateQueries({ queryKey: ["training_completion_revision", employeeId] });
      qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Training completion CTC</DialogTitle>
          <DialogDescription>
            Same as the training section of the onboarding form. On the completion date the CTC changes automatically in RazorpayX.
          </DialogDescription>
        </DialogHeader>

        {alreadyApplied ? (
          <p className="text-sm text-muted-foreground">
            The training completion CTC was already applied on {existing.effective_from}. Use Salary Revision for further changes.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="text-sm">
              Training CTC: <span className="font-medium text-foreground">₹{trainingCtc.toLocaleString("en-IN")}</span>
            </div>
            <div>
              <Label>Training completion date</Label>
              <Input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className="text-foreground" />
            </div>
            <div>
              <Label>Post-training annual CTC</Label>
              <Input type="number" placeholder="e.g. 900000" value={ctc} onChange={(e) => setCtc(e.target.value)} className="text-foreground" />
            </div>
            {preview && (
              <div className="rounded-md bg-primary/5 border p-3 text-xs text-muted-foreground">
                On <span className="text-foreground font-medium">{preview.dateLabel}</span> the CTC changes from ₹
                {trainingCtc.toLocaleString("en-IN")} to ₹{Number(ctc).toLocaleString("en-IN")}. RazorpayX pays {preview.monthLabel} fully
                at the new CTC, so a one-time {preview.amount >= 0 ? "recovery" : "addition"} of about{" "}
                <span className="text-foreground font-medium">₹{Math.abs(Math.round(preview.amount)).toLocaleString("en-IN")}</span>{" "}
                ({preview.dOld} day{preview.dOld === 1 ? "" : "s"} of {preview.n}) will be staged in the {preview.monthLabel} payroll for HR approval.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {!alreadyApplied && (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {existing?.status === "SCHEDULED" ? "Update" : "Schedule"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
