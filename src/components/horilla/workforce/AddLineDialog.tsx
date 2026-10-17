import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { PRIORITIES, PRIORITY_LABEL, planningShifts } from "@/lib/hrms/workforce";
import { invalidatePlanning, useSaveHeadcountPlan, useSeatCapacity, useSeatOccupancy, useWorkforceLookups } from "@/hooks/hrms/useWorkforcePlanning";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface AddLineSeed {
  department_id?: string;
  position_id?: string;
  eligible_position_ids?: string[];
  shift_id?: string | null;
  seat_capacity_id?: string | null;
  /** "Plan these desks": pick several shifts, one line per shift following desks. */
  multiShift?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seed?: AddLineSeed;
}

const seatRoles = (seat: any): string[] =>
  Array.isArray(seat.eligible_position_ids) && seat.eligible_position_ids.length
    ? seat.eligible_position_ids
    : seat.position_id
      ? [seat.position_id]
      : [];

/** New staffing line: one role (or shared roles) in one planning shift. */
export function AddLineDialog({ open, onOpenChange, seed }: Props) {
  const { data: lookups } = useWorkforceLookups();
  const { data: seats = [] } = useSeatCapacity();
  const save = useSaveHeadcountPlan();
  const qc = useQueryClient();
  const invalidate = () => invalidatePlanning(qc);
  const occupancy = useSeatOccupancy();
  const [multi, setMulti] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    department_id: "",
    position_id: "",
    shared: [] as string[],
    shift_id: "any" as string,
    seat_capacity_id: "none" as string,
    follow_desks: false,
    required_hc: 0,
    approved_hc: 0,
    target_date: "",
    priority: "auto",
    reason: "",
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    setError(null);
    const shared = (seed?.eligible_position_ids || []).filter((id) => id !== seed?.position_id);
    setForm({
      department_id: seed?.department_id ?? "",
      position_id: seed?.position_id ?? "",
      shared,
      shift_id: seed?.shift_id ?? "any",
      seat_capacity_id: seed?.seat_capacity_id ?? "none",
      follow_desks: !!seed?.seat_capacity_id,
      required_hc: 0,
      approved_hc: 0,
      target_date: "",
      priority: "auto",
      reason: "",
    });
    setMulti([]);
  }, [open, seed]);

  // Default for "Plan these desks": the planning shifts the role's people work in now.
  useEffect(() => {
    if (!open || !seed?.multiShift || multi.length) return;
    const ids = seed.eligible_position_ids?.length ? seed.eligible_position_ids : seed.position_id ? [seed.position_id] : [];
    const worked = new Set((occupancy.data || [])
      .filter((r: any) => !r.is_training && r.department_id === seed.department_id && ids.includes(r.job_position_id) && r.shift_id)
      .map((r: any) => r.shift_id as string));
    if (worked.size) setMulti(Array.from(worked));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed, occupancy.data]);

  const positions = (lookups?.positions || []).filter(
    (p: any) =>
      p.in_workforce_planning !== false &&
      (!form.department_id || !p.department_id || p.department_id === form.department_id),
  );
  const shifts = planningShifts((lookups?.shifts || []) as any[]);
  const deptSeats = (seats as any[]).filter(
    (s) => !s.is_training_only && (!form.department_id || s.department_id === form.department_id),
  );
  const roles = useMemo(
    () => (form.position_id ? Array.from(new Set([form.position_id, ...form.shared])) : []),
    [form.position_id, form.shared],
  );

  // Suggest the role's desk group when none is picked yet.
  useEffect(() => {
    if (!open || form.seat_capacity_id !== "none" || !form.position_id) return;
    const match = deptSeats.find((s) => seatRoles(s).includes(form.position_id));
    if (match) set({ seat_capacity_id: match.id, follow_desks: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.position_id, open]);

  const seat = deptSeats.find((s) => s.id === form.seat_capacity_id);
  const deskCount = seat ? (seat.is_active === false ? 0 : (seat.max_operational_capacity ?? seat.physical_seats ?? 0)) : 0;
  const following = form.follow_desks && !!seat;
  const required = following ? deskCount : form.required_hc;
  const approved = following ? deskCount : form.approved_hc;

  const canSave = !!form.department_id && !!form.position_id && form.reason.trim().length > 0 && !save.isPending && !saving
    && (!seed?.multiShift || multi.length > 0);

  const payloadFor = (shift: any) => ({
        department_id: form.department_id,
        position_id: form.position_id,
        eligible_position_ids: roles.length > 1 ? roles : [],
        shift_id: shift ? shift.id : null,
        eligible_shift_ids: [] as string[],
        shift_label: shift?.name ?? null,
        location: null,
        employment_type: "full_time",
        approved_hc: approved,
        required_hc: required,
        target_date: form.target_date || null,
        priority: form.priority === "auto" ? null : form.priority,
        notes: form.reason.trim(),
        seat_capacity_id: seat ? seat.id : null,
        follow_desks: following,
      });

  const submitMany = async () => {
    setError(null); setSaving(true);
    try {
      // One transaction: either every desk's line is saved or none is.
      const lines = multi.map((id) => payloadFor(shifts.find((s: any) => s.id === id)));
      const { error: e } = await (supabase.rpc as any)("hr_wf_add_lines", { p_lines: lines });
      if (e) throw e;
      invalidate();
      toast.success(`${lines.length} staffing line${lines.length === 1 ? "" : "s"} saved`);
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || "Could not save the lines");
    } finally { setSaving(false); }
  };

  const submit = () => {
    if (seed?.multiShift) { void submitMany(); return; }
    setError(null);
    const shift = shifts.find((s: any) => s.id === form.shift_id);
    save.mutate(
      {
        department_id: form.department_id,
        position_id: form.position_id,
        eligible_position_ids: roles.length > 1 ? roles : [],
        shift_id: shift ? shift.id : null,
        eligible_shift_ids: [],
        shift_label: shift?.name ?? null,
        location: null,
        employment_type: "full_time",
        approved_hc: approved,
        required_hc: required,
        target_date: form.target_date || null,
        priority: form.priority === "auto" ? null : form.priority,
        notes: form.reason.trim(),
        seat_capacity_id: seat ? seat.id : null,
        follow_desks: following,
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: (e: any) => setError(e?.message || "Could not save the line"),
      },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add staffing line"
      description="One line per designation and shift. People on roll, trainees and the pipeline are counted for you."
      contentClassName="md:max-w-2xl"
      focusContainer
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!canSave}>{save.isPending || saving ? "Saving..." : seed?.multiShift ? `Add ${multi.length} line${multi.length === 1 ? "" : "s"}` : "Add line"}</Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive sm:col-span-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="space-y-1">
          <Label>Department</Label>
          <Select value={form.department_id} onValueChange={(v) => set({ department_id: v, position_id: "", shared: [], seat_capacity_id: "none" })}>
            <SelectTrigger className="text-foreground"><SelectValue placeholder="Select department" /></SelectTrigger>
            <SelectContent>
              {(lookups?.departments || []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Designation</Label>
          <Select value={form.position_id} onValueChange={(v) => set({ position_id: v, shared: form.shared.filter((id) => id !== v) })}>
            <SelectTrigger className="text-foreground"><SelectValue placeholder="Select designation" /></SelectTrigger>
            <SelectContent>
              {positions.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {form.position_id && positions.length > 1 && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Shared with (one combined target)</Label>
            <div className="grid gap-2 rounded-md border border-border p-2.5 sm:grid-cols-2">
              {positions.filter((p) => p.id !== form.position_id).map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                  <Checkbox
                    checked={form.shared.includes(p.id)}
                    onCheckedChange={(v) => set({ shared: v ? [...form.shared, p.id] : form.shared.filter((id) => id !== p.id) })}
                  />
                  {p.title}
                </label>
              ))}
            </div>
          </div>
        )}

        {seed?.multiShift ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Shifts to staff (one line per shift, each following the desks)</Label>
            <div className="flex flex-wrap gap-3 rounded-md border border-border p-2.5">
              {shifts.map((s: any) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                  <Checkbox checked={multi.includes(s.id)}
                    onCheckedChange={(v) => setMulti((m) => (v ? [...m, s.id] : m.filter((x) => x !== s.id)))} />
                  {s.name}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Ticked by default: the shifts this designation works in now.</p>
          </div>
        ) : (
        <div className="space-y-1">
          <Label>Shift</Label>
          <Select value={form.shift_id} onValueChange={(v) => set({ shift_id: v })}>
            <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any shift</SelectItem>
              {shifts.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        )}
        <div className="space-y-1">
          <Label>Desk group</Label>
          <Select value={form.seat_capacity_id} onValueChange={(v) => set({ seat_capacity_id: v, follow_desks: v !== "none" })}>
            <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No desk group</SelectItem>
              {deptSeats.map((s) => {
                const titles = seatRoles(s)
                  .map((id) => (lookups?.positions || []).find((p) => p.id === id)?.title)
                  .filter(Boolean)
                  .join(" / ");
                return (
                  <SelectItem key={s.id} value={s.id}>
                    {(titles || "Whole department")} · {s.physical_seats} desks
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5 sm:col-span-2">
          <div>
            <p className="text-sm font-medium text-foreground">Follow desks</p>
            <p className="text-xs text-muted-foreground">
              {seat ? `Required and approved stay equal to the desk group (${deskCount}).` : "Pick a desk group to follow its desk count."}
            </p>
          </div>
          <Switch checked={following} disabled={!seat} onCheckedChange={(v) => set({ follow_desks: v })} />
        </div>

        <div className="space-y-1">
          <Label>Required</Label>
          <Input type="number" min={0} className="text-foreground" disabled={following} value={required}
            onChange={(e) => set({ required_hc: Math.max(0, Number(e.target.value) || 0) })} />
        </div>
        <div className="space-y-1">
          <Label>Approved</Label>
          <Input type="number" min={0} className="text-foreground" disabled={following} value={approved}
            onChange={(e) => set({ approved_hc: Math.max(0, Number(e.target.value) || 0) })} />
        </div>
        <div className="space-y-1">
          <Label>Target date</Label>
          <Input type="date" className="text-foreground" value={form.target_date} onChange={(e) => set({ target_date: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Priority</Label>
          <Select value={form.priority} onValueChange={(v) => set({ priority: v })}>
            <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automatic</SelectItem>
              {PRIORITIES.map((p) => <SelectItem key={p} value={p}>Always {PRIORITY_LABEL[p].toLowerCase()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Reason (recorded in the history)</Label>
          <Textarea rows={2} className="text-foreground" value={form.reason} onChange={(e) => set({ reason: e.target.value })}
            placeholder="e.g. Night shift opening from November" />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
