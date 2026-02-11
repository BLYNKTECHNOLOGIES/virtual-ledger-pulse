import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ImportWalletsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportRow {
  wallet_name: string;
  wallet_address: string;
  chain_name: string;
  initial_balance: number;
}

export function ImportWalletsDialog({ open, onOpenChange }: ImportWalletsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importData, setImportData] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  const validChains = ['Ethereum', 'Binance Smart Chain', 'Polygon', 'Tron', 'Solana', 'Bitcoin', 'APTOS'];

  const downloadTemplate = () => {
    const template = [
      {
        wallet_name: "Example Wallet",
        wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
        chain_name: "Tron",
        initial_balance: 1000
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Wallets Template");
    
    ws['!cols'] = [
      { wch: 20 }, { wch: 50 }, { wch: 20 }, { wch: 15 }
    ];

    const optionsSheet = XLSX.utils.aoa_to_sheet([
      ['Valid Chain Names'],
      ...validChains.map(chain => [chain])
    ]);
    XLSX.utils.book_append_sheet(wb, optionsSheet, "Valid Options");

    XLSX.writeFile(wb, "wallets_import_template.xlsx");
    toast({
      title: "Template Downloaded",
      description: "Fill in the template and upload it to import wallets."
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsValidating(true);
    setErrors([]);
    setImportData([]);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<ImportRow>(worksheet);

      const validationErrors: string[] = [];
      const validRows: ImportRow[] = [];

      jsonData.forEach((row, index) => {
        const rowNum = index + 2;
        let hasError = false;

        if (!row.wallet_name) {
          validationErrors.push(`Row ${rowNum}: Wallet name is required`);
          hasError = true;
        }
        if (!row.wallet_address) {
          validationErrors.push(`Row ${rowNum}: Wallet address is required`);
          hasError = true;
        }
        if (!row.chain_name || !validChains.includes(row.chain_name)) {
          validationErrors.push(`Row ${rowNum}: Chain name must be one of: ${validChains.join(', ')}`);
          hasError = true;
        }
        if (row.initial_balance === undefined || isNaN(Number(row.initial_balance))) {
          validationErrors.push(`Row ${rowNum}: Valid initial balance is required`);
          hasError = true;
        }

        if (!hasError) {
          validRows.push(row);
        }
      });

      setErrors(validationErrors);
      setImportData(validRows);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to parse Excel file. Please check the format.",
        variant: "destructive"
      });
    } finally {
      setIsValidating(false);
    }
  };

  const importMutation = useMutation({
    mutationFn: async (rows: ImportRow[]) => {
      const walletsToInsert = rows.map(row => ({
        wallet_name: row.wallet_name,
        wallet_address: row.wallet_address,
        chain_name: row.chain_name,
        current_balance: Number(row.initial_balance),
        total_received: 0,
        total_sent: 0,
        is_active: true
      }));

      const { error } = await supabase
        .from('wallets')
        .insert(walletsToInsert);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Import Successful",
        description: `${importData.length} wallets imported successfully.`
      });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_stock_summary'] });
      onOpenChange(false);
      setImportData([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import wallets",
        variant: "destructive"
      });
    }
  });

  const handleImport = () => {
    if (importData.length === 0) {
      toast({
        title: "No Data",
        description: "Please upload a valid Excel file first.",
        variant: "destructive"
      });
      return;
    }
    importMutation.mutate(importData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Wallets
          </DialogTitle>
          <DialogDescription>
            Download the template, fill in the wallet details, and upload to import multiple wallets at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border rounded-lg p-4 space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
              Download Template
            </h4>
            <p className="text-sm text-muted-foreground">
              Download the Excel template with the required columns. Check the "Valid Options" sheet for accepted values.
            </p>
            <Button onClick={downloadTemplate} variant="outline" className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </div>

          <div className="border rounded-lg p-4 space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
              Upload Filled Template
            </h4>
            <p className="text-sm text-muted-foreground">
              Upload your filled Excel file to validate and import.
            </p>
            <div>
              <Label htmlFor="wallet-file-upload">Choose File</Label>
              <Input
                ref={fileInputRef}
                id="wallet-file-upload"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={isValidating}
              />
            </div>
          </div>

          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium">Validation Errors:</div>
                <ul className="list-disc list-inside max-h-32 overflow-y-auto">
                  {errors.map((error, index) => (
                    <li key={index} className="text-sm">{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {importData.length > 0 && errors.length === 0 && (
            <Alert className="border-green-500 text-green-700">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                {importData.length} wallet(s) ready to import.
              </AlertDescription>
            </Alert>
          )}

          <div className="border rounded-lg p-4 space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
              Import Wallets
            </h4>
            <Button 
              onClick={handleImport} 
              disabled={importData.length === 0 || errors.length > 0 || importMutation.isPending}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              {importMutation.isPending ? 'Importing...' : `Import ${importData.length} Wallet(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
