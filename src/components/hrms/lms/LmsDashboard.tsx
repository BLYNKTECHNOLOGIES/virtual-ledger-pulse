import { useMemo } from "react";
import { addDays, differenceInCalendarDays } from "date-fns";
import {
  AlertTriangle, BookOpenCheck, CalendarClock, ClipboardCheck, FileUp, GraduationCap, Library, RefreshCw, UserPlus, Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  indexBy, useLmsAccess, useLmsCertifications, useLmsChecklistIndex, useLmsEmployees, useLmsKras, useLmsModules, useLmsPlanItemsIndex, useLmsPlans,
  useLmsSettings,
} from "@/hooks/lms/useLmsData";
import { useLmsNav } from "@/hooks/lms/useLmsNav";
import { LMS_DEPARTMENTS } from "@/lib/lms/constants";
import { fmtDate, parseDate, planDayDate, planTodayDayNo } from "@/lib/lms/format";
import { ErrorBlock, ItemTypeIcon, KpiCard, LoadingBlock, ProgressLine, SectionTitle } from "./LmsShared";
import { employeeLabel } from "./LmsPickers";

export function LmsDashboard() {
  const { go } = useLmsNav();
  const { canManage } = useLmsAccess();
  const plansQ = useLmsPlans();
  const itemsQ = useLmsPlanItemsIndex();
  const certsQ = useLmsCertifications();
  const modulesQ = useLmsModules();
  const krasQ = useLmsKras();
  const peopleQ = useLmsEmployees();
  const settingsQ = useLmsSettings();
  const checklistQ = useLmsChecklistIndex();

  const people = useMemo(() => indexBy(peopleQ.data, "id"), [peopleQ.data]);

  const d = useMemo(() => {
    const plans = plansQ.data ?? [];
    const items = itemsQ.data ?? [];
    const today = new Date();
    const active = plans.filter((p) => p.status === "active");
    const byPlan = new Map<string, typeof items>();
    for (const it of items) byPlan.set(it.plan_id, [...(byPlan.get(it.plan_id) ?? []), it]);

    const todayRows = active
      .map((p) => {
        const dayNo = planTodayDayNo(p.start_date) ?? 0;
        const its = byPlan.get(p.id) ?? [];
        const done = its.filter((i) => i.status !== "pending").length;
        return { plan: p, dayNo, today: its.filter((i) => i.day_no === dayNo), done, total: its.length };
      })
      .sort((a, b) => (people.get(a.plan.employee_id)?.full_name ?? "").localeCompare(people.get(b.plan.employee_id)?.full_name ?? ""));

    const upcomingTests: { plan: (typeof plans)[number]; title: string; date: Date; dayNo: number }[] = [];
    let overdue = 0;
    for (const p of active) {
      const dayNo = planTodayDayNo(p.start_date) ?? 0;
      for (const it of byPlan.get(p.id) ?? []) {
        if (it.status !== "pending") continue;
        if (it.day_no < dayNo && it.item_type !== "note") overdue++;
        if (it.item_type === "test") {
          const date = planDayDate(p.start_date, it.day_no);
          if (date) {
            const diff = differenceInCalendarDays(date, today);
            if (diff >= -1 && diff <= 7) upcomingTests.push({ plan: p, title: it.title, date, dayNo: it.day_no });
          }
        }
      }
    }
    upcomingTests.sort((a, b) => a.date.getTime() - b.date.getTime());
    const testsThisWeek = upcomingTests.filter((t) => differenceInCalendarDays(t.date, today) >= 0).length;

    const activeIds = new Set(active.map((p) => p.id));
    const withChecklist = checklistQ.data ?? new Set<string>();
    const signoffsPending = items.filter(
      (i) => activeIds.has(i.plan_id) && i.item_type === "module" && i.status === "done" && !i.signoff_result && !!i.module_id && withChecklist.has(i.module_id),
    ).length;

    const certs = certsQ.data ?? [];
    const refresherDue = certs.filter((c) => c.status === "refresher_due").length;
    const certified = certs.filter((c) => c.status === "certified").length;

    const modules = (modulesQ.data ?? []).filter((m) => m.is_active);
    const approved = modules.filter((m) => m.status === "approved").length;
    const inProduction = modules.filter((m) => m.status === "drafting" || m.status === "in_review").length;
    const byDept = LMS_DEPARTMENTS.map((dep) => {
      const ms = modules.filter((m) => m.department_code === dep.code);
      return { ...dep, total: ms.length, approved: ms.filter((m) => m.status === "approved").length };
    }).filter((x) => x.total > 0);
    const companyWide = modules.filter((m) => !m.department_code);

    const planned = new Set(plans.filter((p) => p.status !== "cancelled").map((p) => p.employee_id));
    const cutoff = addDays(today, -60);
    const newJoiners = (peopleQ.data ?? [])
      .filter((e) => e.is_active && !planned.has(e.id))
      .filter((e) => {
        const j = parseDate(e.joining_date);
        return j ? j >= cutoff : false;
      })
      .sort((a, b) => (b.joining_date ?? "").localeCompare(a.joining_date ?? ""));

    return {
      active, drafts: plans.filter((p) => p.status === "draft").length, todayRows, upcomingTests, testsThisWeek, overdue,
      signoffsPending, refresherDue, certified, modulesTotal: modules.length, approved, inProduction, byDept, companyWide, newJoiners,
    };
  }, [plansQ.data, itemsQ.data, certsQ.data, modulesQ.data, peopleQ.data, people, checklistQ.data]);

  const loading = plansQ.isLoading || itemsQ.isLoading || modulesQ.isLoading || krasQ.isLoading;
  const err = plansQ.error || itemsQ.error || modulesQ.error || krasQ.error;
  if (err && !plansQ.data) return <ErrorBlock error={err} onRetry={() => { plansQ.refetch(); itemsQ.refetch(); modulesQ.refetch(); krasQ.refetch(); }} />;
  if (loading) return <LoadingBlock rows={6} />;

  const catalogueMissing = (krasQ.data?.length ?? 0) === 0;

  return (
    <div className="space-y-5">
      {catalogueMissing ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <FileUp className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
              <div>
                <p className="text-sm font-medium">Start by importing the KRA catalogue</p>
                <p className="t-secondary">It loads the 650 KRAs and creates one library entry for every training module, ready for content.</p>
              </div>
            </div>
            {canManage ? <Button onClick={() => go("settings")}>Open LMS Settings</Button> : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="In training" value={d.active.length} hint={d.drafts ? `${d.drafts} draft plan${d.drafts === 1 ? "" : "s"}` : "Active plans"} icon={Users} tone="info" onClick={() => go("plans")} />
        <KpiCard label="Tests this week" value={d.testsThisWeek} hint="Next 7 days" icon={ClipboardCheck} tone="default" />
        <KpiCard label="Overdue items" value={d.overdue} hint="Earlier days still open" icon={AlertTriangle} tone={d.overdue ? "warning" : "default"} onClick={() => go("plans")} />
        <KpiCard label="Certified KRAs" value={d.certified} hint={d.refresherDue ? `${d.refresherDue} refresher due` : "No refreshers due"} icon={GraduationCap} tone={d.refresherDue ? "warning" : "success"} onClick={() => go("matrix")} />
        <KpiCard label="Modules ready" value={`${d.approved}/${d.modulesTotal}`} hint={`${d.inProduction} in production`} icon={Library} tone="default" onClick={() => go("library")} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="t-card-title flex items-center gap-2"><BookOpenCheck className="h-4 w-4 text-muted-foreground" aria-hidden /> Today in training</CardTitle>
          </CardHeader>
          <CardContent>
            {d.todayRows.length === 0 ? (
              <EmptyState icon={Users} title="Nobody is in training right now" description="Create a training plan for a new joiner or for someone taking on new KRAs." action={canManage ? <Button size="sm" onClick={() => go("new-plan")}>New training plan</Button> : undefined} className="py-6" />
            ) : (
              <ul className="divide-y divide-border">
                {d.todayRows.map(({ plan, dayNo, today, done, total }) => {
                  const person = people.get(plan.employee_id);
                  const phase = dayNo < 1 ? `Starts ${fmtDate(plan.start_date)}` : dayNo > plan.total_days ? `Past day ${plan.total_days}` : `Day ${dayNo} of ${plan.total_days}`;
                  return (
                    <li key={plan.id} className="py-3">
                      <button type="button" onClick={() => go("plans", { plan: plan.id })} className="w-full text-left">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">{employeeLabel(person) === "—" ? "Unknown employee" : employeeLabel(person)}</p>
                          <Badge variant={dayNo > plan.module_days ? "success" : "info"}>{phase}</Badge>
                        </div>
                        <p className="t-secondary truncate">{plan.title}</p>
                        {today.length ? (
                          <ul className="mt-1.5 space-y-1">
                            {today.slice(0, 4).map((it) => (
                              <li key={it.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                                <ItemTypeIcon type={it.item_type} className="h-3.5 w-3.5" />
                                <span className={it.status === "done" ? "line-through" : undefined}>{it.title}</span>
                              </li>
                            ))}
                            {today.length > 4 ? <li className="text-xs text-muted-foreground">+{today.length - 4} more</li> : null}
                          </ul>
                        ) : null}
                        <ProgressLine done={done} total={total} className="mt-2 max-w-xs" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="t-card-title flex items-center gap-2"><CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden /> Tests coming up</CardTitle>
            </CardHeader>
            <CardContent>
              {d.upcomingTests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tests in the next 7 days.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {d.upcomingTests.slice(0, 8).map((t, i) => (
                    <li key={`${t.plan.id}-${i}`} className="flex items-center justify-between gap-2 py-2">
                      <button type="button" className="min-w-0 text-left" onClick={() => go("plans", { plan: t.plan.id })}>
                        <p className="truncate text-sm">{employeeLabel(people.get(t.plan.employee_id))}</p>
                        <p className="t-secondary truncate">{t.title} · day {t.dayNo}</p>
                      </button>
                      <span className="t-mono shrink-0 text-xs text-muted-foreground">{fmtDate(t.date, "EEE dd MMM")}</span>
                    </li>
                  ))}
                </ul>
              )}
              {d.signoffsPending ? (
                <p className="mt-3 text-xs text-muted-foreground">{d.signoffsPending} taught module{d.signoffsPending === 1 ? "" : "s"} still waiting for a practical sign-off.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="t-card-title flex items-center gap-2"><UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden /> New joiners without a plan</CardTitle>
            </CardHeader>
            <CardContent>
              {d.newJoiners.length === 0 ? (
                <p className="text-sm text-muted-foreground">Everyone who joined in the last 60 days has a training plan.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {d.newJoiners.slice(0, 8).map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{employeeLabel(e)}</p>
                        <p className="t-secondary truncate">{[e.position_title, `joined ${fmtDate(e.joining_date)}`].filter(Boolean).join(" · ")}</p>
                      </div>
                      {canManage ? <Button size="sm" variant="outline" onClick={() => go("new-plan", { employee: e.id })}>Plan</Button> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-3">
        <SectionTitle
          title="Library readiness"
          description={`Approved modules out of all modules, by department. Programme: ${settingsQ.data?.module_days ?? 15} module days, ${settingsQ.data?.programme_days ?? 30} days in all, pass mark ${settingsQ.data?.pass_mark ?? 80}%.`}
          actions={<Button size="sm" variant="outline" onClick={() => go("library")}><Library className="mr-1.5 h-3.5 w-3.5" /> Open library</Button>}
        />
        {d.byDept.length === 0 ? (
          <p className="text-sm text-muted-foreground">No modules yet.</p>
        ) : (
          <Card>
            <CardContent className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
              {d.companyWide.length ? (
                <div>
                  <div className="flex items-center justify-between text-sm"><span>Company-wide</span><span className="t-mono text-xs text-muted-foreground">{d.companyWide.filter((m) => m.status === "approved").length}/{d.companyWide.length}</span></div>
                  <ProgressLine done={d.companyWide.filter((m) => m.status === "approved").length} total={d.companyWide.length} />
                </div>
              ) : null}
              {d.byDept.map((x) => (
                <button key={x.code} type="button" className="text-left" onClick={() => go("library", { dept: x.code })}>
                  <div className="flex items-center justify-between text-sm"><span className="truncate">{x.name}</span><span className="t-mono text-xs text-muted-foreground">{x.approved}/{x.total}</span></div>
                  <ProgressLine done={x.approved} total={x.total} />
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {d.refresherDue ? (
        <Card className="border-warning/40">
          <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <p className="text-sm">{d.refresherDue} certification{d.refresherDue === 1 ? " needs" : "s need"} a refresher because a module changed.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => go("matrix", { status: "refresher_due" })}>See who</Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
