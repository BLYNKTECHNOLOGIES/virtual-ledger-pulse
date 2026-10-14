import { useMemo, useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { indexBy, useLmsAccess, useLmsEmployees, useLmsPlanItemsIndex, useLmsPlans, useLmsSeats } from "@/hooks/lms/useLmsData";
import { useLmsNav } from "@/hooks/lms/useLmsNav";
import { PLAN_TYPE_LABEL } from "@/lib/lms/constants";
import { fmtDate, planDayDate, planTodayDayNo } from "@/lib/lms/format";
import type { LmsPlanStatus } from "@/lib/lms/types";
import { ErrorBlock, LoadingBlock, PlanStatusBadge, ProgressLine } from "./LmsShared";
import { employeeLabel } from "./LmsPickers";

type Filter = "active" | "draft" | "closed" | "all";
const FILTER_STATUSES: Record<Filter, LmsPlanStatus[] | null> = {
  active: ["active"],
  draft: ["draft"],
  closed: ["completed", "failed", "cancelled"],
  all: null,
};

export function LmsPlansList() {
  const { go } = useLmsNav();
  const { canManage } = useLmsAccess();
  const plansQ = useLmsPlans();
  const itemsQ = useLmsPlanItemsIndex();
  const peopleQ = useLmsEmployees();
  const seatsQ = useLmsSeats();
  const [filter, setFilter] = useState<Filter>("active");
  const [q, setQ] = useState("");

  const people = useMemo(() => indexBy(peopleQ.data, "id"), [peopleQ.data]);
  const seats = useMemo(() => indexBy(seatsQ.data, "id"), [seatsQ.data]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { active: 0, draft: 0, closed: 0, all: 0 };
    for (const p of plansQ.data ?? []) {
      c.all++;
      if (p.status === "active") c.active++;
      else if (p.status === "draft") c.draft++;
      else c.closed++;
    }
    return c;
  }, [plansQ.data]);

  const rows = useMemo(() => {
    const statuses = FILTER_STATUSES[filter];
    const needle = q.trim().toLowerCase();
    const items = itemsQ.data ?? [];
    const byPlan = new Map<string, typeof items>();
    for (const it of items) byPlan.set(it.plan_id, [...(byPlan.get(it.plan_id) ?? []), it]);
    return (plansQ.data ?? [])
      .filter((p) => !statuses || statuses.includes(p.status))
      .map((p) => {
        const person = people.get(p.employee_id);
        const its = byPlan.get(p.id) ?? [];
        const done = its.filter((i) => i.status !== "pending").length;
        const nextTest = its
          .filter((i) => i.item_type === "test" && i.status === "pending")
          .sort((a, b) => a.day_no - b.day_no)[0];
        const tests = its.filter((i) => i.item_type === "test" && i.score_pct !== null);
        return { p, person, done, total: its.length, nextTest, tests };
      })
      .filter(({ p, person }) => {
        if (!needle) return true;
        return `${person?.full_name ?? ""} ${person?.badge_id ?? ""} ${person?.position_title ?? ""} ${p.title}`.toLowerCase().includes(needle);
      });
  }, [plansQ.data, itemsQ.data, people, filter, q]);

  if (plansQ.error && !plansQ.data) return <ErrorBlock error={plansQ.error} onRetry={() => plansQ.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="overflow-x-auto">
          <SegmentedControl<Filter>
            aria-label="Plan status"
            value={filter}
            onValueChange={setFilter}
            options={[
              { value: "active", label: `In training (${counts.active})` },
              { value: "draft", label: `Drafts (${counts.draft})` },
              { value: "closed", label: `Closed (${counts.closed})` },
              { value: "all", label: `All (${counts.all})` },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search trainee or plan" className="pl-8" aria-label="Search plans" />
          </div>
          {canManage ? (
            <Button onClick={() => go("new-plan")}><Plus className="mr-1.5 h-4 w-4" /> New training plan</Button>
          ) : null}
        </div>
      </div>

      {plansQ.isLoading || itemsQ.isLoading ? (
        <LoadingBlock rows={5} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={q ? "No plan matches the search" : filter === "active" ? "Nobody is in training" : "No plans here"}
            description="A training plan picks a person's KRAs, pulls in the modules in teaching order and lays them across the days."
            action={canManage && !q ? <Button size="sm" onClick={() => go("new-plan")}>New training plan</Button> : undefined}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trainee</TableHead>
                <TableHead className="hidden md:table-cell">Plan</TableHead>
                <TableHead className="hidden lg:table-cell">Trainer</TableHead>
                <TableHead>Day</TableHead>
                <TableHead className="hidden sm:table-cell">Progress</TableHead>
                <TableHead className="hidden lg:table-cell">Next test</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ p, person, done, total, nextTest, tests }) => {
                const dayNo = planTodayDayNo(p.start_date);
                const dayLabel =
                  p.status !== "active" ? fmtDate(p.start_date) :
                  dayNo === null ? "—" :
                  dayNo < 1 ? `Starts ${fmtDate(p.start_date, "dd MMM")}` :
                  dayNo > p.total_days ? `Ended day ${p.total_days}` : `${dayNo} of ${p.total_days}`;
                const nextDate = nextTest ? planDayDate(p.start_date, nextTest.day_no) : null;
                const trainer = p.trainer_employee_id ? people.get(p.trainer_employee_id) : null;
                return (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => go("plans", { plan: p.id })}>
                    <TableCell>
                      <p className="text-sm font-medium">{person ? employeeLabel(person) : "Unknown employee"}</p>
                      <p className="t-secondary">{person?.position_title ?? "—"}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <p className="text-sm">{p.title}</p>
                      <p className="t-secondary">
                        {PLAN_TYPE_LABEL[p.plan_type]}
                        {p.seat_id && seats.get(p.seat_id) ? ` · ${seats.get(p.seat_id)!.name}` : ""}
                        {p.language === "hinglish" ? " · Hinglish" : ""}
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">{trainer?.full_name ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{dayLabel}</TableCell>
                    <TableCell className="hidden min-w-[140px] sm:table-cell"><ProgressLine done={done} total={total} /></TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">
                      {nextTest ? (
                        <span>{nextTest.title} · {fmtDate(nextDate, "dd MMM")}</span>
                      ) : tests.length ? (
                        <span className="text-muted-foreground">{tests.map((t) => `${Math.round(Number(t.score_pct))}%`).join(", ")}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <PlanStatusBadge status={p.status} />
                        {p.extension_days > 0 ? <Badge variant="warning">+{p.extension_days} days</Badge> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
