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
import { Plus, Search, MessageSquare, CheckCircle, XCircle, Clock } from "lucide-react";

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

  const priorityColor = (p: string) => p === "high" ? "bg-red-100 text-red-700" : p === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700";
  const statusColor = (s: string) => s === "open" ? "bg-blue-100 text-blue-700" : s === "in_progress" ? "bg-yellow-100 text-yellow-700" : s === "resolved" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Helpdesk</h1><p className="text-sm text-gray-500">Manage support tickets</p></div>
        <Button onClick={() => setShowDialog(true)} className="bg-[#E8604C] hover:bg-[#d4553f]"><Plus className="h-4 w-4 mr-2" /> New Ticket</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[{ label: "Open", value: stats.open, icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-50" }, { label: "In Progress", value: stats.in_progress, icon: Clock, color: "text-yellow-600", bg: "bg-yellow-50" }, { label: "Resolved", value: stats.resolved, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" }].map(s => (
          <Card key={s.label}><CardContent className="p-4 flex items-center gap-3"><div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div><div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-gray-500">{s.label}</p></div></CardContent></Card>
        ))}
      </div>
      <div className="flex gap-3">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><Input placeholder="Search tickets..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="resolved">Resolved</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent></Select>
      </div>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr>{["Title", "Category", "Priority", "Status", "Created", "Actions"].map(h => <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>)}</tr></thead>
        <tbody>{isLoading ? <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading...</td></tr> : filtered.length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-gray-400">No tickets</td></tr> : filtered.map((t: any) => (
          <tr key={t.id} className="border-b hover:bg-gray-50">
            <td className="px-4 py-3 font-medium">{t.title}</td>
            <td className="px-4 py-3 text-gray-500 capitalize">{t.category}</td>
            <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColor(t.priority)}`}>{t.priority}</span></td>
            <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(t.status)}`}>{t.status}</span></td>
            <td className="px-4 py-3 text-xs text-gray-500">{new Date(t.created_at).toLocaleDateString()}</td>
            <td className="px-4 py-3"><div className="flex gap-1">
              {t.status === "open" && <Button size="sm" variant="ghost" className="text-yellow-600 h-7" onClick={() => statusMutation.mutate({ id: t.id, status: "in_progress" })}><Clock className="h-4 w-4" /></Button>}
              {(t.status === "open" || t.status === "in_progress") && <Button size="sm" variant="ghost" className="text-green-600 h-7" onClick={() => statusMutation.mutate({ id: t.id, status: "resolved" })}><CheckCircle className="h-4 w-4" /></Button>}
            </div></td>
          </tr>
        ))}</tbody></table>
      </CardContent></Card>
      <Dialog open={showDialog} onOpenChange={setShowDialog}><DialogContent><DialogHeader><DialogTitle>New Ticket</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Describe the issue" /></div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Category</Label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general">General</SelectItem><SelectItem value="it">IT</SelectItem><SelectItem value="hr">HR</SelectItem><SelectItem value="payroll">Payroll</SelectItem><SelectItem value="leave">Leave</SelectItem></SelectContent></Select></div>
            <div><Label>Priority</Label><Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button><Button onClick={() => createMutation.mutate()} disabled={!form.title} className="bg-[#E8604C] hover:bg-[#d4553f]">Submit</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
}
