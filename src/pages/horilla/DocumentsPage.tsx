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
import { Plus, Search, FileText, Trash2 } from "lucide-react";

export default function DocumentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "general", file_path: "", file_type: "pdf" });

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["hr_documents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("documents").insert({
        title: form.title,
        description: form.description || null,
        category: form.category,
        file_path: form.file_path || "/documents/placeholder",
        file_type: form.file_type,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr_documents"] }); setShowDialog(false); setForm({ title: "", description: "", category: "general", file_path: "", file_type: "pdf" }); toast.success("Document added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("documents").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr_documents"] }); toast.success("Deleted"); },
  });

  const filtered = docs.filter((d: any) => d.title?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Documents</h1><p className="text-sm text-gray-500">Company documents and policies</p></div>
        <Button onClick={() => setShowDialog(true)} className="bg-[#E8604C] hover:bg-[#d4553f]"><Plus className="h-4 w-4 mr-2" /> Add Document</Button>
      </div>
      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><Input placeholder="Search documents..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? <p className="col-span-3 text-center text-gray-400 py-12">Loading...</p> : filtered.length === 0 ? <p className="col-span-3 text-center text-gray-400 py-12">No documents</p> : filtered.map((d: any) => (
          <Card key={d.id}>
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-[#E8604C]/10 rounded-lg shrink-0"><FileText className="h-5 w-5 text-[#E8604C]" /></div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{d.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{d.category} • {d.file_type?.toUpperCase()}</p>
                  {d.description && <p className="text-xs text-gray-400 mt-2 line-clamp-2">{d.description}</p>}
                  <p className="text-[10px] text-gray-400 mt-2">{new Date(d.created_at).toLocaleDateString()}</p>
                </div>
                <Button size="sm" variant="ghost" className="text-red-600 shrink-0" onClick={() => deleteMutation.mutate(d.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={showDialog} onOpenChange={setShowDialog}><DialogContent><DialogHeader><DialogTitle>Add Document</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Document title" /></div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Category</Label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general">General</SelectItem><SelectItem value="policy">Policy</SelectItem><SelectItem value="template">Template</SelectItem><SelectItem value="contract">Contract</SelectItem></SelectContent></Select></div>
            <div><Label>File Type</Label><Select value={form.file_type} onValueChange={(v) => setForm({ ...form, file_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pdf">PDF</SelectItem><SelectItem value="doc">DOC</SelectItem><SelectItem value="xlsx">XLSX</SelectItem><SelectItem value="pptx">PPTX</SelectItem></SelectContent></Select></div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button><Button onClick={() => createMutation.mutate()} disabled={!form.title} className="bg-[#E8604C] hover:bg-[#d4553f]">Save</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
}
