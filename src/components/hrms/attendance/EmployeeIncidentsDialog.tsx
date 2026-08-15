import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAttendanceDayRange } from "@/hooks/hrms/useAttendanceDay";
import { format } from "date-fns";
import { Clock, TrendingDown, CalendarDays } from "lucide-react";

export interface IncidentRecord {
  id: string;
  attendance_date: string;
  type: string;
  late_minutes: number | null;
  early_minutes: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employeeId: string | null;
  employeeName: string;
  badgeId: string;
  monthStart: string;
  monthEnd: string;
  monthLabel: string;
  records: IncidentRecord[];
}

function fmtTime(ts: string | null) {
  if (!ts) return "—";
  try {
    return format(new Date(ts), "HH:mm");
  } catch {
    return "—";
  }
}

function fmtMins(m: number) {
  if (!m) return "—";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}h ${r}m` : `${r}m`;
}

export default function EmployeeIncidentsDialog({
  open, onOpenChange, employeeId, employeeName, badgeId, monthStart, monthEnd, monthLabel, records,
}: Props) {
  const { data: days = [] } = useAttendanceDayRange(
    employeeId ? [employeeId] : [],
    monthStart,
    monthEnd,
    { enabled: open && !!employeeId },
  );

  const dayMap = useMemo(() => {
    const m: Record<string, any> = {};
    days.forEach((d: any) => { m[d.date] = d; });
    return m;
  }, [days]);

  const sorted = useMemo(
    () => [...records].sort((a, b) => a.attendance_date.localeCompare(b.attendance_date)),
    [records],
  );

  const lateCount = sorted.filter(r => r.type === "late_come").length;
  const earlyCount = sorted.filter(r => r.type === "early_out").length;
  const lateMins = sorted.reduce((s, r) => s + (r.type === "late_come" ? (r.late_minutes || 0) : 0), 0);
  const earlyMins = sorted.reduce((s, r) => s + (r.type === "early_out" ? (r.early_minutes || 0) : 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl md:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" /> {employeeName}
            <span className="text-xs font-normal text-muted-foreground">Badge {badgeId}</span>
          </DialogTitle>
          <DialogDescription>All late come / early out incidents — {monthLabel}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-lg border p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Late comes</div>
            <div className="text-lg font-bold text-warning tabular-nums">{lateCount}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total late</div>
            <div className="text-lg font-bold text-warning tabular-nums">{fmtMins(lateMins)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Early outs</div>
            <div className="text-lg font-bold text-destructive tabular-nums">{earlyCount}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total early</div>
            <div className="text-lg font-bold text-destructive tabular-nums">{fmtMins(earlyMins)}</div>
          </div>
        </div>

        <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2">
          {/* Mobile */}
          <div className="md:hidden divide-y">
            {sorted.map(r => {
              const d = dayMap[r.attendance_date];
              const late = r.type === "late_come";
              return (
                <div key={r.id} className="py-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{format(new Date(r.attendance_date), "dd MMM yyyy (EEE)")}</span>
                    <span className={`border rounded-full px-2 py-0.5 text-[10px] font-medium ${late ? "bg-warning/10 text-warning border-warning/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
                      {late ? `Late ${r.late_minutes || 0}m` : `Early ${r.early_minutes || 0}m`}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    In {fmtTime(d?.first_in)} · Out {fmtTime(d?.last_out)} · Worked {fmtMins(d?.worked_minutes || 0)}
                    {d?.status ? ` · ${d.status.replace(/_/g, " ")}` : ""}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop */}
          <table className="hidden md:table w-full text-sm">
            <thead className="bg-muted/50 border-b sticky top-0">
              <tr>
                {["Date", "Type", "Minutes", "First In", "Last Out", "Worked", "Status"].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => {
                const d = dayMap[r.attendance_date];
                const late = r.type === "late_come";
                return (
                  <tr key={r.id} className="border-b hover:bg-muted/50">
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{format(new Date(r.attendance_date), "dd MMM (EEE)")}</td>
                    <td className="px-3 py-2">
                      <span className={`border rounded-full px-2 py-0.5 text-[10px] font-medium ${late ? "bg-warning/10 text-warning border-warning/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
                        {late ? <><Clock className="h-3 w-3 inline mr-1" />Late Come</> : <><TrendingDown className="h-3 w-3 inline mr-1" />Early Out</>}
                      </span>
                    </td>
                    <td className={`px-3 py-2 font-medium tabular-nums ${late ? "text-warning" : "text-destructive"}`}>
                      {late ? r.late_minutes || 0 : r.early_minutes || 0} min
                    </td>
                    <td className="px-3 py-2 tabular-nums">{fmtTime(d?.first_in)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtTime(d?.last_out)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtMins(d?.worked_minutes || 0)}</td>
                    <td className="px-3 py-2 capitalize text-muted-foreground">{d?.status ? d.status.replace(/_/g, " ") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
