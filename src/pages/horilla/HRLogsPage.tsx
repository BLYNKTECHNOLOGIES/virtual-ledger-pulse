import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Search, Mail, Bell, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { usersDirectory } from "@/lib/usersDirectory";

export default function HRLogsPage() {
  const [tab, setTab] = useState("emails");
  const [search, setSearch] = useState("");

  const [emailStatus, setEmailStatus] = useState("all");
  const [emailPage, setEmailPage] = useState(0);
  const PAGE = 100;
  const term = search.trim().replace(/[%,()*]/g, " ").trim();
  const { data: emailRes, isLoading: emailLoading } = useQuery({
    queryKey: ["hr_email_send_log", term, emailStatus, emailPage],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = (supabase as any).from("hr_email_send_log").select("*", { count: "exact" })
        .order("created_at", { ascending: false }).order("id", { ascending: false });
      if (emailStatus !== "all") q = q.eq("status", emailStatus);
      if (term) q = q.or(`recipient_email.ilike.%${term}%,subject.ilike.%${term}%,template_name.ilike.%${term}%`);
      const { data, error, count } = await q.range(emailPage * PAGE, emailPage * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: data || [], count: count ?? 0 };
    },
  });
  const emailLogs: any[] = emailRes?.rows ?? [];
  const emailCount = emailRes?.count ?? 0;
  const emailPages = Math.max(1, Math.ceil(emailCount / PAGE));

  // In-app notices live in hr_notifications (hr_notification_log is unused).
  const [notifType, setNotifType] = useState("all");
  const [notifPage, setNotifPage] = useState(0);
  const { data: notifTypes = [] } = useQuery({
    queryKey: ["hr_notification_type_counts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("hr_notification_type_counts");
      if (error) throw error;
      return (data || []) as { type: string; n: number }[];
    },
  });
  const { data: notifRes, isLoading: notifLoading, error: notifError } = useQuery({
    queryKey: ["hr_notifications_log", term, notifType, notifPage],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = (supabase as any).from("hr_notifications")
        .select("id, created_at, user_id, employee_id, type, title, message, is_read, hr_employees(first_name, last_name)", { count: "exact" })
        .order("created_at", { ascending: false }).order("id", { ascending: false });
      if (notifType !== "all") q = q.eq("type", notifType);
      if (term) q = q.or(`title.ilike.%${term}%,message.ilike.%${term}%,type.ilike.%${term}%`);
      const { data, error, count } = await q.range(notifPage * PAGE, notifPage * PAGE + PAGE - 1);
      if (error) throw error;
      const rows: any[] = data || [];
      const ids = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean)));
      const names: Record<string, string> = {};
      if (ids.length) {
        const { data: users } = await usersDirectory().select("id, first_name, last_name, username").in("id", ids);
        (users || []).forEach((u: any) => {
          names[u.id] = `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username || "—";
        });
      }
      return { rows: rows.map(r => ({ ...r, recipient_name: names[r.user_id] || "—" })), count: count ?? 0 };
    },
  });
  const filteredNotifs: any[] = notifRes?.rows ?? [];
  const notifCount = notifRes?.count ?? 0;
  const notifPages = Math.max(1, Math.ceil(notifCount / PAGE));

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader title="HR System Logs" description="Email delivery and notification audit trail" />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search logs..." value={search} onChange={e => { setSearch(e.target.value); setEmailPage(0); setNotifPage(0); }} className="pl-9 h-9" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="emails" className="gap-1"><Mail className="h-3.5 w-3.5" /> Emails ({emailCount.toLocaleString("en-IN")})</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1"><Bell className="h-3.5 w-3.5" /> In-app ({notifCount.toLocaleString("en-IN")})</TabsTrigger>
        </TabsList>

        <TabsContent value="emails" className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={emailStatus} onValueChange={(v) => { setEmailStatus(v); setEmailPage(0); }}>
              <SelectTrigger className="h-9 w-40 text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto">
              {emailCount ? `${emailPage * PAGE + 1}–${Math.min(emailCount, (emailPage + 1) * PAGE)} of ${emailCount.toLocaleString("en-IN")}` : "0 emails"}
            </span>
            <Button size="sm" variant="outline" className="h-8" disabled={emailPage === 0} onClick={() => setEmailPage(p => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" className="h-8" disabled={emailPage + 1 >= emailPages} onClick={() => setEmailPage(p => p + 1)}>Next</Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    {["Time", "Recipient", "Subject", "Template", "Status", "Error"].map(h => (
                      <TableHead key={h} className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emailLoading ? (
                    <TableRow><TableCell colSpan={6} className="p-4"><TableSkeleton rows={5} columns={6} /></TableCell></TableRow>
                  ) : filteredEmails.length === 0 ? (
                    <TableRow><TableCell colSpan={6}><EmptyState icon={Mail} title="No email logs found" /></TableCell></TableRow>
                  ) : filteredEmails.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs tabular-nums">{format(new Date(e.created_at), "dd MMM HH:mm")}</TableCell>
                      <TableCell className="text-sm">{e.recipient_email}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{e.subject || "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{e.template_name}</Badge></TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${e.status === "sent" ? "bg-success/10 text-success border-success/20" : e.status === "failed" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-warning/10 text-warning border-warning/20"}`}>
                          {e.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-destructive max-w-[150px] truncate">{e.error_message || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={notifType} onValueChange={(v) => { setNotifType(v); setNotifPage(0); }}>
              <SelectTrigger className="h-9 w-56 text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {notifTypes.map(t => <SelectItem key={t.type} value={t.type}>{t.type} ({Number(t.n).toLocaleString("en-IN")})</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto">
              {notifCount ? `${notifPage * PAGE + 1}–${Math.min(notifCount, (notifPage + 1) * PAGE)} of ${notifCount.toLocaleString("en-IN")}` : "0 notices"}
            </span>
            <Button size="sm" variant="outline" className="h-8" disabled={notifPage === 0} onClick={() => setNotifPage(p => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" className="h-8" disabled={notifPage + 1 >= notifPages} onClick={() => setNotifPage(p => p + 1)}>Next</Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    {["Time", "To", "About", "Type", "Title", "Message", "Read"].map(h => (
                      <TableHead key={h} className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifLoading ? (
                    <TableRow><TableCell colSpan={7} className="p-4"><TableSkeleton rows={5} columns={7} /></TableCell></TableRow>
                  ) : notifError ? (
                    <TableRow><TableCell colSpan={7} className="text-sm text-destructive p-4">Could not load notices: {(notifError as any)?.message}</TableCell></TableRow>
                  ) : filteredNotifs.length === 0 ? (
                    <TableRow><TableCell colSpan={7}><EmptyState icon={Bell} title="No in-app notices found" /></TableCell></TableRow>
                  ) : filteredNotifs.map((n: any) => (
                    <TableRow key={n.id}>
                      <TableCell className="text-xs tabular-nums">{n.created_at ? format(new Date(n.created_at), "dd MMM HH:mm") : "—"}</TableCell>
                      <TableCell className="text-sm">{n.recipient_name}</TableCell>
                      <TableCell className="text-sm">{n.hr_employees ? `${n.hr_employees.first_name || ""} ${n.hr_employees.last_name || ""}`.trim() || "—" : "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{n.type}</Badge></TableCell>
                      <TableCell className="text-sm font-medium">{n.title}</TableCell>
                      <TableCell className="text-sm max-w-[240px] truncate" title={n.message || ""}>{n.message || "—"}</TableCell>
                      <TableCell>{n.is_read ? <CheckCircle2 className="h-4 w-4 text-success" aria-label="Read" /> : <span className="text-muted-foreground text-xs">Unread</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
