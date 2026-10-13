import { useMemo } from "react";
import { useHeadcountPlans, useHiringRequirements, useSeatCapacity, useUnplannedScopes, useWorkforceTrainees } from "@/hooks/hrms/useWorkforcePlanning";
import type { StaffingDerived } from "@/lib/hrms/workforce";

/** Planning alerts shared by the Staffing Plan, Overview and Capacity pages. */
export interface AlertScope { departmentId?: string; positionId?: string }

/**
 * rows should already be filtered by the page; scope narrows the alerts that sit on no line
 * (desk groups, unplanned people, trainees, unlinked requirements) by department and role.
 */
export function useWorkforceAlerts(rows: StaffingDerived[], scope?: AlertScope) {
  const { data: seats = [] } = useSeatCapacity();
  const { data: plans = [] } = useHeadcountPlans();
  const { data: unplanned = [] } = useUnplannedScopes();
  const trainees = useWorkforceTrainees();
  const { data: requirements = [] } = useHiringRequirements();

  const dep = scope?.departmentId && scope.departmentId !== "all" ? scope.departmentId : null;
  const pos = scope?.positionId && scope.positionId !== "all" ? scope.positionId : null;
  return useMemo(() => {
    const inScope = (d?: string | null, roles?: (string | null | undefined)[]) =>
      (!dep || d === dep) && (!pos || (roles ?? []).includes(pos));
    const linkedSeatIds = new Set((plans as any[]).map((p) => p.seat_capacity_id).filter(Boolean));
    const desksWithoutLine = (seats as any[]).filter((s) => !s.is_training_only && !linkedSeatIds.has(s.id)
      && inScope(s.department_id, seatRoleIds(s).length ? seatRoleIds(s) : [pos]));
    const traineesWithoutShift = (trainees.data || []).filter((t) => !t.post_training_shift_id && inScope(t.department_id, [t.position_id]));
    const unplannedIn = (unplanned as any[]).filter((u) => inScope(u.department_id, [u.position_id]));
    const overRequested = rows.filter((r) => r.over_requested_hc > 0);
    const paused = rows.filter((r) => !!r.auto_paused_at);
    const activePlanIds = new Set((plans as any[]).map((p) => p.id));
    const scopedReqs = (requirements as any[]).filter((r) => inScope(r.department_id, [r.position_id]));
    const { unlinked, onInactiveLine } = requirementLineIssues(scopedReqs, plans as any[], activePlanIds);
    const seatFull = rows.filter((r) => r.follow_desks && (r.operational_capacity ?? 0) > 0 && r.current_hc === r.operational_capacity);
    return {
      desksWithoutLine,
      unplanned: unplannedIn,
      seatFull,
      traineesWithoutShift,
      overRequested,
      paused,
      unlinked,
      onInactiveLine,
      traineesError: trainees.isError,
      count: desksWithoutLine.length + unplannedIn.length + seatFull.length + traineesWithoutShift.length + overRequested.length
        + paused.length + unlinked.length + onInactiveLine.length,
    };
  }, [seats, plans, unplanned, trainees.data, trainees.isError, rows, requirements, dep, pos]);
}

export function seatRoleIds(seat: any): string[] {
  return Array.isArray(seat?.eligible_position_ids) && seat.eligible_position_ids.length
    ? seat.eligible_position_ids
    : seat?.position_id
      ? [seat.position_id]
      : [];
}

const OPEN_STATUSES = ["draft", "pending_approval", "approved", "recruitment_active", "partially_fulfilled"];

/** Open requirements of planned roles with no line, and approved/recruiting ones left on an inactive line. */
export function requirementLineIssues(requirements: any[], activePlans: any[], activePlanIds = new Set(activePlans.map((p) => p.id))) {
  const hasLine = (r: any) => activePlans.some((p) => p.department_id === r.department_id &&
    (p.eligible_position_ids?.length ? p.eligible_position_ids.includes(r.position_id) : p.position_id === r.position_id));
  const open = requirements.filter((r) => OPEN_STATUSES.includes(r.status));
  return {
    unlinked: open.filter((r) => !r.staffing_plan_id && hasLine(r)),
    onInactiveLine: open.filter((r) => r.staffing_plan_id && !activePlanIds.has(r.staffing_plan_id)
      && ["approved", "recruitment_active", "partially_fulfilled"].includes(r.status)),
  };
}
