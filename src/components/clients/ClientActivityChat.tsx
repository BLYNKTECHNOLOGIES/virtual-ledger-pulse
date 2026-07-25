import { useEffect, useMemo, useRef, useState } from "react";
import {
  MessageCircle,
  Send,
  Paperclip,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  ShoppingCart,
  ArrowDownUp,
  Landmark,
  Bot,
  Phone,
  Mail,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useQueryClient } from "@tanstack/react-query";
import { openTransaction } from "@/components/transaction-detail";
import { smartUpload } from "@/lib/smart-upload";
import { useClientActivityFeed, type ClientFeedItem } from "@/hooks/useClientActivityFeed";
import { cn } from "@/lib/utils";

interface Props {
  clientId: string;
  clientName?: string | null;
}

const HUMAN_KINDS = new Set<ClientFeedItem["kind"]>(["note"]);

export function ClientActivityChat({ clientId, clientName }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const qc = useQueryClient();

  const canView = hasPermission("clients_view");
  const canEdit = hasPermission("clients_manage");

  const [includeReversed, setIncludeReversed] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickToBottomRef = useRef(true);

  const { data: items = [], isLoading, refetch, isFetching } = useClientActivityFeed({
    clientId,
    clientName,
    includeReversed,
  });

  const currentUserName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.username ||
    user?.email ||
    "Unknown user";

  // Group items by day
  const grouped = useMemo(() => {
    const map = new Map<string, ClientFeedItem[]>();
    for (const it of items) {
      const key = new Date(it.at).toDateString();
      const arr = map.get(key) || [];
      arr.push(it);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [items]);

  // Autoscroll
  useEffect(() => {
    if (!scrollRef.current) return;
    if (stickToBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setShowJump(false);
    } else {
      setShowJump(true);
    }
  }, [items.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    stickToBottomRef.current = nearBottom;
    setShowJump(!nearBottom);
  };

  const jumpToBottom = () => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    stickToBottomRef.current = true;
    setShowJump(false);
  };

  const handleSend = async () => {
    const body = text.trim();
    if (!body && files.length === 0) return;
    setSending(true);
    try {
      const uploadedNames: string[] = [];
      for (const file of files) {
        const isImage = file.type.startsWith("image/");
        const folder = isImage ? "chat-images" : "chat-files";
        const path = `${clientId}/${folder}/${Date.now()}_${file.name}`;
        const uploadedPath = await smartUpload({
          bucket: "kyc-documents",
          path,
          file,
          contentType: file.type || undefined,
        });
        const { data: urlD } = supabase.storage.from("kyc-documents").getPublicUrl(uploadedPath);
        const { error: insErr } = await supabase.from("client_kyc_documents").insert({
          client_id: clientId,
          document_type: "communication_attachment",
          file_url: urlD?.publicUrl || "",
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || null,
        });
        if (insErr) throw insErr;
        uploadedNames.push(file.name);
      }

      if (body || uploadedNames.length > 0) {
        const noteBody = uploadedNames.length
          ? `${body}${body ? "\n\n" : ""}📎 ${uploadedNames.join(", ")}`
          : body;
        const { error } = await supabase.from("client_operator_notes").insert({
          client_id: clientId,
          note: noteBody,
          created_by: user?.id ?? null,
          created_by_name: currentUserName,
        });
        if (error) throw error;
      }

      setText("");
      setFiles([]);
      stickToBottomRef.current = true;
      qc.invalidateQueries({ queryKey: ["client_activity_feed", clientId] });
      qc.invalidateQueries({ queryKey: ["client_operator_notes", clientId] });
      qc.invalidateQueries({ queryKey: ["client_kyc_documents", clientId] });
    } catch (err: any) {
      console.error("Chat send failed:", err);
      toast({
        title: "Send failed",
        description: err?.message || "Could not send message.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  if (!canView) return null;

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-success" />
          <h4 className="text-sm font-semibold">Activity Timeline</h4>
          {isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <Switch
              id={`rev-${clientId}`}
              checked={includeReversed}
              onCheckedChange={setIncludeReversed}
            />
            <Label htmlFor={`rev-${clientId}`} className="text-xs text-muted-foreground">
              Show reversed bank entries
            </Label>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => refetch()}
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Feed */}
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-[520px] overflow-y-auto px-3 py-3 space-y-3 bg-muted/20"
        >
          {isLoading ? (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">
              Loading activity…
            </div>
          ) : items.length === 0 ? (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">
              No activity yet.
            </div>
          ) : (
            grouped.map(([day, list]) => (
              <div key={day} className="space-y-2">
                <div className="sticky top-0 z-10 flex justify-center">
                  <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-background/80 backdrop-blur border text-muted-foreground">
                    {formatDay(day)}
                  </span>
                </div>
                {list.map((it) => (
                  <FeedBubble
                    key={it.id}
                    item={it}
                    isHuman={HUMAN_KINDS.has(it.kind)}
                    onOpenImage={(u) => setLightboxUrl(u)}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {showJump && (
          <button
            onClick={jumpToBottom}
            className="absolute bottom-3 right-3 rounded-full bg-primary text-primary-foreground shadow px-3 py-1 text-xs flex items-center gap-1 hover:opacity-90"
          >
            <ChevronDown className="h-3 w-3" />
            Jump to latest
          </button>
        )}
      </div>

      {/* Composer */}
      {canEdit && (
        <div className="border-t p-2 space-y-2">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 text-xs bg-muted rounded-md px-2 py-1"
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="max-w-[160px] truncate">{f.name}</span>
                  <button
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9 w-9 p-0 shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              title="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
              onChange={(e) => {
                const list = Array.from(e.target.files || []);
                if (list.length) setFiles((prev) => [...prev, ...list]);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a note… (Enter to send, Shift+Enter for newline)"
              rows={1}
              className="min-h-[36px] max-h-32 resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={sending}
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={sending || (!text.trim() && files.length === 0)}
              className="h-9 shrink-0"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Image lightbox */}
      <Dialog open={!!lightboxUrl} onOpenChange={(o) => !o && setLightboxUrl(null)}>
        <DialogContent className="max-w-4xl p-2 bg-background">
          {lightboxUrl && (
            <img
              src={lightboxUrl}
              alt="Attachment preview"
              className="w-full h-auto max-h-[85vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Bubble ---------- */

function FeedBubble({
  item,
  isHuman,
  onOpenImage,
}: {
  item: ClientFeedItem;
  isHuman: boolean;
  onOpenImage: (url: string) => void;
}) {
  const align = isHuman ? "justify-end" : "justify-start";
  const bubbleClasses = cn(
    "max-w-[85%] rounded-lg border px-3 py-2 text-sm shadow-sm",
    isHuman
      ? "bg-primary/10 border-primary/20"
      : "bg-background border-border"
  );

  const Icon = iconForKind(item.kind);
  const isImage = item.attachment?.mime?.startsWith("image/");

  const clickable = !!item.deepLink;

  return (
    <div className={cn("flex gap-2", align)}>
      {!isHuman && (
        <div className="shrink-0 h-7 w-7 rounded-full grid place-items-center bg-muted text-muted-foreground mt-0.5">
          <Icon className="h-3.5 w-3.5" />
        </div>
      )}
      <div
        className={cn(bubbleClasses, clickable && "cursor-pointer hover:border-primary/40 transition-colors")}
        onClick={() => {
          if (item.deepLink) {
            openTransaction({ type: item.deepLink.type, id: item.deepLink.id });
          }
        }}
      >
        <div className="flex items-center gap-2 mb-0.5">
          {item.badge && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px] uppercase tracking-wide">
              {item.badge}
            </Badge>
          )}
          <span className="text-xs font-medium">{item.title}</span>
        </div>

        {item.body && (
          <p className="whitespace-pre-wrap break-words text-sm leading-snug">{item.body}</p>
        )}

        {item.attachment && (
          <div className="mt-2">
            {isImage ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenImage(item.attachment!.url);
                }}
                className="block"
              >
                <img
                  src={item.attachment.url}
                  alt={item.attachment.filename}
                  className="h-24 w-24 object-cover rounded border"
                  loading="lazy"
                />
              </button>
            ) : (
              <a
                href={item.attachment.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-2 text-xs rounded-md border px-2 py-1 hover:bg-muted"
              >
                <FileText className="h-3.5 w-3.5" />
                <span className="max-w-[220px] truncate">{item.attachment.filename}</span>
              </a>
            )}
          </div>
        )}

        <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-2">
          <span>{item.actorName}</span>
          <span>·</span>
          <span>{formatTime(item.at)}</span>
        </div>
      </div>
      {isHuman && (
        <div className="shrink-0 h-7 w-7 rounded-full grid place-items-center bg-primary text-primary-foreground text-[11px] font-semibold mt-0.5">
          {initials(item.actorName)}
        </div>
      )}
    </div>
  );
}

function iconForKind(k: ClientFeedItem["kind"]) {
  switch (k) {
    case "system":
      return Bot;
    case "note":
      return MessageCircle;
    case "comm":
      return Phone;
    case "doc":
      return ImageIcon;
    case "sales":
      return ShoppingCart;
    case "purchase":
      return ArrowDownUp;
    case "bank":
      return Landmark;
    default:
      return Mail;
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDay(dayStr: string): string {
  const d = new Date(dayStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
