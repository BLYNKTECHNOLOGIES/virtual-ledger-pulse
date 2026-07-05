import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Search, Mail, Bell } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";

export default function HRLogsPage() {
  const [tab, setTab] = useState("emails");
  const [search, setSearch] = useState("");

  const { data: emailLogs = [], isLoading: emailLoading } = useQuery({
    queryKey: ["hr_email_send_log"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_email_send_log").select("*").order("created_at", { ascending: false }).limit(200);
      return data || [];
    },
  });

  const { data: notifLogs = [], isLoading: notifLoading } = useQuery({
    queryKey: ["hr_notification_log"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_notification_log").select("*").order("created_at", { ascending: false }).limit(200);
      return data || [];
    },
  });

  const filteredEmails = emailLogs.filter((e: any) =>
    !search || e.recipient_email?.toLowerCase().includes(search.toLowerCase()) ||
    e.subject?.toLowerCase().includes(search.toLowerCase()) ||
    e.template_name?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredNotifs = notifLogs.filter((n: any) =>
    !search || n.title?.toLowerCase().includes(search.toLowerCase()) ||
    n.message?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader title="HR System Logs" description="Email delivery and notification audit trail" />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search logs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="emails" className="gap-1"><Mail className="h-3.5 w-3.5" /> Emails ({emailLogs.length})</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1"><Bell className="h-3.5 w-3.5" /> Notifications ({notifLogs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="emails">
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

        <TabsContent value="notifications">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    {["Time", "Type", "Title", "Message", "Channel", "Read"].map(h => (
                      <TableHead key={h} className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifLoading ? (
                    <TableRow><TableCell colSpan={6} className="p-4"><TableSkeleton rows={5} columns={6} /></TableCell></TableRow>
                  ) : filteredNotifs.length === 0 ? (
                    <TableRow><TableCell colSpan={6}><EmptyState icon={Bell} title="No notification logs found" /></TableCell></TableRow>
                  ) : filteredNotifs.map((n: any) => (
                    <TableRow key={n.id}>
                      <TableCell className="text-xs tabular-nums">{n.created_at ? format(new Date(n.created_at), "dd MMM HH:mm") : "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{n.notification_type}</Badge></TableCell>
                      <TableCell className="text-sm font-medium">{n.title}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{n.message || "—"}</TableCell>
                      <TableCell className="text-xs">{n.channel || "in-app"}</TableCell>
                      <TableCell>{n.is_read ? "✓" : "—"}</TableCell>
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
