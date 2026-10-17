import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHiringRequirements, usePositionPlanningStatus, useWorkforceLookups, useWorkforceTrainees, type TraineeRow } from "@/hooks/hrms/useWorkforcePlanning";
import { useWorkforceAlerts, seatRoleIds, type AlertScope } from "@/hooks/hrms/useWorkforceAlerts";
import { useOverdueJoiners, useUpcomingShiftMoves } from "@/hooks/hrms/useWorkforceTiming";
import { useLeavingSoon } from "@/hooks/hrms/useWorkforceRepair";
import { useRequirementJobs } from "@/hooks/hrms/useRequirementLifecycle";
import { useLinkableJobs } from "@/lib/ats/jobRequirements";
import {
  daysUntil, findRebalances, formatIstDate, istToday, pauseText, trainingEnded, type StaffingDerived,
} from "@/lib/hrms/workforce";

export type AttentionSeverity = "high" | "medium" | "low";
export type AttentionTopic = "hiring" | "people" | "desks" | "plan";

export type AttentionAction =
  | { kind: "line"; label: string; planId: string }
  | { kind: "requirement"; label: string; reqId: string }
  | { kind: "approve"; label: string; req: any }
  | { kind: "reject"; label: string; req: any }
  | { kind: "link"; label: string; to: string }
  | { kind: "plan-desks"; label: string; seat: any }
  | { kind: "move-training"; label: string; trainee: TraineeRow }
  | { kind: "resume"; label: string; planId: string };

export interface AttentionItem {
  key: string;
  title: string;
  detail?: string;
  actions: AttentionAction[];
}

export interface AttentionGroup {
  key: string;
  severity: AttentionSeverity;
  topic: AttentionTopic;
  title: string;
  /** One line under the title (what to do). */
  hint: string;
  items: AttentionItem[];
  /** Where the whole list lives. */
  cta?: { label: string; to: string };
  /** Shown only to HRMS managers (their items are actions). */
  managersOnly?: boolean;
}

const OPEN_STATUSES = ["pending_approval", "approved", "recruitment_active", "partially_fulfilled"];
const HIRING_STATUSES = ["approved", "recruitment_active", "partially_fulfilled"];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Open ATS jobs each approved requirement could join instead of a new posting (WF6's rule: same
 * department, the job's role on the requirement's line, a job shift on the line). One shared query.
 */
export function useHiringLinkableJobs() {
  const reqs = useHiringRequirements();
  const hiring = ((reqs.data ?? []) as any[]).filter((r) => HIRING_STATUSES.includes(r.status));
  return useLinkableJobs(hiring);
}

/**
 * Everything on the Workforce screens that needs a person to act, in one list. rows are the page's
 * (already filtered) lines; scope narrows items that sit on no line by department and role.
 */
