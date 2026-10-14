import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, CalendarPlus, CheckCircle2, ClipboardCheck, Download, FastForward, Flag, Info, ListPlus, MonitorPlay, MoreHorizontal,
  Pencil, Play, Plus, RotateCcw, Trash2, Undo2, XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  indexBy, useLmsAccess, useLmsChecklistIndex, useLmsEmployees, useLmsInvalidate, useLmsKras, useLmsModuleKras,
  useLmsModules, useLmsPlan, useLmsPlanItemsIndex, useLmsPlans, useLmsSeats, useLmsSettings,
} from "@/hooks/lms/useLmsData";
import { useLmsNav } from "@/hooks/lms/useLmsNav";
import {
  addPlanItem, addPlanKras, clearSignoff, clearTest, deleteItem, deletePlan, removePlanKra, reopenPlan, setItemDone, setPlanKraStatus,
  skipItem, startPlan, undoCertification, certifyKras,
} from "@/lib/lms/actions";
import { ITEM_TYPE_LABEL, LANGUAGE_LABEL, PLAN_TYPE_LABEL } from "@/lib/lms/constants";
import { downloadText, fmtDate, minutesLabel, planDayDate, planTodayDayNo, toCsv, todayIso } from "@/lib/lms/format";
import type { LmsModule, LmsPlanItem } from "@/lib/lms/types";
import { completedModuleIds, linkedModulesByKra, moduleServesKra } from "@/lib/lms/versions";
import { decidingTests } from "@/lib/lms/planBuilder";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ConfirmAction, ErrorBlock, Fact, ItemTypeIcon, LoadingBlock, PlanKraBadge, PlanStatusBadge, ProgressLine, StateIcon, errorText,
} from "./LmsShared";
import { KraPickerDialog, employeeLabel } from "./LmsPickers";
import {
  AddItemDialog, CertifyDialog, ClosePlanDialog, ExtendDialog, LiveDayDialog, MoveItemDialog, PlanEditDialog, ShiftDialog, SignoffDialog,
  TestResultDialog,
} from "./LmsPlanDialogs";

type Dialog =
  | { kind: "test" | "signoff" | "live" | "move"; item: LmsPlanItem }
  | { kind: "add"; day: number }
  | { kind: "edit" | "extend" | "shift" | "close" }
  | { kind: "certify"; codes: string[] }
  | { kind: "kras" }
  | null;

const OUTCOME_TEXT: Record<string, string> = {
  certified: "Certified",
  partially_certified: "Partly certified",
  exit_recommended: "Exit recommended",
  withdrawn: "Withdrawn",
};

