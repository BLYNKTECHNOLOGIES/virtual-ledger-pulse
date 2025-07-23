
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Plus, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

interface AddLienUpdateDialogProps {
  lienCaseId: string;
  onUpdateAdded: () => void;
}

export function AddLienUpdateDialog({ lienCaseId, onUpdateAdded }: AddLienUpdateDialogProps) {
  const [open, setOpen] = useState(false);
  const [updateText, setUpdateText] = useState("");
  const [isLienRelease, setIsLienRelease] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const { toast } = useToast();

  // Fetch lien case to check if already resolved
  const { data: lienCase } = useQuery({
    queryKey: ['lien_case', lienCaseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lien_cases')
        .select('status')
        .eq('id', lienCaseId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const isAlreadyResolved = lienCase?.status === 'Resolved';

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (files: File[]): Promise<string[]> => {
    const uploadedUrls: string[] = [];
    
    for (const file of files) {
      const fileName = `lien-updates/${lienCaseId}/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from('kyc-documents')
        .upload(fileName, file);
      
      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage
        .from('kyc-documents')
        .getPublicUrl(fileName);
      
      uploadedUrls.push(publicUrl);
    }
    
    return uploadedUrls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      let attachmentUrls: string[] = [];
      
      // Upload attachments if any
      if (attachments.length > 0) {
        attachmentUrls = await uploadFiles(attachments);
      }

      // Add the update
      const { error: updateError } = await supabase
        .from('lien_updates')
        .insert([{
          lien_case_id: lienCaseId,
          update_text: updateText,
          attachment_urls: attachmentUrls,
          created_by: 'System User' // Replace with actual user when auth is implemented
        }]);

      if (updateError) throw updateError;

      // If this is a lien release, update the lien case status
      if (isLienRelease && !isAlreadyResolved) {
        const { error: statusError } = await supabase
          .from('lien_cases')
          .update({ status: 'Resolved' })
          .eq('id', lienCaseId);

        if (statusError) throw statusError;
      }

      toast({
        title: "Success",
        description: isLienRelease ? "Lien released successfully" : "Update added successfully",
      });

      setUpdateText("");
      setIsLienRelease(false);
      setAttachments([]);
      setOpen(false);
      onUpdateAdded();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add update",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-1" />
          Add Update
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Add Lien Update</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="update">Update Details *</Label>
            <Textarea
              id="update"
              value={updateText}
              onChange={(e) => setUpdateText(e.target.value)}
              rows={4}
              placeholder={isLienRelease ? "Enter lien release details..." : "Enter update details..."}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label>Attachments</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <Input
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              />
              <Label 
                htmlFor="file-upload" 
                className="cursor-pointer flex items-center justify-center space-x-2 text-gray-600"
              >
                <Upload className="h-4 w-4" />
                <span>Click to upload files</span>
              </Label>
            </div>
            {attachments.length > 0 && (
              <div className="space-y-2">
                {attachments.map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                    <span className="text-sm">{file.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAttachment(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!isAlreadyResolved && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="lien-release"
                checked={isLienRelease}
                onCheckedChange={(checked) => setIsLienRelease(checked as boolean)}
              />
              <Label htmlFor="lien-release" className="text-sm font-medium">
                This lien has been resolved (Released)
              </Label>
            </div>
          )}

          {isAlreadyResolved && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="lien-resolved"
                checked={true}
                disabled
                className="opacity-60"
              />
              <Label htmlFor="lien-resolved" className="text-sm font-medium text-green-600">
                This lien has been resolved
              </Label>
            </div>
          )}
          
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className={isLienRelease ? "bg-green-600 hover:bg-green-700" : ""}>
              {isLienRelease ? "Release Lien" : "Add Update"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
