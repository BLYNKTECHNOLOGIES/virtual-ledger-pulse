import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Armchair, CheckCircle2, ChevronDown, ClipboardList, LayoutGrid, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { ATTENTION_STEP, chainStep } from "@/lib/hrms/workforceChain";
import { formatIstDate, istNextDay, type StaffingDerived } from "@/lib/hrms/workforce";
import type { AlertScope } from "@/hooks/hrms/useWorkforceAlerts";
import { useWorkforceLookups, type TraineeRow } from "@/hooks/hrms/useWorkforcePlanning";
import { useMoveAfterTraining } from "@/hooks/hrms/useWorkforceTiming";
import { useResumeAutoHiring } from "@/hooks/hrms/useWorkforceRepair";
import {
  useWorkforceAttention, type AttentionAction, type AttentionGroup, type AttentionSeverity, type AttentionTopic,
} from "@/hooks/hrms/useWorkforceAttention";

interface Props {
  rows: StaffingDerived[];
  canManage: boolean;
  scope?: AlertScope;
  shiftFiltered?: boolean;
  /** The shift filter's label ("all" or a shift name). */
  shift?: string;
  /** Only these kinds of items (e.g. desks on Capacity & Seats). */
  topics?: AttentionTopic[];
  /** "compact" = one summary bar that opens the list (pages where the grid comes first). */
  variant?: "full" | "compact";
  /** Two columns of topics on wide screens. */
  columns?: 1 | 2;
  onOpenLine?: (planId: string) => void;
  onOpenRequirement?: (reqId: string) => void;
  /** Approve / reject a pending request here; without them the request's details open instead. */
  onApprove?: (req: any) => void;
  onReject?: (req: any) => void;
  onPlanDesks?: (seat: any) => void;
  className?: string;
}

const DOT: Record<AttentionSeverity, string> = { high: "bg-destructive", medium: "bg-warning", low: "bg-muted-foreground/40" };
const TOPIC_ICON = { hiring: ClipboardList, people: Users, desks: Armchair, plan: LayoutGrid } as const;
const SHOW = 6;

/** The one list of things HR has to act on: approvals, jobs, joiners, desks, plan gaps. */
export function WorkforceAttention({
  rows, canManage, scope, shiftFiltered, shift, topics, variant = "full", columns = 1, onOpenLine, onOpenRequirement, onApprove, onReject, onPlanDesks, className,
}: Props) {
  const navigate = useNavigate();
  const a = useWorkforceAttention(rows, { scope, shiftFiltered, shift, canManage });
  const groups = topics ? a.groups.filter((g) => topics.includes(g.topic)) : a.groups;
  // Count topics, not items: 19 roles to decide is one thing to do, not 19.
  const actionable = groups.filter((g) => g.severity !== "low").length;
  const urgent = groups.filter((g) => g.severity === "high").length;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState(variant === "full");
  const [moving, setMoving] = useState<TraineeRow | null>(null);
  const resume = useResumeAutoHiring();

  const run = (x: AttentionAction) => {
    switch (x.kind) {
      case "line": return onOpenLine ? onOpenLine(x.planId) : navigate(`/hrms/workforce-planning/staffing-plan?line=${x.planId}`);
      case "requirement": return onOpenRequirement ? onOpenRequirement(x.reqId) : navigate(`/hrms/workforce-planning/hiring-requirements?req=${x.reqId}`);
      case "approve": return onApprove ? onApprove(x.req) : navigate(`/hrms/workforce-planning/hiring-requirements?req=${x.req.id}`);
      case "reject": return onReject ? onReject(x.req) : navigate(`/hrms/workforce-planning/hiring-requirements?req=${x.req.id}`);
      case "link": return navigate(x.to);
      case "plan-desks": return onPlanDesks ? onPlanDesks(x.seat) : navigate(`/hrms/workforce-planning/staffing-plan?plan_desk=${x.seat.id}`);
      case "move-training": return setMoving(x.trainee);
      case "resume": return resume.mutate(x.planId);
    }
  };

  if (a.loading && variant === "compact") return null;
  if (variant === "compact" && groups.length === 0) return null;

  const isOpen = (g: AttentionGroup) => !!open[g.key] || groups.length === 1;
  // In two columns an opened topic spans both, so its neighbour doesn't stretch into an empty box.
  const cells = groups.reduce((n, g) => n + (isOpen(g) ? 2 : 1), 0);
  const list = (
    <ul className={cn(columns === 2 ? "grid grid-flow-row-dense grid-cols-1 gap-px overflow-hidden rounded-b-xl bg-border lg:grid-cols-2" : "divide-y divide-border")}>
      {groups.map((g) => (
        <GroupRow key={g.key} g={g} open={isOpen(g)} wide={columns === 2 && isOpen(g)} onToggle={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}
          run={run} busy={resume.isPending} />
      ))}
      {columns === 2 && cells % 2 === 1 && <li aria-hidden className="hidden bg-card lg:block" />}
    </ul>
  );

  return (
    <section className={cn("rounded-xl border border-border bg-card", className)} aria-label="Needs attention">
      {variant === "compact" ? (
        <button type="button" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <AlertTriangle className={cn("h-4 w-4 shrink-0", actionable ? "text-warning" : "text-muted-foreground")} aria-hidden />
          <span className="min-w-0 flex-1 text-sm">
            <span className="font-medium text-foreground">{actionable ? `${actionable} ${actionable === 1 ? "thing needs" : "things need"} attention` : "Notes on the plan"}</span>
            {urgent > 0 && <span className="ml-1.5 text-xs font-medium text-destructive">{urgent} urgent</span>}
            <span className="ml-2 hidden text-muted-foreground sm:inline">{groups.slice(0, 3).map((g) => g.title).join(" · ")}{groups.length > 3 ? " …" : ""}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden />
        </button>
      ) : (
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="font-display text-[15px] font-semibold text-foreground">Needs attention</h2>
          {!a.loading && groups.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {urgent} urgent · {groups.length} in all
            </span>
          )}
        </header>
      )}
      {(variant === "full" || expanded) && (
        a.loading ? (
          <div className="space-y-2 p-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-2/3" /></div>
        ) : groups.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> Nothing needs attention right now.
          </div>
        ) : (
          <div className={cn(variant === "compact" && "border-t border-border")}>{list}</div>
        )
      )}
      {a.error && (variant === "full" || expanded) && (
        <p className="border-t border-border px-4 py-2 text-xs text-destructive">Some checks couldn't load; the list may be incomplete.</p>
      )}
      <MoveAfterTrainingDialog trainee={moving} onClose={() => setMoving(null)} />
    </section>
  );
}

