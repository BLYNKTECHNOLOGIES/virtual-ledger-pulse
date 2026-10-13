import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Keyboard, MoreVertical } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Mail, Phone, MessageCircle, Pencil, ChevronDown, Pause, Play, XCircle, LogOut, RotateCcw, Star, Trash2, Upload,
  Activity, ArrowRight, CheckCircle2, Hourglass, StickyNote, ArrowRightLeft, FileText, UserPlus, Eye, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFileDropzone } from "@/hooks/useFileDropzone";
import { atsKeys, useAtsReasons, useAtsStages, useIsHrAdmin } from "@/lib/ats/api";
import { atsErrorMessage } from "@/lib/ats/errors";
import { fmtDate, fmtDateTime, fmtRelative } from "@/lib/ats/format";
import {
  ATS_BUCKET, ATS_FILE_KINDS, AtsFileError, fileKindLabel, fmtBytes, uploadAtsFile, type AtsFileKind,
} from "@/lib/ats/files";
import {
  candKeys, useAppRatings, useCandidate, useCandidateApps, useCandidateEvents, useCandidateFiles,
  useCandidateNotes, useMyUserId, type AtsAppRow, type AtsFile,
} from "@/lib/ats/candidates";
import { QueryError, RowsSkeleton, SectionCard } from "./AtsBits";
import { CandidateAvatar, StageChip, StageRail, stageDotClass } from "./AtsUi";
import { Skeleton } from "@/components/ui/skeleton";
import { useAtsSettings } from "@/lib/ats/api";
import { AppStatusBadge, Stars, fmtMonthly, fmtYears } from "./CandidateBits";
import { ResumeViewer, pickDefaultFile } from "./ResumeViewer";
import { EditProfileSheet } from "./EditProfileSheet";
import { ChangeJobDialog } from "./ChangeJobDialog";
import { MessagesPanel } from "./MessagesPanel";
import { PLACEHOLDER_RE, mailErrorMessage, renderTemplate, sendCandidateEmail, useEmailTemplates, useMailStatus, useMailThread } from "@/lib/ats/mail";
import { Checkbox } from "@/components/ui/checkbox";
import { useSearchParams } from "react-router-dom";
import { Send, MailX, AlertTriangle, CalendarPlus, CalendarClock, CalendarX, CalendarCheck, UserX, Reply, ClipboardCheck } from "lucide-react";
import { InterviewsCard } from "./InterviewsCard";
import { ImportDetailsCard } from "./ImportDetailsCard";

interface Props {
  candidateId: string;
  appId?: string | null;
  onAppChange?: (appId: string) => void;
  /** Called after a successful decision action (stage/status). */
  onActionDone?: () => void;
  className?: string;
}