export function useWorkforceAttention(rows: StaffingDerived[], opts: { scope?: AlertScope; shiftFiltered?: boolean; shift?: string; canManage: boolean }) {
  const { scope, canManage } = opts;
  const alerts = useWorkforceAlerts(rows, scope);
  const reqs = useHiringRequirements();
  const reqJobs = useRequirementJobs();
  const linkable = useHiringLinkableJobs();
  const trainees = useWorkforceTrainees();
  const overdue = useOverdueJoiners();
  const leaving = useLeavingSoon();
  const { data: lookups } = useWorkforceLookups();
  const planning = usePositionPlanningStatus();
  // Titles of every position (tentative ones too), for roles nobody has decided on yet.
  const allPositions = useQuery({
    // Under "hr_positions" so saving a position on the Positions page refreshes it too.
    queryKey: ["hr_positions", "workforce-attention"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("positions").select("id, title, department_id, is_active");
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; department_id: string | null; is_active: boolean | null }[];
    },
  });

  // Trainees whose training ended and whose move to a working shift isn't booked yet.
  const endedIds = useMemo(() => (trainees.data ?? []).filter((t) => trainingEnded(t.training_end_date, istToday())).map((t) => t.employee_id), [trainees.data]);
  const upcoming = useUpcomingShiftMoves(endedIds);

  const dep = scope?.departmentId && scope.departmentId !== "all" ? scope.departmentId : null;
  const pos = scope?.positionId && scope.positionId !== "all" ? scope.positionId : null;

  return useMemo(() => {
    const today = istToday();
    const lineById = new Map(rows.map((r) => [r.plan_id, r]));
    const title = (id?: string | null) => (lookups?.positions ?? []).find((p: any) => p.id === id)?.title;
    const lineName = (r: StaffingDerived) => `${r.position_title ?? "Designation"} · ${r.shiftLabel}`;
    const inScope = (d?: string | null, p?: string | null) => (!dep || d === dep) && (!pos || p === pos);
    // With a shift filter, things that sit on no line still show — marked "all shifts" (they can't be placed in one).
    const allShifts = opts.shiftFiltered ? " · all shifts" : "";
    const groups: AttentionGroup[] = [];
    const requirements = ((reqs.data ?? []) as any[]).filter((r) =>
      r.staffing_plan_id && lineById.has(r.staffing_plan_id) ? true : !r.staffing_plan_id && inScope(r.department_id, r.position_id));
    const noLine = (r: { staffing_plan_id?: string | null; plan_id?: string | null }) => !(r.staffing_plan_id ?? r.plan_id);
    const reqLabel = (r: any) => {
      const line = r.staffing_plan_id ? lineById.get(r.staffing_plan_id) : undefined;
      return `${r.requirement_no} · ${r.positions?.title ?? "Designation"} · ${line?.shiftLabel ?? r.shift_label ?? "Any shift"}`;
    };

    // 1. Requests waiting for approval.
    const pending = requirements.filter((r) => r.status === "pending_approval");
    if (pending.length) groups.push({
      key: "approvals", severity: "high", topic: "hiring",
      title: `${plural(pending.length, "request")} waiting for approval`,
      hint: "Approve or reject them so recruitment can start.",
      cta: { label: "Review", to: "/hrms/workforce-planning/hiring-requirements?tab=pending" },
      items: pending.map((r) => ({
        key: r.id, title: reqLabel(r),
        detail: `${(r.adds_headcount ?? 0) > 0 ? `adds +${r.adds_headcount}` : `${r.number_required} needed`} · target ${formatIstDate(r.target_joining_date)} · ${r.source === "capacity_occupancy" ? "raised automatically" : `raised by ${r.requested_by_name || "—"}`}${noLine(r) ? allShifts : ""}`,
        actions: canManage
          ? [{ kind: "approve", label: "Approve", req: r }, { kind: "reject", label: "Reject", req: r }, { kind: "requirement", label: "Open", reqId: r.id }] as AttentionAction[]
          : [{ kind: "requirement", label: "Open", reqId: r.id }] as AttentionAction[],
      })),
    });

    // 2. Approved requirements that no ATS job is recruiting for.
    if (reqJobs.data) {
      const noJob = requirements.filter((r) => HIRING_STATUSES.includes(r.status)
        && !(reqJobs.data!.get(r.id) ?? []).some((j: any) => ["open", "paused"].includes(j.status)));
      if (noJob.length) groups.push({
        key: "no-job", severity: "high", topic: "hiring",
        title: `${plural(noJob.length, "approved request")} with no ATS job`,
        hint: "Nobody is recruiting for these yet. Link an open job or create one.",
        cta: { label: "Review", to: "/hrms/workforce-planning/hiring-requirements?tab=nojob" },
        items: noJob.map((r) => {
          const job = linkable.data?.get(r.id)?.[0];
          const left = Math.max(0, (r.number_required ?? 0) - (r.positions_filled ?? 0));
          const actions: AttentionAction[] = [];
          if (canManage && job) actions.push({ kind: "link", label: `Link ${job.job_code ?? "open job"}`, to: `/hrms/ats/jobs?edit=${job.id}&requirement=${r.id}` });
          if (canManage) actions.push({ kind: "link", label: job ? "New job" : "Create job", to: `/hrms/ats/jobs?new=1&requirement=${r.id}` });
          if (!canManage) actions.push({ kind: "requirement", label: "Open", reqId: r.id });
          return { key: r.id, title: reqLabel(r), detail: `${left} to hire${job ? ` · ${job.job_code ?? "A job"} "${job.title}" is open for this designation` : ""}${noLine(r) ? allShifts : ""}`, actions };
        }),
      });
    }

    // 3. Joiners past their joining date.
    const late = (overdue.data ?? []).filter((j) => !j.plan_id || lineById.has(j.plan_id));
    if (late.length) groups.push({
      key: "overdue", severity: "high", topic: "people",
      title: `${plural(late.length, "joiner")} past the joining date`,
      hint: "Still counted as joining. Change the date or cancel the onboarding.",
      items: late.map((j) => ({
        key: j.onboarding_id, title: j.full_name || "Unnamed",
        detail: `${[j.position_title, j.department_name].filter(Boolean).join(" · ")} · was due ${formatIstDate(j.date_of_joining)} (${j.days_overdue} days ago)`,
        actions: [{ kind: "link", label: "Open onboarding", to: `/hrms/onboarding-pipeline?id=${j.onboarding_id}` }],
      })),
    });

    // 4. Training finished — move to the working shift.
    const ended = (trainees.data ?? []).filter((t) => trainingEnded(t.training_end_date, today) && !upcoming.data?.get(t.employee_id)
      && (t.plan_id ? lineById.has(t.plan_id) : inScope(t.department_id, t.position_id)));
    if (ended.length) groups.push({
      key: "trained", severity: "high", topic: "people",
      title: `${plural(ended.length, "trainee")} finished training`,
      hint: "Move them to their working shift so they count on their line.",
      items: ended.map((t) => ({
        key: t.employee_id, title: t.full_name || "Trainee",
        detail: `${t.position_title ?? "Designation"} · ended ${formatIstDate(t.training_end_date)} · to ${t.post_training_shift_name || "shift not set"}${t.plan_id ? "" : allShifts}`,
        actions: canManage ? [{ kind: "move-training", label: "Move shift", trainee: t }] : [],
      })),
    });

    // 5. More people sitting than desks.
    const noDesk = rows.filter((r) => r.physical_seats > 0 && r.current_hc > r.physical_seats);
    if (noDesk.length) groups.push({
      key: "no-desk", severity: "high", topic: "desks",
      title: `${plural(noDesk.length, "line")} with more people than desks`,
      hint: "Add desks to the desk group or move people to another shift.",
      items: noDesk.map((r) => ({
        key: r.plan_id, title: lineName(r), detail: `${r.current_hc} on roll, ${r.physical_seats} desks — ${r.current_hc - r.physical_seats} without a desk`,
        actions: [{ kind: "line", label: "Open line", planId: r.plan_id }],
      })),
    });

    // 6. Requirements that count nowhere.
    const lineIssues = [...alerts.onInactiveLine, ...alerts.unlinked].filter((r: any) => inScope(r.department_id, r.position_id));
    if (lineIssues.length) groups.push({
      key: "needs-line", severity: "high", topic: "hiring",
      title: `${plural(lineIssues.length, "request")} not on a staffing line`,
      hint: "They count on no line until you link or move them.",
      items: lineIssues.map((r: any) => ({
        key: r.id, title: `${r.requirement_no} · ${r.positions?.title ?? "Designation"}`,
        detail: `${alerts.onInactiveLine.includes(r) ? "Its line was removed" : "Not linked to a staffing line"}${allShifts}`,
        actions: [{ kind: "requirement", label: alerts.onInactiveLine.includes(r) ? "Move" : "Link", reqId: r.id }],
      })),
    });

    // 7. Asking for more than the line needs.
    if (alerts.overRequested.length) groups.push({
      key: "over-requested", severity: "medium", topic: "hiring",
      title: `${plural(alerts.overRequested.length, "line")} asking for more than needed`,
      hint: "Open requests add up to more than the line's need. Reduce them to the line need.",
      items: alerts.overRequested.map((r) => {
        const req = requirements.find((q) => q.staffing_plan_id === r.plan_id && OPEN_STATUSES.includes(q.status));
        return {
          key: r.plan_id, title: lineName(r), detail: `${r.open_requirement_hc} requested, line needs ${r.netHiringRequirement} — ${r.over_requested_hc} too many`,
          actions: [req ? { kind: "requirement", label: "Open request", reqId: req.id } : { kind: "line", label: "Open line", planId: r.plan_id }],
        };
      }),
    });

    // 8. Same role over in one shift and short in another; plain overstaffing otherwise.
    const rebal = findRebalances(rows);
    const rebalKeys = new Set(rebal.map((h) => h.key));
    const over = rows.filter((r) => r.staffingGap < 0 && !rebalKeys.has(`${r.department_id ?? "-"}|${r.position_id ?? "-"}`));
    if (rebal.length || over.length) groups.push({
      key: "rebalance", severity: "medium", topic: "people",
      title: rebal.length ? `Move people before hiring (${plural(rebal.length, "designation")})` : `${plural(over.length, "line")} overstaffed`,
      hint: rebal.length ? "One shift has more people than required while another is short." : "More people on roll than the line requires.",
      items: [
        ...rebal.map((h) => ({ key: h.key, title: h.role, detail: h.message.replace(`${h.role}: `, ""), actions: [] as AttentionAction[] })),
        ...over.map((r) => ({ key: r.plan_id, title: lineName(r), detail: `${-r.staffingGap} more than required`, actions: [{ kind: "line", label: "Open line", planId: r.plan_id } as AttentionAction] })),
      ],
    });

    // 9. Automatic hiring paused by a decision.
    if (alerts.paused.length) groups.push({
      key: "paused", severity: "medium", topic: "hiring",
      title: `Automatic hiring paused on ${plural(alerts.paused.length, "line")}`,
      hint: "A request was rejected, cancelled or lowered. Raise it again when the need is real.",
      items: alerts.paused.map((r) => ({
        key: r.plan_id, title: lineName(r), detail: pauseText(r)?.replace(/^Automatic hiring paused( for \d+)? — /, "") ?? "",
        actions: [{ kind: "line", label: "Open line", planId: r.plan_id } as AttentionAction, ...(canManage ? [{ kind: "resume", label: "Raise again", planId: r.plan_id } as AttentionAction] : [])],
      })),
    });

    // 10. Target joining dates close or passed while still unfilled.
    const soon = requirements.filter((r) => HIRING_STATUSES.includes(r.status) && r.target_joining_date
      && daysUntil(r.target_joining_date, today) <= 15 && (r.number_required ?? 0) > (r.positions_filled ?? 0));
    if (soon.length) groups.push({
      key: "deadline", severity: "medium", topic: "hiring",
      title: `${plural(soon.length, "request")} due within 15 days`,
      hint: "The target joining date is close or has passed and people are still missing.",
      items: soon.map((r) => {
        const d = daysUntil(r.target_joining_date, today);
        return { key: r.id, title: reqLabel(r), detail: d < 0 ? `target passed ${-d} days ago` : d === 0 ? "target is today" : `target in ${d} days`, actions: [{ kind: "requirement", label: "Open", reqId: r.id }] };
      }),
    });

    // 11. People and trainees the plan doesn't cover.
    const trainShift = alerts.traineesWithoutShift.filter((t) => t.plan_id ? lineById.has(t.plan_id) : inScope(t.department_id, t.position_id));
    if (trainShift.length) groups.push({
      key: "trainee-shift", severity: "medium", topic: "people",
      title: `${plural(trainShift.length, "trainee")} without an after-training shift`,
      hint: "Set the shift they move to, so the right line counts them.",
      items: trainShift.map((t) => ({
        key: t.employee_id, title: t.full_name || "Trainee", detail: `${t.position_title ?? "Designation"} · ${t.line_label ? `covering ${t.line_label}` : `no line${allShifts}`}`,
        actions: t.plan_id ? [{ kind: "line", label: "Set shift", planId: t.plan_id }] : [],
      })),
    });
    // People on no line do have a shift: with a shift filter, only those working that shift.
    const unplannedHere = (alerts.unplanned as any[]).filter((u) => !opts.shiftFiltered || !opts.shift || u.shift_name === opts.shift);
    if (unplannedHere.length) groups.push({
      key: "unplanned-people", severity: "medium", topic: "plan",
      title: `${plural(unplannedHere.reduce((a: number, u: any) => a + (u.current_hc ?? 0), 0), "person", "people")} on no staffing line`,
      hint: "Their designation and shift have no line, so they count nowhere. Add a line or fix their shift.",
      items: unplannedHere.map((u: any, i: number) => ({
        key: `${u.department_id}-${u.position_id}-${u.shift_id}-${i}`,
        title: `${u.position_title ?? "No designation"} · ${u.shift_name ?? "No shift"}`, detail: `${u.department_name ?? "No department"} · ${u.current_hc} on roll`,
        actions: canManage && u.position_id ? [{ kind: "link", label: "Add line", to: `/hrms/workforce-planning/staffing-plan?plan_role=${u.position_id}${u.shift_id ? `&plan_shift=${u.shift_id}` : ""}` }] : [],
      })),
    });

    // 12. Roles in planning nobody has decided on (no line, not "no staff needed now"): nobody can hire for them yet.
    if (planning.data && allPositions.data) {
      const roles = allPositions.data.filter((p) => planning.data!.get(p.id)?.status === "undecided" && inScope(p.department_id, p.id))
        .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      if (roles.length) {
        const dn = (id?: string | null) => ((lookups?.departments ?? []) as any[]).find((d) => d.id === id)?.name ?? "No department";
        groups.push({
          key: "unplanned-roles", severity: "medium", topic: "plan",
          title: `${plural(roles.length, "designation")} in planning not decided yet`,
          hint: "Nobody can hire for them until they get a staffing line. Decide each one: plan its lines, \"no staff needed now\", or out of planning.",
          cta: { label: "Decide", to: "/hrms/organization?tab=designations&planning=undecided" },
          items: roles.map((p) => ({
            key: p.id, title: p.title, detail: `${dn(p.department_id)}${p.is_active === false ? " · tentative" : ""}${allShifts}`,
            actions: canManage ? [{ kind: "link", label: "Plan lines", to: `/hrms/workforce-planning/staffing-plan?plan_role=${p.id}` } as AttentionAction] : [],
          })),
        });
      }
    }

    // 13. Desk groups nobody plans.
    if (alerts.desksWithoutLine.length) groups.push({
      key: "desks-no-line", severity: "medium", topic: "desks",
      title: `${plural(alerts.desksWithoutLine.length, "desk group")} with no staffing line`,
      hint: "These desks aren't planned in any shift.",
      items: alerts.desksWithoutLine.map((s: any) => ({
        key: s.id, title: seatRoleIds(s).map(title).filter(Boolean).join(" / ") || "Whole department",
        detail: `${s.departments?.name ?? "—"} · ${s.physical_seats} desk${s.physical_seats === 1 ? "" : "s"}${allShifts}`,
        actions: canManage ? [{ kind: "plan-desks", label: "Plan these desks", seat: s }] : [],
      })),
    });

    // 14. Leaving soon.
    const leavers = (leaving.data ?? []).filter((p) => p.plan_id ? lineById.has(p.plan_id) : inScope(p.department_id, p.position_id));
    if (leavers.length) groups.push({
      key: "leaving", severity: "low", topic: "people",
      title: `${plural(leavers.length, "person", "people")} leaving (on notice)`,
      hint: "Plan replacements before their last day.",
      cta: { label: "Forecast", to: "/hrms/workforce-planning/forecast" },
      items: leavers.slice().sort((a, b) => (a.last_working_day ?? "9").localeCompare(b.last_working_day ?? "9")).map((p) => {
        const line = p.plan_id ? lineById.get(p.plan_id) : undefined;
        return {
          key: p.employee_id, title: line ? lineName(line) : `${title(p.position_id) ?? "Designation"} · not on a staffing line`,
          detail: `${p.last_working_day ? `last day ${formatIstDate(p.last_working_day)}` : "last day not set"}${line ? "" : allShifts}`,
          actions: line ? [{ kind: "line", label: "Open line", planId: line.plan_id } as AttentionAction] : [],
        };
      }),
    });

    // 15. Lines exactly at their desks (100% occupancy is the goal; adding people needs desks first).
    const full = rows.filter((r) => r.follow_desks && (r.operational_capacity ?? 0) > 0 && r.current_hc === r.operational_capacity);
    if (full.length) groups.push({
      key: "full-desks", severity: "low", topic: "desks",
      title: `${plural(full.length, "line")} at full desks`,
      hint: "Every desk is used. Adding people to these lines needs more desks first.",
      items: full.map((r) => ({ key: r.plan_id, title: lineName(r), detail: `${r.current_hc} of ${r.operational_capacity} desks`, actions: [{ kind: "line", label: "Open line", planId: r.plan_id }] })),
    });

    const visible = groups.filter((g) => !g.managersOnly || canManage);
    const order: Record<AttentionSeverity, number> = { high: 0, medium: 1, low: 2 };
    visible.sort((a, b) => order[a.severity] - order[b.severity]);
    return {
      groups: visible,
      /** Topics (not single items) that need someone to act. */
      actionable: visible.filter((g) => g.severity !== "low").length,
      loading: reqs.isLoading || trainees.isLoading,
      error: reqs.isError || trainees.isError || overdue.isError || leaving.isError || reqJobs.isError,
    };
  }, [rows, alerts, reqs.data, reqs.isLoading, reqs.isError, reqJobs.data, reqJobs.isError, linkable.data, trainees.data, trainees.isLoading, trainees.isError,
      upcoming.data, overdue.data, overdue.isError, leaving.data, leaving.isError, lookups, planning.data, allPositions.data, dep, pos, canManage, opts.shiftFiltered, opts.shift]);
}
