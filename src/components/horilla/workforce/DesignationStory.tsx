import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowRight, Armchair, Ban, CheckCircle2, ChevronRight, CircleDot, ExternalLink, Info, MinusCircle, Route,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill, type StatusTone } from "@/components/ats/AtsUi";
import { usePermissions } from "@/hooks/usePermissions";
import { useDepartmentCatalog, useDesignationCatalog } from "@/hooks/hrms/useDesignationCatalog";
import { useHiringRequirements, usePositionPlanningStatus, useSeatCapacity, useStaffingMatrix, useWorkforceLookups } from "@/hooks/hrms/useWorkforcePlanning";
import { useRequirementJobs } from "@/hooks/hrms/useRequirementLifecycle";
import { buildDesignationStory, type StepState, type StoryNext } from "@/lib/hrms/designationStory";
import { GRADE_NAMES, gradeShort } from "@/lib/hrms/designations";
import { REQ_STATUS_LABEL, REQ_STATUS_TONE, formatIstDate, planningShifts, rotaOrder, shiftShort } from "@/lib/hrms/workforce";
import { cn } from "@/lib/utils";

const STORY_PARAM = "story";

/** Open a designation's journey on the current page (the page hosts <DesignationStoryHost />). */
export function useOpenDesignationStory() {
  const [params, setParams] = useSearchParams();
  return (id: string) => {
    const next = new URLSearchParams(params);
    next.set(STORY_PARAM, id);
    setParams(next, { replace: true });
  };
}

/**
 * A designation's name that opens its journey. Not a <button>: phone styles keep button text on one line,
 * and designation names must wrap. Stops the click so table rows and cards around it don't open too.
 */
export function DesignationLink({ id, children, className, label, tooltip }: {
  id?: string | null; children: ReactNode; className?: string; label?: string;
  /** Shown on hover before the hint (e.g. the full name where the text is cut short). */
  tooltip?: string;
}) {
  const open = useOpenDesignationStory();
  if (!id) return <>{children}</>;
  const go = (e: React.SyntheticEvent) => { e.stopPropagation(); e.preventDefault(); open(id); };
  return (
    <span role="button" tabIndex={0} onClick={go}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") go(e); }}
      title={tooltip ? `${tooltip} — see how it is planned and hired` : "See how this designation is planned and hired"}
      aria-label={label ? `${label}: see how it is planned and hired` : undefined}
      className={cn("cursor-pointer rounded-sm underline decoration-muted-foreground/40 decoration-dotted underline-offset-[3px] hover:text-primary hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
      {children}
    </span>
  );
}

/** Several designations ("A / B") each with its own link. */
export function DesignationLinks({ ids, titleOf, className }: { ids: string[]; titleOf: (id: string) => string | undefined; className?: string }) {
  const named = ids.map((id) => ({ id, title: titleOf(id) })).filter((x) => !!x.title);
  if (!named.length) return null;
  return (
    <>
      {named.map((x, i) => (
        <span key={x.id}>
          {i > 0 && " / "}
          <DesignationLink id={x.id} className={className} label={x.title}>{x.title}</DesignationLink>
        </span>
      ))}
    </>
  );
}

/** Mount once per page: shows the journey for ?story=<designation id>. */
export function DesignationStoryHost() {
  const [params, setParams] = useSearchParams();
  const id = params.get(STORY_PARAM);
  // Keep the last id while the sheet slides out, so it doesn't empty during the animation.
  const [shown, setShown] = useState<string | null>(id);
  useEffect(() => { if (id) setShown(id); }, [id]);
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete(STORY_PARAM);
    setParams(next, { replace: true });
  };
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && close()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
        onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement | null)?.focus?.(); }} tabIndex={-1}>
        {shown && <StoryBody id={shown} />}
      </SheetContent>
    </Sheet>
  );
}

const PLAN_TEXT: Record<string, string> = {
  planned: "Planned", no_staff_needed: "No staff needed now", undecided: "Not decided", outside: "Outside workforce planning",
};
const PLAN_TONE: Record<string, StatusTone> = { planned: "success", no_staff_needed: "neutral", undecided: "warning", outside: "neutral" };

const STEP_ICON: Record<StepState, { icon: typeof CheckCircle2; cls: string; sr: string }> = {
  done: { icon: CheckCircle2, cls: "text-success", sr: "done" },
  todo: { icon: CircleDot, cls: "text-warning", sr: "to do" },
  blocked: { icon: Ban, cls: "text-destructive", sr: "blocked" },
  skip: { icon: MinusCircle, cls: "text-muted-foreground/60", sr: "not needed" },
  info: { icon: Info, cls: "text-muted-foreground", sr: "note" },
};

