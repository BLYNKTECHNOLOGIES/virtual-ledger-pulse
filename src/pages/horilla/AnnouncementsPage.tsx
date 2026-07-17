import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Megaphone, Pin, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export default function AnnouncementsPage() {
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", content: "", category: "general", is_pinned: false });

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ["hr_announcements"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_announcements").select("*").order("is_pinned", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await (supabase as any).from("hr_announcements").update(form).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("hr_announcements").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr_announcements"] }); setShowDialog(false); setEditId(null); setForm({ title: "", content: "", category: "general", is_pinned: false }); toast.success(editId ? "Updated" : "Published"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase as any).from("hr_announcements").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr_announcements"] }); toast.success("Deleted"); },
  });

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Announcements"
        description="Company-wide announcements and notices"
        actions={
          <Button onClick={() => { setEditId(null); setForm({ title: "", content: "", category: "general", is_pinned: false }); setShowDialog(true); }} className="bg-[#E8604C] hover:bg-[#d4553f] h-9">
            <Plus className="h-4 w-4 mr-2" /> New Announcement
          </Button>
        }
      />
      <div className="space-y-4">
        {isLoading ? (
          <p className="text-center text-muted-foreground py-12 text-sm">Loading...</p>
        ) : announcements.length === 0 ? (
          <EmptyState icon={Megaphone} title="No announcements yet" description="Publish your first company-wide announcement." action={<Button onClick={() => setShowDialog(true)} className="bg-[#E8604C] hover:bg-[#d4553f] h-9"><Plus className="h-4 w-4 mr-2" />New Announcement</Button>} />
        ) : announcements.map((a: any) => (
          <Card key={a.id} className={a.is_pinned ? "border-[#E8604C]/30 bg-[#E8604C]/5" : ""}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {a.is_pinned && <Pin className="h-3.5 w-3.5 text-[#E8604C]" />}
                    <h3 className="font-semibold text-foreground">{a.title}</h3>
                    <span className="rounded-full bg-muted border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground capitalize">{a.category}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{a.content}</p>
                  <p className="text-xs text-muted-foreground mt-3 tabular-nums">{new Date(a.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-1 shrink-0 ml-4">
                  <Button size="sm" variant="ghost" onClick={() => { setEditId(a.id); setForm({ title: a.title, content: a.content || "", category: a.category || "general", is_pinned: a.is_pinned }); setShowDialog(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDeleteId(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-sm font-semibold flex items-center gap-2"><Megaphone className="h-4 w-4 text-[#E8604C]" />{editId ? "Edit" : "New"} Announcement</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Announcement title" className="h-9 mt-1" /></div>
            <div><Label>Content</Label><Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={4} placeholder="Write your announcement..." className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general">General</SelectItem><SelectItem value="policy">Policy</SelectItem><SelectItem value="event">Event</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
              <div className="flex items-end pb-1"><div className="flex items-center gap-2"><Switch checked={form.is_pinned} onCheckedChange={(v) => setForm({ ...form, is_pinned: v })} /><Label>Pin to top</Label></div></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} className="h-9">Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.title} className="bg-[#E8604C] hover:bg-[#d4553f] h-9">Publish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
