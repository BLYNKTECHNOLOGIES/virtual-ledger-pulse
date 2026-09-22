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
  useSaveSeatCapacity,
  useWorkforceLookups,
  type SeatCapacityInput,
} from "@/hooks/hrms/useWorkforcePlanning";

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

  const submit = () => {
    const shift = lookups?.shifts.find((s) => s.id === form.shift_id);
    save.mutate(
      { ...form, shift_label: shift?.name ?? form.shift_label ?? null },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={form.id ? "Edit seat capacity" : "Add seat capacity"}
      description="Physical seats are desks and workstations. They are tracked separately from sanctioned and required headcount."
      contentClassName="max-w-2xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!form.department_id || save.isPending}
          >
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
          <Label>Position (optional)</Label>
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
            <Label>Inter-usable roles</Label>
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
                          ? Array.from(new Set([form.position_id, ...form.eligible_position_ids, position.id].filter(Boolean)))
                          : form.eligible_position_ids.filter((id) => id !== position.id),
                      })}
                    />
                    {position.title}
                  </label>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">Selected roles can use any seat in this shared pool.</p>
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
          <Label>Total physical seats</Label>
          <Input
            type="number"
            min={0}
            className="text-foreground"
            value={form.physical_seats}
            onChange={(e) => set({ physical_seats: Number(e.target.value) || 0 })}
          />
        </div>

        <div className="space-y-1">
          <Label>Maximum operational capacity</Label>
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
