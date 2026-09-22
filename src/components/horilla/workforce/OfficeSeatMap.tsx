import { Armchair, Clock3, LockKeyhole, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type SeatMapShift = {
  id: string;
  name: string;
  start_time?: string | null;
  end_time?: string | null;
};

export type SeatMapRole = {
  id: string;
  departmentName: string;
  positionTitle: string;
  physicalSeats: number;
  occupiedSeats: number;
  overflow: number;
};

type OfficeSeatMapProps = {
  shifts: SeatMapShift[];
  selectedShiftId: string;
  onShiftChange: (shiftId: string) => void;
  roles: SeatMapRole[];
  formatShiftTime: (value?: string | null) => string;
};

export function OfficeSeatMap({
  shifts,
  selectedShiftId,
  onShiftChange,
  roles,
  formatShiftTime,
}: OfficeSeatMapProps) {
  const selectedShift = shifts.find((shift) => shift.id === selectedShiftId);
  const physical = roles.reduce((sum, role) => sum + role.physicalSeats, 0);
  const occupied = roles.reduce((sum, role) => sum + Math.min(role.occupiedSeats, role.physicalSeats), 0);
  const overflow = roles.reduce((sum, role) => sum + role.overflow, 0);
  const vacant = Math.max(0, physical - occupied);
  const utilisation = physical > 0 ? (occupied / physical) * 100 : 0;

  const departments = Array.from(
    roles.reduce((groups, role) => {
      const current = groups.get(role.departmentName) || [];
      current.push(role);
      groups.set(role.departmentName, current);
      return groups;
    }, new Map<string, SeatMapRole[]>()),
  );

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="office-seat-map-title">
      <div className="flex flex-col gap-4 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="office-seat-map-title" className="font-heading text-base font-semibold text-foreground">
              Live office seating map
            </h2>
            <Badge variant="outline" className="gap-1 text-[10px]">
              <LockKeyhole className="h-3 w-3" /> Role locked
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Vacancies change by shift; every desk remains inside its allocated role cluster.
          </p>
        </div>

        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-border bg-muted/40 p-1 scrollbar-hidden" aria-label="Choose shift">
          {shifts.map((shift) => (
            <Button
              key={shift.id}
              type="button"
              size="sm"
              variant={selectedShiftId === shift.id ? "default" : "ghost"}
              className="h-8 shrink-0 px-3 text-xs"
              onClick={() => onShiftChange(shift.id)}
              aria-pressed={selectedShiftId === shift.id}
            >
              {shift.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 bg-muted/20 p-4 sm:p-6">
          <div className="mx-auto mb-8 max-w-xl text-center">
            <div className="mx-auto h-1.5 w-3/4 rounded-full bg-primary/35 shadow-[0_0_18px_hsl(var(--primary)/0.25)]" />
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-primary">
              Front entrance / reception
            </p>
          </div>

          {departments.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <Armchair className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">No role seats for this shift</p>
              <p className="mt-1 text-xs text-muted-foreground">Choose another shift or review the active seat allocation.</p>
            </div>
          ) : (
            <div key={selectedShiftId} className="grid animate-in fade-in-0 gap-4 duration-300 xl:grid-cols-2">
              {departments.map(([department, departmentRoles]) => {
                const departmentSeats = departmentRoles.reduce((sum, role) => sum + role.physicalSeats, 0);
                return (
                  <div key={department} className="rounded-lg border border-border bg-background/70 p-3 sm:p-4">
                    <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-2">
                      <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-foreground">{department}</p>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{departmentSeats} seats</span>
                    </div>
                    <div className="space-y-5">
                      {departmentRoles.map((role) => (
                        <div key={role.id}>
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-foreground">{role.positionTitle}</p>
                              <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                                <LockKeyhole className="h-2.5 w-2.5" /> Only {role.positionTitle}
                              </p>
                            </div>
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                              {Math.min(role.occupiedSeats, role.physicalSeats)}/{role.physicalSeats}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {Array.from({ length: role.physicalSeats }, (_, index) => {
                              const occupiedSeat = index < role.occupiedSeats;
                              return (
                                <div
                                  key={`${role.id}-${index}`}
                                  className={
                                    occupiedSeat
                                      ? "flex h-8 w-8 items-center justify-center rounded-md border border-primary bg-primary text-primary-foreground shadow-[0_0_10px_hsl(var(--primary)/0.22)] transition-colors"
                                      : "flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground transition-colors"
                                  }
                                  title={`${role.positionTitle} seat ${index + 1}: ${occupiedSeat ? "occupied" : "vacant"} on ${selectedShift?.name || "selected shift"}`}
                                  aria-label={`${role.positionTitle} seat ${index + 1}, ${occupiedSeat ? "occupied" : "vacant"}`}
                                >
                                  <Armchair className="h-4 w-4" />
                                </div>
                              );
                            })}
                            {Array.from({ length: role.overflow }, (_, index) => (
                              <div
                                key={`${role.id}-overflow-${index}`}
                                className="flex h-8 w-8 items-center justify-center rounded-md border border-destructive bg-destructive/15 text-destructive"
                                title={`${role.positionTitle}: scheduled beyond allocated seats`}
                                aria-label={`${role.positionTitle} over capacity`}
                              >
                                <Users className="h-4 w-4" />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-primary bg-primary" /> Occupied</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-border bg-muted" /> Vacant</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-destructive bg-destructive/15" /> Over capacity</span>
            <span className="flex items-center gap-1.5"><LockKeyhole className="h-3 w-3" /> Reserved for labelled role</span>
          </div>
        </div>

        <aside className="border-t border-border bg-secondary/30 p-5 lg:border-l lg:border-t-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Selected shift</p>
          <p className="mt-1 font-heading text-lg font-semibold text-foreground">{selectedShift?.name || "—"}</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock3 className="h-3 w-3" />
            {selectedShift?.id === "unassigned"
              ? "No current shift schedule"
              : `${formatShiftTime(selectedShift?.start_time)} – ${formatShiftTime(selectedShift?.end_time)} IST`}
          </p>

          <div className="mt-6">
            <p className="font-mono text-4xl font-semibold text-foreground">{utilisation.toFixed(0)}%</p>
            <p className="mt-1 text-xs text-muted-foreground">Role-eligible seat utilisation</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${Math.min(100, utilisation)}%` }} />
            </div>
          </div>

          <dl className="mt-6 divide-y divide-border border-y border-border text-sm">
            <div className="flex items-center justify-between py-3"><dt className="text-muted-foreground">Allocated seats</dt><dd className="font-mono font-semibold text-foreground">{physical}</dd></div>
            <div className="flex items-center justify-between py-3"><dt className="text-muted-foreground">Occupied</dt><dd className="font-mono font-semibold text-primary">{occupied}</dd></div>
            <div className="flex items-center justify-between py-3"><dt className="text-muted-foreground">Vacant</dt><dd className="font-mono font-semibold text-success">{vacant}</dd></div>
            <div className="flex items-center justify-between py-3"><dt className="text-muted-foreground">Over capacity</dt><dd className={`font-mono font-semibold ${overflow > 0 ? "text-destructive" : "text-foreground"}`}>{overflow}</dd></div>
          </dl>

          <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
            Occupancy is matched by department, position and current effective shift. Vacant desks never transfer between roles.
          </p>
        </aside>
      </div>
    </section>
  );
}