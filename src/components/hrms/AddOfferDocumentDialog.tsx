
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload } from "lucide-react";

interface AddOfferDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddOfferDocumentDialog({ open, onOpenChange }: AddOfferDocumentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    applicant_id: "",
    document_type: "OFFER_LETTER",
    document_url: "",
    notes: "",
  });

  const [uploading, setUploading] = useState(false);

  // Fetch applicants
  const { data: applicants } = useQuery({
    queryKey: ['offer_applicants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_applicants')
        .select(`
          id,
          name,
          email,
          job_postings:job_posting_id(title, department)
        `)
        .eq('is_interested', true)
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const addOfferDocumentMutation = useMutation({
    mutationFn: async (documentData: any) => {
      const { data, error } = await supabase
        .from('offer_documents')
        .insert(documentData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Offer Document Added",
        description: "Offer document has been successfully added.",
      });
      queryClient.invalidateQueries({ queryKey: ['offer_documents'] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to add offer document: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      applicant_id: "",
      document_type: "OFFER_LETTER",
      document_url: "",
      notes: "",
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `offer-documents/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('sales_attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('sales_attachments')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, document_url: publicUrl }));

      toast({
        title: "File Uploaded",
        description: "Document has been uploaded successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Upload Error",
        description: `Failed to upload file: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addOfferDocumentMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Offer Document</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="applicant_id">Applicant *</Label>
            <Select onValueChange={(value) => setFormData(prev => ({ ...prev, applicant_id: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select applicant" />
              </SelectTrigger>
              <SelectContent>
                {applicants?.map((applicant) => (
                  <SelectItem key={applicant.id} value={applicant.id}>
                    {applicant.name} - {applicant.job_postings?.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="document_type">Document Type</Label>
            <Select onValueChange={(value) => setFormData(prev => ({ ...prev, document_type: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OFFER_LETTER">Offer Letter</SelectItem>
                <SelectItem value="APPOINTMENT_LETTER">Appointment Letter</SelectItem>
                <SelectItem value="CONTRACT">Contract</SelectItem>
                <SelectItem value="NON_DISCLOSURE">Non-Disclosure Agreement</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="document_upload">Upload Document</Label>
            <div className="mt-2">
              <Input
                id="document_upload"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleFileUpload}
                disabled={uploading}
              />
              {uploading && (
                <div className="mt-2 text-sm text-gray-500">Uploading...</div>
              )}
              {formData.document_url && (
                <div className="mt-2 text-sm text-green-600">Document uploaded successfully</div>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addOfferDocumentMutation.isPending}>
              {addOfferDocumentMutation.isPending ? "Adding..." : "Add Document"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
