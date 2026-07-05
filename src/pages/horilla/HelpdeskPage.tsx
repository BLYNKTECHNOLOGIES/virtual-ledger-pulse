import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Search, MessageSquare, CheckCircle, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";

export default function HelpdeskPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "general", priority: "medium" });

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["hr_helpdesk", statusFilter],
    queryFn: async () => {
      const query: any = (supabase as any).from("hr_helpdesk_tickets").select("*").order("created_at", { ascending: false });
      const { data, error } = statusFilter !== "all" ? await query.eq("status", statusFilter) : await query;
      if (error) throw error;
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("hr_helpdesk_tickets").insert(form);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr_helpdesk"] }); setShowDialog(false); setForm({ title: "", description: "", category: "general", priority: "medium" }); toast.success("Ticket created"); },
    onError: (e: any) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "resolved") updates.resolved_at = new Date().toISOString();
      const { error } = await (supabase as any).from("hr_helpdesk_tickets").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr_helpdesk"] }); toast.success("Updated"); },
  });

  const filtered = tickets.filter((t: any) => t.title?.toLowerCase().includes(search.toLowerCase()));
  const stats = { open: tickets.filter((t: any) => t.status === "open").length, in_progress: tickets.filter((t: any) => t.status === "in_progress").length, resolved: tickets.filter((t: any) => t.status === "resolved").length };

  const priorityColor = (p: string) => p === "high" ? "bg-destructive/10 text-destructive border border-destructive/20" : p === "medium" ? "bg-warning/10 text-warning border border-warning/20" : "bg-success/10 text-success border border-success/20";
  const statusColor = (s: string) => s === "open" ? "bg-info/10 text-info border border-info/20" : s === "in_progress" ? "bg-warning/10 text-warning border border-warning/20" : s === "resolved" ? "bg-success/10 text-success border border-success/20" : "bg-muted text-foreground border border-border";

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Helpdesk"
        description="Manage support tickets"
        actions={
          <Button onClick={() => setShowDialog(true)} className="bg-[#E8604C] hover:bg-[#d4553f] h-9">
            <Plus className="h-4 w-4 mr-2" /> New Ticket
          </Button>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Open", value: stats.open, icon: MessageSquare, color: "text-info", bg: "bg-info/10" },
          { label: "In Progress", value: stats.in_progress, icon: Clock, color: "text-warning", bg: "bg-warning/10" },
          { label: "Resolved", value: stats.resolved, icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-2xl font-bold tabular-nums">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search tickets..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {["Title", "Category", "Priority", "Status", "Created", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="p-4"><TableSkeleton rows={5} columns={6} /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6}>
                  <EmptyState icon={MessageSquare} title="No tickets found" description="Create a new support ticket to get help." action={<Button onClick={() => setShowDialog(true)} className="bg-[#E8604C] hover:bg-[#d4553f] h-9"><Plus className="h-4 w-4 mr-2" />New Ticket</Button>} />
                </td></tr>
              ) : filtered.map((t: any) => (
                <tr key={t.id} className="border-b hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium">{t.title}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{t.category}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityColor(t.priority)}`}>{t.priority}</span></td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor(t.status)}`}>{t.status}</span></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {t.status === "open" && <Button size="sm" variant="ghost" className="text-warning h-7" onClick={() => statusMutation.mutate({ id: t.id, status: "in_progress" })}><Clock className="h-4 w-4" /></Button>}
                      {(t.status === "open" || t.status === "in_progress") && <Button size="sm" variant="ghost" className="text-success h-7" onClick={() => statusMutation.mutate({ id: t.id, status: "resolved" })}><CheckCircle className="h-4 w-4" /></Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-sm font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-[#E8604C]" />New Ticket</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Describe the issue" className="h-9 mt-1" /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general">General</SelectItem><SelectItem value="it">IT</SelectItem><SelectItem value="hr">HR</SelectItem><SelectItem value="payroll">Payroll</SelectItem><SelectItem value="leave">Leave</SelectItem></SelectContent></Select></div>
              <div><Label>Priority</Label><Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} className="h-9">Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.title} className="bg-[#E8604C] hover:bg-[#d4553f] h-9">Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
