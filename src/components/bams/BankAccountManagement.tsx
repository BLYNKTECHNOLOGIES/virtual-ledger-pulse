
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  accountHolderName: string;
  accountBalance: number;
  status: "active" | "inactive";
  inactivityReason?: string;
  inactivityDate?: string;
  inactivityNote?: string;
}

export function BankAccountManagement() {
  const { toast } = useToast();
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([
    {
      id: "1",
      bankName: "HDFC Bank",
      accountNumber: "1234567890",
      ifscCode: "HDFC0001234",
      accountHolderName: "Blynk Virtual Technologies",
      accountBalance: 250000,
      status: "active"
    },
    {
      id: "2",
      bankName: "ICICI Bank",
      accountNumber: "9876543210",
      ifscCode: "ICIC0009876",
      accountHolderName: "Blynk Virtual Technologies",
      accountBalance: 150000,
      status: "inactive",
      inactivityReason: "Account frozen",
      inactivityDate: "2024-01-15",
      inactivityNote: "Under bank investigation"
    }
  ]);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [formData, setFormData] = useState({
    bankName: "",
    accountNumber: "",
    ifscCode: "",
    accountHolderName: "",
    accountBalance: "",
    status: "active" as "active" | "inactive",
    inactivityReason: "",
    inactivityNote: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingAccount) {
      setBankAccounts(prev => prev.map(account => 
        account.id === editingAccount.id 
          ? {
              ...account,
              ...formData,
              accountBalance: parseFloat(formData.accountBalance),
              inactivityDate: formData.status === "inactive" ? new Date().toISOString().split('T')[0] : undefined
            }
          : account
      ));
      toast({
        title: "Bank Account Updated",
        description: "The bank account has been successfully updated.",
      });
    } else {
      const newAccount: BankAccount = {
        id: Date.now().toString(),
        ...formData,
        accountBalance: parseFloat(formData.accountBalance),
        inactivityDate: formData.status === "inactive" ? new Date().toISOString().split('T')[0] : undefined
      };
      setBankAccounts(prev => [...prev, newAccount]);
      toast({
        title: "Bank Account Added",
        description: "New bank account has been successfully added.",
      });
    }

    setFormData({
      bankName: "",
      accountNumber: "",
      ifscCode: "",
      accountHolderName: "",
      accountBalance: "",
      status: "active",
      inactivityReason: "",
      inactivityNote: ""
    });
    setIsAddDialogOpen(false);
    setEditingAccount(null);
  };

  const handleEdit = (account: BankAccount) => {
    setEditingAccount(account);
    setFormData({
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      ifscCode: account.ifscCode,
      accountHolderName: account.accountHolderName,
      accountBalance: account.accountBalance.toString(),
      status: account.status,
      inactivityReason: account.inactivityReason || "",
      inactivityNote: account.inactivityNote || ""
    });
    setIsAddDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      bankName: "",
      accountNumber: "",
      ifscCode: "",
      accountHolderName: "",
      accountBalance: "",
      status: "active",
      inactivityReason: "",
      inactivityNote: ""
    });
    setEditingAccount(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Bank Account Management</h2>
          <p className="text-gray-600">Manage bank accounts for receiving sales payments</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Bank Account
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingAccount ? "Edit Bank Account" : "Add New Bank Account"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bankName">Bank Name</Label>
                  <Input
                    id="bankName"
                    value={formData.bankName}
                    onChange={(e) => setFormData(prev => ({ ...prev, bankName: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="accountNumber">Account Number</Label>
                  <Input
                    id="accountNumber"
                    value={formData.accountNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, accountNumber: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="ifscCode">IFSC Code</Label>
                  <Input
                    id="ifscCode"
                    value={formData.ifscCode}
                    onChange={(e) => setFormData(prev => ({ ...prev, ifscCode: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="accountHolderName">Account Holder Name</Label>
                  <Input
                    id="accountHolderName"
                    value={formData.accountHolderName}
                    onChange={(e) => setFormData(prev => ({ ...prev, accountHolderName: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="accountBalance">Account Balance (₹)</Label>
                  <Input
                    id="accountBalance"
                    type="number"
                    value={formData.accountBalance}
                    onChange={(e) => setFormData(prev => ({ ...prev, accountBalance: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="status">Account Status</Label>
                  <Select value={formData.status} onValueChange={(value: "active" | "inactive") => 
                    setFormData(prev => ({ ...prev, status: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formData.status === "inactive" && (
                <div className="space-y-4 p-4 bg-red-50 rounded-lg border border-red-200">
                  <div>
                    <Label htmlFor="inactivityReason">Reason for Inactivity</Label>
                    <Select value={formData.inactivityReason} onValueChange={(value) => 
                      setFormData(prev => ({ ...prev, inactivityReason: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Account frozen">Account frozen</SelectItem>
                        <SelectItem value="Account closed">Account closed</SelectItem>
                        <SelectItem value="Bank issues">Bank issues or disputes</SelectItem>
                        <SelectItem value="Temporarily inactive">Temporarily inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="inactivityNote">Additional Notes</Label>
                    <Textarea
                      id="inactivityNote"
                      value={formData.inactivityNote}
                      onChange={(e) => setFormData(prev => ({ ...prev, inactivityNote: e.target.value }))}
                      placeholder="Optional notes about the inactivity..."
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingAccount ? "Update Account" : "Add Account"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bank Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bank Name</TableHead>
                <TableHead>Account Number</TableHead>
                <TableHead>IFSC Code</TableHead>
                <TableHead>Account Holder</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bankAccounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.bankName}</TableCell>
                  <TableCell>{account.accountNumber}</TableCell>
                  <TableCell>{account.ifscCode}</TableCell>
                  <TableCell>{account.accountHolderName}</TableCell>
                  <TableCell>₹{account.accountBalance.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={account.status === "active" ? "default" : "destructive"}>
                      {account.status === "active" ? (
                        <><Eye className="h-3 w-3 mr-1" /> Active</>
                      ) : (
                        <><EyeOff className="h-3 w-3 mr-1" /> Inactive</>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(account)}
                      className="flex items-center gap-1"
                    >
                      <Edit className="h-3 w-3" />
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
