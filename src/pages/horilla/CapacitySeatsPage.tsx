import { useCallback, useMemo, useState } from "react";
import { GraduationCap, LayoutGrid, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { ErrorState } from "@/components/shared/ErrorState";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { WorkforceFilters } from "@/components/horilla/workforce/WorkforceFilters";
import { WorkforceAttention } from "@/components/horilla/workforce/WorkforceAttention";
import { SeatCapacityDialog } from "@/components/horilla/workforce/SeatCapacityDialog";
import { seatCountsInShift } from "@/lib/hrms/workforce";
import { OfficeSeatMap } from "@/components/horilla/workforce/OfficeSeatMap";
import {
  useHeadcountPlans,
  useSeatCapacity,
  useSeatOccupancy,
  useStaffingMatrix,
  useWorkforceLookups,
} from "@/hooks/hrms/useWorkforcePlanning";
import { EMPTY_FILTERS, matchesFilters, planningShiftId, planningShifts, rotaOrder, shiftShort, sortByOperatingOrder, type WorkforceFilterState } from "@/lib/hrms/workforce";
import { useNavigate } from "react-router-dom";
import { DeskGroupRemoveDialog } from "@/components/horilla/workforce/DeskGroupRemoveDialog";
import { WorkforceTabs } from "@/components/horilla/workforce/WorkforceChain";
import { DesignationLinks, DesignationStoryHost } from "@/components/horilla/workforce/DesignationStory";
import { cn } from "@/lib/utils";

type SeatPerson = {
  employee_id: string;
  department_id: string | null;
  job_position_id: string | null;
  /** Planning shift (a shift that "counts as" another is already mapped). */
  shift_id: string | null;
  is_training?: boolean;
  employee_type?: string | null;
  employee?: {
    first_name?: string | null;
    last_name?: string | null;
    resignation_status?: string | null;
  } | null;
};

/** People serving notice keep their desk today but it frees up shortly. */
const NOTICE_STATUSES = new Set(["notice_period", "serving_notice", "resigned"]);

function isOnNotice(person: SeatPerson) {
  return NOTICE_STATUSES.has((person.employee?.resignation_status || "").toLowerCase());
}

type ShiftLookup = {
  id: string;
  name: string;
  start_time?: string | null;
  end_time?: string | null;
};

function formatShiftTime(value?: string | null) {
  if (!value) return "—";
  const [hours = "0", minutes = "00"] = value.split(":");
  const hour = Number(hours);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minutes} ${suffix}`;
}

function occupancyTone(utilisation: number) {
  // 100% is the plan (every desk used); only more people than desks is a problem.
  return utilisation > 100 ? "bg-destructive" : "bg-primary";
}

function employeeName(person: SeatPerson) {
  const name = [person.employee?.first_name, person.employee?.last_name].filter(Boolean).join(" ").trim();
  return name || "Unnamed employee";
}

function seatAllowsPosition(seat: any, positionId: string | null) {
  const eligible = Array.isArray(seat.eligible_position_ids) ? seat.eligible_position_ids : [];
  return eligible.length > 0
    ? !!positionId && eligible.includes(positionId)
    : !seat.position_id || seat.position_id === positionId;
}

export default function CapacitySeatsPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hrms_manage");

  const [filters, setFilters] = useState<WorkforceFilterState>({ ...EMPTY_FILTERS });
  const [selectedMapShiftId, setSelectedMapShiftId] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; initial?: any }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  // Desk groups (what HR edits) first; the seat map and per-shift cards are one click away.
  const [deskView, setDeskView] = useState<"groups" | "map">("groups");

  const { data: seats = [], isLoading, isError: seatsError, error: seatsErr, refetch: refetchSeats } = useSeatCapacity();
  const { data: lookups } = useWorkforceLookups();
  const { data: people = [], isError: occupancyError, isLoading: occupancyLoading, refetch: refetchOccupancy } = useSeatOccupancy();
  const matrix = useStaffingMatrix();
  const { data: headcountPlans = [] } = useHeadcountPlans();
  const navigate = useNavigate();

  const allShifts = useMemo(() => (lookups?.shifts || []) as any[], [lookups?.shifts]);
  /** A seat's shift, mapped to its planning shift. */
  const seatShift = useCallback((seat: any): string | null => planningShiftId(allShifts, seat.shift_id), [allShifts]);

  /** Shifts flagged as training shifts in Shift settings; their people sit in the training zone. */
  const trainingShiftIds = useMemo(
    () => new Set(allShifts.filter((s) => s.is_training_shift).map((s) => s.id as string)),
    [allShifts],
  );

  /**
   * Trainees are counted once, in the training zone only. Without this they would
   * also fill a desk in their own department and be counted twice.
   */
  const traineeIds = useMemo(
    () =>
      new Set(
        (people as SeatPerson[])
          .filter((person) => person.is_training || (!!person.shift_id && trainingShiftIds.has(person.shift_id)))
          .map((person) => person.employee_id),
      ),
    [people, trainingShiftIds],
  );

  const seatMatchesPerson = useCallback(
    (seat: any, person: SeatPerson) =>
      seat.is_training_only
        ? traineeIds.has(person.employee_id) && (!seat.shift_id || person.shift_id === seatShift(seat))
        : !traineeIds.has(person.employee_id) &&
          person.department_id === seat.department_id &&
          seatAllowsPosition(seat, person.job_position_id) &&
          (!seat.shift_id || person.shift_id === seatShift(seat)),
    [traineeIds, seatShift],
  );

  /**
   * Occupancy is read straight from the people on roll. A desk is shared across
   * shifts, so a desk entry that is not tied to one shift counts the busiest
   * single shift (people sitting at the same time), while the total on roll is
   * kept alongside it.
   */
  const enriched = useMemo(
    () =>
      seats.map((s: any) => {
        const matching = (people as SeatPerson[]).filter((p) => seatMatchesPerson(s, p));
        const totalOnRoll = matching.length;
        let current = totalOnRoll;
        // The shift(s) that decide how full the group is ("-" = people with no current shift).
        let peakShiftIds: string[] = s.shift_id && seatShift(s) ? [seatShift(s) as string] : [];
        if (!s.shift_id) {
          const perShift = new Map<string, number>();
          matching.forEach((p) => {
            const k = p.shift_id ?? "-";
            perShift.set(k, (perShift.get(k) || 0) + 1);
          });
          current = perShift.size ? Math.max(...perShift.values()) : 0;
          peakShiftIds = current > 0 ? Array.from(perShift.entries()).filter(([, n]) => n === current).map(([k]) => k) : [];
        }
        const physical = s.physical_seats || 0;
        const utilisation = physical > 0 ? (current / physical) * 100 : null;
        return {
          ...s,
          currentOccupancy: current,
          peakShiftIds,
          totalOnRoll,
          availableSeats: physical - current,
          utilisation,
          shiftName: allShifts.find((x) => x.id === seatShift(s))?.name ?? s.hr_shifts?.name ?? s.shift_label ?? null,
          departmentName: s.departments?.name ?? null,
          positionTitle: Array.isArray(s.eligible_position_ids) && s.eligible_position_ids.length > 1
            ? s.eligible_position_ids
                .map((id: string) => (lookups?.positions || []).find((position) => position.id === id)?.title)
                .filter(Boolean)
                .join(" / ")
            : s.positions?.title ?? null,
        };
      }),
    [seats, people, lookups?.positions, allShifts, seatShift, seatMatchesPerson],
  );

  /**
   * Planned desks per shift come from the staffing lines linked to each desk
   * group (seat_capacity_id). "any" = a line with no shift of its own.
   */
  const plannedSeatShifts = useMemo(() => {
    const map = new Map<string, Set<string>>();
    (headcountPlans as any[]).forEach((plan) => {
      // A desk group belongs to a shift only when its line there requires more than 0.
      if (!plan.seat_capacity_id || !seatCountsInShift(plan)) return;
      const ids = [plan.shift_id, ...(plan.eligible_shift_ids || [])].filter(Boolean) as string[];
      const set = map.get(plan.seat_capacity_id) || new Set<string>();
      if (ids.length === 0) set.add("any");
      ids.forEach((id) => set.add(planningShiftId(allShifts, id)!));
      map.set(plan.seat_capacity_id, set);
    });
    return map;
  }, [headcountPlans, allShifts]);

  /**
   * Desks a group gives a shift: all of them when it is meant for that shift (its own shift, or a line plans it
   * there); otherwise only the desks people actually use then. Used by the shift cards and the seat map alike.
   */
  const deskCountInShift = useCallback((seat: any, shiftIds: string[], sitting: number) => {
    const desks = seat.physical_seats || 0;
    if (seat.is_training_only) return desks;
    const own = seatShift(seat);
    if (own && shiftIds.includes(own)) return desks;
    const planned = plannedSeatShifts.get(seat.id);
    if (planned && (planned.has("any") || shiftIds.some((id) => planned.has(id)))) return desks;
    return Math.min(desks, sitting);
  }, [seatShift, plannedSeatShifts]);

  const filtered = useMemo(
    () =>
      enriched.filter((s) => {
        if (filters.departmentId !== "all" && s.department_id !== filters.departmentId)
          return false;
        if (filters.positionId !== "all" && !seatAllowsPosition(s, filters.positionId)) return false;
        if (filters.shift !== "all") {
          // Same rule as the seat map: a desk group belongs to a shift when a line plans it there or people sit in it then.
          const sid = allShifts.find((x) => !x.planning_shift_id && x.name === filters.shift)?.id;
          const planned = plannedSeatShifts.get(s.id);
          const own = seatShift(s);
          const occupied = !!sid && (people as SeatPerson[]).some((p) => p.shift_id === sid && seatMatchesPerson(s, p));
          const inShift = !!sid && (own === sid || !!planned?.has(sid) || !!planned?.has("any") || occupied);
          if (!inShift) return false;
        }
        return true;
      }),
    [enriched, filters, allShifts, plannedSeatShifts, seatShift, people, seatMatchesPerson],
  );

  const filteredPeople = useMemo(() => {
    const unique = new Map<string, SeatPerson>();
    (people as SeatPerson[]).forEach((person) => {
      if (filtered.some((seat) => seatMatchesPerson(seat, person))) unique.set(person.employee_id, person);
    });
    return Array.from(unique.values());
  }, [filtered, people, seatMatchesPerson]);

  const shiftBreakdown = useMemo(() => {
    // One entry per planning shift; shifts that "count as" another are folded in.
    const displayShifts: Array<ShiftLookup & { memberIds: string[] }> = sortByOperatingOrder(
      allShifts.filter((shift) => !shift.planning_shift_id),
    ).map((shift) => ({ ...shift, memberIds: [shift.id] }));
    const rows = displayShifts.map((shift) => {
      const assignedPeople = filteredPeople.filter((person) => person.shift_id && shift.memberIds.includes(person.shift_id));
      const assigned = assignedPeople.length;
      // Capacity is role-scoped. A shift containing only Office Help must be
      // compared with the Office Help seat, not every desk in the office.
      const eligibleSeats = filtered.reduce((sum, seat) => {
        if (seat.shift_id && !shift.memberIds.includes(seatShift(seat)!)) return sum;
        if (seat.is_training_only) return sum + (seat.physical_seats || 0);
        const sitting = assignedPeople.filter(
          (person) =>
            !traineeIds.has(person.employee_id) &&
            person.department_id === seat.department_id &&
            seatAllowsPosition(seat, person.job_position_id),
        ).length;
        // Same rule as the seat map (deskCountInShift): a group meant for this shift brings all its desks; one that
        // only has someone sitting there outside its planned shifts brings just the desks in use.
        return sum + deskCountInShift(seat, [shift.id], sitting);
      }, 0);
      const utilisation = eligibleSeats > 0 ? (assigned / eligibleSeats) * 100 : 0;
      return {
        ...shift,
        assigned,
        seats: eligibleSeats,
        available: eligibleSeats - assigned,
        utilisation,
      };
    });
    const unassigned = filteredPeople.filter((person) => !person.shift_id).length;
    if (unassigned > 0) {
      const unassignedPeople = filteredPeople.filter((person) => !person.shift_id);
      const unassignedSeats = filtered.reduce((sum, seat) => {
        if (seat.shift_id) return sum;
        const hasMatchingAssignment = unassignedPeople.some(
          (person) =>
            !traineeIds.has(person.employee_id) &&
            person.department_id === seat.department_id &&
            seatAllowsPosition(seat, person.job_position_id),
        );
        return sum + (hasMatchingAssignment ? seat.physical_seats || 0 : 0);
      }, 0);
      rows.push({
        id: "unassigned",
        name: "Unassigned",
        start_time: null,
        end_time: null,
        memberIds: [],
        assigned: unassigned,
        seats: unassignedSeats,
        available: unassignedSeats - unassigned,
        utilisation: unassignedSeats > 0 ? (unassigned / unassignedSeats) * 100 : 0,
      });
    }
    return rows.filter((row) => row.assigned > 0 || row.seats > 0);
  }, [filtered, filteredPeople, allShifts, traineeIds, seatShift, plannedSeatShifts, deskCountInShift]);

  const totals = useMemo(() => {
    const workingSeats = filtered.filter((seat) => !seat.is_training_only);
    const physical = workingSeats.reduce((a, s) => a + (s.physical_seats || 0), 0);
    const operational = filtered.reduce(
      (a, s) => a + (s.is_training_only ? 0 : s.max_operational_capacity || s.physical_seats || 0),
      0,
    );
    const occupied = shiftBreakdown.reduce((peak, shift) => trainingShiftIds.has(shift.id) ? peak : Math.max(peak, shift.assigned), 0);
    return {
      physical,
      operational,
      occupied,
      free: Math.max(0, physical - occupied),
      utilisation: physical > 0 ? (occupied / physical) * 100 : 0,
    };
  }, [filtered, shiftBreakdown, trainingShiftIds]);

  const seatBreakdown = useMemo(() => {
    const grouped = new Map<
      string,
      { name: string; physical: number; occupied: number; onRoll: number }
    >();
    filtered.forEach((seat) => {
      const name = seat.is_training_only ? "Training room" : seat.departmentName || "Unassigned";
      const row = grouped.get(name) || { name, physical: 0, occupied: 0, onRoll: 0 };
      row.physical += seat.physical_seats || 0;
      row.occupied += seat.currentOccupancy;
      row.onRoll += seat.totalOnRoll;
      grouped.set(name, row);
    });
    return Array.from(grouped.values()).sort((a, b) => b.physical - a.physical);
  }, [filtered]);

  const planningRows = useMemo(
    () =>
      filtered
        .map((seat) => {
          const matching = filteredPeople.filter((person) =>
            seat.is_training_only
              ? traineeIds.has(person.employee_id)
              : !traineeIds.has(person.employee_id) &&
                person.department_id === seat.department_id &&
                seatAllowsPosition(seat, person.job_position_id),
          );
          const byShift = new Map<string, number>();
          matching.forEach((person) => {
            const key = person.shift_id ?? "unassigned";
            byShift.set(key, (byShift.get(key) || 0) + 1);
          });
          return { ...seat, byShift };
        })
        .sort((a, b) => b.totalOnRoll - a.totalOnRoll),
    [filtered, filteredPeople, traineeIds, trainingShiftIds],
  );

  const peakShift = useMemo(
    () => shiftBreakdown.reduce<(typeof shiftBreakdown)[number] | null>(
      (peak, shift) => (!peak || shift.assigned > peak.assigned ? shift : peak),
      null,
    ),
    [shiftBreakdown],
  );

  const mapShifts = useMemo(() => {
    // Same order as the shift cards and the table: the rota first, then the training shift and "Unassigned".
    const work = rotaOrder(shiftBreakdown.filter((x) => x.id !== "unassigned" && !trainingShiftIds.has(x.id)) as any[]);
    const ordered = [...work, ...shiftBreakdown.filter((x) => trainingShiftIds.has(x.id)), ...shiftBreakdown.filter((x) => x.id === "unassigned")];
    return ordered.map((shift: any) => ({ id: shift.id, name: shift.name, start_time: shift.start_time, end_time: shift.end_time }));
  }, [shiftBreakdown, trainingShiftIds]);

  const capacityFilterShifts = useMemo(
    () => sortByOperatingOrder(allShifts.filter((shift) => !shift.planning_shift_id)),
    [allShifts],
  );

  const activeMapShiftId = useMemo(() => {
    if (mapShifts.some((shift) => shift.id === selectedMapShiftId)) return selectedMapShiftId;
    return peakShift?.id ?? mapShifts[0]?.id ?? "";
  }, [mapShifts, peakShift?.id, selectedMapShiftId]);

  const mapRoles = useMemo(() => {
    if (!activeMapShiftId) return [];
    const selectedShift = shiftBreakdown.find((shift) => shift.id === activeMapShiftId);
    const selectedShiftIds = selectedShift?.memberIds || [activeMapShiftId];
    // A training-only shift only ever shows the training zone — trainees carry
    // their future position on their profile, which would otherwise leak every
    // department's desks into the training view.
    const isTrainingShiftView = trainingShiftIds.has(activeMapShiftId);
    const selectedShiftPeople = filteredPeople.filter(
      (person) => activeMapShiftId === "unassigned" ? !person.shift_id : !!person.shift_id && selectedShiftIds.includes(person.shift_id),
    );
    const seatRoles = filtered
      .filter((seat) => {
        if (isTrainingShiftView) return !!seat.is_training_only;
        if (seat.is_training_only) return !!seat.shift_id && selectedShiftIds.includes(seatShift(seat)!);
        if (seat.shift_id) return selectedShiftIds.includes(seatShift(seat)!);
        // Shift-neutral desks are shared across shifts, but they only become
        // eligible for a shift when that exact department/role works it.
        // This prevents one Support Staff assignment from inheriting all 22 desks.
        if (selectedShiftPeople.some((person) => seatMatchesPerson(seat, person))) {
          return true;
        }
        // A desk also belongs to a shift when the approved staffing plan asks for
        // that role in that shift, even while the seats are still empty. Without
        // this, planned-but-unstaffed roles vanish from the shift entirely.
        // A plan with no shift of its own is scoped to the shifts that role is
        // actually worked in, so roles no longer leak into every shift.
        if (activeMapShiftId === "unassigned") return false;
        const planned = plannedSeatShifts.get(seat.id);
        return !!planned && (planned.has("any") || selectedShiftIds.some((id) => planned.has(id)));
      })
      .map((seat) => {
        const matchingPeople = selectedShiftPeople
          .filter((person) => seatMatchesPerson(seat, person))
          .sort((a, b) => employeeName(a).localeCompare(employeeName(b)));
        const occupiedSeats = matchingPeople.length;
        // One person working outside the group's planned shifts uses a desk; they don't bring the whole group.
        const physicalSeats = deskCountInShift(seat, selectedShiftIds, occupiedSeats);
        return {
          id: seat.id,
          departmentName: seat.is_training_only ? "Training zone" : seat.departmentName || "Unassigned department",
          positionTitle: seat.is_training_only ? "Training seats" : seat.positionTitle || "Department pool",
          physicalSeats,
          occupiedSeats,
          overflow: Math.max(0, occupiedSeats - physicalSeats),
          occupants: matchingPeople.map((person) => ({
            name: employeeName(person),
            onNotice: isOnNotice(person),
            // The sitter's own position, so shared desks (e.g. Payment
            // Operations Associate / Executive) still name the actual role.
            position: (lookups?.positions || []).find((position) => position.id === person.job_position_id)?.title ?? null,
          })),
          trainingOnly: !!seat.is_training_only,
        };
      })
      .filter((role) => role.physicalSeats > 0);

    // Staffing lines planned for this shift with no desk group still belong on the
    // map (people + planned places, no desks drawn), otherwise a planned role
    // such as one that sits outside the desk plan silently disappears.
    const noDeskRoles = isTrainingShiftView || activeMapShiftId === "unassigned" ? [] : (headcountPlans as any[])
      .filter((plan) => plan.is_active !== false && !plan.seat_capacity_id && Number(plan.required_hc) > 0)
      .filter((plan) => {
        const ids = [plan.shift_id, ...(plan.eligible_shift_ids || [])].filter(Boolean).map((id: string) => planningShiftId(allShifts, id));
        return ids.some((id) => !!id && selectedShiftIds.includes(id));
      })
      .filter((plan) => filters.departmentId === "all" || plan.department_id === filters.departmentId)
      .map((plan) => {
        const roleIds: string[] = plan.eligible_position_ids?.length ? plan.eligible_position_ids : [plan.position_id];
        if (filters.positionId !== "all" && !roleIds.includes(filters.positionId)) return null;
        const sitters = (people as SeatPerson[])
          .filter((person) => !traineeIds.has(person.employee_id) && person.department_id === plan.department_id
            && !!person.job_position_id && roleIds.includes(person.job_position_id)
            && !!person.shift_id && selectedShiftIds.includes(person.shift_id))
          .sort((a, b) => employeeName(a).localeCompare(employeeName(b)));
        const titleOf = (id: string) => (lookups?.positions || []).find((position) => position.id === id)?.title;
        return {
          id: `plan-${plan.id}`,
          departmentName: (lookups?.departments || []).find((d: any) => d.id === plan.department_id)?.name || "Unassigned department",
          positionTitle: roleIds.map(titleOf).filter(Boolean).join(" / ") || "Designation",
          physicalSeats: 0,
          occupiedSeats: sitters.length,
          overflow: 0,
          noDesk: true,
          planned: Number(plan.required_hc) || 0,
          occupants: sitters.map((person) => ({
            name: employeeName(person),
            onNotice: isOnNotice(person),
            position: person.job_position_id ? titleOf(person.job_position_id) ?? null : null,
          })),
        };
      })
      .filter(Boolean) as any[];

    return [...seatRoles, ...noDeskRoles].sort((a, b) =>
      a.departmentName.localeCompare(b.departmentName) ||
      a.positionTitle.localeCompare(b.positionTitle),
    );
  }, [activeMapShiftId, filtered, filteredPeople, plannedSeatShifts, shiftBreakdown, seatMatchesPerson, trainingShiftIds, seatShift, headcountPlans, allShifts, filters.departmentId, filters.positionId, people, traineeIds, lookups?.positions, lookups?.departments, deskCountInShift]);

  // Shifts in rota order for the table and the cards (training shift and "Unassigned" last).
  const shiftCols = useMemo(() => {
    const work = rotaOrder(shiftBreakdown.filter((x) => x.id !== "unassigned" && !trainingShiftIds.has(x.id)) as any[]);
    return [...work, ...shiftBreakdown.filter((x) => trainingShiftIds.has(x.id)), ...shiftBreakdown.filter((x) => x.id === "unassigned")];
  }, [shiftBreakdown, trainingShiftIds]);
  const workPeak = useMemo(
    () => shiftBreakdown.filter((x) => x.id !== "unassigned" && !trainingShiftIds.has(x.id))
      .reduce<(typeof shiftBreakdown)[number] | null>((peak, x) => (!peak || x.assigned > peak.assigned ? x : peak), null),
    [shiftBreakdown, trainingShiftIds],
  );
  const trainingSeats = filtered.filter((x) => x.is_training_only).reduce((a, x) => a + (x.physical_seats || 0), 0);
  const overGroups = filtered.filter((x) => !x.is_training_only && x.currentOccupancy > (x.physical_seats || 0));
  const overPeople = overGroups.reduce((a, x) => a + (x.currentOccupancy - (x.physical_seats || 0)), 0);
  const overText = (() => {
    if (!overGroups.length) return "everyone has a desk";
    if (overGroups.length > 1) return `${overPeople} people without a desk, each group at its busiest shift`;
    const g: any = overGroups[0];
    let best: [string, number] | null = null;
    (planningRows.find((r: any) => r.id === g.id)?.byShift as Map<string, number> | undefined)?.forEach((n, sid) => {
      if (sid !== "unassigned" && (!best || n > best[1])) best = [sid, n];
    });
    const sname = best ? allShifts.find((x) => x.id === best![0])?.name ?? "its busiest shift" : "its busiest shift";
    return `${g.is_training_only ? "Training room" : g.positionTitle || "Whole department"} · ${sname}: ${g.currentOccupancy - (g.physical_seats || 0)} over`;
  })();
  const workGroups = filtered.filter((x) => !x.is_training_only).length;
  /** The shift with the most people in a desk group (the one that decides whether it is full). */
  const busiestShiftName = (row: any): string | null => {
    const ids: string[] = row.peakShiftIds ?? [];
    if (!ids.length) return null;
    const name = (id: string) => (id === "-" ? "no shift" : (allShifts.find((x) => x.id === id)?.name ?? "a shift").replace(/ Shift$/, ""));
    if (ids.length === 1) return name(ids[0]);
    return ids.length === 2 ? `${name(ids[0])} and ${name(ids[1])}` : "several shifts";
  };
  const tableRows = useMemo(
    () => planningRows.slice().sort((a, b) =>
      Number(!!a.is_training_only) - Number(!!b.is_training_only)
      || (a.departmentName || "").localeCompare(b.departmentName || "")
      || (a.positionTitle || "").localeCompare(b.positionTitle || "")),
    [planningRows],
  );
  const attentionRows = useMemo(() => matrix.rows.filter((r) => matchesFilters(r, { ...EMPTY_FILTERS, departmentId: filters.departmentId, positionId: filters.positionId, shift: filters.shift })),
    [matrix.rows, filters.departmentId, filters.positionId, filters.shift]);

  const editSeat = (s: any) => setDialog({
    open: true,
    initial: {
      id: s.id,
      department_id: s.department_id,
      position_id: s.position_id,
      eligible_position_ids: Array.isArray(s.eligible_position_ids) ? s.eligible_position_ids : [],
      shift_id: s.shift_id,
      shift_label: s.shift_label,
      physical_seats: s.physical_seats,
      max_operational_capacity: s.max_operational_capacity,
      is_training_only: !!s.is_training_only,
      notes: s.notes,
    },
  });
  const groupName = (s: any) => (s.is_training_only ? "Training room" : s.positionTitle || "Whole department");
  // Which staffing lines each desk group sets: lines that follow it take its desk count in every shift they work.
  const deskSets = useMemo(() => {
    const order = rotaOrder(planningShifts(allShifts)).map((s: any) => s.name as string);
    const m = new Map<string, { label: string; required: number; follow: boolean }[]>();
    matrix.rows.forEach((r) => {
      if (!r.seat_capacity_id) return;
      m.set(r.seat_capacity_id, [...(m.get(r.seat_capacity_id) ?? []), { label: r.shiftLabel, required: r.required_hc, follow: r.follow_desks }]);
    });
    m.forEach((list) => list.sort((a, b) => (order.indexOf(a.label) + 1 || 99) - (order.indexOf(b.label) + 1 || 99)));
    return m;
  }, [matrix.rows, allShifts]);
  const setsLine = (s: any) => {
    if (s.is_training_only || matrix.isLoading || (matrix.isError && !matrix.data)) return null;
    const list = deskSets.get(s.id) ?? [];
    if (!list.length) return <p className="text-[11px] text-warning">No staffing line uses these desks yet</p>;
    const follow = list.filter((x) => x.follow);
    const fixed = list.length - follow.length;
    return (
      <p className="text-[11px] text-primary">
        {follow.length ? `Sets ${follow.map((x) => `${shiftShort(x.label)} ${x.required}`).join(" · ")}` : ""}
        {follow.length && fixed ? " · " : ""}
        {fixed ? <span className="text-muted-foreground">{fixed} linked line{fixed === 1 ? "" : "s"} with a fixed number</span> : null}
      </p>
    );
  };
  const deskRoles = (s: any): string[] => (Array.isArray(s.eligible_position_ids) && s.eligible_position_ids.length ? s.eligible_position_ids : s.position_id ? [s.position_id] : []);
  const deskTitle = (s: any, id: string): string | undefined =>
    (lookups?.positions || []).find((p: any) => p.id === id)?.title ?? (s.position_id === id ? s.positions?.title : undefined);
  // Designation names open their journey; training rooms and whole-department groups stay plain text.
  const groupLabel = (s: any) => (s.is_training_only || !deskRoles(s).some((id) => deskTitle(s, id))
    ? groupName(s)
    : <DesignationLinks ids={deskRoles(s)} titleOf={(id) => deskTitle(s, id)} />);
  const usable = (s: any) => (!s.is_training_only && s.max_operational_capacity != null && s.max_operational_capacity !== s.physical_seats ? s.max_operational_capacity : null);
  const plannedIn = (s: any, shiftId: string) => !!plannedSeatShifts.get(s.id)?.has(shiftId) || !!plannedSeatShifts.get(s.id)?.has("any");
  const showOccupancy = !occupancyLoading && !occupancyError;

  return (
    <div className="hrms-page space-y-4">
      <PageHeader
        title="Desks"
        description="How many desks each designation has. Every shift uses the same desks, so a line that follows its desks needs one person per usable desk in each shift."
        actions={
          canManage ? <Button className="w-full sm:w-auto" onClick={() => setDialog({ open: true })}><Plus className="h-4 w-4" /> Add desk group</Button> : undefined
        }
      />

      <WorkforceTabs current="desks" />

      <WorkforceFilters
        value={filters}
        onChange={setFilters}
        departments={lookups?.departments || []}
        positions={lookups?.positions || []}
        shifts={[...rotaOrder(capacityFilterShifts.filter((x: any) => !x.is_training_shift)), ...capacityFilterShifts.filter((x: any) => x.is_training_shift)]}
        showStatus={false}
        showPriority={false}
        showDates={false}
        showEmploymentType={false}
      />
      {occupancyError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Couldn't load who sits where, so the people counts below are missing.{" "}
          <button type="button" className="underline" onClick={() => refetchOccupancy()}>Try again</button>
        </div>
      )}

      {isLoading ? (
        <>
          <Skeleton className="h-5 w-2/3" />
          <TableSkeleton />
        </>
      ) : seatsError && seats.length === 0 ? (
        <ErrorState title="Couldn't load the desk groups" error={seatsErr} onRetry={() => refetchSeats()} />
      ) : seats.length === 0 ? (
        <EmptyState icon={LayoutGrid} title="No desk groups yet"
          description="Add the desks each department and designation uses. Staffing lines can then follow the desk count."
          action={canManage ? <Button onClick={() => setDialog({ open: true })}><Plus className="h-4 w-4" /> Add desk group</Button> : undefined} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{totals.physical}</span> desk{totals.physical === 1 ? "" : "s"}
            {totals.operational !== totals.physical ? ` (${totals.operational} usable)` : ""} in {workGroups} desk group{workGroups === 1 ? "" : "s"}
            {trainingSeats ? ` · +${trainingSeats} training seats` : ""}
            {showOccupancy && workPeak ? <> · busiest shift {workPeak.name.replace(/ Shift$/, "")}: <span className="font-medium text-foreground">{workPeak.assigned} {workPeak.assigned === 1 ? "person" : "people"} for {workPeak.seats} desks</span>{workPeak.assigned > workPeak.seats ? <span className="font-medium text-destructive">{` (${workPeak.assigned - workPeak.seats} over)`}</span> : null}</> : null}
            {showOccupancy && overGroups.length > 0 ? <span className="font-medium text-destructive"> · {overText}</span> : null}
          </p>

          <WorkforceAttention
            rows={attentionRows}
            canManage={canManage}
            variant="compact"
            topics={["desks"]}
            scopeNote="on desks"
            scope={{ departmentId: filters.departmentId, positionId: filters.positionId }}
            shiftFiltered={filters.shift !== "all"}
            shift={filters.shift}
            onPlanDesks={(seat) => navigate(`/hrms/workforce-planning/staffing-plan?plan_desk=${seat.id}`)}
          />

          {filtered.length === 0 ? (
            <EmptyState icon={LayoutGrid} title="No desk groups match these filters" description="Change the filters to see other desk groups." />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SegmentedControl aria-label="View" size="sm" value={deskView} onValueChange={(v) => setDeskView(v as "groups" | "map")}
                  options={[{ value: "groups", label: "Desk groups" }, { value: "map", label: "Seat map by shift" }]} />
                <p className="text-xs text-muted-foreground">
                  {deskView === "groups" ? "A desk group is as full as its busiest shift." : "Pick a shift to see who sits where."}
                </p>
              </div>

              {deskView === "map" ? (
                <>
                  {mapShifts.length > 0 && (
                    <OfficeSeatMap
                      shifts={mapShifts}
                      selectedShiftId={activeMapShiftId}
                      onShiftChange={setSelectedMapShiftId}
                      roles={mapRoles}
                      formatShiftTime={formatShiftTime}
                    />
                  )}

                  {showOccupancy && shiftCols.length > 0 && (
                    <section aria-label="By shift" className="space-y-2">
                      <h2 className="font-display text-[15px] font-semibold text-foreground">By shift</h2>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(3,minmax(0,1fr))]">
                        {shiftCols.map((x) => {
                          const training = trainingShiftIds.has(x.id);
                          const over = x.assigned - x.seats;
                          return (
                            <div key={x.id} className="rounded-xl border border-border bg-card p-3">
                              <div className="flex items-baseline justify-between gap-3">
                                <p className="min-w-0 truncate text-sm font-medium text-foreground">
                                  {training && <GraduationCap className="mr-1 inline h-3.5 w-3.5 text-primary" aria-hidden />}{x.name}
                                </p>
                                <p className="shrink-0 text-sm tabular-nums"><span className="font-semibold text-foreground">{x.assigned}</span><span className="text-muted-foreground"> / {x.seats}</span></p>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                {x.id === "unassigned" ? "No current shift schedule" : `${formatShiftTime(x.start_time)} – ${formatShiftTime(x.end_time)} IST`}
                                {" · "}{training ? "trainees / training seats" : "people / desks of their designations"}
                              </p>
                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                                <div className={cn("h-full rounded-full", occupancyTone(x.utilisation))} style={{ width: `${Math.min(100, x.utilisation)}%` }} />
                              </div>
                              <p className={cn("mt-1 text-[11px] font-medium", over > 0 ? "text-destructive" : "text-muted-foreground")}>
                                {over > 0 ? `${over} over` : `${-over} free`}{x.seats > 0 ? ` · ${Math.round(x.utilisation)}% full` : ""}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </>
              ) : (
                <section aria-label="Desk groups" className="space-y-2">
                  <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="border-b border-border bg-muted/40">
                        <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="px-4 py-2 font-medium">Desk group</th>
                          <th className="px-2 py-2 text-right font-medium">Desks</th>
                          <th className="px-3 py-2 font-medium">Busiest shift</th>
                          {canManage && <th className="px-3 py-2" aria-label="Actions" />}
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.map((row) => {
                          const desks = row.physical_seats || 0;
                          const cur = row.currentOccupancy;
                          const over = cur - desks;
                          const peak = busiestShiftName(row);
                          return (
                            <tr key={row.id} className="border-b border-border/60 last:border-0">
                              <td className="px-4 py-2.5">
                                <p className="font-medium text-foreground">{groupLabel(row)}</p>
                                <p className="text-xs text-muted-foreground">{row.is_training_only ? "Trainees of every department" : row.departmentName || "No department"}</p>
                                {setsLine(row)}
                              </td>
                              <td className="px-2 py-2.5 text-right tabular-nums">
                                {desks}{usable(row) != null && <span className="block text-[11px] text-muted-foreground">{usable(row)} usable</span>}
                              </td>
                              <td className="px-3 py-2.5">
                                {!showOccupancy ? <span className="text-muted-foreground">…</span> : (
                                  <span className="inline-flex flex-col">
                                    <span className="tabular-nums text-foreground">{cur} of {desks}</span>
                                    <span className="text-[11px]">
                                      <span className={cn("font-medium", over > 0 ? "text-destructive" : over === 0 && desks > 0 ? "text-success" : "text-muted-foreground")}>
                                        {over > 0 ? `${over} over` : over === 0 && desks > 0 ? "full" : `${-over} free`}
                                      </span>
                                      {peak && <span className="text-muted-foreground"> · {peak}</span>}
                                    </span>
                                    {!row.shift_id && row.totalOnRoll > cur && <span className="text-[11px] text-muted-foreground">{row.totalOnRoll} on roll across shifts</span>}
                                  </span>
                                )}
                              </td>
                              {canManage && (
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${groupName(row)}`} onClick={() => editSeat(row)}><Pencil className="h-3.5 w-3.5" /></Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Remove ${groupName(row)}`} onClick={() => setDeleteTarget(row)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2 md:hidden">
                    {tableRows.map((row) => {
                      const desks = row.physical_seats || 0;
                      const cur = row.currentOccupancy;
                      const over = cur - desks;
                      const peak = busiestShiftName(row);
                      return (
                        <div key={row.id} className="rounded-xl border border-border bg-card p-3">
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                            <div className="min-w-0">
                              <p className="font-medium text-foreground">{groupLabel(row)}</p>
                              <p className="text-xs text-muted-foreground">{row.is_training_only ? "Trainees" : row.departmentName || "No department"} · {desks} desk{desks === 1 ? "" : "s"}</p>
                              {setsLine(row)}
                            </div>
                            {showOccupancy && (
                              <p className={cn("text-right text-xs font-medium", over > 0 ? "text-destructive" : over === 0 && desks > 0 ? "text-success" : "text-muted-foreground")}>
                                <span className="block text-sm tabular-nums text-foreground">{cur} of {desks}</span>
                                {over > 0 ? `${over} over` : over === 0 && desks > 0 ? "full" : `${-over} free`}{peak ? ` · ${peak}` : ""}
                                {!row.shift_id && row.totalOnRoll > cur && <span className="block font-normal text-muted-foreground">{row.totalOnRoll} across shifts</span>}
                              </p>
                            )}
                          </div>
                          {canManage && (
                            <div className="mt-2 flex justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-8" onClick={() => editSeat(row)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                              <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => setDeleteTarget(row)}><Trash2 className="h-3.5 w-3.5" /> Remove</Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}

      <SeatCapacityDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog({ open, initial: open ? dialog.initial : undefined })}
        initial={dialog.initial}
      />

      <DeskGroupRemoveDialog seat={deleteTarget} seats={seats as any[]} plans={headcountPlans as any[]}
        lineLabel={(p: any) => `${(lookups?.positions || []).find((x: any) => x.id === p.position_id)?.title || "Designation"} · ${allShifts.find((x) => x.id === p.shift_id)?.name || p.shift_label || "Any shift"}`}
        onClose={() => setDeleteTarget(null)} />
      <DesignationStoryHost />
    </div>
  );
}
