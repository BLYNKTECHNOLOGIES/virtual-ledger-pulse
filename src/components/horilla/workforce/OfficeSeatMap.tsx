import { Armchair, Clock3, LockKeyhole, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type SeatMapShift = {
  id: string;
  name: string;
  start_time?: string | null;
  end_time?: string | null;
};

export type SeatMapOccupant = {
  name: string;
  /** Serving notice: the desk frees up shortly, so it is flagged amber. */
  onNotice?: boolean;
  /** The sitter's own position title (shared desks lock to multiple roles). */
  position?: string | null;
};

export type SeatMapRole = {
  id: string;
  departmentName: string;
  positionTitle: string;
  physicalSeats: number;
  occupiedSeats: number;
  overflow: number;
  occupants: SeatMapOccupant[];
  trainingOnly?: boolean;
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
  const onNoticeCount = roles.reduce(
    (sum, role) => sum + role.occupants.filter((occupant) => occupant.onNotice).length,
    0,
  );

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

      <TooltipProvider delayDuration={150}>
      <div className="bg-muted/20 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-7 text-center sm:mb-10">
            <div className="mx-auto h-8 w-4/5 max-w-3xl rounded-[50%_50%_0_0/100%_100%_0_0] border-x border-t-2 border-primary/50 bg-primary/10 shadow-[0_-10px_28px_hsl(var(--primary)/0.16)]" />
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
                                <LockKeyhole className="h-2.5 w-2.5" /> {role.trainingOnly ? "Training use only" : "Role reserved"}
                              </p>
                            </div>

                            <div className="flex min-h-16 flex-wrap items-start justify-center gap-x-2 gap-y-3 pt-1 sm:gap-x-3">
                              {Array.from({ length: role.physicalSeats }, (_, index) => {
                                const occupiedSeat = index < role.occupiedSeats;
                                const occupant = role.occupants[index];
                                const occupantName = occupant?.name;
                                const leavingSoon = occupiedSeat && !!occupant?.onNotice;
                                const displayNumber = firstSeatNumber + index;
                                const totalPositions = role.physicalSeats + role.overflow;
                                const center = (totalPositions - 1) / 2;
                                const curveOffset = Math.min(8, Math.abs(index - center) * 2);
                                return (
                                  <div key={`${role.id}-${index}`} className="flex w-10 flex-col items-center gap-1" style={{ transform: `translateY(${curveOffset}px)` }}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div
                                          tabIndex={0}
                                          className={
                                            leavingSoon
                                              ? "flex h-9 w-9 cursor-help items-center justify-center rounded-t-md rounded-b-sm border border-warning bg-warning/25 text-warning shadow-[0_4px_0_hsl(var(--warning)/0.4)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10 sm:w-10"
                                              : occupiedSeat
                                                ? "flex h-9 w-9 cursor-help items-center justify-center rounded-t-md rounded-b-sm border border-primary bg-primary text-primary-foreground shadow-[0_4px_0_hsl(var(--primary)/0.35)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10 sm:w-10"
                                                : "flex h-9 w-9 cursor-help items-center justify-center rounded-t-md rounded-b-sm border border-border bg-background text-muted-foreground shadow-[0_4px_0_hsl(var(--border))] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10 sm:w-10"
                                          }
                                          aria-label={`${role.positionTitle} seat ${displayNumber}, ${occupantName ? `allocated to ${occupantName}${leavingSoon ? ", serving notice" : ""}` : "vacant"}`}
                                        >
                                          <Armchair className="h-4 w-4" />
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-64">
                                        <p className="font-semibold">Seat {String(displayNumber).padStart(2, "0")}</p>
                                        <p>{occupantName || "Available"}</p>
                                        {occupant?.position && <p className="text-[10px] text-muted-foreground">{occupant.position}</p>}
                                        {leavingSoon && (
                                          <p className="text-[10px] font-semibold text-warning">Serving notice · desk frees up soon</p>
                                        )}
                                        <p className="text-[10px] text-muted-foreground">
                                          {role.trainingOnly ? "Training only · not a working seat" : `Desk reserved for: ${role.positionTitle}`}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                    <span className={`font-mono text-[9px] ${leavingSoon ? "text-warning" : "text-muted-foreground"}`}>{String(displayNumber).padStart(2, "0")}</span>
                                  </div>
                                );
                              })}
                              {Array.from({ length: role.overflow }, (_, index) => {
                                 const overflowOccupant = role.occupants[role.physicalSeats + index];
                                 const occupantName = overflowOccupant?.name || "Unnamed employee";
                                const slotIndex = role.physicalSeats + index;
                                const center = (role.physicalSeats + role.overflow - 1) / 2;
                                const curveOffset = Math.min(8, Math.abs(slotIndex - center) * 2);
                                return (
                                  <div key={`${role.id}-overflow-${index}`} className="flex w-10 flex-col items-center gap-1" style={{ transform: `translateY(${curveOffset}px)` }}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div
                                          tabIndex={0}
                                          className="flex h-9 w-9 cursor-help items-center justify-center rounded-t-md rounded-b-sm border border-destructive bg-destructive/15 text-destructive shadow-[0_4px_0_hsl(var(--destructive)/0.22)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10 sm:w-10"
                                          aria-label={`${role.positionTitle}, ${occupantName}, over capacity`}
                                        >
                                          <Users className="h-4 w-4" />
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-64">
                                        <p className="font-semibold">{occupantName}</p>
                                        <p className="text-destructive">No allocated seat · over capacity</p>
                                        <p className="text-[10px] text-muted-foreground">{role.positionTitle}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                    <span className="font-mono text-[9px] text-destructive">+{index + 1}</span>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="text-center font-mono text-[11px] text-muted-foreground md:text-right">
                              <span className="font-semibold text-foreground">{Math.min(role.occupiedSeats, role.physicalSeats)}</span>/{role.physicalSeats}
                              {role.overflow > 0 && (
                                <span className="block text-[10px] font-semibold text-destructive">+{role.overflow} unseated</span>
                              )}
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
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-warning bg-warning/25" /> On notice{onNoticeCount > 0 ? ` (${onNoticeCount})` : ""}</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-destructive bg-destructive/15" /> Over capacity</span>
            <span className="flex items-center gap-1.5"><LockKeyhole className="h-3 w-3" /> Locked to role</span>
          </div>
        </div>
      </div>
      </TooltipProvider>

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