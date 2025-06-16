
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Upload } from "lucide-react";

interface FileUploadProps {
  onFilesUploaded: (urls: string[]) => void;
  existingFiles: string[];
}

export function FileUpload({ onFilesUploaded, existingFiles }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      // Simulate file upload - in real implementation, upload to Supabase storage
      const newUrls = Array.from(files).map(file => URL.createObjectURL(file));
      onFilesUploaded([...existingFiles, ...newUrls]);
    } catch (error) {
      console.error('Error uploading files:', error);
    } finally {
      setUploading(false);
    }
  };

  const removeFile = (index: number) => {
    const newFiles = existingFiles.filter((_, i) => i !== index);
    onFilesUploaded(newFiles);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          type="file"
          multiple
          onChange={handleFileUpload}
          disabled={uploading}
          className="file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-sm file:bg-gray-50"
        />
        <Button type="button" disabled={uploading} size="sm">
          <Upload className="h-4 w-4 mr-2" />
          {uploading ? "Uploading..." : "Upload"}
        </Button>
      </div>

      {existingFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Uploaded files:</p>
          {existingFiles.map((file, index) => (
            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <span className="text-sm truncate">File {index + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeFile(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
