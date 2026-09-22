import { useMemo, useState } from "react";
import {
  Armchair,
  Clock3,
  LayoutGrid,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { WorkforceFilters } from "@/components/horilla/workforce/WorkforceFilters";
import { WorkforceKpiCard } from "@/components/horilla/workforce/WorkforceKpiCard";
import { SeatCapacityDialog } from "@/components/horilla/workforce/SeatCapacityDialog";
import {
  useDeleteSeatCapacity,
  useSeatCapacity,
  useSeatOccupancy,
  useWorkforceLookups,
} from "@/hooks/hrms/useWorkforcePlanning";
import { EMPTY_FILTERS, type WorkforceFilterState } from "@/lib/hrms/workforce";

type SeatPerson = {
  employee_id: string;
  department_id: string | null;
  job_position_id: string | null;
  shift_id: string | null;
};

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
  if (utilisation > 100) return "bg-destructive";
  if (utilisation >= 90) return "bg-warning";
  return "bg-primary";
}

export default function CapacitySeatsPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hrms_manage");

  const [filters, setFilters] = useState<WorkforceFilterState>({ ...EMPTY_FILTERS });
  const [dialog, setDialog] = useState<{ open: boolean; initial?: any }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const { data: seats = [], isLoading } = useSeatCapacity();
  const { data: lookups } = useWorkforceLookups();
  const { data: people = [] } = useSeatOccupancy();
  const removeSeat = useDeleteSeatCapacity();

  /**
   * Occupancy is read straight from the people on roll. A desk is shared across
   * shifts, so a desk entry that is not tied to one shift counts the busiest
   * single shift (people sitting at the same time), while the total on roll is
   * kept alongside it.
   */
  const enriched = useMemo(
    () =>
      seats.map((s: any) => {
        const matching = (people as any[]).filter(
          (p) =>
            p.department_id === s.department_id &&
            (!s.position_id || p.job_position_id === s.position_id) &&
            (!s.shift_id || p.shift_id === s.shift_id),
        );
        const totalOnRoll = matching.length;
        let current = totalOnRoll;
        if (!s.shift_id) {
          const perShift = new Map<string, number>();
          matching.forEach((p) => {
            const k = p.shift_id ?? "-";
            perShift.set(k, (perShift.get(k) || 0) + 1);
          });
          current = perShift.size ? Math.max(...perShift.values()) : 0;
        }
        const physical = s.physical_seats || 0;
        const utilisation = physical > 0 ? (current / physical) * 100 : null;
        return {
          ...s,
          currentOccupancy: current,
          totalOnRoll,
          availableSeats: physical - current,
          utilisation,
          shiftName: s.hr_shifts?.name ?? s.shift_label ?? null,
          departmentName: s.departments?.name ?? null,
          positionTitle: s.positions?.title ?? null,
        };
      }),
    [seats, people],
  );

  const filtered = useMemo(
    () =>
      enriched.filter((s) => {
        if (filters.departmentId !== "all" && s.department_id !== filters.departmentId)
          return false;
        if (filters.positionId !== "all" && s.position_id !== filters.positionId) return false;
        if (filters.shift !== "all" && (s.shiftName || "—") !== filters.shift) return false;
        if (filters.location !== "all" && (s.location || "—") !== filters.location) return false;
        return true;
      }),
    [enriched, filters],
  );

  const filteredPeople = useMemo(() => {
    const unique = new Map<string, SeatPerson>();
    (people as SeatPerson[]).forEach((person) => {
      const belongsToVisibleSeat = filtered.some(
        (seat) =>
          seat.department_id === person.department_id &&
          (!seat.position_id || seat.position_id === person.job_position_id) &&
          (!seat.shift_id || seat.shift_id === person.shift_id),
      );
      if (belongsToVisibleSeat) unique.set(person.employee_id, person);
    });
    return Array.from(unique.values());
  }, [filtered, people]);

  const locations = useMemo(
    () => Array.from(new Set(enriched.map((s) => s.location || "—"))).sort(),
    [enriched],
  );

  const shiftBreakdown = useMemo(() => {
    const shifts = (lookups?.shifts || []) as ShiftLookup[];
    const rows = shifts.map((shift) => {
      const assignedPeople = filteredPeople.filter((person) => person.shift_id === shift.id);
      const assigned = assignedPeople.length;
      // Capacity is role-scoped. A shift containing only Office Help must be
      // compared with the Office Help seat, not every desk in the office.
      const eligibleSeats = filtered.reduce((sum, seat) => {
        if (seat.shift_id && seat.shift_id !== shift.id) return sum;
        const hasMatchingAssignment = assignedPeople.some(
          (person) =>
            person.department_id === seat.department_id &&
            (!seat.position_id || person.job_position_id === seat.position_id),
        );
        return sum + (hasMatchingAssignment ? seat.physical_seats || 0 : 0);
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
            person.department_id === seat.department_id &&
            (!seat.position_id || person.job_position_id === seat.position_id),
        );
        return sum + (hasMatchingAssignment ? seat.physical_seats || 0 : 0);
      }, 0);
      rows.push({
        id: "unassigned",
        name: "Unassigned",
        start_time: null,
        end_time: null,
        assigned: unassigned,
        seats: unassignedSeats,
        available: unassignedSeats - unassigned,
        utilisation: unassignedSeats > 0 ? (unassigned / unassignedSeats) * 100 : 0,
      });
    }
    return rows.filter((row) => row.assigned > 0 || row.seats > 0);
  }, [filtered, filteredPeople, lookups?.shifts]);

  const totals = useMemo(() => {
    const physical = filtered.reduce((a, s) => a + (s.physical_seats || 0), 0);
    const operational = filtered.reduce(
      (a, s) => a + (s.max_operational_capacity || s.physical_seats || 0),
      0,
    );
    const occupied = shiftBreakdown.reduce((peak, shift) => Math.max(peak, shift.assigned), 0);
    return {
      physical,
      operational,
      occupied,
      free: Math.max(0, physical - occupied),
      utilisation: physical > 0 ? (occupied / physical) * 100 : 0,
    };
  }, [filtered, shiftBreakdown]);

  const seatBreakdown = useMemo(() => {
    const grouped = new Map<
      string,
      { name: string; physical: number; occupied: number; onRoll: number }
    >();
    filtered.forEach((seat) => {
      const name = seat.departmentName || "Unassigned";
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
          const matching = filteredPeople.filter(
            (person) =>
              person.department_id === seat.department_id &&
              (!seat.position_id || person.job_position_id === seat.position_id),
          );
          const byShift = new Map<string, number>();
          matching.forEach((person) => {
            const key = person.shift_id ?? "unassigned";
            byShift.set(key, (byShift.get(key) || 0) + 1);
          });
          return { ...seat, byShift };
        })
        .sort((a, b) => b.totalOnRoll - a.totalOnRoll),
    [filtered, filteredPeople],
  );

  const peakShift = useMemo(
    () => shiftBreakdown.reduce<(typeof shiftBreakdown)[number] | null>(
      (peak, shift) => (!peak || shift.assigned > peak.assigned ? shift : peak),
      null,
    ),
    [shiftBreakdown],
  );

  return (
    <div className="space-y-4 p-3 md:p-6">
      <PageHeader
        title="Capacity & seats"
        description="Desks, workstations and how many of them are in use. Desks are shared across shifts, so occupancy counts the busiest single shift, not everyone on roll added together. Desks are tracked separately from sanctioned and required headcount."
        actions={
          canManage && (
            <Button onClick={() => setDialog({ open: true })}>
              <Plus className="h-4 w-4" /> Add capacity
            </Button>
          )
        }
      />

      <WorkforceFilters
        value={filters}
        onChange={setFilters}
        departments={lookups?.departments || []}
        positions={lookups?.positions || []}
        shifts={lookups?.shifts || []}
        locations={locations}
        showStatus={false}
        showPriority={false}
        showDates={false}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <WorkforceKpiCard label="Physical seats" value={totals.physical} icon={Armchair} />
        <WorkforceKpiCard
          label="Operational capacity"
          value={totals.operational}
          hint="People who can work at once"
          icon={LayoutGrid}
        />
        <WorkforceKpiCard
          label="Peak shift occupancy"
          value={totals.occupied}
          hint={peakShift ? `${peakShift.name}: ${peakShift.assigned} assigned` : "No shift assignments"}
          icon={Users}
        />
        <WorkforceKpiCard
          label="Seat utilisation"
          value={`${totals.utilisation.toFixed(0)}%`}
          hint={`${totals.free} seats free`}
          tone={totals.utilisation >= 100 ? "danger" : totals.utilisation >= 90 ? "warning" : "success"}
        />
      </div>

      {!isLoading && filtered.length > 0 && (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <Card>
            <CardContent className="p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading text-sm font-semibold text-foreground">Seat breakdown</h2>
                  <p className="text-xs text-muted-foreground">Busiest-shift occupancy by department</p>
                </div>
                <Badge variant="outline">{totals.free} free</Badge>
              </div>
              <ScrollArea className="h-[264px] pr-3">
                <div className="space-y-4">
                  {seatBreakdown.map((row) => {
                    const occupied = Math.min(row.occupied, row.physical);
                    const available = Math.max(0, row.physical - row.occupied);
                    const overflow = Math.max(0, row.occupied - row.physical);
                    const denominator = Math.max(row.physical, row.occupied, 1);
                    return (
                      <div key={row.name} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="truncate font-medium text-foreground">{row.name}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {row.occupied}/{row.physical} occupied
                            {row.onRoll !== row.occupied ? ` · ${row.onRoll} on roll` : ""}
                          </span>
                        </div>
                        <div className="flex h-2.5 overflow-hidden rounded-sm bg-muted" aria-label={`${row.name}: ${occupied} occupied, ${available} available, ${overflow} overflow`}>
                          <div className="bg-primary transition-all" style={{ width: `${(occupied / denominator) * 100}%` }} />
                          {available > 0 && <div className="bg-success/35" style={{ width: `${(available / denominator) * 100}%` }} />}
                          {overflow > 0 && <div className="bg-destructive" style={{ width: `${(overflow / denominator) * 100}%` }} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="mt-3 flex flex-wrap gap-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-primary" /> Occupied</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-success/35" /> Available</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-destructive" /> Overflow</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading text-sm font-semibold text-foreground">Shift-wise occupancy</h2>
                  <p className="text-xs text-muted-foreground">Current schedules against seats assigned to roles working that shift</p>
                </div>
                <Clock3 className="h-4 w-4 text-primary" />
              </div>
              <ScrollArea className="h-[300px] pr-3">
                <div className="space-y-3">
                  {shiftBreakdown.map((shift) => (
                    <div key={shift.id} className="rounded-md border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{shift.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {shift.id === "unassigned"
                              ? "Needs a current shift schedule"
                              : `${formatShiftTime(shift.start_time)} – ${formatShiftTime(shift.end_time)} IST`}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold tabular-nums text-foreground">{shift.assigned}/{shift.seats}</p>
                          <p className={`text-[11px] font-medium ${shift.available < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {shift.available < 0 ? `${Math.abs(shift.available)} over capacity` : `${shift.available} available`}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-sm bg-muted">
                          <div
                            className={`h-full transition-all ${occupancyTone(shift.utilisation)}`}
                            style={{ width: `${Math.min(100, shift.utilisation)}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{shift.utilisation.toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-col gap-1 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-heading text-sm font-semibold text-foreground">Shift planning</h2>
                <p className="text-xs text-muted-foreground">People scheduled by role; the peak column determines shared-desk occupancy</p>
              </div>
              <Badge variant="outline" className="w-fit">Live schedules</Badge>
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-border bg-muted/40">
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2">Role</th>
                    {((lookups?.shifts || []) as ShiftLookup[]).map((shift) => (
                      <th key={shift.id} className="px-2 py-2 text-center">{shift.name}</th>
                    ))}
                    <th className="px-3 py-2 text-center">Unassigned</th>
                    <th className="px-4 py-2 text-right">Peak / seats</th>
                  </tr>
                </thead>
                <tbody>
                  {planningRows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-foreground">{row.positionTitle || "Whole department"}</p>
                        <p className="text-xs text-muted-foreground">{row.departmentName || "Unassigned"}</p>
                      </td>
                      {((lookups?.shifts || []) as ShiftLookup[]).map((shift) => {
                        const count = row.byShift.get(shift.id) || 0;
                        return (
                          <td key={shift.id} className="px-2 py-2.5 text-center tabular-nums">
                            <span className={count > 0 ? "font-semibold text-foreground" : "text-muted-foreground/50"}>{count}</span>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-center tabular-nums">
                        <span className={row.byShift.get("unassigned") ? "font-semibold text-warning" : "text-muted-foreground/50"}>
                          {row.byShift.get("unassigned") || 0}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className={row.currentOccupancy > row.physical_seats ? "font-semibold text-destructive" : "font-semibold text-foreground"}>
                          {row.currentOccupancy} / {row.physical_seats}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-border md:hidden">
              {planningRows.map((row) => (
                <div key={row.id} className="space-y-2.5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{row.positionTitle || "Whole department"}</p>
                      <p className="truncate text-xs text-muted-foreground">{row.departmentName || "Unassigned"}</p>
                    </div>
                    <span className={`shrink-0 text-sm tabular-nums ${row.currentOccupancy > row.physical_seats ? "font-semibold text-destructive" : "font-semibold text-foreground"}`}>
                      {row.currentOccupancy} / {row.physical_seats} peak
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {((lookups?.shifts || []) as ShiftLookup[])
                      .filter((shift) => (row.byShift.get(shift.id) || 0) > 0)
                      .map((shift) => (
                        <Badge key={shift.id} variant="secondary" className="text-[10px] font-medium">
                          {shift.name}: {row.byShift.get(shift.id)}
                        </Badge>
                      ))}
                    {(row.byShift.get("unassigned") || 0) > 0 && (
                      <Badge variant="outline" className="border-warning/40 text-[10px] text-warning">
                        Unassigned: {row.byShift.get("unassigned")}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No seat capacity recorded"
          description="Add the number of desks per department, shift and location to see how full the floor is."
        />
      ) : (
        <>
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40">
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">Department</th>
                      <th className="px-3 py-2">Position</th>
                      <th className="px-3 py-2">Shift</th>
                      <th className="px-3 py-2">Location</th>
                      <th className="px-3 py-2 text-right">Physical seats</th>
                      <th className="px-3 py-2 text-right">Max operational</th>
                      <th className="px-3 py-2 text-right">Occupied</th>
                      <th className="px-3 py-2 text-right">Available</th>
                      <th className="px-3 py-2">Utilisation</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => (
                      <tr key={s.id} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 font-medium text-foreground">
                          {s.departmentName || "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {s.positionTitle || "Whole department"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {s.shiftName || (
                            <div className="flex max-w-52 flex-wrap gap-1">
                              {((lookups?.shifts || []) as ShiftLookup[])
                                .filter((shift) => (planningRows.find((row) => row.id === s.id)?.byShift.get(shift.id) || 0) > 0)
                                .map((shift) => (
                                  <Badge key={shift.id} variant="secondary" className="text-[10px] font-medium">
                                    {shift.name}: {planningRows.find((row) => row.id === s.id)?.byShift.get(shift.id)}
                                  </Badge>
                                ))}
                              {(planningRows.find((row) => row.id === s.id)?.byShift.get("unassigned") || 0) > 0 && (
                                <Badge variant="outline" className="border-warning/40 text-[10px] text-warning">Unassigned</Badge>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{s.location || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.physical_seats}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {s.max_operational_capacity ?? "—"}
                        </td>
                        <td
                          className="px-3 py-2 text-right tabular-nums"
                          title={`${s.totalOnRoll} on roll across all shifts`}
                        >
                          {s.currentOccupancy}
                          {s.totalOnRoll !== s.currentOccupancy && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              / {s.totalOnRoll}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.availableSeats}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Progress
                              value={Math.min(100, s.utilisation ?? 0)}
                              className="h-1.5 w-20"
                            />
                            <span className="tabular-nums text-xs text-muted-foreground">
                              {s.utilisation === null ? "—" : `${s.utilisation.toFixed(0)}%`}
                            </span>
                            {s.utilisation !== null && s.utilisation >= 100 && (
                              <Badge variant="outline" className="border-destructive/30 bg-destructive/15 text-destructive">
                                Full
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {canManage && (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() =>
                                  setDialog({
                                    open: true,
                                    initial: {
                                      id: s.id,
                                      department_id: s.department_id,
                                      position_id: s.position_id,
                                      shift_id: s.shift_id,
                                      shift_label: s.shift_label,
                                      location: s.location,
                                      physical_seats: s.physical_seats,
                                      max_operational_capacity: s.max_operational_capacity,
                                      notes: s.notes,
                                    },
                                  })
                                }
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => setDeleteTarget(s)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2 md:hidden">
            {filtered.map((s) => (
              <Card key={s.id}>
                <CardContent className="space-y-2 p-3">
                  <div>
                    <p className="font-medium text-foreground">
                      {s.departmentName} · {s.positionTitle || "Whole department"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[s.shiftName, s.location].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Seats</p>
                      <p className="font-semibold text-foreground">{s.physical_seats}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Occupied</p>
                      <p className="font-semibold text-foreground">
                        {s.currentOccupancy}
                        {s.totalOnRoll !== s.currentOccupancy && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            / {s.totalOnRoll}
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Utilisation</p>
                      <p className="font-semibold text-foreground">
                        {s.utilisation === null ? "—" : `${s.utilisation.toFixed(0)}%`}
                      </p>
                    </div>
                  </div>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setDialog({
                          open: true,
                          initial: {
                            id: s.id,
                            department_id: s.department_id,
                            position_id: s.position_id,
                            shift_id: s.shift_id,
                            shift_label: s.shift_label,
                            location: s.location,
                            physical_seats: s.physical_seats,
                            max_operational_capacity: s.max_operational_capacity,
                            notes: s.notes,
                          },
                        })
                      }
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <SeatCapacityDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog({ open, initial: open ? dialog.initial : undefined })}
        initial={dialog.initial}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this capacity entry?</AlertDialogTitle>
            <AlertDialogDescription>
              The seat count for {deleteTarget?.departmentName} will no longer be tracked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) removeSeat.mutate(deleteTarget.id);
                setDeleteTarget(null);
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
