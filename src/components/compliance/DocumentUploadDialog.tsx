
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload } from "lucide-react";

interface DocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentUploadDialog({ open, onOpenChange }: DocumentUploadDialogProps) {
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    expiryDate: "",
    file: null as File | null
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData(prev => ({ ...prev, file }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.file) {
      toast({
        title: "Error",
        description: "Please select a file to upload.",
        variant: "destructive"
      });
      return;
    }
    
    // Here you would typically upload the file to your backend/storage
    toast({
      title: "Document Uploaded",
      description: `Document "${formData.name}" has been uploaded successfully.`,
    });
    
    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      category: "",
      expiryDate: "",
      file: null
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Legal Document</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Document Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., GST Registration Certificate"
              required
            />
          </div>

          <div>
            <Label htmlFor="category">Category *</Label>
            <Select onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Certifications">Certifications</SelectItem>
                <SelectItem value="Licenses">Licenses</SelectItem>
                <SelectItem value="Contracts">Contracts</SelectItem>
                <SelectItem value="Agreements">Agreements</SelectItem>
                <SelectItem value="Permits">Permits</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="expiryDate">Expiry Date (Optional)</Label>
            <Input
              id="expiryDate"
              type="date"
              value={formData.expiryDate}
              onChange={(e) => setFormData(prev => ({ ...prev, expiryDate: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="file">Select File *</Label>
            <Input
              id="file"
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              required
            />
            {formData.file && (
              <p className="text-sm text-gray-600 mt-1">
                Selected: {formData.file.name}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              <Upload className="h-4 w-4 mr-2" />
              Upload Document
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
