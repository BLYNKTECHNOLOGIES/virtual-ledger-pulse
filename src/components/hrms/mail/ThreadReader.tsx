import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ChevronDown, CornerUpLeft, Forward, Loader2, Mail, MailOpen, Paperclip, ReplyAll, Send, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { MailBodyView } from "@/components/hrms/MailBodyView";
import { MailAvatar } from "./MailAvatar";
import {
  cleanSubject, formatBytes, mailTime, mailTimeFull, quoteOriginal, replySubject, senderLabel,
} from "./mailUtils";
import {
  useMarkMailRead, useReplyHrMail,
  type HrMailMessage, type HrMailThread, type HrMailbox,
} from "@/hooks/hrms/useHrMailbox";

/* --------------------------- message details --------------------------- */

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-foreground">{value}</span>
    </div>
  );
}

function MessageCard({
  message: m,
  expanded,
  onToggle,
  onReply,
}: {
  message: HrMailMessage;
  expanded: boolean;
  onToggle: () => void;
  onReply: (m: HrMailMessage) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const markRead = useMarkMailRead();
  const who = senderLabel(m.from_name, m.from_address);
  const attachments = m.attachments || [];

  return (
    <div className="rounded-lg border border-border bg-card">
      <button className="w-full text-left px-3 py-2.5 flex gap-3 items-start hover:bg-muted/40 transition-colors" onClick={onToggle}>
        <MailAvatar label={who} seed={m.from_address || who} size={expanded ? "md" : "sm"} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">
              <span className={`text-sm ${m.is_read ? "text-foreground" : "font-semibold text-foreground"}`}>{who}</span>
              {expanded && m.from_address && (
                <span className="ml-1.5 text-xs text-muted-foreground">&lt;{m.from_address}&gt;</span>
              )}
            </span>
            <span className="shrink-0 flex items-center gap-1.5">
              {m.has_attachments && <Paperclip className="h-3 w-3 text-muted-foreground" aria-label="Has attachments" />}
              <span className="text-[11px] text-muted-foreground tabular-nums">{mailTime(m.received_at)}</span>
            </span>
          </span>
          {!expanded && <span className="block truncate text-xs text-muted-foreground">{m.snippet || ""}</span>}
          {expanded && (
            <span className="block text-[11px] text-muted-foreground">
              to {(m.to_addresses || []).join(", ") || "me"}
            </span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-3 space-y-3">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showDetails ? "rotate-180" : ""}`} />
            {showDetails ? "Hide details" : "Show details"}
          </button>

          {showDetails && (
            <div className="rounded-md border border-border bg-muted/30 p-2.5 space-y-1">
              <DetailRow label="From" value={m.from_name ? `${m.from_name} <${m.from_address}>` : m.from_address} />
              <DetailRow label="To" value={(m.to_addresses || []).join(", ")} />
              <DetailRow label="Cc" value={(m.cc_addresses || []).join(", ")} />
              <DetailRow label="Reply-to" value={m.reply_to} />
              <DetailRow label="Date" value={mailTimeFull(m.received_at)} />
              <DetailRow label="Subject" value={m.subject} />
            </div>
          )}

          <MailBodyView html={m.body_html} text={m.body_text} />

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {attachments.map((a, i) => (
                <Badge key={`${a.filename}-${i}`} variant="outline" className="gap-1 text-[11px] font-normal">
                  <Paperclip className="h-3 w-3" />
                  {a.filename}
                  {a.size ? <span className="text-muted-foreground">· {formatBytes(a.size)}</span> : null}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" className="h-8" onClick={() => onReply(m)}>
              <CornerUpLeft className="h-3.5 w-3.5 mr-1" /> Reply
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => markRead.mutate({ id: m.id, isRead: !m.is_read })}>
              {m.is_read ? <Mail className="h-3.5 w-3.5 mr-1" /> : <MailOpen className="h-3.5 w-3.5 mr-1" />}
              Mark as {m.is_read ? "unread" : "read"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ reply box ------------------------------ */

function ReplyBox({
  mailbox,
  thread,
  target,
  replyAll,
  onClose,
}: {
  mailbox?: HrMailbox;
  thread: HrMailThread;
  target: HrMailMessage;
  replyAll: boolean;
  onClose: () => void;
}) {
  const reply = useReplyHrMail();
  const mine = (mailbox?.from_address || "").toLowerCase();

  const initialTo = target.reply_to || target.from_address || "";
  const initialCc = replyAll
    ? [...(target.to_addresses || []), ...(target.cc_addresses || [])]
        .filter((a) => a && a.toLowerCase() !== mine && a.toLowerCase() !== initialTo.toLowerCase())
        .join(", ")
    : "";

  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState(initialCc);
  const [showCc, setShowCc] = useState(!!initialCc);
  const [body, setBody] = useState("");

  useEffect(() => {
    setTo(initialTo);
    setCc(initialCc);
    setShowCc(!!initialCc);
  }, [target.id, replyAll]); // eslint-disable-line react-hooks/exhaustive-deps

  const subject = replySubject(thread.subject);

  function send() {
    if (!mailbox?.id) { toast({ title: "No sender mailbox selected", variant: "destructive" }); return; }
    const toList = to.split(/[,\s]+/).filter((x) => x.includes("@"));
    if (!toList.length) { toast({ title: "Add at least one recipient", variant: "destructive" }); return; }
    if (!body.trim()) { toast({ title: "Write a message first", variant: "destructive" }); return; }

    const references = [target.references_header, target.message_id_header].filter(Boolean).join(" ").trim();

    reply.mutate(
      {
        mailboxId: mailbox.id,
        to: toList,
        cc: cc.split(/[,\s]+/).filter((x) => x.includes("@")),
        subject,
        bodyText: body + quoteOriginal({
          fromName: target.from_name,
          fromAddress: target.from_address,
          receivedAt: target.received_at,
          text: target.body_text,
        }),
        inReplyToMessageId: target.id,
        inReplyToHeader: target.message_id_header || null,
        referencesHeader: references || null,
      },
      {
        onSuccess: () => { toast({ title: "Reply sent", description: `To ${toList.join(", ")}` }); onClose(); },
        onError: (e: any) => toast({ title: "Reply failed", description: e.message, variant: "destructive" }),
      },
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground truncate">
          From {mailbox?.from_name || "HR"} &lt;{mailbox?.from_address}&gt;
        </span>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} aria-label="Discard reply">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Label className="w-8 shrink-0 text-xs text-muted-foreground">To</Label>
        <Input value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-foreground" />
        {!showCc && (
          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setShowCc(true)}>Cc</Button>
        )}
      </div>

      {showCc && (
        <div className="flex items-center gap-2">
          <Label className="w-8 shrink-0 text-xs text-muted-foreground">Cc</Label>
          <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="comma separated" className="h-8 text-foreground" />
        </div>
      )}

      <div className="flex items-center gap-2">
        <Label className="w-8 shrink-0 text-xs text-muted-foreground">Subj</Label>
        <Input value={subject} readOnly className="h-8 text-foreground bg-muted/40" />
      </div>

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={7}
        placeholder="Write your reply…"
        className="text-foreground"
      />

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={send} disabled={reply.isPending}>
          {reply.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
          Send
        </Button>
        <span className="text-[11px] text-muted-foreground">The original message is quoted below your reply.</span>
      </div>
    </div>
  );
}

/* ----------------------------- thread reader --------------------------- */

export function ThreadReader({
  thread,
  mailbox,
  onBack,
  heightClass,
}: {
  thread: HrMailThread;
  mailbox?: HrMailbox;
  onBack: () => void;
  heightClass?: string;
}) {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [replyTarget, setReplyTarget] = useState<{ message: HrMailMessage; all: boolean } | null>(null);

  useEffect(() => {
    setExpandedIds([]);
    setReplyTarget(null);
  }, [thread.key]);

  const last = thread.messages[thread.messages.length - 1];
  const senders = useMemo(
    () => thread.participants.map((p) => senderLabel(p, p)).join(", "),
    [thread.participants],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
        <Button size="icon" variant="ghost" className="h-8 w-8 lg:hidden shrink-0" onClick={onBack} aria-label="Back to inbox">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground break-words">{cleanSubject(thread.subject)}</h3>
          <p className="text-xs text-muted-foreground break-words">
            {thread.messages.length} message{thread.messages.length === 1 ? "" : "s"} · {senders}
          </p>
        </div>
        <div className="hidden sm:flex gap-1 shrink-0">
          <Button size="sm" variant="outline" className="h-8" onClick={() => setReplyTarget({ message: last, all: false })}>
            <CornerUpLeft className="h-3.5 w-3.5 mr-1" /> Reply
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => setReplyTarget({ message: last, all: true })}>
            <ReplyAll className="h-3.5 w-3.5 mr-1" /> Reply all
          </Button>
        </div>
      </div>

      <ScrollArea className={heightClass || "h-[calc(100vh-360px)] min-h-[320px]"}>
        <div className="space-y-2 p-3">
          {thread.messages.map((m, idx) => (
            <MessageCard
              key={m.id}
              message={m}
              expanded={expandedIds.includes(m.id) || (expandedIds.length === 0 && idx === thread.messages.length - 1)}
              onToggle={() =>
                setExpandedIds((prev) => {
                  const base = prev.length === 0 ? [last.id] : prev;
                  return base.includes(m.id) ? base.filter((x) => x !== m.id) : [...base, m.id];
                })
              }
              onReply={(msg) => setReplyTarget({ message: msg, all: false })}
            />
          ))}

          {replyTarget ? (
            <ReplyBox
              mailbox={mailbox}
              thread={thread}
              target={replyTarget.message}
              replyAll={replyTarget.all}
              onClose={() => setReplyTarget(null)}
            />
          ) : (
            <div className="flex gap-2 sm:hidden">
              <Button size="sm" variant="outline" className="h-8" onClick={() => setReplyTarget({ message: last, all: false })}>
                <CornerUpLeft className="h-3.5 w-3.5 mr-1" /> Reply
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setReplyTarget({ message: last, all: true })}>
                <Forward className="h-3.5 w-3.5 mr-1" /> Reply all
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default ThreadReader;
