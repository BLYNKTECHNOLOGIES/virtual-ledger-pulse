import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { CalendarX, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

interface Props {
  search?: string;
}

export function AttendanceNoticeLogPanel({ search = "" }: Props) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["hr_attendance_notice_log"],
    queryFn: async () => {
      const { data: logs } = await (supabase as any)
        .from("hr_attendance_notice_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      const list = logs || [];
      const ids = [...new Set(list.map((r: any) => r.employee_id))];
      let names = new Map<string, string>();
      if (ids.length) {
        const { data: emps } = await (supabase as any)
          .from("hr_employees")
          .select("id, first_name, last_name")
          .in("id", ids);
        names = new Map((emps || []).map((e: any) => [e.id, [e.first_name, e.last_name].filter(Boolean).join(" ")]));
      }
      return list.map((r: any) => ({ ...r, employee_name: names.get(r.employee_id) || "—" }));
    },
  });

  const filtered = rows.filter((r: any) =>
    !search ||
    r.employee_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.email?.toLowerCase().includes(search.toLowerCase()) ||
    r.attendance_date?.includes(search)
  );

  const resend = async (id: string) => {
    setBusyId(id);
    const { data, error } = await supabase.functions.invoke("hr-attendance-exception-notify", {
      body: { action: "resend", logId: id },
    });
    setBusyId(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Resend failed");
      return;
    }
    toast.success("Notice resent");
    qc.invalidateQueries({ queryKey: ["hr_attendance_notice_log"] });
  };

  const runSweep = async () => {
    setSweeping(true);
    const { data, error } = await supabase.functions.invoke("hr-attendance-exception-notify", {
      body: { action: "run" },
    });
    setSweeping(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Sweep failed");
      return;
    }
    const d: any = data;
    toast.success(`Sweep done — ${d.sent} sent, ${d.failed} failed, ${d.skipped} skipped`);
    qc.invalidateQueries({ queryKey: ["hr_attendance_notice_log"] });
  };

  const statusBadge = (s: string) =>
    s === "sent" ? "default" : s === "failed" ? "destructive" : "secondary";

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <div className="text-sm text-muted-foreground">
            Last 50 attendance exception notices (auto-sent 24h after a day is marked absent / half day).
          </div>
          <Button size="sm" variant="outline" onClick={runSweep} disabled={sweeping} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${sweeping ? "animate-spin" : ""}`} /> Run sweep
          </Button>
        </div>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              {["Sent", "Employee", "Date", "Marked", "Email", "Result", "Error", ""].map((h) => (
                <TableHead key={h} className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="p-4"><TableSkeleton rows={5} columns={8} /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8}><EmptyState icon={CalendarX} title="No attendance notices yet" /></TableCell></TableRow>
            ) : filtered.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs tabular-nums">{r.sent_at ? format(new Date(r.sent_at), "dd MMM HH:mm") : "—"}</TableCell>
                <TableCell className="text-sm font-medium">{r.employee_name}</TableCell>
                <TableCell className="text-xs tabular-nums">{r.attendance_date}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px] capitalize">{String(r.status_at_send || "").replace("_", " ")}</Badge></TableCell>
                <TableCell className="text-xs">{r.email || "—"}</TableCell>
                <TableCell><Badge variant={statusBadge(r.status) as any} className="text-[10px]">{r.status}{r.attempts > 1 ? ` ·${r.attempts}` : ""}</Badge></TableCell>
                <TableCell className="text-xs max-w-[200px] truncate text-destructive">{r.error_message || "—"}</TableCell>
                <TableCell className="text-right">
                  {r.status !== "sent" && (
                    <Button size="sm" variant="ghost" className="gap-1 h-7" disabled={busyId === r.id} onClick={() => resend(r.id)}>
                      <Send className="h-3.5 w-3.5" /> Resend
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
