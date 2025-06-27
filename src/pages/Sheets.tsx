
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, FileText, Upload, Download } from "lucide-react";
import { SpreadsheetEditor } from '@/components/sheets/SpreadsheetEditor';
import { SheetsList } from '@/components/sheets/SheetsList';
import { CreateSheetDialog } from '@/components/sheets/CreateSheetDialog';
import { ImportExportDialog } from '@/components/sheets/ImportExportDialog';
import { PermissionGate } from '@/components/PermissionGate';
import { useToast } from "@/hooks/use-toast";

export default function Sheets() {
  const [selectedSheet, setSelectedSheet] = useState<any>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importExportDialogOpen, setImportExportDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  const handleCreateSheet = (sheetData: any) => {
    console.log('Creating sheet:', sheetData);
    toast({
      title: "Success",
      description: "New spreadsheet created successfully!",
    });
    setCreateDialogOpen(false);
  };

  const handleOpenSheet = (sheet: any) => {
    setSelectedSheet(sheet);
  };

  const handleBackToList = () => {
    setSelectedSheet(null);
  };

  if (selectedSheet) {
    return (
      <PermissionGate permissions={['sheets_view', 'sheets_manage']}>
        <div className="h-full flex flex-col">
          <SpreadsheetEditor 
            sheet={selectedSheet} 
            onBack={handleBackToList}
          />
        </div>
      </PermissionGate>
    );
  }

  return (
    <PermissionGate permissions={['sheets_view', 'sheets_manage']}>
      <div className="flex flex-col h-full bg-gray-50">
        <div className="bg-white border-b border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Spreadsheets</h1>
              <p className="text-gray-600">Create and manage Excel-like spreadsheets</p>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => setImportExportDialogOpen(true)}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Import
              </Button>
              <Button 
                onClick={() => setCreateDialogOpen(true)}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                New Sheet
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search spreadsheets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 p-6">
          <SheetsList 
            searchQuery={searchQuery}
            onOpenSheet={handleOpenSheet}
          />
        </div>

        <CreateSheetDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onCreateSheet={handleCreateSheet}
        />

        <ImportExportDialog
          open={importExportDialogOpen}
          onOpenChange={setImportExportDialogOpen}
        />
      </div>
    </PermissionGate>
  );
}
