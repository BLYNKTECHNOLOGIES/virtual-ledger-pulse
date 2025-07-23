import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Upload, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
  IFSC?: string;
  branch?: string;
  bank_account_holder_name?: string;
  balance: number;
}

interface CloseAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  account: BankAccount | null;
  onAccountClosed: () => void;
}

export const CloseAccountDialog: React.FC<CloseAccountDialogProps> = ({
  isOpen,
  onClose,
  account,
  onAccountClosed
}) => {
  const [closureReason, setClosureReason] = useState('');
  const [documents, setDocuments] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setDocuments(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setDocuments(documents.filter((_, i) => i !== index));
  };

  const uploadDocuments = async (files: File[]): Promise<string[]> => {
    const uploadedUrls: string[] = [];
    
    for (const file of files) {
      const fileName = `${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from('kyc-documents')
        .upload(`bank-closures/${fileName}`, file);
      
      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage
        .from('kyc-documents')
        .getPublicUrl(data.path);
      
      uploadedUrls.push(publicUrl);
    }
    
    return uploadedUrls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!account || !closureReason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a closure reason",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    
    try {
      // Upload documents if any
      let documentUrls: string[] = [];
      if (documents.length > 0) {
        documentUrls = await uploadDocuments(documents);
      }

      // Check for foreign key references before attempting deletion
      console.log('Checking foreign key references for account:', account.id, account.account_name);
      
      const { data: lienCases, error: lienError } = await supabase
        .from('lien_cases')
        .select('id')
        .eq('bank_account_id', account.id);
      console.log('Lien cases found:', lienCases?.length || 0, 'Error:', lienError);

      const { data: bankTransactions, error: transError } = await supabase
        .from('bank_transactions')
        .select('id')
        .eq('bank_account_id', account.id);
      console.log('Bank transactions found:', bankTransactions?.length || 0, 'Error:', transError);

      const { data: purchaseOrders, error: poError } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('bank_account_id', account.id);
      console.log('Purchase orders found:', purchaseOrders?.length || 0, 'Error:', poError);

      const { data: settlements, error: settError } = await supabase
        .from('payment_gateway_settlements')
        .select('id')
        .eq('bank_account_id', account.id);
      console.log('Payment gateway settlements found:', settlements?.length || 0, 'Error:', settError);

      const { data: purchasePaymentMethods, error: ppmError } = await supabase
        .from('purchase_payment_methods')
        .select('id')
        .eq('bank_account_name', account.account_name);
      console.log('Purchase payment methods found:', purchasePaymentMethods?.length || 0, 'Error:', ppmError);

      // Check if there are any related records
      const lienCheck = lienCases && lienCases.length > 0;
      const transCheck = bankTransactions && bankTransactions.length > 0;
      const poCheck = purchaseOrders && purchaseOrders.length > 0;
      const settCheck = settlements && settlements.length > 0;
      const ppmCheck = purchasePaymentMethods && purchasePaymentMethods.length > 0;
      
      const hasRelatedRecords = lienCheck || transCheck || poCheck || settCheck || ppmCheck;

      console.log('Individual checks:', {
        lienCheck,
        transCheck, 
        poCheck,
        settCheck,
        ppmCheck,
        hasRelatedRecords
      });

      if (hasRelatedRecords) {
        let errorDetails = "This account has related records that prevent closure:\n";
        if (lienCases && lienCases.length > 0) errorDetails += `• ${lienCases.length} lien case(s)\n`;
        if (bankTransactions && bankTransactions.length > 0) errorDetails += `• ${bankTransactions.length} bank transaction(s)\n`;
        if (purchaseOrders && purchaseOrders.length > 0) errorDetails += `• ${purchaseOrders.length} purchase order(s)\n`;
        if (settlements && settlements.length > 0) errorDetails += `• ${settlements.length} payment gateway settlement(s)\n`;
        if (purchasePaymentMethods && purchasePaymentMethods.length > 0) errorDetails += `• ${purchasePaymentMethods.length} purchase payment method(s)\n`;
        errorDetails += "\nPlease remove these records first or contact admin.";
        
        toast({
          title: "Cannot Close Account",
          description: errorDetails,
          variant: "destructive"
        });
        setUploading(false);
        return;
      }

      // Insert into closed_bank_accounts table
      const { error: insertError } = await supabase
        .from('closed_bank_accounts')
        .insert({
          account_name: account.account_name,
          bank_name: account.bank_name,
          account_number: account.account_number,
          ifsc: account.IFSC,
          branch: account.branch,
          bank_account_holder_name: account.bank_account_holder_name,
          final_balance: account.balance,
          closure_reason: closureReason,
          closure_documents: documentUrls,
          closed_by: 'Current User' // You can update this to get actual user
        });

      if (insertError) {
        console.error('Insert error:', insertError);
        throw new Error(`Failed to create closure record: ${insertError.message}`);
      }

      // Delete from bank_accounts table
      const { error: deleteError } = await supabase
        .from('bank_accounts')
        .delete()
        .eq('id', account.id);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        throw new Error(`Failed to delete bank account: ${deleteError.message}`);
      }

      toast({
        title: "Success",
        description: "Bank account has been closed successfully"
      });

      onAccountClosed();
      onClose();
      setClosureReason('');
      setDocuments([]);
      
    } catch (error: any) {
      console.error('Error closing account:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to close bank account",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Close Bank Account</DialogTitle>
        </DialogHeader>
        
        {account && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-muted p-3 rounded-lg">
              <p className="font-medium">{account.account_name}</p>
              <p className="text-sm text-muted-foreground">{account.bank_name}</p>
              <p className="text-sm text-muted-foreground">Account: {account.account_number}</p>
              <p className="text-sm">Final Balance: ₹{account.balance.toLocaleString()}</p>
            </div>

            <div>
              <Label htmlFor="reason">Reason for Closure *</Label>
              <Textarea
                id="reason"
                value={closureReason}
                onChange={(e) => setClosureReason(e.target.value)}
                placeholder="Enter the reason for closing this account..."
                required
              />
            </div>

            <div>
              <Label htmlFor="documents">Upload Documents (Optional)</Label>
              <div className="mt-2">
                <label className="flex items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <div className="flex flex-col items-center">
                    <Upload className="w-8 h-8 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">Click to upload files</p>
                  </div>
                  <input
                    id="documents"
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  />
                </label>
              </div>
              
              {documents.length > 0 && (
                <div className="mt-2 space-y-2">
                  {documents.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                      <span className="text-sm truncate">{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={uploading || !closureReason.trim()}
              >
                {uploading ? 'Closing Account...' : 'Close Account'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};