const EVENT_ICON: Record<string, typeof Activity> = {
  candidate_created: UserPlus, application_created: UserPlus, stage_changed: ArrowRightLeft, status_changed: RotateCcw,
  note_added: StickyNote, note_updated: StickyNote, note_deleted: StickyNote, rating_added: Star, rating_updated: Star,
  rating_deleted: Star, file_uploaded: FileText, file_deleted: FileText, file_added: FileText, file_removed: FileText, reviewed: Eye, hired: CheckCircle2,
  email_sent: Send, email_received: Mail, email_failed: AlertTriangle, email_bounced: MailX,
  interview_scheduled: CalendarPlus, interview_rescheduled: CalendarClock, interview_cancelled: CalendarX,
  interview_completed: CalendarCheck, interview_no_show: UserX, interview_reopened: RotateCcw,
  interview_response: Reply, interview_feedback: ClipboardCheck,
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children || "—"}</dd>
    </div>
  );
}
/** Links typed without a scheme open as https://. */
const withScheme = (u: string) => (/^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`);
/** Activity summaries: show file kinds in words. */
const readableSummary = (t: string | null | undefined) =>
  String(t ?? "").replace(/\bcover_letter\b/g, "cover letter").replace(/\bid_proof\b/g, "ID proof");

type LoadState = "loading" | "ok" | "error";
function LoadFallback({ state, onRetry }: { state: LoadState; onRetry: () => void }) {
  if (state === "loading") return <Skeleton className="inline-block h-4 w-32 align-middle" />;
  return <span className="text-xs text-muted-foreground">Couldn't load this. <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onRetry}>Try again</Button></span>;
}

function ReferredBy({ employeeId }: { employeeId: string }) {
  const [name, setName] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState("loading");
    supabase.from("hr_employees").select("first_name,last_name").eq("id", employeeId).maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { setState("error"); return; }
        if (data) setName([data.first_name, data.last_name].filter(Boolean).join(" ") || null);
        setState("ok");
      }, () => alive && setState("error"));
    return () => { alive = false; };
  }, [employeeId, tick]);
  return <Fact label="Referred by">{state === "ok" ? name : <LoadFallback state={state} onRetry={() => setTick((n) => n + 1)} />}</Fact>;
}

const Chips = ({ items }: { items?: string[] | null }) =>
  items?.length ? <div className="flex flex-wrap gap-1">{items.map((s) => <Badge key={s} variant="secondary" className="font-normal">{s}</Badge>)}</div> : <>—</>;

export function CandidateReviewPanel({ candidateId, appId, onAppChange, onActionDone, className }: Props) {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const cand = useCandidate(candidateId);
  const apps = useCandidateApps(candidateId);
  const files = useCandidateFiles(candidateId);
  const stages = useAtsStages();
  const reasons = useAtsReasons();
  const me = useMyUserId();
  const isAdmin = useIsHrAdmin().data === true;
  const atsSettings = useAtsSettings();
  const [hireDlg, setHireDlg] = useState<null | { id: string; name: string; note?: string }>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [selFile, setSelFile] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusDlg, setStatusDlg] = useState<null | "rejected" | "withdrawn">(null);
  const [stageDlg, setStageDlg] = useState<null | { id: string; name: string }>(null);
  const [changeJob, setChangeJob] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const shortcutRef = useRef<{ a?: () => void; h?: () => void; r?: () => void; i?: () => void }>({});
  const [sp, setSp] = useSearchParams();
  const [paneTab, setPaneTabState] = useState<string>(sp.get("tab") === "messages" ? "messages" : "resume");
  const setPaneTab = (v: string) => {
    setPaneTabState(v);
    const next = new URLSearchParams(sp);
    if (v === "messages") next.set("tab", "messages"); else next.delete("tab");
    setSp(next, { replace: true });
  };
  const [composeSignal, setComposeSignal] = useState(0);
  const [ivSignal, setIvSignal] = useState(0);
  const mailStatus = useMailStatus();
  const mailOn = !!mailStatus.data?.enabled;
  const mailThread = useMailThread(candidateId);
  const unreadCount = (mailThread.data ?? []).filter((m) => m.direction === "inbound" && !m.read_at).length;
  const openFileInResume = (id: string) => { setSelFile(id); setPaneTab("resume"); };

  const app: AtsAppRow | undefined = useMemo(() => {
    const list = apps.data ?? [];
    return list.find((a) => a.application_id === appId) ?? list[0];
  }, [apps.data, appId]);

  // Default file: primary resume → newest resume.
  useEffect(() => {
    if (!files.data) return;
    setSelFile((cur) => (cur && files.data.some((f) => f.id === cur) ? cur : pickDefaultFile(files.data)?.id ?? null));
  }, [files.data]);
  useEffect(() => setSelFile(null), [candidateId]);

  // D5 – mark reviewed once, silently.
  const reviewedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const id = app?.application_id;
    if (!id || app.status !== "active" || app.reviewed_at || reviewedRef.current.has(id)) return;
    reviewedRef.current.add(id);
    supabase.rpc("ats_mark_reviewed", { p_application_id: id }).then(({ error }) => {
      if (error) { reviewedRef.current.delete(id); return; }
      qc.invalidateQueries({ queryKey: candKeys.all });
      qc.invalidateQueries({ queryKey: atsKeys.overview });
      qc.invalidateQueries({ queryKey: atsKeys.jobSummary });
    });
  }, [app?.application_id, app?.status, app?.reviewed_at, qc]);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: candKeys.all });
    qc.invalidateQueries({ queryKey: atsKeys.overview });
    qc.invalidateQueries({ queryKey: atsKeys.jobSummary });
  };

  const run = async (fn: () => PromiseLike<{ error: any }>, success: string, after?: () => void, action?: { label: string; onClick: () => void }, noAdvance = false) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) throw error;
      if (action) toast.success(success, { action });
      else toast.success(success);
      after?.();
      refreshAll();
      if (!noAdvance) onActionDone?.();
    } catch (e) {
      toast.error(atsErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // E. keyboard shortcuts (ignored while typing or when a dialog/menu is open)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,select,[contenteditable=true],[role=dialog],[role=alertdialog],[role=menu],[role=listbox]")) return;
      if (document.querySelector("[role=dialog],[role=alertdialog]")) return;
      const k = e.key.toLowerCase();
      if (e.key === "?") { e.preventDefault(); setKeysOpen(true); return; }
      if (k === "n") { e.preventDefault(); noteRef.current?.focus(); return; }
      const fn = k === "a" ? shortcutRef.current.a : k === "h" ? shortcutRef.current.h : k === "r" ? shortcutRef.current.r : k === "i" ? shortcutRef.current.i : undefined;
      if (fn) { e.preventDefault(); fn(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (cand.isLoading || apps.isLoading) return <div className={cn("p-4", className)}><RowsSkeleton rows={8} /></div>;
  if (cand.isError) return <div className={cn("p-4", className)}><QueryError error={cand.error} onRetry={() => cand.refetch()} /></div>;
  if (!cand.data) return <EmptyState icon={UserPlus} title="This record no longer exists." className={className} />;

  const c = cand.data;
  const activeStages = (stages.data ?? []).filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order);
  const curIdx = activeStages.findIndex((s) => s.id === app?.stage_id);
  const next = curIdx >= 0 ? activeStages[curIdx + 1] : undefined;
  const closed = app?.status === "rejected" || app?.status === "withdrawn";
  const hired = app?.status === "hired";
  const stageLocked = closed || hired || busy || !app;
  const appIdle = app?.status === "active" && (app.days_in_stage ?? 0) >= (atsSettings.data?.idle_alert_days ?? 7);
  const waPhone = c.phone_norm && /^\d{10}$/.test(c.phone_norm) ? c.phone_norm : null;

  const isHiredStage = (id: string) => { const s = activeStages.find((x) => x.id === id); return !!s && (s.kind === "hired" || s.code === "hired"); };
  const moveTo = (stageId: string, name: string, note?: string) => {
    const toInterview = activeStages.find((s) => s.id === stageId)?.kind === "interview";
    // E3: after a move into an Interview stage, stay on this candidate so the toast's "Schedule interview" works.
    return run(() => supabase.rpc("ats_move_stage", { p_application_id: app!.application_id!, p_stage_id: stageId, p_note: note || null }), `Moved to ${name}`,
      undefined, toInterview ? { label: "Schedule interview", onClick: () => setIvSignal((n) => n + 1) } : undefined, toInterview);
  };
  /** E1: every move into Hired is confirmed first. */
  const requestMove = (stageId: string, name: string, note?: string) => {
    if (isHiredStage(stageId)) setHireDlg({ id: stageId, name, note });
    else moveTo(stageId, name, note);
  };
  const hiredIdx = activeStages.findIndex((s) => s.kind === "hired" || s.code === "hired");
  const undoTarget = activeStages.find((s) => s.kind === "offer") ?? (hiredIdx > 0 ? activeStages[hiredIdx - 1] : undefined);
  const undoHire = () => {
    if (!undoTarget || !app) return;
    run(() => supabase.rpc("ats_move_stage", { p_application_id: app.application_id!, p_stage_id: undoTarget.id, p_note: null }), "Hire undone", undefined, undefined, true);
  };
  const setStatus = (status: string, msg: string, reasonId?: string, note?: string, after?: () => void) =>
    run(() => supabase.rpc("ats_set_status", { p_application_id: app!.application_id!, p_status: status, p_reason_id: reasonId ?? null, p_note: note || null }), msg, after);

  const rejectWithEmail = async (rid: string, note: string, draft: RejectEmailDraft) => {
    if (busy || !app) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("ats_set_status", { p_application_id: app.application_id!, p_status: "rejected", p_reason_id: rid, p_note: note || null });
      if (error) { toast.error(atsErrorMessage(error)); return; }
      setStatusDlg(null);
      const latest = (mailThread.data ?? [])[(mailThread.data ?? []).length - 1];
      try {
        const r = await sendCandidateEmail({
          id: crypto.randomUUID(), candidateId, applicationId: app.application_id ?? null, subject: draft.subject, body: draft.body,
          purpose: "rejection", templateCode: draft.templateCode, replyToId: latest?.id ?? null, fileIds: [],
        });
        if (r.status === "failed") toast.warning(`Application rejected · email not sent: ${mailErrorMessage(r.error)}`);
        else toast.success("Application rejected · email sent");
      } catch (e: any) {
        toast.warning(`Application rejected · email not sent: ${mailErrorMessage(e?.code, e?.field)}`);
      }
      refreshAll();
      qc.invalidateQueries({ queryKey: ["ats", "mail"] });
      onActionDone?.();
    } finally {
      setBusy(false);
    }
  };

  shortcutRef.current = {
    a: next && !stageLocked ? () => requestMove(next.id, next.name) : undefined,
    h: app && !closed && !hired && !busy ? () => (app.status === "on_hold" ? setStatus("active", "Application resumed") : setStatus("on_hold", "Put on hold")) : undefined,
    r: app && !closed && !hired && !busy ? () => setStatusDlg("rejected") : undefined,
    i: app && (app.status === "active" || app.status === "on_hold") && !busy ? () => setIvSignal((n) => n + 1) : undefined,
  };

  const loc = [c.city, c.state].filter(Boolean).join(", ");
  const keyFacts: [string, string][] = [
    ["Experience", c.total_experience_years != null ? fmtYears(c.total_experience_years) : "—"],
    ["Current CTC", fmtMonthly(c.current_ctc_monthly)],
    ["Expected CTC", fmtMonthly(c.expected_ctc_monthly)],
    ["Notice period", c.notice_period_days != null ? `${c.notice_period_days} days` : "—"],
    ["Location", loc || "—"],
  ];
  const appDot = (a: AtsAppRow) => a.status === "hired" ? "bg-success" : a.status === "rejected" || a.status === "withdrawn" ? "bg-muted-foreground/60" : stageDotClass(a.stage_kind);
  const header = (
    <div className="space-y-3 border-b border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <CandidateAvatar full_name={c.full_name ?? ""} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h2 className="break-words font-display text-xl font-semibold leading-7 text-foreground">{c.full_name}</h2>
              <span className="t-mono text-xs text-muted-foreground">{c.ref_no}</span>
            </div>
            {app && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground">
                <span className="min-w-0 truncate">{app.job_title ?? "General application"}</span>
                {app.status !== "hired" && <StageChip name={app.stage_name} kind={app.stage_kind} />}
                {app.status !== "active" && <AppStatusBadge status={app.status} />}
                <span className="text-xs text-muted-foreground">Applied {fmtDate(app.applied_at)}{app.source_name ? ` via ${app.source_name}` : ""}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {mailOn
            ? <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => { setPaneTab("messages"); setComposeSignal((n) => n + 1); }}><Mail className="h-3.5 w-3.5" /> Email</Button>
            : c.email && <Button asChild size="sm" variant="outline" className="h-8 gap-1"><a href={`mailto:${c.email}`}><Mail className="h-3.5 w-3.5" /> Email</a></Button>}
          {c.phone && <Button asChild size="sm" variant="outline" className="h-8 gap-1"><a href={`tel:${c.phone}`}><Phone className="h-3.5 w-3.5" /> Call</a></Button>}
          {waPhone && <Button asChild size="sm" variant="outline" className="h-8 gap-1"><a href={`https://wa.me/91${waPhone}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a></Button>}
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setEditOpen(true)}><Pencil className="h-3.5 w-3.5" /> Edit profile</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="icon" variant="outline" className="h-8 w-8" aria-label="More actions"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setKeysOpen(true)}><Keyboard className="mr-2 h-4 w-4" /> Keyboard shortcuts (?)</DropdownMenuItem>
              {isAdmin && <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDelOpen(true)}><Trash2 className="mr-2 h-4 w-4" /> Delete candidate…</DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-border pt-3 sm:grid-cols-5">
        {keyFacts.map(([l, v]) => (
          <div key={l} className="min-w-0">
            <dt className="text-[11px] text-muted-foreground">{l}</dt>
            <dd className="truncate text-sm font-medium tabular-nums text-foreground" title={v}>{v}</dd>
          </div>
        ))}
      </dl>
      {(apps.data?.length ?? 0) > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {apps.data!.map((a) => (
            <button key={a.application_id} type="button" onClick={() => onAppChange?.(a.application_id!)}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                a.application_id === app?.application_id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
              <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", appDot(a))} />
              {a.job_title ?? "General"} · {a.status === "active" || a.status === "on_hold" ? a.stage_name : a.status === "hired" ? "Hired" : a.status === "rejected" ? "Rejected" : "Withdrawn"}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const decision = app ? (
    <SectionCard title={<span className="flex items-center gap-2">Decision <AppStatusBadge status={app.status} /></span>}>
      <div className="mb-3">
        <StageRail size="lg" stages={activeStages} currentId={app.stage_id} status={app.status} />
        {!closed && !hired && (
          <p className={cn("mt-2 flex items-center gap-1 text-xs", appIdle ? "font-medium text-foreground" : "text-muted-foreground")}>
            {appIdle && <Hourglass className="h-3.5 w-3.5 text-warning" aria-hidden />}
            In this stage for {app.days_in_stage ?? 0} day{(app.days_in_stage ?? 0) === 1 ? "" : "s"}
          </p>
        )}
      </div>
      {closed && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <span className="text-foreground">
            {app.status === "rejected" ? "Rejected" : "Withdrawn"}
            {app.reject_reason_label && <> · {app.reject_reason_label}</>}
            <StatusBy appId={app.application_id!} /> on {fmtDate(app.status_changed_at)}
            {app.status_note && <span className="block text-xs text-muted-foreground">{app.status_note}</span>}
          </span>
          <Button size="sm" variant="outline" disabled={busy} className="gap-1.5" onClick={() => setStatus("active", "Application reopened")}><RotateCcw className="h-4 w-4" /> Reopen</Button>
        </div>
      )}
      {hired && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-success/10 p-3 text-sm text-foreground">
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> Hired on {fmtDate(app.hired_at)}</span>
          {undoTarget && <Button size="sm" variant="outline" disabled={busy} className="gap-1.5" onClick={() => setUndoOpen(true)}><RotateCcw className="h-4 w-4" /> Undo hire</Button>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {next && (
          <Button size="sm" disabled={stageLocked} className="gap-1.5" title="Shortcut: A" onClick={() => requestMove(next.id, next.name)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {activeStages[curIdx]?.code === "new" ? `Shortlist → ${next.name}` : `Move to ${next.name}`}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={stageLocked} className="gap-1">Stage <ChevronDown className="h-3.5 w-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {activeStages.filter((s) => s.id !== app.stage_id).map((s) => (
              <DropdownMenuItem key={s.id} onSelect={() => setStageDlg({ id: s.id, name: s.name })}>{s.name}</DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setChangeJob(true)}>Change job…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {!closed && !hired && (app.status === "on_hold" ? (
          <Button size="sm" variant="outline" disabled={busy} className="gap-1.5" title="Shortcut: H" onClick={() => setStatus("active", "Application resumed")}><Play className="h-4 w-4" /> Resume</Button>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} className="gap-1.5" title="Shortcut: H" onClick={() => setStatus("on_hold", "Put on hold")}><Pause className="h-4 w-4" /> Hold</Button>
        ))}
        {!closed && !hired && <>
          <Button size="sm" variant="outline" disabled={busy} className="gap-1.5 text-destructive hover:text-destructive" title="Shortcut: R" onClick={() => setStatusDlg("rejected")}><XCircle className="h-4 w-4" /> Reject</Button>
          <Button size="sm" variant="ghost" disabled={busy} className="gap-1.5" onClick={() => setStatusDlg("withdrawn")}><LogOut className="h-4 w-4" /> Mark withdrawn</Button>
        </>}
      </div>
    </SectionCard>
  ) : (
    <SectionCard title="Decision"><p className="text-sm text-muted-foreground">No application for this candidate.</p></SectionCard>
  );

  const facts = (
    <SectionCard title="Profile">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Fact label="Applied">{app ? `${fmtDate(app.applied_at)} · ${app.source_name ?? "—"}${app.source_detail ? ` (${app.source_detail})` : ""}` : null}</Fact>
        {app && app.position_text && (!app.job_id || (app.job_title ?? "").trim().toLowerCase() !== app.position_text.trim().toLowerCase()) && (
          <div className="sm:col-span-2"><Fact label="Applied for (as typed)">{app.position_text}</Fact></div>
        )}
        <Fact label="Experience">{c.total_experience_years != null ? fmtYears(c.total_experience_years) : null}</Fact>
        <Fact label="Current role">{[c.current_title, c.current_company].filter(Boolean).join(" at ")}</Fact>
        <Fact label="Current CTC">{c.current_ctc_monthly != null ? fmtMonthly(c.current_ctc_monthly) : null}</Fact>
        <Fact label="Expected CTC">{[c.expected_ctc_monthly != null ? fmtMonthly(c.expected_ctc_monthly) : null, c.ctc_note || null].filter(Boolean).join(" · ") || null}</Fact>
        <Fact label="Notice period">{c.notice_period_days != null ? `${c.notice_period_days} days` : null}</Fact>
        <Fact label="Location">{[c.city, c.state].filter(Boolean).join(", ")}</Fact>
        <Fact label="Alternate phone">{c.alt_phone}</Fact>
        <Fact label="Shift preference"><Chips items={c.shift_preferences} /></Fact>
        <Fact label="Languages"><Chips items={c.languages} /></Fact>
        <div className="sm:col-span-2"><Fact label="Skills"><Chips items={c.skills} /></Fact></div>
        <div className="sm:col-span-2"><Fact label="Education">{c.education}</Fact></div>
        <Fact label="LinkedIn">{c.linkedin_url ? <a href={withScheme(c.linkedin_url)} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">Open profile</a> : null}</Fact>
        <Fact label="Portfolio">{c.portfolio_url ? <a href={withScheme(c.portfolio_url)} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">Open link</a> : null}</Fact>
        {c.referred_by_employee_id && <ReferredBy employeeId={c.referred_by_employee_id} />}
        <Fact label="Keep for future openings">{c.keep_for_future ? "Yes" : "No"}</Fact>
        {c.tags?.length ? <Fact label="Tags"><Chips items={c.tags} /></Fact> : null}
        {c.summary && <div className="sm:col-span-2"><Fact label="Summary"><span className="whitespace-pre-wrap">{c.summary}</span></Fact></div>}
      </dl>
    </SectionCard>
  );

  const viewer = files.isError ? <div className="p-4"><QueryError error={files.error} onRetry={() => files.refetch()} /></div> :
    files.isLoading ? <div className="p-4"><RowsSkeleton rows={6} /></div> :
    <ResumeViewer files={files.data ?? []} selectedId={selFile} onSelect={setSelFile} onUpload={() => setUploadOpen(true)} className="h-full" />;

  const sidePanels = (
    <>
      {decision}
      {app && <InterviewsCard app={app} candidate={c} openSignal={ivSignal} />}
      {facts}
      {app?.applied_via === "careers_form" && <FormAnswers appId={app.application_id!} />}
      {app?.applied_via === "import" && <ImportDetailsCard appId={app.application_id!} />}
      {app && <RatingsCard appId={app.application_id!} me={me.data ?? null} />}
      <NotesCard ref={noteRef} candidateId={candidateId} appId={app?.application_id ?? null} me={me.data ?? null} isAdmin={isAdmin} />
      <FilesCard files={files.data ?? []} onUpload={() => setUploadOpen(true)} candidateId={candidateId} />
    </>
  );

  const msgBadge = unreadCount > 0 ? <Badge className="ml-1.5 h-5 min-w-5 justify-center px-1.5 text-[10px]">{unreadCount}</Badge> : null;
  const messages = (
    <MessagesPanel candidate={c} appId={app?.application_id ?? null} files={files.data ?? []} visible={paneTab === "messages"}
      composeSignal={composeSignal} onOpenFile={openFileInResume} onEditProfile={() => setEditOpen(true)} />
  );

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {header}
      {isMobile ? (
        <Tabs value={paneTab} onValueChange={setPaneTab} className="p-3">
          <TabsList className="w-full">
            <TabsTrigger value="resume" className="flex-1">Resume</TabsTrigger>
            <TabsTrigger value="profile" className="flex-1">Profile</TabsTrigger>
            <TabsTrigger value="messages" className="flex-1">Messages{msgBadge}</TabsTrigger>
            <TabsTrigger value="activity" className="flex-1">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="resume"><div className="h-[70vh] overflow-hidden rounded-lg border border-border">{viewer}</div></TabsContent>
          <TabsContent value="profile" className="space-y-3">{sidePanels}</TabsContent>
          <TabsContent value="messages"><div className="h-[70vh] overflow-hidden rounded-lg border border-border">{messages}</div></TabsContent>
          <TabsContent value="activity"><ActivityCard candidateId={candidateId} /></TabsContent>
        </Tabs>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[58fr_42fr]">
          <div className="flex min-h-0 flex-col overflow-hidden border-r border-border">
            <div className="flex shrink-0 gap-1 border-b border-border px-2 py-1.5" role="tablist" aria-label="Left pane">
              {(["resume", "messages"] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={paneTab === t} onClick={() => setPaneTab(t)}
                  className={cn("inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    paneTab === t ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {t === "resume" ? "Resume" : <>Messages{msgBadge}</>}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{paneTab === "messages" ? messages : viewer}</div>
          </div>
          <div className="min-h-0 space-y-3 overflow-y-auto p-3">
            {sidePanels}
            <ActivityCard candidateId={candidateId} />
          </div>
        </div>
      )}

      <ReasonDialog kind={statusDlg} reasons={(reasons.data ?? []).filter((r) => r.is_active && r.applies_to === statusDlg)} busy={busy}
        onClose={() => setStatusDlg(null)}
        noEmailAddress={mailOn && !c.email}
        email={c.email ? { on: mailOn, defaultTicked: !!mailStatus.data?.reject_default, firstName: (c.full_name ?? "").trim().split(/\s+/)[0] || "the candidate", candidateId, appId: app?.application_id ?? null } : null}
        onSubmit={(rid, note, draft) => draft ? rejectWithEmail(rid, note, draft)
          : setStatus(statusDlg!, statusDlg === "rejected" ? "Application rejected" : "Marked as withdrawn", rid, note, () => setStatusDlg(null))} />
      <StageNoteDialog stage={stageDlg} busy={busy} onClose={() => setStageDlg(null)}
        onSubmit={(note) => { const s = stageDlg!; setStageDlg(null); requestMove(s.id, s.name, note); }} />
      <AlertDialog open={!!hireDlg} onOpenChange={(o) => !o && setHireDlg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {c.full_name} as hired?</AlertDialogTitle>
            <AlertDialogDescription>The application moves to {hireDlg?.name} and is marked hired.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const h = hireDlg!; setHireDlg(null); moveTo(h.id, h.name, h.note); }}>Mark as hired</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={undoOpen} onOpenChange={setUndoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo the hire?</AlertDialogTitle>
            <AlertDialogDescription>{c.full_name} goes back to the {undoTarget?.name} stage and is no longer counted as hired.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setUndoOpen(false); undoHire(); }}>Undo hire</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} candidateId={candidateId} appId={app?.application_id ?? null}
        onDone={(f) => { setSelFile(f.kind === "resume" || !selFile ? f.id : selFile); }} />
      <DeleteCandidateDialog open={delOpen} onOpenChange={setDelOpen} candidateId={candidateId} name={c.full_name} refNo={c.ref_no}
        onDeleted={() => { qc.invalidateQueries({ queryKey: candKeys.all }); qc.invalidateQueries({ queryKey: atsKeys.overview }); qc.invalidateQueries({ queryKey: atsKeys.jobSummary }); navigate("/hrms/ats/candidates"); }} />
      <ShortcutsDialog open={keysOpen} onOpenChange={setKeysOpen} />
      {app && <ChangeJobDialog open={changeJob} onOpenChange={setChangeJob} app={app} />}
      <EditProfileSheet open={editOpen} onOpenChange={setEditOpen} candidate={c} />
    </div>
  );
}

function FormAnswers({ appId }: { appId: string }) {
  const [a, setA] = useState<Record<string, any> | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState("loading");
    supabase.from("ats_applications").select("answers").eq("id", appId).maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { setState("error"); return; }
        setA((data?.answers as Record<string, any>) ?? {}); setState("ok");
      }, () => alive && setState("error"));
    return () => { alive = false; };
  }, [appId, tick]);
  if (state !== "ok") return <SectionCard title="From the application form"><LoadFallback state={state} onRetry={() => setTick((n) => n + 1)} /></SectionCard>;
  const rows: [string, string][] = [
    ["Experience", "experience_text"], ["Expected CTC per year", "expected_ctc_text"],
    ["Notice period", "notice_period_text"], ["Skills", "skills_text"],
  ];
  const shown = a ? rows.filter(([, k]) => a[k]) : [];
  if (!shown.length) return null;
  return (
    <SectionCard title="From the application form">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shown.map(([label, k]) => <Fact key={k} label={label}><span className="whitespace-pre-wrap">{String(a![k])}</span></Fact>)}
      </dl>
    </SectionCard>
  );
}

function StatusBy({ appId }: { appId: string }) {
  const [name, setName] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState("loading");
    supabase.from("ats_applications").select("status_changed_by_name").eq("id", appId).maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { setState("error"); return; }
        setName(data?.status_changed_by_name ?? null); setState("ok");
      }, () => alive && setState("error"));
    return () => { alive = false; };
  }, [appId, tick]);
  if (state !== "ok") return <> · <LoadFallback state={state} onRetry={() => setTick((n) => n + 1)} /></>;
  return name ? <> · by {name}</> : null;
}

