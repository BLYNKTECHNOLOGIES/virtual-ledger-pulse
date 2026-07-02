import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Send, Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";

interface OperatorNotesThreadProps {
  clientId: string;
  legacyNote?: string | null;
}

export function OperatorNotesThread({ clientId, legacyNote }: OperatorNotesThreadProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();

  const canView = hasPermission("clients_view");
  const canEdit = hasPermission("clients_manage");

  const [newNote, setNewNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<any | null>(null);

  const currentUserName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.username || user?.email || "Unknown user";

  const { data: notes = [] } = useQuery({
    queryKey: ["client_operator_notes", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_operator_notes")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId && canView,
  });

  if (!canView) return null;

  const handleAdd = async () => {
    const text = newNote.trim();
    if (!text) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from("client_operator_notes").insert({
        client_id: clientId,
        note: text,
        created_by: user?.id ?? null,
        created_by_name: currentUserName,
      });
      if (error) throw error;
      setNewNote("");
      queryClient.invalidateQueries({ queryKey: ["client_operator_notes", clientId] });
    } catch (err: any) {
      console.error("Failed to add operator note:", err);
      toast({ title: "Error", description: err?.message || "Could not add note.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!noteToDelete) return;
    try {
      const { error } = await supabase
        .from("client_operator_notes")
        .delete()
        .eq("id", noteToDelete.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["client_operator_notes", clientId] });
      setNoteToDelete(null);
    } catch (err: any) {
      console.error("Failed to delete operator note:", err);
      toast({ title: "Error", description: err?.message || "Could not delete note.", variant: "destructive" });
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Operator Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {legacyNote && (
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-sm whitespace-pre-wrap">{legacyNote}</p>
            <p className="mt-1 text-xs text-muted-foreground">Original onboarding note</p>
          </div>
        )}

        {notes.length === 0 && !legacyNote && (
          <p className="text-sm text-muted-foreground">No notes yet. Add the first note below.</p>
        )}

        {notes.length > 0 && (
          <div className="space-y-3">
            {notes.map((n: any) => (
              <div key={n.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm whitespace-pre-wrap flex-1">{n.note}</p>
                  {canEdit && (user?.id === n.created_by) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => setNoteToDelete(n)}
                      title="Delete note"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {n.created_by_name || "Unknown user"} · {formatDate(n.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="space-y-2">
            <Textarea
              placeholder="Add a note to the thread…"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={handleAdd} disabled={isSaving || !newNote.trim()}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Add Note
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!noteToDelete} onOpenChange={(o) => { if (!o) setNoteToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove your note from the thread. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
