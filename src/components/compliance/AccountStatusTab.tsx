
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

  // Fetch active investigations
  const { data: activeInvestigations } = useQuery({
    queryKey: ['active_investigations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_investigations')
        .select('bank_account_id')
        .eq('status', 'ACTIVE');
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
    
    console.log('=== INVESTIGATION SUBMISSION DEBUG ===');
    console.log('Form data:', investigationData);
    console.log('Selected account:', selectedAccount);
    
    // Validate required fields
    if (!investigationData.type || !investigationData.reason.trim()) {
      console.log('Validation failed - missing required fields');
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields (Investigation Type and Reason).",
        variant: "destructive",
      });
      return;
    }
    
    console.log('Validation passed, attempting database insert...');
    
    try {
      const insertData = {
        bank_account_id: selectedAccount.id,
        investigation_type: investigationData.type,
        reason: investigationData.reason,
        priority: investigationData.priority,
        notes: investigationData.notes,
        assigned_to: 'Current User', // In real app, get from auth
        status: 'ACTIVE'
      };
      
      console.log('Insert data:', insertData);
      
      const { data, error } = await supabase
        .from('account_investigations')
        .insert(insertData)
        .select();

      console.log('Database response:', { data, error });

      if (error) {
        console.error('Database error details:', error);
        throw error;
      }

      // Invalidate related queries to refresh data immediately
      const queryClient = useQueryClient();
      queryClient.invalidateQueries({ queryKey: ['active_investigations'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });

      console.log('Investigation created successfully, closing dialog...');

      toast({
        title: "Investigation Started",
        description: `Investigation "${investigationData.type}" started for ${selectedAccount?.account_name}`,
      });
      
      // Reset form and close dialog
      setInvestigationData({ type: "", reason: "", priority: "MEDIUM", notes: "" });
      setShowInvestigationDialog(false);
      setSelectedAccount(null);
      
      console.log('Dialog should be closed now');
    } catch (error: any) {
      console.error('=== INVESTIGATION ERROR ===');
      console.error('Error object:', error);
      console.error('Error message:', error.message);
      console.error('Error details:', error.details);
      console.error('Error hint:', error.hint);
      console.error('Error code:', error.code);
      
      toast({
        title: "Error",
        description: error.message || "Failed to start investigation. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Group accounts by status
  const groupedAccounts = {
    underInvestigation: bankAccounts?.filter(account => 
      activeInvestigations?.some(inv => inv.bank_account_id === account.id)
    ) || [],
    active: bankAccounts?.filter(account => 
      account.status === 'ACTIVE' && 
      !activeInvestigations?.some(inv => inv.bank_account_id === account.id)
    ) || [],
    inactive: bankAccounts?.filter(account => 
      account.status !== 'ACTIVE' && 
      !activeInvestigations?.some(inv => inv.bank_account_id === account.id)
    ) || []
  };

  const renderAccountCard = (account: any, isUnderInvestigation = false) => (
    <div 
      key={account.id} 
      className={`border rounded-lg p-4 transition-all duration-200 ${
        isUnderInvestigation 
          ? 'border-orange-300 bg-orange-50 shadow-md ring-1 ring-orange-200' 
          : 'border-gray-200 bg-white hover:shadow-sm'
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <h4 className={`font-medium ${isUnderInvestigation ? 'text-orange-900' : 'text-gray-900'}`}>
            {account.bank_name}
          </h4>
          <p className={`text-sm ${isUnderInvestigation ? 'text-orange-700' : 'text-gray-600'}`}>
            {account.account_name}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={account.status === 'ACTIVE' ? 'default' : 'destructive'}>
            {account.status}
          </Badge>
          {isUnderInvestigation && (
            <Badge variant="secondary" className="bg-orange-100 text-orange-800 border-orange-200">
              Under Investigation
            </Badge>
          )}
        </div>
      </div>
      <p className={`text-sm mb-2 ${isUnderInvestigation ? 'text-orange-800' : 'text-gray-700'}`}>
        Balance: ₹{Number(account.balance).toLocaleString()}
      </p>
      {account.status !== 'ACTIVE' && !isUnderInvestigation && (
        <Button 
          size="sm" 
          variant="outline" 
          className="w-full"
          onClick={() => handleStartInvestigation(account)}
        >
          Start Investigation
        </Button>
      )}
    </div>
  );

  const renderAccountGroup = (title: string, accounts: any[], iconColor: string, isUnderInvestigation = false) => {
    if (accounts.length === 0) return null;
    
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b">
          <div className={`w-3 h-3 rounded-full ${iconColor}`}></div>
          <h3 className="text-lg font-semibold text-gray-900">
            {title} ({accounts.length})
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(account => renderAccountCard(account, isUnderInvestigation))}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {renderAccountGroup(
          "Under Investigation", 
          groupedAccounts.underInvestigation, 
          "bg-orange-500",
          true
        )}
        {renderAccountGroup(
          "Active Accounts", 
          groupedAccounts.active, 
          "bg-green-500"
        )}
        {renderAccountGroup(
          "Inactive Accounts", 
          groupedAccounts.inactive, 
          "bg-red-500"
        )}
      </CardContent>
      
      <Dialog open={showInvestigationDialog} onOpenChange={setShowInvestigationDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Start Investigation - {selectedAccount?.account_name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitInvestigation} className="space-y-4" id="investigation-form">
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
                  <SelectItem value="cyber_lien">Cyber Lien</SelectItem>
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
              <Button 
                type="submit" 
                onClick={(e) => {
                  console.log('Button clicked!');
                  // Allow form submission to proceed
                }}
              >
                Start Investigation
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
