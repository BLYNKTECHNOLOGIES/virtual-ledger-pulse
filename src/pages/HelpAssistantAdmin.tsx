import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Upload, FileText, RefreshCw, Loader2, ArrowLeft, Download, FileSearch, Scissors, Sparkles, Database, CheckCircle2, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { PermissionGate } from "@/components/PermissionGate";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function HelpAssistantAdmin() {
  return (
    <PermissionGate permissions={["help_assistant_manage"]}>
      <AdminInner />
    </PermissionGate>
  );
}

function AdminInner() {
  const navigate = useNavigate();
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/help-assistant")}><ArrowLeft className="h-4 w-4" /> Back</Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Help Assistant — Knowledge Base</h1>
          <p className="text-sm text-muted-foreground">Curate FAQs and upload SOPs that the AI uses to answer staff questions.</p>
        </div>
      </div>
      <Tabs defaultValue="faqs">
        <TabsList>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        <TabsContent value="faqs" className="mt-4"><FaqsTab /></TabsContent>
        <TabsContent value="documents" className="mt-4"><DocsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function FaqsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [cat, setCat] = useState("");

  const { data: faqs = [] } = useQuery({
    queryKey: ["kb-faqs-admin"],
    queryFn: async () => {
      const { data } = await supabase.from("kb_faqs").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("No user");
      const { data, error } = await supabase.from("kb_faqs").insert({
        question: q, answer: a, category: cat || null, created_by: user.id,
      }).select("id").single();
      if (error) throw error;
      await supabase.functions.invoke("kb-embed", { body: { type: "faq", id: data.id } });
    },
    onSuccess: () => {
      toast({ title: "FAQ added & embedded" });
      setQ(""); setA(""); setCat(""); setAdding(false);
      qc.invalidateQueries({ queryKey: ["kb-faqs-admin"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("kb_faqs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kb-faqs-admin"] }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Curated FAQs ({faqs.length})</CardTitle>
          <Button onClick={() => setAdding((v) => !v)}><Plus className="h-4 w-4" /> Add FAQ</Button>
        </CardHeader>
        {adding && (
          <CardContent className="space-y-3 border-t border-border pt-4">
            <Input placeholder="Question" value={q} onChange={(e) => setQ(e.target.value)} className="text-foreground" />
            <Textarea placeholder="Answer (markdown supported)" value={a} onChange={(e) => setA(e.target.value)} rows={5} className="text-foreground" />
            <Input placeholder="Category (optional)" value={cat} onChange={(e) => setCat(e.target.value)} className="text-foreground" />
            <div className="flex gap-2">
              <Button onClick={() => create.mutate()} disabled={!q || !a || create.isPending}>
                {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save & Embed
              </Button>
              <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="space-y-2">
        {faqs.map((f: any) => (
          <Card key={f.id}>
            <CardContent className="p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-foreground">{f.question}</h3>
                  {f.category && <Badge variant="outline">{f.category}</Badge>}
                  <Badge variant={f.embedding ? "default" : "secondary"}>{f.embedding ? "indexed" : "pending"}</Badge>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">{f.answer}</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="icon"><Trash2 className="h-4 w-4" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete FAQ?</AlertDialogTitle>
                    <AlertDialogDescription>This permanently removes the entry from the knowledge base.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => del.mutate(f.id)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function DocsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const { data: docs = [] } = useQuery({
    queryKey: ["kb-docs-admin"],
    queryFn: async () => {
      const { data } = await supabase.from("kb_documents").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
    refetchInterval: 8000,
  });

  const handleUpload = async (file: File) => {
    if (!user?.id) return;
    setUploading(true);
    try {
      const path = `${user.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("kb-documents").upload(path, file);
      if (upErr) throw upErr;
      const { data: doc, error: insErr } = await supabase.from("kb_documents").insert({
        title: file.name, file_path: path, file_type: file.type || "application/octet-stream",
        file_size_bytes: file.size, uploaded_by: user.id,
      }).select("id").single();
      if (insErr) throw insErr;
      supabase.functions.invoke("kb-ingest-document", { body: { documentId: doc.id } });
      toast({ title: "Uploaded", description: "Indexing in background…" });
      qc.invalidateQueries({ queryKey: ["kb-docs-admin"] });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  const reindex = async (id: string) => {
    await supabase.from("kb_documents").update({ status: "processing" }).eq("id", id);
    supabase.functions.invoke("kb-ingest-document", { body: { documentId: id } });
    toast({ title: "Re-indexing…" });
    qc.invalidateQueries({ queryKey: ["kb-docs-admin"] });
  };

  const del = async (id: string, path: string) => {
    await supabase.storage.from("kb-documents").remove([path]);
    await supabase.from("kb_documents").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["kb-docs-admin"] });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>SOP Documents ({docs.length})</CardTitle>
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept=".pdf,.docx,.txt,.md,.csv" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
            <span className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
            </span>
          </label>
        </CardHeader>
      </Card>
      <div className="space-y-2">
        {docs.map((d: any) => (
          <Card key={d.id}>
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{d.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={d.status === "ready" ? "default" : d.status === "failed" ? "destructive" : "secondary"}>{d.status}</Badge>
                    <span className="text-xs text-muted-foreground">{Math.round((d.file_size_bytes ?? 0) / 1024)} KB</span>
                    {d.error_message && <span className="text-xs text-destructive truncate">{d.error_message}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => reindex(d.id)}><RefreshCw className="h-4 w-4" /></Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="icon"><Trash2 className="h-4 w-4" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete document?</AlertDialogTitle>
                      <AlertDialogDescription>This removes the file and all indexed chunks.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => del(d.id, d.file_path)}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
