import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Upload, X, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';

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
  enableManualDelete?: boolean;
}

export const CloseAccountDialog: React.FC<CloseAccountDialogProps> = ({
  isOpen,
  onClose,
  account,
  onAccountClosed,
  enableManualDelete = false
}) => {
  const [closureReason, setClosureReason] = useState('');
  const [documents, setDocuments] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [settlementBankId, setSettlementBankId] = useState<string>('');
  const [transferBalance, setTransferBalance] = useState(false);
  const [isManualDelete, setIsManualDelete] = useState(false);
  const { toast } = useToast();

  // Fetch other active bank accounts for settlement
  const { data: otherBankAccounts } = useQuery({
    queryKey: ['other_bank_accounts', account?.id],
    queryFn: async () => {
      if (!account?.id) return [];
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('account_status', 'ACTIVE')
        .neq('id', account.id)
        .order('account_name');
      if (error) throw error;
      return data as BankAccount[];
    },
    enabled: !!account?.id && isOpen
  });

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

    if (transferBalance && account.balance !== 0 && !settlementBankId) {
      toast({
        title: "Error",
        description: "Please select a bank account for balance settlement",
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

      // Step 1: Transfer balance if requested and balance is not zero
      if (transferBalance && account.balance !== 0 && settlementBankId) {
        // Create transfer transaction for the closing account (outgoing)
        const { error: transferOutError } = await supabase
          .from('bank_transactions')
          .insert({
            bank_account_id: account.id,
            transaction_type: 'TRANSFER_OUT',
            amount: Math.abs(account.balance),
            description: `Balance transfer to settlement account during closure`,
            transaction_date: new Date().toISOString().split('T')[0],
            related_transaction_id: null
          });

        if (transferOutError) {
          throw new Error(`Failed to create transfer out transaction: ${transferOutError.message}`);
        }

        // Create transfer transaction for the settlement account (incoming)
        const { error: transferInError } = await supabase
          .from('bank_transactions')
          .insert({
            bank_account_id: settlementBankId,
            transaction_type: 'TRANSFER_IN', 
            amount: Math.abs(account.balance),
            description: `Balance received from closed account: ${account.account_name}`,
            transaction_date: new Date().toISOString().split('T')[0],
            related_transaction_id: null
          });

        if (transferInError) {
          throw new Error(`Failed to create transfer in transaction: ${transferInError.message}`);
        }
      }

      // Step 2: Remove sales payment methods linked to this account
      const { error: salesMethodError } = await supabase
        .from('sales_payment_methods')
        .update({ is_active: false })
        .eq('bank_account_id', account.id);

      if (salesMethodError) {
        console.warn('Warning: Failed to deactivate sales payment methods:', salesMethodError.message);
      }

      // Step 3: Remove purchase payment methods linked to this account
      const { error: purchaseMethodError } = await supabase
        .from('purchase_payment_methods')
        .update({ is_active: false })
        .or(`bank_account_name.eq.${account.account_name},bank_account_id.eq.${account.id}`);

      if (purchaseMethodError) {
        console.warn('Warning: Failed to deactivate purchase payment methods:', purchaseMethodError.message);
      }

      if (isManualDelete && enableManualDelete) {
        // Manual delete: Actually delete the account record
        const { error: deleteError } = await supabase
          .from('bank_accounts')
          .delete()
          .eq('id', account.id);

        if (deleteError) {
          throw new Error(`Failed to delete bank account: ${deleteError.message}`);
        }

        toast({
          title: "Success",
          description: "Bank account has been permanently deleted"
        });
      } else {
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
            final_balance: transferBalance && settlementBankId ? 0 : account.balance,
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
            balance: transferBalance && settlementBankId ? 0 : account.balance,
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
      }

      onAccountClosed();
      onClose();
      resetForm();
      
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

  const resetForm = () => {
    setClosureReason('');
    setDocuments([]);
    setSettlementBankId('');
    setTransferBalance(false);
    setIsManualDelete(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isManualDelete ? <Trash2 className="w-5 h-5 text-destructive" /> : null}
            {isManualDelete ? 'Delete Bank Account' : 'Close Bank Account'}
          </DialogTitle>
        </DialogHeader>
        
        {account && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-muted p-4 rounded-lg">
              <p className="font-medium">{account.account_name}</p>
              <p className="text-sm text-muted-foreground">{account.bank_name}</p>
              <p className="text-sm text-muted-foreground">Account: {account.account_number}</p>
              <p className={`text-sm font-medium ${account.balance < 0 ? 'text-destructive' : 'text-green-600'}`}>
                Current Balance: ₹{account.balance.toLocaleString()}
              </p>
            </div>

            {/* Balance Settlement Section */}
            {account.balance !== 0 && !isManualDelete && (
              <div className="border border-orange-200 bg-orange-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  <h3 className="font-medium text-orange-800">Balance Settlement</h3>
                </div>
                
                <div className="flex items-center space-x-2 mb-4">
                  <Checkbox 
                    id="transferBalance" 
                    checked={transferBalance}
                    onCheckedChange={(checked) => setTransferBalance(checked as boolean)}
                  />
                  <Label htmlFor="transferBalance" className="text-sm">
                    Transfer remaining balance to another bank account
                  </Label>
                </div>

                {transferBalance && (
                  <div>
                    <Label htmlFor="settlementBank">Select Settlement Bank Account *</Label>
                    <Select value={settlementBankId} onValueChange={setSettlementBankId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose bank account for settlement" />
                      </SelectTrigger>
                      <SelectContent>
                        {otherBankAccounts?.map((bank) => (
                          <SelectItem key={bank.id} value={bank.id}>
                            {bank.account_name} - {bank.bank_name} (₹{bank.balance.toLocaleString()})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {otherBankAccounts?.length === 0 && (
                      <p className="text-sm text-orange-600 mt-1">
                        No other active bank accounts available for settlement
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Manual Delete Option */}
            {enableManualDelete && (
              <div className="border border-red-200 bg-red-50 p-4 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="manualDelete" 
                    checked={isManualDelete}
                    onCheckedChange={(checked) => setIsManualDelete(checked as boolean)}
                  />
                  <Label htmlFor="manualDelete" className="text-sm text-red-800 font-medium">
                    Permanently delete this bank account (Warning: This action cannot be undone)
                  </Label>
                </div>
                {isManualDelete && (
                  <p className="text-xs text-red-600 mt-2">
                    This will permanently remove the account and all associated payment methods. 
                    Historical transactions will remain intact.
                  </p>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="reason">Reason for {isManualDelete ? 'Deletion' : 'Closure'} *</Label>
              <Textarea
                id="reason"
                value={closureReason}
                onChange={(e) => setClosureReason(e.target.value)}
                placeholder={`Enter the reason for ${isManualDelete ? 'deleting' : 'closing'} this account...`}
                required
                className="min-h-[80px]"
              />
            </div>

            {!isManualDelete && (
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
            )}

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => { onClose(); resetForm(); }}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={isManualDelete ? "destructive" : "destructive"}
                disabled={uploading || !closureReason.trim()}
              >
                {uploading ? 
                  (isManualDelete ? 'Deleting...' : 'Processing...') : 
                  (isManualDelete ? 'Delete Account' : 'Close Account')
                }
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};