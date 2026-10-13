import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, CalendarPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { type AtsAppRow, type AtsCandidate } from "@/lib/ats/candidates";
import { fmtDate, fmtDateTime } from "@/lib/ats/format";
import { mailErrorMessage, useMailStatus } from "@/lib/ats/mail";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  activePanel, fmtUntil, ivState, ivWhen, missingFeedback, recLabel, useAppInterviews, type IvTarget,
} from "@/lib/ats/interviews";
import { QueryError, RowsSkeleton, SectionCard } from "./AtsBits";
import { InterviewStatusBadge, ivAccentClass, PanelChips, ResponseChip, Tip, WhereLine } from "./InterviewBits";
import { ScheduleInterviewDialog } from "./ScheduleInterviewDialog";
import { InterviewActions } from "./InterviewActions";

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


export function InterviewsCard({ app, candidate, openSignal }: { app: AtsAppRow; candidate: AtsCandidate; openSignal?: number }) {
  const list = useAppInterviews(app.application_id);
  const mail = useMailStatus();
  const mailOn = !!mail.data?.enabled;
  // The real state of each interview's reminder email (newest per interview), one query for the whole card.
  const reminders = useQuery({
    queryKey: ["ats", "mail", "reminders", app.application_id],
    enabled: !!app.application_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_messages")
        .select("interview_id, status, sent_at, error, created_at, calendar_revision")
        .eq("application_id", app.application_id!).eq("template_code", "interview-reminder").not("interview_id", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Newest first, all rows per interview: the badge uses the newest one for the interview's current time.
      const m = new Map<string, { status: string; sent_at: string | null; error: string | null; calendar_revision: number | null }[]>();
      for (const r of data ?? []) m.set(r.interview_id!, [...(m.get(r.interview_id!) ?? []), r]);
      return m;
    },
  });
  const [newOpen, setNewOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const first = (candidate.full_name ?? "").trim().split(/\s+/)[0] || "the candidate";
  const canSchedule = app.status === "active" || app.status === "on_hold";

  const target: IvTarget = {
    applicationId: app.application_id!, candidateId: candidate.id, fullName: candidate.full_name ?? "",
    email: candidate.email ?? null, phone: candidate.phone ?? null, refNo: candidate.ref_no ?? null,
    jobTitle: app.job_title ?? app.position_text ?? null,
  };

  const lastSignal = useRef(openSignal ?? 0);
  useEffect(() => {
    if (openSignal && openSignal > 0 && openSignal !== lastSignal.current && canSchedule) setNewOpen(true);
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

  const scheduleTip = app.status === "hired" ? "This candidate is hired." : "Reopen this application to schedule an interview.";
  const scheduleBtn = (
    <Button size="sm" variant="outline" className="h-8 gap-1" disabled={!canSchedule} onClick={() => setNewOpen(true)}>
      <CalendarPlus className="h-3.5 w-3.5" /> Schedule
    </Button>
  );
  const appClosed = app.status === "rejected" || app.status === "withdrawn" || app.status === "hired";

  return (
    <SectionCard title={<>Interviews{sorted.length > 1 && <span className="ml-1.5 text-muted-foreground">({sorted.length})</span>}</>}
      action={canSchedule ? scheduleBtn : <Tip text={scheduleTip}><span tabIndex={0}>{scheduleBtn}</span></Tip>}>
      {list.isLoading ? <RowsSkeleton rows={2} /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> :
        !sorted.length ? <EmptyState icon={CalendarClock} title="No interviews yet." className="py-6" /> : (
          <ul className="space-y-2">
            {shown.map((iv) => {
              const st = ivState(iv);
              const members = activePanel(iv);
              const withFb = members.filter((m) => m.feedback_at);
              const missing = missingFeedback(iv);
              return (
                <li key={iv.id} className="relative space-y-1.5 overflow-hidden rounded-lg border border-border bg-card p-3 pl-4">
                  <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${ivAccentClass(iv)}`} />
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
                    {(() => {
                      // A reminder for an earlier time of this interview (before it was moved) is ignored.
                      const rm = reminders.data?.get(iv.id)?.find((r) => r.calendar_revision == null || r.calendar_revision === iv.revision);
                      if (!rm) return null;
                      if (rm.status === "sent") return <Tip text={fmtDateTime(rm.sent_at)}><Badge variant="outline" tabIndex={0} className="font-normal text-muted-foreground">Reminder sent</Badge></Tip>;
                      if (rm.status === "queued" || rm.status === "sending") return <Badge variant="outline" className="font-normal text-muted-foreground">Reminder waiting to send</Badge>;
                      if (rm.status === "failed" || rm.status === "bounced") return <Tip text={mailErrorMessage(rm.error)}><Badge variant="outline" tabIndex={0} className="border-destructive/40 font-normal text-destructive">Reminder not delivered</Badge></Tip>;
                      return null;
                    })()}
                  </div>
                  {iv.internal_note && <Clamp lines={2} prefix="Note for interviewers: " text={iv.internal_note} />}
                  {iv.candidate_note && <Clamp lines={2} prefix={`Note for ${first}: `} text={iv.candidate_note} />}
                  {st === "cancelled" && (
                    <p className="text-sm text-muted-foreground">Cancelled by {iv.cancelled_by_name ?? "—"} on {fmtDate(iv.cancelled_at)}{iv.cancel_reason ? ` · ${iv.cancel_reason}` : ""}</p>
                  )}
                  {st === "completed" && withFb.map((m) => (
                    <div key={m.id} className="space-y-0.5 rounded-md bg-muted/50 p-2.5">
                      <p className="text-sm font-medium text-foreground">
                        {m.name}{[recLabel(m.recommendation), m.score ? `${m.score}/5` : null].filter(Boolean).length ? ": " : ""}
                        {[recLabel(m.recommendation), m.score ? `${m.score}/5` : null].filter(Boolean).join(" · ")}
                      </p>
                      {m.feedback && <Clamp lines={3} text={m.feedback} />}
                    </div>
                  ))}
                  {st === "completed" && missing.length > 0 && <p className="text-sm text-warning">Feedback missing from {missing.map((m) => m.name).join(", ")}</p>}
                  {iv.status === "scheduled" && appClosed && <p className="text-sm text-warning">This application is closed. Cancel this interview if it won't happen.</p>}

                  <InterviewActions iv={iv} target={target} mailOn={mailOn} canSchedule={canSchedule} />
                </li>
              );
            })}
            {!showAll && sorted.length > 4 && (
              <li><Button variant="link" size="sm" className="h-auto p-0" onClick={() => setShowAll(true)}>Show all ({sorted.length})</Button></li>
            )}
          </ul>
        )}

      <ScheduleInterviewDialog open={newOpen} onOpenChange={setNewOpen} target={target} />
    </SectionCard>
  );
}
