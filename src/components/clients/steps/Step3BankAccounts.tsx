import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Building2 } from "lucide-react";
import { indianBanks } from "@/data/indianBanks";

interface Step3BankAccountsProps {
  formData: any;
  setFormData: (data: any) => void;
}

interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  ifscCode: string;
  accountType: string;
  isCustomBank: boolean;
}

export function Step3BankAccounts({ formData, setFormData }: Step3BankAccountsProps) {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(
    formData.linked_bank_accounts || []
  );
  const [showCustomBankForm, setShowCustomBankForm] = useState(false);

  const addBankAccount = (isCustomBank = false) => {
    const newAccount: BankAccount = {
      id: Date.now().toString(),
      bankName: "",
      accountNumber: "",
      accountHolderName: "",
      ifscCode: "",
      accountType: "SAVINGS",
      isCustomBank
    };
    
    const updatedAccounts = [...bankAccounts, newAccount];
    setBankAccounts(updatedAccounts);
    setFormData({ ...formData, linked_bank_accounts: updatedAccounts });
    
    if (isCustomBank) {
      setShowCustomBankForm(true);
    }
  };

  const removeBankAccount = (id: string) => {
    const updatedAccounts = bankAccounts.filter(account => account.id !== id);
    setBankAccounts(updatedAccounts);
    setFormData({ ...formData, linked_bank_accounts: updatedAccounts });
  };

  const updateBankAccount = (id: string, field: string, value: string) => {
    const updatedAccounts = bankAccounts.map(account =>
      account.id === id ? { ...account, [field]: value } : account
    );
    setBankAccounts(updatedAccounts);
    setFormData({ ...formData, linked_bank_accounts: updatedAccounts });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Linked Bank Accounts</h3>
        <p className="text-gray-600">Add the client's bank account information</p>
      </div>

      {/* Add Bank Account Buttons */}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => addBankAccount(false)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Indian Bank
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => addBankAccount(true)}
          className="flex items-center gap-2"
        >
          <Building2 className="h-4 w-4" />
          Add Other Bank
        </Button>
      </div>

      {/* Bank Accounts List */}
      <div className="space-y-4">
        {bankAccounts.map((account, index) => (
          <div key={account.id} className="p-4 border rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">
                Bank Account #{index + 1}
                {account.isCustomBank && <span className="ml-2 text-xs text-blue-600">(Custom Bank)</span>}
              </h4>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => removeBankAccount(account.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Bank Name *</Label>
                {account.isCustomBank ? (
                  <Input
                    value={account.bankName}
                    onChange={(e) => updateBankAccount(account.id, 'bankName', e.target.value)}
                    placeholder="Enter bank name"
                    required
                  />
                ) : (
                  <Select 
                    value={account.bankName} 
                    onValueChange={(value) => updateBankAccount(account.id, 'bankName', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {indianBanks.map((bank) => (
                        <SelectItem key={bank} value={bank}>
                          {bank}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <Label>Account Type</Label>
                <Select 
                  value={account.accountType} 
                  onValueChange={(value) => updateBankAccount(account.id, 'accountType', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SAVINGS">Savings</SelectItem>
                    <SelectItem value="CURRENT">Current</SelectItem>
                    <SelectItem value="SALARY">Salary</SelectItem>
                    <SelectItem value="OVERDRAFT">Overdraft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Account Number *</Label>
                <Input
                  value={account.accountNumber}
                  onChange={(e) => updateBankAccount(account.id, 'accountNumber', e.target.value)}
                  placeholder="Enter account number"
                  required
                />
              </div>

              <div>
                <Label>Account Holder Name *</Label>
                <Input
                  value={account.accountHolderName}
                  onChange={(e) => updateBankAccount(account.id, 'accountHolderName', e.target.value)}
                  placeholder="Enter account holder name"
                  required
                />
              </div>
            </div>

            <div className="w-1/2">
              <Label>IFSC Code *</Label>
              <Input
                value={account.ifscCode}
                onChange={(e) => updateBankAccount(account.id, 'ifscCode', e.target.value)}
                placeholder="Enter IFSC code"
                required
              />
            </div>
          </div>
        ))}

        {bankAccounts.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Building2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No bank accounts added yet.</p>
            <p className="text-sm">Click "Add Indian Bank" or "Add Other Bank" to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}