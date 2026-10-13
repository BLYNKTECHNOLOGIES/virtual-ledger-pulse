import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import DOMPurify from "dompurify";
import {
  AlertTriangle, ArrowRightLeft, CalendarCheck, CalendarClock, CalendarPlus, CalendarX, Check, Clock, Loader2, Mail, MessageCircle,
  MoreVertical, Paperclip, Phone, RefreshCw, Reply, RotateCcw, Send, Upload, UserX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { StatusPill } from "./AtsUi";
import { atsErrorMessage } from "@/lib/ats/errors";
import { fmtDate, fmtDateTime, fmtRelative } from "@/lib/ats/format";
import { InterruptedRetryDialog, SubjectSentAs } from "./MailBits";
import { AtsFileError, fileKindLabel, fmtBytes, uploadAtsFile } from "@/lib/ats/files";
import { candKeys, useCandidateEvents, type AtsAppRow, type AtsCandidate, type AtsEventRow, type AtsFile } from "@/lib/ats/candidates";
import {
  MailError, PLACEHOLDER_RE, canRetry, findOlderEmails, deleteMessage, mailErrorMessage, mailKeys, markMessageUnread, markThreadRead,
  purposeLabel, renderTemplate, retryCandidateEmail, sendCandidateEmail, splitQuoted, useEmailTemplates,
  useMailStatus, useMailThread, usesInterviewFields, type AtsEmailTemplate, type AtsMessage, type MailAttachmentInfo,
} from "@/lib/ats/mail";
import { CalendarDays } from "lucide-react";
import { QueryError, RowsSkeleton } from "./AtsBits";
import { useCheckNow } from "./EmailSettingsSection";
import { useIsHrAdmin } from "@/lib/ats/api";
import { fmtUntil, ivKeys, ivState, useAppInterviews, type InterviewRow, type IvTarget } from "@/lib/ats/interviews";
import {
  FOLLOW_UP_CHOICES, INTENTS, INTENT_META, convKeys, followUpAt, intentData, markHandled, proposedTimes, setConversation,
  setInterviewResponse, setMessageIntent, useConversationState, type FollowUpChoice, type ProposedTime, type ReplyIntent,
} from "@/lib/ats/conversations";
import { ADDRESS_RE, nextSteps, type Step } from "@/lib/ats/nextStep";
import { IntentChip } from "./ConversationBits";
import { NextStepBar } from "./NextStepBar";
import { ScheduleInterviewDialog } from "./ScheduleInterviewDialog";

interface Props {
  candidate: AtsCandidate;
  appId: string | null;
  /** The selected application (for interview actions and status). */
  app?: AtsAppRow | null;
  files: AtsFile[];
  visible: boolean;
  /** Increment to open the composer. */
  composeSignal?: number;
  onOpenFile: (fileId: string) => void;
  onEditProfile: () => void;
  /** Opens the candidate page's status dialog; `after` runs once the change succeeded. */
  onRequestStatus?: (s: "withdrawn", after?: () => void) => void;
  className?: string;
}

const istDay = (v: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(v));
const msgAt = (m: AtsMessage) => m.received_at ?? m.sent_at ?? m.created_at;
const istTime = (v: string) => new Date(v).toLocaleTimeString("en-US", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });

const ACTIVITY_TYPES = new Set([
  "stage_changed", "status_changed", "application_moved_job", "interview_scheduled", "interview_rescheduled", "interview_cancelled",
  "interview_completed", "interview_no_show", "interview_response", "call_logged", "whatsapp_opened",
]);
const ACTIVITY_ICON: Record<string, typeof Mail> = {
  stage_changed: ArrowRightLeft, status_changed: RotateCcw, application_moved_job: ArrowRightLeft, interview_scheduled: CalendarPlus,
  interview_rescheduled: CalendarClock, interview_cancelled: CalendarX, interview_completed: CalendarCheck, interview_no_show: UserX,
  interview_response: Reply, call_logged: Phone, whatsapp_opened: MessageCircle,
};
const ACTIVITY_KEY = "ats-msg-activity";
const readActivityPref = () => { try { return localStorage.getItem(ACTIVITY_KEY) !== "off"; } catch { return true; } };

export interface ComposerPreset { nonce: number; code?: string; interviewId?: string | null }
interface SchedReq { interview: InterviewRow | null; time: ProposedTime | null; handled?: string; msgId?: string }

const isTyping = (t: EventTarget | null) =>
  !!(t as HTMLElement | null)?.closest?.("input,textarea,select,[contenteditable=true],[role=dialog],[role=alertdialog],[role=menu],[role=listbox]");

