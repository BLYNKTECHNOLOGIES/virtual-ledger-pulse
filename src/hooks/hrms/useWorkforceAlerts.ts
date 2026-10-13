import { useMemo } from "react";
import { useHeadcountPlans, useSeatCapacity, useUnplannedScopes, useWorkforceTrainees } from "@/hooks/hrms/useWorkforcePlanning";
import type { StaffingDerived } from "@/lib/hrms/workforce";

/** Planning alerts shared by the Staffing Plan, Overview and Capacity pages. */
export function useWorkforceAlerts(rows: StaffingDerived[]) {
  const { data: seats = [] } = useSeatCapacity();
  const { data: plans = [] } = useHeadcountPlans();
  const { data: unplanned = [] } = useUnplannedScopes();
  const trainees = useWorkforceTrainees();

  return useMemo(() => {
    const linkedSeatIds = new Set((plans as any[]).map((p) => p.seat_capacity_id).filter(Boolean));
    const desksWithoutLine = (seats as any[]).filter((s) => !s.is_training_only && !linkedSeatIds.has(s.id));
    const traineesWithoutShift = (trainees.data || []).filter((t) => !t.post_training_shift_id);
    const overRequested = rows.filter((r) => r.over_requested_hc > 0);
    return {
      desksWithoutLine,
      unplanned: unplanned as any[],
      traineesWithoutShift,
      overRequested,
      traineesError: trainees.isError,
      count: desksWithoutLine.length + (unplanned as any[]).length + traineesWithoutShift.length + overRequested.length,
    };
  }, [seats, plans, unplanned, trainees.data, trainees.isError, rows]);
}

export function seatRoleIds(seat: any): string[] {
  return Array.isArray(seat?.eligible_position_ids) && seat.eligible_position_ids.length
    ? seat.eligible_position_ids
    : seat?.position_id
      ? [seat.position_id]
      : [];
}
