
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function AccountStatusTab() {
  const [showInvestigationDialog, setShowInvestigationDialog] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [investigationData, setInvestigationData] = useState({
    type: "",
    reason: "",
    priority: "MEDIUM",
    notes: ""
  });
  const { toast } = useToast();

  // Fetch bank accounts
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .order('bank_name');
      if (error) throw error;
      return data;
    },
  });

  const handleStartInvestigation = (account: any) => {
    setSelectedAccount(account);
    setShowInvestigationDialog(true);
  };

  const handleSubmitInvestigation = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Here you would typically save the investigation to a database table
    toast({
      title: "Investigation Started",
      description: `Investigation "${investigationData.type}" started for ${selectedAccount?.account_name}`,
    });
    
    setInvestigationData({ type: "", reason: "", priority: "MEDIUM", notes: "" });
    setShowInvestigationDialog(false);
    setSelectedAccount(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bankAccounts?.map((account) => (
            <div key={account.id} className="border rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-medium">{account.bank_name}</h4>
                  <p className="text-sm text-gray-600">{account.account_name}</p>
                </div>
                <Badge variant={account.status === 'ACTIVE' ? 'default' : 'destructive'}>
                  {account.status}
                </Badge>
              </div>
              <p className="text-sm">Balance: ₹{Number(account.balance).toLocaleString()}</p>
              {account.status !== 'ACTIVE' && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="mt-2"
                  onClick={() => handleStartInvestigation(account)}
                >
                  Start Investigation
                </Button>
              )}
            </div>
          ))}
        </div>

        <Dialog open={showInvestigationDialog} onOpenChange={setShowInvestigationDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Start Investigation - {selectedAccount?.account_name}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmitInvestigation} className="space-y-4">
              <div className="space-y-2">
                <Label>Investigation Type *</Label>
                <Select 
                  value={investigationData.type} 
                  onValueChange={(value) => setInvestigationData(prev => ({ ...prev, type: value }))}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select investigation type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compliance_review">Compliance Review</SelectItem>
                    <SelectItem value="fraud_investigation">Fraud Investigation</SelectItem>
                    <SelectItem value="account_verification">Account Verification</SelectItem>
                    <SelectItem value="transaction_review">Transaction Review</SelectItem>
                    <SelectItem value="kyc_validation">KYC Validation</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <Select 
                  value={investigationData.priority} 
                  onValueChange={(value) => setInvestigationData(prev => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Reason for Investigation *</Label>
                <Textarea
                  value={investigationData.reason}
                  onChange={(e) => setInvestigationData(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Enter the reason for starting this investigation"
                  rows={3}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Additional Notes</Label>
                <Textarea
                  value={investigationData.notes}
                  onChange={(e) => setInvestigationData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Enter any additional notes"
                  rows={2}
                />
              </div>

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setShowInvestigationDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  Start Investigation
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
