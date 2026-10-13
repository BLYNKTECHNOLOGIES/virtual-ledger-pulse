import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ExternalLink, GraduationCap, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  GAP_CHIP_CLASS, PRIORITIES, PRIORITY_LABEL, REQ_STATUS_CLASS, REQ_STATUS_LABEL,
  formatIstDate, gapLabel, gapTone, planningShifts, type StaffingDerived,
} from "@/lib/hrms/workforce";
import {
  useDeleteHeadcountPlan, useHeadcountPlans, useHiringRequirements, useLinePeople,
  useSaveHeadcountPlan, useSeatCapacity, useSetPostTrainingShift, useWorkforceLookups,
} from "@/hooks/hrms/useWorkforcePlanning";

interface Props {
  line: StaffingDerived | null;
  roleLabel: string;
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
  onHire: (line: StaffingDerived) => void;
}

const OPEN = new Set(["draft", "pending_approval", "approved", "recruitment_active", "partially_fulfilled"]);

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${tone ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

export function LinePanel({ line, roleLabel, canManage, onOpenChange, onHire }: Props) {
  const open = !!line;
  const { data: plans = [] } = useHeadcountPlans();
  const { data: seats = [] } = useSeatCapacity();
  const { data: lookups } = useWorkforceLookups();
  const { data: requirements = [] } = useHiringRequirements();
  const people = useLinePeople(line?.plan_id);
  const save = useSaveHeadcountPlan();
  const remove = useDeleteHeadcountPlan();
  const setPostShift = useSetPostTrainingShift();

  const plan: any = useMemo(() => (plans as any[]).find((p) => p.id === line?.plan_id), [plans, line?.plan_id]);
  const seat: any = useMemo(() => (seats as any[]).find((s) => s.id === line?.seat_capacity_id), [seats, line?.seat_capacity_id]);
  const deskCount = seat ? seat.max_operational_capacity || seat.physical_seats || 0 : 0;

  const [form, setForm] = useState({ required: 0, approved: 0, follow: false, target: "", priority: "medium", reason: "" });
  const [pendingUnfollow, setPendingUnfollow] = useState<null | { key: "required" | "approved"; value: number }>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeReason, setRemoveReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!line) return;
    setError(null);
    setForm({
      required: line.required_hc,
      approved: line.approved_hc,
      follow: line.follow_desks,
      target: line.target_date ?? "",
      priority: line.priority || "medium",
      reason: "",
    });
  }, [line]);

  const lineReqs = useMemo(
    () => (requirements as any[]).filter((r) => r.staffing_plan_id === line?.plan_id),
    [requirements, line?.plan_id],
  );
  const onRoll = (people.data || []).filter((p) => p.kind === "on_roll");
  const trainees = (people.data || []).filter((p) => p.kind === "trainee");
  const shifts = planningShifts((lookups?.shifts || []) as any[]);

  const dirty =
    !!line &&
    (form.required !== line.required_hc ||
      form.approved !== line.approved_hc ||
      form.follow !== line.follow_desks ||
      (form.target || null) !== (line.target_date || null) ||
      form.priority !== line.priority);

  const editNumber = (key: "required" | "approved", value: number) => {
    if (form.follow) setPendingUnfollow({ key, value });
    else setForm((f) => ({ ...f, [key]: value }));
  };

  const submit = () => {
    if (!line || !plan) return;
    setError(null);
    const following = form.follow && !!seat;
    save.mutate(
      {
        id: plan.id,
        department_id: plan.department_id,
        position_id: plan.position_id,
        eligible_position_ids: plan.eligible_position_ids || [],
        shift_id: plan.shift_id,
        eligible_shift_ids: plan.eligible_shift_ids || [],
        shift_label: plan.shift_label,
        location: plan.location,
        employment_type: plan.employment_type,
        approved_hc: following ? deskCount : form.approved,
        required_hc: following ? deskCount : form.required,
        target_date: form.target || null,
        priority: form.priority,
        notes: form.reason.trim(),
        seat_capacity_id: plan.seat_capacity_id,
        follow_desks: following,
      },
      { onError: (e: any) => setError(e?.message || "Could not save"), onSuccess: () => setForm((f) => ({ ...f, reason: "" })) },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {line && (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {roleLabel}
                <Badge variant="outline" className={GAP_CHIP_CLASS[gapTone(line.staffingGap)]}>{gapLabel(line.staffingGap)}</Badge>
              </SheetTitle>
              <SheetDescription>
                {line.department_name} · {line.shiftLabel}
                {seat && <> · {seat.physical_seats} desks{line.follow_desks ? " (followed)" : ""}</>}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-5">
              <div className="grid grid-cols-3 gap-2">
                <Stat label="On roll" value={`${line.current_hc} / ${line.required_hc}`} />
                <Stat label="Approved" value={line.approved_hc} />
                <Stat label="Net need" value={line.netHiringRequirement} tone={line.netHiringRequirement > 0 ? "text-destructive" : undefined} />
                <Stat label="Pipeline" value={line.pipeline_hc} />
                <Stat label="Selected" value={line.selected_hc} />
                <Stat label="Joining" value={line.pending_joining_hc} />
                <Stat label="In training" value={line.in_training_hc} />
                <Stat label="Requested" value={line.open_requirement_hc} />
                <Stat label="Over-requested" value={line.over_requested_hc} tone={line.over_requested_hc > 0 ? "text-warning" : undefined} />
              </div>
              {canManage && line.uncoveredHiringRequirement > 0 && (
                <Button className="w-full" onClick={() => onHire(line)}>
                  <UserPlus className="h-4 w-4" /> Hire {line.uncoveredHiringRequirement} for this line
                </Button>
              )}

              {canManage && plan && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Edit line</h3>
                  {error && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5">
                    <div>
                      <p className="text-sm font-medium text-foreground">Follow desks</p>
                      <p className="text-xs text-muted-foreground">
                        {seat ? `Numbers stay equal to the desk group (${deskCount}).` : "This line has no desk group."}
                      </p>
                    </div>
                    <Switch checked={form.follow && !!seat} disabled={!seat} onCheckedChange={(v) => setForm((f) => ({ ...f, follow: v }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Required</Label>
                      <Input type="number" min={0} className="text-foreground" value={form.follow && seat ? deskCount : form.required}
                        onChange={(e) => editNumber("required", Math.max(0, Number(e.target.value) || 0))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Approved</Label>
                      <Input type="number" min={0} className="text-foreground" value={form.follow && seat ? deskCount : form.approved}
                        onChange={(e) => editNumber("approved", Math.max(0, Number(e.target.value) || 0))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Target date</Label>
                      <Input type="date" className="text-foreground" value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Priority</Label>
                      <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                        <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                        <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Reason for the change</Label>
                    <Textarea rows={2} className="text-foreground" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <Button variant="outline" className="text-destructive" onClick={() => { setRemoveReason(""); setRemoveOpen(true); }}>
                      <Trash2 className="h-4 w-4" /> Remove line
                    </Button>
                    <Button onClick={submit} disabled={!dirty || !form.reason.trim() || save.isPending}>
                      {save.isPending ? "Saving..." : "Save changes"}
                    </Button>
                  </div>
                  {dirty && !form.reason.trim() && <p className="text-xs text-muted-foreground">Add a reason to save.</p>}
                </section>
              )}

              <Separator />

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">People on this line</h3>
                {people.isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : people.isError ? (
                  <p className="text-sm text-destructive">Couldn't load the people on this line.</p>
                ) : onRoll.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody is on roll on this line yet.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {onRoll.map((p) => (
                      <li key={p.employee_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate text-foreground">
                          {p.full_name || "Unnamed"}
                          {p.badge_id && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{p.badge_id}</span>}
                        </span>
                        {p.on_notice && (
                          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
                            On notice{p.last_working_day ? ` · last day ${formatIstDate(p.last_working_day)}` : ""}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {trainees.length > 0 && (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <GraduationCap className="h-4 w-4 text-primary" /> Trainees allocated
                  </h3>
                  <ul className="space-y-2">
                    {trainees.map((t) => (
                      <li key={t.employee_id} className="rounded-md border border-border p-2.5 text-sm">
                        <p className="text-foreground">
                          {t.full_name || "Unnamed"}
                          {t.badge_id && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{t.badge_id}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">Ready {formatIstDate(t.ready_date)}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <Label className="shrink-0 text-xs">After training</Label>
                          <Select
                            value={t.post_training_shift_id ?? "none"}
                            disabled={!canManage || setPostShift.isPending}
                            onValueChange={(v) => setPostShift.mutate({ employeeId: t.employee_id, shiftId: v === "none" ? null : v })}
                          >
                            <SelectTrigger className="h-8 text-foreground"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Not set (allocated automatically)</SelectItem>
                              {shifts.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Hiring requirements</h3>
                {lineReqs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No requirement linked to this line.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {lineReqs.map((r) => (
                      <li key={r.id}>
                        <Link
                          to={`/hrms/workforce-planning/hiring-requirements?req=${r.id}`}
                          className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40 ${OPEN.has(r.status) ? "" : "opacity-60"}`}
                        >
                          <span className="font-mono text-xs text-muted-foreground">{r.requirement_no}</span>
                          <span className="tabular-nums text-foreground">{r.positions_filled ?? 0}/{r.number_required}</span>
                          <Badge variant="outline" className={REQ_STATUS_CLASS[r.status]}>{REQ_STATUS_LABEL[r.status] ?? r.status}</Badge>
                          <span className="ml-auto text-xs text-muted-foreground">{formatIstDate(r.target_joining_date)}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Open requirement" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}

        <AlertDialog open={!!pendingUnfollow} onOpenChange={(o) => !o && setPendingUnfollow(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Stop following desks?</AlertDialogTitle>
              <AlertDialogDescription>
                This line's numbers are locked to its desk group. Typing your own number switches "follow desks" off, so later desk changes won't update this line.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep following</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (pendingUnfollow)
                    setForm((f) => ({ ...f, follow: false, required: deskCount, approved: deskCount, [pendingUnfollow.key]: pendingUnfollow.value }));
                  setPendingUnfollow(null);
                }}
              >
                Switch off and edit
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this staffing line?</AlertDialogTitle>
              <AlertDialogDescription>
                {roleLabel} · {line?.shiftLabel} leaves the plan. Employee records are not affected. Give a reason for the history.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea rows={2} className="text-foreground" value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={!removeReason.trim() || remove.isPending}
                onClick={() => {
                  if (!line) return;
                  remove.mutate({ id: line.plan_id, reason: removeReason.trim() }, { onSuccess: () => onOpenChange(false) });
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
