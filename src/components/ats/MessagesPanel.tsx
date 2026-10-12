import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import {
  AlertTriangle, Check, Clock, Loader2, Mail, MoreVertical, Paperclip, RefreshCw, RotateCcw, Send, Upload,
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { atsErrorMessage } from "@/lib/ats/errors";
import { fmtDate, fmtDateTime } from "@/lib/ats/format";
import { AtsFileError, fileKindLabel, fmtBytes, uploadAtsFile } from "@/lib/ats/files";
import { candKeys, type AtsCandidate, type AtsFile } from "@/lib/ats/candidates";
import {
  MailError, PLACEHOLDER_RE, canRetry, findOlderEmails, deleteMessage, mailErrorMessage, mailKeys, markMessageUnread, markThreadRead,
  purposeLabel, renderTemplate, retryCandidateEmail, sendCandidateEmail, splitQuoted, useEmailTemplates,
  useMailStatus, useMailThread, type AtsMessage, type MailAttachmentInfo,
} from "@/lib/ats/mail";
import { QueryError, RowsSkeleton } from "./AtsBits";
import { useCheckNow } from "./EmailSettingsSection";

interface Props {
  candidate: AtsCandidate;
  appId: string | null;
  files: AtsFile[];
  visible: boolean;
  /** Increment to open the composer. */
  composeSignal?: number;
  onOpenFile: (fileId: string) => void;
  onEditProfile: () => void;
  className?: string;
}

const istDay = (v: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(v));
const msgAt = (m: AtsMessage) => m.received_at ?? m.sent_at ?? m.created_at;
const istTime = (v: string) => new Date(v).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });

export function MessagesPanel({ candidate, appId, files, visible, composeSignal, onOpenFile, onEditProfile, className }: Props) {
  const qc = useQueryClient();
  const st = useMailStatus();
  const enabled = !!st.data?.enabled;
  const thread = useMailThread(candidate.id, { poll: visible && enabled });
  const check = useCheckNow();
  const [composing, setComposing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const msgs = thread.data ?? [];
  const firstName = (candidate.full_name ?? "").trim().split(/\s+/)[0] || "this candidate";

  useEffect(() => { if (composeSignal) setComposing(true); }, [composeSignal]);

  // Auto-scroll on open and when a new message arrives.
  const lastId = msgs[msgs.length - 1]?.id;
  useEffect(() => {
    if (visible) endRef.current?.scrollIntoView({ block: "end" });
  }, [visible, lastId]);

  // Read state: once per visible view with unread received messages.
  const unread = msgs.some((m) => m.direction === "inbound" && !m.read_at);
  const markingRef = useRef(false);
  useEffect(() => {
    if (!visible || !unread || markingRef.current) return;
    markingRef.current = true;
    markThreadRead(candidate.id).then(() => {
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
  };

  const fileIds = useMemo(() => new Set(files.map((f) => f.id)), [files]);
  const [finding, setFinding] = useState(false);
  const findOlder = async () => {
    if (finding) return;
    setFinding(true);
    try {
      const r = await findOlderEmails(candidate.id, 180);
      if (r.skipped === "busy") toast.message("Already checking. Try again in a minute.");
      else if (!r.ok || r.error) toast.error(mailErrorMessage(r.error));
      else if (Number(r.stored ?? 0) > 0) toast.success(`${r.stored} older emails added`);
      else toast.message("No older emails found");
    } catch (e: any) {
      toast.error(mailErrorMessage(e?.code));
    } finally {
      setFinding(false);
      refreshAll();
      qc.invalidateQueries({ queryKey: candKeys.files(candidate.id) });
    }
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Messages</p>
          <p className="truncate text-xs text-muted-foreground">{candidate.email ?? "No email address"}</p>
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
            {msgs.map((m, i) => {
              const day = istDay(msgAt(m));
              const showDay = i === 0 || istDay(msgAt(msgs[i - 1])) !== day;
              return (
                <Fragment key={m.id}>
                  {showDay && <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />{fmtDate(msgAt(m))}<span className="h-px flex-1 bg-border" /></div>}
                  <MessageBubble m={m} fileIds={fileIds} onOpenFile={onOpenFile} onChanged={refreshAll} />
                </Fragment>
              );
            })}
            <div ref={endRef} />
          </>
        )}
      </div>

      {enabled && (
        <div className="border-t border-border p-3">
          {!composing ? (
            <Button variant="outline" className="w-full justify-start text-muted-foreground" onClick={() => setComposing(true)}>Write an email…</Button>
          ) : !candidate.email ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Add an email address to this candidate first.</span>
              <Button size="sm" variant="outline" onClick={onEditProfile}>Edit profile</Button>
            </div>
          ) : (
            <Composer candidate={candidate} appId={appId} files={files} thread={msgs}
              onClose={() => setComposing(false)} onDone={refreshAll} />
          )}
        </div>
      )}
    </div>
  );
}

const SKIP_TEXT: Record<string, string> = {
  type_not_allowed: "Not saved: file type not supported",
  too_large: "Not saved: larger than 10 MB",
  limit: "Not saved: more than 5 attachments",
  upload_failed: "Not saved",
  unreadable: "Not saved",
};

function Attachments({ list, fileIds, onOpenFile }: { list: MailAttachmentInfo[]; fileIds: Set<string>; onOpenFile: (id: string) => void }) {
  if (!list.length) return null;
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
          return openable
            ? <button key={i} type="button" onClick={() => onOpenFile(a.file_id!)} className="max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">{chip}</button>
            : <span key={i} className="max-w-full">{chip}</span>;
        })}
      </div>
      {anyUnsaved && <p className="text-xs text-muted-foreground">Open the email in the HR mailbox to get it.</p>}
    </div>
  );
}

