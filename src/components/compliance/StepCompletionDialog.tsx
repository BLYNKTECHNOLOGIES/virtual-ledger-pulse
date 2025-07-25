import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Upload, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface StepCompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: any;
  onComplete: (stepId: string, notes: string, reportUrl?: string) => void;
}

export function StepCompletionDialog({
  open,
  onOpenChange,
  step,
  onComplete
}: StepCompletionDialogProps) {
  const [notes, setNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [reportUrl, setReportUrl] = useState<string>("");
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type (allow common document formats)
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'image/jpeg',
        'image/png'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid File Type",
          description: "Please upload a PDF, Word document, text file, or image.",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please upload a file smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }

      setUploadedFile(file);
    }
  };

  const uploadFile = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `investigation-${step.investigation_id}/step-${step.id}-${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from('investigation-documents')
      .upload(fileName, file);

    if (error) {
      throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('investigation-documents')
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const handleComplete = async () => {
    try {
      setIsUploading(true);
      
      let finalReportUrl = reportUrl;
      
      // Upload file if one was selected
      if (uploadedFile) {
        finalReportUrl = await uploadFile(uploadedFile);
        setReportUrl(finalReportUrl);
      }

      // Complete the step
      onComplete(step.id, notes, finalReportUrl || undefined);
      
      // Reset form
      setNotes("");
      setUploadedFile(null);
      setReportUrl("");
      onOpenChange(false);
      
      toast({
        title: "Step Completed",
        description: "Investigation step has been marked as completed with report.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to complete step. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Complete Investigation Step</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Step Details</Label>
            <div className="bg-gray-50 p-3 rounded-lg mt-1">
              <h4 className="font-medium text-sm">{step?.step_title}</h4>
              {step?.step_description && (
                <p className="text-xs text-gray-600 mt-1">{step.step_description}</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="completion-notes">Completion Notes *</Label>
            <Textarea
              id="completion-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe what was completed and any findings..."
              rows={3}
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label htmlFor="completion-report">Completion Report (Optional)</Label>
            <div className="mt-2 space-y-2">
              <div className="relative">
                <Button
                  variant="outline"
                  onClick={() => document.getElementById('completion-report')?.click()}
                  className="w-full justify-start text-left"
                  type="button"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadedFile ? uploadedFile.name : "Choose File"}
                </Button>
                <Input
                  id="completion-report"
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Upload PDF, Word document, text file, or image (max 10MB)
              </p>
            </div>
            
            {uploadedFile && (
              <div className="flex items-center gap-2 mt-2 p-2 bg-blue-50 rounded-lg">
                <FileText className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-blue-800">{uploadedFile.name}</span>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleComplete}
              disabled={!notes.trim() || isUploading}
            >
              {isUploading ? (
                <>
                  <Upload className="h-4 w-4 mr-2 animate-spin" />
                  {uploadedFile ? "Uploading..." : "Completing..."}
                </>
              ) : (
                "Complete Step"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}