export interface RejectEmailDraft { subject: string; body: string; templateCode: string | null }

function ReasonDialog({ kind, reasons, busy, onClose, onSubmit, email, noEmailAddress }: {
  noEmailAddress?: boolean;
  kind: null | "rejected" | "withdrawn"; reasons: { id: string; label: string }[]; busy: boolean;
  onClose: () => void; onSubmit: (reasonId: string, note: string, email: RejectEmailDraft | null) => void;
  email?: { on: boolean; defaultTicked: boolean; firstName: string; candidateId: string; appId: string | null } | null;
}) {
  const [rid, setRid] = useState("");
  const [note, setNote] = useState("");
  const showEmail = kind === "rejected" && !!email?.on;
  const templates = useEmailTemplates();
  const rejTpls = (templates.data ?? []).filter((t) => t.purpose === "rejection");
  const [tick, setTick] = useState(false);
  const [tplId, setTplId] = useState("");
  const [tplCode, setTplCode] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  useEffect(() => { if (kind) { setRid(""); setNote(""); setTick(!!email?.defaultTicked); setTplId(""); setSubject(""); setBody(""); } }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!showEmail || tplId || !rejTpls.length) return;
    setTplId((rejTpls.find((t) => t.code === "rejection") ?? rejTpls[0]).id);
  }, [showEmail, tplId, rejTpls.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!showEmail || !tplId || !email) return;
    let alive = true;
    renderTemplate(tplId, email.appId, email.candidateId)
      .then((r) => { if (alive) { setSubject(r.subject); setBody(r.body); setTplCode(r.template_code); } })
      .catch((e) => toast.error(atsErrorMessage(e)));
    return () => { alive = false; };
  }, [showEmail, tplId, email?.appId, email?.candidateId]); // eslint-disable-line react-hooks/exhaustive-deps
  const sending = showEmail && tick;
  const placeholders = sending && PLACEHOLDER_RE.test(`${subject}\n${body}`);
  const emailOk = !sending || (!!subject.trim() && !!body.trim() && !placeholders);
  const submit = () => { if (rid && !busy && emailOk) onSubmit(rid, note.trim(), sending ? { subject: subject.trim(), body, templateCode: tplCode } : null); };
  return (
    <ResponsiveDialog open={!!kind} onOpenChange={(o) => !o && onClose()}
      title={kind === "rejected" ? "Reject application" : "Mark as withdrawn"}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="ats-reason-form" disabled={!rid || busy || !emailOk} variant={kind === "rejected" ? "destructive" : "default"}>
          {kind === "rejected" ? "Reject" : "Mark withdrawn"}
        </Button>
      </>}>
      <form id="ats-reason-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}
        onKeyDown={(e) => { const t = e.target as HTMLElement; if (e.key === "Enter" && !e.shiftKey && t.tagName !== "BUTTON" && t.id !== "ats-rej-body") { e.preventDefault(); submit(); } }}>
        <div className="space-y-1.5">
          <Label>Reason</Label>
          <Select value={rid} onValueChange={setRid}>
            <SelectTrigger className="text-foreground"><SelectValue placeholder="Choose a reason" /></SelectTrigger>
            <SelectContent>{reasons.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ats-reason-note">Note (optional)</Label>
          <Textarea id="ats-reason-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="text-foreground" />
        </div>
        {kind === "rejected" && noEmailAddress && <p className="text-xs text-muted-foreground">No email address, so no email will be sent.</p>}
        {showEmail && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox checked={tick} onCheckedChange={(v) => setTick(!!v)} /> Email {email!.firstName} about this decision
            </label>
            {tick && <>
              <Select value={tplId} onValueChange={setTplId}>
                <SelectTrigger className="text-foreground"><SelectValue placeholder="Choose a template" /></SelectTrigger>
                <SelectContent>{rejTpls.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input aria-label="Subject" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} className="text-foreground" />
              <Textarea id="ats-rej-body" aria-label="Message" rows={8} maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} className="text-foreground" />
              <p className="text-xs text-muted-foreground">Your HR signature is added automatically.</p>
              {placeholders && <p className="text-xs text-destructive">Replace the {"{{placeholders}}"} first</p>}
            </>}
          </div>
        )}
      </form>
    </ResponsiveDialog>
  );
}

