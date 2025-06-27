
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Upload, X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ResolveQueryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: any;
  onSuccess?: () => void;
}

interface DocumentUpload {
  id: string;
  file: File | null;
  name: string;
  url?: string;
}

export function ResolveQueryDialog({ open, onOpenChange, query, onSuccess }: ResolveQueryDialogProps) {
  const [resolutionText, setResolutionText] = useState("");
  const [documents, setDocuments] = useState<DocumentUpload[]>([
    { id: "1", file: null, name: "", url: "" }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const addDocumentSlot = () => {
    const newId = (documents.length + 1).toString();
    setDocuments([...documents, { id: newId, file: null, name: "", url: "" }]);
  };

  const removeDocumentSlot = (id: string) => {
    if (documents.length > 1) {
      setDocuments(documents.filter(doc => doc.id !== id));
    }
  };

  const handleFileChange = (id: string, file: File | null) => {
    setDocuments(documents.map(doc => 
      doc.id === id ? { ...doc, file, name: file?.name || "" } : doc
    ));
  };

  const handleDocumentNameChange = (id: string, name: string) => {
    setDocuments(documents.map(doc => 
      doc.id === id ? { ...doc, name } : doc
    ));
  };

  const handleSubmit = async () => {
    if (!resolutionText.trim()) {
      toast({
        title: "Resolution Required",
        description: "Please provide resolution details.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      // For this demo, we'll just simulate document URLs
      const documentUrls = documents
        .filter(doc => doc.file && doc.name)
        .map(doc => ({
          name: doc.name,
          url: `https://example.com/documents/${doc.file?.name}` // In real app, upload to storage
        }));

      // Update the query as resolved with resolution details
      const { error: queryError } = await supabase
        .from('kyc_queries')
        .update({ 
          resolved: true, 
          resolved_at: new Date().toISOString(),
          response_text: resolutionText
        })
        .eq('id', query?.id);

      if (queryError) {
        throw queryError;
      }

      // Move the KYC request back to PENDING status
      const { error: updateError } = await supabase
        .from('kyc_approval_requests')
        .update({ status: 'PENDING' })
        .eq('id', query?.kyc_request_id);

      if (updateError) {
        throw updateError;
      }

      toast({
        title: "Query Resolved",
        description: "Query has been resolved and KYC moved back to pending.",
      });

      // Reset form
      setResolutionText("");
      setDocuments([{ id: "1", file: null, name: "", url: "" }]);
      
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error resolving query:', error);
      toast({
        title: "Error",
        description: "Failed to resolve query. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!query) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Resolve Query
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="bg-gray-50 p-4 rounded">
            <p className="text-sm font-medium mb-2">Query Details:</p>
            <p className="font-semibold">{query.kyc_approval_requests?.counterparty_name}</p>
            <p className="text-sm text-gray-600">Amount: ₹{query.kyc_approval_requests?.order_amount?.toLocaleString()}</p>
            
            {query.manual_query && (
              <div className="mt-3 p-3 bg-purple-50 rounded border-l-4 border-purple-400">
                <p className="text-sm font-medium text-purple-800">Manual Query:</p>
                <p className="text-sm text-purple-700">{query.manual_query}</p>
              </div>
            )}

            {query.vkyc_required && (
              <div className="mt-3 p-3 bg-blue-50 rounded border-l-4 border-blue-400">
                <p className="text-sm font-medium text-blue-800">Video KYC Required</p>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="resolution-text">Resolution Details *</Label>
            <Textarea
              id="resolution-text"
              value={resolutionText}
              onChange={(e) => setResolutionText(e.target.value)}
              placeholder="Describe how the query was resolved, what documents were provided, or what steps were taken..."
              rows={4}
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-base font-medium">Supporting Documents</Label>
            <p className="text-sm text-gray-600 mb-3">Upload any documents related to the query resolution (optional)</p>
            
            <div className="space-y-3">
              {documents.map((doc, index) => (
                <Card key={doc.id} className="p-4">
                  <CardContent className="p-0">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 space-y-2">
                        <div>
                          <Label htmlFor={`doc-name-${doc.id}`} className="text-sm">Document Name</Label>
                          <Input
                            id={`doc-name-${doc.id}`}
                            value={doc.name}
                            onChange={(e) => handleDocumentNameChange(doc.id, e.target.value)}
                            placeholder="Enter document name"
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`doc-file-${doc.id}`} className="text-sm">Select File</Label>
                          <Input
                            id={`doc-file-${doc.id}`}
                            type="file"
                            onChange={(e) => handleFileChange(doc.id, e.target.files?.[0] || null)}
                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                            className="text-sm"
                          />
                        </div>
                      </div>
                      
                      {documents.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeDocumentSlot(doc.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              <Button
                type="button"
                variant="outline"
                onClick={addDocumentSlot}
                className="w-full flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Another Document
              </Button>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1" disabled={isSubmitting}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              className="flex-1 bg-green-600 hover:bg-green-700"
              disabled={!resolutionText.trim() || isSubmitting}
            >
              {isSubmitting ? "Resolving..." : "Resolve Query"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
