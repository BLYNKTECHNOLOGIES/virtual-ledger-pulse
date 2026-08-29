import { Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/shared/EmptyState";
import { Inbox } from "lucide-react";
import { MailAvatar } from "./MailAvatar";
import { cleanSubject, mailTime, senderLabel } from "./mailUtils";
import type { HrMailThread } from "@/hooks/hrms/useHrMailbox";

interface Props {
  threads: HrMailThread[];
  isLoading?: boolean;
  selectedKey: string | null;
  onSelect: (t: HrMailThread) => void;
  heightClass?: string;
}

/** Gmail-style conversation list: avatar, senders, subject + snippet, time. */
export function ThreadList({ threads, isLoading, selectedKey, onSelect, heightClass }: Props) {
  return (
    <ScrollArea className={heightClass || "h-[calc(100vh-320px)] min-h-[320px]"}>
      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : threads.length === 0 ? (
        <EmptyState icon={Inbox} title="No conversations" description="Sync the inbox to pull replies." />
      ) : (
        threads.map((t) => {
          const unread = t.unreadCount > 0;
          const primary = senderLabel(t.latest.from_name, t.latest.from_address);
          const senders =
            t.participants.length > 1
              ? `${t.participants.slice(0, 2).map((p) => senderLabel(p, p)).join(", ")}${t.participants.length > 2 ? ` +${t.participants.length - 2}` : ""}`
              : primary;

          return (
            <button
              key={t.key}
              onClick={() => onSelect(t)}
              className={`w-full text-left px-3 py-2.5 border-b border-border transition-colors flex gap-3 items-start
                ${selectedKey === t.key ? "bg-accent" : unread ? "bg-primary/5 hover:bg-muted/60" : "hover:bg-muted/50"}`}
            >
              <MailAvatar label={primary} seed={t.latest.from_address || primary} />

              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${unread ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                    {senders}
                  </span>
                  <span className="shrink-0 flex items-center gap-1.5">
                    {t.messages.some((m) => m.has_attachments) && (
                      <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" aria-label="Has attachments" />
                    )}
                    <span className={`text-[11px] tabular-nums ${unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      {mailTime(t.latest.received_at)}
                    </span>
                  </span>
                </span>

                <span className="flex items-center gap-1.5 mt-0.5">
                  <span className={`truncate text-sm ${unread ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                    {cleanSubject(t.subject)}
                  </span>
                  {t.messages.length > 1 && (
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px] shrink-0">{t.messages.length}</Badge>
                  )}
                </span>

                <span className="block truncate text-xs text-muted-foreground">{t.latest.snippet || ""}</span>
              </span>
            </button>
          );
        })
      )}
    </ScrollArea>
  );
}

export default ThreadList;
