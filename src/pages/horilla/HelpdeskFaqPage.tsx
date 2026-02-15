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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, HelpCircle } from "lucide-react";

const FAQ_CATEGORIES = ["General", "Leave", "Payroll", "IT", "HR Policy", "Benefits", "Other"];

export default function HelpdeskFaqPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", content: "", category: "General" });

  // Reuse hr_policies table for FAQ entries
  const { data: faqs = [], isLoading } = useQuery({
    queryKey: ["hr_policies_faq"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_policies").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("hr_policies").update({
          title: form.title,
          content: form.content,
          category: form.category,
        }).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hr_policies").insert({
          title: form.title,
          content: form.content,
          category: form.category,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_policies_faq"] });
      setShowDialog(false);
      setEditId(null);
      setForm({ title: "", content: "", category: "General" });
      toast.success(editId ? "FAQ updated" : "FAQ created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_policies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_policies_faq"] });
      toast.success("FAQ deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = faqs.filter((f: any) => {
    const matchesSearch = f.title?.toLowerCase().includes(search.toLowerCase()) || f.content?.toLowerCase().includes(search.toLowerCase());
    const matchesCat = categoryFilter === "all" || f.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  // Group by category
  const grouped = filtered.reduce((acc: Record<string, any[]>, f: any) => {
    const cat = f.category || "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">FAQ & Knowledge Base</h1>
          <p className="text-sm text-gray-500">Frequently asked questions and company policies</p>
        </div>
        <Button onClick={() => { setEditId(null); setForm({ title: "", content: "", category: "General" }); setShowDialog(true); }} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <Plus className="h-4 w-4 mr-2" /> Add FAQ
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search FAQs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {FAQ_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-center text-gray-400 py-12">Loading...</p>
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <HelpCircle className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">No FAQs yet. Add your first one!</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-[#E8604C]" />
              {category} ({(items as any[]).length})
            </h3>
            <Card>
              <CardContent className="p-0">
                <Accordion type="multiple">
                  {(items as any[]).map((faq: any) => (
                    <AccordionItem key={faq.id} value={faq.id} className="border-b last:border-0">
                      <div className="flex items-center">
                        <AccordionTrigger className="flex-1 px-4 py-3 text-sm font-medium text-left hover:no-underline">
                          {faq.title}
                        </AccordionTrigger>
                        <div className="flex gap-1 pr-2">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => {
                            e.stopPropagation();
                            setEditId(faq.id);
                            setForm({ title: faq.title, content: faq.content || "", category: faq.category || "General" });
                            setShowDialog(true);
                          }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate(faq.id);
                          }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <AccordionContent className="px-4 pb-4 text-sm text-gray-600 whitespace-pre-wrap">
                        {faq.content || "No content"}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </div>
        ))
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit FAQ" : "Add FAQ"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Question / Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. How do I apply for leave?" /></div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FAQ_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Answer / Content</Label><Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={5} placeholder="Detailed answer..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.title} className="bg-[#E8604C] hover:bg-[#d4553f]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
