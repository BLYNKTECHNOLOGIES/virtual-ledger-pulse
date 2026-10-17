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
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import {
  useSaveSeatCapacity,
  useStaffingMatrix,
  useWorkforceLookups,
  type SeatCapacityInput,
} from "@/hooks/hrms/useWorkforcePlanning";
import { sortByOperatingOrder } from "@/lib/hrms/workforce";

interface SeatCapacityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<SeatCapacityInput> & { id?: string };
}

const BLANK: SeatCapacityInput = {
  department_id: "",
  position_id: null,
  eligible_position_ids: [],
  shift_id: null,
  shift_label: null,
  location: null,
  physical_seats: 0,
  max_operational_capacity: null,
  notes: null,
  is_training_only: false,
};

export function SeatCapacityDialog({
  open,
  onOpenChange,
  initial,
}: SeatCapacityDialogProps) {
  const { data: lookups } = useWorkforceLookups();
  const save = useSaveSeatCapacity();
  const [form, setForm] = useState<SeatCapacityInput & { id?: string }>(BLANK);

  useEffect(() => {
    if (open) setForm({ ...BLANK, ...initial });
  }, [open, initial]);

  const set = (patch: Partial<SeatCapacityInput>) =>
    setForm((f) => ({ ...f, ...patch }));

  const positions = (lookups?.positions || []).filter(
    (p) => !form.department_id || !p.department_id || p.department_id === form.department_id,
  );

  const { rows: matrixRows } = useStaffingMatrix();
  const shifts = (lookups?.shifts || []) as any[];
  const selectedShift = shifts.find((s) => s.id === form.shift_id);
  const training = !!form.is_training_only;
  const trainingBlocked = !selectedShift?.is_training_shift
    ? "Pick a training shift first (mark one as a training shift on the Shifts page)."
    : form.position_id
      ? "Training desks belong to no designation — set Designation to Whole department."
      : null;

  // Lines staffing this desk group, in operating order.
  const linkedLines = form.id ? matrixRows.filter((r) => r.seat_capacity_id === form.id) : [];
  const orderedLines = sortByOperatingOrder(
    linkedLines.map((r) => ({ ...r, name: r.shiftLabel, start_time: shifts.find((s) => s.id === r.shift_id)?.start_time ?? null })),
  );
  const newDesk = training ? 0 : form.max_operational_capacity ?? form.physical_seats;
  const followingToChange = linkedLines.filter((r) => r.follow_desks && r.required_hc !== newDesk).length;

  const submit = () => {
    const shift = lookups?.shifts.find((s) => s.id === form.shift_id);
    save.mutate(
      {
        ...form,
        max_operational_capacity: training ? 0 : form.max_operational_capacity,
        shift_label: shift?.name ?? form.shift_label ?? null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={form.id ? "Edit desk group" : "Add desk group"}
      description="Desks used by one or more designations. Shifts share them: a staffing line that follows this group requires one person per usable desk in each shift it works. Saving updates those lines and their automatic requests awaiting approval."
      contentClassName="md:max-w-2xl"
      focusContainer
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!form.department_id || save.isPending || (training && !!trainingBlocked)}
          >
            {save.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5 sm:col-span-2">
          <div>
            <p className="text-sm font-medium text-foreground">Training-only desks</p>
            <p className="text-xs text-muted-foreground">
              {training && trainingBlocked
                ? trainingBlocked
                : "Used only by people on a training shift. No designation and 0 usable desks, so they never count as staffing."}
            </p>
          </div>
          <Switch
            checked={training}
            onCheckedChange={(v) => set({ is_training_only: v, ...(v ? { max_operational_capacity: 0, eligible_position_ids: [] } : {}) })}
          />
        </div>
        {form.id && !training && (
          <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs sm:col-span-2">
            {orderedLines.length === 0 ? (
              <p className="text-muted-foreground">No staffing line uses these desks yet.</p>
            ) : (
              <p className="text-foreground">
                Staffed in:{" "}
                {orderedLines.map((r) => `${r.name} ${r.required_hc}`).join(" · ")}
                {orderedLines.some((r) => r.follow_desks) ? " (follow desks)" : ""}
                {" · "}
                <Link to="/hrms/workforce-planning/staffing-plan" className="text-primary hover:underline">Open staffing plan</Link>
              </p>
            )}
            {followingToChange > 0 && (() => {
              const olds = [...new Set(linkedLines.filter((r) => r.follow_desks && r.required_hc !== newDesk).map((r) => r.required_hc))];
              return (
                <p className="mt-1 text-warning">
                  Saving changes {followingToChange} line{followingToChange > 1 ? "s" : ""} from {olds.join(" / ")} to {newDesk} required; their pending automatic hiring requests resize to match.
                </p>
              );
            })()}
          </div>
        )}
        <div className="space-y-1">
          <Label>Department</Label>
          <Select
            value={form.department_id}
            onValueChange={(v) => set({ department_id: v, position_id: null, eligible_position_ids: [] })}
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
          <Label>Designation (optional)</Label>
          <Select
            value={form.position_id ?? "none"}
            onValueChange={(v) => {
              const positionId = v === "none" ? null : v;
              set({
                position_id: positionId,
                eligible_position_ids: positionId && form.eligible_position_ids.length
                  ? Array.from(new Set([positionId, ...form.eligible_position_ids]))
                  : [],
              });
            }}
          >
            <SelectTrigger className="text-foreground">
              <SelectValue placeholder="Whole department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Whole department</SelectItem>
              {positions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {form.position_id && (
          <div className="space-y-2 sm:col-span-2">
            <Label>Designations that share these desks</Label>
            <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
              {positions.map((position) => {
                const checked = form.eligible_position_ids.includes(position.id);
                return (
                  <div key={position.id} className="flex items-center gap-2 text-xs text-foreground">
                    <Checkbox
                      id={`seat-eligible-${position.id}`}
                      checked={checked}
                      disabled={position.id === form.position_id && form.eligible_position_ids.length > 0}
                      onCheckedChange={(value) => set({
                        eligible_position_ids: value
                          ? Array.from(new Set([...(form.position_id ? [form.position_id] : []), ...form.eligible_position_ids, position.id]))
                          : form.eligible_position_ids.filter((id) => id !== position.id),
                      })}
                    />
                    <Label htmlFor={`seat-eligible-${position.id}`} className="cursor-pointer text-xs font-normal">
                      {position.title}
                    </Label>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">Selected designations can use any seat in this shared pool.</p>
          </div>
        )}

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
          <Label>Desks</Label>
          <Input
            type="number"
            min={0}
            className="text-foreground"
            value={form.physical_seats}
            onChange={(e) => set({ physical_seats: Number(e.target.value) || 0 })}
          />
        </div>

        <div className="space-y-1">
          <Label>Usable desks (if fewer)</Label>
          <Input
            type="number"
            min={0}
            className="text-foreground"
            value={form.max_operational_capacity ?? ""}
            onChange={(e) =>
              set({
                max_operational_capacity:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
            placeholder="People who can work at once"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label>Note</Label>
          <Textarea
            className="text-foreground"
            rows={2}
            value={form.notes ?? ""}
            onChange={(e) => set({ notes: e.target.value || null })}
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
