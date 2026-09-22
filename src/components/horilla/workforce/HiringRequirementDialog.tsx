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
  EMPLOYMENT_TYPES,
  HIRING_REASONS,
  PRIORITIES,
  PRIORITY_LABEL,
  formatIstDate,
  istToday,
} from "@/lib/hrms/workforce";
import {
  useSaveHiringRequirement,
  useWorkforceLookups,
  type HiringRequirementInput,
} from "@/hooks/hrms/useWorkforcePlanning";

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
  approver_name: null,
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
  const save = useSaveHiringRequirement();
  const [form, setForm] = useState<HiringRequirementInput & { id?: string }>(BLANK);

  useEffect(() => {
    if (open) setForm({ ...BLANK, ...initial });
  }, [open, initial]);

  const set = (patch: Partial<HiringRequirementInput>) =>
    setForm((f) => ({ ...f, ...patch }));

  const positions = (lookups?.positions || []).filter(
    (p) => !form.department_id || !p.department_id || p.department_id === form.department_id,
  );

  const submit = (status: string) => {
    const shift = lookups?.shifts.find((s) => s.id === form.shift_id);
    save.mutate(
      {
        ...form,
        status,
        shift_label: shift?.name ?? form.shift_label ?? null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const canSave = form.department_id && form.position_id && form.number_required > 0;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={form.id ? "Edit hiring requirement" : "Create hiring requirement"}
      description={`Raised on ${formatIstDate(istToday())}. Once approved it can be sent to recruitment as an opening.`}
      contentClassName="max-w-3xl"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => submit("draft")}
            disabled={!canSave || save.isPending}
          >
            Save as draft
          </Button>
          {defaultSubmitForApproval && (
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
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Basic details</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Department</Label>
              <Select
                value={form.department_id}
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
              <Label>Position</Label>
              <Select
                value={form.position_id}
                onValueChange={(v) => set({ position_id: v })}
              >
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
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {EMPLOYMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
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
              <Select value={form.reason} onValueChange={(v) => set({ reason: v })}>
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
                value={form.replacement_employee_id ?? "none"}
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
                  {(lookups?.employees || []).map((e: any) => (
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
                value={form.experience_required ?? ""}
                onChange={(e) =>
                  set({ experience_required: e.target.value || null })
                }
                placeholder="e.g. 2–4 years"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Salary from</Label>
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
                <Label>Salary to</Label>
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
                value={form.reason_notes ?? ""}
                onChange={(e) => set({ reason_notes: e.target.value || null })}
              />
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Approval</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Approving manager</Label>
              <Input
                className="text-foreground"
                value={form.approver_name ?? ""}
                onChange={(e) => set({ approver_name: e.target.value || null })}
                placeholder="Who should approve this"
              />
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