export function MessagesPanel({ candidate, appId, app, files, visible, composeSignal, onOpenFile, onEditProfile, onRequestStatus, className }: Props) {
  const qc = useQueryClient();
  const st = useMailStatus();
  const enabled = !!st.data?.enabled;
  const thread = useMailThread(candidate.id, { poll: visible && enabled });
  const check = useCheckNow();
  const conv = useConversationState(enabled ? candidate.id : null);
  const ivs = useAppInterviews(appId);
  const events = useCandidateEvents(candidate.id);
  const [composing, setComposing] = useState(false);
  const [preset, setPreset] = useState<ComposerPreset | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [showActivity, setShowActivity] = useState(readActivityPref);
  const [sched, setSched] = useState<SchedReq | null>(null);
  const [stepBusy, setStepBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const msgs = thread.data ?? [];
  const firstName = (candidate.full_name ?? "").trim().split(/\s+/)[0] || "this candidate";

  const openComposer = (p?: { code?: string; interviewId?: string | null }) => {
    setComposing(true);
    setPreset(p ? { ...p, nonce: Date.now() } : null);
    setFocusNonce((n) => n + 1);
  };

  useEffect(() => { if (composeSignal) setComposing(true); }, [composeSignal]);

  // "r" opens the composer (panel visible, not typing, no dialog open).
  const openRef = useRef(openComposer);
  openRef.current = openComposer;
  useEffect(() => {
    if (!visible || !enabled) return;
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== "r") return;
      if (isTyping(e.target) || document.querySelector("[role=dialog],[role=alertdialog]")) return;
      e.preventDefault();
      openRef.current();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [visible, enabled]);

  // Auto-scroll on open and when a new message arrives.
  const lastId = msgs[msgs.length - 1]?.id;
  useEffect(() => {
    if (visible) endRef.current?.scrollIntoView({ block: "end" });
  }, [visible, lastId]);

  // Read state: once per visible view with unread received messages.
  // Emails the user marked unread in this opening of the pane are never re-marked read.
  const keepUnreadRef = useRef<Set<string>>(new Set());
  useEffect(() => { if (!visible) keepUnreadRef.current = new Set(); }, [visible, candidate.id]);
  const unread = msgs.some((m) => m.direction === "inbound" && !m.read_at && !keepUnreadRef.current.has(m.id));
  const markingRef = useRef(false);
  useEffect(() => {
    if (!visible || !unread || markingRef.current) return;
    markingRef.current = true;
    const keep = [...keepUnreadRef.current];
    markThreadRead(candidate.id).then(async () => {
      for (const id of keep) await markMessageUnread(id).catch(() => undefined);
    }).then(() => {
      qc.invalidateQueries({ queryKey: mailKeys.thread(candidate.id) });
      qc.invalidateQueries({ queryKey: mailKeys.status });
      qc.invalidateQueries({ queryKey: mailKeys.unreadIds });
    }).catch(() => undefined).finally(() => { markingRef.current = false; });
  }, [visible, unread, candidate.id, qc]);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: mailKeys.thread(candidate.id) });
    qc.invalidateQueries({ queryKey: mailKeys.status });
    qc.invalidateQueries({ queryKey: candKeys.events(candidate.id) });
    qc.invalidateQueries({ queryKey: candKeys.all });
    qc.invalidateQueries({ queryKey: convKeys.all });
  };

  const fileIds = useMemo(() => new Map(files.map((f) => [f.id, f] as const)), [files]);
  const [finding, setFinding] = useState(false);
  const findOlder = async () => {
    if (finding) return;
    setFinding(true);
    try {
      const r = await findOlderEmails(candidate.id, 180);
      if (r.skipped === "busy") toast.message("Already checking. Try again in a minute.");
      else if (!r.ok || r.error) toast.error(mailErrorMessage(r.error));
      else if (Number(r.stored ?? 0) > 0) toast.success(`${r.stored} older ${Number(r.stored) === 1 ? "email" : "emails"} added`);
      else toast.message("No older emails found");
    } catch (e: any) {
      toast.error(mailErrorMessage(e?.code));
    } finally {
      setFinding(false);
      refreshAll();
      qc.invalidateQueries({ queryKey: candKeys.files(candidate.id) });
    }
  };

  // ---- interview target + upcoming interview of this application
  const target: IvTarget | null = app?.application_id ? {
    applicationId: app.application_id, candidateId: candidate.id, fullName: candidate.full_name ?? "",
    email: candidate.email ?? null, phone: candidate.phone ?? null, refNo: candidate.ref_no ?? null,
    jobTitle: app.job_title ?? app.position_text ?? null,
  } : null;
  const upcoming = useMemo(() => [...(ivs.data ?? [])].filter((iv) => ivState(iv) === "upcoming")
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0] ?? null, [ivs.data]);

  // ---- next-step bar: newest real reply that is newer than the newest sent email
  const lastIn = useMemo(() => [...msgs].reverse().find((m) => m.direction === "inbound" && !m.is_automatic && m.intent !== "auto_reply") ?? null, [msgs]);
  const lastOutAt = useMemo(() => Math.max(0, ...msgs.filter((m) => m.direction === "outbound").map((m) => new Date(msgAt(m)).getTime())), [msgs]);
  const barMsg = lastIn && new Date(msgAt(lastIn)).getTime() > lastOutAt ? lastIn : null;
  const resumeCandidate = useMemo(() => {
    if (!barMsg) return null;
    const atts = (Array.isArray(barMsg.attachments) ? barMsg.attachments : []) as MailAttachmentInfo[];
    for (const a of atts) {
      const f = a.file_id ? fileIds.get(a.file_id) : undefined;
      if (f && f.kind === "other" && /\.(pdf|docx?)$/i.test(f.file_name ?? "")) return f;
    }
    return null;
  }, [barMsg, fileIds]);
  const steps = useMemo(() => {
    if (!barMsg) return [];
    const intent = (barMsg.intent as ReplyIntent) || "other";
    const all = nextSteps({
      intent, hasUpcoming: !!upcoming, upcomingAccepted: upcoming?.candidate_response === "accepted",
      times: proposedTimes(barMsg.intent_data), appOpen: app?.status === "active" || app?.status === "on_hold",
      canUseResume: !!resumeCandidate, mentionsAddress: ADDRESS_RE.test(`${barMsg.subject ?? ""}\n${barMsg.body_text ?? ""}`),
    });
    const needsTarget = new Set(["mark_confirmed", "change_time", "schedule", "schedule_at", "other_time"]);
    return all.filter((s) => (target ? true : !needsTarget.has(s.key)) && (s.key !== "withdraw" || !!onRequestStatus));
  }, [barMsg, upcoming, app?.status, resumeCandidate, target, onRequestStatus]);

  const handle = async (id: string, action: string | null) => {
    try { await markHandled(id, action); refreshAll(); } catch (e) { toast.error(atsErrorMessage(e)); }
  };
  const runStep = async (s: Step) => {
    if (!barMsg) return;
    const m = barMsg;
    switch (s.key) {
      case "reply": return openComposer();
      case "no_reply": return handle(m.id, "no_reply_needed");
      case "reply_see_you": return openComposer({ code: "interview-confirmed", interviewId: upcoming?.id ?? null });
      case "ask_times": return openComposer({ code: "interview-invitation" });
      case "office_address": return openComposer({ code: "office-directions" });
      case "mark_confirmed":
        if (!upcoming) return;
        setStepBusy(true);
        try {
          await setInterviewResponse(upcoming.id, "accepted", m.id);
          toast.success("Interview marked as confirmed");
          qc.invalidateQueries({ queryKey: ivKeys.all });
          refreshAll();
        } catch (e) { toast.error(atsErrorMessage(e)); } finally { setStepBusy(false); }
        return;
      case "change_time": return setSched({ interview: upcoming, time: s.time ?? null, handled: "interview_changed", msgId: m.id });
      case "schedule": return setSched({ interview: null, time: s.time ?? null, handled: "interview_scheduled", msgId: m.id });
      case "schedule_at": return setSched({ interview: upcoming, time: s.time ?? null, handled: upcoming ? "interview_changed" : "interview_scheduled", msgId: m.id });
      case "other_time": return setSched({ interview: upcoming, time: null, handled: upcoming ? "interview_changed" : "interview_scheduled", msgId: m.id });
      case "withdraw": return onRequestStatus?.("withdrawn", () => { void handle(m.id, "withdrawn"); });
      case "use_resume": {
        if (!resumeCandidate) return;
        setStepBusy(true);
        const { error } = await supabase.from("ats_files").update({ kind: "resume", is_primary: true }).eq("id", resumeCandidate.id);
        setStepBusy(false);
        if (error) return toast.error(atsErrorMessage(error));
        qc.invalidateQueries({ queryKey: candKeys.files(candidate.id) });
        toast.success("Saved as the main resume");
        return handle(m.id, "resume_set");
      }
      case "docs_received":
        await handle(m.id, "documents_received");
        return openComposer({ code: "documents-received" });
    }
  };

  // ---- follow-up line in the header
  const fu = conv.data?.follow_up_at && new Date(conv.data.follow_up_at).getTime() > Date.now() ? conv.data.follow_up_at : null;
  const clearFollowUp = async () => {
    try { await setConversation(candidate.id, "clear_follow_up"); refreshAll(); qc.invalidateQueries({ queryKey: convKeys.state(candidate.id) }); }
    catch (e) { toast.error(atsErrorMessage(e)); }
  };

  // ---- interleave activity rows between emails
  type Item = { kind: "msg"; at: string; m: AtsMessage } | { kind: "ev"; at: string; ev: AtsEventRow };
  const items = useMemo<Item[]>(() => {
    const list: Item[] = msgs.map((m) => ({ kind: "msg", at: msgAt(m), m }));
    if (showActivity) for (const ev of events.data ?? []) if (ACTIVITY_TYPES.has(ev.event_type)) list.push({ kind: "ev", at: ev.created_at, ev });
    return list.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [msgs, events.data, showActivity]);
  const toggleActivity = (on: boolean) => {
    setShowActivity(on);
    try { localStorage.setItem(ACTIVITY_KEY, on ? "on" : "off"); } catch { /* storage unavailable */ }
  };

  const pickTime = (t: ProposedTime) => {
    if (!target) return toast.message("Open an application first.");
    setSched({ interview: upcoming, time: t });
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Messages</p>
          <p className="truncate text-xs text-muted-foreground">{candidate.email ?? "No email address"}</p>
          {enabled && fu && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden /><span title={fmtDateTime(fu)}>Follow up {fmtUntil(fu)}</span>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={clearFollowUp}>Clear</Button>
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
        {enabled && (
          <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Check for new emails" disabled={check.disabled} onClick={check.run}>
              {check.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </TooltipTrigger><TooltipContent>Check for new emails</TooltipContent></Tooltip></TooltipProvider>
        )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="More email actions"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={!enabled || !candidate.email || finding} onSelect={findOlder}>
                Find older emails from {candidate.email ?? "this candidate"}
              </DropdownMenuItem>
              <DropdownMenuCheckboxItem checked={showActivity} onCheckedChange={(v) => toggleActivity(!!v)}>Show activity in messages</DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {thread.isLoading || st.isLoading ? <RowsSkeleton rows={5} /> : thread.isError ? <QueryError error={thread.error} onRetry={() => thread.refetch()} /> : (
          <>
            {!enabled && (
              <EmptyState icon={Mail} title="Candidate email is off"
                description="Turn it on in ATS → Settings → Email to send emails and see replies here."
                action={<Button asChild size="sm" variant="outline"><Link to="/hrms/ats/settings?tab=email">Open email settings</Link></Button>} />
            )}
            {enabled && !msgs.length && <p className="py-8 text-center text-sm text-muted-foreground">No emails with {firstName} yet.</p>}
            {items.map((it, i) => {
              const day = istDay(it.at);
              const showDay = i === 0 || istDay(items[i - 1].at) !== day;
              return (
                <Fragment key={it.kind === "msg" ? it.m.id : `ev-${it.ev.id}`}>
                  {showDay && <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />{fmtDate(it.at)}<span className="h-px flex-1 bg-border" /></div>}
                  {it.kind === "msg"
                    ? <MessageBubble m={it.m} fileIds={fileIds} onOpenFile={onOpenFile} onChanged={refreshAll} mailOn={enabled} onMarkedUnread={(id) => keepUnreadRef.current.add(id)} onPickTime={pickTime} />
                    : <ActivityRow ev={it.ev} />}
                </Fragment>
              );
            })}
            <div ref={endRef} />
          </>
        )}
      </div>

      {enabled && barMsg && (
        <NextStepBar intent={barMsg.intent ?? "other"} preview={intentData(barMsg.intent_data).preview || barMsg.snippet || ""} steps={steps} busy={stepBusy}
          handled={barMsg.handled_at ? { action: barMsg.handled_action, by: barMsg.handled_by_name, at: barMsg.handled_at } : null}
          onStep={runStep} onUndo={() => handle(barMsg.id, null)} />
      )}

      {enabled && (
        <div className="border-t border-border p-3">
          {!composing ? (
            <Button variant="outline" className="w-full justify-start text-muted-foreground" onClick={() => openComposer()}>Write an email…</Button>
          ) : !candidate.email ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Add an email address to this candidate first.</span>
              <Button size="sm" variant="outline" onClick={onEditProfile}>Edit profile</Button>
            </div>
          ) : (
            <Composer candidate={candidate} appId={appId} files={files} thread={msgs} preset={preset} focusNonce={focusNonce}
              upcomingId={upcoming?.id ?? null}
              onClose={() => { setComposing(false); setPreset(null); }} onDone={refreshAll} />
          )}
        </div>
      )}
      {target && (
        <ScheduleInterviewDialog open={!!sched} onOpenChange={(o) => !o && setSched(null)} target={target}
          interview={sched?.interview ?? null} initialStart={sched?.time?.start ?? null} initialDateOnly={!!sched?.time?.dateOnly}
          onSaved={() => {
            const s = sched;
            if (s?.handled && s.msgId) void handle(s.msgId, s.handled);
            qc.invalidateQueries({ queryKey: ivKeys.all });
          }} />
      )}
    </div>
  );
}

function ActivityRow({ ev }: { ev: AtsEventRow }) {
  const Icon = ACTIVITY_ICON[ev.event_type] ?? RotateCcw;
  const note = ev.event_type === "call_logged" ? String((ev.data as Record<string, unknown> | null)?.note ?? "").trim() : "";
  return (
    <div className="flex flex-col items-center gap-0.5 py-0.5 text-center text-xs text-muted-foreground">
      <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="text-foreground">{ev.summary ?? ev.event_type}</span>
        {ev.actor_name && <span>· {ev.actor_name}</span>}
        <span title={fmtDateTime(ev.created_at)}>· {istTime(ev.created_at)} IST</span>
      </span>
      {note && <span className="max-w-[80%] whitespace-pre-wrap break-words italic">“{note}”</span>}
    </div>
  );
}

/** Intent chip on a received email; click to correct the label. */
function IntentMenu({ m, onChanged }: { m: AtsMessage; onChanged: () => void }) {
  const intent = ((m.intent as ReplyIntent) || "other") as ReplyIntent;
  const conf = intentData(m.intent_data).confidence;
  const tip = m.intent_source === "hr" ? "Set by HR" : `Read by the ATS${conf ? ` (${conf})` : ""}`;
  const set = async (i: ReplyIntent) => {
    if (i === m.intent) return;
    try { await setMessageIntent(m.id, i); onChanged(); } catch (e) { toast.error(atsErrorMessage(e)); }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Reply type: ${INTENT_META[intent].label}. Change`} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <IntentChip intent={intent} size="sm" menu title={tip} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-xs">This reply is about…</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {INTENTS.map((i) => {
          const meta = INTENT_META[i];
          return <DropdownMenuItem key={i} onSelect={() => set(i)}><meta.icon className="mr-2 h-4 w-4" />{meta.label}{i === intent && <Check className="ml-auto h-4 w-4" />}</DropdownMenuItem>;
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


const SKIP_TEXT: Record<string, string> = {
  type_not_allowed: "Not saved: file type not supported",
  too_large: "Not saved: larger than 10 MB",
  limit: "Not saved: more than 5 attachments",
  upload_failed: "Not saved",
  unreadable: "Not saved",
};

function Attachments({ list, fileIds, onOpenFile }: { list: MailAttachmentInfo[]; fileIds: Map<string, AtsFile>; onOpenFile: (id: string) => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!list.length) return null;
  const applyResume = async (f: AtsFile) => {
    setBusy(true);
    const { error } = await supabase.from("ats_files").update({ kind: "resume", is_primary: true }).eq("id", f.id);
    setBusy(false);
    if (error) return toast.error(atsErrorMessage(error));
    qc.invalidateQueries({ queryKey: candKeys.files(f.candidate_id) });
    toast.success("Saved as the main resume");
  };
  const anyUnsaved = list.some((a) => a.skipped);
  return (
    <div className="mt-2 space-y-1">
      <div className="flex flex-wrap gap-1.5">
        {list.map((a, i) => {
          const openable = !!a.file_id && fileIds.has(a.file_id);
          const note = a.skipped ? SKIP_TEXT[a.skipped] ?? "Not saved" : a.duplicate ? "Already in files" : null;
          const chip = (
            <span className={cn("inline-flex max-w-full items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs",
              a.skipped ? "text-muted-foreground opacity-70" : "text-foreground", openable && "hover:bg-muted")}>
              <Paperclip className="h-3 w-3 shrink-0" /><span className="truncate">{a.name ?? "attachment"}</span>
              {a.size != null && <span className="text-muted-foreground">· {fmtBytes(a.size)}</span>}
              {note && <span className="text-muted-foreground">· {note}</span>}
            </span>
          );
          const file = a.file_id ? fileIds.get(a.file_id) : undefined;
          const canResume = !!file && file.kind === "other" && /\.(pdf|docx?)$/i.test(file.file_name ?? "");
          const el = openable
            ? <button key={i} type="button" onClick={() => onOpenFile(a.file_id!)} className="max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">{chip}</button>
            : <span key={i} className="max-w-full">{chip}</span>;
          return canResume
            ? <span key={i} className="inline-flex max-w-full items-center gap-1">{el}<button type="button" disabled={busy} onClick={() => applyResume(file!)} className="rounded text-xs text-primary hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Use as resume</button></span>
            : el;
        })}
      </div>
      {anyUnsaved && <p className="text-xs text-muted-foreground">Open the email in the HR mailbox to get it.</p>}
    </div>
  );
}

function MessageBubble({ m, fileIds, onOpenFile, onChanged, mailOn, onMarkedUnread, onPickTime }: { m: AtsMessage; fileIds: Map<string, AtsFile>; onOpenFile: (id: string) => void; onChanged: () => void; mailOn: boolean; onMarkedUnread: (id: string) => void; onPickTime: (t: ProposedTime) => void }) {
  const times = useMemo(() => (m.direction === "inbound" ? proposedTimes(m.intent_data) : []), [m.direction, m.intent_data]);
  const isAdmin = useIsHrAdmin().data === true;
  const out = m.direction === "outbound";
  const [showQuoted, setShowQuoted] = useState(false);
  const [origOpen, setOrigOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [askRetry, setAskRetry] = useState(false);
  const [main, quoted] = useMemo(() => (out ? [m.body_text ?? "", null] : splitQuoted(m.body_text ?? "")), [m.body_text, out]);
  const atts = (Array.isArray(m.attachments) ? m.attachments : []) as MailAttachmentInfo[];
  const when = msgAt(m);

  const retry = async () => {
    setRetrying(true);
    try {
      const r = await retryCandidateEmail(m.id);
      r.status === "sent" ? toast.success("Email sent") : r.status === "failed" ? toast.error(mailErrorMessage(r.error)) : undefined;
    } catch (e: any) {
      toast.error(e instanceof MailError ? mailErrorMessage(e.code, e.field) : mailErrorMessage(null));
    } finally {
      setRetrying(false);
      onChanged();
    }
  };
  const unreadIt = async () => {
    try { onMarkedUnread(m.id); await markMessageUnread(m.id); onChanged(); } catch (e) { toast.error(atsErrorMessage(e)); }
  };
  const remove = async () => {
    setDelOpen(false);
    try { await deleteMessage(m.id); toast.success("Email removed from the ATS"); onChanged(); }
    catch (e: any) { toast.error(e?.message === "Only HR admins can remove emails." ? e.message : atsErrorMessage(e)); }
  };

  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div className={cn("w-full max-w-[88%] rounded-xl p-3 ring-1 ring-inset", out ? cn("bg-primary/10", m.status === "failed" ? "ring-destructive/30" : "ring-primary/20") : "bg-muted ring-transparent")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 text-xs text-muted-foreground">
            {out
              ? <span><span className="font-medium text-foreground">{m.created_by_name ?? "ATS"}</span> to {m.to_addresses?.[0]}</span>
              : <span className="flex items-center gap-1.5">
                  {!m.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                  <span className="font-medium text-foreground">{m.from_name ?? m.from_address}</span>
                  {m.from_name && <span className="truncate">&lt;{m.from_address}&gt;</span>}
                </span>}
            <span className="block" title={fmtDateTime(when)}>{istTime(when)} IST</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {out && <StatusChip m={m} />}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Message actions"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => { navigator.clipboard.writeText(m.body_text ?? "").then(() => toast.success("Copied")); }}>Copy text</DropdownMenuItem>
                {!out && <DropdownMenuItem onSelect={unreadIt}>Mark as unread</DropdownMenuItem>}
                {isAdmin && <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDelOpen(true)}>Remove from ATS</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {!out && <IntentMenu m={m} onChanged={onChanged} />}
          {m.purpose && m.purpose !== "general" && <Badge variant="secondary" className="font-normal">{purposeLabel(m.purpose)}</Badge>}
          {m.calendar_ics && <Badge variant="outline" className="gap-1 font-normal"><CalendarDays className="h-3 w-3" /> Calendar invite</Badge>}
          {!out && m.is_automatic && <Badge variant="outline" className="font-normal">Automatic reply</Badge>}
        </div>
        {!out && m.from_other_address && <p className="mt-1 text-xs text-muted-foreground">Sent from {m.from_address}, not the candidate's saved address.</p>}
        <p className="mt-1 break-words text-sm font-semibold text-foreground">{m.subject || "(no subject)"}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{main}</p>
        {quoted && (
          <div className="mt-1">
            <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => setShowQuoted((v) => !v)}>
              {showQuoted ? "Hide quoted text" : "Show quoted text"}
            </button>
            {showQuoted && <p className="mt-1 whitespace-pre-wrap break-words border-l-2 border-border pl-2 text-xs text-muted-foreground">{quoted}</p>}
          </div>
        )}
        {!out && times.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {times.map((t) => (
              <Button key={t.start} size="sm" variant="outline" className="h-7 gap-1 text-xs" title={t.text} onClick={() => onPickTime(t)}>
                <CalendarPlus className="h-3.5 w-3.5" aria-hidden />{t.label}
              </Button>
            ))}
          </div>
        )}
        <Attachments list={atts} fileIds={fileIds} onOpenFile={onOpenFile} />
        {out && m.status === "failed" && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-destructive">
            <StatusPill tone="destructive">Not delivered</StatusPill>
            <span>{mailErrorMessage(m.error)}</span>
            {mailOn && canRetry(m.error) && <Button size="sm" variant="outline" className="h-7 gap-1" disabled={retrying} onClick={() => (m.error === "interrupted" ? setAskRetry(true) : retry())}>
              {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Retry
            </Button>}
          </div>
        )}
        {!out && m.body_html && (
          <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" onClick={() => setOrigOpen(true)}>View original</Button>
        )}
      </div>
      {!out && m.body_html && <OriginalDialog open={origOpen} onOpenChange={setOrigOpen} html={m.body_html} subject={m.subject} />}
      <InterruptedRetryDialog open={askRetry} onOpenChange={setAskRetry} onConfirm={retry} />
      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remove this email?</AlertDialogTitle>
            <AlertDialogDescription>Remove this email from the candidate's profile? It stays in the HR mailbox.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={remove}>Remove</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusChip({ m }: { m: AtsMessage }) {
  const base = "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium";
  switch (m.status) {
    case "sending": return <span className={cn(base, "bg-muted text-muted-foreground")}><Loader2 className="h-3 w-3 animate-spin" /> Sending</span>;
    case "sent": return <span className={cn(base, "bg-success/15 text-success")}><Check className="h-3 w-3" /> Sent</span>;
    case "queued": return <span className={cn(base, "bg-muted text-muted-foreground")}><Clock className="h-3 w-3" /> Queued</span>;
    case "failed": return <span className={cn(base, "bg-destructive/15 text-destructive")}><AlertTriangle className="h-3 w-3" /> Failed</span>;
    case "bounced": return <span className={cn(base, "bg-warning/15 text-warning")} title={mailErrorMessage("bounced")}><AlertTriangle className="h-3 w-3" /> Bounced: check the address</span>;
    default: return null;
  }
}

/** Candidate HTML is only ever rendered inside this sandboxed iframe (no scripts, no same-origin). */
function buildSandboxDoc(html: string, loadImages: boolean): string {
  const clean = DOMPurify.sanitize(html, { WHOLE_DOCUMENT: false, FORBID_TAGS: ["style", "form", "input", "button", "iframe", "object", "embed"] });
  const csp = `default-src 'none'; img-src ${loadImages ? "https: data:" : "data:"}; style-src 'unsafe-inline'`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{font-family:system-ui,sans-serif;font-size:14px;color:#111;background:#fff;margin:12px;word-break:break-word}img{max-width:100%;height:auto}</style></head><body>${clean}</body></html>`;
}

function OriginalDialog({ open, onOpenChange, html, subject }: { open: boolean; onOpenChange: (o: boolean) => void; html: string; subject: string | null }) {
  const [loadImages, setLoadImages] = useState(false);
  const doc = useMemo(() => (open ? buildSandboxDoc(html, loadImages) : ""), [open, html, loadImages]);
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={subject || "Original email"}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch id="orig-img" checked={loadImages} onCheckedChange={setLoadImages} />
          <Label htmlFor="orig-img">Load images</Label>
        </div>
        <iframe title="Original email" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={doc}
          className="h-[60vh] w-full overflow-auto rounded-lg border border-border bg-background" />
      </div>
    </ResponsiveDialog>
  );
}

const stripRe = (s: string) => s.replace(/^\s*((re|fwd?)\s*:\s*)+/i, "").trim();

const DRAFT_KEY = (candidateId: string) => `ats-draft:${candidateId}`;
const FU_KEY = "ats-followup-choice";
const readDraft = (cid: string): { subject: string; body: string } | null => {
  try { const v = localStorage.getItem(DRAFT_KEY(cid)); return v ? JSON.parse(v) : null; } catch { return null; }
};
const clearDraft = (cid: string) => { try { localStorage.removeItem(DRAFT_KEY(cid)); } catch { /* storage unavailable */ } };
const readFu = (): FollowUpChoice => {
  try { const v = localStorage.getItem(FU_KEY); return FOLLOW_UP_CHOICES.some((c) => c.value === v) ? (v as FollowUpChoice) : "off"; } catch { return "off"; }
};

function Composer({ candidate, appId, files, thread, preset, focusNonce, upcomingId, onClose, onDone }: {
  candidate: AtsCandidate; appId: string | null; files: AtsFile[]; thread: AtsMessage[]; onClose: () => void; onDone: () => void;
  preset?: ComposerPreset | null; focusNonce?: number; upcomingId?: string | null;
}) {
  const qc = useQueryClient();
  const templates = useEmailTemplates();
  // Continue this application's latest message; fall back to the latest overall when it has none.
  const appThread = thread.filter((m) => m.application_id === appId);
  const latest = appThread[appThread.length - 1] ?? thread[thread.length - 1];
  const reSubject = latest?.subject ? `Re: ${stripRe(latest.subject)}`.slice(0, 200) : "";
  const [subject, setSubject] = useState(reSubject);
  const [body, setBody] = useState("");
  const [reply, setReply] = useState(!!latest);
  const [tplMeta, setTplMeta] = useState<{ code: string | null; purpose: string }>({ code: null, purpose: "general" });
  const [pendingTpl, setPendingTpl] = useState<{ id: string; quick: boolean } | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fuChoice, setFuChoice] = useState<FollowUpChoice>(readFu);
  const [askDiscard, setAskDiscard] = useState(false);
  const idRef = useRef<string>(crypto.randomUUID());
  const attemptSig = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Draft safety: restore when the composer opens empty (no preset), save while writing.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (preset) return;
    const d = readDraft(candidate.id);
    if (d && (d.body?.trim() || d.subject?.trim())) { if (d.subject) setSubject(d.subject); setBody(d.body ?? ""); }
  }, [candidate.id, preset]);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (body.trim()) localStorage.setItem(DRAFT_KEY(candidate.id), JSON.stringify({ subject, body }));
        else localStorage.removeItem(DRAFT_KEY(candidate.id));
      } catch { /* storage unavailable */ }
    }, 500);
    return () => clearTimeout(t);
  }, [subject, body, candidate.id]);

  useEffect(() => { if (focusNonce) setTimeout(() => bodyRef.current?.focus(), 0); }, [focusNonce]);

  // Autosize 8–20 rows.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.style.height = `${Math.min(Math.max(el.scrollHeight, line * 8 + 16), line * 20 + 16)}px`;
  }, [body]);

  const hasPlaceholders = PLACEHOLDER_RE.test(`${subject}\n${body}`);
  const selFiles = files.filter((f) => sel.includes(f.id));
  const total = selFiles.reduce((s, f) => s + Number(f.size_bytes ?? 0), 0);
  const canSend = !sending && !!subject.trim() && !!body.trim() && !hasPlaceholders && sel.length <= 5 && total <= 15 * 1024 * 1024;

  const applyTemplate = async (id: string, quick = false) => {
    try {
      const t = (templates.data ?? []).find((x) => x.id === id);
      let r: { subject: string; body: string; template_code: string; purpose: string };
      if (t && usesInterviewFields(t)) {
        if (!upcomingId) throw new Error("ATS_INTERVIEW_CLOSED");
        const { data, error } = await supabase.rpc("ats_render_interview_text", { p_interview_id: upcomingId, p_subject: t.subject, p_body: t.body });
        if (error) throw error;
        const d = (data ?? {}) as { subject?: string; body?: string };
        r = { subject: d.subject ?? t.subject, body: d.body ?? t.body, template_code: t.code, purpose: t.purpose ?? "general" };
      } else {
        r = await renderTemplate(id, appId, candidate.id);
      }
      // Quick replies in a thread keep the "Re: …" subject.
      if (!(quick && reply && latest)) setSubject(r.subject.slice(0, 200));
      setBody(r.body);
      setTplMeta({ code: r.template_code, purpose: r.purpose });
      setTimeout(() => bodyRef.current?.focus(), 0);
    } catch (e) {
      toast.error(atsErrorMessage(e));
    }
  };
  const pickTemplate = (id: string, quick = false) => (body.trim() ? setPendingTpl({ id, quick }) : applyTemplate(id, quick));

  const quickReplies = (templates.data ?? []).filter((t) => (t as AtsEmailTemplate).quick_reply && (!usesInterviewFields(t) || (!!upcomingId && t.code === "interview-confirmed")));

  // Preset from the next-step bar: fill a template by code once per request.
  const presetDone = useRef<number | null>(null);
  useEffect(() => {
    if (!preset?.code || presetDone.current === preset.nonce || !templates.data) return;
    presetDone.current = preset.nonce;
    const t = templates.data.find((x) => x.code === preset.code);
    if (!t) { toast.error("That template is turned off. Turn it on in ATS → Settings → Email."); return; }
    pickTemplate(t.id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, templates.data]);

  const cancel = () => (body.trim() ? setAskDiscard(true) : onClose());

  const toggleFile = (id: string, on: boolean) =>
    setSel((cur) => (on ? (cur.length >= 5 ? cur : [...cur, id]) : cur.filter((x) => x !== id)));

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const row = await uploadAtsFile({ file, candidateId: candidate.id, applicationId: appId, kind: "other" });
      await qc.invalidateQueries({ queryKey: candKeys.files(candidate.id) });
      setSel((cur) => (cur.length >= 5 ? cur : [...cur, row.id]));
    } catch (e) {
      toast.error(e instanceof AtsFileError ? e.message : atsErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    // Same client id on a retry after a network error (so the server never sends twice), but only while the email is unchanged.
    const sig = JSON.stringify([subject.trim(), body, sel, reply && latest ? latest.id : null]);
    if (attemptSig.current !== null && attemptSig.current !== sig) idRef.current = crypto.randomUUID();
    attemptSig.current = sig;
    try {
      const r = await sendCandidateEmail({
        id: idRef.current,
        candidateId: candidate.id,
        applicationId: appId,
        subject: subject.trim(),
        body,
        purpose: tplMeta.purpose,
        templateCode: tplMeta.code,
        replyToId: reply && latest ? latest.id : null,
        fileIds: sel,
      });
      if (r.status === "failed") {
        // Stored as Failed with Retry in the thread; this draft is done.
        toast.error(mailErrorMessage(r.error));
        idRef.current = crypto.randomUUID();
        attemptSig.current = null;
        onClose();
      } else {
        toast.success("Email sent");
        idRef.current = crypto.randomUUID();
        attemptSig.current = null;
        clearDraft(candidate.id);
        const until = followUpAt(fuChoice);
        if (until) {
          try { await setConversation(candidate.id, "follow_up", until); qc.invalidateQueries({ queryKey: convKeys.all }); }
          catch (e) { toast.error(`Email sent · follow-up not set: ${atsErrorMessage(e)}`); }
        }
        setSubject(""); setBody(""); setSel([]); setTplMeta({ code: null, purpose: "general" });
        onClose();
      }
    } catch (e) {
      // Keep the draft and the id: pressing Send again reuses it.
      toast.error(e instanceof MailError ? mailErrorMessage(e.code, e.field) : mailErrorMessage(null));
    } finally {
      setSending(false);
      onDone();
    }
  };

  return (
    <div className="space-y-2" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); send(); } }}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">To</span>
        <span className="min-w-0 flex-1 truncate text-foreground">{candidate.email}</span>
        <Select value="" onValueChange={pickTemplate}>
          <SelectTrigger className="h-8 w-[200px] text-foreground"><SelectValue placeholder="Use a template…" /></SelectTrigger>
          <SelectContent>{(templates.data ?? []).filter((t) => !usesInterviewFields(t)).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Input placeholder="Subject" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} className="text-foreground" aria-label="Subject" />
      <SubjectSentAs subject={subject} />
      {latest && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={reply} onCheckedChange={(v) => setReply(!!v)} /> Reply in this thread
        </label>
      )}
      <Textarea ref={bodyRef} rows={8} maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} className="resize-none text-foreground" aria-label="Message" />
      <p className="text-xs text-muted-foreground">Your HR signature is added automatically.</p>
      {hasPlaceholders && <p className="text-xs text-destructive">Replace the {"{{placeholders}}"} first</p>}
      {selFiles.length > 0 && (
        <div className="flex flex-wrap gap-1">{selFiles.map((f) => <Badge key={f.id} variant="secondary" className="font-normal">{f.file_name} · {fmtBytes(f.size_bytes)}</Badge>)}</div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Popover>
          <PopoverTrigger asChild><Button size="sm" variant="ghost" className="gap-1.5"><Paperclip className="h-4 w-4" /> Attach files{sel.length ? ` (${sel.length})` : ""}</Button></PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-2">
            <p className="text-xs text-muted-foreground">Up to 5 files, 15 MB in total · {fmtBytes(total)} selected</p>
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {files.map((f) => (
                <li key={f.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={sel.includes(f.id)} disabled={!sel.includes(f.id) && sel.length >= 5} onCheckedChange={(v) => toggleFile(f.id, !!v)} />
                    <span className="min-w-0 flex-1 truncate text-foreground">{f.file_name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{fileKindLabel(f.kind)} · {fmtBytes(f.size_bytes)}</span>
                  </label>
                </li>
              ))}
              {!files.length && <li className="text-sm text-muted-foreground">No files yet.</li>}
            </ul>
            {total > 15 * 1024 * 1024 && <p className="text-xs text-destructive">Attachments are too large. Keep them under 15 MB in total.</p>}
            <input ref={fileInput} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
            <Button size="sm" variant="outline" className="w-full gap-1.5" disabled={uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload a file
            </Button>
          </PopoverContent>
        </Popover>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" disabled={sending} onClick={onClose}>Cancel</Button>
          <Button size="sm" className="gap-1.5" disabled={!canSend} onClick={send} title="Ctrl/⌘ + Enter">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
          </Button>
        </div>
      </div>
      <AlertDialog open={!!pendingTpl} onOpenChange={(o) => !o && setPendingTpl(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Replace what you've written?</AlertDialogTitle>
            <AlertDialogDescription>The subject and message will be replaced with the template.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep mine</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const id = pendingTpl!; setPendingTpl(null); applyTemplate(id); }}>Replace</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
