import { useOverdueJoiners } from "@/hooks/hrms/useWorkforceTiming";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Armchair, ExternalLink, GraduationCap, PauseCircle, Plus, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusPill } from "@/components/ats/AtsUi";
import { cn } from "@/lib/utils";
import {
  PRIORITIES, PRIORITY_LABEL, REQ_STATUS_LABEL, REQ_STATUS_TONE, linePriorityText,
  formatIstDate, gapLabel, gapTone, pauseText, planningShifts, rotaOrder, trainingEnded, type StaffingDerived,
} from "@/lib/hrms/workforce";
import { OPEN_REQ_STATUSES, linesForRole, useMoveRequirement, useResumeAutoHiring } from "@/hooks/hrms/useWorkforceRepair";
import { useRequirementTransition } from "@/hooks/hrms/useWorkforcePlanning";
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

function Stat({ label, value, tone, sub }: { label: string; value: React.ReactNode; tone?: string; sub?: string }) {
  return (
    <div className="bg-card px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums leading-tight", tone ?? "text-foreground")}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Line status for the header: trainees and hires that cover the gap are not "short". */
function lineStatus(line: StaffingDerived): { tone: "destructive" | "success" | "warning" | "primary" | "neutral"; text: string } {
  if (line.required_hc === 0 && line.current_hc === 0) return { tone: "neutral", text: "Not staffed in this shift" };
  if (line.staffingGap > 0 && line.netHiringRequirement === 0) return { tone: "primary", text: `${gapLabel(line.staffingGap)} · covered by people on the way` };
  const t = gapTone(line.staffingGap);
  return { tone: t === "short" ? "destructive" : t === "over" ? "warning" : "success", text: gapLabel(line.staffingGap) };
}

