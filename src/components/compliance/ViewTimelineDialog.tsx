import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, FileText, Download, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface TimelineUpdate {
  id: string;
  update_text: string;
  created_at: string;
  created_by: string;
  attachment_urls: string[] | null;
}

interface ViewTimelineDialogProps {
  caseId: string;
  caseType: 'bank_case' | 'lien_case';
}

export function ViewTimelineDialog({ caseId, caseType }: ViewTimelineDialogProps) {
  const [open, setOpen] = useState(false);
  const [updates, setUpdates] = useState<TimelineUpdate[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUpdates = async () => {
    if (!open) return;
    setLoading(true);
    try {
      if (caseType === 'lien_case') {
        const { data, error } = await supabase
          .from('lien_updates')
          .select('id, update_text, created_at, created_by, attachment_urls')
          .eq('lien_case_id', caseId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setUpdates(data || []);
      } else {
        // For bank cases, show the linked account investigation timeline.
        const { data: investigation, error: investigationError } = await supabase
          .from('account_investigations')
          .select('id')
          .eq('bank_case_id', caseId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (investigationError) throw investigationError;

        if (!investigation) {
          setUpdates([]);
          return;
        }

        const { data, error } = await supabase
          .from('investigation_updates')
          .select('id, update_text, created_at, created_by, attachment_urls')
          .eq('investigation_id', investigation.id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setUpdates(data || []);
      }
    } catch (error) {
      console.error('Error fetching updates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDocument = async (fileUrl: string) => {
    try {
      if (fileUrl.startsWith('http')) {
        window.open(fileUrl, '_blank');
        return;
      }
      const { data, error } = await supabase.storage
        .from('kyc-documents')
        .createSignedUrl(fileUrl, 3600);
      if (error) throw error;
      if (data.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error) {
      console.error('Error viewing document:', error);
    }
  };

  const handleDownloadDocument = async (fileUrl: string) => {
    try {
      if (fileUrl.startsWith('http')) {
        const fileName = fileUrl.split('/').pop() || 'document';
        const response = await fetch(fileUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }
      const { data, error } = await supabase.storage
        .from('kyc-documents')
        .download(fileUrl);
      if (error) throw error;
      const fileName = fileUrl.split('/').pop() || 'document';
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading document:', error);
    }
  };

  useEffect(() => {
    fetchUpdates();
  }, [open, caseId, caseType]);

  const title = caseType === 'lien_case' ? 'Lien Case Timeline' : 'Case Timeline';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Clock className="h-4 w-4 mr-1" />
          View Timeline
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[600px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-md skeleton-shimmer" />
              ))}
            </div>
          ) : updates.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <FileText className="h-8 w-8 opacity-40" />
              <p className="text-sm text-muted-foreground">No updates found</p>
            </div>
          ) : (
            updates.map((update) => (
              <div key={update.id} className="border-l-2 border-info/20 pl-4 pb-4 relative">
                <div className="absolute -left-2 top-0 w-4 h-4 bg-info rounded-full"></div>
                <div className="bg-muted/50 p-3 rounded-md">
                  <div className="text-sm text-muted-foreground mb-1">
                    {format(new Date(update.created_at), 'PPpp')} - {update.created_by}
                  </div>
                  <div className="text-foreground mb-2">{update.update_text}</div>
                  {update.attachment_urls && update.attachment_urls.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="text-sm font-medium text-foreground">Attachments:</div>
                      <div className="space-y-1">
                        {update.attachment_urls.map((url, urlIndex) => {
                          const fileName = url.split('/').pop() || `Document ${urlIndex + 1}`;
                          const isPdf = fileName.toLowerCase().endsWith('.pdf');
                          return (
                            <div key={urlIndex} className="flex items-center gap-2 p-2 bg-card rounded border">
                              <FileText className="h-4 w-4 text-destructive" />
                              <span className="text-sm flex-1 truncate">{fileName}</span>
                              <div className="flex gap-1">
                                {isPdf && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2"
                                    onClick={() => handleViewDocument(url)}
                                  >
                                    <Eye className="h-3 w-3 mr-1" />
                                    View
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2"
                                  onClick={() => handleDownloadDocument(url)}
                                >
                                  <Download className="h-3 w-3 mr-1" />
                                  Download
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
