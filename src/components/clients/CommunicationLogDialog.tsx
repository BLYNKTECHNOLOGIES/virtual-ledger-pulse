import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Plus, Phone, Mail, Video, Users } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface CommunicationLogDialogProps {
  clientId: string;
}

const typeIcons: Record<string, React.ReactNode> = {
  call: <Phone className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  meeting: <Users className="h-3.5 w-3.5" />,
  video_call: <Video className="h-3.5 w-3.5" />,
  note: <MessageCircle className="h-3.5 w-3.5" />,
};

const typeColors: Record<string, string> = {
  call: "bg-blue-100 text-blue-800",
  email: "bg-green-100 text-green-800",
  meeting: "bg-purple-100 text-purple-800",
  video_call: "bg-orange-100 text-orange-800",
  note: "bg-gray-100 text-gray-800",
};

export function CommunicationLogDialog({ clientId }: CommunicationLogDialogProps) {
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState("note");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const queryClient = useQueryClient();

  const { data: logs, isLoading } = useQuery({
    queryKey: ['client-communication-logs', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_communication_logs' as any)
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: open && !!clientId,
  });

  const addLog = useMutation({
    mutationFn: async () => {
      if (!content.trim()) throw new Error("Content is required");
      
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('client_communication_logs' as any)
        .insert({
          client_id: clientId,
          communication_type: type,
          subject: subject.trim() || null,
          content: content.trim(),
          logged_by: userData?.user?.email || 'Unknown',
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-communication-logs', clientId] });
      toast.success("Communication log added");
      setShowForm(false);
      setType("note");
      setSubject("");
      setContent("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Communication Log
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Communication Log
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3">
          {!showForm && (
            <Button size="sm" onClick={() => setShowForm(true)} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> Add Entry
            </Button>
          )}

          {showForm && (
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Phone Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="video_call">Video Call</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Subject (optional)" value={subject} onChange={e => setSubject(e.target.value)} />
              <Textarea placeholder="Details *" value={content} onChange={e => setContent(e.target.value)} rows={3} />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button size="sm" onClick={() => addLog.mutate()} disabled={addLog.isPending || !content.trim()}>
                  {addLog.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          )}

          {isLoading && <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>}

          {!isLoading && (!logs || logs.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">No communication logs yet.</p>
          )}

          {logs?.map((log: any) => (
            <div key={log.id} className="border rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={typeColors[log.communication_type] || typeColors.note}>
                    <span className="flex items-center gap-1">
                      {typeIcons[log.communication_type] || typeIcons.note}
                      {log.communication_type.replace('_', ' ')}
                    </span>
                  </Badge>
                  {log.subject && <span className="text-sm font-medium">{log.subject}</span>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(log.created_at), 'dd MMM yyyy, HH:mm')}
                </span>
              </div>
              <p className="text-sm">{log.content}</p>
              <p className="text-xs text-muted-foreground">by {log.logged_by}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
