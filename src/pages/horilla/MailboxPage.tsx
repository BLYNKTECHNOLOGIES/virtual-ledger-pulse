import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Mail, Send, Inbox, RefreshCw, Paperclip, Users, Search, FileText,
  Loader2, CheckCircle2, AlertTriangle, X, Plus, Trash2, Settings, Bell, BellOff, Filter,
} from "lucide-react";


import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  useHrMailboxes, useHrMailMessages, useHrMailCampaigns, useHrMailRecipients,
  useHrMailTemplates, useHrMailEmployees, useSendHrMail, useFetchHrMail, useMarkMailRead,
  useMarkThreadRead, groupMailThreads,
  useHrMailUnreadCounts, useHrMailRealtimeAlerts,
  getNotificationPermission, requestMailNotificationPermission,
  type HrMailMessage, type HrMailCampaign,
} from "@/hooks/hrms/useHrMailbox";

const PLACEHOLDERS = ["{{employee_name}}", "{{first_name}}", "{{employee_email}}"];

export default function MailboxPage() {
  const [tab, setTab] = useState("inbox");

  const { data: mailboxes = [] } = useHrMailboxes();
  const [mailboxId, setMailboxId] = useState<string | undefined>(undefined);
  const activeMailboxId = mailboxId || mailboxes[0]?.id;

  const { data: unread } = useHrMailUnreadCounts();
  useHrMailRealtimeAlerts(true);

  const [permission, setPermission] = useState(() => getNotificationPermission());
  const activeUnread = activeMailboxId ? unread?.byMailbox?.[activeMailboxId] ?? 0 : 0;

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader title="HR Mailbox" description="Send HR mail to employees and read replies in one place" />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={activeMailboxId} onValueChange={setMailboxId}>
          <SelectTrigger className="h-9 w-[300px] text-foreground">
            <SelectValue placeholder="Select mailbox" />
          </SelectTrigger>
          <SelectContent>
            {mailboxes.map(mb => {
              const n = unread?.byMailbox?.[mb.id] ?? 0;
              return (
                <SelectItem key={mb.id} value={mb.id}>
                  <span className="flex items-center gap-2">
                    <span>{mb.label} — {mb.from_address}</span>
                    {n > 0 && <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">{n}</Badge>}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {(unread?.total ?? 0) > 0 && (
          <Badge variant="secondary" className="gap-1">
            <Bell className="h-3 w-3" /> {unread?.total} unread
          </Badge>
        )}

        {permission !== "granted" && (
          <Button
            size="sm"
            variant="outline"
            disabled={permission === "unsupported" || permission === "denied"}
            onClick={async () => {
              const p = await requestMailNotificationPermission();
              setPermission(p);
              if (p === "granted") toast({ title: "Desktop alerts enabled", description: "You'll be notified when new HR mail arrives." });
              else if (p === "denied") toast({ title: "Alerts blocked", description: "Allow notifications for this site in your browser settings.", variant: "destructive" });
            }}
          >
            {permission === "unsupported"
              ? <><BellOff className="h-3.5 w-3.5 mr-1" /> Alerts unsupported</>
              : permission === "denied"
                ? <><BellOff className="h-3.5 w-3.5 mr-1" /> Alerts blocked</>
                : <><Bell className="h-3.5 w-3.5 mr-1" /> Enable desktop alerts</>}
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="inbox" className="gap-1">
            <Inbox className="h-3.5 w-3.5" /> Inbox
            {activeUnread > 0 && <Badge variant="destructive" className="ml-1 h-4 px-1.5 text-[10px]">{activeUnread}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="compose" className="gap-1"><Send className="h-3.5 w-3.5" /> Compose</TabsTrigger>
          <TabsTrigger value="sent" className="gap-1"><Mail className="h-3.5 w-3.5" /> Sent</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1"><FileText className="h-3.5 w-3.5" /> Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox"><InboxTab mailboxId={activeMailboxId} /></TabsContent>
        <TabsContent value="compose"><ComposeTab mailboxId={activeMailboxId} onSent={() => setTab("sent")} /></TabsContent>
        <TabsContent value="sent"><SentTab mailboxId={activeMailboxId} /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
      </Tabs>
    </div>
  );
}


/* ------------------------------- INBOX --------------------------------- */

function InboxTab({ mailboxId }: { mailboxId?: string }) {
  const [search, setSearch] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const filters = useMemo(
    () => ({ search, from: fromFilter, subject: subjectFilter, dateFrom, dateTo, unreadOnly }),
    [search, fromFilter, subjectFilter, dateFrom, dateTo, unreadOnly],
  );
  const activeFilterCount =
    [fromFilter, subjectFilter, dateFrom, dateTo].filter(v => v.trim()).length + (unreadOnly ? 1 : 0);

  const { data: messages = [], isLoading } = useHrMailMessages(mailboxId, filters);
  const { data: mailboxes = [] } = useHrMailboxes();
  const fetchMail = useFetchHrMail();
  const markRead = useMarkMailRead();
  const markThreadRead = useMarkThreadRead();

  const threads = useMemo(() => groupMailThreads(messages), [messages]);
  const selectedThread = threads.find(t => t.key === selectedKey) || null;

  const mailbox = mailboxes.find(m => m.id === mailboxId);

  function clearFilters() {
    setFromFilter(""); setSubjectFilter(""); setDateFrom(""); setDateTo(""); setUnreadOnly(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search subject, sender, body..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-foreground" />
        </div>
        <Button size="sm" variant={showFilters ? "secondary" : "outline"} onClick={() => setShowFilters(v => !v)}>
          <Filter className="h-3.5 w-3.5 mr-1" /> Filters
          {activeFilterCount > 0 && <Badge variant="destructive" className="ml-1 h-4 px-1.5 text-[10px]">{activeFilterCount}</Badge>}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={fetchMail.isPending || !mailboxId}
          onClick={() => fetchMail.mutate(mailboxId, {
            onSuccess: (res: any) => {
              if (res?.errors?.length) toast({ title: "Sync finished with errors", description: res.errors[0].error, variant: "destructive" });
              else toast({ title: "Inbox synced", description: `${res?.inserted ?? 0} new message(s)` });
            },
            onError: (e: any) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
          })}
        >
          {fetchMail.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          <span className="ml-1">Sync inbox</span>
        </Button>
      </div>

      {showFilters && (
        <Card>
          <CardContent className="p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input value={fromFilter} onChange={e => setFromFilter(e.target.value)} placeholder="name or email" className="h-9 text-foreground" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Subject keywords</Label>
              <Input value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)} placeholder="leave approval" className="h-9 text-foreground" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From date</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 text-foreground" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To date</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 text-foreground" />
            </div>
            <div className="flex items-end justify-between gap-2">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={unreadOnly} onCheckedChange={v => setUnreadOnly(!!v)} />
                Unread only
              </label>
              <Button size="sm" variant="ghost" onClick={clearFilters} disabled={activeFilterCount === 0}>
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        {isLoading ? "Loading…" : `${threads.length} conversation${threads.length === 1 ? "" : "s"} · ${messages.length} message${messages.length === 1 ? "" : "s"}`}
      </p>


      {mailbox && !mailbox.imap_enabled && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-3 text-sm text-muted-foreground flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <span>
              Inbox reading is not enabled for this mailbox yet. Set the IMAP host and enable it in mailbox settings
              to pull replies. Sending works regardless.
            </span>
          </CardContent>
        </Card>
      )}
      {mailbox?.imap_last_error && (
        <p className="text-xs text-destructive">Last sync error: {mailbox.imap_last_error}</p>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="h-[560px]">
              {isLoading ? (
                <div className="p-6 text-sm text-muted-foreground">Loading…</div>
              ) : threads.length === 0 ? (
                <EmptyState icon={Inbox} title="No messages" description="Sync the inbox to pull replies." />
              ) : threads.map(t => (
                <button
                  key={t.key}
                  onClick={() => {
                    setSelectedKey(t.key);
                    const unreadIds = t.messages.filter(m => !m.is_read).map(m => m.id);
                    if (unreadIds.length) markThreadRead.mutate(unreadIds);
                  }}
                  className={`w-full text-left px-3 py-2.5 border-b border-border hover:bg-muted/50 transition-colors ${selectedKey === t.key ? "bg-muted" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${t.unreadCount === 0 ? "text-muted-foreground" : "font-semibold text-foreground"}`}>
                      {t.participants.slice(0, 2).join(", ")}
                      {t.participants.length > 2 ? ` +${t.participants.length - 2}` : ""}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                      {t.latest.received_at ? format(new Date(t.latest.received_at), "dd MMM HH:mm") : "—"}
                    </span>
                  </div>
                  <div className="text-sm truncate text-foreground flex items-center gap-1.5">
                    <span className="truncate">{t.subject}</span>
                    {t.messages.length > 1 && (
                      <Badge variant="secondary" className="h-4 px-1.5 text-[10px] shrink-0">{t.messages.length}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{t.latest.snippet || ""}</div>
                  <div className="flex gap-1 mt-1 items-center">
                    {t.messages.some(m => m.has_attachments) && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                    {t.messages.some(m => m.matched_employee_id) && <Badge variant="outline" className="text-[9px] py-0">Employee</Badge>}
                    {t.unreadCount > 0 && <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">{t.unreadCount} new</Badge>}
                  </div>
                </button>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            {!selectedThread ? (
              <EmptyState icon={Mail} title="Select a conversation" description="Choose a conversation to read the full thread here." />
            ) : (
              <div className="space-y-3">
                <div>
                  <h3 className="text-base font-semibold text-foreground">{selectedThread.subject}</h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedThread.messages.length} message{selectedThread.messages.length === 1 ? "" : "s"} ·{" "}
                    {selectedThread.participants.join(", ")}
                  </p>
                </div>

                <ScrollArea className="h-[470px] pr-2">
                  <div className="space-y-2">
                    {selectedThread.messages.map((m, idx) => {
                      const isOpen = expandedIds.includes(m.id) || idx === selectedThread.messages.length - 1;
                      return (
                        <div key={m.id} className="rounded-md border border-border">
                          <button
                            className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors"
                            onClick={() => setExpandedIds(prev =>
                              prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-sm truncate ${m.is_read ? "text-foreground" : "font-semibold text-foreground"}`}>
                                {m.from_name ? `${m.from_name} <${m.from_address}>` : m.from_address || "Unknown sender"}
                              </span>
                              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                                {m.received_at ? format(new Date(m.received_at), "dd MMM yyyy HH:mm") : "—"}
                              </span>
                            </div>
                            {!isOpen && <div className="text-xs text-muted-foreground truncate">{m.snippet || ""}</div>}
                          </button>
                          {isOpen && (
                            <div className="border-t border-border px-3 py-2">
                              <MailBodyView html={m.body_html} text={m.body_text} />
                              <div className="mt-2">
                                <Button size="sm" variant="outline" onClick={() => markRead.mutate({ id: m.id, isRead: !m.is_read })}>
                                  Mark as {m.is_read ? "unread" : "read"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

/* ------------------------------ COMPOSE -------------------------------- */

function ComposeTab({ mailboxId, onSent }: { mailboxId?: string; onSent: () => void }) {
  const { data: employees = [] } = useHrMailEmployees();
  const { data: templates = [] } = useHrMailTemplates();
  const send = useSendHrMail();

  const [mode, setMode] = useState<"all" | "selected">("selected");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [extraEmails, setExtraEmails] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [search, setSearch] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e: any) =>
      `${e.first_name || ""} ${e.last_name || ""} ${e.email} ${e.badge_id || ""}`.toLowerCase().includes(q));
  }, [employees, search]);

  const recipientCount = mode === "all" ? employees.length
    : selectedIds.length + extraEmails.split(/[,\s]+/).filter(x => x.includes("@")).length;

  async function handleSend() {
    if (!mailboxId) { toast({ title: "Select a sender mailbox", variant: "destructive" }); return; }
    if (!subject.trim()) { toast({ title: "Subject is required", variant: "destructive" }); return; }
    if (!bodyText.trim()) { toast({ title: "Message body is required", variant: "destructive" }); return; }
    if (recipientCount === 0) { toast({ title: "No recipients selected", variant: "destructive" }); return; }

    let attachmentPaths: string[] = [];
    if (files.length) {
      setUploading(true);
      try {
        for (const f of files) {
          const path = `outgoing/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
          const { error } = await supabase.storage.from("hr-mail").upload(path, f);
          if (error) throw error;
          attachmentPaths.push(path);
        }
      } catch (e: any) {
        setUploading(false);
        toast({ title: "Attachment upload failed", description: e.message, variant: "destructive" });
        return;
      }
      setUploading(false);
    }

    const bodyHtml = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#111827;line-height:1.6;white-space:pre-wrap;">${
      bodyText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")
    }</div>`;

    send.mutate({
      mailboxId,
      subject,
      bodyHtml,
      recipientMode: mode,
      employeeIds: mode === "selected" ? selectedIds : [],
      extraEmails: mode === "selected" ? extraEmails.split(/[,\s]+/).filter(x => x.includes("@")) : [],
      attachmentPaths,
    }, {
      onSuccess: (res: any) => {
        toast({
          title: "Mail dispatched",
          description: `${res.sentTotal ?? 0} sent, ${res.failedTotal ?? 0} failed`,
        });
        setSubject(""); setBodyText(""); setSelectedIds([]); setExtraEmails(""); setFiles([]);
        onSent();
      },
      onError: (e: any) => toast({ title: "Send failed", description: e.message, variant: "destructive" }),
    });
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,360px)_1fr]">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Recipients ({recipientCount})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={mode} onValueChange={(v: any) => setMode(v)}>
            <SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="selected">Selected employees</SelectItem>
              <SelectItem value="all">All active employees</SelectItem>
            </SelectContent>
          </Select>

          {mode === "selected" && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-foreground" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelectedIds(filtered.map((e: any) => e.id))}>Select all shown</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Clear</Button>
              </div>
              <ScrollArea className="h-[280px] rounded-md border border-border">
                {filtered.map((e: any) => (
                  <label key={e.id} className="flex items-center gap-2 px-3 py-2 border-b border-border last:border-0 cursor-pointer hover:bg-muted/50">
                    <Checkbox
                      checked={selectedIds.includes(e.id)}
                      onCheckedChange={(c) => setSelectedIds(prev => c ? [...prev, e.id] : prev.filter(x => x !== e.id))}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm truncate text-foreground">{[e.first_name, e.last_name].filter(Boolean).join(" ")}</span>
                      <span className="block text-xs text-muted-foreground truncate">{e.email}</span>
                    </span>
                  </label>
                ))}
              </ScrollArea>
              <div className="space-y-1">
                <Label className="text-xs">Additional emails (comma separated)</Label>
                <Input value={extraEmails} onChange={e => setExtraEmails(e.target.value)} placeholder="someone@example.com" className="h-9 text-foreground" />
              </div>
            </>
          )}
          {mode === "all" && (
            <p className="text-xs text-muted-foreground">
              This mail goes to all {employees.length} active employees who have an email address on file.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Message</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {templates.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Start from a template</Label>
              <Select onValueChange={(id) => {
                const t = templates.find(x => x.id === id);
                if (t) { setSubject(t.subject); setBodyText(t.body_html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")); }
              }}>
                <SelectTrigger className="h-9 text-foreground"><SelectValue placeholder="No template" /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Subject</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} maxLength={300} className="h-9 text-foreground" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Body</Label>
            <Textarea value={bodyText} onChange={e => setBodyText(e.target.value)} rows={12} className="text-foreground" />
            <div className="flex flex-wrap gap-1 pt-1">
              {PLACEHOLDERS.map(p => (
                <button key={p} type="button" onClick={() => setBodyText(b => b + p)}
                  className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted">
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Paperclip className="h-3 w-3" /> Attachments</Label>
            <Input type="file" multiple onChange={e => setFiles(Array.from(e.target.files || []))} className="h-9 text-foreground" />
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {files.map(f => (
                  <Badge key={f.name} variant="outline" className="text-[10px] gap-1">
                    {f.name}
                    <button onClick={() => setFiles(prev => prev.filter(x => x !== f))}><X className="h-2.5 w-2.5" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <Button onClick={handleSend} disabled={send.isPending || uploading} className="gap-2">
            {(send.isPending || uploading) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {uploading ? "Uploading…" : send.isPending ? "Sending…" : `Send to ${recipientCount} recipient(s)`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------- SENT --------------------------------- */

function SentTab({ mailboxId }: { mailboxId?: string }) {
  const { data: campaigns = [], isLoading } = useHrMailCampaigns(mailboxId);
  const [open, setOpen] = useState<HrMailCampaign | null>(null);

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : campaigns.length === 0 ? (
          <EmptyState icon={Mail} title="Nothing sent yet" description="Sent HR mail will appear here." />
        ) : (
          <div className="divide-y divide-border">
            {campaigns.map(c => (
              <button key={c.id} onClick={() => setOpen(c)} className="w-full text-left px-4 py-3 hover:bg-muted/50">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground truncate">{c.subject}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {format(new Date(c.created_at), "dd MMM yyyy HH:mm")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-success" /> {c.sent_count} sent</span>
                  {c.failed_count > 0 && (
                    <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" /> {c.failed_count} failed</span>
                  )}
                  <span>· {c.total_count} recipients</span>
                  <span>· from {c.from_address}</span>
                  {c.sent_by_name && <span>· by {c.sent_by_name}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
      <CampaignDialog campaign={open} onClose={() => setOpen(null)} />
    </Card>
  );
}

function CampaignDialog({ campaign, onClose }: { campaign: HrMailCampaign | null; onClose: () => void }) {
  const { data: recipients = [] } = useHrMailRecipients(campaign?.id);
  const send = useSendHrMail();

  return (
    <Dialog open={!!campaign} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">{campaign?.subject}</DialogTitle>
          <DialogDescription>
            {campaign?.sent_count} sent · {campaign?.failed_count} failed · {campaign?.total_count} total
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[380px] rounded-md border border-border">
          {recipients.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border last:border-0">
              <div className="min-w-0">
                <div className="text-sm truncate text-foreground">{r.employee_name || r.email}</div>
                <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                {r.error_message && <div className="text-[11px] text-destructive truncate">{r.error_message}</div>}
              </div>
              <Badge variant="outline" className={`text-[10px] ${r.status === "sent" ? "text-success border-success/30" : r.status === "failed" ? "text-destructive border-destructive/30" : ""}`}>
                {r.status}
              </Badge>
            </div>
          ))}
        </ScrollArea>
        <DialogFooter>
          {!!campaign?.failed_count && (
            <Button
              variant="outline"
              disabled={send.isPending}
              onClick={() => send.mutate({ action: "resend_failed", campaignId: campaign.id }, {
                onSuccess: (res: any) => toast({ title: "Retry finished", description: `${res.sentThisRun} sent, ${res.failedThisRun} failed` }),
                onError: (e: any) => toast({ title: "Retry failed", description: e.message, variant: "destructive" }),
              })}
            >
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-1">Resend failed only</span>
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- TEMPLATES ------------------------------- */

function TemplatesTab() {
  const { data: templates = [], save, remove } = useHrMailTemplates();
  const [editing, setEditing] = useState<{ id?: string; name: string; subject: string; body_html: string } | null>(null);

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm">Saved templates</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setEditing({ name: "", subject: "", body_html: "" })}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New template
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {templates.length === 0 ? (
          <EmptyState icon={FileText} title="No templates yet" description="Save reusable HR mail templates here." />
        ) : (
          <div className="divide-y divide-border">
            {templates.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-2 px-4 py-3">
                <button className="text-left min-w-0" onClick={() => setEditing({ ...t })}>
                  <div className="text-sm font-medium text-foreground truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{t.subject}</div>
                </button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(t.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-base">{editing?.id ? "Edit template" : "New template"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input value={editing?.name || ""} onChange={e => setEditing(p => p && { ...p, name: e.target.value })} className="h-9 text-foreground" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Subject</Label>
              <Input value={editing?.subject || ""} onChange={e => setEditing(p => p && { ...p, subject: e.target.value })} className="h-9 text-foreground" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Body</Label>
              <Textarea rows={10} value={editing?.body_html || ""} onChange={e => setEditing(p => p && { ...p, body_html: e.target.value })} className="text-foreground" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              disabled={!editing?.name?.trim() || save.isPending}
              onClick={() => editing && save.mutate(editing, {
                onSuccess: () => { toast({ title: "Template saved" }); setEditing(null); },
                onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
              })}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
