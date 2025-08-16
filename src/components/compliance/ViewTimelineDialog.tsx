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
  lienCaseId: string;
}

export function ViewTimelineDialog({ lienCaseId }: ViewTimelineDialogProps) {
  const [open, setOpen] = useState(false);
  const [updates, setUpdates] = useState<TimelineUpdate[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUpdates = async () => {
    if (!open) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lien_updates')
        .select('id, update_text, created_at, created_by, attachment_urls')
        .eq('lien_case_id', lienCaseId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUpdates(data || []);
    } catch (error) {
      console.error('Error fetching updates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDocument = async (fileUrl: string) => {
    try {
      // If it's already a full URL (from getPublicUrl), open directly
      if (fileUrl.startsWith('http')) {
        window.open(fileUrl, '_blank');
        return;
      }

      // Otherwise, create a signed URL from kyc-documents bucket
      const { data, error } = await supabase.storage
        .from('kyc-documents')
        .createSignedUrl(fileUrl, 3600); // 1 hour expiry

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
      // If it's already a full URL, trigger download directly
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

      // Otherwise, download from kyc-documents bucket
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
  }, [open, lienCaseId]);

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
          <DialogTitle>Lien Case Timeline</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="text-center py-4">Loading...</div>
          ) : updates.length === 0 ? (
            <div className="text-center py-4 text-gray-500">No updates found</div>
          ) : (
            updates.map((update, index) => (
              <div key={update.id} className="border-l-2 border-blue-200 pl-4 pb-4 relative">
                <div className="absolute -left-2 top-0 w-4 h-4 bg-blue-500 rounded-full"></div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="text-sm text-gray-600 mb-1">
                    {format(new Date(update.created_at), 'PPpp')} - {update.created_by}
                  </div>
                  <div className="text-gray-900 mb-2">{update.update_text}</div>
                  
                  {/* Display attachments if any */}
                  {update.attachment_urls && update.attachment_urls.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="text-sm font-medium text-gray-700">Attachments:</div>
                      <div className="space-y-1">
                        {update.attachment_urls.map((url, urlIndex) => {
                          const fileName = url.split('/').pop() || `Document ${urlIndex + 1}`;
                          const isPdf = fileName.toLowerCase().endsWith('.pdf');
                          
                          return (
                            <div key={urlIndex} className="flex items-center gap-2 p-2 bg-white rounded border">
                              <FileText className="h-4 w-4 text-red-500" />
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
