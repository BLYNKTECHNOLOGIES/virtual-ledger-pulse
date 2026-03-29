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

export default function HRLogsPage() {
  const [tab, setTab] = useState("emails");
  const [search, setSearch] = useState("");

  const { data: emailLogs = [], isLoading: emailLoading } = useQuery({
    queryKey: ["hr_email_send_log"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_email_send_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      return data || [];
    },
  });

  const { data: notifLogs = [], isLoading: notifLoading } = useQuery({
    queryKey: ["hr_notification_log"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_notification_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
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
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">HR System Logs</h1>
        <p className="text-sm text-muted-foreground">Email delivery and notification audit trail</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search logs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
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
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emailLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : filteredEmails.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No email logs found</TableCell></TableRow>
                  ) : filteredEmails.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{format(new Date(e.created_at), "dd MMM HH:mm")}</TableCell>
                      <TableCell className="text-sm">{e.recipient_email}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{e.subject || "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{e.template_name}</Badge></TableCell>
                      <TableCell>
                        <Badge className={e.status === "sent" ? "bg-green-100 text-green-800" : e.status === "failed" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}>
                          {e.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-red-500 max-w-[150px] truncate">{e.error_message || "—"}</TableCell>
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
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Read</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : filteredNotifs.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No notification logs found</TableCell></TableRow>
                  ) : filteredNotifs.map((n: any) => (
                    <TableRow key={n.id}>
                      <TableCell className="text-xs">{n.created_at ? format(new Date(n.created_at), "dd MMM HH:mm") : "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{n.notification_type}</Badge></TableCell>
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
