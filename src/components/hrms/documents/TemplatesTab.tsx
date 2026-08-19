import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { FileSignature, Plus, Search, Pencil, Archive, ShieldAlert, History } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardSkeleton } from "@/components/ui/skeleton";
import TemplateEditorDialog, { type TemplateRecord } from "./TemplateEditorDialog";

export function TemplatesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<TemplateRecord | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<TemplateRecord | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["hr_doc_templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_doc_templates").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const archive = async () => {
    if (!archiveTarget) return;
    const next = archiveTarget.status === "archived" ? "active" : "archived";
    const { error } = await (supabase as any)
      .from("hr_doc_templates").update({ status: next }).eq("id", archiveTarget.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["hr_doc_templates"] });
    toast.success(next === "archived" ? "Template archived" : "Template restored");
    setArchiveTarget(null);
  };

  const filtered = templates.filter((t: any) =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search templates..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Button className="h-9" onClick={() => { setEditing(null); setEditorOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> New template
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)
        ) : filtered.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              icon={FileSignature}
              title="No templates yet"
              description="Create a letter template with {variables}, or upload one."
              action={<Button className="h-9" onClick={() => { setEditing(null); setEditorOpen(true); }}><Plus className="h-4 w-4 mr-2" />New template</Button>}
            />
          </div>
        ) : filtered.map((t: any) => (
          <Card key={t.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{t.name}</h3>
                  <p className="text-[11px] text-muted-foreground capitalize">{t.category?.replace(/_/g, " ")}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                    onClick={() => { setEditing(t); setEditorOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setArchiveTarget(t)}>
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {t.description && <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>}
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px] capitalize">{t.status}</Badge>
                <Badge variant="outline" className="text-[10px] gap-1"><History className="h-3 w-3" />{t.lane}</Badge>
                {t.contains_sensitive && (
                  <Badge variant="outline" className="text-[10px] gap-1 text-amber-500 border-amber-500/40">
                    <ShieldAlert className="h-3 w-3" /> salary
                  </Badge>
                )}
                {t.requires_approval && <Badge variant="outline" className="text-[10px]">approval</Badge>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <TemplateEditorDialog open={editorOpen} onOpenChange={setEditorOpen} template={editing} />

      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archiveTarget?.status === "archived" ? "Restore template?" : "Archive template?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Archiving hides the template from generation. Existing issued letters are unaffected — they stay
              pinned to the version they were made from.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={archive}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default TemplatesTab;
