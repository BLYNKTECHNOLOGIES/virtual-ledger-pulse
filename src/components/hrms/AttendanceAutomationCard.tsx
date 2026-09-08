import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PauseCircle, PlayCircle, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useAttendanceAutomation } from "@/hooks/hrms/useAttendanceAutomation";

const ist = (ts?: string | null) =>
  ts
    ? new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST"
    : "—";

export function AttendanceAutomationCard() {
  const { state, outages, pause, resume, recoverNow } = useAttendanceAutomation();
  const [reason, setReason] = useState("");

  const s = state.data;
  const paused = !!s && s.state !== "running";
  const openOutage = (outages.data || []).find((o) => !o.ended_at);
  const awaiting = (outages.data || []).filter(
    (o) => o.ended_at && (o.recovery_status !== "done" || o.mail_release_status !== "done"),
  );

  return (
    <Card className={paused ? "border-warning/50 bg-warning/5" : ""}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2">
            {paused ? (
              <PauseCircle className="h-5 w-5 text-warning mt-0.5" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-success mt-0.5" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground text-sm">Attendance marking & emails</h3>
                <Badge variant={paused ? "destructive" : "secondary"} className="text-[10px]">
                  {s?.state === "paused_manual" ? "Paused by HR" : s?.state === "paused_auto" ? "Paused — readers offline" : "Running"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {paused ? (
                  <>
                    Paused since {ist(s?.paused_since)}. {s?.paused_reason}
                    <br />
                    Nobody is being marked absent and no attendance emails are going out. When the readers push again,
                    the missing days are rebuilt from real punches and the held emails are sent automatically.
                  </>
                ) : (
                  <>
                    Marking and emails run normally. They pause by themselves if a reader stops pushing for{" "}
                    {Math.round((s?.auto_pause_threshold_minutes ?? 120) / 60)} hours. Last check {ist(s?.last_checked_at)}.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {paused ? (
              <Button size="sm" className="h-8" onClick={() => resume.mutate(reason)} disabled={resume.isPending}>
                <PlayCircle className="h-4 w-4 mr-1" /> Resume & rebuild
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="h-8" onClick={() => pause.mutate(reason)} disabled={pause.isPending}>
                <PauseCircle className="h-4 w-4 mr-1" /> Pause
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => recoverNow.mutate()}
              disabled={recoverNow.isPending}
              title="Rebuild the outage dates now and release held emails"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${recoverNow.isPending ? "animate-spin" : ""}`} /> Rebuild & release
            </Button>
          </div>
        </div>

        <Input
          className="h-8 text-xs max-w-md"
          placeholder="Reason / note (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        {openOutage && (
          <div className="text-xs text-muted-foreground">
            Current outage started {ist(openOutage.started_at)} — days from {openOutage.from_date} onwards are waiting for device data.
          </div>
        )}

        {awaiting.length > 0 && (
          <div className="rounded-md border border-info/40 bg-info/5 p-2 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <ShieldAlert className="h-3.5 w-3.5" /> Recovery in progress
            </div>
            {awaiting.map((o) => (
              <div key={o.id} className="text-muted-foreground">
                {o.from_date} → {o.to_date ?? "—"} · rebuild {o.recovery_status} · emails {o.mail_release_status}
              </div>
            ))}
          </div>
        )}

        {(outages.data || []).length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Past outages ({(outages.data || []).length})</summary>
            <div className="mt-2 space-y-1">
              {(outages.data || []).map((o) => (
                <div key={o.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
                  <span className="text-foreground">{ist(o.started_at)}</span>
                  <span>→ {o.ended_at ? ist(o.ended_at) : "ongoing"}</span>
                  <span>· {o.trigger === "manual" ? "HR pause" : "auto"}</span>
                  <span>· rebuild {o.recovery_status}</span>
                  <span>· emails {o.mail_release_status}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