export function LinePanel({ line, roleLabel, canManage, onOpenChange, onHire }: Props) {
  const open = !!line;
  const { data: plans = [] } = useHeadcountPlans();
  const { data: seats = [] } = useSeatCapacity();
  const { data: lookups } = useWorkforceLookups();
  const { data: requirements = [] } = useHiringRequirements();
  const people = useLinePeople(line?.plan_id);
  const overdueJoiners = useOverdueJoiners();
  const planIdForOverdue = line?.plan_id ?? null;
  const save = useSaveHeadcountPlan();
  const remove = useDeleteHeadcountPlan();
  const setPostShift = useSetPostTrainingShift();
  const [tab, setTab] = useState("summary");

  const plan: any = useMemo(() => (plans as any[]).find((p) => p.id === line?.plan_id), [plans, line?.plan_id]);
  // The desk count the database uses: operational capacity, 0 when the desk group is inactive.
  const deskCount = Number(line?.operational_capacity ?? 0) || 0;
  const seatInactive = !!line?.seat_capacity_id && line?.seat_active === false;
  const resume = useResumeAutoHiring();
  const move = useMoveRequirement();
  const transition = useRequirementTransition();
  const [moveTo, setMoveTo] = useState<Record<string, string>>({});
  // Priority is automatic unless HR pins it ("Always …"); saving "auto" sends null.
  const autoPriority: string | null = line?.priority_auto ?? null;
  const hasAuto = true;

  const [form, setForm] = useState({ required: 0, approved: 0, follow: false, target: "", priority: "medium", reason: "",
    shift: "any", seat: "none", roles: [] as string[] });
  const [pendingUnfollow, setPendingUnfollow] = useState<null | { key: "required"; value: number }>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeReason, setRemoveReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const lineRoles = (p: any): string[] => (p?.eligible_position_ids?.length ? p.eligible_position_ids : p?.position_id ? [p.position_id] : []);
  const lineShift = (p: any): string => p?.shift_id ?? p?.eligible_shift_ids?.[0] ?? "any";
  const initialPriority = (l: StaffingDerived) => l.priority_pinned ?? "auto";
  // Reset only when another line is opened — never on a background refetch.
  const planKey = line?.plan_id && plan ? line.plan_id : null;
  useEffect(() => {
    if (!line || !plan) return;
    setError(null);
    setMoveTo({});
    setTab("summary");
    setForm({
      required: line.required_hc,
      approved: line.approved_hc,
      follow: line.follow_desks,
      target: line.target_date ?? "",
      priority: initialPriority(line),
      reason: "",
      shift: lineShift(plan),
      seat: plan.seat_capacity_id ?? "none",
      roles: lineRoles(plan),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  const lineReqs = useMemo(
    () => (requirements as any[]).filter((r) => r.staffing_plan_id === line?.plan_id)
      .sort((a, b) => Number(OPEN.has(b.status)) - Number(OPEN.has(a.status))),
    [requirements, line?.plan_id],
  );
  const onRoll = (people.data || []).filter((p) => p.kind === "on_roll");
  const trainees = (people.data || []).filter((p) => p.kind === "trainee");
  const lateHere = (overdueJoiners.data || []).filter((j) => j.plan_id === planIdForOverdue);
  const shifts = rotaOrder(planningShifts((lookups?.shifts || []) as any[]));
  const positionTitle = (id: string) => ((lookups?.positions || []) as any[]).find((p) => p.id === id)?.title ?? "Designation";

  const scopeChanged = !!plan && (form.shift !== lineShift(plan) || form.seat !== (plan.seat_capacity_id ?? "none")
    || [...form.roles].sort().join() !== [...lineRoles(plan)].sort().join());
  // Desks of the desk group picked in the form (the database count for the current one; operational ?? physical otherwise).
  const chosenSeat: any = form.seat === "none" ? null : (seats as any[]).find((x) => x.id === form.seat);
  const chosenDesks = form.seat === (plan?.seat_capacity_id ?? "none") ? deskCount
    : chosenSeat ? (chosenSeat.is_active === false ? 0 : Number(chosenSeat.max_operational_capacity ?? chosenSeat.physical_seats ?? 0)) : 0;
  const deptSeats = (seats as any[]).filter((s) => s.department_id === plan?.department_id && !s.is_training_only);
  const deptRoles = ((lookups?.positions || []) as any[]).filter((p) => p.department_id === plan?.department_id && p.in_workforce_planning !== false);
  const addableRoles = deptRoles.filter((p) => !form.roles.includes(p.id));
  const openLineReqs = (requirements as any[]).filter((r) => r.staffing_plan_id === line?.plan_id && OPEN_REQ_STATUSES.includes(r.status));
  const dirty =
    !!line &&
    (scopeChanged || form.required !== line.required_hc ||
      form.follow !== line.follow_desks ||
      (form.target || null) !== (line.target_date || null) ||
      form.priority !== initialPriority(line));

  const editNumber = (key: "required", value: number) => {
    if (form.follow) setPendingUnfollow({ key, value });
    else setForm((f) => ({ ...f, [key]: value }));
  };

  const submit = () => {
    if (!line || !plan) return;
    setError(null);
    const seatId = form.seat === "none" ? null : form.seat;
    const following = form.follow && !!seatId;
    if (!form.roles.length) { setError("Pick at least one designation for this line."); return; }
    const shiftSame = form.shift === lineShift(plan);
    const primary = form.roles.includes(plan.position_id) ? plan.position_id : form.roles[0];
    save.mutate(
      {
        id: plan.id,
        department_id: plan.department_id,
        position_id: primary,
        // Keep the stored role list when the roles didn't change (a single-role list stays as stored — no empty rewrite).
        eligible_position_ids: [...form.roles].sort().join() === [...lineRoles(plan)].sort().join()
          ? (plan.eligible_position_ids ?? [])
          : form.roles.length > 1 ? [primary, ...form.roles.filter((r) => r !== primary)] : [],
        shift_id: shiftSame ? plan.shift_id : form.shift === "any" ? null : form.shift,
        eligible_shift_ids: shiftSame ? plan.eligible_shift_ids || [] : [],
        shift_label: shiftSame ? plan.shift_label : (shifts as any[]).find((x) => x.id === form.shift)?.name ?? null,
        location: plan.location,
        employment_type: plan.employment_type,
        // "Approved" is not shown any more: it follows Required whenever Required changes, and otherwise stays as stored
        // (it is part of the line's signature, so changing it alone would lift a hold-back).
        approved_hc: following ? chosenDesks : form.required !== line.required_hc ? form.required : line.approved_hc,
        required_hc: following ? chosenDesks : form.required,
        target_date: form.target || null,
        priority: (form.priority === "auto" ? null : form.priority) as any, // null = automatic
        notes: form.reason.trim(),
        seat_capacity_id: seatId,
        follow_desks: following,
      },
      { onError: (e: any) => setError(e?.message || "Could not save"), onSuccess: () => setForm((f) => ({ ...f, reason: "" })) },
    );
  };

  const status = line ? lineStatus(line) : null;
  const openCount = lineReqs.filter((r) => OPEN.has(r.status)).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg"
        onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement | null)?.focus?.(); }} tabIndex={-1}>
        {line && status && (
          <>
            <SheetHeader className="space-y-1 border-b border-border px-5 py-4 text-left">
              <SheetTitle className="pr-6 text-lg leading-tight">{roleLabel}</SheetTitle>
              <SheetDescription className="text-sm">
                {line.department_name} · {line.shiftLabel}
              </SheetDescription>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <StatusPill tone={status.tone}>{status.text}</StatusPill>
                {line.seat_capacity_id ? (
                  <StatusPill tone="neutral" icon={Armchair}>{deskCount} desk{deskCount === 1 ? "" : "s"}{line.follow_desks ? " · followed" : ""}</StatusPill>
                ) : (
                  <StatusPill tone="neutral">No desk group</StatusPill>
                )}
                <StatusPill tone={line.priority === "critical" ? "destructive" : line.priority === "high" ? "warning" : "neutral"}>
                  {PRIORITY_LABEL[line.priority] ?? line.priority} priority{hasAuto && !line.priority_pinned ? " (automatic)" : hasAuto ? " (set by HR)" : ""}
                </StatusPill>
              </div>
            </SheetHeader>

            <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col">
              <div className="px-5 pt-3">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="people">People{people.data ? ` (${onRoll.length + trainees.length})` : ""}</TabsTrigger>
                <TabsTrigger value="requests">Requests{openCount ? ` (${openCount})` : ""}</TabsTrigger>
                {canManage && plan && <TabsTrigger value="edit">Edit</TabsTrigger>}
              </TabsList>
              </div>

              <TabsContent value="summary" className="mt-0 space-y-4 px-5 py-4">
                {pauseText(line) && (
                  <div className="flex flex-wrap items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
                    <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <p className="min-w-0 flex-1">{pauseText(line)}</p>
                    {canManage && (
                      <Button size="sm" variant="outline" disabled={resume.isPending} onClick={() => resume.mutate(line.plan_id)}>
                        {resume.isPending ? "Raising..." : "Raise again"}
                      </Button>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-px overflow-hidden rounded-lg border border-border bg-border">
                  <Stat label="On roll" value={`${line.current_hc} / ${line.required_hc}`} sub="of required" />
                  <Stat label="In training" value={line.in_training_hc} sub={line.training_ready_date ? `ready ${formatIstDate(line.training_ready_date)}` : undefined} />
                  <Stat label="Joining" value={line.selected_hc + line.pending_joining_hc} sub={line.selected_hc ? `${line.selected_hc} without a date` : undefined} />
                  <Stat label="Still to find" value={line.netHiringRequirement} tone={line.netHiringRequirement > 0 ? "text-destructive" : undefined} />
                  <Stat label="In hiring" value={line.open_requirement_hc} sub={line.over_requested_hc > 0 ? `${line.over_requested_hc} over-requested` : undefined}
                    tone={line.over_requested_hc > 0 ? "text-warning" : undefined} />
                  <Stat label="Candidates" value={line.pipeline_hc} />
                </div>
                {(() => {
                  const open = lineReqs.filter((r: any) => OPEN.has(r.status) && r.status !== "draft" && r.target_joining_date)
                    .map((r: any) => r.target_joining_date as string).sort();
                  const target = line.target_date ?? open[0];
                  return target ? (
                    <p className="text-xs text-muted-foreground">
                      Target joining {formatIstDate(target)}{line.target_date ? "" : " (earliest open request)"}
                    </p>
                  ) : null;
                })()}
                {lineReqs.some((r: any) => r.status === "draft") && line.uncoveredHiringRequirement > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-sm text-foreground">A draft request is waiting on this line — finish and send it instead of raising another.</p>
                    <Button variant="outline" className="w-full" onClick={() => setTab("requests")}>Open the draft</Button>
                  </div>
                ) : line.uncoveredHiringRequirement > 0 ? (
                  canManage ? (
                    <Button className="w-full" onClick={() => onHire(line)}>
                      <UserPlus className="h-4 w-4" /> Request {line.uncoveredHiringRequirement} for this line
                    </Button>
                  ) : (
                    <p className="text-sm text-warning">{line.uncoveredHiringRequirement} still to find, not requested yet.</p>
                  )
                ) : line.netHiringRequirement > 0 ? (
                  <p className="text-xs text-muted-foreground">Everyone still to find is in an open hiring request.</p>
                ) : null}
                {hasAuto && line.priority_why && (
                  <p className="text-xs text-muted-foreground">Priority: {linePriorityText(line)}</p>
                )}
                {lateHere.length > 0 && (
                  <p className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-foreground">
                    {lateHere.length} joining, overdue: {lateHere.map((j) => `${j.full_name || "Unnamed"} (due ${formatIstDate(j.date_of_joining)})`).join(", ")} — still counted as joining.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="people" className="mt-0 space-y-4 px-5 py-4">
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">On roll</h3>
                  {people.isLoading ? (
                    <Skeleton className="h-16 w-full" />
                  ) : people.isError ? (
                    <p className="text-sm text-destructive">Couldn't load the people on this line.</p>
                  ) : onRoll.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nobody is on roll on this line yet.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {onRoll.map((p) => (
                        <li key={p.employee_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-foreground">{p.full_name || "Unnamed"}</span>
                            {p.badge_id && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground" title="Badge ID">ID {p.badge_id}</span>}
                          </span>
                          {p.on_notice && (
                            <StatusPill tone="warning">On notice{p.last_working_day ? ` · last day ${formatIstDate(p.last_working_day)}` : ""}</StatusPill>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                {trainees.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <GraduationCap className="h-4 w-4 text-primary" /> In training for this line
                    </h3>
                    <ul className="space-y-2">
                      {trainees.map((t) => (
                        <li key={t.employee_id} className="rounded-lg border border-border p-3 text-sm">
                          <p className="flex flex-wrap items-center gap-2 text-foreground">
                            {t.full_name || "Unnamed"}
                            {t.badge_id && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground" title="Badge ID">ID {t.badge_id}</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">{trainingEnded(t.ready_date) ? <span className="text-warning">Training ended {formatIstDate(t.ready_date)} — move them to their working shift</span> : <>Ready {formatIstDate(t.ready_date)}</>}</p>
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
              </TabsContent>

              <TabsContent value="requests" className="mt-0 space-y-2 px-5 py-4">
                {lineReqs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hiring requests on this line.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {lineReqs.map((r) => (
                      <li key={r.id}>
                        <Link
                          to={`/hrms/workforce-planning/hiring-requirements?req=${r.id}`}
                          className={cn("flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none", !OPEN.has(r.status) && "opacity-60")}
                        >
                          <span className="font-mono text-xs text-muted-foreground">{r.requirement_no}</span>
                          <StatusPill tone={REQ_STATUS_TONE[r.status] ?? "neutral"}>{REQ_STATUS_LABEL[r.status] ?? r.status}</StatusPill>
                          <span className="tabular-nums text-foreground">{r.positions_filled ?? 0} of {r.number_required} filled</span>
                          <span className="ml-auto text-xs text-muted-foreground">{r.target_joining_date ? `target ${formatIstDate(r.target_joining_date)}` : "no target date"}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              {canManage && plan && (
                <TabsContent value="edit" className="mt-0 space-y-4 px-5 py-4">
                  {error && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                    </div>
                  )}
                  <section className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Numbers</h3>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">Follow desks</p>
                        <p className="text-xs text-muted-foreground">
                          {form.seat === "none" ? "Pick a desk group below to follow its desk count."
                            : seatInactive ? "The desk group is inactive, so this line follows 0 desks until it is reactivated or you pick another group."
                            : `Required stays equal to the desk group (${chosenDesks}).`}
                        </p>
                      </div>
                      <Switch checked={form.follow && form.seat !== "none"} disabled={form.seat === "none"} onCheckedChange={(v) => setForm((f) => ({ ...f, follow: v }))}
                        aria-label="Follow desks" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lp-required">Required</Label>
                      <Input id="lp-required" type="number" min={0} className="text-foreground" value={form.follow && form.seat !== "none" ? chosenDesks : form.required}
                        onChange={(e) => editNumber("required", Math.max(0, Number(e.target.value) || 0))} />
                    </div>
                  </section>

                  <section className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who and when</h3>
                    <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3">
                      <div className="space-y-1">
                        <Label>Planning shift</Label>
                        <Select value={form.shift} onValueChange={(v) => setForm((f) => ({ ...f, shift: v }))}>
                          <SelectTrigger className="text-foreground" aria-label="Planning shift"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Any shift</SelectItem>
                            {shifts.map((x: any) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
                            {form.shift !== "any" && !shifts.some((x: any) => x.id === form.shift) && <SelectItem value={form.shift}>{line.shiftLabel}</SelectItem>}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Desk group</Label>
                        <Select value={form.seat} onValueChange={(v) => setForm((f) => ({ ...f, seat: v, follow: v === "none" ? false : f.follow }))}>
                          <SelectTrigger className="text-foreground" aria-label="Desk group"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No desk group</SelectItem>
                            {deptSeats.map((x: any) => (
                              <SelectItem key={x.id} value={x.id}>{x.positions?.title || "Desks"} · {x.max_operational_capacity ?? x.physical_seats} desks</SelectItem>
                            ))}
                            {form.seat !== "none" && !deptSeats.some((x: any) => x.id === form.seat) && <SelectItem value={form.seat}>Inactive desk group</SelectItem>}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="lp-target">Target date</Label>
                        <Input id="lp-target" type="date" className="text-foreground" value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label>Priority</Label>
                        <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                          <SelectTrigger className="text-foreground" aria-label="Priority"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">{autoPriority ? `Automatic (now ${PRIORITY_LABEL[autoPriority] ?? autoPriority})` : "Automatic"}</SelectItem>
                            {PRIORITIES.map((p) => <SelectItem key={p} value={p}>Always {PRIORITY_LABEL[p].toLowerCase()}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Designations on this line</Label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {form.roles.map((id) => (
                          <span key={id} className="inline-flex h-7 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 pl-2.5 pr-1 text-xs text-foreground">
                            {positionTitle(id)}
                            <button type="button" aria-label={`Remove ${positionTitle(id)} from this line`} disabled={form.roles.length === 1}
                              onClick={() => setForm((f) => ({ ...f, roles: f.roles.filter((r) => r !== id) }))}
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                        {addableRoles.length > 0 && (
                          <Select value="" onValueChange={(v) => v && setForm((f) => ({ ...f, roles: [...f.roles, v] }))}>
                            <SelectTrigger className="h-7 w-auto gap-1 rounded-full border-dashed px-2.5 text-xs text-muted-foreground" aria-label="Share this line with another role">
                              <Plus className="h-3 w-3" /> <SelectValue placeholder="Share with a designation" />
                            </SelectTrigger>
                            <SelectContent>{addableRoles.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent>
                          </Select>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">Designations on one line share one target (for example Payment Operations Associate / Executive). A designation can have one line per shift; the save is refused if this overlaps another line.</p>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <Label htmlFor="lp-reason">Reason for the change</Label>
                    <Textarea id="lp-reason" rows={2} className="text-foreground" placeholder="Saved in the plan history" value={form.reason}
                      onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <p className="text-xs text-muted-foreground">{dirty && !form.reason.trim() ? "Add a reason to save." : dirty ? "Unsaved changes — the line's hiring request resizes by itself after saving." : "No changes"}</p>
                      <Button onClick={submit} disabled={!dirty || !form.reason.trim() || save.isPending}>
                        {save.isPending ? "Saving..." : "Save changes"}
                      </Button>
                    </div>
                  </section>

                  <section className="rounded-lg border border-destructive/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">Remove this line</p>
                        <p className="text-xs text-muted-foreground">Takes it out of the plan. Employee records are not affected.</p>
                      </div>
                      <Button variant="outline" className="text-destructive" onClick={() => { setRemoveReason(""); setRemoveOpen(true); }}>
                        <Trash2 className="h-4 w-4" /> Remove
                      </Button>
                    </div>
                  </section>
                </TabsContent>
              )}
            </Tabs>
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
                    setForm((f) => ({ ...f, follow: false, required: pendingUnfollow.value }));
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
                {openLineReqs.length > 0 && " This line still has open hiring requests — move each to another line or cancel it first."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea rows={2} className="text-foreground" placeholder="Reason" value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} />
            {openLineReqs.length > 0 && (
              <ul className="space-y-2">
                {openLineReqs.map((r: any) => {
                  const targets = linesForRole(plans as any[], r.department_id, r.position_id).filter((p) => p.id !== line?.plan_id);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">{r.requirement_no}</span>
                      <StatusPill tone={REQ_STATUS_TONE[r.status] ?? "neutral"}>{REQ_STATUS_LABEL[r.status] ?? r.status}</StatusPill>
                      <Select value={moveTo[r.id] ?? ""} onValueChange={(v) => setMoveTo((m) => ({ ...m, [r.id]: v }))}>
                        <SelectTrigger className="h-8 w-40 text-foreground"><SelectValue placeholder="Move to line" /></SelectTrigger>
                        <SelectContent>
                          {targets.length === 0 && <SelectItem value="__none" disabled>No other line for this designation</SelectItem>}
                          {targets.map((p: any) => <SelectItem key={p.id} value={p.id}>{(shifts as any[]).find((x) => x.id === p.shift_id)?.name ?? p.shift_label ?? "Any shift"}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" disabled={!moveTo[r.id] || !removeReason.trim() || move.isPending}
                        onClick={() => move.mutate({ id: r.id, planId: moveTo[r.id], reason: removeReason })}>Move</Button>
                      <Button size="sm" variant="outline" className="text-destructive" disabled={!removeReason.trim() || transition.isPending}
                        onClick={() => transition.mutate({ id: r.id, action: "cancel", reason: removeReason })}>Cancel it</Button>
                    </li>
                  );
                })}
              </ul>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Back</AlertDialogCancel>
              <AlertDialogAction
                disabled={!removeReason.trim() || remove.isPending || openLineReqs.length > 0}
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
