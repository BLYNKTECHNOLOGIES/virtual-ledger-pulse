import { useMemo } from "react";
import { useHeadcountPlans, useHiringRequirements, useSeatCapacity, useUnplannedScopes, useWorkforceTrainees } from "@/hooks/hrms/useWorkforcePlanning";
import type { StaffingDerived } from "@/lib/hrms/workforce";

/** Planning alerts shared by the Staffing Plan, Overview and Capacity pages. */
export function useWorkforceAlerts(rows: StaffingDerived[]) {
  const { data: seats = [] } = useSeatCapacity();
  const { data: plans = [] } = useHeadcountPlans();
  const { data: unplanned = [] } = useUnplannedScopes();
  const trainees = useWorkforceTrainees();
  const { data: requirements = [] } = useHiringRequirements();

  return useMemo(() => {
    const linkedSeatIds = new Set((plans as any[]).map((p) => p.seat_capacity_id).filter(Boolean));
    const desksWithoutLine = (seats as any[]).filter((s) => !s.is_training_only && !linkedSeatIds.has(s.id));
    const traineesWithoutShift = (trainees.data || []).filter((t) => !t.post_training_shift_id);
    const overRequested = rows.filter((r) => r.over_requested_hc > 0);
    const paused = rows.filter((r) => !!r.auto_paused_at);
    const activePlanIds = new Set((plans as any[]).map((p) => p.id));
    const { unlinked, onInactiveLine } = requirementLineIssues(requirements as any[], plans as any[], activePlanIds);
    return {
      desksWithoutLine,
      unplanned: unplanned as any[],
      traineesWithoutShift,
      overRequested,
      paused,
      unlinked,
      onInactiveLine,
      traineesError: trainees.isError,
      count: desksWithoutLine.length + (unplanned as any[]).length + traineesWithoutShift.length + overRequested.length
        + paused.length + unlinked.length + onInactiveLine.length,
    };
  }, [seats, plans, unplanned, trainees.data, trainees.isError, rows, requirements]);
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