function GroupRow({ g, open, wide, onToggle, run, busy }: { g: AttentionGroup; open: boolean; wide?: boolean; onToggle: () => void; run: (x: AttentionAction) => void; busy: boolean }) {
  const [all, setAll] = useState(false);
  const Icon = TOPIC_ICON[g.topic];
  const items = all ? g.items : g.items.slice(0, SHOW);
  return (
    <li className={cn("bg-card", wide && "lg:col-span-2")}>
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="relative mt-0.5 shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className={cn("absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-card", DOT[g.severity])} aria-hidden />
        </span>
        {/* Not a <button>: HRMS phone styles keep button text on one line. */}
        <div role="button" tabIndex={0} onClick={onToggle} aria-expanded={open}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
          className="min-w-0 flex-1 cursor-pointer rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-foreground">{g.title}</span>
            {ATTENTION_STEP[g.key] && (
              <span className="whitespace-nowrap rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground" title="Step of the planning chain">
                Step {chainStep(ATTENTION_STEP[g.key]).n} · {chainStep(ATTENTION_STEP[g.key]).label}
              </span>
            )}
          </span>
          <span className="block text-xs text-muted-foreground">{g.hint}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {g.cta && (
            <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs text-primary">
              <Link to={g.cta.to}>{g.cta.label}</Link>
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onToggle} aria-label={open ? `Hide ${g.title}` : `Show ${g.title}`}>
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
          </Button>
        </div>
      </div>
      {open && (
        <ul className="space-y-1 px-4 pb-3 pl-11">
          {items.map((it) => (
            <li key={it.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md bg-muted/40 px-2.5 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground sm:truncate" title={it.title}>{it.title}</p>
                {it.detail && <p className="text-xs text-muted-foreground">{it.detail}</p>}
              </div>
              {it.actions.length > 0 && (
                <div className="flex shrink-0 flex-wrap gap-1">
                  {it.actions.map((x) => (
                    <Button key={x.label} size="sm" variant={x.kind === "approve" ? "default" : "outline"}
                      className={cn("h-7 px-2 text-xs", x.kind === "reject" && "text-destructive")} disabled={x.kind === "resume" && busy} onClick={() => run(x)}>
                      {x.label}
                    </Button>
                  ))}
                </div>
              )}
            </li>
          ))}
          {g.items.length > SHOW && (
            <li>
              <Button size="sm" variant="link" className="h-auto px-0 text-xs" onClick={() => setAll((v) => !v)}>
                {all ? "Show fewer" : `Show all ${g.items.length}`}
              </Button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

/** Same shift change as the Employees shift screen, from tomorrow (IST). */
function MoveAfterTrainingDialog({ trainee, onClose }: { trainee: TraineeRow | null; onClose: () => void }) {
  const { data: lookups } = useWorkforceLookups();
  const move = useMoveAfterTraining();
  const [shiftId, setShiftId] = useState("");
  const tomorrow = istNextDay();
  const workShifts = ((lookups?.shifts ?? []) as any[]).filter((s) => !s.is_training_shift);
  const chosen = shiftId || trainee?.post_training_shift_id || "";
  const name = workShifts.find((s) => s.id === chosen)?.name ?? "the shift you pick";
  return (
    <AlertDialog open={!!trainee} onOpenChange={(o) => { if (!o) { setShiftId(""); onClose(); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Move {trainee?.full_name || "this trainee"} off the training shift?</AlertDialogTitle>
          <AlertDialogDescription>
            From {formatIstDate(tomorrow)} they work {name} and count on that shift's staffing line. This is the same shift change as on the Employees shift screen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!trainee?.post_training_shift_id && (
          <div className="space-y-1">
            <Label>Shift after training</Label>
            <Select value={shiftId || undefined} onValueChange={setShiftId}>
              <SelectTrigger className="text-foreground"><SelectValue placeholder="Choose a shift" /></SelectTrigger>
              <SelectContent>{workShifts.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Back</AlertDialogCancel>
          <AlertDialogAction disabled={!chosen || move.isPending}
            onClick={() => { if (trainee && chosen) move.mutate({ employeeId: trainee.employee_id, shiftId: chosen, from: tomorrow }); setShiftId(""); onClose(); }}>
            Move from {formatIstDate(tomorrow)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
