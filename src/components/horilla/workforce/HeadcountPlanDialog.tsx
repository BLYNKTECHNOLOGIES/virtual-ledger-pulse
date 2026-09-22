import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import {
  EMPLOYMENT_TYPES,
  PRIORITIES,
  PRIORITY_LABEL,
} from "@/lib/hrms/workforce";
import {
  useSaveHeadcountPlan,
  useWorkforceLookups,
  type HeadcountPlanInput,
} from "@/hooks/hrms/useWorkforcePlanning";

interface HeadcountPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing plan line being edited, or seed values for a new one. */
  initial?: Partial<HeadcountPlanInput> & { id?: string };
}

const BLANK: HeadcountPlanInput = {
  department_id: "",
  position_id: "",
  eligible_position_ids: [],
  shift_id: null,
  eligible_shift_ids: [],
  shift_label: null,
  location: null,
  employment_type: null,
  approved_hc: 0,
  required_hc: 0,
  target_date: null,
  priority: "medium",
  notes: null,
};

export function HeadcountPlanDialog({
  open,
  onOpenChange,
  initial,
}: HeadcountPlanDialogProps) {
  const { data: lookups } = useWorkforceLookups();
  const save = useSaveHeadcountPlan();
  const [form, setForm] = useState<HeadcountPlanInput & { id?: string }>(BLANK);

  useEffect(() => {
    if (open) setForm({ ...BLANK, ...initial });
  }, [open, initial]);

  const set = (patch: Partial<HeadcountPlanInput>) =>
    setForm((f) => ({ ...f, ...patch }));

  const positions = (lookups?.positions || []).filter(
    (p) => !form.department_id || !p.department_id || p.department_id === form.department_id,
  );

  const canSave = form.department_id && form.position_id && !save.isPending;

  const submit = () => {
    const shift = lookups?.shifts.find((s) => s.id === form.shift_id);
    const eligiblePositions = form.eligible_position_ids.length > 0
      ? Array.from(new Set([form.position_id, ...form.eligible_position_ids]))
      : [];
    const eligibleShifts = form.eligible_shift_ids.length > 0 && form.shift_id
      ? Array.from(new Set([form.shift_id, ...form.eligible_shift_ids]))
      : form.eligible_shift_ids;
    save.mutate(
      { ...form, eligible_position_ids: eligiblePositions, eligible_shift_ids: eligibleShifts, shift_label: shift?.name ?? form.shift_label ?? null },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={form.id ? "Edit staffing line" : "Add staffing line"}
      description="Approved seats are what management has sanctioned; required is what the business actually needs. Current staffing is counted from active employees."
      contentClassName="max-w-2xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSave}>
            {save.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Department</Label>
          <Select
            value={form.department_id}
            onValueChange={(v) => set({ department_id: v, position_id: "", eligible_position_ids: [] })}
          >
            <SelectTrigger className="text-foreground">
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              {(lookups?.departments || []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Position</Label>
          <Select value={form.position_id} onValueChange={(v) => set({ position_id: v, eligible_position_ids: form.eligible_position_ids.length ? Array.from(new Set([v, ...form.eligible_position_ids])) : [] })}>
            <SelectTrigger className="text-foreground">
              <SelectValue placeholder="Select position" />
            </SelectTrigger>
            <SelectContent>
              {positions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>Shared eligible roles</Label>
          <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
            {positions.map((position) => {
              const checked = form.eligible_position_ids.includes(position.id);
              return (
                <label key={position.id} className="flex items-center gap-2 text-xs text-foreground">
                  <Checkbox
                    checked={checked}
                    disabled={position.id === form.position_id && form.eligible_position_ids.length > 0}
                    onCheckedChange={(value) => set({
                      eligible_position_ids: value
                        ? Array.from(new Set([...(form.position_id ? [form.position_id] : []), ...form.eligible_position_ids, position.id]))
                        : form.eligible_position_ids.filter((id) => id !== position.id),
                    })}
                  />
                  {position.title}
                </label>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">Select roles that share one combined staffing target.</p>
        </div>

        <div className="space-y-1">
          <Label>Shift</Label>
          <Select
            value={form.shift_id ?? "none"}
            onValueChange={(v) => set({ shift_id: v === "none" ? null : v })}
          >
            <SelectTrigger className="text-foreground">
              <SelectValue placeholder="Any shift" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not shift specific</SelectItem>
              {(lookups?.shifts || []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Employment type</Label>
          <Select
            value={form.employment_type ?? "none"}
            onValueChange={(v) => set({ employment_type: v === "none" ? null : v })}
          >
            <SelectTrigger className="text-foreground">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Any</SelectItem>
              {EMPLOYMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Priority</Label>
          <Select value={form.priority} onValueChange={(v) => set({ priority: v })}>
            <SelectTrigger className="text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Approved headcount</Label>
          <Input
            type="number"
            min={0}
            className="text-foreground"
            value={form.approved_hc}
            onChange={(e) => set({ approved_hc: Number(e.target.value) || 0 })}
          />
        </div>

        <div className="space-y-1">
          <Label>Required headcount</Label>
          <Input
            type="number"
            min={0}
            className="text-foreground"
            value={form.required_hc}
            onChange={(e) => set({ required_hc: Number(e.target.value) || 0 })}
          />
        </div>

        <div className="space-y-1">
          <Label>Hiring target date</Label>
          <Input
            type="date"
            className="text-foreground"
            value={form.target_date ?? ""}
            onChange={(e) => set({ target_date: e.target.value || null })}
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label>Reason / note (recorded in the audit trail)</Label>
          <Textarea
            className="text-foreground"
            rows={2}
            value={form.notes ?? ""}
            onChange={(e) => set({ notes: e.target.value || null })}
            placeholder="e.g. Night shift volumes up 30%"
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
