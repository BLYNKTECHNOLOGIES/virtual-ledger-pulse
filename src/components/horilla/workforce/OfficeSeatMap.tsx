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

  let seatNumber = 0;

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

      <div className="bg-muted/20 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-7 text-center sm:mb-10">
            <div className="mx-auto h-2 w-4/5 max-w-3xl rounded-t-full border-x border-t border-primary/40 bg-primary/15 shadow-[0_-8px_24px_hsl(var(--primary)/0.16)]" />
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-primary">Front entrance / reception</p>
          </div>

          {departments.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <Armchair className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">No allocated seats for this shift</p>
              <p className="mt-1 text-xs text-muted-foreground">Choose another shift or review the active seat allocation.</p>
            </div>
          ) : (
            <div key={selectedShiftId} className="animate-in fade-in-0 space-y-8 duration-300">
              {departments.map(([department, departmentRoles]) => {
                const departmentSeats = departmentRoles.reduce((sum, role) => sum + role.physicalSeats, 0);
                return (
                  <div key={department}>
                    <div className="mb-4 flex items-center gap-3">
                      <span className="h-px flex-1 bg-border" />
                      <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{department}</p>
                      <span className="font-mono text-[10px] text-muted-foreground">{departmentSeats}</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>

                    <div className="space-y-5">
                      {departmentRoles.map((role) => {
                        const firstSeatNumber = seatNumber + 1;
                        seatNumber += role.physicalSeats;
                        return (
                          <div key={role.id} className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_72px] md:items-center">
                            <div className="min-w-0 text-center md:text-left">
                              <p className="truncate text-xs font-semibold text-foreground">{role.positionTitle}</p>
                              <p className="mt-0.5 flex items-center justify-center gap-1 text-[10px] text-muted-foreground md:justify-start">
                                <LockKeyhole className="h-2.5 w-2.5" /> Role reserved
                              </p>
                            </div>

                            <div className="flex flex-wrap items-end justify-center gap-x-2 gap-y-3 sm:gap-x-3">
                              {Array.from({ length: role.physicalSeats }, (_, index) => {
                                const occupiedSeat = index < role.occupiedSeats;
                                const displayNumber = firstSeatNumber + index;
                                return (
                                  <div key={`${role.id}-${index}`} className="flex w-10 flex-col items-center gap-1">
                                    <div
                                      className={
                                        occupiedSeat
                                          ? "flex h-9 w-9 items-center justify-center rounded-t-md rounded-b-sm border border-primary bg-primary text-primary-foreground shadow-[0_4px_0_hsl(var(--primary)/0.35)] transition-colors sm:h-10 sm:w-10"
                                          : "flex h-9 w-9 items-center justify-center rounded-t-md rounded-b-sm border border-border bg-background text-muted-foreground shadow-[0_4px_0_hsl(var(--border))] transition-colors sm:h-10 sm:w-10"
                                      }
                                      title={`${role.positionTitle} seat ${displayNumber}: ${occupiedSeat ? "occupied" : "vacant"} on ${selectedShift?.name || "selected shift"}`}
                                      aria-label={`${role.positionTitle} seat ${displayNumber}, ${occupiedSeat ? "occupied" : "vacant"}`}
                                    >
                                      <Armchair className="h-4 w-4" />
                                    </div>
                                    <span className="font-mono text-[9px] text-muted-foreground">{String(displayNumber).padStart(2, "0")}</span>
                                  </div>
                                );
                              })}
                              {Array.from({ length: role.overflow }, (_, index) => (
                                <div key={`${role.id}-overflow-${index}`} className="flex w-10 flex-col items-center gap-1">
                                  <div
                                    className="flex h-9 w-9 items-center justify-center rounded-t-md rounded-b-sm border border-destructive bg-destructive/15 text-destructive shadow-[0_4px_0_hsl(var(--destructive)/0.22)] sm:h-10 sm:w-10"
                                    title={`${role.positionTitle}: scheduled beyond allocated seats`}
                                    aria-label={`${role.positionTitle} over capacity`}
                                  >
                                    <Users className="h-4 w-4" />
                                  </div>
                                  <span className="font-mono text-[9px] text-destructive">+{index + 1}</span>
                                </div>
                              ))}
                            </div>

                            <div className="text-center font-mono text-[11px] text-muted-foreground md:text-right">
                              <span className="font-semibold text-foreground">{Math.min(role.occupiedSeats, role.physicalSeats)}</span>/{role.physicalSeats}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-9 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-primary bg-primary" /> Occupied</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-border bg-background" /> Available</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-destructive bg-destructive/15" /> Over capacity</span>
            <span className="flex items-center gap-1.5"><LockKeyhole className="h-3 w-3" /> Locked to role</span>
          </div>
        </div>
      </div>

      <div className="grid border-t border-border bg-secondary/30 sm:grid-cols-[minmax(190px,1.35fr)_repeat(4,minmax(92px,0.65fr))]">
        <div className="border-b border-border p-4 sm:border-b-0 sm:border-r">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Selected shift</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="font-heading text-base font-semibold text-foreground">{selectedShift?.name || "—"}</p>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock3 className="h-3 w-3" />
              {selectedShift?.id === "unassigned"
                ? "No current shift schedule"
                : `${formatShiftTime(selectedShift?.start_time)} – ${formatShiftTime(selectedShift?.end_time)} IST`}
            </p>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${Math.min(100, utilisation)}%` }} />
          </div>
        </div>
        {[
          ["Utilisation", `${utilisation.toFixed(0)}%`, "text-foreground"],
          ["Allocated", physical, "text-foreground"],
          ["Occupied", occupied, "text-primary"],
          [overflow > 0 ? "Over capacity" : "Available", overflow > 0 ? overflow : vacant, overflow > 0 ? "text-destructive" : "text-success"],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="border-r border-t border-border p-3 text-center last:border-r-0 sm:border-t-0">
            <p className={`font-mono text-xl font-semibold ${tone}`}>{value}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}