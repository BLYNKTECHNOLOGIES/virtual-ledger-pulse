import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, CalendarPlus, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { atsKeys } from "@/lib/ats/api";
import { candKeys, type AtsAppRow, type AtsCandidate } from "@/lib/ats/candidates";
import { interviewErrorMessage } from "@/lib/ats/errors";
import { fmtDate, fmtDateTime } from "@/lib/ats/format";
import { useMailStatus } from "@/lib/ats/mail";
import {
  activePanel, durationText, fmtUntil, interviewValues, ivDateText, ivKeys, ivState, ivTimeText, ivWhen, minutesBetween,
  missingFeedback, recLabel, setInterviewStatus, useAppInterviews, type InterviewRow, type IvMode, type IvTarget,
} from "@/lib/ats/interviews";
import { QueryError, RowsSkeleton, SectionCard } from "./AtsBits";
import { InterviewStatusBadge, PanelChips, ResponseChip, Tip, WhereLine } from "./InterviewBits";
import { ScheduleInterviewDialog } from "./ScheduleInterviewDialog";
import { NotifyInterviewDialog } from "./NotifyInterviewDialog";
import { CancelInterviewDialog } from "./CancelInterviewDialog";
import { InterviewFeedbackDialog } from "./InterviewFeedbackDialog";

