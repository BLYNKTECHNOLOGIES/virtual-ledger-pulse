import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Plus, Edit, Smartphone, Building, TrendingDown, AlertTriangle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface PurchaseMethod {
  id: string;
  type: "UPI" | "Bank Transfer";
  name: string;
  paymentLimit: number;
  frequency: "24 hours" | "Daily";
  currentUsage: number;
  lastReset: string;
  isActive: boolean;
  bankAccountId?: string;
  bankAccountName?: string;
}

interface BankAccount {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  IFSC: string;
}

export function PurchaseManagement() {
  const { toast } = useToast();
  const [purchaseMethods, setPurchaseMethods] = useState<PurchaseMethod[]>([
    {
      id: "1",
      type: "UPI",
      name: "Primary UPI Account",
      paymentLimit: 200000,
      frequency: "24 hours",
      currentUsage: 75000,
      lastReset: "2024-01-15T00:00:00",
      isActive: true
    },
    {
      id: "2",
      type: "Bank Transfer",
      name: "HDFC Current Account",
      paymentLimit: 1000000,
      frequency: "Daily",
      currentUsage: 350000,
      lastReset: "2024-01-15T00:00:00",
      isActive: true
    },
    {
      id: "3",
      type: "UPI",
      name: "Secondary UPI Account",
      paymentLimit: 150000,
      frequency: "24 hours",
      currentUsage: 150000,
      lastReset: "2024-01-15T00:00:00",
      isActive: false
    }
  ]);

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PurchaseMethod | null>(null);
  const [formData, setFormData] = useState({
    type: "UPI" as "UPI" | "Bank Transfer",
    name: "",
    paymentLimit: "",
    frequency: "24 hours" as "24 hours" | "Daily",
    bankAccountId: ""
  });

  // Fetch bank accounts from Supabase
  useEffect(() => {
    const fetchBankAccounts = async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, bank_name, account_name, account_number, IFSC')
        .eq('status', 'ACTIVE');

      if (error) {
        console.error('Error fetching bank accounts:', error);
        toast({
          title: "Error",
          description: "Failed to fetch bank accounts.",
          variant: "destructive",
        });
      } else {
        setBankAccounts(data || []);
      }
    };

    fetchBankAccounts();
  }, [toast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const selectedBankAccount = bankAccounts.find(acc => acc.id === formData.bankAccountId);
    
    if (editingMethod) {
      setPurchaseMethods(prev => prev.map(method => 
        method.id === editingMethod.id 
          ? {
              ...method,
              ...formData,
              paymentLimit: parseFloat(formData.paymentLimit),
              bankAccountId: formData.bankAccountId,
              bankAccountName: selectedBankAccount?.account_name
            }
          : method
      ));
      toast({
        title: "Purchase Method Updated",
        description: "The purchase method has been successfully updated.",
      });
    } else {
      const newMethod: PurchaseMethod = {
        id: Date.now().toString(),
        ...formData,
        paymentLimit: parseFloat(formData.paymentLimit),
        currentUsage: 0,
        lastReset: new Date().toISOString(),
        isActive: true,
        bankAccountId: formData.bankAccountId,
        bankAccountName: selectedBankAccount?.account_name
      };
      setPurchaseMethods(prev => [...prev, newMethod]);
      toast({
        title: "Purchase Method Added",
        description: "New purchase method has been successfully added.",
      });
    }

    resetForm();
    setIsAddDialogOpen(false);
  };

  const handleEdit = (method: PurchaseMethod) => {
    setEditingMethod(method);
    setFormData({
      type: method.type,
      name: method.name,
      paymentLimit: method.paymentLimit.toString(),
      frequency: method.frequency,
      bankAccountId: method.bankAccountId || ""
    });
    setIsAddDialogOpen(true);
  };

  const handleDelete = (methodId: string) => {
    setPurchaseMethods(prev => prev.filter(method => method.id !== methodId));
    toast({
      title: "Purchase Method Deleted",
      description: "The purchase method has been successfully deleted.",
    });
  };

  const resetForm = () => {
    setFormData({
      type: "UPI",
      name: "",
      paymentLimit: "",
      frequency: "24 hours",
      bankAccountId: ""
    });
    setEditingMethod(null);
  };

  const getAvailableLimit = (method: PurchaseMethod) => {
    return method.paymentLimit - method.currentUsage;
  };

  const getUsagePercentage = (method: PurchaseMethod) => {
    return (method.currentUsage / method.paymentLimit) * 100;
  };

  const getTotalAvailableUPI = () => {
    return purchaseMethods
      .filter(m => m.type === "UPI" && m.isActive)
      .reduce((sum, m) => sum + getAvailableLimit(m), 0);
  };

  const getTotalAvailableBankTransfer = () => {
    return purchaseMethods
      .filter(m => m.type === "Bank Transfer" && m.isActive)
      .reduce((sum, m) => sum + getAvailableLimit(m), 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Purchase Management</h2>
          <p className="text-gray-600">Manage payment methods for company purchases</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Purchase Method
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingMethod ? "Edit Purchase Method" : "Add New Purchase Method"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="type">Payment Method Type</Label>
                <Select value={formData.type} onValueChange={(value: "UPI" | "Bank Transfer") => 
                  setFormData(prev => ({ ...prev, type: value }))
                }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UPI">UPI Payment</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer (IMPS/NEFT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="bankAccount">Link Bank Account</Label>
                <Select value={formData.bankAccountId} onValueChange={(value) => 
                  setFormData(prev => ({ ...prev, bankAccountId: value }))
                }>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a bank account" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.bank_name} - {account.account_name} ({account.account_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="name">Method Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Primary UPI Account, HDFC Current Account"
                  required
                />
              </div>

              <div>
                <Label htmlFor="paymentLimit">Payment Limit (₹)</Label>
                <Input
                  id="paymentLimit"
                  type="number"
                  value={formData.paymentLimit}
                  onChange={(e) => setFormData(prev => ({ ...prev, paymentLimit: e.target.value }))}
                  required
                />
              </div>

              <div>
                <Label htmlFor="frequency">Frequency</Label>
                <Select value={formData.frequency} onValueChange={(value: "24 hours" | "Daily") => 
                  setFormData(prev => ({ ...prev, frequency: value }))
                }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24 hours">24 Hours</SelectItem>
                    <SelectItem value="Daily">Daily (Resets at 11:59 PM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingMethod ? "Update Method" : "Add Method"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Available Limits Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-blue-600" />
              Available UPI Limit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              ₹{getTotalAvailableUPI().toLocaleString()}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {purchaseMethods.filter(m => m.type === "UPI" && m.isActive).length} active UPI methods
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building className="h-4 w-4 text-green-600" />
              Available Bank Transfer Limit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ₹{getTotalAvailableBankTransfer().toLocaleString()}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {purchaseMethods.filter(m => m.type === "Bank Transfer" && m.isActive).length} active bank accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-purple-600" />
              Total Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              ₹{(getTotalAvailableUPI() + getTotalAvailableBankTransfer()).toLocaleString()}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Combined purchasing power
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Purchase Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Linked Account</TableHead>
                <TableHead>Limit</TableHead>
                <TableHead>Used</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchaseMethods.map((method) => {
                const usagePercentage = getUsagePercentage(method);
                const availableLimit = getAvailableLimit(method);
                
                return (
                  <TableRow key={method.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {method.type === "UPI" ? (
                          <Smartphone className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Building className="h-4 w-4 text-green-600" />
                        )}
                        {method.type}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{method.name}</TableCell>
                    <TableCell>
                      {method.bankAccountName ? (
                        <span className="text-sm text-gray-600">{method.bankAccountName}</span>
                      ) : (
                        <span className="text-sm text-gray-400">Not linked</span>
                      )}
                    </TableCell>
                    <TableCell>₹{method.paymentLimit.toLocaleString()}</TableCell>
                    <TableCell>₹{method.currentUsage.toLocaleString()}</TableCell>
                    <TableCell className={availableLimit === 0 ? "text-red-600 font-medium" : ""}>
                      ₹{availableLimit.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={usagePercentage} className="w-16" />
                        <span className="text-xs">{usagePercentage.toFixed(0)}%</span>
                        {usagePercentage >= 100 && (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{method.frequency}</TableCell>
                    <TableCell>
                      <Badge variant={method.isActive ? "default" : "secondary"}>
                        {method.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(method)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(method.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
