import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  normEmploymentType,
  planningShifts,
  HIRING_REASONS,
  PRIORITIES,
  PRIORITY_LABEL,
  linePriorityText,
  formatIstDate,
  istToday,
} from "@/lib/hrms/workforce";
import {
  useSaveHiringRequirement,
  useWorkforceLookups,
  useWorkforceEmployees,
  usePositionPlanningStatus,
  roleBlocksHiring,
  ROLE_NOT_PLANNED_MESSAGE,
  useStaffingMatrix,
  useHeadcountPlans,
  type HiringRequirementInput,
} from "@/hooks/hrms/useWorkforcePlanning";
import { linesForRole } from "@/hooks/hrms/useWorkforceRepair";

interface HiringRequirementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<HiringRequirementInput> & { id?: string };
  /** Submit straight for approval instead of saving a draft. */
  defaultSubmitForApproval?: boolean;
}

const BLANK: HiringRequirementInput = {
  department_id: "",
  position_id: "",
  shift_id: null,
  shift_label: null,
  location: null,
  employment_type: null,
  number_required: 1,
  target_joining_date: null,
  reason: "new_business",
  reason_notes: null,
  required_skills: null,
  experience_required: null,
  salary_min: null,
  salary_max: null,
  replacement_employee_id: null,
  staffing_plan_id: null,
  priority: "medium",
  status: "draft",
  notes: null,
};