function StageNoteDialog({ stage, busy, onClose, onSubmit }: { stage: null | { id: string; name: string }; busy: boolean; onClose: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState("");
  useEffect(() => { if (stage) setNote(""); }, [stage]);
  return (
    <ResponsiveDialog open={!!stage} onOpenChange={(o) => !o && onClose()} title={`Move to ${stage?.name ?? ""}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="ats-stage-form" disabled={busy}>Move</Button></>}>
      <form id="ats-stage-form" onSubmit={(e) => { e.preventDefault(); onSubmit(note.trim()); }} className="space-y-1.5">
        <Label htmlFor="ats-stage-note">Note (optional)</Label>
        <Textarea id="ats-stage-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="text-foreground"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(note.trim()); } }} />
      </form>
    </ResponsiveDialog>
  );
}

function RatingsCard({ appId, me }: { appId: string; me: string | null }) {
  const qc = useQueryClient();
  const ratings = useAppRatings(appId);
  const mine = ratings.data?.find((r) => r.rater_user_id === me);
  const others = (ratings.data ?? []).filter((r) => r.rater_user_id !== me);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setScore(mine?.score ?? 0); setComment(mine?.comment ?? ""); }, [mine?.id, mine?.score, mine?.comment]);
  const all = ratings.data ?? [];
  const avg = all.length ? all.reduce((s, r) => s + r.score, 0) / all.length : 0;
  const done = async (p: PromiseLike<{ error: any }>, msg: string) => {
    setBusy(true);
    const { error } = await p;
    setBusy(false);
    if (error) return toast.error(atsErrorMessage(error));
    toast.success(msg);
    qc.invalidateQueries({ queryKey: candKeys.all });
  };
  const save = () => {
    if (!score || busy) return;
    const c = comment.trim() || null;
    done(mine ? supabase.from("ats_ratings").update({ score, comment: c }).eq("id", mine.id)
      : supabase.from("ats_ratings").insert({ application_id: appId, score, comment: c } as any), "Rating saved");
  };
  const dirty = score !== (mine?.score ?? 0) || (comment.trim() || "") !== (mine?.comment ?? "");
  return (
    <SectionCard title="Ratings" action={ratings.isSuccess ? <Stars value={avg} count={all.length} /> : undefined}>
      {ratings.isLoading ? <RowsSkeleton rows={2} /> : ratings.isError ? <QueryError error={ratings.error} onRetry={() => ratings.refetch()} /> : <>
      <div className="space-y-2">
        <Label>Your rating</Label>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Your rating">
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} type="button" role="radio" aria-checked={score === i} aria-label={`${i} star${i > 1 ? "s" : ""}`} onClick={() => setScore(i)}
              className="rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Star className={cn("h-5 w-5", i <= score ? "fill-warning text-warning" : "text-muted-foreground/40")} />
            </button>
          ))}
        </div>
        <Textarea rows={2} placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} className="text-foreground" />
        <div className="flex gap-2">
          <Button size="sm" disabled={!score || busy || !dirty} onClick={save}>Save rating</Button>
          {mine && <Button size="sm" variant="ghost" disabled={busy} onClick={() => done(supabase.from("ats_ratings").delete().eq("id", mine.id), "Rating cleared")}>Clear</Button>}
        </div>
      </div>
      {others.length > 0 && (
        <ul className="mt-3 divide-y divide-border border-t border-border">
          {others.map((r) => (
            <li key={r.id} className="py-2 text-sm">
              <div className="flex items-center justify-between gap-2"><span className="font-medium text-foreground">{r.rater_name ?? "Someone"}</span><Stars value={r.score} count={1} /></div>
              {r.comment && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
      </>}
    </SectionCard>
  );
}

const NotesCard = forwardRef<HTMLTextAreaElement, { candidateId: string; appId: string | null; me: string | null; isAdmin?: boolean }>(function NotesCard({ candidateId, appId, me, isAdmin }, noteRef) {
  const qc = useQueryClient();
  const notes = useCandidateNotes(candidateId);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const exec = async (p: PromiseLike<{ error: any }>, msg: string, after?: () => void) => {
    if (busy) return;
    setBusy(true);
    const { error } = await p;
    setBusy(false);
    if (error) return toast.error(atsErrorMessage(error));
    toast.success(msg); after?.();
    qc.invalidateQueries({ queryKey: candKeys.notes(candidateId) });
    qc.invalidateQueries({ queryKey: candKeys.events(candidateId) });
  };
  const add = () => {
    const b = body.trim();
    if (!b) return;
    exec(supabase.from("ats_notes").insert({ candidate_id: candidateId, application_id: appId, body: b } as any), "Note added", () => setBody(""));
  };
  return (
    <SectionCard title="Notes">
      <Textarea ref={noteRef} rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note…" className="text-foreground"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } }} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Ctrl/⌘ + Enter to save</span>
        <Button size="sm" disabled={!body.trim() || busy} onClick={add}>Add note</Button>
      </div>
      {notes.isLoading ? <div className="mt-3"><RowsSkeleton rows={2} /></div> : !notes.isError && !(notes.data ?? []).length ? <p className="mt-3 text-sm text-muted-foreground">No notes yet.</p> : (
        <ul className="mt-3 space-y-2">
          {(notes.data ?? []).map((n) => (
            <li key={n.id} className="rounded-lg border border-border p-2.5 text-sm">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span><span className="font-medium text-foreground">{n.author_name ?? "Someone"}</span> · {fmtDateTime(n.created_at)}</span>
                {(n.author_user_id === me || isAdmin) && editing?.id !== n.id && (
                  <span className="flex gap-1">
                    {n.author_user_id === me && <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit note" onClick={() => setEditing({ id: n.id, body: n.body })}><Pencil className="h-3.5 w-3.5" /></Button>}
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Delete note" onClick={() => setDel(n.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </span>
                )}
              </div>
              {editing?.id === n.id ? (
                <div className="mt-1.5 space-y-2">
                  <Textarea rows={3} value={editing.body} onChange={(e) => setEditing({ id: n.id, body: e.target.value })} className="text-foreground"
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && editing.body.trim()) { e.preventDefault(); exec(supabase.from("ats_notes").update({ body: editing.body.trim() }).eq("id", n.id), "Note updated", () => setEditing(null)); } }} />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={!editing.body.trim() || busy} onClick={() => exec(supabase.from("ats_notes").update({ body: editing.body.trim() }).eq("id", n.id), "Note updated", () => setEditing(null))}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              ) : <p className="mt-1 whitespace-pre-wrap break-words text-foreground">{n.body}</p>}
            </li>
          ))}
        </ul>
      )}
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this note?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { const id = del!; setDel(null); exec(supabase.from("ats_notes").delete().eq("id", id), "Note deleted"); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
});

function ActivityCard({ candidateId }: { candidateId: string }) {
  const ev = useCandidateEvents(candidateId);
  return (
    <SectionCard title="Activity">
      {ev.isLoading ? <RowsSkeleton rows={4} /> : ev.isError ? <QueryError error={ev.error} onRetry={() => ev.refetch()} /> :
        !(ev.data ?? []).length ? <p className="text-sm text-muted-foreground">No activity yet.</p> : (
        <ul className="divide-y divide-border">
          {ev.data!.map((e) => {
            const Icon = EVENT_ICON[e.event_type] ?? Activity;
            return (
              <li key={e.id} className="flex items-start gap-3 py-2">
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="h-3.5 w-3.5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm text-foreground">{readableSummary(e.summary)}</p>
                  {typeof (e.data as any)?.note === "string" && (e.data as any).note.trim() && (
                    <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">“{(e.data as any).note.trim()}”</p>
                  )}
                  <p className="text-xs text-muted-foreground" title={fmtDateTime(e.created_at)}>{e.actor_name ?? "System"} · {fmtRelative(e.created_at)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function FilesCard({ files, onUpload, candidateId }: { files: AtsFile[]; onUpload: () => void; candidateId: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<AtsFile | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: candKeys.files(candidateId) }); qc.invalidateQueries({ queryKey: candKeys.all }); };
  const setPrimary = async (f: AtsFile) => {
    setBusy(true);
    const { error } = await supabase.from("ats_files").update({ is_primary: true }).eq("id", f.id);
    setBusy(false);
    if (error) return toast.error(atsErrorMessage(error));
    toast.success("Main resume updated"); refresh();
  };
  const useAsResume = async (f: AtsFile) => {
    setBusy(true);
    const { error } = await supabase.from("ats_files").update({ kind: "resume", is_primary: true }).eq("id", f.id);
    setBusy(false);
    if (error) return toast.error(atsErrorMessage(error));
    toast.success("Saved as the main resume"); refresh();
  };
  const remove = async (f: AtsFile) => {
    setBusy(true);
    const { error } = await supabase.from("ats_files").delete().eq("id", f.id);
    if (error) { setBusy(false); return toast.error(atsErrorMessage(error)); }
    const rm = await supabase.storage.from(ATS_BUCKET).remove([f.storage_path]);
    setBusy(false);
    if (rm.error) toast.warning("File removed from the candidate, but the stored copy couldn't be cleaned up.");
    else toast.success("File deleted");
    refresh();
  };
  return (
    <SectionCard title="Files" action={<Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={onUpload}><Upload className="h-3.5 w-3.5" /> Upload file</Button>}>
      {!files.length ? <p className="text-sm text-muted-foreground">No files yet.</p> : (
        <ul className="divide-y divide-border">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate text-foreground" title={f.file_name}>{f.file_name}</p>
                <p className="text-xs text-muted-foreground">{fileKindLabel(f.kind)}{f.is_primary ? " · Main resume" : ""} · {fmtBytes(f.size_bytes)} · {f.uploaded_by_name ?? "—"} · {fmtDate(f.created_at)}</p>
              </div>
              {f.kind === "resume" && !f.is_primary && <Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={() => setPrimary(f)}>Set as main resume</Button>}
              {f.kind === "other" && /\.(pdf|docx?)$/i.test(f.file_name ?? "") && <Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={() => useAsResume(f)}>Use as resume</Button>}
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Delete file" disabled={busy} onClick={() => setDel(f)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </li>
          ))}
        </ul>
      )}
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this file?</AlertDialogTitle><AlertDialogDescription>“{del?.file_name}” will be removed. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { const f = del!; setDel(null); remove(f); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}

export function FileDropZone({ file, onFile, disabled }: { file: File | null; onFile: (f: File | null) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const { isDragActive, dropzoneProps } = useFileDropzone({ onFiles: (fs) => onFile(fs[0] ?? null), multiple: false, disabled });
  return (
    <div {...dropzoneProps}
      className={cn("flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-4 text-center text-sm",
        isDragActive ? "border-primary bg-primary/5" : "border-border")}>
      {file ? (
        <div className="flex w-full items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-left text-foreground">{file.name}</span>
          <span className="text-xs text-muted-foreground">{fmtBytes(file.size)}</span>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive" onClick={() => onFile(null)} disabled={disabled}>Remove</Button>
        </div>
      ) : (
        <>
          <Upload className="h-5 w-5 text-muted-foreground" />
          <span className="text-muted-foreground">Drag a file here or</span>
          <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()} disabled={disabled}>Choose file</Button>
          <span className="text-xs text-muted-foreground">PDF, Word or image · up to 10 MB</span>
        </>
      )}
      <input ref={input} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
        onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
    </div>
  );
}

function UploadDialog({ open, onClose, candidateId, appId, onDone }: { open: boolean; onClose: () => void; candidateId: string; appId: string | null; onDone: (f: AtsFile) => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<AtsFileKind>("resume");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setFile(null); setKind("resume"); } }, [open]);
  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const row = await uploadAtsFile({ file, candidateId, applicationId: appId, kind });
      toast.success("File uploaded");
      qc.invalidateQueries({ queryKey: candKeys.all });
      onDone(row as AtsFile);
      onClose();
    } catch (e) {
      toast.error(e instanceof AtsFileError ? e.message : atsErrorMessage(e));
    } finally { setBusy(false); }
  };
  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && !busy && onClose()} title="Upload file"
      footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} disabled={!file || busy}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Upload</Button></>}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Kind</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as AtsFileKind)}>
            <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>{ATS_FILE_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <FileDropZone file={file} onFile={setFile} disabled={busy} />
      </div>
    </ResponsiveDialog>
  );
}

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const rows: [string, string][] = [
    ["A", "Move to the next stage"], ["H", "Hold or resume"], ["R", "Reject…"], ["N", "Write a note"], ["I", "Schedule an interview"],
    ["J / ↓", "Next candidate"], ["K / ↑", "Previous candidate"], ["?", "Show these shortcuts"],
  ];
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" footer={<Button onClick={() => onOpenChange(false)}>Close</Button>}>
      <ul className="divide-y divide-border text-sm">
        {rows.map(([k, l]) => (
          <li key={k} className="flex items-center justify-between py-1.5">
            <span className="text-foreground">{l}</span>
            <kbd className="t-mono rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-foreground">{k}</kbd>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Shortcuts work when you are not typing in a field. J/K work in Review mode.</p>
    </ResponsiveDialog>
  );
}

function DeleteCandidateDialog({ open, onOpenChange, candidateId, name, refNo, onDeleted }: {
  open: boolean; onOpenChange: (o: boolean) => void; candidateId: string; name: string; refNo: string; onDeleted: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setTyped(""); }, [open]);
  const ok = typed === name;
  const run = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from("ats_candidates").delete().eq("id", candidateId).select("id");
      if (error) throw error;
      if (!data || data.length === 0) { toast.error("Only HR admins can delete candidates."); return; }
      // Row is gone; now clean up stored files (list, then remove in batches of 100).
      const prefix = `candidates/${candidateId}`;
      let failed = false;
      try {
        const paths: string[] = [];
        for (let offset = 0; ; offset += 1000) {
          const { data: list, error: le } = await supabase.storage.from(ATS_BUCKET).list(prefix, { limit: 1000, offset });
          if (le) throw le;
          paths.push(...(list ?? []).filter((o) => o.id).map((o) => `${prefix}/${o.name}`));
          if (!list || list.length < 1000) break;
        }
        for (let i = 0; i < paths.length; i += 100) {
          const { error: re } = await supabase.storage.from(ATS_BUCKET).remove(paths.slice(i, i + 100));
          if (re) failed = true;
        }
      } catch { failed = true; }
      if (failed) toast.warning("Candidate deleted, but some files could not be removed.");
      else toast.success("Candidate deleted");
      onOpenChange(false);
      onDeleted();
    } catch (e) {
      toast.error(atsErrorMessage(e));
    } finally { setBusy(false); }
  };
  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)} title="Delete candidate permanently"
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
        <Button variant="destructive" disabled={!ok || busy} onClick={run}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Delete permanently</Button>
      </>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <p className="text-sm text-foreground">
          This permanently deletes {name} (<span className="t-mono">{refNo}</span>), all their applications, notes, ratings, files and history. This can't be undone.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="ats-del-confirm">Type <span className="font-medium">{name}</span> to confirm</Label>
          <Input id="ats-del-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="text-foreground" />
        </div>
      </form>
    </ResponsiveDialog>
  );
}
