import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ImportBankAccountsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportRow {
  account_name: string;
  bank_name: string;
  account_number: string;
  ifsc_code: string;
  branch?: string;
  balance: number;
  lien_amount?: number;
  account_holder_name?: string;
  account_type: string;
  company_name: string;
}

export function ImportBankAccountsDialog({ open, onOpenChange }: ImportBankAccountsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importData, setImportData] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  // Fetch subsidiaries for mapping company names to IDs
  const { data: subsidiaries } = useQuery({
    queryKey: ['subsidiaries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subsidiaries')
        .select('id, firm_name')
        .eq('status', 'ACTIVE');
      if (error) throw error;
      return data;
    }
  });

  const downloadTemplate = () => {
    const template = [
      {
        account_name: "Example Account",
        bank_name: "HDFC Bank",
        account_number: "1234567890123",
        ifsc_code: "HDFC0001234",
        branch: "Mumbai Main",
        balance: 50000,
        lien_amount: 0,
        account_holder_name: "John Doe",
        account_type: "SAVINGS",
        company_name: "Enter Company Name Here"
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bank Accounts Template");
    
    // Add column widths
    ws['!cols'] = [
      { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 15 },
      { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 25 },
      { wch: 12 }, { wch: 25 }
    ];

    XLSX.writeFile(wb, "bank_accounts_import_template.xlsx");
    toast({
      title: "Template Downloaded",
      description: "Fill in the template and upload it to import bank accounts."
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
        const rowNum = index + 2; // Excel rows start at 1, plus header row

        if (!row.account_name) {
          validationErrors.push(`Row ${rowNum}: Account name is required`);
        }
        if (!row.bank_name) {
          validationErrors.push(`Row ${rowNum}: Bank name is required`);
        }
        if (!row.account_number) {
          validationErrors.push(`Row ${rowNum}: Account number is required`);
        }
        if (!row.ifsc_code) {
          validationErrors.push(`Row ${rowNum}: IFSC code is required`);
        }
        if (row.balance === undefined || isNaN(Number(row.balance))) {
          validationErrors.push(`Row ${rowNum}: Valid balance is required`);
        }
        if (!row.company_name) {
          validationErrors.push(`Row ${rowNum}: Company name is required`);
        } else {
          const subsidiary = subsidiaries?.find(
            s => s.firm_name.toLowerCase() === row.company_name.toLowerCase()
          );
          if (!subsidiary) {
            validationErrors.push(`Row ${rowNum}: Company "${row.company_name}" not found`);
          }
        }
        if (!['SAVINGS', 'CURRENT'].includes(row.account_type?.toUpperCase() || '')) {
          validationErrors.push(`Row ${rowNum}: Account type must be SAVINGS or CURRENT`);
        }

        if (validationErrors.length === 0 || validationErrors.filter(e => e.includes(`Row ${rowNum}`)).length === 0) {
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
      const accountsToInsert = rows.map(row => {
        const subsidiary = subsidiaries?.find(
          s => s.firm_name.toLowerCase() === row.company_name.toLowerCase()
        );

        return {
          account_name: row.account_name,
          bank_name: row.bank_name,
          account_number: row.account_number,
          IFSC: row.ifsc_code,
          branch: row.branch || null,
          balance: Number(row.balance),
          lien_amount: Number(row.lien_amount) || 0,
          bank_account_holder_name: row.account_holder_name || null,
          account_type: row.account_type.toUpperCase() as "SAVINGS" | "CURRENT",
          subsidiary_id: subsidiary?.id || null,
          status: "PENDING_APPROVAL" as const
        };
      });

      const { error } = await supabase
        .from('bank_accounts')
        .insert(accountsToInsert);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Import Successful",
        description: `${importData.length} bank accounts imported successfully.`
      });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['pending_approval_accounts'] });
      onOpenChange(false);
      setImportData([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import bank accounts",
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
            Import Bank Accounts
          </DialogTitle>
          <DialogDescription>
            Download the template, fill in the bank account details, and upload to import multiple accounts at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Download Template */}
          <div className="border rounded-lg p-4 space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
              Download Template
            </h4>
            <p className="text-sm text-muted-foreground">
              Download the Excel template with the required columns.
            </p>
            <Button onClick={downloadTemplate} variant="outline" className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </div>

          {/* Step 2: Upload Filled Template */}
          <div className="border rounded-lg p-4 space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
              Upload Filled Template
            </h4>
            <p className="text-sm text-muted-foreground">
              Upload your filled Excel file to validate and import.
            </p>
            <div>
              <Label htmlFor="file-upload">Choose File</Label>
              <Input
                ref={fileInputRef}
                id="file-upload"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={isValidating}
              />
            </div>
          </div>

          {/* Validation Results */}
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
                {importData.length} account(s) ready to import.
              </AlertDescription>
            </Alert>
          )}

          {/* Step 3: Import */}
          <div className="border rounded-lg p-4 space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
              Import Accounts
            </h4>
            <Button 
              onClick={handleImport} 
              disabled={importData.length === 0 || errors.length > 0 || importMutation.isPending}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              {importMutation.isPending ? 'Importing...' : `Import ${importData.length} Account(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
