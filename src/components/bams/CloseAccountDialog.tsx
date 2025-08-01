import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const [settlementAccountId, setSettlementAccountId] = useState<string>('');
  const [availableBankAccounts, setAvailableBankAccounts] = useState<BankAccount[]>([]);
  const { toast } = useToast();

  // Fetch available bank accounts for settlement
  useEffect(() => {
    if (isOpen && account) {
      fetchAvailableBankAccounts();
    }
  }, [isOpen, account]);

  const fetchAvailableBankAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('account_status', 'ACTIVE')
        .neq('id', account?.id); // Exclude the account being closed
      
      if (error) throw error;
      setAvailableBankAccounts(data || []);
    } catch (error) {
      console.error('Error fetching bank accounts:', error);
    }
  };

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

      // Step 1: Transfer balance to settlement account if specified and balance > 0
      if (account.balance > 0 && settlementAccountId && settlementAccountId !== 'none') {
        // Create transfer transaction from closing account
        const { error: transferOutError } = await supabase
          .from('bank_transactions')
          .insert({
            bank_account_id: account.id,
            transaction_type: 'TRANSFER_OUT',
            amount: account.balance,
            transaction_date: new Date().toISOString().split('T')[0],
            description: `Balance transfer to settlement account due to account closure`,
            category: 'TRANSFER',
            related_account_name: availableBankAccounts.find(acc => acc.id === settlementAccountId)?.account_name || 'Settlement Account'
          });

        if (transferOutError) {
          throw new Error(`Failed to create transfer out transaction: ${transferOutError.message}`);
        }

        // Create transfer transaction to settlement account
        const { error: transferInError } = await supabase
          .from('bank_transactions')
          .insert({
            bank_account_id: settlementAccountId,
            transaction_type: 'TRANSFER_IN',
            amount: account.balance,
            transaction_date: new Date().toISOString().split('T')[0],
            description: `Balance received from closed account: ${account.account_name}`,
            category: 'TRANSFER',
            related_account_name: account.account_name
          });

        if (transferInError) {
          throw new Error(`Failed to create transfer in transaction: ${transferInError.message}`);
        }
      }

      // Step 2: Deactivate sales payment methods linked to this bank account
      const { error: salesPaymentMethodError } = await supabase
        .from('sales_payment_methods')
        .update({ is_active: false })
        .eq('bank_account_id', account.id);

      if (salesPaymentMethodError) {
        console.warn('Failed to deactivate sales payment methods:', salesPaymentMethodError);
      }

      // Step 3: Deactivate purchase payment methods linked to this bank account
      const { error: purchasePaymentMethodError } = await supabase
        .from('purchase_payment_methods')
        .update({ is_active: false })
        .eq('bank_account_name', account.account_name);

      if (purchasePaymentMethodError) {
        console.warn('Failed to deactivate purchase payment methods:', purchasePaymentMethodError);
      }

      // Step 4: Insert closure record
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
          closed_by: 'Current User'
        });

      if (insertError) {
        throw new Error(`Failed to create closure record: ${insertError.message}`);
      }

      // Step 5: Update account status to CLOSED
      const { error: updateError } = await supabase
        .from('bank_accounts')
        .update({ 
          account_status: 'CLOSED',
          updated_at: new Date().toISOString()
        })
        .eq('id', account.id);

      if (updateError) {
        throw new Error(`Failed to close bank account: ${updateError.message}`);
      }

      toast({
        title: "Success",
        description: "Bank account has been closed successfully"
      });

      onAccountClosed();
      onClose();
      setClosureReason('');
      setDocuments([]);
      setSettlementAccountId('');
      
    } catch (error: any) {
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

            {account.balance > 0 && (
              <div>
                <Label htmlFor="settlement">Settlement Account (Optional)</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Select an account to transfer the remaining balance of ₹{account.balance.toLocaleString()}
                </p>
                <Select value={settlementAccountId} onValueChange={setSettlementAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select settlement account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No settlement (keep balance in closure record)</SelectItem>
                    {availableBankAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.account_name} - {acc.bank_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
                onClick={() => console.log('Close Account button clicked', { uploading, closureReason: closureReason.trim() })}
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