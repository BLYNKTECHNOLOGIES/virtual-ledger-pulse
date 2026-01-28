import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
}

interface AddPaymentGatewayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddPaymentGatewayDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddPaymentGatewayDialogProps) {
  const [loading, setLoading] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [formData, setFormData] = useState({
    type: "UPI",
    upi_id: "",
    bank_account_id: "",
    risk_category: "LOW",
    payment_limit: "",
    min_limit: "",
    max_limit: "",
    frequency: "DAILY",
    settlement_cycle: "T+1",
    settlement_days: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchBankAccounts();
    }
  }, [open]);

  const fetchBankAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name, account_number')
        .eq('status', 'ACTIVE')
        .order('account_name');

      if (error) throw error;
      setBankAccounts(data || []);
    } catch (error) {
      console.error('Error fetching bank accounts:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.bank_account_id) {
      toast({
        title: "Error",
        description: "Please select a bank account for settlement",
        variant: "destructive",
      });
      return;
    }

    if (!formData.payment_limit || parseFloat(formData.payment_limit) <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid payment limit",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const settlementDays = formData.settlement_cycle === "Custom" 
        ? parseInt(formData.settlement_days) || 1
        : formData.settlement_cycle === "Instant" 
          ? 0 
          : formData.settlement_cycle === "T+1" 
            ? 1 
            : formData.settlement_cycle === "T+2" 
              ? 2 
              : formData.settlement_cycle === "T+3" 
                ? 3 
                : 1;

      const { error } = await supabase
        .from('sales_payment_methods')
        .insert({
          type: formData.type,
          upi_id: formData.type === "UPI" ? formData.upi_id : null,
          bank_account_id: formData.bank_account_id,
          risk_category: formData.risk_category,
          payment_limit: parseFloat(formData.payment_limit),
          min_limit: parseFloat(formData.min_limit) || 0,
          max_limit: parseFloat(formData.max_limit) || parseFloat(formData.payment_limit),
          frequency: formData.frequency,
          payment_gateway: true,
          settlement_cycle: formData.settlement_cycle,
          settlement_days: settlementDays,
          current_usage: 0,
          is_active: true,
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Payment gateway added successfully",
      });

      // Reset form
      setFormData({
        type: "UPI",
        upi_id: "",
        bank_account_id: "",
        risk_category: "LOW",
        payment_limit: "",
        min_limit: "",
        max_limit: "",
        frequency: "DAILY",
        settlement_cycle: "T+1",
        settlement_days: "",
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error adding payment gateway:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add payment gateway",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background">
        <DialogHeader>
          <DialogTitle>Add Payment Gateway</DialogTitle>
          <DialogDescription>
            Configure a new payment gateway with a linked bank account for settlements.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="type">Gateway Type *</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent className="bg-background border shadow-lg z-50">
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="IMPS">IMPS</SelectItem>
                <SelectItem value="NEFT">NEFT</SelectItem>
                <SelectItem value="RTGS">RTGS</SelectItem>
                <SelectItem value="Card">Card</SelectItem>
                <SelectItem value="NetBanking">Net Banking</SelectItem>
                <SelectItem value="Wallet">Wallet</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.type === "UPI" && (
            <div className="space-y-2">
              <Label htmlFor="upi_id">UPI ID</Label>
              <Input
                id="upi_id"
                value={formData.upi_id}
                onChange={(e) => setFormData(prev => ({ ...prev, upi_id: e.target.value }))}
                placeholder="example@upi"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="bank_account_id">Settlement Bank Account *</Label>
            <Select
              value={formData.bank_account_id}
              onValueChange={(value) => setFormData(prev => ({ ...prev, bank_account_id: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select bank account for settlement" />
              </SelectTrigger>
              <SelectContent className="bg-background border shadow-lg z-50">
                {bankAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.account_name} - {account.bank_name} ({account.account_number.slice(-4)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              All settlements will be credited to this account
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="risk_category">Risk Category *</Label>
            <Select
              value={formData.risk_category}
              onValueChange={(value) => setFormData(prev => ({ ...prev, risk_category: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select risk category" />
              </SelectTrigger>
              <SelectContent className="bg-background border shadow-lg z-50">
                <SelectItem value="LOW">Low Risk</SelectItem>
                <SelectItem value="MEDIUM">Medium Risk</SelectItem>
                <SelectItem value="HIGH">High Risk</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="min_limit">Min Limit (₹)</Label>
              <Input
                id="min_limit"
                type="number"
                value={formData.min_limit}
                onChange={(e) => setFormData(prev => ({ ...prev, min_limit: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_limit">Max Limit (₹)</Label>
              <Input
                id="max_limit"
                type="number"
                value={formData.max_limit}
                onChange={(e) => setFormData(prev => ({ ...prev, max_limit: e.target.value }))}
                placeholder="100000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment_limit">Daily Payment Limit (₹) *</Label>
            <Input
              id="payment_limit"
              type="number"
              value={formData.payment_limit}
              onChange={(e) => setFormData(prev => ({ ...prev, payment_limit: e.target.value }))}
              placeholder="Enter daily limit"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="frequency">Reset Frequency *</Label>
            <Select
              value={formData.frequency}
              onValueChange={(value) => setFormData(prev => ({ ...prev, frequency: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent className="bg-background border shadow-lg z-50">
                <SelectItem value="DAILY">Daily</SelectItem>
                <SelectItem value="WEEKLY">Weekly</SelectItem>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="settlement_cycle">Settlement Cycle *</Label>
            <Select
              value={formData.settlement_cycle}
              onValueChange={(value) => setFormData(prev => ({ ...prev, settlement_cycle: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select settlement cycle" />
              </SelectTrigger>
              <SelectContent className="bg-background border shadow-lg z-50">
                <SelectItem value="Instant">Instant</SelectItem>
                <SelectItem value="T+1">T+1 (Next Day)</SelectItem>
                <SelectItem value="T+2">T+2 (2 Days)</SelectItem>
                <SelectItem value="T+3">T+3 (3 Days)</SelectItem>
                <SelectItem value="Custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.settlement_cycle === "Custom" && (
            <div className="space-y-2">
              <Label htmlFor="settlement_days">Settlement Days</Label>
              <Input
                id="settlement_days"
                type="number"
                min="1"
                value={formData.settlement_days}
                onChange={(e) => setFormData(prev => ({ ...prev, settlement_days: e.target.value }))}
                placeholder="Enter number of days"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Gateway
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
