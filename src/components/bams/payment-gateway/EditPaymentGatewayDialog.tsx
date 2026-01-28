import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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

interface PaymentGateway {
  id: string;
  type: string;
  upi_id?: string;
  risk_category: string;
  payment_limit: number;
  current_usage: number;
  is_active: boolean;
  settlement_cycle: string | null;
  settlement_days: number | null;
  payment_gateway: boolean;
  bank_account_id: string | null;
}

interface EditPaymentGatewayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gateway: PaymentGateway | null;
  onSuccess: () => void;
}

export function EditPaymentGatewayDialog({
  open,
  onOpenChange,
  gateway,
  onSuccess,
}: EditPaymentGatewayDialogProps) {
  const [loading, setLoading] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [formData, setFormData] = useState({
    bank_account_id: "",
    risk_category: "LOW",
    payment_limit: "",
    settlement_cycle: "T+1",
    settlement_days: "",
    is_active: true,
  });
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchBankAccounts();
    }
  }, [open]);

  useEffect(() => {
    if (gateway) {
      setFormData({
        bank_account_id: gateway.bank_account_id || "",
        risk_category: gateway.risk_category,
        payment_limit: gateway.payment_limit.toString(),
        settlement_cycle: gateway.settlement_cycle || "T+1",
        settlement_days: gateway.settlement_days?.toString() || "",
        is_active: gateway.is_active,
      });
    }
  }, [gateway]);

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
    
    if (!gateway) return;

    if (!formData.bank_account_id) {
      toast({
        title: "Error",
        description: "Please select a bank account for settlement",
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
        .update({
          bank_account_id: formData.bank_account_id,
          risk_category: formData.risk_category,
          payment_limit: parseFloat(formData.payment_limit),
          settlement_cycle: formData.settlement_cycle,
          settlement_days: settlementDays,
          is_active: formData.is_active,
        })
        .eq('id', gateway.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Payment gateway updated successfully",
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating payment gateway:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update payment gateway",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!gateway) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background">
        <DialogHeader>
          <DialogTitle>Edit Payment Gateway</DialogTitle>
          <DialogDescription>
            Update gateway settings and settlement bank account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-muted/50 p-3 rounded-md">
            <p className="text-sm text-muted-foreground">Gateway Type</p>
            <p className="font-medium">{gateway.type}{gateway.upi_id ? ` - ${gateway.upi_id}` : ''}</p>
          </div>

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
            <Label htmlFor="risk_category">Risk Category</Label>
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

          <div className="space-y-2">
            <Label htmlFor="payment_limit">Daily Payment Limit (₹)</Label>
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
            <Label htmlFor="settlement_cycle">Settlement Cycle</Label>
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

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is_active">Active Status</Label>
              <p className="text-xs text-muted-foreground">Enable or disable this gateway</p>
            </div>
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
            />
          </div>

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
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