export function HiringRequirementDialog({
  open,
  onOpenChange,
  initial,
  defaultSubmitForApproval = true,
}: HiringRequirementDialogProps) {
  const { data: lookups } = useWorkforceLookups();
  const { data: employees = [] } = useWorkforceEmployees(open);
  const { data: planning } = usePositionPlanningStatus(open);
  const save = useSaveHiringRequirement();
  const matrix = useStaffingMatrix();
  const { data: activePlans = [] } = useHeadcountPlans();
  const [editReason, setEditReason] = useState("");
  const [form, setForm] = useState<HiringRequirementInput & { id?: string }>(BLANK);
  const limited = !!form.id && !!initial?.status && !["draft", "pending_approval"].includes(initial.status);

  // Reset only when the dialog opens or a different requirement is shown — re-renders and refetches keep what HR typed.
  const initialKey = initial?.id ?? (initial ? JSON.stringify(initial) : "");
  useEffect(() => {
    if (open) { setForm({ ...BLANK, ...initial } as HiringRequirementInput & { id?: string }); setEditReason(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialKey]);

  const set = (patch: Partial<HiringRequirementInput>) =>
    setForm((f) => ({ ...f, ...patch }));

  const positions = (lookups?.positions || []).filter(
    (p) => !form.department_id || !p.department_id || p.department_id === form.department_id,
  );

  // Lines this department + role may sit on. When any exist, the requirement must name one.
  const roleLineIds = new Set(linesForRole(activePlans as any[], form.department_id, form.position_id).map((p: any) => p.id));
  const roleLines = matrix.rows.filter((r) => roleLineIds.has(r.plan_id));
  const needsLine = roleLines.length > 0;
  const lineChoices = form.department_id && form.position_id ? roleLines : matrix.rows;
  const lineMoved = !!form.id && !!initial?.staffing_plan_id && form.staffing_plan_id !== initial.staffing_plan_id;
  const becomesManual = !!form.id && (initial as any)?.source === "capacity_occupancy" && ["draft", "pending_approval"].includes(initial?.status ?? "")
    && (Number(form.number_required) !== Number(initial?.number_required) || lineMoved);
  const askReason = limited || lineMoved;

  useEffect(() => {
    // A role change drops a line that no longer fits.
    if (form.staffing_plan_id && form.department_id && form.position_id && matrix.rows.length && !roleLineIds.has(form.staffing_plan_id))
      setForm((f) => ({ ...f, staffing_plan_id: null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.department_id, form.position_id, matrix.rows.length, activePlans]);

  const pickLine = (v: string) => {
    if (v === "none") return set({ staffing_plan_id: null });
    const l = matrix.rows.find((r) => r.plan_id === v);
    if (!l) return;
    const shift = lookups?.shifts.find((s) => s.id === l.shift_id);
    set({
      staffing_plan_id: l.plan_id,
      department_id: l.department_id ?? form.department_id,
      position_id: form.position_id && roleLineIds.has(l.plan_id) ? form.position_id : l.position_id ?? form.position_id,
      shift_id: l.shift_id ?? null,
      shift_label: l.shiftLabel === "Any shift" ? (shift?.name ?? null) : l.shiftLabel,
      employment_type: l.employment_type ?? form.employment_type,
    });
  };

  const submit = (status: string) => {
    const shift = lookups?.shifts.find((s) => s.id === form.shift_id);
    const lineLabel = matrix.rows.find((r) => r.plan_id === form.staffing_plan_id)?.shiftLabel;
    save.mutate(
      {
        ...form,
        status,
        shift_label: (lineLabel && lineLabel !== "Any shift" ? lineLabel : null) ?? shift?.name ?? (form.shift_label || null),
        editReason,
      } as any,
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const canSave = form.department_id && form.position_id && form.number_required > 0 && (!askReason || editReason.trim())
    && (!needsLine || !!form.staffing_plan_id);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={form.id ? "Edit hiring requirement" : "Create hiring requirement"}
      description={`Raised on ${formatIstDate((initial as any)?.requested_at ?? (initial as any)?.created_at ?? istToday())}. Once approved it can be sent to recruitment as an opening.`}
      contentClassName="md:max-w-3xl"
      focusContainer
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => submit(form.id ? (initial?.status ?? "draft") : "draft")}
            disabled={!canSave || save.isPending}
          >
            {form.id ? "Save changes" : "Save as draft"}
          </Button>
          {defaultSubmitForApproval && (!form.id || initial?.status === "draft") && (
            <Button
              onClick={() => submit("pending_approval")}
              disabled={!canSave || save.isPending}
            >
              {save.isPending ? "Saving..." : "Submit for approval"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {limited && (
          <p className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
            This requirement is approved. You can change the number, target date, salary range, skills and note — with a reason.
            Other fields are locked.
          </p>
        )}
        <div className="space-y-1">
          <Label>For staffing line</Label>
          <Select value={form.staffing_plan_id ?? (needsLine ? "" : "none")} onValueChange={pickLine}>
            <SelectTrigger className="text-foreground"><SelectValue placeholder="Pick the staffing line" /></SelectTrigger>
            <SelectContent>
              {!needsLine && !limited && <SelectItem value="none">Not part of a staffing line</SelectItem>}
              {lineChoices.map((l) => (
                <SelectItem key={l.plan_id} value={l.plan_id}>
                  {l.department_name ?? "Department"} · {l.position_title ?? "Designation"} · {l.shiftLabel} — {l.required_hc} required, {l.current_hc} on roll
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {needsLine && !form.staffing_plan_id && (
            <p className="text-xs text-destructive">This designation has staffing lines — pick the one this requirement is for. The shift comes from the line.</p>
          )}
          {becomesManual && (
            <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
              This is an automatic request. Saving this change turns it into a manual request, so the system stops resizing it.
              If you lower the number, automatic requests on this line pause for the part you removed (shown on the line, with "Raise again").
            </p>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Basic details</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Department</Label>
              <Select
                disabled={limited} value={form.department_id}
                onValueChange={(v) => set({ department_id: v, position_id: "" })}
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
              <Label>Designation</Label>
              <Select
                disabled={limited} value={form.position_id}
                onValueChange={(v) => set({ position_id: v })}
              >
                <SelectTrigger className="text-foreground">
                  <SelectValue placeholder="Select designation" />
                </SelectTrigger>
                <SelectContent>
                  {positions.map((p) => {
                    // Roles in planning with no staffing line can't be hired for yet (the database refuses too).
                    const blocked = roleBlocksHiring(planning?.get(p.id)?.status) && p.id !== initial?.position_id;
                    return (
                      <SelectItem key={p.id} value={p.id} disabled={blocked} title={blocked ? ROLE_NOT_PLANNED_MESSAGE(p.title) : undefined}>
                        {p.title}{blocked ? " · Plan first" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Shift</Label>
              <Select
                disabled={limited || !!form.staffing_plan_id} value={form.shift_id ?? "none"}
                onValueChange={(v) => set({ shift_id: v === "none" ? null : v })}
              >
                <SelectTrigger className="text-foreground">
                  <SelectValue placeholder="Any shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not shift specific</SelectItem>
                  {planningShifts(lookups?.shifts || []).map((s) => (
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
                disabled={limited} value={form.employment_type ? normEmploymentType(form.employment_type) : "none"}
                onValueChange={(v) => set({ employment_type: v === "none" ? null : v })}
              >
                <SelectTrigger className="text-foreground">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Number required</Label>
                <Input
                  type="number"
                  min={1}
                  className="text-foreground"
                  value={form.number_required}
                  onChange={(e) =>
                    set({ number_required: Number(e.target.value) || 1 })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Target joining</Label>
                <Input
                  type="date"
                  className="text-foreground"
                  value={form.target_joining_date ?? ""}
                  onChange={(e) =>
                    set({ target_joining_date: e.target.value || null })
                  }
                />
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Business requirement</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Reason</Label>
              <Select disabled={limited} value={form.reason} onValueChange={(v) => set({ reason: v })}>
                <SelectTrigger className="text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HIRING_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Replacement for employee</Label>
              <Select
                disabled={limited} value={form.replacement_employee_id ?? "none"}
                onValueChange={(v) =>
                  set({
                    replacement_employee_id: v === "none" ? null : v,
                    reason: v === "none" ? form.reason : "replacement",
                  })
                }
              >
                <SelectTrigger className="text-foreground">
                  <SelectValue placeholder="Not a replacement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not a replacement</SelectItem>
                  {(employees as any[]).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.badge_id ? `${e.badge_id} — ` : ""}
                      {[e.first_name, e.last_name].filter(Boolean).join(" ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label>Required skills</Label>
              <Textarea
                className="text-foreground"
                rows={2}
                value={form.required_skills ?? ""}
                onChange={(e) => set({ required_skills: e.target.value || null })}
              />
            </div>

            <div className="space-y-1">
              <Label>Experience required</Label>
              <Input
                className="text-foreground"
                disabled={limited} value={form.experience_required ?? ""}
                onChange={(e) =>
                  set({ experience_required: e.target.value || null })
                }
                placeholder="e.g. 2–4 years"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Monthly salary from (₹)</Label>
                <Input
                  type="number"
                  className="text-foreground"
                  value={form.salary_min ?? ""}
                  onChange={(e) =>
                    set({
                      salary_min: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Monthly salary to (₹)</Label>
                <Input
                  type="number"
                  className="text-foreground"
                  value={form.salary_max ?? ""}
                  onChange={(e) =>
                    set({
                      salary_max: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label>Reason note</Label>
              <Textarea
                className="text-foreground"
                rows={2}
                disabled={limited} value={form.reason_notes ?? ""}
                onChange={(e) => set({ reason_notes: e.target.value || null })}
              />
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Approval</p>
          <p className="mb-2 text-xs text-muted-foreground">Any HRMS manager can approve. "Raised by" is recorded automatically.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {askReason && (
              <div className="space-y-1 sm:col-span-2">
                <Label>Reason for this change (required)</Label>
                <Input className="text-foreground" value={editReason} onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Why the approved requirement is changing" />
              </div>
            )}
            {form.staffing_plan_id && matrix.rows.find((r) => r.plan_id === form.staffing_plan_id) ? (
              <div className="space-y-1">
                <Label>Priority</Label>
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                  {linePriorityText(matrix.rows.find((r) => r.plan_id === form.staffing_plan_id)!)}
                </p>
                <p className="text-xs text-muted-foreground">Requests on a staffing line take the line's priority.</p>
              </div>
            ) : (
            <div className="space-y-1">
              <Label>Priority</Label>
              <Select disabled={limited} value={form.priority} onValueChange={(v) => set({ priority: v })}>
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
            )}
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
        </div>
      </div>
    </ResponsiveDialog>
  );
}
