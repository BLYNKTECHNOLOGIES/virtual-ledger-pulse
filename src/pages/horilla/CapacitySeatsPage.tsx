import { useMemo, useState } from "react";
import { LayoutGrid, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
  useStaffingMatrix,
  useWorkforceLookups,
} from "@/hooks/hrms/useWorkforcePlanning";
import { EMPTY_FILTERS, type WorkforceFilterState } from "@/lib/hrms/workforce";

export default function CapacitySeatsPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hrms_manage");

  const [filters, setFilters] = useState<WorkforceFilterState>({ ...EMPTY_FILTERS });
  const [dialog, setDialog] = useState<{ open: boolean; initial?: any }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const { data: seats = [], isLoading } = useSeatCapacity();
  const { data: lookups } = useWorkforceLookups();
  const { rows } = useStaffingMatrix();
  const removeSeat = useDeleteSeatCapacity();

  /** Occupancy comes from the staffing matrix so it always matches the employee list. */
  const occupancy = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      const keys = [
        `${r.department_id}|${r.position_id}|${r.shift_id ?? "-"}`,
        `${r.department_id}|${r.position_id}|-`,
        `${r.department_id}|-|${r.shift_id ?? "-"}`,
        `${r.department_id}|-|-`,
      ];
      keys.forEach((k) => map.set(k, (map.get(k) || 0) + r.current_hc));
    });
    return map;
  }, [rows]);

  const enriched = useMemo(
    () =>
      seats.map((s: any) => {
        const key = `${s.department_id}|${s.position_id ?? "-"}|${s.shift_id ?? "-"}`;
        const current = occupancy.get(key) ?? 0;
        const physical = s.physical_seats || 0;
        const utilisation = physical > 0 ? (current / physical) * 100 : null;
        return {
          ...s,
          currentOccupancy: current,
          availableSeats: physical - current,
          utilisation,
          shiftName: s.hr_shifts?.name ?? s.shift_label ?? null,
          departmentName: s.departments?.name ?? null,
          positionTitle: s.positions?.title ?? null,
        };
      }),
    [seats, occupancy],
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

  const locations = useMemo(
    () => Array.from(new Set(enriched.map((s) => s.location || "—"))).sort(),
    [enriched],
  );

  const totals = useMemo(() => {
    const physical = filtered.reduce((a, s) => a + (s.physical_seats || 0), 0);
    const operational = filtered.reduce(
      (a, s) => a + (s.max_operational_capacity || s.physical_seats || 0),
      0,
    );
    const occupied = filtered.reduce((a, s) => a + s.currentOccupancy, 0);
    return {
      physical,
      operational,
      occupied,
      free: physical - occupied,
      utilisation: physical > 0 ? (occupied / physical) * 100 : 0,
    };
  }, [filtered]);

  return (
    <div className="space-y-4 p-3 md:p-6">
      <PageHeader
        title="Capacity & seats"
        description="Desks, workstations and how many of them are occupied. Seats are tracked separately from sanctioned and required headcount — they are never mixed together."
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
        <WorkforceKpiCard label="Physical seats" value={totals.physical} icon={LayoutGrid} />
        <WorkforceKpiCard
          label="Operational capacity"
          value={totals.operational}
          hint="People who can work at once"
        />
        <WorkforceKpiCard label="Currently occupied" value={totals.occupied} />
        <WorkforceKpiCard
          label="Seat utilisation"
          value={`${totals.utilisation.toFixed(0)}%`}
          hint={`${totals.free} seats free`}
          tone={totals.utilisation >= 100 ? "danger" : totals.utilisation >= 90 ? "warning" : "success"}
        />
      </div>

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
                        <td className="px-3 py-2 text-muted-foreground">{s.shiftName || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.location || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.physical_seats}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {s.max_operational_capacity ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.currentOccupancy}</td>
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
                      <p className="font-semibold text-foreground">{s.currentOccupancy}</p>
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