function StoryBody({ id }: { id: string }) {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hrms_manage");
  const catalog = useDesignationCatalog();
  const departments = useDepartmentCatalog();
  const planning = usePositionPlanningStatus();
  const matrix = useStaffingMatrix();
  const seats = useSeatCapacity();
  const reqs = useHiringRequirements();
  const jobs = useRequirementJobs();
  // ATS jobs opened for this designation, linked to a request or not (the same check Designations makes before it leaves planning).
  const ownJobs = useQuery({
    queryKey: ["ats", "designation-jobs", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_jobs").select("id, job_code, title, status, openings")
        .eq("position_id", id).in("status", ["draft", "open", "paused"]).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
  const { data: lookups } = useWorkforceLookups();
  const shiftOrder = useMemo(() => rotaOrder(planningShifts((lookups?.shifts || []) as any[])).map((s: any) => s.name as string), [lookups?.shifts]);

  const designation = (catalog.data || []).find((p) => p.id === id) ?? null;
  const titleOf = (x?: string | null) => (catalog.data || []).find((p) => p.id === x)?.title;
  const deptName = (x?: string | null) => (departments.data || []).find((d) => d.id === x)?.name;

  const story = useMemo(() => buildDesignationStory({
    designation,
    status: planning.data?.get(id) ?? (planning.data ? { status: designation?.in_workforce_planning === false ? "outside" : "undecided", line_count: 0 } : null),
    lines: matrix.rows,
    seats: (seats.data || []) as any[],
    requests: (reqs.data || []) as any[],
    jobsByRequest: jobs.data ?? null,
    ownJobs: ownJobs.data ?? null,
    shiftOrder,
  }), [designation, planning.data, id, matrix.rows, seats.data, reqs.data, jobs.data, ownJobs.data, shiftOrder]);

  // Wait for everything the checklist adds up, so a step never shows "none" just because its rows haven't arrived.
  const loading = catalog.isLoading || matrix.isLoading || planning.isLoading || reqs.isLoading || seats.isLoading;
  const failed = [catalog, matrix, planning, reqs, seats].filter((q) => q.isError && !q.data);
  if (loading) {
    return (
      <div className="space-y-3 p-5">
        <SheetTitle className="sr-only">Designation journey</SheetTitle>
        <SheetDescription className="sr-only">Loading how this designation is planned and hired…</SheetDescription>
        <Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (failed.length) {
    return (
      <div className="space-y-3 p-5">
        <SheetTitle>Couldn't load this designation's journey</SheetTitle>
        <SheetDescription>Some planning figures didn't load, so its steps can't be added up. Try again in a moment.</SheetDescription>
        <Button size="sm" variant="outline" onClick={() => failed.forEach((q) => q.refetch())}>Try again</Button>
      </div>
    );
  }
  if (!designation) {
    return (
      <div className="space-y-2 p-5">
        <SheetTitle>Designation not found</SheetTitle>
        <SheetDescription>It may have been deleted. Designations are listed on Organization › Designations.</SheetDescription>
      </div>
    );
  }

  const st = planning.data?.get(id)?.status ?? (designation.in_workforce_planning === false ? "outside" : "undecided");
  const go = (to: string) => navigate(to);
  const t = story.totals;
  const facts = [
    designation.department_id ? deptName(designation.department_id) ?? "Department" : "No department",
    designation.hierarchy_level ? `${gradeShort(designation.hierarchy_level)}${GRADE_NAMES[designation.hierarchy_level] ? ` ${GRADE_NAMES[designation.hierarchy_level]}` : ""}` : null,
    designation.reports_to_position_id ? `reports to ${titleOf(designation.reports_to_position_id) ?? "a removed designation"}` : "top of the structure",
  ].filter(Boolean).join(" · ");

  return (
    <>
      <SheetHeader className="space-y-1 border-b border-border px-5 py-4 text-left">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Route className="h-3.5 w-3.5" aria-hidden /> Designation journey
        </p>
        <SheetTitle className="pr-6 text-lg leading-tight">{designation.title}</SheetTitle>
        <SheetDescription className="text-sm">{facts}</SheetDescription>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <StatusPill tone={PLAN_TONE[st] ?? "neutral"}>
            {PLAN_TEXT[st] ?? st}{st === "planned" ? ` · ${planning.data?.get(id)?.line_count ?? story.lines.length} line${(planning.data?.get(id)?.line_count ?? story.lines.length) === 1 ? "" : "s"}` : ""}
          </StatusPill>
          {designation.is_active === false && <StatusPill tone="warning">Tentative</StatusPill>}
        </div>
      </SheetHeader>

      <div className="space-y-5 px-5 py-4">
        <NextStep next={story.next} canManage={canManage} designationId={id} departmentId={designation.department_id} go={go}
          tentative={designation.is_active === false}
          requestNo={(rid) => (story.openRequests.find((q) => q.id === rid)?.requirement_no ?? undefined)}
          jobCode={(jid) => story.jobs.find((j) => j.id === jid)?.job_code ?? undefined} />

        <section aria-label="Where it stands" className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where it stands</h3>
          <ol className="relative space-y-0">
            {story.steps.map((s, i) => {
              const ic = STEP_ICON[s.state];
              const Icon = ic.icon;
              return (
                <li key={s.key} className="grid grid-cols-[1.25rem_minmax(0,7.5rem)_minmax(0,1fr)] items-start gap-x-2 py-1.5">
                  <span className="relative flex justify-center">
                    <Icon className={cn("h-4 w-4", ic.cls)} aria-hidden />
                    {i < story.steps.length - 1 && <span aria-hidden className="absolute left-1/2 top-5 h-[calc(100%+0.25rem)] w-px -translate-x-1/2 bg-border" />}
                  </span>
                  <span className="text-sm font-medium text-foreground">{s.label}<span className="sr-only"> ({ic.sr})</span></span>
                  <span className={cn("text-sm", s.state === "blocked" ? "text-destructive" : s.state === "todo" ? "text-foreground" : "text-muted-foreground")}>{s.text}</span>
                </li>
              );
            })}
          </ol>
          {jobs.isError && !jobs.data && <p className="text-xs text-destructive">Couldn't load the ATS jobs, so the ATS step is unknown.</p>}
        </section>

        {st !== "outside" && story.desks.length > 0 && (
          <section aria-label="Desks" className="space-y-2">
            <SectionTitle title="Desks" to="/hrms/workforce-planning/capacity-seats" linkLabel="Desks" />
            <ul className="space-y-1.5">
              {story.desks.map((d) => {
                const desks = Number(d.physical_seats) || 0;
                const usable = d.max_operational_capacity != null && Number(d.max_operational_capacity) !== desks ? Number(d.max_operational_capacity) : null;
                const others = (d.eligible_position_ids?.length ? d.eligible_position_ids : d.position_id ? [d.position_id] : []).filter((x) => x !== id);
                return (
                  <li key={d.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                    <p className="flex flex-wrap items-center gap-x-1.5 text-foreground">
                      <Armchair className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      <span className="font-medium">{desks} desk{desks === 1 ? "" : "s"}</span>
                      {usable != null && <span className="text-muted-foreground">({usable} usable)</span>}
                      {!d.position_id && !(d.eligible_position_ids?.length) && <span className="text-muted-foreground">· whole department</span>}
                      {others.length > 0 && <span className="text-muted-foreground">· shared with {others.map((x) => titleOf(x) ?? "another designation").join(", ")}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {d.sets.length
                        ? <>Sets the required number on {d.sets.map((x) => `${shiftShort(x.shift)} ${x.required}`).join(" · ")}</>
                        : "No line of this designation follows these desks."}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {st !== "outside" && (
          <section aria-label="Staffing lines" className="space-y-2">
            <SectionTitle title="Staffing lines" to="/hrms/workforce-planning/staffing-plan" linkLabel="Staffing plan" />
            {story.lines.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                No staffing line yet{st === "planned" ? "" : " — so nobody can hire for it"}.
              </p>
            ) : (
              <>
              <ul className="divide-y divide-border rounded-lg border border-border sm:hidden">
                {story.lines.map((l) => {
                  const way = Math.max(0, l.staffingGap) - l.netHiringRequirement;
                  return (
                    <li key={l.plan_id}>
                      <Link to={`/hrms/workforce-planning/staffing-plan?line=${l.plan_id}`} className="block px-3 py-2 text-sm hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-medium text-foreground">{l.shiftLabel.replace(/ Shift$/, "")}{l.shared ? " (shared)" : ""}</span>
                          <span className={cn("text-xs font-semibold tabular-nums", l.netHiringRequirement > 0 ? "text-destructive" : "text-success")}>{l.netHiringRequirement} still to find</span>
                        </span>
                        <span className="block text-xs text-muted-foreground">{l.current_hc} of {l.required_hc} on roll{way ? ` · ${way} on the way` : ""}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">Shift</th>
                      <th className="px-2 py-1.5 text-right font-medium">Required</th>
                      <th className="px-2 py-1.5 text-right font-medium">On roll</th>
                      <th className="px-2 py-1.5 text-right font-medium">On the way</th>
                      <th className="px-3 py-1.5 text-right font-medium">Still to find</th>
                    </tr>
                  </thead>
                  <tbody>
                    {story.lines.map((l) => {
                      const way = Math.max(0, l.staffingGap) - l.netHiringRequirement;
                      return (
                        <tr key={l.plan_id} className="cursor-pointer border-t border-border/60 hover:bg-muted/30" onClick={() => go(`/hrms/workforce-planning/staffing-plan?line=${l.plan_id}`)}>
                          <td className="px-3 py-1.5">
                            <Link to={`/hrms/workforce-planning/staffing-plan?line=${l.plan_id}`} onClick={(e) => e.stopPropagation()}
                              className="rounded-sm text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              {l.shiftLabel.replace(/ Shift$/, "")}
                            </Link>
                            {l.shared && <span className="ml-1 text-[11px] text-muted-foreground">(shared)</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{l.required_hc}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{l.current_hc}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{way || "—"}</td>
                          <td className={cn("px-3 py-1.5 text-right font-semibold tabular-nums", l.netHiringRequirement > 0 ? "text-destructive" : "text-success")}>{l.netHiringRequirement || "0"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {story.lines.length > 1 && (
                    <tfoot className="border-t border-border bg-muted/30 font-medium">
                      <tr>
                        <td className="px-3 py-1.5 text-xs uppercase tracking-wide text-muted-foreground">Total</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{t.required}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{t.onRoll}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{t.onTheWay || "—"}</td>
                        <td className={cn("px-3 py-1.5 text-right tabular-nums", t.stillToFind > 0 ? "text-destructive" : "text-success")}>{t.stillToFind}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              </>
            )}
            {story.lines.some((l) => l.shared) && (
              <p className="text-xs text-muted-foreground">A shared line counts several designations against one required number.</p>
            )}
            {t.extra > 0 && <p className="text-xs text-muted-foreground">{t.extra} extra on roll on a line that is already full — they don't fill another shift's gap.</p>}
          </section>
        )}

        {(story.openRequests.length > 0 || story.closedRequests > 0) && (
          <section aria-label="Hiring requests" className="space-y-2">
            <SectionTitle title="Hiring requests" to="/hrms/workforce-planning/hiring-requirements" linkLabel="Hiring requests" />
            {story.openRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open request.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {story.openRequests.map((q: any) => {
                  const line = story.lines.find((l) => l.plan_id === q.staffing_plan_id);
                  const live = story.jobs.filter((j) => j.requestIds.includes(q.id));
                  return (
                    <li key={q.id}>
                      <Link to={`/hrms/workforce-planning/hiring-requirements?req=${q.id}`}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 px-3 py-2 text-sm hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none">
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-mono text-xs text-muted-foreground">{q.requirement_no}</span>
                            <StatusPill tone={REQ_STATUS_TONE[q.status] ?? "neutral"}>{REQ_STATUS_LABEL[q.status] ?? q.status}</StatusPill>
                            <span className="text-foreground">
                              {q.number_required} {line ? `for ${shiftShort(line.shiftLabel)}` : `${Number(q.number_required) === 1 ? "person" : "people"}${q.staffing_plan_id ? "" : " · not on a staffing line"}`}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {q.positions_filled ? `${q.positions_filled} filled · ` : ""}{q.source === "capacity_occupancy" ? "raised automatically" : q.source === "employee_separation" ? "replacement" : q.source === "department_request" ? "department request" : "raised by hand"}
                            {q.target_joining_date ? ` · target ${formatIstDate(q.target_joining_date)}` : ""}
                            {live.length ? ` · ${live.map((j) => j.job_code).join(", ")}` : ""}
                          </span>
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {story.closedRequests > 0 && (
              <p className="text-xs text-muted-foreground">{story.closedRequests} earlier request{story.closedRequests === 1 ? "" : "s"} closed (filled, rejected or cancelled).</p>
            )}
          </section>
        )}

        {(story.jobs.length > 0 || story.otherJobs.length > 0) && (
          <section aria-label="ATS jobs" className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ATS jobs</h3>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {[...story.jobs, ...story.otherJobs.map((j) => ({ ...j, requestIds: [] as string[] }))].map((j) => (
                <li key={j.id}>
                  <Link to={`/hrms/ats/jobs/${j.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none">
                    <span className="font-mono text-xs text-muted-foreground">{j.job_code}</span>
                    <StatusPill tone={j.status === "open" ? "success" : "warning"}>{j.status === "open" ? "Open" : "Paused"}</StatusPill>
                    <span className="text-foreground">{j.openings ?? 0} opening{j.openings === 1 ? "" : "s"}</span>
                    <span className="text-xs text-muted-foreground">
                      {j.requestIds.length ? `for ${j.requestIds.length} request${j.requestIds.length === 1 ? "" : "s"}` : "no open request of this designation is linked"}
                    </span>
                    <ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            {ownJobs.isError && !ownJobs.data && <p className="text-xs text-destructive">Couldn't check for other ATS jobs opened for this designation.</p>}
          </section>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button asChild variant="outline" size="sm"><Link to="/hrms/organization?tab=designations">Organization › Designations</Link></Button>
          {st !== "outside" && <Button asChild variant="outline" size="sm"><Link to="/hrms/workforce-planning/staffing-plan">Staffing plan</Link></Button>}
        </div>
      </div>
    </>
  );
}

function SectionTitle({ title, to, linkLabel }: { title: string; to: string; linkLabel: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <Link to={to} className="inline-flex items-center gap-0.5 rounded-sm text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {linkLabel} <ArrowRight className="h-3 w-3" aria-hidden />
      </Link>
    </div>
  );
}

function NextStep({ next, canManage, designationId, departmentId, go, requestNo, jobCode, tentative }: {
  next: StoryNext; canManage: boolean; designationId: string; departmentId: string | null; go: (to: string) => void; tentative?: boolean;
  requestNo: (id: string) => string | undefined; jobCode: (id: string) => string | undefined;
}) {
  const decideTo = `/hrms/organization?tab=designations&planning=undecided${departmentId ? `&department=${departmentId}` : ""}`;
  const planTo = `/hrms/workforce-planning/staffing-plan?plan_role=${designationId}`;
  const reqTo = (id: string) => `/hrms/workforce-planning/hiring-requirements?req=${id}`;
  const lineTo = (id: string) => `/hrms/workforce-planning/staffing-plan?line=${id}`;
  const actions: { label: string; to: string; primary?: boolean }[] = [];
  switch (next.kind) {
    case "decide":
      if (canManage && !tentative) actions.push({ label: "Plan its lines", to: planTo, primary: true });
      actions.push({ label: "Decide on Designations", to: decideTo, primary: tentative || !canManage });
      break;
    case "plan":
      if (canManage && !tentative) actions.push({ label: "Plan its lines", to: planTo, primary: true });
      if (tentative) actions.push({ label: "Open Designations", to: "/hrms/organization?tab=designations", primary: true });
      break;
    case "approve": case "job": case "draft":
      if (next.requestId) actions.push({ label: `Open ${requestNo(next.requestId) ?? "the request"}`, to: reqTo(next.requestId), primary: true });
      break;
    case "raise": case "request":
      if (next.planId) actions.push({ label: "Open the line", to: lineTo(next.planId), primary: true });
      break;
    case "recruit":
      if (next.jobId) actions.push({ label: `Open ${jobCode(next.jobId) ?? "the job"} in ATS`, to: `/hrms/ats/jobs/${next.jobId}`, primary: true });
      break;
    case "join":
      actions.push({ label: "Open onboarding", to: "/hrms/onboarding-pipeline" });
      break;
    case "outside":
      actions.push({ label: "Open Designations", to: "/hrms/organization?tab=designations" });
      break;
  }
  const done = next.kind === "staffed";
  const blocked = next.kind === "decide" || next.kind === "plan";
  return (
    <section aria-label="Next step"
      className={cn("rounded-lg border p-3", done ? "border-success/30 bg-success/5" : blocked ? "border-warning/40 bg-warning/10" : "border-primary/30 bg-primary/5")}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{done ? "All good" : "Next step"}</p>
      <p className="mt-1 text-sm text-foreground">{next.text}</p>
      {tentative && (next.kind === "decide" || next.kind === "plan") && (
        <p className="mt-1 text-xs text-muted-foreground">It is tentative: mark it active on Designations before planning its lines.</p>
      )}
      {!canManage && !tentative && (next.kind === "decide" || next.kind === "plan") && (
        <p className="mt-1 text-xs text-muted-foreground">An HRMS manager plans lines and decides designations.</p>
      )}
      {actions.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a.label} size="sm" variant={a.primary ? "default" : "outline"} onClick={() => go(a.to)}>{a.label}</Button>
          ))}
        </div>
      )}
    </section>
  );
}
