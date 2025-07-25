
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
  const queryClient = useQueryClient();

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
        .select('bank_account_id, priority, investigation_type, reason, created_at')
        .eq('status', 'ACTIVE');
      if (error) throw error;
      return data;
    },
  });

  // Fetch completed investigations
  const { data: completedInvestigations } = useQuery({
    queryKey: ['completed_investigations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_investigations')
        .select('*, bank_accounts(bank_name, account_name)')
        .eq('status', 'COMPLETED')
        .order('resolved_at', { ascending: false });
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

  // Function to get priority badge styling
  const getPriorityBadgeStyle = (priority: string) => {
    switch (priority) {
      case 'HIGH':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'MEDIUM':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'LOW':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Function to get priority-specific styling
  const getPriorityCardStyle = (priority: string) => {
    switch (priority) {
      case 'HIGH':
        return 'border-red-300 bg-red-50 shadow-md ring-1 ring-red-200';
      case 'MEDIUM':
        return 'border-orange-300 bg-orange-50 shadow-md ring-1 ring-orange-200';
      case 'LOW':
        return 'border-green-300 bg-green-50 shadow-md ring-1 ring-green-200';
      default:
        return 'border-gray-300 bg-gray-50 shadow-md ring-1 ring-gray-200';
    }
  };

  // Function to get priority text colors
  const getPriorityTextColor = (priority: string) => {
    switch (priority) {
      case 'HIGH':
        return { title: 'text-red-900', subtitle: 'text-red-700', balance: 'text-red-800' };
      case 'MEDIUM':
        return { title: 'text-orange-900', subtitle: 'text-orange-700', balance: 'text-orange-800' };
      case 'LOW':
        return { title: 'text-green-900', subtitle: 'text-green-700', balance: 'text-green-800' };
      default:
        return { title: 'text-gray-900', subtitle: 'text-gray-700', balance: 'text-gray-800' };
    }
  };

  const renderInvestigationCard = (account: any, investigation: any) => {
    const priority = investigation?.priority || 'MEDIUM';
    const priorityBadgeStyle = getPriorityBadgeStyle(priority);

    return (
      <div 
        key={account.id} 
        className="border border-blue-300 bg-blue-50 shadow-md ring-1 ring-blue-200 rounded-lg p-4 transition-all duration-200"
      >
        <div className="flex justify-between items-start mb-2">
          <div>
            <h4 className="font-medium text-blue-900">
              {account.bank_name}
            </h4>
            <p className="text-sm text-blue-700">
              {account.account_name}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={account.status === 'ACTIVE' ? 'default' : 'destructive'}>
              {account.status}
            </Badge>
            <Badge variant="secondary" className={priorityBadgeStyle}>
              {priority} Priority
            </Badge>
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">
              Under Investigation
            </Badge>
          </div>
        </div>
        <p className="text-sm mb-2 text-blue-800">
          Balance: ₹{Number(account.balance).toLocaleString()}
        </p>
      </div>
    );
  };

  const renderAccountCard = (account: any, isUnderInvestigation = false, isInactive = false) => (
    <div 
      key={account.id} 
      className={`border rounded-lg p-4 transition-all duration-200 ${
        isInactive
        ? 'border-red-200 bg-red-50 hover:shadow-sm hover:bg-red-55'
        : 'border-gray-200 bg-white hover:shadow-sm'
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <h4 className={`font-medium ${
            isInactive 
            ? 'text-red-900' 
            : 'text-gray-900'
          }`}>
            {account.bank_name}
          </h4>
          <p className={`text-sm ${
            isInactive 
            ? 'text-red-700' 
            : 'text-gray-600'
          }`}>
            {account.account_name}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={account.status === 'ACTIVE' ? 'default' : 'destructive'}>
            {account.status}
          </Badge>
        </div>
      </div>
      <p className={`text-sm mb-2 ${
        isInactive 
        ? 'text-red-800' 
        : 'text-gray-700'
      }`}>
        Balance: ₹{Number(account.balance).toLocaleString()}
      </p>
      {account.status !== 'ACTIVE' && !isUnderInvestigation && (
        <Button 
          size="sm" 
          variant="outline" 
          className="w-full border-red-300 text-red-700 hover:bg-red-100 hover:border-red-400"
          onClick={() => handleStartInvestigation(account)}
        >
          Start Investigation
        </Button>
      )}
    </div>
  );

  const renderAccountGroup = (title: string, accounts: any[], iconColor: string, isUnderInvestigation = false, isInactive = false) => {
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
          {accounts.map(account => renderAccountCard(account, isUnderInvestigation, isInactive))}
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
        {/* Under Investigation Section */}
        {groupedAccounts.underInvestigation.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <h3 className="text-lg font-semibold text-gray-900">
                🔍 Under Investigation ({groupedAccounts.underInvestigation.length})
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedAccounts.underInvestigation.map(account => {
                const investigation = activeInvestigations?.find(inv => inv.bank_account_id === account.id);
                return renderInvestigationCard(account, investigation);
              })}
            </div>
          </div>
        )}

        {renderAccountGroup(
          "Active Accounts", 
          groupedAccounts.active, 
          "bg-green-500"
        )}
        
        {renderAccountGroup(
          "Inactive Accounts", 
          groupedAccounts.inactive, 
          "bg-red-500",
          false,
          true
        )}

        {/* Past Cases Section */}
        {completedInvestigations && completedInvestigations.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b">
              <div className="w-3 h-3 rounded-full bg-gray-500"></div>
              <h3 className="text-lg font-semibold text-gray-900">
                📋 Past Cases ({completedInvestigations.length})
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {completedInvestigations.map(investigation => (
                <div 
                  key={investigation.id}
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-medium text-gray-900">
                        {investigation.bank_accounts?.bank_name || 'Unknown Bank'}
                      </h4>
                      <p className="text-sm text-gray-600">
                        {investigation.bank_accounts?.account_name || 'Unknown Account'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="secondary" className="bg-gray-100 text-gray-800 border-gray-200">
                        COMPLETED
                      </Badge>
                      <Badge variant="secondary" className={getPriorityBadgeStyle(investigation.priority)}>
                        {investigation.priority} Priority
                      </Badge>
                    </div>
                  </div>
                  <div className="text-xs space-y-1 text-gray-700">
                    <p><span className="font-medium">Type:</span> {investigation.investigation_type?.replace('_', ' ')}</p>
                    <p><span className="font-medium">Reason:</span> {investigation.reason}</p>
                    <p><span className="font-medium">Resolved:</span> {investigation.resolved_at ? new Date(investigation.resolved_at).toLocaleDateString() : 'N/A'}</p>
                    {investigation.resolution_notes && (
                      <p><span className="font-medium">Resolution:</span> {investigation.resolution_notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      
      <Dialog open={showInvestigationDialog} onOpenChange={setShowInvestigationDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Start Investigation - {selectedAccount?.account_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">{/* Removed form wrapper */}
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
                type="button" 
                onClick={async (e) => {
                  e.preventDefault();
                  console.log('=== START INVESTIGATION BUTTON CLICKED ===');
                  console.log('Current investigation data:', investigationData);
                  console.log('Selected account:', selectedAccount);
                  
                  // Validate required fields
                  if (!investigationData.type || !investigationData.reason.trim()) {
                    console.log('Validation failed - missing fields');
                    toast({
                      title: "Validation Error", 
                      description: "Please fill in all required fields (Investigation Type and Reason).",
                      variant: "destructive",
                    });
                    return; // Don't close dialog on validation failure
                  }
                  
                  console.log('Validation passed, proceeding with investigation creation...');
                  
                  try {
                    console.log('Inserting investigation data...');
                    const { error } = await supabase
                      .from('account_investigations')
                      .insert({
                        bank_account_id: selectedAccount.id,
                        investigation_type: investigationData.type,
                        reason: investigationData.reason,
                        priority: investigationData.priority,
                        notes: investigationData.notes,
                        assigned_to: 'Current User',
                        status: 'ACTIVE'
                      });

                    if (error) {
                      console.error('Database error:', error);
                      toast({
                        title: "Error",
                        description: error.message || "Failed to start investigation. Please try again.",
                        variant: "destructive",
                      });
                      return; // Don't close dialog on error
                    }

                    console.log('Investigation created successfully');
                    
                    toast({
                      title: "Investigation Started",
                      description: `Investigation "${investigationData.type}" started for ${selectedAccount?.account_name}`,
                    });
                    
                     // Optimistic update - immediately add to activeInvestigations cache
                     const newInvestigation = {
                       bank_account_id: selectedAccount.id,
                       priority: investigationData.priority,
                       investigation_type: investigationData.type,
                       reason: investigationData.reason,
                       created_at: new Date().toISOString()
                     };
                     
                     queryClient.setQueryData(['active_investigations'], (oldData: any) => {
                       return oldData ? [...oldData, newInvestigation] : [newInvestigation];
                     });
                     
                   } catch (error: any) {
                     console.error('Unexpected error:', error);
                     toast({
                       title: "Error",
                       description: error.message || "Failed to start investigation. Please try again.",
                       variant: "destructive",
                     });
                     return; // Don't close dialog on error
                   }
                   
                   // Only close dialog if we reach here (success case)
                   console.log('Closing dialog and resetting state...');
                   setShowInvestigationDialog(false);
                   setInvestigationData({ type: "", reason: "", priority: "MEDIUM", notes: "" });
                   setSelectedAccount(null);
                   console.log('Dialog should be closed now');
                   
                   // Refresh data
                   queryClient.invalidateQueries({ queryKey: ['active_investigations'] });
                   queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
                }}
              >
                Start Investigation
              </Button>
            </div>
          </div>{/* Closed div instead of form */}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