export function LmsPlanDetail({ planId }: { planId: string }) {
  const { go } = useLmsNav();
  const { canManage } = useLmsAccess();
  const invalidate = useLmsInvalidate();
  const planQ = useLmsPlan(planId);
  const peopleQ = useLmsEmployees();
  const modulesQ = useLmsModules();
  const linksQ = useLmsModuleKras();
  const krasQ = useLmsKras();
  const settingsQ = useLmsSettings();
  const seatsQ = useLmsSeats();
  const checklistQ = useLmsChecklistIndex();
  const plansQ = useLmsPlans();
  const itemsIndexQ = useLmsPlanItemsIndex();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<LmsPlanItem | null>(null);

  const people = useMemo(() => indexBy(peopleQ.data, "id"), [peopleQ.data]);
  const modules = useMemo(() => indexBy(modulesQ.data, "id"), [modulesQ.data]);
  const kraMap = useMemo(() => new Map((krasQ.data ?? []).map((k) => [k.code, k])), [krasQ.data]);
  const modulesByKra = useMemo(() => linkedModulesByKra(linksQ.data), [linksQ.data]);

  const plan = planQ.data?.plan ?? null;
  const items = useMemo(() => planQ.data?.items ?? [], [planQ.data]);
  const planKras = useMemo(() => planQ.data?.kras ?? [], [planQ.data]);
  const refresh = () => invalidate();

  const days = useMemo(() => {
    const out = new Map<number, LmsPlanItem[]>();
    for (const it of items) out.set(it.day_no, [...(out.get(it.day_no) ?? []), it]);
    return Array.from(out.entries()).sort((a, b) => a[0] - b[0]);
  }, [items]);

  const versionsByKra = useMemo(() => {
    const out: Record<string, Record<string, string>> = {};
    for (const pk of planKras) {
      const k = kraMap.get(pk.kra_code);
      const rec: Record<string, string> = {};
      for (const it of items) {
        if (it.item_type !== "module" || !it.module_id || it.status === "skipped") continue;
        const m = modules.get(it.module_id);
        if (m && moduleServesKra(m, k, modulesByKra.get(pk.kra_code))) rec[m.code] = it.module_version ?? m.version;
      }
      out[pk.kra_code] = rec;
    }
    return out;
  }, [planKras, items, modules, kraMap, modulesByKra]);

  /** Modules this person completed in their other plans (see completedModuleIds). */
  const completedEarlier = useMemo(
    () => (plan ? completedModuleIds(plan.employee_id, plansQ.data, itemsIndexQ.data, checklistQ.data, plan.id) : new Set<string>()),
    [plan, plansQ.data, itemsIndexQ.data, checklistQ.data],
  );

  // Only a pass in the final test, or in a retest on or after the final test's day, counts.
  const finalPassed = decidingTests(items).some((t) => t.test_passed === true);
  const readiness = useMemo(() => {
    type Taught = "yes" | "no" | "earlier" | "missing";
    const out = new Map<string, { taught: Taught; practical: "passed" | "failed" | "pending" | "n/a"; ready: boolean }>();
    for (const pk of planKras) {
      const ids = modulesByKra.get(pk.kra_code) ?? new Set<string>();
      const skill = items.filter((i) => i.item_type === "module" && i.module_id && ids.has(i.module_id));
      const active = skill.filter((i) => i.status !== "skipped");
      const doneEarlier = [...ids].some((id) => completedEarlier.has(id));
      const taught: Taught = active.length
        ? active.every((i) => i.status === "done") ? "yes" : "no"
        : doneEarlier ? "earlier" : skill.length ? "no" : "missing";
      const needsSignoff = active.some((i) => i.module_id && checklistQ.data?.has(i.module_id));
      const practical = active.some((i) => i.signoff_result === "failed")
        ? "failed"
        : active.length && active.every((i) => i.signoff_result === "passed")
          ? "passed"
          : needsSignoff ? "pending" : "n/a";
      const ready = (taught === "yes" || taught === "earlier") && practical !== "failed" && practical !== "pending" && finalPassed;
      out.set(pk.kra_code, { taught, practical, ready });
    }
    return out;
  }, [planKras, items, modulesByKra, checklistQ.data, finalPassed, completedEarlier]);

  if (planQ.error && !planQ.data) return <ErrorBlock error={planQ.error} onRetry={() => planQ.refetch()} />;
  if (planQ.isLoading || !plan) return <LoadingBlock rows={8} />;

  const person = people.get(plan.employee_id);
  const todayDay = planTodayDayNo(plan.start_date) ?? 0;
  const done = items.filter((i) => i.status !== "pending").length;
  const tests = items.filter((i) => i.item_type === "test").sort((a, b) => a.day_no - b.day_no);
  const certified = planKras.filter((k) => k.status === "certified").length;
  const inTraining = planKras.filter((k) => k.status === "in_training").map((k) => k.kra_code);
  const readyCodes = inTraining.filter((c) => readiness.get(c)?.ready);
  const seat = plan.seat_id ? (seatsQ.data ?? []).find((s) => s.id === plan.seat_id) : null;
  const isOpen = plan.status === "active" || plan.status === "draft";
  const editable = canManage && isOpen;
  const firstPending = items.filter((i) => i.status === "pending").sort((a, b) => a.day_no - b.day_no)[0]?.day_no ?? 1;
  const kraNames = new Map(planKras.map((k) => [k.kra_code, kraMap.get(k.kra_code)?.name ?? ""]));

  const act = async (id: string, fn: () => Promise<void>, ok?: string) => {
    setBusyId(id);
    try {
      await fn();
      if (ok) toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  const present = (it: LmsPlanItem) =>
    it.module_id && go("present", { module: it.module_id, lang: plan.language, plan: plan.id, item: it.id });

  const exportCsv = () => {
    const rows: (string | number | null)[][] = [[
      "Day", "Date", "Type", "Title", "Module", "Module version", "Status", "Done on", "Score %", "Critical OK", "Test passed", "Attempt",
      "Quiz reference", "Practical", "Signed off by", "Orders", "Mistakes", "Critical mistake", "Remarks",
    ]];
    for (const it of items) {
      const m = it.module_id ? modules.get(it.module_id) : null;
      rows.push([
        it.day_no, fmtDate(planDayDate(plan.start_date, it.day_no), "yyyy-MM-dd"), ITEM_TYPE_LABEL[it.item_type], it.title, m?.code ?? "",
        it.module_version ?? "", it.status, it.completed_at ? fmtDate(it.completed_at, "yyyy-MM-dd") : "",
        it.score_pct ?? "", it.critical_ok === null ? "" : it.critical_ok ? "Yes" : "No", it.test_passed === null ? "" : it.test_passed ? "Yes" : "No",
        it.test_attempt ?? "", it.quiz_reference ?? "", it.signoff_result ?? "",
        it.signoff_by_employee_id ? people.get(it.signoff_by_employee_id)?.full_name ?? "" : "",
        it.live_orders ?? "", it.live_errors ?? "", it.live_critical_error === null ? "" : it.live_critical_error ? "Yes" : "No", it.remarks ?? "",
      ]);
    }
    const name = (person?.full_name ?? "trainee").replace(/[^\w]+/g, "-");
    downloadText(`training-plan-${name}-${todayIso()}.csv`, toCsv(rows));
  };

  const certifyCodes = async (codes: string[]) => {
    await certifyKras(plan, codes, { certifiedAt: new Date().toISOString(), remarks: null, versionsByKra });
  };

  const itemState = (it: LmsPlanItem): "done" | "failed" | "pending" | "skipped" => {
    if (it.status === "skipped") return "skipped";
    if (it.item_type === "test" && it.test_passed === false) return "failed";
    if (it.item_type === "module" && it.signoff_result === "failed") return "failed";
    if (it.item_type === "live" && it.live_critical_error) return "failed";
    return it.status === "done" ? "done" : "pending";
  };

  const itemActions = (it: LmsPlanItem) => {
    const busy = busyId === it.id;
    const primary = (() => {
      if (it.item_type === "module") {
        return (
          <div className="flex gap-1">
            {it.module_id ? (
              <Button size="sm" variant="outline" onClick={() => present(it)} aria-label="Present in class">
                <MonitorPlay className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Present</span>
              </Button>
            ) : null}
            {editable ? (
              it.status === "done" ? null : (
                <Button size="sm" disabled={busy} onClick={() => act(it.id, () => setItemDone(it, true), "Marked as taught")}>Mark taught</Button>
              )
            ) : null}
          </div>
        );
      }
      if (!editable) return null;
      if (it.item_type === "test") return <Button size="sm" variant={it.score_pct === null ? "default" : "outline"} onClick={() => setDialog({ kind: "test", item: it })}>{it.score_pct === null ? "Record result" : "Edit result"}</Button>;
      if (it.item_type === "live") return <Button size="sm" variant={it.status === "done" ? "outline" : "default"} onClick={() => setDialog({ kind: "live", item: it })}>{it.status === "done" ? "Edit log" : "Log day"}</Button>;
      if (it.item_type === "practice") return it.status === "done" ? null : <Button size="sm" variant="outline" disabled={busy} onClick={() => act(it.id, () => setItemDone(it, true))}>Done</Button>;
      return null;
    })();
    return (
      <div className="flex shrink-0 items-center gap-1">
        {primary}
        {editable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="More actions" disabled={busy}><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {it.item_type === "module" ? (
                <DropdownMenuItem onClick={() => setDialog({ kind: "signoff", item: it })}><ClipboardCheck className="mr-2 h-4 w-4" /> Practical sign-off</DropdownMenuItem>
              ) : null}
              {it.item_type === "module" && it.signoff_result ? (
                <DropdownMenuItem onClick={() => act(it.id, () => clearSignoff(it), "Sign-off cleared")}><Undo2 className="mr-2 h-4 w-4" /> Clear sign-off</DropdownMenuItem>
              ) : null}
              {it.item_type === "test" && it.score_pct !== null ? (
                <DropdownMenuItem onClick={() => act(it.id, () => clearTest(it), "Result cleared")}><Undo2 className="mr-2 h-4 w-4" /> Clear result</DropdownMenuItem>
              ) : null}
              {it.status !== "pending" && it.item_type !== "test" ? (
                <DropdownMenuItem onClick={() => act(it.id, () => setItemDone(it, false), "Marked as not done")}><RotateCcw className="mr-2 h-4 w-4" /> Mark not done</DropdownMenuItem>
              ) : null}
              {it.status === "pending" && it.item_type !== "test" && it.item_type !== "note" ? (
                <DropdownMenuItem onClick={() => act(it.id, () => skipItem(it, it.remarks), "Skipped")}><FastForward className="mr-2 h-4 w-4" /> Skip</DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => setDialog({ kind: "move", item: it })}><CalendarPlus className="mr-2 h-4 w-4" /> Move to another day</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setRemoving(it)}>
                <Trash2 className="mr-2 h-4 w-4" /> Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    );
  };

  const itemMeta = (it: LmsPlanItem) => {
    const chips: React.ReactNode[] = [];
    const m = it.module_id ? modules.get(it.module_id) : null;
    if (m) chips.push(<span key="code" className="t-mono">{m.code}{it.module_version ? ` v${it.module_version}` : ""}</span>);
    if (m && it.module_version && m.version !== it.module_version) chips.push(<Badge key="newer" variant="warning" className="text-[10px]">Module now v{m.version}</Badge>);
    if (m) chips.push(<span key="min">{minutesLabel(m.duration_minutes)}</span>);
    if (it.item_type === "module" && it.demo_done) chips.push(<span key="demo">Demo given</span>);
    if (it.item_type === "module" && it.signoff_result) {
      chips.push(
        <Badge key="so" variant={it.signoff_result === "passed" ? "success" : "destructive-soft"} className="text-[10px]">
          Practical {it.signoff_result === "passed" ? "passed" : "not passed"}
          {it.signoff_by_employee_id ? ` · ${people.get(it.signoff_by_employee_id)?.full_name ?? ""}` : ""}
        </Badge>,
      );
    }
    if (it.item_type === "test") {
      if (it.score_pct !== null) {
        chips.push(
          <Badge key="score" variant={it.test_passed ? "success" : "destructive-soft"} className="text-[10px]">
            {Number(it.score_pct)}% · {it.test_passed ? "Passed" : "Not passed"}{it.critical_ok === false ? " (critical missed)" : ""}
          </Badge>,
        );
      }
      if ((it.test_attempt ?? 1) > 1) chips.push(<span key="att">Attempt {it.test_attempt}</span>);
      if (it.quiz_reference) chips.push(<span key="qr" className="truncate">Quiz: {it.quiz_reference}</span>);
    }
    if (it.item_type === "live" && it.status === "done") {
      chips.push(<span key="orders">{it.live_orders ?? 0} orders · {it.live_errors ?? 0} mistakes</span>);
      if (it.live_critical_error) chips.push(<Badge key="crit" variant="destructive-soft" className="text-[10px]">Critical mistake</Badge>);
    }
    if (it.status === "skipped") chips.push(<span key="skip">Skipped</span>);
    return chips;
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => go("plans")}><ArrowLeft className="mr-1.5 h-4 w-4" /> All trainees</Button>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="t-section">{person ? employeeLabel(person) : "Unknown employee"}</h2>
                <PlanStatusBadge status={plan.status} />
                {plan.outcome ? <Badge variant="outline">{OUTCOME_TEXT[plan.outcome]}</Badge> : null}
                {plan.extension_days > 0 ? <Badge variant="warning">Extended +{plan.extension_days} days</Badge> : null}
              </div>
              <p className="t-secondary mt-0.5">{[person?.position_title, person?.department_name].filter(Boolean).join(" · ") || "—"}</p>
              <p className="mt-1 text-sm">{plan.title}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage && plan.status === "draft" ? (
                <Button size="sm" disabled={busyId === "plan"} onClick={() => act("plan", () => startPlan(plan), "Training started")}><Play className="mr-1.5 h-3.5 w-3.5" /> Start training</Button>
              ) : null}
              {editable ? <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "edit" })}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit</Button> : null}
              {canManage && plan.status === "active" ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "shift" })}><CalendarPlus className="mr-1.5 h-3.5 w-3.5" /> Push back</Button>
                  <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "extend" })}><Plus className="mr-1.5 h-3.5 w-3.5" /> Extend</Button>
                  <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "close" })}><Flag className="mr-1.5 h-3.5 w-3.5" /> Close plan</Button>
                </>
              ) : null}
              {canManage && !isOpen ? (
                <Button size="sm" variant="outline" disabled={busyId === "plan"} onClick={() => act("plan", () => reopenPlan(plan), "Plan reopened")}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reopen</Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1.5 h-3.5 w-3.5" /> CSV</Button>
              {canManage && (plan.status === "draft" || plan.status === "cancelled") ? (
                <ConfirmAction
                  title="Delete this plan?"
                  description="The plan, its days and its results are deleted. Certifications already given stay."
                  confirmLabel="Delete plan"
                  destructive
                  onConfirm={async () => {
                    try {
                      await deletePlan(plan.id);
                      toast.success("Plan deleted");
                      await refresh();
                      go("plans");
                    } catch (e) {
                      toast.error(errorText(e));
                    }
                  }}
                >
                  {(open) => <Button size="sm" variant="ghost" className="text-destructive" onClick={open}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete</Button>}
                </ConfirmAction>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Fact label="Type">{PLAN_TYPE_LABEL[plan.plan_type]}</Fact>
            <Fact label="Seat">{seat?.name ?? "—"}</Fact>
            <Fact label="Language">{LANGUAGE_LABEL[plan.language]}</Fact>
            <Fact label="Start">{fmtDate(plan.start_date)}</Fact>
            <Fact label="Trainer">{plan.trainer_employee_id ? people.get(plan.trainer_employee_id)?.full_name ?? "—" : "—"}</Fact>
            <Fact label="Department senior">{plan.supervisor_employee_id ? people.get(plan.supervisor_employee_id)?.full_name ?? "—" : "—"}</Fact>
          </div>

          <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
            <div>
              <p className="t-label">Progress</p>
              <ProgressLine done={done} total={items.length} className="mt-1.5" />
              <p className="t-secondary mt-1">
                {plan.status === "active"
                  ? todayDay < 1 ? `Starts ${fmtDate(plan.start_date)}` : todayDay > plan.total_days ? `All ${plan.total_days} days are over` : `Day ${todayDay} of ${plan.total_days} (${todayDay <= plan.module_days ? "modules" : "live work"})`
                  : `${plan.module_days} module days, ${plan.total_days} days in all`}
              </p>
            </div>
            <div>
              <p className="t-label">Tests</p>
              {tests.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">None</p> : (
                <ul className="mt-1 space-y-0.5">
                  {tests.map((t) => (
                    <li key={t.id} className="flex items-center gap-1.5 text-sm">
                      <StateIcon state={t.test_passed === true ? "done" : t.test_passed === false ? "failed" : "pending"} />
                      <span>{t.title}</span>
                      <span className="text-xs text-muted-foreground">{t.score_pct !== null ? `${Number(t.score_pct)}%` : `day ${t.day_no}`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="t-label">KRAs certified</p>
              <p className="t-kpi mt-0.5 text-2xl">{certified}/{planKras.length}</p>
            </div>
          </div>
          {plan.notes ? <p className="whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 text-sm">{plan.notes}</p> : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="kras">KRAs and certification ({planKras.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="space-y-3">
          {days.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No items in this plan.</CardContent></Card>
          ) : (
            days.map(([day, its]) => {
              const date = planDayDate(plan.start_date, day);
              const isToday = plan.status === "active" && day === todayDay;
              const mins = its.reduce((s, it) => s + (it.item_type === "module" && it.module_id ? modules.get(it.module_id)?.duration_minutes ?? 0 : 0), 0);
              return (
                <Card key={day} className={isToday ? "border-primary/50 shadow-sm" : undefined}>
                  <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">Day {day}</span>
                      <span className="text-xs text-muted-foreground">{fmtDate(date, "EEE dd MMM yyyy")}</span>
                      {isToday ? <Badge variant="info">Today</Badge> : null}
                      {day > plan.module_days ? <Badge variant="success" className="text-[10px]">Live</Badge> : null}
                      {mins ? <span className="t-mono text-xs text-muted-foreground">{minutesLabel(mins)}</span> : null}
                    </div>
                    {editable ? (
                      <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "add", day })} aria-label={`Add to day ${day}`}>
                        <Plus className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Add</span>
                      </Button>
                    ) : null}
                  </div>
                  <ul className="divide-y divide-border">
                    {its.map((it) => (
                      <li key={it.id} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <StateIcon state={itemState(it)} />
                          <ItemTypeIcon type={it.item_type} className="mt-0.5" />
                          <div className="min-w-0">
                            <p className={`text-sm ${it.status === "skipped" ? "text-muted-foreground line-through" : ""}`}>{it.title}</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">{itemMeta(it)}</div>
                            {it.remarks && it.item_type !== "note" ? <p className="mt-0.5 text-xs text-muted-foreground">“{it.remarks}”</p> : null}
                          </div>
                        </div>
                        {itemActions(it)}
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })
          )}
          {editable ? (
            <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "add", day: Math.min(240, plan.total_days + 1) })}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add a day
            </Button>
          ) : null}
        </TabsContent>

        <TabsContent value="kras" className="space-y-3">
          {canManage ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="t-secondary">
                A KRA is ready to certify when its module is taught, its practical is passed (if it has a checklist) and the final test is passed.
              </p>
              <div className="flex gap-2">
                {editable ? <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "kras" })}><ListPlus className="mr-1.5 h-3.5 w-3.5" /> Add KRAs</Button> : null}
                <Button size="sm" disabled={!readyCodes.length} onClick={() => setDialog({ kind: "certify", codes: readyCodes })}>
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Certify ready ({readyCodes.length})
                </Button>
              </div>
            </div>
          ) : null}
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>KRA</TableHead>
                  <TableHead className="hidden md:table-cell">Taught</TableHead>
                  <TableHead className="hidden md:table-cell">Practical</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage ? <TableHead className="text-right">Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {planKras.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No KRAs on this plan.</TableCell></TableRow>
                ) : (
                  [...planKras]
                    .sort((a, b) => (kraMap.get(a.kra_code)?.sort_order ?? 0) - (kraMap.get(b.kra_code)?.sort_order ?? 0))
                    .map((pk) => {
                      const k = kraMap.get(pk.kra_code);
                      const r = readiness.get(pk.kra_code);
                      const busy = busyId === `kra-${pk.kra_code}`;
                      return (
                        <TableRow key={pk.kra_code}>
                          <TableCell>
                            <p className="text-sm"><span className="t-mono mr-1.5 text-xs text-muted-foreground">{pk.kra_code}</span>{k?.name ?? ""}</p>
                            {pk.remarks ? <p className="t-secondary">{pk.remarks}</p> : null}
                            {pk.decided_at ? <p className="t-secondary">{fmtDate(pk.decided_at)}</p> : null}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {r?.taught === "missing" ? (
                              <span className="text-xs text-destructive">Not in plan</span>
                            ) : r?.taught === "earlier" ? (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><StateIcon state="done" label="Taught in an earlier plan" /> Earlier plan</span>
                            ) : (
                              <StateIcon state={r?.taught === "yes" ? "done" : "pending"} label={r?.taught === "yes" ? "Taught" : "Not yet"} />
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {r?.practical === "n/a" ? <span className="text-xs text-muted-foreground">No checklist</span> : (
                              <StateIcon state={r?.practical === "passed" ? "done" : r?.practical === "failed" ? "failed" : "pending"} label={r?.practical} />
                            )}
                          </TableCell>
                          <TableCell><PlanKraBadge status={pk.status} /></TableCell>
                          {canManage ? (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {pk.status === "in_training" ? (
                                  <>
                                    <Button size="sm" variant={r?.ready ? "default" : "outline"} onClick={() => setDialog({ kind: "certify", codes: [pk.kra_code] })}>Certify</Button>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="More" disabled={busy}><MoreHorizontal className="h-4 w-4" /></Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => act(`kra-${pk.kra_code}`, () => setPlanKraStatus(plan.id, [pk.kra_code], "not_cleared", null), "Marked not cleared")}>
                                          <XCircle className="mr-2 h-4 w-4" /> Mark not cleared
                                        </DropdownMenuItem>
                                        {editable ? (
                                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => act(`kra-${pk.kra_code}`, () => removePlanKra(plan.id, pk.kra_code), "KRA removed from the plan")}>
                                            <Trash2 className="mr-2 h-4 w-4" /> Remove from plan
                                          </DropdownMenuItem>
                                        ) : null}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </>
                                ) : pk.status === "certified" ? (
                                  <ConfirmAction
                                    title={`Undo the certification for ${pk.kra_code}?`}
                                    description="The certificate given in this plan is taken back (an earlier certificate it replaced is restored) and the KRA goes back to in training."
                                    confirmLabel="Undo"
                                    onConfirm={() => act(`kra-${pk.kra_code}`, () => undoCertification(plan, pk.kra_code), "Certification undone")}
                                  >
                                    {(open) => <Button size="sm" variant="ghost" onClick={open} disabled={busy}><Undo2 className="mr-1.5 h-3.5 w-3.5" /> Undo</Button>}
                                  </ConfirmAction>
                                ) : (
                                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(`kra-${pk.kra_code}`, () => setPlanKraStatus(plan.id, [pk.kra_code], "in_training", null), "Back in training")}>
                                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Back to training
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })
                )}
              </TableBody>
            </Table>
          </Card>
          {!finalPassed && inTraining.length ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5" aria-hidden /> No final test or retest has been passed yet, so no KRA shows as ready.</p>
          ) : null}
        </TabsContent>
      </Tabs>

      {/* dialogs */}
      <TestResultDialog
        open={dialog?.kind === "test"}
        onOpenChange={(o) => !o && setDialog(null)}
        item={dialog?.kind === "test" ? dialog.item : null}
        plan={plan}
        items={items}
        settings={settingsQ.data}
        onSaved={refresh}
      />
      <SignoffDialog
        open={dialog?.kind === "signoff"}
        onOpenChange={(o) => !o && setDialog(null)}
        item={dialog?.kind === "signoff" ? dialog.item : null}
        employees={peopleQ.data}
        defaultSignerId={plan.supervisor_employee_id ?? plan.trainer_employee_id}
        onSaved={refresh}
      />
      <LiveDayDialog open={dialog?.kind === "live"} onOpenChange={(o) => !o && setDialog(null)} item={dialog?.kind === "live" ? dialog.item : null} onSaved={refresh} />
      <MoveItemDialog open={dialog?.kind === "move"} onOpenChange={(o) => !o && setDialog(null)} item={dialog?.kind === "move" ? dialog.item : null} plan={plan} items={items} onSaved={refresh} />
      <AddItemDialog
        open={dialog?.kind === "add"}
        onOpenChange={(o) => !o && setDialog(null)}
        plan={plan}
        items={items}
        modules={modulesQ.data}
        defaultDay={dialog?.kind === "add" ? dialog.day : 1}
        onSaved={refresh}
      />
      <PlanEditDialog open={dialog?.kind === "edit"} onOpenChange={(o) => !o && setDialog(null)} plan={plan} employees={peopleQ.data} onSaved={refresh} />
      <ExtendDialog open={dialog?.kind === "extend"} onOpenChange={(o) => !o && setDialog(null)} plan={plan} settings={settingsQ.data} onSaved={refresh} />
      <ShiftDialog
        open={dialog?.kind === "shift"}
        onOpenChange={(o) => !o && setDialog(null)}
        plan={plan}
        defaultFrom={Math.max(1, Math.min(plan.total_days, todayDay >= 1 ? Math.max(todayDay, firstPending) : firstPending))}
        onSaved={refresh}
      />
      <ClosePlanDialog
        open={dialog?.kind === "close"}
        onOpenChange={(o) => !o && setDialog(null)}
        plan={plan}
        readyCodes={readyCodes}
        notReadyCodes={inTraining.filter((c) => !readyCodes.includes(c))}
        certifiedCount={certified}
        onCertify={certifyCodes}
        onSaved={refresh}
      />
      <CertifyDialog
        open={dialog?.kind === "certify"}
        onOpenChange={(o) => !o && setDialog(null)}
        plan={plan}
        codes={dialog?.kind === "certify" ? dialog.codes : []}
        names={kraNames}
        versionsByKra={versionsByKra}
        onSaved={refresh}
      />
      <KraPickerDialog
        open={dialog?.kind === "kras"}
        onOpenChange={(o) => !o && setDialog(null)}
        kras={krasQ.data}
        selected={planKras.map((k) => k.kra_code)}
        lockedCodes={new Set(planKras.map((k) => k.kra_code))}
        title="Add KRAs to this plan"
        onDone={(codes) => {
          const current = new Set(planKras.map((k) => k.kra_code));
          const added = codes.filter((c) => !current.has(c));
          if (!added.length) return;
          act("kras", async () => {
            await addPlanKras(plan.id, added);
            // Each new KRA's skill module goes on the first open module day, unless the plan already has it.
            const have = new Set(items.filter((i) => i.module_id).map((i) => i.module_id));
            const day = Math.min(Math.max(firstPending, 1), plan.module_days);
            const toAdd: LmsModule[] = [];
            for (const c of added) {
              for (const id of modulesByKra.get(c) ?? []) {
                const m = modules.get(id);
                if (m && m.is_active && m.status !== "retired" && !have.has(id) && !toAdd.some((x) => x.id === id)) toAdd.push(m);
              }
            }
            let dayItems = items.filter((i) => i.day_no === day);
            for (const m of toAdd) {
              await addPlanItem(plan, dayItems, { day_no: day, item_type: "module", module_id: m.id, module_version: m.version, title: m.title, test_kind: null });
              dayItems = [...dayItems, { sort_order: (dayItems.reduce((x, i) => Math.max(x, i.sort_order ?? 0), 0) + 10) } as LmsPlanItem];
            }
          }, `${added.length} KRA${added.length === 1 ? "" : "s"} added; their modules are on day ${Math.min(Math.max(firstPending, 1), plan.module_days)}`);
        }}
      />
      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{removing?.title}" from day {removing?.day_no}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing && (removing.status !== "pending" || removing.score_pct !== null || removing.signoff_result || removing.live_orders !== null)
                ? "Its recorded result (score, sign-off or live-day log) is deleted with it."
                : "It is taken off the schedule."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const it = removing;
                setRemoving(null);
                if (it) void act(it.id, () => deleteItem(it.id), "Removed from the plan");
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