function Clamp({ text, lines, prefix }: { text: string; lines: 2 | 3; prefix?: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > (lines === 2 ? 140 : 220) || text.split("\n").length > lines;
  return (
    <div className="text-sm text-muted-foreground">
      <p className={cn("whitespace-pre-wrap break-words", !open && (lines === 2 ? "line-clamp-2" : "line-clamp-3"))}>
        {prefix && <span className="font-medium text-foreground/80">{prefix}</span>}{text}
      </p>
      {long && <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{open ? "Show less" : "Show more"}</button>}
    </div>
  );
}

type Dlg = null | { kind: "schedule"; iv?: InterviewRow | null; copy?: InterviewRow | null } | { kind: "notify" | "cancel" | "feedback"; iv: InterviewRow };

export function InterviewsCard({ app, candidate, openSignal }: { app: AtsAppRow; candidate: AtsCandidate; openSignal?: number }) {
  const qc = useQueryClient();
  const list = useAppInterviews(app.application_id);
  const mail = useMailStatus();
  const mailOn = !!mail.data?.enabled;
  const [dlg, setDlg] = useState<Dlg>(null);
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const first = (candidate.full_name ?? "").trim().split(/\s+/)[0] || "the candidate";
  const canSchedule = app.status === "active" || app.status === "on_hold";

  const target: IvTarget = {
    applicationId: app.application_id!, candidateId: candidate.id, fullName: candidate.full_name ?? "",
    email: candidate.email ?? null, phone: candidate.phone ?? null, refNo: candidate.ref_no ?? null,
    jobTitle: app.job_title ?? app.position_text ?? null,
  };

  const lastSignal = useRef(openSignal ?? 0);
  useEffect(() => {
    if (openSignal && openSignal > 0 && openSignal !== lastSignal.current && canSchedule) setDlg({ kind: "schedule" });
    lastSignal.current = openSignal ?? 0;
  }, [openSignal, canSchedule]);

  const sorted = useMemo(() => {
    const now = Date.now();
    const rows = list.data ?? [];
    const upcoming = rows.filter((r) => r.status === "scheduled" && new Date(r.ends_at).getTime() > now)
      .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
    const rest = rows.filter((r) => !upcoming.includes(r)).sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at));
    return [...upcoming, ...rest];
  }, [list.data]);
  const shown = showAll ? sorted : sorted.slice(0, 4);

  const refresh = () => { for (const k of [ivKeys.all, candKeys.all, ["ats", "mail"], atsKeys.overview, atsKeys.jobSummary]) qc.invalidateQueries({ queryKey: k }); };

  const setStatus = async (iv: InterviewRow, status: "completed" | "no_show" | "scheduled") => {
    if (busyId) return;
    setBusyId(iv.id);
    try {
      await setInterviewStatus(iv.id, status);
      if (status === "completed") toast.success("Marked as completed", { action: { label: "Add feedback", onClick: () => setDlg({ kind: "feedback", iv }) } });
      else toast.success(status === "no_show" ? "Marked as did not attend" : "Marked as scheduled again");
      refresh();
    } catch (e) {
      toast.error(interviewErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const copyDetails = (iv: InterviewRow) => {
    const s = new Date(iv.starts_at);
    const v = interviewValues({
      fullName: target.fullName, refNo: target.refNo, jobTitle: target.jobTitle, phone: target.phone, title: iv.title,
      mode: iv.mode as IvMode, startsAt: iv.starts_at, minutes: minutesBetween(iv.starts_at, iv.ends_at),
      location: iv.location, meetingUrl: iv.meeting_url, candidateNote: iv.candidate_note,
    });
    const lines = [
      `Interview: ${iv.title} for ${v.job_title}`,
      `When: ${ivDateText(s)}, ${ivTimeText(s)} (${durationText(minutesBetween(iv.starts_at, iv.ends_at))})`,
      v.interview_where,
      ...(iv.candidate_note?.trim() ? [iv.candidate_note.trim()] : []),
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => toast.success("Copied"), () => toast.error("Couldn't copy"));
  };

  const scheduleTip = app.status === "hired" ? "This candidate is hired." : "Reopen this application to schedule an interview.";
  const scheduleBtn = (
    <Button size="sm" variant="outline" className="h-8 gap-1" disabled={!canSchedule} onClick={() => setDlg({ kind: "schedule" })}>
      <CalendarPlus className="h-3.5 w-3.5" /> Schedule
    </Button>
  );
  const appClosed = app.status === "rejected" || app.status === "withdrawn" || app.status === "hired";

  return (
    <SectionCard title={<>Interviews{sorted.length > 1 && <span className="ml-1.5 text-muted-foreground">({sorted.length})</span>}</>}
      action={canSchedule ? scheduleBtn : <Tip text={scheduleTip}><span tabIndex={0}>{scheduleBtn}</span></Tip>}>
      {list.isLoading ? <RowsSkeleton rows={2} /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> :
        !sorted.length ? <p className="text-sm text-muted-foreground">No interviews yet.</p> : (
          <ul className="space-y-2">
            {shown.map((iv) => {
              const st = ivState(iv);
              const members = activePanel(iv);
              const withFb = members.filter((m) => m.feedback_at);
              const missing = missingFeedback(iv);
              const busy = busyId === iv.id;
              return (
                <li key={iv.id} className="space-y-1.5 rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{iv.title}</span>
                    <InterviewStatusBadge iv={iv} />
                  </div>
                  <p className={cn("flex flex-wrap items-center gap-1.5 text-sm text-foreground", st === "cancelled" && "line-through text-muted-foreground")}>
                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> {ivWhen(iv)}
                    <span className="text-muted-foreground">· {fmtUntil(iv.starts_at)}</span>
                  </p>
                  <WhereLine iv={iv} phone={target.phone} />
                  <div className="flex flex-wrap items-center gap-1">
                    <PanelChips iv={iv} mailOn={mailOn} />
                    <ResponseChip iv={iv} />
                    {iv.reminder_queued_at && (
                      <Tip text={fmtDateTime(iv.reminder_queued_at)}><Badge variant="outline" tabIndex={0} className="font-normal text-muted-foreground">Reminder emailed</Badge></Tip>
                    )}
                  </div>
                  {iv.internal_note && <Clamp lines={2} prefix="Note for interviewers: " text={iv.internal_note} />}
                  {iv.candidate_note && <Clamp lines={2} prefix={`Note for ${first}: `} text={iv.candidate_note} />}
                  {st === "cancelled" && (
                    <p className="text-sm text-muted-foreground">Cancelled by {iv.cancelled_by_name ?? "—"} on {fmtDate(iv.cancelled_at)}{iv.cancel_reason ? ` · ${iv.cancel_reason}` : ""}</p>
                  )}
                  {st === "completed" && withFb.map((m) => (
                    <div key={m.id} className="space-y-0.5 rounded-md bg-muted/40 p-2">
                      <p className="text-sm font-medium text-foreground">
                        {m.name}{[recLabel(m.recommendation), m.score ? `${m.score}/5` : null].filter(Boolean).length ? ": " : ""}
                        {[recLabel(m.recommendation), m.score ? `${m.score}/5` : null].filter(Boolean).join(" · ")}
                      </p>
                      {m.feedback && <Clamp lines={3} text={m.feedback} />}
                    </div>
                  ))}
                  {st === "completed" && missing.length > 0 && <p className="text-sm text-warning">Feedback missing from {missing.map((m) => m.name).join(", ")}</p>}
                  {iv.status === "scheduled" && appClosed && <p className="text-sm text-warning">This application is closed. Cancel this interview if it won't happen.</p>}

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {st === "upcoming" && <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => setDlg({ kind: "schedule", iv })}>Change</Button>}
                    {(st === "now" || st === "awaiting") && <>
                      <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => setStatus(iv, "completed")}>Completed</Button>
                      <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => setStatus(iv, "no_show")}>Did not attend</Button>
                    </>}
                    {st === "completed" && (
                      <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => setDlg({ kind: "feedback", iv })}>
                        {members.length > 0 && missing.length === 0 ? "Edit feedback" : "Add feedback"}
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Interview actions" disabled={busy}><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {(st === "now" || st === "awaiting") && <DropdownMenuItem onSelect={() => setDlg({ kind: "schedule", iv })}>Change</DropdownMenuItem>}
                        {(st === "upcoming" || st === "now") && mailOn && <DropdownMenuItem onSelect={() => setDlg({ kind: "notify", iv })}>Send invitations…</DropdownMenuItem>}
                        {(st === "completed" || st === "no_show") && <DropdownMenuItem onSelect={() => setStatus(iv, "scheduled")}>Undo: mark as scheduled</DropdownMenuItem>}
                        {(st === "no_show" || st === "cancelled") && <DropdownMenuItem disabled={!canSchedule} onSelect={() => setDlg({ kind: "schedule", copy: iv })}>Schedule again</DropdownMenuItem>}
                        {st !== "no_show" && st !== "cancelled" && <DropdownMenuItem onSelect={() => copyDetails(iv)}>Copy details</DropdownMenuItem>}
                        {(st === "upcoming" || st === "now" || st === "awaiting") && <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDlg({ kind: "cancel", iv })}>Cancel interview…</DropdownMenuItem>
                        </>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
            {!showAll && sorted.length > 4 && (
              <li><Button variant="link" size="sm" className="h-auto p-0" onClick={() => setShowAll(true)}>Show all ({sorted.length})</Button></li>
            )}
          </ul>
        )}

      <ScheduleInterviewDialog open={dlg?.kind === "schedule"} onOpenChange={(o) => { if (!o) setDlg(null); }} target={target}
        interview={dlg?.kind === "schedule" ? dlg.iv ?? null : null} copyFrom={dlg?.kind === "schedule" ? dlg.copy ?? null : null} />
      {dlg?.kind === "notify" && <NotifyInterviewDialog open onOpenChange={(o) => { if (!o) setDlg(null); }} iv={dlg.iv} target={target} />}
      {dlg?.kind === "cancel" && <CancelInterviewDialog open onOpenChange={(o) => { if (!o) setDlg(null); }} iv={dlg.iv} target={target} />}
      {dlg?.kind === "feedback" && <InterviewFeedbackDialog open onOpenChange={(o) => { if (!o) setDlg(null); }}
        iv={(list.data ?? []).find((x) => x.id === dlg.iv.id) ?? dlg.iv} />}
    </SectionCard>
  );
}
