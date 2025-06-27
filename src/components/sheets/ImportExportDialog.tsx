
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Download, FileText, File } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ImportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportExportDialog({ open, onOpenChange }: ImportExportDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleImport = () => {
    if (selectedFile) {
      toast({
        title: "Import Started",
        description: `Importing ${selectedFile.name}...`,
      });
      onOpenChange(false);
      setSelectedFile(null);
    }
  };

  const handleExport = (format: string) => {
    toast({
      title: "Export Started",
      description: `Exporting spreadsheet as ${format.toUpperCase()}...`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import & Export</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="import" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>
          
          <TabsContent value="import" className="space-y-4">
            <div className="text-center">
              <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Import Spreadsheet</h3>
              <p className="text-sm text-gray-600 mb-4">
                Upload Excel (.xlsx) or CSV files to create a new spreadsheet
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="file-upload">Select File</Label>
                <Input
                  id="file-upload"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="mt-1"
                />
              </div>
              
              {selectedFile && (
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                  <FileText className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium">{selectedFile.name}</span>
                  <span className="text-xs text-gray-500">
                    ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              )}
              
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                  Cancel
                </Button>
                <Button 
                  onClick={handleImport} 
                  disabled={!selectedFile}
                  className="flex-1"
                >
                  Import
                </Button>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="export" className="space-y-4">
            <div className="text-center">
              <Download className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Export Spreadsheet</h3>
              <p className="text-sm text-gray-600 mb-4">
                Download your spreadsheet in various formats
              </p>
            </div>
            
            <div className="space-y-3">
              <Button 
                variant="outline" 
                onClick={() => handleExport('xlsx')}
                className="w-full justify-start"
              >
                <File className="h-4 w-4 mr-2" />
                Export as Excel (.xlsx)
              </Button>
              <Button 
                variant="outline" 
                onClick={() => handleExport('csv')}
                className="w-full justify-start"
              >
                <FileText className="h-4 w-4 mr-2" />
                Export as CSV (.csv)
              </Button>
              <Button 
                variant="outline" 
                onClick={() => handleExport('pdf')}
                className="w-full justify-start"
              >
                <File className="h-4 w-4 mr-2" />
                Export as PDF (.pdf)
              </Button>
            </div>
            
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
              Cancel
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
