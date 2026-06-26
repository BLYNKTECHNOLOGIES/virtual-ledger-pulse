import { useState } from "react";
import { useFileDropzone } from "@/hooks/useFileDropzone";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Paperclip, FileText, Loader2, Send } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  useClientRARemarks,
  useAddRARemark,
  getRemarkFileUrl,
  CONTACT_OUTCOMES,
} from "@/hooks/useRA";

interface RARemarkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  assignmentId?: string | null;
  readOnly?: boolean;
}

const outcomeColor: Record<string, string> = {
  Connected: "bg-green-100 text-green-800",
  "No Answer": "bg-yellow-100 text-yellow-800",
  "Callback Requested": "bg-blue-100 text-blue-800",
  "Not Interested": "bg-red-100 text-red-800",
  "Wrong Number": "bg-gray-100 text-gray-800",
  Other: "bg-gray-100 text-gray-800",
};

export function RARemarkDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  assignmentId,
  readOnly = false,
}: RARemarkDialogProps) {
  const { data: remarks, isLoading } = useClientRARemarks(open ? clientId : null);
  const addRemark = useAddRARemark();
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<string>("Connected");
  const [file, setFile] = useState<File | null>(null);

  const { isDragActive: isFileDragActive, dropzoneProps: fileDropzoneProps } = useFileDropzone({
    onFiles: (files) => setFile(files[0] ?? null),
    disabled: addRemark.isPending,
    multiple: false,
  });

  const handleSubmit = async () => {
    if (!text.trim()) {
      toast.error("Please enter a remark.");
      return;
    }
    try {
      await addRemark.mutateAsync({
        clientId,
        assignmentId,
        remark: text.trim(),
        contactOutcome: outcome,
        file,
      });
      toast.success("Remark added.");
      setText("");
      setFile(null);
      setOutcome("Connected");
    } catch (e: any) {
      toast.error(e.message || "Failed to add remark.");
    }
  };

  const openFile = async (path: string) => {
    const url = await getRemarkFileUrl(path);
    if (url) window.open(url, "_blank");
    else toast.error("Could not open attachment.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conversation Log — {clientName}</DialogTitle>
        </DialogHeader>

        {!readOnly && (
          <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-3">
              <div className="space-y-1">
                <Label>New Remark</Label>
                <Textarea
                  placeholder="Type the details of your conversation..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="text-foreground"
                  rows={3}
                />
              </div>
              <div className="space-y-1">
                <Label>Outcome</Label>
                <Select value={outcome} onValueChange={setOutcome}>
                  <SelectTrigger className="text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_OUTCOMES.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label
                className={cn(
                  "flex items-center gap-2 text-sm text-muted-foreground cursor-pointer rounded px-1 transition-colors",
                  isFileDragActive && "text-primary bg-primary/10"
                )}
                {...fileDropzoneProps}
              >
                <Paperclip className="h-4 w-4" />
                {file ? file.name : "Attach file (optional)"}
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <Button onClick={handleSubmit} disabled={addRemark.isPending} size="sm">
                {addRemark.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Save Remark
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {!isLoading && (!remarks || remarks.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No remarks logged yet.
            </p>
          )}
          {remarks?.map((r) => (
            <div key={r.id} className="border rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{r.ra_name || "RA"}</span>
                  {r.contact_outcome && (
                    <Badge className={outcomeColor[r.contact_outcome] || "bg-gray-100 text-gray-800"}>
                      {r.contact_outcome}
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(r.created_at), "dd MMM yyyy, HH:mm")}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{r.remark}</p>
              {r.file_url && (
                <button
                  onClick={() => openFile(r.file_url!)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <FileText className="h-3 w-3" />
                  {r.file_name || "Attachment"}
                </button>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
