
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Smartphone, Building } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PaymentMethod {
  id: string;
  type: "UPI" | "Bank Account";
  upiId?: string;
  accountNumber?: string;
  ifscCode?: string;
  accountHolderName?: string;
  riskCategory: "High Risk" | "Medium Risk" | "Low Risk" | "No Risk";
  paymentLimit: number;
  frequency: "24 hours" | "Daily" | "48 hours" | "Custom";
  customFrequency?: string;
  isActive: boolean;
  currentUsage: number;
  lastReset: string;
}

export function PaymentMethodManagement() {
  const { toast } = useToast();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    {
      id: "1",
      type: "UPI",
      upiId: "blynk@paytm",
      riskCategory: "Low Risk",
      paymentLimit: 100000,
      frequency: "24 hours",
      isActive: true,
      currentUsage: 25000,
      lastReset: "2024-01-15T00:00:00"
    },
    {
      id: "2",
      type: "Bank Account",
      accountNumber: "1234567890",
      ifscCode: "HDFC0001234",
      accountHolderName: "Blynk Virtual Technologies",
      riskCategory: "No Risk",
      paymentLimit: 500000,
      frequency: "Daily",
      isActive: true,
      currentUsage: 150000,
      lastReset: "2024-01-15T00:00:00"
    }
  ]);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [formData, setFormData] = useState({
    type: "UPI" as "UPI" | "Bank Account",
    upiId: "",
    accountNumber: "",
    ifscCode: "",
    accountHolderName: "",
    riskCategory: "Medium Risk" as "High Risk" | "Medium Risk" | "Low Risk" | "No Risk",
    paymentLimit: "",
    frequency: "24 hours" as "24 hours" | "Daily" | "48 hours" | "Custom",
    customFrequency: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingMethod) {
      setPaymentMethods(prev => prev.map(method => 
        method.id === editingMethod.id 
          ? {
              ...method,
              ...formData,
              paymentLimit: parseFloat(formData.paymentLimit)
            }
          : method
      ));
      toast({
        title: "Payment Method Updated",
        description: "The payment method has been successfully updated.",
      });
    } else {
      const newMethod: PaymentMethod = {
        id: Date.now().toString(),
        ...formData,
        paymentLimit: parseFloat(formData.paymentLimit),
        isActive: true,
        currentUsage: 0,
        lastReset: new Date().toISOString()
      };
      setPaymentMethods(prev => [...prev, newMethod]);
      toast({
        title: "Payment Method Added",
        description: "New payment method has been successfully added and activated.",
      });
    }

    resetForm();
    setIsAddDialogOpen(false);
  };

  const handleEdit = (method: PaymentMethod) => {
    setEditingMethod(method);
    setFormData({
      type: method.type,
      upiId: method.upiId || "",
      accountNumber: method.accountNumber || "",
      ifscCode: method.ifscCode || "",
      accountHolderName: method.accountHolderName || "",
      riskCategory: method.riskCategory,
      paymentLimit: method.paymentLimit.toString(),
      frequency: method.frequency,
      customFrequency: method.customFrequency || ""
    });
    setIsAddDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setPaymentMethods(prev => prev.filter(method => method.id !== id));
    toast({
      title: "Payment Method Removed",
      description: "The payment method has been successfully removed.",
    });
  };

  const resetForm = () => {
    setFormData({
      type: "UPI",
      upiId: "",
      accountNumber: "",
      ifscCode: "",
      accountHolderName: "",
      riskCategory: "Medium Risk",
      paymentLimit: "",
      frequency: "24 hours",
      customFrequency: ""
    });
    setEditingMethod(null);
  };

  const getRiskBadgeVariant = (risk: string) => {
    switch (risk) {
      case "High Risk": return "destructive";
      case "Medium Risk": return "secondary";
      case "Low Risk": return "default";
      case "No Risk": return "outline";
      default: return "default";
    }
  };

  const getAvailableLimit = (method: PaymentMethod) => {
    return method.paymentLimit - method.currentUsage;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Payment Method Management</h2>
          <p className="text-gray-600">Configure UPI and bank account payment methods for sales</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Payment Method
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingMethod ? "Edit Payment Method" : "Add New Payment Method"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="type">Payment Method Type</Label>
                <Select value={formData.type} onValueChange={(value: "UPI" | "Bank Account") => 
                  setFormData(prev => ({ ...prev, type: value }))
                }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UPI">UPI (Unified Payments Interface)</SelectItem>
                    <SelectItem value="Bank Account">Bank Account</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.type === "UPI" ? (
                <div>
                  <Label htmlFor="upiId">UPI ID</Label>
                  <Input
                    id="upiId"
                    value={formData.upiId}
                    onChange={(e) => setFormData(prev => ({ ...prev, upiId: e.target.value }))}
                    placeholder="example@paytm"
                    required
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
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
                  <div className="col-span-2">
                    <Label htmlFor="accountHolderName">Account Holder Name</Label>
                    <Input
                      id="accountHolderName"
                      value={formData.accountHolderName}
                      onChange={(e) => setFormData(prev => ({ ...prev, accountHolderName: e.target.value }))}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="riskCategory">Risk Category</Label>
                  <Select value={formData.riskCategory} onValueChange={(value: any) => 
                    setFormData(prev => ({ ...prev, riskCategory: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="High Risk">High Risk</SelectItem>
                      <SelectItem value="Medium Risk">Medium Risk</SelectItem>
                      <SelectItem value="Low Risk">Low Risk</SelectItem>
                      <SelectItem value="No Risk">No Risk</SelectItem>
                    </SelectContent>
                  </Select>
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
                  <Select value={formData.frequency} onValueChange={(value: any) => 
                    setFormData(prev => ({ ...prev, frequency: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24 hours">24 Hours</SelectItem>
                      <SelectItem value="Daily">Daily (Resets at 11:59 PM)</SelectItem>
                      <SelectItem value="48 hours">48 Hours</SelectItem>
                      <SelectItem value="Custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.frequency === "Custom" && (
                  <div>
                    <Label htmlFor="customFrequency">Custom Frequency</Label>
                    <Input
                      id="customFrequency"
                      value={formData.customFrequency}
                      onChange={(e) => setFormData(prev => ({ ...prev, customFrequency: e.target.value }))}
                      placeholder="e.g., 72 hours, 1 week"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingMethod ? "Update Method" : "Add & Activate"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Risk Level</TableHead>
                <TableHead>Limit</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentMethods.map((method) => (
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
                  <TableCell>
                    {method.type === "UPI" ? (
                      <div className="font-medium">{method.upiId}</div>
                    ) : (
                      <div>
                        <div className="font-medium">{method.accountNumber}</div>
                        <div className="text-sm text-gray-500">{method.ifscCode}</div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRiskBadgeVariant(method.riskCategory)}>
                      {method.riskCategory}
                    </Badge>
                  </TableCell>
                  <TableCell>₹{method.paymentLimit.toLocaleString()}</TableCell>
                  <TableCell className={getAvailableLimit(method) < method.paymentLimit * 0.2 ? "text-red-600 font-medium" : ""}>
                    ₹{getAvailableLimit(method).toLocaleString()}
                  </TableCell>
                  <TableCell>{method.frequency}</TableCell>
                  <TableCell>
                    <Badge variant={method.isActive ? "default" : "secondary"}>
                      {method.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
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
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