function MessageBubble({ m, fileIds, onOpenFile, onChanged }: { m: AtsMessage; fileIds: Set<string>; onOpenFile: (id: string) => void; onChanged: () => void }) {
  const out = m.direction === "outbound";
  const [showQuoted, setShowQuoted] = useState(false);
  const [origOpen, setOrigOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
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
    try { await markMessageUnread(m.id); onChanged(); } catch (e) { toast.error(atsErrorMessage(e)); }
  };
  const remove = async () => {
    setDelOpen(false);
    try { await deleteMessage(m.id); toast.success("Email removed from the ATS"); onChanged(); }
    catch (e: any) { toast.error(e?.message === "Only HR admins can remove emails." ? e.message : atsErrorMessage(e)); }
  };

  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div className={cn("w-full max-w-[88%] rounded-xl border p-3", out ? "border-primary/30 bg-primary/5" : "border-border bg-muted/40")}>
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
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDelOpen(true)}>Remove from ATS</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {m.purpose && m.purpose !== "general" && <Badge variant="secondary" className="font-normal">{purposeLabel(m.purpose)}</Badge>}
          {!out && m.is_automatic && <Badge variant="outline" className="font-normal">Automatic reply</Badge>}
        </div>
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
        <Attachments list={atts} fileIds={fileIds} onOpenFile={onOpenFile} />
        {out && m.status === "failed" && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-destructive">
            <span>{mailErrorMessage(m.error)}</span>
            {canRetry(m.error) && <Button size="sm" variant="outline" className="h-7 gap-1" disabled={retrying} onClick={retry}>
              {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Retry
            </Button>}
          </div>
        )}
        {!out && m.body_html && (
          <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" onClick={() => setOrigOpen(true)}>View original</Button>
        )}
      </div>
      {!out && m.body_html && <OriginalDialog open={origOpen} onOpenChange={setOrigOpen} html={m.body_html} subject={m.subject} />}
      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remove this email?</AlertDialogTitle>
            <AlertDialogDescription>Remove this email from the candidate's profile? It stays in the HR mailbox.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={remove}>Remove</AlertDialogAction></AlertDialogFooter>
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

function Composer({ candidate, appId, files, thread, onClose, onDone }: {
  candidate: AtsCandidate; appId: string | null; files: AtsFile[]; thread: AtsMessage[]; onClose: () => void; onDone: () => void;
}) {
  const qc = useQueryClient();
  const templates = useEmailTemplates();
  const latest = thread[thread.length - 1];
  const [subject, setSubject] = useState(() => (latest?.subject ? `Re: ${stripRe(latest.subject)}`.slice(0, 200) : ""));
  const [body, setBody] = useState("");
  const [reply, setReply] = useState(!!latest);
  const [tplMeta, setTplMeta] = useState<{ code: string | null; purpose: string }>({ code: null, purpose: "general" });
  const [pendingTpl, setPendingTpl] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const idRef = useRef<string>(crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

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

  const applyTemplate = async (id: string) => {
    try {
      const r = await renderTemplate(id, appId, candidate.id);
      setSubject(r.subject.slice(0, 200));
      setBody(r.body);
      setTplMeta({ code: r.template_code, purpose: r.purpose });
    } catch (e) {
      toast.error(atsErrorMessage(e));
    }
  };
  const pickTemplate = (id: string) => (body.trim() ? setPendingTpl(id) : applyTemplate(id));

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
    try {
      // Same client id on a retry after a network error, so the server never sends twice.
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
        onClose();
      } else {
        toast.success("Email sent");
        idRef.current = crypto.randomUUID();
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
          <SelectContent>{(templates.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Input placeholder="Subject" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} className="text-foreground" aria-label="Subject" />
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
